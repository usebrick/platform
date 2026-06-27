import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { shannonEntropy } from '../math-utils';

/**
 * Math rule: Shannon entropy of variable/identifier names.
 *
 * AI-generated code reuses a small vocabulary of generic names: `data`,
 * `items`, `value`, `loading`, `error`, `setData`, `setItems`, etc. Real
 * human code uses more diverse, domain-specific names.
 *
 * We extract identifiers from v2.logic.stateVariables[].name + setter,
 * v2.components[].props[].name, plus identifiers found in `_source`.
 *
 * Threshold: ≥40 identifiers AND entropy ≤ 1.8 → flag.
 */
const IDENT_RE = /\b[a-z][a-zA-Z0-9]{2,}\b/g;

const STOPWORDS = new Set([
  'use', 'set', 'get', 'new', 'const', 'let', 'var', 'function', 'return',
  'import', 'export', 'default', 'class', 'extends', 'async', 'await',
  'this', 'that', 'with', 'from', 'true', 'false', 'null', 'undefined',
  'props', 'state', 'key', 'value', 'index', 'length', 'name',
  'string', 'number', 'boolean', 'object', 'array', 'void', 'any', 'unknown',
]);

export const mathVariableNameEntropyRule = createRule<RuleContext>({
  id: 'logic/math-variable-name-entropy',
  category: 'logic',
  severity: 'high',
  aiSpecific: false,
  description: 'Identifier names show low Shannon entropy — AI defaults to a small vocabulary of generic names',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    if (!facts.v2) return issues;
    const counts = new Map<string, number>();

    for (const sv of facts.v2.logic.stateVariables) {
      if (sv?.name) bump(counts, sv.name);
      if (sv?.setter) bump(counts, sv.setter);
    }
    for (const c of facts.v2.components) {
      for (const p of c.props) {
        if (p?.name) bump(counts, p.name);
      }
    }
    if (facts.v2._source) {
      const matches = facts.v2._source.match(IDENT_RE);
      if (matches) for (const m of matches) bump(counts, m);
    }

    const { h, vocab, total } = shannonEntropy(counts);
    if (total < 40) return issues;
    if (h > 1.8) return issues;

    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topStr = top.map(([k, v]) => `${k}×${v}`).join(', ');

    const anchor = facts.v2.logic.stateVariables[0] ?? facts.v2.components[0];
    issues.push({
      ruleId: 'logic/math-variable-name-entropy',
      category: 'logic',
      severity: 'high',
      aiSpecific: false,
      message:
        `Identifier names show low entropy (H=${h.toFixed(2)}, vocab=${vocab}, n=${total}). ` +
        `Top: ${topStr}. AI defaults to a small vocabulary of generic names (data, items, value, setData, setItems).`,
      line: anchor?.line ?? 1,
      column: anchor?.column ?? 1,
      advice:
        'Use domain-specific identifier names (e.g. reservations, invoices, customers) instead of generic data/items/value.',
    });

    return issues;
  },
});

function bump(counts: Map<string, number>, name: string): void {
  if (!name) return;
  if (STOPWORDS.has(name.toLowerCase())) return;
  counts.set(name, (counts.get(name) || 0) + 1);
}

export default mathVariableNameEntropyRule satisfies Rule<RuleContext>;
