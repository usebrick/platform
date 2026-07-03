/**
 * Rule: kotlin/sql-string-concat
 *
 * SQL query constructed via string concatenation or Kotlin string
 * templates (`"...$var..."`). This is the classic SQL-injection
 * pattern — user-controlled data flows into the query string and
 * can break out of the literal.
 *
 * **Why this matters:**
 * - Direct SQL injection vulnerability. Even when the input is
 *   "trusted" (internal config, signed JWT, etc.), concatenation
 *   breaks the contract and an attacker who finds a way to
 *   influence the input gets arbitrary SQL execution.
 * - The idiomatic Kotlin fix is a parameterized query: use
 *   `PreparedStatement` (JDBC), `setParameter()` (Exposed), or an
 *   ORM (`Room`, `jOOQ`). String templates into SQL are never safe.
 * - Severity: high. SQL injection is in the OWASP Top 10.
 * - Default on. This rule gates the SQL-injection category.
 *
 * **Scope:** file-local. Regex on the source text. We look for
 * SQL keywords (SELECT/INSERT/UPDATE/DELETE/CREATE/DROP) followed
 * within the same line by either string concatenation (`+`) or
 * a Kotlin template expression (`${...}`). A `PreparedStatement`
 * or `setParameter` call on the same line is excluded.
 *
 * **v0.29.0: non-AI-fingerprint rule.** This rule measures a real
 * engineering defect, not AI authorship. Per the v0.27.0
 * methodology paper's Option C, v0.29.0+ pivots to non-AI rules.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface KotlinSqlStringConcatContext {
  // No configuration.
}

// SQL keyword at the start of a query. We use \b to avoid matching
// substrings like `selectedItem` (camelCase). The keyword is
// case-insensitive because SQL keywords are commonly uppercased
// in queries but Kotlin string literals preserve the case the
// developer typed.
const SQL_KEYWORD_REGEX = /\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|DROP\s+TABLE|ALTER\s+TABLE)\b/i;

// Either `+` (string concatenation) or `${` (Kotlin string template).
// We don't try to validate that the concat/template is on the
// input — any of them is suspicious in a SQL context.
const UNSAFE_REGEX = /(?:\+|\$\{)/;

// Exclusion: prepared statement / parameterized query indicators.
// If we see any of these on the same line as the SQL keyword, the
// query is safe (or the developer intends it to be safe).
const SAFE_REGEX = /(?:PreparedStatement|setParameter|setString|setInt|setLong|bind|:name|:\\?\\?|\?\\s*,)/;

export const kotlinSqlStringConcatRule = createRule<KotlinSqlStringConcatContext>({
  id: 'kotlin/sql-string-concat',
  category: 'security',
  severity: 'high',
  aiSpecific: false,
  description: 'SQL query built via string concat / template — use PreparedStatement or setParameter()',
  create(_context: RuleContext): KotlinSqlStringConcatContext {
    return {};
  },
  analyze(_context: KotlinSqlStringConcatContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // v0.29.0: Kotlin-only rule.
    if (!/\.kts?$/i.test(facts.filePath)) return issues;

    // Walk the source line-by-line. A "candidate" is a line that
    // has BOTH a SQL keyword AND a concat/template. We then check
    // the same line for the safe-exclusion regex.
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (!SQL_KEYWORD_REGEX.test(line)) continue;
      if (!UNSAFE_REGEX.test(line)) continue;
      if (SAFE_REGEX.test(line)) continue;

      issues.push({
        ruleId: 'kotlin/sql-string-concat',
        category: 'security',
        severity: 'high',
        aiSpecific: false,
        message: `SQL query built via string concat/template at line ${i + 1}`,
        line: i + 1,
        column: 1,
        advice:
          'Use a PreparedStatement (JDBC), setParameter() (Exposed), ' +
          'or an ORM (Room, jOOQ). String concatenation or template ' +
          'interpolation into a SQL query is the canonical SQL-injection ' +
          'pattern — even "trusted" inputs (signed JWT, internal config) ' +
          'can be influenced by an attacker. Reference: ' +
          'kotlin/sql-string-concat v0.29 (OWASP A03:2021).',
      });
    }
    return issues;
  },
});

export default kotlinSqlStringConcatRule satisfies Rule<KotlinSqlStringConcatContext>;
