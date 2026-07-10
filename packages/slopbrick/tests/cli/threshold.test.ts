import { describe, expect, it } from 'vitest';
import { evaluateThresholdGate, failedThresholds, failedThresholdCount } from '../../src/cli/threshold';
import type { ProjectReport, ResolvedConfig } from '../../src/types';

const baseConfig: ResolvedConfig = {
  include: [],
  exclude: [],
  rules: {},
  thresholds: {
    meanSlop: 30,
    p90Slop: 60,
    individualSlopThreshold: 80,
    categoryThresholds: { security: 5, typo: 90 },
  },
} as unknown as ResolvedConfig;

function makeReport(overrides: Partial<ProjectReport> = {}): ProjectReport {
  return {
    version: '0.42.0',
    generatedAt: '2026-07-06T00:00:00.000Z',
    aiSlopScore: 25,
    engineeringHygiene: 80,
    security: 100,
    repositoryHealth: 80,
    assemblyHealth: 80,
    totalScore: 25,
    categoryScores: {
      visual: 5, typo: 50, wcag: 0, layout: 0, component: 0,
      logic: 0, arch: 0, perf: 0, security: 3, test: 0,
      docs: 0, db: 0, ai: 0, context: 0, product: 0, i18n: 0,
    },
    boundaryScore: 80, contextScore: 80, visualScore: 80,
    p90Score: 40, peakScore: 30,
    componentCount: 5, fileCount: 10,
    thresholds: baseConfig.thresholds,
    scoreValidity: 'valid',
    ...overrides,
  } as ProjectReport;
}

describe('v0.42.0: failedThresholds() and failedThresholdCount()', () => {
  it('returns an explicit non-gating result for an incomplete report', () => {
    const result = evaluateThresholdGate(makeReport({
      scoreValidity: 'incomplete',
      aiSlopScore: 99,
      p90Score: 99,
      peakScore: 99,
    }), baseConfig);

    expect(result).toEqual({ status: 'invalid', scoreValidity: 'incomplete' });
  });

  it('returns empty list when all scores are under threshold', () => {
    const report = makeReport({
      aiSlopScore: 10, p90Score: 20, peakScore: 30,
      categoryScores: { ...makeReport().categoryScores, security: 2, typo: 50 },
    });
    expect(failedThresholds(report, baseConfig)).toEqual([]);
    expect(failedThresholdCount(report, baseConfig)).toBe(0);
  });

  it('names meanSlop when aiSlopScore exceeds the configured meanSlop', () => {
    // Use the slopbrick repo's stricter config (meanSlop: 15) with
    // its actual score (25). The default config has meanSlop: 30,
    // so a score of 25 wouldn't trip it.
    const strictConfig = {
      ...baseConfig,
      thresholds: { ...baseConfig.thresholds, meanSlop: 15 },
    } as ResolvedConfig;
    const report = makeReport({ aiSlopScore: 25 });
    expect(failedThresholds(report, strictConfig)).toEqual(['meanSlop']);
    expect(failedThresholdCount(report, strictConfig)).toBe(1);
  });

  it('names all gates independently when multiple fail', () => {
    const report = makeReport({
      aiSlopScore: 50, // > meanSlop 30
      p90Score: 70,    // > p90Slop 60
      peakScore: 90,   // > individualSlopThreshold 80
      categoryScores: { ...makeReport().categoryScores, security: 10, typo: 95 }, // both fail
    });
    expect(failedThresholds(report, baseConfig).sort()).toEqual([
      'category:security',
      'category:typo',
      'individualSlopThreshold',
      'meanSlop',
      'p90Slop',
    ]);
    expect(failedThresholdCount(report, baseConfig)).toBe(5);
  });

  it('failedThresholdCount is consistent with failedThresholds().length', () => {
    // The bug we're guarding against: the count and the names diverging.
    const report = makeReport({ aiSlopScore: 50 });
    expect(failedThresholdCount(report, baseConfig)).toBe(failedThresholds(report, baseConfig).length);
  });

  it('treats per-category thresholds correctly when only some fail', () => {
    const report = makeReport({
      categoryScores: { ...makeReport().categoryScores, security: 10 /* fail */, typo: 50 /* pass */ },
    });
    expect(failedThresholds(report, baseConfig)).toEqual(['category:security']);
  });
});
