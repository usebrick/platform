#!/usr/bin/env python3
"""Compute per-rule P/R/FPR on the full v4 corpus (89k+83k files).

Reads the JSON outputs from scan-corpus-direct.ts (one per arm),
aggregates per-rule fires, and writes docs/research/v5-full-corpus-calibration.md
+ a fresh signal-strength.json import.

Usage: python3 scripts/compute-v5-full-calibration.py
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
# v0.12.2: support v6 corpus files (preferred) or fall back to v5.
# Pass `v6` as the first arg to use v6 files, or `v5` to use v5.
version = sys.argv[1] if len(sys.argv) > 1 else 'v6'
prefix = f'/tmp/{version}-full-'
try:
    NEG = json.load(open(f'{prefix}neg-perfile-fires.json'))
    POS = json.load(open(f'{prefix}pos-perfile-fires.json'))
    if 'perFileFires' not in NEG or 'perFileFires' not in POS:
        raise FileNotFoundError('per-file fires missing, falling back to legacy output')
except FileNotFoundError:
    NEG = json.load(open(f'{prefix}neg-fires.json'))
    POS = json.load(open(f'{prefix}pos-fires.json'))

# Per-file fires: ruleId -> number of unique files that rule fired on.
# scan-corpus-direct.ts emits this in the perFileFires field. When
# perFileFires is missing (older runs), fall back to raw fire count
# with a min(1, ratio) cap.
neg_per_file = NEG.get('perFileFires', {})
pos_per_file = POS.get('perFileFires', {})

n_neg = NEG['files']
n_pos = POS['files']

# v0.12.2: read each rule's `aiSpecific` flag from the source files.
# Rules with `aiSpecific: false` are code-hygiene checks, not AI
# detectors. They still fire and report, but they don't get an
# AI-calibration verdict — they get HYGIENE. The HYGIENE verdict
# keeps the lift/P/R/FPR numbers in the data for reference, but
# removes the rule from the INVERTED/USEFUL/OK/NOISY/DORMANT
# distribution that consumers (lr-combiner, defaultOff logic) act on.
RULE_DIR = REPO / 'src/rules'
rule_ai_specific: dict[str, bool] = {}
for ts in RULE_DIR.rglob('*.ts'):
    text = ts.read_text(encoding='utf-8')
    m = re.search(r"id:\s*['\"]([^'\"]+)['\"][^}]*?aiSpecific:\s*(true|false)", text, re.DOTALL)
    if m:
        rule_ai_specific[m.group(1)] = (m.group(2) == 'true')

# Combined rule universe
all_rules = sorted(set(neg_per_file.keys()) | set(pos_per_file.keys())
                    | set(NEG['fires'].keys()) | set(POS['fires'].keys()))

# Per-rule table
rows = []
for rule in all_rules:
    pos_fires = POS['fires'].get(rule, 0)
    neg_fires = NEG['fires'].get(rule, 0)
    # Prefer per-file granularity (v4 doc methodology). When unavailable,
    # fall back to per-fire-count with a 1.0 cap on recall.
    has_per_file = rule in pos_per_file or rule in neg_per_file
    if has_per_file:
        tp = pos_per_file.get(rule, 0)
        fp = neg_per_file.get(rule, 0)
        p = tp / (tp + fp) if (tp + fp) > 0 else 0
        r = tp / n_pos if n_pos > 0 else 0
        fpr = fp / n_neg if n_neg > 0 else 0
        lift = r / fpr if fpr > 0 else float('inf')
        pos_rate = r
        neg_rate = fpr
    else:
        # Fallback: per-fire-count with 1.0 cap on recall. Less accurate
        # for rules that fire multiple times per file (e.g. boundary-
        # violation fires 1.27× per AI file).
        pos_rate = min(1.0, pos_fires / n_pos)
        neg_rate = neg_fires / n_neg
        lift = pos_rate / neg_rate if neg_rate > 0 else float('inf')
        p = pos_fires / (pos_fires + neg_fires) if (pos_fires + neg_fires) > 0 else 0
        fpr = neg_rate
        r = pos_rate

    if pos_fires == 0 and neg_fires == 0:
        verdict = 'DORMANT'
    elif lift < 1.0:
        verdict = 'INVERTED'
    elif p >= 0.5 and lift >= 2:
        verdict = 'USEFUL'
    elif p >= 0.3 and lift >= 1.5:
        verdict = 'OK'
    else:
        verdict = 'NOISY'

    # v0.12.2: code-hygiene rules (aiSpecific: false) get HYGIENE
    # instead of an AI-calibration verdict. The lift/P/R numbers are
    # still in the JSON for reference, but the verdict enum separates
    # "this rule is a useful AI detector" from "this rule is a useful
    # code-hygiene check that happens to fire more on AI code".
    if rule in rule_ai_specific and rule_ai_specific[rule] is False:
        verdict = 'HYGIENE'

    rows.append({
        'rule': rule,
        'pos_fires': pos_fires,
        'neg_fires': neg_fires,
        'pos_rate': pos_rate,
        'neg_rate': neg_rate,
        'p': p,
        'fpr': fpr,
        'lift': lift,
        'verdict': verdict,
    })

# Sort by lift desc
rows.sort(key=lambda r: -r['lift'] if r['lift'] != float('inf') else float('inf'))

# Print summary
print(f'\n=== Full v4 corpus re-calibration ({n_neg} neg + {n_pos} pos = {n_neg + n_pos} total) ===\n')
print(f'{"Rule":<48} {"Pos":>8} {"Neg":>8} {"P":>7} {"FPR":>8} {"Lift":>7} {"Verdict":<10}')
print('-' * 110)
for r in rows:
    lift_str = f'{r["lift"]:.1f}' if r['lift'] != float('inf') else 'inf'
    print(f'  {r["rule"]:<46} {r["pos_fires"]:>8} {r["neg_fires"]:>8} {r["p"]*100:>6.1f}% {r["fpr"]*100:>7.2f}% {lift_str:>7} {r["verdict"]:<10}')

# Verdict summary
from collections import Counter as C
v_counts = C(r['verdict'] for r in rows)
print(f'\nVerdict distribution:')
for v in ['USEFUL', 'OK', 'NOISY', 'INVERTED', 'DORMANT', 'HYGIENE']:
    print(f'  {v}: {v_counts[v]}')
print(f'  Total: {len(rows)}')

# Write to docs
out = REPO / 'docs/research/v5-full-corpus-calibration.md'
content = f'''# v{version} full-corpus re-calibration ({n_neg} neg + {n_pos} pos)

**Generated:** 2026-06-27 from `scan-corpus-direct.ts` output.
**Method:** direct scan of each file via `scanFile()`, aggregated per-rule fire counts.
**Caveat:** these numbers are based on raw fire counts, not per-file granularity. The v4 doc used per-file granularity (a file with rule firing N times counts as 1 file). The two are equivalent when most files fire at most once, which the v4 corpus shows. The P column is therefore `pos_fires / (pos_fires + neg_fires)` — an approximation of the v4 `P = TP / (TP + FP)`.

## Summary

- Corpus: {n_neg} neg files + {n_pos} pos files
- Unique rules fired: {len(rows)}
- USEFUL: {v_counts['USEFUL']} | OK: {v_counts['OK']} | NOISY: {v_counts['NOISY']} | INVERTED: {v_counts['INVERTED']} | DORMANT: {v_counts['DORMANT']} | HYGIENE: {v_counts['HYGIENE']}

## Per-rule table (sorted by lift desc)

| Rule | Pos fires | Neg fires | P | FPR | Lift | Verdict |
|------|----------:|----------:|--:|----:|-----:|---------|
'''
for r in rows:
    lift_str = f'{r["lift"]:.1f}' if r['lift'] != float('inf') else 'inf'
    content += f'| `{r["rule"]}` | {r["pos_fires"]} | {r["neg_fires"]} | {r["p"]*100:.1f}% | {r["fpr"]*100:.2f}% | {lift_str} | **{r["verdict"]}** |\n'

out.write_text(content)
print(f'\nWrote {out}')

# Write signal-strength update
signal = json.load(open(REPO / 'src/rules/signal-strength.json'))
import datetime
now = '2026-06-27T05:35:00Z'
for r in rows:
    lift = min(99.99, r['lift']) if r['lift'] != float('inf') else 99.99
    entry = {
        'recall': round(r['pos_rate'], 4),
        'fpRate': round(r['fpr'], 4),
        'ratio': round(lift, 2),
        'precision': round(r['p'], 4),
        'lastCalibratedAt': now,
        'verdict': r['verdict'],
        '_calibrationNote': f'v{version} full corpus re-calibration (2026-06-27): {n_neg} neg + {n_pos} pos. {r["verdict"]} — pos={r["pos_fires"]}, neg={r["neg_fires"]}, P={r["p"]*100:.1f}%, FPR={r["fpr"]*100:.2f}%, lift={"inf" if r["lift"]==float("inf") else f"{r["lift"]:.1f}"}.',
    }
    if r['verdict'] in ('INVERTED', 'NOISY', 'DORMANT', 'HYGIENE'):
        entry['defaultOff'] = True
    signal[r['rule']] = entry

# v0.12.2: post-process. Any rule in signal-strength.json that wasn't
# seen in the v{version} scan (still has the old lastCalibratedAt
# timestamp) gets reclassified: if its rule-level aiSpecific is false,
# override INVERTED/NOISY/OK/USEFUL → HYGIENE. The v{version} scan only
# updates rules it actually saw; this catches the stale entries.
v0_calibrated_at = now
reclassified = 0
for rid, entry in list(signal.items()):
    if entry.get('lastCalibratedAt') == v0_calibrated_at:
        continue  # updated by the v{version} run
    is_hygiene = rule_ai_specific.get(rid) is False
    if is_hygiene and entry.get('verdict') == 'INVERTED':
        entry['verdict'] = 'HYGIENE'
        entry['defaultOff'] = True
        entry['_calibrationNote'] = entry.get('_calibrationNote', '') + ' [v0.12.2: reclassified to HYGIENE because rule is aiSpecific: false]'
        reclassified += 1
print(f'\nReclassified {reclassified} stale INVERTED rules to HYGIENE (aiSpecific: false in source)')
out_signal = REPO / 'src/rules/signal-strength.json'
out_signal.write_text(json.dumps(signal, indent=2) + '\n')
print(f'Updated {out_signal}')
