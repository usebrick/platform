/**
 * Rule: java/system-out-println
 *
 * `System.out.println(...)` used as a logger. Real Java code
 * uses SLF4J (the standard facade), Log4j2, or java.util.logging.
 * `System.out` has no log level, no timestamp, no correlation
 * ID, and cannot be filtered.
 *
 * **Why this matters:**
 * - `System.out` in production is a code smell. Real services
 *   need structured logging (severity, context, sampling).
 *   `System.out` provides none of that.
 * - The fix is one logger declaration: `private static final
 *   Logger log = LoggerFactory.getLogger(MyClass.class);`
 *   and replace `System.out.println(x)` with `log.info(x)`.
 * - Severity: low. Not a bug, but a code-smell that compounds.
 * - Default off (DORMANT) until v9 Java corpus calibration.
 *
 * **Note on the v0.20.0 predecessor:** A v0.20.0 rule with the
 * same id (`java/system-out-println`) was removed in v0.27.0 as
 * part of the AI-fingerprint drop. The v0.20.0 version was
 * `aiSpecific: true` and measured "AI uses System.out more than
 * humans" — that hypothesis failed (calibration showed the rule
 * fires 0.5-1.2x more on pre-2022 neg than post-2024 pos). The
 * v0.30.0 version is `aiSpecific: false` and measures "any
 * System.out in production is a smell" — a different rule with
 * different semantics. The id is reused; the entry in
 * signal-strength.json documents the version transition.
 *
 * **Scope:** file-local. Regex on the source text. We look for
 * `System.out.println(` anywhere. Excluded: test files
 * (`/src/test/`, `Test.java`), and files that already import
 * a real logging library.
 *
 * **v0.30.0: non-AI-fingerprint rule.** Mirrors the v0.29.0
 * `kotlin/println-as-log`.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface JavaSystemOutPrintlnContext {
  // No configuration.
}

const SYSTEM_OUT_REGEX = /\bSystem\.out\.println\s*\(/g;

// Real-logging-library imports. If we see one of these, the
// developer is using structured logging and any stray System.out
// calls are likely intentional (debug output, test code, etc.).
const REAL_LOGGING_IMPORT_REGEX = /\bimport\s+(?:org\.slf4j\.|org\.apache\.logging\.log4j|org\.apache\.log4j|java\.util\.logging|com\.google\.common\.logging|io\.github\.oshai\.kotlinlogging)/;

export const javaSystemOutPrintlnRule = createRule<JavaSystemOutPrintlnContext>({
  id: 'java/system-out-println',
  category: 'logic',
  severity: 'low',
  aiSpecific: false,
  description: 'System.out.println() used for logging — use SLF4J, Log4j2, or java.util.logging',
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
    if (REAL_LOGGING_IMPORT_REGEX.test(source)) return issues;

    let m: RegExpExecArray | null;
    SYSTEM_OUT_REGEX.lastIndex = 0;
    while ((m = SYSTEM_OUT_REGEX.exec(source)) !== null) {
      const line = source.slice(0, m.index).split('\n').length;
      issues.push({
        ruleId: 'java/system-out-println',
        category: 'logic',
        severity: 'low',
        aiSpecific: false,
        message: `System.out.println() at line ${line}`,
        line,
        column: 1,
        advice:
          'Use a real logging library: SLF4J (the standard facade), ' +
          'Log4j2, or java.util.logging. System.out has no log ' +
          'level, no timestamp, no correlation ID, and cannot be ' +
          'filtered. Migration: add `private static final Logger ' +
          'log = LoggerFactory.getLogger(MyClass.class);` and ' +
          'replace `System.out.println(x)` with `log.info(x)`. ' +
          'Reference: java/system-out-println v0.30.',
      });
    }
    return issues;
  },
});

export default javaSystemOutPrintlnRule satisfies Rule<JavaSystemOutPrintlnContext>;
