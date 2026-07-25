# URL pass task instruction

This is the combined URL pass, used when the source is a fetched menu page
rather than a photo. You have been given a URL to fetch via the web fetch
tool, and, once fetched, its content stands in for the photo used in the
photo-based passes: read it the same way, in the same reading order, with the
same legibility discipline (if fetched content is truncated, garbled, or
clearly incomplete for a section, do not invent items or prices to fill the
gap).

Because a fetched menu page rarely benefits from being split into an index
pass and a separate details pass the way a photo does, this pass combines
both in one call. Produce a single JSON object that validates against
`shared/schema/url.schema.json`:

- `restaurant_name`: the restaurant's name, only if it is literally printed
  somewhere on the fetched page, per the style guide's restaurant_name rule.
  Otherwise `null`.
- `sections`: the ordered list of section headers found on the page, each an
  object with just a `name` string, or an empty array if the page has no
  printed section structure.
- `items`: every menu item found, in reading order, each with all of:
  - `n`: a 1-based reading-order index, stable for this page.
  - `name`: the item name as printed.
  - `section`: the section this item falls under, matching an entry in
    `sections`, or `null`.
  - `price_text`: the verbatim price string, or `null` if none is printed or
    parsing would guess.
  - `price`: the parsed numeric price, or `null` per the style guide's price
    rules.
  - `ingredients`: the canonical ingredient list for this item, per every
    rule in the style guide's ingredient naming section.
  - `wrap`: exactly one of `nori`, `soy_paper`, `rice_paper`, `none`, or
    `unknown`.
  - `is_raw`: `true`, `false`, or `null`, per the style guide's is_raw rules.
  - `notes`: modifiers, caveats, vague collective descriptions, or combo
    choice-set descriptions, or `null`. Carry the literal token `INFERRED`
    when ingredients were inferred from standard sushi knowledge rather than
    printed on the page.

Skip beverage-only lines entirely. Apply the same combo and choice-set
handling, vague-collective-term handling, and species-qualifier locality
rules described in the system prompt's style guide, exactly as a photo-based
details pass would. Return only the JSON object, no commentary, no markdown
fences.
