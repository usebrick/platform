import { afterEach, describe, expect, it } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { runScan, buildBaselineCache } from '../../src/cli/scan';
import { hashConfig, saveBaseline } from '../../src/engine/cache';
import {
  isGitScopedEmptySelection,
  isReadOnlyGitSubset,
} from '../../src/report/scan-validity';
import { CliUsageError } from '../../src/cli/exit-codes';
import { evaluateThresholdGate } from '../../src/cli/threshold';

const dirs: string[] = [];

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function workspace(): { dir: string; base: string; cachePath: string } {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-git-subset-'));
  dirs.push(dir);
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test User');
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'value.ts'), 'export const value = 1;\n');
  writeFileSync(join(dir, 'src', 'stable.ts'), 'export const stable = true;\n');
  writeFileSync(join(dir, 'AGENTS.md'), [
    '# Project',
    '<!-- slopbrick:begin:v3 -->',
    'old managed block',
    '<!-- slopbrick:end:v3 -->',
    '',
  ].join('\n'));
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'base');
  return { dir, base: git(dir, 'rev-parse', 'HEAD'), cachePath: join(dir, 'incremental.json') };
}

function snapshotTree(root: string): Map<string, string> {
  const snapshot = new Map<string, string>();
  const visit = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) visit(path);
      else snapshot.set(path.slice(root.length + 1), readFileSync(path, 'utf8'));
    }
  };
  visit(root);
  return snapshot;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('read-only Git subset scans', () => {
  it.each([
    ['since', (base: string) => ({ since: base })],
    ['diff', (base: string) => ({ diffRef: base })],
  ] as const)('keeps every repository artifact byte-identical for nonempty --%s', async (_name, scope) => {
    const { dir, base, cachePath } = workspace();
    const seeded = await runScan({
      workspace: dir,
      quiet: true,
      incremental: true,
      cachePath,
      cache: true,
      autoRefreshSnippets: true,
      threadCount: 1,
    });
    expect(seeded.report.scoreValidity).toBe('valid');
    saveBaseline(
      dir,
      buildBaselineCache(seeded.report, hashConfig(seeded.config), base, dir),
    );

    writeFileSync(join(dir, 'src', 'value.ts'), 'export const value = 2;\n');
    git(dir, 'add', 'src/value.ts');
    git(dir, 'commit', '-q', '-m', 'change value');

    const projectBefore = snapshotTree(join(dir, '.slopbrick'));
    const incrementalBefore = readFileSync(cachePath, 'utf8');
    const agentsBefore = readFileSync(join(dir, 'AGENTS.md'), 'utf8');
    const previousCacheSetting = process.env.SLOP_AUDIT_CACHE;
    process.env.SLOP_AUDIT_CACHE = '1';
    try {
      const result = await runScan({
        workspace: dir,
        quiet: true,
        ...scope(base),
        baseline: true,
        tighten: true,
        incremental: true,
        cachePath,
        cache: true,
        autoRefreshSnippets: true,
        threadCount: 1,
      });
      expect(result.report).toMatchObject({
        completionStatus: 'complete',
        scoreValidity: 'valid',
        analyzed: 1,
      });
      expect(isReadOnlyGitSubset(scope(base))).toBe(true);
      expect(process.env.SLOP_AUDIT_CACHE).toBe('1');
    } finally {
      if (previousCacheSetting === undefined) delete process.env.SLOP_AUDIT_CACHE;
      else process.env.SLOP_AUDIT_CACHE = previousCacheSetting;
    }

    expect(snapshotTree(join(dir, '.slopbrick'))).toEqual(projectBefore);
    expect(readFileSync(cachePath, 'utf8')).toBe(incrementalBefore);
    expect(readFileSync(join(dir, 'AGENTS.md'), 'utf8')).toBe(agentsBefore);
  });

  it.each([
    ['since', { since: 'HEAD' }],
    ['diff', { diffRef: 'HEAD' }],
  ] as const)('classifies empty --%s as a successful typed Git no-op', async (_name, scope) => {
    const { dir } = workspace();
    const result = await runScan({ workspace: dir, quiet: true, ...scope });

    expect(result.report).toMatchObject({
      completionStatus: 'empty',
      scoreValidity: 'not-applicable',
      requested: 0,
    });
    expect(isGitScopedEmptySelection(result.report, scope)).toBe(true);
  });

  it('rejects --diff outside a Git repository', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slopbrick-non-git-diff-'));
    dirs.push(dir);
    await expect(runScan({ workspace: dir, diffRef: 'HEAD', quiet: true }))
      .rejects.toBeInstanceOf(CliUsageError);
  });

  it('keeps --since and --diff score projections identical with a valid current baseline', async () => {
    const { dir, base } = workspace();
    writeFileSync(join(dir, 'src', 'value.ts'), 'export const value = 2;\n');
    git(dir, 'add', 'src/value.ts');
    git(dir, 'commit', '-q', '-m', 'change value');
    const head = git(dir, 'rev-parse', 'HEAD');

    const complete = await runScan({ workspace: dir, quiet: true, threadCount: 1 });
    expect(complete.report.scoreValidity).toBe('valid');
    const baseline = buildBaselineCache(
      complete.report,
      hashConfig(complete.config),
      head,
      dir,
    );
    expect(Object.keys(baseline.scores)).toContain('src/stable.ts');
    saveBaseline(dir, baseline);
    const memoryBefore = snapshotTree(join(dir, '.slopbrick'));

    const since = await runScan({ workspace: dir, since: base, quiet: true, threadCount: 1 });
    const diff = await runScan({ workspace: dir, diffRef: base, quiet: true, threadCount: 1 });
    const projection = (result: Awaited<ReturnType<typeof runScan>>) => ({
      scores: result.scores.map(({ filePath, adjustedScore, componentCount }) => ({
        filePath: relative(dir, filePath),
        adjustedScore,
        componentCount,
      })).sort((a, b) => a.filePath.localeCompare(b.filePath)),
      components: result.report.components.map(({ filePath, adjustedScore, componentCount }) => ({
        filePath: relative(dir, filePath),
        adjustedScore,
        componentCount,
      })).sort((a, b) => a.filePath.localeCompare(b.filePath)),
      scoresAndGate: {
        aiSlopScore: result.report.aiSlopScore,
        engineeringHygiene: result.report.engineeringHygiene,
        security: result.report.security,
        repositoryHealth: result.report.repositoryHealth,
        p90Score: result.report.p90Score,
        peakScore: result.report.peakScore,
        gate: evaluateThresholdGate(result.report, result.config),
      },
    });

    expect(projection(diff)).toEqual(projection(since));
    expect(projection(diff).scores.map(({ filePath }) => filePath)).toContain('src/stable.ts');
    expect(snapshotTree(join(dir, '.slopbrick'))).toEqual(memoryBefore);
  });
});
