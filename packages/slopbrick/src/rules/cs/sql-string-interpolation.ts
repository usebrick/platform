/**
 * Rule: cs/sql-string-interpolation
 *
 * C# interpolated string ($-prefixed) flowing into a SQL query.
 * Same risk as Java's string concat SQL injection.
 *
 * **Why this matters:**
 * - `$"SELECT * FROM users WHERE id = {userId}"` looks like
 *   interpolation but is string concatenation at runtime.
 * - The fix is parameterized queries via `FromSqlInterpolated?`
 *   (EF Core), `SqlCommand.Parameters`, or Dapper's anonymous
 *   parameter object.
 * - Per the Microsoft C# coding conventions: "Avoid string
 *   concatenation for SQL queries. Use parameterized queries."
 * - Severity: high. SQL injection is OWASP A03:2021.
 * - Default off (DORMANT) until v10.2 C# corpus calibration.
 *
 * **Scope:** file-local. Regex on the source text. We look for
 * `$"..."` strings containing SQL keywords with `{...}` interpolation.
 *
 * **v0.43.0: initial rule.** Mirrors `java/sql-string-concat`
 * with C# interpolated-string awareness.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface CsSqlStringInterpolationContext {
  // No configuration.
}

const SQL_KEYWORD_REGEX = /\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|DROP\s+TABLE|ALTER\s+TABLE)\b/i;
const INTERPOLATED_SQL_REGEX = /\$\s*"[^"]*(?:SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)[^"]*\{[^}]+\}[^"]*"/i;
const PARAMETERIZED_SAFE_REGEX = /\b(?:Parameters\.Add|FromSqlInterpolated?|WithParameters|new\s+SqlParameter)\b/;

export const csSqlStringInterpolationRule = createRule<CsSqlStringInterpolationContext>({
  id: 'cs/sql-string-interpolation',
  category: 'security',
  severity: 'high',
  aiSpecific: false,
  description: 'C# interpolated string in SQL query — use FromSqlInterpolated? or SqlCommand.Parameters',
  create(context) {
    return context;
  },
  analyze(_context, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    if (!/\.cs$/i.test(facts.filePath ?? '')) return issues;

    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i] ?? '';
      const re = new RegExp(INTERPOLATED_SQL_REGEX.source, 'i');
      const m = re.exec(lineText);
      if (m && SQL_KEYWORD_REGEX.test(lineText) && !PARAMETERIZED_SAFE_REGEX.test(lineText)) {
        issues.push({
          ruleId: 'cs/sql-string-interpolation',
          category: 'security',
          severity: 'high',
          aiSpecific: false,
          filePath: facts.filePath ?? '',
          line: i + 1,
          column: 1,
          message: `C# interpolated SQL: \`${m[0].slice(0, 80)}...\`. User input flows into query string.`,
          advice: 'Use parameterized queries: `FromSqlInterpoled($"SELECT * FROM users WHERE id = {0}", userId)` (EF Core), or `SqlCommand.Parameters.Add("@id", SqlDbType.Int).Value = userId`.',
        });
      }
    }

    return issues;
  },
});
