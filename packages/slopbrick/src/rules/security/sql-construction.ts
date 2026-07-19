// Rule: security/sql-construction
//
// Per Su, Z. & Wassermann, G. (2006), ‘The Essence of Command Injection Attacks in Web Applications’, Proc. POPL 2006, pp. 372-382; OWASP Foundation (2023), A03:2021 Injection.
//
// Catches string-concatenated SQL: queries built by interpolating
// variables or expressions into a SQL string instead of using
// parameterized queries / prepared statements.
//
//   BAD: a SELECT query assembled with template interpolation
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
const DIRECT_SQL_START_RE =
  /^(?:SELECT\b[\s\S]*\bFROM\b|INSERT\s+INTO\b|UPDATE\s+\S+\s+SET\b|DELETE\s+FROM\b|REPLACE\s+INTO\b|TRUNCATE(?:\s+TABLE)?\s+\S+\b|MERGE\s+INTO\b)/i;
const CTE_TERMINAL_SQL_START_RE =
  /^(?:SELECT\b|INSERT\s+INTO\b|UPDATE\s+\S+\s+SET\b|DELETE\s+FROM\b)/i;
const SQL_IDENTIFIER_START_RE = /[A-Za-z_]/u;
const SQL_IDENTIFIER_PART_RE = /[A-Za-z0-9_$]/u;

function isSqlIdentifierPart(value: string | undefined): boolean {
  return value !== undefined && SQL_IDENTIFIER_PART_RE.test(value);
}

function hasSqlKeywordAt(source: string, index: number, keyword: string): boolean {
  return source.slice(index, index + keyword.length).toUpperCase() === keyword
    && !isSqlIdentifierPart(source[index - 1])
    && !isSqlIdentifierPart(source[index + keyword.length]);
}

function skipSqlWhitespace(source: string, start: number): number {
  let index = start;
  while (index < source.length && /\s/u.test(source[index]!)) index += 1;
  return index;
}

function sqlIdentifierEnd(source: string, start: number): number {
  if (!SQL_IDENTIFIER_START_RE.test(source[start] ?? '')) return -1;
  let index = start + 1;
  while (index < source.length && isSqlIdentifierPart(source[index])) index += 1;
  return index;
}

function matchingSqlParen(source: string, openIndex: number): number {
  if (source[openIndex] !== '(') return -1;
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index]!;
    const next = source[index + 1];

    if (character === "'" || character === '"') {
      const quote = character;
      for (index += 1; index < source.length; index += 1) {
        if (source[index] === '\\') {
          index += 1;
          continue;
        }
        if (source[index] !== quote) continue;
        if (source[index + 1] === quote) {
          index += 1;
          continue;
        }
        break;
      }
      continue;
    }
    if (character === '-' && next === '-') {
      const newline = source.indexOf('\n', index + 2);
      if (newline < 0) return -1;
      index = newline;
      continue;
    }
    if (character === '/' && next === '*') {
      const close = source.indexOf('*/', index + 2);
      if (close < 0) return -1;
      index = close + 1;
      continue;
    }
    if (character === '(') depth += 1;
    if (character !== ')') continue;
    depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function startsCteSqlStatement(source: string): boolean {
  let index = skipSqlWhitespace(source, 0);
  if (!hasSqlKeywordAt(source, index, 'WITH')) return false;
  index = skipSqlWhitespace(source, index + 'WITH'.length);
  if (hasSqlKeywordAt(source, index, 'RECURSIVE')) {
    index = skipSqlWhitespace(source, index + 'RECURSIVE'.length);
  }

  while (index < source.length) {
    const identifierEnd = sqlIdentifierEnd(source, index);
    if (identifierEnd < 0) return false;
    index = skipSqlWhitespace(source, identifierEnd);

    if (source[index] === '(') {
      const columnListEnd = matchingSqlParen(source, index);
      if (columnListEnd < 0) return false;
      index = skipSqlWhitespace(source, columnListEnd + 1);
    }
    if (!hasSqlKeywordAt(source, index, 'AS')) return false;
    index = skipSqlWhitespace(source, index + 'AS'.length);

    if (hasSqlKeywordAt(source, index, 'NOT')) {
      index = skipSqlWhitespace(source, index + 'NOT'.length);
      if (!hasSqlKeywordAt(source, index, 'MATERIALIZED')) return false;
      index = skipSqlWhitespace(source, index + 'MATERIALIZED'.length);
    } else if (hasSqlKeywordAt(source, index, 'MATERIALIZED')) {
      index = skipSqlWhitespace(source, index + 'MATERIALIZED'.length);
    }

    const queryEnd = matchingSqlParen(source, index);
    if (queryEnd < 0) return false;
    index = skipSqlWhitespace(source, queryEnd + 1);
    if (source[index] !== ',') {
      return CTE_TERMINAL_SQL_START_RE.test(source.slice(index));
    }
    index = skipSqlWhitespace(source, index + 1);
  }
  return false;
}

function startsSqlStatement(content: string): boolean {
  const withoutLeadingComments = content.replace(/^\s*(?:--[^\n]*\n\s*)*/u, '');
  return DIRECT_SQL_START_RE.test(withoutLeadingComments)
    || startsCteSqlStatement(withoutLeadingComments);
}

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
      if (!startsSqlStatement(token.content)) continue;

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
