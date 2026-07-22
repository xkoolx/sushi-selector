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
| km-sushi-special-rolls-1 | IMG_3435 | photo-grid specialty rolls, printed ingredients |
| km-sushi-special-rolls-2 | IMG_3436 | photo-grid specialty rolls (overlaps -1) |
| km-sushi-special-rolls-3 | IMG_3437 | tempura/fried/no-rice/vegetarian rolls |
| km-sushi-cold-appetizer | IMG_3440 | cold appetizers, rotated |
| km-sushi-hot-appetizer-salad | IMG_3441 | hot appetizers and salads, rotated |
| km-sushi-noodles-kitchen | IMG_3442 | soup, noodles, katsu, rice bowls (non-sushi) |
| km-sushi-lunch | IMG_3443 | lunch specials and entrees |
| km-sushi-dinner | IMG_3444 | dinner specials and entrees |
| kuu-sushi-happy-hour | IMG_3439, IMG_3438 | clean 2-photo happy-hour menu |

## Labeling conventions (draft, to be reconciled with shared/prompts/system.md)

Goldens must share the ingredient conventions the extraction prompt will use, or
ingredient F1 is meaningless. These are the draft rules; the same rules go into
system.md (T-1.3) so predictions and goldens align:

- **ingredients**: lowercase, singular, substantive fillings only (fish,
  shellfish, vegetables, sauces, cheese). Compound preparations stay whole
  ("spicy tuna" is one ingredient, "imitation crab" is one).
- **wrap is its own field**, so the wrapper is never an ingredient. Values:
  `nori`, `soy_paper`, `rice_paper`, `none`, `unknown`. Nigiri and sashimi are
  `none`; standard rolls are `nori` unless the menu says otherwise.
- **rice is not listed** as an ingredient. It is the assumed base for nigiri
  and rolls, and listing it everywhere adds noise without signal. (Open
  decision for Tom: keep rice out, or list it. Whatever we pick, system.md and
  every golden must match.)
- **is_raw**: `true` if the item contains raw fish (includes seared tuna, which
  is raw at the center), `false` for fully cooked items, `null` when not
  determinable.
- **price / price_text**: `price` is the parsed number; `price_text` is the
  verbatim string. Market price is `price: null`, `price_text: "MP"`. Items
  priced only as a combo keep the combo price.
- **ingredients for items whose components are not printed** (e.g. a plain
  "California Roll" with no description) are labeled from standard sushi
  knowledge. These are the labels most likely to need Tom's correction.

## Convention decisions surfaced during drafting (for Tom)

1. **Combo-priced entrees**: when a page prices entrees only through a
   "Choose 2 Items" header, the header is one item carrying the printed
   price and each entree is price null with a note. Rationale: the
   extraction prompt forbids carrying a price over from a neighboring
   line, so a golden that stamps the combo price on every entree would
   fail a correct extractor. The lunch and dinner goldens both follow
   this; overrule in both places at once if you disagree.
2. **Aliases are context free at runtime**, so context sensitive entries
   were removed from shared/aliases.json ("seaweed" to "nori" broke
   seaweed salad, "egg" to "egg omelet" broke egg batter components).
   Wrap-specific ("seaweed paper") and dish-specific ("tamago") aliases
   remain.
3. **Salad dressings and broths** are labeled as ingredients when
   printed (house dressing, soy sauce broth). Confirm or strike.
4. **is_raw and roe**: items whose only raw component is roe (salmon
   skin salad with smelt roe) are labeled is_raw true. Confirm.
5. **Printed rice**: "seasoned rice" printed as a named component of
   chirashi bowls is listed, while assumed rice under nigiri and rolls
   stays unlisted. Confirm the distinction.

## Status

All 11 menus drafted and awaiting Tom's review (~224 scored items):
`km-sushi-sashimi` (12), `km-sushi-nigiri` (41), `kuu-sushi-happy-hour` (48),
`km-sushi-cold-appetizer` (8), `km-sushi-hot-appetizer-salad` (18),
`km-sushi-noodles-kitchen` (15), `km-sushi-lunch` (20), `km-sushi-dinner`
(19), `km-sushi-special-rolls-1` (14), `km-sushi-special-rolls-2` (16 plus 3
unreadable edge partials kept unscored), `km-sushi-special-rolls-3` (14).

The eight new drafts were produced with a zoomed crop pass (upright rotation,
per-section 2x crops, contrast boost against glare) and hand-labeled item by
item, never via the extraction pipeline. Each carries its own uncertainty in
notes: INFERRED fillings, price uncertain (glare), verbatim menu spellings,
and typos preserved as printed. Review priority: the notes-flagged entries
and the five convention decisions above.
