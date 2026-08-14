# Bootstrap: fresh session initialization

Read `docs/BRIDGE.md` for the current project state, then fan out these
agents in parallel to initialize the session:

## Agent 1: Branch and build check

- Run `git fetch origin` and check which branch to work on (read BRIDGE.md
  for the active branch).
- If a feature branch is specified, check it out. Otherwise confirm we are
  on main.
- Run `npm ci` (if node_modules is missing or stale).
- Run `npx tsc --noEmit` to verify the build is clean.
- Report: branch name, commit hash, typecheck pass/fail.

## Agent 2: CI and PR status

- Check if there are any open PRs on `xkoolx/sushi-selector` using GitHub
  MCP tools.
- For any open PR, check CI status (check runs) and report pass/fail.
- Check for unresolved review comments on open PRs.
- Report: open PRs (number, title, CI status), any review comments needing
  attention.

## Agent 3: Upstream sync check

- Run `git fetch upstream main` (if upstream remote exists) or
  `git fetch origin main`.
- Compare the current branch HEAD against origin/main: are there new
  commits to sync?
- Report: commits ahead/behind, whether a sync is needed.

## Agent 4: Project state summary

- Read `docs/BRIDGE.md` and `evals/reports/phase4-acceptance-checklist.md`.
- Summarize: what phases are done, what blockers remain, what the next
  logical piece of work is.
- Check if `.dev.vars` exists (do not read it, just confirm presence) to
  know if API keys are configured.
- Report: phase status, blockers, suggested next steps.

## After all agents complete

Synthesize the four reports into a single status briefing:

1. **Environment**: branch, commit, build health
2. **CI/PRs**: green/red, any review items
3. **Sync**: up to date or needs merge
4. **Project**: phase status, blockers, next steps

Keep the briefing concise (one screen). Flag anything that needs immediate
action.
