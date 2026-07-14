import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { installHook, uninstallHook, type HookResult } from '../src/cli/installer';
import { getGitRoot } from '../src/cli/git';

const createTmpDir = () =>
  mkdtempSync(join(tmpdir(), 'slopbrick-installer-test-'));

const git = (cwd: string, ...args: string[]): void => {
  execFileSync('git', args, { cwd, encoding: 'utf-8' });
};

const hookFile = (repo: string): string =>
  join(repo, '.git', 'hooks', 'pre-commit');

const sentinelBlock = `# slopbrick-hook-begin\n./node_modules/.bin/slopbrick --staged || exit $?\n# slopbrick-hook-end\n`;

describe('installer', () => {
  let repo: string;

  beforeEach(() => {
    repo = createTmpDir();
    git(repo, 'init');
    git(repo, 'config', 'user.email', 'test@example.com');
    git(repo, 'config', 'user.name', 'Test User');
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('installs a fresh pre-commit hook with the sentinel block', () => {
    const root = getGitRoot(repo);
    expect(root).toBeDefined();
    if (root === undefined) throw new Error('Git root not found');
    const result = installHook(root);

    expect(result).toEqual<HookResult>({
      ok: true,
      message: 'Installed pre-commit hook',
      exitCode: 0,
    });
    expect(readFileSync(hookFile(repo), 'utf8')).toBe(sentinelBlock);
    if (process.platform !== 'win32') {
      expect(statSync(hookFile(repo)).mode & 0o777).toBe(0o755);
    }
  });

  it('is idempotent when the hook is already installed', () => {
    const root = getGitRoot(repo);
    expect(root).toBeDefined();
    if (root === undefined) throw new Error('Git root not found');

    installHook(root);
    const second = installHook(root);

    expect(second).toEqual<HookResult>({
      ok: true,
      message: 'Hook already installed',
      exitCode: 0,
    });
    expect(readFileSync(hookFile(repo), 'utf8')).toBe(sentinelBlock);
  });

  it('upgrades a legacy network-enabled sentinel to offline execution', () => {
    const root = getGitRoot(repo);
    expect(root).toBeDefined();
    if (root === undefined) throw new Error('Git root not found');
    writeFileSync(
      hookFile(repo),
      '#!/bin/sh\n# slopbrick-hook-begin\nnpx slopbrick --staged\n# slopbrick-hook-end\n',
    );

    const result = installHook(root);

    expect(result).toEqual<HookResult>({
      ok: true,
      message: 'Replaced pre-commit hook block',
      exitCode: 0,
    });
    expect(readFileSync(hookFile(repo), 'utf8')).toBe(
      `#!/bin/sh\n${sentinelBlock}`,
    );
  });

  it('executes the project-local binary and never requests a global substitution', () => {
    if (process.platform === 'win32') return;
    const root = getGitRoot(repo);
    expect(root).toBeDefined();
    if (root === undefined) throw new Error('Git root not found');
    installHook(root);

    const bin = join(repo, 'node_modules', '.bin');
    const argsLog = join(repo, 'slopbrick-args.log');
    mkdirSync(bin, { recursive: true });
    writeFileSync(
      join(bin, 'slopbrick'),
      '#!/bin/sh\nprintf "%s\\n" "$@" > "$SLOPBRICK_ARGS"\n' +
        '[ "$1" = "--staged" ] || exit 91\n' +
        'exit 42\n',
      { mode: 0o755 },
    );

    const result = spawnSync('sh', [hookFile(repo)], {
      cwd: repo,
      encoding: 'utf8',
      env: {
        ...process.env,
        SLOPBRICK_ARGS: argsLog,
      },
    });

    expect(result.status).toBe(42);
    expect(readFileSync(argsLog, 'utf8')).toBe(
      '--staged\n',
    );
  });

  it('uninstalls the hook while preserving other content', () => {
    const root = getGitRoot(repo);
    expect(root).toBeDefined();
    if (root === undefined) throw new Error('Git root not found');
    const original = '#!/bin/sh\necho hello';
    writeFileSync(hookFile(repo), original);

    installHook(root);
    const result = uninstallHook(root);

    expect(result).toEqual<HookResult>({
      ok: true,
      message: 'Uninstalled pre-commit hook',
      exitCode: 0,
    });

    if (process.platform !== 'win32') {
      expect(statSync(hookFile(repo)).mode & 0o777).toBe(0o755);
    }

    const content = readFileSync(hookFile(repo), 'utf8');
    expect(content).toContain('#!/bin/sh');
    expect(content).toContain('echo hello');
    expect(content).not.toContain('# slopbrick-hook-begin');
    expect(content).not.toContain('# slopbrick-hook-end');
  });

  it('reports that the hook is not installed when uninstalling an empty repo', () => {
    const root = getGitRoot(repo);
    expect(root).toBeDefined();
    if (root === undefined) throw new Error('Git root not found');
    const result = uninstallHook(root);

    expect(result).toEqual<HookResult>({
      ok: true,
      message: 'Hook not installed',
      exitCode: 0,
    });
    expect(() => statSync(hookFile(repo))).toThrow();
  });

  it('returns an error for a malformed hook with only one sentinel', () => {
    const root = getGitRoot(repo);
    expect(root).toBeDefined();
    if (root === undefined) throw new Error('Git root not found');
    writeFileSync(
      hookFile(repo),
      '#!/bin/sh\n# slopbrick-hook-begin\necho hello\n',
    );

    const result = installHook(root);

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.message).toContain('Malformed pre-commit hook');
  });
});
