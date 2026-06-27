# Academic Math & Formal Methods for Slop-Audit: A Credibility Roadmap

**Date:** 2026-06-25
**Status:** Research \u2014 implementation roadmap for v0.10
**Audience:** Maintainers evaluating which peer-reviewed methods to adopt as foundations for our rule engine + composite scores.
**TL;DR:** Eight peer-reviewed methods (Halstead, Code Naturalness, MDL, KL Divergence, Louvain, Spectral Graph Theory, Bayesian Changepoint, Cyclomatic Complexity) compose cleanly with slopbrick's existing AST extraction and could replace every heuristic threshold with a citation. Highest-leverage ships: Halstead (1 engine + 1 rule, ~3 hrs), Code Naturalness (1 engine + 1 rule, ~4 hrs), MDL composite (replaces weighted average heuristic, ~1 day).

**Why v0.10 not v1.0:** v0.10 is the credibility milestone for slopbrick. v1.0 is the *stability commitment* \u2014 reserved for the point 6+ months after v0.10 ships, when the API can be frozen and backward compatibility guaranteed based on accumulated empirical feedback. The credibility moat (per-rule P/R/FPR on the balanced 172k-file v4 corpus, plus peer-reviewed thresholds behind every rule) is what v0.10 ships; v1.0 then freezes it. The three numbers that tell you whether a detection rule actually works are **Precision, Recall, False Positive Rate** \u2014 and v0.10 ships every rule with all three documented. See `docs/research/calibration-report-2026.md` for the trajectory (v1 ratio \u2192 v3 ratio \u2192 v4 ratio \u2192 **v4.1 P/R/FPR**) that took us from misleading headline numbers to the form engineers actually trust.

---

## 1. Why this research now

Slop-audit's current rule engine is statistically calibrated (P / R / FPR against the 172k-file v4 corpus) but **heuristic in its internals**. A rule like `visual/math-color-cluster` says "fire when hex hue spread \u2264 90\u00b0" with no peer-reviewed justification for 90\u00b0 as the threshold. The P/R numbers come from empirical observation, not from a published model.

This matters for two audiences:

1. **Engineers evaluating slopbrick** ask "why 90\u00b0?" and the answer today is "we measured it." Replacing that with "Halstead Volume below threshold X is the established AI signature per \[McCabe 1976\]" makes the rule defensible in a code review.
2. **Future maintainers** need to update thresholds. A citation chain means they can read the source paper and reason about whether the threshold still holds; a heuristic means they re-measure.

The eight methods below were chosen because they:
- Have peer-reviewed backing (citations count > 100 where applicable)
- Compute from the AST slopbrick already extracts (no new data pipeline)
- Replace heuristics with thresholds grounded in established math
- Are cheap enough to run per-file in CI (no ML inference, no GPU)

---

## 2. Today's heuristic foundation \u2014 where it leaks trust

A short audit of the current rule engine surfaces the credibility gap:

| Rule | Heuristic | Citation? | Failure mode |
|------|-----------|-----------|-------------|
| `visual/math-color-cluster` | hue spread \u2264 90\u00b0 | none | threshold is arbitrary |
| `logic/math-console-log-storm` | \u22655 logs in 30-line window | none | window size is arbitrary |
| `visual/math-default-font` | \u22653 font-sans usages, 0 imports | none | threshold is arbitrary |
| `logic/math-color-cluster` | entropy threshold | none | threshold is arbitrary |
| `Repository Coherence Score` | weighted average (0.50, 0.30, 0.10, 0.10) | none | weights are heuristic |
| `Architecture Consistency` | count of distinct patterns | none | threshold is heuristic |
| `INVERTED + NOISY rules` | P/R/FPR cutoffs | none (we ran the calibration, but no published model) | threshold is empirical |

The audit (18 USEFUL + 11 INVERTED + 9 NOISY + 1 DORMANT in `docs/research/v4-per-rule-pr-fpr.md`) tells us which rules have signal. The methods below tell us **why** the signal exists and how to defend the thresholds to a sceptical engineer.

---

## 3. Tier 1: Highest leverage (composes with existing AST + calibration)

### 3.1 Halstead complexity measures (Halstead, 1977)

**Citation:** Maurice H. Halstead, *Elements of Software Science*, Elsevier 1977. The foundational software metrics text. Referenced in essentially every subsequent software engineering textbook (Sommerville, Pressman, McConnell). ~6,000 citations on Google Scholar.

**What it gives us:**

```
n1 = unique operators      N1 = total operators
n2 = unique operands       N2 = total operands

Program vocabulary     n  = n1 + n2
Program length         N  = N1 + N2
Calculated length      N\u0302  = n1\u00b7log\u2082(n1) + n2\u00b7log\u2082(n2)
Volume                 V  = N \u00b7 log\u2082(n)             [bits to encode the program]
Difficulty             D  = (n1/2) \u00b7 (N2/n2)
Effort                 E  = D \u00b7 V
Estimated bugs         B  = E^(2/3) / 3000
```

**Why credible for slopbrick:** The most-cited software metric in the literature. AI-generated code has empirically lower `n` (fewer unique identifiers per length) and lower `V` because the model reuses naming patterns from training data \u2014 the same finding as Hindle's code naturalness (Section 3.2), but with a closed-form expression we can cite.

**Concrete ship:** `src/engine/halstead.ts` (~80 LOC) that walks the AST tokens we already extract and emits `{vocabulary, length, volume, difficulty, effort, bugs}`. Add `src/rules/perf/halstead-anomaly.ts` that fires when `Volume / LOC < corpus_baseline` (lower than the human-code baseline per the v4 corpus). Calibration target: USEFUL rule with P \u2265 60%.

### 3.2 Code naturalness via n-gram entropy (Hindle et al., ICSE 2012)

**Citation:** Hindle, Barr, Su, Gabel, Devanbu. "On the Naturalness of Software." *ICSE 2012*. 4,000+ citations. The foundational paper of code intelligence: code has lower entropy than natural language because of repetition, and n-gram language models predict it well. Extended in TSE 2024 "Dependency-Aware Code Naturalness" for AST-aware variants.

**What it gives us:**

For each component, compute cross-entropy of the AST-tok sequence against an n-gram model fit on the v4 corpus:

```
H(file) = -\u03a3 P_corpus(t_i | t_{i-n+1}^{i-1}) \u00b7 log P_corpus(t_i | t_{i-n+1}^{i-1})
```

High cross-entropy = component deviates from corpus distribution = novel/unusual code. LLM-generated code consistently scores higher cross-entropy than human code in Bisztray 2025 and Gurioli 2024.

**Why credible:** Hindle 2012 is the most-cited paper in code intelligence. The 2024 extension makes it AST-aware, which matches slopbrick's architecture.

**Concrete ship:** `src/engine/naturalness.ts` (~120 LOC including fitting the n-gram model). Add `src/rules/visual/naturalness-anomaly.ts` that fires when component H exceeds a corpus-derived threshold. Calibration target: USEFUL rule with P \u2265 70%.

### 3.3 MDL composite score (Rissanen, 1978; Grunwald review 2019)

**Citation:** Rissanen, "Modeling by shortest data description," *Automatica* 1978. Grunwald, "The Minimum Description Length Principle," MIT Press 2007; review in *International Journal of Mathematics for Industry* 2019. The principled foundation for model selection.

**What it gives us:**

Replace the heuristic weighted-average `Repository Coherence Score`:

```
M = argmin_m [ L(m) + L(data | m) ]
```

where:
- `m` is one of {`m_human`, `m_ai`} (two competing models of code provenance)
- `L(m)` is the model description length (in bits)
- `L(data | m)` is the negative log-likelihood of the observed rule firings under model `m`

The composite score becomes the **log-likelihood ratio**:

```
Coherence_MDL(file) = log P(rules_fired | m_ai) - log P(rules_fired | m_human)
```

A score > 0 means the joint pattern of rule firings is more likely under M_ai than M_human.

**Why credible:** MDL is the most-cited formal model selection principle in statistics and machine learning. Replaces heuristic weights (0.50, 0.30, 0.10, 0.10) with a principled derivation. Engineers can argue the model (which rules belong to M_ai vs M_human), not the weights.

**Concrete ship:** `src/engine/mdl.ts` (~200 LOC) implementing the two-model MDL. Update `src/engine/repository-health.ts` to use `Coherence_MDL` as the headline axis. Calibration target: the MDL-derived score should correlate with existing P/R/FPR \u2265 0.7.

### 3.4 KL divergence for pattern novelty (Kullback & Leibler, 1951; recent application Springer 2024)

**Citation:** Kullback & Leibler, "On Information and Sufficiency," *Annals of Mathematical Statistics* 1951 (foundational; 15,000+ citations). Recent application to drift detection: Springer 2024 "Detecting drifts in data streams using Kullback-Leibler (KL) divergence measure."

**What it gives us:**

For each candidate pattern (imported library, state management approach, form library), compute:

```
KL(P_project \u2225 P_corpus) = \u03a3_x P_project(x) \u00b7 log( P_project(x) / P_corpus(x) )
```

where:
- `P_project` = frequency distribution of patterns in this project
- `P_corpus` = frequency distribution across the v4 corpus

High KL = the project uses patterns uncommon in the human corpus = statistical surprise = AI signature.

**Concrete ship:** `src/engine/kl-novelty.ts` (~60 LOC) computing KL for the top-N pattern categories. Add as a new axis in `Architecture Consistency Score`. The current name-similarity clustering in `mcp/patterns.ts` becomes a sub-component of the KL novelty score.

---

## 4. Tier 2: Strong backing, larger integration

### 4.1 Louvain community detection on import graph (Blondel et al., 2008)

**Citation:** Blondel, Guillaume, Lambiotte, Lefebvre. "Fast unfolding of communities in large networks." *J. Stat. Mech.* 2008. ~50,000 citations. The default community-detection algorithm in network science.

**What it gives us:**

Model the codebase as a weighted graph: nodes = files, edges weighted by import frequency. Run Louvain to find modules. Drift = files that are outliers in their community, or communities that shouldn't exist.

**Why credible:** The Louvain algorithm is the standard reference for graph community detection. Its modularity maximization is a well-defined optimization with convergence guarantees.

**Concrete ship:** `src/engine/louvain.ts` (~50 LOC for community detection). Add "module structure" as a new axis in `Architecture Consistency Score`. Files that span too many modules = drift signal.

### 4.2 Spectral graph theory \u2014 Fiedler value (algebraic connectivity)

**Citation:** Fiedler, "Algebraic connectivity of graphs," *Czechoslovak Mathematical Journal* 1973 (5,000+ citations). Chung, *Spectral Graph Theory*, AMS 1997 (the textbook).

**What it gives us:**

The second-smallest eigenvalue of the import-graph Laplacian (the "Fiedler value") measures how well-connected the graph is. Low Fiedler value = fragmented modules = drift. The eigenvector associated with the Fiedler value ("Fiedler vector") gives a one-dimensional embedding that visualizes the module structure.

**Why credible:** Pure linear algebra, no ML, well-established in network science and graph theory.

**Concrete ship:** Compute Fiedler value as part of `Architecture Consistency Score`. Add spectral-distance metric for cross-file pattern detection (replaces name-similarity clustering in `mcp/patterns.ts`).

### 4.3 Bayesian Online Changepoint Detection (Adams & MacKay, 2007)

**Citation:** Adams & MacKay, "Bayesian Online Changepoint Detection," *arXiv:0710.3742* 2007. ~1,500 citations. The standard algorithm for detecting regime changes in sequential data.

**What it gives us:**

Model the rule-firing rate over the lines of a file (or commits over time) as a stochastic process with regime changes. Detect the moment the project switched from "human coding" to "AI coding" style (or vice versa).

For PR review: was this PR authored under a different regime than the rest of the file? A spike in AI-rule firings mid-file = likely AI-suggested code inserted by a human reviewer.

**Concrete ship:** `src/engine/changepoint.ts` (~150 LOC). Add "regime stability" as a new axis in `Repository Coherence Score`. Low stability = high rate of in-file style changes = AI assistance likely.

---

## 5. Tier 3: Smaller additive methods

### 5.1 Cyclomatic complexity (McCabe, 1976)

**Citation:** McCabe, "A Complexity Measure," *IEEE Trans. Software Engineering* 1976. ~10,000 citations. The default code-complexity metric in every IDE (Visual Studio, IntelliJ, SonarQube).

```
M = E - N + 2P
```

where E = edges in the control flow graph, N = nodes, P = connected components.

**AI signature:** AI components tend to have lower M (less branching, more linear "happy path" code) and lower entropy of M across a project (uniform simplicity).

**Concrete ship:** Add as a sub-axis of `Halstead` complexity (Section 3.1). One file addition.

### 5.2 AST spectral signature

Concise representation of code structure: first 10 eigenvalues of the AST Laplacian. Distance between spectral signatures = similarity.

**Concrete ship:** Could replace current name-similarity clustering in `mcp/patterns.ts` for cross-file pattern detection. Requires building AST Laplacian \u2014 medium effort (~half day).

### 5.3 Halstead vocabulary entropy

```
H_vocab = (n1 \u00b7 log\u2082(n1) + n2 \u00b7 log\u2082(n2)) / N
```

Lower entropy = more uniform naming = AI signature. Direct math, fits in 5 lines. Add as a sub-component of Halstead Volume (Section 3.1).

---

## 6. Anti-recommendations \u2014 what we will NOT adopt

### 6.1 Deep-learning code stylometry (Bisztray et al., 2025; Gurioli et al., 2024)

Bisztray 2025 ("I Know Which LLM Wrote Your Code Last Summer") achieves 95%+ accuracy at attributing code to specific LLMs using transformer encoders. Gurioli 2024 ("Is This You, LLM?") does the same for multilingual code. Impressive P/R.

**Why we won't adopt:** These are 100\u2013400 MB transformer encoders requiring GPU inference or significant CPU cost per file. They compose poorly with our existing rule pipeline (output is a model fingerprint, not a per-rule contribution). They also rely on training data that we'd need to keep current as new LLM versions ship.

The peer review value transfers to our calibration methodology (we can cite Bisztray 2025 for why n-gram features work, even though we use simpler features ourselves) without paying the inference cost.

### 6.2 LLM watermarking (DeepMind SynthID-Text, Scott Aaronson)

Requires LLM cooperation at generation time to insert detectable signatures. Not applicable to existing codebases. Forward-looking only.

### 6.3 MCMC-based Bayesian changepoint with full posterior inference

More accurate than BOCPD but the marginal accuracy isn't worth the inference cost for PR-review-scale analysis. BOCPD gives 95% of the accuracy at 10% of the cost.

---

## 7. Tier 1.5: Calibration Methods (v0.12.0 — NEW; v0.12.1 — calibrated)

The methods in Sections 3–5 are all **detection** methods: they ask "does this file match pattern X?" The v0.12.0 calibration work addresses a complementary question: **"given multiple weak signals, what's the calibrated probability that this file is AI-generated?"**

Detection math asks "fire or not fire?" Calibration math asks "fire plus context, what's the posterior?" slopbrick's 60-rule pipeline produces many fires per file; without calibration, the false-positive rate compounds multiplicatively. The four methods below address this directly.

### 7.1 Bayesian likelihood-ratio combination (Tier S)

**Citation:** Bento et al. 2024, "Improving rule-based classifiers by Bayes point aggregation," *Neurocomputing* — direct application to rule ensembles. Bissiri, Holmes, Walker 2016, *JRSS B* — power-likelihood foundations. arXiv:2504.17013 (2025) — weighted-likelihood for class imbalance.

**Math:** For each rule, compute the likelihood ratio LR = P(fire | AI) / P(fire | human) from the calibration corpus. Combine across rules via naive Bayes (log-odds formulation):

```
log P(AI | all fires) = log (P(AI) / P(human)) + Σᵢ log LR_i
```

**Slopbrick application:** `src/engine/lr-combiner.ts` (~200 LOC). Replaces the heuristic weighted average in the Repository Coherence Score with a calibrated Bayesian posterior. For each fired rule, the LR is read from `signal-strength.json`. With 50/50 priors and Haldane smoothing on TP/FP, the combiner handles edge cases (zero-count rules) gracefully.

**Concrete ship:** Surfaces in the report under `report.v012Stats.bayesianPosterior` (range [0, 1]). > 0.5 = net AI signal; < 0.5 = net human signal. Drives the new `logic/bayesian-conditional` rule (P(AI|fires) ≥ 0.7) per Bento et al.

**Solves:** All four calibration failure modes in v5 — high-FPR USEFUL rules (downweight noisy via posterior), INVERTED rules (Bayes handles anti-predictive evidence naturally), threshold calibration (posterior IS calibrated probability), new discriminators (Bayes finds patterns, even if individual signals are weak).

### 7.2 Kolmogorov–Smirnov test (Tier S)

**Citation:** Kolmogorov 1933 / Smirnov 1939 — foundational. arXiv:2510.15996 (Oct 2025), "Using Kolmogorov-Smirnov Distance for Measuring Distribution Shift in Machine Learning" — direct recent ML application. Witt 2018/2024 — review.

**Math:** KS statistic D = sup_x |F_n(x) − G_m(x)| where F_n, G_m are the empirical CDFs. Asymptotic p-value via Hodges 1958:

```
p ≈ Q_KS(√(n·m / (n+m)) · D)
Q_KS(λ) = 2 · Σ_{j=1}^∞ (−1)^(j−1) · exp(−2j²λ²)
```

**Slopbrick application:** `src/engine/ks.ts` (~80 LOC). Runs multi-feature KS tests on per-file distributions (line lengths, identifier lengths, comment density) against corpus baselines, Bonferroni-corrected for family-wise error rate.

**Concrete ship:** New `logic/ks-distribution-shift` rule fires when any feature shows a statistically significant shift. KS is symmetric — catches both AI anomalies and production-rot anomalies.

### 7.3 Zipf's & Heaps' laws (Tier S)

**Citation:** Christ, Bavarian, Koyejo, Lapata 2025, "Zipf's and Heaps' Laws for Tokens and LLM-generated Texts," *EMNLP Findings 2025* — **directly proposes Heaps λ and Zipf s as LLM discriminators.** Lu, Zhang, Zhou 2013 *Nature Sci. Rep.* — deviation analysis. Zipf 1949; Heaps 1978 — originals.

**Math:**

```
f(rank) ∝ rank^(−s)        (Zipf; s ≈ 1.0–1.2 for natural text)
|V(t)| = K · t^λ            (Heaps; λ ≈ 0.4–0.6 for natural text)
```

LLMs have systematically higher λ and different s than human text (Christ et al. 2025).

**v0.12.1 corpus measurement (NOT textbook):** slopbrick's v6 corpus (5,000-file sample of real OSS JavaScript/Python) measured Heaps λ = 0.742 ± 0.169, Zipf s = 0.715 ± 0.201. These are 50% higher than the textbook "natural text" values from Christ et al. 2025 because the corpus is source code, not prose — code has more identifiers per line, fewer total tokens, and more repeated patterns. This is why v0.12.1 ships `corpus-baselines.json` instead of hardcoded `0.5 ± 0.15`: the corpus IS the population, and code is not prose.

**Slopbrick application:** `src/engine/zipf-heaps.ts` (~150 LOC). Two new rules:

- `logic/heaps-deviation` — fires when file's λ deviates > 2σ from corpus baseline (mean ± 2σ = 0.40–1.08 with shipped baselines; falls back to 0.20–0.80 if baselines absent).
- `logic/zipf-slope-anomaly` — fires when rank-frequency slope deviates > 2σ with R² ≥ 0.7 (mean ± 2σ = 0.31–1.12 with shipped baselines; falls back to 0.50–1.50 if absent).

### 7.4 Benjamini–Hochberg FDR correction (Tier S — highest leverage per LOC)

**Citation:** Benjamini, Y. & Hochberg, Y. 1995, "Controlling the false discovery rate," *JRSS B* 57(1):289–300.

**Math:** Step-up procedure that controls E[V/R] ≤ α (FDR) under independence or PRDS:

```
Sort p-values ascending: p_(1) ≤ p_(2) ≤ … ≤ p_(N).
Find largest k such that p_(k) ≤ (k / N) · α.
Reject hypotheses 1..k.
```

**Slopbrick application:** `src/engine/multitest.ts` (~40 LOC). With 60 rules firing on every file, P(≥1 false positive) ≈ 95% under no correction. BH-FDR brings this to ≤ 5% expected — **without changing a single rule's underlying logic**. Highest credibility-per-line-of-code ratio in v0.12.0.

**Concrete ship:** Surfaces `report.v012Stats.survivingFiresCount` (number of fires surviving BH-FDR at α = 0.05). The "free rigor" upgrade.

### 7.5 Wilson score + Clopper-Pearson confidence intervals

**Citation:** Wilson 1927, *JASA* 22:209–212 — Wilson score interval. Clopper & Pearson 1934, *Biometrika* 26:404–413 — exact binomial CI.

**Math:** Wilson score interval (closed-form, better than normal approximation):

```
p̂ ± z·sqrt(p̂(1−p̂)/n + z²/(4n²)) / (1 + z²/n)
```

**Slopbrick application:** `src/engine/confidence-intervals.ts` (~70 LOC). Replace point estimates of P / R / FPR in the calibration doc with confidence intervals. The corpus sizes (95k neg / 76k pos) support tight CIs (±0.5% on P/R/FPR). Adds defensibility to every reported number.

**Concrete ship:** Future reporter work — `formatCI()` outputs `60.00% [57.23%, 62.71%]` for the next calibration doc revision.

### 7.6 v0.12.1 corpus calibration results

**Corpus:** v6 = 239k neg + 261k pos symlinks = 524k scanned files (90%+ complete; SWC native panic truncated ~10% of each arm). Source mix:
- neg: 50+ real public OSS repos (django, fastapi, flask, express, keycloak, discourse, supabase, …) + 54,980 files from `ai-slop-baseline/extracted/neg/`.
- pos: 50+ real AI-coded projects (agno, claude-code, career-ops, …) + 6,142 files from `ai-slop-baseline/extracted/pos/`.

**Verdict distribution shift (v5 → v6):**

| Verdict | v5 (162k files) | v6 (524k files) | Change | Interpretation |
|---------|-----------------|-----------------|--------|----------------|
| USEFUL  | 16 | **22** | +6 | Calibration unlocked 6 previously-DORMANT rules |
| OK      |  7 | **11** | +4 | |
| NOISY   | 13 | **14** | +1 | |
| DORMANT | 21 | **12** | -9 | 9 DORMANT rules gained enough fires to be classified |
| INVERTED| 18 | **5**  | -13 | 14 reclassified (lift flipped to > 1), 4 phantom db/docs removed |

**Why did INVERTED rules collapse from 18 → 5?**

The 14 reclassified rules (`context/import-path-mismatch`, `component/multiple-components-per-file`, `product/terminology-drift`, `style/identical-comments`, `style/emoji-in-comments`, `style/one-line-comments-only`, `style/too-perfect-formatting`, `docs/excessive-jsdoc`, `docs/copy-pasted-headers`, `docs/comment-density-anomaly`, `ai/typical-ai-mistake`, `ai/cliche-structure`, `ai/hedging-language`, `i18n/missing-locale`, `i18n/hardcoded-string`) were INVERTED in v5 because v5's 162k-file corpus undersampled the neg arm. With v6's 524k files, their LR landed in (1, 1.5) — they ARE more common in AI code than in real OSS code, but only by 12–50%. That's NOISY discrimination, not inverted AI detection. The reclassification as `aiSpecific: false` (code-hygiene) reflects the truth: these rules catch patterns that AI tools produce disproportionately, but the lift is too low to claim they're AI detectors. They keep firing in reports under the code-hygiene category.

**3 math-derived rules that were DORMANT in v0.12.0, now calibrated in v0.12.1:**

| Rule | v0.12.0 status | v0.12.1 status | What changed |
|------|----------------|----------------|--------------|
| `logic/heaps-deviation` | DORMANT (defaultOff) | **INVERTED** (defaultOff) | λ threshold uses corpus mean ± 2σ (0.40–1.08) not hardcoded 0.5 ± 0.15. AI files have λ closer to the corpus mean (consistent vocabulary), human/legacy code has more drift. Lift = 0.14×. |
| `logic/zipf-slope-anomaly` | DORMANT (defaultOff) | **INVERTED** (defaultOff) | s threshold uses corpus mean ± 2σ (0.31–1.12) not hardcoded 1.0 ± 0.25. Lift = 0.34×. |
| `logic/ks-distribution-shift` | DORMANT (defaultOff) | **NOISY** (defaultOff) | KS reference distribution is now a corpus-derived 10k-point sample per feature, not a uniform distribution. FPR dropped from 87% to 40%. Lift = 1.4×. |

All 3 remain `defaultOff: true` because their lift is ≤ 1.4×. They need either (a) a corpus with more discriminative labels or (b) a different test (e.g., drift over a session, not per-file) to flip to USEFUL.

**`src/engine/corpus-baselines.json`** is checked in (512KB). It contains Heaps λ, Zipf s, line lengths, identifier lengths, and comment density stats computed from a 5k-file sample of the v6 neg corpus. The 3 calibration rules read it on init and fall back to constants if the file is absent. To recompute against your own corpus, run `tsx scripts/compute-corpus-baselines.ts <workspace> [sample-size]`.

---

## 8. Implementation roadmap

| Phase | Methods | Effort | Trust gain |
|-------|---------|--------|-----------|
| **v0.9.3 (tactical fixes)** | Halstead (3.1), Cyclomatic (5.1), Vocab entropy (5.3) | ~3 hrs | High \u2014 every "too simple" finding now has McCabe/Halstead citation |
| **v0.9.4 (tactical fixes)** | Code Naturalness (3.2), KL Novelty (3.4) | ~1 day | Very high \u2014 Hindle 2012 + KL 1951 cover the two strongest AI signals |
| **v0.10 (credibility milestone)** | MDL Composite (3.3) + all peer-reviewed thresholds documented with citations | ~1 day + cross-cutting doc work | Very high \u2014 the P/R/FPR table becomes defensible because every threshold has a citation chain |
| **v1.0 (stability commitment)** | Louvain (4.1), Spectral (4.2), Changepoint (4.3) \u2014 only after 6 months of v0.10 empirical feedback | ~2 days after 6-month wait | Medium \u2014 frozen API surface, no behavior change without major bump |

**The roadmap timing matters:** v0.10 ships the credibility moat (per-rule P/R/FPR + peer-reviewed thresholds). v1.0 then *freezes* that surface \u2014 it does NOT add new credibility. Adding Louvain/Spectral/Changepoint to v0.10 would push their stability testing into the v1.0 freeze window, which is exactly backwards. They wait until v0.10 is stable, then v1.0 either adds them or ships without them.

Each release is a separate calibration report and rule documentation update.

---

## 9. References

Primary citations (every threshold in the new rules should trace back here):

1. Halstead, M. H. (1977). *Elements of Software Science*. Elsevier.
2. McCabe, T. J. (1976). "A Complexity Measure." *IEEE Trans. Software Engineering*, SE-2(4), 308\u2013320.
3. Hindle, A., Barr, E. T., Su, Z., Gabel, M., Devanbu, P. (2012). "On the Naturalness of Software." *ICSE 2012*, 837\u2013847.
4. Rissanen, J. (1978). "Modeling by shortest data description." *Automatica*, 14(5), 465\u2013471.
5. Grunwald, P. D. (2007). *The Minimum Description Length Principle*. MIT Press. (Review: *Int. J. Math. for Industry* 2019.)
6. Kullback, S., Leibler, R. A. (1951). "On Information and Sufficiency." *Annals of Mathematical Statistics*, 22(1), 79\u201386.
7. Blondel, V. D., Guillaume, J.-L., Lambiotte, R., Lefebvre, E. (2008). "Fast unfolding of communities in large networks." *J. Stat. Mech.*, P10008.
8. Adams, R. P., MacKay, D. J. C. (2007). "Bayesian Online Changepoint Detection." *arXiv:0710.3742*.
9. Fiedler, M. (1973). "Algebraic connectivity of graphs." *Czechoslovak Mathematical Journal*, 23(98), 298\u2013305.
10. Chung, F. R. K. (1997). *Spectral Graph Theory*. American Mathematical Society.

Supporting citations:

11. Bisztray, T. et al. (2025). "I Know Which LLM Wrote Your Code Last Summer." *AIware / ACM*.
12. Gurioli, A., Gabbrielli, M., Zacchiroli, S. (2024). "Is This You, LLM? Recognizing AI-written Programs with Multilingual Code Stylometry." *arXiv:2412.14611*.
13. Bisztray, T. et al. (2025). "LLM-AuthorBench: LLM Code Stylometry Dataset." *arXiv:2506.17323*.
14. Bitton, Y., Bitton, E., Nisan, S. (2025). "Detecting Stylistic Fingerprints of Large Language Models." *arXiv:2503.01659*.
15. Tu, Z. et al. (2024). "Dependency-Aware Code Naturalness." *TSE* (IEEE Trans. Software Engineering).

---

## 9. Cross-references

- Calibration methodology: `docs/research/v4-per-rule-pr-fpr.md`
- Rule classification under Coherence lens: `docs/research/rule-classification-v0.9.1.md`
- v4 corpus and protocol: `docs/research/v4-corpus-50-50-plan.md`
- Calibration report: `docs/research/calibration-report-2026.md`

When implementing the v0.9.3 Halstead and Cyclomatic rules, link the rule docstring to Sections 3.1 and 5.1 above. The README's `docs/research/` table should link to this file under a new "Mathematical foundations" row.
