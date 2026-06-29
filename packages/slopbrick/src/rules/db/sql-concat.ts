// Rule: db/sql-concat
//
// Template-literal SQL query inside TS/TSX/JS files: any backtick
// string that starts with SELECT / INSERT / UPDATE / DELETE / WITH
// and contains a `${...}` interpolation. String concatenation is a
// SQL injection vector and a common AI-tutorial smell (parameterized
// queries are the safe alternative).

import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { lineOfSource } from '../utils';

const TEMPLATE_SQL_RE =
  /`((?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|WITH)\b[^`]*\$\{[^}]+\}[^`]*)`/gi;

export const sqlConcatRule = createRule<RuleContext>({
  id: 'db/sql-concat',
  category: 'db',
  severity: 'high',
  aiSpecific: true,
  description:
    'Template-literal SQL query with ${...} interpolation — use parameterized queries.',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    TEMPLATE_SQL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TEMPLATE_SQL_RE.exec(source)) !== null) {
      issues.push({
        ruleId: 'db/sql-concat',
        category: 'db',
        severity: 'high',
        aiSpecific: true,
        message:
          'Template-literal SQL query with `${...}` interpolation — string ' +
          'concatenation is a SQL injection vector and a common AI-generated smell.',
        line: lineOfSource(source, m.index),
        column: 1,
        advice:
          'Use parameterized queries (`db.query(\'SELECT ... WHERE id = $1\', [id])`) or an ORM.',
      });
    }
    return issues;
  },
});

export default sqlConcatRule satisfies Rule<RuleContext>;
