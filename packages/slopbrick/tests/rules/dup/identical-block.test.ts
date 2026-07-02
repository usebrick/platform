import { describe, it, expect, beforeEach } from 'vitest';
import { dupIdenticalBlockRule, _resetDedupCacheForTesting } from '../../../src/rules/dup/identical-block';
import type { ScanFacts, RuleContext } from '../../../src/types';

/**
 * Build a minimal ScanFacts for the dup/identical-block rule.
 * The rule only reads `facts.filePath` and `facts.v2._source`.
 */
function makeFacts(filePath: string, source: string): ScanFacts {
  return {
    filePath,
    v2: {
      _source: source,
    } as any,
  } as unknown as ScanFacts;
}

const CTX: RuleContext = {} as RuleContext;

const TWENTY_LINES = [
  'function calculateTotal(items) {',
  '  let total = 0;',
  '  for (const item of items) {',
  '    if (item.price > 0 && item.quantity > 0) {',
  '      total += item.price * item.quantity;',
  '    }',
  '  }',
  '  return total;',
  '}',
  '',
  'function applyDiscount(total, rate) {',
  '  if (rate <= 0 || rate >= 1) {',
  '    return total;',
  '  }',
  '  const discounted = total * (1 - rate);',
  '  return Math.round(discounted * 100) / 100;',
  '}',
  '',
  'function formatCurrency(amount) {',
  '  return `$${amount.toFixed(2)}`;',
].join('\n');

describe('dup/identical-block', () => {
  beforeEach(() => {
    // The rule uses a module-scope in-memory cache. Each test must
    // start with a fresh cache to avoid leaks from other tests.
    _resetDedupCacheForTesting();
  });

  it('emits a finding when a 20-line block matches a previously-analyzed file', () => {
    // Two different file paths, identical 20-line content. The
    // second analyze() should emit a finding because the first
    // file's window is in the cache.
    const factsA = makeFacts(`/a-${Math.random()}.ts`, TWENTY_LINES);
    const factsB = makeFacts(`/b-${Math.random()}.ts`, TWENTY_LINES);

    const issuesA = dupIdenticalBlockRule.analyze(CTX, factsA);
    const issuesB = dupIdenticalBlockRule.analyze(CTX, factsB);

    // File A: no prior file in the cache → no findings
    expect(issuesA).toEqual([]);
    // File B: file A's window is in the cache → at least one finding
    expect(issuesB.length).toBeGreaterThan(0);
    expect(issuesB[0].ruleId).toBe('dup/identical-block');
    expect(issuesB[0].message).toMatch(/Identical 20-line block/);
    expect(issuesB[0].message).toMatch(factsA.filePath);
    expect(issuesB[0].line).toBe(1);
  });

  it('normalizes comments and whitespace before hashing', () => {
    // Two files with semantically-identical 20-line blocks but
    // different formatting and comments. Should still match.
    const fileA = `
function sum(xs) {
  // sum the array
  let s = 0;
  for (const x of xs) {
    s += x;
  }
  return s;
}
`.trim();

    const fileB = `
function   sum(xs) {
  let s = 0;
  for (const x of xs) {  // accumulate
    s += x;
  }
  return s;
}
`.trim();

    // Pad each to >=20 lines so the window is satisfied
    const padA = fileA + '\n' + '// padding\n'.repeat(15);
    const padB = fileB + '\n' + '// padding\n'.repeat(15);

    const factsA = makeFacts(`/norm-a-${Math.random()}.ts`, padA);
    const factsB = makeFacts(`/norm-b-${Math.random()}.ts`, padB);

    const issuesA = dupIdenticalBlockRule.analyze(CTX, factsA);
    const issuesB = dupIdenticalBlockRule.analyze(CTX, factsB);

    // File A: no prior file → no findings
    expect(issuesA).toEqual([]);
    // File B: file A's window matches (after normalization) → findings
    expect(issuesB.length).toBeGreaterThan(0);
  });

  it('does not emit when there is no prior match', () => {
    // A single file with no prior file in the cache. Should not emit.
    const factsA = makeFacts(`/solo-${Math.random()}.ts`, TWENTY_LINES);
    const issuesA = dupIdenticalBlockRule.analyze(CTX, factsA);
    expect(issuesA).toEqual([]);
  });

  it('does not emit when content differs', () => {
    const fileA = TWENTY_LINES;
    const fileB = TWENTY_LINES.replace('calculateTotal', 'computeSum')
                           .replace('item.price * item.quantity', 'item.cost');

    const factsA = makeFacts(`/diff-a-${Math.random()}.ts`, fileA);
    const factsB = makeFacts(`/diff-b-${Math.random()}.ts`, fileB);

    const issuesA = dupIdenticalBlockRule.analyze(CTX, factsA);
    const issuesB = dupIdenticalBlockRule.analyze(CTX, factsB);

    expect(issuesA).toEqual([]);
    expect(issuesB).toEqual([]);
  });

  it('returns no findings when source is empty', () => {
    const facts = makeFacts(`/empty-${Math.random()}.ts`, '');
    expect(dupIdenticalBlockRule.analyze(CTX, facts)).toEqual([]);
  });

  it('returns no findings when source is too short for a 20-line window', () => {
    const short = 'function f() {}\n';
    const facts = makeFacts(`/short-${Math.random()}.ts`, short);
    expect(dupIdenticalBlockRule.analyze(CTX, facts)).toEqual([]);
  });

  it('has the right rule metadata', () => {
    expect(dupIdenticalBlockRule.id).toBe('dup/identical-block');
    expect(dupIdenticalBlockRule.category).toBe('logic');
    expect(dupIdenticalBlockRule.severity).toBe('medium');
    expect(dupIdenticalBlockRule.aiSpecific).toBe(false);
  });
});
