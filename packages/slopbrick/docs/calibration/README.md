# Calibration Docs

This directory contains calibration documentation for slopbrick.

## Active plan

- [v10.2-plan.md](./v10.2-plan.md) — full recalibration plan based
  on the v0.43.0 audit. Phases 1-7, ~20 hours of work, references
  included.

## Context

The current calibration (v0.10.1) is on 581k files. The actual
corpus is 1,134,163 files — 2x more data. The v10.2 plan:

1. Adds 4 missing language rule directories (Kotlin, Ruby, C#, PHP)
2. Re-runs the calibrator on the full v10 corpus
3. Adds per-language filtering
4. Fixes 11 rules with 0/0 calibration data
5. Updates DORMANT comments to v10.2
6. Makes flywheel non-determinism predictable
7. Verifies the full test suite

## Related docs

- [`../scoring-runbook.md`](../scoring-runbook.md) — how the 4
  scores work
- [`../scoring-explained.md`](../scoring-explained.md) — what the
  scores mean
- [`../rule-catalog.md`](../rule-catalog.md) — the full 103-rule
  catalog with calibration status
- [`../research/`](../research/) — calibration tooling
- [`../experiment-findings.md`](../experiment-findings.md) — the
  v0.10.1 calibration methodology

## Calibration history

| Version | Date | Corpus | Method | Rules | Notes |
|---|---|---|---|---|---|
| v0.20.0 | 2026-06-28 | 184k | Naive | 66 | Java rules added |
| v0.21.0 | 2026-06-29 | 184k | Naive | 81 | aiSlopScore flip |
| v0.36.1 | 2026-07-04 | 576k | Full | 140 | First real calibration |
| v0.38.0 | 2026-07-04 | 576k | Trim | 103 | Dropped 37 DORMANT |
| v0.10.1 | 2026-07-04 | 581k | Wilcoxon | 103 | Statistical re-test |
| **v0.10.2** | **planned** | **1.13M** | **Full** | **~115** | **Adds 4 langs** |

## Quick reference

```bash
# Run calibration
slopbrick calibrate \
  --positive-dir /Users/cheng/corpus-expansion/positive \
  --negative-dir /Users/cheng/corpus-expansion/negative

# Self-scan (after calibration)
slopbrick scan --workspace packages/slopbrick --brief

# View calibration state
cat src/rules/signal-strength.json | python3 -m json.tool | head -50
```
