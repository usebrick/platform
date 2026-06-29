// Rule: db/enum-sprawl
//
// `CREATE TYPE ... AS ENUM (...)` with more than 12 values. Large enums
// are brittle to extend, hard to localize, and force a recursive
// migration to add a value (CREATE TYPE … ADD VALUE in Postgres can't
// run inside a transaction). A lookup table is the recommended
// alternative.

import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { parseSync as parseSql, loadModule as loadSqlModule } from 'pgsql-parser';

// Eagerly trigger the WASM load. We do NOT await at top level (CJS
// build via tsup rejects top-level await). The promise resolves on
// the microtask queue between module import and the first analyze()
// call. Tests can additionally call preloadDbParser() from
// `tests/rules/db/_helpers` to guarantee ordering.
export const moduleReady = loadSqlModule();

interface Stmt { type: string; ast: any; }

function parseStatements(raw: string): Stmt[] | null {
  let result: any;
  try {
    result = parseSql(raw);
  } catch {
    return null;
  }
  const stmts: Stmt[] = [];
  for (const wrapper of result?.stmts ?? []) {
    const inner = wrapper.stmt ?? {};
    const type = Object.keys(inner)[0] ?? 'Other';
    stmts.push({ type: type as never, ast: inner[type] });
  }
  return stmts;
}

const ENUM_VALUES_MAX = 12;

export const enumSprawlRule = createRule<RuleContext>({
  id: 'db/enum-sprawl',
  category: 'db',
  severity: 'low',
  aiSpecific: false,
  description:
    `CREATE TYPE … AS ENUM with >${ENUM_VALUES_MAX} values — brittle to extend; prefer a lookup table.`,
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    const stmts = parseStatements(source);
    if (!stmts) return issues;

    for (const stmt of stmts) {
      if (stmt.type !== 'CreateEnumStmt') continue;
      const en = stmt.ast;
      const vals: string[] = (en.vals ?? []).map(
        (v: any) => v.String?.sval ?? '?',
      );
      if (vals.length <= ENUM_VALUES_MAX) continue;
      const typeName = (en.typeName?.names ?? [])
        .map((n: any) => n.String?.sval)
        .filter(Boolean)
        .join('.');
      issues.push({
        ruleId: 'db/enum-sprawl',
        category: 'db',
        severity: 'low',
        aiSpecific: false,
        message:
          `Enum \`${typeName}\` has ${vals.length} values ` +
          `(recommended max: ${ENUM_VALUES_MAX}).`,
        line: 1,
        column: 1,
        advice:
          `Consider a lookup table. Enums with many values are brittle to ` +
          `extend and hard to localize.`,
      });
    }
    return issues;
  },
});

export default enumSprawlRule satisfies Rule<RuleContext>;
