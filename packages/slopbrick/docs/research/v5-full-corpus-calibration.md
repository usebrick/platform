# v5 full-corpus re-calibration (290927 neg + 264905 pos)

**Generated:** 2026-06-26 from `scan-corpus-direct.ts` output.
**Method:** direct scan of each file via `scanFile()`, aggregated per-rule fire counts.
**Caveat:** these numbers are based on raw fire counts, not per-file granularity. The v4 doc used per-file granularity (a file with rule firing N times counts as 1 file). The two are equivalent when most files fire at most once, which the v4 corpus shows. The P column is therefore `pos_fires / (pos_fires + neg_fires)` — an approximation of the v4 `P = TP / (TP + FP)`.

## Summary

- Corpus: 290927 neg files + 264905 pos files
- Unique rules fired: 50
- USEFUL: 21 | OK: 11 | NOISY: 14 | INVERTED: 4 | DORMANT: 0

## Per-rule table (sorted by lift desc)

| Rule | Pos fires | Neg fires | P | FPR | Lift | Verdict |
|------|----------:|----------:|--:|----:|-----:|---------|
| `logic/zombie-state` | 69 | 8 | 87.0% | 0.00% | 7.4 | **USEFUL** |
| `logic/math-gini-class-usage` | 385 | 87 | 81.6% | 0.03% | 4.9 | **USEFUL** |
| `test/weak-assertion` | 122447 | 24762 | 80.6% | 1.22% | 4.6 | **USEFUL** |
| `test/duplicate-setup` | 232 | 33 | 80.0% | 0.00% | 4.4 | **USEFUL** |
| `visual/math-color-cluster` | 74 | 22 | 77.1% | 0.01% | 3.7 | **USEFUL** |
| `visual/math-rounded-entropy` | 1231 | 383 | 76.3% | 0.13% | 3.5 | **USEFUL** |
| `visual/math-default-font` | 367 | 115 | 76.1% | 0.04% | 3.5 | **USEFUL** |
| `logic/reactive-hook-soup` | 1089 | 342 | 75.8% | 0.12% | 3.4 | **USEFUL** |
| `wcag/focus-appearance` | 1433 | 366 | 75.4% | 0.09% | 3.4 | **USEFUL** |
| `component/shadcn-prop-mismatch` | 644 | 194 | 74.0% | 0.05% | 3.1 | **USEFUL** |
| `logic/optimistic-no-rollback` | 442 | 184 | 70.3% | 0.05% | 2.6 | **USEFUL** |
| `logic/math-console-log-storm` | 1977 | 857 | 69.8% | 0.29% | 2.5 | **USEFUL** |
| `logic/ghost-defensive` | 73 | 27 | 69.6% | 0.00% | 2.5 | **USEFUL** |
| `wcag/focus-obscured` | 1467 | 599 | 69.0% | 0.17% | 2.4 | **USEFUL** |
| `security/hardcoded-secret` | 838 | 216 | 68.9% | 0.06% | 2.4 | **USEFUL** |
| `visual/math-font-entropy` | 1449 | 710 | 67.1% | 0.24% | 2.2 | **USEFUL** |
| `perf/css-bloat` | 3522 | 1798 | 66.2% | 0.62% | 2.2 | **USEFUL** |
| `visual/radius-scale-violation` | 206 | 93 | 65.4% | 0.02% | 2.1 | **USEFUL** |
| `visual/arbitrary-escape` | 3582 | 1809 | 65.3% | 0.14% | 2.1 | **USEFUL** |
| `visual/naturalness-anomaly` | 51334 | 29514 | 64.5% | 9.29% | 2.0 | **OK** |
| `component/giant-component` | 5583 | 3479 | 63.0% | 0.99% | 1.9 | **OK** |
| `security/sql-construction` | 2481 | 1509 | 62.9% | 0.19% | 1.9 | **OK** |
| `layout/gap-monopoly` | 103 | 61 | 62.8% | 0.02% | 1.9 | **OK** |
| `product/ux-pattern-fragmentation` | 37 | 25 | 61.4% | 0.01% | 1.7 | **OK** |
| `visual/math-spacing-entropy` | 511 | 324 | 61.2% | 0.11% | 1.7 | **OK** |
| `layout/spacing-grid` | 241 | 173 | 60.0% | 0.01% | 1.6 | **OK** |
| `typo/calc-raw-px` | 11 | 6 | 60.0% | 0.00% | 1.6 | **OK** |
| `logic/math-any-density` | 590 | 406 | 59.2% | 0.14% | 1.6 | **OK** |
| `perf/cls-image` | 121 | 150 | 58.8% | 0.02% | 1.6 | **OK** |
| `layout/math-element-uniformity` | 791 | 561 | 58.5% | 0.19% | 1.5 | **OK** |
| `logic/boundary-violation` | 204635 | 74022 | 57.4% | 1.90% | 1.5 | **NOISY** |
| `security/dangerous-cors` | 169 | 192 | 57.1% | 0.04% | 1.5 | **NOISY** |
| `security/unsafe-html-render` | 525 | 484 | 56.8% | 0.11% | 1.4 | **NOISY** |
| `test/fake-placeholder` | 16580 | 19550 | 56.7% | 0.51% | 1.4 | **NOISY** |
| `layout/math-grid-uniformity` | 81 | 62 | 56.6% | 0.02% | 1.4 | **NOISY** |
| `context/import-path-mismatch` | 54098 | 42965 | 56.0% | 5.72% | 1.4 | **NOISY** |
| `logic/ks-distribution-shift` | 144889 | 116746 | 55.4% | 40.13% | 1.4 | **NOISY** |
| `visual/inline-style-dominance` | 2594 | 2172 | 54.4% | 0.75% | 1.3 | **NOISY** |
| `visual/spacing-scale-violation` | 4780 | 3418 | 53.6% | 0.70% | 1.3 | **NOISY** |
| `product/terminology-drift` | 8560 | 7369 | 53.5% | 0.67% | 1.3 | **NOISY** |
| `logic/key-prop-missing` | 1675 | 1522 | 51.4% | 0.15% | 1.2 | **NOISY** |
| `security/exposed-env-var` | 179 | 176 | 51.2% | 0.05% | 1.2 | **NOISY** |
| `typo/math-button-label-uniformity` | 43 | 41 | 51.2% | 0.01% | 1.2 | **NOISY** |
| `component/multiple-components-per-file` | 19260 | 18884 | 50.5% | 6.49% | 1.1 | **NOISY** |
| `logic/math-variable-name-entropy` | 55 | 163 | 25.2% | 0.06% | 0.4 | **INVERTED** |
| `logic/zipf-slope-anomaly` | 5460 | 17434 | 23.8% | 5.99% | 0.3 | **INVERTED** |
| `wcag/dragging-movements` | 2 | 13 | 22.2% | 0.00% | 0.3 | **INVERTED** |
| `logic/heaps-deviation` | 4238 | 33168 | 11.3% | 11.40% | 0.1 | **INVERTED** |
| `perf/halstead-anomaly` | 5 | 0 | 100.0% | 0.00% | inf | **USEFUL** |
| `security/fail-open-auth` | 1 | 0 | 100.0% | 0.00% | inf | **USEFUL** |
