# v4 Per-Rule P/R/FPR Table

**Corpus:** 95,599 neg files + 76,550 pos files (frontend, TS/TSX/JS/JSX).
**Generated:** 2026-06-25 from cached `/tmp/v4*-fe-shards/chunk-*.json`.
**Method:** per-file granularity (a file with rule firing N times counts as 1 file).

**Definitions:**
- **Precision (P)** = TP / (TP + FP) = of files this rule flags, what fraction are actually AI?
- **Recall (R)** = TP / n_pos = of all AI files, what fraction does this rule catch?
- **FPR** = FP / n_neg = of all human files, what fraction does this rule false-alarm on?
- **Specificity** = 1 - FPR
- **Lift** = Recall / FPR = how much more likely is this rule to fire on AI than on human?

**Verdict logic:**
- **USEFUL** = P ≥ 50% AND lift ≥ 2 (high precision, strong AI signal — gate on these)
- **OK** = P ≥ 30% AND lift ≥ 1.5 (usable, lower confidence)
- **NOISY** = everything else (low precision OR marginal signal — don't gate on these)
- **INVERTED** = lift < 1.0 (fires more on human than AI — needs different corpus)
- **DORMANT** = 0 fires on both corpora

## USEFUL (18 rules)

| Rule | TP | FP | P | R | FPR | Specificity | F1 | Lift |
|------|---:|---:|--:|--:|----:|------------:|---:|-----:|
| `test/weak-assertion` | 4276 | 2474 | 63.35% | 5.59% | 2.59% | 97.41% | 0.10 | 2.2 |
| `logic/math-console-log-storm` | 1353 | 153 | 89.84% | 1.77% | 0.16% | 99.84% | 0.03 | 11.0 |
| `visual/math-rounded-entropy` | 871 | 384 | 69.40% | 1.14% | 0.40% | 99.60% | 0.02 | 2.8 |
| `logic/reactive-hook-soup` | 749 | 312 | 70.59% | 0.98% | 0.33% | 99.67% | 0.02 | 3.0 |
| `security/sql-construction` | 585 | 302 | 65.95% | 0.76% | 0.32% | 99.68% | 0.02 | 2.4 |
| `wcag/focus-appearance` | 541 | 268 | 66.87% | 0.71% | 0.28% | 99.72% | 0.01 | 2.5 |
| `security/missing-auth-check` | 479 | 39 | 92.47% | 0.63% | 0.04% | 99.96% | 0.01 | 15.3 |
| `component/shadcn-prop-mismatch` | 293 | 146 | 66.74% | 0.38% | 0.15% | 99.85% | 0.01 | 2.5 |
| `visual/math-default-font` | 286 | 92 | 75.66% | 0.37% | 0.10% | 99.90% | 0.01 | 3.9 |
| `logic/optimistic-no-rollback` | 248 | 141 | 63.75% | 0.32% | 0.15% | 99.85% | 0.01 | 2.2 |
| `logic/math-gini-class-usage` | 243 | 79 | 75.47% | 0.32% | 0.08% | 99.92% | 0.01 | 3.8 |
| `security/dangerous-cors` | 108 | 66 | 62.07% | 0.14% | 0.07% | 99.93% | 0.00 | 2.0 |
| `visual/math-color-cluster` | 66 | 21 | 75.86% | 0.09% | 0.02% | 99.98% | 0.00 | 3.9 |
| `logic/zombie-state` | 35 | 7 | 83.33% | 0.05% | 0.01% | 99.99% | 0.00 | 6.2 |
| `test/duplicate-setup` | 22 | 9 | 70.97% | 0.03% | 0.01% | 99.99% | 0.00 | 3.1 |
| `logic/ghost-defensive` | 18 | 1 | 94.74% | 0.02% | 0.00% | 100.00% | 0.00 | 22.5 |
| `typo/calc-raw-px` | 3 | 1 | 75.00% | 0.00% | 0.00% | 100.00% | 0.00 | 3.7 |
| `security/fail-open-auth` | 1 | 0 | 100.00% | 0.00% | 0.00% | 100.00% | 0.00 | inf |

## OK (7 rules)

| Rule | TP | FP | P | R | FPR | Specificity | F1 | Lift |
|------|---:|---:|--:|--:|----:|------------:|---:|-----:|
| `component/giant-component` | 3162 | 2408 | 56.77% | 4.13% | 2.52% | 97.48% | 0.08 | 1.6 |
| `visual/math-font-entropy` | 1051 | 696 | 60.16% | 1.37% | 0.73% | 99.27% | 0.03 | 1.9 |
| `wcag/focus-obscured` | 631 | 444 | 58.70% | 0.82% | 0.46% | 99.54% | 0.02 | 1.8 |
| `visual/arbitrary-escape` | 479 | 372 | 56.29% | 0.63% | 0.39% | 99.61% | 0.01 | 1.6 |
| `logic/math-any-density` | 291 | 207 | 58.43% | 0.38% | 0.22% | 99.78% | 0.01 | 1.8 |
| `security/hardcoded-secret` | 169 | 125 | 57.48% | 0.22% | 0.13% | 99.87% | 0.00 | 1.7 |
| `visual/radius-scale-violation` | 81 | 65 | 55.48% | 0.11% | 0.07% | 99.93% | 0.00 | 1.6 |

## NOISY (9 rules)

| Rule | TP | FP | P | R | FPR | Specificity | F1 | Lift |
|------|---:|---:|--:|--:|----:|------------:|---:|-----:|
| `logic/boundary-violation` | 4692 | 5225 | 47.31% | 6.13% | 5.47% | 94.53% | 0.11 | 1.1 |
| `perf/css-bloat` | 4553 | 4607 | 49.71% | 5.95% | 4.82% | 95.18% | 0.11 | 1.2 |
| `test/fake-placeholder` | 571 | 516 | 52.53% | 0.75% | 0.54% | 99.46% | 0.01 | 1.4 |
| `layout/math-element-uniformity` | 436 | 507 | 46.24% | 0.57% | 0.53% | 99.47% | 0.01 | 1.1 |
| `visual/math-spacing-entropy` | 305 | 311 | 49.51% | 0.40% | 0.33% | 99.67% | 0.01 | 1.2 |
| `security/exposed-env-var` | 96 | 117 | 45.07% | 0.13% | 0.12% | 99.88% | 0.00 | 1.0 |
| `layout/math-grid-uniformity` | 66 | 56 | 54.10% | 0.09% | 0.06% | 99.94% | 0.00 | 1.5 |
| `perf/cls-image` | 59 | 60 | 49.58% | 0.08% | 0.06% | 99.94% | 0.00 | 1.2 |
| `layout/gap-monopoly` | 46 | 57 | 44.66% | 0.06% | 0.06% | 99.94% | 0.00 | 1.0 |

## INVERTED (11 rules)

| Rule | TP | FP | P | R | FPR | Specificity | F1 | Lift |
|------|---:|---:|--:|--:|----:|------------:|---:|-----:|
| `component/multiple-components-per-file` | 9473 | 16961 | 35.84% | 12.37% | 17.74% | 82.26% | 0.18 | 0.7 |
| `context/import-path-mismatch` | 8965 | 16199 | 35.63% | 11.71% | 16.94% | 83.06% | 0.18 | 0.7 |
| `visual/spacing-scale-violation` | 1470 | 1894 | 43.70% | 1.92% | 1.98% | 98.02% | 0.04 | 1.0 |
| `visual/inline-style-dominance` | 1205 | 2057 | 36.94% | 1.57% | 2.15% | 97.85% | 0.03 | 0.7 |
| `security/public-admin-route` | 217 | 747 | 22.51% | 0.28% | 0.78% | 99.22% | 0.01 | 0.4 |
| `security/unsafe-html-render` | 170 | 291 | 36.88% | 0.22% | 0.30% | 99.70% | 0.00 | 0.7 |
| `logic/key-prop-missing` | 135 | 386 | 25.91% | 0.18% | 0.40% | 99.60% | 0.00 | 0.4 |
| `layout/spacing-grid` | 23 | 31 | 42.59% | 0.03% | 0.03% | 99.97% | 0.00 | 0.9 |
| `typo/math-button-label-uniformity` | 20 | 27 | 42.55% | 0.03% | 0.03% | 99.97% | 0.00 | 0.9 |
| `logic/math-variable-name-entropy` | 8 | 35 | 18.60% | 0.01% | 0.04% | 99.96% | 0.00 | 0.3 |
| `wcag/dragging-movements` | 0 | 3 | 0.00% | 0.00% | 0.00% | 100.00% | 0.00 | 0.0 |

## Summary

| Verdict | Count | % |
|---------|------:|--:|
| USEFUL | 18 | 40% |
| OK | 7 | 16% |
| NOISY | 9 | 20% |
| INVERTED | 11 | 24% |
| DORMANT | 0 | 0% |
| **Total** | **45** | **100%** |

## Top 10 rules by lift (highest AI-vs-human signal)

| # | Rule | P | FPR | Lift | Verdict |
|--:|------|--:|----:|-----:|---------|
| 1 | `component/multiple-components-per-file` | 35.8% | 17.742% | 0.7 | INVERTED |
| 2 | `context/import-path-mismatch` | 35.6% | 16.945% | 0.7 | INVERTED |
| 3 | `logic/boundary-violation` | 47.3% | 5.466% | 1.1 | NOISY |
| 4 | `perf/css-bloat` | 49.7% | 4.819% | 1.2 | NOISY |
| 5 | `test/weak-assertion` | 63.3% | 2.588% | 2.2 | USEFUL |
| 6 | `component/giant-component` | 56.8% | 2.519% | 1.6 | OK |
| 7 | `visual/spacing-scale-violation` | 43.7% | 1.981% | 1.0 | INVERTED |
| 8 | `logic/math-console-log-storm` | 89.8% | 0.160% | 11.0 | USEFUL |
| 9 | `visual/inline-style-dominance` | 36.9% | 2.152% | 0.7 | INVERTED |
| 10 | `visual/math-font-entropy` | 60.2% | 0.728% | 1.9 | OK |

## 18 USEFUL rules (gate on these for the launch)

These 18 rules are the high-confidence AI signal. When ANY of them fires, the file is more likely AI than not.

| Rule | P | Lift | Use case |
|------|--:|-----:|----------|
| `test/weak-assertion` | 63.3% | 2.2 | `expect(x).toBeTruthy()` instead of value |
| `logic/math-console-log-storm` | 89.8% | 11.0 | debug `console.log` left in |
| `visual/math-rounded-entropy` | 69.4% | 2.8 | rounded-* used uniformly |
| `logic/reactive-hook-soup` | 70.6% | 3.0 | effects/handlers inlined |
| `security/sql-construction` | 66.0% | 2.4 | raw SQL string concat |
| `wcag/focus-appearance` | 66.9% | 2.5 | outline removed without focus-visible |
| `security/missing-auth-check` | 92.5% | 15.3 | auth bypass — production risk |
| `component/shadcn-prop-mismatch` | 66.7% | 2.5 | shadcn className prop overridden |
| `visual/math-default-font` | 75.7% | 3.9 | font-family defaults to Inter/system |
| `logic/optimistic-no-rollback` | 63.8% | 2.2 | optimistic update without catch |
| `logic/math-gini-class-usage` | 75.5% | 3.8 | few class strings used everywhere |
| `security/dangerous-cors` | 62.1% | 2.0 | CORS set to `*` |
| `visual/math-color-cluster` | 75.9% | 3.9 | 1-2 hex colors dominate |
| `logic/zombie-state` | 83.3% | 6.2 | unused `useState` declarations |
| `test/duplicate-setup` | 71.0% | 3.1 | verbatim `beforeEach` copy-paste |
| `logic/ghost-defensive` | 94.7% | 22.5 | dead `if (x) return` guards |
| `typo/calc-raw-px` | 75.0% | 3.7 | `calc(100% - 16px)` hand-written |
| `security/fail-open-auth` | 100.0% | inf | `if (!auth) return next()` instead of blocking |