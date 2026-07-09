import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { WorkerPool } from '../../src/engine/pool';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { DEFAULT_CONFIG } from '../../src/config';

const createTmpDir = () => mkdtempSync(join(tmpdir(), 'slopbrick-pool-test-'));

function settlesWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Pool scan did not settle within ${timeoutMs}ms`)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

class ControlledWorker extends EventEmitter {
  readonly postMessage = vi.fn();
  readonly terminate = vi.fn(async () => 0);
}

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
        workerScript: resolve(__dirname, '../../dist/engine/worker.js'),
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
        workerScript: resolve(__dirname, '../../dist/engine/worker.js'),
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

  it('retries a file when a ready worker exits cleanly during processing', async () => {
    const dir = createTmpDir();
    try {
      const file = join(dir, 'lost-if-not-retried.tsx');
      writeFileSync(file, 'export function LostIfNotRetried() { return <div />; }');
      const workerScript = join(dir, 'clean-exit-worker.cjs');
      writeFileSync(
        workerScript,
        `
const { parentPort } = require('node:worker_threads');
parentPort.on('message', () => process.exit(0));
parentPort.postMessage({ type: 'ready' });
`,
      );

      const pool = new WorkerPool({
        config: DEFAULT_CONFIG,
        threadCount: 1,
        workerScript,
        workerTimeoutMs: 200,
      });
      const results = await settlesWithin(pool.scan([file]), 1_000);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ filePath: file, parseError: 'Worker exited with code 0' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps waiting for a healthy initial worker after a sibling fails startup', async () => {
    const dir = createTmpDir();
    const attemptLog = join(dir, 'mixed-startup-attempts.log');
    process.env.SLOP_POOL_MIXED_STARTUP_ATTEMPT_LOG = attemptLog;
    try {
      const workerScript = join(dir, 'mixed-startup-worker.cjs');
      writeFileSync(
        workerScript,
        `
const { parentPort } = require('node:worker_threads');
const fs = require('node:fs');
const logPath = process.env.SLOP_POOL_MIXED_STARTUP_ATTEMPT_LOG;
const attempt = fs.existsSync(logPath) ? Number(fs.readFileSync(logPath, 'utf8')) + 1 : 1;
fs.writeFileSync(logPath, String(attempt));
if (attempt !== 2) throw new Error('fast startup failure');
parentPort.on('message', ({ filePath }) => {
  parentPort.postMessage({
    type: 'result',
    result: { filePath, componentCount: 1, issues: [], gapValues: [], styleSources: [] },
  });
  parentPort.postMessage({ type: 'ready' });
});
setTimeout(() => parentPort.postMessage({ type: 'ready' }), 200);
`,
      );

      const pool = new WorkerPool({
        config: DEFAULT_CONFIG,
        threadCount: 2,
        workerScript,
        workerTimeoutMs: 500,
      });
      const results = await settlesWithin(pool.scan(['healthy.tsx']), 1_000);

      expect(results).toMatchObject([{ filePath: 'healthy.tsx', componentCount: 1 }]);
      expect(readFileSync(attemptLog, 'utf8')).toBe('2');
    } finally {
      delete process.env.SLOP_POOL_MIXED_STARTUP_ATTEMPT_LOG;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects after bounded ready-handshake timeouts', async () => {
    const dir = createTmpDir();
    const attemptLog = join(dir, 'never-ready-attempts.log');
    process.env.SLOP_POOL_NEVER_READY_ATTEMPT_LOG = attemptLog;
    try {
      const workerScript = join(dir, 'never-ready-worker.cjs');
      writeFileSync(
        workerScript,
        `
const fs = require('node:fs');
fs.appendFileSync(process.env.SLOP_POOL_NEVER_READY_ATTEMPT_LOG, 'spawn\\n');
setInterval(() => {}, 1_000);
`,
      );

      const pool = new WorkerPool({
        config: DEFAULT_CONFIG,
        threadCount: 1,
        workerScript,
        workerTimeoutMs: 50,
      });

      await expect(settlesWithin(pool.scan(['never-ready.tsx']), 1_000)).rejects.toThrow(
        /workers could not start.*did not send ready within 50ms/i,
      );

      const attempts = existsSync(attemptLog)
        ? readFileSync(attemptLog, 'utf8').split('\n').filter(Boolean)
        : [];
      expect(attempts).toHaveLength(3);
    } finally {
      delete process.env.SLOP_POOL_NEVER_READY_ATTEMPT_LOG;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('recovers pending work when a worker does not announce readiness after a result', async () => {
    const dir = createTmpDir();
    try {
      const first = join(dir, 'first.tsx');
      const second = join(dir, 'second.tsx');
      const workerScript = join(dir, 'availability-worker.cjs');
      writeFileSync(
        workerScript,
        `
const { parentPort } = require('node:worker_threads');
parentPort.on('message', ({ filePath }) => {
  parentPort.postMessage({
    type: 'result',
    result: { filePath, componentCount: 1, issues: [], gapValues: [], styleSources: [] },
  });
  if (!filePath.endsWith('first.tsx')) parentPort.postMessage({ type: 'ready' });
});
parentPort.postMessage({ type: 'ready' });
`,
      );

      const pool = new WorkerPool({
        config: DEFAULT_CONFIG,
        threadCount: 1,
        workerScript,
        workerTimeoutMs: 50,
      });
      const results = await settlesWithin(pool.scan([first, second]), 1_000);

      expect(results).toMatchObject([
        { filePath: first, componentCount: 1 },
        { filePath: second, componentCount: 1 },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('ignores a ready event emitted after its handshake timeout has failed', async () => {
    vi.useFakeTimers();
    try {
      const first = new ControlledWorker();
      const second = new ControlledWorker();
      const third = new ControlledWorker();
      const workers = [first, second, third];
      const pool = new WorkerPool({
        config: DEFAULT_CONFIG,
        threadCount: 1,
        workerScript: 'controlled-worker.cjs',
        workerTimeoutMs: 25,
        workerFactory: () => workers.shift() as never,
      });
      const scan = pool.scan(['late-ready.tsx']);

      await vi.advanceTimersByTimeAsync(25);
      expect(first.terminate).toHaveBeenCalledOnce();

      first.emit('message', { type: 'ready' });
      second.emit('error', new Error('second startup failure'));
      third.emit('error', new Error('third startup failure'));

      await expect(scan).rejects.toThrow(/workers could not start.*third startup failure/i);
      expect(first.postMessage).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cleans up when constructing a worker throws synchronously', async () => {
    vi.useFakeTimers();
    try {
      const pool = new WorkerPool({
        config: DEFAULT_CONFIG,
        threadCount: 1,
        workerScript: 'relative-worker.cjs',
      });

      await expect(pool.scan(['invalid-worker.tsx'])).rejects.toThrow(/absolute path|ERR_WORKER_PATH/i);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects an out-of-protocol result before ready without clearing startup recovery', async () => {
    const dir = createTmpDir();
    const attemptLog = join(dir, 'pre-ready-result-attempts.log');
    process.env.SLOP_POOL_PRE_READY_RESULT_ATTEMPT_LOG = attemptLog;
    try {
      const workerScript = join(dir, 'pre-ready-result-worker.cjs');
      writeFileSync(
        workerScript,
        `
const { parentPort } = require('node:worker_threads');
const fs = require('node:fs');
fs.appendFileSync(process.env.SLOP_POOL_PRE_READY_RESULT_ATTEMPT_LOG, 'spawn\\n');
parentPort.postMessage({
  type: 'result',
  result: { filePath: 'unscheduled.tsx', componentCount: 1, issues: [], gapValues: [], styleSources: [] },
});
setInterval(() => {}, 1_000);
`,
      );

      const pool = new WorkerPool({
        config: DEFAULT_CONFIG,
        threadCount: 1,
        workerScript,
        workerTimeoutMs: 100,
      });

      await expect(settlesWithin(pool.scan(['scheduled.tsx']), 1_000)).rejects.toThrow(
        /workers could not start.*result before ready or assignment/i,
      );
      const attempts = existsSync(attemptLog)
        ? readFileSync(attemptLog, 'utf8').split('\n').filter(Boolean)
        : [];
      expect(attempts).toHaveLength(3);
    } finally {
      delete process.env.SLOP_POOL_PRE_READY_RESULT_ATTEMPT_LOG;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects once after bounded pre-ready worker failures', async () => {
    const dir = createTmpDir();
    const attemptLog = join(dir, 'startup-attempts.log');
    process.env.SLOP_POOL_STARTUP_ATTEMPT_LOG = attemptLog;
    try {
      const workerScript = join(dir, 'pre-ready-failure-worker.cjs');
      writeFileSync(
        workerScript,
        `
const fs = require('node:fs');
fs.appendFileSync(process.env.SLOP_POOL_STARTUP_ATTEMPT_LOG, 'spawn\\n');
throw new Error('pre-ready fixture failure');
`,
      );

      const pool = new WorkerPool({
        config: DEFAULT_CONFIG,
        threadCount: 1,
        workerScript,
      });

      await expect(settlesWithin(pool.scan(['first.tsx', 'second.tsx']), 1_000)).rejects.toThrow(
        /workers could not start.*pre-ready fixture failure/i,
      );

      const attempts = existsSync(attemptLog)
        ? readFileSync(attemptLog, 'utf8').split('\n').filter(Boolean)
        : [];
      expect(attempts).toHaveLength(3);
    } finally {
      delete process.env.SLOP_POOL_STARTUP_ATTEMPT_LOG;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
