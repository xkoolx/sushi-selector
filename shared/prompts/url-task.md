URL pass. Fetch the restaurant menu page at the URL below with the web fetch
tool, then extract every menu item in a single combined pass.

For each item return n (1-based, order of appearance on the page), the item
name, its section (or null), verbatim price_text, parsed numeric price (null
when parsing would be a guess), ingredients, wrap, is_raw, and notes, all per
the system style guide. Also return the restaurant name if stated (null
otherwise) and the list of section names.

Extract only items that are part of the menu itself. Skip navigation, reviews,
drinks, desserts, and boilerplate. If the page content is partial or clearly
JavaScript-rendered and yields few items, extract what is actually present
rather than inventing plausible items.

Menu URL:
