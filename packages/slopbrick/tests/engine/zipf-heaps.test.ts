/**
 * Tests for the Zipf & Heaps engines (v0.12.0).
 *
 * Citations exercised:
 *   Zipf 1949 — original Zipf's law.
 *   Heaps 1978 — original Heaps' law.
 *   Christ et al. 2025 (EMNLP Findings) — direct LLM-detection application.
 *   Lu, Zhang, Zhou 2013 — deviation analysis.
 *
 * Test plan:
 *   1. computeZipfExponent: known Zipf-distributed sample → exponent ≈ s.
 *   2. computeZipfExponent: degenerate inputs return sensible defaults.
 *   3. computeHeapsExponent: known Heaps-distributed sample → exponent ≈ λ.
 *   4. computeHeapsExponent: small inputs return sensible defaults.
 *   5. computeZipfHeaps: combined computation matches individual calls.
 *   6. heapsDeviationZScore: zero std → returns 0.
 *   7. heapsDeviationZScore: positive/negative deviations.
 *   8. tokenizeIdentifiers: filters keywords and short tokens.
 *   9. Tokenize: typical source code has reasonable type-token ratio.
 *  10. Property: Heaps λ is in plausible range [0, 1] for natural code.
 */

import { describe, expect, it } from 'vitest';
import {
  computeHeapsExponent,
  computeZipfExponent,
  computeZipfHeaps,
  heapsDeviationZScore,
  tokenizeIdentifiers,
} from '@usebrick/engine';

describe('computeZipfExponent', () => {
  it('fits exponent ≈ 1 for an artificially Zipf-distributed sample', () => {
    // Generate a sample with f(rank) = 1000 / rank.
    const frequencies = new Map<string, number>();
    for (let rank = 1; rank <= 100; rank++) {
      frequencies.set(`t${rank}`, Math.floor(1000 / rank));
    }
    const fit = computeZipfExponent(frequencies);
    expect(fit.exponent).toBeGreaterThan(0.85);
    expect(fit.exponent).toBeLessThan(1.15);
    expect(fit.rSquared).toBeGreaterThan(0.95);
    expect(fit.vocabularySize).toBe(100);
  });

  it('fits exponent ≈ 2 for a steeper Zipf distribution', () => {
    // f(rank) = 10000 / rank².
    const frequencies = new Map<string, number>();
    for (let rank = 1; rank <= 100; rank++) {
      frequencies.set(`t${rank}`, Math.floor(10000 / (rank * rank)));
    }
    const fit = computeZipfExponent(frequencies);
    expect(fit.exponent).toBeGreaterThan(1.85);
    expect(fit.exponent).toBeLessThan(2.15);
  });

  it('returns 0/0/0 for empty input', () => {
    const fit = computeZipfExponent(new Map());
    expect(fit.exponent).toBe(0);
    expect(fit.rSquared).toBe(0);
    expect(fit.vocabularySize).toBe(0);
  });

  it('returns 0/0/0 for single-token input', () => {
    const fit = computeZipfExponent(new Map([['a', 1]]));
    expect(fit.exponent).toBe(0);
    expect(fit.rSquared).toBe(0);
    expect(fit.vocabularySize).toBe(1);
  });

  it('returns pairs in rank order', () => {
    const frequencies = new Map<string, number>([
      ['a', 10],
      ['b', 5],
      ['c', 1],
    ]);
    const fit = computeZipfExponent(frequencies);
    expect(fit.pairs.map((p) => p.rank)).toEqual([1, 2, 3]);
    expect(fit.pairs.map((p) => p.frequency)).toEqual([10, 5, 1]);
  });
});

describe('computeHeapsExponent', () => {
  it('fits λ in plausible range for synthetic Heaps-distributed sequence', () => {
    // Construct a sequence with K = 10 unique types, growing as |V(t)| ≈ 10 · t^0.5.
    // Approximate by sampling unique tokens with probability ∝ 1/√t of new entry.
    const tokens: string[] = [];
    const seen = new Set<string>();
    let counter = 0;
    for (let t = 0; t < 1000; t++) {
      // Probability of new type at length t: ~ 10 / (2√t) → mimics λ = 0.5.
      const probNew = Math.min(1, 10 / (2 * Math.sqrt(t + 1)));
      if (Math.random() < probNew || seen.size === 0) {
        counter++;
        const newTok = `t${counter}`;
        seen.add(newTok);
        tokens.push(newTok);
      } else {
        // Pick an existing token uniformly.
        const idx = Math.floor(Math.random() * seen.size);
        tokens.push([...seen][idx]);
      }
    }
    const fit = computeHeapsExponent(tokens);
    expect(fit.exponent).toBeGreaterThan(0);
    expect(fit.exponent).toBeLessThan(1);
  });

  it('returns 0 for very short input', () => {
    const fit = computeHeapsExponent(['a', 'b', 'c']);
    expect(fit.exponent).toBe(0);
    expect(fit.samples.length).toBe(0);
  });

  it('has finalVocabularySize equal to unique token count', () => {
    const tokens = ['a', 'b', 'a', 'c', 'b', 'a', 'd'];
    const fit = computeHeapsExponent(tokens);
    expect(fit.finalVocabularySize).toBe(4);
  });
});

describe('computeZipfHeaps', () => {
  it('returns consistent results for the same input', () => {
    const tokens = Array.from({ length: 200 }, (_, i) => `t${i % 20}`);
    const result = computeZipfHeaps(tokens);
    expect(result.totalTokens).toBe(200);
    expect(result.typeTokenRatio).toBe(20 / 200);
    expect(result.zipf.vocabularySize).toBe(20);
    expect(result.heaps.finalVocabularySize).toBe(20);
  });

  it('typeTokenRatio is 1 when all tokens are unique', () => {
    const tokens = Array.from({ length: 50 }, (_, i) => `t${i}`);
    const result = computeZipfHeaps(tokens);
    expect(result.typeTokenRatio).toBe(1);
  });

  it('typeTokenRatio is 1/N when only one token repeats', () => {
    const tokens = Array.from({ length: 100 }, () => 'a');
    const result = computeZipfHeaps(tokens);
    expect(result.typeTokenRatio).toBeCloseTo(0.01, 10);
  });
});

describe('heapsDeviationZScore', () => {
  it('returns 0 when corpus std is 0', () => {
    expect(heapsDeviationZScore(0.6, 0.5, 0)).toBe(0);
  });

  it('returns positive z-score when file λ > corpus λ', () => {
    expect(heapsDeviationZScore(0.7, 0.5, 0.1)).toBeCloseTo(2, 10);
  });

  it('returns negative z-score when file λ < corpus λ', () => {
    expect(heapsDeviationZScore(0.3, 0.5, 0.1)).toBeCloseTo(-2, 10);
  });

  it('returns 0 when file and corpus λ are equal', () => {
    expect(heapsDeviationZScore(0.5, 0.5, 0.1)).toBe(0);
  });
});

describe('tokenizeIdentifiers', () => {
  it('extracts identifier-like tokens', () => {
    const source = 'function fooBar(x, y) { return x + y; }';
    const tokens = tokenizeIdentifiers(source);
    expect(tokens).toContain('function');
    expect(tokens).toContain('foobar'); // lowercased
    expect(tokens).toContain('return');
    // Numbers and short tokens filtered
    expect(tokens).not.toContain('x');
    expect(tokens).not.toContain('y');
  });

  it('filters common short keywords', () => {
    const source = 'if (x) { return y; }';
    const tokens = tokenizeIdentifiers(source);
    expect(tokens).not.toContain('if');
    expect(tokens).toContain('return');
  });

  it('handles dollar-sign and underscore identifiers', () => {
    const source = 'const _$foo = 1; const _bar = 2; const $baz = 3;';
    const tokens = tokenizeIdentifiers(source);
    expect(tokens).toContain('_$foo');
    expect(tokens).toContain('_bar');
    expect(tokens).toContain('$baz');
  });

  it('returns empty array for source with no identifiers', () => {
    expect(tokenizeIdentifiers('12345 !@#$%')).toEqual([]);
  });

  it('has reasonable type-token ratio for typical source', () => {
    const source = `
      function processData(input) {
        const result = input.map(item => item.value * 2);
        return result.filter(x => x > 0);
      }
      class DataProcessor {
        constructor(options) {
          this.options = options;
        }
        process(input) {
          return processData(input);
        }
      }
    `;
    const tokens = tokenizeIdentifiers(source);
    const unique = new Set(tokens);
    expect(tokens.length).toBeGreaterThan(10);
    expect(unique.size).toBeGreaterThan(5);
    expect(unique.size / tokens.length).toBeGreaterThan(0.3);
    expect(unique.size / tokens.length).toBeLessThan(1);
  });
});