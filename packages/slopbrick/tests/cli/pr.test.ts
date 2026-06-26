// Tests for the `slopbrick pr` subcommand (Phase 11).
//
// Coverage strategy:
//   - Unit tests for runPrScan, formatPrReport, prExitCode against
//     hand-crafted filesystems in temp git repos.
//   - End-to-end tests that spawn the built `bin/slopbrick.js` and
//     assert on stdout / exit code.

import { describe, it, expect } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

import { runPrScan, formatPrReport, prExitCode } from '../../src/cli/pr';
import { DEFAULT_CONFIG } from '../../src/config';
import type { ResolvedConfig } from '../../src/types';

const execFileAsync = promisify(execFile);
const BIN = join(process.cwd(), 'bin', 'slopbrick.js');

function freshDir(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'slopbrick-pr-')));
}

function writeFile(dir: string, rel: string, content: string): string {
  const full = join(dir, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf-8');
  return full;
}

function configWith(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    ...DEFAULT_CONFIG,
    include: overrides.include ?? ['src/**/*.{ts,tsx,js,jsx,vue,svelte,astro}'],
    exclude: overrides.exclude ?? [],
    ...(overrides.constitution ? { constitution: overrides.constitution } : {}),
    ...(overrides.prScoreThreshold !== undefined
      ? { prScoreThreshold: overrides.prScoreThreshold }
      : {}),
  };
}

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, encoding: 'utf-8' });
}

function initRepo(dir: string): void {
  // `git init -b main` (git ≥ 2.28) makes the initial branch `main` so
  // the resolveBaseRef fallback chain finds it without a master dance.
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test User');
}

function commit(dir: string, message: string): void {
  const status = execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf-8' });
  if (status.trim().length === 0) return; // Nothing to commit.
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', message);
}

/**
 * Build the standard PR fixture: an initial commit on `main`, then
 * work on a feature branch (so `main` stays put while HEAD diverges
 * with the PR changes). After this helper returns, `main` is at the
 * "base" commit and HEAD is at the latest "pr" commit.
 */
function setupPrFixture(
  dir: string,
  buildBase: (d: string) => void,
  buildPr: (d: string) => void,
): void {
  initRepo(dir);
  buildBase(dir);
  commit(dir, 'base');
  // Branch off so subsequent work doesn't move `main` forward.
  git(dir, 'checkout', '-q', '-b', 'feature');
  buildPr(dir);
  commit(dir, 'pr');
}

async function runBin(
  args: string[],
  cwd: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync('node', [BIN, ...args], { cwd });
    return { exitCode: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { exitCode: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

// --- runPrScan unit tests --------------------------------------------------

describe('runPrScan', () => {
  it('throws a descriptive error outside a git repository', async () => {
    const dir = freshDir();
    try {
      await expect(runPrScan(dir, configWith())).rejects.toThrow(/git repository/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns score 0 when no source files changed (clean diff)', async () => {
    const dir = freshDir();
    try {
      setupPrFixture(
        dir,
        (d) => writeFile(d, 'src/a.ts', 'export const a = 1;\n'),
        () => {
          // no-op PR — no additional files
        },
      );
      // Feature branch with no changes: diff against main is empty.
      // (HEAD == the base commit, since we branched but added nothing.)

      const result = await runPrScan(dir, configWith(), { base: 'main', head: 'HEAD' });
      expect(result.filesChanged).toBe(0);
      expect(result.totalScore).toBe(0);
      expect(result.passed).toBe(true);
      expect(result.base).toBe('main');
      expect(result.head).toBe('HEAD');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to master when main does not exist', async () => {
    const dir = freshDir();
    try {
      // Initialize with master as the default branch (no -b main).
      git(dir, 'init', '-q', '-b', 'master');
      git(dir, 'config', 'user.email', 'test@example.com');
      git(dir, 'config', 'user.name', 'Test User');

      writeFile(dir, 'src/a.ts', 'export const a = 1;\n');
      commit(dir, 'initial');

      const result = await runPrScan(dir, configWith(), { base: 'main', head: 'HEAD' });
      expect(result.base).toBe('master');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('scores high-severity issues with the SEVERITY_WEIGHTS formula', async () => {
    const dir = freshDir();
    try {
      // The 'key-prop-missing' rule fires on .map() without a key prop.
      // It's high severity → 5 points per the engine's weights.
      setupPrFixture(
        dir,
        (d) => writeFile(d, 'README.md', 'hello'),
        (d) =>
          writeFile(
            d,
            'src/list.tsx',
            `
              export const List = () => (
                <ul>
                  {[1, 2, 3].map((n) => <li>{n}</li>)}
                </ul>
              );
            `,
          ),
      );

      const result = await runPrScan(dir, configWith(), { base: 'main', head: 'HEAD' });
      expect(result.filesChanged).toBe(1);
      expect(result.totalScore).toBeGreaterThan(0);
      expect(result.files[0]?.relPath).toBe('src/list.tsx');
      expect(result.bySeverity.high).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('adds constitution violation penalties on top of slop points', async () => {
    const dir = freshDir();
    try {
      // Importing 'redux' while constitution declares 'zustand' →
      // checkFileConstitution reports a violation. The penalty is
      // 1 point per violation.
      setupPrFixture(
        dir,
        (d) => writeFile(d, 'README.md', 'hello'),
        (d) =>
          writeFile(
            d,
            'src/store.ts',
            `import { createStore } from 'redux';\nexport const s = createStore(() => ({}));\n`,
          ),
      );

      const config = configWith({
        constitution: { stateManagement: ['zustand'] },
      });
      const result = await runPrScan(dir, config, { base: 'main', head: 'HEAD' });
      expect(result.filesChanged).toBe(1);
      const file = result.files[0]!;
      expect(file.constitutionViolationCount).toBe(1);
      expect(file.score).toBe(file.slopPoints + file.constitutionViolationCount);
      expect(result.byCategory['stateManagement']).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('honors a custom --base and --head pair', async () => {
    const dir = freshDir();
    try {
      // Files live under src/admin/ so the security/public-admin-route
      // rule fires deterministically (its regex matches the /admin/
      // segment of the file path). Without a rule firing, files.length
      // would be 0 and the filesChanged assertion would fail on
      // environments whose realpath doesn't happen to contain /private/.
      // base commit
      initRepo(dir);
      writeFile(dir, 'src/admin/a.ts', 'export const a = 1;\n');
      commit(dir, 'initial');
      const firstHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf-8' }).trim();

      // branch off and add a second file on a feature branch
      git(dir, 'checkout', '-q', '-b', 'feature');
      writeFile(dir, 'src/admin/b.ts', 'export const b = 2;\n');
      commit(dir, 'add b');
      const secondHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf-8' }).trim();

      const result = await runPrScan(dir, configWith(), {
        base: firstHead,
        head: secondHead,
      });
      expect(result.base).toBe(firstHead);
      expect(result.head).toBe(secondHead);
      expect(result.filesChanged).toBe(1);
      expect(result.files[0]?.relPath).toBe('src/admin/b.ts');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('caps the file list at --max-files', async () => {
    const dir = freshDir();
    try {
      // Files live under src/admin/ so the security/public-admin-route
      // rule fires deterministically — see the comment on the test above.
      setupPrFixture(
        dir,
        (d) => writeFile(d, 'README.md', 'hello'),
        (d) => {
          for (let i = 0; i < 5; i += 1) {
            writeFile(d, `src/admin/f${i}.ts`, `export const v${i} = ${i};\n`);
          }
        },
      );

      const result = await runPrScan(dir, configWith(), {
        base: 'main',
        head: 'HEAD',
        maxFiles: 2,
      });
      expect(result.filesChanged).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('applies include/exclude globs to the diff', async () => {
    const dir = freshDir();
    try {
      // Files live under src/admin/ and other/admin/ so the
      // security/public-admin-route rule fires deterministically — see
      // the comment on the test above.
      setupPrFixture(
        dir,
        (d) => writeFile(d, 'README.md', 'hello'),
        (d) => {
          writeFile(d, 'src/admin/keep.ts', 'export const a = 1;\n');
          writeFile(d, 'other/admin/skip.ts', 'export const b = 1;\n');
        },
      );

      const result = await runPrScan(
        dir,
        configWith({ include: ['src/**/*'] }),
        { base: 'main', head: 'HEAD' },
      );
      // 'other/admin/skip.ts' is excluded by the include glob.
      expect(result.filesChanged).toBe(1);
      expect(result.files[0]?.relPath).toBe('src/admin/keep.ts');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// --- formatPrReport --------------------------------------------------------

describe('formatPrReport', () => {
  it('emits a PASS verdict in text format when score <= threshold', async () => {
    const dir = freshDir();
    try {
      setupPrFixture(
        dir,
        (d) => writeFile(d, 'README.md', 'hello'),
        () => {
          // no PR changes
        },
      );

      const result = await runPrScan(dir, configWith(), { base: 'main', head: 'HEAD' });
      const out = formatPrReport(result, { format: 'text' });
      expect(out).toContain('PR score: 0');
      expect(out).toContain('PASS');
      expect(out).toContain('Base: main');
      expect(out).toContain('Head: HEAD');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('emits valid JSON when format=json', async () => {
    const dir = freshDir();
    try {
      setupPrFixture(
        dir,
        (d) => writeFile(d, 'README.md', 'hello'),
        () => {
          // no PR changes
        },
      );

      const result = await runPrScan(dir, configWith(), { base: 'main', head: 'HEAD' });
      const out = formatPrReport(result, { format: 'json' });
      const parsed = JSON.parse(out) as {
        base: string;
        head: string;
        totalScore: number;
        threshold: number;
        files: unknown[];
        passed: boolean;
      };
      expect(parsed.base).toBe('main');
      expect(parsed.head).toBe('HEAD');
      expect(parsed.totalScore).toBe(0);
      expect(parsed.threshold).toBe(20);
      expect(parsed.passed).toBe(true);
      expect(Array.isArray(parsed.files)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('emits valid markdown when format=markdown', async () => {
    const dir = freshDir();
    try {
      setupPrFixture(
        dir,
        (d) => writeFile(d, 'README.md', 'hello'),
        () => {
          // no PR changes
        },
      );

      const result = await runPrScan(dir, configWith(), { base: 'main', head: 'HEAD' });
      const out = formatPrReport(result, { format: 'markdown' });
      expect(out).toContain('# PR slop report');
      expect(out).toContain('**Score:**');
      expect(out).toContain('PASS');
      expect(out).toContain('`main`');
      expect(out).toContain('| File |');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('lists per-file issues in markdown when files are present', async () => {
    const dir = freshDir();
    try {
      setupPrFixture(
        dir,
        (d) => writeFile(d, 'README.md', 'hello'),
        (d) =>
          writeFile(
            d,
            'src/list.tsx',
            `export const L = () => <ul>{[1, 2, 3].map((n) => <li>{n}</li>)}</ul>;`,
          ),
      );

      const result = await runPrScan(dir, configWith(), { base: 'main', head: 'HEAD' });
      const out = formatPrReport(result, { format: 'markdown' });
      expect(out).toContain('<details>');
      expect(out).toContain('src/list.tsx');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// --- prExitCode ------------------------------------------------------------

describe('prExitCode', () => {
  it('returns 0 when totalScore <= threshold', async () => {
    const dir = freshDir();
    try {
      setupPrFixture(
        dir,
        (d) => writeFile(d, 'README.md', 'hello'),
        () => {
          // no PR changes
        },
      );

      const result = await runPrScan(dir, configWith(), {
        base: 'main',
        head: 'HEAD',
        threshold: 10,
      });
      expect(prExitCode(result)).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns 1 when totalScore > threshold', async () => {
    const dir = freshDir();
    try {
      setupPrFixture(
        dir,
        (d) => writeFile(d, 'README.md', 'hello'),
        (d) =>
          writeFile(
            d,
            'src/list.tsx',
            `export const L = () => <ul>{[1].map((n) => <li>{n}</li>)}</ul>;`,
          ),
      );

      const result = await runPrScan(dir, configWith(), {
        base: 'main',
        head: 'HEAD',
        threshold: 0,
      });
      expect(result.totalScore).toBeGreaterThan(0);
      expect(prExitCode(result)).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// --- CLI integration -------------------------------------------------------

describe('slopbrick pr (CLI)', () => {
  it('exits 0 and prints PASS for a clean PR', async () => {
    const dir = freshDir();
    try {
      setupPrFixture(
        dir,
        (d) => writeFile(d, 'README.md', 'hello'),
        () => {
          // no PR changes
        },
      );

      const { exitCode, stdout } = await runBin(['pr'], dir);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('PR score: 0');
      expect(stdout).toContain('PASS');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exits 2 with a helpful error outside a git repository', async () => {
    const dir = freshDir();
    try {
      // No initRepo call → not a git repo.
      const { exitCode, stderr } = await runBin(['pr'], dir);
      expect(exitCode).toBe(2);
      expect(stderr).toMatch(/git repository/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exits 1 when score exceeds --threshold', async () => {
    const dir = freshDir();
    try {
      setupPrFixture(
        dir,
        (d) => writeFile(d, 'README.md', 'hello'),
        (d) =>
          writeFile(
            d,
            'src/list.tsx',
            `export const L = () => <ul>{[1].map((n) => <li>{n}</li>)}</ul>;`,
          ),
      );

      const { exitCode, stdout } = await runBin(['pr', '--threshold', '0'], dir);
      expect(exitCode).toBe(1);
      expect(stdout).toContain('FAIL');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('honors a custom --base value', async () => {
    const dir = freshDir();
    try {
      initRepo(dir);
      writeFile(dir, 'src/a.ts', 'export const a = 1;\n');
      commit(dir, 'initial');
      const first = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf-8' }).trim();

      git(dir, 'checkout', '-q', '-b', 'feature');
      writeFile(dir, 'src/b.ts', 'export const b = 2;\n');
      commit(dir, 'add b');

      const { exitCode, stdout } = await runBin(['pr', '--base', first, '--head', 'HEAD'], dir);
      expect(exitCode).toBe(0);
      expect(stdout).toContain(`Base: ${first}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('emits JSON when --format json is passed', async () => {
    const dir = freshDir();
    try {
      setupPrFixture(
        dir,
        (d) => writeFile(d, 'README.md', 'hello'),
        () => {
          // no PR changes
        },
      );

      const { exitCode, stdout } = await runBin(['pr', '--format', 'json'], dir);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout) as { totalScore: number; passed: boolean };
      expect(parsed.totalScore).toBe(0);
      expect(parsed.passed).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('emits markdown when --format markdown is passed', async () => {
    const dir = freshDir();
    try {
      setupPrFixture(
        dir,
        (d) => writeFile(d, 'README.md', 'hello'),
        () => {
          // no PR changes
        },
      );

      const { exitCode, stdout } = await runBin(['pr', '--format', 'markdown'], dir);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('# PR slop report');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags constitution violations in the score', async () => {
    const dir = freshDir();
    try {
      setupPrFixture(
        dir,
        (d) => writeFile(d, 'README.md', 'hello'),
        (d) =>
          writeFile(
            d,
            'src/store.ts',
            `import { createStore } from 'redux';\nexport const s = createStore(() => ({}));\n`,
          ),
      );
      writeFile(
        dir,
        'slopbrick.config.mjs',
        `export default { include: ['src/**/*.ts'], exclude: [], constitution: { stateManagement: ['zustand'] } };`,
      );

      // Use --threshold 0 to force a fail-on-any-issue gate; the
      // single constitution violation alone is enough to trip it.
      const { exitCode, stdout } = await runBin(['pr', '--threshold', '0'], dir);
      expect(exitCode).toBe(1);
      expect(stdout).toContain('FAIL');
      expect(stdout).toContain('stateManagement');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
