// Pure filter, sort, and search functions. No DOM, no side effects.
// Compose via applyAll(items, state) for the results pipeline.

export function filterItems(items, { include, exclude, wrapExclude, rawFilter }) {
  return items.filter((item) => {
    const ings = (item.ingredients ?? []).map((i) => i.toLowerCase());

    if (include && include.size > 0) {
      for (const ing of include) {
        if (!ings.some((i) => i.includes(ing))) return false;
      }
    }

    if (exclude && exclude.size > 0) {
      for (const ing of exclude) {
        if (ings.some((i) => i.includes(ing))) return false;
      }
    }

    if (wrapExclude && wrapExclude.size > 0) {
      if (item.wrap && item.wrap !== "unknown" && wrapExclude.has(item.wrap)) return false;
    }

    if (rawFilter === "raw" && item.is_raw !== true) return false;
    if (rawFilter === "cooked" && item.is_raw === true) return false;

    return true;
  });
}

export function searchItems(items, query) {
  if (!query || !query.trim()) return items;
  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    if (item.name.toLowerCase().includes(q)) return true;
    if ((item.ingredients ?? []).some((i) => i.toLowerCase().includes(q))) return true;
    return false;
  });
}

export function sortItems(items, mode) {
  if (mode === "menu") return items;
  const sorted = [...items];
  const dir = mode === "price-asc" ? 1 : -1;
  sorted.sort((a, b) => {
    const ap = a.price;
    const bp = b.price;
    if (ap === null && bp === null) return 0;
    if (ap === null) return 1;
    if (bp === null) return -1;
    return (ap - bp) * dir;
  });
  return sorted;
}

export function applyAll(items, { include, exclude, wrapExclude, rawFilter, search, sort }) {
  let result = filterItems(items, { include, exclude, wrapExclude, rawFilter });
  result = searchItems(result, search);
  result = sortItems(result, sort || "menu");
  return result;
}

export function buildFacets(items) {
  const ingredientCounts = {};
  const wrapCounts = {};
  let rawCount = 0;
  let cookedCount = 0;

  for (const item of items) {
    for (const ing of item.ingredients ?? []) {
      const key = ing.toLowerCase();
      ingredientCounts[key] = (ingredientCounts[key] || 0) + 1;
    }
    if (item.wrap && item.wrap !== "unknown" && item.wrap !== "none") {
      wrapCounts[item.wrap] = (wrapCounts[item.wrap] || 0) + 1;
    }
    if (item.is_raw === true) rawCount++;
    if (item.is_raw === false) cookedCount++;
  }

  const ingredients = Object.entries(ingredientCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  const wraps = Object.entries(wrapCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  return { ingredients, wraps, rawCount, cookedCount };
}
