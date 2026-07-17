import { describe, expect, it } from 'vitest';

import {
  buildCAL001HoldoutReceipt,
  type CAL001HoldoutInput,
  type CAL001HoldoutRow,
} from '../../src/calibration/corpus-v1/calibration-holdout';
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

const splits = ['train', 'validation', 'test'] as const;

function hashByte(value: number): string {
  return value.toString(16).padStart(2, '0').repeat(32);
}

function rows(): CAL001HoldoutRow[] {
  return splits.flatMap((split, splitIndex) => [
    { unitId: `${split}-ai`, sourceRecordId: `${split}-ai-record`, sourceId: 'source-1', sourceVersion: 'v1', label: 'positive' as const, contentSha256: hashByte(splitIndex + 1), normalizedSha256: hashByte(splitIndex + 4), familyKey: `${split}-ai-family`, language: 'typescript', split, byteCount: 100 + splitIndex },
    { unitId: `${split}-human`, sourceRecordId: `${split}-human-record`, sourceId: 'source-1', sourceVersion: 'v1', label: 'negative' as const, contentSha256: hashByte(splitIndex + 7), normalizedSha256: hashByte(splitIndex + 10), familyKey: `${split}-human-family`, language: 'python', split, byteCount: 200 + splitIndex },
  ]);
}

function observation(row: CAL001HoldoutRow): V103MetricObservation {
  const finding = row.label === 'positive';
  return {
    version: 'v10.3',
    runId: 'cal-001-v1-holdout',
    fileId: row.unitId,
    repositoryId: row.sourceId,
    familyId: row.familyKey,
    language: row.language,
    polarity: row.label === 'positive' ? 'verified_ai' : 'verified_human',
    status: finding ? 'success_findings' : 'success_zero',
    ...(finding
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

function fixture(): CAL001HoldoutInput {
  const selected = rows();
  return {
    protocolVersion: 'CAL-001-v1',
    runId: 'cal-001-v1-holdout',
    implementationCommitSha: '0123456789abcdef0123456789abcdef01234567',
    packageVersion: '0.45.0',
    configHash: '3'.repeat(64),
    inputHashes,
    workerCount: 1,
    rows: selected,
    observations: selected.map(observation),
    ruleCatalog: [{ ruleId: 'ai/signal', aiSpecific: true }],
  };
}

describe('CAL-001 Corpus v1 holdout receipt', () => {
  it('is deterministic, split-bound, path-free, and non-admitting', () => {
    const first = buildCAL001HoldoutReceipt(fixture());
    const second = buildCAL001HoldoutReceipt(fixture());

    expect(second).toEqual(first);
    expect(first.receipt).toMatchObject({
      version: 'cal-001-v1-holdout-receipt-v1',
      protocolVersion: 'CAL-001-v1',
      workerCount: 1,
      population: {
        total: 6,
        positive: 3,
        negative: 3,
        splits: {
          train: { total: 2, positive: 1, negative: 1, familyCount: 2 },
          validation: { total: 2, positive: 1, negative: 1, familyCount: 2 },
          test: { total: 2, positive: 1, negative: 1, familyCount: 2 },
        },
      },
      coverage: { requested: 6, successful: 6, failed: 0 },
      leakage: { status: 'clear', crossLabelExactGroups: 0, crossLabelNormalizedGroups: 0, familySplitOverlapGroups: 0 },
      evaluation: 'diagnostic-only',
      admitted: false,
      scannerCodeExecuted: true,
      usefulness: 'not-evaluated',
      admission: 'not-evaluated',
    });
    expect(first.metrics.splits.train.base.status).toBe('available');
    expect(first.metrics.splits.validation.base.status).toBe('available');
    expect(first.metrics.splits.test.base.status).toBe('available');
    expect(first.receipt.metrics.status).toBe('available');
    expect(first.receiptSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.metricsSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(first)).not.toContain('/Users/');
    expect(JSON.stringify(first)).not.toContain('checkoutPath');
  });

  it('preserves leakage failure and keeps the result non-admitting', () => {
    const input = fixture();
    const selected = input.rows.map((row, index) => index === 2 ? { ...row, familyKey: 'train-ai-family' } : row);
    const observations = input.observations.map((item, index) => index === 2 ? { ...item, familyId: 'train-ai-family' } : item);
    const result = buildCAL001HoldoutReceipt({ ...input, rows: selected, observations });

    expect(result.receipt.leakage).toMatchObject({ status: 'failed', familySplitOverlapGroups: 1 });
    expect(result.receipt.evaluation).toBe('failed-leakage');
    expect(result.receipt.admitted).toBe(false);
    expect(result.receipt.admission).toBe('not-evaluated');
  });

  it('withholds split metrics when a selected observation fails', () => {
    const input = fixture();
    const observations = input.observations.map((item, index) => {
      if (index !== 0) return item;
      const { findingsCount: _findingsCount, ruleEvidence: _ruleEvidence, ...identity } = item;
      return { ...identity, status: 'timeout' as const, failureCode: 'timeout' };
    });
    const result = buildCAL001HoldoutReceipt({ ...input, observations });

    expect(result.receipt.coverage).toMatchObject({ successful: 5, failed: 1, timeouts: 1 });
    expect(result.receipt.metrics.status).toBe('unavailable');
    expect(result.metrics.splits.train.base.status).toBe('unavailable');
    expect(result.receipt.admitted).toBe(false);
  });
});
