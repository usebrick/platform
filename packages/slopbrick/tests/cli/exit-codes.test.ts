import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

import { assertDistBuilt, binPath, cleanupTempDir, createTmpDir, run } from '../helpers/cli';
import { mapCliError } from '../../src/cli/program';
import { installProcessFaultHandlers } from '../../src/cli/process-fault';
import { CliUsageError, ScanExitCode } from '../../src/cli/exit-codes';

const execFileAsync = promisify(execFile);

async function runNodeModule(script: string) {
  try {
    const { stdout, stderr } = await execFileAsync('node', ['--input-type=module', '--eval', script]);
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

  it.each([
    ['--rule', ['--rule', 'does/not-exist'], 'Unknown rule: does/not-exist'],
    ['--include-rule', ['--include-rule', 'does/not-exist'], 'Unknown --include-rule value(s): does/not-exist'],
  ])('routes an invalid %s scan filter through the typed usage boundary', async (_flag, args, expected) => {
    const dir = createTmpDir(); dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'clean.ts'), 'export const answer = 42;\n');

    const result = await run(['--workspace', dir, ...args, '--quiet']);
    expect(result.exitCode).toBe(ScanExitCode.usageOrConfig);
    expect(result.stderr).toContain(expected);
    expect(result.stderr).not.toContain('Unexpected error');
  });

  it('maps unexpected runCli failures to the internal status without a user environment seam', () => {
    expect(mapCliError(new Error('top-level failure'))).toEqual({
      exitCode: ScanExitCode.internal,
      message: 'Unexpected error: top-level failure',
    });
    expect(mapCliError(new CliUsageError('bad invocation'))).toEqual({
      exitCode: ScanExitCode.usageOrConfig,
      message: 'bad invocation',
    });
  });
});

describe('process-fault boundary', () => {
  type Listener = (value: unknown) => void;

  it('installs only fault listeners and does not intercept unrelated process events', () => {
    const listeners = new Map<string, Listener>();
    const writes: string[] = [];
    const exits: number[] = [];
    const host = {
      on(event: string, listener: Listener) { listeners.set(event, listener); return this; },
      stderr: { write(message: string) { writes.push(message); return true; } },
      exit(code: number) { exits.push(code); return undefined as never; },
    };

    installProcessFaultHandlers(host);

    expect([...listeners.keys()].sort()).toEqual(['uncaughtException', 'unhandledRejection']);
    expect(listeners.get('warning')).toBeUndefined();
    expect(writes).toEqual([]);
    expect(exits).toEqual([]);
  });

  it.each([
    ['unhandled rejection', "Promise.reject(new Error('rejection fault'))", 'unhandled rejection — rejection fault'],
    ['uncaught exception', "setTimeout(() => { throw new Error('exception fault'); }, 0)", 'uncaught exception — exception fault'],
  ])('maps a %s to exit 3 in a subprocess', async (_name, trigger, expected) => {
    const distUrl = new URL('../../dist/index.js', import.meta.url).href;
    const result = await runNodeModule(
      `import { installProcessFaultHandlers } from ${JSON.stringify(distUrl)}; ` +
      `installProcessFaultHandlers(process); ${trigger}`,
    );

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain(expected);
  });
});
