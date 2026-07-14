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

  it('preserves sanitized per-rule evidence and leaves zero evidence unavailable', () => {
    const evidence = [{ ruleId: 'ai/comment-ratio', category: 'ai', aiSpecific: true, severity: 'high' as const, count: 2 }];
    const output = materializeV103Scan('run', [record('a', 'verified_ai', 'ts'), record('b', 'verified_human', 'ts')], [
      { fileId: 'a', status: 'success_findings', findingsCount: 2, ruleEvidence: evidence },
      { fileId: 'b', status: 'success_zero' },
    ]);
    expect(output.observations[0]).toMatchObject({ fileId: 'a', ruleEvidence: evidence });
    expect(output.observations[0]).not.toHaveProperty('filePath');
    expect(output.observations[1]).not.toHaveProperty('ruleEvidence');
  });

  it('rejects missing or unexpected terminal outcomes', () => {
    expect(() => materializeV103Scan('run', [record('a', 'verified_ai', 'ts')], [{ fileId: 'other', status: 'success_zero' }])).toThrow();
  });

  it('includes scanner exclusions in terminal observations and the requested invariant', () => {
    const output = materializeV103Scan('run', [record('a', 'verified_ai', 'ts')], [{ fileId: 'a', status: 'excluded', exclusionReason: 'max_file_bytes' }]);
    expect(output.observations).toEqual([expect.objectContaining({ fileId: 'a', status: 'excluded', exclusionReason: 'max_file_bytes' })]);
    expect(output.coverage).toMatchObject({ requested: 1, successful: 0, excluded: 1, failed: 0 });
    expect(output.verification).toMatchObject({ ok: true });
  });
});
