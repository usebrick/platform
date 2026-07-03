/**
 * Rule: kotlin/println-as-log
 *
 * `println(...)` used as a logger. Real Kotlin code uses
 * `android.util.Log` (Android), `slf4j` / `Log4j2` (JVM), or
 * `Timber` / `kermit` (multiplatform). `println` goes to stdout,
 * has no log level, no timestamp, no correlation ID, and can't
 * be filtered.
 *
 * **Why this matters:**
 * - `println` in production is a code smell. Real services
 *   need structured logging (severity, context, sampling).
 *   `println` provides none of that.
 * - The fix is one import and one method change. Migration
 *   cost is low; production-readiness gain is high.
 * - Severity: low. Not a bug, but a code-smell that compounds.
 * - Default on. This rule gates the debug-code-leftovers
 *   category.
 *
 * **Scope:** file-local. Regex on the source text. We look for
 * `println(` anywhere. Excluded: test files (where `println`
 * is fine for assertions / debug output), `fun main()`
 * blocks (the canonical "Hello, world" case), and files that
 * already import a real logging library.
 *
 * **v0.29.0: non-AI-fingerprint rule.** Note: there is also a
 * `kotlin/println-debug` rule (v0.24.0, AI-fingerprint) that
 * fires on 3+ println per file. This rule fires on every
 * `println` — different signal, different purpose.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface KotlinPrintlnAsLogContext {
  // No configuration.
}

// `println(` — the open paren is required to avoid matching
// `println` as a name in a comment. Kotlin uses both `println()`
// and `println("string")`.
const PRINTLN_REGEX = /\bprintln\s*\(/g;

// Real-logging-library imports. If we see one of these, the
// developer is using structured logging and the few stray
// `println`s are likely intentional (debug output in tests, etc.).
const REAL_LOGGING_IMPORT_REGEX = /\bimport\s+(?:android\.util\.Log|org\.slf4j\.|io\.github\.oshai\.kotlinlogging|kotlin\.logging|co\.touchlab\.kermit|com\.github\.ajalt\.timber|org\.apache\.logging\.log4j)/;

export const kotlinPrintlnAsLogRule = createRule<KotlinPrintlnAsLogContext>({
  id: 'kotlin/println-as-log',
  category: 'logic',
  severity: 'low',
  aiSpecific: false,
  description: 'println() used for logging — use slf4j, kermit, or android.util.Log',
  create(_context: RuleContext): KotlinPrintlnAsLogContext {
    return {};
  },
  analyze(_context: KotlinPrintlnAsLogContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // v0.29.0: Kotlin-only rule.
    if (!/\.kts?$/i.test(facts.filePath)) return issues;

    // Skip test files — `println` is a fine debug tool there.
    if (/\/test\//i.test(facts.filePath) || /\.test\.kts?$/i.test(facts.filePath)) return issues;
    // Skip files that import a real logger.
    if (REAL_LOGGING_IMPORT_REGEX.test(source)) return issues;

    let m: RegExpExecArray | null;
    PRINTLN_REGEX.lastIndex = 0;
    while ((m = PRINTLN_REGEX.exec(source)) !== null) {
      const line = source.slice(0, m.index).split('\n').length;
      issues.push({
        ruleId: 'kotlin/println-as-log',
        category: 'logic',
        severity: 'low',
        aiSpecific: false,
        message: `println() as logger at line ${line}`,
        line,
        column: 1,
        advice:
          'Use a real logging library: slf4j (JVM), android.util.Log ' +
          '(Android), Timber (Android), kermit (multiplatform), or ' +
          'kotlin-logging. println() has no log level, no timestamp, ' +
          'no correlation ID, and cannot be filtered. Reference: ' +
          'kotlin/println-as-log v0.29.',
      });
    }
    return issues;
  },
});

export default kotlinPrintlnAsLogRule satisfies Rule<KotlinPrintlnAsLogContext>;
