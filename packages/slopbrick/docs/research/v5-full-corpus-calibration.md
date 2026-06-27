# v5 full-corpus re-calibration (86983 neg + 81787 pos)

**Generated:** 2026-06-26 from `scan-corpus-direct.ts` output.
**Method:** direct scan of each file via `scanFile()`, aggregated per-rule fire counts.
**Caveat:** these numbers are based on raw fire counts, not per-file granularity. The v4 doc used per-file granularity (a file with rule firing N times counts as 1 file). The two are equivalent when most files fire at most once, which the v4 corpus shows. The P column is therefore `pos_fires / (pos_fires + neg_fires)` — an approximation of the v4 `P = TP / (TP + FP)`.

## Summary

- Corpus: 86983 neg files + 81787 pos files
- Unique rules fired: 47
- USEFUL: 16 | OK: 10 | NOISY: 7 | INVERTED: 14 | DORMANT: 0

## Per-rule table (sorted by lift desc)

| Rule | Pos fires | Neg fires | P | FPR | Lift | Verdict |
|------|----------:|----------:|--:|----:|-----:|---------|
| `logic/ghost-defensive` | 73 | 3 | 96.1% | 0.00% | 25.9 | **USEFUL** |
| `logic/math-console-log-storm` | 718 | 133 | 84.4% | 0.15% | 5.7 | **USEFUL** |
| `logic/zombie-state` | 42 | 8 | 84.0% | 0.01% | 5.6 | **USEFUL** |
| `test/duplicate-setup` | 138 | 30 | 82.1% | 0.03% | 4.9 | **USEFUL** |
| `logic/math-gini-class-usage` | 227 | 71 | 76.2% | 0.08% | 3.4 | **USEFUL** |
| `visual/math-default-font` | 262 | 91 | 74.2% | 0.10% | 3.1 | **USEFUL** |
| `typo/calc-raw-px` | 8 | 3 | 72.7% | 0.00% | 2.8 | **USEFUL** |
| `security/sql-construction` | 1468 | 606 | 70.8% | 0.70% | 2.6 | **USEFUL** |
| `component/shadcn-prop-mismatch` | 443 | 187 | 70.3% | 0.21% | 2.5 | **USEFUL** |
| `wcag/focus-appearance` | 820 | 354 | 69.8% | 0.41% | 2.5 | **USEFUL** |
| `visual/math-rounded-entropy` | 786 | 347 | 69.4% | 0.40% | 2.4 | **USEFUL** |
| `logic/reactive-hook-soup` | 664 | 295 | 69.2% | 0.34% | 2.4 | **USEFUL** |
| `visual/math-color-cluster` | 44 | 20 | 68.8% | 0.02% | 2.3 | **USEFUL** |
| `test/weak-assertion` | 39218 | 18298 | 68.2% | 21.04% | 2.3 | **USEFUL** |
| `logic/optimistic-no-rollback` | 258 | 152 | 62.9% | 0.17% | 1.8 | **OK** |
| `security/hardcoded-secret` | 191 | 114 | 62.6% | 0.13% | 1.8 | **OK** |
| `visual/naturalness-anomaly` | 20056 | 12617 | 61.4% | 14.51% | 1.7 | **OK** |
| `logic/boundary-violation` | 104057 | 51526 | 66.9% | 59.24% | 1.7 | **OK** |
| `visual/radius-scale-violation` | 144 | 93 | 60.8% | 0.11% | 1.6 | **OK** |
| `visual/math-font-entropy` | 991 | 646 | 60.5% | 0.74% | 1.6 | **OK** |
| `security/dangerous-cors` | 98 | 66 | 59.8% | 0.08% | 1.6 | **OK** |
| `layout/math-grid-uniformity` | 62 | 42 | 59.6% | 0.05% | 1.6 | **OK** |
| `wcag/focus-obscured` | 704 | 479 | 59.5% | 0.55% | 1.6 | **OK** |
| `perf/css-bloat` | 2177 | 1527 | 58.8% | 1.76% | 1.5 | **OK** |
| `logic/math-any-density` | 259 | 184 | 58.5% | 0.21% | 1.5 | **NOISY** |
| `component/giant-component` | 2962 | 2531 | 53.9% | 2.91% | 1.2 | **NOISY** |
| `visual/arbitrary-escape` | 1720 | 1491 | 53.6% | 1.71% | 1.2 | **NOISY** |
| `layout/spacing-grid` | 113 | 99 | 53.3% | 0.11% | 1.2 | **NOISY** |
| `product/ux-pattern-fragmentation` | 26 | 24 | 52.0% | 0.03% | 1.2 | **NOISY** |
| `visual/math-spacing-entropy` | 290 | 279 | 51.0% | 0.32% | 1.1 | **NOISY** |
| `layout/math-element-uniformity` | 407 | 430 | 48.6% | 0.49% | 1.0 | **NOISY** |
| `visual/spacing-scale-violation` | 2559 | 2852 | 47.3% | 3.28% | 1.0 | **INVERTED** |
| `typo/math-button-label-uniformity` | 19 | 23 | 45.2% | 0.03% | 0.9 | **INVERTED** |
| `perf/cls-image` | 64 | 80 | 44.4% | 0.09% | 0.9 | **INVERTED** |
| `test/fake-placeholder` | 3362 | 4354 | 43.6% | 5.01% | 0.8 | **INVERTED** |
| `security/exposed-env-var` | 77 | 106 | 42.1% | 0.12% | 0.8 | **INVERTED** |
| `layout/gap-monopoly` | 38 | 53 | 41.8% | 0.06% | 0.8 | **INVERTED** |
| `visual/inline-style-dominance` | 1094 | 1812 | 37.6% | 2.08% | 0.6 | **INVERTED** |
| `component/multiple-components-per-file` | 7247 | 14796 | 32.9% | 17.01% | 0.5 | **INVERTED** |
| `context/import-path-mismatch` | 18849 | 39226 | 32.5% | 45.10% | 0.5 | **INVERTED** |
| `logic/key-prop-missing` | 452 | 1081 | 29.5% | 1.24% | 0.4 | **INVERTED** |
| `security/unsafe-html-render` | 168 | 411 | 29.0% | 0.47% | 0.4 | **INVERTED** |
| `product/terminology-drift` | 1654 | 6566 | 20.1% | 7.55% | 0.3 | **INVERTED** |
| `logic/math-variable-name-entropy` | 5 | 29 | 14.7% | 0.03% | 0.2 | **INVERTED** |
| `wcag/dragging-movements` | 0 | 3 | 0.0% | 0.00% | 0.0 | **INVERTED** |
| `perf/halstead-anomaly` | 2 | 0 | 100.0% | 0.00% | inf | **USEFUL** |
| `security/fail-open-auth` | 1 | 0 | 100.0% | 0.00% | inf | **USEFUL** |
