# v7 corpus re-calibration (PARTIAL — scans still running)

**Generated:** 2026-06-28T01:32:19.374457
**WARNING:** This is a PARTIAL calibration. Both v7 scans are still
in progress. Re-run `compute-v7-calibration.py` when they finish
for the final calibration that updates `signal-strength.json`.

**Corpus (as of now):**
- Neg: 183413 files
- Pos: 236981 files

**Verdict distribution:**
- USEFUL: 21 | OK: 7 | NOISY: 5 | INVERTED: 8 | DORMANT: 0 | HYGIENE: 22

## Per-rule table (sorted by lift desc)

| Rule | AI | TP | FP | P | FPR | Lift | Verdict |
|------|:--:|---:|---:|--:|----:|-----:|---------|
| `ai/default-react-stack` | Y | 46 | 0 | 100.0% | 0.00% | inf | **USEFUL** |
| `ai/library-reinvention` | Y | 9 | 0 | 100.0% | 0.00% | inf | **USEFUL** |
| `layout/gap-monopoly` | N | 31 | 0 | 100.0% | 0.00% | inf | **HYGIENE** |
| `layout/spacing-grid` | N | 72 | 0 | 100.0% | 0.00% | inf | **HYGIENE** |
| `typo/math-button-label-uniformity` | N | 8 | 0 | 100.0% | 0.00% | inf | **HYGIENE** |
| `visual/radius-scale-violation` | N | 26 | 0 | 100.0% | 0.00% | inf | **HYGIENE** |
| `visual/math-spacing-entropy` | Y | 145 | 3 | 98.0% | 0.00% | 37.4 | **USEFUL** |
| `test/fake-placeholder` | Y | 7117 | 249 | 96.6% | 0.14% | 22.1 | **USEFUL** |
| `component/shadcn-prop-mismatch` | Y | 160 | 6 | 96.4% | 0.00% | 20.6 | **USEFUL** |
| `security/exposed-env-var` | N | 53 | 2 | 96.4% | 0.00% | 20.5 | **HYGIENE** |
| `security/hardcoded-secret` | Y | 134 | 6 | 95.7% | 0.00% | 17.3 | **USEFUL** |
| `visual/math-rounded-entropy` | Y | 210 | 11 | 95.0% | 0.01% | 14.8 | **USEFUL** |
| `visual/spacing-scale-violation` | N | 1134 | 60 | 95.0% | 0.03% | 14.6 | **HYGIENE** |
| `visual/arbitrary-escape` | Y | 547 | 29 | 95.0% | 0.02% | 14.6 | **USEFUL** |
| `logic/math-gini-class-usage` | Y | 52 | 3 | 94.5% | 0.00% | 13.4 | **USEFUL** |
| `wcag/focus-obscured` | N | 277 | 17 | 94.2% | 0.01% | 12.6 | **HYGIENE** |
| `logic/reactive-hook-soup` | Y | 245 | 16 | 93.9% | 0.01% | 11.9 | **USEFUL** |
| `wcag/focus-appearance` | N | 274 | 18 | 93.8% | 0.01% | 11.8 | **HYGIENE** |
| `ai/tailwind-color-overuse` | Y | 1576 | 134 | 92.2% | 0.07% | 9.1 | **USEFUL** |
| `logic/key-prop-missing` | N | 561 | 48 | 92.1% | 0.03% | 9.0 | **HYGIENE** |
| `perf/css-bloat` | N | 712 | 70 | 91.0% | 0.04% | 7.9 | **HYGIENE** |
| `visual/math-default-font` | Y | 49 | 5 | 90.7% | 0.00% | 7.6 | **USEFUL** |
| `test/weak-assertion` | Y | 22200 | 2350 | 90.4% | 1.28% | 7.3 | **USEFUL** |
| `product/terminology-drift` | N | 4339 | 470 | 90.2% | 0.26% | 7.1 | **HYGIENE** |
| `perf/cls-image` | N | 33 | 4 | 89.2% | 0.00% | 6.4 | **HYGIENE** |
| `visual/math-font-entropy` | Y | 278 | 34 | 89.1% | 0.02% | 6.3 | **USEFUL** |
| `context/import-path-mismatch` | N | 27565 | 3668 | 88.3% | 2.00% | 5.8 | **HYGIENE** |
| `layout/math-element-uniformity` | Y | 208 | 32 | 86.7% | 0.02% | 5.0 | **USEFUL** |
| `test/duplicate-setup` | Y | 24 | 4 | 85.7% | 0.00% | 4.6 | **USEFUL** |
| `ai/fetch-default-overuse` | Y | 140 | 25 | 84.8% | 0.01% | 4.3 | **USEFUL** |
| `component/giant-component` | Y | 1098 | 312 | 77.9% | 0.17% | 2.7 | **USEFUL** |
| `security/unsafe-html-render` | N | 156 | 45 | 77.6% | 0.02% | 2.7 | **HYGIENE** |
| `logic/optimistic-no-rollback` | Y | 96 | 28 | 77.4% | 0.02% | 2.7 | **USEFUL** |
| `ai/console-debug-storm` | Y | 302 | 97 | 75.7% | 0.05% | 2.4 | **USEFUL** |
| `logic/math-console-log-storm` | Y | 330 | 122 | 73.0% | 0.07% | 2.1 | **USEFUL** |
| `logic/math-variable-name-entropy` | N | 16 | 6 | 72.7% | 0.00% | 2.1 | **HYGIENE** |
| `component/multiple-components-per-file` | N | 5398 | 2078 | 72.2% | 1.13% | 2.0 | **HYGIENE** |
| `ai/markdown-leakage` | Y | 5 | 2 | 71.4% | 0.00% | 1.9 | **OK** |
| `security/dangerous-cors` | Y | 16 | 7 | 69.6% | 0.00% | 1.8 | **OK** |
| `logic/zipf-slope-anomaly` | N | 1307 | 575 | 69.4% | 0.31% | 1.8 | **HYGIENE** |
| `ai/comment-ratio` | Y | 20336 | 9239 | 68.8% | 5.04% | 1.7 | **OK** |
| `visual/inline-style-dominance` | N | 990 | 456 | 68.5% | 0.25% | 1.7 | **HYGIENE** |
| `ai/compression-profile` | Y | 21681 | 10161 | 68.1% | 5.54% | 1.7 | **OK** |
| `ai/segment-surprisal-cv` | Y | 11789 | 5689 | 67.5% | 3.10% | 1.6 | **OK** |
| `ai/text-like-ratio` | Y | 2 | 1 | 66.7% | 0.00% | 1.5 | **OK** |
| `visual/naturalness-anomaly` | Y | 10375 | 5232 | 66.5% | 2.85% | 1.5 | **OK** |
| `logic/ks-distribution-shift` | N | 37560 | 19669 | 65.6% | 10.72% | 1.5 | **HYGIENE** |
| `ai/state-default-overuse` | Y | 145 | 76 | 65.6% | 0.04% | 1.5 | **NOISY** |
| `ai/whitespace-regularity` | Y | 5488 | 2911 | 65.3% | 1.59% | 1.5 | **NOISY** |
| `ai/any-density` | Y | 536 | 286 | 65.2% | 0.16% | 1.5 | **NOISY** |
| `ai/errors-near-eof` | Y | 6273 | 3495 | 64.2% | 1.91% | 1.4 | **NOISY** |
| `logic/boundary-violation` | N | 21942 | 12840 | 63.1% | 7.00% | 1.3 | **HYGIENE** |
| `logic/heaps-deviation` | N | 1033 | 695 | 59.8% | 0.38% | 1.2 | **HYGIENE** |
| `logic/math-any-density` | Y | 150 | 110 | 57.7% | 0.06% | 1.1 | **NOISY** |
| `wcag/dragging-movements` | N | 0 | 1 | 0.0% | 0.00% | 0.0 | **HYGIENE** |
| `ai/renyi-profile` | Y | 1 | 3 | 25.0% | 0.00% | 0.3 | **INVERTED** |
| `layout/math-grid-uniformity` | Y | 12 | 13 | 48.0% | 0.01% | 0.7 | **INVERTED** |
| `logic/ghost-defensive` | Y | 0 | 3 | 0.0% | 0.00% | 0.0 | **INVERTED** |
| `logic/zombie-state` | Y | 7 | 7 | 50.0% | 0.00% | 0.8 | **INVERTED** |
| `perf/halstead-anomaly` | Y | 1 | 1 | 50.0% | 0.00% | 0.8 | **INVERTED** |
| `product/ux-pattern-fragmentation` | Y | 5 | 9 | 35.7% | 0.00% | 0.4 | **INVERTED** |
| `security/sql-construction` | Y | 348 | 440 | 44.2% | 0.24% | 0.6 | **INVERTED** |
| `visual/math-color-cluster` | Y | 2 | 3 | 40.0% | 0.00% | 0.5 | **INVERTED** |
