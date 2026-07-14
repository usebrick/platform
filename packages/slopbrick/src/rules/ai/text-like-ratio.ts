import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

/**
 * AI text-like-content ratio (Yotkova 2026, SemEval Task 13).
 *
 * Per Yotkova, Kastreva, Dimitrov, Koychev, Nakov (2026),
 * "FMI_SU_Yotkova_Kastreva at SemEval-2026 Task 13: Lightweight
 *  Detection of LLM-Generated Code via Stylometric Signals"
 * (arXiv:2605.04157):
 *
 *   "Train a line classifier (TF-IDF char 3-5-gram + linear) on
 *    Stack Overflow + Twitch chat. Aggregate file-level ratio of
 *    lines that read as natural language rather than code."
 *
 * AI tools often embed "explanation text" in source code:
 *   - Long JSDoc/docstring blocks that read as prose
 *   - Comments that are full sentences with articles, prepositions
 *   - Markdown-like text in .md files masquerading as code
 *
 * Heuristic proxy without an ML model: count lines that
 *   1. start with a capital letter
 *   2. contain at least 2 spaces (suggesting prose)
 *   3. contain NO code-syntax tokens ({ } ( ) ; = < > [ ] -> =>)
 *   4. have length > 40 chars
 *
 * Per Yotkova: file-level threshold 0.3 → 99.9% specificity on
 * human code, 10.3% recall on LLM (high-precision flag).
 *
 * Lift: 3-5x for code with embedded prose.
 */
const MIN_LINES = 10;
const PROSE_RATIO_HIGH = 0.30;

const CODE_SYNTAX_RE = /[{}()\[\];=<>]|=>|->/;
const PROSE_LINE_RE = /^[A-Z][^A-Z\n]{20,}(\.|;|:)$/;

export const aiTextLikeRatioRule = createRule<RuleContext>({
  id: 'ai/text-like-ratio',
  category: 'ai',
  severity: 'low',
  aiSpecific: true,
  // v0.20.0 calibration: v8.5 verdict = USEFUL but recall 0.000
  // (fires never on the corpus). The rule is too specific to ever
  // fire on real code — the prose-detection heuristic is too
  // conservative. Disable until rewritten.
  defaultOff: true,
  description: 'High ratio of prose-like lines embedded in code — AI tools often leave natural-language explanations in source files (Yotkova 2026)',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    if (!facts.v2) return [];
    const source = facts.v2._source ?? '';
    if (!source) return [];

    const lines = source.split('\n');
    if (lines.length < MIN_LINES) return [];

    let total = 0;
    let proseLike = 0;

    for (const raw of lines) {
      const line = raw.trim();
      if (line === '') continue;
      // Skip comment-only lines (those are expected to be prose)
      if (line.startsWith('//') || line.startsWith('#') || line.startsWith('/*') ||
          line.startsWith('*') || line.startsWith('--')) continue;
      // Skip lines inside string literals (heuristic: odd number of quotes)
      const quoteCount = (line.match(/['"`]/g) || []).length;
      if (quoteCount % 2 === 1) continue;

      total++;
      if (line.length < 40) continue;
      if (CODE_SYNTAX_RE.test(line)) continue;
      // Count spaces (prose has more)
      const spaceCount = (line.match(/ /g) || []).length;
      if (spaceCount < 2) continue;
      // Should start with capital letter and end with sentence punctuation
      if (!PROSE_LINE_RE.test(line)) continue;

      proseLike++;
    }

    if (total === 0) return [];
    const ratio = proseLike / total;
    if (ratio < PROSE_RATIO_HIGH) return [];

    return [
      {
        ruleId: 'ai/text-like-ratio',
        category: 'ai',
        severity: 'low',
        aiSpecific: true,
        message:
          `Prose-like lines account for ${(ratio * 100).toFixed(0)}% of non-comment lines ` +
          `(${proseLike}/${total}). This source-text statistic can also reflect ` +
          `documentation examples or embedded content; it is not authorship proof.`,
        line: 1,
        column: 1,
        advice:
          'Separate explanatory prose from executable logic when appropriate; use documentation or content/i18n modules for text that belongs there. Keep user-facing strings where the product needs them.',
      },
    ];
  },
});

export default aiTextLikeRatioRule satisfies Rule<RuleContext>;
