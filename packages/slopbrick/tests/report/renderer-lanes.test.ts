import { describe, expect, it } from 'vitest';
import { formatPretty } from '../../src/report/pretty.js';
import type { Issue, ProjectReport } from '../../src/types.js';

function makeIssue(
  ruleId: string,
  aiSpecific: boolean,
  severity: Issue['severity'] = 'medium',
): Issue {
  return {
    ruleId,
    category: aiSpecific ? 'ai' : 'perf',
    severity,
    aiSpecific,
    filePath: aiSpecific ? 'src/ai-signal.ts' : 'src/engineering.ts',
    message: `${ruleId} message`,
    line: 1,
    column: 1,
  };
}

function makeReport(issues: Issue[]): ProjectReport {
  return {
    version: '0.44.0',
    generatedAt: '2026-07-13T00:00:00.000Z',
    aiSlopScore: 12,
    engineeringHygiene: 84,
    security: 100,
    repositoryHealth: 91,
    assemblyHealth: 91,
    totalScore: 12,
    categoryScores: {
      visual: 0,
      typo: 0,
      wcag: 0,
      layout: 0,
      component: 0,
      logic: 0,
      arch: 0,
      perf: 0,
      security: 0,
      test: 0,
      docs: 0,
      db: 0,
      ai: 0,
      context: 0,
      product: 0,
      i18n: 0,
    },
    boundaryScore: 0,
    contextScore: 0,
    visualScore: 0,
    p90Score: 0,
    peakScore: 0,
    componentCount: 0,
    fileCount: 2,
    thresholds: { meanSlop: 30, p90Slop: 30, individualSlopThreshold: 60 },
    components: [],
    issues,
  };
}

function section(output: string, heading: string): string {
  const start = output.indexOf(heading);
  expect(start).toBeGreaterThanOrEqual(0);
  const body = output.slice(start + heading.length).replace(/^\n+/, '');
  const end = body.indexOf('\n\n');
  return end < 0 ? body : body.slice(0, end);
}

describe('pretty renderer finding lanes', () => {
  it('separates active AI-specific and engineering findings while hiding off findings', () => {
    const output = formatPretty(
      makeReport([
        makeIssue('ai/statistical-signal', true),
        makeIssue('perf/css-bloat', false),
        makeIssue('ai/suppressed', true, 'off' as Issue['severity']),
      ]),
    );

    expect(output).toContain('AI-specific signals (1)');
    expect(output).toContain('Engineering findings (1)');
    expect(section(output, 'AI-specific signals (1)')).toContain('ai/statistical-signal');
    expect(section(output, 'AI-specific signals (1)')).not.toContain('perf/css-bloat');
    expect(section(output, 'Engineering findings (1)')).toContain('perf/css-bloat');
    expect(section(output, 'Engineering findings (1)')).not.toContain('ai/statistical-signal');
    expect(output).not.toContain('ai/suppressed');
    expect(output).not.toContain('Issues (2)');
  });

  it('explains an empty AI-specific lane when engineering findings are active', () => {
    const output = formatPretty(makeReport([makeIssue('perf/css-bloat', false)]));

    expect(output).toContain('AI-specific signals (0)');
    expect(output).toContain('No active AI-specific signals.');
    expect(output).toContain('Engineering findings (1)');
    expect(output).toContain('perf/css-bloat');
    expect(output).not.toContain('No active findings');
  });

  it('explains an empty engineering lane when AI-specific findings are active', () => {
    const output = formatPretty(makeReport([makeIssue('ai/statistical-signal', true)]));

    expect(output).toContain('AI-specific signals (1)');
    expect(output).toContain('Engineering findings (0)');
    expect(output).toContain('No active engineering findings.');
    expect(output).not.toContain('No active findings');
  });
});
