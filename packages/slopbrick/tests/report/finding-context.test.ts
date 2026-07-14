import { describe, expect, it } from 'vitest';
import { formatJson } from '../../src/report/json.js';
import { formatMarkdown } from '../../src/report/markdown.js';
import { formatPretty } from '../../src/report/pretty.js';
import type { Issue, ProjectReport } from '../../src/types.js';

function issue(filePath: string): Issue {
  return {
    ruleId: 'ai/compression-profile',
    category: 'ai',
    severity: 'low',
    aiSpecific: true,
    filePath,
    message: 'Repetitive profile; inspect context before treating it as authorship evidence.',
    line: 1,
    column: 1,
  };
}

function report(issues: Issue[]): ProjectReport {
  return {
    version: '0.44.0',
    generatedAt: '2026-07-12T00:00:00.000Z',
    aiSlopScore: 4.6,
    engineeringHygiene: 100,
    security: 100,
    repositoryHealth: 98,
    assemblyHealth: 95,
    totalScore: 0,
    categoryScores: {
      visual: 0, typo: 0, wcag: 0, layout: 0, component: 0, logic: 0,
      arch: 0, perf: 0, security: 0, test: 0, docs: 0, db: 0, ai: 1,
      context: 0, product: 0, i18n: 0,
    },
    boundaryScore: 0,
    contextScore: 0,
    visualScore: 0,
    p90Score: 1,
    peakScore: 4.6,
    componentCount: 0,
    fileCount: issues.length,
    thresholds: { meanSlop: 30, p90Slop: 30, individualSlopThreshold: 60 },
    components: [],
    issues,
    defaultOffRuleCount: 36,
    defaultOffSuppressedCount: 2,
    scoreBasis: {
      denominator: issues.length,
      analyzedFiles: issues.length,
      issueSet: 'effective',
      suppressedIssueCount: 2,
      parseErrorCount: 0,
    },
  };
}

describe('finding context and report UX', () => {
  it('groups repeated statistical findings with instance count and source context', () => {
    const output = formatMarkdown(report([
      issue('packages/slopbrick/src/rules/ai/compression-profile.ts'),
      issue('packages/slopbrick/tests/fixtures/frameworks/repetitive.ts'),
      issue('packages/website/src/components/StructureDemo.astro'),
    ]));

    expect(output).toContain('3 instances');
    expect(output).toContain('rule implementation');
    expect(output).toContain('test/fixture');
    expect(output).toContain('demo/marketing');
  });

  it('labels pretty findings with their source context', () => {
    const output = formatPretty(report([
      issue('packages/slopbrick/src/rules/security/sql-construction.ts'),
      issue('packages/slopbrick/src/rules/security/sql-construction.ts'),
    ]));

    expect(output).toContain('context: rule implementation');
    expect(output).toContain('Finding summary');
    expect(output).toContain('2 × ai/compression-profile');
  });

  it('removes the misleading legacy totalScore from current JSON and names the canonical fields', () => {
    const parsed = JSON.parse(formatJson(report([]))) as Record<string, unknown>;

    expect(parsed).not.toHaveProperty('totalScore');
    expect(parsed.scoreContract).toEqual(expect.objectContaining({
      canonicalFields: ['aiSlopScore', 'engineeringHygiene', 'security', 'repositoryHealth'],
    }));
  });
});
