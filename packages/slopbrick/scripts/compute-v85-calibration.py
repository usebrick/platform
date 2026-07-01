#!/usr/bin/env python3
"""v0.18.9 v8.5 calibration: combine v7 + v8 fires into one verdict.

Reads:
  - /tmp/v7-full-{neg,pos}-fires.json (v7 corpus, 2026-06-27)
  - /tmp/v8-{neg,pos}-fires.json       (v8 corpus, scanned 2026-07-01)

Writes:
  - src/rules/signal-strength.json (replaces v0.18.8 entries with v8.5)
  - docs/research/v8.5-corpus-calibration.md (per-rule report with v7 vs v8.5)

For each rule:
  - TP_v8.5 = TP_v7 + TP_v8
  - FP_v8.5 = FP_v7 + FP_v8
  - TN_v8.5 = (n_neg_v7 + n_neg_v8) - FP_v8.5
  - FN_v8.5 = (n_pos_v7 + n_pos_v8) - TP_v8.5
  - P = TP / (TP + FP)
  - R = TP / (TP + FN)
  - FPR = FP / (FP + TN) = FP / n_neg
  - Lift = P / (FP / n_neg)  (same as P / FPR)
  - Verdict: USEFUL (lift>=2, P>=0.5), OK (lift>=1.5, P>=0.3),
            NOISY (lift>=1.0), INVERTED (lift<1), DORMANT (TP=0,FP=0)

Each output entry also preserves `_v7Verdict` / `_v7Lift` / `_v7Recall` /
`_v7FpRate` for the v0.18.8 comparison.

Usage:
  python3 scripts/compute-v85-calibration.py [--min-date=YYYY-MM-DD]
"""
import json
import os
import re
import sys
from collections import Counter
from pathlib import Path

CORPUS_ROOT = Path(os.environ.get("SLOPBRICK_CORPUS_DIR", "/Users/cheng/corpus-expansion"))
SCAN_ROOT = Path("/tmp")
REPO = Path(__file__).resolve().parent.parent
RULE_DIR = REPO / "src/rules"
DOCS_DIR = REPO / "docs/research"
SIGNAL_PATH = RULE_DIR / "signal-strength.json"
REPORT_PATH = DOCS_DIR / "v8.5-corpus-calibration.md"

# CLI
min_date = "2025-01-01"
date_filter_enabled = False  # v8 corpus is post-2024 by construction; skip filter
for arg in sys.argv[1:]:
    if arg.startswith("--min-date="):
        min_date = arg.split("=", 1)[1]
        date_filter_enabled = True
    elif re.match(r"\d{4}-\d{2}-\d{2}", arg):
        min_date = arg
        date_filter_enabled = True


def load_fires(path: Path) -> dict:
    if not path.exists():
        sys.exit(f"Missing scan output: {path}")
    return json.load(open(path))


def to_set(v) -> set[str]:
    if isinstance(v, set):
        return v
    if isinstance(v, list):
        return set(v)
    if isinstance(v, int):
        return set()
    return set()


# === Load v7 + v8 ===
print("Loading v7 fires...")
v7_neg = load_fires(SCAN_ROOT / "v7-full-neg-fires.json")
v7_pos = load_fires(SCAN_ROOT / "v7-full-pos-fires.json")
print(f"  v7 neg: {v7_neg['files']} files, {v7_neg['issueCount']} issues, {v7_neg['uniqueRules']} rules")
print(f"  v7 pos: {v7_pos['files']} files, {v7_pos['issueCount']} issues, {v7_pos['uniqueRules']} rules")

print("Loading v8 fires...")
v8_neg = load_fires(SCAN_ROOT / "v8-neg-fires.json")
v8_pos = load_fires(SCAN_ROOT / "v8-pos-fires.json")
print(f"  v8 neg: {v8_neg['files']} files, {v8_neg['issueCount']} issues, {v8_neg['uniqueRules']} rules")
print(f"  v8 pos: {v8_pos['files']} files, {v8_pos['issueCount']} issues, {v8_pos['uniqueRules']} rules")

# === Build per-rule per-file sets ===
def to_per_rule(d: dict) -> dict[str, set[str]]:
    return {r: to_set(v) for r, v in d.get("perFileFires", {}).items()}

v7_neg_per = to_per_rule(v7_neg)
v7_pos_per = to_per_rule(v7_pos)
v8_neg_per = to_per_rule(v8_neg)
v8_pos_per = to_per_rule(v8_pos)

# === Combined v8.5 ===
n_neg_v7 = v7_neg["files"]
n_neg_v8 = v8_neg["files"]
n_pos_v7 = v7_pos["files"]
n_pos_v8 = v8_pos["files"]
n_neg_v85 = n_neg_v7 + n_neg_v8
n_pos_v85 = n_pos_v7 + n_pos_v8
print(f"\nv8.5 corpus: {n_neg_v85} neg + {n_pos_v85} pos = {n_neg_v85 + n_pos_v85} files")

# Combined per-rule
all_rules = sorted(
    set(v7_neg_per) | set(v7_pos_per) | set(v8_neg_per) | set(v8_pos_per)
)

# === Load rule-level aiSpecific from the rule source files ===
rule_ai_specific: dict[str, bool] = {}
for ts in RULE_DIR.rglob("*.ts"):
    if "/tests/" in str(ts) or "/.snapshots/" in str(ts):
        continue
    text = ts.read_text(encoding="utf-8")
    m = re.search(
        r"id:\s*['\"]([^'\"]+)['\"][^}]*?aiSpecific:\s*(true|false)",
        text,
        re.DOTALL,
    )
    if m:
        rule_ai_specific[m[1]] = (m[2] == "true")


def metric(tp: int, fp: int, n_neg: int, n_pos: int) -> dict:
    p = tp / (tp + fp) if (tp + fp) > 0 else 0
    r = tp / n_pos if n_pos > 0 else 0
    fpr = fp / n_neg if n_neg > 0 else 0
    base_rate = fp / n_neg if n_neg > 0 else 0
    lift = (p / base_rate) if base_rate > 0 else (float("inf") if p > 0 else 1)
    if tp == 0 and fp == 0:
        verdict = "DORMANT"
    elif lift < 1:
        verdict = "INVERTED"
    elif lift < 1.5:
        verdict = "NOISY"
    elif lift < 2 or p < 0.5:
        verdict = "OK"
    else:
        verdict = "USEFUL"
    return dict(tp=tp, fp=fp, p=p, r=r, fpr=fpr, lift=lift, verdict=verdict)


# === Per-rule v7 + v8.5 rows ===
rows = []
for rule in all_rules:
    v7_tp = len(v7_pos_per.get(rule, set()))
    v7_fp = len(v7_neg_per.get(rule, set()))
    v7_m = metric(v7_tp, v7_fp, n_neg_v7, n_pos_v7)

    v8_tp = len(v8_pos_per.get(rule, set()))
    v8_fp = len(v8_neg_per.get(rule, set()))
    v8_m = metric(v8_tp, v8_fp, n_neg_v8, n_pos_v8)

    v85_tp = v7_tp + v8_tp
    v85_fp = v7_fp + v8_fp
    v85_m = metric(v85_tp, v85_fp, n_neg_v85, n_pos_v85)

    rows.append(dict(
        rule=rule,
        aiSpecific=rule_ai_specific.get(rule, None),
        v7=v7_m, v8=v8_m, v85=v85_m,
    ))


# === Write signal-strength.json ===
# Load existing entries to preserve metadata fields
existing = json.loads(SIGNAL_PATH.read_text()) if SIGNAL_PATH.exists() else {}

# Snapshot v7 entries to a separate file (one-command rollback)
v7_snapshot_path = SIGNAL_PATH.with_name("signal-strength-v7-snapshot.json")
if not v7_snapshot_path.exists():
    v7_snapshot_path.write_text(json.dumps(existing, indent=2) + "\n")
    print(f"\nWrote v7 snapshot to {v7_snapshot_path}")

# Update the v7 snapshot to reflect v0.18.8 v8a findings (5 dead/* entries
# added in v0.18.8, kept for v8.5)
v7_snapshot = json.loads(v7_snapshot_path.read_text())

# Build new signal-strength
signal: dict = {}
for r in rows:
    v85 = r["v85"]
    v7m = r["v7"]
    existing_entry = v7_snapshot.get(r["rule"], existing.get(r["rule"], {}))
    entry = {
        "recall": round(v85["r"], 4),
        "fpRate": round(v85["fpr"], 4),
        "ratio": round(v85["lift"], 2) if v85["lift"] != float("inf") else "Infinity",
        "precision": round(v85["p"], 4),
        "lastCalibratedAt": "2026-07-01T00:00:00Z",
        "verdict": v85["verdict"],
        "_calibrationNote": (
            f"v8.5 calibration (v0.18.9, 2026-07-01): v7+v8 combined corpus "
            f"({n_neg_v85} neg + {n_pos_v85} pos). v8.5 TP={v85['tp']}, FP={v85['fp']}, "
            f"P={v85['p']*100:.1f}%, FPR={v85['fpr']*100:.2f}%, lift="
            f"{'inf' if v85['lift'] == float('inf') else f'{v85[\"lift\"]:.2f}'}. "
            f"v7 was {v7m['verdict']} (TP={v7m['tp']}, FP={v7m['fp']}, lift="
            f"{'inf' if v7m['lift'] == float('inf') else f'{v7m[\"lift\"]:.2f}'}). "
            f"v8 was {r['v8']['verdict']} (TP={r['v8']['tp']}, FP={r['v8']['fp']})."
        ),
        "aiSpecific": r["aiSpecific"],
        "_v7Verdict": v7m["verdict"],
        "_v7Lift": round(v7m["lift"], 2) if v7m["lift"] != float("inf") else "Infinity",
        "_v7Recall": round(v7m["r"], 4),
        "_v7FpRate": round(v7m["fpr"], 4),
        "_v7Precision": round(v7m["p"], 4),
        "_v8Verdict": r["v8"]["verdict"],
        "_v8Lift": round(r["v8"]["lift"], 2) if r["v8"]["lift"] != float("inf") else "Infinity",
    }
    if v85["verdict"] in ("INVERTED", "NOISY", "DORMANT"):
        entry["defaultOff"] = True
    elif v85["verdict"] == "HYGIENE":
        entry.pop("defaultOff", None)
    # Preserve _v0.18.8_v8a_5dead_entries_legacy note if it existed
    if "_calibrationNote" in existing_entry and "v0.18.8" in existing_entry.get("_calibrationNote", ""):
        if "dead/" in r["rule"] and r["rule"] in [
            "dead/dead-branch", "dead/unreachable", "dead/unused-import",
            "dead/unused-local", "dead/unused-parameter",
        ]:
            # Add the v0.18.8 v8a note as additional context
            entry["_calibrationNote"] = (
                f"v8.5 (v0.18.9): v85 verdict={v85['verdict']}, "
                f"v7 was {v7m['verdict']}, v8 was {r['v8']['verdict']}. "
                f"v0.18.8 v8a first measurement (1000 files): "
                f"see docs/research/v0.18.8-dead-rules-measurement.md."
            )
    signal[r["rule"]] = entry

# Add the 4 new rust/* rules if they're not in the rules list (they're DORMANT)
for rust_rule in [
    "rust/unused-pub-fn",
    "rust/unwrap-in-production",
    "rust/todo-macro",
    "rust/stringly-typed",
]:
    if rust_rule not in signal:
        signal[rust_rule] = {
            "recall": 0.0,
            "fpRate": 0.0,
            "ratio": 1.0,
            "precision": 0.0,
            "lastCalibratedAt": "2026-07-01T00:00:00Z",
            "verdict": "DORMANT",
            "defaultOff": True,
            "_calibrationNote": (
                "v0.18.9: new rule added with tree-sitter Rust integration. "
                "DORMANT until v8.5 calibration measures it on Rust corpus. "
                "The 4 new rules: rust/unused-pub-fn, rust/unwrap-in-production, "
                "rust/todo-macro, rust/stringly-typed."
            ),
            "aiSpecific": True,
        }

SIGNAL_PATH.write_text(json.dumps(signal, indent=2) + "\n")
print(f"\nUpdated {SIGNAL_PATH} with {len(signal)} rules")

# === Write the calibration report ===
v_counts = Counter(r["v85"]["verdict"] for r in rows)
v7_counts = Counter(r["v7"]["verdict"] for r in rows)
v8_counts = Counter(r["v8"]["verdict"] for r in rows)

content = f"""# v8.5 corpus re-calibration (v0.18.9, 2026-07-01)

**v8.5 = v7 + v8 combined.** v7 is the existing corpus
(184,488 neg + 239,054 pos = 423,542 files, scanned 2026-06-27).
v8 is the new corpus pulled in v0.18.9 (106,632 neg + 22,571 pos
= 129,203 source files, scanned 2026-07-01).

**Combined v8.5 corpus: {n_neg_v85} neg + {n_pos_v85} pos = {n_neg_v85 + n_pos_v85} files**

## v8 corpus — what's new

v8 NEGATIVE arm: 40/40 repos, all checked out to 2018-2022 pre-AI
commits (older is better for hand-written code, per user guidance).
- TS=3,545 / TSX=857 / JS=10,018 / JSX=16 / PY=2,643 / GO=11,691 / RS=3,090
- Total: 31,862 source files (the 106,632 "files" includes all
  non-source files in the repos — configs, lockfiles, docs, etc.)

v8 POSITIVE arm: 27/27 repos, all 2024-12-17 or later.
- TS=3,818 / TSX=1,866 / JS=501 / PY=4,954 / GO=3,595 / RS=6,066
- Total: 20,800 source files

## Verdict distribution

| Verdict | v7 | v8 | v8.5 |
|---|---:|---:|---:|
| USEFUL | {v7_counts.get('USEFUL', 0)} | {v8_counts.get('USEFUL', 0)} | {v_counts.get('USEFUL', 0)} |
| OK | {v7_counts.get('OK', 0)} | {v8_counts.get('OK', 0)} | {v_counts.get('OK', 0)} |
| NOISY | {v7_counts.get('NOISY', 0)} | {v8_counts.get('NOISY', 0)} | {v_counts.get('NOISY', 0)} |
| INVERTED | {v7_counts.get('INVERTED', 0)} | {v8_counts.get('INVERTED', 0)} | {v_counts.get('INVERTED', 0)} |
| DORMANT | {v7_counts.get('DORMANT', 0)} | {v8_counts.get('DORMANT', 0)} | {v_counts.get('DORMANT', 0)} |
| HYGIENE | {v7_counts.get('HYGIENE', 0)} | {v8_counts.get('HYGIENE', 0)} | {v_counts.get('HYGIENE', 0)} |

## Per-rule table (sorted by v8.5 lift desc)

| Rule | AI | v7 verdict | v8 verdict | v8.5 verdict | v8.5 TP | v8.5 FP | v8.5 P | v8.5 Lift |
|------|:--:|------------|------------|--------------|--------:|--------:|-------:|---------:|
"""

for r in sorted(rows, key=lambda x: -x["v85"]["lift"] if x["v85"]["lift"] != float("-inf") else 0):
    ai_mark = "Y" if r["aiSpecific"] is True else ("N" if r["aiSpecific"] is False else "?")
    lift_str = f"{r['v85']['lift']:.2f}" if r["v85"]["lift"] != float("inf") else "inf"
    content += (
        f"| `{r['rule']}` | {ai_mark} | {r['v7']['verdict']} | {r['v8']['verdict']} | "
        f"**{r['v85']['verdict']}** | {r['v85']['tp']} | {r['v85']['fp']} | "
        f"{r['v85']['p']*100:.1f}% | {lift_str} |\n"
    )

REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
REPORT_PATH.write_text(content)
print(f"Wrote {REPORT_PATH}")
