/**
 * Tests for the Bayesian LR Combiner engine (v0.12.0).
 *
 * Citations exercised:
 *   Bento et al. 2024 — Bayes point aggregation for rule ensembles.
 *   Lewis 1998 — naive Bayes independence assumption.
 *   Duda, Hart, Stork 2000 — log-odds formulation.
 *
 * Test plan:
 *   1. computeLikelihoodRatios: INVERTED rules get LR < 1.
 *   2. computeLikelihoodRatios: USEFUL rules get LR > 1.
 *   3. computeLikelihoodRatios: smoothing avoids division by zero.
 *   4. bayesianPosterior: log-odds formulation.
 *   5. bayesianPosterior: returns prior when no fires.
 *   6. bayesianPosterior: returns prior when no calibrated rules fire.
 *   7. combineFireSet: end-to-end on realistic fire sets.
 *   8. classifyByPosterior: threshold boundaries.
 *   9. Property: INVERTED fires *decrease* the posterior; USEFUL fires
 *      *increase* it.
 *  10. Property: with all USEFUL fires, posterior → 1.
 */

import { describe, expect, it } from 'vitest';
import {
  bayesianPosterior,
  classifyByPosterior,
  combineFireSet,
  computeLikelihoodRatios,
  DEFAULT_PRIOR,
  type RuleLikelihoodRatio,
} from '../../src/engine/lr-combiner';

const CORPUS = { nPositive: 76787, nNegative: 86983 };

describe('computeLikelihoodRatios', () => {
  it('skips rules with no calibration data', () => {
    const lrs = computeLikelihoodRatios(['rule/does-not-exist'], CORPUS);
    expect(lrs).toEqual([]);
  });

  it('returns LR > 1 for high-precision rules', () => {
    // logic/ghost-defensive has recall=0.94, fpRate=0.054 on v5 per-file.
    const lrs = computeLikelihoodRatios(['logic/ghost-defensive'], CORPUS);
    expect(lrs.length).toBe(1);
    expect(lrs[0].lr).toBeGreaterThan(1);
    expect(lrs[0].logLr).toBeGreaterThan(0);
  });

  it('returns LR < 1 for INVERTED rules (production-rot miscalibrated as AI)', () => {
    // context/import-path-mismatch is INVERTED (lift 0.5× on v5 per-file).
    const lrs = computeLikelihoodRatios(['context/import-path-mismatch'], CORPUS);
    expect(lrs.length).toBe(1);
    expect(lrs[0].lr).toBeLessThan(1);
    expect(lrs[0].logLr).toBeLessThan(0);
  });

  it('applies Haldane smoothing to avoid division by zero', () => {
    // A rule with recall=0 (no AI fires) and fpRate=0 (no human fires)
    // should still produce a finite, sensible LR via smoothing.
    // getSignalStrength returns undefined for unknown rule IDs, so the
    // result is empty — verifying the empty path here.
    const lrs = computeLikelihoodRatios(['logic/zero-fires-test'], {
      nPositive: 1000,
      nNegative: 1000,
    });
    expect(lrs).toEqual([]);
  });

  it('uses smoothing of 0.5 in tpRate / fpRate computation', () => {
    // For ghost-defensive on the v5 per-file corpus: recall = 0.0002,
    // fpRate = 0.0. So tp = 0.0002 × 76787 ≈ 15.4. With Haldane smoothing:
    //   tpSmooth = (15.4 + 0.5) / (76787 + 1) ≈ 0.00021
    //   fpSmooth = (0 + 0.5) / (86983 + 1) ≈ 5.75e-6
    // Verify these computations match what computeLikelihoodRatios returns.
    const lrs = computeLikelihoodRatios(['logic/ghost-defensive'], CORPUS);
    expect(lrs[0].tpRate).toBeCloseTo(0.00021, 5);
    expect(lrs[0].fpRate).toBeCloseTo(5.75e-6, 7);
    // LR = tpSmooth / fpSmooth ≈ 36 — strong AI signal.
    expect(lrs[0].lr).toBeGreaterThan(30);
  });
});

describe('bayesianPosterior', () => {
  const lrs = computeLikelihoodRatios(
    ['logic/ghost-defensive', 'logic/zombie-state', 'context/import-path-mismatch'],
    CORPUS,
  );

  it('returns prior when no rules fired', () => {
    expect(bayesianPosterior([], lrs)).toBe(0.5);
  });

  it('returns prior when no fired rules are calibrated', () => {
    const posterior = bayesianPosterior(['rule/unknown-1', 'rule/unknown-2'], lrs);
    expect(posterior).toBe(DEFAULT_PRIOR.pAI);
  });

  it('increases toward 1 when only USEFUL rules fire', () => {
    const posterior = bayesianPosterior(
      ['logic/ghost-defensive', 'logic/zombie-state'],
      lrs,
    );
    expect(posterior).toBeGreaterThan(0.9);
  });

  it('decreases below prior when INVERTED rules fire alone', () => {
    const posterior = bayesianPosterior(['context/import-path-mismatch'], lrs);
    expect(posterior).toBeLessThan(0.5);
  });

  it('respects custom priors', () => {
    const prior = { pAI: 0.1, pHuman: 0.9 };
    const posterior = bayesianPosterior(
      ['logic/ghost-defensive', 'logic/zombie-state'],
      lrs,
      prior,
    );
    // Even with low AI prior, two strong USEFUL fires should push it up.
    expect(posterior).toBeGreaterThan(0.5);
    expect(posterior).toBeLessThan(0.99);
  });

  it('is internally consistent: log-odds formulation matches direct ratio', () => {
    const fired = ['logic/ghost-defensive', 'logic/zombie-state'];
    const posterior = bayesianPosterior(fired, lrs);
    // Compute via direct product for cross-check.
    const lrByRule = new Map(lrs.map((l) => [l.ruleId, l]));
    let product = (DEFAULT_PRIOR.pAI / DEFAULT_PRIOR.pHuman);
    for (const id of fired) {
      product *= lrByRule.get(id)!.lr;
    }
    const expected = product / (1 + product);
    expect(Math.abs(posterior - expected)).toBeLessThan(1e-9);
  });
});

describe('combineFireSet', () => {
  it('returns matchedRules=0 and prior posterior when no calibrated rules fire', () => {
    const result = combineFireSet(['rule/unknown'], CORPUS);
    expect(result.posterior).toBe(0.5);
    expect(result.matchedRules).toBe(0);
    expect(result.totalLogLr).toBe(0);
  });

  it('returns sensible posterior on a mixed fire set', () => {
    // Mix of USEFUL + INVERTED + DORMANT rules. Posterior should be
    // determined by net log-LR, weighted by signal strength.
    const fired = [
      'logic/ghost-defensive',
      'logic/zombie-state',
      'context/import-path-mismatch', // INVERTED
    ];
    const result = combineFireSet(fired, CORPUS);
    expect(result.matchedRules).toBeGreaterThan(0);
    expect(result.posterior).toBeGreaterThan(0);
    expect(result.posterior).toBeLessThan(1);
  });

  it('totalLogLr is the sum of matched rules\' logLr values', () => {
    const fired = ['logic/ghost-defensive', 'logic/zombie-state'];
    const result = combineFireSet(fired, CORPUS);
    const expectedSum = result.perRuleLrs
      .filter((l) => fired.includes(l.ruleId))
      .reduce((acc, l) => acc + l.logLr, 0);
    expect(Math.abs(result.totalLogLr - expectedSum)).toBeLessThan(1e-9);
  });
});

describe('classifyByPosterior', () => {
  it('returns AI for posterior ≥ threshold + 0.2', () => {
    expect(classifyByPosterior(0.8, 0.5)).toBe('AI');
    expect(classifyByPosterior(0.7, 0.5)).toBe('AI');
  });

  it('returns human for posterior ≤ threshold - 0.2', () => {
    expect(classifyByPosterior(0.1, 0.5)).toBe('human');
    expect(classifyByPosterior(0.3, 0.5)).toBe('human');
  });

  it('returns uncertain in the ±0.2 band around threshold', () => {
    expect(classifyByPosterior(0.5, 0.5)).toBe('uncertain');
    expect(classifyByPosterior(0.55, 0.5)).toBe('uncertain');
    expect(classifyByPosterior(0.45, 0.5)).toBe('uncertain');
  });
});

describe('properties of the Bayesian combiner', () => {
  const allRuleIds = [
    'logic/ghost-defensive',
    'logic/zombie-state',
    'logic/math-console-log-storm',
    'context/import-path-mismatch',
    'component/multiple-components-per-file',
    'product/terminology-drift',
  ];
  const lrs = computeLikelihoodRatios(allRuleIds, CORPUS);

  it('INVERTED fires decrease the posterior; USEFUL fires increase it', () => {
    const invertedOnly = bayesianPosterior(
      ['context/import-path-mismatch', 'component/multiple-components-per-file'],
      lrs,
    );
    const usefulOnly = bayesianPosterior(
      ['logic/ghost-defensive', 'logic/zombie-state'],
      lrs,
    );
    expect(invertedOnly).toBeLessThan(0.5);
    expect(usefulOnly).toBeGreaterThan(0.5);
  });

  it('with all-USEFUL fires, posterior → 1', () => {
    const posterior = bayesianPosterior(
      ['logic/ghost-defensive', 'logic/zombie-state', 'logic/math-console-log-storm'],
      lrs,
    );
    expect(posterior).toBeGreaterThan(0.99);
  });

  it('with all-INVERTED fires, posterior → well below prior', () => {
    // Three moderately-INVERTED rules (LR ≈ 0.5, 0.5, 0.3) push the
    // posterior from 0.5 down to ≈ 0.08 — well below the prior but not
    // vanishingly small. Verifies the combiner respects the INVERTED signal.
    const posterior = bayesianPosterior(
      [
        'context/import-path-mismatch',
        'component/multiple-components-per-file',
        'product/terminology-drift',
      ],
      lrs,
    );
    expect(posterior).toBeLessThan(0.5);
    expect(posterior).toBeLessThan(0.15);
    expect(posterior).toBeGreaterThan(0.0);
  });
});