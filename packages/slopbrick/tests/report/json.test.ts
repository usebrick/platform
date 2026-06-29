import { describe, expect, it } from 'vitest';
import { formatJson } from '../../src/report/json.js';
import type { ProjectReport } from '../../src/types.js';

function makeReport(): ProjectReport {
  return {
    version: '0.6.0',
    generatedAt: '2026-06-15T00:00:00.000Z',
    configPath: 'slopbrick.config.js',
    aiQuality: 34.2, engineeringHygiene: 34.2, security: 34.2, repositoryHealth: 34.2,
    assemblyHealth: 65.8,
    totalScore: 34.2,
    categoryScores: {
      visual: 12.5,
      typo: 8.0,
      wcag: 15.2,
      layout: 3.1,
      component: 9.9,
      logic: 21.4,
      arch: 4.2,
      perf: 0,
      security: 0,      test: 0,    docs: 0,    db: 0,    ai: 0,    context: 0,    product: 0,    i18n: 0,},
    boundaryScore: 25.0,
    contextScore: 30.0,
    visualScore: 50.0,
    p90Score: 88.0,
    peakScore: 92.0,
    componentCount: 12,
    fileCount: 1,
    thresholds: { meanSlop: 25, p90Slop: 50, individualSlopThreshold: 50 },
    components: [],
    issues: [],
    baseline: {
      active: true,
      version: '0.6.0',
      baselineRevision: 1,
      createdAt: '2026-06-01T00:00:00.000Z',
    },
  };
}

describe('formatJson', () => {
  it('returns valid JSON', () => {
    const output = formatJson(makeReport());

    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('preserves key report fields', () => {
    const output = formatJson(makeReport());
    const parsed = JSON.parse(output) as ProjectReport;

    expect(parsed.version).toBe('0.6.0');
    // v0.15.0 U.4: the v3 headline score is aiQuality (0-100,
    // higher = better). The legacy `slopIndex` field is also
    // kept on the wire for backward compat with v0.14
    // consumers; it should mirror aiQuality (the value is
    // sourced from aiQuality for historical payload compat).
    expect(parsed.aiQuality).toBe(34.2);
    expect(parsed.engineeringHygiene).toBe(34.2);
    expect(parsed.security).toBe(34.2);
    expect(parsed.repositoryHealth).toBe(34.2);
    expect(parsed.assemblyHealth).toBe(65.8);
    expect(parsed.componentCount).toBe(12);
    expect(parsed.categoryScores.logic).toBe(21.4);
    expect(parsed.baseline).toEqual({
      active: true,
      version: '0.6.0',
      baselineRevision: 1,
      createdAt: '2026-06-01T00:00:00.000Z',
    });
    expect(parsed.components.length).toBe(0);
    expect(parsed.issues.length).toBe(0);
  });

  it('formats with 2-space indentation', () => {
    const output = formatJson(makeReport());

    expect(output).toMatch(/^\{\n  "version"/);
    expect(output).toContain('\n  "categoryScores"');
    expect(output).toContain('\n}');
    expect(output).not.toContain('"version":"0.6.0"');
    expect(output).toContain('"version": "0.6.0"');
  });

  it('includes research metrics when present on the report', () => {
    const report = makeReport();
    report.research = {
      generatedSampleCount: 12,
      generatedRuleCoverage: 75,
      candidateYield: 4,
      updatedAt: '2026-06-21T00:00:00.000Z',
    };
    const parsed = JSON.parse(formatJson(report)) as ProjectReport;
    expect(parsed.research?.candidateYield).toBe(4);
    expect(parsed.research?.generatedSampleCount).toBe(12);
  });
});
