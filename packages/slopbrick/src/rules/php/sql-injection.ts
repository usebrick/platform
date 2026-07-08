/**
 * Rule: php/sql-injection
 *
 * PHP SQL query built via string interpolation or concatenation.
 * Classic SQL injection when user input is involved.
 *
 * **Why this matters:**
 * - `$sql = "SELECT * FROM users WHERE id = " . $_GET['id'];` is
 *   the canonical PHP SQL injection pattern.
 * - PHP's idiomatic fix is PDO prepared statements:
 *   `$stmt = $pdo->prepare("SELECT * FROM users WHERE id = ?");`
 *   `$stmt->execute([$_GET['id']]);`
 * - Per the PHP-FIG PSR-12 style guide and the OWASP Top 10,
 *   parameterized queries are the only safe pattern.
 * - PHP also has the deprecated `mysql_*` functions (PHP 5 era)
 *   and the modern `mysqli` (which still has the same risk if
 *   used without prepared statements).
 * - Severity: high. SQL injection is OWASP A03:2021.
 * - Default off (DORMANT) until v10.2 PHP corpus calibration.
 *
 * **Scope:** file-local. Regex on the source text. We look for
 * SQL keywords inside double-quoted strings with variable
 * interpolation (`$var` or `${expr}`).
 *
 * **v0.43.0: initial rule.** Mirrors `java/sql-string-concat` and
 * `kt/string-template-injection` with PHP-aware syntax.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface PhpSqlInjectionContext {
  // No configuration.
}

const PHP_SQL_KEYWORD_REGEX = /\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|DROP\s+TABLE|ALTER\s+TABLE)\b/i;
const PHP_INTERPOLATED_SQL = /["'][^"']*["']\s*\.\s*\$[a-zA-Z_]\w*|["'][^"']*\$\{[^}]+\}[^"']*["']/g;
const PHP_PREPARED_SAFE = /\b(?:prepare\s*\(|->prepare\s*\(|bindParam\s*\(|bindValue\s*\(|real_escape_string)\b/i;

export const phpSqlInjectionRule = createRule<PhpSqlInjectionContext>({
  id: 'php/sql-injection',
  category: 'security',
  severity: 'high',
  aiSpecific: false,
  description: 'PHP SQL string concat or interpolation — use PDO prepared statements',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    if (!facts.v2) return [];
    const source = facts.v2._source ?? '';
    if (!source) return [];

    const issues: Issue[] = [];
    const re = new RegExp(PHP_INTERPOLATED_SQL.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const line = 1 + (source.substring(0, m.index).match(/\n/g)?.length ?? 0);
      const lineText = source.split('\n')[line - 1] ?? '';

      if (PHP_SQL_KEYWORD_REGEX.test(m[0]) && !PHP_PREPARED_SAFE.test(lineText)) {
        issues.push({
          ruleId: 'php/sql-injection',
          category: 'security',
          severity: 'high',
          aiSpecific: false,
          filePath: facts.filePath ?? '',
          line,
          column: 1,
          message: `PHP SQL injection risk: \`${m[0].slice(0, 80)}...\`. User input flows into query string.`,
          advice: 'Use PDO prepared statements: `$stmt = $pdo->prepare("SELECT * FROM users WHERE id = ?"); $stmt->execute([$id]);` Never concatenate user input into a SQL string.',
        });
      }
    }

    return issues;
  },
});
