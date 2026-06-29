import { describe, expect, it } from 'vitest';
import {
  computeAiMaintenanceCost,
  computeAiMaintenanceCostFromReport,
  bucketFromHealth,
  adviceForBucket,
  computeMonthlyUSD,
  MAINTENANCE_COST_WEIGHTS,
  MAINTENANCE_SECURITY_NUMERIC,
  MAINTENANCE_COST_THRESHOLDS,
  MAINTENANCE_PER_ISSUE_USD,
  MAINTENANCE_LOC_BASELINE_USD,
  MAINTENANCE_BUCKET_MULTIPLIER,
  MAINTENANCE_AI_MULTIPLIER,
} from '../../src/engine/maintenance-cost';
import type {
  AiMaintenanceCost,
  MaintenanceAxes,
} from '../../src/types';

describe('bucketFromHealth', () => {
  it('maps exact threshold boundaries correctly', () => {
    expect(bucketFromHealth(100)).toBe('low');
    expect(bucketFromHealth(80)).toBe('low');
    expect(bucketFromHealth(79.9)).toBe('medium');
    expect(bucketFromHealth(60)).toBe('medium');
    expect(bucketFromHealth(59.9)).toBe('high');
    expect(bucketFromHealth(30)).toBe('high');
    expect(bucketFromHealth(29.9)).toBe('critical');
    expect(bucketFromHealth(0)).toBe('critical');
  });

  it('matches the documented MAINTENANCE_COST_THRESHOLDS', () => {
    expect(bucketFromHealth(MAINTENANCE_COST_THRESHOLDS.low)).toBe('low');
    // medium-0.01 is below the medium threshold (60), so it lands in 'high'
    expect(bucketFromHealth(MAINTENANCE_COST_THRESHOLDS.medium - 0.01)).toBe('high');
    expect(bucketFromHealth(MAINTENANCE_COST_THRESHOLDS.medium)).toBe('medium');
    // high-0.01 is below the high threshold (30), so it lands in 'critical'
    expect(bucketFromHealth(MAINTENANCE_COST_THRESHOLDS.high - 0.01)).toBe('critical');
    expect(bucketFromHealth(MAINTENANCE_COST_THRESHOLDS.high)).toBe('high');
    expect(bucketFromHealth(MAINTENANCE_COST_THRESHOLDS.high - 1)).toBe('critical');
  });
});

describe('adviceForBucket', () => {
  it('returns distinct, actionable advice for every bucket', () => {
    const advices: Record<AiMaintenanceCost, string> = {
      low: adviceForBucket('low'),
      medium: adviceForBucket('medium'),
      high: adviceForBucket('high'),
      critical: adviceForBucket('critical'),
    };
    expect(advices.low).toMatch(/low|continue|quarterly/i);
    expect(advices.medium).toMatch(/schedule|cleanup/i);
    expect(advices.high).toMatch(/high|block/i);
    expect(advices.critical).toMatch(/critical|refactor sprint/i);
  });
});

describe('computeMonthlyUSD', () => {
  it('returns 0 for very small projects (no issues, no LoC)', () => {
    const usd = computeMonthlyUSD(100, 0, 0, 0, 0, false);
    expect(usd).toBe(0);
  });

  it('scales linearly with LoC at the same bucket', () => {
    const a = computeMonthlyUSD(85, 0, 0, 0, 10_000, false);
    const b = computeMonthlyUSD(85, 0, 0, 0, 20_000, false);
    expect(b).toBeGreaterThan(a);
    expect(b / a).toBeCloseTo(2, 1);
  });

  it('multiplies by 1.8 when AI signals are present', () => {
    const withoutAi = computeMonthlyUSD(85, 5, 10, 5, 50_000, false);
    const withAi = computeMonthlyUSD(85, 5, 10, 5, 50_000, true);
    expect(withAi).toBeGreaterThan(withoutAi);
    // Sanity: AI multiplier is exactly 1.8x on the issue-cost + loc-baseline
    const ratio = withAi / withoutAi;
    expect(ratio).toBeCloseTo(MAINTENANCE_AI_MULTIPLIER, 1);
  });

  it('uses per-issue costs from the CodeClimate grade mapping', () => {
    const high = computeMonthlyUSD(85, 1, 0, 0, 0, false);
    const med = computeMonthlyUSD(85, 0, 1, 0, 0, false);
    const low = computeMonthlyUSD(85, 0, 0, 1, 0, false);
    expect(high).toBe(MAINTENANCE_PER_ISSUE_USD.high);
    expect(med).toBe(MAINTENANCE_PER_ISSUE_USD.medium);
    expect(low).toBe(MAINTENANCE_PER_ISSUE_USD.low);
  });

  it('honors the bucket multiplier', () => {
    const lowBucket = computeMonthlyUSD(95, 0, 0, 0, 50_000, false);
    const highBucket = computeMonthlyUSD(50, 0, 0, 0, 50_000, false);
    // 50 is "high" bucket (2.0x), 95 is "low" bucket (0.5x) → 4x ratio
    expect(highBucket / lowBucket).toBeCloseTo(4, 1);
  });
});

describe('computeAiMaintenanceCost', () => {
  it('returns the "low" bucket for a clean repo', () => {
    const result = computeAiMaintenanceCost({
      aiQuality: 5, engineeringHygiene: 5, security: 5, repositoryHealth: 5,
      architectureConsistency: 95,
      aiSecurityRisk: 'low',
      constitutionViolations: 0,
      designTokenDrift: { spacing: 0, radius: 0 },
      highSeverityIssueCount: 0,
      linesOfCode: 10_000,
      hasAiSignals: false,
    });
    expect(result.cost).toBe('low');
    expect(result.health).toBeGreaterThan(80);
    expect(result.monthlyUSD).toBeGreaterThan(0);
    expect(result.axes).toHaveLength(6);
  });

  it('returns "critical" for the worst-case input', () => {
    const result = computeAiMaintenanceCost({
      aiQuality: 90, engineeringHygiene: 90, security: 90, repositoryHealth: 90,
      architectureConsistency: 10,
      aiSecurityRisk: 'critical',
      constitutionViolations: 50,
      designTokenDrift: { spacing: 200, radius: 200 },
      highSeverityIssueCount: 30,
      linesOfCode: 200_000,
      hasAiSignals: true,
    });
    expect(result.cost).toBe('critical');
    expect(result.health).toBeLessThan(20);
    expect(result.monthlyUSD).toBeGreaterThan(0);
  });

  it('default-axes land in the "low" bucket (defaults are optimistic)', () => {
    const result = computeAiMaintenanceCost({});
    // Defaults: slopIndex 70 (after invert), architecture 70, security 100,
    // constitution 100, design-tokens 100, high-severity 100.
    // Weighted: 70*0.20 + 70*0.25 + 100*0.30 + 100*0.10 + 100*0.10 + 100*0.05 = 87.5
    // That lands in the "low" band (>= 80). Documenting this behavior —
    // we never default a project to "high" without a measured signal.
    expect(result.cost).toBe('low');
    expect(result.health).toBeGreaterThan(80);
  });

  it('sorts axes by health ascending (worst first)', () => {
    const result = computeAiMaintenanceCost({
      aiQuality: 5, engineeringHygiene: 5, security: 5, repositoryHealth: 5,
      architectureConsistency: 95,
      aiSecurityRisk: 'critical',
      constitutionViolations: 0,
      highSeverityIssueCount: 0,
    });
    const healths = result.axes.map((a) => a.health);
    for (let i = 1; i < healths.length; i++) {
      expect(healths[i] ?? 0).toBeGreaterThanOrEqual(healths[i - 1] ?? 0);
    }
    // AI Security Risk should be the worst (0/100)
    expect(result.axes[0]?.axis).toBe('aiSecurityRisk');
  });

  it('sanity check vs Sonar published $306K/yr/MLoC', () => {
    // 100k LoC, medium bucket, 50 issues (10 high / 30 medium / 10 low), AI signals on
    const usd = computeMonthlyUSD(
      bucketFromHealth(70) === 'low' ? 80 : 70,
      10, 30, 10,
      100_000,
      true,
    );
    // Expected: (100 * 25.50 * 1.0 + (10*400 + 30*150 + 10*50)) * 1.8 ≈ $20,800
    expect(usd).toBeGreaterThanOrEqual(19_000);
    expect(usd).toBeLessThanOrEqual(23_000);
  });
});

describe('computeAiMaintenanceCostFromReport', () => {
  it('derives per-severity counts from the issues list', () => {
    const result = computeAiMaintenanceCostFromReport(
      {
        aiQuality: 50, engineeringHygiene: 50, security: 50, repositoryHealth: 50,
        architectureConsistency: 50,
        aiSecurityRisk: 'medium',
        highSeverityIssueCount: undefined, // let the wrapper derive
        issues: [
          { severity: 'high' },
          { severity: 'high' },
          { severity: 'medium' },
          { severity: 'low' },
          { severity: 'low' },
          { severity: 'low' },
        ],
        fileCount: 100,
      },
      { hasAiSignals: false },
    );
    // health is ~ (50*0.20 + 50*0.25 + 70*0.30 + 100*0.10 + 100*0.10 + 90*0.05) / 1.0
    // = (10 + 12.5 + 21 + 10 + 10 + 4.5) / 1.0 = 68
    expect(result.health).toBeGreaterThan(60);
    expect(result.health).toBeLessThan(75);
    // 3 low + 1 medium + 2 high issues + LoC baseline → non-zero USD
    expect(result.monthlyUSD).toBeGreaterThan(0);
  });

  it('respects explicit linesOfCode override', () => {
    const a = computeAiMaintenanceCostFromReport(
      { aiQuality: 30, engineeringHygiene: 30, security: 30, repositoryHealth: 30, fileCount: 10 },
      { linesOfCode: 1000 },
    );
    const b = computeAiMaintenanceCostFromReport(
      { aiQuality: 30, engineeringHygiene: 30, security: 30, repositoryHealth: 30, fileCount: 10 },
      { linesOfCode: 100_000 },
    );
    expect(b.monthlyUSD).toBeGreaterThan(a.monthlyUSD);
  });
});

describe('MAINTENANCE_COST_WEIGHTS / MAINTENANCE_SECURITY_NUMERIC', () => {
  it('weights sum to exactly 1.0', () => {
    const sum = Object.values(MAINTENANCE_COST_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it('security numeric mapping is monotonic and bounded 0-100', () => {
    const values = Object.values(MAINTENANCE_SECURITY_NUMERIC);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    // low > medium > high > critical
    expect(MAINTENANCE_SECURITY_NUMERIC.low).toBeGreaterThan(MAINTENANCE_SECURITY_NUMERIC.medium);
    expect(MAINTENANCE_SECURITY_NUMERIC.medium).toBeGreaterThan(MAINTENANCE_SECURITY_NUMERIC.high);
    expect(MAINTENANCE_SECURITY_NUMERIC.high).toBeGreaterThan(MAINTENANCE_SECURITY_NUMERIC.critical);
  });

  it('bucket multipliers are strictly increasing with severity', () => {
    expect(MAINTENANCE_BUCKET_MULTIPLIER.low).toBeLessThan(MAINTENANCE_BUCKET_MULTIPLIER.medium);
    expect(MAINTENANCE_BUCKET_MULTIPLIER.medium).toBeLessThan(MAINTENANCE_BUCKET_MULTIPLIER.high);
    expect(MAINTENANCE_BUCKET_MULTIPLIER.high).toBeLessThan(MAINTENANCE_BUCKET_MULTIPLIER.critical);
  });

  it('LoC baseline matches Sonar published $306K/yr/MLoC', () => {
    // 1M LoC * 12 months = $306K → $25.50/1k LoC/month
    expect(MAINTENANCE_LOC_BASELINE_USD).toBeCloseTo(25.5, 1);
  });
});
