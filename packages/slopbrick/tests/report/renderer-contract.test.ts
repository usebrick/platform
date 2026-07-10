import { describe, expect, it } from 'vitest';
import { formatHtml } from '../../src/report/html.js';
import { formatJson } from '../../src/report/json.js';
import { formatMarkdown } from '../../src/report/markdown.js';
import { formatPretty, formatBriefReport } from '../../src/report/pretty.js';
import { formatSarif } from '../../src/report/sarif.js';
import type { Issue, ProjectReport } from '../../src/types.js';

const scoreBasis = {
  denominator: 7,
  analyzedFiles: 7,
  issueSet: 'effective' as const,
  suppressedIssueCount: 2,
  parseErrorCount: 1,
};

const offIssue: Issue = {
  ruleId: 'test/off-rule',
  category: 'test',
  severity: 'off' as never,
  aiSpecific: false,
  filePath: 'src/off.ts',
  message: 'Disabled finding must remain machine-auditable only',
  line: 1,
  column: 1,
};

const activeIssue: Issue = {
  ...offIssue,
  ruleId: 'test/active-rule',
  severity: 'medium',
  filePath: 'src/active.ts',
  message: 'Active finding',
};

function report(): ProjectReport {
  return {
    version: '0.44.0',
    generatedAt: '2026-07-10T00:00:00.000Z',
    aiSlopScore: 12.3,
    engineeringHygiene: 45.6,
    security: 78.9,
    repositoryHealth: 63.4,
    testQuality: 91.2,
    assemblyHealth: 87.7,
    totalScore: 12.3,
    categoryScores: { visual: 0, typo: 0, wcag: 0, layout: 0, component: 0, logic: 0, arch: 0, perf: 0, security: 0, test: 0, docs: 0, db: 0, ai: 0, context: 0, product: 0, i18n: 0 },
    boundaryScore: 0,
    contextScore: 0,
    visualScore: 0,
    p90Score: 0,
    peakScore: 0,
    componentCount: 0,
    fileCount: 7,
    thresholds: { meanSlop: 30, p90Slop: 30, individualSlopThreshold: 60 },
    components: [],
    issues: [activeIssue, offIssue],
    scoreBasis,
  };
}

describe('headline score renderer contract', () => {
  it('preserves all four score values and score-basis provenance in every report format', () => {
    const input = report();
    const json = JSON.parse(formatJson(input)) as Record<string, unknown>;
    const sarif = JSON.parse(formatSarif(input)) as { runs: Array<{ tool: { driver: { properties?: Record<string, unknown> } } }> };
    const textFormats = [formatMarkdown(input), formatPretty(input), formatBriefReport(input), formatHtml(input)];

    expect(json).toMatchObject({
      aiSlopScore: 12.3,
      engineeringHygiene: 45.6,
      security: 78.9,
      repositoryHealth: 63.4,
      scoreBasis,
    });
    expect(sarif.runs[0].tool.driver.properties).toMatchObject({
      scores: { aiSlopScore: 12.3, engineeringHygiene: 45.6, security: 78.9, repositoryHealth: 63.4 },
      scoreBasis,
    });
    for (const output of textFormats) {
      expect(output).toContain('12.3');
      expect(output).toContain('45.6');
      expect(output).toContain('78.9');
      expect(output).toContain('63.4');
      expect(output).toContain('7 analysed file');
    }
  });

  it('uses one truthful score explanation and keeps disabled findings out of HTML only', () => {
    const input = report();
    const formula = '0.4 × (100 − AI Slop Score) + 0.3 × Engineering Hygiene + 0.2 × Security + 0.1 × Test Quality';
    const json = JSON.parse(formatJson(input)) as { scoreBriefs: Record<string, string> };
    const markdown = formatMarkdown(input);
    const pretty = formatPretty(input);
    const brief = formatBriefReport(input);
    const html = formatHtml(input);
    const sarif = JSON.parse(formatSarif(input)) as { runs: Array<{ results: Array<{ ruleId: string }> }> };

    expect(json.scoreBriefs.repositoryHealth).toContain(formula);
    for (const output of [markdown, pretty, brief, html]) expect(output).toContain(formula);
    expect(html).toContain('test/active-rule');
    expect(html).not.toContain('test/off-rule');
    expect(json.issues).toEqual(expect.arrayContaining([expect.objectContaining({ ruleId: 'test/off-rule' })]));
    expect(sarif.runs[0].results).toEqual(expect.arrayContaining([expect.objectContaining({ ruleId: 'test/off-rule' })]));
  });
});
