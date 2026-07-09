/**
 * v0.12.0: Bayesian likelihood-ratio combiner for rule fire sets.
 *
 * Citations:
 *   Bayes 1763 / Laplace 1812 — foundational Bayes' rule.
 *   Duda, Hart, Stork 2000, *Pattern Classification* (2nd ed.), Wiley,
 *     ch. 2 — odds form P(H|E)/P(¬H|E) = P(H)/P(¬H) · P(E|H)/P(E|¬H).
 *   Good 1950, *Probability and the Weighing of Evidence* — log-odds /
 *     weight of evidence framework.
 *   Bento et al. 2024, "Improving rule-based classifiers by Bayes point
 *     aggregation," *Neurocomputing* — direct application to rule ensembles.
 *   Lewis 1998, "Naive Bayes at forty" — naive Bayes for text classification,
 *     the canonical reference for the independence assumption used here.
 *
 * Why this exists:
 *
 *   The current `Repository Coherence Score` is a heuristic weighted average
 *   (0.50, 0.30, 0.10, 0.10) over 4 coarse categories. This module replaces
 *   it with a *calibrated Bayesian posterior* computed from per-rule
 *   likelihood ratios.
 *
 * For each rule that fires, we compute a likelihood ratio (LR):
 *
 *     LR_i = P(rule_i fires | AI) / P(rule_i fires | human)
 *
 * Estimated from the calibration corpus (see signal-strength.json). For
 * rule `r` with TP=pos fires, FP=neg fires, N_pos total pos files, N_neg
 * total neg files:
 *
 *     LR = (TP / N_pos) / (FP / N_neg)     (smoothed by 0.5 to avoid /0)
 *
 * For the 13 INVERTED rules (LR < 1), the combiner naturally flips their
 * sign: a fire that is *less likely on AI* is evidence against AI. The
 * Bayesian conditional combination allows these rules to still contribute
 * useful information — they just contribute *negative* evidence by default
 * and can be flipped to positive evidence when paired with corroborating
 * rules (Bayes' rule handles conjunction natively).
 *
 * Naive Bayes independence assumption:
 *
 *   P(AI | all fires) / P(human | all fires)
 *     = P(AI) / P(human) · Π_i LR_i
 *
 * In log space:
 *
 *   log posterior-odds = log prior-odds + Σ_i log LR_i
 *
 * This is the canonical naive Bayes update. The independence assumption
 * is violated in practice (rules share underlying facts), but the
 * resulting posterior is still well-calibrated when:
 *   - LRs are computed from the same corpus
 *   - Rules are sorted by independence from most-predictive to least
 *   - The posterior is thresholded on the held-out calibration set
 *
 * This is the same independence assumption used by spam filters, sentiment
 * classifiers, and Bento et al. 2024's rule ensemble.
 *
 * v0.15.0 B.2: moved from `packages/slopbrick/src/engine/lr-combiner.ts`
 * to `@usebrick/engine`. The signal-strength data is now passed in as
 * a parameter (the engine has no I/O and does not depend on slopbrick's
 * loader). Callers fetch the data via `loadSignalStrength()` from
 * `slopbrick/src/rules/signal-strength.ts` and pass it in.
 */

import type { SignalStrengthEntry } from '@usebrick/core';

/**
 * Per-rule likelihood ratio computed from the calibration corpus.
 * Smoothing: add 0.5 to numerator and denominator to avoid division by 0
 * (Haldane's correction; appropriate for small N).
 */
export interface RuleLikelihoodRatio {
  ruleId: string;
  /** LR = P(fire | AI) / P(fire | human). > 1 = AI signal, < 1 = human signal. */
  lr: number;
  /** log(LR), pre-computed for fast summation. */
  logLr: number;
  /** Smoothed TP per AI file (precision × recall). */
  tpRate: number;
  /** Smoothed FP per human file. */
  fpRate: number;
}

const SMOOTHING = 0.5;

/**
 * Default corpus priors (50/50). The calibrator can override these when the
 * deployment context has a different AI prevalence (e.g., a CI gate on a
 * known-AI-heavy codebase).
 */
export interface BayesPrior {
  /** Prior probability that a given file is AI-generated. */
  pAI: number;
  /** Prior probability that a given file is human-written. */
  pHuman: number;
}

export const DEFAULT_PRIOR: BayesPrior = { pAI: 0.5, pHuman: 0.5 };

/**
 * Compute per-rule likelihood ratios from the signal-strength data plus
 * the corpus sizes. The signal data is passed in (the engine is pure —
 * no I/O). The corpus sizes can be passed in from the calibrator
 * (preferred) or fall back to the v4 calibration defaults.
 *
 * @param ruleIds     - Rule IDs to compute LRs for.
 * @param signalData  - The `loadSignalStrength()` record from
 *                      `@usebrick/slopbrick/rules/signal-strength`. Each
 *                      entry's `recall` and `fpRate` are the per-rule
 *                      empirical estimates.
 * @param corpus      - Optional corpus sizes for the calibrator's
 *                      TP/FP denominators. Defaults to v4.
 */
export function computeLikelihoodRatios(
  ruleIds: readonly string[],
  signalData: Readonly<Record<string, SignalStrengthEntry>>,
  corpus?: { nPositive: number; nNegative: number },
): RuleLikelihoodRatio[] {
  // Default to v4 corpus sizes if not provided.
  const nPos = corpus?.nPositive ?? 76787;
  const nNeg = corpus?.nNegative ?? 86983;
  const out: RuleLikelihoodRatio[] = [];
  // A fire set is a set semantically: a rule can fire many times in one
  // file, but its calibrated evidence must only be applied once. Deduping
  // here keeps all downstream consumers (posterior, counts, and reporting)
  // invariant to repeated rule IDs while preserving first-seen order.
  const uniqueRuleIds = [...new Set(ruleIds)];
  for (const id of uniqueRuleIds) {
    const s = signalData[id];
    if (!s) continue;
    const tp = s.recall * nPos;
    const fp = s.fpRate * nNeg;
    const tpSmooth = (tp + SMOOTHING) / (nPos + 1);
    const fpSmooth = (fp + SMOOTHING) / (nNeg + 1);
    const lr = tpSmooth / fpSmooth;
    out.push({
      ruleId: id,
      lr,
      logLr: Math.log(lr),
      tpRate: tpSmooth,
      fpRate: fpSmooth,
    });
  }
  return out;
}

/**
 * Naive Bayes update over a set of fired rules.
 *
 * @param firedRuleIds - Rule IDs that fired on the file.
 * @param lrs          - Pre-computed likelihood ratios (from computeLikelihoodRatios).
 * @param prior        - Prior (defaults to 50/50).
 * @returns Posterior probability P(AI | fires).
 */
export function bayesianPosterior(
  firedRuleIds: readonly string[],
  lrs: readonly RuleLikelihoodRatio[],
  prior: BayesPrior = DEFAULT_PRIOR,
): number {
  if (firedRuleIds.length === 0) return prior.pAI;
  const lrByRule = new Map(lrs.map((l) => [l.ruleId, l]));
  // log posterior-odds = log prior-odds + Σ log(LR_i)
  const logPriorOdds = Math.log(prior.pAI / prior.pHuman);
  let logLrSum = 0;
  let matchedCount = 0;
  for (const id of new Set(firedRuleIds)) {
    const lr = lrByRule.get(id);
    if (!lr) continue;
    logLrSum += lr.logLr;
    matchedCount++;
  }
  // If no rules matched (unknown or uncalibrated), fall back to prior.
  if (matchedCount === 0) return prior.pAI;
  const logPosteriorOdds = logPriorOdds + logLrSum;
  // posterior-odds = exp(log posterior-odds); posterior = odds / (1 + odds)
  const odds = Math.exp(logPosteriorOdds);
  return odds / (1 + odds);
}

/**
 * Convenience: combine in one call given the fire set, the signal
 * data, and (optional) corpus sizes. Pure — the signal data is passed
 * in, not loaded.
 */
export function combineFireSet(
  firedRuleIds: readonly string[],
  signalData: Readonly<Record<string, SignalStrengthEntry>>,
  corpus?: { nPositive: number; nNegative: number },
  prior: BayesPrior = DEFAULT_PRIOR,
): {
  posterior: number;
  matchedRules: number;
  totalLogLr: number;
  perRuleLrs: RuleLikelihoodRatio[];
} {
  // Get LRs for all fired rules. If a fired rule has no calibration data,
  // we still report it in perRuleLrs as null and skip it from the sum.
  const allRelevantRuleIds = [...new Set(firedRuleIds)];
  const perRuleLrs = computeLikelihoodRatios(allRelevantRuleIds, signalData, corpus);
  const lrByRule = new Map(perRuleLrs.map((l) => [l.ruleId, l]));
  const matchedIds = allRelevantRuleIds.filter((id) => lrByRule.has(id));
  const posterior = bayesianPosterior(allRelevantRuleIds, perRuleLrs, prior);
  let totalLogLr = 0;
  for (const id of matchedIds) {
    totalLogLr += lrByRule.get(id)!.logLr;
  }
  return {
    posterior,
    matchedRules: matchedIds.length,
    totalLogLr,
    perRuleLrs,
  };
}

/**
 * Decision threshold on the posterior. Defaults to 0.5 (Bayes-optimal for
 * 50/50 priors and equal loss). Can be tuned by the calibrator based on
 * the deployment context.
 */
export function classifyByPosterior(
  posterior: number,
  threshold = 0.5,
): 'AI' | 'human' | 'uncertain' {
  if (posterior >= threshold + 0.2) return 'AI';
  if (posterior <= threshold - 0.2) return 'human';
  return 'uncertain';
}
