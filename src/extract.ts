// Anthropic request construction behind a provider seam (PLAN R-4: a Gemini
// adapter is post-MVP and slots in behind ExtractionProvider). The worker
// stays a thin proxy: it never decodes the image, it moves the base64 string
// from the client request into the Anthropic payload untouched.

import systemPrompt from "../shared/prompts/system.md";
import indexTask from "../shared/prompts/index-task.md";
import detailsTask from "../shared/prompts/details-task.md";
import urlTask from "../shared/prompts/url-task.md";
import indexSchema from "../shared/schema/index.schema.json";
import detailsSchema from "../shared/schema/details.schema.json";
import urlSchema from "../shared/schema/url.schema.json";

import type { Env } from "./worker";

export interface ImagePayload {
  media_type: string;
  data: string;
}

export interface DetailsItemRef {
  n: number;
  name: string;
}

export type ExtractRequest =
  | { kind: "index"; image?: ImagePayload; url?: string }
  | { kind: "details"; image?: ImagePayload; url?: string; items: DetailsItemRef[] }
  | { kind: "url"; url: string };

export interface ExtractUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

export interface ExtractResult {
  json: Record<string, unknown>;
  usage: ExtractUsage;
  stop_reason: string | null;
}

export class ExtractError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface ExtractionProvider {
  extract(req: ExtractRequest, env: Env): Promise<ExtractResult>;
}

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// Basic web fetch variant: the newer dynamic-filtering variants require
// Opus or Sonnet tier models, and the pinned model is Haiku 4.5. GA, no
// beta header (verified against live docs at build time).
const WEB_FETCH_TOOL = {
  type: "web_fetch_20250910",
  name: "web_fetch",
  max_uses: 3,
  max_content_tokens: 40000,
};

type ContentBlock = Record<string, unknown>;

function imageBlock(image: ImagePayload): ContentBlock {
  // The cache breakpoint lives on the image block so every details call for
  // the same photo reads the (system prompt + image) prefix at the cached
  // rate. system.md is sized so the prefix clears Haiku's 4,096 token floor.
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: image.media_type,
      data: image.data,
    },
    cache_control: { type: "ephemeral" },
  };
}

function buildBody(req: ExtractRequest, env: Env): Record<string, unknown> {
  const base: Record<string, unknown> = {
    model: env.MODEL,
    system: [{ type: "text", text: systemPrompt }],
  };

  const useUrl = "url" in req && typeof req.url === "string" && req.kind !== "url" && !("image" in req && req.image);

  if (req.kind === "index") {
    base.max_tokens = 2048;
    base.output_config = { format: { type: "json_schema", schema: indexSchema } };
    if (useUrl) {
      base.tools = [WEB_FETCH_TOOL];
      base.messages = [
        { role: "user", content: [{ type: "text", text: `${indexTask}\n\nMenu URL:\n${req.url}` }] },
      ];
    } else {
      base.messages = [
        { role: "user", content: [imageBlock(req.image!), { type: "text", text: indexTask }] },
      ];
    }
  } else if (req.kind === "details") {
    base.max_tokens = 2048;
    base.output_config = { format: { type: "json_schema", schema: detailsSchema } };
    const itemList = JSON.stringify(req.items);
    if (useUrl) {
      base.tools = [WEB_FETCH_TOOL];
      base.messages = [
        { role: "user", content: [{ type: "text", text: `${detailsTask}${itemList}\n\nMenu URL:\n${req.url}` }] },
      ];
    } else {
      base.messages = [
        { role: "user", content: [imageBlock(req.image!), { type: "text", text: `${detailsTask}${itemList}` }] },
      ];
    }
  } else {
    base.max_tokens = 8192;
    base.output_config = { format: { type: "json_schema", schema: urlSchema } };
    base.tools = [WEB_FETCH_TOOL];
    base.messages = [
      { role: "user", content: [{ type: "text", text: `${urlTask}${req.url}` }] },
    ];
  }

  return base;
}

function emptyUsage(): ExtractUsage {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };
}

function addUsage(total: ExtractUsage, u: Record<string, unknown> | undefined): void {
  if (!u) return;
  for (const key of Object.keys(total) as (keyof ExtractUsage)[]) {
    const v = u[key];
    if (typeof v === "number") total[key] += v;
  }
}

function lastTextBlock(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  for (let i = content.length - 1; i >= 0; i--) {
    const block = content[i] as ContentBlock;
    if (block && block.type === "text" && typeof block.text === "string") {
      return block.text;
    }
  }
  return null;
}

export const anthropicProvider: ExtractionProvider = {
  async extract(req: ExtractRequest, env: Env): Promise<ExtractResult> {
    if (!env.ANTHROPIC_API_KEY) {
      throw new ExtractError(500, "not_configured", "ANTHROPIC_API_KEY is not set (see docs/DEPLOY.md)");
    }

    const body = buildBody(req, env);
    const usage = emptyUsage();
    const started = Date.now();

    let stopReason: string | null = null;
    let content: unknown = null;

    // Server-side tool use (web fetch) can pause the turn; resume up to twice.
    // Image calls never pause, so this loop runs once for the photo path.
    for (let attempt = 0; attempt < 3; attempt++) {
      const resp = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const text = await resp.text();
        log(env, req.kind, env.MODEL, Date.now() - started, usage, null, `http_${resp.status}`);
        if (resp.status === 429) {
          throw new ExtractError(429, "upstream_rate_limited", "The kitchen is slammed, try again in a bit.");
        }
        throw new ExtractError(502, "upstream_error", `Anthropic API error ${resp.status}: ${text.slice(0, 300)}`);
      }

      const message = (await resp.json()) as Record<string, unknown>;
      addUsage(usage, message.usage as Record<string, unknown> | undefined);
      stopReason = (message.stop_reason as string | null) ?? null;
      content = message.content;

      if (stopReason !== "pause_turn") break;
      const messages = body.messages as unknown[];
      messages.push({ role: "assistant", content });
    }

    const latency = Date.now() - started;

    if (stopReason === "refusal") {
      log(env, req.kind, env.MODEL, latency, usage, stopReason, "refusal");
      throw new ExtractError(502, "refused", "The model declined this request.");
    }

    const text = lastTextBlock(content);
    if (text === null) {
      log(env, req.kind, env.MODEL, latency, usage, stopReason, "no_text");
      throw new ExtractError(502, "extract_failed", "Model response contained no text output.");
    }

    let json: Record<string, unknown>;
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      log(env, req.kind, env.MODEL, latency, usage, stopReason, "parse_failed");
      throw new ExtractError(502, "schema_parse_failed", "Model output failed JSON parsing.");
    }

    log(env, req.kind, env.MODEL, latency, usage, stopReason, "ok");
    return { json, usage, stop_reason: stopReason };
  },
};

// One structured JSON log line per Anthropic call (SPEC: cost and cache
// behavior must be auditable from logs alone). Zero cache reads on details
// calls after the first for a photo means caching is broken; the eval
// harness and dashboard queries key on these fields.
function log(
  env: Env,
  endpoint: string,
  model: string,
  latencyMs: number,
  usage: ExtractUsage,
  stopReason: string | null,
  outcome: string,
): void {
  console.log(
    JSON.stringify({
      event: "anthropic_call",
      endpoint,
      model,
      latency_ms: latencyMs,
      stop_reason: stopReason,
      outcome,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cache_creation_input_tokens: usage.cache_creation_input_tokens,
      cache_read_input_tokens: usage.cache_read_input_tokens,
    }),
  );
}
