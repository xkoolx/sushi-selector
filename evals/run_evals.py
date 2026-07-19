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

STATUS: Phase 0 skeleton. The deterministic layer (asset loading, menu
discovery, matching, metrics, gates, reporting) is implemented and testable
offline via --check. The extraction pipeline call is stubbed and raises until
Phase 1 wires it (T-1.5, T-1.13) so no run can spend API credits by accident.
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
# Extraction pipeline (stubbed until Phase 1)
# --------------------------------------------------------------------------


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_creation_input_tokens: int = 0
    cache_read_input_tokens: int = 0


def run_pipeline_for_menu(
    menu: Menu, assets: SharedAssets, model: str, use_batch: bool
) -> tuple[list[dict], Usage]:
    """Run the full per-photo index/details/reconcile pipeline plus merge.

    Returns the merged predicted items and aggregate token usage. Mirrors the
    production request shapes, including prompt caching and the warm-then-fan-out
    orchestration, so evals measure the real system.

    NOT YET WIRED. Phase 1 (T-1.5 provider/Anthropic impl, T-1.12 iteration)
    implements this. It stays a hard stop so an accidental run cannot spend API
    credits before the prompts and schemas exist and Tom has approved spend.
    """
    raise NotImplementedError(
        "Extraction pipeline is not wired yet (Phase 1: T-1.5 / T-1.12). "
        "Run `uv run evals/run_evals.py --check` for an offline readiness check."
    )


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
        print(f"raw drop folder: {len(raw_imgs)} unsorted photo(s) awaiting T-1.10 organization")

    key_present = bool(os.environ.get("ANTHROPIC_API_KEY"))
    print(f"ANTHROPIC_API_KEY in env: {'yes' if key_present else 'no'}")

    # Prove the deterministic scoring layer works, offline, on a tiny fixture.
    _self_test()
    print("scoring self-test: PASS")
    print("\nreadiness check complete. Extraction pipeline wiring lands in Phase 1.")
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

    total_usage = Usage()
    scores: list[MenuScore] = []
    for menu in menus:
        pred, usage = run_pipeline_for_menu(menu, assets, model, args.batch)
        for f_ in ("input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"):
            setattr(total_usage, f_, getattr(total_usage, f_) + getattr(usage, f_))
        scores.append(score_menu(menu.slug, pred, menu.golden.get("items", []), assets.aliases))

    agg = aggregate(scores)
    gate_rows = evaluate_gates(agg)
    timestamp = args.timestamp or "report"
    path = write_report(scores, agg, gate_rows, total_usage, model, timestamp)
    print(f"report written: {path}")
    all_pass = all(ok for *_x, ok in gate_rows)
    print("GATES: " + ("PASS" if all_pass else "FAIL"))
    return 0 if all_pass else 1


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Sushi Selector eval harness")
    p.add_argument("--check", action="store_true", help="offline readiness check, no API calls")
    p.add_argument("--all", action="store_true", help="run every menu in the golden set")
    p.add_argument("--menu", type=str, help="run a single menu by slug")
    p.add_argument("--repeat", type=int, default=1, help="consistency runs per menu")
    p.add_argument("--batch", action="store_true", help="route via the Message Batches API")
    p.add_argument("--url-smoke", action="store_true", help="loose URL-path smoke checks (reported, not gated)")
    p.add_argument("--timestamp", type=str, help="report filename stem (caller supplies a real timestamp)")
    return p


def main(argv: list[str]) -> int:
    args = build_parser().parse_args(argv)
    if args.check:
        return cmd_check()
    if args.url_smoke:
        print("URL smoke checks are wired in Phase 1 (T-1.13, T-1.14).", file=sys.stderr)
        return 2
    if args.all or args.menu:
        return cmd_run(args)
    build_parser().print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
