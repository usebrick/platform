# vv6 full-corpus re-calibration (86983 neg + 81787 pos)

**Generated:** 2026-06-27 from `scan-corpus-direct.ts` output.
**Method:** direct scan of each file via `scanFile()`, aggregated per-rule fire counts.
**Caveat:** these numbers are based on raw fire counts, not per-file granularity. The v4 doc used per-file granularity (a file with rule firing N times counts as 1 file). The two are equivalent when most files fire at most once, which the v4 corpus shows. The P column is therefore `pos_fires / (pos_fires + neg_fires)` — an approximation of the v4 `P = TP / (TP + FP)`.

## Summary

- Corpus: 86983 neg files + 81787 pos files
- Unique rules fired: 50
- USEFUL: 12 | OK: 6 | NOISY: 9 | INVERTED: 0 | DORMANT: 0 | HYGIENE: 23

## Per-rule table (sorted by lift desc)

| Rule | Pos fires | Neg fires | P | FPR | Lift | Verdict |
|------|----------:|----------:|--:|----:|-----:|---------|
| `logic/ghost-defensive` | 73 | 3 | 94.1% | 0.00% | 17.0 | **USEFUL** |
| `logic/math-console-log-storm` | 718 | 133 | 84.4% | 0.15% | 5.7 | **USEFUL** |
| `logic/zombie-state` | 42 | 8 | 82.1% | 0.01% | 4.9 | **USEFUL** |
| `logic/math-gini-class-usage` | 227 | 71 | 76.2% | 0.08% | 3.4 | **USEFUL** |
| `visual/math-default-font` | 262 | 91 | 74.2% | 0.10% | 3.1 | **USEFUL** |
| `test/duplicate-setup` | 138 | 30 | 71.0% | 0.01% | 2.6 | **USEFUL** |
| `visual/math-rounded-entropy` | 786 | 347 | 69.4% | 0.40% | 2.4 | **USEFUL** |
| `logic/reactive-hook-soup` | 664 | 295 | 68.8% | 0.34% | 2.3 | **USEFUL** |
| `visual/math-color-cluster` | 44 | 20 | 68.8% | 0.02% | 2.3 | **USEFUL** |
| `typo/calc-raw-px` | 8 | 3 | 66.7% | 0.00% | 2.1 | **HYGIENE** |
| `component/shadcn-prop-mismatch` | 443 | 187 | 66.3% | 0.16% | 2.1 | **USEFUL** |
| `wcag/focus-appearance` | 820 | 354 | 65.7% | 0.29% | 2.0 | **HYGIENE** |
| `security/sql-construction` | 1468 | 606 | 64.9% | 0.32% | 2.0 | **OK** |
| `test/weak-assertion` | 39218 | 18298 | 63.8% | 2.73% | 1.9 | **OK** |
| `visual/naturalness-anomaly` | 20056 | 12617 | 62.9% | 12.99% | 1.8 | **OK** |
| `logic/optimistic-no-rollback` | 258 | 152 | 60.9% | 0.15% | 1.7 | **OK** |
| `visual/math-font-entropy` | 991 | 646 | 60.5% | 0.74% | 1.6 | **OK** |
| `layout/math-grid-uniformity` | 62 | 42 | 59.6% | 0.05% | 1.6 | **OK** |
| `perf/css-bloat` | 2177 | 1527 | 58.8% | 1.76% | 1.5 | **HYGIENE** |
| `wcag/focus-obscured` | 704 | 479 | 58.5% | 0.46% | 1.5 | **HYGIENE** |
| `logic/math-any-density` | 259 | 184 | 58.5% | 0.21% | 1.5 | **NOISY** |
| `security/hardcoded-secret` | 191 | 114 | 58.0% | 0.11% | 1.5 | **NOISY** |
| `security/dangerous-cors` | 98 | 66 | 57.5% | 0.07% | 1.4 | **NOISY** |
| `visual/arbitrary-escape` | 1720 | 1491 | 55.7% | 0.40% | 1.3 | **NOISY** |
| `test/fake-placeholder` | 3362 | 4354 | 55.1% | 0.53% | 1.3 | **NOISY** |
| `component/giant-component` | 2962 | 2531 | 54.5% | 2.59% | 1.3 | **NOISY** |
| `visual/radius-scale-violation` | 144 | 93 | 54.3% | 0.07% | 1.3 | **HYGIENE** |
| `product/ux-pattern-fragmentation` | 26 | 24 | 53.3% | 0.02% | 1.2 | **NOISY** |
| `visual/math-spacing-entropy` | 290 | 279 | 51.0% | 0.32% | 1.1 | **NOISY** |
| `layout/spacing-grid` | 113 | 99 | 50.0% | 0.02% | 1.1 | **HYGIENE** |
| `perf/cls-image` | 64 | 80 | 50.0% | 0.06% | 1.1 | **HYGIENE** |
| `layout/math-element-uniformity` | 407 | 430 | 48.6% | 0.49% | 1.0 | **NOISY** |
| `typo/math-button-label-uniformity` | 19 | 23 | 45.2% | 0.03% | 0.9 | **HYGIENE** |
| `logic/boundary-violation` | 104057 | 51526 | 45.1% | 5.43% | 0.9 | **HYGIENE** |
| `security/exposed-env-var` | 77 | 106 | 44.9% | 0.10% | 0.9 | **HYGIENE** |
| `visual/spacing-scale-violation` | 2559 | 2852 | 43.6% | 1.96% | 0.8 | **HYGIENE** |
| `layout/gap-monopoly` | 38 | 53 | 41.8% | 0.06% | 0.8 | **HYGIENE** |
| `logic/ks-distribution-shift` | 53751 | 75590 | 41.6% | 86.90% | 0.8 | **HYGIENE** |
| `logic/heaps-deviation` | 10641 | 15141 | 41.3% | 17.41% | 0.7 | **HYGIENE** |
| `visual/inline-style-dominance` | 1094 | 1812 | 37.6% | 2.08% | 0.6 | **HYGIENE** |
| `context/import-path-mismatch` | 18849 | 39226 | 34.0% | 17.48% | 0.5 | **HYGIENE** |
| `component/multiple-components-per-file` | 7247 | 14796 | 32.9% | 17.01% | 0.5 | **HYGIENE** |
| `security/unsafe-html-render` | 168 | 411 | 30.7% | 0.31% | 0.5 | **HYGIENE** |
| `logic/key-prop-missing` | 452 | 1081 | 28.7% | 0.34% | 0.4 | **HYGIENE** |
| `logic/zipf-slope-anomaly` | 2110 | 6820 | 23.6% | 7.84% | 0.3 | **HYGIENE** |
| `product/terminology-drift` | 1654 | 6566 | 22.5% | 1.98% | 0.3 | **HYGIENE** |
| `logic/math-variable-name-entropy` | 5 | 29 | 14.7% | 0.03% | 0.2 | **HYGIENE** |
| `wcag/dragging-movements` | 0 | 3 | 0.0% | 0.00% | 0.0 | **HYGIENE** |
| `perf/halstead-anomaly` | 2 | 0 | 100.0% | 0.00% | inf | **USEFUL** |
| `security/fail-open-auth` | 1 | 0 | 100.0% | 0.00% | inf | **USEFUL** |
