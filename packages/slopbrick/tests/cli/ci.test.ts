import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import { assertDistBuilt, cleanupTempDir, createTmpDir, run } from '../helpers/cli';
import { DEFAULT_CONFIG } from '../../src/config';
import { registerCi } from '../../src/cli/commands/ci';
import type { ProjectReport } from '../../src/types';

beforeAll(assertDistBuilt);

describe('ci gates the current scan outcome', () => {
  const dirs: string[] = [];
  afterEach(() => { while (dirs.length) cleanupTempDir(dirs.pop()!); });

  function workspace(source = 'export const value = 1;\n'): string {
    const dir = createTmpDir(); dirs.push(dir);
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'value.ts'), source);
    return dir;
  }

  it('passes and emits JSON from the current scan', async () => {
    const result = await run(['ci', '--workspace', workspace(), '--format', 'json']);
    expect(result.exitCode).toBe(0);
    const report = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(report).toMatchObject({ completionStatus: 'complete' });
  });

  it('forwards root performance/display flags through the ci subcommand', async () => {
    const result = await run([
      'ci', '--workspace', workspace(), '--threads', '1', '--no-color', '--format', 'json',
    ]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ completionStatus: 'complete' });
    expect(result.stdout).not.toMatch(/\x1b\[/);
  });

  it('passes --max-slop 1 for a clean current scan', async () => {
    const dir = workspace();
    const result = await run(['ci', '--workspace', dir, '--max-slop', '1', '--format', 'json']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/repositoryHealth/);
  });

  it('keeps an empty changed scan successful and reports completion fields', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    const result = await run(['ci', '--workspace', dir, '--format', 'json']);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      completionStatus: 'empty',
      scoreValidity: 'not-applicable',
      requested: 0,
    });
  });

  it('does not evaluate numeric CI gates for a not-applicable scan outcome', async () => {
    const program = new Command().name('slopbrick');
    registerCi(program, async () => ({
      report: {
        scoreValidity: 'not-applicable',
        aiSlopScore: 100,
      } as ProjectReport,
      config: DEFAULT_CONFIG,
      scanStats: {
        status: 'empty',
        requested: 0,
        analyzed: 0,
        failed: 0,
        skipped: 0,
        scanId: 'test-scan',
        fileCount: 0,
        ruleCount: 0,
        durationMs: 0,
      },
      baseExitCode: 0,
      exitCode: 0,
      noIncreaseFailure: false,
    }));

    await expect(program.parseAsync([
      'node', 'slopbrick', 'ci', '--max-slop', '1', '--format', 'json',
    ])).resolves.toBe(program);
  });

  it('returns a non-zero status for malformed configuration', async () => {
    const dir = workspace();
    writeFileSync(join(dir, 'slopbrick.config.mjs'), 'export default { thresholds: { ;\n');
    const result = await run(['ci', '--workspace', dir, '--format', 'json']);
    expect(result.exitCode).not.toBe(0);
  });

  it('keeps JSON completion status available when the scan fails its threshold', async () => {
    const dir = workspace('```ts\nexport const value = 1;\n```\n');
    // The canonical AI score is additive across files. Keep two independent
    // leakage findings so the max-slop=1 gate remains deterministically red
    // without depending on the former file-count dilution formula.
    writeFileSync(join(dir, 'src', 'second-value.ts'), '```ts\nexport const secondValue = 2;\n```\n');
    const result = await run(['ci', '--workspace', dir, '--max-slop', '1', '--format', 'json']);
    expect(result.exitCode).toBe(1);
    const report = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(report.completionStatus).toBe('complete');
  });

  it('forces the no-increase gate when the current scan gets worse', async () => {
    const dir = workspace();
    const first = await run(['--workspace', dir, '--format', 'json']);
    expect(first.exitCode).toBe(0);
    writeFileSync(join(dir, 'src', 'worse.tsx'), `import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname, extname } from 'node:path';
import { EventEmitter } from 'node:events';
export function Worse() { const [count, setCount] = useState(0); return <div>{count}</div>; }
`);
    const result = await run(['ci', '--workspace', dir, '--format', 'json']);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/AI Slop Score went UP|CI gate failed/);
  });
});
