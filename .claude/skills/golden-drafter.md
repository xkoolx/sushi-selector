---
name: golden-drafter
description: Reads menu photos and drafts golden.json files for the eval harness. Use when new photos land in evals/menus/raw/ or when a new menu slug needs a golden. This is the most safety-critical skill in the project because incorrect goldens corrupt the eval gates.
---

Goal: produce hand-labeled golden.json files that the eval harness scores against. The hard rule from EVALS.md: never generate goldens by running the extraction pipeline or its prompts. A system must not grade its own homework.

Process:

1. Inventory: check evals/menus/raw/ for unsorted photos. Check existing slugs under evals/menus/ for any missing golden.json files.

2. Organize (if raw photos are present):
   - Group photos by restaurant (use visual clues: logo, style, naming patterns).
   - Create slug directories: evals/menus/<slug>/photos/
   - Name photos 1.jpg, 2.jpg in reading order (front page first).
   - Slug format: lowercase, hyphens, restaurant-name-section (e.g., km-sushi-nigiri, kuu-sushi-happy-hour).

3. Draft golden.json for each menu by reading the photos directly:
   - Read each photo carefully, item by item, zoomed in.
   - Use fresh eyes. Do not reference the extraction pipeline prompts, schemas, or system.md while drafting. The golden is an independent ground truth.
   - Schema per item (matches SPEC.md merged result shape):
     ```json
     {
       "n": 1,
       "name": "Item Name",
       "section": "Section Name or null",
       "price_text": "14.95",
       "price": 14.95,
       "ingredients": ["ingredient one", "ingredient two"],
       "wrap": "nori | soy_paper | rice_paper | none | unknown",
       "is_raw": true | false | null,
       "notes": "any menu caveats, modifiers, or serving details"
     }
     ```
   - Wrap the items array in: `{ "restaurant_name": "...", "source_photos": ["filename_stem"], "items": [...] }`
   - For multi-photo menus: the items array covers ALL photos merged. Note source_photos for traceability.

4. Rules (non-negotiable):
   - Ingredients: only what is explicitly stated or unambiguously visible on the menu. Never infer ingredients from the dish name alone. "Spicy Tuna Roll" gets ["spicy tuna"] as one compound ingredient, not ["tuna", "spice"]. If the menu does not list ingredients, use only the primary protein/component.
   - Prices: price_text is always the verbatim string from the menu. price is the parsed number, or null when ambiguous (market price, multi-size like "8/15").
   - is_raw: true for raw fish items, false for cooked, null when the menu does not make it clear.
   - wrap: only set based on what the menu indicates. Default to "unknown" rather than guessing.
   - notes: preserve serving details ("2 pcs"), Japanese names ("ebi"), preparation notes ("seared outside"), and any modifiers visible on the menu.
   - Normalize ingredient names to lowercase singular. Use canonical names ("imitation crab" not "krab"), but note the original spelling in notes if it differs materially.

5. Output: the golden.json file plus a summary line per menu (slug, item count, any items where confidence is low and Tom should double-check).

6. After drafting: remind Tom that he must review and correct every golden before it counts. The golden is not valid until Tom signs off.

No em dashes in output (repo convention).
