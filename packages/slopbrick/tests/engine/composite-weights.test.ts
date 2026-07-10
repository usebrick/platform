import { describe, it, expect } from 'vitest';
import { aggregateReport } from '../../src/engine/metrics';
import type { ComponentScore, ResolvedConfig } from '../../src/types';

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    include: [],
    exclude: [],
    rules: {},
    frameworkMultipliers: {},
    ruleConfig: {},
    arbitraryValueAllowlist: [],
    wcag: { targetSizeExemptSelectors: [] },
    thresholds: { meanSlop: 15, p90Slop: 30, individualSlopThreshold: 60 },
    ...overrides,
  };
}

describe('compositeWeights override', () => {
  // Asymmetric fixture: visual subscore is high, boundary/context are low.
  // That makes the weights matter: flipping visual weight changes the total.
  const scores: ComponentScore[] = [
    { filePath: 'A.tsx', rawScore: 0, componentScore: 50, adjustedScore: 50, componentCount: 10 },
  ];
  const issueGroups = [
    {
      filePath: 'A.tsx',
      issues: [
        // 5 visual issues (high severity) + 1 boundary + 1 context
        ...Array.from({ length: 5 }, () => ({
          ruleId: 'visual/math-default-font',
          category: 'visual' as const,
          severity: 'high' as const,
          filePath: 'A.tsx',
        })),
        { ruleId: 'logic/boundary-violation', category: 'logic' as const, severity: 'high' as const, filePath: 'A.tsx' },
        { ruleId: 'logic/ghost-defensive', category: 'logic' as const, severity: 'high' as const, filePath: 'A.tsx' },
      ],
    },
  ];
  // Use an explicit exposure denominator so the asymmetric fixture exercises
  // weight changes instead of saturating every bucket on a single file.
  const aggregate = (config: ResolvedConfig) =>
    aggregateReport(scores, issueGroups, config, undefined, 10);

  it('default weights produce boundary=0.40 / context=0.35 / visual=0.25', () => {
    // v0.21.0: slopIndex is the RAW amount of slop (0=clean, 100=saturated).
    // The sub-scores (boundary/context/visual) are cleanliness (100 - raw).
    // So the relationship is:
    //   slopIndex = 100 - (0.4*boundary + 0.35*context + 0.25*visual)
    // (sub-scores summed give total cleanliness; inverted = total slop).
    const report = aggregate(makeConfig());
    expect(report.boundaryScore).toBeGreaterThan(0);
    expect(report.contextScore).toBeGreaterThan(0);
    expect(report.visualScore).toBeGreaterThan(0);
    const subscoreSum = 0.4 * report.boundaryScore + 0.35 * report.contextScore + 0.25 * report.visualScore;
    const expected = 100 - subscoreSum;
    expect(report.slopIndex).toBeCloseTo(expected, 5);
  });

  it('compositeWeights override changes slopIndex', () => {
    // v0.21.0: slopIndex = raw slop amount. With visual high and
    // visual weight increased, slopIndex should INCREASE (more slop).
    // (Was: visual high + visual weight increased → slopIndex lower
    // in the v0.20.1 inverted reading.)
    const defaultReport = aggregate(makeConfig());
    const flippedReport = aggregate(makeConfig({ compositeWeights: { boundary: 0.10, context: 0.10, visual: 0.80 } }));
    expect(flippedReport.slopIndex).not.toBe(defaultReport.slopIndex);
  });

  it('compositeWeights with boundary=1 forces boundary-only scoring', () => {
    // v0.21.0: slopIndex = raw slop amount = 100 - boundaryScore (when
    // boundary-only weighting). The test asserts the inverse relationship
    // between slopIndex (raw) and boundaryScore (cleanliness).
    const result = aggregate(makeConfig({ compositeWeights: { boundary: 1.0, context: 0, visual: 0 } }));
    expect(result.slopIndex).toBeCloseTo(100 - result.boundaryScore, 5);
    expect(result.contextScore).toBeGreaterThan(0); // computed but not weighted
  });
});
