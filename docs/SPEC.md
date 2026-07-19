# SPEC.md: Sushi Selector architecture and contracts

## System overview

```
Phone browser (static PWA on Cloudflare)
   |  1. POST /api/session        (Turnstile token -> signed session token)
   |  2. POST /api/extract/index  (photo -> item names + prices + sections)
   |  3. POST /api/extract/details x N in parallel (photo + item batch ->
   |        ingredients per item)
   v
Cloudflare Worker (thin proxy, TypeScript)
   |  Anthropic Messages API, structured outputs, prompt caching
   v
Anthropic API (model pinned server-side)
```

All orchestration, merging, reconciliation, normalization, filtering, and
rendering happen in the browser. The worker authenticates, validates, rate
limits, and proxies. Rationale: the Workers free plan has no wall-clock
duration limit for HTTP requests and time spent awaiting fetch does not count
toward the 10 ms CPU budget, so a thin I/O-bound proxy is the shape that fits
the platform. The worker must never decode or transform the image; it does a
single JSON.parse of the request body and passes the base64 string through
into the Anthropic payload.

## Repo layout

```
sushi-selector/
  wrangler.jsonc              worker + static assets config
  public/
    index.html
    app.js                    orchestrator state machine
    ui.js                     rendering, filter sheet, cards, Omakase
    preprocess.js             image normalization and downscale
    filters.js                pure filter/sort/search functions
    aliases.js                loads shared/aliases.json
    styles.css
    manifest.webmanifest
    icons/
  src/
    worker.ts                 router and validation
    session.ts                Turnstile siteverify + HMAC token mint/verify
    extract.ts                Anthropic request construction
    ratelimit.ts              per-IP limiter
  shared/
    prompts/
      system.md               shared system prompt and ingredient style guide
      index-task.md           index pass instruction
      details-task.md         details pass instruction template
    schema/
      index.schema.json
      details.schema.json
    aliases.json              deterministic ingredient alias table
  evals/
    run_evals.py              PEP 723, run with uv
    menus/<slug>/photos/1.jpg  (ordered, one or more per menu)
    menus/<slug>/golden.json
    reports/
  .github/workflows/deploy.yml
  docs/                       this handoff package
  .dev.vars                   local secrets, gitignored
```

## Frontend

Vanilla ES modules, mobile-first, no build step. Three screens in one page:
Home (capture plus recent menus from localStorage), Progress, and Menu
(results with filter sheet).

### Mobile web standards (contractual, not aspirational)

The app is phone-first and used at restaurant tables. These are requirements:

- Tap targets at least 44px in both dimensions, including every tri-state
  chip and the sort toggle.
- All text inputs use 16px or larger font size, so iOS Safari never
  auto-zooms the viewport on focus.
- Safe-area insets respected via env() for the sticky search bar, the
  floating Omakase button, and the bottom sheet, so nothing sits under the
  home indicator or notch.
- The filter drawer is a bottom sheet (slides up from the bottom edge, drag
  or tap to dismiss), not a side panel.
- Primary actions live in the thumb zone: capture CTA and Omakase toward the
  bottom of the screen.
- No hover-dependent affordances anywhere; every state is visible at rest.
- Theme follows prefers-color-scheme with a dark palette tuned for dim
  restaurants; prefers-reduced-motion disables the reveal animations.
- Portrait is primary. Desktop gets a centered max-width column and full
  functionality, no separate layout work.

### Capture flow (Home screen)

Batch-first: the user gathers all pages before anything is sent.

- Photo path: a file input with `multiple` and `capture` support lets the
  user select several shots from the camera roll or take photos one after
  another. Selected photos render as removable thumbnails with a running
  count, and a single "Parse N photos" action submits the batch (soft cap 6).
- URL path: a text field accepts a restaurant menu page URL as an alternative
  to photos. A parse job is either photos or a URL, never both.
- Nothing hits the API until the user submits, so Turnstile runs once at
  submit time regardless of how many pages were gathered.

### Image preprocessing (preprocess.js)

iPhone photos arrive as HEIC with EXIF rotation and are far too large. All of
that is fixed in one client-side step per photo:

1. `createImageBitmap(file, { imageOrientation: 'from-image' })` with a
   fallback path drawing through an offscreen canvas if unsupported.
2. Downscale so the longest edge is at most 1568 px.
3. Re-encode with `canvas.toBlob('image/jpeg', 0.8)`.
4. If the result exceeds 1.2 MB, step quality down to 0.7 then 0.6.
5. Base64 encode for transport.

### Multi-photo parses (front and back, multi-page menus)

A parse job accepts 1 to 6 photos (soft cap enforced client-side for cost and
UX; the per-IP rate limit is the server-side backstop). One session token
covers all photos in the job. Rules:

1. Each photo runs its own independent index and details pipeline. The `n`
   index in the schemas is scoped to a single photo, so the client assigns
   every item a global id of `photoIndex + ":" + n` (for example `2:14`) at
   merge time. Details calls always reference items by the per-photo `n` of
   the photo they accompany.
2. Merge order follows photo order, so the rendered menu reads front page
   first, back page second.
3. Dedupe exists for overlapping shots of the same page, not to collapse
   similar dishes. Two items merge only when BOTH conditions hold: fuzzy name
   match (the same token_sort_ratio >= 85 rule the evals use) AND compatible
   price (equal numeric price, or at least one side null). This guard keeps
   "spicy tuna roll" and "spicy tuna hand roll" at different prices from
   collapsing into one item. When merging, keep the record with more
   ingredients and union the notes.
4. Overall progress aggregates across photos: total steps = sum of each
   photo's index plus details batches. The progress screen shows per-photo
   completion (photo 1 of 2, and so on).

## Worker API

All endpoints: JSON in, JSON out, CORS restricted to the deployed origin plus
localhost during dev. Reject bodies over 1.5 MB with 413 before parsing where
the content-length header allows it. Every Anthropic call emits one
structured JSON log line (endpoint, model, token usage including cache
counters, latency, outcome) with Workers observability enabled in wrangler
config, so cost and cache behavior are auditable from logs alone.

### POST /api/session

Request: `{ "turnstileToken": "..." }`
Behavior: verify against Turnstile siteverify with TURNSTILE_SECRET_KEY,
passing an idempotency_key so a network-level retry of the verification is
not rejected as a replay. On
success, mint a session token: `base64url(payload) + "." + base64url(hmacSHA256(payload, SESSION_HMAC_SECRET))`
where payload is `{ "exp": now + 600, "jti": randomId() }`. The token is
deliberately not bound to the client IP: phones on carrier CGNAT or moving
between wifi and cellular change IPs mid-session routinely, and a 10 minute
TTL is long enough for that to happen during a parse. The token itself is
unforgeable and short-lived, and extract rate limiting keys on it, so IP
binding would add breakage without adding protection. Signature checks use
crypto.subtle verify (constant-time comparison), never string equality.
Response: `{ "sessionToken": "...", "exp": 1234567890 }`
Errors: 403 on failed Turnstile verification.

One Turnstile solve authorizes one parse session (all its chunk calls), which
is why the token exists: users solve one invisible challenge per menu, not one
per chunk.

### POST /api/extract/index

Request:
```json
{
  "sessionToken": "...",
  "image": { "media_type": "image/jpeg", "data": "<base64>" }
}
```
Behavior: verify token signature and expiry. Rate limit on the session
token. Build an
Anthropic Messages call: system prompt from shared/prompts/system.md, then a
user message with the image block first (with a prompt-cache breakpoint on the
image block) followed by the index task instruction. Structured output
constrained to index.schema.json. max_tokens 2048.
Response: the model JSON passed through, plus `{ "usage": {...} }`.

### POST /api/extract/details

Request:
```json
{
  "sessionToken": "...",
  "image": { "media_type": "image/jpeg", "data": "<base64>" },
  "items": [ { "n": 12, "name": "Volcano Roll" }, ... ]
}
```
Max 10 items per call, enforced server-side. Same image-first message shape so
the cached image tokens from the index call are reused across every details
call within the cache window. Structured output constrained to
details.schema.json. max_tokens 2048.

### POST /api/extract/url

Request: `{ "sessionToken": "...", "url": "https://..." }`
Behavior: verify token, rate limit, validate the URL (http or https only,
length cap). Build one Anthropic call with the Anthropic web fetch server
tool enabled so Anthropic's infrastructure fetches the page (no CORS, no
fetching arbitrary sites from the worker). The user message contains the URL
and the combined task instruction; structured output is constrained to a
combined schema (the details item shape plus section, price_text, and price
per item, and the sections array). max_tokens 8192. Cap fetched content with
the tool's content token limit parameter. Verify the current web fetch tool
name, beta header, and parameters against live docs at build time.

Text menus fail differently from photos: extraction is more reliable, but
pages can be huge. If the response stops at max_tokens or fails schema
validation, the client falls back to the two-phase flow, passing the same URL
to the index and details endpoints, which accept `url` in place of `image`
and enable the web fetch tool the same way.

Known limitations to design around: menus rendered client-side by JavaScript
and PDF menus behind viewers or auth may come back empty or partial from the
fetch. When a URL parse yields fewer than 5 items, the error UX says so
plainly and suggests snapping a photo of the menu instead, which is the
primary path anyway.

### Reserved for post-MVP

GET and PUT /api/menus/:id backed by Workers KV for share links. Do not
implement; leave the route documented and 404ing.

## Anthropic call specification

- Model: from env var MODEL, default `claude-haiku-4-5-20251001`. Escalate to
  `claude-sonnet-4-6` only if eval gates cannot be met on Haiku after honest
  prompt iteration, and record the decision in the eval report.
- Structured outputs via output_config with a json_schema format. Verify the
  exact current parameter shape and Haiku support against live docs (see
  CLAUDE.md). Fallback if unsupported on the chosen model: define a single
  tool whose input schema is the target schema, set strict true, force it
  with tool_choice, and read the tool_use block.
- Prompt caching: place a cache_control breakpoint on the image content block
  so details calls pay the cached rate for the stable prefix (system prompt
  plus image). Two constraints, both verified against current docs: (a) the
  minimum cacheable prefix on Haiku 4.5 is 4,096 tokens, and prefixes below
  it silently do not cache, no error, so the system prompt in system.md must
  be substantial enough that system plus image clears 4,096 tokens (the style
  guide, alias rules, and schema commentary absorb this naturally; target
  roughly 2,500 or more tokens of genuinely useful extraction guidance in
  system.md, never filler). (b) Cache entries
  become readable only after the first response begins, so a cold parallel
  burst all pays the uncached rate (see orchestration). Every call must log
  cache_creation_input_tokens and cache_read_input_tokens from the usage
  block; zero cache reads on details calls 2 and later means caching is
  broken and must be treated as a bug.
- Retries: one retry on 429/5xx/timeout, handled client-side with jittered
  backoff, because the client owns orchestration state.

## Extraction schemas

shared/schema/index.schema.json:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["sections", "items"],
  "properties": {
    "restaurant_name": { "type": ["string", "null"] },
    "sections": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["name"],
        "properties": { "name": { "type": "string" } }
      }
    },
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["n", "name", "section", "price_text", "price"],
        "properties": {
          "n": { "type": "integer", "description": "1-based reading-order index, stable across passes" },
          "name": { "type": "string" },
          "section": { "type": ["string", "null"] },
          "price_text": { "type": ["string", "null"], "description": "verbatim price text, e.g. '14.95', 'MP', '8/15'" },
          "price": { "type": ["number", "null"], "description": "parsed numeric price, null when ambiguous (market price, multi-size)" }
        }
      }
    }
  }
}
```

shared/schema/details.schema.json:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["items"],
  "properties": {
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["n", "name", "ingredients", "wrap", "is_raw"],
        "properties": {
          "n": { "type": "integer" },
          "name": { "type": "string" },
          "ingredients": {
            "type": "array",
            "items": { "type": "string" },
            "description": "canonical lowercase singular ingredient names per the style guide"
          },
          "wrap": { "enum": ["nori", "soy_paper", "rice_paper", "none", "unknown"] },
          "is_raw": { "type": ["boolean", "null"], "description": "true if the item contains raw fish, null when not determinable" },
          "notes": { "type": ["string", "null"], "description": "modifiers or caveats printed on the menu, e.g. 'add soy paper +2'" }
        }
      }
    }
  }
}
```

The prompt style guide (shared/prompts/system.md) governs ingredient naming:
lowercase, singular, compound preparations kept whole ("spicy tuna" is one
ingredient, not "tuna" plus "spice"), menu spellings normalized ("krab" to
"imitation crab") with the verbatim spelling preserved in notes when it
differs materially. Price edge cases never force a lie: price_text always
carries the verbatim string and price is null whenever parsing would guess.

## Client orchestration state machine (app.js)

States: IDLE, PREPROCESS, INDEX, DETAILS, RECONCILE, READY, ERROR.

- DETAILS fires batch 1 alone to warm the prompt cache (entries only become
  readable after the first response begins), then fans out the remaining
  batches of 8 items with concurrency 3. The few seconds this adds to batch 1
  cuts input cost roughly 5x on every subsequent batch.
- After every transition, the full job object (state, ordered per-photo
  hashes, per-photo index results, per-batch results, attempt counts) is
  persisted to localStorage under `ss:job:<jobHash>`, where jobHash is a hash
  of the ordered per-photo content hashes so a two-photo job resumes as one
  unit. On page load, a job younger than 30 minutes resumes from its last
  completed step, per photo. This covers restaurant wifi drops and accidental
  reloads.
- RECONCILE runs per photo, then the multi-photo merge and dedupe from the
  preprocessing section runs on the reconciled results: every index item n
  must appear in exactly one details result for its photo.
  Missing items get one batch retry; still-missing items render with
  ingredients marked unknown and a subtle flag, never silently dropped. Item
  counts and any flags are surfaced in a collapsible "parse quality" line.
  Tapping a flagged item offers "Retry this item", a single-item details
  call. If that also fails, offer "Fix ingredients": a bottom sheet built to
  minimize typing. Tier one, tappable chips of this menu's canonical
  ingredient vocabulary (the roll almost certainly shares ingredients with
  its neighbors). Tier two, a text input with autocomplete over that same
  vocabulary. Tier three, free text accepted only when the ingredient
  matches nothing on the menu. User-entered ingredients run through the same
  normalization and alias pipeline and join the filter facets. Corrected
  items trade their flag for a subtle "edited" marker, and the parse quality
  line counts them ("41 items, 1 edited"). Corrections persist with the
  cached menu.
- Ingredient normalization then runs deterministically: lowercase, trim,
  simple plural folding, alias table from shared/aliases.json. The facet list
  is built from normalized names; chips show the canonical name.
- Completed menus persist to `ss:menu:<slug>` for the Home screen's recent
  list.

If evals reveal cross-batch ingredient naming inconsistency that the style
guide plus alias table cannot fix, add phase 3b: one text-only normalization
call over the aggregated ingredient vocabulary. Do not build it preemptively.

## Filtering and UI

- Filter drawer: a search box that filters the ingredient chip list itself,
  then tri-state chips (neutral, include, exclude). Include semantics: item
  must contain all included ingredients. Exclude: item must contain none of
  the excluded. Wrap and is_raw render as dedicated chips in the same drawer
  ("no rice paper" is a first-class use case). Filter selections reset every
  session in the MVP; per-restaurant filter memory is a noted post-MVP
  feature, do not build it now.
- Zero-results state: a single friendly line ("No rolls match these filters.
  Loosen one to see more.") and nothing smarter. Suggesting which filter to
  loosen is post-MVP.
- Item search: case-insensitive substring across names and ingredients.
- Sort: menu order (default), price ascending, price descending. Items with
  null price sink to the bottom of price sorts and show price_text.
- Item card: name, price (or price_text), ingredient list with matched filter
  terms highlighted, small badges for raw and wrap.
- Omakase button: visible whenever results exist, zero API calls. Behavior is
  a no-repeat shuffle: build a shuffled queue of the currently filtered item
  ids, each press pops the next one, and the queue rebuilds whenever the
  filter or search state changes. The reveal scrolls the picked card to
  center and marks it with an accent ring and a small "chef's pick" tag (no
  modal, the point is seeing the pick in context). When the queue empties,
  show a light-hearted exhaustion state, for example "The chef has shown you
  everything. Trust your gut, or take a second lap." with two actions: "Second
  lap" (reshuffle) and "Open filters".
- PWA: manifest plus a minimal service worker that caches static assets only.
  Never cache /api responses.

## Security controls (defense in depth)

| Layer | Control | Failure it absorbs |
|---|---|---|
| Financial | Anthropic workspace spend cap ($5/month) | every other control failing at once |
| Bot | Turnstile, verified server-side once per session | scripted abuse of the public endpoint |
| Endpoint auth | HMAC session token, 10 min TTL | replay and direct curl of extract endpoints |
| Throughput | native rate limit binding: per-token on extract (6 per 60s), per-IP on session issuance (3 per 60s) | one abusive client |
| Input | 1.5 MB payload cap, media_type allowlist, max 10 items per details call | oversized or malformed requests |
| Blast radius | model and max_tokens pinned server-side, key scoped to a dedicated workspace | prompt or parameter injection from the client |

Rate limiter implementation: use Cloudflare's native ratelimit binding (GA
since September 2025, free). Constraint: the period must be exactly 10 or 60
seconds, so limits are expressed per 60s, not per 10 minutes. Two namespaces:
extract endpoints keyed on the session token at 6 per 60s, and /api/session
keyed on client IP at 3 per 60s. Note the documented accuracy caveat: the
binding is permissive and eventually consistent with per-location counters,
which is fine here because the spend cap, not the rate limiter, is the
control that guarantees the blast radius.

CORS: allow only the production origin and http://localhost:8787 style dev
origins. Origin checks are advisory (trivially spoofed outside browsers),
which is exactly why the session token exists.

## Error UX

Every failure state gets a human message and a retry affordance: Turnstile
failed (retry), parse timeout (retry batch), too few items found ("this photo
may be too blurry or cropped; try retaking with the full menu page in
frame"), spend cap or rate limit (429: "the kitchen is slammed, try again in
a bit"). Never show raw error JSON to the user.
