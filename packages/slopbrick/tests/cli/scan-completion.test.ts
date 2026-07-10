import { describe, expect, it, beforeAll, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { assertDistBuilt, cleanupTempDir, createTmpDir, run } from '../helpers/cli';
import { runScan } from '../../src/cli/scan';

beforeAll(assertDistBuilt);

describe('scan completion status', () => {
  const dirs: string[] = [];
  afterEach(() => { while (dirs.length) cleanupTempDir(dirs.pop()!); });

  it('reports a normal scan as complete with requested/analyzed counts', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 1;\n');
    const result = await runScan({ workspace: dir, quiet: true });
    expect(result.scanStats).toMatchObject({ status: 'complete', requested: 1, analyzed: 1, failed: 0 });
    expect(result.report.scoreBasis).toMatchObject({
      denominator: 1,
      analyzedFiles: 1,
      issueSet: 'effective',
      parseErrorCount: 0,
    });
  });

  it('forwards rule filters to worker scans (not only inline scans)', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    const noisy = Array.from({ length: 5 }, (_, i) => `console.log(${i});`).join('\n');
    for (let i = 0; i < 4; i++) {
      writeFileSync(join(dir, 'src', `noisy-${i}.ts`), `${noisy}\nexport const value${i} = ${i};\n`);
    }

    const result = await runScan({
      workspace: dir,
      quiet: true,
      includeRules: ['logic/math-console-log-storm'],
      threadCount: 2,
      workerScript: resolve(process.cwd(), 'dist/engine/worker.cjs'),
    });

    expect(result.scanStats).toMatchObject({ status: 'complete', requested: 4, analyzed: 4 });
    expect(result.report.issues.length).toBeGreaterThanOrEqual(4);
    expect(new Set(result.results.flatMap((file) => file.issues.map((issue) => issue.ruleId)))).toEqual(
      new Set(['logic/math-console-log-storm']),
    );
  });

  it('keeps --security-only scoped to security rules on worker scans', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    const source = [
      'const API_KEY = "AKIA1234567890ABCDEF";',
      'localStorage.setItem("access_token", API_KEY);',
      ...Array.from({ length: 5 }, (_, i) => `console.log(${i});`),
    ].join('\n');
    for (let i = 0; i < 4; i++) {
      writeFileSync(join(dir, 'src', `mixed-${i}.ts`), `${source}\nexport const value${i} = ${i};\n`);
    }

    const result = await runScan({
      workspace: dir,
      quiet: true,
      securityOnly: true,
      threadCount: 2,
      workerScript: resolve(process.cwd(), 'dist/engine/worker.cjs'),
    });

    expect(result.scanStats).toMatchObject({ status: 'complete', requested: 4, analyzed: 4 });
    const issues = result.results.flatMap((file) => file.issues);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((issue) => issue.ruleId.startsWith('security/'))).toBe(true);
  });

  it('returns empty and non-zero for an ordinary empty workspace', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    const { stdout, stderr, exitCode } = await run(['--workspace', dir]);
    expect(exitCode).toBe(1);
    expect(stdout).not.toMatch(/AI Slop Score|clean/i);
    expect(stderr).toMatch(/requested 0|No source files matched/i);
  });

  it('maps malformed config syntax to the documented config exit code', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'x.ts'), 'export const x = 1;\n');
    writeFileSync(join(dir, 'slopbrick.config.mjs'), 'export default { thresholds: { ;\n');
    const result = await run(['--workspace', dir, '--format', 'json']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/invalid .*slopbrick\.config\.mjs|failed to load config/i);
  });

  it('normalizes public display/performance flags in the packaged subprocess', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    for (let i = 0; i < 4; i++) {
      writeFileSync(join(dir, 'src', `file-${i}.ts`), `export const value${i} = ${i};\n`);
    }
    const result = await run([
      '--workspace', dir,
      '--threads', '1',
      '--verbose',
      '--brief', '--full',
      '--no-color',
    ]);
    expect(result.stderr).toMatch(/\[verbose\] selected 4 files/);
    expect(result.stdout).toContain('AI Slop Score:');
    expect(result.stdout).not.toContain('Re-run without --brief for the full report.');
    expect(result.stdout).not.toMatch(/\x1b\[/);
  });

  it('refreshes an initialized AGENTS.md block from the packaged subprocess', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'x.ts'), 'export const x = 1;\n');
    writeFileSync(
      join(dir, 'slopbrick.config.mjs'),
      'export default { include: ["src/**/*.ts"], exclude: [], projectMemory: true };\n',
    );
    writeFileSync(
      join(dir, 'AGENTS.md'),
      '# project notes\n<!-- slopbrick:begin:v3 -->\nold\n<!-- slopbrick:end:v3 -->\n',
    );
    const result = await run(['--workspace', dir, '--refresh-snippets', '--quiet']);
    expect(result.exitCode).toBe(0);
    const content = readFileSync(join(dir, 'AGENTS.md'), 'utf8');
    expect(content).toContain('slopbrick:begin:v3');
    expect(content).not.toContain('\nold\n');
    expect(content).toContain('Category-level directives');
  });

  it('writes JSON/HTML output files and honors --no-telemetry', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'x.ts'), 'export const x = 1;\n');
    const jsonPath = join(dir, 'report.json');
    const htmlPath = join(dir, 'report.html');
    expect((await run(['--workspace', dir, '--json', jsonPath, '--no-telemetry', '--quiet'])).exitCode).toBe(0);
    expect((await run(['--workspace', dir, '--html', htmlPath, '--no-telemetry', '--quiet'])).exitCode).toBe(0);
    expect(JSON.parse(readFileSync(jsonPath, 'utf8'))).toHaveProperty('completionStatus', 'complete');
    expect(readFileSync(htmlPath, 'utf8')).toContain('<!DOCTYPE html>');
    expect(existsSync(join(dir, '.slopbrick', 'flywheel', 'scans.jsonl'))).toBe(false);
  });

  it('keeps JSON parseable and includes completion counts for an empty scan', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    const { stdout, exitCode } = await run(['--workspace', dir, '--format', 'json']);
    expect(exitCode).toBe(1);
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    expect(parsed).toMatchObject({ completionStatus: 'empty', requested: 0, analyzed: 0, failed: 0 });
    expect(parsed.scoreBasis).toMatchObject({ denominator: 0, analyzedFiles: 0, issueSet: 'effective' });
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

  it.each([
    ['--fix'], ['--fix', '--dry-run'], ['--heatmap'],
  ])('keeps empty %s scans non-zero', async (...args: string[]) => {
    const dir = createTmpDir(); dirs.push(dir);
    const result = await run(['--workspace', dir, ...args]);
    expect(result.exitCode).toBe(1);
  });

  it.each(['--staged', '--changed'])('treats empty %s as a successful no-op', async (flag) => {
    const dir = createTmpDir(); dirs.push(dir);
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    const result = await run(['--workspace', dir, flag, '--quiet']);
    expect(result.exitCode).toBe(0);
  });

  it.each(['--staged', '--changed'])('keeps parse-error %s scans incomplete', async (flag) => {
    const dir = createTmpDir(); dirs.push(dir);
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'broken.ts'), 'export const = ;\n');
    execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'ignore' });
    const result = await run(['--workspace', dir, flag, '--quiet']);
    expect(result.exitCode).toBe(1);
  });
});
