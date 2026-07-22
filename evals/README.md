# Running the evals

One-time setup:

1. Install uv if you don't have it:
   `curl -LsSf https://astral.sh/uv/install.sh | sh`
2. Get on the branch:
   `git fetch origin && git checkout phase-1-extraction`
3. Put your API key in the shell (never in a file that gets committed):
   `export ANTHROPIC_API_KEY=sk-ant-...`

Each run:

```sh
uv run evals/run_evals.py --check    # free, no API calls: confirms everything loads
uv run evals/run_evals.py --all      # scored run, writes evals/reports/<timestamp>.md
```

Useful variants:

- `--menu km-sushi-nigiri` : one menu only, for cheap debugging
- `--all --repeat 3` : consistency check (same counts across runs, F1 spread <= 0.03)
- `--all --batch` : routes through the Batches API at half price, slower
- `--url-smoke --url https://...` : loose check of the URL path, not gated

## How to read a report

The report has four parts, in reading order:

1. **Gates table**: the only thing that decides pass or fail. All four
   accuracy gates (recall, precision, ingredient F1, price accuracy) plus
   consistency when you used --repeat.
2. **Per-menu breakdown**: which menu is dragging a gate down.
3. **Token usage and cost**: sanity check that caching worked. If cache read
   tokens are near zero, something broke; say so.
4. **Diffs sections**: the actionable part. `MISSED golden item` lines are
   recall problems, `EXTRA predicted item` lines are precision problems
   (hallucinated or duplicated items), `ingredients on ...` lines show
   missing or extra ingredients per item, `price mismatch` lines show price
   parsing problems.

## The loop

Run, then commit the report and push:

```sh
git add evals/reports/ && git commit -m "Eval run: <one line on what you see>" && git push
```

Prompt or schema changes go in shared/, and per CLAUDE.md every change to
shared/ lands together with the report from the run that justified it. Cost
expectation: well under $0.50 for a full run with caching, half with --batch.
