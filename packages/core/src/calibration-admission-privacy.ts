import { calibrationAdmissionSha256 } from './calibration-admission-evidence';
import type { AdmissionPrivacyLedgerV1 } from './generated/calibration-admission-privacy-ledger';
import type { AdmissionPrivacyResultV1 } from './generated/calibration-admission-privacy-result';
import {
  exactKeys,
  isAdmissionId,
  isJsonRecord,
  isSha256,
  sortedUniqueByPredicate,
  withoutJsonKey,
} from './calibration-admission-primitives';

export type { AdmissionPrivacyLedgerV1, AdmissionPrivacyResultV1 };

export interface CalibrationAdmissionPrivacyValidationV1 {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

type JsonObject = Record<string, unknown>;
const FINDING_KIND = /^[a-z][a-z0-9._:-]{0,63}$/;

function validation(errors: string[]): CalibrationAdmissionPrivacyValidationV1 {
  return { ok: errors.length === 0, errors };
}

function sortedIds(value: unknown): value is readonly string[] {
  return sortedUniqueByPredicate(value, isAdmissionId);
}

function findingKey(value: JsonObject): string {
  return `${String(value.kind)}\u0000${String(value.findingFingerprintSha256)}`;
}

export function calibrationAdmissionPrivacyResultSha256(
  value: Omit<AdmissionPrivacyResultV1, 'resultSha256'> | JsonObject,
): string {
  return calibrationAdmissionSha256(withoutJsonKey(value, 'resultSha256'));
}

export function calibrationAdmissionPrivacyLedgerSha256(
  value: Omit<AdmissionPrivacyLedgerV1, 'ledgerSha256'> | JsonObject,
): string {
  return calibrationAdmissionSha256(withoutJsonKey(value, 'ledgerSha256'));
}

function validateFinding(value: unknown, errors: string[]): value is JsonObject {
  if (!isJsonRecord(value) || !exactKeys(value, ['kind', 'confidence', 'findingFingerprintSha256'])) {
    errors.push('privacy finding shape is invalid');
    return false;
  }
  if (typeof value.kind !== 'string' || !FINDING_KIND.test(value.kind)) errors.push('privacy finding kind is invalid');
  if (value.confidence !== 'high' && value.confidence !== 'low') errors.push('privacy finding confidence is invalid');
  if (!isSha256(value.findingFingerprintSha256)) errors.push('privacy finding fingerprint is invalid');
  return errors.length === 0;
}

export function validateCalibrationAdmissionPrivacyResultV1(value: unknown): CalibrationAdmissionPrivacyValidationV1 {
  const errors: string[] = [];
  if (!isJsonRecord(value) || !exactKeys(value, [
    'version', 'recordId', 'contentSha256', 'privacyStatus', 'secretStatus', 'findings',
    'reviewerDecisionIds', 'toolReceiptSha256', 'resultSha256',
  ])) return validation(['privacy result shape is invalid']);

  if (value.version !== 'v10.3-admission-privacy-result-v1') errors.push('privacy result version is invalid');
  if (!isAdmissionId(value.recordId)) errors.push('privacy result recordId is invalid');
  if (!isSha256(value.contentSha256)) errors.push('privacy result contentSha256 is invalid');
  if (value.privacyStatus !== 'pass' && value.privacyStatus !== 'review' && value.privacyStatus !== 'fail') errors.push('privacy status is invalid');
  if (value.secretStatus !== 'pass' && value.secretStatus !== 'review' && value.secretStatus !== 'fail') errors.push('secret status is invalid');
  if (!isSha256(value.toolReceiptSha256)) errors.push('privacy result tool receipt is invalid');
  if (!isSha256(value.resultSha256)) errors.push('privacy result self-hash is invalid');

  const findings = value.findings;
  const findingObjects: JsonObject[] = [];
  if (!Array.isArray(findings) || findings.length > 1024) {
    errors.push('privacy findings are not bounded');
  } else {
    let previous = '';
    for (const finding of findings) {
      const findingErrors: string[] = [];
      if (!validateFinding(finding, findingErrors)) {
        errors.push(...findingErrors);
        continue;
      }
      const key = findingKey(finding);
      if (key <= previous) errors.push('privacy findings must be sorted and unique');
      previous = key;
      findingObjects.push(finding);
    }
  }

  if (!sortedIds(value.reviewerDecisionIds)) errors.push('privacy reviewerDecisionIds must be sorted and unique');
  const reviewerIds = Array.isArray(value.reviewerDecisionIds) ? value.reviewerDecisionIds : [];
  if (reviewerIds.length > 2) errors.push('privacy reviewerDecisionIds must contain at most two decisions');
  const lowCount = findingObjects.filter((finding) => finding.confidence === 'low').length;
  const highCount = findingObjects.filter((finding) => finding.confidence === 'high').length;
  if (findingObjects.length === 0) {
    if (value.privacyStatus !== 'pass' || value.secretStatus !== 'pass' || reviewerIds.length !== 0) {
      errors.push('a finding-free privacy result must be pass/pass with no reviewer decisions');
    }
  } else {
    if (value.privacyStatus === 'pass' && value.secretStatus === 'pass') errors.push('pass-with-findings is not allowed');
    if (highCount > 0 && value.privacyStatus !== 'fail' && value.secretStatus !== 'fail') errors.push('high-confidence findings require a fail status');
    if (lowCount > 0 && reviewerIds.length !== 2) errors.push('low-confidence findings require exactly two reviewer decisions');
    if (lowCount > 0 && value.privacyStatus !== 'review' && value.secretStatus !== 'review' && value.privacyStatus !== 'fail' && value.secretStatus !== 'fail') {
      errors.push('low-confidence findings require review or fail status');
    }
  }

  try {
    if (isSha256(value.resultSha256) && calibrationAdmissionPrivacyResultSha256(value) !== value.resultSha256) {
      errors.push('privacy result self-hash does not match canonical bytes');
    }
  } catch {
    errors.push('privacy result cannot be canonicalized');
  }
  return validation(errors);
}

export function validateCalibrationAdmissionPrivacyLedgerV1(
  value: unknown,
  admissionRecordIds: readonly string[],
): CalibrationAdmissionPrivacyValidationV1 {
  const errors: string[] = [];
  if (!isJsonRecord(value) || !exactKeys(value, [
    'version', 'admissionRecordSetSha256', 'results', 'coveredRecordIds', 'unresolvedRecordIds', 'ledgerSha256',
  ])) return validation(['privacy ledger shape is invalid']);
  if (!sortedIds(admissionRecordIds)) errors.push('admission record IDs must be sorted and unique');
  if (value.version !== 'v10.3-admission-privacy-ledger-v1') errors.push('privacy ledger version is invalid');
  if (!isSha256(value.admissionRecordSetSha256)) errors.push('privacy ledger admission record set hash is invalid');
  if (!isSha256(value.ledgerSha256)) errors.push('privacy ledger self-hash is invalid');
  if (!sortedIds(value.coveredRecordIds)) errors.push('privacy ledger covered IDs must be sorted and unique');
  if (!sortedIds(value.unresolvedRecordIds)) errors.push('privacy ledger unresolved IDs must be sorted and unique');

  const results = value.results;
  const resultIds: string[] = [];
  if (!Array.isArray(results) || results.length > 452_382) {
    errors.push('privacy ledger results are not bounded');
  } else {
    let previous = '';
    for (const result of results) {
      const resultValidation = validateCalibrationAdmissionPrivacyResultV1(result);
      if (!resultValidation.ok) errors.push(...resultValidation.errors.map((entry) => `result: ${entry}`));
      if (isJsonRecord(result) && typeof result.recordId === 'string') {
        if (result.recordId <= previous) errors.push('privacy ledger results must be sorted and unique by recordId');
        previous = result.recordId;
        resultIds.push(result.recordId);
      }
    }
  }

  const covered = Array.isArray(value.coveredRecordIds) ? value.coveredRecordIds : [];
  const unresolved = Array.isArray(value.unresolvedRecordIds) ? value.unresolvedRecordIds : [];
  const expected = [...admissionRecordIds];
  if (covered.some((id) => unresolved.includes(id))) errors.push('covered and unresolved privacy record IDs overlap');
  const partition = [...covered, ...unresolved].sort();
  if (partition.length !== expected.length || partition.some((id, index) => id !== expected[index])) errors.push('privacy ledger record partition does not equal the admission record set');
  if (resultIds.length !== covered.length || resultIds.some((id, index) => id !== covered[index])) errors.push('privacy results do not equal covered record IDs');
  try {
    if (isSha256(value.admissionRecordSetSha256) && calibrationAdmissionSha256(expected) !== value.admissionRecordSetSha256) errors.push('privacy ledger admission record set hash does not match');
    if (isSha256(value.ledgerSha256) && calibrationAdmissionPrivacyLedgerSha256(value) !== value.ledgerSha256) errors.push('privacy ledger self-hash does not match canonical bytes');
  } catch {
    errors.push('privacy ledger cannot be canonicalized');
  }
  return validation(errors);
}

export function isCalibrationAdmissionPrivacyResultV1(value: unknown): value is AdmissionPrivacyResultV1 {
  return validateCalibrationAdmissionPrivacyResultV1(value).ok;
}

export function isCalibrationAdmissionPrivacyLedgerV1(value: unknown, admissionRecordIds: readonly string[]): value is AdmissionPrivacyLedgerV1 {
  return validateCalibrationAdmissionPrivacyLedgerV1(value, admissionRecordIds).ok;
}
