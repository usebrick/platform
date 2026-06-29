#!/usr/bin/env python3
"""v7 PARTIAL calibration — works on the in-progress scans.

Reads the partial-fires.json files (which the v7 scans write every
500 files) and produces a calibration report on whatever's been
scanned so far. Useful for getting a preliminary calibration while
the scans are still running (~7.5h and ~13h ETAs).

Output: docs/research/v7-partial-calibration-<timestamp>.md

This does NOT update signal-strength.json — that's reserved for the
final calibration once both scans finish. The partial calibration
is for monitoring only.

Usage: python3 scripts/compute-v7-calibration-partial.py
"""
import json
import re
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

SCAN_ROOT = Path("/tmp")
REPO = Path(__file__).resolve().parent.parent
RULE_DIR = REPO / "src/rules"
DOCS_DIR = REPO / "docs/research"


def load_partial(path: Path) -> dict | None:
    if not path.exists():
        return None
    return json.load(open(path))


neg = load_partial(SCAN_ROOT / "v7-full-neg-partial-fires.json")
pos = load_partial(SCAN_ROOT / "v7-full-pos-partial-fires.json")

if not neg or not pos:
    print("ERROR: missing one or both partial-fires.json files")
    sys.exit(1)

n_neg = neg["files"]
n_pos = pos["files"]
print(f"v7 PARTIAL calibration ({datetime.now().isoformat()})")
print(f"  neg: {n_neg} files, {neg['issueCount']} issues, {neg['uniqueRules']} unique rules")
print(f"  pos: {n_pos} files, {pos['issueCount']} issues, {pos['uniqueRules']} unique rules")
print(f"  neg elapsed: {neg['elapsedSec']/3600:.1f}h, pos elapsed: {pos['elapsedSec']/3600:.1f}h")
print()

# Per-rule fire counts
neg_fires = neg["fires"]
pos_fires = pos["fires"]
all_rules = sorted(set(neg_fires) | set(pos_fires))

# Load rule-level aiSpecific from rule source files
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
    tp = pos_fires.get(rule, 0)
    fp = neg_fires.get(rule, 0)
    p = tp / (tp + fp) if (tp + fp) > 0 else 0
    r = tp / n_pos if n_pos > 0 else 0
    fpr = fp / n_neg if n_neg > 0 else 0
    lift = r / fpr if fpr > 0 else (float("inf") if tp > 0 else 0)

    ai_spec = rule_ai_specific.get(rule)

    if tp == 0 and fp == 0:
        verdict = "DORMANT"
    elif ai_spec is False:
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
        "rule": rule, "aiSpecific": ai_spec,
        "tp": tp, "fp": fp, "p": p, "r": r, "fpr": fpr, "lift": lift,
        "verdict": verdict,
    })

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
print(f"\nVerdict distribution (PARTIAL — scans still running):")
for v in ["USEFUL", "OK", "NOISY", "INVERTED", "DORMANT", "HYGIENE"]:
    print(f"  {v}: {v_counts[v]}")
print(f"  Total: {len(rows)}")

# Write the calibration report
timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
report_path = DOCS_DIR / f"v7-partial-calibration-{timestamp}.md"
content = f"""# v7 corpus re-calibration (PARTIAL — scans still running)

**Generated:** {datetime.now().isoformat()}
**WARNING:** This is a PARTIAL calibration. Both v7 scans are still
in progress. Re-run `compute-v7-calibration.py` when they finish
for the final calibration that updates `signal-strength.json`.

**Corpus (as of now):**
- Neg: {n_neg} files
- Pos: {n_pos} files

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

report_path.parent.mkdir(parents=True, exist_ok=True)
report_path.write_text(content)
print(f"\nWrote {report_path}")
