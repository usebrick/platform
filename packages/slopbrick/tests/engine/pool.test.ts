import { describe, expect, it } from 'vitest';
import { WorkerPool } from '../../src/engine/pool';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { DEFAULT_CONFIG } from '../../src/config';

const createTmpDir = () => mkdtempSync(join(tmpdir(), 'slopbrick-pool-test-'));

describe('WorkerPool', () => {
  it('scans multiple files round-robin', async () => {
    const dir = createTmpDir();
    try {
      const files: string[] = [];
      for (let i = 0; i < 4; i++) {
        const file = join(dir, `Comp${i}.tsx`);
        writeFileSync(file, `export function Comp${i}() { return <div>${i}</div>; }`);
        files.push(file);
      }
      const pool = new WorkerPool({
        config: DEFAULT_CONFIG,
        threadCount: 2,
        workerScript: resolve(__dirname, '../../dist/engine/worker.cjs'),
      });
      const results = await pool.scan(files);
      expect(results.length).toBe(4);
      expect(results.every((r) => r.componentCount > 0)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws when threadCount is 0', () => {
    expect(() => new WorkerPool({ config: DEFAULT_CONFIG, threadCount: 0 })).toThrow(
      'threadCount must be > 0',
    );
  });

  it('calls onProgress as files complete', async () => {
    const dir = createTmpDir();
    try {
      const files: string[] = [];
      for (let i = 0; i < 4; i++) {
        const file = join(dir, `Comp${i}.tsx`);
        writeFileSync(file, `export function Comp${i}() { return <div>${i}</div>; }`);
        files.push(file);
      }
      const pool = new WorkerPool({
        config: DEFAULT_CONFIG,
        threadCount: 2,
        workerScript: resolve(__dirname, '../../dist/engine/worker.cjs'),
      });
      const progress: Array<{ completed: number; total: number }> = [];
      const results = await pool.scan(files, (completed, total) => {
        progress.push({ completed, total });
      });
      expect(results.length).toBe(4);
      expect(progress.length).toBeGreaterThan(0);
      expect(progress[progress.length - 1]).toEqual({ completed: 4, total: 4 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('retries only the crashing file, not the whole batch', async () => {
    const dir = createTmpDir();
    const attemptLog = join(dir, 'attempts.log');
    process.env.SLOP_AUDIT_TEST_ATTEMPT_LOG = attemptLog;
    try {
      const good = join(dir, 'good.tsx');
      const crash = join(dir, 'crash.tsx');
      writeFileSync(good, 'export function Good() { return <div>ok</div>; }');
      writeFileSync(crash, 'export function Crash() { return <div>bad</div>; }');

      const workerScript = join(dir, 'crash-worker.cjs');
      writeFileSync(
        workerScript,
        `
const { parentPort } = require('node:worker_threads');
const fs = require('node:fs');
const logPath = process.env.SLOP_AUDIT_TEST_ATTEMPT_LOG;
function log(filePath) {
  if (logPath) fs.appendFileSync(logPath, filePath + '\\n');
}
function result(filePath) {
  return {
    filePath,
    componentCount: 1,
    issues: [],
    gapValues: [],
    styleSources: [],
  };
}
if (!parentPort) process.exit(1);
parentPort.on('message', (msg) => {
  const filePath = msg && msg.filePath;
  if (!filePath) return;
  log(filePath);
  if (filePath.includes('crash')) {
    process.exit(1);
  }
  parentPort.postMessage({ type: 'result', result: result(filePath) });
  parentPort.postMessage({ type: 'ready' });
});
parentPort.postMessage({ type: 'ready' });
`,
      );

      const pool = new WorkerPool({
        config: DEFAULT_CONFIG,
        threadCount: 1,
        workerScript,
        workerTimeoutMs: 2000,
      });
      const results = await pool.scan([good, crash]);
      const goodResult = results.find((r) => r.filePath === good);
      const crashResult = results.find((r) => r.filePath === crash);

      expect(results.length).toBe(2);
      expect(goodResult?.componentCount).toBe(1);
      expect(crashResult?.parseError).toBeTruthy();

      const attempts = existsSync(attemptLog)
        ? readFileSync(attemptLog, 'utf8')
            .split('\n')
            .filter((line) => line.length > 0)
        : [];
      expect(attempts.filter((p) => p === good).length).toBe(1);
      expect(attempts.filter((p) => p === crash).length).toBeGreaterThanOrEqual(1);
    } finally {
      delete process.env.SLOP_AUDIT_TEST_ATTEMPT_LOG;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
