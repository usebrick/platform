import { describe, expect, it } from 'vitest';

import {
  computeKLNovelty,
  KL_NOVELTY_EPSILON,
} from '../../src/engine/kl-novelty';

describe('computeKLNovelty', () => {
  it('returns 0 for identical distributions (KL = 0 by Gibbs inequality)', () => {
    // Same frequencies → same distribution → KL = 0 (Kullback & Leibler 1951, §3).
    const project = new Map<string, number>([
      ['zustand', 5],
      ['redux', 3],
      ['jotai', 2],
    ]);
    const corpus = new Map<string, number>([
      ['zustand', 5],
      ['redux', 3],
      ['jotai', 2],
    ]);
    const kl = computeKLNovelty(project, corpus);
    expect(kl).toBe(0);
  });

  it('returns 0 when both inputs are empty', () => {
    const kl = computeKLNovelty(new Map(), new Map());
    expect(kl).toBe(0);
  });

  it('returns a positive value when the project distribution is shifted away from corpus', () => {
    // Project uses only `zustand`; corpus is dominated by `redux`. The
    // project's mass is concentrated on a low-corpus-probability key,
    // so KL(P_project ‖ P_corpus) must be > 0.
    const project = new Map<string, number>([
      ['zustand', 10],
    ]);
    const corpus = new Map<string, number>([
      ['redux', 100],
      ['zustand', 1],
    ]);
    const kl = computeKLNovelty(project, corpus);
    expect(kl).toBeGreaterThan(0);
    // zustand corpus probability is 1/101 ≈ 0.0099; project probability is 1.0.
    // Expected KL ≈ 1 · log(1 / (1/101)) = log(101) ≈ 4.615 nats.
    expect(kl).toBeCloseTo(Math.log(101), 6);
  });

  it('handles missing corpus keys gracefully without producing Infinity or NaN', () => {
    // `newstate` appears in the project but not in the corpus. Without
    // smoothing the term would be log(pProject / 0) = +∞. With the
    // additive ε smoothing it should stay finite and > 0.
    const project = new Map<string, number>([
      ['newstate', 4],
      ['redux', 1],
    ]);
    const corpus = new Map<string, number>([
      ['redux', 10],
    ]);
    const kl = computeKLNovelty(project, corpus);
    expect(Number.isFinite(kl)).toBe(true);
    expect(kl).toBeGreaterThan(0);
    // The missing-key contribution is bounded by -log(EPSILON) ≈ 27.63
    // nats per unit mass, so the total stays well under that ceiling.
    expect(kl).toBeLessThan(30);
  });

  it('handles a fully-missing corpus by treating every project key as smoothed', () => {
    // Empty corpus → every project key gets ε probability → KL is
    // bounded but stays finite.
    const project = new Map<string, number>([
      ['a', 2],
      ['b', 3],
    ]);
    const kl = computeKLNovelty(project, new Map());
    expect(Number.isFinite(kl)).toBe(true);
    expect(kl).toBeGreaterThan(0);
    // With ε smoothing and an empty corpus:
    //   KL = Σ p_i · log(p_i / ε)
    //      = Σ p_i · log(p_i) - log(ε) · Σ p_i
    //      = -H(project) - log(ε)
    // where H is the Shannon entropy of the project distribution in
    // nats. For {2,3} mass (p_a=0.4, p_b=0.6) that's
    // -0.673 - log(1e-12) ≈ -0.673 + 27.631 ≈ 26.958.
    const expected =
      (0.4 * Math.log(0.4) + 0.6 * Math.log(0.6)) -
      Math.log(KL_NOVELTY_EPSILON);
    expect(kl).toBeCloseTo(expected, 6);
  });

  it('normalizes raw counts correctly so scale of input does not affect KL', () => {
    // Doubling every project count must produce the same KL — the
    // function normalizes internally. Doubling the corpus counts must
    // also leave KL invariant (both are normalized to probability 1).
    const project = new Map<string, number>([
      ['zustand', 3],
      ['redux', 1],
    ]);
    const corpus = new Map<string, number>([
      ['zustand', 6],
      ['redux', 2],
    ]);
    const baseKl = computeKLNovelty(project, corpus);

    const project2x = new Map<string, number>([
      ['zustand', 6],
      ['redux', 2],
    ]);
    expect(computeKLNovelty(project2x, corpus)).toBeCloseTo(baseKl, 10);

    const corpus2x = new Map<string, number>([
      ['zustand', 12],
      ['redux', 4],
    ]);
    expect(computeKLNovelty(project, corpus2x)).toBeCloseTo(baseKl, 10);
  });

  it('returns 0 for an empty project even when corpus has mass', () => {
    const kl = computeKLNovelty(new Map(), new Map([['redux', 5]]));
    expect(kl).toBe(0);
  });

  it('produces a strictly larger KL when mass moves from a high-prob corpus key to a low-prob one', () => {
    // Monotonicity sanity check: shifting project mass toward a rarer
    // corpus key should increase KL.
    const corpus = new Map<string, number>([
      ['common', 1000],
      ['rare', 1],
    ]);
    const baseline = new Map<string, number>([
      ['common', 5],
      ['rare', 0],
    ]);
    const shifted = new Map<string, number>([
      ['common', 4],
      ['rare', 1],
    ]);
    const baselineKl = computeKLNovelty(baseline, corpus);
    const shiftedKl = computeKLNovelty(shifted, corpus);
    expect(shiftedKl).toBeGreaterThan(baselineKl);
  });
});
