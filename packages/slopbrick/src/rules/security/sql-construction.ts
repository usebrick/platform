// Rule: security/sql-construction
//
// Catches string-concatenated SQL: queries built by interpolating
// variables or expressions into a SQL string instead of using
// parameterized queries / prepared statements.
//
//   const q = `SELECT * FROM users WHERE id = ${userId}`;     // BAD
//   const q = `SELECT * FROM users WHERE id = ?`;             // OK
//   const q = 'SELECT * FROM users WHERE id = ' + userId;     // BAD
//
// AI code defaults to template-literal SQL construction because
// it's the first pattern that comes to mind when the user asks
// for "the query that filters by user ID". Modern frameworks
// (Prisma, Drizzle, Knex query builder, parameterized pg/mysql)
// all give you safe alternatives — flag the unsafe shape so
// developers see it before it ships.
//
// Severity: high (string-concat SQL injection is the canonical
// vulnerability — every security guide opens with it).
//
// aiSpecific: true (humans typing raw SQL almost always use
// parameterized queries after the first security review; AI in
// tutorial mode reaches for template literals).

import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { lineOfSource } from '../utils';

// Match a SQL keyword at the start of a query string. We require a
// keyword at the start (or after leading whitespace / comment) so
// that we don't false-positive on JS variables that happen to
// contain "FROM" somewhere.
const SQL_KEYWORD_RE =
  /['"`]\s*(?:--[^\n]*\n\s*)*\s*(?:SELECT|INSERT|UPDATE|DELETE|REPLACE|TRUNCATE|MERGE)\b/i;

// Match template-literal interpolation `${...}` inside a string.
const TEMPLATE_INTERPOLATION_RE = /\$\{[^}]+\}/;

// Match string concatenation: 'SELECT...' + var or `${...}`.
const CONCAT_RE =
  /['"`]\s*(?:--[^\n]*\n\s*)*\s*(?:SELECT|INSERT|UPDATE|DELETE|REPLACE|TRUNCATE|MERGE)\b[^'"`]*['"`]\s*\+/i;


export const sqlConstructionRule = createRule<RuleContext>({
  id: 'security/sql-construction',
  category: 'security',
  severity: 'high',
  aiSpecific: true,
  description:
    'SQL query built by string concatenation or template interpolation — use parameterized queries / prepared statements instead.',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;

    // 1. Template-literal SQL with interpolation.
    let m: RegExpExecArray | null;
    const templateRe = new RegExp(
      SQL_KEYWORD_RE.source + '[\\s\\S]*?[`]',
      'gi',
    );
    while ((m = templateRe.exec(source)) !== null) {
      const candidate = m[0];
      if (!TEMPLATE_INTERPOLATION_RE.test(candidate)) continue;
      issues.push({
        ruleId: 'security/sql-construction',
        category: 'security',
        severity: 'high',
        aiSpecific: true,
        message:
          'SQL query built with template-literal interpolation. Use parameterized queries instead.',
        line: lineOfSource(source, m.index),
        column: 1,
        advice:
          'Replace the template-literal SQL with a parameterized query: \n' +
          '  - node-postgres / pg:  client.query("SELECT ... WHERE id = $1", [userId])\n' +
          '  - mysql2:               connection.execute("SELECT ... WHERE id = ?", [userId])\n' +
          '  - Prisma / Drizzle / Knex query builder: define the query declaratively.\n' +
          'Never concatenate user input into a SQL string — even if you sanitize it today, the next change will break.',
      });
    }

    // 2. String-concat SQL with `+`.
    const concatRe = new RegExp(CONCAT_RE.source, 'gi');
    while ((m = concatRe.exec(source)) !== null) {
      issues.push({
        ruleId: 'security/sql-construction',
        category: 'security',
        severity: 'high',
        aiSpecific: true,
        message:
          'SQL query built with string concatenation (+). Use parameterized queries instead.',
        line: lineOfSource(source, m.index),
        column: 1,
        advice:
          'Build the query with placeholders and pass the values separately. ' +
          'See your DB driver documentation for the parameterized-query API.',
      });
    }

    return issues;
  },
});

export default sqlConstructionRule satisfies Rule<RuleContext>;