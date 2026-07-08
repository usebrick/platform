/**
 * Rule: rb/sql-string-concat
 *
 * SQL query constructed via string interpolation or concat. Classic
 * SQL injection. Ruby's `"SELECT * FROM users WHERE id = " + id`
 * or `"...#{id}..."` builds a query string with user-controlled data.
 *
 * **Why this matters:**
 * - ActiveRecord is the idiomatic solution. `User.where(id: id)`
 *   generates a parameterized query. The Ruby style guide
 *   (rubocop/ruby-style-guide) explicitly recommends this.
 * - Sequel, ROM, and Sequel all have parameterized query APIs.
 * - Even sanitization (`User.find_by(name: user_input)`) is
 *   better than concatenation. AR-style `User.where(...)` uses
 *   prepared statements under the hood.
 * - Severity: high. SQL injection is OWASP A03:2021.
 * - Default off (DORMANT) until v10.2 Ruby corpus calibration.
 *
 * **Scope:** file-local. Regex on the source text. We look for
 * `SELECT/INSERT/UPDATE/DELETE` SQL keywords in string literals
 * followed by Ruby string interpolation `#{...}` or concat (`+`).
 *
 * **v0.43.0: initial rule.** Mirrors `java/sql-string-concat`
 * with Ruby syntax awareness.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface RbSqlStringConcatContext {
  // No configuration.
}

const SQL_KEYWORD_REGEX = /\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|DROP\s+TABLE|ALTER\s+TABLE)\b/i;
const SQL_INTERPOLATION = /["'][^"']*#\{[^}]+\}[^"']*["']/g;
const STRING_CONCAT = /["'][^"']*["']\s*\+\s*\w+\s*\+\s*["'][^"']*["']/g;

export const rbSqlStringConcatRule = createRule<RbSqlStringConcatContext>({
  id: 'rb/sql-string-concat',
  category: 'security',
  severity: 'high',
  aiSpecific: false,
  description: 'Ruby SQL string concat or interpolation — use ActiveRecord / Sequel parameterized queries',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    if (!/\.rb$/i.test(facts.filePath ?? '')) return issues;

    // Find interpolated SQL strings
    let m: RegExpExecArray | null;
    const reInterp = new RegExp(SQL_INTERPOLATION.source, 'g');
    while ((m = reInterp.exec(source)) !== null) {
      if (SQL_KEYWORD_REGEX.test(m[0])) {
        const line = 1 + (source.substring(0, m.index).match(/\n/g)?.length ?? 0);
        issues.push({
          ruleId: 'rb/sql-string-concat',
          category: 'security',
          severity: 'high',
          aiSpecific: false,
          filePath: facts.filePath ?? '',
          line,
          column: 1,
          message: `Ruby SQL string interpolation: \`${m[0].slice(0, 80)}...\`. User input flows into query string.`,
          advice: 'Use ActiveRecord: `User.where(id: params[:id])` or Sequel: `User.where(id: $id)`. Never interpolate user input into a SQL string.',
        });
      }
    }

    // Find concat SQL strings
    const reConcat = new RegExp(STRING_CONCAT.source, 'g');
    while ((m = reConcat.exec(source)) !== null) {
      if (SQL_KEYWORD_REGEX.test(m[0])) {
        const line = 1 + (source.substring(0, m.index).match(/\n/g)?.length ?? 0);
        issues.push({
          ruleId: 'rb/sql-string-concat',
          category: 'security',
          severity: 'high',
          aiSpecific: false,
          filePath: facts.filePath ?? '',
          line,
          column: 1,
          message: `Ruby SQL string concat: \`${m[0].slice(0, 80)}...\`. User input flows into query string.`,
          advice: 'Use ActiveRecord: `User.where(id: params[:id])`. String concat in SQL queries is the canonical injection vector.',
        });
      }
    }

    return issues;
  },
});
