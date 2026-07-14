// Rule: security/sql-construction
//
// Per Su, Z. & Wassermann, G. (2006), ‘The Essence of Command Injection Attacks in Web Applications’, Proc. POPL 2006, pp. 372-382; OWASP Foundation (2023), A03:2021 Injection.
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
import { scanJsStringTokens } from '../../engine/source-lex';
import { createRule } from '../rule';
import { lineOfSource } from '../utils';

// Match an actual SQL query prefix, rather than merely a DML word. Requiring
// the table/column boundary keeps normal prose such as "Replace the value"
// and "Update every call site" out of the detector. String tokens are
// extracted lexically below, so comments and nested advice strings cannot
// become findings.
const SQL_QUERY_START_RE =
  /^\s*(?:--[^\n]*\n\s*)*(?:SELECT\b[\s\S]*\bFROM\b|INSERT\s+INTO\b|UPDATE\s+\S+\s+SET\b|DELETE\s+FROM\b|REPLACE\s+INTO\b|TRUNCATE(?:\s+TABLE)?\s+\S+\b|MERGE\s+INTO\b)/i;

// Match template-literal interpolation `${...}` inside a string.
const TEMPLATE_INTERPOLATION_RE = /\$\{[\s\S]*\}/;


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

    for (const token of scanJsStringTokens(source)) {
      if (!SQL_QUERY_START_RE.test(token.content)) continue;

      // 1. Template-literal SQL with interpolation.
      if (token.quote === '`' && TEMPLATE_INTERPOLATION_RE.test(token.content)) {
        issues.push({
          ruleId: 'security/sql-construction',
          category: 'security',
          severity: 'high',
          aiSpecific: true,
          message:
            'SQL query built with template-literal interpolation. Use parameterized queries instead.',
          line: lineOfSource(source, token.start),
          column: 1,
          advice:
            'Replace the template-literal SQL with a parameterized query: \n' +
            '  - node-postgres / pg:  client.query("SELECT ... WHERE id = $1", [userId])\n' +
            '  - mysql2:               connection.execute("SELECT ... WHERE id = ?", [userId])\n' +
            '  - Prisma / Drizzle / Knex query builder: define the query declaratively.\n' +
            'Never concatenate user input into a SQL string — even if you sanitize it today, the next change will break.',
        });
        continue;
      }

      // 2. String-concat SQL with `+`. A token is top-level, so a SQL
      // example nested inside a documentation/advice string cannot match.
      if (token.quote === '`') continue;
      if (!/^\s*\+/u.test(source.slice(token.end))) continue;
      issues.push({
        ruleId: 'security/sql-construction',
        category: 'security',
        severity: 'high',
        aiSpecific: true,
        message:
          'SQL query built with string concatenation (+). Use parameterized queries instead.',
        line: lineOfSource(source, token.start),
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
