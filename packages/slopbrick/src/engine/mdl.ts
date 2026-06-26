// Minimum Description Length composite score (v0.10 — Phase 3).
//
// Reference: Rissanen 1978, "Modeling by shortest data description,"
// Automatica 14(5), 465-471. Background: Grunwald 2007
// (textbook, MIT Press), Grunwald 2019 review (Int. J. Math. for
// Industry). The MDL principle selects the model that minimizes
//
//   L(m) + L(data | m)
//
// where L(m) is the model description length and L(data | m) is the
// negative log-likelihood of the data under the model. Applied to the
// rule-firing evidence that slopbrick collects, the headline score
// becomes the log-likelihood ratio:
//
//   Coherence_MDL = log P(rules_fired | m_ai) - log P(rules_fired | m_human)
//
// A positive score means the joint pattern of rule firings is more
// likely under m_ai than m_human; negative favors m_human. This
// replaces the heuristic weighted-average (0.50, 0.30, 0.10, 0.10)
// with a principled derivation engineers can audit by arguing the
// model — which rules belong to m_ai vs m_human — instead of the
// weights. See `docs/research/math-foundations-for-slopbrick.md`
// §3.3 for the full math derivation.
//
// Prior construction:
//   m_ai assigns higher probability to USEFUL rule IDs (the 18
//     rules in docs/research/v4-per-rule-pr-fpr.md that fire more on
//     AI code than on human code per the v4 calibration, P ≥ 50%
//     AND lift ≥ 2).
//   m_human assigns higher probability to INVERTED rule IDs (lift
//     < 1, fires more on human code than AI).
//   Background rules (OK, NOISY, and DORMANT) get a small uniform
//     probability under both models.
//
// Laplace (add-1) smoothing: rules that fire but are not in the
// model's vocabulary get a small fixed floor probability rather
// than 0, so unseen evidence does not drive the ratio to ±Infinity
// or NaN. The floor is small enough (~1e-6) to keep discriminative
// evidence dominant.
//
// Pure functions. No I/O.

import type { Rule } from '../types';
import { builtinRules } from '../rules/builtins.js';

/** Per-model probability distribution over rule IDs. Each map gives
 *  P(rule_id | model); the sum over the model's vocabulary is 1.0. */
export interface MdlModelProbs {
  m_ai: Map<string, number>;
  m_human: Map<string, number>;
}

/** Result returned by `computeMDLikelihood`. */
export interface MdlLikelihood {
  /** Sum of log P(rule | m_ai) over the fired rules. Negative,
   *  since each per-rule probability is < 1. */
  logLikAi: number;
  /** Sum of log P(rule | m_human) over the fired rules. */
  logLikHuman: number;
  /** logLikAi - logLikHuman. Positive = evidence favors m_ai. */
  logRatio: number;
}

/** USEFUL rules per the v4 calibration table
 *  (docs/research/v4-per-rule-pr-fpr.md). These fire more on AI
 *  code than on human code (P ≥ 50% AND lift ≥ 2). 18 rules. */
export const AI_FAVORED_RULE_IDS: readonly string[] = [
  'test/weak-assertion',
  'logic/math-console-log-storm',
  'visual/math-rounded-entropy',
  'logic/reactive-hook-soup',
  'security/sql-construction',
  'wcag/focus-appearance',
  'security/missing-auth-check',
  'component/shadcn-prop-mismatch',
  'visual/math-default-font',
  'logic/optimistic-no-rollback',
  'logic/math-gini-class-usage',
  'security/dangerous-cors',
  'visual/math-color-cluster',
  'logic/zombie-state',
  'test/duplicate-setup',
  'logic/ghost-defensive',
  'typo/calc-raw-px',
  'security/fail-open-auth',
] as const;

/** INVERTED rules per the v4 calibration table. These fire more
 *  on human code than AI code (lift < 1). 11 rules. */
export const HUMAN_FAVORED_RULE_IDS: readonly string[] = [
  'component/multiple-components-per-file',
  'context/import-path-mismatch',
  'visual/spacing-scale-violation',
  'visual/inline-style-dominance',
  'security/public-admin-route',
  'security/unsafe-html-render',
  'logic/key-prop-missing',
  'layout/spacing-grid',
  'typo/math-button-label-uniformity',
  'logic/math-variable-name-entropy',
  'wcag/dragging-movements',
] as const;

/** Mass assigned to favored rules vs the background. Favored rules
 *  split ~99% of the probability mass under each model; background
 *  rules split the remaining ~1%. Gives a strong but not absolute
 *  preference — the model still assigns nonzero probability to
 *  background rules so cross-rule firing patterns carry weight. */
const FAVORED_WEIGHT = 1.0;
const BACKGROUND_WEIGHT = 0.01;

/** Floor probability for rules outside the model's vocabulary
 *  (Laplace / add-1 smoothing per Rissanen 1978 §3). Small enough
 *  that favored rules remain dominant, large enough that the log
 *  of the floor is finite. With 1e-6, log(floor) ≈ -13.8, so a
 *  handful of unseen rules does not dominate the log-likelihood. */
export const MDL_SMOOTHING_FLOOR = 1e-6;

/** Construct the default m_ai / m_human prior distributions from a
 *  rule registry (typically `builtinRules` from rules/builtins.js).
 *  Both models span the union of rule IDs in `builtinRules`. m_ai
 *  assigns high probability to USEFUL rule IDs; m_human assigns
 *  high probability to INVERTED rule IDs. Each model is
 *  renormalized so the sum over its vocabulary is exactly 1.0. */
export function buildDefaultMdlPriors(
  builtinRules: readonly Rule[],
): MdlModelProbs {
  const aiFavored = new Set<string>(AI_FAVORED_RULE_IDS);
  const humanFavored = new Set<string>(HUMAN_FAVORED_RULE_IDS);

  const m_ai = new Map<string, number>();
  const m_human = new Map<string, number>();
  let sumAi = 0;
  let sumHuman = 0;

  for (const rule of builtinRules) {
    const aiWeight = aiFavored.has(rule.id) ? FAVORED_WEIGHT : BACKGROUND_WEIGHT;
    const humanWeight = humanFavored.has(rule.id) ? FAVORED_WEIGHT : BACKGROUND_WEIGHT;
    m_ai.set(rule.id, aiWeight);
    m_human.set(rule.id, humanWeight);
    sumAi += aiWeight;
    sumHuman += humanWeight;
  }

  // Renormalize so each model is a valid probability distribution.
  for (const [id, w] of m_ai) {
    m_ai.set(id, w / sumAi);
  }
  for (const [id, w] of m_human) {
    m_human.set(id, w / sumHuman);
  }

  return { m_ai, m_human };
}

/** Default priors constructed from the builtin rule registry at
 *  module load time. Tests and reporters that don't have their own
 *  rules array can use this directly. */
export const DEFAULT_MDL_PRIORS: MdlModelProbs = buildDefaultMdlPriors(builtinRules);

/** Look up the model probability for a rule ID, falling back to the
 *  Laplace smoothing floor for rules outside the model's vocabulary
 *  or with zero prior probability. */
function lookupProb(model: Map<string, number>, ruleId: string): number {
  const p = model.get(ruleId);
  if (p !== undefined && p > 0) return p;
  return MDL_SMOOTHING_FLOOR;
}

/**
 * Compute the log-likelihood of a rule-firing pattern under each of
 * the two competing MDL models. Returns the per-model
 * log-likelihoods and their difference.
 *
 * Empty `rulesFired` is treated as evidence equally probable under
 * both models — log-likelihoods are 0 and logRatio is 0.
 *
 * Pure function. No I/O. Cite: Rissanen 1978 §3 (MDL principle);
 * applied per the derivation in
 * `docs/research/math-foundations-for-slopbrick.md` §3.3.
 */
export function computeMDLikelihood(
  rulesFired: readonly string[],
  modelProbs: MdlModelProbs,
): MdlLikelihood {
  let logLikAi = 0;
  let logLikHuman = 0;

  for (const ruleId of rulesFired) {
    const pAi = lookupProb(modelProbs.m_ai, ruleId);
    const pHuman = lookupProb(modelProbs.m_human, ruleId);
    logLikAi += Math.log(pAi);
    logLikHuman += Math.log(pHuman);
  }

  return {
    logLikAi,
    logLikHuman,
    logRatio: logLikAi - logLikHuman,
  };
}