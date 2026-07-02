/**
 * Rule: java/legacy-date-api
 *
 * Use of `java.util.Date`, `java.util.Calendar`, or `java.sql.Date`
 * — the legacy date/time API that was superseded by `java.time`
 * (JSR-310) in Java 8 (March 2014). AI agents trained on older data
 * default to the legacy API.
 *
 * **Why this matters:**
 * - `java.util.Date` is mutable, not thread-safe, has confusing
 *   month indexing (0-based), and a poor API for arithmetic. It was
 *   replaced by `java.time.Instant`, `LocalDate`, `LocalDateTime`,
 *   `ZonedDateTime` in Java 8.
 * - The pattern is a strong AI signal. Real Java code on Java 8+
 *   uses `java.time` exclusively.
 * - Severity: low. Legacy Date still works; the rule flags it as a
 *   stylistic AI signal.
 * - Default off (DORMANT) until calibrated on v9 Java corpus.
 *
 * **Scope:** file-local. Regex on the source text. The rule flags
 * imports of legacy date classes and the legacy `new Date()` /
 * `Calendar.getInstance()` constructor calls.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface JavaLegacyDateApiContext {
  // No configuration.
}

// Import statements using legacy Date/Calendar.
const LEGACY_IMPORT_REGEX =
  /^import\s+(?:static\s+)?java\.(?:util|sql)\.(?:Date|Calendar|GregorianCalendar)\s*;/gm;

// Constructor / static call patterns.
const LEGACY_USAGE_REGEX = /\bnew\s+(?:Date|GregorianCalendar)\s*\(/g;
const CALENDAR_GET_INSTANCE_REGEX = /Calendar\.getInstance\s*\(/g;

export const javaLegacyDateApiRule = createRule<JavaLegacyDateApiContext>({
  id: 'java/legacy-date-api',
  category: 'typo',
  severity: 'low',
  aiSpecific: true,
  description: 'Legacy java.util.Date / Calendar — use java.time (JSR-310) from Java 8+',
  create(_context: RuleContext): JavaLegacyDateApiContext {
    return {};
  },
  analyze(_context: JavaLegacyDateApiContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // v0.21.2: only fire on Java files. The rule's
    // `LEGACY_USAGE_REGEX` is `\bnew\s+(?:Date|GregorianCalendar)\s*\(`
    // which also matches JavaScript's `new Date()` constructor
    // (Node/Browser Date). Without this gate, the rule fired 29 times
    // in src/ on TS files — every legitimate `new Date()` in a
    // TypeScript file is a false positive for a Java-only rule.
    if (!/\.java$/i.test(facts.filePath)) return issues;

    // Track which line numbers have already been flagged (a line with
    // both an import and a usage should emit one issue, not two).
    const flagged = new Set<number>();

    let m: RegExpExecArray | null;
    LEGACY_IMPORT_REGEX.lastIndex = 0;
    while ((m = LEGACY_IMPORT_REGEX.exec(source)) !== null) {
      const line = source.slice(0, m.index).split('\n').length;
      flagged.add(line);
      issues.push({
        ruleId: 'java/legacy-date-api',
        category: 'typo',
        severity: 'low',
        aiSpecific: true,
        message:
          `Legacy date import at line ${line} — use java.time (JSR-310) from Java 8+`,
        line,
        column: 1,
        advice:
          'Replace `java.util.Date` / `java.util.Calendar` with `java.time` ' +
          '(`LocalDate`, `LocalDateTime`, `Instant`, `ZonedDateTime`). ' +
          'java.time is immutable, thread-safe, and has a much better API. ' +
          'AI agents default to the legacy API because their training data ' +
          'predates Java 8 (2014). Reference: java/legacy-date-api v0.20.',
      });
    }
    LEGACY_USAGE_REGEX.lastIndex = 0;
    while ((m = LEGACY_USAGE_REGEX.exec(source)) !== null) {
      const line = source.slice(0, m.index).split('\n').length;
      if (flagged.has(line)) continue;
      issues.push({
        ruleId: 'java/legacy-date-api',
        category: 'typo',
        severity: 'low',
        aiSpecific: true,
        message:
          `new Date() / GregorianCalendar at line ${line} — use java.time`,
        line,
        column: 1,
        advice:
          'Replace with `LocalDate.now()`, `Instant.now()`, or `ZonedDateTime.now()`. ' +
          'Reference: java/legacy-date-api v0.20.',
      });
    }
    CALENDAR_GET_INSTANCE_REGEX.lastIndex = 0;
    while ((m = CALENDAR_GET_INSTANCE_REGEX.exec(source)) !== null) {
      const line = source.slice(0, m.index).split('\n').length;
      if (flagged.has(line)) continue;
      issues.push({
        ruleId: 'java/legacy-date-api',
        category: 'typo',
        severity: 'low',
        aiSpecific: true,
        message:
          `Calendar.getInstance() at line ${line} — use java.time`,
        line,
        column: 1,
        advice:
          'Replace with `LocalDate.now()` (date-only) or `ZonedDateTime.now()`. ' +
          'Reference: java/legacy-date-api v0.20.',
      });
    }
    return issues;
  },
});

export default javaLegacyDateApiRule satisfies Rule<JavaLegacyDateApiContext>;
