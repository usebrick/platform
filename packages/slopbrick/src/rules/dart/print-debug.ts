/**
 * Rule: dart/print-debug
 *
 * `print()` is a debug statement, not production logging. Flutter
 * apps in production shouldn't be writing to stdout (especially
 * on iOS where it goes to the system log). Real apps use a logging
 * package (logger, logging, etc.) or `debugPrint()`.
 *
 * **Why this matters:**
 * - `print()` blocks on iOS in release mode.
 * - Print statements in production reveal data shapes, debug
 *   values, and intermediate state to anyone who can read the
 *   device log.
 * - The fix is `debugPrint()` (which is no-op in release) or a
 *   proper logger.
 * - Severity: medium. Functional but anti-pattern.
 * - Default off (DORMANT) until v10.2 Dart corpus calibration.
 *
 * **v0.44.0: initial rule.**
 */

import type { Issue, Rule, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface DartPrintDebugContext {
  // No configuration.
}

const PRINT_CALL_REGEX = /\bprint\s*\(/g;
const DART_FILE_REGEX = /\.dart$/i;

export const dartPrintDebugRule: Rule<DartPrintDebugContext> = createRule<DartPrintDebugContext>({
  id: 'dart/print-debug',
  category: 'logic',
  severity: 'medium',
  description: 'print() is debug output; use debugPrint() or a logger in production.',
  aiSpecific: true,
  defaultOff: true,
  create(context: DartPrintDebugContext): DartPrintDebugContext {
    return context;
  },
  analyze(_context: DartPrintDebugContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    if (!DART_FILE_REGEX.test(facts.filePath ?? '')) return issues;
    const source = facts.v2?._source ?? '';
    if (!source) return issues;
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      if (line.trimStart().startsWith('//')) continue;
      if (line.trimStart().startsWith('*')) continue;
      PRINT_CALL_REGEX.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = PRINT_CALL_REGEX.exec(line)) !== null) {
        const col = (match.index ?? 0) + 1;
        issues.push({
          ruleId: 'dart/print-debug',
          category: 'logic',
          severity: 'medium',
          aiSpecific: true,
          filePath: facts.filePath,
          message: `print() at line ${i + 1} — use debugPrint() or a logger in production.`,
          line: i + 1,
          column: col,
        });
      }
    }
    return issues;
  },
});
