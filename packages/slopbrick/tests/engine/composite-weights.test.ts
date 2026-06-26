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

  it('default weights produce boundary=0.40 / context=0.35 / visual=0.25', () => {
    const report = aggregateReport(scores, issueGroups, makeConfig());
    expect(report.boundaryScore).toBeGreaterThan(0);
    expect(report.contextScore).toBeGreaterThan(0);
    expect(report.visualScore).toBeGreaterThan(0);
    const expected = 0.4 * report.boundaryScore + 0.35 * report.contextScore + 0.25 * report.visualScore;
    expect(report.slopIndex).toBeCloseTo(expected, 5);
  });

  it('compositeWeights override changes slopIndex', () => {
    const defaultReport = aggregateReport(scores, issueGroups, makeConfig());
    const flippedReport = aggregateReport(
      scores,
      issueGroups,
      makeConfig({ compositeWeights: { boundary: 0.10, context: 0.10, visual: 0.80 } }),
    );
    // Visual dominates now → flippedReport.slopIndex should differ.
    expect(flippedReport.slopIndex).not.toBe(defaultReport.slopIndex);
  });

  it('compositeWeights with boundary=1 forces boundary-only scoring', () => {
    const result = aggregateReport(
      scores,
      issueGroups,
      makeConfig({ compositeWeights: { boundary: 1.0, context: 0, visual: 0 } }),
    );
    expect(result.slopIndex).toBeCloseTo(result.boundaryScore, 5);
    expect(result.contextScore).toBeGreaterThan(0); // computed but not weighted
  });
});