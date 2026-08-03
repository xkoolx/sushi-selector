Append-only log of scoped agent work sessions: what was authorized, what was
touched, and with what result. Newest entry last.

---

## Session 2026-07-21: post-review consistency pass over c091e40

Base commit: c091e40

### Authorized scope (verbatim)

SCOPE (pre-approved; do not re-confirm, do not exceed):

Task: post-review consistency pass over commit c091e40. Rule-check sweep
of the golden set, review-snapshot update, two doc drift fixes, genesis
entry in the session receipts log. One commit.
Files, modify only these:
  evals/menus/*/golden.json   (9 files, category (a) fixes only, see Task 1)
  evals/menus/README.md       (human-review snapshot section only)
  docs/EVALS.md               (integrate one missing passage only)
  docs/HANDOFF.md             (remove one stale pointer line, if present)
  docs/BUILDLOG.md            (new, append-only session receipts, Task 5)
Not touching: everything else. Explicitly: nothing under shared/, src/,
public/, .github/. No new files except docs/BUILDLOG.md. No wrangler. No
eval-harness runs. No Anthropic API calls. No Phase 1 work. Anything not
in the files list is out of scope: if it appears to need changing, report
it, do not change it.
Dependencies: repo at origin/main c091e40; the locked labeling conventions
in evals/menus/README.md, which are the source of truth for this sweep.
Done when: pre-flight passed; all 9 goldens swept against every convention;
category (a) fixes applied; category (b) findings listed with verbatim
evidence and zero edits; snapshot reads all 9 reviewed 2026-07-20; the
EVALS.md passage integrated; the HANDOFF.md pointer handled; BUILDLOG
genesis entry appended; one commit pushed to origin/main; closing report
printed.
Priority: this is the only task this session.

### Manifest (files touched)

- evals/menus/km-sushi-cold-appetizer/golden.json: swept, no category (a) fix needed (unchanged)
- evals/menus/km-sushi-dinner/golden.json: swept, no category (a) fix needed (unchanged)
- evals/menus/km-sushi-hot-appetizer-salad/golden.json: swept, no category (a) fix needed (unchanged)
- evals/menus/km-sushi-lunch/golden.json: swept, no category (a) fix needed (unchanged)
- evals/menus/km-sushi-nigiri/golden.json: swept, no category (a) fix needed (unchanged)
- evals/menus/km-sushi-noodles-kitchen/golden.json: swept, no category (a) fix needed (unchanged)
- evals/menus/km-sushi-sashimi/golden.json: swept, no category (a) fix needed (unchanged)
- evals/menus/km-sushi-special-rolls/golden.json: swept, no category (a) fix needed (unchanged)
- evals/menus/kuu-sushi-happy-hour/golden.json: swept, no category (a) fix needed (unchanged)
- evals/menus/README.md: human-review snapshot updated to all 9 reviewed 2026-07-20
- docs/EVALS.md: locked-conventions and unscored-metadata passage integrated into Golden set layout
- docs/HANDOFF.md: stale docs/RUNBOOK.md pointer removed from the preflight lead-in
- docs/BUILDLOG.md: created (this file)

---

## Session 2026-07-22: reconciliation and rule-enforcement pass over af0c029

Base commit: af0c029 (descendant of 2823343; The owner's adjudication commit
"Adjudicate sweep findings: wrap enum to none, egg canonical, KUU naming")

### Authorized scope (verbatim)

SCOPE (pre-approved; do not re-confirm, do not exceed):

Task: reconciliation and rule-enforcement pass. Bring the locked
conventions in evals/menus/README.md to parity with the master rule
list below, fix the restaurant naming in the photos description, then
sweep all 9 goldens against the newly added rules only and apply
mechanical fixes. One commit.
Files, modify only these:
  evals/menus/README.md       (LOCKED conventions section and the
                               photos description section only)
  evals/menus/*/golden.json   (9 files, category (a) fixes under the
                               newly added rules only, see Task 3)
  docs/BUILDLOG.md            (append one entry)
Not touching: everything else. Explicitly: nothing under shared/,
src/, public/, .github/, docs/ other than BUILDLOG.md. No wrangler,
no eval runs, no Anthropic API calls, no Phase 1 work. Anything
outside the listed files is report-only.
Dependencies: The owner's adjudication commit at origin/main (a descendant
of 2823343) carrying his four manual edits.
Done when: pre-flight passed; missing rules integrated; naming fixed;
all 9 goldens swept against the new rules with (a) applied and (b)
escalated with verbatim evidence; BUILDLOG entry appended; one commit
pushed; closing report printed with the full updated LOCKED section
verbatim.
Priority: this is the only task this session.

### Amendment (mid-session, user-authorized)

Two locked decisions from the 2026-07-2x sweep were formalized on top of the
original scope: (1) preparation-method stripping gains a contested-term
exception; "fried garlic" and "fried onion" recur across items as named crispy
garnishes, so they stay whole as canonical ingredients (same test as
pickle/cucumber) rather than stripping to garlic/onion. (2) The n=33
special-rolls golden, which had stripped "garlic" in ingredients with
"fried garlic" only in notes, is corrected to canonical "fried garlic" and the
now-redundant note fragment removed (the wrapper note is retained, as the
wrap-none rule requires it). A review gate (diffs shown before commit) was
honored.

### Manifest (files touched)

- evals/menus/README.md: LOCKED section brought to parity with the 7-rule
  master list (3 bullets extended: canonical/roe-family + egg-not-tamago, wrap
  physical-wrap-none + enum-never-grows, is_raw shrimp/octopus default false;
  4 bullets added: prep-method stripping + recurring-garnish exception,
  species/type qualifiers, vague-terms notes-only, combo choice sets). Photos
  description section: restaurant name "KM Sushi" corrected to "KUU SUSHI" with
  a parenthetical noting the km-sushi- folder slugs are kept stable (minimal-
  literal scope; the "two restaurants" intro and "KM" shorthands left as-is and
  flagged in the closing report)
- evals/menus/km-sushi-special-rolls/golden.json: n=17 "Vegas" ingredient
  "feep fried eel" -> "eel" (typo'd prep prefix, the known instance); n=33
  ingredient "garlic" -> "fried garlic" with the redundant "; fried garlic"
  note fragment trimmed (wrapper note retained)
- evals/menus/km-sushi-cold-appetizer/golden.json: swept, no category (a) fix needed (unchanged)
- evals/menus/km-sushi-dinner/golden.json: swept, no category (a) fix needed (unchanged)
- evals/menus/km-sushi-hot-appetizer-salad/golden.json: swept, no category (a) fix needed (unchanged)
- evals/menus/km-sushi-lunch/golden.json: swept, no category (a) fix needed (unchanged)
- evals/menus/km-sushi-nigiri/golden.json: swept, no category (a) fix needed (unchanged)
- evals/menus/km-sushi-noodles-kitchen/golden.json: swept, no category (a) fix needed (unchanged)
- evals/menus/km-sushi-sashimi/golden.json: swept, no category (a) fix needed (unchanged)
- evals/menus/kuu-sushi-happy-hour/golden.json: swept, no category (a) fix needed (unchanged)
- docs/BUILDLOG.md: this entry appended

### Category (b) findings (escalated, verbatim evidence, zero edits)

- km-sushi-special-rolls "seared pepper salmon" (item with ingredients spicy
  tuna, cilantro, avocado, cucumber, jalapeno, seared pepper salmon): compound
  prep, is_raw-relevant, not a recurring garnish; left as printed.
- km-sushi-nigiri n=2 "Sweet Shrimp" is_raw: true and km-sushi-sashimi n=12
  "Live-Sweet Shrimp" is_raw: true: contradict the shrimp default false, but
  sweet shrimp (amaebi) is conventionally raw; menu evidence is in photos not
  opened, so no edit per rule.

### Patterns (alias-table seeds for T-1.4, not created this pass)

- freshwater eel -> eel
- unagi -> eel
- tamago -> egg
- (implied by the new roe-family scope) smelt roe -> masago, flying fish roe ->
  tobiko, salmon roe -> ikura
- The recurring-garnish exception means "fried garlic" and "fried onion" are
  canonical leaves, NOT alias sources to garlic/onion.

---

## Session 2026-07-22: convention clarifications follow-up over 2843c21

Base commit: 2843c21

### Authorized scope (verbatim)

SCOPE (pre-approved; do not re-confirm, do not exceed):
Task: convention clarifications follow-up. Six small edits to
evals/menus/README.md, receipt, one commit.
Files, modify only: evals/menus/README.md, docs/BUILDLOG.md (append).
Not touching: everything else. Goldens explicitly untouched this
session. No wrangler, no eval runs, no Anthropic API calls.
Done when: six edits applied, BUILDLOG entry appended, one commit
pushed to origin/main, closing report printed.

### Manifest (files touched)

- evals/menus/README.md: six edits. (1) is_raw bullet: printed-name-is-evidence
  clarification (sweet shrimp/live default raw; is_raw tracks the item as served;
  explicit whole-item cooking method overrides the live default). (2) ingredients
  bullet: seared-fish compounds (seared tuna, seared pepper salmon) stay whole as
  is_raw evidence. (3) photos intro reworded to one restaurant KUU SUSHI captured
  as two menu artifacts; happy-hour bullet lead-in relabeled to "KUU SUSHI happy
  hour". (4) coverage sentence: four restaurant-shorthand "KM" changed to "KUU"
  (slug references left). (5) prep-strip bullet: exception list is explicit and
  closed, joined only via documented convention change; ingredients transcribed
  as printed, never renamed to a category. (6) placeholder "2026-07-2x" replaced
  with "2026-07-22".
- docs/BUILDLOG.md: this entry appended

---

## Session 2026-07-22: Phase 1 product artifacts (schemas, prompts, aliases) over 68c878c

Base commit: 68c878c

### Authorized scope (verbatim)

SCOPE (pre-approved; do not re-confirm, do not exceed):

Task: author the Phase 1 product artifacts. Schemas, prompts, and the
expanded alias table. No API calls, no wrangler, no eval-harness runs.
Also confirm the consistency-gate menu designation by visual inspection.
Files, modify only these:
  shared/schema/index.schema.json      (new)
  shared/schema/details.schema.json    (new)
  shared/schema/url.schema.json        (new, combined URL schema)
  shared/prompts/system.md             (new)
  shared/prompts/index-task.md         (new)
  shared/prompts/details-task.md       (new)
  shared/prompts/url-task.md           (new)
  shared/aliases.json                  (expand existing 5 entries)
  docs/BUILDLOG.md                     (append)
Not touching: everything else. Explicitly: nothing under src/, public/,
.github/, evals/run_evals.py, any golden.json. No wrangler, no eval
runs, no Anthropic API calls. This session writes files and commits;
it does not spend.
Dependencies: evals/menus/README.md (LOCKED conventions, single source
per T-1.3), SPEC.md schema shapes, shared/aliases.json's existing
5 entries and the alias seeds already logged (freshwater eel to eel,
unagi to eel, tamago to egg, smelt roe to masago, flying fish roe to
tobiko, salmon roe to ikura).
Done when: all seven files written and internally consistent with
each other and with README; aliases.json expanded; consistency-gate
menus confirmed by visual check; BUILDLOG entry appended; one commit
pushed; closing report printed with the full system.md content
verbatim for oversight cross-check.
Priority: this is the only task this session.

### Pre-flight

1. Working tree clean; HEAD == origin/main == 68c878cfcd4c5ea31b6f585b99498ce864a8bdec. Pass.
2. shared/schema/ and shared/prompts/ confirmed empty. Pass.
3. shared/aliases.json confirmed exactly 5 entries. Pass.
4. evals/menus/README.md LOCKED section confirmed present with all three
   named 2026-07-22 clarifications (is_raw item-as-served semantics,
   seared-fish compounds, closed garnish-exception list). Flagged one
   discrepancy: the check describes "7 master rules" but the LOCKED
   section is an unlabeled list of 14 bullets, not a countable 7. Resolved
   against this file's own history: the "7-rule master list" phrase
   originates in the 2026-07-22 rule-parity session above and was the
   count before that session's own extensions and the following
   clarifications session grew it further. Substantive content check
   passed; treated as non-blocking and proceeded.

### Manifest (files touched)

- shared/schema/index.schema.json: created, transcribed verbatim from SPEC.md
- shared/schema/details.schema.json: created, transcribed verbatim from SPEC.md
- shared/schema/url.schema.json: created, combined shape (details item shape
  plus section, price_text, price per item, plus top-level sections array),
  no restaurant_name field (SPEC.md's prose description of the combined
  schema does not name one; see findings below)
- shared/prompts/system.md: created, style guide mirroring all 14 LOCKED
  README rules in expanded substance (not summary), ~2,727 words / ~16.8k
  characters, comfortably over the 2,500-token cache-floor target. Adds one
  clause beyond a literal README mirror: preserve the verbatim printed
  spelling in notes when a normalized ingredient (currently: krab to
  imitation crab) differs materially from what was printed, per SPEC.md's
  own description of this prompt's crab guidance
- shared/prompts/index-task.md: created, index-pass instruction referencing index.schema.json
- shared/prompts/details-task.md: created, details-pass instruction referencing details.schema.json
- shared/prompts/url-task.md: created, combined-pass instruction referencing url.schema.json
- shared/aliases.json: expanded from 5 to 8 entries (added freshwater eel ->
  eel, unagi -> eel, tamago -> egg). Confirmed fried garlic and fried onion
  are not present as alias sources. The 5 original entries left untouched
  (see findings below on one pre-existing entry)
- docs/BUILDLOG.md: this entry appended

### Consistency-gate menu designation (visual inspection)

Opened evals/menus/raw/IMG_3434.jpeg (km-sushi-nigiri), IMG_3433.jpeg
(km-sushi-sashimi), IMG_3440.jpeg (km-sushi-cold-appetizer), and
IMG_3441.jpeg (km-sushi-hot-appetizer-salad) directly.

- Densest: `km-sushi-nigiri` (IMG_3434). Confirmed: single photo, three
  menu sections (Premium Sushi, Sushi, Basic Roll), roughly 40 priced items,
  visible glare and 90-degree rotation.
- Ugliest: `km-sushi-sashimi` (IMG_3433). IMG_3433 carries comparably severe
  rotation and glare to IMG_3434 (a bright wash over the gold Premium
  Sashimi panel) but far fewer items, making it a distinct stress case from
  the density pick rather than a duplicate. IMG_3440 and IMG_3441 were also
  checked and ruled out: both rotated but clean and fully legible, no
  meaningful glare, consistent with README tagging them "rotated" only.

### Findings for the owner (report-only, no edits made)

- url.schema.json has no `restaurant_name` field. SPEC.md's prose for the
  combined URL schema names only "the details item shape plus section,
  price_text, and price per item, and the sections array," with no mention
  of restaurant_name. Implemented literally as described, but this means a
  URL-only parse can never produce a real restaurant name and always falls
  back to "Menu, <date>." Possible gap worth a deliberate decision, not
  patched here (design-level, out of scope to resolve unilaterally).
- shared/aliases.json's pre-existing entry `"bonito flake": "katsuo bushi"`
  runs the opposite direction from the general non-roe convention (plain
  English canonical, Japanese aliases inward, e.g. tamago -> egg), and
  README does not mention bonito or katsuobushi at all under either
  pattern. Left untouched: this entry predates this session and the task
  was to expand, not to correct existing entries. Flagging for a deliberate
  call on which direction is intended.
- Considered but did not add `anago -> eel` (saltwater eel, distinct from
  unagi) or `mayo sauce -> mayo` as further aliases. Neither is named in
  README or in the seed list this session was given; adding either would
  have been an unverified guess rather than an implied requirement.
- README's roe-family rule states "the alias table... maps English -> the
  menu term, never the reverse," a fact about alias-table directionality
  that system.md does not restate verbatim, since it describes a
  downstream client mechanic rather than an extraction instruction. Judged
  non-blocking, noting for the record per the self-check task.
- The "preserve verbatim spelling in notes" clause added to system.md's
  crab section (per SPEC.md's explicit description) was not generalized to
  the roe family or tamago/egg, since only the crab case is stated
  explicitly anywhere in the source docs. Worth a deliberate decision on
  whether it should generalize.
- None of this session's seven artifacts have been run through the model or
  the eval harness (both explicitly out of scope this session); T-1.3's
  "run the eval harness" step remains the actual verification of whether
  these prompts and schemas work in practice.

### Patterns established

- Alias-table seeds logged in the prior 2026-07-22 session (freshwater eel,
  unagi, tamago; roe family) are now implemented in shared/aliases.json.
- System-prompt style guide content should mirror README's LOCKED section
  rule-for-rule but is expected to expand each into fuller extraction
  guidance (rationale, edge cases, examples) rather than restate it as a
  summary; SPEC.md's own prose about system.md's content is an equally
  authoritative source for prompt content, not just a schema-shape
  reference, and this session found one place (crab/notes preservation)
  where SPEC.md's prose said more than README's bullet did.

### Single next action

Run `uv run evals/run_evals.py --menu km-sushi-nigiri` (or `--all`) once
The owner authorizes an Anthropic API spend, to get first empirical signal on
whether these schemas and prompts produce valid, accurate output before
iterating further.

---

## Session 2026-07-23: Phase 1 request layer over 3e53b4a

Base commit: 3e53b4a (Phase 1: extraction schemas, prompts, and expanded
alias table)

### Authorized scope (verbatim)

SCOPE (pre-approved; do not re-confirm, do not exceed):

Task: Phase 1 request layer. Write src/extract.ts, complete the eval
harness pipeline wiring, and apply four adjudicated corrections to the
shared artifacts. This session ends at the spend gate: it makes ZERO
Anthropic API calls. Wiring the gun is in scope; firing it is not.
Files, modify only these:
  src/extract.ts               (new)
  evals/run_evals.py           (complete run_pipeline_for_menu, --batch
                                and --url-smoke plumbing, report
                                cost/cache lines)
  shared/schema/url.schema.json  (add nullable restaurant_name)
  shared/prompts/url-task.md     (one clause: restaurant_name only when
                                  literally printed on the fetched page,
                                  else null)
  shared/aliases.json          (flip bonito entry, add three)
  docs/SPEC.md                 (one-line amendment: combined URL schema
                                includes nullable restaurant_name)
  docs/BUILDLOG.md              (append)
Not touching: everything else. Explicitly: no other src/ files, nothing
under public/ or .github/, no golden.json, no system.md, no
index/details schemas or task files. No wrangler. NO Anthropic API
calls of any kind. The only permitted harness invocations are
`uv run evals/run_evals.py --check` and its built-in self-test; never
--menu, --all, --repeat, --batch, or --url-smoke this session, since
after your wiring those spend real credits.
Dependencies: HEAD 3e53b4a artifacts (schemas, prompts, aliases);
SPEC.md call specification; CLAUDE.md live-docs mandate.
Done when: live-docs checks recorded; extract.ts written with both
output paths; run_pipeline_for_menu implemented mirroring extract.ts's
request shape; corrections applied; --check green; BUILDLOG entry
appended; one commit pushed; closing report printed. No spend.
Priority: this is the only task this session.

### Amendment (mid-session, user-authorized)

At the plan-mode checkpoint, extract.ts's design ran into a real
architectural gap: it needs shared/prompts/*.md content at build time,
but Wrangler's bundler (esbuild) has no default loader for .md (verified
against live Cloudflare docs: defaults are .txt/.html/.sql/.bin/.wasm
only), and adding one requires a wrangler.jsonc "rules" entry, which the
original scope's "Not touching" line excluded ("No wrangler"). Asked the
user how to proceed (inline copies vs. real imports vs. escalate); the
user authorized wrangler.jsonc joining the touched-files list for
exactly one change: a `rules` entry declaring shared/prompts/*.md as
Text modules (fallthrough true), so extract.ts imports the real prompt
files rather than holding duplicate copies. Verification: a build-only
check with no deploy, no dev server, no account interaction, if one
exists; otherwise skip and tag unverified. See Verification below for
what was actually run.

### Pre-flight

1. Working tree clean; HEAD == origin/main == 3e53b4a3b49d246ed17b0c1647977687d1297789. Pass.
2. All seven shared artifacts from 3e53b4a present (index/details/url
   schemas; system/index-task/details-task/url-task prompts). Pass.
3. evals/run_evals.py's run_pipeline_for_menu still raised
   NotImplementedError before this session's edits. Pass.
4. ANTHROPIC_API_KEY present in env (needed for nothing this session,
   present so a later --check exit-criteria read would be valid). Pass.

### Live-docs findings (verified this session, not from training memory)

- Structured outputs: `output_config: {"format": {"type": "json_schema",
  "schema": {...}}}`, no `name` field. claude-haiku-4-5-20251001 is
  explicitly listed as supported.
- Strict tool fallback: `strict: true` plus `additionalProperties: false`
  and `required` on `input_schema`; forced via top-level
  `tool_choice: {"type": "tool", "name": "..."}`; result read from the
  `tool_use` block's `.input`.
- Prompt caching: `cache_control: {"type": "ephemeral"}` (or with
  `ttl: "1h"`), placeable on image blocks. Minimum cacheable prefix for
  Haiku 4.5 confirmed 4,096 tokens (matches SPEC.md's existing claim).
  Usage fields: cache_creation_input_tokens, cache_read_input_tokens,
  input_tokens (uncached remainder only, not the total).
- Message Batches API: `POST /v1/messages/batches`,
  `{"requests": [{"custom_id", "params"}]}`; poll `processing_status`
  until "ended"; stream results from `results_url`; results arrive in
  any order, keyed by custom_id; `result.type` in
  succeeded/errored/canceled/expired.
- Web fetch, model-support finding that diverges from an implicit
  SPEC.md assumption: the dynamic-filtering tool versions
  (web_fetch_20260209 and later) are documented to support Fable 5,
  Opus 4.8, Mythos 5/Preview, Opus 4.7, Opus 4.6, Sonnet 5, and Sonnet
  4.6 only. claude-haiku-4-5-20251001, the pinned default model, is not
  on that list. extract.ts and the harness therefore use the basic
  web_fetch_20250910 tool (GA, no beta header) for the URL pass, not a
  _202602xx variant. Also flagging: structured outputs
  (output_config.format) is documented incompatible with citations
  (returns 400), so citations stay off on the web_fetch tool; SPEC.md
  does not mention this interaction.

### Manifest (files touched)

- src/extract.ts: created. Provider interface (ExtractionProvider) plus
  AnthropicExtractionProvider, calling the Messages API directly via
  fetch (no new npm dependency; package.json out of scope). Both output
  paths implemented and reachable: json_schema (primary, default) and
  strict_tool (fallback), selected by a real constructor parameter, not
  described-only. Identical image-first, cache_control-on-image message
  shape shared by runIndex and runDetails. runUrl's strict_tool mode
  runs as two calls (fetch, then a forced-tool follow-up), since forcing
  a single tool via tool_choice precludes also calling web_fetch in the
  same turn; this two-call shape is this session's inferred design,
  flagged since SPEC.md does not address the interaction. Model pinned
  from env.MODEL (default claude-haiku-4-5-20251001); max_tokens
  pinned per endpoint (2048/2048/8192), never client-supplied. Returns
  and logs cache_creation_input_tokens/cache_read_input_tokens on every
  call. Real imports of the four shared/prompts/*.md files and three
  shared/schema/*.json files (see Amendment). tsc --noEmit passes clean
  (four .md imports carry a documented @ts-expect-error each, since this
  TypeScript version, 7.0.2, only accepts wildcard/ambient module
  declarations from a file with no top-level import/export of its own,
  i.e. a separate .d.ts, which is out of scope; this has no effect on
  wrangler's esbuild bundle, which does not run tsc).
- evals/run_evals.py: run_pipeline_for_menu implemented (was
  NotImplementedError), mirroring extract.ts's request shapes via shared
  _index_params/_details_params/_url_params builders. Per-photo pipeline
  (index, details in batches of 8 with batch 1 solo to warm cache, one
  reconcile retry, unknown-flagged never-dropped misses) plus multi-photo
  fuzzy merge/dedupe (photoIndex:n, name match >= 85 AND compatible
  price, keep richer ingredients, union notes), matching SPEC.md's rules
  exactly. --batch routed through _run_pipeline_for_menu_batch (two or
  three Message Batches jobs: index, details, retry), written in full
  and verified against the installed anthropic SDK's actual types
  (caught and fixed a wrong Request import path during review; Request
  is a TypedDict, so plain dict literals are used instead), reachable
  only via --batch, never invoked this session. --url-smoke wired to a
  real cmd_url_smoke gated on a new --urls flag; genuinely inert with no
  --urls given (prints guidance, touches no network). write_report gained
  a call_usages parameter, a per-call-kind cache write/read table, and
  the named "cache check (details calls 2+)" bug-check line. Added
  url_schema to SharedAssets (was missing entirely). Also fixed one
  stale line in cmd_check()'s final print (referenced "Phase 1" as
  future work; now accurate). `uv run evals/run_evals.py --check` passes
  green, scoring self-test PASS, zero API calls made.
- shared/schema/url.schema.json: added top-level
  `"restaurant_name": {"type": ["string", "null"]}`, not required.
- shared/prompts/url-task.md: added a restaurant_name bullet to the
  top-level-fields list, mirroring index-task.md's phrasing (literally
  printed on the fetched page, else null).
- shared/aliases.json: flipped `"bonito flake": "katsuo bushi"` to
  `"katsuo bushi": "bonito flake"` (resolving the direction flagged in
  the prior session's findings); added `"anago": "eel"` and
  `"mayo sauce": "mayo"`. 10 entries total; validated with
  python3 -m json.tool.
- docs/SPEC.md: one sentence in the /api/extract/url section extended to
  name the nullable restaurant_name field in the combined schema
  description.
- wrangler.jsonc: added a `rules` entry (see Amendment). No other field
  changed.
- docs/BUILDLOG.md: this entry appended.

### Verification

- `uv run evals/run_evals.py --check`: exit 0, "scoring self-test: PASS",
  zero API calls (confirmed by design: --check never imports a network
  path in its own control flow, and no ANTHROPIC_API_KEY-consuming call
  appears in the shell history this session).
- `python3 -m json.tool` on shared/aliases.json and
  shared/schema/url.schema.json: both parse.
- `npx tsc --noEmit`: exit 0 across the whole src/ tree.
- `npx wrangler deploy --dry-run --outdir <tmp>`: exit 0, no
  authentication prompt, no deploy. This bundles src/worker.ts (the
  actual entry point) plus the new wrangler.jsonc rules block
  successfully, but does not exercise extract.ts's new .md/.json
  imports, since extract.ts is not wired into worker.ts's router this
  session (out of scope). To verify that specifically: a standalone,
  config-file-free `esbuild src/extract.ts --bundle --loader:.md=text`
  (the exact loader type the new wrangler rule specifies) succeeded,
  exit 0, and the resulting bundle was confirmed to contain the real
  system.md content inlined, not a placeholder or unresolved import.
- Confirmed no `--menu`, `--all`, `--repeat`, `--batch`, or
  `--url-smoke` invocation occurred anywhere this session, and no
  Anthropic API call was made.

### Findings for the owner (report-only, no edits made)

- Web fetch tool version: SPEC.md's /api/extract/url section says to
  "verify the current web fetch tool name, beta header, and parameters
  against live docs at build time" without naming a version. Live docs
  this session show the newer dynamic-filtering variants
  (web_fetch_20260209+) do not list Haiku 4.5 as a supported model.
  Implemented using the basic web_fetch_20250910 (GA, no beta header)
  for the pinned default model. If MODEL is ever escalated to a
  dynamic-filtering-supported model, this choice should be revisited.
- Structured outputs plus citations: output_config.format is documented
  incompatible with citations (400 error). SPEC.md's URL pass
  description doesn't mention this; citations are left off on the
  web_fetch tool in both extract.ts and the harness. Worth a note in
  SPEC.md if citations are ever wanted on fetched URL content.
- runUrl's strict_tool fallback mode is a two-call design (let web_fetch
  resolve, then force the extraction tool on a follow-up turn), since a
  single forced tool_choice cannot also permit calling web_fetch. This
  is this session's own design, not specified anywhere in SPEC.md.
  Reasonable and doc-consistent, but untested against a live response
  since no API calls were made; worth extra scrutiny on the first real
  --url-smoke run.
- The eval harness's --batch path (Message Batches API) is written in
  full, type-verified against the installed anthropic SDK (0.119.0), but
  has never executed. First invocation should be treated as a fresh
  integration test, not an assumed-working path, since batch semantics
  (async, arrive-in-any-order results) are easy to get subtly wrong
  without a live run to check against.
- extract.ts is not wired into src/worker.ts's router this session
  (worker.ts wasn't in the authorized files list). The next session that
  touches worker.ts should import createExtractionProvider from
  extract.ts rather than reconstructing request logic inline.

### Patterns established

- Python (harness) and TypeScript (extract.ts) independently mirror the
  same Anthropic request shapes since there is no cross-language code
  sharing in this repo; changes to one must be manually mirrored to the
  other. A future session could add a lightweight fixture-based test
  that diffs the two languages' constructed request bodies for a fixed
  input, to catch drift automatically.
- When a TypeScript file needs to import a file type Wrangler's bundler
  doesn't support by default (here, .md), the fix is a wrangler.jsonc
  "rules" entry, not a workaround in the .ts file; but tsc itself still
  needs either a companion .d.ts with wildcard ambient module
  declarations, or a per-import `@ts-expect-error` if a new file is out
  of scope. Wrangler's esbuild bundle never runs tsc, so the choice
  between the two only affects standalone `tsc --noEmit` runs, not the
  actual deploy.
- Build-only verification of a bundler-dependent design decision (like
  the .md import rule) doesn't require wiring the new code into the
  live entry point: a standalone esbuild invocation with the same loader
  flags is a legitimate, config-free way to test the mechanism in
  isolation.

### Single next action

The human spend gate: a single index-only probe on km-sushi-sashimi
(`uv run evals/run_evals.py --menu km-sushi-sashimi`, which will also
run the details pass and reconcile per the pipeline as implemented; a
true index-only probe would need a smaller, separate invocation this
session did not build, since it wasn't in scope), pending The owner's
explicit go. This is the first live signal on whether extract.ts's
request shapes and the shared prompts/schemas actually produce valid,
schema-conformant, accurate output.

## Session 2026-07-23: T-1.12 iteration r1, name-matching fixes over 5a59f68

Base commit: 5a59f68 (Probe report: infrastructure validated, name
matching issues identified)

### Authorized scope (verbatim)

SCOPE
Task: T-1.12 iteration, round 1. Fix the two name-matching issues
  surfaced by the 2026-07-23-probe report.
Files:
  - shared/prompts/system.md (primary, add naming rules)
  - shared/prompts/index-task.md (if index-pass naming guidance needed)
  - shared/prompts/details-task.md (if details-pass guidance needed)
Not touching: extract.ts, run_evals.py, schemas, goldens, aliases.json
Dependencies: probe report evals/reports/2026-07-23-probe.md (read for
  context)
Done when:
  1. system.md instructs the model to use the primary English name
     only, placing parenthetical Japanese/alternate names in notes.
  2. system.md instructs the model that description lines under combo
     or set items are part of that item (notes or ingredients), not
     separate items.
  3. uv run evals/run_evals.py --menu km-sushi-sashimi --timestamp
     2026-07-23-r1 shows improved recall and precision on this menu.
  4. Commit the prompt change and the new report together.
Priority: name-convention rules only; do not tune other aspects yet.

### Pre-flight

1. Working tree clean at 5a59f68. Pass.
2. The three named prompt files all present and readable. Pass.
3. Probe report evals/reports/2026-07-23-probe.md present, read for
   context (item_recall 0.50, item_precision 0.40, both failing the
   0.97 gate; ingredient_f1_macro and price_accuracy both 1.00). Pass.

### Root cause (read-only investigation, verified against source)

Two distinct causes behind the probe's 15 pred vs. 12 gold on
km-sushi-sashimi, both confirmed by tracing evals/run_evals.py:

- Parentheticals left in `name` (`TUNA BELLY (MAGURO TORO)`, `SPANISH
  MACKEREL (AJI)`, `LIVE-SWEET SHRIMP (AMAEBI)`, `SPECIAL A (20PCS)`).
  `normalize_name` in run_evals.py only lowercases and collapses
  whitespace, no parenthetical stripping, and `match_items` requires
  `token_sort_ratio >= 85`; a trailing parenthetical is enough to drop
  a true match below threshold, so the dish counts as both a MISSED
  golden and an EXTRA predicted item.
- Combo contents lines (the "3pcs Each of Assorted Sashimi w/..." text
  under Special A/B/C) emitted as their own items instead of folded
  into the named item above them, per the golden's shape.
- Architectural constraint that shaped the fix: `_merge_details_into_index`
  in run_evals.py takes `name` from the index pass only, overwriting
  just ingredients/wrap/is_raw/notes from the details pass. The index
  schema has no `notes` field. So the parenthetical must be dropped in
  the index pass and can only be recorded in the details pass's notes;
  this drove where each instruction was placed in the fix below.

### Manifest (files touched)

- shared/prompts/system.md: added a new "Item names" section (after
  "Reading the photo", before "Ingredient naming") instructing that
  `name` is the primary English name only, with parenthetical
  Japanese/alternate names and piece-count qualifiers dropped and moved
  to notes, plus the reasoning about the evaluation set's name-match
  threshold. Augmented "Combo and choice-set items" with a paragraph
  stating that a contents/description line printed beneath a named
  combo or set item is part of that item, not a separate item, and
  must never get its own `n`.
- shared/prompts/index-task.md: replaced the `name` bullet (was "the
  item name as printed", which directly contradicted the fix) with the
  primary-English-name instruction; added a sentence to the reading
  guidance that a combo/set description line underneath an item is
  part of that item, not a separate entry.
- shared/prompts/details-task.md: extended the `notes` bullet to state
  that notes is also where the parenthetical alternate name and the
  combo contents line (pulled out of `name` and out of the index pass)
  get recorded; added a one-line clarifier to the `name` bullet not to
  re-add a parenthetical.
- evals/reports/2026-07-23-r1.md: new eval report from this session's
  verification run.
- docs/BUILDLOG.md: this entry appended.

### Verification

- Confirmed via grep: zero em dashes across all three edited prompt
  files.
- Re-read all three files in full for internal consistency (each task
  file's bullets reference the style guide section they draw from; the
  index/details split is stated consistently in both directions).
- Ran (credit-spend gate confirmed with the owner first, via AskUserQuestion,
  before executing): `uv run evals/run_evals.py --menu km-sushi-sashimi
  --timestamp 2026-07-23-r1`. Result, evals/reports/2026-07-23-r1.md:
  - item_recall: 0.50 to 1.00 (gate >= 0.97, PASS)
  - item_precision: 0.40 to 1.00 (gate >= 0.97, PASS)
  - price_accuracy: 1.00, unchanged (PASS)
  - pred/gold item counts: 15/12 to 12/12, exact match
  - ingredient_f1_macro: 1.00 to 0.7946 (gate >= 0.90, now FAILS; see
    Findings below, not fixed this session, out of scope)
  - overall GATES line: FAIL (solely on the ingredient gate above; every
    gate this task's Done-when list named is met)

### Findings for the owner (report-only, no edits made)

- ingredient_f1_macro regressed from 1.00 (probe) to 0.7946 (this run),
  now failing its 0.90 gate. This is not a regression this session's
  edits caused directly: it is newly visible because the five items now
  correctly matching (Special A, Special B, Special C, Japanese Sea
  Bream, Live-Sweet Shrimp) previously scored no ingredient F1 at all
  (they were unmatched in the probe, so their ingredient sets were never
  compared). Two distinct pre-existing gaps are exposed, per the new
  run's diffs:
  - `ebi` is predicted where gold says `shrimp` (Special A, B, C all
    show this exact missing/extra pair). This looks like an
    aliases.json gap (no `ebi` to `shrimp` entry), which this round's
    scope explicitly excludes from editing.
  - `japanese sea bream` and `live-sweet shrimp` are predicted where
    gold says `sea bream` and `sweet shrimp` (the item's own printed
    species/state qualifier is not being stripped from the ingredient
    the way system.md's existing rules strip other qualifiers). This
    looks like a system.md ingredient-naming rule gap, distinct from
    the naming-convention fix this round was scoped to, and from the
    "species qualifiers stay local to the item" rule already in the
    style guide (that rule is about not importing a qualifier from a
    different item, not about stripping the item's own printed one).
  Per this round's Priority line ("name-convention rules only; do not
  tune other aspects yet") and the Not-touching list (aliases.json,
  schemas), neither was touched this session. Flagging both as
  candidates for the next iteration round, pending The owner's prioritization
  and an explicit go on which one (or both) to take on next, and on
  whether the fix belongs in aliases.json, system.md, or both.

### Patterns established

- In this repo's two-pass extraction pipeline, `name` is fixed by the
  index pass and never overwritten by the details pass merge; any fix
  that changes what ends up in the final `name` must be made in
  index-task.md's instructions (and system.md's shared rule), not
  details-task.md, even though details-task.md is where `notes` (a
  details-only field) gets populated. A naming-convention fix that
  needs both a name change and a notes addition necessarily touches
  both task files plus system.md.
- Fixing item-count/name-matching gates can expose previously-invisible
  ingredient-content gaps, since ingredient F1 is only ever computed on
  matched pairs: a matching fix and an ingredient-accuracy fix are not
  independent from the gate's perspective, even though they are
  independent from a scope perspective. Expect this pattern again on
  future name-matching rounds against other menus.

### Single next action

The owner's prioritization call on the newly-exposed ingredient_f1_macro
failure (0.7946, gate >= 0.90): whether to run a round 2 iteration now
on the `ebi` to `shrimp` alias gap and the sea-bream/sweet-shrimp
species-qualifier-stripping gap identified above, or hold this menu at
its current recall/precision win and prioritize a different menu or
task next.

## Session 2026-07-23: T-1.12 iteration r2, ingredient fixes over 15f9d8f

Base commit: 15f9d8f (T-1.12 r1: fix item name matching on
parentheticals and combo sub-lines)

### Authorized scope (verbatim)

SCOPE
Task: T-1.12 iteration, round 2. Fix the two ingredient gaps surfaced
  by the 2026-07-23-r1 report on km-sushi-sashimi (ingredient_f1_macro
  0.7946, gate >= 0.90).
Files:
  - shared/aliases.json (add ebi -> shrimp alias)
  - shared/prompts/system.md (add rule: strip an item's own printed
    qualifier from its ingredients, e.g. "japanese sea bream" -> "sea
    bream", "live-sweet shrimp" -> "sweet shrimp"; this is separate
    from the existing "don't import qualifiers from other items" rule)
Not touching: extract.ts, run_evals.py, schemas, goldens, task files
Dependencies: round 1 report evals/reports/2026-07-23-r1.md
Done when:
  1. aliases.json includes ebi -> shrimp.
  2. system.md has the own-qualifier stripping rule.
  3. uv run evals/run_evals.py --menu km-sushi-sashimi --timestamp
     2026-07-23-r2 shows ingredient_f1_macro >= 0.90.
  4. Commit aliases + prompt change + report together.
Priority: these two ingredient fixes only; do not tune other aspects.

### Pre-flight

1. Working tree clean at 15f9d8f. Pass.
2. shared/aliases.json and shared/prompts/system.md both present and
   readable. Pass.
3. Round 1 report evals/reports/2026-07-23-r1.md present, read for
   context (ingredient_f1_macro 0.7946, gate >= 0.90 FAIL; two named
   gaps: ebi/shrimp on Special A/B/C, own-qualifier stripping on
   Japanese Sea Bream and Live-Sweet Shrimp). Pass.

### Manifest (files touched)

- shared/aliases.json: added `"ebi": "shrimp"` (11 entries total).
- shared/prompts/system.md: added one new bolded paragraph in
  "Ingredient naming", immediately after the existing "Species and type
  qualifiers stay local to the item that prints them" paragraph. States
  the complementary rule: an item's own printed name qualifier (a
  nationality like "japanese", a liveness marker like "live") strips
  from that item's ingredient even though it stays in the item name,
  with a guard sentence that this applies only to the item's own name,
  not to a qualifier printed on an ingredient inside a combo's contents
  line (so it does not license stripping "japanese scallop" on Special
  B's contents line).
- evals/reports/2026-07-23-r2.md: new eval report from this session's
  verification run.
- docs/BUILDLOG.md: this entry appended.

### Verification

- Ran (credit spend pre-authorized in the approved plan for this
  session, per the standing spend-gate rule): `uv run evals/run_evals.py
  --menu km-sushi-sashimi --timestamp 2026-07-23-r2`. Result,
  evals/reports/2026-07-23-r2.md:
  - ingredient_f1_macro: 0.7946 to 0.9745 (gate >= 0.90, PASS)
  - item_recall, item_precision, price_accuracy: 1.00, unchanged (PASS)
  - overall GATES line: PASS
  - Japanese Sea Bream and Live-Sweet Shrimp diffs fully cleared (zero
    diff lines for either item this run); the own-qualifier stripping
    rule worked as intended.
  - Special A, B, C still show `missing=['shrimp']` this run, but with
    `extra=[]` rather than r1's `extra=['ebi']`: the model did not emit
    `ebi` or `shrimp` for these items' shrimp component at all this run.
    Since the alias table only converts whatever the model outputs, and
    system.md's shrimp-related wording did not change this session, this
    reads as ordinary sampling variance between runs, not an effect of
    either fix. Flagged as unverified inference, not confirmed by a
    repeat run (out of scope this session).
  - Special B's residual `scallop` vs. gold `japanese scallop` diff
    (flagged as a known, out-of-scope residual in the r1 findings)
    persists unchanged.

### Findings for the owner (report-only, no edits made)

- Special A/B/C's `missing=['shrimp']` diff this run has a different
  shape than r1's (no `extra=['ebi']` companion), suggesting the model
  dropped the shrimp ingredient outright rather than mislabeling it.
  This did not block the gate (macro F1 lands at 0.9745), so it was not
  chased further per this round's ingredient-fixes-only priority, but a
  repeat run would help distinguish genuine sampling variance from a
  systematic gap worth a future round.
- Special B's `scallop`/`japanese scallop` residual (predicted strips
  "japanese", gold keeps it) is a miss against the existing "species
  qualifiers stay local" rule, not the two rules touched this round.
  Left unfixed per scope; still the most likely next single-menu
  ingredient target if further iteration on km-sushi-sashimi is wanted.

### Patterns established

- The own-qualifier-stripping rule's guard sentence (limiting the new
  rule to an item's own printed name, not to ingredients named on a
  combo's contents line) was necessary and appears to have worked: the
  residual Special B diff did not get worse by the new rule being
  over-applied to "japanese scallop" in its contents line.
- Per-run model sampling variance is visible even with an unchanged
  prompt for the affected ingredient (the ebi/shrimp component on
  Special A/B/C emitted differently between r1 and r2 despite no prompt
  change targeting it). Treat a single eval run's diff detail as one
  sample, not a deterministic characterization of the prompt, when
  reasoning about anything the round's own fix did not target.

### Single next action

The owner's call on whether to spend a further round on the two residuals
surfaced above (Special B's scallop qualifier, and confirming whether
the Special A/B/C shrimp-drop is sampling noise or systematic), run the
eval suite against other menus now that this menu's ingredient gate
passes, or move to a different T-1.x task.

## Session 2026-07-24: T-1.12 iteration r3, universal prompt fixes over b51350e

Base commit: b51350e (T-1.12 r2: fix ebi/shrimp alias and own-qualifier
ingredient stripping)

### Authorized scope (verbatim)

SCOPE
Task: T-1.12 iteration, round 3. Universal prompt fixes from the
  2026-07-23-all-r1 full-suite run. Only fixes that would be wrong on
  ANY restaurant's menu. Restaurant-specific tuning deferred per R-8.
Files:
  - shared/prompts/system.md (primary: 3 rule additions/refinements)
  - shared/prompts/index-task.md (parenthetical rule refinement)
  - shared/aliases.json (one spelling-only alias)
Not touching: extract.ts, run_evals.py, schemas, goldens,
  details-task.md
Dependencies: full-suite report evals/reports/2026-07-23-all-r1.md
Done when:
  1. Parenthetical rule refined: strip Japanese alternate names and
     standalone piece counts; KEEP parentheticals that disambiguate
     otherwise-identical item names (e.g. "Sushi Combo (9pcs Sushi +
     Roll)" stays intact because another item is also called "Sushi
     Combo"). Update both system.md and index-task.md.
  2. system.md has a combo pricing rule: when a printed price covers
     multiple items in a set (e.g. "2 for 17.50"), price is null and
     price_text carries the verbatim text. Upcharge modifiers like
     "+1" or "+2" also get price null with price_text carrying the
     modifier.
  3. Prep method stripping reinforced in system.md with concrete
     examples from the diffs: "deep fried soft shell crab" -> "soft
     shell crab", "chopped spicy salmon" -> "spicy salmon", "sauteed
     steak" -> "steak", "sliced jalapeno" -> "jalapeno", "baked
     salmon" -> "salmon". Reference the existing exception list
     (pickle, fried garlic, fried onion).
  4. aliases.json: add "soy bean" -> "soybean" (spelling fix only).
  5. uv run evals/run_evals.py --all --timestamp 2026-07-24-r3 runs
     and the report is committed with the changes.
  6. The report includes a note: "Single-restaurant golden set (KUU
     SUSHI). Further iteration deferred pending dataset broadening
     (R-8, A-1)."
Priority: these four universal fixes only. Do not chase ingredient
  completeness gaps, meaning-level aliases, or OCR misread patterns.
  If new diffs surface, report them, do not fix them.

### Clarification (asked before writing, plan mode)

The scoped report note says "Single-restaurant golden set (KUU
SUSHI)," but the golden set actually spans two restaurant-name
prefixes (km-sushi-*, 8 menus; kuu-sushi-happy-hour, 1 menu), confirmed
by both `--check`'s menu listing and direct inspection. Asked Tom via
AskUserQuestion whether to write the note verbatim as scoped or correct
it to match the data; Tom chose verbatim. Written exactly as scoped
(see Verification); flagged again here and in Findings for the record.

### Pre-flight

1. Working tree clean at b51350e except the pre-existing untracked
   evals/reports/2026-07-23-all-r1.md (present since before this
   session; not in this session's files list, left untouched). Pass.
2. `uv run evals/run_evals.py --check`: shared assets load, 9 menus
   discovered (8 km-sushi-*, 1 kuu-sushi-happy-hour), scoring self-test
   PASS, ANTHROPIC_API_KEY present. Pass.
3. Read all four named files (system.md, index-task.md, aliases.json,
   the r1 report) plus details-task.md and run_evals.py for scoring
   mechanics, to ground each fix in exactly the diff evidence cited in
   scope. Pass.

### Manifest (files touched)

- shared/prompts/system.md: three additions. (1) Item names section:
  a new paragraph stating the parenthetical-disambiguation exception,
  using the scoped Sushi Combo example, with a guard that it fires
  only on an actual same-menu name collision, not whenever a
  parenthetical looks descriptive. (2) Price fields section: replaced
  the vague combo-price sentence with an explicit rule (shared-set
  price and upcharge-only modifiers both get `price: null` with the
  verbatim text in `price_text`; never split or estimate a per-item
  number). (3) Preparation methods paragraph: added the five scoped
  worked examples (deep fried soft shell crab, chopped spicy salmon,
  sauteed steak, sliced jalapeno, baked salmon), framed as
  illustrations of the existing rule and exception list, not a new
  rule.
- shared/prompts/index-task.md: mirrored the parenthetical
  disambiguation exception in the `name` bullet, one sentence,
  referencing the style guide.
- shared/aliases.json: added `"soy bean": "soybean"` (12 entries
  total). Did not add edamame -> soybean (meaning-level, deferred per
  scope).
- evals/reports/2026-07-24-r3.md: new eval report from this session's
  verification run, with the scoped note inserted verbatim after the
  model line.
- docs/BUILDLOG.md: this entry appended.

### Verification

- `uv run evals/run_evals.py --check` re-run after all four edits:
  shared assets still load (system.md 20384 to 22491 chars, aliases 11
  to 12 entries), self-test PASS.
- Ran (spend gate confirmed by Tom approving the plan with the spend
  step explicit, per the standing intervention/spend-gate rule):
  `uv run evals/run_evals.py --all --timestamp 2026-07-24-r3`. Result,
  evals/reports/2026-07-24-r3.md:
  - All four gates still FAIL: item_recall 0.7613 (was 0.7883),
    item_precision 0.6842 (was 0.7353), ingredient_f1_macro 0.7157
    (was 0.6986), price_accuracy 0.8166 (was 0.8400). Expected: this
    was a targeted universal-fix round against a single-restaurant
    golden set, not a gate-passing round (per the scoped report note
    and R-8/A-1).
  - Fix 4 (soy bean spelling alias) confirmed working: on
    km-sushi-hot-appetizer-salad, the soy bean/soybean mismatch is
    gone from Garlic Soy Beans, Spicy Soy Beans, and plain Soy Beans
    (present in r1's diffs, absent from r3's). kuu-sushi-happy-hour's
    Edamame/Garlic Edamame/Spicy Edamame still show the mismatch, as
    expected (a different, meaning-level alias, correctly out of
    scope).
  - Fix 3 (prep-method examples) partially confirmed: Deep Fried Soft
    Shell Crab, Baked Salmon, and Crazy Horse no longer show their
    prep-word-prefixed ingredient as an extra (the exact behavior the
    fix targeted). But one of the scope's own named examples did not
    take: km-sushi's Gyumori/kuu-sushi-happy-hour still shows
    `extra=['crab meat', 'sauteed steak', ...]`, the identical
    "sauteed steak" case named in scope item 3, unresolved this run.
  - Fix 2 (combo/upcharge pricing) partially confirmed: on
    km-sushi-lunch, items whose only printed price is an upcharge
    modifier (Salmon Teriyaki, Steak Teriyaki, Assorted Sashimi)
    changed from a numeric price with a plain-number price_text in
    prior rounds to `price: null` with the verbatim modifier
    (`'ADD$2'`, `'ADD$1'`) this run, matching the new rule's intent.
    But plain "2 for 17.50" items with no modifier on the same menu
    (Chicken Teriyaki, Garlic Chicken, Sesame Chicken, Spicy Chicken,
    Vegetable Tempura, Lemon Shrimp, California Roll, Spicy Tuna Roll,
    Vegetable Roll, Mixed Tempura) still emit a numeric price
    unchanged from r1, and km-sushi-dinner's combo-priced items now
    show `price_text: None` rather than the expected verbatim "2 for
    23.00". See Findings for the likely cause.
  - Fix 1 (parenthetical disambiguation) did not resolve its target
    case. See Findings: the fix's own premise does not hold in the
    actual golden data.

### Findings for Tom (report-only, no further edits made)

- **Design-level, escalating rather than patching further**: Fix 1's
  evidence, both in this round's scope and in the original r1 report,
  describes km-sushi-dinner's "Sushi Combo (9pcs Sushi + Roll)" and
  "Sushi & Sashimi Combo (5pcs Sushi + 6pcs Sashimi + Roll)" as
  colliding with another same-named item after parenthetical
  stripping. Read evals/menus/km-sushi-dinner/golden.json directly to
  confirm: there is no second "Sushi Combo" or "Sushi & Sashimi Combo"
  item on this menu. Each combo name is unique even before stripping.
  So the disambiguation exception, as scoped and as implemented
  (fires only on an actual same-menu name collision), never triggers
  for this example, and this run's diff confirms it: both items are
  still MISSED, with a bare "Sushi Combo" and "Sushi & Sashimi Combo"
  still predicted as EXTRA. The real defect is different from what was
  scoped: the golden set's canonical name for a combo item includes
  its contents/piece-count parenthetical even with no collision,
  while the general parenthetical-stripping rule (unchanged from r1)
  still strips it for combo items same as any other item. Fixing that
  would mean broadening the exception from "collision-only" to
  "combo/set items with a contents-describing parenthetical always
  keep it," a materially different and broader rule than what was
  authorized this round. Not implemented; escalating for a deliberate
  decision rather than expanding scope unilaterally.
- The report note ("Single-restaurant golden set (KUU SUSHI)") is
  committed verbatim per Tom's explicit confirmation this session,
  though the scored set spans km-sushi (8 menus) and kuu-sushi (1
  menu). Recorded here for anyone reading the report cold.
- Fix 2's partial adoption (upcharge-only items changed behavior,
  plain "2 for X" items did not) is plausibly a menu-layout signal
  gap rather than a wording gap: items with an explicit per-row "+1"/
  "+2" marker gave the model an unambiguous per-item cue to null out;
  items sharing an unmarked "2 for 17.50" banner price may print that
  number directly on their own row with no per-item "shared" marker,
  so the model has no textual signal distinguishing "this item's own
  price" from "the section's shared price" without reading the section
  layout as a whole. Not re-worded further this session (would be
  iterating past the single scoped attempt); worth a targeted look at
  the actual photo if a future round takes this back up.
- Fix 3's one confirmed miss (Gyumori's "sauteed steak") is the exact
  example named in scope, unresolved despite the added worked example.
  Given only one sample per condition, this could be ordinary sampling
  variance (as flagged in the r2 entry above) rather than the fix
  failing to register; not chased further this round per the "report,
  do not fix" priority line.
- Aggregate gate deltas versus r1 are mixed and mostly small (item
  recall/precision/price down a few points, ingredient F1 up a couple
  points), against a backdrop of large, fix-unrelated per-run swings
  already visible in km-sushi-dinner, km-sushi-noodles-kitchen, and
  km-sushi-special-rolls (wildly different sets of invented combo/roll
  items each run, unrelated to any of the four fixes). Consistent with
  the sampling-variance pattern already noted in the r2 entry; a
  single `--all` run cannot separate real regression from noise. A
  `--repeat` consistency run would be needed to say more, and was not
  in this round's scope.

### Patterns established

- When a scope item's evidence cites "another item is also called X,"
  verify that claim against the actual golden.json before implementing
  the fix it justifies, not just against the diff report's MISSED/
  EXTRA lines. The diff report shows a name-match failure but not why
  it failed; this round's Fix 1 evidence read correctly from the r1
  diffs alone but was wrong once checked against the underlying data,
  and the fix as scoped could not have worked regardless of wording.
- A narrowly-scoped prompt fix (collision-only exception, upcharge-
  only null pricing) can partially generalize to unscoped-but-similar
  cases inconsistently, exposing what textual signal the model
  actually keyed on (an explicit per-item "+N" marker) versus what the
  rule's prose implied it should key on (any shared-set pricing). This
  is useful information for wording a broader version of the rule
  later, distinct from a bug in this round's wording.

### Single next action

Tom's call on the two escalated design-level items: (1) whether to
broaden the parenthetical-disambiguation exception to cover any combo/
set item with a contents-describing parenthetical, not just an actual
name collision, and (2) whether the "2 for X" combo-price rule needs a
follow-up pass informed by looking at the actual menu photo layout
rather than another prose-only prompt iteration. Also open: whether to
run `--repeat` on one or two menus to separate real signal from
sampling noise before further prompt iteration.

## Session 2026-07-25: T-1.12 iteration r4, parenthetical rule broadened over b9e4d12

Base commit: b9e4d12 (T-1.12 r3: universal prompt fixes from all-r1
full-suite run)

### Authorized scope (chat-authorized, not a pasted SCOPE block)

Tom answered the r3 closing report's three escalated open items
directly in chat:
1. Broaden the parenthetical rule: "combo items always keep their
   contents parenthetical" is still a universal fix, not
   restaurant-specific; r3's collision-only implementation was wrong,
   not the underlying idea. Authorized one more targeted round to fix
   it correctly.
2. Skip the menu-photo inspection for Fix 2's residual "2 for X"
   pricing gap; noted it may resolve once combo items start matching
   under item 1's fix, not worth a separate round on its own.
3. Skip `--repeat`; sampling-variance measurement isn't the best use
   of budget before the golden set broadens past one restaurant (R-8).
Treated as this round's scope: files touched limited to
shared/prompts/system.md and shared/prompts/index-task.md (same
footprint as r3, corrected content), verified with targeted single-
menu runs rather than a full `--all` spend, mirroring item 3's
cost-consciousness.

### Pre-flight

1. Working tree clean at b9e4d12. Pass.
2. Read the actual golden.json for every one of the 9 menus (not just
   km-sushi-dinner) to find every item whose gold `name` contains a
   parenthetical, before writing the broadened rule: confirmed only
   the same two km-sushi-dinner combo items ("Sushi Combo (9pcs Sushi
   + Roll)", "Sushi & Sashimi Combo (5pcs Sushi + 6pcs Sashimi +
   Roll)") have one anywhere in the golden set, so the broadened rule
   cannot regress any other menu's data. Pass.
3. Checked km-sushi-sashimi's Special A/B/C (also combo/set items,
   used as this doc's own hypothetical "Special A (20pcs)" stripping
   example) against their real golden data: their contents are printed
   on a separate description line and land in `notes`, with zero
   parenthetical in the golden `name` at all. Confirms the new rule's
   distinction (inline contents parenthetical vs. separate description
   line) does not create an internal contradiction with that existing
   example. Pass.
4. `uv run evals/run_evals.py --check`: assets load, self-test PASS.
   Pass.

### Manifest (files touched)

- shared/prompts/system.md: replaced r3's collision-only exception
  paragraph in the Item names section. New criterion: a combo or set
  item (per the Combo and choice-set items section: multiple food
  components bundled under one printed name and price) keeps its
  contents-describing parenthetical in `name` whenever the menu prints
  it directly after the item's own name, as a property of the item
  type, not a per-menu collision coincidence. A Japanese alternate name
  or a bare piece/size count on a single, non-combo dish still strips
  as before.
- shared/prompts/index-task.md: mirrored the same broadened exception
  in the `name` bullet.
- evals/reports/2026-07-25-r4-dinner.md: new, targeted single-menu
  verification run on km-sushi-dinner (the menu with the two
  parenthetical-bearing combo items).
- evals/reports/2026-07-25-r4-lunch.md: new, targeted single-menu
  verification run on km-sushi-lunch (checks Tom's hypothesis that
  Fix 2's residual pricing gap resolves incidentally).
- docs/BUILDLOG.md: this entry appended.

### Verification

- `uv run evals/run_evals.py --check` re-run after edits: assets load
  (system.md 22491 to 22860 chars), self-test PASS.
- Spend gate: flagged the two targeted single-menu runs explicitly
  before firing (progress-check note in chat), consistent with the
  standing intervention/spend-gate rule; proceeded given Tom's
  round-opening authorization plus the explicit flag.
- `uv run evals/run_evals.py --menu km-sushi-dinner --timestamp
  2026-07-25-r4-dinner` ($0.0374): **fix did not resolve the target
  case.** Both "Sushi Combo (9pcs Sushi + Roll)" and "Sushi & Sashimi
  Combo (5pcs Sushi + 6pcs Sashimi + Roll)" are still MISSED golden
  items; a bare "Sushi Combo" (no parenthetical) is still predicted as
  EXTRA, plus a new "Sashimi Combo" EXTRA that doesn't even match the
  gold's "Sushi & Sashimi Combo" wording. Identical failure signature
  to both r1 and r3. This run's overall extraction on this menu was
  also unusually noisy: 29 predicted vs. 18 gold items, item_recall
  0.1667 (worse than r1's 0.278 and r3's 0.333), with many fabricated
  extras unrelated to any of this project's four fixes (Boston Roll,
  Yellowtail Jalapeño Roll, Daikon Radish, Ginger Root, Pickled
  Radish, Oshinko Takuwan). See Findings.
- `uv run evals/run_evals.py --menu km-sushi-lunch --timestamp
  2026-07-25-r4-lunch` ($0.0420): item_recall 0.9474, consistent with
  prior rounds (this menu has no parenthetical-bearing gold items, so
  it does not directly test Fix 1). Tom's hypothesis that Fix 2's
  residual pricing gap would resolve once combo items start matching:
  **not confirmed.** All ten "2 for 17.50" plain numeric-price
  mismatches (Chicken Teriyaki, Garlic Chicken, Sesame Chicken, Spicy
  Chicken, Vegetable Tempura, Lemon Shrimp, California Roll, Spicy
  Tuna Roll, Vegetable Roll, Mixed Tempura) are byte-for-byte unchanged
  from r3's diff. The three upcharge-only items (Salmon Teriyaki,
  Steak Teriyaki, Assorted Sashimi: null price plus verbatim 'ADD$1'/
  'ADD$2') held steady across r3 and r4, confirming that half of Fix 2
  is stable, not a one-off.

### Findings for Tom (report-only, no further edits made)

- **Escalating rather than attempting a third wording iteration**:
  this is now three runs (r1, r3, r4) and two structurally different
  prompt-wording attempts (r3's collision-only test, r4's item-type
  test, the latter verified against the real golden data first) that
  have all failed identically on the same two combo items. Per this
  project's own pattern-recognition rule, a recurring fix should be
  upgraded, not iterated on with more prose. Not attempting a third
  wording variant unilaterally; flagging for a deliberate decision on
  whether prose-only prompt engineering is the right lever here at
  all, versus (for example) a concrete few-shot example embedded in
  the prompt, or accepting this as a known single-restaurant-menu
  limitation and prioritizing R-8/A-1 dataset broadening instead, since
  a second restaurant's combo-naming conventions may look nothing like
  this one's.
- km-sushi-dinner's own-menu extraction quality looks unstable across
  rounds independent of any of the four fixes (item_recall 0.278 in
  r1, 0.333 in r3, 0.167 in r4, with a different, mostly nonoverlapping
  set of hallucinated extra items each time). This menu's photo was
  never flagged in the original consistency-gate visual inspection
  (2026-07-22 BUILDLOG entry) as one of the harder photos, but its
  results are the worst and most volatile in every full-suite report
  to date. Worth a direct visual check of this specific photo before
  investing further prompt effort aimed at it specifically, since a
  hard-to-read source photo would explain volatility no amount of
  prompt wording can fix.
- Tooling gap noticed while trying to diagnose the Fix 1 failure: the
  eval harness reports only name-level diffs (MISSED/EXTRA/mismatch
  summaries), not the raw per-call model JSON. There's no way from the
  committed report alone to tell whether the model dropped the
  parenthetical outright, moved it to `notes` instead of `name`, or
  never recognized the item as a combo at all. A future harness change
  to optionally dump raw predicted JSON per run (behind a flag, so it
  doesn't bloat every report) would make this kind of failure much
  faster to diagnose. Not built this session (out of the two-file
  scope authorized).
- Fix 2's upcharge-only branch (null price, verbatim "+N" text) is
  confirmed stable across two independent runs (r3, r4) with identical
  results; treating that half of the fix as solid, distinct from the
  still-unresolved plain "2 for X" branch.

### Patterns established

- Before broadening a prompt rule's trigger condition, grep every
  golden.json for the literal pattern the new condition is meant to
  catch (here, any parenthetical in a gold `name`), not just the one
  menu named in the evidence. This caught that the rule's other
  cited-in-doc example ("Special A (20pcs)") never actually occurs in
  the real data, avoiding a wasted worry about internal contradiction
  and confirming the broadened rule is a strict, safe widening with
  zero blast radius on the other 8 menus' scoring.
- Two consecutive prompt-wording attempts failing identically on the
  same target, even when the second attempt is verified correct against
  the underlying data (unlike the first), is itself a signal: the
  lever being pulled (prose instruction wording) may not be the
  effective one for this behavior on this model, independent of
  whether the wording is "correct." Recurrence across independently-
  reasoned attempts outweighs confidence in any single attempt's
  internal logic.

### Single next action

Tom's call on: (1) whether to try a structurally different lever for
the combo-parenthetical case (e.g., a literal few-shot example in
system.md) instead of a third prose-only iteration, or accept it as a
known gap pending R-8 dataset broadening; (2) whether a direct visual
check of km-sushi-dinner's source photo is worth doing before any
further prompt investment aimed at that menu, given its volatility
looks independent of any of the four fixes; and (3) whether the
harness is worth extending with an optional raw-JSON dump for faster
future diagnosis.

## Session 2026-08-02: masa-sushi golden intake and raw/ reorganization over 7cc1c5e

Base commit: 7cc1c5e (Restaurant 2 raw photos: paper order sheet, 2
images)

### Authorized scope (verbatim build card)

Commit the already-staged masa-sushi golden and the 14 staged raw/
renames exactly as staged: no add, remove, restage, or reformat of
any kind, no `git add -A`. This is the only unit permitted to run
before any README, SPEC, or sweep edit. Zero spend: no eval run, no
model call, for this or any unit of the session.

### Pre-flight

1. `git rev-parse --short HEAD` prints 7cc1c5e. Pass.
2. `git status --porcelain`: one `A` line for
   evals/menus/masa-sushi/golden.json, exactly 14 `R` lines (12 into
   evals/menus/raw/kuu-sushi/, 2 into evals/menus/masa-sushi/photos/),
   nothing else. Pass.
3. Staged golden is `A`, not `AM`: `git diff --stat` against the
   staged path returns empty, confirming no unstaged delta and a
   determinate commit. Pass.
4. Per the session's baseline note, the two commits already on top
   of 439398e (490deef, 7cc1c5e) are pre-reconciled by oversight and
   get no retrospective entry here and no finding. The 3-line diff
   inside the staged golden itself (notes at n:11 Calamari Leg, n:13
   Soft Shell Crab, n:17 Salmon Collar, lowercased to "inferred prep
   (...)") is Tom applying the INFERRED-token-scope decision directly.
   It is Tom-verified ground truth and ships as staged, unexamined
   further by this session.

### Manifest (files touched)

- evals/menus/masa-sushi/golden.json: new, staged prior to this
  session. 133 items, 8 sections (Appetizers, Sushi & Sashimi,
  Traditional Roll, New House Special Roll, Fresh Roll, Baked Roll,
  Tempura Roll, Simple Roll), restaurant_name "Masa Sushi",
  source_photos IMG_3498 and IMG_3499. Drafted zero-spend and
  human-verified by Tom on 2026-07-27. Tom's review found 11 real
  errors, of which the drafter's own confidence flags caught 2; that
  gap is what drove the lint issue (RAID I-4).
- evals/menus/masa-sushi/photos/1.jpeg, 2.jpeg: renamed from
  evals/menus/raw/restaurant-2/IMG_3498.jpeg and IMG_3499.jpeg. Photo
  order confirmed by Tom, with 1.jpeg as the front page.
- evals/menus/raw/kuu-sushi/IMG_3433.jpeg through IMG_3444.jpeg (12
  files): renamed from evals/menus/raw/ directly, as part of the
  same reorganization, separating KUU's raw provenance photos from
  the flat raw/ drop folder.
- docs/BUILDLOG.md: this entry appended.

### Verification

- `git show --stat HEAD` after the commit: 16 paths total, exactly
  the golden, the 14 renames (12 KUU, 2 masa), and this BUILDLOG
  entry. No phantom paths.
- `git status --porcelain` after the commit: empty.
- No API call made for this unit. Spend: $0.

### Findings for Tom (report-only, no edits made)

None for this unit. The staged content was reviewed only for shape
(item count, section count, photo count, rename count) against the
build card's stated figures and the staged index itself, which it
matches; content correctness of the golden itself is Tom's trust
gate per the build card and was not re-examined.

### Patterns established

- Committing an already-staged, already-reviewed tree as its own
  first unit, before any same-session edit touches other files,
  keeps that commit's diff provably equal to exactly what was staged
  going in. Verified after the fact with `git show --stat` against
  the pre-flight's own porcelain listing, rather than trusted from
  the add step alone.
- Count every rename from the staged index (`git status --porcelain`,
  `git show --stat`), never from a doc's descriptive prose. A first
  draft of this entry took the KUU photo count from
  evals/menus/README.md's "10-page spiral menu" description and wrote
  10 renamed files; the actual figure is 12, because the reorganization
  also moves the 2 happy-hour photos (IMG_3438, IMG_3439) that the
  README describes as a separate artifact. The doc's page count and
  the reorganization's file count answer different questions.

### Single next action

None outstanding for this unit. Sessions B and C are unblocked once
this commit lands; the remaining units of this session (README
convention propagation, SPEC line 58, KUU wrap sweep) proceed
independently and land in a second commit.
