#!/usr/bin/env python3
"""Compute per-rule P/R/FPR on the full v4 corpus (89k+83k files).

Reads the JSON outputs from scan-corpus-direct.ts (one per arm),
aggregates per-rule fires, and writes docs/research/v5-full-corpus-calibration.md
+ a fresh signal-strength.json import.

Usage: python3 scripts/compute-v5-full-calibration.py
"""
import json
import sys
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
NEG = json.load(open('/tmp/v5-full-neg-fires.json'))
POS = json.load(open('/tmp/v5-full-pos-fires.json'))

# In the per-arm JSON, `fires` is a dict[ruleId] = total fire COUNT.
# For per-file P/R we need per-file granularity. But scan-corpus-direct.ts
# currently reports raw fire count. We need to re-derive per-file from the
# per-arm reports — but the per-file breakdown is lost in this format.
# Workaround: treat the count as a lower bound on per-file hits; for
# per-file granularity we need a re-scan with per-file output. For now,
# report the raw counts and lift ratio, which is what v4 reported.

n_neg = NEG['files']
n_pos = POS['files']

# Combined rule universe
all_rules = sorted(set(NEG['fires'].keys()) | set(POS['fires'].keys()))

# Per-rule table
rows = []
for rule in all_rules:
    pos_fires = POS['fires'].get(rule, 0)
    neg_fires = NEG['fires'].get(rule, 0)
    # Without per-file granularity, we can't compute TP/FP/P/R directly.
    # We can compute: pos_fires_per_file = pos_fires/n_pos,
    # neg_fires_per_file = neg_fires/n_neg, and lift = pos_rate / neg_rate.
    # Capped at 1.0: rules that fire >1× per file (boundary-violation has
    # 1.27 fires/file) would otherwise produce recall >1, which violates
    # the recall ∈ [0, 1] contract. The cap trades off per-fire-count
    # precision for in-bounds numbers; for per-file granularity see the
    # v4 doc.
    pos_rate = min(1.0, pos_fires / n_pos)
    neg_rate = neg_fires / n_neg
    lift = pos_rate / neg_rate if neg_rate > 0 else float('inf')

    # Approximation: P ≈ pos_fires / (pos_fires + neg_fires) when most
    # files fire at most once (true for v4 corpus — P/R/FPR doc shows
    # per-file counts close to per-fire counts). Mark as approximation.
    p = pos_fires / (pos_fires + neg_fires) if (pos_fires + neg_fires) > 0 else 0
    fpr = neg_rate

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
for v in ['USEFUL', 'OK', 'NOISY', 'INVERTED', 'DORMANT']:
    print(f'  {v}: {v_counts[v]}')
print(f'  Total: {len(rows)}')

# Write to docs
out = REPO / 'docs/research/v5-full-corpus-calibration.md'
content = f'''# v5 full-corpus re-calibration ({n_neg} neg + {n_pos} pos)

**Generated:** 2026-06-26 from `scan-corpus-direct.ts` output.
**Method:** direct scan of each file via `scanFile()`, aggregated per-rule fire counts.
**Caveat:** these numbers are based on raw fire counts, not per-file granularity. The v4 doc used per-file granularity (a file with rule firing N times counts as 1 file). The two are equivalent when most files fire at most once, which the v4 corpus shows. The P column is therefore `pos_fires / (pos_fires + neg_fires)` — an approximation of the v4 `P = TP / (TP + FP)`.

## Summary

- Corpus: {n_neg} neg files + {n_pos} pos files
- Unique rules fired: {len(rows)}
- USEFUL: {v_counts['USEFUL']} | OK: {v_counts['OK']} | NOISY: {v_counts['NOISY']} | INVERTED: {v_counts['INVERTED']} | DORMANT: {v_counts['DORMANT']}

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
now = '2026-06-26T23:30:00Z'
for r in rows:
    lift = min(99.99, r['lift']) if r['lift'] != float('inf') else 99.99
    entry = {
        'recall': round(r['pos_rate'], 4),
        'fpRate': round(r['fpr'], 4),
        'ratio': round(lift, 2),
        'precision': round(r['p'], 4),
        'lastCalibratedAt': now,
        'verdict': r['verdict'],
        '_calibrationNote': f'v5 full corpus re-calibration (2026-06-26): {n_neg} neg + {n_pos} pos. {r["verdict"]} — pos={r["pos_fires"]}, neg={r["neg_fires"]}, P={r["p"]*100:.1f}%, FPR={r["fpr"]*100:.2f}%, lift={"inf" if r["lift"]==float("inf") else f"{r["lift"]:.1f}"}.',
    }
    if r['verdict'] in ('INVERTED', 'NOISY', 'DORMANT'):
        entry['defaultOff'] = True
    signal[r['rule']] = entry
out_signal = REPO / 'src/rules/signal-strength.json'
out_signal.write_text(json.dumps(signal, indent=2) + '\n')
print(f'Updated {out_signal}')
