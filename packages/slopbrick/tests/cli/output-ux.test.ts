import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { installBrokenPipeHandler } from '../../src/cli/output-stream.js';
import { formatRulesList } from '../../src/cli/render.js';

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, '..', '..');
const bin = join(repoRoot, 'bin', 'slopbrick.js');

async function runBin(args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  try {
    const { stdout, stderr } = await execFileAsync('node', [bin, ...args], { cwd, env });
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

describe('CLI output UX', () => {
  it('wraps rule descriptions within a 20-column terminal', () => {
    const originalTty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    const originalColumns = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    Object.defineProperty(process.stdout, 'columns', { configurable: true, value: 20 });
    try {
      const output = formatRulesList([{
        id: 'test/rule', category: 'test', severity: 'low', aiSpecific: false,
        description: 'one two three four five six seven eight nine ten',
      }]);
      const descriptionLines = output.split('\n').filter((line) => line.startsWith('           '));

      expect(descriptionLines).not.toHaveLength(0);
      expect(descriptionLines.every((line) => line.length <= 20)).toBe(true);
    } finally {
      if (originalTty) Object.defineProperty(process.stdout, 'isTTY', originalTty);
      else delete (process.stdout as { isTTY?: boolean }).isTTY;
      if (originalColumns) Object.defineProperty(process.stdout, 'columns', originalColumns);
      else delete (process.stdout as { columns?: number }).columns;
    }
  });

  it('treats a broken stdout pipe as a clean consumer disconnect', () => {
    const stream = new EventEmitter();
    let exitCode: number | undefined;
    installBrokenPipeHandler(stream, (code) => { exitCode = code; });

    stream.emit('error', Object.assign(new Error('closed'), { code: 'EPIPE' }));

    expect(exitCode).toBe(0);
  });

  it('does not swallow stream errors other than EPIPE', () => {
    const stream = new EventEmitter();
    installBrokenPipeHandler(stream, () => {});

    expect(() => stream.emit('error', Object.assign(new Error('disk failed'), { code: 'EIO' }))).toThrow('disk failed');
  });

  it('keeps a child process successful after an EPIPE event', async () => {
    const moduleUrl = pathToFileURL(join(repoRoot, 'dist', 'index.js')).href;
    const script = [
      `import { installBrokenPipeHandler } from ${JSON.stringify(moduleUrl)};`,
      'installBrokenPipeHandler(process.stdout);',
      "process.stdout.emit('error', Object.assign(new Error('closed'), { code: 'EPIPE' }));",
      'process.stdout.write(String(process.exitCode ?? 0));',
    ].join('\n');
    const { stdout } = await execFileAsync('node', ['--input-type=module', '--eval', script]);

    expect(stdout).toBe('0');
  });

  it('honours --no-color even when FORCE_COLOR is set', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'slopbrick-output-ux-'));
    try {
      mkdirSync(join(cwd, 'src'));
      writeFileSync(join(cwd, 'src', 'index.ts'), 'export const answer = 42;\n');
      const result = await runBin(
        ['--workspace', cwd, '--threads', '1', '--no-telemetry', '--no-color'],
        cwd,
        { ...process.env, FORCE_COLOR: '1', NO_COLOR: '' },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('AI Slop Score');
      expect(result.stdout).not.toMatch(/\u001B\[/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('honours NO_COLOR and only emits ANSI when FORCE_COLOR is otherwise allowed', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'slopbrick-output-ux-env-'));
    try {
      mkdirSync(join(cwd, 'src'));
      writeFileSync(join(cwd, 'src', 'index.ts'), 'export const answer = 42;\n');
      const args = ['--workspace', cwd, '--threads', '1', '--no-telemetry'];
      const noColor = await runBin(args, cwd, { ...process.env, FORCE_COLOR: '1', NO_COLOR: '1' });
      const forced = await runBin(args, cwd, { ...process.env, FORCE_COLOR: '1', NO_COLOR: '' });

      expect(noColor.exitCode).toBe(0);
      expect(noColor.stdout).not.toMatch(/\u001B\[/);
      expect(forced.exitCode).toBe(0);
      expect(forced.stdout).toMatch(/\u001B\[/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('keeps redirected JSON strictly parseable and ANSI-free', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'slopbrick-output-ux-json-'));
    try {
      mkdirSync(join(cwd, 'src'));
      writeFileSync(join(cwd, 'src', 'index.ts'), 'export const answer = 42;\n');
      const result = await runBin(
        ['--workspace', cwd, '--threads', '1', '--no-telemetry', '--format', 'json'],
        cwd,
        { ...process.env, FORCE_COLOR: '1', NO_COLOR: '' },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toMatch(/\u001B\[/);
      expect(JSON.parse(result.stdout)).toMatchObject({ fileCount: 1, aiSlopScore: 0 });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
