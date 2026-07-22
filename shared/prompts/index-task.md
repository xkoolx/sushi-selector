Index pass. Read the attached menu photo and list every menu item.

For each item return n (1-based, reading order, top to bottom, left column
before right), the item name exactly as printed (normal capitalization),
its section (matching one of your sections entries, or null), the verbatim
price_text, and the parsed numeric price (null when parsing would be a guess).

Also return the restaurant name if it is printed and legible (null otherwise)
and the list of section headers exactly as printed.

Do not extract ingredients in this pass. Do not skip specials boxes or
handwritten inserts. Skip drinks, desserts, and non-food lines. Follow the
system rules for prices, sections, and unreadable regions.
