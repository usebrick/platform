import { describe, expect, it } from 'vitest';
import {
  calibrationAdmissionPrivacyLedgerSha256,
  calibrationAdmissionPrivacyResultSha256,
  calibrationAdmissionSha256,
  validateCalibrationAdmissionPrivacyLedgerV1,
  validateCalibrationAdmissionPrivacyResultV1,
} from '../src/index';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const RECORD_A = '1'.repeat(64);
const RECORD_B = '2'.repeat(64);
const RECORD_C = '3'.repeat(64);

function result(
  recordId: string,
  contentSha256: string,
  overrides: Record<string, unknown> = {},
) {
  const value = {
    version: 'v10.3-admission-privacy-result-v1' as const,
    recordId,
    contentSha256,
    privacyStatus: 'pass' as const,
    secretStatus: 'pass' as const,
    findings: [],
    reviewerDecisionIds: [],
    toolReceiptSha256: A,
    ...overrides,
  };
  return { ...value, resultSha256: calibrationAdmissionPrivacyResultSha256(value) };
}

function ledger() {
  const results = [
    result(RECORD_A, A),
    result(RECORD_B, B, {
      privacyStatus: 'review' as const,
      findings: [{ kind: 'email' as const, confidence: 'low' as const, findingFingerprintSha256: C }],
      reviewerDecisionIds: [A, B],
    }),
  ];
  const recordIds = [RECORD_A, RECORD_B, RECORD_C];
  const value = {
    version: 'v10.3-admission-privacy-ledger-v1' as const,
    admissionRecordSetSha256: calibrationAdmissionSha256(recordIds),
    results,
    coveredRecordIds: [RECORD_A, RECORD_B],
    unresolvedRecordIds: [RECORD_C],
  };
  return { ...value, ledgerSha256: calibrationAdmissionPrivacyLedgerSha256(value) };
}

describe('Task 2B privacy authority contracts', () => {
  it('accepts a valid bounded result and exact covered/unresolved partition', () => {
    const value = ledger();
    expect(validateCalibrationAdmissionPrivacyResultV1(value.results[0]).ok).toBe(true);
    expect(validateCalibrationAdmissionPrivacyResultV1(value.results[1]).ok).toBe(true);
    expect(validateCalibrationAdmissionPrivacyLedgerV1(value, [RECORD_A, RECORD_B, RECORD_C])).toMatchObject({ ok: true });
  });

  it('rejects unsorted findings/IDs and overlapping or missing record partitions', () => {
    const base = ledger();
    const unsortedResultValue = {
      ...base.results[1],
      reviewerDecisionIds: [B, A],
      findings: [
        { kind: 'phone' as const, confidence: 'low' as const, findingFingerprintSha256: B },
        { kind: 'email' as const, confidence: 'low' as const, findingFingerprintSha256: A },
      ],
    };
    const unsortedResult = {
      ...unsortedResultValue,
      resultSha256: calibrationAdmissionPrivacyResultSha256(unsortedResultValue),
    };
    expect(validateCalibrationAdmissionPrivacyResultV1(unsortedResult).ok).toBe(false);

    const overlappingValue = {
      ...base,
      unresolvedRecordIds: [RECORD_B, RECORD_C],
    };
    const overlapping = {
      ...overlappingValue,
      ledgerSha256: calibrationAdmissionPrivacyLedgerSha256(overlappingValue),
    };
    expect(validateCalibrationAdmissionPrivacyLedgerV1(overlapping, [RECORD_A, RECORD_B, RECORD_C]).ok).toBe(false);

    const missingValue = {
      ...base,
      coveredRecordIds: [RECORD_A],
      unresolvedRecordIds: [RECORD_C],
      results: [base.results[0]],
    };
    const missing = {
      ...missingValue,
      ledgerSha256: calibrationAdmissionPrivacyLedgerSha256(missingValue),
    };
    expect(validateCalibrationAdmissionPrivacyLedgerV1(missing, [RECORD_A, RECORD_B, RECORD_C]).ok).toBe(false);
  });

  it('rejects self-hash/content-hash mutations and malformed records', () => {
    const value = ledger();
    expect(validateCalibrationAdmissionPrivacyResultV1({ ...value.results[0], contentSha256: B }).ok).toBe(false);
    expect(validateCalibrationAdmissionPrivacyResultV1({ ...value.results[0], resultSha256: B }).ok).toBe(false);
    expect(validateCalibrationAdmissionPrivacyResultV1({ ...value.results[0], toolReceiptSha256: 'not-a-sha' }).ok).toBe(false);
    expect(validateCalibrationAdmissionPrivacyLedgerV1({ ...value, ledgerSha256: B }, [RECORD_A, RECORD_B, RECORD_C]).ok).toBe(false);
  });

  it('rejects high-confidence findings without a corresponding fail status', () => {
    const value = result('4'.repeat(64), A, {
      findings: [{ kind: 'email' as const, confidence: 'high' as const, findingFingerprintSha256: C }],
      privacyStatus: 'review' as const,
    });
    expect(validateCalibrationAdmissionPrivacyResultV1(value).ok).toBe(false);
  });

  it('rejects more than two reviewer decisions even when a high finding fails closed', () => {
    const value = result('record-many-reviewers', A, {
      findings: [{ kind: 'email' as const, confidence: 'high' as const, findingFingerprintSha256: C }],
      privacyStatus: 'fail' as const,
      reviewerDecisionIds: [A, B, C],
    });
    expect(validateCalibrationAdmissionPrivacyResultV1(value).ok).toBe(false);
  });
});
