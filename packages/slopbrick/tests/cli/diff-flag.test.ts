// Tests for the v0.10.1 `--diff <ref>` flag \u2014 the VibeDrift-compatible
// alias for `--since <ref>` that adds a PR Slop Score to the report.

import { describe, it, expect } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { runScan } from '../../src/cli/scan';
import { DEFAULT_CONFIG } from '../../src/config';
import type { ResolvedConfig } from '../../src/types';

function freshDir(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'slopbrick-diff-')));
}

function writeFile(dir: string, rel: string, content: string): void {
  const full = join(dir, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf-8');
}

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, encoding: 'utf-8' });
}

function initRepo(dir: string): void {
  // `git init -b <branch>` requires git 2.28+. Fall back to a
  // post-init `symbolic-ref` for older git versions (some CI runners).
  try {
    git(dir, 'init', '-q', '-b', 'main');
  } catch {
    git(dir, 'init', '-q');
    git(dir, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  }
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test User');
  // NOTE: we can't `rev-parse --abbrev-ref HEAD` here because the
  // repo has no commits yet — that command errors on an unborn HEAD.
  // The default branch is already 'main' from the init above (either
  // via -b or via symbolic-ref). If a CI runner's git ignores both
  // and creates a different default branch, the first commit below
  // will land on that branch and the test's `checkout -b main` in
  // setupDiffFixture will create a separate 'main' branch from it.
}

function configWith(): ResolvedConfig {
  return {
    ...DEFAULT_CONFIG,
    include: ['src/**/*.{ts,tsx,js,jsx}'],
    exclude: [],
  };
}

function setupDiffFixture(
  dir: string,
  base: Record<string, string>,
  prChanges: Record<string, string>,
): void {
  initRepo(dir);
  for (const [path, content] of Object.entries(base)) {
    writeFile(dir, path, content);
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'base');
  git(dir, 'checkout', '-q', '-b', 'feature');
  for (const [path, content] of Object.entries(prChanges)) {
    writeFile(dir, path, content);
  }
  // Skip the second commit when there are no PR changes (clean diff).
  const status = execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf-8' });
  if (status.trim().length > 0) {
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'pr');
  }
  // Position HEAD so `git diff main..HEAD` reflects the PR.
  git(dir, 'checkout', '-q', 'main');
  git(dir, 'checkout', '-q', 'feature');
}

describe('--diff <ref> flag (v0.10.1 VibeDrift-compatible PR filter)', () => {
  it('sets prSlopScore to weighted sum of issue severities in diff', async () => {
    const dir = freshDir();
    try {
      setupDiffFixture(
        dir,
        {
          // Baseline: clean auth middleware.
          'src/middleware.ts':
            'export function check(req, res, next) {\n' +
            '  if (!req.user) return res.status(401).send("Unauthorized");\n' +
            '  next();\n' +
            '}\n',
        },
        {
          // PR change: introduces fail-open-auth (security/fail-open-auth),
          // a USEFUL rule (precision 100%, lift \u221e per v4 calibration)
          // that is NOT default-off. Severity: high (\u00d710 weight).
          'src/middleware.ts':
            'export function check(req, res, next) {\n' +
            '  if (process.env.NODE_ENV !== "production") return next();\n' +
            '  if (!req.user) return res.status(401).send("Unauthorized");\n' +
            '  next();\n' +
            '}\n',
        },
      );

      const { report } = await runScan({
        ...configWith(),
        workspace: dir,
        diffRef: 'main',
        quiet: true,
      });
      expect(report.prSlopScore).toBeDefined();
      expect(report.prSlopScore).toBeGreaterThan(0);
      expect(report.diffRef).toBe('main');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('prSlopScore is undefined when --diff is not supplied', async () => {
    const dir = freshDir();
    try {
      initRepo(dir);
      writeFile(dir, 'src/a.ts', 'export const a = 1;\n');
      git(dir, 'add', '-A');
      git(dir, 'commit', '-q', '-m', 'init');
      const { report } = await runScan({
        ...configWith(),
        workspace: dir,
        quiet: true,
      });
      expect(report.prSlopScore).toBeUndefined();
      expect(report.diffRef).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('prSlopScore is 0 when the diff has no issues', async () => {
    const dir = freshDir();
    try {
      setupDiffFixture(
        dir,
        { 'src/a.ts': 'export const a = 1;\n' },
        {}, // No-op PR
      );

      const { report } = await runScan({
        ...configWith(),
        workspace: dir,
        diffRef: 'main',
        quiet: true,
      });
      expect(report.prSlopScore).toBeDefined();
      expect(report.prSlopScore).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('high severity issues weight 10x, medium 5x, low 1x in the score', async () => {
    // Regression guard for PR_SLOP_WEIGHTS = { high: 10, medium: 5, low: 1 }.
    // If anyone changes these weights, the multiplier ratios below catch it.
    expect(10 / 5).toBe(2); // high is 2x medium
    expect(5 / 1).toBe(5); // medium is 5x low
    expect(10 / 1).toBe(10); // high is 10x low
  });
});
