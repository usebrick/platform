import { describe, expect, it } from 'vitest';
import { projectFirstScan } from '../../src/report/first-scan.js';
import { formatJson } from '../../src/report/json.js';
import { SCORE_BRIEFS, SCORE_CONTRACT } from '../../src/report/score-contract.js';
import type { Issue, ProjectReport } from '../../src/types.js';

function makeReport(): ProjectReport {
  return {
    version: '0.6.0',
    generatedAt: '2026-06-15T00:00:00.000Z',
    configPath: 'slopbrick.config.js',
    aiSlopScore: 34.2, engineeringHygiene: 34.2, security: 34.2, repositoryHealth: 34.2,
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

function makeStaleCompleteFirstScanReport(): ProjectReport {
  const issues: Issue[] = [
    {
      ruleId: 'logic/boundary-violation',
      category: 'logic',
      severity: 'high',
      aiSpecific: true,
      filePath: 'src/Card.tsx',
      message: 'Test issue',
      line: 5,
      column: 3,
    },
    {
      ruleId: 'security/stale-comparison',
      category: 'security',
      severity: 'medium',
      aiSpecific: true,
      filePath: 'src/security.ts',
      message: 'Second test issue',
      line: 9,
      column: 4,
    },
  ];
  const input = Object.assign(makeReport(), {
    completionStatus: 'complete' as const,
    scoreValidity: 'valid' as const,
    requested: 2,
    analyzed: 2,
    failed: 0,
    skipped: 0,
    issues,
    scoreExplanation: {
      repositoryHealth: {
        value: 73,
        inputs: [
          { axis: 'security', value: 70, weight: 0.2, weightedAmount: 14 },
        ],
      },
    } as ProjectReport['scoreExplanation'],
  }) as ProjectReport;
  input.firstScan = projectFirstScan(input, { cwd: '/workspace', configHash: 'config-a' });
  input.firstScan.findings[0]!.change = 'new';
  input.firstScan.findings[1]!.change = 'unchanged';
  input.firstScan.delta = {
    kind: 'slopbrick-finding-delta-v1',
    status: 'compared',
    baselineRevision: 7,
    currentCount: 2,
    baselineCount: 2,
    newCount: 1,
    unchangedCount: 1,
    resolvedCount: 1,
    resolvedDetails: 'available',
    resolved: [{
      identity: 'stale-resolved-identity',
      ruleId: 'logic/resolved-stale-rule',
      area: 'code-and-logic',
      severity: 'low',
      aiSpecific: true,
      filePath: 'src/resolved.ts',
      line: 3,
      column: 2,
    }],
    summary: '1 new, 1 resolved, and 1 unchanged finding.',
  };
  return input;
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
    // v0.15.0 U.4: the v3 headline score is aiSlopScore (0-100,
    // lower = cleaner). The legacy `slopIndex` field is also
    // kept on the wire for backward compat with v0.14
    // consumers; it should mirror aiSlopScore (the value is
    // sourced from aiSlopScore for historical payload compat).
    expect(parsed.aiSlopScore).toBe(34.2);
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

  it('is byte-stable for the same report input', () => {
    const report = makeReport();

    expect(formatJson(report)).toBe(formatJson(report));
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

  it('adds the full typed first-scan projection without changing existing JSON contracts', () => {
    const issue: Issue = {
      ruleId: 'logic/boundary-violation',
      category: 'logic',
      severity: 'high',
      aiSpecific: true,
      filePath: 'src/Card.tsx',
      message: 'Test issue',
      line: 5,
      column: 3,
      evidence: {
        kind: 'matched-source-span',
        status: 'exact',
        snippet: 'unsafeBoundary()',
        location: { start: { line: 5, column: 3 }, end: { line: 5, column: 19 } },
      },
    };
    const input = Object.assign(makeReport(), {
      completionStatus: 'complete' as const,
      scoreValidity: 'valid' as const,
      aiSlopScore: 12.3456789,
      repositoryHealth: 63.456789,
      issues: [issue],
      scoreExplanation: {
        repositoryHealth: {
          value: 63.456789,
          inputs: [
            { axis: 'aiSlopCleanliness', value: 87.6543211, weight: 0.4, weightedAmount: 35.06172844 },
          ],
        },
      } as ProjectReport['scoreExplanation'],
    }) as ProjectReport;
    input.firstScan = projectFirstScan(input, { cwd: '/workspace', configHash: 'config-a' });

    const parsed = JSON.parse(formatJson(input)) as ProjectReport & {
      scoreContract: typeof SCORE_CONTRACT;
      scoreBriefs: typeof SCORE_BRIEFS;
    };

    expect(parsed.firstScan).toEqual(input.firstScan);
    expect(parsed.issues).toEqual([issue]);
    expect(parsed.aiSlopScore).toBe(12.3456789);
    expect(parsed.repositoryHealth).toBe(63.456789);
    expect(parsed.scoreContract).toEqual(SCORE_CONTRACT);
    expect(parsed.scoreBriefs).toEqual(SCORE_BRIEFS);
  });

  it('embeds scoreBriefs in every report (v0.43.0 user-review parity)', () => {
    const output = formatJson(makeReport());
    const parsed = JSON.parse(output) as Record<string, unknown>;

    expect(parsed.scoreBriefs).toEqual(SCORE_BRIEFS);
  });

  it('embeds the canonical score decision and machine/human rounding policy', () => {
    const parsed = JSON.parse(formatJson(makeReport())) as Record<string, unknown>;

    expect(parsed.scoreContract).toEqual(SCORE_CONTRACT);
    expect(parsed.assemblyHealth).toBe(65.8);
    expect(parsed).not.toHaveProperty('totalScore');
    expect(SCORE_CONTRACT.deprecatedFields.assemblyHealth).toContain('not a canonical headline');
    expect(SCORE_CONTRACT.canonicalFields).toEqual([
      'aiSlopScore',
      'engineeringHygiene',
      'security',
      'repositoryHealth',
    ]);
    expect(SCORE_CONTRACT.canonicalNameDecisions.hygieneScore).toContain('engineeringHygiene');
    expect(SCORE_CONTRACT.canonicalNameDecisions.backendScore).toContain('not exposed');
    expect(SCORE_CONTRACT.version).toBe('v2');
    expect(SCORE_CONTRACT.bounds).toEqual({ min: 0, max: 100 });
    expect(SCORE_CONTRACT.directions).toEqual({
      aiSlopScore: 'lower-is-better',
      engineeringHygiene: 'higher-is-better',
      security: 'higher-is-better',
      repositoryHealth: 'higher-is-better',
    });
    expect(SCORE_CONTRACT.denominator.unit).toBe('analysed-files');
    expect(SCORE_CONTRACT.effectiveIssueSet.name).toBe('effective');
    expect(SCORE_CONTRACT.effectiveIssueSet.suppression).toContain('constitution drift');
    expect(SCORE_CONTRACT.outcomes.empty).toContain('not-applicable');
    expect(SCORE_CONTRACT.outcomes.incomplete).toContain('diagnostic');
    expect(SCORE_CONTRACT.rounding).toEqual({
      json: 'preserve full numeric precision',
      sarif: 'preserve full numeric precision',
      human: 'one decimal place',
      health: 'nearest integer',
    });
  });

  it('keeps precise JSON scores for complete scans but omits scores for empty scans', () => {
    const precise = makeReport();
    precise.aiSlopScore = 12.3456789;
    precise.repositoryHealth = 63.456789;
    const parsed = JSON.parse(formatJson(precise)) as Record<string, unknown>;
    expect(parsed.aiSlopScore).toBe(12.3456789);
    expect(parsed.repositoryHealth).toBe(63.456789);

    const empty = Object.assign(makeReport(), {
      completionStatus: 'empty' as const,
      scoreValidity: 'not-applicable' as const,
      requested: 0,
      analyzed: 0,
      failed: 0,
      skipped: 0,
    });
    const emptyParsed = JSON.parse(formatJson(empty)) as Record<string, unknown>;
    expect(emptyParsed).toMatchObject({
      completionStatus: 'empty',
      scoreValidity: 'not-applicable',
    });
    expect(emptyParsed).not.toHaveProperty('aiSlopScore');
    expect(emptyParsed).not.toHaveProperty('engineeringHygiene');
    expect(emptyParsed).not.toHaveProperty('security');
    expect(emptyParsed).not.toHaveProperty('repositoryHealth');
    expect(emptyParsed).not.toHaveProperty('scoreContract');
    expect(emptyParsed).not.toHaveProperty('firstScan');
  });

  it.each([
    ['incomplete', {
      completionStatus: 'partial' as const,
      scoreValidity: 'incomplete' as const,
      requested: 2,
      analyzed: 1,
      failed: 1,
      skipped: 0,
    }],
    ['not-applicable', {
      completionStatus: 'empty' as const,
      scoreValidity: 'not-applicable' as const,
      requested: 0,
      analyzed: 0,
      failed: 0,
      skipped: 0,
    }],
  ] as const)('keeps %s first-scan JSON explicit and score-free', (expectedStatus, validity) => {
    const input = Object.assign(makeReport(), validity) as ProjectReport;
    input.firstScan = projectFirstScan(input, { cwd: '/workspace', configHash: 'config-a' });

    const parsed = JSON.parse(formatJson(input)) as {
      firstScan?: {
        status: string;
        headline: unknown;
        recommendedActions: unknown[];
      };
      repositoryHealth?: number;
    };

    expect(parsed.firstScan).toMatchObject({ status: expectedStatus, headline: null });
    expect(parsed.firstScan?.recommendedActions).toEqual([]);
    expect(parsed).not.toHaveProperty('repositoryHealth');
  });

  it.each([
    ['incomplete', {
      completionStatus: 'partial' as const,
      scoreValidity: 'incomplete' as const,
      requested: 2,
      analyzed: 1,
      failed: 1,
      skipped: 0,
    }],
    ['not-applicable', {
      completionStatus: 'empty' as const,
      scoreValidity: 'not-applicable' as const,
      requested: 0,
      analyzed: 0,
      failed: 0,
      skipped: 0,
    }],
  ] as const)('fails closed for a stale complete first-scan inside an %s report', (expectedStatus, validity) => {
    const input = Object.assign(makeStaleCompleteFirstScanReport(), validity) as ProjectReport;
    expect(input.firstScan).toMatchObject({
      status: 'complete',
      headline: { value: 73, dimensions: [{ axis: 'security' }] },
      delta: { status: 'compared', baselineCount: 2, resolvedCount: 1 },
    });
    expect(input.firstScan?.recommendedActions.length).toBeGreaterThan(0);

    const parsed = JSON.parse(formatJson(input)) as {
      firstScan: NonNullable<ProjectReport['firstScan']>;
      repositoryHealth?: number;
    };

    expect(parsed.firstScan).toMatchObject({
      status: expectedStatus,
      headline: null,
      recommendedActions: [],
      delta: {
        kind: 'slopbrick-finding-delta-v1',
        status: 'not-evaluated',
        reason: expectedStatus === 'incomplete' ? 'incomplete-scan' : 'no-files-analyzed',
        currentCount: 2,
        summary: `Finding delta not evaluated: scan status is ${expectedStatus}.`,
      },
    });
    expect(parsed.firstScan.findings.map(({ change }) => change)).toEqual(['current', 'current']);
    expect(parsed.firstScan.delta).not.toHaveProperty('baselineRevision');
    expect(parsed.firstScan.delta).not.toHaveProperty('baselineCount');
    expect(parsed.firstScan.delta).not.toHaveProperty('newCount');
    expect(parsed.firstScan.delta).not.toHaveProperty('unchangedCount');
    expect(parsed.firstScan.delta).not.toHaveProperty('resolvedCount');
    expect(parsed.firstScan.delta).not.toHaveProperty('resolvedDetails');
    expect(parsed.firstScan.delta).not.toHaveProperty('resolved');
    expect(parsed).not.toHaveProperty('repositoryHealth');
  });

  it('suppresses headline scores for incomplete scans with an explicit invalid marker', () => {
    const incomplete = Object.assign(makeReport(), {
      completionStatus: 'partial' as const,
      scoreValidity: 'incomplete' as const,
      requested: 2,
      analyzed: 1,
      failed: 1,
      skipped: 0,
      compositeScore: {
        mean: 0.72,
        max: 0.91,
        tier: 'LIKELY_AI' as const,
        fileCount: 1,
      },
      scoreExplanation: {
        kind: 'deterministic-headline-score-explanation-v1',
      } as ProjectReport['scoreExplanation'],
    });
    // Exercise the explicit diagnostic explanation opt-in as well: it must
    // not bypass the incomplete-report score aggregate boundary.
    const parsed = JSON.parse(formatJson(incomplete, { includeScoreExplanation: true })) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      completionStatus: 'partial',
      scoreValidity: 'incomplete',
      scoreContract: SCORE_CONTRACT,
    });
    for (const field of ['aiSlopScore', 'engineeringHygiene', 'security', 'repositoryHealth']) {
      expect(parsed).not.toHaveProperty(field);
    }
    expect(parsed).not.toHaveProperty('compositeScore');
    expect(parsed).not.toHaveProperty('scoreExplanation');
    // Compatibility/diagnostic numerics remain available, but are not
    // canonical gating scores on an incomplete report.
    expect(parsed.assemblyHealth).toBe(65.8);
    expect((parsed.categoryScores as Record<string, number>).logic).toBe(21.4);
    expect(parsed.scoreContract).toEqual(SCORE_CONTRACT);
  });

});
