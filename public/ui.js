// UI rendering, screen management, filter sheet, Omakase, and fix flow.
// No orchestration logic: app.js owns state transitions and API calls.

import { applyAll, buildFacets } from "/filters.js";
import { normalizeIngredient } from "/app.js";

const $ = (id) => document.getElementById(id);

// ── State ──

let currentJob = null;
let currentItems = [];
let filteredItems = [];
let facets = null;

const filterState = {
  include: new Set(),
  exclude: new Set(),
  wrapExclude: new Set(),
  rawFilter: "all",
  search: "",
  sort: "menu",
};

let omakaseQueue = [];
let omakasePickId = null;
let fixingItem = null;
let fixIngredients = [];

// ── Screen management ──

function showScreen(name) {
  for (const s of document.querySelectorAll(".screen-section")) {
    s.hidden = s.id !== `screen-${name}`;
  }
  $("error-overlay").hidden = true;
  $("omakase-exhausted").hidden = true;
  $("sort-menu").hidden = true;
}

export function showHome() {
  showScreen("home");
  renderRecentMenus();
  resetCapture();
}

export function showProgress(job) {
  currentJob = job;
  showScreen("progress");
}

export function showResults(job, { preserveFilters = false } = {}) {
  currentJob = job;
  currentItems = job.result.items.map((item, i) => ({
    ...item,
    _ingredients: (item.ingredients ?? []).map(normalizeIngredient),
    _index: i,
  }));
  facets = buildFacets(currentItems);
  showScreen("results");
  $("results-title").textContent = job.result.restaurant_name || "Menu";
  $("omakase-btn").hidden = false;
  if (!preserveFilters) resetFilters();
  renderResults();
}

export function showError(message) {
  $("error-msg").textContent = message;
  $("error-overlay").hidden = false;
}

// ── Progress rendering ──

export function updateProgress(job) {
  currentJob = job;
  const stateEl = $("progress-state");
  const detailEl = $("progress-detail");
  const fillEl = $("progress-fill");
  const photosEl = $("progress-photos");

  if (!stateEl) return;

  const labels = {
    PREPROCESS: "Preparing photos...",
    INDEX: "Reading the menu...",
    DETAILS: "Checking ingredients...",
    RECONCILE: "Merging results...",
  };
  stateEl.textContent = labels[job.state] || job.state;

  const photos = job.photos ?? [];
  const current = job.currentPhoto ?? 0;
  photosEl.innerHTML = "";
  for (let i = 0; i < photos.length; i++) {
    const img = document.createElement("div");
    img.className = "progress-photo";
    if (i < current) img.classList.add("progress-photo--done");
    else if (i === current) img.classList.add("progress-photo--active");
    photosEl.appendChild(img);
  }

  let totalSteps = 0;
  let doneSteps = 0;
  for (let i = 0; i < photos.length; i++) {
    const ps = job.photoStates?.[i];
    const batches = ps?.totalBatches || 1;
    totalSteps += 1 + batches;
    if (ps?.index) doneSteps += 1;
    doneSteps += ps?.completedBatches || 0;
  }
  const pct = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;
  fillEl.style.width = `${pct}%`;

  const ps = job.photoStates?.[current];
  const batchInfo = ps?.totalBatches
    ? ` (batch ${ps.completedBatches || 0} of ${ps.totalBatches})`
    : "";
  const photoInfo = photos.length > 1
    ? `Photo ${current + 1} of ${photos.length}${batchInfo}`
    : batchInfo.trim();
  detailEl.textContent = photoInfo;
}

// ── Results rendering ──

function renderResults() {
  filteredItems = applyAll(currentItems, {
    ...filterState,
    search: filterState.search,
    sort: filterState.sort,
  });

  const list = $("item-list");
  list.innerHTML = "";
  $("empty-state").hidden = filteredItems.length > 0;

  for (const item of filteredItems) {
    list.appendChild(renderCard(item));
  }

  renderParseQuality();
  updateFilterBadge();
  rebuildOmakaseQueue();
}

function renderCard(item) {
  const card = document.createElement("div");
  card.className = "item-card";
  card.setAttribute("role", "listitem");
  card.dataset.id = item.id;

  if (item.flagged) card.classList.add("item-card--flagged");
  if (item.id === omakasePickId) card.classList.add("item-card--picked");

  const top = document.createElement("div");
  top.className = "item-card__top";

  const name = document.createElement("div");
  name.className = "item-card__name";
  name.textContent = item.name;

  const price = document.createElement("div");
  if (item.price !== null) {
    price.className = "item-card__price";
    price.textContent = `$${item.price.toFixed(2)}`;
  } else if (item.price_text) {
    price.className = "item-card__price item-card__price--null";
    price.textContent = item.price_text;
  }

  top.appendChild(name);
  top.appendChild(price);
  card.appendChild(top);

  if (item._ingredients.length > 0) {
    const ings = document.createElement("div");
    ings.className = "item-card__ingredients";
    ings.innerHTML = formatIngredients(item._ingredients);
    card.appendChild(ings);
  }

  const badges = buildBadges(item);
  if (badges.length > 0) {
    const row = document.createElement("div");
    row.className = "item-card__badges";
    for (const b of badges) row.appendChild(b);
    card.appendChild(row);
  }

  if (item.flagged && !item.edited) {
    const actions = document.createElement("div");
    actions.className = "item-card__actions";

    const retryBtn = document.createElement("button");
    retryBtn.className = "item-card__action-btn";
    retryBtn.textContent = "Retry";
    retryBtn.type = "button";
    retryBtn.addEventListener("click", () => handleRetryItem(item));

    const fixBtn = document.createElement("button");
    fixBtn.className = "item-card__action-btn";
    fixBtn.textContent = "Fix ingredients";
    fixBtn.type = "button";
    fixBtn.addEventListener("click", () => openFixSheet(item));

    actions.appendChild(retryBtn);
    actions.appendChild(fixBtn);
    card.appendChild(actions);
  }

  return card;
}

function formatIngredients(ingredients) {
  const q = filterState.search.trim().toLowerCase();
  const includeSet = filterState.include;
  return ingredients
    .map((ing) => {
      const lower = ing.toLowerCase();
      const highlight =
        (q && lower.includes(q)) ||
        (includeSet.size > 0 && includeSet.has(lower));
      return highlight ? `<mark>${esc(ing)}</mark>` : esc(ing);
    })
    .join(", ");
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildBadges(item) {
  const badges = [];
  if (item.is_raw === true) {
    badges.push(makeBadge("Raw", "badge--raw"));
  } else if (item.is_raw === false) {
    badges.push(makeBadge("Cooked", "badge--cooked"));
  }
  if (item.wrap && item.wrap !== "unknown" && item.wrap !== "none") {
    const label = item.wrap.replace(/_/g, " ");
    badges.push(makeBadge(label, "badge--wrap"));
  }
  if (item.flagged && !item.edited) {
    badges.push(makeBadge("Needs review", "badge--flagged"));
  }
  if (item.edited) {
    badges.push(makeBadge("Edited", "badge--edited"));
  }
  if (item.id === omakasePickId) {
    badges.push(makeBadge("Chef's pick", "badge--pick"));
  }
  return badges;
}

function makeBadge(text, cls) {
  const el = document.createElement("span");
  el.className = `badge ${cls}`;
  el.textContent = text;
  return el;
}

function renderParseQuality() {
  const panel = $("parse-quality");
  const toggle = $("quality-toggle");
  const total = currentItems.length;
  const flagged = currentItems.filter((i) => i.flagged && !i.edited).length;
  const edited = currentItems.filter((i) => i.edited).length;

  if (flagged === 0 && edited === 0) {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;
  const parts = [`${total} items`];
  if (flagged > 0) parts.push(`${flagged} flagged`);
  if (edited > 0) parts.push(`${edited} edited`);
  toggle.textContent = parts.join(", ");
}

// ── Filter sheet ──

function openFilterSheet() {
  renderFilterChips();
  $("filter-sheet").hidden = false;
  $("chip-search").value = "";
  $("chip-search").focus();
}

function closeFilterSheet() {
  $("filter-sheet").hidden = true;
  renderResults();
}

function renderFilterChips() {
  if (!facets) return;
  const chipSearch = ($("chip-search").value || "").toLowerCase();

  const rawRow = $("raw-chip-row");
  rawRow.innerHTML = "";
  rawRow.appendChild(makeFilterChip("Raw fish", () => {
    filterState.rawFilter =
      filterState.rawFilter === "raw" ? "all" :
      filterState.rawFilter === "all" ? "cooked" : "all";
    renderFilterChips();
  }, filterState.rawFilter === "raw" ? "include" :
     filterState.rawFilter === "cooked" ? "exclude" : "neutral"));
  rawRow.appendChild(makeFilterChip("Cooked", () => {
    filterState.rawFilter =
      filterState.rawFilter === "cooked" ? "all" :
      filterState.rawFilter === "all" ? "raw" : "all";
    renderFilterChips();
  }, filterState.rawFilter === "cooked" ? "include" :
     filterState.rawFilter === "raw" ? "exclude" : "neutral"));

  const wrapRow = $("wrap-chip-row");
  wrapRow.innerHTML = "";
  for (const w of facets.wraps) {
    const label = w.name.replace(/_/g, " ");
    if (chipSearch && !label.includes(chipSearch)) continue;
    const state = filterState.wrapExclude.has(w.name) ? "exclude" : "neutral";
    wrapRow.appendChild(makeFilterChip(`${label} (${w.count})`, () => {
      if (filterState.wrapExclude.has(w.name)) {
        filterState.wrapExclude.delete(w.name);
      } else {
        filterState.wrapExclude.add(w.name);
      }
      renderFilterChips();
    }, state));
  }

  const ingRow = $("ingredient-chip-row");
  ingRow.innerHTML = "";
  for (const ing of facets.ingredients) {
    if (chipSearch && !ing.name.includes(chipSearch)) continue;
    const state = filterState.include.has(ing.name) ? "include"
      : filterState.exclude.has(ing.name) ? "exclude" : "neutral";
    ingRow.appendChild(makeFilterChip(`${ing.name} (${ing.count})`, () => {
      cycleChip(ing.name);
      renderFilterChips();
    }, state));
  }
}

function makeFilterChip(label, onClick, state) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "chip";
  if (state === "include") btn.classList.add("chip--include");
  if (state === "exclude") btn.classList.add("chip--exclude");
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function cycleChip(name) {
  if (filterState.include.has(name)) {
    filterState.include.delete(name);
    filterState.exclude.add(name);
  } else if (filterState.exclude.has(name)) {
    filterState.exclude.delete(name);
  } else {
    filterState.include.add(name);
  }
}

function resetFilters() {
  filterState.include.clear();
  filterState.exclude.clear();
  filterState.wrapExclude.clear();
  filterState.rawFilter = "all";
  filterState.search = "";
  filterState.sort = "menu";
  $("search-input").value = "";
}

function updateFilterBadge() {
  const count = filterState.include.size + filterState.exclude.size +
    filterState.wrapExclude.size +
    (filterState.rawFilter !== "all" ? 1 : 0);
  const badge = $("filter-badge");
  if (count > 0) {
    badge.textContent = count;
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

// ── Sort ──

function toggleSortMenu() {
  const menu = $("sort-menu");
  if (!menu.hidden) {
    menu.hidden = true;
    return;
  }
  const btn = $("sort-btn");
  const rect = btn.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.right = `${window.innerWidth - rect.right}px`;
  menu.hidden = false;

  for (const opt of menu.querySelectorAll(".sort-option")) {
    opt.classList.toggle("sort-option--active", opt.dataset.sort === filterState.sort);
  }
}

// ── Omakase ──

function rebuildOmakaseQueue() {
  const ids = filteredItems.map((i) => i.id);
  omakaseQueue = shuffle([...ids]);
  omakasePickId = null;
  $("omakase-exhausted").hidden = true;
}

function omakasePick() {
  if (omakaseQueue.length === 0) {
    $("omakase-exhausted").hidden = false;
    return;
  }
  $("omakase-exhausted").hidden = true;
  omakasePickId = omakaseQueue.pop();
  renderResults();

  const card = document.querySelector(`.item-card[data-id="${CSS.escape(omakasePickId)}"]`);
  if (card) {
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Fix sheet ──

function openFixSheet(item) {
  fixingItem = item;
  fixIngredients = [...(item._ingredients || [])];
  $("fix-sheet-title").textContent = `Fix: ${item.name}`;
  renderFixSheet();
  $("fix-sheet").hidden = false;
}

function closeFixSheet() {
  $("fix-sheet").hidden = true;
  fixingItem = null;
}

function renderFixSheet() {
  if (!fixingItem) return;

  const vocabSet = new Set();
  for (const item of currentItems) {
    for (const ing of item._ingredients) {
      vocabSet.add(ing.toLowerCase());
    }
  }
  const vocab = [...vocabSet].sort();

  const vocabRow = $("fix-vocab-chips");
  vocabRow.innerHTML = "";
  for (const v of vocab) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fix-chip";
    if (fixIngredients.includes(v)) btn.classList.add("fix-chip--selected");
    btn.textContent = v;
    btn.addEventListener("click", () => {
      const idx = fixIngredients.indexOf(v);
      if (idx >= 0) fixIngredients.splice(idx, 1);
      else fixIngredients.push(v);
      renderFixSheet();
    });
    vocabRow.appendChild(btn);
  }

  const currentRow = $("fix-current");
  currentRow.innerHTML = "";
  for (const ing of fixIngredients) {
    const chip = document.createElement("span");
    chip.className = "badge badge--wrap";
    chip.textContent = ing;
    currentRow.appendChild(chip);
  }
}

function applyFix() {
  if (!fixingItem) return;
  const original = currentItems.find((i) => i.id === fixingItem.id);
  if (original) {
    original.ingredients = [...fixIngredients];
    original._ingredients = fixIngredients.map(normalizeIngredient);
    original.flagged = false;
    original.edited = true;

    if (currentJob?.result) {
      const resultItem = currentJob.result.items.find((i) => i.id === original.id);
      if (resultItem) {
        resultItem.ingredients = [...fixIngredients];
        resultItem.flagged = false;
        resultItem.edited = true;
      }
      persistMenu(currentJob);
    }
  }

  facets = buildFacets(currentItems);
  closeFixSheet();
  renderResults();
}

function persistMenu(job) {
  if (!job.result) return;
  const restaurant = job.result.restaurant_name;
  const slug = (restaurant || job.jobHash?.slice(0, 12) || "menu")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-");
  try {
    localStorage.setItem(`ss:menu:${slug}`, JSON.stringify(job.result));
  } catch { /* best effort */ }
}

// ── Retry item ──

let retryHandler = null;
export function onRetryItem(handler) { retryHandler = handler; }

function handleRetryItem(item) {
  if (retryHandler) retryHandler(item);
}

// ── Recent menus ──

function renderRecentMenus() {
  const list = $("recent-list");
  const panel = $("recent-menus");
  list.innerHTML = "";
  const menus = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith("ss:menu:")) continue;
    try {
      const data = JSON.parse(localStorage.getItem(key));
      if (data && data.items) {
        menus.push({ key, data, parsedAt: data.parsedAt || 0 });
      }
    } catch { /* skip */ }
  }

  menus.sort((a, b) => b.parsedAt - a.parsedAt);

  if (menus.length === 0) {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;
  for (const m of menus.slice(0, 5)) {
    const li = document.createElement("li");
    li.className = "recent-item";
    li.addEventListener("click", () => {
      currentJob = { result: m.data, jobHash: m.key.replace("ss:menu:", "") };
      showResults(currentJob);
    });

    const name = document.createElement("span");
    name.className = "recent-item__name";
    name.textContent = m.data.restaurant_name || "Menu";

    const meta = document.createElement("span");
    meta.className = "recent-item__meta";
    meta.textContent = `${m.data.items.length} items`;

    li.appendChild(name);
    li.appendChild(meta);
    list.appendChild(li);
  }
}

// ── Capture UI ──

let selectedFiles = [];

function resetCapture() {
  selectedFiles = [];
  $("photo-input").value = "";
  $("url-input").value = "";
  updateCaptureUI();
}

function updateCaptureUI() {
  const grid = $("photo-grid");
  const addSlot = $("photo-add-slot");
  grid.innerHTML = "";

  for (let i = 0; i < selectedFiles.length; i++) {
    const slot = document.createElement("div");
    slot.className = "photo-slot photo-slot--filled";
    const img = document.createElement("img");
    img.className = "photo-slot__thumb";
    img.src = URL.createObjectURL(selectedFiles[i]);
    img.alt = `Photo ${i + 1}`;
    const removeBtn = document.createElement("button");
    removeBtn.className = "photo-slot__remove";
    removeBtn.type = "button";
    removeBtn.textContent = "×";
    removeBtn.setAttribute("aria-label", `Remove photo ${i + 1}`);
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      selectedFiles.splice(i, 1);
      updateCaptureUI();
    });
    slot.appendChild(img);
    slot.appendChild(removeBtn);
    grid.appendChild(slot);
  }

  if (selectedFiles.length < 6) {
    grid.appendChild(addSlot);
  }

  const count = $("photo-count");
  count.textContent = selectedFiles.length > 0
    ? `${selectedFiles.length} photo${selectedFiles.length > 1 ? "s" : ""} selected`
    : "";

  const parseBtn = $("parse-button");
  const urlVal = $("url-input").value.trim();
  const hasPhotos = selectedFiles.length > 0;
  const hasUrl = urlVal.length > 0;
  parseBtn.disabled = !hasPhotos && !hasUrl;
  parseBtn.textContent = hasPhotos
    ? `Parse ${selectedFiles.length} photo${selectedFiles.length > 1 ? "s" : ""}`
    : hasUrl ? "Parse URL" : "Parse menu";

  if (hasPhotos) $("url-input").disabled = true;
  else $("url-input").disabled = false;
  if (hasUrl && !hasPhotos) $("photo-input").disabled = true;
  else $("photo-input").disabled = false;
}

export function getSelectedFiles() { return selectedFiles; }
export function getUrlInput() { return $("url-input").value.trim(); }

// ── Event wiring ──

let parseHandler = null;
export function onParse(handler) { parseHandler = handler; }

let newParseHandler = null;
export function onNewParse(handler) { newParseHandler = handler; }

export function wireEvents() {
  $("photo-input").addEventListener("change", (e) => {
    const files = [...e.target.files].slice(0, 6 - selectedFiles.length);
    selectedFiles.push(...files);
    if (selectedFiles.length > 6) selectedFiles.length = 6;
    updateCaptureUI();
  });

  $("photo-add-slot").addEventListener("click", () => {
    $("photo-input").click();
  });

  $("url-input").addEventListener("input", updateCaptureUI);

  $("parse-button").addEventListener("click", () => {
    if (parseHandler) parseHandler();
  });

  $("new-parse-btn").addEventListener("click", () => {
    if (newParseHandler) newParseHandler();
  });

  $("error-retry-btn").addEventListener("click", () => {
    $("error-overlay").hidden = true;
    showHome();
  });

  $("search-input").addEventListener("input", (e) => {
    filterState.search = e.target.value;
    renderResults();
  });

  $("filter-btn").addEventListener("click", openFilterSheet);
  $("filter-clear-btn").addEventListener("click", () => {
    resetFilters();
    renderFilterChips();
  });
  $("chip-search").addEventListener("input", renderFilterChips);

  $("filter-sheet").querySelector(".sheet__backdrop")
    .addEventListener("click", closeFilterSheet);

  $("sort-btn").addEventListener("click", toggleSortMenu);
  for (const opt of document.querySelectorAll(".sort-option")) {
    opt.addEventListener("click", () => {
      filterState.sort = opt.dataset.sort;
      $("sort-menu").hidden = true;
      renderResults();
    });
  }

  document.addEventListener("click", (e) => {
    const sortMenu = $("sort-menu");
    if (!sortMenu.hidden && !sortMenu.contains(e.target) && e.target !== $("sort-btn")) {
      sortMenu.hidden = true;
    }
  });

  $("omakase-btn").addEventListener("click", omakasePick);
  $("omakase-reshuffle").addEventListener("click", () => {
    rebuildOmakaseQueue();
    omakasePick();
  });
  $("omakase-open-filters").addEventListener("click", () => {
    $("omakase-exhausted").hidden = true;
    openFilterSheet();
  });

  $("fix-sheet").querySelector(".sheet__backdrop")
    .addEventListener("click", closeFixSheet);
  $("fix-done-btn").addEventListener("click", applyFix);
  $("fix-add-btn").addEventListener("click", () => {
    const input = $("fix-input");
    const val = normalizeIngredient(input.value.trim());
    if (val && !fixIngredients.includes(val)) {
      fixIngredients.push(val);
      renderFixSheet();
    }
    input.value = "";
  });
  $("fix-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      $("fix-add-btn").click();
    }
  });
}
