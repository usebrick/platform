import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { shannonEntropy } from '../math-utils';

/**
 * AI whitespace regularity (DetectCodeGPT 2024).
 *
 * Per Shi, Du, Ma, Wu, Zhang, Ji, Wang (2024),
 * "Between Lines of Code: Unraveling the Distinct Patterns of
 *  Machine and Human Programmers" (arXiv:2401.06461):
 *
 *   "Whitespace tokens have the highest naturalness deviation
 *    between human and AI code among all token categories —
 *    surpassing even identifiers/keywords. AI generates regular
 *    patterns; humans vary them."
 *
 * The signal: count the number of consecutive spaces between
 * tokens in the file. Human code has high variance (0, 1, 2, 3,
 * 4, 5+ spaces) — tabs vs spaces, alignment, manual indentation
 * choices. AI code is much more uniform (mostly 1 space, occasional
 * alignment with 2-4 spaces in tables).
 *
 * Robustness caveat: Pordanesh et al. (DIMVA 2025) showed this
 * signal degrades to 0.51 AUROC under adversarial paraphrase,
 * but it remains the strongest static signal in non-adversarial
 * conditions.
 *
 * We compute the coefficient of variation (CV = std/mean) of the
 * inter-token space counts. AI code: CV < 0.5 (uniform). Human
 * code: CV > 1.0 (variable).
 *
 * Lift: ~2-3x in DetectCodeGPT 2024 across 6 source LLMs.
 */
const MIN_TOKEN_PAIRS = 50;

export const aiWhitespaceRegularityRule = createRule<RuleContext>({
  id: 'ai/whitespace-regularity',
  category: 'ai',
  severity: 'medium',
  aiSpecific: true,
  description: 'Inter-token whitespace distribution is suspiciously uniform — AI code uses regular spacing patterns (Shi et al. 2024, DetectCodeGPT)',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    if (!facts.v2) return [];
    const source = facts.v2._source ?? '';
    if (!source) return [];

    // Count consecutive spaces between non-space tokens.
    // Skip newlines, tabs (tab characters count as 1, but we focus on
    // space-character runs for the inter-token signal).
    const spaceRuns: number[] = [];
    let runLen = 0;
    let lastWasSpace = false;
    let inToken = false;
    let tokenCount = 0;

    for (let i = 0; i < source.length; i++) {
      const c = source[i];
      if (c === ' ' || c === '\t') {
        if (inToken) {
          inToken = false;
          tokenCount++;
        }
        if (c === ' ' && !lastWasSpace) {
          runLen = 1;
          lastWasSpace = true;
        } else if (c === ' ') {
          runLen++;
        }
        // tab counts as end of run for our purposes
      } else if (c === '\n' || c === '\r') {
        if (inToken) {
          inToken = false;
          tokenCount++;
        }
        if (lastWasSpace && runLen > 0) {
          spaceRuns.push(runLen);
          runLen = 0;
        }
        lastWasSpace = false;
      } else {
        if (lastWasSpace && runLen > 0) {
          spaceRuns.push(runLen);
          runLen = 0;
        }
        lastWasSpace = false;
        inToken = true;
      }
    }
    // Finalize last run
    if (lastWasSpace && runLen > 0) {
      spaceRuns.push(runLen);
    }
    if (inToken) tokenCount++;

    if (spaceRuns.length < MIN_TOKEN_PAIRS) return [];

    // Compute mean and std of space-run lengths
    let sum = 0;
    for (const s of spaceRuns) sum += s;
    const mean = sum / spaceRuns.length;
    let sqSum = 0;
    for (const s of spaceRuns) sqSum += (s - mean) ** 2;
    const std = Math.sqrt(sqSum / spaceRuns.length);
    const cv = mean > 0 ? std / mean : 0;

    // Also compute Shannon entropy of space-run lengths (more sensitive)
    const runCounts = new Map<number, number>();
    for (const s of spaceRuns) {
      runCounts.set(s, (runCounts.get(s) ?? 0) + 1);
    }
    const { h } = shannonEntropy(runCounts);

    // AI signature: CV < 0.5 AND H < 0.8 (very low entropy of run lengths)
    // Human signature: CV > 1.0 OR H > 1.5
    if (cv >= 0.5) return [];
    if (h >= 0.8) return [];

    const issues: Issue[] = [
      {
        ruleId: 'ai/whitespace-regularity',
        category: 'ai',
        severity: 'medium',
        aiSpecific: true,
        message:
          `Inter-token whitespace distribution is suspiciously uniform ` +
          `(CV=${cv.toFixed(2)}, H=${h.toFixed(2)}, n=${spaceRuns.length} runs, mean=${mean.toFixed(2)} spaces). ` +
          `Formatter settings, language conventions, and project style can explain this ` +
          `distribution; treat it as a formatting statistic rather than an authorship signal.`,
        line: 1,
        column: 1,
        advice:
          'Do not manually vary formatting to satisfy this heuristic. Keep formatter output and document intentional style in project policy when the signal is not relevant.',
      },
    ];
    return issues;
  },
});

export default aiWhitespaceRegularityRule satisfies Rule<RuleContext>;
