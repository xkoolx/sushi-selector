// Orchestrator state machine (SPEC T-1.9). All orchestration, merging,
// reconciliation, normalization, and persistence happen here in the browser;
// the worker is a thin authenticated proxy.

import { preprocessPhotos } from "/preprocess.js";
import {
  showHome, showProgress, showResults, showError,
  updateProgress, wireEvents, onParse, onNewParse, onRetryItem,
  getSelectedFiles, getUrlInput,
} from "/ui.js";
import { aliases as aliasTable } from "/aliases.js";

// ── Constants ──

export const STATES = ["IDLE", "PREPROCESS", "INDEX", "DETAILS", "RECONCILE", "READY", "ERROR"];

const DETAILS_BATCH_SIZE = 8;
const DETAILS_CONCURRENCY = 3;
const PHOTO_SOFT_CAP = 6;
const NAME_MATCH_THRESHOLD = 85;
const RESUME_MAX_AGE_MS = 30 * 60 * 1000;
const JOB_KEY_PREFIX = "ss:job:";
const MENU_KEY_PREFIX = "ss:menu:";

// ── Fuzzy name matching ──

function indelDistance(a, b) {
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

// ── Ingredient normalization ──

export function normalizeIngredient(name) {
  let n = String(name).trim().toLowerCase();
  if (aliasTable[n]) return aliasTable[n];
  if (n.endsWith("ies") && n.length > 4) n = n.slice(0, -3) + "y";
  else if (n.endsWith("es") && n.length > 3 && "sxzo".includes(n[n.length - 3])) n = n.slice(0, -2);
  else if (n.endsWith("s") && !n.endsWith("ss") && n.length > 3) n = n.slice(0, -1);
  return aliasTable[n] ?? n;
}

// ── API helpers ──

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
      } catch { /* non-JSON error */ }
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

async function getSessionToken() {
  let turnstileToken = "dev";
  if (typeof window.turnstile !== "undefined" && window.turnstile.getResponse) {
    turnstileToken = window.turnstile.getResponse() || "dev";
  }
  const resp = await apiPost("/api/session", { turnstileToken });
  return resp.sessionToken;
}

// ── Job persistence ──

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function persistJob(job) {
  job.updatedAt = Date.now();
  const key = JOB_KEY_PREFIX + job.jobHash;
  try {
    localStorage.setItem(key, JSON.stringify(job));
  } catch {
    try {
      localStorage.setItem(key, JSON.stringify({ ...job, photos: null }));
    } catch { /* best effort */ }
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

// ── Per-photo pipeline ──

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
    await runBatch(pending[0]);
    const rest = pending.slice(1).map((batch) => () => runBatch(batch));
    await runWithConcurrency(rest, DETAILS_CONCURRENCY);
  }

  let missing = indexItems.filter((it) => photoState.detailsByN[it.n] === undefined);
  if (missing.length > 0 && !photoState.retriedMissing) {
    photoState.retriedMissing = true;
    for (const retryBatch of batchItems(missing)) {
      try {
        await runBatch(retryBatch);
      } catch { /* fall through to flagging */ }
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

// ── Multi-photo merge ──

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

// ── Job driver ──

function setState(job, state) {
  job.state = state;
  persistJob(job);
  updateProgress(job);
}

export async function startJob(files) {
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
  currentJobRef = job;
  showProgress(job);
  updateProgress(job);

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
    job.state = "ERROR";
    persistJob(job);
    showError(job.error);
  }
  return job;
}

export async function resumeJob(job) {
  if (!job.photos) {
    localStorage.removeItem(JOB_KEY_PREFIX + job.jobHash);
    return null;
  }
  currentJobRef = job;
  showProgress(job);
  try {
    job.sessionToken = await getSessionToken();
    await driveJob(job);
  } catch (e) {
    job.error = friendlyError(e);
    job.state = "ERROR";
    persistJob(job);
    showError(job.error);
  }
  return job;
}

async function driveJob(job) {
  const onProgress = () => updateProgress(job);

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

  const slug = (restaurant || job.jobHash.slice(0, 12)).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  try {
    localStorage.setItem(MENU_KEY_PREFIX + slug, JSON.stringify(job.result));
  } catch { /* best effort */ }

  setState(job, "READY");
  showResults(job);
}

function friendlyError(e) {
  if (e && e.status === 429) return "The kitchen is slammed, try again in a bit.";
  if (e && e.status === 401) return "Session expired. Start the parse again.";
  if (e && e.status === 413) return "Photo is too large. Try a lower resolution.";
  if (e && e.message) return e.message;
  return "Something went wrong parsing the menu. Try again.";
}

// ── Single-item retry for flagged items ──

async function retryItem(item) {
  if (!currentJobRef || !currentJobRef.photos) return;
  try {
    const photoIndex = parseInt(item.id.split(":")[0], 10);
    const photo = currentJobRef.photos[photoIndex];
    if (!photo) return;
    const result = await detailsCall(
      currentJobRef.sessionToken,
      photo,
      [{ n: parseInt(item.id.split(":")[1], 10), name: item.name }],
    );
    const details = result.items?.[0];
    if (details) {
      const original = currentJobRef.result.items.find((i) => i.id === item.id);
      if (original) {
        original.ingredients = details.ingredients ?? [];
        original.wrap = details.wrap ?? "unknown";
        original.is_raw = details.is_raw ?? null;
        original.notes = details.notes ?? null;
        original.flagged = false;
      }
      showResults(currentJobRef, { preserveFilters: true });
    }
  } catch {
    showError("Retry failed. You can fix ingredients manually.");
  }
}

let currentJobRef = null;

// ── URL extraction (single-pass, no photo needed) ──

export async function startUrlJob(url) {
  const job = {
    state: "INDEX",
    jobHash: null,
    sessionToken: null,
    photos: null,
    photoStates: [],
    result: null,
    error: null,
    updatedAt: Date.now(),
  };
  currentJobRef = job;
  job.jobHash = await sha256Hex(url);
  showProgress(job);
  updateProgress(job);

  try {
    job.sessionToken = await getSessionToken();
    setState(job, "INDEX");

    const data = await apiPost("/api/extract/url", {
      sessionToken: job.sessionToken,
      url,
    });

    const items = (data.items ?? []).map((item, i) => ({
      id: `0:${item.n ?? i + 1}`,
      name: item.name,
      section: item.section ?? null,
      price_text: item.price_text ?? null,
      price: item.price ?? null,
      ingredients: item.ingredients ?? [],
      wrap: item.wrap ?? "unknown",
      is_raw: item.is_raw ?? null,
      notes: item.notes ?? null,
      flagged: false,
    }));

    job.result = {
      restaurant_name: data.restaurant_name ?? null,
      sections: data.sections ?? [],
      items,
      parsedAt: Date.now(),
    };

    const slug = (job.result.restaurant_name || job.jobHash.slice(0, 12))
      .toLowerCase().replace(/[^a-z0-9]+/g, "-");
    try {
      localStorage.setItem(MENU_KEY_PREFIX + slug, JSON.stringify(job.result));
    } catch { /* best effort */ }

    setState(job, "READY");
    showResults(job);
  } catch (e) {
    job.error = friendlyError(e);
    job.state = "ERROR";
    persistJob(job);
    showError(job.error);
  }
  return job;
}

// ── Init ──

function wireApp() {
  wireEvents();

  onParse(() => {
    const files = getSelectedFiles();
    if (files.length > 0) {
      startJob(files);
      return;
    }
    const url = getUrlInput();
    if (url) {
      startUrlJob(url);
    }
  });

  onNewParse(() => {
    showHome();
  });

  onRetryItem((item) => {
    retryItem(item);
  });

  const resumable = loadResumableJob();
  if (resumable && resumable.photos) {
    showProgress(resumable);
    currentJobRef = resumable;
    resumeJob(resumable);
  } else {
    showHome();
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
  document.addEventListener("DOMContentLoaded", wireApp);
} else {
  wireApp();
}
