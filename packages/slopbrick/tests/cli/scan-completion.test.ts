import { describe, expect, it, beforeAll, afterEach } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertDistBuilt, cleanupTempDir, createTmpDir, run } from '../helpers/cli';
import { runScan } from '../../src/cli/scan';

beforeAll(assertDistBuilt);

describe('scan completion status', () => {
  const dirs: string[] = [];
  afterEach(() => { while (dirs.length) cleanupTempDir(dirs.pop()!); });

  it('reports a normal scan as complete with requested/analyzed counts', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 1;\n');
    const result = await runScan({ workspace: dir, quiet: true });
    expect(result.scanStats).toMatchObject({ status: 'complete', requested: 1, analyzed: 1, failed: 0 });
  });

  it('returns empty and non-zero for an ordinary empty workspace', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    const { stdout, stderr, exitCode } = await run(['--workspace', dir]);
    expect(exitCode).toBe(1);
    expect(stdout).not.toMatch(/AI Slop Score|clean/i);
    expect(stderr).toMatch(/requested 0|No source files matched/i);
  });

  it('keeps JSON parseable and includes completion counts for an empty scan', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    const { stdout, exitCode } = await run(['--workspace', dir, '--format', 'json']);
    expect(exitCode).toBe(1);
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    expect(parsed).toMatchObject({ completionStatus: 'empty', requested: 0, analyzed: 0, failed: 0 });
  });

  it('marks parse errors as partial and non-zero', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'broken.ts'), 'export const = ;\n');
    const result = await runScan({ workspace: dir, quiet: true });
    expect(result.scanStats.status).toBe('partial');
    expect(result.scanStats.failed).toBe(1);
    expect(result.scanStats.analyzed).toBe(0);
  });
});
