/**
 * v0.18.6+: Behavioral tests for the engine's math library.
 *
 * The engine's entire value proposition is "calibrated, citation-backed
 * math." Until this file, the only test was `api.test.ts` — a snapshot
 * asserting exports exist. None of the math itself was verified. These
 * tests cover the highest-leverage pure functions with:
 *
 *   - Known-answer tests (input → expected output, hand-verified).
 *   - Property tests (invariants that must hold for any input).
 *   - Edge cases (empty input, boundary values, smoothing).
 *
 * What is deliberately NOT tested here:
 *   - `parseFile` / `findSimilarFunctions` / `saveInventory` — these do
 *     I/O and belong behind integration tests once the MemoryIO refactor
 *     (v0.18.x R-H3) lands. See `tests/io.test.ts` (future).
 *   - `naturalness` / `spectral` / `mdl` — larger surface; add incrementally.
 */

import { describe, expect, it } from 'vitest';

import {
  computeLikelihoodRatios,
  bayesianPosterior,
  combineFireSet,
  DEFAULT_PRIOR,
} from '../src/lr-combiner';
import { ksStatistic, ksPValue, ksTest } from '../src/ks';
import { benjaminiHochberg, survivingFires } from '../src/multitest';
import { louvainCommunityDetection } from '../src/louvain';
import { buildPriorLogOdds, compositeScore } from '../src/composite-scoring';
import { computeZipfExponent, tokenizeIdentifiers } from '../src/zipf-heaps';
import { computeKLNovelty } from '../src/kl-novelty';
import type { SignalStrengthEntry } from '@usebrick/core';

// ---- shared fixtures -------------------------------------------------------

/** Two-rule calibration table with hand-checked P/R values. */
const SIGNAL: Record<string, SignalStrengthEntry> = {
  'ai/strong': {
    ruleId: 'ai/strong',
    recall: 0.5, // fires on 50% of AI files
    fpRate: 0.05, // fires on 5% of human files
    ratio: 10,
    precision: 0.9,
    lastCalibratedAt: '2026-01-01',
    verdict: 'USEFUL',
  },
  'ai/weak': {
    ruleId: 'ai/weak',
    recall: 0.1,
    fpRate: 0.1, // LR ≈ 1.0 — no signal
    ratio: 1,
    precision: 0.5,
    lastCalibratedAt: '2026-01-01',
    verdict: 'NOISY',
  },
  'ai/inverted': {
    ruleId: 'ai/inverted',
    recall: 0.05,
    fpRate: 0.5, // fires MORE on human code — LR < 1
    ratio: 0.1,
    precision: 0.1,
    lastCalibratedAt: '2026-01-01',
    verdict: 'INVERTED',
  },
};

const CORPUS = { nPositive: 1000, nNegative: 1000 };

// ---- LR combiner ----------------------------------------------------------

describe('computeLikelihoodRatios', () => {
  it('LR > 1 for rules that fire more on AI than human (strong signal)', () => {
    const lrs = computeLikelihoodRatios(['ai/strong'], SIGNAL, CORPUS);
    expect(lrs).toHaveLength(1);
    // tpRate ≈ recall = 0.5, fpRate ≈ 0.05 → LR ≈ 10. Smoothing skews
    // it slightly; assert the direction and a loose band.
    expect(lrs[0]!.lr).toBeGreaterThan(5);
    expect(lrs[0]!.lr).toBeLessThan(15);
    expect(lrs[0]!.logLr).toBeCloseTo(Math.log(lrs[0]!.lr), 6);
  });

  it('LR ≈ 1 for NOISY rules (no discriminative signal)', () => {
    const lrs = computeLikelihoodRatios(['ai/weak'], SIGNAL, CORPUS);
    expect(lrs[0]!.lr).toBeGreaterThan(0.8);
    expect(lrs[0]!.lr).toBeLessThan(1.2);
  });

  it('LR < 1 for INVERTED rules (fire more on human than AI)', () => {
    const lrs = computeLikelihoodRatios(['ai/inverted'], SIGNAL, CORPUS);
    expect(lrs[0]!.lr).toBeLessThan(0.5);
  });

  it('skips unknown rule ids (no entry in signal table)', () => {
    const lrs = computeLikelihoodRatios(['ai/unknown', 'ai/strong'], SIGNAL, CORPUS);
    expect(lrs).toHaveLength(1);
    expect(lrs[0]!.ruleId).toBe('ai/strong');
  });

  it('returns empty array for empty input', () => {
    expect(computeLikelihoodRatios([], SIGNAL, CORPUS)).toEqual([]);
  });

  it('applies additive smoothing (zero-recall rules still get finite LR)', () => {
    const zeroRecall: Record<string, SignalStrengthEntry> = {
      'ai/zero': { ...SIGNAL['ai/strong']!, recall: 0, fpRate: 0 },
    };
    const lrs = computeLikelihoodRatios(['ai/zero'], zeroRecall, CORPUS);
    expect(Number.isFinite(lrs[0]!.lr)).toBe(true);
    expect(lrs[0]!.lr).toBeGreaterThan(0);
  });
});

describe('bayesianPosterior', () => {
  it('returns the prior when no rules fired', () => {
    const posterior = bayesianPosterior([], [], { pAI: 0.3, pHuman: 0.7 });
    expect(posterior).toBeCloseTo(0.3, 6);
  });

  it('returns the prior when fired rules are all uncalibrated', () => {
    const posterior = bayesianPosterior(
      ['ai/unknown'],
      [],
      { pAI: 0.3, pHuman: 0.7 },
    );
    expect(posterior).toBeCloseTo(0.3, 6);
  });

  it('a strong AI signal pushes the posterior above the prior', () => {
    const lrs = computeLikelihoodRatios(['ai/strong'], SIGNAL, CORPUS);
    const prior = { pAI: 0.3, pHuman: 0.7 };
    const posterior = bayesianPosterior(['ai/strong'], lrs, prior);
    expect(posterior).toBeGreaterThan(prior.pAI);
    // LR ≈ 10 is strong evidence; posterior should be well above 0.3.
    expect(posterior).toBeGreaterThan(0.8);
  });

  it('an inverted signal pushes the posterior below the prior', () => {
    const lrs = computeLikelihoodRatios(['ai/inverted'], SIGNAL, CORPUS);
    const prior = { pAI: 0.5, pHuman: 0.5 };
    const posterior = bayesianPosterior(['ai/inverted'], lrs, prior);
    expect(posterior).toBeLessThan(prior.pAI);
  });

  it('posterior is always in [0, 1] regardless of inputs', () => {
    const lrs = computeLikelihoodRatios(['ai/strong'], SIGNAL, CORPUS);
    for (const prior of [
      { pAI: 0.001, pHuman: 0.999 },
      { pAI: 0.999, pHuman: 0.001 },
      DEFAULT_PRIOR,
    ]) {
      const posterior = bayesianPosterior(['ai/strong', 'ai/weak', 'ai/inverted'], lrs, prior);
      expect(posterior).toBeGreaterThanOrEqual(0);
      expect(posterior).toBeLessThanOrEqual(1);
    }
  });
});

describe('combineFireSet (end-to-end)', () => {
  it('a clean file (no fires) returns the prior', () => {
    const prior = { pAI: 0.3, pHuman: 0.7 };
    const result = combineFireSet([], SIGNAL, CORPUS, prior);
    expect(result.posterior).toBeCloseTo(0.3, 6);
  });

  it('multiple strong fires produce a higher posterior than one', () => {
    const twoStrong: Record<string, SignalStrengthEntry> = {
      'ai/strong-a': SIGNAL['ai/strong']!,
      'ai/strong-b': SIGNAL['ai/strong']!,
    };
    const one = combineFireSet(['ai/strong-a'], twoStrong, CORPUS, DEFAULT_PRIOR);
    const two = combineFireSet(['ai/strong-a', 'ai/strong-b'], twoStrong, CORPUS, DEFAULT_PRIOR);
    expect(two.posterior).toBeGreaterThan(one.posterior);
  });
});

// ---- KS test --------------------------------------------------------------

describe('ksStatistic / ksPValue', () => {
  it('returns 0 for identical distributions', () => {
    const a = [1, 2, 3, 4, 5];
    expect(ksStatistic(a, a)).toBe(0);
  });

  it('returns the max CDF gap for disjoint distributions', () => {
    // Two non-overlapping samples → D = 1 (CDFs never intersect).
    const a = [1, 2, 3];
    const b = [10, 11, 12];
    expect(ksStatistic(a, b)).toBeCloseTo(1, 6);
  });

  it('returns 1 for empty input (defensive)', () => {
    expect(ksStatistic([], [1, 2, 3])).toBe(1);
    expect(ksStatistic([1, 2, 3], [])).toBe(1);
  });

  it('ksPValue clamps to [0, 1] and handles boundaries', () => {
    expect(ksPValue(0, 100, 100)).toBe(1); // no difference → p = 1
    expect(ksPValue(1, 100, 100)).toBe(0); // max difference → p = 0
    expect(ksPValue(-0.5, 100, 100)).toBe(1); // negative → p = 1
    expect(ksPValue(1.5, 100, 100)).toBe(0); // >1 → p = 0
    expect(ksPValue(0, 0, 0)).toBe(1); // empty → p = 1
  });

  it('ksTest reports significance for clearly different samples', () => {
    const a = Array.from({ length: 50 }, (_, i) => i); // 0..49
    const b = Array.from({ length: 50 }, (_, i) => i + 100); // 100..149
    const result = ksTest(a, b);
    expect(result.statistic).toBeCloseTo(1, 6);
    expect(result.pValue).toBe(0);
    expect(result.significant).toBe(true);
  });

  it('ksTest reports non-significance for the same sample', () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = ksTest(a, a);
    expect(result.significant).toBe(false);
  });
});

// ---- Benjamini-Hochberg FDR -----------------------------------------------

describe('benjaminiHochberg', () => {
  it('rejects nothing when all p-values are large', () => {
    const result = benjaminiHochberg([0.5, 0.6, 0.7, 0.8], 0.05);
    expect(result.rejected.size).toBe(0);
  });

  it('rejects the smallest p-values when some cross the threshold', () => {
    // At alpha=0.05, n=4: critical values are 0.0125, 0.025, 0.0375, 0.05.
    // p=0.01 crosses rank-1; p=0.02 crosses rank-2; p=0.8 and p=0.9 don't.
    const result = benjaminiHochberg([0.01, 0.02, 0.8, 0.9], 0.05);
    expect(result.rejected.size).toBe(2);
    // Original indices 0 and 1 (the small p-values) should be rejected.
    expect(result.rejected.has(0)).toBe(true);
    expect(result.rejected.has(1)).toBe(true);
  });

  it('rejects everything when all p-values are tiny', () => {
    const result = benjaminiHochberg([0.001, 0.002, 0.003], 0.05);
    expect(result.rejected.size).toBe(3);
  });

  it('throws on alpha outside [0, 1]', () => {
    expect(() => benjaminiHochberg([0.5], -0.1)).toThrow(RangeError);
    expect(() => benjaminiHochberg([0.5], 1.1)).toThrow(RangeError);
  });

  it('treats NaN p-values as 1 (conservative — never rejected)', () => {
    const result = benjaminiHochberg([NaN, 0.001], 0.05);
    expect(result.rejected.has(1)).toBe(true); // the valid small one
    expect(result.rejected.has(0)).toBe(false); // NaN → 1 → not rejected
  });

  it('returns empty rejected set for empty input', () => {
    const result = benjaminiHochberg([], 0.05);
    expect(result.rejected.size).toBe(0);
  });
});

describe('survivingFires', () => {
  it('keeps only fires whose rule survived BH correction', () => {
    // Two rules fired; 'ai/a' has a low baseline FPR (small p-value,
    // survives), 'ai/b' has a high baseline FPR (large p-value, rejected).
    const fires = new Map<string, boolean>([
      ['ai/a', true],
      ['ai/b', true],
    ]);
    const baselineFprs = new Map<string, number>([
      ['ai/a', 0.001], // tiny FPR → small p → survives
      ['ai/b', 0.9],   // huge FPR → large p → rejected
    ]);
    const survivors = survivingFires(fires, baselineFprs, 0.05);
    expect(survivors.has('ai/a')).toBe(true);
    expect(survivors.has('ai/b')).toBe(false);
  });

  it('returns empty set when nothing fired', () => {
    const fires = new Map<string, boolean>([['ai/a', false]]);
    const baselineFprs = new Map<string, number>([['ai/a', 0.001]]);
    const survivors = survivingFires(fires, baselineFprs);
    expect(survivors.size).toBe(0);
  });
});

// ---- Louvain community detection ------------------------------------------
//
// `louvainCommunityDetection` takes a `{nodes, edges: [u,v,w][]}` graph
// directly (buildImportGraph wraps an InventoryFile, which is heavier to
// mock; we test the algorithm against synthetic graphs here).

describe('louvainCommunityDetection', () => {
  it('returns empty communities for an empty graph', () => {
    const result = louvainCommunityDetection({ nodes: [], edges: [] });
    expect(result.communities.length).toBe(0);
  });

  it('returns per-node singletons (modularity 0) for a graph with no edges', () => {
    const result = louvainCommunityDetection({ nodes: ['a', 'b', 'c'], edges: [] });
    expect(result.communities.length).toBe(3);
    expect(result.modularity).toBe(0);
  });

  it('puts a tightly-connected triangle in one community', () => {
    const edges: Array<[string, string, number]> = [
      ['a', 'b', 1],
      ['b', 'c', 1],
      ['a', 'c', 1],
    ];
    const result = louvainCommunityDetection({ nodes: ['a', 'b', 'c'], edges });
    expect(result.communities.length).toBe(1);
    // Community `files` should contain all three nodes.
    const allFiles = result.communities.flatMap((c) => c.files);
    expect(allFiles).toEqual(expect.arrayContaining(['a', 'b', 'c']));
  });

  it('splits two cliques connected by a single weak edge', () => {
    // Clique 1: a-b-c. Clique 2: x-y-z. Single bridge: c-x.
    const edges: Array<[string, string, number]> = [
      ['a', 'b', 1], ['b', 'c', 1], ['a', 'c', 1],
      ['x', 'y', 1], ['y', 'z', 1], ['x', 'z', 1],
      ['c', 'x', 1], // the bridge
    ];
    const result = louvainCommunityDetection(
      { nodes: ['a', 'b', 'c', 'x', 'y', 'z'], edges },
    );
    // Louvain typically splits at the bridge → 2 communities.
    expect(result.communities.length).toBe(2);
  });
});

// ---- composite scoring ----------------------------------------------------

describe('compositeScore', () => {
  it('returns the prior probability when no rules fired', () => {
    const prior = 0.3;
    const result = compositeScore([], {});
    // The composite score for empty fires collapses to the prior log-odds
    // → sigmoid(prior log-odds) = prior.
    expect(result.probability).toBeCloseTo(prior, 1);
  });

  it('produces finite, bounded output for any fire set', () => {
    const result = compositeScore(['ai/strong', 'ai/weak', 'ai/inverted'], SIGNAL);
    expect(Number.isFinite(result.probability)).toBe(true);
    expect(result.probability).toBeGreaterThanOrEqual(0);
    expect(result.probability).toBeLessThanOrEqual(1);
  });
});

describe('buildPriorLogOdds', () => {
  it('log-odds of 0.5 prevalence is 0', () => {
    expect(buildPriorLogOdds(0.5)).toBeCloseTo(0, 6);
  });

  it('log-odds of 0.1 prevalence is negative (AI is a priori unlikely)', () => {
    expect(buildPriorLogOdds(0.1)).toBeLessThan(0);
  });

  it('log-odds of 0.9 prevalence is positive', () => {
    expect(buildPriorLogOdds(0.9)).toBeGreaterThan(0);
  });
});

// ---- Zipf / Heaps ---------------------------------------------------------

describe('computeZipfExponent', () => {
  it('returns ≈ 1.0 for a Zipfian frequency distribution', () => {
    // Zipf: frequency ∝ 1/rank. Build a frequency map directly.
    const freqs = new Map<string, number>();
    for (let rank = 1; rank <= 20; rank++) {
      freqs.set(`tok${rank}`, Math.round(1000 / rank));
    }
    const fit = computeZipfExponent(freqs);
    // s = -slope; for f ∝ rank^(-1), slope ≈ -1 → s ≈ 1. Loose band.
    expect(fit.exponent).toBeGreaterThan(0.7);
    expect(fit.exponent).toBeLessThan(1.3);
  });

  it('handles a uniform distribution without crashing', () => {
    const freqs = new Map<string, number>([
      ['a', 2], ['b', 2], ['c', 2], ['d', 2],
    ]);
    const fit = computeZipfExponent(freqs);
    expect(Number.isFinite(fit.exponent)).toBe(true);
  });

  it('returns exponent 0 for a single-token vocabulary', () => {
    const fit = computeZipfExponent(new Map([['only', 5]]));
    expect(fit.exponent).toBe(0);
  });
});

describe('tokenizeIdentifiers', () => {
  it('extracts identifier-shaped tokens (lowercased, ≥2 chars)', () => {
    // tokenizeIdentifiers splits on non-identifier chars; it does NOT
    // split camelCase internally. So 'myVariableName' stays whole,
    // 'snake_case_var' stays whole. Both are lowercased.
    const tokens = tokenizeIdentifiers('const myVariableName = 1; let snake_case_var = 2;');
    expect(tokens).toEqual(expect.arrayContaining(['myvariablename', 'snake_case_var']));
    // Single-char tokens are dropped.
    expect(tokens).not.toContain('a');
  });
});

// ---- KL novelty -----------------------------------------------------------

describe('computeKLNovelty', () => {
  it('KL divergence is 0 for identical frequency distributions', () => {
    const p = new Map([['a', 25], ['b', 25], ['c', 25], ['d', 25]]);
    expect(computeKLNovelty(p, p)).toBeCloseTo(0, 6);
  });

  it('KL divergence is positive for different distributions', () => {
    const project = new Map([['a', 90], ['b', 10]]);
    const corpus = new Map([['a', 10], ['b', 90]]);
    expect(computeKLNovelty(project, corpus)).toBeGreaterThan(0);
  });

  it('KL divergence is finite even when corpus lacks a token (epsilon smoothing)', () => {
    const project = new Map([['a', 5], ['b', 5]]);
    const corpus = new Map([['a', 10]]); // 'b' absent → naive KL = Infinity
    const result = computeKLNovelty(project, corpus);
    expect(Number.isFinite(result)).toBe(true);
  });

  it('returns 0 for an empty project (nothing to compare)', () => {
    expect(computeKLNovelty(new Map(), new Map([['a', 10]]))).toBe(0);
  });
});
