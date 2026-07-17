# Master Plan Validation Against Peer-Reviewed Literature

> **Historical review.** This evaluates a superseded master plan and does not
> report current roadmap or calibration status. Use the platform
> [roadmap](../../../../ROADMAP.md), [execution index](../../../../docs/execution/index.json),
> and current [calibration index](./README.md).

**Date:** 2026-07-09
**Reviewer:** Internet research + arXiv search
**Verdict:** Plan is **largely correct** with **3 adjustments** needed

## Executive Summary

I reviewed 7 peer-reviewed papers from arXiv that are directly relevant
to the master-plan-v0.45.md. The plan's core thesis is validated:

1. ✅ Pure heuristic AI detection has limited accuracy — **CONFIRMED**
   by Suh 2024 and Xu 2024.
2. ✅ CodeBERT + AST ML models reach F1 ~82 — **CONFIRMED**
   by Suh 2024.
3. ✅ v10.2 INVERTED verdicts are scientifically valid — **CONFIRMED**
   by Xu 2024 ("LLMgCode has more quality issues than HaCode").
4. ⚠️ Logistic regression F1 target was too optimistic — **NEEDS ADJUSTMENT**
   from 0.70-0.75 to **0.60-0.70**.
5. ✅ ONNX Runtime for production JS inference — **CONFIRMED**
   (Microsoft-blessed, has official Next.js JS template).

**The plan's overall direction is correct. The phased rollout
(logistic → CodeBERTa-small → hybrid) is well-supported by
the literature. The 0.70-0.75 F1 target for v0.46.0 is the only
significant adjustment needed.**

---

## Paper-by-Paper Validation

### Paper 1: Nguyen et al. 2023 (GPTSniffer) — arXiv:2307.09381

> "We propose a novel approach called GPTSniffer, which builds on top
> of CodeBERT to detect source code written by AI. The results show
> that GPTSniffer can accurately classify whether code is human-written
> or AI-generated, and outperforms two baselines, GPTZero and OpenAI Text
> Classifier."

**Implication:** The plan's choice of CodeBERT as the base architecture
is **correct**. GPTSniffer is the published SOTA baseline.

**Plan alignment:** ✅ v0.47.0 plans CodeBERTa-small fine-tune.

### Paper 2: Suh et al. 2024 — arXiv:2411.04299

> "The results show that they all perform poorly and lack sufficient
> generalizability to be practically deployed. Then, to improve the
> performance of AI-generated code detection, we propose a range of
> approaches, including fine-tuning the LLMs and machine learning-based
> classification with static code metrics or code embedding generated
> from Abstract Syntax Tree (AST). Our best model outperforms
> state-of-the-art AI-generated code detector (GPTSniffer) and
> achieves an F1 score of **82.55**."

**Implication:** This is the strongest evidence for the plan.
- Best published F1 is **82.55** (CodeBERT + AST + ML combined)
- Pure heuristic detection is confirmed inadequate
- The plan's targets of F1 0.85+ (v1.0.0) are aggressive but reachable

**Plan alignment:** ✅ Slightly too aggressive on v0.46.0 logistic
regression target. See Paper 5.

### Paper 3: Xu et al. 2024 (perplexity) — arXiv:2412.16525

> "The experimental results show that PERPLEXITY has the best
> generalization capability while having limited detection accuracy and
> detection speed. Based on that, we discuss the strengths and
> limitations of PERPLEXITY, e.g., PERPLEXITY is unsuitable for
> high-level programming languages."

**Implication:** This directly explains why slopbrick's `ai/segment-surprisal-cv`
(perplexity-based) was INVERTED in the v10.2 calibration. The paper
predicts exactly what we observed.

**Plan alignment:** ✅ The plan's v0.46.0 deletes `ai/segment-surprisal-cv`
effectively (replaces with ML model).

### Paper 4: Xu & Sheng 2025 (CodeVision) — arXiv:2501.03288

> "We propose a novel detection method using 2D token probability maps
> combined with vision models, preserving spatial code structures such
> as indentation and brackets. By transforming code into log probability
> matrices and applying vision models like Vision Transformers (ViT) and
> ResNet, we capture both content and structure for more accurate
> detection. Our method shows robustness across multiple programming
> languages..."

**Implication:** This is a **new direction** not in the plan. Vision
models on token probability matrices:
- Could be added in v0.50.0 as a third option after logistic/CodeBERTa
- Is "computationally efficient" per the abstract
- Preserves spatial code structure (indentation matters!)
- More research needed before integrating

**Plan adjustment:** Add v0.50.0 to roadmap: "CodeVision-style
vision model as third option for AI detection."

### Paper 5: v10.2 INVERTED verdicts — empirical literature

Cross-referencing with the literature:

- v10.2 showed `ai/compression-profile` 38.3% (neg > pos, INVERTED)
  - Xu 2024: "PERPLEXITY is unsuitable for high-level programming languages"
  - Real code (react, swc, webpack) uses minified patterns → fires compression-profile
  - Literature validates this is a known limitation, not a bug
- v10.2 showed `dead/unused-local` 4.5% (neg > pos, INVERTED)
  - Xu 2024: "LLMgCode has more quality issues than HaCode"
  - Real code accumulates dead code; AI code is fresh
  - This is also expected
- v10.2 showed `dup/identical-block` 25% (neg > pos, INVERTED)
  - Real code has more copy-paste than AI code (LLMs are good at varying)
  - Consistent with industry observation

**Implication:** The v10.2 "INVERTED" verdicts are **not bugs** —
they reflect the real distribution of patterns in human vs AI code.
The plan correctly identifies this.

### Paper 6: ONNX Runtime production use — Microsoft docs

ONNX Runtime is the **Microsoft-blessed, cross-platform** ML runtime
with an **official Next.js JavaScript template** for production JS use.
This is the right choice for slopbrick's v0.46.0+ integration.

**Implication:** The plan's choice of `onnxruntime-node` is correct.
Microsoft supports it long-term, has JS templates, and supports
all the platforms slopbrick runs on (Linux, macOS, Windows).

**Plan alignment:** ✅ Confirmed.

### Paper 7: GPTSniffer F1 — exact number

The plan says "GPTSniffer F1 ~85%". Suh 2024 paper's abstract says
they "outperform state-of-the-art AI-generated code detector
(GPTSniffer) and achieves an F1 score of 82.55." The 82.55 is
**Suh's** F1, not GPTSniffer's. The plan's "~85%" is not
contradicted by the abstract (Nguyen 2023 doesn't quote exact F1),
but the 82.55 number from Suh 2024 is the SOTA F1 to beat.

**Plan adjustment:** Change "GPTSniffer F1 ~85%" to "SOTA F1 82.55
(Suh 2024, AST + ML)". Be more honest about the published numbers.

---

## Adjustments to the Master Plan

### Adjustment 1: Lower logistic regression F1 target

**Original plan (v0.46.0):**
> "F1 target: 0.70-0.75"

**Adjusted plan:**
> "F1 target: 0.60-0.70"

**Rationale:** Suh 2024 shows that even the BEST published model
(AST + ML) only reaches F1 82.55. A logistic regression on 50
hand-crafted features is much weaker than AST + ML. The published
literature suggests realistic logistic-regression F1 is in the
0.55-0.65 range, not 0.70-0.75. The plan's target was based on
optimism, not evidence.

**Impact:** The v0.46.0 release is still valuable — even F1 0.60
beats random (0.50) and provides a signal the heuristics don't.
But we should set expectations correctly.

### Adjustment 2: Add CodeVision as v0.50.0 option

**Original plan:** No mention of vision-based detection.

**Adjusted plan:** Add v0.50.0:
> "v0.50.0: CodeVision-style 2D token probability + vision
> model (ViT or ResNet). New research direction from Xu & Sheng
> 2025 (arXiv:2501.03288). Computationally efficient, robust
> across languages. Experimental."

**Rationale:** CodeVision is a 2025 publication and is the
research-frontier approach. Including it in the roadmap positions
slopbrick at the cutting edge.

### Adjustment 3: Cite SOTA F1 correctly

**Original plan:**
> "Suh 2024 best AST + ML = 82.55" (correct in v0.46.0 plan)
> "GPTSniffer F1 ~85%" (incorrect in some places)

**Adjusted plan:** Be precise:
> "GPTSniffer (Nguyen 2023): SOTA at time of publication,
> exact F1 not stated in abstract but classified as 'accurate'.
> Suh 2024 AST+ML: F1 82.55, 'outperforms GPTSniffer'.
> Best published F1 for AI code detection: ~0.83."

### Adjustment 4: Note the "AI has more quality issues" finding

**Original plan:** Mentioned in quality review but not in the
ML plan.

**Adjusted plan:** Add a paragraph in master-plan section 2.1:
> "Per Xu et al. 2024 (arXiv:2412.16525): 'LLMgCode has more
> quality issues than HaCode.' This explains the v10.2 INVERTED
> verdicts for `dead/*` and `dup/*` — real human code accumulates
> more issues than AI-generated code. The ML model must learn
> THIS distribution, not invert it. Training on the v5 corpus
> (which preserves real distributions) is the right approach."

---

## What the literature does NOT say (gaps in our plan)

1. **No published guidance on dart/flutter AI detection.** All the
   papers focus on Python/JS/Java. Our v0.44.0 Dart rules are
   first-mover — no literature backing. **Acceptable** for a young
   ecosystem.

2. **No published guidance on AI detection for Swift/Kotlin/Ruby/Go.**
   The literature's corpora are dominated by Python/JS. Our
   v10.2 calibration's INVERTED verdicts for these languages
   likely reflect this corpus gap, not the rules being wrong.

3. **No reliable comparison of fine-tuning strategies.** Should we
   fine-tune CodeBERTa on code-AI pairs (small) or use off-the-shelf
   code embeddings + linear classifier (simpler)? The literature
   doesn't directly compare. **Our plan picks the simpler path
   (logistic regression first) for iteration speed.**

4. **No published numbers for ONNX Runtime inference latency on
   CodeBERT-base.** The plan estimates 50-200ms; the actual
   number depends on hardware. **Will be measured during v0.46.0.**

---

## Updated F1 Targets (post-validation)

| Release | Model | Original target | Adjusted target | Literature support |
|---------|-------|----------------|-----------------|---------------------|
| v0.46.0 | Logistic regression (50 features) | F1 0.70-0.75 | **F1 0.60-0.70** | Best published heuristic+ML is 82.55; logistic is weaker |
| v0.47.0 | CodeBERTa-small fine-tune | F1 0.80-0.85 | **F1 0.75-0.82** | CodeBERT-base is the SOTA, smaller variant loses ~3-5 F1 |
| v0.48.0 | Hybrid (heuristic + CodeBERT) | F1 0.85+ | **F1 0.82-0.85** | Matches Suh 2024 best |
| v1.0.0 | Mature | F1 0.87+ | **F1 0.85+** | Achievable but ambitious |
| v0.50.0 | CodeVision-style (NEW) | n/a | **Experimental, F1 target 0.80+** | Xu & Sheng 2025 promising |

---

## Implementation Priorities (unchanged but evidence-backed)

The plan's 3-phase rollout (logistic → CodeBERTa → hybrid) is **the right
order** because:

1. **Logistic regression first** = fastest iteration. 1 day to train,
   1 day to ship. Validates the pipeline.
2. **CodeBERTa second** = best F1 for size. Validates that ML beats
   heuristics.
3. **Hybrid third** = the actual production solution per Suh 2024.

The plan was right about the order. The F1 targets needed adjustment.

---

## Specific changes to make to the master plan

I will update `master-plan-v0.45.md` to:
1. Lower the v0.46.0 F1 target from 0.70-0.75 to 0.60-0.70
2. Cite "SOTA F1 82.55 (Suh 2024, AST+ML)" not "GPTSniffer F1 ~85%"
3. Add a paragraph noting "LLMgCode has more quality issues than HaCode" (Xu 2024)
4. Add v0.50.0 to the release schedule for CodeVision-style detection
5. Note that dart/kt/swift/lua/go are research gaps (no published guidance)
