import { beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { loadConfig } from '../../src/config';
import { runScan } from '../../src/cli/scan';
import {
  AI_BUCKET_SATURATION_SCALE,
  COMPOSITE_WEIGHTS,
  SEVERITY_WEIGHTS,
} from '../../src/engine/metrics';
import { handleToolCall } from '../../src/mcp/tools';
import { formatHtml } from '../../src/report/html';
import { formatJson } from '../../src/report/json';
import { formatMarkdown } from '../../src/report/markdown';
import { formatPretty } from '../../src/report/pretty';
import { formatSarif } from '../../src/report/sarif';
import { assertDistBuilt } from '../helpers/cli';
import type { ProjectReport, ResolvedConfig } from '../../src/types';

const execFileAsync = promisify(execFile);
const BIN_PATH = resolve(__dirname, '../../bin/slopbrick.js');

function writeFixture(): string {
  const workspace = mkdtempSync(join(tmpdir(), 'slopbrick-whole-project-golden-'));
  mkdirSync(join(workspace, 'src'), { recursive: true });
  writeFileSync(
    join(workspace, 'slopbrick.config.mjs'),
    [
      'export default {',
      "  include: ['src/**/*.tsx'],",
      '  telemetry: false,',
      '  thresholds: { meanSlop: 100, p90Slop: 100, individualSlopThreshold: 100 },',
      "  rules: {",
      "    'layout/gap-monopoly': 'medium',",
      "    'logic/math-console-log-storm': 'low',",
      "    'dup/near-duplicate': 'off',",
      "    'dup/structural-clone': 'off',",
      "    'perf/css-bloat': 'off',",
      '  },',
      '};',
      '',
    ].join('\n'),
  );

  // Three uses in each file give the project post-pass a deterministic
  // project-wide gap-monopoly finding. Four files deliberately cross the
  // inline threshold so source and built CLI exercise the worker path. The
  // five logs are the active file-level finding. The remaining non-empty
  // lines keep the files above ai/comment-ratio's default-off minimum without
  // introducing any other intentional fixture signals.
  const source = (name: string) => [
    `export const ${name} = () => (`,
    '  <div className="gap-4 gap-4 gap-4">',
    '    console.log("one");',
    '    console.log("two");',
    '    console.log("three");',
    '    console.log("four");',
    '    console.log("five");',
    `    <span>${name}</span>`,
    '  </div>',
    ');',
    'const a = 1;',
    'const b = 2;',
    'const c = 3;',
    'const d = 4;',
    'const e = 5;',
    'const f = 6;',
    'const g = 7;',
    'const h = 8;',
    'const i = 9;',
    'const j = 10;',
    'const k = 11;',
    'const l = 12;',
    'const m = 13;',
    'const n = 14;',
    'const o = 15;',
    'const p = 16;',
    'const q = 17;',
    'const r = 18;',
    'const s = 19;',
    'const t = 20;',
    '',
  ].join('\n');
  for (const name of ['A', 'B', 'C', 'D']) {
    writeFileSync(join(workspace, 'src', `${name}.tsx`), source(name));
  }
  return workspace;
}

function activeAndAudit(report: ProjectReport) {
  return {
    active: report.issues
      .filter((issue) => issue.severity !== ('off' as never))
      .map((issue) => ({ ruleId: issue.ruleId, filePath: issue.filePath, severity: issue.severity })),
    audit: report.issues
      .filter((issue) => issue.severity === ('off' as never))
      .map((issue) => ({ ruleId: issue.ruleId, filePath: issue.filePath, severity: issue.severity })),
  };
}

describe('whole-project CLI/MCP golden parity', () => {
  beforeAll(() => {
    assertDistBuilt();
    // Existence alone permits an obviously stale dist bundle to make this
    // contract look green. The sentinel is a cheap build-identity witness;
    // the release gate still requires an explicit fresh package build.
    for (const bundle of [
      resolve(__dirname, '../../dist/index.cjs'),
      resolve(__dirname, '../../dist/index.js'),
    ]) {
      expect(readFileSync(bundle, 'utf8')).toContain('./node_modules/.bin/slopbrick --staged');
    }
  });

  it('reconstructs one multi-file scan through source and built CLI, then MCP health', async () => {
    const workspace = writeFixture();
    try {
      expect(existsSync(BIN_PATH)).toBe(true);
      const resolvedConfig = await loadConfig(workspace);
      const sourceRun = await runScan({
        workspace,
        quiet: true,
        telemetry: false,
        threadCount: 1,
        workerScript: resolve(__dirname, '../../dist/engine/worker.cjs'),
      });
      const sourceReport = sourceRun.report;
      // Prove that the built CLI, rather than the source scan above, creates
      // the persisted health snapshot consumed by MCP.
      rmSync(join(workspace, '.slopbrick'), { recursive: true, force: true });
      const built = await execFileAsync(
        process.execPath,
        [BIN_PATH, 'scan', '--workspace', workspace, '--format', 'json', '--no-telemetry', '--threads', '1'],
        { cwd: workspace, maxBuffer: 8 * 1024 * 1024 },
      );
      const builtReport = JSON.parse(built.stdout) as ProjectReport;

      const scoreFields = ['aiSlopScore', 'engineeringHygiene', 'security', 'repositoryHealth'] as const;
      for (const field of scoreFields) {
        expect(builtReport[field]).toBeCloseTo(sourceReport[field], 8);
      }
      expect(builtReport.scoreBasis).toEqual(sourceReport.scoreBasis);
      expect(builtReport.completionStatus).toBe(sourceReport.completionStatus);
      expect(builtReport.scoreValidity).toBe(sourceReport.scoreValidity);
      expect(activeAndAudit(builtReport)).toEqual(activeAndAudit(sourceReport));
      expect(activeAndAudit(sourceReport).active).toEqual(expect.arrayContaining([
        expect.objectContaining({ ruleId: 'layout/gap-monopoly', filePath: undefined }),
        expect.objectContaining({ ruleId: 'logic/math-console-log-storm' }),
      ]));
      expect(activeAndAudit(sourceReport).audit).toEqual(expect.arrayContaining([
        expect.objectContaining({ ruleId: 'ai/comment-ratio', severity: 'off' }),
      ]));

      // Independent reconstruction of the deterministic AI score for this
      // fixture: four low-severity context findings (one per file) and one
      // medium-severity visual/project finding. Each file is log-saturated
      // first, then the per-file burdens are additively combined with the
      // fixed cumulative scale. This is intentionally not an
      // `evidence / analysedFiles` average: clean files must not dilute the
      // score, and adding harmful evidence cannot improve it.
      const perFileBurden = (points: number) =>
        Math.min(100, Math.log10(1 + points) / Math.log10(11) * 100);
      const cumulativeBurden = (burdens: number[]) =>
        Math.min(
          100,
          Math.log10(1 + burdens.reduce((sum, burden) => sum + burden, 0) / AI_BUCKET_SATURATION_SCALE) /
            Math.log10(11) *
            100,
        );
      const contextSlop = cumulativeBurden(
        Array.from({ length: 4 }, () => perFileBurden(SEVERITY_WEIGHTS.low)),
      );
      const visualSlop = cumulativeBurden([perFileBurden(SEVERITY_WEIGHTS.medium)]);
      const reconstructedAiSlop =
        COMPOSITE_WEIGHTS.context * contextSlop + COMPOSITE_WEIGHTS.visual * visualSlop;
      expect(sourceReport.aiSlopScore).toBeCloseTo(reconstructedAiSlop, 8);
      expect(sourceReport.repositoryHealth).toBeCloseTo(
        0.4 * (100 - sourceReport.aiSlopScore) +
          0.3 * sourceReport.engineeringHygiene +
          0.2 * sourceReport.security +
          0.1 * (sourceReport.testQuality ?? 0),
        8,
      );

      const health = JSON.parse(readFileSync(join(workspace, '.slopbrick', 'health.json'), 'utf8')) as Record<string, unknown>;
      const mcpResult = await handleToolCall('slop_suggest', {}, {
        cwd: workspace,
        rules: [],
        config: resolvedConfig as ResolvedConfig,
      });
      const mcpPayload = JSON.parse(mcpResult.content[0]!.text) as Record<string, any>;
      expect(mcpPayload.scores).toEqual({
        aiSlopScore: health.aiSlopScore,
        engineeringHygiene: health.engineeringHygiene,
        security: health.security,
        repositoryHealth: health.repositoryHealth,
      });
      expect(mcpPayload.scoreBasis).toEqual(health.scoreBasis);
      expect(mcpPayload.completionStatus).toBe(health.completionStatus);
      expect(mcpPayload.scoreValidity).toBe(health.scoreValidity);
      expect(mcpPayload.scoreBasis).toEqual(sourceReport.scoreBasis);
      expect(mcpPayload.completionStatus).toBe(sourceReport.completionStatus);
      expect(mcpPayload.scoreValidity).toBe(sourceReport.scoreValidity);
      expect(mcpPayload.scores).toEqual({
        aiSlopScore: Math.round(sourceReport.aiSlopScore),
        engineeringHygiene: Math.round(sourceReport.engineeringHygiene),
        security: Math.round(sourceReport.security),
        repositoryHealth: Math.round(sourceReport.repositoryHealth),
      });

      const json = JSON.parse(formatJson(sourceReport)) as Record<string, any>;
      const sarif = JSON.parse(formatSarif(sourceReport)) as { runs: Array<{ results: Array<{ ruleId: string }> }> };
      const markdown = formatMarkdown(sourceReport);
      const html = formatHtml(sourceReport);
      const pretty = formatPretty(sourceReport);
      expect(json.issues.map((issue: { ruleId: string }) => issue.ruleId)).toEqual(
        sourceReport.issues.map((issue) => issue.ruleId),
      );
      expect(sarif.runs[0]!.results.map((result) => result.ruleId)).toEqual(json.issues.map((issue: { ruleId: string }) => issue.ruleId));
      // JSON/SARIF are machine audit feeds and intentionally retain the
      // default-off history; human HTML/Markdown/pretty views are the
      // actionable feed and intentionally omit it. Incremental cache
      // hydration is a separate contract: this whole-project golden keeps
      // every selected file freshly analysed so it cannot conflate cached
      // accounting with effective issue-set parity.
      for (const output of [markdown, html, pretty]) {
        expect(output).toMatch(/Gap Monopoly|layout\/gap-monopoly/);
        expect(output).toMatch(/Math Console Log Storm|logic\/math-console-log-storm/);
        expect(output).not.toContain('ai/comment-ratio');
      }
      expect(markdown).toMatch(/Default-off audit.*4 suppressed finding instances/);
      expect(html).toMatch(/Default-off audit.*4 suppressed finding instances/);
      expect(pretty).toMatch(/4 INVERTED\/NOISY\/DORMANT default-off rule finding\(s\)/);

      // Exercise the same built renderer entry points used by consumers. Feed
      // the JSON bytes emitted by the built CLI into the packaged report
      // command so this path covers both the built serializer and renderer.
      const builtReportPath = join(workspace, 'built-report.json');
      writeFileSync(builtReportPath, built.stdout);
      const builtSarif = await execFileAsync(
        process.execPath,
        [BIN_PATH, 'scan', '--workspace', workspace, '--format', 'sarif', '--no-telemetry', '--threads', '1'],
        { cwd: workspace, maxBuffer: 8 * 1024 * 1024 },
      );
      const builtHtml = await execFileAsync(
        process.execPath,
        [BIN_PATH, 'scan', '--workspace', workspace, '--format', 'html', '--no-telemetry', '--threads', '1'],
        { cwd: workspace, maxBuffer: 8 * 1024 * 1024 },
      );
      const builtPretty = await execFileAsync(
        process.execPath,
        [BIN_PATH, 'report', builtReportPath, '--output-format', 'pretty'],
        { cwd: workspace, maxBuffer: 8 * 1024 * 1024 },
      );
      const builtMarkdown = await execFileAsync(
        process.execPath,
        [BIN_PATH, 'report', builtReportPath, '--output-format', 'markdown'],
        { cwd: workspace, maxBuffer: 8 * 1024 * 1024 },
      );
      const builtSarifJson = JSON.parse(builtSarif.stdout) as { runs: Array<{ results: Array<{ ruleId: string }> }> };
      expect(builtSarifJson.runs[0]!.results.map((result) => result.ruleId)).toEqual(json.issues.map((issue: { ruleId: string }) => issue.ruleId));
      const stripReportBanner = (output: string) =>
        output.replace(/^Re-rendered from .*\n\n/u, '').trimEnd();
      expect(stripReportBanner(builtMarkdown.stdout)).toBe(formatMarkdown(builtReport).trimEnd());
      expect(stripReportBanner(builtPretty.stdout)).toBe(formatPretty(builtReport).trimEnd());
      for (const output of [builtMarkdown.stdout, builtHtml.stdout, builtPretty.stdout]) {
        expect(output).toMatch(/Gap Monopoly|layout\/gap-monopoly/);
        expect(output).toMatch(/Math Console Log Storm|logic\/math-console-log-storm/);
        expect(output).not.toContain('ai/comment-ratio');
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
