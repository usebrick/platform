import { describe, expect, it } from 'vitest';

import {
  buildCAL001DecisionMatrix,
  type CAL001DecisionMatrixInput,
} from '../../src/calibration/corpus-v1/calibration-decisions';
import {
  buildCAL001HoldoutReceipt,
  type CAL001HoldoutRow,
} from '../../src/calibration/corpus-v1/calibration-holdout';

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

function hashByte(value: number): string {
  return value.toString(16).padStart(2, '0').repeat(32);
}

function fixture(): CAL001DecisionMatrixInput {
  const rows: CAL001HoldoutRow[] = [
    { unitId: 'train-ai', sourceRecordId: 'train-ai', sourceId: 'source-1', sourceVersion: 'v1', label: 'positive', contentSha256: hashByte(1), normalizedSha256: hashByte(2), familyKey: 'train-ai', language: 'typescript', split: 'train', byteCount: 10 },
    { unitId: 'train-human', sourceRecordId: 'train-human', sourceId: 'source-1', sourceVersion: 'v1', label: 'negative', contentSha256: hashByte(3), normalizedSha256: hashByte(4), familyKey: 'train-human', language: 'python', split: 'train', byteCount: 20 },
    { unitId: 'validation-ai', sourceRecordId: 'validation-ai', sourceId: 'source-1', sourceVersion: 'v1', label: 'positive', contentSha256: hashByte(5), normalizedSha256: hashByte(6), familyKey: 'validation-ai', language: 'typescript', split: 'validation', byteCount: 10 },
    { unitId: 'validation-human', sourceRecordId: 'validation-human', sourceId: 'source-1', sourceVersion: 'v1', label: 'negative', contentSha256: hashByte(7), normalizedSha256: hashByte(8), familyKey: 'validation-human', language: 'python', split: 'validation', byteCount: 20 },
    { unitId: 'test-ai', sourceRecordId: 'test-ai', sourceId: 'source-1', sourceVersion: 'v1', label: 'positive', contentSha256: hashByte(9), normalizedSha256: hashByte(10), familyKey: 'test-ai', language: 'typescript', split: 'test', byteCount: 10 },
    { unitId: 'test-human', sourceRecordId: 'test-human', sourceId: 'source-1', sourceVersion: 'v1', label: 'negative', contentSha256: hashByte(11), normalizedSha256: hashByte(12), familyKey: 'test-human', language: 'python', split: 'test', byteCount: 20 },
  ];
  const holdout = buildCAL001HoldoutReceipt({
    protocolVersion: 'CAL-001-v1',
    runId: 'cal-001-v1-holdout',
    implementationCommitSha: '0123456789abcdef0123456789abcdef01234567',
    packageVersion: '0.45.0',
    configHash: '3'.repeat(64),
    inputHashes,
    workerCount: 1,
    rows,
    observations: rows.map((row) => ({
      version: 'v10.3' as const,
      runId: 'cal-001-v1-holdout',
      fileId: row.unitId,
      repositoryId: row.sourceId,
      familyId: row.familyKey,
      language: row.language,
      polarity: row.label === 'positive' ? 'verified_ai' as const : 'verified_human' as const,
      status: row.label === 'positive' ? 'success_findings' as const : 'success_zero' as const,
      ...(row.label === 'positive'
        ? { findingsCount: 1, ruleEvidence: [{ ruleId: 'ai/signal', category: 'ai' as const, aiSpecific: true, severity: 'medium' as const, count: 1 }] }
        : { findingsCount: 0 }),
    })),
    ruleCatalog: [{ ruleId: 'ai/signal', aiSpecific: true }, { ruleId: 'logic/quality', aiSpecific: false }],
  });
  return {
    protocolVersion: 'CAL-001-v1',
    holdoutImplementationCommitSha: '0123456789abcdef0123456789abcdef01234567',
    decisionImplementationCommitSha: 'fedcba9876543210fedcba9876543210fedcba98',
    holdoutReceiptSha256: holdout.receiptSha256,
    metricsSha256: holdout.metricsSha256,
    leakageStatus: 'clear',
    metricsStatus: 'available',
    ruleCatalog: [
      { ruleId: 'ai/signal', aiSpecific: true, existingDefaultOff: true },
      { ruleId: 'logic/quality', aiSpecific: false, existingDefaultOff: false },
    ],
    metrics: holdout.metrics,
  };
}

describe('CAL-001 non-admitting decision matrix', () => {
  it('assigns bounded decisions without applying rule-state changes', () => {
    const first = buildCAL001DecisionMatrix(fixture());
    const second = buildCAL001DecisionMatrix(fixture());

    expect(second).toEqual(first);
    expect(first.matrix).toMatchObject({
      version: 'cal-001-v1-decision-matrix-v1',
      admitted: false,
      applied: false,
      counts: { total: 2, aiSpecific: 1, defaultOff: 1, qualityOnly: 1 },
    });
    expect(first.matrix.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'ai/signal', decision: 'default-off', usefulnessResult: 'not-evaluated' }),
      expect.objectContaining({ ruleId: 'logic/quality', decision: 'quality-only', usefulnessResult: 'not-evaluated' }),
    ]));
    expect(first.matrix.rows[0]?.evidence).toMatchObject({ holdoutReceiptSha256: first.matrix.holdoutReceiptSha256 });
    expect(first.matrixSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(first)).not.toContain('/Users/');
  });

  it('fails closed to recalibrate when leakage or metrics availability is not clear', () => {
    const input = fixture();
    const result = buildCAL001DecisionMatrix({ ...input, leakageStatus: 'failed' });

    expect(result.matrix.rows.find((row) => row.ruleId === 'ai/signal')).toMatchObject({ decision: 'recalibrate' });
    expect(result.matrix.admitted).toBe(false);
    expect(result.matrix.applied).toBe(false);
  });
});
