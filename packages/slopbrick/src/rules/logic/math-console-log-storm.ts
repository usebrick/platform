import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { matchAll } from '../utils';

/**
 * Math rule: console.log storm — clustering of logs in a single useEffect.
 *
 * AI agents debug by sprinkling console.log statements throughout a useEffect
 * body. Real human code uses one or two strategic console.logs per file (or
 * uses a proper logger). Detecting ≥5 logs within a single ~30-line window
 * is a strong AI signal.
 */
const WINDOW_SIZE = 30;
const STORM_THRESHOLD = 5;
const CONSOLE_LOG_RE = /\bconsole\.log\s*\(/g;

export const mathConsoleLogStormRule = createRule<RuleContext>({
  id: 'logic/math-console-log-storm',
  category: 'logic',
  severity: 'high',
  aiSpecific: true,
  description: '≥5 console.logs clustered in a single window — AI debug-spraying pattern',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];

    if (facts.v2) {
      const source = facts.v2._source ?? '';
      const lines: number[] = [];
      const columns: number[] = [];
      let m: RegExpExecArray | null;
      for (const m of matchAll(CONSOLE_LOG_RE, source)) {
        const before = source.slice(0, m.index);
        const line = before.split('\n').length;
        lines.push(line);
        columns.push(m.index - before.lastIndexOf('\n'));
      }
      lines.sort((a, b) => a - b);

      if (lines.length < STORM_THRESHOLD) return issues;

      let maxCount = 0;
      let maxEndLine = 0;
      let i = 0;
      for (let j = 0; j < lines.length; j++) {
        while (lines[j]! - lines[i]! > WINDOW_SIZE) i++;
        const count = j - i + 1;
        if (count > maxCount) {
          maxCount = count;
          maxEndLine = lines[j]!;
        }
      }

      if (maxCount < STORM_THRESHOLD) return issues;

      const firstIdx = lines.findIndex((l) => l <= maxEndLine);
      issues.push({
        ruleId: 'logic/math-console-log-storm',
        category: 'logic',
        severity: 'high',
        aiSpecific: true,
        message:
          `${maxCount} console.log calls clustered in a ${WINDOW_SIZE}-line window ending at line ${maxEndLine}. ` +
          `AI debug-sprays logs in a single function; humans use one strategic log.`,
        line: firstIdx >= 0 ? lines[firstIdx]! : 1,
        column: firstIdx >= 0 ? columns[firstIdx]! : 1,
        advice:
          'Replace debug logs with a proper debugger or logger.debug() — remove all console.log before shipping.',
      });
      return issues;
    }

    return issues;
  },
});

export default mathConsoleLogStormRule satisfies Rule<RuleContext>;