import { calibrationAdmissionSha256 } from './calibration-admission-evidence';
import type { AdmissionQualityLedgerV1 } from './generated/calibration-admission-quality-ledger';
import {
  exactKeys,
  isAdmissionId,
  isJsonRecord,
  isSha256,
  sortedUniqueByPredicate,
  withoutJsonKey,
} from './calibration-admission-primitives';

export type { AdmissionQualityLedgerV1 };
export type AdmissionQualityResultV1 = AdmissionQualityLedgerV1['results'][number];

export interface CalibrationAdmissionQualityValidationV1 {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

type JsonObject = Record<string, unknown>;

function validation(errors: string[]): CalibrationAdmissionQualityValidationV1 {
  return { ok: errors.length === 0, errors };
}

function sortedIds(value: unknown): value is readonly string[] {
  return sortedUniqueByPredicate(value, isAdmissionId);
}

export function calibrationAdmissionQualityResultSha256(
  value: Omit<AdmissionQualityResultV1, 'resultSha256'> | JsonObject,
): string {
  return calibrationAdmissionSha256(withoutJsonKey(value, 'resultSha256'));
}

export function calibrationAdmissionQualityLedgerSha256(
  value: Omit<AdmissionQualityLedgerV1, 'ledgerSha256'> | JsonObject,
): string {
  return calibrationAdmissionSha256(withoutJsonKey(value, 'ledgerSha256'));
}

export function validateCalibrationAdmissionQualityResultV1(value: unknown): CalibrationAdmissionQualityValidationV1 {
  const errors: string[] = [];
  if (!isJsonRecord(value) || !exactKeys(value, [
    'version', 'recordId', 'contentSha256', 'syntaxStatus', 'scaffoldStatus', 'scaffoldByteShare',
    'trivialStatus', 'toolReceiptSha256', 'resultSha256',
  ])) return validation(['quality result shape is invalid']);
  if (value.version !== 'v10.3-admission-quality-result-v1') errors.push('quality result version is invalid');
  if (!isAdmissionId(value.recordId)) errors.push('quality result recordId is invalid');
  if (!isSha256(value.contentSha256)) errors.push('quality result contentSha256 is invalid');
  if (value.syntaxStatus !== 'pass' && value.syntaxStatus !== 'fail' && value.syntaxStatus !== 'unsupported') errors.push('syntaxStatus is invalid');
  if (value.scaffoldStatus !== 'pass' && value.scaffoldStatus !== 'fail') errors.push('scaffoldStatus is invalid');
  if (typeof value.scaffoldByteShare !== 'number' || !Number.isFinite(value.scaffoldByteShare) || value.scaffoldByteShare < 0 || value.scaffoldByteShare > 1) errors.push('scaffoldByteShare must be in [0,1]');
  if (value.trivialStatus !== 'pass' && value.trivialStatus !== 'fail') errors.push('trivialStatus is invalid');
  if (!isSha256(value.toolReceiptSha256)) errors.push('quality result tool receipt is invalid');
  if (!isSha256(value.resultSha256)) errors.push('quality result self-hash is invalid');
  try {
    if (isSha256(value.resultSha256) && calibrationAdmissionQualityResultSha256(value) !== value.resultSha256) errors.push('quality result self-hash does not match canonical bytes');
  } catch {
    errors.push('quality result cannot be canonicalized');
  }
  return validation(errors);
}

export function validateCalibrationAdmissionQualityLedgerV1(
  value: unknown,
  admissionRecordIds: readonly string[],
): CalibrationAdmissionQualityValidationV1 {
  const errors: string[] = [];
  if (!isJsonRecord(value) || !exactKeys(value, [
    'version', 'admissionRecordSetSha256', 'results', 'coveredRecordIds', 'unresolvedRecordIds', 'ledgerSha256',
  ])) return validation(['quality ledger shape is invalid']);
  if (!sortedIds(admissionRecordIds)) errors.push('admission record IDs must be sorted and unique');
  if (value.version !== 'v10.3-admission-quality-ledger-v1') errors.push('quality ledger version is invalid');
  if (!isSha256(value.admissionRecordSetSha256)) errors.push('quality ledger admission record set hash is invalid');
  if (!isSha256(value.ledgerSha256)) errors.push('quality ledger self-hash is invalid');
  if (!sortedIds(value.coveredRecordIds)) errors.push('quality ledger covered IDs must be sorted and unique');
  if (!sortedIds(value.unresolvedRecordIds)) errors.push('quality ledger unresolved IDs must be sorted and unique');

  const results = value.results;
  const resultIds: string[] = [];
  if (!Array.isArray(results) || results.length > 452_382) {
    errors.push('quality ledger results are not bounded');
  } else {
    let previous = '';
    for (const entry of results) {
      const resultValidation = validateCalibrationAdmissionQualityResultV1(entry);
      if (!resultValidation.ok) errors.push(...resultValidation.errors.map((entryError) => `result: ${entryError}`));
      if (isJsonRecord(entry) && typeof entry.recordId === 'string') {
        if (entry.recordId <= previous) errors.push('quality ledger results must be sorted and unique by recordId');
        previous = entry.recordId;
        resultIds.push(entry.recordId);
      }
    }
  }
  const covered = Array.isArray(value.coveredRecordIds) ? value.coveredRecordIds : [];
  const unresolved = Array.isArray(value.unresolvedRecordIds) ? value.unresolvedRecordIds : [];
  const expected = [...admissionRecordIds];
  if (covered.some((id) => unresolved.includes(id))) errors.push('covered and unresolved quality record IDs overlap');
  const partition = [...covered, ...unresolved].sort();
  if (partition.length !== expected.length || partition.some((id, index) => id !== expected[index])) errors.push('quality ledger record partition does not equal the admission record set');
  if (resultIds.length !== covered.length || resultIds.some((id, index) => id !== covered[index])) errors.push('quality results do not equal covered record IDs');
  try {
    if (isSha256(value.admissionRecordSetSha256) && calibrationAdmissionSha256(expected) !== value.admissionRecordSetSha256) errors.push('quality ledger admission record set hash does not match');
    if (isSha256(value.ledgerSha256) && calibrationAdmissionQualityLedgerSha256(value) !== value.ledgerSha256) errors.push('quality ledger self-hash does not match canonical bytes');
  } catch {
    errors.push('quality ledger cannot be canonicalized');
  }
  return validation(errors);
}

export function isCalibrationAdmissionQualityResultV1(value: unknown): value is AdmissionQualityResultV1 {
  return validateCalibrationAdmissionQualityResultV1(value).ok;
}

export function isCalibrationAdmissionQualityLedgerV1(value: unknown, admissionRecordIds: readonly string[]): value is AdmissionQualityLedgerV1 {
  return validateCalibrationAdmissionQualityLedgerV1(value, admissionRecordIds).ok;
}
