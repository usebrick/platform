import { describe, expect, it } from 'vitest';
import {
  buildCorpusBaseline,
  computeNaturalness,
  computeNaturalnessForRange,
  defaultModel,
  tokenizeAstToks,
} from '@usebrick/engine';

describe('engine/naturalness — tokenizeAstToks', () => {
  it('extracts identifiers, keywords, and numeric literals', () => {
    const tokens = tokenizeAstToks('const foo = 42; return bar;');
    expect(tokens).toEqual(['const', 'foo', '42', 'return', 'bar']);
  });

  it('skips operators and punctuation', () => {
    const tokens = tokenizeAstToks('a + b - c * d / e');
    expect(tokens).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('strips line and block comments before tokenizing', () => {
    const tokens = tokenizeAstToks('// line\nconst a = 1; /* block */ const b = 2;');
    expect(tokens).toEqual(['const', 'a', '1', 'const', 'b', '2']);
  });

  it('strips string literals', () => {
    const tokens = tokenizeAstToks("const s = 'hello world'; const t = `tmpl ${x}`;");
    // strings are replaced with '' / '' / '``' (length-2 placeholders) which
    // do not match the identifier/number regex, so they're dropped entirely.
    expect(tokens).toEqual(['const', 's', 'const', 't']);
  });

  it('returns an empty array for empty input', () => {
    expect(tokenizeAstToks('')).toEqual([]);
    expect(tokenizeAstToks('   \n\t  ')).toEqual([]);
  });

  it('preserves identifier-like substrings inside strings as no tokens', () => {
    // The point: string-literal contents must NOT count toward the
    // identifier vocabulary. Otherwise UI copy ("Save", "Cancel") would
    // dominate the distinct-token ratio.
    const tokens = tokenizeAstToks('function f() { return "Save Cancel Confirm"; }');
    expect(tokens).toEqual(['function', 'f', 'return']);
  });
});

describe('engine/naturalness — buildCorpusBaseline', () => {
  it('returns a stable, sorted vocabulary', () => {
    const model = buildCorpusBaseline();
    const vocab = model.vocabulary;
    const sorted = [...vocab].sort();
    expect(vocab).toEqual(sorted);
  });

  it('every vocabulary token has a weight', () => {
    const model = buildCorpusBaseline();
    for (const token of model.vocabulary) {
      expect(model.weights.has(token)).toBe(true);
    }
  });

  it('weights are negative (log probabilities ≤ 1)', () => {
    const model = buildCorpusBaseline();
    for (const w of model.weights.values()) {
      expect(w).toBeLessThan(0);
    }
  });

  it('defaultModel is a singleton', () => {
    const a = defaultModel();
    const b = defaultModel();
    expect(a).toBe(b);
  });
});

describe('engine/naturalness — computeNaturalness', () => {
  it('returns zeros for empty source', () => {
    const m = computeNaturalness('');
    expect(m.length).toBe(0);
    expect(m.distinctCount).toBe(0);
    expect(m.distinctTokenRatio).toBe(0);
    expect(m.entropy).toBe(0);
    expect(m.perplexity).toBe(1);
  });

  it('length matches token count', () => {
    const src = 'const a = 1; const b = 2; const c = 3;';
    const m = computeNaturalness(src);
    expect(m.length).toBe(tokenizeAstToks(src).length);
  });

  it('distinctTokenRatio is in [0, 1]', () => {
    const m1 = computeNaturalness('a b c d e f g');
    expect(m1.distinctTokenRatio).toBeGreaterThan(0);
    expect(m1.distinctTokenRatio).toBeLessThanOrEqual(1);

    const m2 = computeNaturalness('a a a a a a a');
    expect(m2.distinctTokenRatio).toBeCloseTo(1 / 7, 5);
  });

  it('repetitive input has lower distinct ratio than diverse input', () => {
    // 20 tokens, 1 distinct. ratio = 1/20 = 0.05.
    const repetitive = 'data '.repeat(20).trim();
    // 20 tokens, 20 distinct. ratio = 1.0.
    const diverse = 'alpha beta gamma delta epsilon zeta eta theta iota kappa ' +
      'lambda mu nu xi omicron pi rho sigma tau upsilon';
    const rep = computeNaturalness(repetitive);
    const div = computeNaturalness(diverse);
    expect(rep.distinctTokenRatio).toBeLessThan(div.distinctTokenRatio);
    expect(rep.distinctTokenRatio).toBeCloseTo(0.05, 2);
    expect(div.distinctTokenRatio).toBeCloseTo(1.0, 2);
  });

  it('entropy is finite and non-negative for typical inputs', () => {
    const m = computeNaturalness('function component() { return null; }');
    expect(Number.isFinite(m.entropy)).toBe(true);
    expect(m.entropy).toBeGreaterThanOrEqual(0);
    expect(m.perplexity).toBeGreaterThanOrEqual(1);
  });

  it('perplexity is 2 ** entropy', () => {
    const m = computeNaturalness('const x = computeY(arr.map(item => item.id));');
    expect(m.perplexity).toBeCloseTo(Math.pow(2, m.entropy), 6);
  });
});

describe('engine/naturalness — computeNaturalnessForRange', () => {
  it('returns metrics for a valid line range', () => {
    const src = [
      'line one',     // line 1: 8 chars, ends at offset 8
      'line two',     // line 2: 8 chars, ends at offset 17
      'const a = 1;', // line 3: 12 chars, ends at offset 30
      'const b = 2;', // line 4: 12 chars, ends at offset 43
      'const c = 3;', // line 5: 12 chars, ends at offset 56
      'const d = 4;', // line 6: 12 chars, ends at offset 69
    ].join('\n');
    // buildLineOffsets: offsets[i] = byte offset of the start of line (i+1).
    // Line 1 starts at 0; each \n is 1 byte; line content length follows.
    const offsets = [0, 9, 18, 31, 44, 57];
    const m = computeNaturalnessForRange(src, offsets, 3, 6);
    // Lines 3..6 contain: const a 1 const b 2 const c 3 const d 4 = 12 tokens.
    expect(m.length).toBe(12);
    // distinctTokenRatio: {const, a, b, c, d, 1, 2, 3, 4} = 9 distinct / 12 = 0.75.
    expect(m.distinctTokenRatio).toBeGreaterThan(0.6);
    expect(m.distinctTokenRatio).toBeLessThan(1);
  });

  it('falls back to file-level for empty / degenerate ranges', () => {
    const src = 'const a = 1;';
    const m1 = computeNaturalnessForRange(src, [0], 5, 5);
    const m2 = computeNaturalness(src);
    // Both should produce the same metrics for this trivial source.
    expect(m1.length).toBe(m2.length);
  });

  it('repetitive slice across a range flags as low-distinct', () => {
    // 60 identical tokens → distinctTokenRatio = 1/60 ≈ 0.017.
    const src = 'data '.repeat(60).trim();
    const m = computeNaturalness(src);
    expect(m.length).toBe(60);
    expect(m.distinctTokenRatio).toBeLessThan(0.3);
  });
});
