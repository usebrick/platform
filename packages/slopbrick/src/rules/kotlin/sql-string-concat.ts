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
 * SQL keywords (SELECT/INSERT/UPDATE/DELETE/CREATE/DROP) at the
 * start of a string literal, followed within the same line by
 * either string concatenation (`+`) or a Kotlin template
 * expression (`${...}`). A `PreparedStatement` or `setParameter`
 * call on the same line is excluded.
 *
 * **v0.29.0: non-AI-fingerprint rule.** This rule measures a real
 * engineering defect, not AI authorship. Per the v0.27.0
 * methodology paper's Option C, v0.29.0+ pivots to non-AI rules.
 *
 * **v0.34.8: require SQL keyword to start a string literal.** The
 * v0.33.0 calibration found 17 FPs for 1 TP — the rule fired on
 * lines where SELECT/INSERT appeared in string values (e.g.
 * `val msg = "Selected 1 row: $count" + count`). v0.34.8 requires
 * the SQL keyword to be the start of a string literal (preceded
 * by `"` or `'` or `="` or `= "`), which is the actual SQL query
 * pattern. Also fixed a bug in the SAFE_REGEX (the `:??` pattern
 * was malformed — should be `:?`).
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface KotlinSqlStringConcatContext {
  // No configuration.
}

// SQL keyword at the start of a string literal. The v0.34.8
// refinement requires the keyword to be the start of a string
// literal (i.e., preceded by `"` or `'` or `="` or `= "` with
// optional whitespace). The `\b` avoids matching substrings like
// `selectedItem`. The keyword is case-insensitive because SQL
// keywords are commonly uppercased in queries but Kotlin string
// literals preserve the case the developer typed.
//
// Note: JS regex doesn't support lookbehind in all engines, so we
// use a capture group + post-check instead.
const SQL_KEYWORD_REGEX = /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|DROP\s+TABLE|ALTER\s+TABLE)\b/i;

// Either `+` (string concatenation) or `${` (Kotlin string template).
const UNSAFE_REGEX = /(?:\+|\$\{)/;

// Exclusion: prepared statement / parameterized query indicators.
// v0.34.8 fix: the `:??` was a bug (it should be `:?` for named
// parameters). Now matches `:?` (Java/Kotlin named parameter).
const SAFE_REGEX = /(?:PreparedStatement|setParameter|setString|setInt|setLong|bind|:name|:\?|\?)/;

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
    // has BOTH a SQL keyword AND a concat/template. v0.34.8 also
    // requires the SQL keyword to be the start of a string literal
    // (preceded by `"` or `'` or `="` or `= "` with optional
    // whitespace). Then check the same line for the safe-exclusion
    // regex.
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      // v0.34.8: find the SQL keyword's position. The character
      // before the keyword (after skipping leading whitespace)
      // should be a quote or `=` (assignment). This filters out
      // lines where the SQL keyword is a string value (e.g.
      // `val msg = "Selected 1 row"`).
      const keywordMatch = SQL_KEYWORD_REGEX.exec(line);
      if (!keywordMatch) continue;
      const keywordIdx = keywordMatch.index;
      // Look backwards from the keyword for the start of the
      // string literal. We check if the character immediately
      // before the keyword (ignoring whitespace) is `"` or `'`
      // (start of string literal) or `=` (assignment to a string
      // variable, e.g., `val q = "SELECT ..."`).
      let j = keywordIdx - 1;
      while (j >= 0 && /\s/.test(line[j]!)) j--;
      if (j < 0) continue;
      const prevChar = line[j]!;
      if (prevChar !== '"' && prevChar !== "'" && prevChar !== '=') continue;

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
          'kotlin/sql-string-concat v0.34.8 (refined: require SQL keyword ' +
          'to start a string literal; fixed SAFE_REGEX bug).',
      });
    }
    return issues;
  },
});

export default kotlinSqlStringConcatRule satisfies Rule<KotlinSqlStringConcatContext>;
