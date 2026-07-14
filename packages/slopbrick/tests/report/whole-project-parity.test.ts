import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { STRUCTURE_SCHEMA_VERSION } from '@usebrick/core';
import { DEFAULT_CONFIG } from '../../src/config';
import { runSuggest, type ToolContext } from '../../src/mcp/tools';
import { formatHtml } from '../../src/report/html.js';
import { formatJson } from '../../src/report/json.js';
import { formatMarkdown } from '../../src/report/markdown.js';
import { formatPretty } from '../../src/report/pretty.js';
import { formatSarif } from '../../src/report/sarif.js';
import type { Issue, ProjectReport, ResolvedConfig } from '../../src/types.js';

const scoreBasis = {
  denominator: 2,
  analyzedFiles: 2,
  issueSet: 'effective' as const,
  suppressedIssueCount: 2,
  parseErrorCount: 0,
};

const projectFinding: Issue = {
  ruleId: 'layout/gap-monopoly',
  category: 'layout',
  severity: 'medium',
  aiSpecific: false,
  filePath: undefined,
  message: 'The project repeats one spacing token across its source files.',
  line: 1,
  column: 1,
};

const fileFinding: Issue = {
  ruleId: 'ai/compression-profile',
  category: 'ai',
  severity: 'high',
  aiSpecific: true,
  filePath: 'src/App.tsx',
  message: 'The file has a repetitive statistical profile.',
  line: 2,
  column: 3,
};

const defaultOffFileFinding: Issue = {
  ruleId: 'dup/identical-block',
  category: 'logic',
  severity: 'off' as never,
  aiSpecific: false,
  filePath: 'src/Panel.tsx',
  message: 'Disabled duplicate-block finding remains audit evidence.',
  line: 4,
  column: 1,
};

const defaultOffProjectFinding: Issue = {
  ...defaultOffFileFinding,
  filePath: undefined,
  message: 'Disabled project-level duplicate-block finding remains audit evidence.',
};

function makeReport(): ProjectReport {
  return {
    version: '0.44.0',
    generatedAt: '2026-07-12T00:00:00.000Z',
    aiSlopScore: 12.3456789,
    engineeringHygiene: 45.6789012,
    security: 78.9012345,
    repositoryHealth: 63.456789,
    testQuality: 91.2,
    assemblyHealth: 87.7,
    totalScore: 12.3456789,
    categoryScores: {
      visual: 0,
      typo: 0,
      wcag: 0,
      layout: 1,
      component: 0,
      logic: 0,
      arch: 0,
      perf: 0,
      security: 0,
      test: 0,
      docs: 0,
      db: 0,
      ai: 1,
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
    issues: [projectFinding, fileFinding, defaultOffFileFinding, defaultOffProjectFinding],
    scoreBasis,
  };
}

describe('whole-project renderer parity', () => {
  it('keeps project/file findings and suppression policy aligned across all report surfaces', async () => {
    const report = makeReport();
    const json = JSON.parse(formatJson(report)) as Record<string, any>;
    const sarif = JSON.parse(formatSarif(report)) as {
      runs: Array<{
        tool: { driver: { properties?: Record<string, any> } };
        results: Array<{ ruleId: string; locations: Array<{ physicalLocation: { artifactLocation: { uri: string } } }> }>;
      }>;
    };
    const markdown = formatMarkdown(report);
    const html = formatHtml(report);
    const pretty = formatPretty(report);

    // Machine feeds retain the complete audit history, including project
    // findings and disabled findings, while preserving score precision.
    expect(json.issues.map((issue: Issue) => issue.ruleId)).toEqual([
      'layout/gap-monopoly',
      'ai/compression-profile',
      'dup/identical-block',
      'dup/identical-block',
    ]);
    expect(json).toMatchObject({
      aiSlopScore: 12.3456789,
      engineeringHygiene: 45.6789012,
      security: 78.9012345,
      repositoryHealth: 63.456789,
      scoreBasis,
    });
    expect(sarif.runs[0]!.results.map((result) => result.ruleId)).toEqual(json.issues.map((issue: Issue) => issue.ruleId));
    expect(sarif.runs[0]!.results[0]!.locations[0]!.physicalLocation.artifactLocation.uri).toBe('.');
    expect(sarif.runs[0]!.tool.driver.properties).toMatchObject({
      scores: {
        aiSlopScore: 12.3456789,
        engineeringHygiene: 45.6789012,
        security: 78.9012345,
        repositoryHealth: 63.456789,
      },
      scoreBasis,
    });

    // Human reports intentionally use the actionable view: project and file
    // findings remain visible, while default-off findings are audit-only.
    expect(markdown).toContain('Gap Monopoly');
    expect(markdown).toContain('Compression Profile');
    for (const output of [html, pretty]) {
      expect(output).toContain('layout/gap-monopoly');
      expect(output).toContain('ai/compression-profile');
    }
    for (const output of [markdown, html, pretty]) {
      expect(output).toContain('context: project-wide');
      expect(output).not.toContain('dup/identical-block');
      expect(output).toContain('2 suppressed');
    }
    expect(markdown).toMatch(/Default-off audit.*2 suppressed finding instances across 1 rule/);
    expect(html).toMatch(/Default-off audit.*2 suppressed finding instances across 1 rule/);
    expect(markdown).toContain('12.3');
    expect(pretty).toContain('12.3 / 100');
  });

  it('carries the same whole-project score provenance through MCP health advice', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'slopbrick-whole-project-parity-'));
    try {
      const slopbrickDir = join(cwd, '.slopbrick');
      mkdirSync(slopbrickDir, { recursive: true });
      writeFileSync(join(cwd, 'src-placeholder.ts'), 'export const value = 1;\n', 'utf8');
      writeFileSync(
        join(slopbrickDir, 'health.json'),
        JSON.stringify({
          version: STRUCTURE_SCHEMA_VERSION,
          generatedAt: '2026-07-12T00:00:00.000Z',
          workspace: cwd,
          aiSlopScore: 12,
          engineeringHygiene: 46,
          security: 79,
          repositoryHealth: 63,
          issueCounts: { high: 1, medium: 1, low: 0 },
          scoreBasis,
          completionStatus: 'complete',
          scoreValidity: 'valid',
          requested: 2,
          analyzed: 2,
          failed: 0,
          skipped: 0,
        }),
        'utf8',
      );

      const context: ToolContext = {
        cwd,
        rules: [],
        config: DEFAULT_CONFIG as ResolvedConfig,
      };
      const result = await runSuggest({}, context);
      const payload = JSON.parse(result.content[0]!.text) as Record<string, any>;

      expect(payload.scores).toEqual({
        aiSlopScore: 12,
        engineeringHygiene: 46,
        security: 79,
        repositoryHealth: 63,
      });
      expect(payload.scoreBasis).toEqual(scoreBasis);
      expect(payload.scoreValidity).toBe('valid');
      expect(payload.completionStatus).toBe('complete');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
