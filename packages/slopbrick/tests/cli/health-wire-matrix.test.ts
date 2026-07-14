import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { assertDistBuilt, cleanupTempDir, createTmpDir, run } from '../helpers/cli';
import { formatHtml } from '../../src/report/html.js';
import { formatJson } from '../../src/report/json.js';
import { formatMarkdown } from '../../src/report/markdown.js';
import { formatPretty } from '../../src/report/pretty.js';
import { formatSarif } from '../../src/report/sarif.js';
import type { ProjectReport } from '../../src/types.js';

const canonicalScoreFields = [
  'aiSlopScore',
  'engineeringHygiene',
  'security',
  'repositoryHealth',
] as const;

function invalidReport(kind: 'empty' | 'partial'): ProjectReport {
  const empty = kind === 'empty';
  return {
    version: '0.44.0',
    generatedAt: '2026-07-14T00:00:00.000Z',
    aiSlopScore: 14.2,
    engineeringHygiene: 82.1,
    security: 91.4,
    repositoryHealth: 83.6,
    assemblyHealth: 85.8,
    totalScore: 14.2,
    categoryScores: {
      visual: 0, typo: 0, wcag: 0, layout: 0, component: 0, logic: 0,
      arch: 0, perf: 0, security: 0, test: 0, docs: 0, db: 0, ai: 0,
      context: 0, product: 0, i18n: 0,
    },
    boundaryScore: 0,
    contextScore: 0,
    visualScore: 0,
    p90Score: 0,
    peakScore: 0,
    componentCount: 0,
    fileCount: empty ? 0 : 2,
    thresholds: { meanSlop: 30, p90Slop: 30, individualSlopThreshold: 60 },
    components: [],
    issues: [],
    completionStatus: empty ? 'empty' : 'partial',
    scoreValidity: empty ? 'not-applicable' : 'incomplete',
    requested: empty ? 0 : 2,
    analyzed: empty ? 0 : 1,
    failed: empty ? 0 : 1,
    skipped: 0,
    scoreBasis: {
      denominator: empty ? 0 : 1,
      analyzedFiles: empty ? 0 : 1,
      issueSet: 'effective',
      suppressedIssueCount: 0,
      parseErrorCount: empty ? 0 : 1,
    },
    scanAccounting: {
      selected: empty ? 0 : 2,
      analyzed: empty ? 0 : 1,
      zeroFinding: empty ? 0 : 1,
      incrementalCached: 0,
      parseFailed: empty ? 0 : 1,
      timedOut: 0,
      crashed: 0,
      internalFailed: 0,
    },
  } as ProjectReport;
}

/**
 * Gate 2 health-wire matrix: a persisted partial scan is diagnostic evidence,
 * never a current headline score.  The other report surfaces have focused
 * contracts in scan-completion/renderer tests; this subprocess check covers
 * the remaining health consumer (`doctor`) at the same built-CLI boundary.
 */
describe('health-wire validity matrix', () => {
  const dirs: string[] = [];

  beforeAll(assertDistBuilt);
  afterEach(() => {
    while (dirs.length > 0) cleanupTempDir(dirs.pop()!);
  });

  it('does not present persisted partial health as a current repository score in doctor', async () => {
    const workspace = createTmpDir();
    dirs.push(workspace);
    mkdirSync(join(workspace, 'src'));
    writeFileSync(join(workspace, 'src', 'valid.ts'), 'export const valid = 1;\n');
    writeFileSync(join(workspace, 'src', 'broken.ts'), 'export const = ;\n');

    const scan = await run([
      '--workspace', workspace,
      '--threads', '1',
      '--no-telemetry',
      '--quiet',
    ], workspace);
    expect(scan.exitCode).toBe(1);

    const doctor = await run(['doctor'], workspace);
    expect(doctor.exitCode).toBe(1);
    expect(doctor.stdout).toContain('.slopbrick/health.json present');
    expect(doctor.stdout).toContain('scoreValidity=incomplete');
    expect(doctor.stdout).toContain('scores are not valid for gating');
    expect(doctor.stdout).not.toMatch(/repositoryHealth=\d+/);
  });

  it('does not present a legacy persisted empty health snapshot as a current score', async () => {
    const workspace = createTmpDir();
    dirs.push(workspace);
    mkdirSync(join(workspace, '.slopbrick'), { recursive: true });
    writeFileSync(
      join(workspace, '.slopbrick', 'health.json'),
      JSON.stringify({
        version: '5',
        generatedAt: '2026-07-14T00:00:00.000Z',
        workspace,
        aiSlopScore: 0,
        engineeringHygiene: 100,
        security: 100,
        repositoryHealth: 100,
        issueCounts: { high: 0, medium: 0, low: 0 },
        completionStatus: 'empty',
        scoreValidity: 'not-applicable',
        requested: 0,
        analyzed: 0,
        failed: 0,
        skipped: 0,
      }),
    );

    const doctor = await run(['doctor'], workspace);
    expect(doctor.exitCode).toBe(1);
    expect(doctor.stdout).toContain('scoreValidity=not-applicable');
    expect(doctor.stdout).toContain('scores are not applicable for gating');
    expect(doctor.stdout).not.toMatch(/repositoryHealth=\d+/);
  });

  it('keeps the CI JSON surface validity-aware for a partial changed-file scan', async () => {
    const workspace = createTmpDir();
    dirs.push(workspace);
    mkdirSync(join(workspace, 'src'));
    writeFileSync(join(workspace, 'src', 'valid.ts'), 'export const valid = 1;\n');
    execFileSync('git', ['init', '-q'], { cwd: workspace });
    execFileSync('git', ['config', 'user.email', 'health-wire@example.com'], { cwd: workspace });
    execFileSync('git', ['config', 'user.name', 'Health Wire'], { cwd: workspace });
    execFileSync('git', ['add', '.'], { cwd: workspace });
    execFileSync('git', ['commit', '-qm', 'initial'], { cwd: workspace });
    writeFileSync(join(workspace, 'src', 'broken.ts'), 'export const = ;\n');

    const result = await run([
      'ci',
      '--workspace', workspace,
      '--format', 'json',
      '--threads', '1',
    ], workspace);

    expect(result.exitCode).toBe(1);
    const payload = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(payload).toMatchObject({
      completionStatus: 'partial',
      scoreValidity: 'incomplete',
      scanAccounting: { selected: 1, analyzed: 0, parseFailed: 1 },
    });
    for (const field of ['aiSlopScore', 'engineeringHygiene', 'security', 'repositoryHealth']) {
      expect(payload).not.toHaveProperty(field);
    }
  });

  it.each(['empty', 'partial'] as const)(
    'keeps every direct report renderer score-free for a %s scan',
    (kind) => {
      const report = invalidReport(kind);
      const json = JSON.parse(formatJson(report)) as Record<string, unknown>;
      for (const field of canonicalScoreFields) expect(json).not.toHaveProperty(field);

      const sarif = JSON.parse(formatSarif(report)) as {
        runs?: Array<{ tool?: { driver?: { properties?: Record<string, unknown> } } }>;
      };
      const properties = sarif.runs?.[0]?.tool?.driver?.properties ?? {};
      expect(properties.scoreValidity).toBe(report.scoreValidity);
      expect(properties.scores).toBeUndefined();

      for (const output of [
        formatPretty(report),
        formatMarkdown(report),
        formatHtml(report),
      ]) {
        expect(output).toContain(report.scoreValidity === 'not-applicable'
          ? 'NO FILES ANALYSED — scores are not applicable for gating.'
          : 'INCOMPLETE SCAN — scores are not valid for gating.');
        expect(output).not.toMatch(/AI Slop Score|Engineering Hygiene|Repository Health|Threshold \(CI gate\)/);
      }
    },
  );
});
