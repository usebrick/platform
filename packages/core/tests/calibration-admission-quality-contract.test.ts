import { describe, expect, it } from 'vitest';
import {
  calibrationAdmissionQualityLedgerSha256,
  calibrationAdmissionQualityResultSha256,
  calibrationAdmissionSha256,
  validateCalibrationAdmissionQualityLedgerV1,
  validateCalibrationAdmissionQualityResultV1,
} from '../src/index';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

function qualityResult(recordId: string, contentSha256: string, overrides: Record<string, unknown> = {}) {
  const value = {
    version: 'v10.3-admission-quality-result-v1' as const,
    recordId,
    contentSha256,
    syntaxStatus: 'pass' as const,
    scaffoldStatus: 'pass' as const,
    scaffoldByteShare: 0.1,
    trivialStatus: 'pass' as const,
    toolReceiptSha256: A,
    ...overrides,
  };
  return { ...value, resultSha256: calibrationAdmissionQualityResultSha256(value) };
}

function ledger() {
  const results = [qualityResult('record-a', A), qualityResult('record-b', B, { scaffoldByteShare: 0.2 })];
  const recordIds = ['record-a', 'record-b', 'record-c'];
  const value = {
    version: 'v10.3-admission-quality-ledger-v1' as const,
    admissionRecordSetSha256: calibrationAdmissionSha256(recordIds),
    results,
    coveredRecordIds: ['record-a', 'record-b'],
    unresolvedRecordIds: ['record-c'],
  };
  return { ...value, ledgerSha256: calibrationAdmissionQualityLedgerSha256(value) };
}

describe('Task 2B quality authority contracts', () => {
  it('accepts exact syntax, scaffold, and trivial outcomes with a complete partition', () => {
    const value = ledger();
    expect(validateCalibrationAdmissionQualityResultV1(value.results[0]).ok).toBe(true);
    expect(validateCalibrationAdmissionQualityLedgerV1(value, ['record-a', 'record-b', 'record-c'])).toMatchObject({ ok: true });
  });

  it('rejects malformed outcomes and non-canonical result ordering', () => {
    const base = ledger();
    const invalid = qualityResult('record-a', A, {
      syntaxStatus: 'unsupported' as const,
      scaffoldByteShare: 1.1,
    });
    expect(validateCalibrationAdmissionQualityResultV1(invalid).ok).toBe(false);

    const reversedValue = { ...base, results: [...base.results].reverse() };
    const reversed = { ...reversedValue, ledgerSha256: calibrationAdmissionQualityLedgerSha256(reversedValue) };
    expect(validateCalibrationAdmissionQualityLedgerV1(reversed, ['record-a', 'record-b', 'record-c']).ok).toBe(false);
  });

  it('rejects result and ledger hash mutations and incomplete partitions', () => {
    const base = ledger();
    expect(validateCalibrationAdmissionQualityResultV1({ ...base.results[0], resultSha256: B }).ok).toBe(false);
    expect(validateCalibrationAdmissionQualityLedgerV1({ ...base, ledgerSha256: B }, ['record-a', 'record-b', 'record-c']).ok).toBe(false);
    const missingValue = { ...base, unresolvedRecordIds: [] };
    const missing = { ...missingValue, ledgerSha256: calibrationAdmissionQualityLedgerSha256(missingValue) };
    expect(validateCalibrationAdmissionQualityLedgerV1(missing, ['record-a', 'record-b', 'record-c']).ok).toBe(false);
  });
});
