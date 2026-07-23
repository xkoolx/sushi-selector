# Golden set: organization and labeling conventions

This folder holds the eval golden set. `raw/` is the untouched drop folder of
Tom's original photos (provenance). Each `<slug>/` is one eval menu: ordered
photos under `photos/` and a hand-verified `golden.json`.

## What the 12 photos are

The photos are two restaurants, not the 6 to 10 distinct menus EVALS.md
imagined:

- **KM Sushi**: one large spiral-bound laminated menu, shot across 10 pages
  (IMG_3433 to 3437 and 3440 to 3444). Glare, lamination, several pages rotated
  90 degrees, 300+ items total. Far larger than the 6-photo parse cap, so it is
  split here into page-level eval menus rather than one giant golden.
- **KUU Sushi**: a clean, flat, well-lit 2-page happy-hour menu (IMG_3439 front,
  IMG_3438 special rolls).

Coverage against the EVALS.md wish list: laminated glare (KM, all), lazy angle
and rotation (KM 3433 to 3437, 3440, 3441), dense multi-column (KM nigiri and
special rolls), non-sushi cooked items (KM noodles and kitchen page), and a
clean multi-photo merge (KUU, 2 photos). Not represented: a handwritten
specials board, and true dim-lighting. Flagged for Tom.

## Slug map

| Slug | Source photo(s) | Character |
|---|---|---|
| km-sushi-sashimi | IMG_3433 | sashimi and premium sashimi, rotated, glare |
| km-sushi-nigiri | IMG_3434 | nigiri and basic rolls, dense, rotated, glare |
| km-sushi-special-rolls | IMG_3435, IMG_3436, IMG_3437 | photo-grid specialty rolls; 3-photo merge, 3435/3436 overlap exercises dedupe |
| km-sushi-cold-appetizer | IMG_3440 | cold appetizers, rotated |
| km-sushi-hot-appetizer-salad | IMG_3441 | hot appetizers and salads, rotated |
| km-sushi-noodles-kitchen | IMG_3442 | soup, noodles, katsu, rice bowls (non-sushi) |
| km-sushi-lunch | IMG_3443 | lunch specials and entrees |
| km-sushi-dinner | IMG_3444 | dinner specials and entrees |
| kuu-sushi-happy-hour | IMG_3439, IMG_3438 | clean 2-photo happy-hour menu |

## Labeling conventions (LOCKED, must be mirrored in shared/prompts/system.md)

Locked by Tom on 2026-07-18 (crab and masago/tobiko rules added 2026-07-19).
Goldens share the ingredient conventions the extraction prompt will use, or
ingredient F1 is meaningless. The same rules go into system.md (T-1.3) so
predictions and goldens align:

- **ingredients**: lowercase, singular, substantive fillings only (fish,
  shellfish, vegetables, sauces, cheese). Compound preparations stay whole
  ("spicy tuna" is one ingredient, "stick crab" is one).
- **canonical form is the sushi-menu term, not the English translation**. Use
  `masago` (not "smelt roe") and `tobiko` (not "flying fish roe"). The alias
  table (shared/aliases.json) maps English -> the menu term, never the reverse.
- **crab is never normalized to imitation crab**. "Crab" and "crab meat" stay as
  written; only a literal "krab" or "imitation crab" on the menu maps to
  `imitation crab`.
- **wrap is its own field**, so the wrapper is never an ingredient. Values:
  `nori`, `soy_paper`, `rice_paper`, `none`, `unknown`. Nigiri and sashimi are
  `none`; standard rolls are `nori` unless the menu says otherwise.
- **rice is not listed** as an ingredient. It is the assumed base for nigiri
  and rolls, and listing it everywhere adds noise without signal.
- **is_raw**: `true` if the item contains raw fish (includes seared tuna, which
  is raw at the center), `false` for fully cooked items, `null` when not
  determinable.
- **price / price_text**: `price` is the parsed number; `price_text` is the
  verbatim string. Market price is `price: null`, `price_text: "MP"`. Items
  priced only as a combo keep the combo price.
- **restaurant_name**: `null` unless the name is literally printed in that menu's
  photos. Never infer it from the folder name or context. On multi-photo menus
  the merge takes the first non-null name in photo order (see docs/SPEC.md).
- **beverages excluded**: standalone drinks (sake, beer, cocktails) are not
  labeled; food and sushi items only.
- **ingredients for items whose components are not printed** (e.g. a plain
  "California Roll" with no description) are labeled from standard sushi
  knowledge and must carry the literal token `INFERRED` in that item's `notes`.
  These are the labels most likely to need Tom's correction.

## Status

Nine eval menus, all with hand-labeled goldens. The three specialty-roll pages
are combined into one multi-photo menu (`km-sushi-special-rolls`) to exercise the
merge and dedupe guard; the rest are one menu per page. Tom reviews every golden;
corrections land as follow-up commits.

Human-review snapshot (2026-07-19):

- REVIEWED: `km-sushi-nigiri`, `kuu-sushi-happy-hour`, `km-sushi-dinner`,
  `km-sushi-cold-appetizer`, `km-sushi-lunch`
- PENDING REVIEW: `km-sushi-sashimi`, `km-sushi-special-rolls`,
  `km-sushi-hot-appetizer-salad`, `km-sushi-noodles-kitchen`
