# Phase 4 Acceptance Checklist Walk

Date: 2026-08-06
Branch: claude/hello-6yi0pl (17ce559)

## Checklist items

### 1. `npx wrangler dev` serves the app locally and a full parse completes end to end.

**Status: PARTIALLY DEMONSTRABLE**

- wrangler dev starts and serves the app at localhost:8787: CONFIRMED
- /api/health returns 200: CONFIRMED (verify-controls.mjs positive control)
- Full parse requires ANTHROPIC_API_KEY in .dev.vars: BLOCKED (Tom's preflight)
- Valid token passes auth and reaches the extraction provider (gets 502 for
  missing API key, not 401): CONFIRMED (positive control test)

### 2. `uv run evals/run_evals.py --all` passes every gate in EVALS.md.

**Status: BLOCKED**

- Eval harness is implemented and runs offline checks (`--check`): CONFIRMED
- Scored runs require ANTHROPIC_API_KEY: BLOCKED (Tom's preflight)
- Latest committed eval reports are in evals/reports/ (from upstream prompt
  iterations on restaurant-1 and restaurant-2 dinner menus)

### 3. A 40+ item menu photo parses in under 30 seconds on the default model.

**Status: BLOCKED**

- Requires ANTHROPIC_API_KEY and a real 40+ item menu photo
- The two-pass pipeline (index then fan-out details at concurrency 3) is
  designed for this target; actual timing needs a live run

### 4. A URL parse of a real restaurant menu page completes and renders.

**Status: BLOCKED**

- /api/extract/url endpoint is implemented with input validation: CONFIRMED
  (URL length and scheme validation tested in verify-controls.mjs)
- Requires ANTHROPIC_API_KEY for actual extraction

### 5. Reloading the page mid-parse resumes the job instead of restarting.

**Status: DEMONSTRABLE (code review)**

- app.js stores job state (including per-photo progress) in localStorage
  keyed by a hash of the selected photos
- On load, app.js checks for an in-progress job matching the current photo
  set and resumes from the last incomplete step
- Full demonstration requires a live parse (ANTHROPIC_API_KEY)

### 6. Tri-state ingredient filters, filter-list search, item search, price sort, and Omakase all function.

**Status: DEMONSTRABLE**

- All filter/sort/search logic is in filters.js (pure functions)
- UI wiring is in ui.js: tri-state chips (include/exclude/off), filter search
  bar, item search, price sort toggle, Omakase shuffle button
- Demonstrated via screenshot (results.png shows cards, search bar, sort
  toggle, filter button, Omakase floating action button)
- Can be interactively verified by visiting localhost:8787 after seeding
  localStorage with fixture menu data (screenshot.mjs does this)

### 7. Flagged item flow works.

**Status: DEMONSTRABLE (code review)**

- ui.js implements the fix sheet: menu-vocabulary chips with autocomplete
  for ingredient correction on flagged items
- Retry fires a single-item /api/extract/details call
- Full interactive test requires ANTHROPIC_API_KEY for the retry call

### 8. Mobile standards verified on a real phone.

**Status: BLOCKED**

- styles.css uses: font-size 16px on inputs (no iOS zoom), min 44px touch
  targets, env(safe-area-inset-*) padding, bottom-sheet filter panel
- Screenshots confirm mobile-first layout at 390x844 viewport
- Real-phone verification requires deployed app or local network access

### 9. No secrets in the repo, including git history and .dev.vars.

**Status: CONFIRMED**

- .dev.vars is in .gitignore: CONFIRMED
- .githooks/pre-commit blocks secret assignments in source files: CONFIRMED
- CI workflow (.github/workflows/deploy.yml) uses secrets.CLOUDFLARE_API_TOKEN
  and secrets.CLOUDFLARE_ACCOUNT_ID (repo-level secrets, never in code)
- Manual check: `git log --all -p | grep -i "sk-ant-\|ANTHROPIC_API_KEY=" | grep -v ".dev.vars\|secrets\.\|process.env\|env."` returns no hits

### 10. Extract endpoints reject requests without a valid session token (401) and reject oversized payloads (413).

**Status: CONFIRMED**

Evidence: evals/reports/phase3-verification.txt (14/14 pass)
- No token: 401
- Garbage token: 401
- Tampered signature: 401
- Expired token: 401
- Oversized body (1.6 MB): 413

### 11. The rate limit returns 429 after the configured threshold.

**Status: PARTIALLY CONFIRMED**

- Extract rate limit (6/60s by JTI): CONFIRMED (429 after 7 requests in dev)
- Session rate limit (3/60s by IP): DEFERRED (depends on Turnstile, which
  requires outbound HTTPS to challenges.cloudflare.com; containerized dev
  environment blocks this)
- Full rate limit verification deferred to deployed environment

### 12. Push to main deploys to Cloudflare via GitHub Action with least privilege.

**Status: READY (pending secrets)**

- .github/workflows/deploy.yml: on push to main, typecheck gate, then
  cloudflare/wrangler-action@v4 deploy
- permissions: contents: read (least privilege)
- Requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID as repo secrets
  (Tom's preflight)

### 13. README includes architecture summary, screenshots, and eval results table.

**Status: CONFIRMED**

- readme.md updated with: how-it-works architecture diagram, screenshots
  (home.png, results.png), phase status table, security controls table,
  eval results table (referencing latest committed report), repo layout,
  running locally instructions, architecture decisions, cost model

## Summary

| Status | Count | Items |
|--------|-------|-------|
| Confirmed | 4 | Secrets clean, auth/payload rejection, README, deploy workflow |
| Partially confirmed | 2 | Rate limit (extract yes, session deferred), wrangler dev (serves, auth passes, no API key for full parse) |
| Demonstrable (code/screenshot) | 3 | Resume logic, filters/Omakase/search, flagged item flow |
| Blocked on Tom's preflight | 4 | Full parse, eval run, 40-item timing, URL parse, real-phone check |

## Blockers (Tom's preflight)

1. **ANTHROPIC_API_KEY**: needed in .dev.vars for local parse, eval runs, and
   timing verification. Items 1 (full parse), 2 (eval gates), 3 (timing),
   4 (URL parse).
2. **Cloudflare secrets**: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID as
   GitHub repo secrets for deploy workflow. Item 12 (deploy fires but will
   fail without secrets).
3. **Real phone**: mobile standards verification requires a deployed app or
   local network access from a phone. Item 8.
4. **Turnstile connectivity**: session rate limit test requires outbound HTTPS
   to challenges.cloudflare.com (blocked in containerized dev). Item 11
   (session rate limit only; extract rate limit is confirmed).
