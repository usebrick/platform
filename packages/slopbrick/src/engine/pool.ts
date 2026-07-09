import { Worker } from 'worker_threads';
import { cpus } from 'os';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'url';
import { logger } from './logger';
import type { FileScanResult, ResolvedConfig } from '../types';

export interface WorkerPoolOptions {
  threadCount?: number;
  workerScript?: string;
  config: ResolvedConfig;
  workerTimeoutMs?: number;
  quiet?: boolean;
}

// Maximum total attempts per file (first try + retries). If the worker
// crashes or times out on a file, the file is re-queued. After
// MAX_RETRIES attempts, the file is marked with `parseError` so the
// caller can see it failed without losing the rest of the batch.
//
// The "retrying (N/MAX_RETRIES)" log line in stderr is normal and
// expected — it is exercised by `tests/engine/pool.test.ts` to
// verify that only the crashing file retries, not the whole batch.
// Production runs should not see this line unless a real worker
// crash or timeout occurs.
const MAX_RETRIES = 2;
const MAX_STARTUP_FAILURES = 3;
const DEFAULT_WORKER_TIMEOUT_MS = 60_000;

function defaultWorkerScript(): string {
  // Prefer the CJS worker build: Node >= v24.14.0 can abort under concurrent
  // ESM->CJS preparse in worker threads (nodejs/node#63323). The CJS worker
  // uses require() for its dependencies and avoids that path.
  const candidates = ['./engine/worker.cjs', './engine/worker.js', './engine/worker.mjs'].map(
    (path) => fileURLToPath(new URL(path, import.meta.url)),
  );
  const workerScript = candidates.find(existsSync);
  if (workerScript) return workerScript;

  throw new Error(`Unable to find packaged scan worker. Tried: ${candidates.join(', ')}`);
}

function parseNodeVersion(): [number, number, number] {
  const match = process.version.match(/v(\d+)\.(\d+)\.(\d+)/);
  if (!match) return [0, 0, 0];
  return [parseInt(match[1]!, 10), parseInt(match[2]!, 10), parseInt(match[3]!, 10)];
}

function nodeVersionAtLeast(major: number, minor: number, patch: number): boolean {
  const [vMajor, vMinor, vPatch] = parseNodeVersion();
  if (vMajor !== major) return vMajor > major;
  if (vMinor !== minor) return vMinor > minor;
  return vPatch >= patch;
}

function isEsmWorkerScript(script: string): boolean {
  return script.endsWith('.mjs') || (!script.endsWith('.cjs') && script.endsWith('.js'));
}

export class WorkerPool {
  private workerScript: string;
  private config: ResolvedConfig;
  private threadCount: number;
  private workerTimeoutMs: number;
  private quiet: boolean;

  constructor(options: WorkerPoolOptions) {
    this.config = options.config;
    this.workerTimeoutMs = options.workerTimeoutMs ?? DEFAULT_WORKER_TIMEOUT_MS;
    this.quiet = options.quiet ?? false;
    // over-subscription on hybrid-core (P/E-core) machines where
    // reserving all logical cores causes context-switch thrashing.
    // Matches ESLint's auto heuristic. Explicit --threadCount still wins.
    const defaultThreads = Math.max(1, Math.floor(cpus().length / 2));
    const requested = options.threadCount ?? defaultThreads;
    if (requested <= 0) throw new Error('threadCount must be > 0');
    this.threadCount = requested;
    this.workerScript = options.workerScript ?? defaultWorkerScript();

    if (
      options.workerScript &&
      isEsmWorkerScript(options.workerScript) &&
      nodeVersionAtLeast(24, 14, 0)
    ) {
      logger.warn(
        'Warning: ESM worker scripts on Node >= v24.14.0 can crash under concurrent CJS imports (nodejs/node#63323). Prefer the CJS worker build.',
      );
    }
  }

  async scan(
    filePaths: string[],
    onProgress?: (completed: number, total: number) => void,
  ): Promise<FileScanResult[]> {
    if (filePaths.length === 0) return [];

    return new Promise((resolve, reject) => {
      const results: FileScanResult[] = [];
      const seen = new Set<string>();
      const pending = filePaths.slice();
      const workers: Worker[] = [];
      const inFlight = new Map<Worker, string>();
      const timers = new Map<Worker, ReturnType<typeof setTimeout>>();
      const retryCounts = new Map<string, number>();
      const readyWorkers = new Set<Worker>();
      const startingWorkers = new Set<Worker>();
      const handledFailures = new Set<Worker>();
      let startupFailures = 0;
      let settled = false;
      let progressTimer: ReturnType<typeof setInterval> | undefined;

      const clearTimer = (worker: Worker) => {
        const timer = timers.get(worker);
        if (timer !== undefined) {
          clearTimeout(timer);
          timers.delete(worker);
        }
      };

      const removeWorker = (worker: Worker) => {
        const index = workers.indexOf(worker);
        if (index !== -1) workers.splice(index, 1);
      };

      const cleanup = () => {
        for (const timer of timers.values()) clearTimeout(timer);
        timers.clear();
        if (progressTimer !== undefined) clearInterval(progressTimer);
        for (const worker of workers.splice(0)) worker.terminate().catch(() => {});
      };

      const settleResolve = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(results);
      };

      const settleReject = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      };

      const handleResult = (result: FileScanResult) => {
        if (!seen.has(result.filePath)) {
          seen.add(result.filePath);
          results.push(result);
          onProgress?.(results.length, filePaths.length);
        }
      };

      const maybeResolve = () => {
        if (!settled && pending.length === 0 && inFlight.size === 0) settleResolve();
      };

      const onWorkerFailure = (worker: Worker, filePath: string | undefined, err: Error) => {
        if (settled || handledFailures.has(worker)) return;
        handledFailures.add(worker);
        const workerWasReady = readyWorkers.delete(worker);
        startingWorkers.delete(worker);
        clearTimer(worker);
        inFlight.delete(worker);
        removeWorker(worker);
        worker.terminate().catch(() => {});

        if (!workerWasReady) {
          const hasViableWorker = readyWorkers.size > 0 || startingWorkers.size > 0;
          if (!hasViableWorker) {
            startupFailures += 1;
            if (startupFailures >= MAX_STARTUP_FAILURES) {
              settleReject(
                new Error(
                  `Scan workers could not start after ${MAX_STARTUP_FAILURES} consecutive failures with no viable worker: ${err.message}`,
                ),
              );
            } else {
              spawnWorker();
            }
          }
          return;
        }

        if (!filePath) {
          if (pending.length > 0) spawnWorker();
          maybeResolve();
          return;
        }

        const retries = (retryCounts.get(filePath) ?? 0) + 1;
        retryCounts.set(filePath, retries);

        if (retries <= MAX_RETRIES) {
          logger.error(`Worker failed for ${filePath}; retrying (${retries}/${MAX_RETRIES})`);
          pending.unshift(filePath);
          spawnWorker();
        } else {
          logger.error(`Worker failed for ${filePath}; retries exhausted`);
          handleResult({
            filePath,
            componentCount: 0,
            issues: [],
            parseError: err.message,
            gapValues: [],
            styleSources: [],
          });
        }
        maybeResolve();
      };

      const assignNext = (worker: Worker): boolean => {
        if (pending.length === 0) return false;
        const filePath = pending.shift()!;
        inFlight.set(worker, filePath);
        clearTimer(worker);
        timers.set(
          worker,
          setTimeout(() => {
            if (settled) return;
            const activeFile = inFlight.get(worker);
            logger.error(`Worker timed out processing ${activeFile ?? 'file'}`);
            onWorkerFailure(
              worker,
              activeFile,
              new Error(`Worker timed out after ${this.workerTimeoutMs}ms`),
            );
          }, this.workerTimeoutMs),
        );
        worker.postMessage({ filePath });
        return true;
      };

      const spawnWorker = () => {
        if (settled) return;
        const worker = new Worker(this.workerScript, {
          workerData: {
            config: this.config,
            quiet: this.quiet,
          },
        });
        workers.push(worker);
        startingWorkers.add(worker);
        timers.set(
          worker,
          setTimeout(() => {
            onWorkerFailure(
              worker,
              undefined,
              new Error(`Worker did not send ready within ${this.workerTimeoutMs}ms`),
            );
          }, this.workerTimeoutMs),
        );

        worker.on('message', (msg: { type?: string; result?: FileScanResult }) => {
          if (settled) return;
          if (msg.type === 'ready') {
            clearTimer(worker);
            startingWorkers.delete(worker);
            readyWorkers.add(worker);
            startupFailures = 0;
            assignNext(worker);
            maybeResolve();
          } else if (msg.type === 'result' && msg.result) {
            clearTimer(worker);
            inFlight.delete(worker);
            handleResult(msg.result);
          }
        });

        worker.on('error', (err) => {
          onWorkerFailure(worker, inFlight.get(worker), err);
        });

        worker.on('exit', (code) => {
          if (settled) return;
          const filePath = inFlight.get(worker);
          if (code === 0 && readyWorkers.has(worker) && filePath === undefined) {
            clearTimer(worker);
            inFlight.delete(worker);
            readyWorkers.delete(worker);
            removeWorker(worker);
            if (pending.length > 0) {
              spawnWorker();
            } else {
              maybeResolve();
            }
          } else {
            onWorkerFailure(
              worker,
              filePath,
              new Error(`Worker exited with code ${code}`),
            );
          }
        });
      };

      progressTimer = setInterval(maybeResolve, 10);
      for (let i = 0; i < this.threadCount; i++) {
        spawnWorker();
      }
    });
  }
}
