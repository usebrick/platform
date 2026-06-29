// Rule: db/duplicate-index
//
// Same column-list declared in two CREATE INDEX statements — extra
// indexes slow writes without benefit (Squawk's `no-duplicate-index`).

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

export const duplicateIndexRule = createRule<RuleContext>({
  id: 'db/duplicate-index',
  category: 'db',
  severity: 'high',
  aiSpecific: false,
  description:
    'Two CREATE INDEX statements cover the same column list on the same table — drop one.',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    const stmts = parseStatements(source);
    if (!stmts) return issues;

    const seen = new Map<string, { indexName: string; table: string }>();
    for (const stmt of stmts) {
      if (stmt.type !== 'IndexStmt') continue;
      const idx = stmt.ast;
      const idxName: string = idx.idxname ?? '?';
      const cols: string[] = (idx.indexParams ?? [])
        .map((p: any) => p.IndexElem?.name ?? '?')
        .sort();
      const key = cols.join(',');
      if (key === '') continue;
      const table: string = idx.relation?.relname ?? '';
      if (seen.has(key)) {
        const prev = seen.get(key)!;
        // Skip self-duplicates of the *same* index name on the same
        // table (e.g. CREATE INDEX IF NOT EXISTS appears twice with
        // identical identifier).
        if (prev.indexName === idxName && prev.table === table) continue;
        issues.push({
          ruleId: 'db/duplicate-index',
          category: 'db',
          severity: 'high',
          aiSpecific: false,
          message:
            `Index \`${idxName}\` duplicates \`${prev.indexName}\` on the same ` +
            `column list (${cols.join(', ')}).`,
          line: 1,
          column: 1,
          advice: `Drop one of the two indexes — extra indexes slow writes without benefit.`,
        });
      } else {
        seen.set(key, { indexName: idxName, table });
      }
    }
    return issues;
  },
});

export default duplicateIndexRule satisfies Rule<RuleContext>;
