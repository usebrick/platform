import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentEvidencePolicyAccessorsMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/rules/current-evidence-policy-runtime', () => ({
  getCurrentEvidencePolicyAccessors: getCurrentEvidencePolicyAccessorsMock,
}));

import { DEFAULT_CONFIG } from '../../src/config';
import { effectiveIssuesForScore } from '../../src/cli/effective-issues';
import { aggregateReport } from '../../src/engine/metrics';
import { assembleScanReport } from '../../src/cli/report/assembleScanReport';
import { getDefaultOffRules } from '../../src/rules/signal-strength';
import { approvedCurrentPolicyFixture } from '../helpers/current-evidence-policy-v2';
import type { EnrichmentResult } from '../../src/cli/report/enrichReport';
import type { FileScanResult, Issue } from '../../src/types';

beforeEach(() => {
  getCurrentEvidencePolicyAccessorsMock.mockReset();
  getCurrentEvidencePolicyAccessorsMock.mockReturnValue(undefined);
});

function issue(ruleId: string, severity: Issue['severity'] = 'medium'): Issue {
  return {
    ruleId,
    category: 'logic',
    severity,
    aiSpecific: false,
    message: `${ruleId} fixture`,
    line: 1,
    column: 1,
  };
}

describe('canonical Repository Health assembly', () => {
  it('preserves legacy default-off and explicit-override score behavior without a provider', () => {
    const legacyDefaultOffRule = [...getDefaultOffRules()][0]!;
    const issues = [
      issue(legacyDefaultOffRule),
      issue('plugin/ordinary'),
      issue('plugin/configured-off'),
      issue('plugin/severity-off', 'off' as Issue['severity']),
    ];

    expect(effectiveIssuesForScore(issues, {
      rules: { 'plugin/configured-off': 'off' },
    }).map(({ ruleId }) => ruleId)).toEqual(['plugin/ordinary']);
    expect(effectiveIssuesForScore(issues, {
      rules: {
        [legacyDefaultOffRule]: 'high',
        'plugin/configured-off': 'off',
      },
    }).map(({ ruleId }) => ruleId)).toEqual([
      legacyDefaultOffRule,
      'plugin/ordinary',
    ]);
  });

  it('makes current score ineligibility non-overridable while preserving unknown fallback', () => {
    getCurrentEvidencePolicyAccessorsMock.mockReturnValue(approvedCurrentPolicyFixture());
    const issues = [
      issue('context/import-path-mismatch'),
      issue('ai/any-density'),
      issue('ai/comment-ratio'),
      issue('ai/renyi-profile'),
      issue('plugin/ordinary'),
    ];
    const config = {
      rules: {
        'ai/any-density': 'high',
        'ai/comment-ratio': 'high',
        'ai/renyi-profile': 'high',
      },
    };

    expect(effectiveIssuesForScore(issues, config).map(({ ruleId }) => ruleId)).toEqual([
      'context/import-path-mismatch',
      'plugin/ordinary',
    ]);
  });

  it('keeps explicit off stronger than current score eligibility', () => {
    getCurrentEvidencePolicyAccessorsMock.mockReturnValue(approvedCurrentPolicyFixture());

    expect(effectiveIssuesForScore([
      issue('context/import-path-mismatch'),
    ], {
      rules: { 'context/import-path-mismatch': 'off' },
    })).toEqual([]);
  });

  it('does not let a competing enrichment value overwrite the aggregate formula', () => {
    const aggregate = aggregateReport(
      [{
        filePath: 'src/a.ts',
        rawScore: 0,
        componentScore: 0,
        adjustedScore: 0,
        componentCount: 1,
      }],
      [{
        filePath: 'src/a.ts',
        issues: [{
          ruleId: 'security/test-fixture',
          category: 'security',
          severity: 'high',
          aiSpecific: false,
        }],
      }],
      DEFAULT_CONFIG,
      undefined,
      1,
    );
    const enrichment = { repositoryHealth: 0 } as unknown as EnrichmentResult;
    const results = [{ filePath: 'src/a.ts', issues: [] }] as unknown as FileScanResult[];

    const report = assembleScanReport({
      generatedAt: '2026-07-13T00:00:00.000Z',
      configPath: undefined,
      results,
      aggregated: aggregate,
      allIssues: [],
      effectiveIssues: [],
      parseErrors: [],
      topOffenders: [],
      config: DEFAULT_CONFIG,
      baselineMeta: undefined,
      defaultOffApplied: 0,
      defaultOffRuleCount: 0,
      previousRun: undefined,
      enrichment,
    });

    expect(aggregate.repositoryHealth).toBeLessThan(100);
    expect(report.repositoryHealth).toBe(aggregate.repositoryHealth);
    expect(report.repositoryHealth).not.toBe(enrichment.repositoryHealth);
  });

  it('exposes the same threshold failure in the machine report and CLI gate', () => {
    const config = {
      ...DEFAULT_CONFIG,
      thresholds: { ...DEFAULT_CONFIG.thresholds, meanSlop: 0 },
    };
    const issue = {
      ruleId: 'ai/compression-profile',
      category: 'ai' as const,
      severity: 'high' as const,
      aiSpecific: true,
      filePath: 'src/a.ts',
    };
    const result = { filePath: 'src/a.ts', issues: [issue] } as unknown as FileScanResult;
    const aggregate = aggregateReport(
      [{ filePath: 'src/a.ts', rawScore: 1, componentScore: 1, adjustedScore: 1, componentCount: 1 }],
      [result],
      config,
      undefined,
      1,
    );
    const report = assembleScanReport({
      generatedAt: '2026-07-14T00:00:00.000Z',
      configPath: undefined,
      results: [result],
      aggregated: aggregate,
      allIssues: [issue],
      effectiveIssues: [issue],
      parseErrors: [],
      topOffenders: [],
      config,
      baselineMeta: undefined,
      defaultOffApplied: 0,
      defaultOffRuleCount: 0,
      previousRun: undefined,
      enrichment: { repositoryHealth: undefined } as unknown as EnrichmentResult,
    });

    expect(report.aiSlopScore).toBeGreaterThan(0);
    expect(report.failedThresholds).toContain('meanSlop');
  });
});
