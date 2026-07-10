import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

import { assertDistBuilt, binPath, cleanupTempDir, createTmpDir, run } from '../helpers/cli';

const execFileAsync = promisify(execFile);

async function runWithEnv(args: string[], env: NodeJS.ProcessEnv) {
  try {
    const { stdout, stderr } = await execFileAsync('node', [binPath, ...args], { env });
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    const err = error as { stdout?: string | Buffer; stderr?: string | Buffer; code?: number };
    return {
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
      exitCode: typeof err.code === 'number' ? err.code : 1,
    };
  }
}

describe('stable scan exit-code contract', () => {
  const dirs: string[] = [];
  afterEach(() => { while (dirs.length) cleanupTempDir(dirs.pop()!); });
  beforeAll(assertDistBuilt);

  it('returns 0 for a complete clean scan', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'clean.ts'), 'export const answer = 42;\n');
    expect((await run(['--workspace', dir, '--quiet'])).exitCode).toBe(0);
  });

  it('returns 1 for a completed threshold policy breach', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'noisy.tsx'), `
      export function Component() {
        console.log('a'); console.log('b'); console.log('c');
        console.log('d'); console.log('e'); console.log('f');
        return <div />;
      }
    `);
    writeFileSync(
      join(dir, 'slopbrick.config.cjs'),
      'module.exports = { thresholds: { meanSlop: 0, p90Slop: 0, individualSlopThreshold: 0 } };\n',
    );
    expect((await run(['--workspace', dir, '--quiet'])).exitCode).toBe(1);
  });

  it('returns 1 for a partial scan caused by a malformed source file', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'broken.ts'), 'export const = ;\n');
    expect((await run(['--workspace', dir, '--quiet'])).exitCode).toBe(1);
  });

  it('returns 2 for a malformed config', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'clean.ts'), 'export const answer = 42;\n');
    writeFileSync(join(dir, 'slopbrick.config.mjs'), 'export default { thresholds: { ;\n');
    expect((await run(['--workspace', dir, '--quiet'])).exitCode).toBe(2);
  });

  it('returns 2 without an internal-error wrapper for a missing workspace', async () => {
    const result = await run(['--workspace', '/tmp/slopbrick-exit-contract-does-not-exist']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('Workspace not found');
    expect(result.stderr).not.toContain('Unexpected error');
  });

  it('returns one usage error with exit 2 for an unknown option', async () => {
    const result = await run(['--not-a-real-slopbrick-option']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr.match(/unknown option '--not-a-real-slopbrick-option'/g)).toHaveLength(1);
  });

  it('returns 3 for a doubly-gated injected top-level internal failure', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'clean.ts'), 'export const answer = 42;\n');
    const result = await runWithEnv(['--workspace', dir, '--quiet'], {
      ...process.env,
      NODE_ENV: 'test',
      SLOPBRICK_TEST_FORCE_INTERNAL_ERROR: '1',
    });
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain('Injected top-level internal failure');
  });
});
