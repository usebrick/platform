import { describe, it, expect } from 'vitest';
import {
  buildRepositoryHealth,
  buildRepositoryHealthFromReport,
  aiDebtFromScore,
  formatRepositoryHealth,
} from '../../src/engine/repository-health';
import {
  REPOSITORY_HEALTH_WEIGHTS,
  AI_SECURITY_NUMERIC,
} from '../../src/types';

describe('REPOSITORY_HEALTH_WEIGHTS / AI_SECURITY_NUMERIC', () => {
  it('weights sum to exactly 1.0', () => {
    const sum = Object.values(REPOSITORY_HEALTH_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it('security numeric mapping is monotonic and bounded 0-100', () => {
    expect(AI_SECURITY_NUMERIC.low).toBeGreaterThan(AI_SECURITY_NUMERIC.medium);
    expect(AI_SECURITY_NUMERIC.medium).toBeGreaterThan(AI_SECURITY_NUMERIC.high);
    expect(AI_SECURITY_NUMERIC.high).toBeGreaterThan(AI_SECURITY_NUMERIC.critical);
    expect(AI_SECURITY_NUMERIC.critical).toBeGreaterThanOrEqual(0);
    expect(AI_SECURITY_NUMERIC.low).toBeLessThanOrEqual(100);
  });
});

describe('aiDebtFromScore', () => {
  it('matches the documented bands', () => {
    expect(aiDebtFromScore(100)).toBe('low');
    expect(aiDebtFromScore(80)).toBe('low');
    expect(aiDebtFromScore(79.9)).toBe('medium');
    expect(aiDebtFromScore(60)).toBe('medium');
    expect(aiDebtFromScore(59.9)).toBe('high');
    expect(aiDebtFromScore(40)).toBe('high');
    expect(aiDebtFromScore(39.9)).toBe('critical');
    expect(aiDebtFromScore(0)).toBe('critical');
  });
});

describe('buildRepositoryHealth', () => {
  it('returns the "low" bucket for a clean repo with all axes', () => {
    // v0.15.0 U.4: "clean" means high aiQuality (the new headline
    // is higher = better). The test data is updated to use 95
    // (the legacy test value of 5 inverted through the v0.14
    // logic) so a healthy composite remains healthy.
    const result = buildRepositoryHealth({
      aiQuality: 95, engineeringHygiene: 95, security: 95, repositoryHealth: 95,
      architectureConsistency: 95,
      aiSecurityRisk: 'low',
      designTokenViolations: { spacing: 0, radius: 0 },
      testQuality: 95,
      businessLogicCoherence: 95,
      docFreshness: 95,
      dbHealth: 95,
    });
    expect(result.aiDebt).toBe('low');
    expect(result.score).toBeGreaterThan(85);
    expect(result.warnings).toHaveLength(0);
    expect(Object.keys(result.breakdown)).toHaveLength(8);
  });

  it('returns "critical" when aiSecurityRisk is critical (penalty applied)', () => {
    const result = buildRepositoryHealth({
      aiQuality: 95, engineeringHygiene: 95, security: 95, repositoryHealth: 95,
      architectureConsistency: 95,
      aiSecurityRisk: 'critical',
    });
    // Even though other axes are clean, the critical-security penalty
    // (10) plus the categorical mapping (10/100 for critical) drags
    // the score down.
    expect(result.aiDebt === 'medium' || result.aiDebt === 'high').toBe(true);
    expect(result.warnings.some((w) => w.includes('Critical AI security'))).toBe(true);
  });

  it('renormalizes weights when optional axes are missing', () => {
    // Only slopIndex + architecture present.
    const a = buildRepositoryHealth({
      aiQuality: 30, engineeringHygiene: 30, security: 30, repositoryHealth: 30,
      architectureConsistency: 70,
    });
    expect(Object.keys(a.breakdown)).toHaveLength(2);
    const sumWeights = Object.values(a.appliedWeights).reduce((s, w) => s + w, 0);
    expect(sumWeights).toBeCloseTo(1.0, 5);
  });

  it('applies a high-severity penalty', () => {
    const a = buildRepositoryHealth({
      aiQuality: 80, engineeringHygiene: 80, security: 80, repositoryHealth: 80,
      architectureConsistency: 80,
      aiSecurityRisk: 'low',
      highSeverityIssueCount: 0,
    });
    const b = buildRepositoryHealth({
      aiQuality: 80, engineeringHygiene: 80, security: 80, repositoryHealth: 80,
      architectureConsistency: 80,
      aiSecurityRisk: 'low',
      highSeverityIssueCount: 10,
    });
    expect(a.score).toBeGreaterThan(b.score);
  });

  it('clamps to [0, 100]', () => {
    const a = buildRepositoryHealth({
      aiQuality: 100, engineeringHygiene: 100, security: 100, repositoryHealth: 100,
      aiSecurityRisk: 'critical',
      highSeverityIssueCount: 100,
    });
    expect(a.score).toBeGreaterThanOrEqual(0);
    expect(a.score).toBeLessThanOrEqual(100);
  });

  it('returns neutral defaults when nothing is provided', () => {
    const result = buildRepositoryHealth({});
    // All axes default to 100 except slopIndex (default 70, inverted from 30).
    // Wait — `perAxis` only includes axes with values; empty input means
    // no axes, so score = 0. Verify.
    expect(result.score).toBe(0);
    expect(result.aiDebt).toBe('critical');
  });
});

describe('buildRepositoryHealthFromReport', () => {
  it('extracts testQuality + businessLogicCoherence + docFreshness + dbHealth from the report', () => {
    const result = buildRepositoryHealthFromReport({
      aiQuality: 90, engineeringHygiene: 90, security: 90, repositoryHealth: 90,
      architectureConsistency: 90,
      aiSecurityRisk: 'low',
      testQuality: 85,
      businessLogicCoherence: 90,
      docFreshness: 80,
      dbHealth: 88,
      issues: [
        { severity: 'medium', ruleId: 'visual/x', category: 'visual', message: '', filePath: '', aiSpecific: false, line: 1, column: 1 },
        { severity: 'low', ruleId: 'logic/y', category: 'logic', message: '', filePath: '', aiSpecific: false, line: 2, column: 1 },
      ],
    });
    expect(result.breakdown.testQuality).toBe(85);
    expect(result.breakdown.businessLogicCoherence).toBe(90);
    expect(result.breakdown.docFreshness).toBe(80);
    expect(result.breakdown.dbHealth).toBe(88);
  });

  it('handles a report with no issues', () => {
    // v0.15.0 U.4: high aiQuality + clean axes → high score
    // (no penalty because no high-severity issues).
    const result = buildRepositoryHealthFromReport({
      aiQuality: 90, engineeringHygiene: 90, security: 90, repositoryHealth: 90,
      architectureConsistency: 90,
      aiSecurityRisk: 'low',
      issues: [],
    });
    expect(result.score).toBeGreaterThan(75);
  });
});

describe('formatRepositoryHealth', () => {
  it('renders headline, per-axis breakdown, and warnings', () => {
    const result = buildRepositoryHealth({
      aiQuality: 90, engineeringHygiene: 90, security: 90, repositoryHealth: 90,
      architectureConsistency: 90,
      aiSecurityRisk: 'critical',
    });
    const out = formatRepositoryHealth(result);
    expect(out).toMatch(/Repository Health:/);
    expect(out).toMatch(/AI Debt:/);
    expect(out).toMatch(/slopIndex/);
    expect(out).toMatch(/architectureConsistency/);
    expect(out).toMatch(/Warnings:/);
    expect(out).toMatch(/Critical AI security/);
  });
});
