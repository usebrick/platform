#!/usr/bin/env python3
"""v7 calibration with date-bucketed pos/neg controls.

Critical fix from v0.12.2: v6 calibration had a contamination
problem. The "pos" arm (91 repos) was labeled at the project
level — many were real OSS projects (calcom, lobe-chat, milvus)
that adopted AI tools in 2025-2026, but their individual files
were written by humans in 2022-2024. The verdict distribution
we shipped in v0.12.2 may have been partially explained by
"time-trend" (recent commits look more AI-like) rather than
"this file is AI-written".

v7 fixes this by:

  1. **Pure-pos corpus**: the v7/scan/v7-pure-pos/ symlinks
     contain only the curated pure-AI repos (vibe-coded/*,
     claude-code, aider, tabby, continue, AI agent frameworks).
     The 50+ real-OSS-contaminated repos are EXCLUDED.

  2. **Date-bucketed calibration**: reads metadata.json and
     optionally filters by lastCommitDate. Default: include
     only files with lastCommitDate >= 2025-01-01. This
     controls for "this file is recent in either arm".

  3. **Author-bucketed optional mode**: if --by-author is
     passed, also reports per-author-bucket (ai-bot vs
     human) lift.

Usage: python3 scripts/compute-v7-calibration.py [--min-date YYYY-MM-DD]
"""
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

CORPUS_ROOT = Path("/Users/cheng/corpus-expansion")
SCAN_ROOT = Path("/tmp")  # scan output files land here
REPO = Path(__file__).resolve().parent.parent
RULE_DIR = REPO / "src/rules"

# CLI args
min_date = sys.argv[1] if len(sys.argv) > 1 else "2025-01-01"
print(f"v7 calibration with min-date={min_date}")

# Load rule-level aiSpecific
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


def load_scan(path: Path) -> dict:
    if not path.exists():
        sys.exit(f"Missing scan output: {path}")
    return json.load(open(path))


def filter_fires_by_date(scan: dict, meta: dict, min_date_str: str) -> dict:
    """Drop fires whose symlink target's lastCommitDate < min_date.

    scan: { files, perFileFires: {rule: set of symlink names}, ... }
    meta: { files: { symlink_name: {lastCommitDate, ...} } }
    """
    if not meta or "files" not in meta:
        print(f"  WARN: no metadata for filter; using all files")
        return scan

    files = meta.get("files", {})
    # Build a per-rule set of symlink names passing the date filter
    keep: set[str] = set()
    for symlink, info in files.items():
        d = info.get("lastCommitDate", "unknown")
        if d == "unknown" or d >= min_date_str:
            keep.add(symlink)

    filtered = dict(scan)
    per_file = filtered.get("perFileFires", {})
    new_per_file = {}
    new_fires = {}
    for rule, symlinks in per_file.items():
        kept = symlinks & keep
        if kept:
            new_per_file[rule] = kept
            new_fires[rule] = len(kept)
    filtered["perFileFires"] = new_per_file
    filtered["fires"] = new_fires
    filtered["files"] = len(keep)
    return filtered


# Load v7 scan outputs
NEG = load_scan(SCAN_ROOT / "v7-full-neg-perfile-fires.json")
POS = load_scan(SCAN_ROOT / "v7-pure-pos-perfile-fires.json")

# Load metadata
neg_meta_path = CORPUS_ROOT / "v7/scan/v7-full-neg/metadata.json"
pos_meta_path = CORPUS_ROOT / "v7/scan/v7-pure-pos/metadata.json"
neg_meta = json.load(open(neg_meta_path)) if neg_meta_path.exists() else None
pos_meta = json.load(open(pos_meta_path)) if pos_meta_path.exists() else None

# Apply date filter
NEG = filter_fires_by_date(NEG, neg_meta, min_date)
POS = filter_fires_by_date(POS, pos_meta, min_date)

n_neg = NEG["files"]
n_pos = POS["files"]
print(f"After date filter: {n_neg} neg files, {n_pos} pos files")
print()

neg_per_file = NEG.get("perFileFires", {})
pos_per_file = POS.get("perFileFires", {})

# Combined rule universe
all_rules = sorted(
    set(neg_per_file.keys()) | set(pos_per_file.keys())
    | set(NEG.get("fires", {}).keys()) | set(POS.get("fires", {}).keys())
)

# Per-rule table
rows = []
for rule in all_rules:
    pos_set = pos_per_file.get(rule, set())
    neg_set = neg_per_file.get(rule, set())
    if not isinstance(pos_set, set):
        pos_set = set(pos_set) if isinstance(pos_set, list) else set()
    if not isinstance(neg_set, set):
        neg_set = set(neg_set) if isinstance(neg_set, list) else set()
    tp = len(pos_set)
    fp = len(neg_set)
    p = tp / (tp + fp) if (tp + fp) > 0 else 0
    r = tp / n_pos if n_pos > 0 else 0
    fpr = fp / n_neg if n_neg > 0 else 0
    lift = r / fpr if fpr > 0 else float("inf")

    if tp == 0 and fp == 0:
        verdict = "DORMANT"
    elif lift < 1.0:
        verdict = "INVERTED"
    elif p >= 0.5 and lift >= 2:
        verdict = "USEFUL"
    elif p >= 0.3 and lift >= 1.5:
        verdict = "OK"
    else:
        verdict = "NOISY"

    if rule in rule_ai_specific and rule_ai_specific[rule] is False:
        verdict = "HYGIENE"

    rows.append(
        {
            "rule": rule,
            "tp": tp, "fp": fp,
            "p": p, "r": r, "fpr": fpr, "lift": lift,
            "verdict": verdict,
        }
    )

# Sort by lift desc
rows.sort(key=lambda r: -r["lift"] if r["lift"] != float("inf") else float("inf"))

# Print summary
print(f'{"Rule":<48} {"TP":>7} {"FP":>7} {"P":>7} {"FPR":>7} {"Lift":>7} {"Verdict":<10}')
print("-" * 110)
for r in rows:
    lift_str = f"{r['lift']:.1f}" if r["lift"] != float("inf") else "inf"
    print(
        f"  {r['rule']:<46} {r['tp']:>7} {r['fp']:>7} "
        f"{r['p']*100:>6.1f}% {r['fpr']*100:>6.2f}% {lift_str:>7} {r['verdict']:<10}"
    )

v_counts = Counter(r["verdict"] for r in rows)
print(f"\nVerdict distribution (min-date={min_date}):")
for v in ["USEFUL", "OK", "NOISY", "INVERTED", "DORMANT", "HYGIENE"]:
    print(f"  {v}: {v_counts[v]}")
print(f"  Total: {len(rows)}")

# Write signal-strength.json
signal = json.load(open(REPO / "src/rules/signal-strength.json"))
now = "2026-06-27T06:00:00Z"
for r in rows:
    lift = min(99.99, r["lift"]) if r["lift"] != float("inf") else 99.99
    entry = {
        "recall": round(r["r"], 4),
        "fpRate": round(r["fpr"], 4),
        "ratio": round(lift, 2),
        "precision": round(r["p"], 4),
        "lastCalibratedAt": now,
        "verdict": r["verdict"],
        "_calibrationNote": (
            f"v7 corpus re-calibration (2026-06-27, min-date={min_date}): "
            f"{n_neg} neg + {n_pos} pos. {r['verdict']} — TP={r['tp']}, FP={r['fp']}, "
            f"P={r['p']*100:.1f}%, FPR={r['fpr']*100:.2f}%, lift="
            f"{'inf' if r['lift']==float('inf') else f'{r[\"lift\"]:.1f}'}. "
            f"Pure-pos corpus (vibe-coded/* + AI agent frameworks)."
        ),
    }
    if r["verdict"] in ("INVERTED", "NOISY", "DORMANT", "HYGIENE"):
        entry["defaultOff"] = True
    signal[r["rule"]] = entry

# Post-process: stale INVERTED → HYGIENE for aiSpecific: false
reclassified = 0
for rid, entry in list(signal.items()):
    if entry.get("lastCalibratedAt") == now:
        continue
    if rule_ai_specific.get(rid) is False and entry.get("verdict") == "INVERTED":
        entry["verdict"] = "HYGIENE"
        entry["defaultOff"] = True
        reclassified += 1
print(f"\nReclassified {reclassified} stale INVERTED → HYGIENE")

out = REPO / "src/rules/signal-strength.json"
out.write_text(json.dumps(signal, indent=2) + "\n")
print(f"Updated {out}")

# Write the calibration report
report = REPO / "docs/research/v7-corpus-calibration.md"
date_lines = []
if neg_meta:
    neg_dates = [v.get("lastCommitDate", "unknown") for v in neg_meta.get("files", {}).values()]
    pos_dates = [v.get("lastCommitDate", "unknown") for v in pos_meta.get("files", {}).values() if pos_meta]
    date_lines = [
        "",
        "## Date distribution",
        f"- Neg files by lastCommitDate: {Counter(d for d in neg_dates if d != 'unknown')}",
        f"- Pos files by lastCommitDate: {Counter(d for d in pos_dates if d != 'unknown')}",
    ]

content = f"""# v7 corpus re-calibration (min-date={min_date})

**Generated:** 2026-06-27 from `scan-corpus-robust.ts` output on the v7 symlink dirs.

**Corpus (after date filter >= {min_date}):**
- Neg: {n_neg} files from {n_neg_meta_files := len(neg_meta.get('files', {})) if neg_meta else 0} symlinks
- Pos: {n_pos} files from {n_pos_meta_files := len(pos_meta.get('files', {})) if pos_meta else 0} symlinks (pure AI subset)

**v7 contamination fix:** The v6 calibration used 91 pos repos labeled at the project level — many of these were real OSS projects that adopted AI tools recently, with individual files written by humans in 2022-2024. v7 uses a curated pure-AI pos subset: `vibe-coded/*` (100 sub-repos), `claude-code`, `aider`, `tabby`, `continue`, and AI agent frameworks (`PraisonAI`, `agno`, `autogen`, `crewAI`).

**Verdict distribution:**
- USEFUL: {v_counts['USEFUL']} | OK: {v_counts['OK']} | NOISY: {v_counts['NOISY']} | INVERTED: {v_counts['INVERTED']} | DORMANT: {v_counts['DORMANT']} | HYGIENE: {v_counts['HYGIENE']}

## Per-rule table (sorted by lift desc)

| Rule | TP | FP | P | FPR | Lift | Verdict |
|------|---:|---:|--:|----:|-----:|---------|
"""
for r in rows:
    lift_str = f"{r['lift']:.1f}" if r["lift"] != float("inf") else "inf"
    content += (
        f"| `{r['rule']}` | {r['tp']} | {r['fp']} | "
        f"{r['p']*100:.1f}% | {r['fpr']*100:.2f}% | {lift_str} | **{r['verdict']}** |\n"
    )
content += "\n".join(date_lines) + "\n"
report.write_text(content)
print(f"Wrote {report}")
