import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { DEFAULT_CONFIG } from '../../src/config';
import { aggregateReport, scoreFile } from '../../src/engine/metrics';
import type { Issue } from '../../src/types';

const severityArbitrary = fc.constantFrom<Issue['severity']>('low', 'medium', 'high');

function aiIssue(severity: Issue['severity'], index: number): Issue {
  return {
    ruleId: 'ai/compression-profile',
    category: 'ai',
    severity,
    aiSpecific: true,
    filePath: 'src/example.ts',
    message: `ai fixture ${index}`,
    line: index + 1,
    column: 1,
  };
}

function securityIssue(severity: Issue['severity'], index: number): Issue {
  return {
    ruleId: 'security/sql-construction',
    category: 'security',
    severity,
    aiSpecific: false,
    filePath: 'src/example.ts',
    message: `security fixture ${index}`,
    line: index + 1,
    column: 1,
  };
}

function aggregate(issues: readonly Issue[]) {
  const result = {
    filePath: 'src/example.ts',
    componentCount: 0,
    rawScore: 0,
    componentScore: 0,
    adjustedScore: 0,
    issues: [...issues],
  };
  const score = scoreFile(result, 1, DEFAULT_CONFIG);
  return aggregateReport(
    [score],
    [{ filePath: result.filePath, issues: [...issues] }],
    DEFAULT_CONFIG,
    undefined,
    1,
  );
}

function headline(report: ReturnType<typeof aggregate>) {
  return [report.aiSlopScore, report.engineeringHygiene, report.security, report.repositoryHealth];
}

describe('Gate 1 score invariants', () => {
  it('keeps all public scores finite and bounded for arbitrary effective issue sets', () => {
    fc.assert(
      fc.property(fc.array(severityArbitrary, { maxLength: 24 }), (severities) => {
        const report = aggregate(severities.map((severity, index) => aiIssue(severity, index)));
        for (const value of headline(report)) {
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(100);
        }
        const inputs = report.scoreExplanation?.repositoryHealth.inputs ?? [];
        const reconstructed = inputs.reduce((sum, input) => sum + input.value * input.weight, 0);
        expect(inputs.every((input) => input.weightedAmount === input.value * input.weight)).toBe(true);
        expect(report.repositoryHealth).toBeCloseTo(reconstructed, 12);
      }),
      { numRuns: 50 },
    );
  });

  it('does not improve health when arbitrary harmful evidence is added', () => {
    fc.assert(
      fc.property(
        fc.array(severityArbitrary, { maxLength: 24 }),
        severityArbitrary,
        (baseSeverities, extraSeverity) => {
          const base = aggregate(baseSeverities.map((severity, index) => aiIssue(severity, index)));
          const expanded = aggregate([
            ...baseSeverities.map((severity, index) => aiIssue(severity, index)),
            aiIssue(extraSeverity, baseSeverities.length),
          ]);
          expect(expanded.aiSlopScore).toBeGreaterThanOrEqual(base.aiSlopScore);
          expect(expanded.repositoryHealth).toBeLessThanOrEqual(base.repositoryHealth);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('keeps non-AI security evidence out of AI Slop while never improving health', () => {
    fc.assert(
      fc.property(
        fc.array(severityArbitrary, { maxLength: 24 }),
        severityArbitrary,
        (baseSeverities, extraSeverity) => {
          const base = aggregate(baseSeverities.map((severity, index) => aiIssue(severity, index)));
          const expanded = aggregate([
            ...baseSeverities.map((severity, index) => aiIssue(severity, index)),
            securityIssue(extraSeverity, baseSeverities.length),
          ]);
          expect(expanded.aiSlopScore).toBe(base.aiSlopScore);
          expect(expanded.repositoryHealth).toBeLessThanOrEqual(base.repositoryHealth);
        },
      ),
      { numRuns: 50 },
    );
  });
});
