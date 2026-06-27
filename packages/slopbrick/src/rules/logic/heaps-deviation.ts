import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { computeHeapsExponent, tokenizeIdentifiers } from '../../engine/zipf-heaps';

/**
 * v0.12.0: Heaps-deviation rule (Christ, Bavarian, Koyejo, Lapata 2025,
 * "Zipf's and Heaps' Laws for Tokens and LLM-generated Texts",
 * *EMNLP Findings 2025*).
 *
 * Per the EMNLP 2025 paper, AI-generated text has a systematically
 * different Heaps exponent λ from human text. The rule fires when the
 * file's vocabulary-growth exponent deviates significantly from the
 * corpus baseline (default 0.5 ± 0.15, calibrated to natural-source code).
 *
 * The Heaps exponent is computed from identifier tokens (filters out
 * keywords and short tokens). The actual baseline λ should be set via
 * the calibration corpus; here we use a conservative default that
 * minimizes false positives.
 */
const HEAPS_BASELINE_LAMBDA = 0.5;
const HEAPS_BASELINE_STD = 0.15;
const DEVIATION_THRESHOLD_SIGMA = 2;
const MIN_TOKEN_COUNT = 50;

export const heapsDeviationRule = createRule<RuleContext>({
  id: 'logic/heaps-deviation',
  category: 'logic',
  severity: 'medium',
  aiSpecific: true,
  description: 'File vocabulary growth (Heaps λ) deviates significantly from corpus baseline — peer-reviewed LLM indicator (Christ et al. EMNLP 2025)',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    if (!facts.v2) return issues;
    const source = facts.v2._source ?? '';
    const tokens = tokenizeIdentifiers(source);
    if (tokens.length < MIN_TOKEN_COUNT) return issues;

    const fit = computeHeapsExponent(tokens);
    if (fit.exponent === 0) return issues;

    // Z-score deviation from corpus baseline.
    const z = (fit.exponent - HEAPS_BASELINE_LAMBDA) / HEAPS_BASELINE_STD;
    if (Math.abs(z) < DEVIATION_THRESHOLD_SIGMA) return issues;

    const direction = z > 0 ? 'higher' : 'lower';
    issues.push({
      ruleId: 'logic/heaps-deviation',
      category: 'logic',
      severity: 'medium',
      aiSpecific: true,
      message:
        `Heaps exponent λ=${fit.exponent.toFixed(3)} is ${direction} than corpus baseline ` +
        `(${HEAPS_BASELINE_LAMBDA.toFixed(2)} ± ${HEAPS_BASELINE_STD.toFixed(2)}, z=${z.toFixed(2)}σ). ` +
        `Per Christ et al. (EMNLP Findings 2025), LLM-generated text has systematically different vocabulary-growth rates.`,
      line: 1,
      column: 1,
      advice:
        `Inspect for LLM-style vocabulary patterns: this file's vocabulary ${direction === 'higher' ? 'grows faster' : 'grows slower'} ` +
        `than typical source code. Verify authorship if unexpected.`,
    });
    return issues;
  },
});

export default heapsDeviationRule satisfies Rule<RuleContext>;