import { describe, expect, it } from 'vitest';
import { executeSelectedV103 } from '../../src/calibration/v103/execute-selected';

const record = (id: string, label: 'verified_ai' | 'verified_human') => ({ fileId: id, sourceId: id, repositoryId: `${id}-repo`, familyId: `${id}-family`, commitSha: 'a'.repeat(40), normalizedPath: `${id}.ts`, contentSha256: 'b'.repeat(64), language: 'ts', stratum: 'production', label, tier: 'gold', split: 'test', selectionKey: id, status: 'selected' as const });
describe('v10.3 selected execution', () => {
  it('scans only selected records and produces verified terminal evidence', async () => {
    const records = [record('a', 'verified_ai'), record('b', 'verified_human'), { ...record('c', 'verified_ai'), status: 'excluded' as const, exclusionReason: 'split_excluded' as const }];
    const seen: string[] = [];
    const result = await executeSelectedV103('run', records, { chunkSize: 2, timeoutMs: 10, retryTimeoutMs: 20, scan: async (item) => { seen.push(item.fileId); return item.fileId === 'a' ? { kind: 'success', findingsCount: 0 } : { kind: 'parse_failure' }; } });
    expect(seen).toEqual(['a', 'b']);
    expect(result.observations).toHaveLength(2);
    expect(result.failures).toHaveLength(1);
  });
});
