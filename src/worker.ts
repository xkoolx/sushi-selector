// Sushi Selector worker: thin proxy and router. The intelligence of this
// product lives in shared/prompts/ and shared/schema/, not here. Phase 0 wires
// only the health check, CORS, and the route table; extraction, session, and
// rate limiting land in Phase 1.

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

    // Reserved for post-MVP KV share links; documented and 404ing per SPEC.
    if (url.pathname.startsWith("/api/menus/")) {
      return json({ error: "not_found" }, 404, cors);
    }

    // Phase 1 endpoints (/api/session, /api/extract/*) land here.
    return json({ error: "not_found" }, 404, cors);
  },
} satisfies ExportedHandler<Env>;
