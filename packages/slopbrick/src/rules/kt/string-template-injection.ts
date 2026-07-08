/**
 * Rule: kt/string-template-injection
 *
 * Kotlin string template (or concat) flowing into a SQL query,
 * shell command, file path, or eval. Same risk as Java's
 * `+ name +` SQL concat — user-controlled data flows into a
 * sink that interprets it.
 *
 * **Why this matters:**
 * - Kotlin string templates (`"SELECT * FROM users WHERE id = $id"`)
 *   look like interpolation, but they're string concatenation
 *   under the hood. The fix is parameterized queries
 *   (`Exposed`, `ktorm`, or raw JDBC `?` placeholders).
 * - Per the Kotlin coding conventions (kotlinlang.org), string
 *   templates are for **formatting**, not for **building queries**.
 * - Severity: high. SQL injection / command injection are
 *   OWASP A03:2021.
 * - Default off (DORMANT) until v10.2 Kotlin corpus calibration.
 *
 * **Scope:** file-local. Regex on the source text. We look for
 * `$var` inside a string literal that's passed to `.use { ... }`,
 * `Statement.execute`, `Runtime.exec`, `ProcessBuilder`, or
 * similar sinks.
 *
 * **v0.43.0: initial rule.** Mirrors `java/sql-string-concat`
 * with Kotlin-specific syntax awareness.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface KtStringTemplateInjectionContext {
  // No configuration.
}

const KOTLIN_SQL_KEYWORD_REGEX = /\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|DROP\s+TABLE|ALTER\s+TABLE)\b/i;
const KOTLIN_TEMPLATE_REGEX = /["'][^"']*\$\{?\w+\}?[^"']*["']/g;
const KOTLIN_SQL_SINK_REGEX = /\b(?:Statement|Connection|JdbcTemplate|EntityManager|exposed|ktorm|Query)\b/i;
const KOTLIN_SHELL_SINK_REGEX = /\b(?:ProcessBuilder|Runtime\.exec|exec\s*\(|\.command\s*\(|\.bash\s*\(|\.sh\s*\()\b/i;
const KOTLIN_FILE_SINK_REGEX = /\b(?:File\s*\(|Paths\.get|Files\.write|FileWriter|FileOutputStream|BufferedWriter)\s*\(/i;

export const ktStringTemplateInjectionRule = createRule<KtStringTemplateInjectionContext>({
  id: 'kt/string-template-injection',
  category: 'security',
  severity: 'high',
  aiSpecific: false,
  description: 'Kotlin string template or concat flows into SQL/shell/file sink — user input in a query/command/path',
  create(context) {
    return context;
  },
  analyze(_context, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    if (!/\.kt$/i.test(facts.filePath ?? '')) return issues;

    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i] ?? '';
      if (!KOTLIN_TEMPLATE_REGEX.test(lineText)) continue;

      const re = new RegExp(KOTLIN_TEMPLATE_REGEX.source, 'g');
      let m: RegExpExecArray | null;
      while ((m = re.exec(lineText)) !== null) {
        if (KOTLIN_SQL_KEYWORD_REGEX.test(lineText) || KOTLIN_SQL_SINK_REGEX.test(lineText)) {
          issues.push({
            ruleId: 'kt/string-template-injection',
            category: 'security',
            severity: 'high',
            aiSpecific: false,
            filePath: facts.filePath ?? '',
            line: i + 1,
            column: 1,
            message: `Kotlin string template in SQL: \`${m[0]}\`. User input flows into query.`,
            advice: 'Use a parameterized query: `prepareStatement(sql, listOf(id))` with `?` placeholders, or Exposed/ktorm. Never concatenate user input into SQL.',
          });
        } else if (KOTLIN_SHELL_SINK_REGEX.test(lineText)) {
          issues.push({
            ruleId: 'kt/string-template-injection',
            category: 'security',
            severity: 'high',
            aiSpecific: false,
            filePath: facts.filePath ?? '',
            line: i + 1,
            column: 1,
            message: `Kotlin string template in shell command: \`${m[0]}\`. Command injection risk.`,
            advice: 'Use `ProcessBuilder` with a list of arguments (`arrayOf("ls", path)`) instead of a single concatenated string. Never build shell commands by concatenation.',
          });
        } else if (KOTLIN_FILE_SINK_REGEX.test(lineText)) {
          issues.push({
            ruleId: 'kt/string-template-injection',
            category: 'security',
            severity: 'medium',
            aiSpecific: false,
            filePath: facts.filePath ?? '',
            line: i + 1,
            column: 1,
            message: `Kotlin string template in file path: \`${m[0]}\`. Path traversal risk if user-controlled.`,
            advice: 'Use `Paths.get(baseDir, userInput).normalize()` and verify the result is still under `baseDir` before using. Never concatenate user input into a file path.',
          });
        }
      }
    }

    return issues;
  },
});
