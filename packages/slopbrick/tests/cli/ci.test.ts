import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertDistBuilt, cleanupTempDir, createTmpDir, run } from '../helpers/cli';

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
    expect(JSON.parse(result.stdout)).toMatchObject({ completionStatus: 'empty', requested: 0 });
  });

  it('returns a non-zero status for malformed configuration', async () => {
    const dir = workspace();
    writeFileSync(join(dir, 'slopbrick.config.mjs'), 'export default { thresholds: { ;\n');
    const result = await run(['ci', '--workspace', dir, '--format', 'json']);
    expect(result.exitCode).not.toBe(0);
  });

  it('keeps JSON completion status available when the scan fails its threshold', async () => {
    const dir = workspace('```ts\nexport const value = 1;\n```\n');
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
