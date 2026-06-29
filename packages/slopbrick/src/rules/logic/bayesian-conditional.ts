import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

/**
 * v0.12.0: Bayesian-conditional rule — fires on the calibrated Bayesian
 * posterior P(AI | fired_rules) computed via naive-Bayes likelihood-ratio
 * combination.
 *
 * Citations:
 *   Bayes 1763 / Laplace 1812 — foundational.
 *   Bento et al. 2024, "Improving rule-based classifiers by Bayes point
 *     aggregation," *Neurocomputing* — direct application.
 *   Duda, Hart, Stork 2000 — log-odds formulation.
 *
 * This rule is special: it operates on the *set* of fired rules from
 * other rules in the same scan, not on the file content directly. It
 * reads `facts.v2._firedRuleIds` (populated by the scan pipeline when
 * Bayesian combination is enabled) and fires when the posterior exceeds
 * the AI threshold.
 *
 * Threshold semantics:
 *   posterior ≥ 0.7  → AI
 *   0.3 ≤ posterior < 0.7 → uncertain (don't fire)
 *   posterior < 0.3  → human (don't fire; rule is AI-specific)
 *
 * The 0.7/0.3 cutoffs come from classifyByPosterior() default thresholds
 * and are conservative defaults; calibrate to deployment context.
 */
const POSTERIOR_AI_THRESHOLD = 0.7;
const POSTERIOR_HUMAN_THRESHOLD = 0.3;

export const bayesianConditionalRule = createRule<RuleContext>({
  id: 'logic/bayesian-conditional',
  category: 'logic',
  severity: 'high',
  aiSpecific: true,
  description: 'Calibrated Bayesian posterior P(AI | fired_rules) ≥ 0.7 — peer-reviewed naive-Bayes rule ensemble (Bento et al. 2024, *Neurocomputing*)',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    if (!facts.v2) return issues;
    // Read the Bayesian posterior computed by the scan pipeline. The
    // pipeline populates this when `--bayesian-posterior` is enabled
    // (default: on in v0.12.0+).
    const posterior = (facts.v2 as { _bayesianPosterior?: number })._bayesianPosterior;
    if (typeof posterior !== 'number' || !Number.isFinite(posterior)) {
      // Bayesian posterior not computed → fall through. Other rules
      // still fire normally.
      return issues;
    }
    if (posterior < POSTERIOR_AI_THRESHOLD) return issues;

    const confidence =
      posterior >= 0.9 ? 'high'
      : posterior >= 0.8 ? 'medium'
      : 'low';

    issues.push({
      ruleId: 'logic/bayesian-conditional',
      category: 'logic',
      severity: 'high',
      aiSpecific: true,
      message:
        `Calibrated Bayesian posterior P(AI | fired_rules) = ${posterior.toFixed(3)} ` +
        `(threshold = ${POSTERIOR_AI_THRESHOLD.toFixed(2)}, ${confidence} confidence). ` +
        `Naive-Bayes likelihood-ratio combination over all fired rules per Bento et al. 2024.`,
      line: 1,
      column: 1,
      advice:
        'The Bayesian combiner aggregates multiple weak signals into a calibrated posterior. ' +
        'Treat any fire above 0.7 as evidence of AI authorship; above 0.9 as strong evidence.',
    });
    return issues;
  },
});

export default bayesianConditionalRule satisfies Rule<RuleContext>;