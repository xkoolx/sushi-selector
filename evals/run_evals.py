# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "anthropic>=0.40",
#   "rapidfuzz>=3.9",
# ]
# ///
"""Sushi Selector eval harness.

Extraction reliability is the product, and this harness is the working
definition of "reliable" (see docs/EVALS.md). It loads the exact production
assets under shared/, runs the per-photo index/details/reconcile pipeline plus
the merge and dedupe step, scores predictions against hand-verified goldens,
and writes a markdown report with a pass/fail gates table, per-menu breakdown,
per-item diffs, token usage, and estimated cost.

Run with uv (never pip or python directly):

    uv run evals/run_evals.py --check              # offline readiness check, no API calls
    uv run evals/run_evals.py --all                # full run over the golden set
    uv run evals/run_evals.py --menu <slug>        # single menu, for debugging
    uv run evals/run_evals.py --all --repeat 3     # consistency runs
    uv run evals/run_evals.py --all --batch        # route via Message Batches API (50% cheaper)
    uv run evals/run_evals.py --url-smoke          # loose URL-path smoke checks (reported, not gated)

STATUS: Phase 1 request layer wired. The deterministic layer (asset loading,
menu discovery, matching, metrics, gates, reporting) and the extraction
pipeline (index/details/reconcile/merge, --batch, --url-smoke) are both
implemented. Nothing runs without an explicit --menu/--all/--batch/--url-smoke
invocation and a real ANTHROPIC_API_KEY in the environment; --check stays
fully offline regardless.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import anthropic
from rapidfuzz.fuzz import token_sort_ratio

# --------------------------------------------------------------------------
# Paths and constants
# --------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent
SHARED = REPO_ROOT / "shared"
PROMPTS_DIR = SHARED / "prompts"
SCHEMA_DIR = SHARED / "schema"
ALIASES_PATH = SHARED / "aliases.json"
MENUS_DIR = REPO_ROOT / "evals" / "menus"
REPORTS_DIR = REPO_ROOT / "evals" / "reports"

DEFAULT_MODEL = "claude-haiku-4-5-20251001"

# Name-match threshold, shared with the client dedupe rule (SPEC.md).
NAME_MATCH_THRESHOLD = 85

# Anthropic request-shape constants, mirroring src/extract.ts exactly so
# evals exercise the same request shapes production sends.
INDEX_MAX_TOKENS = 2048
DETAILS_MAX_TOKENS = 2048
URL_MAX_TOKENS = 8192
DETAILS_BATCH_SIZE = 8  # SPEC.md: batch 1 fires solo to warm the cache, then
                         # the rest fan out (sequential here; see _run_photo_pipeline).

# Basic web fetch, not a dynamic-filtering _202602xx variant: those are
# verified (live docs, this session) to support Fable 5, Opus 4.8, Mythos
# 5/Preview, Opus 4.7, Opus 4.6, Sonnet 5, and Sonnet 4.6 only. Haiku 4.5,
# the default model here, is not on that list. GA, no beta header required.
WEB_FETCH_TOOL_TYPE = "web_fetch_20250910"
WEB_FETCH_MAX_USES = 3
WEB_FETCH_MAX_CONTENT_TOKENS = 100_000

# Gate thresholds (docs/EVALS.md). Kept here so the report can print the exact
# number each gate was measured against.
GATES = {
    "item_recall": 0.97,
    "item_precision": 0.97,
    "ingredient_f1_macro": 0.90,
    "price_accuracy": 0.97,
    "consistency_f1_spread_max": 0.03,
}

# Rough per-token pricing for the default model, used only for the report's
# cost estimate. Verify against live pricing before trusting the number; the
# workspace spend cap is the real guardrail.
PRICE_PER_MTOK = {
    "input": 1.00,
    "cache_write": 1.25,
    "cache_read": 0.10,
    "output": 5.00,
}


# --------------------------------------------------------------------------
# Shared asset loading (evals exercise the exact production assets)
# --------------------------------------------------------------------------


@dataclass
class SharedAssets:
    system_prompt: str
    index_task: str
    details_task: str
    url_task: Optional[str]
    index_schema: dict
    details_schema: dict
    url_schema: Optional[dict]
    aliases: dict[str, str]


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def load_shared_assets() -> SharedAssets:
    """Load prompts, schemas, and the alias table straight from shared/.

    Missing files raise with an actionable message. The URL task and alias
    table are optional in the Phase 0 skeleton; everything else is required
    before a scored run is meaningful.
    """
    missing: list[str] = []

    def required(path: Path) -> str:
        if not path.exists():
            missing.append(str(path.relative_to(REPO_ROOT)))
            return ""
        return _read_text(path)

    system_prompt = required(PROMPTS_DIR / "system.md")
    index_task = required(PROMPTS_DIR / "index-task.md")
    details_task = required(PROMPTS_DIR / "details-task.md")

    url_task_path = PROMPTS_DIR / "url-task.md"
    url_task = _read_text(url_task_path) if url_task_path.exists() else None

    index_schema: dict = {}
    details_schema: dict = {}
    index_schema_path = SCHEMA_DIR / "index.schema.json"
    details_schema_path = SCHEMA_DIR / "details.schema.json"
    if index_schema_path.exists():
        index_schema = json.loads(_read_text(index_schema_path))
    else:
        missing.append(str(index_schema_path.relative_to(REPO_ROOT)))
    if details_schema_path.exists():
        details_schema = json.loads(_read_text(details_schema_path))
    else:
        missing.append(str(details_schema_path.relative_to(REPO_ROOT)))

    url_schema_path = SCHEMA_DIR / "url.schema.json"
    url_schema: Optional[dict] = (
        json.loads(_read_text(url_schema_path)) if url_schema_path.exists() else None
    )

    aliases: dict[str, str] = {}
    if ALIASES_PATH.exists():
        aliases = json.loads(_read_text(ALIASES_PATH))

    if missing:
        raise FileNotFoundError(
            "Missing shared assets (built in Phase 1): " + ", ".join(missing)
        )

    return SharedAssets(
        system_prompt=system_prompt,
        index_task=index_task,
        details_task=details_task,
        url_task=url_task,
        index_schema=index_schema,
        details_schema=details_schema,
        url_schema=url_schema,
        aliases=aliases,
    )


# --------------------------------------------------------------------------
# Menu discovery
# --------------------------------------------------------------------------


@dataclass
class Menu:
    slug: str
    photos: list[Path]
    golden: dict


def discover_menus() -> list[Menu]:
    """Find scored menus: evals/menus/<slug>/ with photos/ and golden.json.

    The raw/ drop folder is skipped; it holds unsorted photos before they are
    slugified into per-menu directories (T-1.10).
    """
    menus: list[Menu] = []
    if not MENUS_DIR.exists():
        return menus
    for entry in sorted(MENUS_DIR.iterdir()):
        if not entry.is_dir() or entry.name == "raw":
            continue
        golden_path = entry / "golden.json"
        photos_dir = entry / "photos"
        if not golden_path.exists():
            continue
        photos = (
            sorted(p for p in photos_dir.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"})
            if photos_dir.exists()
            else []
        )
        golden = json.loads(_read_text(golden_path))
        menus.append(Menu(slug=entry.name, photos=photos, golden=golden))
    return menus


# --------------------------------------------------------------------------
# Ingredient normalization (mirrors the client's deterministic pipeline)
# --------------------------------------------------------------------------


def normalize_ingredient(name: str, aliases: dict[str, str]) -> str:
    """Lowercase, trim, simple plural fold, then alias lookup.

    Mirrors the client normalization so eval scoring matches what users see.
    """
    n = name.strip().lower()
    if n in aliases:
        return aliases[n]
    # Simple plural folding: cheap and reversible, matches the client rule.
    if n.endswith("ies") and len(n) > 4:
        n = n[:-3] + "y"
    elif n.endswith("es") and len(n) > 3 and n[-3] in "sxzo":
        n = n[:-2]
    elif n.endswith("s") and not n.endswith("ss") and len(n) > 3:
        n = n[:-1]
    return aliases.get(n, n)


def normalize_name(name: str) -> str:
    return " ".join(name.strip().lower().split())


# --------------------------------------------------------------------------
# Matching and metrics (docs/EVALS.md)
# --------------------------------------------------------------------------


@dataclass
class MatchResult:
    pairs: list[tuple[int, int]]  # (pred_index, gold_index)
    unmatched_pred: list[int]
    unmatched_gold: list[int]


def match_items(pred: list[dict], gold: list[dict]) -> MatchResult:
    """Greedy one-to-one match by normalized-name token_sort_ratio >= 85.

    Candidate pairs are ranked by score descending; each prediction and each
    golden item is consumed at most once.
    """
    candidates: list[tuple[float, int, int]] = []
    for pi, p in enumerate(pred):
        pname = normalize_name(p.get("name", ""))
        for gi, g in enumerate(gold):
            gname = normalize_name(g.get("name", ""))
            score = token_sort_ratio(pname, gname)
            if score >= NAME_MATCH_THRESHOLD:
                candidates.append((score, pi, gi))
    candidates.sort(key=lambda c: c[0], reverse=True)

    used_pred: set[int] = set()
    used_gold: set[int] = set()
    pairs: list[tuple[int, int]] = []
    for _score, pi, gi in candidates:
        if pi in used_pred or gi in used_gold:
            continue
        used_pred.add(pi)
        used_gold.add(gi)
        pairs.append((pi, gi))

    unmatched_pred = [i for i in range(len(pred)) if i not in used_pred]
    unmatched_gold = [i for i in range(len(gold)) if i not in used_gold]
    return MatchResult(pairs, unmatched_pred, unmatched_gold)


def ingredient_sets(item: dict, aliases: dict[str, str]) -> set[str]:
    return {
        normalize_ingredient(x, aliases)
        for x in item.get("ingredients", [])
        if isinstance(x, str) and x.strip()
    }


def f1(pred_set: set[str], gold_set: set[str]) -> tuple[float, int, int, int]:
    """Return (f1, true_pos, false_pos, false_neg)."""
    tp = len(pred_set & gold_set)
    fp = len(pred_set - gold_set)
    fn = len(gold_set - pred_set)
    if tp == 0:
        return (0.0 if (fp or fn) else 1.0, tp, fp, fn)
    precision = tp / (tp + fp)
    recall = tp / (tp + fn)
    return (2 * precision * recall / (precision + recall), tp, fp, fn)


def price_matches(pred: dict, gold: dict) -> bool:
    pp, gp = pred.get("price"), gold.get("price")
    if pp is None and gp is None:
        # Both null: intent matches when the verbatim text agrees.
        return normalize_name(str(pred.get("price_text") or "")) == normalize_name(
            str(gold.get("price_text") or "")
        )
    if pp is None or gp is None:
        return False
    return abs(float(pp) - float(gp)) < 1e-6


@dataclass
class MenuScore:
    slug: str
    item_recall: float
    item_precision: float
    ingredient_f1_macro: float
    ingredient_f1_micro: float
    price_accuracy: float
    wrap_accuracy: Optional[float]
    n_pred: int
    n_gold: int
    n_matched: int
    diffs: list[str] = field(default_factory=list)


def score_menu(slug: str, pred: list[dict], gold: list[dict], aliases: dict[str, str]) -> MenuScore:
    match = match_items(pred, gold)
    n_matched = len(match.pairs)

    recall = n_matched / len(gold) if gold else 0.0
    precision = n_matched / len(pred) if pred else 0.0

    f1s: list[float] = []
    micro_tp = micro_fp = micro_fn = 0
    price_hits = 0
    wrap_total = wrap_hits = 0
    diffs: list[str] = []

    for pi, gi in match.pairs:
        p, g = pred[pi], gold[gi]
        pset = ingredient_sets(p, aliases)
        gset = ingredient_sets(g, aliases)
        item_f1, tp, fp, fn = f1(pset, gset)
        f1s.append(item_f1)
        micro_tp += tp
        micro_fp += fp
        micro_fn += fn

        if price_matches(p, g):
            price_hits += 1
        else:
            diffs.append(
                f"price mismatch on '{g.get('name')}': pred={p.get('price')!r}/{p.get('price_text')!r} gold={g.get('price')!r}/{g.get('price_text')!r}"
            )

        gold_wrap = g.get("wrap")
        if gold_wrap not in (None, "unknown"):
            wrap_total += 1
            if p.get("wrap") == gold_wrap:
                wrap_hits += 1

        if item_f1 < 1.0:
            missing = gset - pset
            extra = pset - gset
            diffs.append(
                f"ingredients on '{g.get('name')}': missing={sorted(missing)} extra={sorted(extra)}"
            )

    for gi in match.unmatched_gold:
        diffs.append(f"MISSED golden item: '{gold[gi].get('name')}'")
    for pi in match.unmatched_pred:
        diffs.append(f"EXTRA predicted item: '{pred[pi].get('name')}'")

    macro_f1 = sum(f1s) / len(f1s) if f1s else 0.0
    micro_f1, _, _, _ = (
        (2 * (micro_tp / (micro_tp + micro_fp)) * (micro_tp / (micro_tp + micro_fn))
         / ((micro_tp / (micro_tp + micro_fp)) + (micro_tp / (micro_tp + micro_fn))),
         0, 0, 0)
        if micro_tp
        else (0.0, 0, 0, 0)
    )
    price_acc = price_hits / n_matched if n_matched else 0.0
    wrap_acc = (wrap_hits / wrap_total) if wrap_total else None

    return MenuScore(
        slug=slug,
        item_recall=recall,
        item_precision=precision,
        ingredient_f1_macro=macro_f1,
        ingredient_f1_micro=micro_f1,
        price_accuracy=price_acc,
        wrap_accuracy=wrap_acc,
        n_pred=len(pred),
        n_gold=len(gold),
        n_matched=n_matched,
        diffs=diffs,
    )


# --------------------------------------------------------------------------
# Extraction pipeline
# --------------------------------------------------------------------------


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_creation_input_tokens: int = 0
    cache_read_input_tokens: int = 0


@dataclass
class CallUsage:
    """One Anthropic call's usage, tagged by menu, photo, and kind.

    The kind tag lets the report distinguish the cache-warming details call
    (batch 1) from the calls that should read from cache (batch 2+), per
    SPEC.md's caching requirement and the named bug check in write_report.
    """

    menu_slug: str
    photo_index: int
    kind: str  # index | details_batch_1 | details_batch_n | details_retry
    usage: Usage


def _sum_usage(call_usages: list[CallUsage]) -> Usage:
    total = Usage()
    for c in call_usages:
        total.input_tokens += c.usage.input_tokens
        total.output_tokens += c.usage.output_tokens
        total.cache_creation_input_tokens += c.usage.cache_creation_input_tokens
        total.cache_read_input_tokens += c.usage.cache_read_input_tokens
    return total


def _media_type_for(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in (".jpg", ".jpeg"):
        return "image/jpeg"
    if suffix == ".png":
        return "image/png"
    raise ValueError(f"unsupported image type: {path}")


def _image_block(photo: Path) -> dict:
    """Image-first content block with a prompt-cache breakpoint.

    Mirrors src/extract.ts's imageBlock() exactly: same source shape, same
    cache_control placement.
    """
    data = base64.b64encode(photo.read_bytes()).decode("ascii")
    return {
        "type": "image",
        "source": {"type": "base64", "media_type": _media_type_for(photo), "data": data},
        "cache_control": {"type": "ephemeral"},
    }


def _usage_from_response(resp: Any) -> Usage:
    u = resp.usage
    return Usage(
        input_tokens=u.input_tokens,
        output_tokens=u.output_tokens,
        cache_creation_input_tokens=getattr(u, "cache_creation_input_tokens", 0) or 0,
        cache_read_input_tokens=getattr(u, "cache_read_input_tokens", 0) or 0,
    )


def _extract_json(resp: Any) -> dict:
    """Read json_schema-mode structured output: the first text block,
    JSON-parsed. output_config.format constrains generation, it does not
    change the response envelope (verified against live docs this session).
    """
    for block in resp.content:
        if block.type == "text":
            return json.loads(block.text)
    raise RuntimeError("no text block in Anthropic response")


def _index_params(assets: SharedAssets, photo: Path, model: str) -> dict:
    return {
        "model": model,
        "max_tokens": INDEX_MAX_TOKENS,
        "system": assets.system_prompt,
        "messages": [
            {
                "role": "user",
                "content": [_image_block(photo), {"type": "text", "text": assets.index_task}],
            }
        ],
        "output_config": {"format": {"type": "json_schema", "schema": assets.index_schema}},
    }


def _details_params(assets: SharedAssets, photo: Path, batch_items: list[dict], model: str) -> dict:
    task_text = assets.details_task + "\n\nItems for this batch:\n" + json.dumps(
        [{"n": it["n"], "name": it["name"]} for it in batch_items]
    )
    return {
        "model": model,
        "max_tokens": DETAILS_MAX_TOKENS,
        "system": assets.system_prompt,
        "messages": [
            {
                "role": "user",
                "content": [_image_block(photo), {"type": "text", "text": task_text}],
            }
        ],
        "output_config": {"format": {"type": "json_schema", "schema": assets.details_schema}},
    }


def _url_params(assets: SharedAssets, url: str, model: str) -> dict:
    if assets.url_schema is None or assets.url_task is None:
        raise RuntimeError("url schema or url task prompt not loaded")
    return {
        "model": model,
        "max_tokens": URL_MAX_TOKENS,
        "system": assets.system_prompt,
        "messages": [{"role": "user", "content": f"{url}\n\n{assets.url_task}"}],
        "tools": [
            {
                "type": WEB_FETCH_TOOL_TYPE,
                "name": "web_fetch",
                "max_uses": WEB_FETCH_MAX_USES,
                "max_content_tokens": WEB_FETCH_MAX_CONTENT_TOKENS,
            }
        ],
        "output_config": {"format": {"type": "json_schema", "schema": assets.url_schema}},
    }


def _merge_details_into_index(index_items: list[dict], details_by_n: dict[int, dict]) -> list[dict]:
    merged_items: list[dict] = []
    for idx_item in index_items:
        n = idx_item["n"]
        det = details_by_n.get(n)
        merged = dict(idx_item)
        if det:
            for key in ("ingredients", "wrap", "is_raw", "notes"):
                if key in det:
                    merged[key] = det[key]
        else:
            # Reconcile miss: never silently dropped, flagged instead.
            merged["ingredients"] = []
            merged["wrap"] = "unknown"
            merged["is_raw"] = None
            merged["notes"] = "RECONCILE_MISSING"
        merged_items.append(merged)
    return merged_items


def _run_photo_pipeline(
    client: "anthropic.Anthropic",
    assets: SharedAssets,
    menu_slug: str,
    photo_index: int,
    photo: Path,
    model: str,
) -> tuple[list[dict], list[CallUsage]]:
    """index -> details in batches of 8, batch 1 solo to warm the cache,
    then the rest -> reconcile.

    Mirrors src/extract.ts's request shapes exactly. The browser client's
    concurrency-3 fan-out for the remaining batches is not reproduced here;
    evals run sequentially for determinism and debuggability. That is a
    deliberate, noted divergence from production orchestration, not from
    the request shape, which matches exactly.
    """
    call_usages: list[CallUsage] = []

    index_resp = client.messages.create(**_index_params(assets, photo, model))
    call_usages.append(CallUsage(menu_slug, photo_index, "index", _usage_from_response(index_resp)))
    index_items = _extract_json(index_resp).get("items", [])

    batches = [
        index_items[i : i + DETAILS_BATCH_SIZE] for i in range(0, len(index_items), DETAILS_BATCH_SIZE)
    ]
    details_by_n: dict[int, dict] = {}

    for batch_idx, batch in enumerate(batches):
        kind = "details_batch_1" if batch_idx == 0 else "details_batch_n"
        resp = client.messages.create(**_details_params(assets, photo, batch, model))
        call_usages.append(CallUsage(menu_slug, photo_index, kind, _usage_from_response(resp)))
        for it in _extract_json(resp).get("items", []):
            details_by_n[it["n"]] = it

    # One retry batch for whatever's still missing after the first pass.
    missing = [it for it in index_items if it["n"] not in details_by_n]
    if missing:
        retry_resp = client.messages.create(**_details_params(assets, photo, missing, model))
        call_usages.append(
            CallUsage(menu_slug, photo_index, "details_retry", _usage_from_response(retry_resp))
        )
        for it in _extract_json(retry_resp).get("items", []):
            details_by_n[it["n"]] = it

    merged_items = _merge_details_into_index(index_items, details_by_n)
    return merged_items, call_usages


def _fuzzy_merge(all_photo_items: list[list[dict]]) -> list[dict]:
    """Multi-photo merge and dedupe, per SPEC.md exactly: global id
    photoIndex:n; two items merge only when fuzzy name match (the same
    token_sort_ratio >= 85 rule used for golden scoring) AND compatible
    price (equal, or either side null) both hold; on merge, keep the
    record with more ingredients and union the notes.
    """
    merged: list[dict] = []
    for photo_idx, items in enumerate(all_photo_items):
        for it in items:
            candidate = dict(it)
            candidate["_global_id"] = f"{photo_idx}:{it['n']}"
            match_idx = None
            for i, existing in enumerate(merged):
                name_score = token_sort_ratio(
                    normalize_name(existing["name"]), normalize_name(candidate["name"])
                )
                if name_score < NAME_MATCH_THRESHOLD:
                    continue
                ep, cp = existing.get("price"), candidate.get("price")
                compatible = ep is None or cp is None or abs(float(ep) - float(cp)) < 1e-6
                if compatible:
                    match_idx = i
                    break
            if match_idx is None:
                merged.append(candidate)
                continue
            existing = merged[match_idx]
            if len(candidate.get("ingredients", [])) > len(existing.get("ingredients", [])):
                kept, other = candidate, existing
            else:
                kept, other = existing, candidate
            kept = dict(kept)
            notes = " ".join(x for x in (kept.get("notes"), other.get("notes")) if x)
            kept["notes"] = notes or None
            merged[match_idx] = kept
    return merged


def run_pipeline_for_menu(
    menu: Menu, assets: SharedAssets, model: str, use_batch: bool
) -> tuple[list[dict], list[CallUsage]]:
    """Run the full per-photo index/details/reconcile pipeline plus merge.

    Returns the merged predicted items and the per-call usage records.
    Mirrors src/extract.ts's request shapes, including prompt caching and
    the warm-then-fan-out batch ordering, so evals measure the real system.
    """
    if use_batch:
        return _run_pipeline_for_menu_batch(menu, assets, model)

    client = anthropic.Anthropic()
    per_photo_items: list[list[dict]] = []
    call_usages: list[CallUsage] = []
    for photo_index, photo in enumerate(menu.photos):
        items, usages = _run_photo_pipeline(client, assets, menu.slug, photo_index, photo, model)
        per_photo_items.append(items)
        call_usages.extend(usages)
    merged = _fuzzy_merge(per_photo_items)
    return merged, call_usages


def _poll_batch(client: "anthropic.Anthropic", batch_id: str) -> Any:
    while True:
        batch = client.messages.batches.retrieve(batch_id)
        if batch.processing_status == "ended":
            return batch
        time.sleep(5)


def _run_pipeline_for_menu_batch(
    menu: Menu, assets: SharedAssets, model: str
) -> tuple[list[dict], list[CallUsage]]:
    """Route the full per-photo pipeline through the Message Batches API.

    Two Batches jobs: one for every photo's index call, then (once item
    counts are known) one for every details batch across every photo, then
    a third if any items are still missing after that (mirroring the
    sync path's one-retry rule). Batch results arrive in any order; keyed
    by custom_id throughout. Written in full but only reachable via
    --batch, never invoked this session.
    """
    client = anthropic.Anthropic()
    call_usages: list[CallUsage] = []

    # Request is a TypedDict (anthropic.types.messages.batch_create_params.Request);
    # a plain dict literal satisfies it at runtime with no import needed.
    index_requests = [
        {"custom_id": f"{photo_idx}:index", "params": _index_params(assets, photo, model)}
        for photo_idx, photo in enumerate(menu.photos)
    ]
    index_batch = client.messages.batches.create(requests=index_requests)
    index_batch = _poll_batch(client, index_batch.id)

    index_items_by_photo: dict[int, list[dict]] = {}
    for result in client.messages.batches.results(index_batch.id):
        photo_idx = int(result.custom_id.split(":", 1)[0])
        if result.result.type == "succeeded":
            data = _extract_json(result.result.message)
            index_items_by_photo[photo_idx] = data.get("items", [])
            call_usages.append(
                CallUsage(menu.slug, photo_idx, "index", _usage_from_response(result.result.message))
            )
        else:
            index_items_by_photo[photo_idx] = []

    details_requests = []
    batch_map: dict[str, int] = {}
    for photo_idx, photo in enumerate(menu.photos):
        items = index_items_by_photo.get(photo_idx, [])
        batches = [
            items[i : i + DETAILS_BATCH_SIZE] for i in range(0, len(items), DETAILS_BATCH_SIZE)
        ]
        for batch_idx, batch_items in enumerate(batches):
            custom_id = f"{photo_idx}:{batch_idx}"
            batch_map[custom_id] = photo_idx
            details_requests.append(
                {
                    "custom_id": custom_id,
                    "params": _details_params(assets, photo, batch_items, model),
                }
            )

    details_by_photo: dict[int, dict[int, dict]] = {i: {} for i in range(len(menu.photos))}
    if details_requests:
        details_batch = client.messages.batches.create(requests=details_requests)
        details_batch = _poll_batch(client, details_batch.id)
        for result in client.messages.batches.results(details_batch.id):
            photo_idx = batch_map[result.custom_id]
            batch_idx = int(result.custom_id.split(":", 1)[1])
            kind = "details_batch_1" if batch_idx == 0 else "details_batch_n"
            if result.result.type == "succeeded":
                call_usages.append(
                    CallUsage(menu.slug, photo_idx, kind, _usage_from_response(result.result.message))
                )
                for it in _extract_json(result.result.message).get("items", []):
                    details_by_photo[photo_idx][it["n"]] = it

    missing_by_photo: dict[int, list[dict]] = {}
    for photo_idx in range(len(menu.photos)):
        index_items = index_items_by_photo.get(photo_idx, [])
        missing = [it for it in index_items if it["n"] not in details_by_photo[photo_idx]]
        if missing:
            missing_by_photo[photo_idx] = missing

    if missing_by_photo:
        retry_requests = [
            {
                "custom_id": f"{photo_idx}:retry",
                "params": _details_params(assets, menu.photos[photo_idx], missing, model),
            }
            for photo_idx, missing in missing_by_photo.items()
        ]
        retry_batch = client.messages.batches.create(requests=retry_requests)
        retry_batch = _poll_batch(client, retry_batch.id)
        for result in client.messages.batches.results(retry_batch.id):
            photo_idx = int(result.custom_id.split(":", 1)[0])
            if result.result.type == "succeeded":
                call_usages.append(
                    CallUsage(
                        menu.slug, photo_idx, "details_retry", _usage_from_response(result.result.message)
                    )
                )
                for it in _extract_json(result.result.message).get("items", []):
                    details_by_photo[photo_idx][it["n"]] = it

    per_photo_items: list[list[dict]] = []
    for photo_idx in range(len(menu.photos)):
        index_items = index_items_by_photo.get(photo_idx, [])
        merged_items = _merge_details_into_index(index_items, details_by_photo[photo_idx])
        per_photo_items.append(merged_items)

    merged = _fuzzy_merge(per_photo_items)
    return merged, call_usages


def estimate_cost(usage: Usage) -> float:
    return (
        usage.input_tokens * PRICE_PER_MTOK["input"]
        + usage.cache_creation_input_tokens * PRICE_PER_MTOK["cache_write"]
        + usage.cache_read_input_tokens * PRICE_PER_MTOK["cache_read"]
        + usage.output_tokens * PRICE_PER_MTOK["output"]
    ) / 1_000_000


# --------------------------------------------------------------------------
# Gates and report
# --------------------------------------------------------------------------


def aggregate(scores: list[MenuScore]) -> dict[str, float]:
    total_gold = sum(s.n_gold for s in scores)
    total_pred = sum(s.n_pred for s in scores)
    total_matched = sum(s.n_matched for s in scores)
    macro_f1 = sum(s.ingredient_f1_macro for s in scores) / len(scores) if scores else 0.0
    price_matched = sum(s.price_accuracy * s.n_matched for s in scores)
    return {
        "item_recall": total_matched / total_gold if total_gold else 0.0,
        "item_precision": total_matched / total_pred if total_pred else 0.0,
        "ingredient_f1_macro": macro_f1,
        "price_accuracy": price_matched / total_matched if total_matched else 0.0,
    }


def evaluate_gates(agg: dict[str, float]) -> list[tuple[str, float, float, bool]]:
    rows = []
    for key in ["item_recall", "item_precision", "ingredient_f1_macro", "price_accuracy"]:
        threshold = GATES[key]
        value = agg.get(key, 0.0)
        rows.append((key, value, threshold, value >= threshold))
    return rows


def write_report(
    scores: list[MenuScore],
    agg: dict[str, float],
    gate_rows: list[tuple[str, float, float, bool]],
    total_usage: Usage,
    call_usages: list[CallUsage],
    model: str,
    timestamp: str,
    consistency: Optional[list[dict]] = None,
) -> Path:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    path = REPORTS_DIR / f"{timestamp}.md"
    lines: list[str] = []
    lines.append(f"# Eval report {timestamp}")
    lines.append("")
    lines.append(f"Model: `{model}`")
    lines.append("")
    lines.append("## Gates")
    lines.append("")
    lines.append("| Gate | Measured | Threshold | Result |")
    lines.append("|---|---|---|---|")
    for key, value, threshold, ok in gate_rows:
        lines.append(f"| {key} | {value:.4f} | >= {threshold:.2f} | {'PASS' if ok else 'FAIL'} |")
    lines.append("")
    lines.append("## Per-menu breakdown")
    lines.append("")
    lines.append("| Menu | Items (pred/gold) | Recall | Precision | Ing F1 (macro) | Price acc | Wrap acc |")
    lines.append("|---|---|---|---|---|---|---|")
    for s in scores:
        wrap = f"{s.wrap_accuracy:.3f}" if s.wrap_accuracy is not None else "n/a"
        lines.append(
            f"| {s.slug} | {s.n_pred}/{s.n_gold} | {s.item_recall:.3f} | {s.item_precision:.3f} | "
            f"{s.ingredient_f1_macro:.3f} | {s.price_accuracy:.3f} | {wrap} |"
        )
    lines.append("")
    if consistency:
        lines.append("## Consistency (repeat runs)")
        lines.append("")
        lines.append("| Menu | Item counts per run | Counts identical | Ing F1 per run | F1 spread | Result |")
        lines.append("|---|---|---|---|---|---|")
        for row in consistency:
            counts = "/".join(str(c) for c in row["counts"])
            f1s = "/".join(f"{v:.3f}" for v in row["f1s"])
            ok = "PASS" if row["ok"] else "FAIL"
            lines.append(
                f"| {row['slug']} | {counts} | {'yes' if row['counts_identical'] else 'NO'} | {f1s} | {row['spread']:.4f} | {ok} |"
            )
        lines.append("")
    lines.append("## Token usage and cost")
    lines.append("")
    lines.append(f"- input: {total_usage.input_tokens}")
    lines.append(f"- cache write: {total_usage.cache_creation_input_tokens}")
    lines.append(f"- cache read: {total_usage.cache_read_input_tokens}")
    lines.append(f"- output: {total_usage.output_tokens}")
    lines.append(f"- estimated cost: ${estimate_cost(total_usage):.4f}")
    lines.append("")
    if call_usages:
        lines.append("### Cache counters by call kind")
        lines.append("")
        lines.append("| Kind | Calls | Cache write | Cache read |")
        lines.append("|---|---|---|---|")
        for kind in sorted({c.kind for c in call_usages}):
            kind_calls = [c for c in call_usages if c.kind == kind]
            cw = sum(c.usage.cache_creation_input_tokens for c in kind_calls)
            cr = sum(c.usage.cache_read_input_tokens for c in kind_calls)
            lines.append(f"| {kind} | {len(kind_calls)} | {cw} | {cr} |")
        lines.append("")

        # Named bug check (T-1.11): details batches 2+ should read from the
        # cache the index call and details batch 1 warmed. Zero reads here
        # across every batch-2+ call means caching is broken.
        details_2plus = [c for c in call_usages if c.kind == "details_batch_n"]
        if details_2plus:
            with_reads = [c for c in details_2plus if c.usage.cache_read_input_tokens > 0]
            bug_flag = "ok" if with_reads else "BUG SUSPECTED"
            lines.append(
                f"- cache check (details calls 2+): {len(with_reads)}/{len(details_2plus)} "
                f"had cache reads > 0 [{bug_flag}]"
            )
        else:
            lines.append("- cache check (details calls 2+): no batch-2+ details calls this run")
        lines.append("")
    for s in scores:
        if not s.diffs:
            continue
        lines.append(f"## Diffs: {s.slug}")
        lines.append("")
        for d in s.diffs:
            lines.append(f"- {d}")
        lines.append("")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


# --------------------------------------------------------------------------
# Modes
# --------------------------------------------------------------------------


def cmd_check() -> int:
    """Offline readiness check. Loads what exists, reports what is missing.

    Makes zero API calls, so it is safe to run any time. This is the Phase 0
    proof that the harness plumbing works before any prompt or schema exists.
    """
    print("Sushi Selector eval harness: readiness check (no API calls)")
    print(f"repo root: {REPO_ROOT}")

    try:
        assets = load_shared_assets()
        print("shared assets: loaded")
        print(f"  system.md: {len(assets.system_prompt)} chars")
        print(f"  aliases: {len(assets.aliases)} entries")
        print(f"  url task: {'present' if assets.url_task else 'absent (optional)'}")
    except FileNotFoundError as e:
        print(f"shared assets: NOT READY ({e})")

    menus = discover_menus()
    print(f"scored menus discovered: {len(menus)}")
    for m in menus:
        print(f"  - {m.slug}: {len(m.photos)} photo(s), {len(m.golden.get('items', []))} golden items")

    raw = MENUS_DIR / "raw"
    if raw.exists():
        raw_imgs = [p for p in raw.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"}]
        print(f"raw drop folder: {len(raw_imgs)} original photo(s) kept as provenance (organized into menus)")

    key_present = bool(os.environ.get("ANTHROPIC_API_KEY"))
    print(f"ANTHROPIC_API_KEY in env: {'yes' if key_present else 'no'}")

    # Prove the deterministic scoring layer works, offline, on a tiny fixture.
    _self_test()
    print("scoring self-test: PASS")
    print("\nreadiness check complete. Run --menu <slug> or --all to spend API credits.")
    return 0


def _self_test() -> None:
    """Sanity-check matching and metrics on a hand-built fixture (no API)."""
    gold = [
        {"name": "Spicy Tuna Roll", "price": 8.0, "price_text": "8", "ingredients": ["spicy tuna", "rice", "nori"], "wrap": "nori"},
        {"name": "California Roll", "price": 7.0, "price_text": "7", "ingredients": ["imitation crab", "avocado", "cucumber"], "wrap": "nori"},
    ]
    pred = [
        {"name": "spicy tuna roll", "price": 8.0, "price_text": "8", "ingredients": ["spicy tuna", "rice", "nori"], "wrap": "nori"},
        {"name": "California Roll", "price": 7.0, "price_text": "7", "ingredients": ["krab", "avocado", "cucumber"], "wrap": "nori"},
    ]
    aliases = {"krab": "imitation crab"}
    s = score_menu("fixture", pred, gold, aliases)
    assert s.n_matched == 2, s.n_matched
    assert abs(s.item_recall - 1.0) < 1e-9
    assert abs(s.item_precision - 1.0) < 1e-9
    assert abs(s.price_accuracy - 1.0) < 1e-9
    # With the alias table, krab -> imitation crab, so ingredient F1 is perfect.
    assert abs(s.ingredient_f1_macro - 1.0) < 1e-9, s.ingredient_f1_macro


def cmd_run(args: argparse.Namespace) -> int:
    """Full or single-menu scored run. Requires the Phase 1 pipeline."""
    model = os.environ.get("MODEL", DEFAULT_MODEL)
    try:
        assets = load_shared_assets()
    except FileNotFoundError as e:
        print(f"cannot run: {e}", file=sys.stderr)
        print("run `uv run evals/run_evals.py --check` for readiness.", file=sys.stderr)
        return 2

    menus = discover_menus()
    if args.menu:
        menus = [m for m in menus if m.slug == args.menu]
        if not menus:
            print(f"no menu with slug '{args.menu}'", file=sys.stderr)
            return 2
    if not menus:
        print("no scored menus found under evals/menus/", file=sys.stderr)
        return 2

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY not set", file=sys.stderr)
        return 2

    repeat = max(1, args.repeat)
    all_call_usages: list[CallUsage] = []
    scores: list[MenuScore] = []
    consistency: list[dict] = []

    for menu in menus:
        run_scores: list[MenuScore] = []
        for r in range(repeat):
            print(f"running {menu.slug}" + (f" (run {r + 1}/{repeat})" if repeat > 1 else ""))
            pred, call_usages = run_pipeline_for_menu(menu, assets, model, args.batch)
            all_call_usages.extend(call_usages)
            run_scores.append(score_menu(menu.slug, pred, menu.golden.get("items", []), assets.aliases))
        scores.append(run_scores[0])
        if repeat > 1:
            counts = [s.n_pred for s in run_scores]
            f1s = [s.ingredient_f1_macro for s in run_scores]
            spread = max(f1s) - min(f1s)
            counts_identical = len(set(counts)) == 1
            consistency.append(
                {
                    "slug": menu.slug,
                    "counts": counts,
                    "counts_identical": counts_identical,
                    "f1s": f1s,
                    "spread": spread,
                    "ok": counts_identical and spread <= GATES["consistency_f1_spread_max"],
                }
            )

    total_usage = _sum_usage(all_call_usages)
    agg = aggregate(scores)
    gate_rows = evaluate_gates(agg)
    timestamp = args.timestamp or _default_timestamp()
    path = write_report(scores, agg, gate_rows, total_usage, all_call_usages, model, timestamp, consistency or None)
    print(f"report written: {path}")
    all_pass = all(ok for *_x, ok in gate_rows)
    if consistency:
        all_pass = all_pass and all(row["ok"] for row in consistency)
    print("GATES: " + ("PASS" if all_pass else "FAIL"))
    return 0 if all_pass else 1


def _default_timestamp() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def cmd_url_smoke(args: argparse.Namespace) -> int:
    """Loose, ungated URL-path smoke checks against --urls.

    Per EVALS.md these never contribute to the pass/fail gates (there is no
    URL golden set); they only report item and section counts per URL.
    Genuinely inert without --urls: prints usage guidance and exits without
    touching the network.
    """
    if not args.urls:
        print("no --urls given; nothing to smoke-test. Example:", file=sys.stderr)
        print("  uv run evals/run_evals.py --url-smoke --urls https://example.com/menu", file=sys.stderr)
        return 2
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY not set", file=sys.stderr)
        return 2
    try:
        assets = load_shared_assets()
    except FileNotFoundError as e:
        print(f"cannot run: {e}", file=sys.stderr)
        return 2
    if assets.url_task is None or assets.url_schema is None:
        print("url task or url schema missing; cannot smoke-test", file=sys.stderr)
        return 2

    model = os.environ.get("MODEL", DEFAULT_MODEL)
    client = anthropic.Anthropic()
    for url in args.urls:
        try:
            resp = client.messages.create(**_url_params(assets, url, model))
            data = _extract_json(resp)
            n_items = len(data.get("items", []))
            n_sections = len(data.get("sections", []))
            print(f"{url}: {n_items} item(s), {n_sections} section(s)")
            if n_items < 5:
                print("  NOTE: fewer than 5 items, matches SPEC.md's low-yield URL warning")
        except Exception as e:  # smoke checks report failures, never raise
            print(f"{url}: FAILED to parse structured output ({e})")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Sushi Selector eval harness")
    p.add_argument("--check", action="store_true", help="offline readiness check, no API calls")
    p.add_argument("--all", action="store_true", help="run every menu in the golden set")
    p.add_argument("--menu", type=str, help="run a single menu by slug")
    p.add_argument("--repeat", type=int, default=1, help="consistency runs per menu")
    p.add_argument("--batch", action="store_true", help="route via the Message Batches API")
    p.add_argument("--url-smoke", action="store_true", help="loose URL-path smoke checks (reported, not gated)")
    p.add_argument("--urls", type=str, nargs="*", help="URLs for --url-smoke (space separated)")
    p.add_argument("--timestamp", type=str, help="report filename stem (caller supplies a real timestamp)")
    return p


def main(argv: list[str]) -> int:
    args = build_parser().parse_args(argv)
    if args.check:
        return cmd_check()
    if args.url_smoke:
        return cmd_url_smoke(args)
    if args.all or args.menu:
        return cmd_run(args)
    build_parser().print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
