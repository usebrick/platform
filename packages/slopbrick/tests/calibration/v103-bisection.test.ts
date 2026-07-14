import { describe, expect, it } from 'vitest';
import { executeSyntheticBisection, planV103Chunks } from '../../src/calibration/v103/bisection';

describe('v10.3 synthetic bisection', () => {
  it('plans deterministic bounded chunks', () => {
    expect(planV103Chunks(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
  });

  it('records success, zero-fire, and parse failures exactly once', async () => {
    const outcomes = await executeSyntheticBisection(['a', 'b', 'c'], { chunkSize: 3, timeoutMs: 10, retryTimeoutMs: 20 }, async (ids) => Object.fromEntries(ids.map((id) => [id, id === 'a' ? { kind: 'success' as const, findingsCount: 0 } : id === 'b' ? { kind: 'success' as const, findingsCount: 2 } : { kind: 'parse_failure' as const }])));
    expect(outcomes).toEqual([{ fileId: 'a', status: 'success_zero' }, { fileId: 'b', status: 'success_findings', findingsCount: 2 }, { fileId: 'c', status: 'parse_failure' }]);
  });

  it('records an explicit exclusion reason as a terminal outcome', async () => {
    const outcomes = await executeSyntheticBisection(['a'], { chunkSize: 1, timeoutMs: 10, retryTimeoutMs: 20 }, async () => ({ a: { kind: 'excluded', exclusionReason: 'max_file_bytes' } }));
    expect(outcomes).toEqual([{ fileId: 'a', status: 'excluded', exclusionReason: 'max_file_bytes' }]);
  });

  it('bisects unstable chunks and retries a singleton once with a longer timeout', async () => {
    const calls: Array<{ ids: string[]; timeout: number }> = [];
    const outcomes = await executeSyntheticBisection(['a', 'b', 'c'], { chunkSize: 3, timeoutMs: 10, retryTimeoutMs: 20 }, async (ids, timeout) => {
      calls.push({ ids: [...ids], timeout });
      return Object.fromEntries(ids.map((id) => [id, id === 'b' && timeout === 20 ? { kind: 'success', findingsCount: 0 } : id === 'b' ? { kind: 'timeout' } : { kind: 'success', findingsCount: 0 }]));
    });
    expect(calls).toEqual([{ ids: ['a', 'b', 'c'], timeout: 10 }, { ids: ['b'], timeout: 20 }]);
    expect(outcomes.map((outcome) => outcome.status)).toEqual(['success_zero', 'success_zero', 'success_zero']);
  });

  it('bisects crashes and records one final terminal failure after the retry', async () => {
    const calls: Array<{ ids: string[]; timeout: number }> = [];
    const outcomes = await executeSyntheticBisection(['a', 'b'], { chunkSize: 2, timeoutMs: 10, retryTimeoutMs: 20 }, async (ids, timeout) => {
      calls.push({ ids: [...ids], timeout });
      if (ids.length > 1) throw new Error('chunk crashed');
      return { [ids[0]!]: { kind: 'crash' } };
    });
    expect(calls).toEqual([{ ids: ['a', 'b'], timeout: 10 }, { ids: ['a'], timeout: 10 }, { ids: ['a'], timeout: 20 }, { ids: ['b'], timeout: 10 }, { ids: ['b'], timeout: 20 }]);
    expect(outcomes).toEqual([{ fileId: 'a', status: 'scanner_failure' }, { fileId: 'b', status: 'scanner_failure' }]);
  });

  it('contains malformed resolved responses as crash recovery instead of aborting the run', async () => {
    const outcomes = await executeSyntheticBisection(['a', 'b'], { chunkSize: 2, timeoutMs: 10, retryTimeoutMs: 20 }, async (ids) => {
      if (ids.length > 1) return { a: { kind: 'timeout' } } as never;
      return { [ids[0]!]: { kind: 'success', findingsCount: 0 } };
    });
    expect(outcomes).toEqual([{ fileId: 'a', status: 'success_zero' }, { fileId: 'b', status: 'success_zero' }]);
  });

  it('contains invalid finding payloads rather than emitting invalid terminal records', async () => {
    const outcomes = await executeSyntheticBisection(['a'], { chunkSize: 1, timeoutMs: 10, retryTimeoutMs: 20 }, async () => ({ a: { kind: 'success' } } as never));
    expect(outcomes).toEqual([{ fileId: 'a', status: 'scanner_failure' }]);
  });
});
