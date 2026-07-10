import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { ScannerInvocation, ScannerInvoker } from './scanner-adapter';

type ChildRunner = (input: { readonly filePath: string; readonly resultPath: string; readonly timeoutMs: number; readonly env: NodeJS.ProcessEnv }) => Promise<{ readonly exitCode: number }>;

function timeoutError(timeoutMs: number): Error {
  return Object.assign(new Error(`child timeout after ${timeoutMs}ms`), { name: 'TimeoutError', code: 'ETIMEDOUT' });
}

function defaultRunner(input: { readonly filePath: string; readonly resultPath: string; readonly timeoutMs: number; readonly env: NodeJS.ProcessEnv }): Promise<{ readonly exitCode: number }> {
  return new Promise((resolve, reject) => {
    const sibling = fileURLToPath(new URL('./worker-process.cjs', import.meta.url));
    const builtFallback = fileURLToPath(new URL('../../../dist/calibration/v103/worker-process.cjs', import.meta.url));
    const workerScript = existsSync(sibling) ? sibling : builtFallback;
    const child = spawn(process.execPath, [workerScript, input.filePath], { cwd: process.cwd(), env: input.env, stdio: ['ignore', 'ignore', 'pipe'] });
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(timeoutError(input.timeoutMs)); }, input.timeoutMs);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => { clearTimeout(timer); resolve({ exitCode: code ?? 1 }); });
  });
}

/** Production ScannerInvoker: the temporary result path never leaves this boundary. */
export function createV103WorkerInvoker(runner: ChildRunner = defaultRunner): ScannerInvoker {
  return async (input: ScannerInvocation) => {
    const directory = await mkdtemp(join(tmpdir(), 'slopbrick-v103-'));
    const resultPath = join(directory, 'result.json');
    try {
      const processResult = await runner({ filePath: input.filePath, resultPath, timeoutMs: input.timeoutMs, env: { ...process.env, SLOP_RESULT_PATH: resultPath, SLOP_INCLUDE_RULES: JSON.stringify(input.includeRules), SLOP_EXCLUDE_RULES: JSON.stringify(input.excludeRules) } });
      let json: unknown;
      try { json = JSON.parse(await readFile(resultPath, 'utf8')); } catch { json = undefined; }
      return { exitCode: processResult.exitCode, json };
    } finally { await rm(directory, { recursive: true, force: true }); }
  };
}
