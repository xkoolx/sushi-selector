// Sushi Selector worker: thin proxy and router. The intelligence of this
// product lives in shared/prompts/ and shared/schema/, not here. The worker
// authenticates, validates, rate limits, and proxies; it does a single
// JSON.parse of the request body and never decodes or transforms the image.

import aliases from "../shared/aliases.json";
import {
  anthropicProvider,
  ExtractError,
  type DetailsItemRef,
  type ExtractRequest,
  type ImagePayload,
} from "./extract";
import { enforceLimit } from "./ratelimit";
import { mintSessionToken, verifySessionToken, verifyTurnstile } from "./session";

export interface Env {
  ASSETS: Fetcher;
  EXTRACT_LIMITER: RateLimit;
  SESSION_LIMITER: RateLimit;
  MODEL: string;
  TURNSTILE_SITE_KEY: string;
  ALLOWED_ORIGINS: string;
  // Secrets (present at runtime, never committed): ANTHROPIC_API_KEY,
  // TURNSTILE_SECRET_KEY, SESSION_HMAC_SECRET.
  ANTHROPIC_API_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  SESSION_HMAC_SECRET?: string;
}

// Reject bodies over 1.5 MB before parsing where content-length allows it.
const MAX_BODY_BYTES = 1_500_000;
const MAX_DETAILS_ITEMS = 10;
const MAX_URL_LENGTH = 250;
const MEDIA_TYPE_ALLOWLIST = new Set(["image/jpeg", "image/png", "image/webp"]);

function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

// CORS is advisory (trivially spoofed outside browsers); the session token is
// the real endpoint guard. We reflect only known origins and never wildcard.
function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("Origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && allowedOrigins(env).includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(
  body: unknown,
  status: number,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
}

function tooLarge(request: Request, cors: Record<string, string>): Response | null {
  const len = request.headers.get("content-length");
  if (len && Number(len) > MAX_BODY_BYTES) {
    return json({ error: "payload_too_large" }, 413, cors);
  }
  return null;
}

async function parseBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    if (body && typeof body === "object" && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function validImage(value: unknown): ImagePayload | null {
  if (!value || typeof value !== "object") return null;
  const img = value as Record<string, unknown>;
  if (typeof img.media_type !== "string" || !MEDIA_TYPE_ALLOWLIST.has(img.media_type)) return null;
  if (typeof img.data !== "string" || img.data.length === 0) return null;
  return { media_type: img.media_type, data: img.data };
}

function validUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length > MAX_URL_LENGTH) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return value;
}

function validItems(value: unknown): DetailsItemRef[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_DETAILS_ITEMS) return null;
  const items: DetailsItemRef[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return null;
    const it = entry as Record<string, unknown>;
    if (typeof it.n !== "number" || !Number.isInteger(it.n)) return null;
    if (typeof it.name !== "string" || it.name.length === 0 || it.name.length > 200) return null;
    items.push({ n: it.n, name: it.name });
  }
  return items;
}

async function handleSession(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const oversize = tooLarge(request, cors);
  if (oversize) return oversize;

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const limited = await enforceLimit(env.SESSION_LIMITER, ip, cors);
  if (limited) return limited;

  const body = await parseBody(request);
  if (!body || typeof body.turnstileToken !== "string") {
    return json({ error: "bad_request", message: "turnstileToken is required" }, 400, cors);
  }

  const human = await verifyTurnstile(env, body.turnstileToken, ip === "unknown" ? null : ip);
  if (!human) {
    return json({ error: "turnstile_failed", message: "Verification failed, give it another try." }, 403, cors);
  }

  try {
    const { token, exp } = await mintSessionToken(env);
    return json({ sessionToken: token, exp }, 200, cors);
  } catch (e) {
    console.log(JSON.stringify({ event: "session_mint_failed", error: String(e) }));
    return json({ error: "not_configured", message: "Server session secret is missing." }, 500, cors);
  }
}

async function handleExtract(
  request: Request,
  env: Env,
  cors: Record<string, string>,
  kind: "index" | "details" | "url",
): Promise<Response> {
  const oversize = tooLarge(request, cors);
  if (oversize) return oversize;

  const body = await parseBody(request);
  if (!body) return json({ error: "bad_request", message: "Body must be a JSON object" }, 400, cors);

  const session = await verifySessionToken(env, body.sessionToken as string);
  if (!session) {
    return json({ error: "unauthorized", message: "Session expired or invalid, start a new parse." }, 401, cors);
  }

  // Extract endpoints rate limit on the session token, not the IP.
  const limited = await enforceLimit(env.EXTRACT_LIMITER, session.jti, cors);
  if (limited) return limited;

  const image = validImage(body.image);
  const url = validUrl(body.url);

  let req: ExtractRequest;
  if (kind === "url") {
    if (!url) return json({ error: "bad_request", message: "A valid http(s) url up to 250 characters is required" }, 400, cors);
    req = { kind: "url", url };
  } else if (kind === "index") {
    if (!image && !url) return json({ error: "bad_request", message: "Provide image or url" }, 400, cors);
    req = { kind: "index", image: image ?? undefined, url: image ? undefined : url ?? undefined };
  } else {
    const items = validItems(body.items);
    if (!items) {
      return json({ error: "bad_request", message: `items must contain 1 to ${MAX_DETAILS_ITEMS} entries` }, 400, cors);
    }
    if (!image && !url) return json({ error: "bad_request", message: "Provide image or url" }, 400, cors);
    req = { kind: "details", image: image ?? undefined, url: image ? undefined : url ?? undefined, items };
  }

  try {
    const result = await anthropicProvider.extract(req, env);
    return json({ ...result.json, usage: result.usage }, 200, cors);
  } catch (e) {
    if (e instanceof ExtractError) {
      const headers = e.status === 429 ? { "Retry-After": "30", ...cors } : cors;
      return json({ error: e.code, message: e.message }, e.status, headers);
    }
    console.log(JSON.stringify({ event: "extract_unhandled_error", error: String(e) }));
    return json({ error: "extract_failed", message: "Something went wrong parsing the menu. Try again." }, 502, cors);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // Static assets and non-/api paths are handled by the asset worker; only
    // /api/* reaches here thanks to run_worker_first.
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ status: "ok", model: env.MODEL }, 200, cors);
    }

    // The canonical alias table lives in shared/aliases.json and is bundled
    // into the worker, so the client and the eval harness normalize with the
    // exact same bytes without duplicating the file into public/.
    if (url.pathname === "/api/aliases" && request.method === "GET") {
      return json(aliases, 200, { "Cache-Control": "public, max-age=3600", ...cors });
    }

    if (url.pathname === "/api/session" && request.method === "POST") {
      return handleSession(request, env, cors);
    }

    if (url.pathname === "/api/extract/index" && request.method === "POST") {
      return handleExtract(request, env, cors, "index");
    }

    if (url.pathname === "/api/extract/details" && request.method === "POST") {
      return handleExtract(request, env, cors, "details");
    }

    if (url.pathname === "/api/extract/url" && request.method === "POST") {
      return handleExtract(request, env, cors, "url");
    }

    // Reserved for post-MVP KV share links; documented and 404ing per SPEC.
    if (url.pathname.startsWith("/api/menus/")) {
      return json({ error: "not_found" }, 404, cors);
    }

    return json({ error: "not_found" }, 404, cors);
  },
} satisfies ExportedHandler<Env>;
