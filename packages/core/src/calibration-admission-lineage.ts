import { calibrationAdmissionSha256 } from './calibration-admission-evidence';
import type { AdmissionLineageLedgerV1 } from './generated/calibration-admission-lineage-ledger';
import {
  exactKeys,
  isAdmissionId,
  isJsonRecord,
  isSha256,
  sortedUniqueByPredicate,
  withoutJsonKey,
} from './calibration-admission-primitives';

export type { AdmissionLineageLedgerV1 };
export type AdmissionLineageResultV1 = AdmissionLineageLedgerV1['results'][number];

export interface CalibrationAdmissionLineageValidationV1 {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

type JsonObject = Record<string, unknown>;

function validation(errors: string[]): CalibrationAdmissionLineageValidationV1 {
  return { ok: errors.length === 0, errors };
}

function sortedIds(value: unknown): value is readonly string[] {
  return sortedUniqueByPredicate(value, isAdmissionId);
}

export function calibrationAdmissionLineageResultSha256(
  value: Omit<AdmissionLineageResultV1, 'lineageSha256'> | JsonObject,
): string {
  return calibrationAdmissionSha256(withoutJsonKey(value, 'lineageSha256'));
}

export function calibrationAdmissionLineageLedgerSha256(
  value: Omit<AdmissionLineageLedgerV1, 'ledgerSha256'> | JsonObject,
): string {
  return calibrationAdmissionSha256(withoutJsonKey(value, 'ledgerSha256'));
}

export function validateCalibrationAdmissionLineageResultV1(value: unknown): CalibrationAdmissionLineageValidationV1 {
  const errors: string[] = [];
  if (!isJsonRecord(value) || !exactKeys(value, [
    'version', 'recordId', 'contentSha256', 'polarity', 'familyId', 'pairGroupId', 'split',
    'exactClusterId', 'nearClusterId', 'toolReceiptSha256', 'lineageSha256',
  ])) return validation(['lineage result shape is invalid']);
  if (value.version !== 'v10.3-admission-lineage-result-v1') errors.push('lineage result version is invalid');
  if (!isAdmissionId(value.recordId)) errors.push('lineage result recordId is invalid');
  if (!isSha256(value.contentSha256)) errors.push('lineage result contentSha256 is invalid');
  if (value.polarity !== 'ai_side' && value.polarity !== 'human_side' && value.polarity !== 'unassigned') errors.push('lineage polarity is invalid');
  if (!isAdmissionId(value.familyId)) errors.push('lineage familyId is invalid');
  if (value.pairGroupId !== null && !isAdmissionId(value.pairGroupId)) errors.push('lineage pairGroupId is invalid');
  if (value.split !== 'train' && value.split !== 'validation' && value.split !== 'test' && value.split !== 'unassigned') errors.push('lineage split is invalid');
  if (!isAdmissionId(value.exactClusterId)) errors.push('lineage exactClusterId is invalid');
  if (!isAdmissionId(value.nearClusterId)) errors.push('lineage nearClusterId is invalid');
  if (!isSha256(value.toolReceiptSha256)) errors.push('lineage tool receipt is invalid');
  if (!isSha256(value.lineageSha256)) errors.push('lineage self-hash is invalid');
  if (value.polarity === 'unassigned' && value.pairGroupId !== null) errors.push('unassigned lineage records cannot be pair-bound');
  try {
    if (isSha256(value.lineageSha256) && calibrationAdmissionLineageResultSha256(value) !== value.lineageSha256) errors.push('lineage result self-hash does not match canonical bytes');
  } catch {
    errors.push('lineage result cannot be canonicalized');
  }
  return validation(errors);
}

export function validateCalibrationAdmissionLineageLedgerV1(
  value: unknown,
  admissionRecordIds: readonly string[],
): CalibrationAdmissionLineageValidationV1 {
  const errors: string[] = [];
  if (!isJsonRecord(value) || !exactKeys(value, [
    'version', 'admissionRecordSetSha256', 'results', 'coveredRecordIds', 'unresolvedRecordIds', 'ledgerSha256',
  ])) return validation(['lineage ledger shape is invalid']);
  if (!sortedIds(admissionRecordIds)) errors.push('admission record IDs must be sorted and unique');
  if (value.version !== 'v10.3-admission-lineage-ledger-v1') errors.push('lineage ledger version is invalid');
  if (!isSha256(value.admissionRecordSetSha256)) errors.push('lineage ledger admission record set hash is invalid');
  if (!isSha256(value.ledgerSha256)) errors.push('lineage ledger self-hash is invalid');
  if (!sortedIds(value.coveredRecordIds)) errors.push('lineage ledger covered IDs must be sorted and unique');
  if (!sortedIds(value.unresolvedRecordIds)) errors.push('lineage ledger unresolved IDs must be sorted and unique');

  const results = value.results;
  const resultIds: string[] = [];
  const entries: AdmissionLineageResultV1[] = [];
  if (!Array.isArray(results) || results.length > 452_382) {
    errors.push('lineage ledger results are not bounded');
  } else {
    let previous = '';
    for (const entry of results) {
      const resultValidation = validateCalibrationAdmissionLineageResultV1(entry);
      if (!resultValidation.ok) errors.push(...resultValidation.errors.map((entryError) => `result: ${entryError}`));
      if (isJsonRecord(entry) && typeof entry.recordId === 'string') {
        if (entry.recordId <= previous) errors.push('lineage ledger results must be sorted and unique by recordId');
        previous = entry.recordId;
        resultIds.push(entry.recordId);
      }
      if (resultValidation.ok) entries.push(entry as AdmissionLineageResultV1);
    }
  }

  const covered = Array.isArray(value.coveredRecordIds) ? value.coveredRecordIds : [];
  const unresolved = Array.isArray(value.unresolvedRecordIds) ? value.unresolvedRecordIds : [];
  const expected = [...admissionRecordIds];
  if (covered.some((id) => unresolved.includes(id))) errors.push('covered and unresolved lineage record IDs overlap');
  const partition = [...covered, ...unresolved].sort();
  if (partition.length !== expected.length || partition.some((id, index) => id !== expected[index])) errors.push('lineage ledger record partition does not equal the admission record set');
  if (resultIds.length !== covered.length || resultIds.some((id, index) => id !== covered[index])) errors.push('lineage results do not equal covered record IDs');

  const families = new Map<string, AdmissionLineageResultV1[]>();
  const pairs = new Map<string, AdmissionLineageResultV1[]>();
  for (const entry of entries) {
    const family = families.get(entry.familyId) ?? [];
    family.push(entry);
    families.set(entry.familyId, family);
    if (entry.pairGroupId !== null) {
      const pair = pairs.get(entry.pairGroupId) ?? [];
      pair.push(entry);
      pairs.set(entry.pairGroupId, pair);
    }
  }
  for (const [familyId, family] of families) {
    const splits = new Set(family.map((entry) => entry.split));
    if (splits.size > 1) errors.push(`family ${familyId} has split drift`);
    const polarities = new Set(family.map((entry) => entry.polarity));
    if (polarities.has('ai_side') && polarities.has('human_side') && family.some((entry) => entry.pairGroupId === null)) {
      errors.push(`cross-polarity family ${familyId} is not fully pair-bound`);
    }
  }
  for (const [pairId, pair] of pairs) {
    if (pair.length !== 2 || new Set(pair.map((entry) => entry.polarity)).size !== 2 || pair[0]!.familyId !== pair[1]!.familyId || pair[0]!.split !== pair[1]!.split) {
      errors.push(`pair group ${pairId} must contain one AI and one human record from one family and split`);
    }
  }
  try {
    if (isSha256(value.admissionRecordSetSha256) && calibrationAdmissionSha256(expected) !== value.admissionRecordSetSha256) errors.push('lineage ledger admission record set hash does not match');
    if (isSha256(value.ledgerSha256) && calibrationAdmissionLineageLedgerSha256(value) !== value.ledgerSha256) errors.push('lineage ledger self-hash does not match canonical bytes');
  } catch {
    errors.push('lineage ledger cannot be canonicalized');
  }
  return validation(errors);
}

export function isCalibrationAdmissionLineageResultV1(value: unknown): value is AdmissionLineageResultV1 {
  return validateCalibrationAdmissionLineageResultV1(value).ok;
}

export function isCalibrationAdmissionLineageLedgerV1(value: unknown, admissionRecordIds: readonly string[]): value is AdmissionLineageLedgerV1 {
  return validateCalibrationAdmissionLineageLedgerV1(value, admissionRecordIds).ok;
}
