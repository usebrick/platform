import { describe, expect, it } from 'vitest';
import { executeSelectedV103 } from '../../src/calibration/v103/execute-selected';

const record = (id: string, label: 'verified_ai' | 'verified_human') => ({ fileId: id, sourceId: id, repositoryId: `${id}-repo`, familyId: `${id}-family`, commitSha: 'a'.repeat(40), normalizedPath: `${id}.ts`, contentSha256: 'b'.repeat(64), language: 'ts', stratum: 'production', label, tier: 'gold', split: 'test', selectionKey: id, status: 'selected' as const });
describe('v10.3 selected execution', () => {
  it('scans only selected records and produces verified terminal evidence', async () => {
    const records = [record('a', 'verified_ai'), record('b', 'verified_human'), { ...record('c', 'verified_ai'), status: 'excluded' as const, exclusionReason: 'split_excluded' as const }];
    const seen: string[] = [];
    const result = await executeSelectedV103('run', records, { chunkSize: 2, timeoutMs: 10, retryTimeoutMs: 20, scan: async (item) => { seen.push(item.fileId); return item.fileId === 'a' ? { kind: 'success', findingsCount: 2, ruleEvidence: [{ ruleId: 'ai/a', category: 'ai', aiSpecific: true, severity: 'high', count: 2 }] } : { kind: 'parse_failure' }; } });
    expect(seen).toEqual(['a', 'b']);
    expect(result.observations).toHaveLength(2);
    expect(result.observations[0]).toMatchObject({ fileId: 'a', findingsCount: 2, ruleEvidence: [{ ruleId: 'ai/a', count: 2 }] });
    expect(result.failures).toHaveLength(1);
  });

  it('bounds concurrent scans while preserving deterministic file order', async () => {
    const records = ['a', 'b', 'c', 'd'].map((id) => record(id, id === 'a' || id === 'c' ? 'verified_ai' : 'verified_human'));
    let active = 0;
    let peak = 0;
    const seen: string[] = [];
    const result = await executeSelectedV103('run', records, {
      chunkSize: 4, workerCount: 2, timeoutMs: 10, retryTimeoutMs: 20,
      scan: async (item) => {
        seen.push(item.fileId);
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active -= 1;
        return { kind: 'success', findingsCount: 0 };
      },
    });
    expect(peak).toBeLessThanOrEqual(2);
    expect(seen).toEqual(['a', 'b', 'c', 'd']);
    expect(result.observations.map((observation) => observation.fileId)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('rejects a non-positive worker count before scanning', async () => {
    await expect(executeSelectedV103('run', [record('a', 'verified_ai')], {
      workerCount: 0, chunkSize: 1, timeoutMs: 10, retryTimeoutMs: 20, scan: async () => ({ kind: 'success', findingsCount: 0 }),
    })).rejects.toThrow('workerCount must be a positive safe integer');
  });
});
