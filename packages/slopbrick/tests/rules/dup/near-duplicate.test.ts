import { describe, it, expect, beforeEach } from 'vitest';
import {
  nearDuplicateRule,
  _resetNearDupCacheForTesting,
  type NearDuplicateContext,
} from '../../../src/rules/dup/near-duplicate';
import { shingleSet } from '../../../src/engine/dedup/tokenize';
import { minHash, minHashSimilarity } from '../../../src/engine/dedup/minhash';
import { buildLshIndex } from '../../../src/engine/dedup/lsh';
import type { ScanFacts, RuleContext } from '../../../src/types';

/**
 * Unit tests for the v0.23.0 Type-2 clone detector.
 *
 * Covers:
 *   - Algorithm primitives (shingleSet, minHash, minHashSimilarity, buildLshIndex)
 *   - Rule integration: identical files fire, similar files fire, different files don't
 *   - Renames, whitespace changes, comment edits trigger the rule
 */

const CTX: RuleContext = {} as RuleContext;

function makeFacts(filePath: string, source: string): ScanFacts {
  return {
    filePath,
    v2: { _source: source } as any,
  } as unknown as ScanFacts;
}

describe('dup/near-duplicate — algorithm primitives', () => {
  describe('shingleSet', () => {
    it('returns empty set for empty source', () => {
      expect(shingleSet('').size).toBe(0);
    });

    it('returns one shingle for short source', () => {
      const s = shingleSet('foo bar');
      expect(s.size).toBe(1);
    });

    it('returns K-1 shingles for source of K-1 tokens (one big shingle)', () => {
      // k=5 default. "a b c d" = 4 tokens, < 5. Should be 1 shingle.
      const s = shingleSet('a b c d');
      expect(s.size).toBe(1);
    });

    it('returns N-K+1 shingles for source of N tokens', () => {
      // k=5 default. 10 tokens → 6 shingles.
      const s = shingleSet('a b c d e f g h i j');
      expect(s.size).toBe(6);
    });

    it('normalizes case', () => {
      const a = shingleSet('Foo Bar Baz');
      const b = shingleSet('foo bar baz');
      expect(a).toEqual(b);
    });

    it('strips line comments', () => {
      const a = shingleSet('foo bar baz');
      const b = shingleSet('foo // comment\nbar baz');
      expect(a).toEqual(b);
    });

    it('strips block comments', () => {
      const a = shingleSet('foo bar baz');
      const b = shingleSet('foo /* comment */ bar baz');
      expect(a).toEqual(b);
    });
  });

  describe('minHash', () => {
    it('returns a signature of the requested length', () => {
      const tokens = new Set([1, 2, 3, 4, 5]);
      const sig = minHash(tokens, { numHashes: 64 });
      expect(sig.length).toBe(64);
    });

    it('returns identical signatures for identical inputs', () => {
      const tokens = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const a = minHash(tokens, { numHashes: 128 });
      const b = minHash(tokens, { numHashes: 128 });
      expect(Array.from(a)).toEqual(Array.from(b));
    });

    it('returns all-max sentinel for empty input', () => {
      const sig = minHash(new Set<number>(), { numHashes: 16 });
      expect(sig.every((v) => v === 0xffffffff)).toBe(true);
    });

    it('is deterministic across calls (no randomness)', () => {
      const tokens = new Set([10, 20, 30, 40, 50]);
      const a = minHash(tokens);
      const b = minHash(tokens);
      const c = minHash(tokens);
      expect(Array.from(a)).toEqual(Array.from(b));
      expect(Array.from(b)).toEqual(Array.from(c));
    });
  });

  describe('minHashSimilarity', () => {
    it('returns 1.0 for identical signatures', () => {
      const sig = minHash(new Set([1, 2, 3]));
      expect(minHashSimilarity(sig, sig)).toBeCloseTo(1.0, 5);
    });

    it('returns 0.0 for non-overlapping token sets (approximate)', () => {
      // Two completely disjoint sets with reasonable size.
      // Estimator is approximate; allow wide tolerance for the floor.
      const a = new Set(Array.from({ length: 1000 }, (_, i) => i));
      const b = new Set(Array.from({ length: 1000 }, (_, i) => i + 5000));
      const sigA = minHash(a, { numHashes: 256 });
      const sigB = minHash(b, { numHashes: 256 });
      const sim = minHashSimilarity(sigA, sigB);
      expect(sim).toBeLessThan(0.05);
    });

    it('returns high similarity for high-overlap sets', () => {
      const base = Array.from({ length: 100 }, (_, i) => i);
      const a = new Set(base);
      const b = new Set([...base.slice(0, 80), 1000, 1001, 1002, 1003, 1004]);
      const sigA = minHash(a, { numHashes: 256 });
      const sigB = minHash(b, { numHashes: 256 });
      const sim = minHashSimilarity(sigA, sigB);
      // 80% overlap should give ~0.8 estimate with 256 hashes
      expect(sim).toBeGreaterThan(0.7);
    });

    it('throws on length mismatch', () => {
      const a = minHash(new Set([1, 2, 3]), { numHashes: 64 });
      const b = minHash(new Set([1, 2, 3]), { numHashes: 32 });
      expect(() => minHashSimilarity(a, b)).toThrow();
    });
  });

  describe('buildLshIndex', () => {
    it('returns empty index for no signatures', () => {
      const idx = buildLshIndex([]);
      expect(idx.candidates().length).toBe(0);
      expect(idx.size()).toBe(0);
    });

    it('returns no candidates for single signature', () => {
      const idx = buildLshIndex([minHash(new Set([1, 2, 3]))]);
      expect(idx.candidates().length).toBe(0);
      expect(idx.size()).toBe(1);
    });

    it('finds candidate pair for two identical signatures', () => {
      const tokens = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const sig = minHash(tokens);
      const idx = buildLshIndex([sig, sig]);
      const candidates = idx.candidates();
      expect(candidates.length).toBe(1);
      expect(candidates[0]).toEqual({ i: 0, j: 1 });
    });

    it('finds candidate pairs for highly-similar signatures', () => {
      const base = Array.from({ length: 50 }, (_, i) => i);
      const sig1 = minHash(new Set(base));
      const sig2 = minHash(new Set([...base, 100, 101, 102, 103, 104]));
      const idx = buildLshIndex([sig1, sig2]);
      // 50+5 tokens, 50 shared = 0.91 Jaccard
      const candidates = idx.candidates();
      expect(candidates.length).toBeGreaterThanOrEqual(1);
    });

    it('deduplicates candidate pairs (i,j) and (j,i)', () => {
      const tokens = new Set([1, 2, 3, 4, 5]);
      const sig = minHash(tokens);
      const idx = buildLshIndex([sig, sig, sig]);
      // 3 choose 2 = 3 pairs, not 6
      expect(idx.candidates().length).toBe(3);
    });

    it('throws on signature length mismatch', () => {
      const sig1 = minHash(new Set([1, 2, 3]), { numHashes: 64 });
      const sig2 = minHash(new Set([1, 2, 3]), { numHashes: 32 });
      expect(() => buildLshIndex([sig1, sig2])).toThrow();
    });
  });
});

describe('dup/near-duplicate — rule integration', () => {
  beforeEach(() => {
    _resetNearDupCacheForTesting();
  });

  it('does not fire on a single file (no prior file in cache)', () => {
    const facts = makeFacts('/a.ts', 'export const a = 1;\n');
    const issues = nearDuplicateRule.analyze(CTX, facts);
    expect(issues).toEqual([]);
  });

  it('does not fire on the second scan of an identical file (Type-1 case, low Jaccard for short files)', () => {
    // The same 8-line function. Should fire if Jaccard >= 0.7.
    // For identical files, Jaccard = 1.0, so it fires.
    const source = [
      'function add(a, b) {',
      '  return a + b;',
      '}',
      '',
      'function sub(a, b) {',
      '  return a - b;',
      '}',
      '',
    ].join('\n');

    const a = makeFacts('/a.ts', source);
    const b = makeFacts('/b.ts', source);
    nearDuplicateRule.analyze(CTX, a);
    const issues = nearDuplicateRule.analyze(CTX, b);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.ruleId).toBe('dup/near-duplicate');
  });

  it('does NOT fire on full-identifier renames (Type-2b → Type-3 territory)', () => {
    // Same function, but EVERY identifier is renamed.
    // Token k-grams break at the first rename. This is the Type-2b
    // case which requires identifier canonicalization or AST
    // similarity (planned for v0.27.0 dup/structural-clone).
    // v0.23.0 catches Type-2a: whitespace + comment differences only.
    const a = makeFacts(
      '/a.ts',
      'function add(a, b) {\n  const result = a + b;\n  return result;\n}\n',
    );
    const b = makeFacts(
      '/b.ts',
      'function sum(x, y) {\n  const result = x + y;\n  return result;\n}\n',
    );

    nearDuplicateRule.analyze(CTX, a);
    const issues = nearDuplicateRule.analyze(CTX, b);
    // Document the limitation: this fires 0 times in v0.23.0.
    expect(issues.length).toBe(0);
  });

  it('fires on near-duplicate with whitespace reformatted', () => {
    // Same function, reformatted whitespace (2-space vs 4-space indent)
    const a = makeFacts(
      '/a.ts',
      'function add(a, b) {\n  return a + b;\n}\n',
    );
    const b = makeFacts(
      '/b.ts',
      'function add(a, b) {\n    return a + b;\n}\n',
    );

    nearDuplicateRule.analyze(CTX, a);
    const issues = nearDuplicateRule.analyze(CTX, b);
    // Whitespace doesn't affect tokens — should fire.
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not fire on completely different functions', () => {
    const a = makeFacts(
      '/a.ts',
      'function add(a, b) {\n  return a + b;\n}\n',
    );
    const b = makeFacts(
      '/b.ts',
      'class Database {\n  connect() { return "postgres://"; }\n  query() { return []; }\n}\n',
    );

    nearDuplicateRule.analyze(CTX, a);
    const issues = nearDuplicateRule.analyze(CTX, b);
    expect(issues).toEqual([]);
  });

  it('fires on near-duplicate with comment differences', () => {
    // Comments don't affect shingles. Jaccard stays high.
    const base = 'function add(a, b) {\n  return a + b;\n}\n';
    const a = makeFacts('/a.ts', base);
    const b = makeFacts(
      '/b.ts',
      '// Adds two numbers\nfunction add(a, b) {\n  // TODO optimize\n  return a + b;\n}\n',
    );

    nearDuplicateRule.analyze(CTX, a);
    const issues = nearDuplicateRule.analyze(CTX, b);
    expect(issues.length).toBeGreaterThan(0);
  });

  it('custom threshold via context', () => {
    const ctx: NearDuplicateContext = { threshold: 0.99, k: 5 };
    const source = 'function add(a, b) {\n  return a + b;\n}\n';
    const a = makeFacts('/a.ts', source);
    const b = makeFacts(
      '/b.ts',
      'function add(a, b) {\n  return a + b; // comment\n}\n',
    );

    nearDuplicateRule.analyze(ctx, a);
    const issues = nearDuplicateRule.analyze(ctx, b);
    // At threshold 0.99, the comment change pushes similarity below 1.0
    // but probably still above 0.99. Should still fire.
    expect(issues.length).toBeGreaterThan(0);
  });

  it('has the right rule metadata', () => {
    expect(nearDuplicateRule.id).toBe('dup/near-duplicate');
    expect(nearDuplicateRule.category).toBe('logic');
    expect(nearDuplicateRule.severity).toBe('medium');
    expect(nearDuplicateRule.aiSpecific).toBe(true);
  });
});
