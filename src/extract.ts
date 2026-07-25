// Anthropic request construction for the three extraction passes: index,
// details, and the combined URL pass. This is the intelligence-adjacent
// glue: the actual intelligence lives in shared/prompts/ and shared/schema/,
// imported here verbatim, never duplicated. Not yet wired into worker.ts's
// router; that lands with the session and rate-limit modules.

// Wrangler's esbuild bundler resolves .json imports via esbuild's built-in
// JSON loader (no wrangler.jsonc rule needed) and .md imports as raw text
// via the wrangler.jsonc "rules" entry added alongside this file; both work
// at build time with zero further config. tsc, run standalone, has no
// loader for .md and reports TS2307. The standard fix is an ambient
// wildcard module declaration (`declare module "*.md"`), but this
// TypeScript version (7.0.2) only accepts that from a file with no
// top-level import/export of its own, i.e. a separate .d.ts, which is out
// of scope here (only this file is authorized this session). Suppressing
// per import is the in-file alternative: wrangler's own build (esbuild)
// never runs tsc's type checker, so this has no effect on the bundle, only
// on standalone `tsc --noEmit` runs.
import systemPrompt from "../shared/prompts/system.md";
import indexTaskPrompt from "../shared/prompts/index-task.md";
import detailsTaskPrompt from "../shared/prompts/details-task.md";
import urlTaskPrompt from "../shared/prompts/url-task.md";
import indexSchema from "../shared/schema/index.schema.json";
import detailsSchema from "../shared/schema/details.schema.json";
import urlSchema from "../shared/schema/url.schema.json";

// --------------------------------------------------------------------------
// Constants: model and max_tokens are pinned server-side per SPEC.md's
// blast-radius control. Never accept either from a caller.
// --------------------------------------------------------------------------

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const INDEX_MAX_TOKENS = 2048;
const DETAILS_MAX_TOKENS = 2048;
const URL_MAX_TOKENS = 8192;
const DETAILS_MAX_ITEMS = 10;

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// Basic web fetch, not a dynamic-filtering _202602xx variant: those are
// verified (live docs, this session) to support Fable 5, Opus 4.8, Mythos
// 5/Preview, Opus 4.7, Opus 4.6, Sonnet 5, and Sonnet 4.6 only. Haiku 4.5,
// the default model here, is not on that list, so the basic tool is the
// correct choice for the pinned default model. GA, no beta header required.
const WEB_FETCH_TOOL_TYPE = "web_fetch_20250910";
const WEB_FETCH_MAX_USES = 3;
const WEB_FETCH_MAX_CONTENT_TOKENS = 100_000;

// --------------------------------------------------------------------------
// Public types
// --------------------------------------------------------------------------

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

export interface ExtractionResult {
  data: unknown;
  usage: Usage;
}

export interface ImageInput {
  media_type: string;
  data: string; // base64
}

export interface DetailsItem {
  n: number;
  name: string;
}

// json_schema is the primary path (verified: Haiku 4.5 supports
// output_config.format). strict_tool is the fallback SPEC.md requires, kept
// reachable through this real constructor parameter rather than described
// and never exercised.
export type OutputMode = "json_schema" | "strict_tool";

export interface ExtractionProvider {
  runIndex(image: ImageInput, model: string): Promise<ExtractionResult>;
  runDetails(
    image: ImageInput,
    items: DetailsItem[],
    model: string,
  ): Promise<ExtractionResult>;
  runUrl(url: string, model: string): Promise<ExtractionResult>;
}

export interface ExtractEnv {
  ANTHROPIC_API_KEY?: string;
  MODEL?: string;
}

export function resolveModel(env: ExtractEnv): string {
  return env.MODEL || DEFAULT_MODEL;
}

export function createExtractionProvider(
  env: ExtractEnv,
  outputMode: OutputMode = "json_schema",
): AnthropicExtractionProvider {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  return new AnthropicExtractionProvider(env.ANTHROPIC_API_KEY, outputMode);
}

// --------------------------------------------------------------------------
// Anthropic wire types (only the fields this file reads or writes)
// --------------------------------------------------------------------------

interface AnthropicImageBlock {
  type: "image";
  source: { type: "base64"; media_type: string; data: string };
  cache_control?: { type: "ephemeral" };
}

interface AnthropicTextBlock {
  type: "text";
  text: string;
}

type AnthropicContentBlockParam = AnthropicImageBlock | AnthropicTextBlock;

interface AnthropicMessageParam {
  role: "user" | "assistant";
  content: string | AnthropicContentBlockParam[] | unknown[];
}

interface AnthropicToolDef {
  type?: string;
  name: string;
  description?: string;
  input_schema?: Record<string, unknown>;
  strict?: boolean;
  max_uses?: number;
  max_content_tokens?: number;
}

interface AnthropicRequestBody {
  model: string;
  max_tokens: number;
  system: string;
  messages: AnthropicMessageParam[];
  output_config?: { format: { type: "json_schema"; schema: Record<string, unknown> } };
  tools?: AnthropicToolDef[];
  tool_choice?: { type: "tool" | "auto" | "any"; name?: string };
}

interface AnthropicUsageWire {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface AnthropicContentBlockWire {
  type: string;
  text?: string;
  input?: unknown;
  name?: string;
  id?: string;
}

interface AnthropicMessageResponse {
  content: AnthropicContentBlockWire[];
  usage: AnthropicUsageWire;
  stop_reason: string;
}

function normalizeUsage(u: AnthropicUsageWire): Usage {
  return {
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
  };
}

function sumUsage(a: Usage, b: Usage): Usage {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cache_creation_input_tokens:
      a.cache_creation_input_tokens + b.cache_creation_input_tokens,
    cache_read_input_tokens: a.cache_read_input_tokens + b.cache_read_input_tokens,
  };
}

// Strict tool schemas require additionalProperties: false at every object
// level the API validates; the shared schemas already set this at the top
// level and on nested item objects, so a shallow spread is sufficient here.
function toStrictInputSchema(schema: Record<string, unknown>): Record<string, unknown> {
  return { ...schema, additionalProperties: false };
}

function imageBlock(image: ImageInput): AnthropicImageBlock {
  return {
    type: "image",
    source: { type: "base64", media_type: image.media_type, data: image.data },
    cache_control: { type: "ephemeral" },
  };
}

// --------------------------------------------------------------------------
// Anthropic implementation
// --------------------------------------------------------------------------

export class AnthropicExtractionProvider implements ExtractionProvider {
  constructor(
    private readonly apiKey: string,
    private readonly outputMode: OutputMode = "json_schema",
  ) {}

  async runIndex(image: ImageInput, model: string): Promise<ExtractionResult> {
    const body = this.buildImagePassBody(
      image,
      indexTaskPrompt,
      indexSchema as Record<string, unknown>,
      "index_extraction",
      INDEX_MAX_TOKENS,
      model,
    );
    return this.send(body, "index_extraction", "index");
  }

  async runDetails(
    image: ImageInput,
    items: DetailsItem[],
    model: string,
  ): Promise<ExtractionResult> {
    if (items.length > DETAILS_MAX_ITEMS) {
      throw new Error(
        `details pass accepts at most ${DETAILS_MAX_ITEMS} items, got ${items.length}`,
      );
    }
    const batchText = JSON.stringify(items.map((i) => ({ n: i.n, name: i.name })));
    const taskText = `${detailsTaskPrompt}\n\nItems for this batch:\n${batchText}`;
    const body = this.buildImagePassBody(
      image,
      taskText,
      detailsSchema as Record<string, unknown>,
      "details_extraction",
      DETAILS_MAX_TOKENS,
      model,
    );
    return this.send(body, "details_extraction", "details");
  }

  async runUrl(url: string, model: string): Promise<ExtractionResult> {
    const userText = `${url}\n\n${urlTaskPrompt}`;
    const webFetchTool: AnthropicToolDef = {
      type: WEB_FETCH_TOOL_TYPE,
      name: "web_fetch",
      max_uses: WEB_FETCH_MAX_USES,
      max_content_tokens: WEB_FETCH_MAX_CONTENT_TOKENS,
      // citations stay off: output_config.format (structured outputs) is
      // documented incompatible with citations and returns a 400.
    };

    if (this.outputMode === "json_schema") {
      const body: AnthropicRequestBody = {
        model,
        max_tokens: URL_MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: "user", content: userText }],
        tools: [webFetchTool],
        output_config: {
          format: { type: "json_schema", schema: urlSchema as Record<string, unknown> },
        },
      };
      return this.send(body, "url_extraction", "url");
    }

    // strict_tool mode: forcing a single tool via tool_choice precludes
    // Claude from also calling web_fetch in the same turn, so this runs as
    // two calls. Call A lets the server tool resolve; call B forces the
    // extraction tool over the now-fetched content. Not specified in
    // SPEC.md (which only names the primary path for the URL pass); this
    // two-call shape is this session's inferred design for making the
    // fallback actually work rather than merely described.
    const startedAt = Date.now();
    const fetchBody: AnthropicRequestBody = {
      model,
      max_tokens: URL_MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userText }],
      tools: [webFetchTool],
    };
    const fetchResponse = await this.request(fetchBody);
    logCall("url_extraction_fetch", model, normalizeUsage(fetchResponse.usage), startedAt, "success");

    const extractStartedAt = Date.now();
    const extractionTool: AnthropicToolDef = {
      name: "url_extraction",
      description: "Return the structured menu extraction for the fetched page.",
      input_schema: toStrictInputSchema(urlSchema as Record<string, unknown>),
      strict: true,
    };
    const extractBody: AnthropicRequestBody = {
      model,
      max_tokens: URL_MAX_TOKENS,
      system: systemPrompt,
      messages: [
        { role: "user", content: userText },
        { role: "assistant", content: fetchResponse.content as unknown[] },
        {
          role: "user",
          content: "Now return the structured extraction for the fetched page.",
        },
      ],
      tools: [extractionTool],
      tool_choice: { type: "tool", name: "url_extraction" },
    };
    const extractResponse = await this.request(extractBody);
    logCall(
      "url_extraction",
      model,
      normalizeUsage(extractResponse.usage),
      extractStartedAt,
      "success",
    );

    const data = extractFromToolUse(extractResponse, "url_extraction");
    const usage = sumUsage(normalizeUsage(fetchResponse.usage), normalizeUsage(extractResponse.usage));
    return { data, usage };
  }

  private buildImagePassBody(
    image: ImageInput,
    taskText: string,
    schema: Record<string, unknown>,
    schemaName: string,
    maxTokens: number,
    model: string,
  ): AnthropicRequestBody {
    const messages: AnthropicMessageParam[] = [
      {
        role: "user",
        content: [imageBlock(image), { type: "text", text: taskText }],
      },
    ];

    if (this.outputMode === "json_schema") {
      return {
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages,
        output_config: { format: { type: "json_schema", schema } },
      };
    }

    return {
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
      tools: [
        {
          name: schemaName,
          description: `Return the structured extraction for the ${schemaName.replace("_extraction", "")} pass.`,
          input_schema: toStrictInputSchema(schema),
          strict: true,
        },
      ],
      tool_choice: { type: "tool", name: schemaName },
    };
  }

  private async send(
    body: AnthropicRequestBody,
    schemaName: string,
    endpoint: string,
  ): Promise<ExtractionResult> {
    const startedAt = Date.now();
    let response: AnthropicMessageResponse;
    try {
      response = await this.request(body);
    } catch (err) {
      logCall(endpoint, body.model, null, startedAt, "error");
      throw err;
    }
    const usage = normalizeUsage(response.usage);
    logCall(endpoint, body.model, usage, startedAt, "success");

    const data =
      this.outputMode === "json_schema"
        ? extractFromText(response)
        : extractFromToolUse(response, schemaName);
    return { data, usage };
  }

  private async request(body: AnthropicRequestBody): Promise<AnthropicMessageResponse> {
    const res = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${text}`);
    }
    return (await res.json()) as AnthropicMessageResponse;
  }
}

function extractFromText(response: AnthropicMessageResponse): unknown {
  const block = response.content.find((b) => b.type === "text");
  if (!block || typeof block.text !== "string") {
    throw new Error("no text block in Anthropic response (json_schema mode)");
  }
  return JSON.parse(block.text);
}

function extractFromToolUse(response: AnthropicMessageResponse, name: string): unknown {
  const block = response.content.find((b) => b.type === "tool_use" && b.name === name);
  if (!block) {
    throw new Error(`no tool_use block named '${name}' in Anthropic response (strict_tool mode)`);
  }
  return block.input;
}

// One structured JSON log line per Anthropic call, per SPEC.md's logging
// requirement, emitted at the call site since it is not yet wired through
// worker.ts's per-request logging.
function logCall(
  endpoint: string,
  model: string,
  usage: Usage | null,
  startedAt: number,
  outcome: "success" | "error",
): void {
  console.log(
    JSON.stringify({
      endpoint,
      model,
      usage,
      latency_ms: Date.now() - startedAt,
      outcome,
    }),
  );
}
