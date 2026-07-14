import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { getCorpusBaselines } from '../../engine/corpus-baselines';
import {
  countNonEmptyJsLines,
  JS_COMMENT_LINE_METRIC_ID,
} from '../../engine/js-comment-lines';

/**
 * AI comment-to-code ratio.
 *
 * Per Rahman et al. (2024, arXiv:2409.01382):
 *   "Comment-to-code ratio is the top-3 SHAP feature in 7 of 8
 *    LLM-granularity configurations. Universal discriminator."
 *
 * The signal is two-sided depending on the model family:
 *   - Reductive models (GPT-3.5, Claude 3 Haiku): low comment ratio
 *     (LLM skips comments to save tokens / passes tests without them).
 *   - Expansive models (Claude Haiku 4.5, GPT-OSS): high comment
 *     ratio (LLM over-comments when prompted for "well-commented
 *     code" or when copying from training examples that have them).
 *
 * Human-written code sits in the middle. Calibration via KS test
 * against a corpus baseline (see `getCorpusBaselines()`) is required.
 *
 * Bisztray et al. (AISec 2025) confirm: removing comments drops
 * BERT detection accuracy 94.75 → 91.62 (binary, 3.13 pp) and
 * 92.65 → 85.45 (multi-class, 7.2 pp drop). Comments are the
 * single richest feature across 8 LLMs tested.
 *
 * Default thresholds: comment-line ratio < 0.05 (reductive) OR
 * > 0.45 (expansive) → flag. These are conservative defaults;
 * the corpus-baselines.json (when present) tunes both ends to
 * the user's own neg corpus.
 */
const MIN_FILE_LINES = 20;

// Fallback thresholds (used when corpus-baselines.json is absent).
// v0.20.0 calibration tune: original (0.05 / 0.45) gave 15-16% FP
// rate. The low end (0.05) flagged any file with <5% comments —
// catches most "terse" code regardless of authorship. The high end
// (0.45) flagged any file with >45% comments — catches most
// tutorial/example code regardless of authorship. Tightened to
// (0.02 / 0.55) to reduce FP while keeping the rule alive.
// The corpus-baseline path (mean ± 2*std) is unaffected.
const FALLBACK_LOW = 0.02;
const FALLBACK_HIGH = 0.55;

export const aiCommentRatioRule = createRule<RuleContext>({
  id: 'ai/comment-ratio',
  category: 'ai',
  severity: 'medium',
  aiSpecific: true,
  description: 'Comment-line ratio falls outside compatible calibrated or provisional parser-backed bounds — reductive models skip comments, expansive models over-comment (Rahman et al. 2024, Bisztray et al. 2025)',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    if (!facts.v2 || facts.v2.commentLineCount === undefined) return [];
    const source = facts.v2._source ?? '';
    if (!source) return [];

    const total = countNonEmptyJsLines(source);
    if (total < MIN_FILE_LINES) return [];
    const comment = facts.v2.commentLineCount;

    const ratio = comment / total;

    const baselines = getCorpusBaselines();
    const compatibleCommentBaseline =
      baselines?.extractors?.commentDensity === JS_COMMENT_LINE_METRIC_ID
        ? baselines.features.commentDensity
        : undefined;
    const low = compatibleCommentBaseline
      ? Math.max(0.01, compatibleCommentBaseline.mean - 2 * compatibleCommentBaseline.std)
      : FALLBACK_LOW;
    const high = compatibleCommentBaseline
      ? compatibleCommentBaseline.mean + 2 * compatibleCommentBaseline.std
      : FALLBACK_HIGH;

    if (ratio >= low && ratio <= high) return [];

    const direction = ratio < low ? 'low' : 'high';
    const comparison = compatibleCommentBaseline
      ? ` vs corpus mean ${compatibleCommentBaseline.mean.toFixed(2)}`
      : `; provisional parser-backed thresholds ${low.toFixed(2)}–${high.toFixed(2)}`;
    const issues: Issue[] = [
      {
        ruleId: 'ai/comment-ratio',
        category: 'ai',
        severity: 'medium',
        aiSpecific: true,
        message:
          `Comment-line ratio is ${direction} (${ratio.toFixed(2)}${comparison}). ` +
          `Corpus studies associate low and high ratios with different documentation ` +
          `practices; this source statistic is not an authorship verdict.`,
        line: 1,
        column: 1,
        advice:
          direction === 'low'
            ? 'Add doc comments explaining intent (not just restating the next line) for non-obvious logic.'
            : 'High comment ratio — consider whether the comments are intentional (api docs, type defs, tutorials). ' +
              'For functional code, trim comments that just restate the next line. ' +
              'Keep comments that explain WHY, not WHAT.',
      },
    ];
    return issues;
  },
});

export default aiCommentRatioRule satisfies Rule<RuleContext>;
