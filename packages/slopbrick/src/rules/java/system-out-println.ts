/**
 * Rule: java/system-out-println
 *
 * `System.out.println(...)` in a file that ALSO imports a real
 * logging library (SLF4J, Log4j2, java.util.logging). This is
 * the "set up the logger but didn't use it" anti-pattern — the
 * developer imported slf4j-api, declared a `Logger log = ...`,
 * and then went ahead and used `System.out.println` for some
 * calls anyway. Real production code should use the logger.
 *
 * **Why this matters:**
 * - `System.out` in production is a code smell. Real services
 *   need structured logging (severity, context, sampling).
 *   `System.out` provides none of that.
 * - The fix is replacing `System.out.println(x)` with
 *   `log.info(x)` (or `log.debug(x)`, `log.warn(x)`). The
 *   `log` object is already declared at the top of the file.
 * - Severity: low. Not a bug, but a code-smell that compounds.
 * - Default off (DORMANT) until v9 Java corpus calibration.
 *
 * **Note on the v0.20.0 predecessor:** A v0.20.0 rule with the
 * same id was removed in v0.27.0 as part of the AI-fingerprint
 * drop. The v0.20.0 version was `aiSpecific: true` and measured
 * "AI uses System.out more than humans" — that hypothesis failed.
 * The v0.30.0+ version is `aiSpecific: false` and measures a
 * real engineering defect: a file that imports a real logger
 * but also has System.out calls. v0.31.0 refines the rule to
 * fire ONLY when the file imports a real logger (instead of
 * skipping those files), which pushes precision from 29% to
 * 50%+ on the v9 Java corpus.
 *
 * **Scope:** file-local. Regex on the source text. We require
 * the file to import a real logger AND have at least one
 * `System.out.println(`. Excluded: test files.
 *
 * **v0.30.0: non-AI-fingerprint rule.** Mirrors the v0.29.0
 * `kotlin/println-as-log`. v0.31.0: refined to require slf4j/log4j
 * import — the "set up but didn't use" pattern.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface JavaSystemOutPrintlnContext {
  // No configuration.
}

const SYSTEM_OUT_REGEX = /\bSystem\.out\.println\s*\(/g;

// Real-logging-library imports. v0.31.0: requirement, not exclusion.
// We fire only when the file imports a real logger AND uses
// System.out — that's the "set up but didn't use" anti-pattern.
const REAL_LOGGING_IMPORT_REGEX = /\bimport\s+(?:org\.slf4j\.|org\.apache\.logging\.log4j|org\.apache\.log4j|java\.util\.logging|com\.google\.common\.logging)/;

export const javaSystemOutPrintlnRule = createRule<JavaSystemOutPrintlnContext>({
  id: 'java/system-out-println',
  category: 'logic',
  severity: 'low',
  aiSpecific: false,
  description: 'System.out.println() in a file that imports SLF4J/Log4j2 — use the declared logger instead',
  create(_context: RuleContext): JavaSystemOutPrintlnContext {
    return {};
  },
  analyze(_context: JavaSystemOutPrintlnContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // v0.30.0: Java-only rule.
    if (!/\.java$/i.test(facts.filePath)) return issues;

    // Skip test files.
    if (/\/test\//i.test(facts.filePath) || /\/src\/test\//i.test(facts.filePath)) return issues;

    // v0.31.0: REQUIRE real-logger import. Files without a real
    // logger are not anti-patterns — they might be CLI tools,
    // demo code, or main() that intentionally uses System.out.
    if (!REAL_LOGGING_IMPORT_REGEX.test(source)) return issues;

    let m: RegExpExecArray | null;
    SYSTEM_OUT_REGEX.lastIndex = 0;
    while ((m = SYSTEM_OUT_REGEX.exec(source)) !== null) {
      const line = source.slice(0, m.index).split('\n').length;
      issues.push({
        ruleId: 'java/system-out-println',
        category: 'logic',
        severity: 'low',
        aiSpecific: false,
        message: `System.out.println() at line ${line} (file imports a real logger)`,
        line,
        column: 1,
        advice:
          'The file imports a real logging library (SLF4J, Log4j2, ' +
          'or java.util.logging) but uses System.out.println here. ' +
          'Replace `System.out.println(x)` with `log.info(x)` (or ' +
          'log.debug/warn/error as appropriate). The log object is ' +
          'already declared at the top of the file. Reference: ' +
          'java/system-out-println v0.31 (refined from v0.30).',
      });
    }
    return issues;
  },
});

export default javaSystemOutPrintlnRule satisfies Rule<JavaSystemOutPrintlnContext>;
