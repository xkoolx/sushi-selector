# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "anthropic>=0.92",
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

STATUS: Phase 1. The extraction pipeline is wired and mirrors the production
request shapes exactly: system prompt from shared/prompts/, structured outputs
constrained to shared/schema/, prompt caching with the breakpoint on the image
block, and warm-then-fan-out details scheduling. Scored runs require
ANTHROPIC_API_KEY in the environment and spend real credits.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

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


def normalize_name(name: Optional[str]) -> str:
    if not isinstance(name, str):
        return ""
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
# Extraction pipeline (Phase 1: mirrors production request shapes)
# --------------------------------------------------------------------------


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_creation_input_tokens: int = 0
    cache_read_input_tokens: int = 0

    def add(self, message_usage: Any) -> None:
        for f_ in (
            "input_tokens",
            "output_tokens",
            "cache_creation_input_tokens",
            "cache_read_input_tokens",
        ):
            v = getattr(message_usage, f_, None)
            if isinstance(v, int):
                setattr(self, f_, getattr(self, f_) + v)


DETAILS_BATCH_SIZE = 8
DETAILS_CONCURRENCY = 3
MEDIA_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}

# Basic web fetch variant: the dynamic-filtering variants require Opus or
# Sonnet tier models and the pinned model is Haiku 4.5. Matches src/extract.ts.
WEB_FETCH_TOOL = {
    "type": "web_fetch_20250910",
    "name": "web_fetch",
    "max_uses": 3,
    "max_content_tokens": 40000,
}


def _photo_block(photo: Path) -> dict:
    import base64

    media = MEDIA_TYPES.get(photo.suffix.lower())
    if media is None:
        raise ValueError(f"unsupported photo type: {photo}")
    data = base64.b64encode(photo.read_bytes()).decode("ascii")
    # The cache breakpoint lives on the image block, exactly as in
    # src/extract.ts, so details calls read (system + image) at the cached
    # rate once the warm call has landed.
    return {
        "type": "image",
        "source": {"type": "base64", "media_type": media, "data": data},
        "cache_control": {"type": "ephemeral"},
    }


def _index_params(assets: SharedAssets, model: str, image_block: dict) -> dict:
    return {
        "model": model,
        "max_tokens": 2048,
        "system": [{"type": "text", "text": assets.system_prompt}],
        "messages": [
            {
                "role": "user",
                "content": [image_block, {"type": "text", "text": assets.index_task}],
            }
        ],
        "output_config": {"format": {"type": "json_schema", "schema": assets.index_schema}},
    }


def _details_params(
    assets: SharedAssets, model: str, image_block: dict, items: list[dict]
) -> dict:
    refs = [{"n": it["n"], "name": it["name"]} for it in items]
    return {
        "model": model,
        "max_tokens": 2048,
        "system": [{"type": "text", "text": assets.system_prompt}],
        "messages": [
            {
                "role": "user",
                "content": [
                    image_block,
                    {"type": "text", "text": assets.details_task + json.dumps(refs)},
                ],
            }
        ],
        "output_config": {"format": {"type": "json_schema", "schema": assets.details_schema}},
    }


def _parse_structured(message: Any) -> dict:
    text = None
    for block in reversed(message.content):
        if getattr(block, "type", None) == "text":
            text = block.text
            break
    if text is None:
        raise RuntimeError(f"no text block in response (stop_reason={message.stop_reason})")
    return json.loads(text)


def _create(client: Any, params: dict) -> Any:
    return client.messages.create(**params)


def _batches(items: list[dict]) -> list[list[dict]]:
    return [items[i : i + DETAILS_BATCH_SIZE] for i in range(0, len(items), DETAILS_BATCH_SIZE)]


def _run_photo(
    client: Any, assets: SharedAssets, model: str, photo: Path, usage: Usage
) -> list[dict]:
    """Index, details (warm then fan out), reconcile for a single photo."""
    from concurrent.futures import ThreadPoolExecutor

    image_block = _photo_block(photo)

    index_msg = _create(client, _index_params(assets, model, image_block))
    usage.add(index_msg.usage)
    index_result = _parse_structured(index_msg)
    index_items = index_result.get("items", [])

    details_by_n: dict[int, dict] = {}
    call_count = 0

    def run_batch(batch: list[dict]) -> None:
        nonlocal call_count
        msg = _create(client, _details_params(assets, model, image_block, batch))
        usage.add(msg.usage)
        call_count += 1
        # Zero cache reads on details calls after the first means the prompt
        # prefix is not caching, which is a bug per SPEC (system.md must keep
        # system + image above the 4,096 token floor).
        if call_count > 1 and getattr(msg.usage, "cache_read_input_tokens", 0) == 0:
            print(
                f"  WARNING: details call {call_count} on {photo.name} had zero cache reads",
                file=sys.stderr,
            )
        for item in _parse_structured(msg).get("items", []):
            details_by_n[item["n"]] = item

    batches = _batches(index_items)
    if batches:
        # Batch 1 alone warms the cache (entries become readable only after
        # the first response begins), then the rest fan out.
        run_batch(batches[0])
        rest = batches[1:]
        if rest:
            with ThreadPoolExecutor(max_workers=DETAILS_CONCURRENCY) as pool:
                list(pool.map(run_batch, rest))

    # One retry pass for index items missing from the details results.
    missing = [it for it in index_items if it["n"] not in details_by_n]
    for retry_batch in _batches(missing):
        try:
            run_batch(retry_batch)
        except Exception as e:  # noqa: BLE001
            print(f"  retry batch failed on {photo.name}: {e}", file=sys.stderr)
    still_missing = [it for it in index_items if it["n"] not in details_by_n]
    if still_missing:
        names = ", ".join(it["name"] for it in still_missing)
        print(f"  UNRECONCILED after retry on {photo.name}: {names}", file=sys.stderr)

    reconciled = []
    for it in index_items:
        d = details_by_n.get(it["n"])
        reconciled.append(
            {
                "name": it["name"],
                "section": it.get("section"),
                "price_text": it.get("price_text"),
                "price": it.get("price"),
                "ingredients": (d or {}).get("ingredients", []),
                "wrap": (d or {}).get("wrap", "unknown"),
                "is_raw": (d or {}).get("is_raw"),
                "notes": (d or {}).get("notes"),
                "flagged": d is None,
            }
        )
    return reconciled


def _price_compatible(a: dict, b: dict) -> bool:
    if a.get("price") is None or b.get("price") is None:
        return True
    return abs(float(a["price"]) - float(b["price"])) < 1e-6


def merge_photos(per_photo: list[list[dict]]) -> list[dict]:
    """Merge in photo order with the SPEC dual-condition dedupe: fuzzy name
    match (token_sort_ratio >= 85) AND compatible price. Keep the record with
    more ingredients, union the notes."""
    merged: list[dict] = []
    for items in per_photo:
        for item in items:
            dup = None
            for m in merged:
                score = token_sort_ratio(normalize_name(m["name"]), normalize_name(item["name"]))
                if score >= NAME_MATCH_THRESHOLD and _price_compatible(m, item):
                    dup = m
                    break
            if dup is None:
                merged.append(dict(item))
                continue
            winner = item if len(item.get("ingredients") or []) > len(dup.get("ingredients") or []) else dup
            notes = [n for n in (dup.get("notes"), item.get("notes")) if n]
            dup.update(winner)
            dup["notes"] = "; ".join(dict.fromkeys(notes)) if notes else None
            dup["flagged"] = bool(dup.get("flagged")) and bool(item.get("flagged"))
    return merged


def _make_client() -> Any:
    import anthropic

    return anthropic.Anthropic()


def run_pipeline_for_menu(
    menu: Menu, assets: SharedAssets, model: str, use_batch: bool
) -> tuple[list[dict], Usage]:
    """Run the full per-photo index/details/reconcile pipeline plus merge.

    Returns the merged predicted items and aggregate token usage. Mirrors the
    production request shapes, including prompt caching and the
    warm-then-fan-out orchestration, so evals measure the real system.
    """
    if use_batch:
        return _run_menu_batched(menu, assets, model)

    client = _make_client()
    usage = Usage()
    per_photo = [
        _run_photo(client, assets, model, photo, usage) for photo in menu.photos
    ]
    return merge_photos(per_photo), usage


# --------------------------------------------------------------------------
# Message Batches routing (--batch): 50 percent cheaper for tuning sweeps
# where latency does not matter. Index calls for all photos go in one batch,
# then details calls in a second batch; the missing-item retry pass falls
# back to direct calls because it is small.
# --------------------------------------------------------------------------


def _batch_execute(client: Any, requests: list[dict]) -> dict[str, Any]:
    import time

    batch = client.messages.batches.create(requests=requests)
    while True:
        batch = client.messages.batches.retrieve(batch.id)
        if batch.processing_status == "ended":
            break
        time.sleep(15)

    results: dict[str, Any] = {}
    for entry in client.messages.batches.results(batch.id):
        if entry.result.type == "succeeded":
            results[entry.custom_id] = entry.result.message
        else:
            print(f"  batch entry {entry.custom_id}: {entry.result.type}", file=sys.stderr)
    return results


def _run_menu_batched(
    menu: Menu, assets: SharedAssets, model: str
) -> tuple[list[dict], Usage]:
    client = _make_client()
    usage = Usage()

    image_blocks = {photo: _photo_block(photo) for photo in menu.photos}

    index_requests = [
        {
            "custom_id": f"index-{i}",
            "params": _index_params(assets, model, image_blocks[photo]),
        }
        for i, photo in enumerate(menu.photos)
    ]
    index_msgs = _batch_execute(client, index_requests)

    index_by_photo: dict[int, list[dict]] = {}
    for i in range(len(menu.photos)):
        msg = index_msgs.get(f"index-{i}")
        if msg is None:
            index_by_photo[i] = []
            continue
        usage.add(msg.usage)
        index_by_photo[i] = _parse_structured(msg).get("items", [])

    details_requests = []
    for i, photo in enumerate(menu.photos):
        for j, batch in enumerate(_batches(index_by_photo[i])):
            details_requests.append(
                {
                    "custom_id": f"details-{i}-{j}",
                    "params": _details_params(assets, model, image_blocks[photo], batch),
                }
            )
    details_msgs = _batch_execute(client, details_requests) if details_requests else {}

    per_photo: list[list[dict]] = []
    for i, photo in enumerate(menu.photos):
        details_by_n: dict[int, dict] = {}
        for j, _batch in enumerate(_batches(index_by_photo[i])):
            msg = details_msgs.get(f"details-{i}-{j}")
            if msg is None:
                continue
            usage.add(msg.usage)
            for item in _parse_structured(msg).get("items", []):
                details_by_n[item["n"]] = item

        # Small retry pass runs direct, not batched.
        missing = [it for it in index_by_photo[i] if it["n"] not in details_by_n]
        for retry_batch in _batches(missing):
            try:
                msg = _create(client, _details_params(assets, model, image_blocks[photo], retry_batch))
                usage.add(msg.usage)
                for item in _parse_structured(msg).get("items", []):
                    details_by_n[item["n"]] = item
            except Exception as e:  # noqa: BLE001
                print(f"  batched retry failed on {photo.name}: {e}", file=sys.stderr)

        per_photo.append(
            [
                {
                    "name": it["name"],
                    "section": it.get("section"),
                    "price_text": it.get("price_text"),
                    "price": it.get("price"),
                    "ingredients": (details_by_n.get(it["n"]) or {}).get("ingredients", []),
                    "wrap": (details_by_n.get(it["n"]) or {}).get("wrap", "unknown"),
                    "is_raw": (details_by_n.get(it["n"]) or {}).get("is_raw"),
                    "notes": (details_by_n.get(it["n"]) or {}).get("notes"),
                    "flagged": it["n"] not in details_by_n,
                }
                for it in index_by_photo[i]
            ]
        )

    return merge_photos(per_photo), usage


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
    print("\nreadiness check complete. Scored runs need ANTHROPIC_API_KEY and spend credits.")
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
    total_usage = Usage()
    scores: list[MenuScore] = []
    consistency: list[dict] = []

    for menu in menus:
        run_scores: list[MenuScore] = []
        for r in range(repeat):
            print(f"running {menu.slug}" + (f" (run {r + 1}/{repeat})" if repeat > 1 else ""))
            pred, usage = run_pipeline_for_menu(menu, assets, model, args.batch)
            for f_ in ("input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"):
                setattr(total_usage, f_, getattr(total_usage, f_) + getattr(usage, f_))
            run_scores.append(score_menu(menu.slug, pred, menu.golden.get("items", []), assets.aliases))
        # Run 1 feeds the accuracy gates; every run feeds the consistency gate.
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

    agg = aggregate(scores)
    gate_rows = evaluate_gates(agg)
    timestamp = args.timestamp or _default_timestamp()
    path = write_report(scores, agg, gate_rows, total_usage, model, timestamp, consistency or None)
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
    """Loose URL-path smoke checks (T-1.14): reported, not gated.

    Runs the combined single-call URL extraction against 1 or 2 live menu
    URLs supplied with --url and applies loose assertions only, because live
    pages change and are not hand-labeled goldens.
    """
    model = os.environ.get("MODEL", DEFAULT_MODEL)
    try:
        assets = load_shared_assets()
    except FileNotFoundError as e:
        print(f"cannot run: {e}", file=sys.stderr)
        return 2
    if not assets.url_task:
        print("shared/prompts/url-task.md is missing", file=sys.stderr)
        return 2
    urls = args.url or []
    if not urls:
        print("supply 1 or 2 URLs with --url https://...", file=sys.stderr)
        return 2
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY not set", file=sys.stderr)
        return 2

    url_schema = json.loads(_read_text(SCHEMA_DIR / "url.schema.json"))
    client = _make_client()
    ok = True
    for url in urls:
        print(f"\nURL smoke: {url}")
        params = {
            "model": model,
            "max_tokens": 8192,
            "system": [{"type": "text", "text": assets.system_prompt}],
            "messages": [
                {"role": "user", "content": [{"type": "text", "text": assets.url_task + url}]}
            ],
            "tools": [WEB_FETCH_TOOL],
            "output_config": {"format": {"type": "json_schema", "schema": url_schema}},
        }
        try:
            msg = _create(client, params)
            result = _parse_structured(msg)
        except Exception as e:  # noqa: BLE001
            print(f"  FAIL: {e}")
            ok = False
            continue
        items = result.get("items", [])
        sections = [s.get("name") for s in result.get("sections", [])]
        print(f"  items: {len(items)}, sections: {sections}")
        for it in items[:5]:
            print(f"    - {it.get('name')} ({it.get('price_text')}): {it.get('ingredients')}")
        # Under 5 items is the SPEC threshold for the snap-a-photo suggestion.
        if len(items) < 5:
            print("  WARN: fewer than 5 items, the app would suggest snapping a photo")
        with_ingredients = sum(1 for it in items if it.get("ingredients"))
        print(f"  items with ingredients: {with_ingredients}/{len(items)}")
    return 0 if ok else 1


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Sushi Selector eval harness")
    p.add_argument("--check", action="store_true", help="offline readiness check, no API calls")
    p.add_argument("--all", action="store_true", help="run every menu in the golden set")
    p.add_argument("--menu", type=str, help="run a single menu by slug")
    p.add_argument("--repeat", type=int, default=1, help="consistency runs per menu")
    p.add_argument("--batch", action="store_true", help="route via the Message Batches API")
    p.add_argument("--url-smoke", action="store_true", help="loose URL-path smoke checks (reported, not gated)")
    p.add_argument("--url", action="append", help="menu URL for --url-smoke (repeatable)")
    p.add_argument("--timestamp", type=str, help="report filename stem (defaults to the current UTC time)")
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
