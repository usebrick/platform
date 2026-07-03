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
 * - Default off (DORMANT) until v9 Java corpus calibration.
 *
 * **Scope:** file-local. Regex on the source text. We look for
 * SQL keywords (SELECT/INSERT/UPDATE/DELETE/CREATE/DROP) followed
 * by string concat (`+`) on the same line. A `PreparedStatement`
 * or `setParameter` call on the same line is excluded.
 *
 * **v0.30.0: non-AI-fingerprint rule.** Per the v0.27.0 methodology
 * paper's Option C, v0.30.0+ pivots to non-AI rules. This rule
 * measures a real engineering defect, not AI authorship. Mirrors
 * the v0.29.0 `kotlin/sql-string-concat` (different file path,
 * different rule id).
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
// If we see any of these on the same line as the SQL keyword, the
// query is safe (or the developer intends it to be safe).
const SAFE_REGEX = /(?:PreparedStatement|setParameter|setString|setInt|setLong|createQuery.*:.*\b(?:set|bind)|:name\b|\?\s*,)/;

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
      if (!SQL_KEYWORD_REGEX.test(line)) continue;
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
          'java/sql-string-concat v0.30 (OWASP A03:2021).',
      });
    }
    return issues;
  },
});

export default javaSqlStringConcatRule satisfies Rule<JavaSqlStringConcatContext>;
