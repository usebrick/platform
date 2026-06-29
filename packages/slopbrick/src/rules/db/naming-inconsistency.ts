// Rule: db/naming-inconsistency
//
// Within a single SQL file, snake_case and camelCase identifiers mix.
// Postgres convention is snake_case; mixing styles makes the schema
// hard to read and erodes the "this repo has one way of naming things"
// signal that AI models often miss.

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

export const namingInconsistencyRule = createRule<RuleContext>({
  id: 'db/naming-inconsistency',
  category: 'db',
  severity: 'low',
  aiSpecific: false,
  description:
    'snake_case and camelCase identifiers mix within one SQL file — standardize.',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    const stmts = parseStatements(source);
    if (!stmts) return issues;

    let snakeCount = 0;
    let camelCount = 0;
    function walk(node: any): void {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
        return;
      }
      // Postgres string scalar values live under .String.sval.
      // Each value is a server-side literal — column name, table
      // name, type name — and the style flag depends on whether
      // underscores are present (snake) vs. camelCase.
      if (node.String?.sval && typeof node.String.sval === 'string') {
        const s = node.String.sval;
        if (/^[a-z_][a-z0-9_]*$/.test(s)) snakeCount++;
        else if (/^[a-z][A-Za-z0-9]*$/.test(s)) camelCount++;
      }
      for (const k of Object.keys(node)) walk(node[k]);
    }
    walk(stmts);

    // Only flag when BOTH styles appear with non-trivial counts.
    if (snakeCount >= 2 && camelCount >= 2) {
      issues.push({
        ruleId: 'db/naming-inconsistency',
        category: 'db',
        severity: 'low',
        aiSpecific: false,
        message:
          `Mixed identifier styles: ${snakeCount} snake_case vs ${camelCount} camelCase.`,
        line: 1,
        column: 1,
        advice:
          `Standardize on snake_case (Postgres convention) or document the deviation.`,
      });
    }
    return issues;
  },
});

export default namingInconsistencyRule satisfies Rule<RuleContext>;
