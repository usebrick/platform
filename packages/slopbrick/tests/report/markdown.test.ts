import { describe, expect, it } from 'vitest';
import { formatMarkdown } from '../../src/report/markdown.js';
import type { Issue, ProjectReport } from '../../src/types.js';

function makeIssue(overrides: Partial<Issue> & Pick<Issue, 'ruleId' | 'aiSpecific' | 'category'>): Issue {
  return {
    severity: 'medium',
    message: 'Sample finding',
    line: 1,
    column: 1,
    ...overrides,
  };
}

function makeReport(issues: Issue[]): ProjectReport {
  return {
    version: '0.44.0',
    generatedAt: '2026-07-12T00:00:00.000Z',
    aiSlopScore: 12,
    engineeringHygiene: 88,
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
    fileCount: 1,
    thresholds: { meanSlop: 30, p90Slop: 30, individualSlopThreshold: 60 },
    components: [],
    issues,
  };
}

describe('formatMarkdown finding buckets', () => {
  function section(output: string, heading: string): string {
    const start = output.indexOf(heading);
    expect(start).toBeGreaterThanOrEqual(0);
    const body = output.slice(start + heading.length);
    const end = body.indexOf('\n## ');
    return end < 0 ? body : body.slice(0, end);
  }

  it('keeps a non-AI USEFUL finding out of AI Findings', () => {
    const output = formatMarkdown(
      makeReport([
        makeIssue({ ruleId: 'ai/any-density', aiSpecific: true, category: 'ai' }),
        makeIssue({ ruleId: 'perf/css-bloat', aiSpecific: false, category: 'perf' }),
      ]),
    );

    expect(output).toContain('## AI Findings (1)');
    expect(output).toContain('## Engineering Hygiene (1)');
    expect(section(output, '## AI Findings (1)')).toContain('Any Density');
    expect(section(output, '## AI Findings (1)')).not.toContain('Css Bloat');
    expect(section(output, '## Engineering Hygiene (1)')).toContain('Css Bloat');
  });

  it('keeps a non-AI security finding out of AI Findings when its verdict is unknown', () => {
    const output = formatMarkdown(
      makeReport([
        makeIssue({ ruleId: 'security/example', aiSpecific: false, category: 'security' }),
      ]),
    );

    expect(output).toContain('## AI Findings (0)');
    expect(output).toContain('## Engineering Hygiene (1)');
    expect(section(output, '## AI Findings (0)')).not.toContain('Example');
    expect(section(output, '## Engineering Hygiene (1)')).toContain('Example');
  });

  it('keeps default-off audit findings out of actionable buckets', () => {
    const output = formatMarkdown(
      makeReport([
        makeIssue({
          ruleId: 'ai/segment-surprisal-cv',
          aiSpecific: true,
          category: 'ai',
          severity: 'off',
        }),
      ]),
    );

    expect(output).toContain('## AI Findings (0)');
    expect(output).toContain('## Engineering Hygiene (0)');
    expect(output).toContain('Default-off audit:** 1 suppressed finding instance across 1 rule');
    expect(section(output, '## AI Findings (0)')).not.toContain('Segment Surprisal');
    expect(section(output, '## Engineering Hygiene (0)')).not.toContain('Segment Surprisal');
  });
});
