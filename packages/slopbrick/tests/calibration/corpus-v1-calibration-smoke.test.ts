import { describe, expect, it } from 'vitest';

import {
  buildCAL001SmokeReceipt,
  type CAL001SmokeInput,
} from '../../src/calibration/corpus-v1/calibration-smoke';
import type { V103MetricObservation } from '../../src/calibration/v103/metrics';

const inputHashes = {
  protocolSha256: 'a'.repeat(64),
  candidateManifestSha256: 'b'.repeat(64),
  planSha256: 'c'.repeat(64),
  sourceBindingReceiptSha256: 'd'.repeat(64),
  eligibleManifestSha256: 'e'.repeat(64),
  eligibleReceiptSha256: 'f'.repeat(64),
  smokeManifestSha256: '1'.repeat(64),
  smokeReceiptSha256: '2'.repeat(64),
} as const;

function observation(index: number, polarity: 'verified_ai' | 'verified_human'): V103MetricObservation {
  const prefix = polarity === 'verified_ai' ? 'ai' : 'human';
  const fileId = `${prefix}-${String(index).padStart(3, '0')}`;
  const fires = polarity === 'verified_ai' ? index % 2 === 0 : index % 5 === 0;
  return {
    version: 'v10.3',
    runId: 'cal-001-v1-smoke',
    fileId,
    repositoryId: `${prefix}-repo-${index % 10}`,
    familyId: `${prefix}-family-${index % 5}`,
    language: index % 2 === 0 ? 'typescript' : 'python',
    polarity,
    status: fires ? 'success_findings' : 'success_zero',
    ...(fires
      ? {
        findingsCount: 1,
        ruleEvidence: [{
          ruleId: 'ai/signal',
          category: 'ai' as const,
          aiSpecific: true,
          severity: 'medium' as const,
          count: 1,
        }],
      }
      : { findingsCount: 0 }),
  };
}

function fixture(): CAL001SmokeInput {
  const observations = [
    ...Array.from({ length: 100 }, (_, index) => observation(index, 'verified_ai')),
    ...Array.from({ length: 100 }, (_, index) => observation(index, 'verified_human')),
  ];
  return {
    protocolVersion: 'CAL-001-v1',
    runId: 'cal-001-v1-smoke',
    implementationCommitSha: '0123456789abcdef0123456789abcdef01234567',
    packageVersion: '0.45.0',
    configHash: '3'.repeat(64),
    inputHashes,
    workerCount: 1,
    observations,
    ruleCatalog: [{ ruleId: 'ai/signal', aiSpecific: true }],
    eligibleFileIdsByPolarity: {
      verified_ai: observations.filter((item) => item.polarity === 'verified_ai').map((item) => item.fileId),
      verified_human: observations.filter((item) => item.polarity === 'verified_human').map((item) => item.fileId),
    },
  };
}

describe('CAL-001 Corpus v1 calibration smoke receipt', () => {
  it('is deterministic, path-free, hash-bound, and non-admitting for 100/100 observations', () => {
    const first = buildCAL001SmokeReceipt(fixture());
    const second = buildCAL001SmokeReceipt(fixture());

    expect(second).toEqual(first);
    expect(first.receipt).toMatchObject({
      version: 'cal-001-v1-smoke-receipt-v1',
      protocolVersion: 'CAL-001-v1',
      runId: 'cal-001-v1-smoke',
      workerCount: 1,
      selected: { positive: 100, negative: 100, total: 200 },
      coverage: { requested: 200, successful: 200, excluded: 0, failed: 0 },
      metrics: { status: 'available' },
      admitted: false,
      scannerCodeExecuted: true,
      rightsDisposition: 'internal_analysis',
    });
    expect(first.receipt.inputHashes).toEqual(inputHashes);
    expect(first.receipt.metrics.metricsSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.receiptSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(first)).not.toContain('/Users/');
    expect(JSON.stringify(first)).not.toContain('checkoutPath');
  });

  it('preserves a failed terminal observation and withholds metrics instead of inventing a zero', () => {
    const input = fixture();
    const observations = input.observations.map((item, index) => {
      if (index !== 0) return item;
      const { findingsCount: _findingsCount, ruleEvidence: _ruleEvidence, ...identity } = item;
      return { ...identity, status: 'timeout' as const, failureCode: 'timeout' };
    });
    const result = buildCAL001SmokeReceipt({ ...input, observations });

    expect(result.receipt.coverage).toMatchObject({ requested: 200, successful: 199, failed: 1, timeouts: 1 });
    expect(result.receipt.metrics).toMatchObject({ status: 'unavailable', reason: 'eligible-cohort-unavailable' });
    expect(result.receipt.admitted).toBe(false);
  });

  it('rejects a non-serial worker configuration', () => {
    expect(() => buildCAL001SmokeReceipt({ ...fixture(), workerCount: 2 as 1 })).toThrow('exactly one worker');
  });
});
