import { describe, expect, it } from 'vitest';
import { formatBriefReport, formatPretty } from '../../src/report/pretty.js';
import type { Issue, ProjectReport } from '../../src/types.js';

function makeIssue(aiSpecific: boolean): Issue {
  return {
    ruleId: aiSpecific ? 'ai/statistical-signal' : 'perf/css-bloat',
    category: aiSpecific ? 'ai' : 'perf',
    severity: 'low',
    aiSpecific,
    filePath: 'src/example.ts',
    message: 'Sample finding',
    line: 1,
    column: 1,
  };
}

function makeReport(issues: Issue[]): ProjectReport {
  return {
    version: '0.44.0',
    generatedAt: '2026-07-13T00:00:00.000Z',
    aiSlopScore: 4,
    engineeringHygiene: 90,
    security: 100,
    repositoryHealth: 95,
    assemblyHealth: 95,
    totalScore: 4,
    categoryScores: {},
    boundaryScore: 0,
    contextScore: 0,
    visualScore: 0,
    p90Score: 0,
    peakScore: 0,
    componentCount: 0,
    fileCount: 1,
    thresholds: { meanSlop: 30, p90Slop: 30, individualSlopThreshold: 60 },
    components: [],
    issues,
  } as ProjectReport;
}

describe('human AI-slop score messages', () => {
  it('qualifies a lowest-band score when an active AI-specific finding exists', () => {
    const outputs = [
      formatPretty(makeReport([makeIssue(true)])),
      formatBriefReport(makeReport([makeIssue(true)])),
    ];

    for (const output of outputs) {
      expect(output).not.toMatch(/\[NO SLOP\]|no slop|no detectable AI slop/i);
      expect(output).toMatch(/\[LOW\]|\blow\b/i);
    }
    expect(outputs[0]).toContain('Repo has a low amount of AI slop');
  });

  it('retains no-slop wording when no active AI-specific finding exists', () => {
    const pretty = formatPretty(makeReport([]));
    const brief = formatBriefReport(makeReport([]));

    expect(pretty).toContain('[NO SLOP]');
    expect(pretty).toContain('Repo has no detectable AI slop');
    expect(brief).toContain('no slop');
  });
});
