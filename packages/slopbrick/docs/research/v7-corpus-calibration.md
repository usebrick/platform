# v7 corpus re-calibration (min-date=2025-01-01, filter=on)

**Generated:** 2026-06-27 from `scan-corpus-robust-v2.ts` output on the v7 symlink dirs.

**Corpus (after date filter >= 2025-01-01):**
- Neg: 184488 files
- Pos: 239054 files

**v7 contamination fix:** The v6 calibration used 91 pos repos labeled at the project level — many of these were real OSS projects that adopted AI tools recently, with individual files written by humans in 2022-2024. v7 uses a curated pure-AI pos subset: `vibe-coded/*` (100 sub-repos), `claude-code`, `aider`, `tabby`, `continue`, and AI agent frameworks (`PraisonAI`, `agno`, `autogen`, `crewAI`).

**Verdict distribution:**
- USEFUL: 31 | OK: 5 | NOISY: 5 | INVERTED: 1 | DORMANT: 0 | HYGIENE: 23

## Per-rule table (sorted by lift desc)

| Rule | AI | TP | FP | P | FPR | Lift | Verdict |
|------|:--:|---:|---:|--:|----:|-----:|---------|
| `security/fail-open-auth` | Y | 1 | 0 | 100.0% | 0.00% | inf | **USEFUL** |
| `ai/default-react-stack` | Y | 231 | 1 | 99.6% | 0.00% | 178.3 | **USEFUL** |
| `visual/radius-scale-violation` | N | 96 | 3 | 97.0% | 0.00% | 24.7 | **HYGIENE** |
| `wcag/focus-appearance` | N | 612 | 24 | 96.2% | 0.01% | 19.7 | **HYGIENE** |
| `visual/math-rounded-entropy` | Y | 876 | 62 | 93.4% | 0.03% | 10.9 | **USEFUL** |
| `component/shadcn-prop-mismatch` | Y | 314 | 24 | 92.9% | 0.01% | 10.1 | **USEFUL** |
| `ai/library-reinvention` | Y | 64 | 5 | 92.8% | 0.00% | 9.9 | **USEFUL** |
| `logic/zombie-state` | Y | 24 | 2 | 92.3% | 0.00% | 9.3 | **USEFUL** |
| `visual/math-color-cluster` | Y | 58 | 5 | 92.1% | 0.00% | 9.0 | **USEFUL** |
| `ai/console-debug-storm` | Y | 1912 | 175 | 91.6% | 0.09% | 8.4 | **USEFUL** |
| `ai/fetch-default-overuse` | Y | 666 | 76 | 89.8% | 0.04% | 6.8 | **USEFUL** |
| `logic/math-console-log-storm` | Y | 1678 | 193 | 89.7% | 0.10% | 6.7 | **USEFUL** |
| `logic/ghost-defensive` | Y | 15 | 2 | 88.2% | 0.00% | 5.8 | **USEFUL** |
| `logic/math-gini-class-usage` | Y | 310 | 47 | 86.8% | 0.03% | 5.1 | **USEFUL** |
| `test/weak-assertion` | Y | 9906 | 1583 | 86.2% | 0.86% | 4.8 | **USEFUL** |
| `logic/reactive-hook-soup` | Y | 901 | 162 | 84.8% | 0.09% | 4.3 | **USEFUL** |
| `ai/tailwind-color-overuse` | Y | 5169 | 958 | 84.4% | 0.52% | 4.2 | **USEFUL** |
| `perf/css-bloat` | N | 2790 | 591 | 82.5% | 0.32% | 3.6 | **HYGIENE** |
| `logic/optimistic-no-rollback` | Y | 281 | 60 | 82.4% | 0.03% | 3.6 | **USEFUL** |
| `test/duplicate-setup` | Y | 14 | 3 | 82.4% | 0.00% | 3.6 | **USEFUL** |
| `wcag/focus-obscured` | N | 797 | 175 | 82.0% | 0.09% | 3.5 | **HYGIENE** |
| `ai/state-default-overuse` | Y | 701 | 158 | 81.6% | 0.09% | 3.4 | **USEFUL** |
| `visual/math-default-font` | Y | 313 | 71 | 81.5% | 0.04% | 3.4 | **USEFUL** |
| `visual/math-font-entropy` | Y | 1067 | 248 | 81.1% | 0.13% | 3.3 | **USEFUL** |
| `context/import-path-mismatch` | N | 17672 | 4202 | 80.8% | 2.28% | 3.2 | **HYGIENE** |
| `product/ux-pattern-fragmentation` | Y | 32 | 8 | 80.0% | 0.00% | 3.1 | **USEFUL** |
| `visual/math-spacing-entropy` | Y | 425 | 109 | 79.6% | 0.06% | 3.0 | **USEFUL** |
| `product/terminology-drift` | N | 2028 | 521 | 79.6% | 0.28% | 3.0 | **HYGIENE** |
| `layout/gap-monopoly` | N | 88 | 23 | 79.3% | 0.01% | 3.0 | **HYGIENE** |
| `test/fake-placeholder` | Y | 1259 | 344 | 78.5% | 0.19% | 2.8 | **USEFUL** |
| `visual/arbitrary-escape` | Y | 600 | 169 | 78.0% | 0.09% | 2.7 | **USEFUL** |
| `visual/naturalness-anomaly` | Y | 39319 | 11382 | 77.6% | 6.17% | 2.7 | **USEFUL** |
| `ai/text-like-ratio` | Y | 3 | 1 | 75.0% | 0.00% | 2.3 | **USEFUL** |
| `perf/halstead-anomaly` | Y | 3 | 1 | 75.0% | 0.00% | 2.3 | **USEFUL** |
| `typo/calc-raw-px` | N | 3 | 1 | 75.0% | 0.00% | 2.3 | **HYGIENE** |
| `component/giant-component` | Y | 4205 | 1413 | 74.8% | 0.77% | 2.3 | **USEFUL** |
| `layout/math-element-uniformity` | Y | 666 | 225 | 74.7% | 0.12% | 2.3 | **USEFUL** |
| `ai/segment-surprisal-cv` | Y | 43498 | 14983 | 74.4% | 8.12% | 2.2 | **USEFUL** |
| `visual/spacing-scale-violation` | N | 1981 | 717 | 73.4% | 0.39% | 2.1 | **HYGIENE** |
| `ai/compression-profile` | Y | 75031 | 27473 | 73.2% | 14.89% | 2.1 | **USEFUL** |
| `layout/spacing-grid` | N | 39 | 15 | 72.2% | 0.01% | 2.0 | **HYGIENE** |
| `ai/markdown-leakage` | Y | 5 | 2 | 71.4% | 0.00% | 1.9 | **OK** |
| `logic/ks-distribution-shift` | N | 152391 | 62358 | 71.0% | 33.80% | 1.9 | **HYGIENE** |
| `logic/zipf-slope-anomaly` | N | 3718 | 1606 | 69.8% | 0.87% | 1.8 | **HYGIENE** |
| `layout/math-grid-uniformity` | Y | 67 | 30 | 69.1% | 0.02% | 1.7 | **OK** |
| `security/hardcoded-secret` | Y | 307 | 138 | 69.0% | 0.07% | 1.7 | **OK** |
| `security/sql-construction` | Y | 710 | 336 | 67.9% | 0.18% | 1.6 | **OK** |
| `ai/comment-ratio` | Y | 60308 | 29876 | 66.9% | 16.19% | 1.6 | **OK** |
| `security/unsafe-html-render` | N | 312 | 160 | 66.1% | 0.09% | 1.5 | **HYGIENE** |
| `logic/boundary-violation` | N | 6282 | 3235 | 66.0% | 1.75% | 1.5 | **HYGIENE** |
| `visual/inline-style-dominance` | N | 2303 | 1221 | 65.4% | 0.66% | 1.5 | **HYGIENE** |
| `typo/math-button-label-uniformity` | N | 37 | 21 | 63.8% | 0.01% | 1.4 | **HYGIENE** |
| `ai/any-density` | Y | 1313 | 758 | 63.4% | 0.41% | 1.3 | **NOISY** |
| `component/multiple-components-per-file` | N | 16288 | 9589 | 62.9% | 5.20% | 1.3 | **HYGIENE** |
| `logic/key-prop-missing` | N | 416 | 250 | 62.5% | 0.14% | 1.3 | **HYGIENE** |
| `ai/errors-near-eof` | Y | 16673 | 10112 | 62.2% | 5.48% | 1.3 | **NOISY** |
| `logic/math-any-density` | Y | 376 | 247 | 60.4% | 0.13% | 1.2 | **NOISY** |
| `logic/math-variable-name-entropy` | N | 36 | 26 | 58.1% | 0.01% | 1.1 | **HYGIENE** |
| `security/dangerous-cors` | Y | 114 | 84 | 57.6% | 0.05% | 1.0 | **NOISY** |
| `ai/whitespace-regularity` | Y | 17466 | 13438 | 56.5% | 7.28% | 1.0 | **NOISY** |
| `logic/heaps-deviation` | N | 2924 | 2430 | 54.6% | 1.32% | 0.9 | **HYGIENE** |
| `security/exposed-env-var` | N | 146 | 125 | 53.9% | 0.07% | 0.9 | **HYGIENE** |
| `perf/cls-image` | N | 49 | 47 | 51.0% | 0.03% | 0.8 | **HYGIENE** |
| `wcag/dragging-movements` | N | 2 | 3 | 40.0% | 0.00% | 0.5 | **HYGIENE** |
| `ai/renyi-profile` | Y | 3 | 9 | 25.0% | 0.00% | 0.3 | **INVERTED** |

## Date distribution
- Neg files by lastCommitDate: {}
- Pos files by lastCommitDate: {'2026-03-21': 292}
