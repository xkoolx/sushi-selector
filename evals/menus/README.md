# Golden set: organization and labeling conventions

This folder holds the eval golden set. `raw/` is the untouched drop folder of
the reviewer's original photos (provenance). Each `<slug>/` is one eval menu: ordered
photos under `photos/` and a hand-verified `golden.json`.

## What the 12 photos are

The photos are one restaurant, KUU SUSHI, captured as two menu artifacts
rather than the 6 to 10 distinct menus EVALS.md imagined:

- **KUU SUSHI**: one large spiral-bound laminated menu, shot across 10 pages
  (IMG_3433 to 3437 and 3440 to 3444). Glare, lamination, several pages rotated
  90 degrees, 300+ items total. Far larger than the 6-photo parse cap, so it is
  split here into page-level eval menus rather than one giant golden. (The logo
  font reads ambiguously as "KM", which the initial file creation propagated
  into the folder slugs; those `km-sushi-` slugs are kept stable deliberately.)
- **KUU SUSHI happy hour**: a clean, flat, well-lit 2-page happy-hour menu
  (IMG_3439 front, IMG_3438 special rolls).

Coverage against the EVALS.md wish list: laminated glare (KUU, all), lazy angle
and rotation (KUU 3433 to 3437, 3440, 3441), dense multi-column (KUU nigiri and
special rolls), non-sushi cooked items (KUU noodles and kitchen page), and a
clean multi-photo merge (KUU, 2 photos). Not represented: a handwritten
specials board, and true dim-lighting. Flagged for the reviewer.

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

Locked by Tom on 2026-07-18 (crab and masago/tobiko rules added 2026-07-19; ten
additional conventions locked 2026-08-02, four of them amending text already in
this section rather than standing alongside it).
Goldens share the ingredient conventions the extraction prompt will use, or
ingredient F1 is meaningless. The same rules go into system.md (T-1.3) so
predictions and goldens align:

- **one golden item per printed row**. A row printing two names at one price
  (a dual-name row) is one item, carrying the full printed name as written. A
  menu printing two rows at two prices is two items. This rule is uniform even
  where menus differ in which pattern they print. Never split a dual-name row
  for filtering: facets come from `ingredients`, not from `name`.
- **ingredients**: lowercase, singular, substantive fillings only (fish,
  shellfish, vegetables, sauces, cheese). Compound preparations stay whole
  ("spicy tuna" is one ingredient, "stick crab" is one). Seared-fish compounds
  stay whole too (seared tuna, seared pepper salmon): searing marks fish raw at
  the center, so the word carries is_raw evidence and is never stripped.
- **preparation methods strip from ingredient names**: chopped scallop is
  scallop, deep fried eel is eel, deep fried tofu is tofu. Stated principle, as
  rationale only: a preparation that produces a materially different food
  stays whole; a cooking or cutting method strips. Enforcement is an explicit,
  closed exception list, never model reasoning from the principle: **pickle,
  mayo, fried garlic, fried onion, tempura, smoked, cajun**. "Smoked" stays
  whole as the full compound ("smoked salmon", never "salmon"). Tempura is on
  the list for allergy reasons: the batter is wheat, a US-2 exclusion-filter
  concern. "Mayo" is preferred over "mayo sauce". General test (formalized
  from the 2026-07-22 sweep, kept as the diagnostic behind the list and
  subordinate to it): a preparation-method compound that recurs across items
  as a named garnish reclassifies from "strip" to "canonical ingredient" (the
  same test that put pickle and mayo on the list), rather than defaulting to
  stripping. List membership changes only through a documented convention
  change, never ad hoc during labeling. Ingredients are transcribed as
  printed, never renamed to a category (nothing is ever labeled "crispy
  topping").
- **canonical form is the sushi-menu term, not the English translation**, for
  the roe family (masago, tobiko, ikura). Use `masago` (not "smelt roe"),
  `tobiko` (not "flying fish roe"), and `ikura` (not "salmon roe"). For the roe
  family the alias table (shared/aliases.json) maps English -> the menu term,
  never the reverse. Elsewhere the plain English filtering term is canonical:
  `egg`, not `tamago` (tamago is a preparation of egg and aliases inward to egg).
- **crab is never normalized to imitation crab**. "Crab" and "crab meat" stay as
  written; only a literal "krab" or "imitation crab" on the menu maps to
  `imitation crab`.
- **species and type qualifiers stay as printed on that item**, and are never
  imported from other items. An item printing "deep fried eel" yields eel even
  when the same menu prints "freshwater eel" elsewhere. This mirrors the crab
  rule: never add specificity the menu did not print for that item. Downstream
  unification of variants (freshwater eel to eel) belongs to shared/aliases.json,
  not the labels, governed by the alias direction rule below.
- **anatomical parts** (salmon skin, salmon collar, yellowtail collar) **stay
  whole and are never aliased to the base fish**. Aliasing them away destroys a
  distinction diners actually use. Family-level allergy filtering (treating
  salmon skin as "contains salmon") is post-MVP and solves the opposite
  direction from ingredient-level aliasing; it does not justify folding these
  in now.
- **alias direction rule**: aliases unify synonyms for the same food. They
  never unify distinct foods. Anatomical parts (the rule above), preparations,
  and distinct species are distinct foods and stay canonical. For genuine
  synonyms, direction runs toward the form the menus actually print most,
  measured across the golden set. Worked examples: `masago` wins over "smelt
  roe" because masago is the printed form; `eel` wins over "freshwater eel" (10
  printed items vs. 7); `anago` is a different species from `unagi` and stays
  canonical, it is not an alias target; `katsuo bushi` is the printed form and
  "bonito flake" folds into it. This is the governing principle behind the
  roe-family rule above and the freshwater-eel-to-eel unification: both already
  follow it, stated here explicitly for the first time.
- **vague collective terms live in notes only**, never the ingredients array.
  Terms like "various vegetables", "assorted sashimi", "seafood", and "japanese
  vegetable" carry no filtering signal, so they are recorded in `notes` and left
  out of `ingredients`.
- **wrap is its own field, with a closed enum**: `nori`, `soy_paper`,
  `rice_paper`, `none`, `unknown`, and the enum never grows. Nigiri and sashimi
  are `none`; standard rolls are `nori` unless the menu says otherwise.
  Specialty physical wraps (cucumber, avocado, fish) use `wrap: none`, name the
  wrapper in a note as before, and also name the wrapper in `ingredients`:
  since the enum is closed and cannot carry a specialty wrapper as its own
  value, `ingredients` is the only place the fact survives as a filterable
  attribute.
- **rice is not listed** as an ingredient. It is the assumed base for nigiri
  and rolls, and listing it everywhere adds noise without signal. **Crispy
  rice is a documented carve-out**: it is a named essential preparation, not a
  roll base, and is transcribed as "crispy rice", never shortened to "rice".
- **is_raw**: `true` if the item contains raw fish (includes seared tuna, which
  is raw at the center), `false` for fully cooked items, `null` when not
  determinable. Shrimp and octopus default to `false` (cooked) absent menu
  evidence to the contrary. The printed item name counts as menu evidence:
  sweet shrimp (amaebi) and items sold as live default to raw. is_raw tracks
  whether the item as served contains raw fish, not whether every component is
  raw (a fried amaebi head changes nothing). An explicit cooking method applied
  to the whole item in its printed name (grilled, fried, boiled) overrides the
  live default.
- **price / price_text**: `price` is the parsed number; `price_text` is the
  verbatim string. Market price is `price: null`, `price_text: "MP"`. Items
  priced only as a combo keep the combo price.
- **combo choice sets**: two-roll dinner combos merge both rolls' inferred
  ingredients into the item; large choice sets (lunch's 11 rolls) stay notes
  only; small protein choice sets (roughly 5 options or fewer) enumerate all
  options in `ingredients`. Stated explicitly as its own rule, consistent with
  the above: **small choice sets are included in `ingredients`; large choice
  sets stay in `notes` only.**
- **conditional ingredients** (for example, additions offered only during
  happy hour) **are included in `ingredients`**, not deferred to `notes`.
  Under-listing is the expensive error for exclusion filtering: a diner
  filtering out an allergen needs to see it even when it is conditional.
- **restaurant_name**: `null` unless the name is literally printed in that menu's
  photos. Never infer it from the folder name or context. On multi-photo menus
  the merge takes the first non-null name in photo order (see docs/SPEC.md).
- **beverages excluded**: standalone drinks (sake, beer, cocktails) are not
  labeled; food and sushi items only.
- **ingredients for items whose components are not printed** (e.g. a plain
  "California Roll" with no description) are labeled from standard sushi
  knowledge and must carry the literal token `INFERRED` in that item's `notes`.
  These are the labels most likely to need the reviewer's correction. The
  `INFERRED` token's scope is ingredient-only; a prep inference (guessing a
  cooking method the menu didn't print) is written as lowercase prose in
  `notes` instead, never with the `INFERRED` token. Two forms, by how much of
  the item is inferred: when an item mixes printed and inferred ingredients,
  `notes` names exactly the inferred ones, itemized, for example `INFERRED:
  crab, avocado, cucumber`. The whole-list form, `INFERRED ingredients`, is
  reserved for items where every ingredient was inferred.

## Status

Nine eval menus, all with hand-labeled goldens. The three specialty-roll pages
are combined into one multi-photo menu (`km-sushi-special-rolls`) to exercise the
merge and dedupe guard; the rest are one menu per page. The reviewer reviews
every golden; corrections land as follow-up commits.

Human-review snapshot (2026-07-20):

- REVIEWED: `km-sushi-nigiri`, `kuu-sushi-happy-hour`, `km-sushi-dinner`,
  `km-sushi-cold-appetizer`, `km-sushi-lunch`, `km-sushi-sashimi`,
  `km-sushi-special-rolls`, `km-sushi-hot-appetizer-salad`,
  `km-sushi-noodles-kitchen`
