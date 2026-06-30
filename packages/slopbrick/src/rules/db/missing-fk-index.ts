// Rule: db/missing-fk-index
//
// Per Postgres documentation, foreign key columns should have a matching
// index — otherwise deletes on the parent table perform a sequential
// scan on the child table (see Squawk's `require-index-for-fk` rule).
//
// v1 of this rule does a single-file check: every REFERENCES column in
// this file must have a CREATE INDEX on the same table/column within
// the same file. Cross-file index coverage is the orchestration's job
// (it has the global fkColumnsByTable map). When the orchestration
// can't prove cross-file coverage, the rule returns no findings for
// that aspect — this matches the existing `detectMissingFkIndexes`
// behavior in `engine/db-health.ts`.

import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { parseSync as parseSql, loadModule as loadSqlModule } from 'pgsql-parser';

// Eagerly trigger the WASM load. We do NOT await at module top level
// (tsup's CJS build rejects top-level await). The promise resolves on
// the microtask queue between module import and the first analyze()
// call; tests can additionally `await preloadDbParser()` from
// `tests/rules/db/_helpers` to guarantee ordering. libpg-query caches
// `wasmModule` internally, so all six SQL rule modules share one load.
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

export const missingFkIndexRule = createRule<RuleContext>({
  id: 'db/missing-fk-index',
  category: 'db',
  severity: 'high',
  aiSpecific: false,
  description:
    'Foreign key column without a matching CREATE INDEX in the same file — sequential scan on parent deletes.',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    const stmts = parseStatements(source);
    if (!stmts) return issues;

    const fkColsByTable = new Map<string, Set<string>>();
    const idxColsByTable = new Map<string, Set<string>>();

    for (const stmt of stmts) {
      if (stmt.type === 'CreateStmt') {
        const cs = stmt.ast;
        const tableName = cs?.relation?.relname;
        if (!tableName || !Array.isArray(cs.tableElts)) continue;
        for (const elt of cs.tableElts) {
          const cd = elt.ColumnDef;
          if (!cd || !Array.isArray(cd.constraints)) continue;
          for (const con of cd.constraints) {
            const c = con.Constraint;
            if (!c) continue;
            const isFk =
              c.contype === 'CONSTR_FOREIGN' ||
              (Array.isArray(c.fk_attrs) && c.fk_attrs.length > 0) ||
              c.pktable?.relation?.relname;
            if (!isFk) continue;
            if (!fkColsByTable.has(tableName)) fkColsByTable.set(tableName, new Set());
            fkColsByTable.get(tableName)!.add(cd.colname);
          }
        }
      } else if (stmt.type === 'IndexStmt') {
        const idx = stmt.ast;
        const tableName = idx.relation?.relname;
        if (!tableName) continue;
        if (!idxColsByTable.has(tableName)) idxColsByTable.set(tableName, new Set());
        for (const p of idx.indexParams ?? []) {
          if (p.IndexElem?.name) idxColsByTable.get(tableName)!.add(p.IndexElem.name);
        }
      }
    }

    for (const [table, fkCols] of fkColsByTable) {
      const idxCols = idxColsByTable.get(table) ?? new Set();
      for (const fk of fkCols) {
        if (idxCols.has(fk)) continue;
        issues.push({
          ruleId: 'db/missing-fk-index',
          category: 'db',
          severity: 'high',
          aiSpecific: false,
          message: `Foreign key column \`${table}.${fk}\` has no matching index.`,
          line: 1,
          column: 1,
          advice:
            `Add \`CREATE INDEX ON ${table} (${fk});\`. Without an index, ` +
            `deletes on the parent table perform a sequential scan. Use ` +
            `\`CREATE INDEX CONCURRENTLY\` in production.`,
          extras: { table, columnName: fk },
        });
      }
    }
    return issues;
  },
});

export default missingFkIndexRule satisfies Rule<RuleContext>;
