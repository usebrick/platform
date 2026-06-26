import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const execFileAsync = promisify(execFile);

const BIN = resolve(process.cwd(), 'bin', 'slopbrick.js');

function createTmp(): string {
  return mkdtempSync(join(tmpdir(), 'slopbrick-incr-'));
}

async function runBin(args: string[], cwd: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync('node', [BIN, ...args], { cwd });
    return { exitCode: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { exitCode: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

describe('slopbrick --incremental', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmp();
    // Files in src/ are auto-discovered by the default include globs.
    mkdirSync(join(dir, 'src'), { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('first run with --incremental scans everything and writes cache', async () => {
    writeFileSync(join(dir, 'src', 'a.tsx'), 'export const A = () => <div style={{ color: "red", padding: 13 }}>x</div>;');
    const cachePath = join(dir, '.cache.json');
    const { exitCode, stdout } = await runBin(['scan', '--incremental', '--cache-path', cachePath], dir);
    expect(exitCode).toBeGreaterThanOrEqual(0);
    expect(stdout).toMatch(/Incremental: re-scanned 1, skipped 0/);
    expect(existsSync(cachePath)).toBe(true);
  });

  it('second run with no changes skips all files', async () => {
    writeFileSync(join(dir, 'src', 'a.tsx'), 'export const A = () => <div>x</div>;');
    const cachePath = join(dir, '.cache.json');
    await runBin(['scan', '--incremental', '--cache-path', cachePath], dir);
    const { stdout } = await runBin(['scan', '--incremental', '--cache-path', cachePath], dir);
    expect(stdout).toMatch(/Incremental: re-scanned 0, skipped 1/);
  });

  it('re-scans a file when its content changes', async () => {
    const file = join(dir, 'src', 'a.tsx');
    writeFileSync(file, 'export const A = () => <div>x</div>;');
    const cachePath = join(dir, '.cache.json');
    await runBin(['scan', '--incremental', '--cache-path', cachePath], dir);
    writeFileSync(file, 'export const A = () => <div style={{ padding: 13 }}>x</div>;');
    const { stdout } = await runBin(['scan', '--incremental', '--cache-path', cachePath], dir);
    expect(stdout).toMatch(/Incremental: re-scanned 1, skipped 0/);
  });

  it('adds new files to the cache (rescans them)', async () => {
    const cachePath = join(dir, '.cache.json');
    writeFileSync(join(dir, 'src', 'a.tsx'), 'export const A = () => <div>x</div>;');
    await runBin(['scan', '--incremental', '--cache-path', cachePath], dir);
    writeFileSync(join(dir, 'src', 'b.tsx'), 'export const B = () => <div>y</div>;');
    const { stdout } = await runBin(['scan', '--incremental', '--cache-path', cachePath], dir);
    expect(stdout).toMatch(/Incremental: re-scanned 1, skipped 1/);
  });

  it('cache file persists per-file hashes and issue counts', async () => {
    writeFileSync(join(dir, 'src', 'a.tsx'), 'export const A = () => <div>x</div>;');
    const cachePath = join(dir, '.cache.json');
    await runBin(['scan', '--incremental', '--cache-path', cachePath], dir);
    const cache = JSON.parse(readFileSync(cachePath, 'utf-8'));
    expect(cache.version).toBeDefined();
    expect(cache.files).toBeDefined();
    const keys = Object.keys(cache.files);
    expect(keys.length).toBe(1);
    expect(cache.files[keys[0]].hash).toMatch(/^[a-f0-9]{32}$/);
    expect(cache.files[keys[0]].issueCount).toBeGreaterThanOrEqual(0);
  });

  it('cache path is configurable via --cache-path', async () => {
    writeFileSync(join(dir, 'src', 'a.tsx'), 'export const A = () => <div>x</div>;');
    const customCache = join(dir, 'subdir', 'my-cache.json');
    const { exitCode } = await runBin(['scan', '--incremental', '--cache-path', customCache], dir);
    expect(exitCode).toBeGreaterThanOrEqual(0);
    expect(existsSync(customCache)).toBe(true);
  });

  it('full scan (without --incremental) does not write the cache', async () => {
    writeFileSync(join(dir, 'src', 'a.tsx'), 'export const A = () => <div>x</div>;');
    const cachePath = join(dir, '.cache.json');
    await runBin(['scan'], dir);
    expect(existsSync(cachePath)).toBe(false);
  });

  it('cache written atomically (.tmp + rename)', async () => {
    writeFileSync(join(dir, 'src', 'a.tsx'), 'export const A = () => <div>x</div>;');
    const cachePath = join(dir, '.cache.json');
    await runBin(['scan', '--incremental', '--cache-path', cachePath], dir);
    expect(existsSync(cachePath + '.tmp')).toBe(false);
  });
});

describe('cache module direct API', () => {
  it('loadCache returns undefined for missing file', async () => {
    const { loadCache } = await import('../src/engine/cache-incremental');
    expect(loadCache('/tmp/__definitely_missing__.json')).toBeUndefined();
  });

  it('loadCache returns undefined on version mismatch', async () => {
    const { loadCache, saveCache } = await import('../src/engine/cache-incremental');
    const tmp = join(mkdtempSync(join(tmpdir(), 'slopbrick-cache-')), 'c.json');
    saveCache(tmp, {
      version: '0.0.0-fake',
      generatedAt: new Date().toISOString(),
      files: {},
    });
    expect(loadCache(tmp)).toBeUndefined();
    rmSync(tmp, { force: true });
  });

  it('computeFileHash returns a 32-char hex string', async () => {
    const { computeFileHash } = await import('../src/engine/cache-incremental');
    const tmp = join(mkdtempSync(join(tmpdir(), 'slopbrick-cache-')), 'f.txt');
    writeFileSync(tmp, 'hello world');
    const hash = computeFileHash(tmp);
    expect(hash).toMatch(/^[a-f0-9]{32}$/);
    rmSync(tmp, { force: true });
  });

  it('partitionByCache splits files by hash match', async () => {
    const { partitionByCache, computeFileHash } = await import('../src/engine/cache-incremental');
    const { VERSION } = await import('../src/types');
    const tmpDir = mkdtempSync(join(tmpdir(), 'slopbrick-cache-'));
    const f1 = join(tmpDir, 'a.txt');
    const f2 = join(tmpDir, 'b.txt');
    writeFileSync(f1, 'one');
    writeFileSync(f2, 'two');
    const { toScan, unchanged } = partitionByCache([f1, f2], {
      version: VERSION,
      generatedAt: new Date().toISOString(),
      files: {
        [f1]: { hash: computeFileHash(f1), issueCount: 0, lastScannedAt: new Date().toISOString() },
      },
    });
    expect(unchanged).toContain(f1);
    expect(toScan).toContain(f2);
    rmSync(tmpDir, { recursive: true, force: true });
  });
});