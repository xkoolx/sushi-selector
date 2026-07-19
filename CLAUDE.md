# CLAUDE.md: Sushi Selector conventions

These rules are mandatory for every file, commit, and message produced in this
repo.

## Writing and style

- Never use em dashes anywhere: code comments, docs, commit messages, UI copy,
  README, eval reports. Use commas, colons, or parentheses instead.
- UI copy is short, friendly, and mobile-sized.

## Tooling

- Python exists in this repo only for the eval harness. All Python is managed
  with uv. Scripts carry PEP 723 inline dependency headers and run via
  `uv run <script>`. Never invoke pip or python directly. Translate any
  tutorial commands accordingly (`pip install X` becomes a PEP 723 dependency
  entry or `uv add X`).
- Frontend: vanilla JavaScript ES modules served as static assets. No
  framework, no bundler, no build step. If you feel the urge to add React,
  resist it; the state surface is one job object and one filter object.
- Worker: TypeScript, compiled by wrangler. Keep it a thin proxy. The
  intelligence of this product lives in shared/prompts/ and shared/schema/,
  not in worker code.
- Secrets live in wrangler secrets (production) and .dev.vars (local, in
  .gitignore). Never committed, never logged, never echoed into chat.

## Prompts and schemas are versioned artifacts

Files under shared/ are the product. Treat changes to them like schema
migrations:

1. Change the prompt or schema.
2. Run the eval harness.
3. Commit the change together with the new report in evals/reports/.

Never tune a prompt by vibes. The gates in EVALS.md decide, grounded in
measured signals, not in how good the output looks in one manual test.

## Commands

- `npx wrangler dev` : local dev server (worker + static assets, loads
  .dev.vars).
- `uv run evals/run_evals.py --all` : full eval run against the golden set.
- `uv run evals/run_evals.py --menu <slug>` : single-menu debug run.
- `npx wrangler deploy` : manual deploy (CI normally does this).

## Verify against live documentation

Your training data about these APIs may be stale. Before implementing, fetch
and confirm current shapes from live docs:

- Anthropic structured outputs (the output_config JSON schema format), prompt
  caching syntax, and Message Batches API. Start at the docs map:
  https://docs.claude.com/en/docs_site_map.md
  and the structured outputs page:
  https://platform.claude.com/docs/en/build-with-claude/structured-outputs
  Confirm the default model (claude-haiku-4-5-20251001) supports structured
  outputs. If it does not, use the specified fallback in SPEC.md (strict tool
  use with a forced tool choice).
- Cloudflare wrangler configuration for a Worker with static assets, and the
  current recommended cloudflare/wrangler-action version for CI:
  https://developers.cloudflare.com/workers/

## Definition of done

Done means the HANDOFF.md acceptance checklist is walked item by item with
evidence (command output, screenshots, eval report), not asserted. If an item
cannot be demonstrated, the project is not done and the blocker gets reported.
