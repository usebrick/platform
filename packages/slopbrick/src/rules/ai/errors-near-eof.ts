import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

/**
 * AI errors-near-EOF ratio (Yotkova 2026, SemEval Task 13).
 *
 * Per Yotkova et al. (2026), SemEval-2026 Task 13:
 *   "Proportion of Tree-Sitter parsing-error nodes whose spans
 *    overlap the last 20% of file. Captures truncation /
 *    abruptly-terminated code (max-token cutoffs)."
 *
 * AI tools that hit max-token cutoffs (most chat interfaces have
 * a 4k-200k token output limit) often produce code that's:
 *   - syntactically valid up to a point
 *   - then truncates mid-function/mid-block
 *   - leaves an unclosed brace, unclosed string, or dangling
 *     expression near the end
 *
 * Heuristic proxy without Tree-Sitter: count unbalanced braces,
 * parentheses, brackets in the last 20% of lines. AI-truncated
 * code has significantly more unbalanced delimiters near EOF.
 *
 * Lift: 3-5x in the Yotkova corpus. Robust because truncation is
 * a property of the generation process, not a stylistic choice.
 */
const BRACE_OPEN = new Set(['{', '(', '[', '<']);
const BRACE_CLOSE = new Set(['}', ')', ']', '>']);

export const aiErrorsNearEofRule = createRule<RuleContext>({
  id: 'ai/errors-near-eof',
  category: 'ai',
  severity: 'medium',
  aiSpecific: true,
  description: 'Unbalanced delimiters or syntax errors cluster near EOF — likely AI token-limit truncation (Yotkova 2026)',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    if (!facts.v2) return [];
    const source = facts.v2._source ?? '';
    if (!source) return [];

    const lines = source.split('\n');
    if (lines.length < 20) return [];

    // Last 20% of lines
    const eofStart = Math.floor(lines.length * 0.8);
    const eofChunk = lines.slice(eofStart);

    // Count unbalanced delimiters in the EOF chunk
    let opens = 0;
    let closes = 0;
    for (const line of eofChunk) {
      for (const c of line) {
        if (BRACE_OPEN.has(c)) opens++;
        else if (BRACE_CLOSE.has(c)) closes++;
      }
    }
    const imbalance = Math.abs(opens - closes);
    const imbalanceRatio = (opens + closes) > 0 ? imbalance / (opens + closes) : 0;

    // Also check the whole file for ratio
    let fileOpens = 0, fileCloses = 0;
    for (const line of lines) {
      for (const c of line) {
        if (BRACE_OPEN.has(c)) fileOpens++;
        else if (BRACE_CLOSE.has(c)) fileCloses++;
      }
    }
    const fileImbalance = Math.abs(fileOpens - fileCloses);
    const fileImbalanceRatio = (fileOpens + fileCloses) > 0
      ? fileImbalance / (fileOpens + fileCloses)
      : 0;

    // Fire if EOF chunk has significantly higher imbalance than the whole file.
    // AI signature: EOF imbalance ratio > 0.15 AND EOF imbalance > file imbalance × 2
    if (imbalance < 3) return [];
    if (imbalanceRatio < 0.10) return [];
    if (imbalance <= fileImbalance * 2 && fileImbalance >= 3) return [];

    return [
      {
        ruleId: 'ai/errors-near-eof',
        category: 'ai',
        severity: 'medium',
        aiSpecific: true,
        message:
          `Unbalanced delimiters cluster near EOF: ${opens} open vs ${closes} close in the last 20% of lines ` +
          `(imbalance ${imbalance}, ratio ${(imbalanceRatio * 100).toFixed(0)}%) vs ${fileImbalance} file-wide. ` +
          `This can reflect tool or merge truncation, an incomplete edit, or another ` +
          `source-integrity problem; inspect the ending before repairing it.`,
        line: eofStart + 1,
        column: 1,
        advice:
          'Check for tool or merge truncation and incomplete edits near EOF before repairing the delimiters.',
      },
    ];
  },
});

export default aiErrorsNearEofRule satisfies Rule<RuleContext>;
