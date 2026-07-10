import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { durableSyntheticAdapter } from '../../src/calibration/v103/durable-adapter';
import { executeSyntheticBisection } from '../../src/calibration/v103/bisection';

const dirs: string[] = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
const hash = 'a'.repeat(64);

describe('v10.3 durable synthetic adapter', () => {
  it('reuses an exact completed attempt without invoking the adapter', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'durable-')); dirs.push(directory);
    let calls = 0;
    const make = () => durableSyntheticAdapter({ directory, runId: 'run', inputHash: hash, initialTimeoutMs: 10, adapter: async (ids) => { calls++; return Object.fromEntries(ids.map((id) => [id, { kind: 'success' as const, findingsCount: 0 }])); } });
    await make()(['a'], 10); await make()(['a'], 10);
    expect(calls).toBe(1);
  });

  it('does not reuse a changed input hash and fails closed on corrupt completion', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'durable-')); dirs.push(directory);
    let calls = 0;
    const adapter = async (ids: readonly string[]) => { calls++; return Object.fromEntries(ids.map((id) => [id, { kind: 'success' as const, findingsCount: 0 }])); };
    await durableSyntheticAdapter({ directory, runId: 'run', inputHash: hash, initialTimeoutMs: 10, adapter })(['a'], 10);
    await expect(durableSyntheticAdapter({ directory, runId: 'run', inputHash: 'b'.repeat(64), initialTimeoutMs: 10, adapter })(['a'], 10)).rejects.toThrow();
    const files = await import('node:fs/promises');
    const file = (await files.readdir(directory)).find((name) => name.endsWith('.completed.json'))!;
    writeFileSync(join(directory, file), '{}');
    await expect(durableSyntheticAdapter({ directory, runId: 'run', inputHash: hash, initialTimeoutMs: 10, adapter })(['a'], 10)).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it('replays a complete bisection run without scanner calls on safe resume', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'durable-')); dirs.push(directory);
    let calls = 0;
    const adapter = async (ids: readonly string[], timeout: number) => {
      calls++;
      return Object.fromEntries(ids.map((id) => [id, id === 'b' && timeout === 10 ? { kind: 'timeout' as const } : { kind: 'success' as const, findingsCount: 0 }]));
    };
    const options = { directory, runId: 'run', inputHash: hash, initialTimeoutMs: 10, adapter };
    const run = () => executeSyntheticBisection(['a', 'b'], { chunkSize: 2, timeoutMs: 10, retryTimeoutMs: 20 }, durableSyntheticAdapter(options));
    await run();
    const firstCalls = calls;
    await run();
    expect(calls).toBe(firstCalls);
  });
});
