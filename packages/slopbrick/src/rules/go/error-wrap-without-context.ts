/**
 * Rule: go/error-wrap-without-context
 *
 * `fmt.Errorf("...: %w", err)` where the format string lacks the
 * failing operation context. Real Go code includes the operation
 * name in the error message (e.g. `"opening config: %w"`), so
 * readers can see what failed without searching the call site.
 *
 * **Why this matters:**
 * - The Go community standard (per Dave Cheney, Rob Pike, and
 *   Go Code Review Comments) is to include the operation name in
 *   the error message. "real errors include their context".
 * - AI agents, when wrapping errors, often use a generic message
 *   like "failed: %w" or "error: %w" that doesn't tell the reader
 *   what failed.
 * - Severity: low. The rule is a heuristic — it looks for the
 *   absence of an action verb in the error message, not the
 *   presence of a bad one.
 * - Default off (DORMANT) until calibrated on v9 corpus.
 *
 * **Scope:** file-local. Regex on the source text. Heuristic.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface GoErrorWrapWithoutContextContext {
  // No configuration.
}

// Matches `fmt.Errorf("...: %w", ...)` and similar wraps.
// Capture group 1: the format string.
const ERR_WRAP_REGEX = /fmt\.Errorf\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*([^)]+)\)/g;

// Heuristic: a format string with context usually contains a verb
// + the %w verb. "verb + " " + %w" or "verb-ing " + %w".
// We flag strings that are < 10 chars and only contain "error" /
// "failed" / "wrapping" / generic words with %w.
const GENERIC_PREFIX_REGEX = /^\s*(?:error|err|failed|wrap(?:ping)?|invalid)\s*(?::\s*)?%w\b/i;

export const goErrorWrapWithoutContextRule = createRule<GoErrorWrapWithoutContextContext>({
  id: 'go/error-wrap-without-context',
  category: 'typo',
  severity: 'low',
  aiSpecific: true,
  description: 'fmt.Errorf wrap without operation context — AI defaults to generic "error: %w"',
  create(_context: RuleContext): GoErrorWrapWithoutContextContext {
    return {};
  },
  analyze(_context: GoErrorWrapWithoutContextContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;

    let match: RegExpExecArray | null;
    ERR_WRAP_REGEX.lastIndex = 0;
    while ((match = ERR_WRAP_REGEX.exec(source)) !== null) {
      const formatString = match[1] as string;
      // Only flag %w wraps (the error-wrapping form), not plain
      // formatted errors.
      if (!formatString.includes('%w')) continue;

      // Heuristic: the format string is "generic" if it starts
      // with a generic word and is < 30 chars.
      if (formatString.length >= 30) continue;
      if (!GENERIC_PREFIX_REGEX.test(formatString)) continue;

      const line = source.slice(0, match.index).split('\n').length;
      issues.push({
        ruleId: 'go/error-wrap-without-context',
        category: 'typo',
        severity: 'low',
        aiSpecific: true,
        message:
          `fmt.Errorf wrap with generic message "${formatString}" — include the failing operation`,
        line,
        column: match[0].indexOf('fmt') + 1,
        advice:
          'Real Go errors include the failing operation: ' +
          '`fmt.Errorf("opening config: %w", err)`. Generic messages ' +
          '("error: %w", "failed: %w") tell the reader nothing about ' +
          'what failed. Reference: go/error-wrap-without-context v0.19. ' +
          'See: https://github.com/golang/go/wiki/CodeReviewComments#error-strings',
      });
    }
    return issues;
  },
});

export default goErrorWrapWithoutContextRule satisfies Rule<GoErrorWrapWithoutContextContext>;
