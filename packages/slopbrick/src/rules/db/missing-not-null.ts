// Rule: db/missing-not-null
//
// Columns whose name matches a "required identifier" pattern (id,
// email, created_at, status, etc.) but lack a NOT NULL constraint.
// PRIMARY KEY counts as NOT NULL (Postgres semantics).

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

const REQUIRED_COLUMN_HEURISTIC = /^(id|user_?id|order_?id|product_?id|tenant_?id|customer_?id|email|created_?at|updated_?at|deleted_?at|expires_?at|status|uuid|slug|handle|key|name)$/i;

export const missingNotNullRule = createRule<RuleContext>({
  id: 'db/missing-not-null',
  category: 'db',
  severity: 'high',
  aiSpecific: false,
  description:
    'Required-identifier column (id, email, created_at, …) without NOT NULL — silent NULL inserts in production.',
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
      if (stmt.type !== 'CreateStmt') continue;
      const cs = stmt.ast;
      const tableName = cs?.relation?.relname;
      if (!tableName || !Array.isArray(cs.tableElts)) continue;
      for (const elt of cs.tableElts) {
        const cd = elt.ColumnDef;
        if (!cd) continue;
        if (!REQUIRED_COLUMN_HEURISTIC.test(cd.colname ?? '')) continue;
        const hasNotNull = (cd.constraints ?? []).some((c: any) => {
          const con = c.Constraint;
          return con?.contype === 'CONSTR_NOTNULL' || con?.contype === 'CONSTR_PRIMARY';
        });
        if (hasNotNull) continue;
        issues.push({
          ruleId: 'db/missing-not-null',
          category: 'db',
          severity: 'high',
          aiSpecific: false,
          message: `Required column \`${tableName}.${cd.colname}\` is missing \`NOT NULL\`.`,
          line: 1,
          column: 1,
          advice:
            `Add \`NOT NULL\` (or \`PRIMARY KEY\`). Optional identifiers are a ` +
            `common AI-generated SQL smell that leads to silent NULL inserts in production.`,
        });
      }
    }
    return issues;
  },
});

export default missingNotNullRule satisfies Rule<RuleContext>;
