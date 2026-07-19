# DEPLOY.md: accounts, secrets, and deployment

## Tom's one-time setup (about 20 minutes total)

### 1. Cloudflare (free plan)

1. Create an account at dash.cloudflare.com (sign-up is email based; the free
   plan needs no card).
2. In the repo, `npx wrangler login` opens a browser auth flow.
3. Note the Account ID from the dashboard sidebar; CI needs it.

### 2. Anthropic Console: workspace, cap, key

1. In console.anthropic.com, create a workspace named sushi-selector. A
   dedicated workspace isolates this app's spend and blast radius from your
   other API work.
2. Set the workspace monthly spend limit to $5. This is the control that makes
   every other failure survivable; do not skip it.
3. Create an API key scoped to that workspace. Never reuse a key from another
   project.

### 3. Turnstile

1. Cloudflare dashboard, Turnstile, Add site.
2. Domain: the workers.dev subdomain the app will deploy to (add a custom
   domain later if desired). Widget mode: Managed.
3. Copy the site key (public, referenced in frontend config) and the secret
   key (server-side only).

## Secrets

Production (run once each; wrangler prompts for the value):

```
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put SESSION_HMAC_SECRET   # generate: openssl rand -hex 32
```

Local development: a .dev.vars file with the same three names, plus MODEL if
overriding the default. .dev.vars must be in .gitignore from the first
commit. Per repo convention, secrets never appear in code, config, chat, or
git history.

## Wrangler configuration

One Worker serving both the API routes and the static frontend via the assets
directory setting pointed at public/. Set run_worker_first for /api/* so API
routes always reach the worker instead of being answered (or 404ed) by static
asset serving; this is the classic Workers Static Assets routing gotcha. Claude Code: verify the current
recommended wrangler.jsonc shape for Workers with static assets against live
Cloudflare docs at build time, since this area has evolved quickly. Non-secret
vars (MODEL, TURNSTILE_SITE_KEY, allowed origins) belong in wrangler.jsonc
vars, not secrets.

## CI deploy (GitHub Action)

.github/workflows/deploy.yml: on push to main, checkout, then
cloudflare/wrangler-action (verify current major version) running
`wrangler deploy`. Requirements:

- Repo secrets: CLOUDFLARE_API_TOKEN (create in Cloudflare with the Edit
  Workers template, least privilege) and CLOUDFLARE_ACCOUNT_ID.
- Explicit `permissions: contents: read` at the workflow level. The deploy
  job needs nothing more from GitHub.
- No Anthropic or Turnstile secrets in GitHub; those live only in Cloudflare
  via wrangler secret.

## Post-deploy verification

Run these against the deployed URL and record output in the final report:

1. `curl -X POST .../api/extract/index -d '{}'` returns 401 (no session).
2. /api/session with a garbage Turnstile token returns 403.
3. An oversized body returns 413.
4. Rapid repeated valid calls trip the 429 rate limit.
5. A real parse from a phone completes and renders.

## Cost controls recap

- Workspace spend cap: $5/month, hard stop.
- Existing balance: about $5 in credits, realistically 60 to 160 menu parses
  at 3 to 8 cents each on the default model (output tokens cost 5x input, and
  multi-photo parses roughly double per-session cost; the low end assumes
  caching is confirmed working via the usage counters).
- Eval tuning uses prompt caching and optionally the Batches API to stay
  cheap; each full eval run is expected under $0.50.
- If credits are ever exhausted by choice, the provider interface in
  extract.ts is the seam where a Gemini free-tier adapter would slot in
  (post-MVP; note its tradeoffs: free-tier prompts may be used for training
  and quotas have been cut without notice).
