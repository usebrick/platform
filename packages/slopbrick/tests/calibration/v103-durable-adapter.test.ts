import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { durableSyntheticAdapter } from '../../src/calibration/v103/durable-adapter';

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
});
