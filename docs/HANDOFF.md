# Sushi Selector: Claude Code Handoff

## Mission

Build and deploy Sushi Selector, a mobile-first web app that turns a photo of a
restaurant menu into a filterable, searchable list of menu items with
ingredients and prices. Primary use case: sushi menus, at the table, on a
phone, in under 30 seconds. Extraction reliability is the product. Everything
else exists in service of it.

## Read order

1. This file: the contract, phases, and acceptance criteria.
2. CLAUDE.md: mandatory conventions and the verification loop.
3. SPEC.md: architecture, endpoint contracts, schemas, orchestration, UI.
4. PLAN.yaml: the task-level breakdown with dependencies, parallel lanes,
   human gates, and effort estimates. SPEC.md wins on any conflict.
5. EVALS.md: how extraction quality is measured. The gates in that file, not
   your confidence, decide when extraction is done.
6. DEPLOY.md: Cloudflare and Anthropic setup. Some steps require Tom.

## Task contract

Inputs:
- This documentation package (docs/).
- Eval menu photos supplied by Tom in evals/menus/ (see EVALS.md). If they are
  not present yet, build through Phase 0 and the eval harness skeleton, then
  stop and request them. Do not substitute stock or synthetic menu images.
- Secrets supplied by Tom via wrangler (see DEPLOY.md). Never ask for secret
  values in chat and never write them to any file that is committed.

Outputs:
- A working app deployed to Cloudflare from the public GitHub repo
  sushi-selector.
- A passing eval report committed to evals/reports/.
- A README.md with a project summary, architecture sketch, screenshots, and
  the latest eval results table. The repo is a portfolio artifact; write the
  README for a technical reader deciding whether Tom knows what he is doing.

Success criteria are the acceptance checklist below plus the eval gates in
EVALS.md. All criteria are verifiable by running something. "It works when I
tried it" is not a success signal.

## Phases

Build in this order. Do not reorder. Extraction before UI, because a beautiful
UI over unreliable data is a failed project.

- Phase 0, scaffold: repo layout per SPEC.md, wrangler config, hello-world
  worker route, static shell served locally via `npx wrangler dev`.
- Phase 1, extraction pipeline and evals: image preprocessing, the
  index/details/reconcile pipeline, the URL ingestion path via the Anthropic
  web fetch tool, and the eval harness. Iterate prompts and
  schemas until every gate in EVALS.md passes on the golden set.
- Phase 2, UI: filter bottom sheet with tri-state chips, filter search, item
  search, price sort, Omakase, flagged-item fix flow (chips plus
  autocomplete), progress screen, resume-on-reload, PWA manifest, and the
  mobile web standards in SPEC.md.
- Phase 3, hardening: Turnstile verification, HMAC session tokens, per-IP rate
  limiting, origin allowlist, payload caps. Verify each control with a
  negative test (a request that should fail, failing).
- Phase 4, ship: GitHub Action deploy on push to main, README, final eval
  report, walk the acceptance checklist.

Post-MVP (design for, do not build): KV share links at /m/:id and
/api/menus/:id, dish photo extraction, per-restaurant filter memory,
smarter zero-results suggestions, a Gemini
free-tier provider adapter behind the provider interface, smart Omakase with
preference criteria.

## Acceptance checklist

Every box must be demonstrably checkable before declaring the project done.

- [ ] `npx wrangler dev` serves the app locally and a full parse of a sample
      photo completes end to end.
- [ ] `uv run evals/run_evals.py --all` passes every gate defined in EVALS.md.
- [ ] A 40+ item menu photo parses in under 30 seconds on the default model.
- [ ] A URL parse of a real restaurant menu page completes and renders.
- [ ] Reloading the page mid-parse resumes the job instead of restarting.
- [ ] Tri-state ingredient filters, filter-list search, item search, price
      sort, and the Omakase button all function on a parsed menu.
- [ ] Flagged item flow works: retry action fires a single-item call, and
      the fix sheet offers menu-vocabulary chips with autocomplete.
- [ ] Mobile standards verified on a real phone: no input zoom on focus,
      44px targets, safe areas respected, filter sheet opens from the bottom.
- [ ] No secrets anywhere in the repo, including git history and .dev.vars.
- [ ] Extraction endpoints reject requests without a valid session token
      (401) and reject oversized payloads (413).
- [ ] The rate limit returns 429 after the configured threshold.
- [ ] Push to main deploys to Cloudflare via the GitHub Action with least
      privilege permissions.
- [ ] README includes architecture summary, screenshots, and the eval results
      table from the final report.

## Tom's preflight (human tasks, cannot be delegated)

docs/RUNBOOK.md walks every step below in order with exact commands. Summary:

1. Collect 6 to 10 real menu photos per the guidance in EVALS.md and place
   them in evals/menus/raw/.
2. Create a Cloudflare account and run `npx wrangler login` (DEPLOY.md).
3. In Anthropic Console: create a dedicated workspace, set a $5 monthly spend
   limit, create a workspace-scoped API key (DEPLOY.md).
4. Create a Turnstile site and copy the site key and secret key (DEPLOY.md).

## Out of scope for MVP

Dish photos, user accounts, share links, multi-language menus,
and optimizing for non-sushi menus. If a non-sushi menu happens to parse well,
that is a bonus, not a requirement.
