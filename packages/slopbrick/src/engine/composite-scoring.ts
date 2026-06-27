// Composite AI-likelihood scoring via Naive Bayes log-likelihood ratio.
//
// Combines per-rule recall/FPR (from signal-strength.json) into a single
// 0-1 score per file. When 2+ rules fire, the composite LLR is the sum
// of individual LLRs + the prior log-odds; sigmoid converts to a
// probability. This is the standard Bayesian evidence combination used in
// spam filtering, intrusion detection, and medical diagnostics.
//
// **Math** (full derivation in
// /Users/cheng/platform/.research/multi-lang/03-composite-scoring.md):
//
//   LLR_i = log(recall_i / fpRate_i)   per-rule log-likelihood ratio
//   prior_log_odds = log(π / (1-π))    π = AI prevalence in codebase
//   composite_log_odds = prior_log_odds + Σ LLR_i  (triggered rules)
//   composite_score = sigmoid(composite_log_odds) = 1 / (1 + exp(-x))
//
// **Confidence tiers** (per Jaeschke 1994, JAMA evidence-based medicine):
//   0.00–0.30  LIKELY_HUMAN        (LR+ < 1.0× vs prior)
//   0.30–0.70  INCONCLUSIVE       (LR+ 1.0–5.7×)
//   0.70–0.95  LIKELY_AI          (LR+ 5.7–31.7×)
//   0.95–1.00  VERY_LIKELY_AI     (LR+ > 31.7×)
//
// **Edge cases handled**:
//   - FPR=0 → floor at FPR_FLOOR (1e-6), cap LLR at LLR_CAP (+13.8)
//   - recall=0 → floor at RECALL_FLOOR (1e-6), LLR ≈ 0
//   - defaultOff:true → skip (rule not part of the calibration set)
//   - HYGIENE verdict → skip (code-hygiene, not AI detector)
//   - DORMANT/INVERTED → skip (no calibration data or anti-correlated)
//
// **References**:
//   - McCallum, A. & Nigam, K. (1998), "A Comparison of Event Models
//     for Naive Bayes Text Classification," AAAI'98 Workshop
//   - Yerazunis, W. S. (2003), "The SpamAssassin Bayesian Classifier"
//   - Domingos, P. & Pazzani, M. (1997), "On the Optimality of the
//     Simple Bayesian Classifier under Zero-One Loss," Machine
//     Learning 29:103-130
//   - Jaeschke, R. et al. (1994), "Users' Guides to the Medical
//     Literature: III. How to Use an Article About a Diagnostic Test,"
//     JAMA 271(5):389-391
//   - Cui, Z. et al. (2025), "Who is using AI to code? Global
//     diffusion and impact of generative AI" (sets the prior at 0.30)

import { loadSignalStrength } from '../rules/signal-strength';

// ---- Constants --------------------------------------------------------

/** Floor for FPR. Below this, the rule's LLR is capped at LLR_CAP. */
const FPR_FLOOR = 1e-6;

/** Floor for recall. Below this, the rule is treated as uninformative. */
const RECALL_FLOOR = 1e-6;

/** Maximum single-rule LLR. Prevents single high-precision rules from
 *  dominating the composite. log(1.0 / 1e-6) = 13.82. */
const LLR_CAP = 13.8;

/** Default prior — AI prevalence in a typical 2024-2026 codebase. */
const DEFAULT_PRIOR_PREVALENCE = 0.30;

/** Verdicts eligible for composite scoring. */
const ELIGIBLE_VERDICTS = new Set(['USEFUL', 'OK']);

// ---- Types ------------------------------------------------------------

export type Verdict = 'USEFUL' | 'OK' | 'NOISY' | 'HYGIENE' | 'DORMANT' | 'INVERTED';

export interface RuleSignal {
  ruleId: string;
  recall: number;
  fpRate: number;
  precision: number;
  ratio: number;
  verdict: Verdict;
  defaultOff: boolean;
  /** If true, this rule is an AI-specific detector. Composite scoring
   *  only counts rules that are AI-specific AND have a verdict in
   *  ELIGIBLE_VERDICTS. Set by signal-strength.json via aiSpecific. */
  aiSpecific?: boolean;
}

export type ConfidenceTier =
  | 'LIKELY_HUMAN'
  | 'INCONCLUSIVE'
  | 'LIKELY_AI'
  | 'VERY_LIKELY_AI';

export interface TriggeredRule {
  ruleId: string;
  llr: number;
  recall: number;
  fpRate: number;
}

export interface CompositeScore {
  /** Prior log-odds (corpus prevalence baseline). */
  logOddsPrior: number;
  /** Posterior log-odds = prior + Σ LLR_i (triggered rules). */
  logOddsPosterior: number;
  /** Probability in [0, 1] that the file is AI-generated. */
  probability: number;
  /** Rules that contributed to the composite (after eligibility filter). */
  triggeredRules: TriggeredRule[];
  /** Number of triggered rules (>= 0; 0 means no rules fired). */
  ruleCount: number;
  /** Confidence tier per Jaeschke 1994 thresholds. */
  confidenceTier: ConfidenceTier;
  /** Prior used (for transparency in output). */
  priorPrevalence: number;
}

// ---- Signal-strength loader -----------------------------------------

/** Cached lookup of ruleId → RuleSignal. Lazy-loaded on first use. */
let _signals: Map<string, RuleSignal> | null = null;

function loadSignals(): Map<string, RuleSignal> {
  if (_signals) return _signals;
  // v0.14.5d: use the canonical `loadSignalStrength()` from
  // `src/rules/signal-strength.ts`, which uses a static JSON import that
  // works in both ESM and bundled CJS. The previous readFileSync fallback
  // broke in the published tarball because `dist/rules/signal-strength.json`
  // didn't exist — `__filename` resolves to `dist/index.cjs` so
  // `../rules/signal-strength.json` looked at the package root, not the
  // dist subdir.
  const raw = loadSignalStrength();
  const map = new Map<string, RuleSignal>();
  for (const [ruleId, entry] of Object.entries(raw)) {
    // The JSON has more fields than the `SignalStrength` interface (e.g.
    // `verdict`, `_calibrationNote`). Read them as `unknown` to stay
    // compatible with the typed loader; only the fields we actually
    // need for the Bayesian math flow downstream.
    const extended = entry as typeof entry & {
      verdict?: string;
      aiSpecific?: boolean;
    };
    map.set(ruleId, {
      ruleId,
      recall: entry.recall ?? 0,
      fpRate: entry.fpRate ?? 0,
      precision: entry.precision ?? 0,
      ratio: entry.ratio ?? 0,
      verdict: (extended.verdict ?? 'DORMANT') as RuleSignal['verdict'],
      defaultOff: entry.defaultOff === true,
      aiSpecific: extended.aiSpecific === true,
    });
  }
  _signals = map;
  return map;
}

// ---- Math ------------------------------------------------------------

/**
 * Build the prior log-odds from the project's AI prevalence.
 *
 *   prior_log_odds = log(π / (1 - π))
 *
 * Prevalence π is the estimated fraction of code in the codebase that
 * is AI-generated. Default 0.30 matches Cui et al. (2025)'s
 * Dec-2024 US measurement.
 */
export function buildPriorLogOdds(prevalence: number = DEFAULT_PRIOR_PREVALENCE): number {
  const p = Math.max(0.01, Math.min(0.99, prevalence));
  return Math.log(p / (1 - p));
}

/**
 * Per-rule log-likelihood ratio with floor + cap to avoid log(0) and
 * outliers. Returns 0 for rules not eligible for composite scoring.
 */
export function ruleLLR(rule: RuleSignal): number {
  if (rule.defaultOff) return 0;
  if (rule.aiSpecific !== true) return 0;
  if (!ELIGIBLE_VERDICTS.has(rule.verdict)) return 0;
  const recall = Math.max(RECALL_FLOOR, rule.recall);
  const fpRate = Math.max(FPR_FLOOR, rule.fpRate);
  return Math.min(LLR_CAP, Math.log(recall / fpRate));
}

/**
 * Look up a rule's signal by id. Returns undefined if the rule is
 * not in signal-strength.json.
 */
export function getRuleSignal(ruleId: string): RuleSignal | undefined {
  return loadSignals().get(ruleId);
}

/**
 * Compute the composite score for a file given the rules that fired.
 *
 * @param triggeredRuleIds — list of rule IDs that fired on this file
 * @param priorPrevalence — codebase AI prevalence (default 0.30)
 * @returns CompositeScore with probability, tier, and contributing rules
 */
export function compositeScore(
  triggeredRuleIds: string[],
  priorPrevalence: number = DEFAULT_PRIOR_PREVALENCE,
): CompositeScore {
  const prior = buildPriorLogOdds(priorPrevalence);
  const signals = loadSignals();

  const triggered: TriggeredRule[] = [];
  for (const ruleId of triggeredRuleIds) {
    const sig = signals.get(ruleId);
    if (!sig) continue;
    const llr = ruleLLR(sig);
    if (llr <= 0) continue;
    triggered.push({
      ruleId,
      llr,
      recall: sig.recall,
      fpRate: sig.fpRate,
    });
  }

  const sumLLR = triggered.reduce((s, r) => s + r.llr, 0);
  const posterior = prior + sumLLR;
  const prob = 1 / (1 + Math.exp(-posterior));

  let tier: ConfidenceTier;
  if (prob < 0.30) tier = 'LIKELY_HUMAN';
  else if (prob < 0.70) tier = 'INCONCLUSIVE';
  else if (prob < 0.95) tier = 'LIKELY_AI';
  else tier = 'VERY_LIKELY_AI';

  return {
    logOddsPrior: prior,
    logOddsPosterior: posterior,
    probability: prob,
    triggeredRules: triggered,
    ruleCount: triggered.length,
    confidenceTier: tier,
    priorPrevalence,
  };
}

/**
 * Aggregate file-level scores to a directory score.
 *
 * Returns the MAX probability (not the mean), because AI-tend signals
 * cluster in specific files. A directory with 1 highly-AI file and 99
 * human files should be flagged — averaging dilutes the signal.
 */
export function directoryScore(
  fileScores: CompositeScore[],
  priorPrevalence: number = DEFAULT_PRIOR_PREVALENCE,
): CompositeScore {
  if (fileScores.length === 0) {
    return compositeScore([], priorPrevalence);
  }
  return fileScores.reduce((max, s) =>
    s.probability > max.probability ? s : max,
  );
}

// ---- Formatting -------------------------------------------------------

/**
 * Human-readable summary for CLI output.
 */
export function formatComposite(score: CompositeScore): string {
  const tier = score.confidenceTier.padEnd(16);
  const prob = (score.probability * 100).toFixed(1).padStart(5) + '%';
  const rules = score.ruleCount.toString().padStart(2);
  const top = score.triggeredRules
    .slice()
    .sort((a, b) => b.llr - a.llr)
    .slice(0, 3)
    .map((r) => `${r.ruleId.split('/').pop()}(+${r.llr.toFixed(2)})`)
    .join(' ');
  return `${tier} ${prob}  ${rules} rules  ${top}`;
}
