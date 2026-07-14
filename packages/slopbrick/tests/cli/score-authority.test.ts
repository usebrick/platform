import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../../src/config';
import { aggregateReport } from '../../src/engine/metrics';
import { assembleScanReport } from '../../src/cli/report/assembleScanReport';
import type { EnrichmentResult } from '../../src/cli/report/enrichReport';
import type { FileScanResult } from '../../src/types';

describe('canonical Repository Health assembly', () => {
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
