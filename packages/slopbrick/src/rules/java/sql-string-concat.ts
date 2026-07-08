/**
 * Rule: java/sql-string-concat
 *
 * SQL query constructed via string concatenation. Classic SQL
 * injection — user-controlled data flows into the query string
 * and can break out of the literal.
 *
 * **Why this matters:**
 * - Direct SQL injection vulnerability. Even "trusted" inputs
 *   (signed JWT, internal config) can be influenced by an
 *   attacker.
 * - The fix is a `PreparedStatement` (JDBC), `setParameter`
 *   (jOOQ), or an ORM (Hibernate, MyBatis with `#{}` binding).
 * - Severity: high. SQL injection is OWASP A03:2021.
 * - Default off (DORMANT) until v10 Java corpus calibration.
 * The v10 corpus (576,750 files) is the source; the rule is
 * DORMANT because the v9 calibration on a smaller Java slice
 * showed borderline FPR.
 *
 * **Scope:** file-local. Regex on the source text. We look for
 * SQL keywords (SELECT/INSERT/UPDATE/DELETE/CREATE/DROP) at the
 * start of a string literal, followed by string concat (`+`) on
 * the same line. A `PreparedStatement` or `setParameter` call on
 * the same line is excluded.
 *
 * **v0.30.0: non-AI-fingerprint rule.** Per the v0.27.0 methodology
 * paper's Option C, v0.30.0+ pivots to non-AI rules. This rule
 * measures a real engineering defect, not AI authorship. Mirrors
 * the v0.29.0 `kotlin/sql-string-concat` (different file path,
 * different rule id).
 *
 * **v0.34.9: require SQL keyword to start a string literal.**
 * Same refinement as v0.34.8 (kotlin/sql-string-concat). The
 * v0.30.0 calibration found 115 TP / 1549 FP — the rule fired
 * on lines where SELECT/INSERT appeared in string values (e.g.
 * `String msg = "Selected 1 row: " + count`). v0.34.9 requires
 * the SQL keyword to be the start of a string literal (preceded
 * by `"` or `'` or `="` or `= "` with optional whitespace).
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface JavaSqlStringConcatContext {
  // No configuration.
}

const SQL_KEYWORD_REGEX = /\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|DROP\s+TABLE|ALTER\s+TABLE)\b/i;

// String concatenation: `+` operator. In Java this is the only
// way to build strings (no Kotlin-style templates).
const UNSAFE_REGEX = /\+/;

// Exclusion: prepared statement / parameterized query indicators.
// v0.34.9 fix: the `\?\\s*,` is overly broad; simplified to just
// `\\?` to match Java's `?` placeholder.
const SAFE_REGEX = /(?:PreparedStatement|setParameter|setString|setInt|setLong|createQuery.*:.*\b(?:set|bind)|:name\b|\?)/;

export const javaSqlStringConcatRule = createRule<JavaSqlStringConcatContext>({
  id: 'java/sql-string-concat',
  category: 'security',
  severity: 'high',
  aiSpecific: false,
  description: 'SQL query built via string concat — use PreparedStatement or setParameter()',
  create(_context: RuleContext): JavaSqlStringConcatContext {
    return {};
  },
  analyze(_context: JavaSqlStringConcatContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // v0.30.0: Java-only rule.
    if (!/\.java$/i.test(facts.filePath)) return issues;

    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      // v0.34.9: require SQL keyword to be the start of a string
      // literal. Find the keyword's position, walk backwards
      // through whitespace, and check the previous char is `"`,
      // `'`, or `=` (assignment to a string variable).
      const keywordMatch = SQL_KEYWORD_REGEX.exec(line);
      if (!keywordMatch) continue;
      const keywordIdx = keywordMatch.index;
      let j = keywordIdx - 1;
      while (j >= 0 && /\s/.test(line[j]!)) j--;
      if (j < 0) continue;
      const prevChar = line[j]!;
      if (prevChar !== '"' && prevChar !== "'" && prevChar !== '=') continue;

      if (!UNSAFE_REGEX.test(line)) continue;
      if (SAFE_REGEX.test(line)) continue;

      issues.push({
        ruleId: 'java/sql-string-concat',
        category: 'security',
        severity: 'high',
        aiSpecific: false,
        message: `SQL query built via string concat at line ${i + 1}`,
        line: i + 1,
        column: 1,
        advice:
          'Use a PreparedStatement (JDBC), setParameter (jOOQ), ' +
          'or an ORM (Hibernate, MyBatis with #{} binding). String ' +
          'concatenation into a SQL query is the canonical SQL-injection ' +
          'pattern — even "trusted" inputs (signed JWT, internal config) ' +
          'can be influenced by an attacker. Reference: ' +
          'java/sql-string-concat v0.34.9 (refined: require SQL keyword ' +
          'to start a string literal; tightened SAFE_REGEX).',
      });
    }
    return issues;
  },
});

export default javaSqlStringConcatRule satisfies Rule<JavaSqlStringConcatContext>;
