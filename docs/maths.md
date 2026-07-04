# SlopBrick Mathematical Foundations

> **Authoritative reference for every mathematical method used in slopbrick.**
>
> **Authors:** slopbrick project (dystx) with Kimi Code CLI; 14 dimensions from `.research/slopbrick-deep-research/`, 10 from `.research/code-stylometry/`
> **Last updated:** 2026-07-04 (v0.37.0)
> **Tier ratings:** **S** = shipped in production, **A** = implemented in dev, **B** = prototyped, **C** = literature review only

---

## Part 1: The 4-score model (shipped)

### 1.1 aiSlopScore (weighted sum)

**Tier:** S · **Location:** `packages/slopbrick/src/report/coherence.ts`

```
aiSlopScore = Σᵢ (wᵢ × severityᵢ) / N_issues × 100
```

- `wᵢ` = category weight from `slopbrick.config.mjs` (default: `ai: 1.0`, `security: 1.0`, `logic: 1.2`, etc.)
- `severityᵢ` = rule severity (`high: 10`, `medium: 5`, `low: 1` per `PR_SLOP_WEIGHTS`)
- **Direction:** 0 = clean, 100 = saturated (v0.21.0 contract)
- **Reference:** `packages/slopbrick/docs/scoring-explained.md`

### 1.2 engineeringHygiene (weighted sum)

**Tier:** S · **Location:** `packages/slopbrick/src/report/coherence.ts`

```
engineeringHygiene = 100 - Σ (wᵢ × severityᵢ) / N_issues × 100
```

- Categories: `logic`, `typo`, `layout`, `visual`, `component`
- **Direction:** higher = better

### 1.3 security (hyperbolic decay, v0.25.0)

**Tier:** S · **Location:** `packages/slopbrick/src/report/coherence.ts`

```
security = max(0, 100 / (1 + issueCount / 5))
```

- **1 issue** → score 83
- **5 issues** → score 50
- **100+ issues** → score ≤ 5
- **v0.25.0 change:** replaced the v0.24.0 "0 if any" cliff with graded decay
- **Reference:** `packages/slopbrick/docs/research/methodology-v0.25.md`

### 1.4 repositoryHealth (composite)

**Tier:** S · **Location:** `packages/slopbrick/src/report/coherence.ts`

```
repositoryHealth = 0.4 × engineeringHygiene + 0.3 × security + 0.3 × (100 - aiSlopScore)
```

- **Direction:** higher = better
- **CI threshold:** ≥ 60

---

## Part 2: AI detection mathematics (14 dimensions)

### Dim 01 — Benford's Law

**Tier:** C · **Status:** literature review · **Doc:** `.research/slopbrick-deep-research/dimensions/dim01-benfords-law.md`

Tests whether leading-digit distributions of code metrics (line lengths, token counts) follow Benford's Law. LLM-generated code may violate the law due to uniform generation. **Not shipped** — requires per-language baseline.

### Dim 02 — Shannon Entropy

**Tier:** A · **Status:** prototyped · **Doc:** `.research/code-stylometry/dimensions/dim02-entropy.md`

```
H(X) = -Σᵢ p(xᵢ) log₂ p(xᵢ)
```

Measures information density of tokens. LLM code has measurably **lower** entropy (more predictable) at the token level. Used in `ai/whitespace-regularity` (v0.37.0 top-5 by F1, 46.7% precision).

**Reference:** Shannon, C. E. (1948). "A Mathematical Theory of Communication." *Bell System Technical Journal* 27(3): 379–423.

### Dim 03 — Zipf/Heaps Laws

**Tier:** A · **Status:** shipped (`logic/zipf-slope-anomaly`) · **Doc:** `.research/slopbrick-deep-research/dimensions/dim03-zipf-heaps.md`

```
f(k) ∝ 1/k^s    (Zipf)
V(n) = K × n^β   (Heaps)
```

LLM code has slightly steeper Zipf slopes (`s_LLM > s_human`) due to repetitive token patterns. Used in `logic/zipf-slope-anomaly` (v10 WEAK signal, 60.8% precision).

**Reference:** Zipf, G. K. (1949). *Human Behavior and the Principle of Least Effort*. Addison-Wesley.

### Dim 04 — Bayesian Inference for Rule Ensembles

**Tier:** S · **Status:** shipped (`src/engine/lr-combiner.ts`) · **Doc:** `.research/slopbrick-deep-research/dimensions/dim04-bayesian-inference.md`

```
P(AI | fires) = P(fires | AI) × P(AI) / P(fires)
```

Likelihood ratio (LR) per rule:
```
LRᵢ = P(fireᵢ | AI) / P(fireᵢ | human)
```

Combined posterior:
```
LR_total = ∏ᵢ LRᵢ
P(AI | all fires) = LR_total × P(AI) / (LR_total × P(AI) + P(human))
```

Each rule's LR is calibrated from the v9 corpus (precision, recall, FPR). The prior `P(AI)` is configurable (default 0.5 = balanced).

**Reference:** Bayes, T. (1763). "An Essay towards solving a Problem in the Doctrine of Chances." *Phil. Trans.* 53: 370–418.

### Dim 05 — Compressed Sensing

**Tier:** C · **Status:** literature review · **Doc:** `.research/slopbrick-deep-research/dimensions/dim05-compressed-sensing.md`

LLM-generated code may have **lower compressed-sensing rank** (fewer independent features). Theoretically interesting but computationally expensive. **Not shipped.**

**Reference:** Donoho, D. (2006). "Compressed Sensing." *IEEE Trans. Inf. Theory* 52(4): 1289–1306.

### Dim 06 — Optimal Transport

**Tier:** C · **Status:** literature review · **Doc:** `.research/slopbrick-deep-research/dimensions/dim06-optimal-transport.md`

```
W(p, q) = inf_{γ ∈ Π(p,q)} ∫ c(x, y) dγ(x, y)
```

Measures "distance" between two code distributions. Could compare LLM vs human token distributions, but expensive. **Not shipped.**

**Reference:** Villani, C. (2009). *Optimal Transport: Old and New*. Springer.

### Dim 07 — Bayesian Neural Networks / Variational Inference

**Tier:** B · **Status:** prototyped · **Doc:** `.research/slopbrick-deep-research/dimensions/dim07-bayesian-nn-vi.md`

BNN with variational inference for uncertainty-aware AI detection. Promising but slow at inference time. **Not shipped** — would require GPU.

**Reference:** Blundell, C. et al. (2015). "Weight Uncertainty in Neural Networks." *ICML*.

### Dim 08 — Symbolic Regression

**Tier:** C · **Status:** literature review · **Doc:** `.research/slopbrick-deep-research/dimensions/dim08-symbolic-regression.md`

Use sparse regression to discover closed-form expressions for AI-vs-human discriminators. **Not shipped** — hard to validate across languages.

**Reference:** Schmidt, M. & Lipson, H. (2009). "Distilling Free-Form Natural Laws from Experimental Data." *Science* 324(5923): 81–85.

### Dim 09 — Topological Data Analysis

**Tier:** C · **Status:** literature review · **Doc:** `.research/slopbrick-deep-research/dimensions/dim09-topological-data-analysis.md`

Persistent homology of token distributions. Theoretically powerful but requires specialised software. **Not shipped.**

**Reference:** Carlsson, G. (2009). "Topology and Data." *Bull. Amer. Math. Soc.* 46(2): 255–308.

### Dim 10 — Hidden Markov Models

**Tier:** B · **Status:** prototyped · **Doc:** `.research/slopbrick-deep-research/dimensions/dim10-hidden-markov-models.md`

Model code as an HMM where states are coding idioms. LLM code may have different state-transition probabilities. **Not shipped** — state estimation is slow.

**Reference:** Rabiner, L. R. (1989). "A Tutorial on Hidden Markov Models." *Proc. IEEE* 77(2): 257–286.

### Dim 11 — Variance Ratio

**Tier:** A · **Status:** shipped (used in v10 calibration) · **Doc:** `.research/slopbrick-deep-research/dimensions/dim11-variance-ratio.md`

```
VR = (1/n × Σ(Xₜ - Xₜ₋₁)²) / ((1/(n-1)) × Σ(Xₜ - X̄)²)
```

Used in the v10 paired Wilcoxon test to detect non-randomness in per-rule fire patterns. **Shipped indirectly** via the v10 calibration script.

**Reference:** Lo, A. W. & MacKinlay, A. C. (1988). "Stock Market Prices Do Not Follow Random Walks." *J. Financial Economics* 22(1): 41–66.

### Dim 12 — Kolmogorov-Smirnov Test

**Tier:** A · **Status:** shipped (used in v10 calibration) · **Doc:** `.research/slopbrick-deep-research/dimensions/dim12-kolmogorov-smirnov.md`

```
D = sup |F₁(x) - F₂(x)|
```

Two-sample test for whether AI and human fire-rate distributions are the same. Used in v10 calibration to flag rules where the empirical distributions diverge significantly.

**Reference:** Kolmogorov, A. N. (1933). "Sulla determinazione empirica di una legge di distribuzione." *G. Ist. Ital. Attuari* 4: 83–91.

### Dim 13 — Production Rot

**Tier:** C · **Status:** literature review · **Doc:** `.research/slopbrick-deep-research/dimensions/dim13-production-rot.md`

Measures how much code "degrades" over time (TODO comments, deprecated APIs, etc.). Heuristic, not a clean mathematical framework. **Not shipped** — overlaps with existing `dead/*` rules.

### Dim 14 — FPR Reduction

**Tier:** A · **Status:** shipped (via Bayesian combiner + signal-strength filtering) · **Doc:** `.research/slopbrick-deep-research/dimensions/dim14-fpr-reduction.md`

The v9 → v10 transition dropped FPR from ~30% (v9 era-confounded) to <5% (v10 paired-Wilcoxon). Achieved by:
1. Requiring `p < 0.01` (Wilcoxon) for STRONG verdict
2. Requiring `precision ≥ 0.70` (not just > 0.5) for OK verdict
3. DORMANT-ing rules with `<5` fires (low confidence)

---

## Part 3: Code-stylometry dimensions (10 dimensions)

### Dim 01 — BPE/Token Perplexity

**Tier:** A · **Doc:** `.research/code-stylometry/dimensions/dim01-perplexity.md`

Perplexity of code under a code LM. LLM code has measurably **lower** perplexity.

```
PPL(X) = exp(-1/N × Σᵢ log p(xᵢ | x<ᵢ))
```

**Reference:** Yang et al. (2023). "Zero-Shot Detection of Machine-Generated Codes" (arXiv:2310.05103). Used CodeParrot/CodeGen as surrogate.

### Dim 02 — Entropy (token-level)

**Tier:** A · **Doc:** `.research/code-stylometry/dimensions/dim02-entropy.md`

Shannon entropy of token distribution. Same as Dim 02 above but computed on raw tokens, not bytes.

### Dim 03 — Repetition

**Tier:** A · **Doc:** `.research/code-stylometry/dimensions/dim03-repetition.md`

```
Repetition = Σᵢ Σⱼ>i I(tokenᵢ = tokenⱼ) / (N × (N-1)/2)
```

LLM code has measurably **higher** self-similarity (more repetitive token patterns).

### Dim 04 — N-gram Distribution

**Tier:** A · **Doc:** `.research/code-stylometry/dimensions/dim04-ngram-distribution.md`

Compare bigram/trigram distributions between AI and human code via KL divergence.

```
KL(P || Q) = Σ P(x) log(P(x) / Q(x))
```

**Reference:** Kullback, S. & Leibler, R. A. (1951). "On Information and Sufficiency." *Ann. Math. Statist.* 22(1): 79–86.

### Dim 05 — Long-range Correlation

**Tier:** A · **Doc:** `.research/code-stylometry/dimensions/dim05-long-range.md`

Hurst exponent of token positions. LLM code may have different long-range structure (less semantic drift).

```
H = log(R/S) / log(T/2)
```

where R = range, S = std, T = series length. **Reference:** Hurst, H. E. (1951). "Long-Term Storage Capacity of Reservoirs." *Trans. Amer. Soc. Civil Eng.* 116: 770–799.

### Dim 06 — Burstiness

**Tier:** A · **Doc:** `.research/code-stylometry/dimensions/dim06-burstiness.md`

Burstiness parameter B of token patterns. LLM code has lower burstiness (more uniform generation rate).

```
B = (σ - μ) / (σ + μ)
```

**Reference:** Goh, K.-I. & Barabási, A.-L. (2008). "Burstiness and Memory in Complex Systems." *Europhys. Lett.* 81(4): 48002.

### Dim 07 — Comments

**Tier:** S · **Doc:** `.research/code-stylometry/dimensions/dim07-comments.md`

Comment density, comment-code ratio, and comment style. LLM code has measurably **different** comment patterns (more verbose, more "explains the obvious"). Used in `ai/comment-ratio` (v10 #2 by F1, 62.4% precision).

### Dim 08 — Whitespace

**Tier:** S · **Doc:** `.research/code-stylometry/dimensions/dim08-whitespace.md`

Whitespace uniformity, line-length variance, indentation consistency. LLM code has **lower** whitespace variance. Used in `ai/whitespace-regularity` (v10 top-5, 46.7% precision).

### Dim 09 — Identifiers

**Tier:** A · **Doc:** `.research/code-stylometry/dimensions/dim09-identifiers.md`

Identifier naming patterns (camelCase, snake_case, length distribution). LLM code tends toward more "neutral" naming (camelCase in JS, longer names).

### Dim 10 — Cyclomatic Complexity

**Tier:** S · **Doc:** `.research/code-stylometry/dimensions/dim10-cyclomatic.md`

```
CC = E - N + 2P
```

(E = edges, N = nodes, P = connected components in control flow graph)

LLM code may have different complexity distribution. Used in `logic/bayesian-conditional` (v0.37.0 DORMANT — never fired in v10).

**Reference:** McCabe, T. J. (1976). "A Complexity Measure." *IEEE Trans. Software Eng.* SE-2(4): 308–320.

---

## Part 4: Statistical tests for calibration

### 4.1 Paired Wilcoxon Signed-Rank Test (v10)

**Used in:** v10 calibration (`tests/fixtures/v10-corpus/calibrate.mjs`)

For each rule r, compute the per-pair difference `dᵢ = aᵢ - hᵢ` where `aᵢ` = AI fire (0/1) and `hᵢ` = human fire (0/1).

1. Remove zeros (ties)
2. Rank absolute values, average ranks for ties
3. Compute `W⁺` = sum of ranks where d > 0
4. Compute `W⁻` = sum of ranks where d < 0
5. `W = min(W⁺, W⁻)`
6. Normal approximation: `z = (W - μ) / σ` where `μ = n(n+1)/4`, `σ = √(n(n+1)(2n+1)/24)`
7. `p = 2 × (1 - Φ(|z|))` (two-sided)

**Reference:** Wilcoxon (1945).

### 4.2 Wilson Score Interval (precision CIs)

**Used in:** v9 calibration report

```
p̂ = (x + z²/2n) / (1 + z²/n)
CI = p̂ ± z × √(p̂(1-p̂)/n + z²/(4n²)) / (1 + z²/n)
```

Used to compute 95% confidence intervals on per-rule precision. **Reference:** Wilson, E. B. (1927). "Probable Inference." *J. Amer. Statist. Assoc.* 22(158): 209–212.

### 4.3 Precision-Recall-F1

**Used in:** all calibrations

```
Precision = TP / (TP + FP)
Recall    = TP / (TP + FN)
F1        = 2 × P × R / (P + R)
```

where TP = positive fires, FP = negative fires, FN = positive non-fires.

---

## Part 5: Engine internals

### 5.1 Rule evaluation

For each file in the scan set, for each builtin rule:
1. Check `rule.checkFile(filePath)` — returns true if the file is relevant
2. If relevant, run the rule's `evaluate(filePath, content)` — returns issues

Rule evaluation is **multi-threaded** (configurable via `threadCount`). Default: 1 thread for memory safety; can be increased for speed.

**Location:** `packages/slopbrick/src/engine/`

### 5.2 Bayesian combiner (LR aggregation)

**Location:** `packages/slopbrick/src/engine/lr-combiner.ts`

```
LR_total = ∏ᵢ LRᵢ
P(AI | all fires) = LR_total × P(AI) / (LR_total × P(AI) + P(human))
```

Each rule contributes its `LR = recall / fpRate` from signal-strength.json.

### 5.3 Inventory cache

**Location:** `packages/slopbrick/src/engine/inventory-cache.ts`

- Cache key: `(filePath, mtime, hash)` — invalidates on file change
- Cache location: `.slopbrick-cache.json` at workspace root
- **Not in public schema** (internal optimization)

---

## Part 6: Author references

### Primary authors
- **dystx** — slopbrick lead, all major versions, most rule implementations
- **Kimi Code CLI** — AI pair-programming assistant, v0.20.0+ (architecture, methodology docs, v9/v10 calibration scripts, 50+ research docs)

### External research cited (with proper attribution)

| Author(s) | Year | Venue | Citation |
|---|---|---|---|
| Bayes, T. | 1763 | Phil. Trans. | "An Essay towards solving a Problem in the Doctrine of Chances" |
| Kolmogorov, A. N. | 1933 | G. Ist. Ital. Attuari | "Sulla determinazione empirica di una legge di distribuzione" |
| Wilcoxon, F. | 1945 | Biometrics Bull. | "Individual comparisons by ranking methods" |
| Wilson, E. B. | 1927 | J. Amer. Statist. Assoc. | "Probable Inference" |
| Zipf, G. K. | 1949 | Addison-Wesley | *Human Behavior and the Principle of Least Effort* |
| Shannon, C. E. | 1948 | Bell Syst. Tech. J. | "A Mathematical Theory of Communication" |
| McCabe, T. J. | 1976 | IEEE TSE | "A Complexity Measure" |
| Kullback, S. & Leibler, R. A. | 1951 | Ann. Math. Statist. | "On Information and Sufficiency" |
| Hurst, H. E. | 1951 | Trans. Amer. Soc. Civil Eng. | "Long-Term Storage Capacity of Reservoirs" |
| Blundell, C. et al. | 2015 | ICML | "Weight Uncertainty in Neural Networks" |
| Goh, K.-I. & Barabási, A.-L. | 2008 | Europhys. Lett. | "Burstiness and Memory in Complex Systems" |
| Donoho, D. | 2006 | IEEE Trans. Inf. Theory | "Compressed Sensing" |
| Villani, C. | 2009 | Springer | *Optimal Transport: Old and New* |
| Carlsson, G. | 2009 | Bull. Amer. Math. Soc. | "Topology and Data" |
| Rabiner, L. R. | 1989 | Proc. IEEE | "A Tutorial on Hidden Markov Models" |
| Schmidt, M. & Lipson, H. | 2009 | Science | "Distilling Free-Form Natural Laws from Experimental Data" |
| Lo, A. W. & MacKinlay, A. C. | 1988 | J. Financial Economics | "Stock Market Prices Do Not Follow Random Walks" |
| Yang et al. | 2023 | arXiv:2310.05103 | "Zero-Shot Detection of Machine-Generated Codes" |
| Mao et al. (Raidar) | 2024 | ICLR | "Raidar: GeneRative AI Detection viA Rewriting" |
| Cotroneo et al. (HumanVsAICode) | 2025 | ISSRE | "Human-Written vs. AI-Generated Code" |

### Internal references

- `.research/slopbrick-deep-research/` — 14 dimensions
- `.research/code-stylometry/` — 10 dimensions
- `.research/ai-code-detection/` — 2024–2026 literature survey
- `.research/multi-lang/` — multi-language considerations
- `.research/slopbrick-math/` — math evaluations
- `packages/slopbrick/docs/research/` — 50+ internal research notes
