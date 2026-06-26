#!/usr/bin/env python3
"""Compute per-rule P/R/FPR from a slopbrick db/docs/scan JSON output.

Usage:
  compute-v5-per-rule.py <neg-report.json> <pos-report.json> <arm-name>

Reads the 'findings' array (or 'issues' for scan output) and counts
distinct files each rule fired on. Computes per-rule P/R/FPR/lift/verdict
using the v4 calibration logic.

Outputs a Markdown table to stdout.
"""

import json
import sys
from collections import defaultdict

if len(sys.argv) != 4:
    print(f"Usage: {sys.argv[0]} <neg-report.json> <pos-report.json> <arm-name>", file=sys.stderr)
    sys.exit(1)

neg_path, pos_path, arm = sys.argv[1], sys.argv[2], sys.argv[3]


def per_file_counts(report_path):
    """Return (total_files, dict[rule_id] = set of file paths)."""
    with open(report_path) as f:
        data = json.load(f)
    # slopbrick db/docs reports: 'findings' array
    findings = data.get("findings", [])
    if not findings:
        # slopbrick scan reports: 'issues' array
        findings = data.get("issues", [])
    files_per_rule = defaultdict(set)
    for f in findings:
        rid = f.get("ruleId") or f.get("rule_id") or f.get("id")
        if not rid:
            continue
        file_key = (
            f.get("dbFile")
            or f.get("docFile")
            or f.get("file")
            or f.get("filePath")
            or "unknown"
        )
        files_per_rule[rid].add(file_key)
    return data, files_per_rule


neg_data, neg_rules = per_file_counts(neg_path)
pos_data, pos_rules = per_file_counts(pos_path)

n_neg = (
    neg_data.get("scannedSqlFiles")
    or neg_data.get("scannedDocFiles")
    or neg_data.get("fileCount")
    or 0
)
n_pos = (
    pos_data.get("scannedSqlFiles")
    or pos_data.get("scannedDocFiles")
    or pos_data.get("fileCount")
    or 0
)

print(f"\n## {arm} arm — per-rule P/R/FPR (per-file granularity)")
print(f"\nNeg corpus: {n_neg} files | Pos corpus: {n_pos} files")
print(f"\n| Rule | TP | FP | P | R | FPR | Lift | Verdict |")
print(f"|------|---:|---:|--:|--:|----:|-----:|---------|")

# Union of all rules
all_rules = sorted(set(list(neg_rules.keys()) + list(pos_rules.keys())))
for rule in all_rules:
    pos_files = pos_rules.get(rule, set())
    neg_files = neg_rules.get(rule, set())
    tp = len(pos_files)
    fp = len(neg_files)
    p = tp / (tp + fp) if (tp + fp) > 0 else 0
    r = tp / n_pos if n_pos > 0 else 0
    fpr = fp / n_neg if n_neg > 0 else 0
    specificity = 1 - fpr
    f1 = 2 * p * r / (p + r) if (p + r) > 0 else 0
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

    lift_str = f"{lift:.1f}" if lift != float("inf") else "inf"
    print(
        f"| `{rule}` | {tp} | {fp} | {p*100:.1f}% | {r*100:.2f}% | "
        f"{fpr*100:.2f}% | {lift_str} | {verdict} |"
    )

# Summary
verdicts = []
for rule in all_rules:
    pos_files = pos_rules.get(rule, set())
    neg_files = neg_rules.get(rule, set())
    tp = len(pos_files)
    fp = len(neg_files)
    p = tp / (tp + fp) if (tp + fp) > 0 else 0
    r = tp / n_pos if n_pos > 0 else 0
    fpr = fp / n_neg if n_neg > 0 else 0
    lift = r / fpr if fpr > 0 else float("inf")
    if tp == 0 and fp == 0:
        verdicts.append("DORMANT")
    elif lift < 1.0:
        verdicts.append("INVERTED")
    elif p >= 0.5 and lift >= 2:
        verdicts.append("USEFUL")
    elif p >= 0.3 and lift >= 1.5:
        verdicts.append("OK")
    else:
        verdicts.append("NOISY")

print(f"\n### Summary")
print(f"| Verdict | Count |")
print(f"|---------|------:|")
for v in ["USEFUL", "OK", "NOISY", "INVERTED", "DORMANT"]:
    print(f"| {v} | {verdicts.count(v)} |")
print(f"| **Total** | **{len(verdicts)}** |")
