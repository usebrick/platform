import { describe, expect, it } from 'vitest';
import { materializeV103Scan } from '../../src/calibration/v103/scan-run';

const record = (fileId: string, label: 'verified_ai' | 'verified_human', language: string) => ({ fileId, sourceId: fileId, repositoryId: `${fileId}-repo`, familyId: `${fileId}-family`, commitSha: 'a'.repeat(40), normalizedPath: `${fileId}.ts`, contentSha256: 'b'.repeat(64), language, stratum: 'production', label, tier: 'gold', split: 'test', selectionKey: fileId, status: 'selected' as const });

describe('v10.3 scan materialization', () => {
  it('writes canonical observations, derived failures, and exact coverage for selected records only', () => {
    const output = materializeV103Scan('run', [record('a', 'verified_ai', 'ts'), record('b', 'verified_human', 'ts')], [{ fileId: 'a', status: 'success_zero' }, { fileId: 'b', status: 'timeout' }]);
    expect(output.observations).toHaveLength(2);
    expect(output.failures).toEqual([{ version: 'v10.3', runId: 'run', fileId: 'b', status: 'timeout', failureCode: 'timeout' }]);
    expect(output.coverage).toMatchObject({ requested: 2, successful: 1, failed: 1 });
    expect(output.verification).toMatchObject({ ok: true, diagnosticOnly: true });
  });

  it('rejects missing or unexpected terminal outcomes', () => {
    expect(() => materializeV103Scan('run', [record('a', 'verified_ai', 'ts')], [{ fileId: 'other', status: 'success_zero' }])).toThrow();
  });
});
