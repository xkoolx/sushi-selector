// Orchestrator state machine (SPEC T-1.9). All orchestration, merging,
// reconciliation, normalization, and persistence happen here in the browser;
// the worker is a thin authenticated proxy. Phase 2 replaces the interim
// rendering at the bottom with the real UI (ui.js, filters.js).

import { preprocessPhotos } from "/preprocess.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const STATES = ["IDLE", "PREPROCESS", "INDEX", "DETAILS", "RECONCILE", "READY", "ERROR"];

const DETAILS_BATCH_SIZE = 8;
const DETAILS_CONCURRENCY = 3;
const PHOTO_SOFT_CAP = 6;
const NAME_MATCH_THRESHOLD = 85;
const RESUME_MAX_AGE_MS = 30 * 60 * 1000;
const JOB_KEY_PREFIX = "ss:job:";
const MENU_KEY_PREFIX = "ss:menu:";

// ---------------------------------------------------------------------------
// Fuzzy name matching (mirrors the eval harness rule: token_sort_ratio >= 85)
// ---------------------------------------------------------------------------

function indelDistance(a, b) {
  // Levenshtein restricted to insertions and deletions, which is what
  // rapidfuzz's ratio family measures underneath.
  const m = a.length;
  const n = b.length;
  let prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const cur = new Array(n + 1);
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j], cur[j - 1]);
    }
    prev = cur;
  }
  return prev[n];
}

export function tokenSortRatio(a, b) {
  const sa = a.toLowerCase().split(/\s+/).filter(Boolean).sort().join(" ");
  const sb = b.toLowerCase().split(/\s+/).filter(Boolean).sort().join(" ");
  const total = sa.length + sb.length;
  if (total === 0) return 100;
  return (100 * (total - indelDistance(sa, sb))) / total;
}

// ---------------------------------------------------------------------------
// Ingredient normalization (deterministic: lowercase, trim, plural fold,
// alias table from shared/aliases.json served at /api/aliases)
// ---------------------------------------------------------------------------

let aliasTable = {};

async function loadAliases() {
  try {
    const resp = await fetch("/api/aliases");
    if (resp.ok) aliasTable = await resp.json();
  } catch {
    // Normalization degrades gracefully to lowercase/plural folding.
  }
}

export function normalizeIngredient(name) {
  let n = String(name).trim().toLowerCase();
  if (aliasTable[n]) return aliasTable[n];
  if (n.endsWith("ies") && n.length > 4) n = n.slice(0, -3) + "y";
  else if (n.endsWith("es") && n.length > 3 && "sxzo".includes(n[n.length - 3])) n = n.slice(0, -2);
  else if (n.endsWith("s") && !n.endsWith("ss") && n.length > 3) n = n.slice(0, -1);
  return aliasTable[n] ?? n;
}

// ---------------------------------------------------------------------------
// API helpers. The client owns retries: one retry on 429/5xx/timeout with
// jittered backoff, because the client owns orchestration state.
// ---------------------------------------------------------------------------

async function apiPost(path, body) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1000 + Math.random() * 2000));
    }
    try {
      const resp = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (resp.ok) return await resp.json();
      const retryable = resp.status === 429 || resp.status >= 500;
      let detail = {};
      try {
        detail = await resp.json();
      } catch {
        // Non-JSON error body; keep the status only.
      }
      lastError = Object.assign(new Error(detail.message || `Request failed (${resp.status})`), {
        status: resp.status,
        code: detail.error,
      });
      if (!retryable) throw lastError;
    } catch (e) {
      if (e && e.status && !(e.status === 429 || e.status >= 500)) throw e;
      lastError = e;
    }
  }
  throw lastError;
}

// One Turnstile solve authorizes one parse session. The widget itself is
// wired in Phase 2; until then the worker's dev mode (no secret configured)
// accepts any token string locally.
async function getSessionToken() {
  let turnstileToken = "dev";
  if (typeof window.turnstile !== "undefined" && window.turnstile.getResponse) {
    turnstileToken = window.turnstile.getResponse() || "dev";
  }
  const resp = await apiPost("/api/session", { turnstileToken });
  return resp.sessionToken;
}

// ---------------------------------------------------------------------------
// Job persistence. The full job object is written to localStorage after
// every transition under ss:job:<jobHash>; a job younger than 30 minutes
// resumes from its last completed step per photo.
// ---------------------------------------------------------------------------

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function persistJob(job) {
  job.updatedAt = Date.now();
  const key = JOB_KEY_PREFIX + job.jobHash;
  const withPhotos = { ...job };
  try {
    localStorage.setItem(key, JSON.stringify(withPhotos));
  } catch {
    // Quota exceeded: drop the photo bytes and keep the orchestration state,
    // so at least completed results survive a reload.
    try {
      localStorage.setItem(key, JSON.stringify({ ...job, photos: null }));
    } catch {
      // Persistence is best effort; the parse continues in memory.
    }
  }
}

function loadResumableJob() {
  const now = Date.now();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(JOB_KEY_PREFIX)) continue;
    try {
      const job = JSON.parse(localStorage.getItem(key));
      if (job && job.state !== "READY" && now - (job.updatedAt || 0) < RESUME_MAX_AGE_MS) {
        return job;
      }
      if (job && now - (job.updatedAt || 0) >= RESUME_MAX_AGE_MS) {
        localStorage.removeItem(key);
      }
    } catch {
      localStorage.removeItem(key);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Per-photo pipeline: INDEX, then DETAILS with a warm-then-fan-out schedule,
// then RECONCILE. Batch 1 goes alone so its response writes the prompt cache
// (entries become readable only after the first response begins); the
// remaining batches of 8 fan out with concurrency 3 and pay the cached rate.
// ---------------------------------------------------------------------------

function batchItems(items) {
  const batches = [];
  for (let i = 0; i < items.length; i += DETAILS_BATCH_SIZE) {
    batches.push(items.slice(i, i + DETAILS_BATCH_SIZE));
  }
  return batches;
}

async function runWithConcurrency(tasks, limit) {
  const results = new Array(tasks.length);
  let next = 0;
  async function workerLoop() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, workerLoop));
  return results;
}

async function detailsCall(sessionToken, photo, items) {
  const refs = items.map((it) => ({ n: it.n, name: it.name }));
  return apiPost("/api/extract/details", {
    sessionToken,
    image: { media_type: photo.media_type, data: photo.data },
    items: refs,
  });
}

async function runPhotoPipeline(job, photoIndex, onProgress) {
  const photo = job.photos[photoIndex];
  const photoState = job.photoStates[photoIndex];

  if (!photoState.index) {
    const indexResult = await apiPost("/api/extract/index", {
      sessionToken: job.sessionToken,
      image: { media_type: photo.media_type, data: photo.data },
    });
    photoState.index = {
      restaurant_name: indexResult.restaurant_name ?? null,
      sections: indexResult.sections ?? [],
      items: indexResult.items ?? [],
    };
    persistJob(job);
    onProgress();
  }

  const indexItems = photoState.index.items;
  const batches = batchItems(indexItems);
  photoState.totalBatches = batches.length;
  if (!photoState.detailsByN) photoState.detailsByN = {};

  const runBatch = async (batch) => {
    const result = await detailsCall(job.sessionToken, photo, batch);
    for (const item of result.items ?? []) {
      photoState.detailsByN[item.n] = item;
    }
    photoState.completedBatches = (photoState.completedBatches || 0) + 1;
    persistJob(job);
    onProgress();
  };

  const pending = batches.filter(
    (batch) => !batch.every((it) => photoState.detailsByN[it.n] !== undefined),
  );

  if (pending.length > 0) {
    // Warm the cache with batch 1 alone, then fan out.
    await runBatch(pending[0]);
    const rest = pending.slice(1).map((batch) => () => runBatch(batch));
    await runWithConcurrency(rest, DETAILS_CONCURRENCY);
  }

  // RECONCILE per photo: every index n must appear in exactly one details
  // result. Missing items get one batch retry; still-missing items render
  // with ingredients marked unknown and a flag, never silently dropped.
  let missing = indexItems.filter((it) => photoState.detailsByN[it.n] === undefined);
  if (missing.length > 0 && !photoState.retriedMissing) {
    photoState.retriedMissing = true;
    for (const retryBatch of batchItems(missing)) {
      try {
        await runBatch(retryBatch);
      } catch {
        // Fall through to flagging; a failed retry must not sink the parse.
      }
    }
    missing = indexItems.filter((it) => photoState.detailsByN[it.n] === undefined);
  }

  const reconciled = indexItems.map((indexItem) => {
    const details = photoState.detailsByN[indexItem.n];
    return {
      id: `${photoIndex}:${indexItem.n}`,
      name: indexItem.name,
      section: indexItem.section ?? null,
      price_text: indexItem.price_text ?? null,
      price: indexItem.price ?? null,
      ingredients: details ? (details.ingredients ?? []) : [],
      wrap: details ? (details.wrap ?? "unknown") : "unknown",
      is_raw: details ? (details.is_raw ?? null) : null,
      notes: details ? (details.notes ?? null) : null,
      flagged: !details,
    };
  });

  photoState.reconciled = reconciled;
  persistJob(job);
  return reconciled;
}

// ---------------------------------------------------------------------------
// Multi-photo merge. Merge order follows photo order. Dedupe exists for
// overlapping shots of the same page: two items merge only when the fuzzy
// name rule AND the compatible price rule both hold. When merging, keep the
// record with more ingredients and union the notes.
// ---------------------------------------------------------------------------

function priceCompatible(a, b) {
  if (a.price === null || b.price === null) return true;
  return Math.abs(a.price - b.price) < 1e-6;
}

export function mergePhotos(perPhotoItems) {
  const merged = [];
  for (const items of perPhotoItems) {
    for (const item of items) {
      const dup = merged.find(
        (m) => tokenSortRatio(m.name, item.name) >= NAME_MATCH_THRESHOLD && priceCompatible(m, item),
      );
      if (!dup) {
        merged.push({ ...item });
        continue;
      }
      const winner = (item.ingredients?.length || 0) > (dup.ingredients?.length || 0) ? item : dup;
      const notes = [dup.notes, item.notes].filter(Boolean);
      Object.assign(dup, winner, {
        id: dup.id,
        notes: notes.length ? [...new Set(notes)].join("; ") : null,
        flagged: dup.flagged && item.flagged,
      });
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Job driver
// ---------------------------------------------------------------------------

function setState(job, state) {
  job.state = state;
  persistJob(job);
  render(job);
}

export async function startJob(files) {
  await loadAliases();

  const job = {
    state: "PREPROCESS",
    jobHash: null,
    sessionToken: null,
    photos: null,
    photoStates: [],
    result: null,
    error: null,
    updatedAt: Date.now(),
  };
  render(job);

  try {
    const photos = await preprocessPhotos([...files].slice(0, PHOTO_SOFT_CAP));
    job.photos = photos;
    job.jobHash = await sha256Hex(photos.map((p) => p.hash).join("|"));
    job.photoStates = photos.map(() => ({}));
    persistJob(job);

    job.sessionToken = await getSessionToken();
    await driveJob(job);
  } catch (e) {
    job.error = friendlyError(e);
    setState(job, "ERROR");
  }
  return job;
}

export async function resumeJob(job) {
  await loadAliases();
  if (!job.photos) {
    // Photo bytes did not fit in localStorage; the job cannot continue
    // without them, so surface a clean restart instead of a broken resume.
    localStorage.removeItem(JOB_KEY_PREFIX + job.jobHash);
    return null;
  }
  try {
    job.sessionToken = await getSessionToken();
    await driveJob(job);
  } catch (e) {
    job.error = friendlyError(e);
    setState(job, "ERROR");
  }
  return job;
}

async function driveJob(job) {
  const onProgress = () => render(job);

  setState(job, "INDEX");
  const perPhoto = [];
  for (let i = 0; i < job.photos.length; i++) {
    job.currentPhoto = i;
    setState(job, job.photoStates[i].index ? "DETAILS" : "INDEX");
    perPhoto.push(await runPhotoPipeline(job, i, onProgress));
  }

  setState(job, "RECONCILE");
  const items = mergePhotos(perPhoto);
  const restaurant = job.photoStates.map((s) => s.index?.restaurant_name).find(Boolean) ?? null;
  const sections = [];
  for (const s of job.photoStates) {
    for (const sec of s.index?.sections ?? []) {
      if (!sections.some((x) => x.name === sec.name)) sections.push(sec);
    }
  }

  job.result = {
    restaurant_name: restaurant,
    sections,
    items,
    parsedAt: Date.now(),
  };

  // Completed menus persist for the Home screen's recent list.
  const slug = (restaurant || job.jobHash.slice(0, 12)).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  try {
    localStorage.setItem(MENU_KEY_PREFIX + slug, JSON.stringify(job.result));
  } catch {
    // Best effort.
  }

  setState(job, "READY");
}

function friendlyError(e) {
  if (e && e.status === 429) return "The kitchen is slammed, try again in a bit.";
  if (e && e.status === 401) return "Session expired. Start the parse again.";
  if (e && e.message) return e.message;
  return "Something went wrong parsing the menu. Try again.";
}

// ---------------------------------------------------------------------------
// Interim Phase 1 rendering. Phase 2 replaces this with the real UI (cards,
// filter sheet, Omakase). This keeps the pipeline drivable in a browser today.
// ---------------------------------------------------------------------------

function el(id) {
  return document.getElementById(id);
}

function render(job) {
  const status = el("status");
  const results = el("results");
  if (!status || !results) return;

  if (job.state === "ERROR") {
    status.textContent = job.error || "Something went wrong.";
    return;
  }

  if (job.state === "READY") {
    const flagged = job.result.items.filter((i) => i.flagged).length;
    status.textContent = `${job.result.items.length} items` + (flagged ? `, ${flagged} flagged` : "");
    results.innerHTML = "";
    for (const item of job.result.items) {
      const li = document.createElement("li");
      const price = item.price !== null ? `$${item.price}` : (item.price_text ?? "");
      const ingredients = (item.ingredients ?? []).map(normalizeIngredient).join(", ");
      li.textContent = `${item.name} ${price ? `(${price})` : ""} ${ingredients ? `: ${ingredients}` : ""}${item.flagged ? " [needs retry]" : ""}`;
      results.appendChild(li);
    }
    return;
  }

  const photoCount = job.photos?.length ?? 0;
  const photoNo = (job.currentPhoto ?? 0) + 1;
  const ps = job.photoStates?.[job.currentPhoto ?? 0];
  const batches = ps?.totalBatches ? ` (${ps.completedBatches || 0}/${ps.totalBatches} batches)` : "";
  const photoLabel = photoCount > 1 ? ` photo ${photoNo} of ${photoCount}` : "";
  status.textContent = `${job.state.toLowerCase()}${photoLabel}${batches}...`;
}

function wireUi() {
  const input = el("photo-input");
  const button = el("parse-button");
  if (!input || !button) return;

  input.addEventListener("change", () => {
    const n = input.files?.length ?? 0;
    button.disabled = n === 0;
    button.textContent = n > 1 ? `Parse ${Math.min(n, PHOTO_SOFT_CAP)} photos` : "Parse menu";
  });

  button.addEventListener("click", () => {
    if (input.files?.length) startJob(input.files);
  });

  const resumable = loadResumableJob();
  if (resumable && resumable.photos) {
    el("status").textContent = "Found an unfinished parse. Resuming...";
    resumeJob(resumable);
  }
}

async function checkHealth() {
  try {
    const res = await fetch("/api/health");
    if (!res.ok) return;
    console.info("Sushi Selector worker healthy:", await res.json());
  } catch (err) {
    console.warn("Health check failed:", err);
  }
}

checkHealth();
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wireUi);
} else {
  wireUi();
}
