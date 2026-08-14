# Session Bridge

Last updated: 2026-08-10
Updated by: claude/hello-6yi0pl session (PR #6 merged)

## Active branch

`main` (PR #6 merged all work into main)

Development branch for new work: `claude/hello-6yi0pl`
(Create fresh from main when starting new work:
`git fetch origin main && git checkout -B claude/hello-6yi0pl origin/main`)

## Project phase status

| Phase | Status | Notes |
|-------|--------|-------|
| 0: Scaffold | Done | wrangler.jsonc, types, static assets |
| 1: Extraction pipeline | Done | two-pass (index + details), Haiku 4.5 |
| 2: UI | Done | vanilla JS, mobile-first, PWA |
| 3: Security hardening | Done | Turnstile, HMAC tokens, rate limits, CORS, payload caps |
| 4: Ship prep | Done | CI workflow, README, acceptance checklist |
| Eval harness | Done | 9 golden menus, offline check mode |
| Upstream sync | Done | 10 locked labeling conventions cherry-picked |

## Blockers (owner action needed)

1. **ANTHROPIC_API_KEY**: add to `.dev.vars` locally to enable real parses and
   eval runs. Format: `ANTHROPIC_API_KEY=sk-ant-...` (one line in `.dev.vars`).
   Also add `TURNSTILE_SECRET_KEY` and `SESSION_HMAC_SECRET`.
2. **Cloudflare repo secrets**: add `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID` as GitHub repo secrets to enable the deploy workflow.
3. **Real-phone test**: verify mobile UX once deployed.

## Key files to read

| File | What it tells you |
|------|-------------------|
| `CLAUDE.md` | Repo conventions (mandatory) |
| `docs/HANDOFF.md` | Acceptance checklist (definition of done) |
| `docs/SPEC.md` | Product spec and architecture |
| `docs/EVALS.md` | Eval harness gates and methodology |
| `evals/reports/phase4-acceptance-checklist.md` | Current checklist status with evidence |
| `evals/menus/README.md` | Golden set labeling conventions (locked) |
| `readme.md` | Public README with architecture, screenshots, setup |

## Repo layout (quick ref)

```
src/                  Worker TypeScript (thin proxy)
  worker.ts           Router, CORS, auth middleware
  extract.ts          Two-pass extraction (index + details)
  session.ts          Turnstile verification, HMAC token minting
  ratelimit.ts        Cloudflare native rate limit bindings
public/               Static frontend (vanilla JS, no build step)
  app.js              State machine, API calls, localStorage resume
  ui.js               DOM rendering, sheets, chips, Omakase
  filters.js          Pure filter/sort/search functions
  preprocess.js       Client-side image resize before upload
  styles.css          Full design system (light/dark, mobile-first)
  index.html          Single-page app shell
  sw.js               Service worker (offline shell caching)
shared/               Extraction intelligence (versioned artifacts)
  prompts/system.md   Extraction prompt
  schema/             JSON schemas for index and details
  aliases.json        Ingredient alias table
evals/                Eval harness and golden set
  run_evals.py        Harness script (uv run)
  menus/              9 golden menus with photos and golden.json
  reports/            Committed eval reports
.github/workflows/
  ci.yml              Typecheck + eval check + secrets scan
  deploy.yml          Cloudflare deploy on push to main
```

## Recent decisions

- Cherry-pick strategy (not merge) for upstream sync: main deleted our Phase
  1-3 code while adding eval updates, so we cherry-picked only the 3
  eval/docs commits.
- CI secrets scan: history grep anchored to `^\+` (diff additions only) and
  output captured to variable (head always exits 0).
- No PR template in this repo; PRs written freeform.
- Stale branches exist (phase-1-extraction, pr-a/infra, pr-b/runtime,
  pr-c/extraction) from earlier split-PR strategy; all superseded by PR #6.

## What a new session typically needs

1. Check out the right branch (main for review, fresh feature branch for work)
2. `npm ci` to install deps
3. `npx tsc --noEmit` to verify typecheck
4. Read CLAUDE.md for conventions
5. Read this file for state
6. Check CI status on any open PRs
7. Check if upstream/main has new commits to sync
