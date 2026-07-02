/**
 * Rule: java/system-out-println
 *
 * `System.out.println(...)` used in non-test source files. AI agents
 * default to println for "debug logging" because their training data
 * has countless textbook Java examples that use it. Real Java code
 * uses a logger (SLF4J, Log4j, java.util.logging) for any non-trivial
 * output.
 *
 * **Why this matters:**
 * - `System.out.println` is unconfigurable, unsynchronized, and
 *   unleveled. It goes to stdout, not stderr (in most setups), so it
 *   cannot be redirected per-package.
 * - The pattern correlates with the v0.18.9 calibration's
 *   `ai/comment-ratio` (P 67.2%, FPR 0.37%) and
 *   `ai/console-debug-storm` (P 90.0%) — both AI-fingerprint rules.
 * - Severity: low. println is technically correct; the rule flags it
 *   as a stylistic signal of AI or junior code.
 * - Default off (DORMANT) until calibrated on v9 Java corpus.
 *
 * **Scope:** file-local. Regex on the source text. We don't try to
 * detect "inside main" because that requires AST. A real Java
 * codebase might have 1-2 println calls in main, but 10+ is a
 * signal.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface JavaSystemOutPrintlnContext {
  /** Max number of println calls before the rule fires. Default: 1. */
  threshold: number;
}

const PRINTLN_REGEX = /System\.out\.println\s*\(/g;
const DEFAULT_THRESHOLD = 1;

export const javaSystemOutPrintlnRule = createRule<JavaSystemOutPrintlnContext>({
  id: 'java/system-out-println',
  category: 'typo',
  severity: 'low',
  aiSpecific: true,
  description: 'System.out.println in production code — use a logger (SLF4J, Log4j, etc.)',
  create(_context: RuleContext): JavaSystemOutPrintlnContext {
    return { threshold: DEFAULT_THRESHOLD };
  },
  analyze(context: JavaSystemOutPrintlnContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // v0.21.2: Java-only rule. `System.out.println` is the
    // canonical Java print statement; gating by extension
    // prevents false positives on TS files that happen to
    // have `System.out.println` in a comment or a string.
    if (!/\.java$/i.test(facts.filePath)) return issues;

    // Count `System.out.println` calls.
    const matches: number[] = [];
    let m: RegExpExecArray | null;
    PRINTLN_REGEX.lastIndex = 0;
    while ((m = PRINTLN_REGEX.exec(source)) !== null) {
      matches.push(m.index);
    }
    if (matches.length <= context.threshold) return issues;

    // Emit one issue per occurrence (capped at 10 to avoid spam).
    const cap = Math.min(matches.length, 10);
    for (let i = 0; i < cap; i++) {
      const idx = matches[i];
      const line = source.slice(0, idx).split('\n').length;
      issues.push({
        ruleId: 'java/system-out-println',
        category: 'typo',
        severity: 'low',
        aiSpecific: true,
        message:
          `System.out.println at line ${line} — use a logger for production output`,
        line,
        column: 1,
        advice:
          'Replace with `private static final Logger log = LoggerFactory.getLogger(...);` ' +
          'then `log.info(...)`. AI agents default to println because their training ' +
          'data has countless textbook examples. Real Java code uses a logger. ' +
          'Reference: java/system-out-println v0.20.',
      });
    }
    return issues;
  },
});

export default javaSystemOutPrintlnRule satisfies Rule<JavaSystemOutPrintlnContext>;
