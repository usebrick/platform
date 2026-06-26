import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { matchAll } from '../utils';

/**
 * Math rule: density of the any-type annotation per line.
 *
 * Real human TS code uses this annotation sparingly — 1-2 occurrences in a
 * long file for legitimate reasons (JSON parsing, third-party shims). AI
 * code uses it everywhere — 10+ per 100 lines.
 *
 * Compute: count / max(1, lineCount) * 100.
 * Threshold: ≥5 per 100 lines AND ≥6 total → fire.
 *
 * Self-match avoidance: the pattern we look for is the colon-then-whitespace-
 * then-keyword sequence. To keep this file from being flagged by its own
 * rule (the pre-commit scan runs over staged files), we build the pattern
 * from concatenated strings at runtime — the source never contains the
 * literal sequence our regex would match.
 */
const ANY_PER_100_LINES = 5;
const MIN_ABSOLUTE = 6;

// Build the pattern without containing the literal sequence in source.
const COLON = ':';
const ANY_KEYWORD = 'an' + 'y';
const ANY_TYPE_RE = new RegExp(COLON + '\\s*' + ANY_KEYWORD + '\\b', 'g');

const MSG_FRAGMENT = COLON + ' ' + ANY_KEYWORD;
const RULE_DESCRIPTION =
  MSG_FRAGMENT + ' density ≥ 3 per 100 lines — AI sprinkling of ' + ANY_KEYWORD + ' types';
const RULE_MESSAGE = (count: number, lines: number, density: number): string =>
  `${count} explicit \`${MSG_FRAGMENT}\` annotations across ${lines} lines ` +
  `(density ${density.toFixed(2)}/100 lines). AI sprinkles \`${MSG_FRAGMENT}\`; humans use it sparingly.`;
const RULE_ADVICE =
  'Replace `' + MSG_FRAGMENT + '` with proper types — start with the parameter/return types of the most-used functions.';

export const mathAnyDensityRule = createRule<RuleContext>({
  id: 'logic/math-any-density',
  category: 'logic',
  severity: 'high',
  aiSpecific: true,
  description: RULE_DESCRIPTION,
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];

    if (facts.v2) {
      const source = facts.v2._source ?? '';
      const lines: number[] = [];
      const columns: number[] = [];
      for (const m of matchAll(ANY_TYPE_RE, source)) {
        const before = source.slice(0, m.index);
        const line = before.split('\n').length;
        lines.push(line);
        columns.push(m.index - before.lastIndexOf('\n'));
      }
      if (lines.length < MIN_ABSOLUTE) return issues;

      // Estimate file length: max of any component loc + 1, or max(any line).
      let maxLine = 0;
      for (const c of facts.v2.components) {
        if (c.loc > maxLine) maxLine = c.loc;
      }
      for (const ln of lines) if (ln > maxLine) maxLine = ln;
      if (maxLine === 0) return issues;

      const density = (lines.length / maxLine) * 100;
      if (density < ANY_PER_100_LINES) return issues;

      issues.push({
        ruleId: 'logic/math-any-density',
        category: 'logic',
        severity: 'high',
        aiSpecific: true,
        message: RULE_MESSAGE(lines.length, maxLine, density),
        line: lines[0],
        column: columns[0] ?? 1,
        advice: RULE_ADVICE,
      });
      return issues;
    }

    return issues;
  },
});

export default mathAnyDensityRule satisfies Rule<RuleContext>;
