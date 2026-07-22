---
name: deploy-checklist
description: Pre-deploy verification for Sushi Selector on Cloudflare. Use before pushing to main, before promoting a deploy, or before walking the HANDOFF.md acceptance checklist. Covers build, secrets, security, evals, and the DEPLOY.md post-deploy verification steps.
---

Run this sequence before any production deploy. Stop and report on first failure.

1. Worker compiles: `npx wrangler dev` starts without TypeScript errors. Kill after confirming.

2. Eval gates pass: `uv run evals/run_evals.py --all` exits 0. If shared/ files changed since the last committed report, a new report must be committed alongside the change.

3. Secrets audit: grep the working tree and `git log -p` for ANTHROPIC_API_KEY, TURNSTILE_SECRET_KEY, SESSION_HMAC_SECRET. Zero matches. Confirm .dev.vars is in .gitignore.

4. Wrangler config sanity:
   - assets.directory = "./public"
   - run_worker_first includes "/api/*"
   - ratelimits has both EXTRACT_LIMITER and SESSION_LIMITER
   - observability.enabled = true
   - TURNSTILE_SITE_KEY is set to a real value (not REPLACE_WITH_*)
   - ALLOWED_ORIGINS includes the production workers.dev origin

5. Invoke the security-reviewer agent on the diff since last deploy. No Critical or High findings allowed.

6. Mobile check: verify public/index.html has viewport-fit=cover, font sizes on inputs are >= 16px in styles.css, and no touch target is below 44px in the filter sheet.

7. Post-deploy verification (run against the live URL after deploy):
   - POST /api/extract/index with empty body returns 401 (no session)
   - POST /api/session with garbage Turnstile token returns 403
   - POST /api/extract/index with body > 1.5MB returns 413
   - 7+ rapid valid extract calls on one session return 429
   - A real parse from a phone completes and renders

8. Record the current production deploy ID (from the Cloudflare dashboard or wrangler output) for rollback reference.

After deploy: hit the live URL, open browser console, confirm zero errors, confirm the deploy ID advanced.

No em dashes in output (repo convention).
