import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  assertDistBuilt,
  binPath,
  cleanupTempDir,
  createTmpDir,
} from '../helpers/cli';

interface CliResult {
  elapsedMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

function runBin(args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const child = spawn(process.execPath, [binPath, ...args], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => child.kill('SIGKILL'), 8_000);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({
        elapsedMs: performance.now() - startedAt,
        exitCode: code ?? -1,
        stderr,
        stdout,
      });
    });
  });
}

describe('opted-in CLI beacon', () => {
  const dirs: string[] = [];

  beforeAll(assertDistBuilt);
  afterEach(() => {
    while (dirs.length > 0) cleanupTempDir(dirs.pop()!);
  });

  it('does not keep a completed JSON scan alive while the endpoint hangs', async () => {
    let requestCount = 0;
    const server = http.createServer((request) => {
      requestCount += 1;
      request.resume();
      // Deliberately never send a response.
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    const dir = createTmpDir();
    dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'clean.ts'), 'export const answer = 42;\n');

    try {
      const result = await runBin([
        'scan',
        '--workspace', dir,
        '--threads', '1',
        '--no-telemetry',
        '--json',
        '--report-usage',
      ], dir, {
        ...process.env,
        SLOPBRICK_TELEMETRY_ENDPOINT: `http://127.0.0.1:${port}/ingest`,
      });

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({ fileCount: 1 });
      expect(requestCount).toBe(1);
      expect(result.elapsedMs).toBeLessThan(3_000);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 10_000);
});
