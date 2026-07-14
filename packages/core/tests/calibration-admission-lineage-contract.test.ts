import { describe, expect, it } from 'vitest';
import {
  calibrationAdmissionLineageLedgerSha256,
  calibrationAdmissionLineageResultSha256,
  calibrationAdmissionSha256,
  validateCalibrationAdmissionLineageLedgerV1,
  validateCalibrationAdmissionLineageResultV1,
} from '../src/index';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

function lineageResult(
  recordId: string,
  contentSha256: string,
  polarity: 'ai_side' | 'human_side' | 'unassigned',
  overrides: Record<string, unknown> = {},
) {
  const value = {
    version: 'v10.3-admission-lineage-result-v1' as const,
    recordId,
    contentSha256,
    polarity,
    familyId: 'family-1',
    pairGroupId: 'pair-1' as string | null,
    split: 'train' as const,
    exactClusterId: 'exact-1',
    nearClusterId: 'near-1',
    toolReceiptSha256: A,
    ...overrides,
  };
  return { ...value, lineageSha256: calibrationAdmissionLineageResultSha256(value) };
}

function ledger() {
  const results = [lineageResult('record-a', A, 'ai_side'), lineageResult('record-b', B, 'human_side')];
  const recordIds = ['record-a', 'record-b', 'record-c'];
  const value = {
    version: 'v10.3-admission-lineage-ledger-v1' as const,
    admissionRecordSetSha256: calibrationAdmissionSha256(recordIds),
    results,
    coveredRecordIds: ['record-a', 'record-b'],
    unresolvedRecordIds: ['record-c'],
  };
  return { ...value, ledgerSha256: calibrationAdmissionLineageLedgerSha256(value) };
}

describe('Task 2B lineage authority contracts', () => {
  it('accepts a paired cross-polarity family with consistent split and clusters', () => {
    const value = ledger();
    expect(validateCalibrationAdmissionLineageResultV1(value.results[0]).ok).toBe(true);
    expect(validateCalibrationAdmissionLineageLedgerV1(value, ['record-a', 'record-b', 'record-c'])).toMatchObject({ ok: true });
  });

  it('rejects family split drift, missing cross-polarity pair binding, and pair-side collisions', () => {
    const base = ledger();
    const splitDriftValue = {
      ...base,
      results: [base.results[0], lineageResult('record-b', B, 'human_side', { split: 'test' as const })],
    };
    expect(validateCalibrationAdmissionLineageLedgerV1({ ...splitDriftValue, ledgerSha256: calibrationAdmissionLineageLedgerSha256(splitDriftValue) }, ['record-a', 'record-b', 'record-c']).ok).toBe(false);

    const missingPairValue = {
      ...base,
      results: [base.results[0], lineageResult('record-b', B, 'human_side', { pairGroupId: null })],
    };
    expect(validateCalibrationAdmissionLineageLedgerV1({ ...missingPairValue, ledgerSha256: calibrationAdmissionLineageLedgerSha256(missingPairValue) }, ['record-a', 'record-b', 'record-c']).ok).toBe(false);

    const sameSideValue = {
      ...base,
      results: [base.results[0], lineageResult('record-b', B, 'ai_side')],
    };
    expect(validateCalibrationAdmissionLineageLedgerV1({ ...sameSideValue, ledgerSha256: calibrationAdmissionLineageLedgerSha256(sameSideValue) }, ['record-a', 'record-b', 'record-c']).ok).toBe(false);
  });

  it('rejects lineage self-hash mutations and incomplete record partitions', () => {
    const base = ledger();
    expect(validateCalibrationAdmissionLineageResultV1({ ...base.results[0], lineageSha256: B }).ok).toBe(false);
    expect(validateCalibrationAdmissionLineageLedgerV1({ ...base, ledgerSha256: B }, ['record-a', 'record-b', 'record-c']).ok).toBe(false);
    const missingValue = { ...base, coveredRecordIds: ['record-a'], unresolvedRecordIds: ['record-c'] };
    const missing = { ...missingValue, ledgerSha256: calibrationAdmissionLineageLedgerSha256(missingValue) };
    expect(validateCalibrationAdmissionLineageLedgerV1(missing, ['record-a', 'record-b', 'record-c']).ok).toBe(false);
  });
});
