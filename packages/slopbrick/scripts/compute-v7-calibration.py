#!/usr/bin/env python3
"""v7 calibration on the full corpus (v0.14.5d).

Reads the v7 corpus scan outputs from `scan-corpus-robust-v2.ts` and
produces per-rule calibration metrics: TP (pos fires), FP (neg fires),
precision, FPR, lift, and a verdict.

Verdict scheme (post v0.12.2):
  - HYGIENE:  rule is `aiSpecific: false` and never an AI signal
              (these are quality / health checks; calibration still
              records TP/FP for completeness)
  - USEFUL:   P >= 0.5 and lift >= 2 (precise AI signal)
  - OK:       P >= 0.3 and lift >= 1.5
  - NOISY:    fires in both arms without enough lift
  - INVERTED: fires more in neg than pos (lift < 1.0)
  - DORMANT:  zero fires in both arms (rule does nothing)

Outputs:
  - src/rules/signal-strength.json  (rule registry's calibration)
  - docs/research/v7-corpus-calibration.md  (human-readable report)

Usage: python3 scripts/compute-v7-calibration.py [--min-date YYYY-MM-DD] [--no-date-filter]
"""
import json
import os
import re
import sys
from collections import Counter
from pathlib import Path

# v0.18.2 PR-1k: read CORPUS_ROOT from the same env var the TS
# code uses (src/corpus-paths.ts → SLOPBRICK_CORPUS_DIR).
# Default matches the TS default. If you change one, change both.
CORPUS_ROOT = Path(os.environ.get("SLOPBRICK_CORPUS_DIR", "/Users/cheng/corpus-expansion"))
SCAN_ROOT = Path("/tmp")  # scan output files land here
REPO = Path(__file__).resolve().parent.parent
RULE_DIR = REPO / "src/rules"
DOCS_DIR = REPO / "docs/research"

# CLI args
min_date = "2025-01-01"
date_filter_enabled = True
for arg in sys.argv[1:]:
    if arg == "--no-date-filter":
        date_filter_enabled = False
    elif arg.startswith("--min-date="):
        min_date = arg.split("=", 1)[1]
    elif re.match(r"\d{4}-\d{2}-\d{2}", arg):
        min_date = arg

print(f"v7 calibration: min-date={min_date}, date_filter={'on' if date_filter_enabled else 'off'}")


def load_scan(path: Path) -> dict:
    if not path.exists():
        sys.exit(f"Missing scan output: {path}")
    return json.load(open(path))


def to_set(per_file_value) -> set[str]:
    """Normalize perFileFires value (could be list, set, or count) → set."""
    if isinstance(per_file_value, set):
        return per_file_value
    if isinstance(per_file_value, list):
        return set(per_file_value)
    if isinstance(per_file_value, int):
        # Old format: count only — no symlink names available, skip intersection
        return set()
    return set()


def format_lift(value: float) -> str:
    """Format a lift value (potentially infinite) as a 1-decimal string."""
    if value == float("inf"):
        return "inf"
    if value == float("-inf"):
        return "-inf"
    return f"{value:.1f}"


def filter_fires_by_date(scan: dict, meta: dict | None, min_date_str: str) -> dict:
    """Drop fires whose symlink target's lastCommitDate < min_date."""
    if not date_filter_enabled or not meta or "files" not in meta:
        if not meta:
            print(f"  WARN: no metadata for filter; using all files")
        return scan

    files = meta.get("files", {})
    keep: set[str] = set()
    for symlink, info in files.items():
        d = info.get("lastCommitDate", "unknown")
        if d == "unknown" or d >= min_date_str:
            keep.add(symlink)

    # preFileFires values are absolute paths; keep has relative
    # symlink names. Build a short-form lookup: for each perFileFires
    # value, strip the corpus root prefix once, then check keep.
    # We don't know the prefix at filter time, so use the filename
    # component (which is what `__` symlink names encode).
    # For 184k files × 64 rules, the inner loop is O(64 × N) total.
    # We make each check O(1) by indexing keep by filename.
    keep_by_basename: dict[str, set[str]] = {}
    for k in keep:
        basename = k.rsplit("/", 1)[-1]
        keep_by_basename.setdefault(basename, set()).add(k)
    # Also full-path key for rare exact matches.
    keep_full: set[str] = set(keep)

    filtered = dict(scan)
    per_file = filtered.get("perFileFires", {})
    new_per_file = {}
    new_fires = {}
    for rule, files_set in per_file.items():
        files_set = to_set(files_set)
        kept: set[str] = set()
        for f in files_set:
            if f in keep_full:
                kept.add(f)
                continue
            basename = f.rsplit("/", 1)[-1]
            if basename in keep_by_basename:
                kept.add(f)
        if kept:
            new_per_file[rule] = sorted(kept)
            new_fires[rule] = len(kept)
    filtered["perFileFires"] = new_per_file
    filtered["fires"] = new_fires
    filtered["files"] = len(keep)
    return filtered


# Load v7 scan outputs (current scanner writes these filenames)
NEG = load_scan(SCAN_ROOT / "v7-full-neg-fires.json")
POS = load_scan(SCAN_ROOT / "v7-full-pos-fires.json")

# Load metadata (for date filter)
neg_meta_path = CORPUS_ROOT / "v7/scan/v7-full-neg/metadata.json"
pos_meta_path = CORPUS_ROOT / "v7/scan/v7-full-pos/metadata.json"
neg_meta = json.load(open(neg_meta_path)) if neg_meta_path.exists() else None
pos_meta = json.load(open(pos_meta_path)) if pos_meta_path.exists() else None

# Apply date filter
NEG = filter_fires_by_date(NEG, neg_meta, min_date)
POS = filter_fires_by_date(POS, pos_meta, min_date)

n_neg = NEG["files"]
n_pos = POS["files"]
print(f"\nAfter date filter: {n_neg} neg files, {n_pos} pos files")
print(f"  neg issues: {NEG.get('issueCount', 0)}, neg rules: {NEG.get('uniqueRules', 0)}")
print(f"  pos issues: {POS.get('issueCount', 0)}, pos rules: {POS.get('uniqueRules', 0)}")
print()

neg_per_file = {r: to_set(v) for r, v in NEG.get("perFileFires", {}).items()}
pos_per_file = {r: to_set(v) for r, v in POS.get("perFileFires", {}).items()}

# Combined rule universe (every rule that ever fired, plus all registered rules)
all_rules = sorted(
    set(neg_per_file.keys()) | set(pos_per_file.keys())
    | set(NEG.get("fires", {}).keys()) | set(POS.get("fires", {}).keys())
)

# Load rule-level aiSpecific from the rule source files
rule_ai_specific: dict[str, bool] = {}
for ts in RULE_DIR.rglob("*.ts"):
    text = ts.read_text(encoding="utf-8")
    m = re.search(
        r"id:\s*['\"]([^'\"]+)['\"][^}]*?aiSpecific:\s*(true|false)",
        text,
        re.DOTALL,
    )
    if m:
        rule_ai_specific[m.group(1)] = (m.group(2) == "true")

# Per-rule table
rows = []
for rule in all_rules:
    pos_set = pos_per_file.get(rule, set())
    neg_set = neg_per_file.get(rule, set())
    tp = len(pos_set)
    fp = len(neg_set)
    p = tp / (tp + fp) if (tp + fp) > 0 else 0
    r = tp / n_pos if n_pos > 0 else 0
    fpr = fp / n_neg if n_neg > 0 else 0
    lift = r / fpr if fpr > 0 else (float("inf") if tp > 0 else 0)

    ai_spec = rule_ai_specific.get(rule)

    if tp == 0 and fp == 0:
        verdict = "DORMANT"
    elif ai_spec is False:
        # Non-AI rules get HYGIENE — they're not meant to be AI signals
        verdict = "HYGIENE"
    elif lift < 1.0:
        verdict = "INVERTED"
    elif p >= 0.5 and lift >= 2:
        verdict = "USEFUL"
    elif p >= 0.3 and lift >= 1.5:
        verdict = "OK"
    else:
        verdict = "NOISY"

    rows.append({
        "rule": rule,
        "aiSpecific": ai_spec,
        "tp": tp, "fp": fp,
        "p": p, "r": r, "fpr": fpr, "lift": lift,
        "verdict": verdict,
    })

# Sort by lift desc (INVERTED at the bottom, DORMANT last)
rows.sort(key=lambda r: (
    -1 if r["verdict"] == "DORMANT" else
    -1 if r["verdict"] == "INVERTED" else
    r["lift"] if r["lift"] != float("inf") else float("inf")
), reverse=True)

# Print summary
print(f'{"Rule":<48} {"AI":<3} {"TP":>7} {"FP":>7} {"P":>7} {"FPR":>7} {"Lift":>8} {"Verdict":<10}')
print("-" * 116)
for r in rows:
    lift_str = f"{r['lift']:.1f}" if r["lift"] != float("inf") else "inf"
    ai_mark = "Y" if r["aiSpecific"] is True else ("N" if r["aiSpecific"] is False else "?")
    print(
        f"  {r['rule']:<46} {ai_mark:<3} {r['tp']:>7} {r['fp']:>7} "
        f"{r['p']*100:>6.1f}% {r['fpr']*100:>6.2f}% {lift_str:>8} {r['verdict']:<10}"
    )

v_counts = Counter(r["verdict"] for r in rows)
print(f"\nVerdict distribution (min-date={min_date}):")
for v in ["USEFUL", "OK", "NOISY", "INVERTED", "DORMANT", "HYGIENE"]:
    print(f"  {v}: {v_counts[v]}")
print(f"  Total: {len(rows)}")

# Update signal-strength.json
signal_path = REPO / "src/rules/signal-strength.json"
signal = json.load(open(signal_path)) if signal_path.exists() else {}
now = "2026-06-27T12:00:00Z"
for r in rows:
    lift = min(99.99, r["lift"]) if r["lift"] != float("inf") else 99.99
    entry = {
        "recall": round(r["r"], 4),
        "fpRate": round(r["fpr"], 4),
        "ratio": round(lift, 2),
        "precision": round(r["p"], 4),
        "lastCalibratedAt": now,
        "verdict": r["verdict"],
        # v0.18.2 PR-2: write the rule's `aiSpecific` to the entry.
        # This was missing before — the entry dict (lines 240-258
        # in v0.18.1) only had recall/fpRate/ratio/precision/
        # lastCalibratedAt/verdict/_calibrationNote, and the script
        # overwrote `signal[r["rule"]]` on every run. Result: the
        # JSON's `aiSpecific` field was wiped on every calibration,
        # the Zod schema accepted the absent field, and the engine
        # read `aiSpecific === true` as false for every rule —
        # making compositeScore return the constant prior (0.428)
        # for every file, every time. v0.17.3 B5 added the field to
        # the Zod schema but the data was never actually written.
        # r["aiSpecific"] is set at line 202-204 (the row dict),
        # populated from rule_ai_specific (line 162-172, regex scan
        # of the rule source).
        "aiSpecific": r["aiSpecific"],
        "_calibrationNote": (
            f"v7 corpus re-calibration (2026-06-27, min-date={min_date}): "
            f"{n_neg} neg + {n_pos} pos. {r['verdict']} — TP={r['tp']}, FP={r['fp']}, "
            f"P={r['p']*100:.1f}%, FPR={r['fpr']*100:.2f}%, lift="
            f"{'inf' if r['lift'] == float('inf') else format_lift(r['lift'])}."
            # v0.18.2 PR-2: dropped the redundant `aiSpecific={...}` suffix.
            # The rule's `aiSpecific` is a real top-level field on this
            # entry (written just above); the textual repetition here
            # was a drift hazard — the drift detector in
            # `tests/ai-specific-drift.test.ts` is the single
            # source-of-truth check.
        ),
    }
    if r["verdict"] in ("INVERTED", "NOISY", "DORMANT"):
        entry["defaultOff"] = True
    elif r["verdict"] == "HYGIENE":
        # HYGIENE rules stay on — they're health checks, not AI signals
        entry.pop("defaultOff", None)
    signal[r["rule"]] = entry

signal_path.write_text(json.dumps(signal, indent=2) + "\n")
print(f"\nUpdated {signal_path}")

# Write the calibration report
report_path = DOCS_DIR / "v7-corpus-calibration.md"
date_lines = []
if neg_meta and date_filter_enabled:
    neg_dates = [v.get("lastCommitDate", "unknown") for v in neg_meta.get("files", {}).values()]
    pos_dates = [v.get("lastCommitDate", "unknown") for v in pos_meta.get("files", {}).values()] if pos_meta else []
    date_lines = [
        "",
        "## Date distribution",
        f"- Neg files by lastCommitDate: {dict(Counter(d for d in neg_dates if d != 'unknown'))}",
        f"- Pos files by lastCommitDate: {dict(Counter(d for d in pos_dates if d != 'unknown'))}",
    ]

content = f"""# v7 corpus re-calibration (min-date={min_date}, filter={'on' if date_filter_enabled else 'off'})

**Generated:** 2026-06-27 from `scan-corpus-robust-v2.ts` output on the v7 symlink dirs.

**Corpus (after date filter >= {min_date}):**
- Neg: {n_neg} files
- Pos: {n_pos} files

**v7 contamination fix:** The v6 calibration used 91 pos repos labeled at the project level — many of these were real OSS projects that adopted AI tools recently, with individual files written by humans in 2022-2024. v7 uses a curated pure-AI pos subset: `vibe-coded/*` (100 sub-repos), `claude-code`, `aider`, `tabby`, `continue`, and AI agent frameworks (`PraisonAI`, `agno`, `autogen`, `crewAI`).

**Verdict distribution:**
- USEFUL: {v_counts['USEFUL']} | OK: {v_counts['OK']} | NOISY: {v_counts['NOISY']} | INVERTED: {v_counts['INVERTED']} | DORMANT: {v_counts['DORMANT']} | HYGIENE: {v_counts['HYGIENE']}

## Per-rule table (sorted by lift desc)

| Rule | AI | TP | FP | P | FPR | Lift | Verdict |
|------|:--:|---:|---:|--:|----:|-----:|---------|
"""
for r in rows:
    lift_str = f"{r['lift']:.1f}" if r["lift"] != float("inf") else "inf"
    ai_mark = "Y" if r["aiSpecific"] is True else ("N" if r["aiSpecific"] is False else "?")
    content += (
        f"| `{r['rule']}` | {ai_mark} | {r['tp']} | {r['fp']} | "
        f"{r['p']*100:.1f}% | {r['fpr']*100:.2f}% | {lift_str} | **{r['verdict']}** |\n"
    )
content += "\n".join(date_lines) + "\n"
report_path.parent.mkdir(parents=True, exist_ok=True)
report_path.write_text(content)
print(f"Wrote {report_path}")
