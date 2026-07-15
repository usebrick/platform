import type { AdmissionCohortWitnessV1 } from './generated/calibration-admission-cohort-witness';
import type { AdmissionCohortInfeasibilityCertificateV1 } from './generated/calibration-admission-infeasibility';
import type { AdmissionSearchReceiptV1 } from './generated/calibration-admission-search-receipt';
import type { CalibrationAdmissionSearchResultBundleV1 } from './generated/calibration-admission-search-result-bundle';
import type { CalibrationAdmissionWitnessReviewReceiptV1 } from './generated/calibration-admission-witness-review-receipt';
import type { CalibrationAdmissionWitnessReviewBundleV1 } from './generated/calibration-admission-witness-review-bundle';
import type { CalibrationAdmissionCensusV103 } from './generated/calibration-admission-census';
import { calibrationAdmissionSha256 } from './calibration-admission-evidence';
import {
  isCalibrationAdmissionInvocationIntentV1,
  isCalibrationAdmissionToolReceiptV1,
} from './calibration-admission-evidence';
import {
  isCalibrationAdmissionBlindAssignmentV1,
  isCalibrationAdmissionBlindReviewReceiptV1,
} from './calibration-admission-blind-temporal';
import { isCalibrationAdmissionDecisionV103 } from './calibration-admission-record-authority';
import {
  exactKeys,
  isAdmissionId,
  isJsonRecord,
  isSha256,
  sortedUniqueByPredicate,
  withoutJsonKey,
} from './calibration-admission-primitives';

export interface CalibrationAdmissionCensusValidationV1 {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

type JsonObject = Record<string, unknown>;
type WitnessUnit = AdmissionCohortWitnessV1['units'][number];

const PRINTABLE = /^[\x20-\x7e]+$/;
const CONSTRAINT_ID = /^[a-z][a-z0-9._:-]{0,127}$/;
const WITNESS_ALGORITHM = 'lexicographic-bnb-feasibility-v1';
const WITNESS_SEED = 'slopbrick-v10.3-admission-review-v1';
const HASH_FIELDS = [
  'policySha256', 'smokeWitnessPolicySha256', 'canaryWitnessPolicySha256', 'eligibilitySnapshotSha256',
  'sourceRegisterSha256', 'verifiedContextSha256', 'evidenceIndexSha256', 'evidencePayloadSetSha256',
  'evidenceReceiptSetSha256', 'toolProfileSetSha256', 'toolReceiptSetSha256', 'blindReviewReceiptSetSha256',
  'temporalAttestationSetSha256', 'materializationReceiptSetSha256', 'admissionRecordsSha256',
  'sourceReviewSetSha256', 'overlapUniverseSha256', 'overlapResourceReceiptSha256', 'overlapLedgerSha256',
  'privacyLedgerSha256', 'qualityLedgerSha256', 'lineageLedgerSha256',
] as const;

function result(errors: string[]): CalibrationAdmissionCensusValidationV1 {
  return { ok: errors.length === 0, errors };
}

function safeInteger(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function printable(value: unknown, maximum = 512): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum && PRINTABLE.test(value);
}

function countMap(units: readonly JsonObject[], field: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const unit of units) {
    const value = String(unit[field]);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function countHash(units: readonly JsonObject[], field: string): string {
  return calibrationAdmissionSha256(countMap(units, field));
}

function pairSplitProjection(units: readonly JsonObject[]): readonly JsonObject[] {
  return units
    .filter((unit) => unit.pairGroupId !== undefined)
    .map((unit) => ({
      pairGroupId: unit.pairGroupId,
      recordId: unit.recordId,
      split: unit.split,
    }))
    .sort((left, right) => {
      const pairOrder = String(left.pairGroupId).localeCompare(String(right.pairGroupId));
      return pairOrder !== 0 ? pairOrder : String(left.recordId).localeCompare(String(right.recordId));
    });
}

function pairSplitHash(units: readonly JsonObject[]): string {
  return calibrationAdmissionSha256(pairSplitProjection(units));
}

function gateTarget(gate: unknown): number | undefined {
  if (gate === 'smoke') return 100;
  if (gate === 'canary') return 5000;
  return undefined;
}

function validateUnits(value: unknown, errors: string[]): value is readonly JsonObject[] {
  if (!Array.isArray(value) || value.length > 10_000) {
    errors.push('units must be a bounded array');
    return false;
  }
  const recordIds = new Set<string>();
  const contentClusters = new Set<string>();
  let previousSelectionKey = '';
  for (const entry of value) {
    if (!isJsonRecord(entry)) {
      errors.push('witness unit is not an object');
      continue;
    }
    const keys = ['recordId', 'contentClusterId', 'label', 'language', 'materialSourceId', 'repositoryId', 'familyId', 'split', 'selectionKey'];
    if (Object.prototype.hasOwnProperty.call(entry, 'pairGroupId')) keys.push('pairGroupId');
    if (!exactKeys(entry, keys)) errors.push('witness unit object shape is invalid');
    if (!isSha256(entry.recordId)) errors.push('recordId is invalid');
    for (const key of ['contentClusterId', 'materialSourceId', 'repositoryId', 'familyId']) {
      if (!isAdmissionId(entry[key])) errors.push(`${key} is invalid`);
    }
    if (entry.pairGroupId !== undefined && !isAdmissionId(entry.pairGroupId)) errors.push('pairGroupId is invalid');
    if (entry.label !== 'verified_ai' && entry.label !== 'verified_human') errors.push('witness unit label is invalid');
    if (!printable(entry.language, 128)) errors.push('witness unit language is invalid');
    if (!['train', 'validation', 'test'].includes(entry.split as string)) errors.push('witness unit split is invalid');
    if (!printable(entry.selectionKey)) errors.push('witness unit selectionKey is invalid');
    if (printable(entry.selectionKey) && entry.selectionKey <= previousSelectionKey) errors.push('witness units must be strictly sorted by selectionKey');
    if (printable(entry.selectionKey)) previousSelectionKey = entry.selectionKey;
    if (isSha256(entry.recordId) && !recordIds.add(entry.recordId)) errors.push('witness record IDs must be unique');
    if (isAdmissionId(entry.contentClusterId) && !contentClusters.add(entry.contentClusterId)) errors.push('witness content clusters must be unique');
  }
  return errors.length === 0;
}

function validateGateConstraints(gate: 'smoke' | 'canary', units: readonly JsonObject[], errors: string[]): void {
  const perPolarity = gate === 'smoke' ? 100 : 5000;
  const maxSource = gate === 'smoke' ? 50 : 500;
  const maxFamily = gate === 'smoke' ? 50 : 1000;
  const minimumSources = gate === 'smoke' ? 2 : 10;
  const minimumFamilies = gate === 'smoke' ? 3 : 5;
  const minimumLanguages = gate === 'smoke' ? 2 : 3;
  const minimumPerLanguage = gate === 'smoke' ? 20 : 250;
  const minimumFamiliesPerLanguage = gate === 'smoke' ? 1 : 3;
  for (const label of ['verified_ai', 'verified_human'] as const) {
    const polarityUnits = units.filter((unit) => unit.label === label);
    if (polarityUnits.length !== perPolarity) errors.push(`${label} count does not match gate target`);
    const sources = countMap(polarityUnits, 'materialSourceId');
    const families = countMap(polarityUnits, 'familyId');
    const languages = countMap(polarityUnits, 'language');
    if (Object.keys(sources).length < minimumSources) errors.push(`${label} source diversity is below the gate minimum`);
    if (Object.keys(families).length < minimumFamilies) errors.push(`${label} family diversity is below the gate minimum`);
    if (Object.keys(languages).length < minimumLanguages) errors.push(`${label} language diversity is below the gate minimum`);
    if (Object.values(sources).some((count) => count > maxSource)) errors.push(`${label} source cap is exceeded`);
    if (Object.values(families).some((count) => count > maxFamily)) errors.push(`${label} family cap is exceeded`);
    if (Object.values(languages).some((count) => count < minimumPerLanguage)) errors.push(`${label} language minimum is not met`);
    for (const language of Object.keys(languages)) {
      const languageFamilies = new Set(polarityUnits.filter((unit) => unit.language === language).map((unit) => unit.familyId));
      if (languageFamilies.size < minimumFamiliesPerLanguage) errors.push(`${label}/${language} family diversity is below the gate minimum`);
    }
  }
  const pairSplits = new Map<string, string>();
  for (const unit of units) {
    if (typeof unit.pairGroupId !== 'string') continue;
    const previous = pairSplits.get(unit.pairGroupId);
    if (previous !== undefined && previous !== unit.split) errors.push('pair groups must remain within one split');
    pairSplits.set(unit.pairGroupId, String(unit.split));
  }
}

export function calibrationAdmissionCohortWitnessSha256(
  value: Omit<AdmissionCohortWitnessV1, 'witnessSha256'> | JsonObject,
): string {
  return calibrationAdmissionSha256(withoutJsonKey(value, 'witnessSha256'));
}

export function calibrationAdmissionInfeasibilityCertificateSha256(
  value: Omit<AdmissionCohortInfeasibilityCertificateV1, 'certificateSha256'> | JsonObject,
): string {
  return calibrationAdmissionSha256(withoutJsonKey(value, 'certificateSha256'));
}

export function validateCalibrationAdmissionCohortWitnessV1(value: unknown): CalibrationAdmissionCensusValidationV1 {
  const errors: string[] = [];
  if (!isJsonRecord(value)) return result(['witness is not an object']);
  if (!exactKeys(value, ['version', 'gate', 'policyId', 'algorithm', 'seed', 'eligibilitySnapshotSha256', 'verifiedContextSha256', 'units', 'constraintProof', 'witnessSha256'])) {
    errors.push('witness object shape is invalid');
  }
  if (value.version !== 'v10.3-admission-cohort-witness-v1') errors.push('witness version is invalid');
  if (value.policyId !== 'v10.3-admission-v1') errors.push('witness policy ID is invalid');
  if (value.algorithm !== WITNESS_ALGORITHM) errors.push('witness algorithm is invalid');
  if (value.seed !== WITNESS_SEED) errors.push('witness seed is invalid');
  if (value.gate !== 'smoke' && value.gate !== 'canary') errors.push('witness gate is invalid');
  if (!isSha256(value.eligibilitySnapshotSha256) || !isSha256(value.verifiedContextSha256)) errors.push('witness authority hashes are invalid');
  const unitsValid = validateUnits(value.units, errors);
  const target = gateTarget(value.gate);
  if (target !== undefined && Array.isArray(value.units) && value.units.length !== target * 2) errors.push('witness unit count does not match gate target');
  const proof = value.constraintProof;
  if (!isJsonRecord(proof) || !exactKeys(proof, ['verifiedAi', 'verifiedHuman', 'languageCountsSha256', 'sourceCountsSha256', 'familyCountsSha256', 'pairSplitChecksSha256'])) {
    errors.push('witness constraint proof shape is invalid');
  } else {
    if (!safeInteger(proof.verifiedAi) || !safeInteger(proof.verifiedHuman)) errors.push('witness polarity counts are invalid');
    if (!isSha256(proof.languageCountsSha256) || !isSha256(proof.sourceCountsSha256) || !isSha256(proof.familyCountsSha256) || !isSha256(proof.pairSplitChecksSha256)) errors.push('witness proof hashes are invalid');
    if (unitsValid) {
      const witnessUnits = value.units as readonly JsonObject[];
      const ai = witnessUnits.filter((unit) => unit.label === 'verified_ai').length;
      const human = witnessUnits.filter((unit) => unit.label === 'verified_human').length;
      if (proof.verifiedAi !== ai || proof.verifiedHuman !== human) errors.push('witness polarity proof does not match units');
      if (proof.languageCountsSha256 !== countHash(witnessUnits, 'language')) errors.push('languageCountsSha256 does not match units');
      if (proof.sourceCountsSha256 !== countHash(witnessUnits, 'materialSourceId')) errors.push('sourceCountsSha256 does not match units');
      if (proof.familyCountsSha256 !== countHash(witnessUnits, 'familyId')) errors.push('familyCountsSha256 does not match units');
      if (proof.pairSplitChecksSha256 !== pairSplitHash(witnessUnits)) errors.push('pairSplitChecksSha256 does not match units');
      if (value.gate === 'smoke' || value.gate === 'canary') validateGateConstraints(value.gate, witnessUnits, errors);
    }
  }
  if (!isSha256(value.witnessSha256)) errors.push('witnessSha256 is invalid');
  else {
    try {
      if (calibrationAdmissionCohortWitnessSha256(value) !== value.witnessSha256) errors.push('witnessSha256 does not match canonical bytes');
    } catch { errors.push('witnessSha256 cannot be recomputed'); }
  }
  return result(errors);
}

export function isCalibrationAdmissionCohortWitnessV1(value: unknown): value is AdmissionCohortWitnessV1 {
  return validateCalibrationAdmissionCohortWitnessV1(value).ok;
}

export function validateCalibrationAdmissionInfeasibilityCertificateV1(value: unknown): CalibrationAdmissionCensusValidationV1 {
  const errors: string[] = [];
  if (!isJsonRecord(value)) return result(['infeasibility certificate is not an object']);
  if (!exactKeys(value, ['version', 'gate', 'eligibilitySnapshotSha256', 'verifiedContextSha256', 'algorithm', 'proven', 'proofKind', 'violatedConstraints', 'certificateSha256'])) errors.push('infeasibility certificate shape is invalid');
  if (value.version !== 'v10.3-admission-infeasibility-v1') errors.push('infeasibility certificate version is invalid');
  if (value.gate !== 'smoke' && value.gate !== 'canary') errors.push('infeasibility certificate gate is invalid');
  if (!isSha256(value.eligibilitySnapshotSha256) || !isSha256(value.verifiedContextSha256)) errors.push('infeasibility authority hashes are invalid');
  if (value.algorithm !== WITNESS_ALGORITHM) errors.push('infeasibility algorithm is invalid');
  if (typeof value.proven !== 'boolean') errors.push('infeasibility proven flag is invalid');
  if (!['capacity_cut', 'exhaustive_search', 'indeterminate_search_limit'].includes(value.proofKind as string)) errors.push('infeasibility proof kind is invalid');
  if (!sortedUniqueByPredicate(value.violatedConstraints, (entry) => typeof entry === 'string' && CONSTRAINT_ID.test(entry), false)) errors.push('violatedConstraints must be sorted, unique, and valid');
  if (value.proofKind === 'indeterminate_search_limit' && value.proven !== false) errors.push('search-limit certificates must be non-proven');
  if ((value.proofKind === 'capacity_cut' || value.proofKind === 'exhaustive_search') && value.proven !== true) errors.push('terminal proof certificates must be proven');
  if (!isSha256(value.certificateSha256)) errors.push('certificateSha256 is invalid');
  else {
    try {
      if (calibrationAdmissionInfeasibilityCertificateSha256(value) !== value.certificateSha256) errors.push('certificateSha256 does not match canonical bytes');
    } catch { errors.push('certificateSha256 cannot be recomputed'); }
  }
  return result(errors);
}

export function isCalibrationAdmissionInfeasibilityCertificateV1(value: unknown): value is AdmissionCohortInfeasibilityCertificateV1 {
  return validateCalibrationAdmissionInfeasibilityCertificateV1(value).ok;
}

function withoutKeys(value: unknown, keys: readonly string[]): JsonObject {
  if (!isJsonRecord(value)) throw new TypeError('expected a JSON object');
  const output: JsonObject = {};
  for (const [key, child] of Object.entries(value)) if (!keys.includes(key)) output[key] = child;
  return output;
}

function hashTuple(value: unknown, length: number, name: string, errors: string[], distinct = true): value is readonly string[] {
  if (!Array.isArray(value) || value.length !== length || !value.every(isSha256) || (distinct && new Set(value).size !== value.length)) {
    errors.push(`${name} must contain ${length} ${distinct ? 'distinct ' : ''}SHA-256 values`);
    return false;
  }
  return true;
}

function validateSearchReceipt(value: unknown, errors: string[]): value is AdmissionSearchReceiptV1 {
  if (!isJsonRecord(value) || !exactKeys(value, ['version', 'receiptId', 'gate', 'witnessPolicySha256', 'eligibilitySnapshotSha256', 'candidateOrderSha256', 'visitedNodes', 'prunedNodes', 'terminal', 'terminalArtifactSha256', 'toolReceiptSha256'])) {
    errors.push('search receipt shape is invalid');
    return false;
  }
  if (value.version !== 'v10.3-admission-search-receipt-v1') errors.push('search receipt version is invalid');
  if (value.gate !== 'smoke' && value.gate !== 'canary') errors.push('search receipt gate is invalid');
  for (const key of ['receiptId', 'witnessPolicySha256', 'eligibilitySnapshotSha256', 'candidateOrderSha256', 'terminalArtifactSha256', 'toolReceiptSha256']) if (!isSha256(value[key])) errors.push(`search receipt ${key} is invalid`);
  if (!safeInteger(value.visitedNodes) || !safeInteger(value.prunedNodes)) errors.push('search receipt node counts are invalid');
  if (!['witness', 'proven_capacity_cut', 'proven_exhaustive', 'indeterminate_limit'].includes(value.terminal as string)) errors.push('search receipt terminal is invalid');
  if (value.terminal === 'indeterminate_limit' && value.terminalArtifactSha256 === value.witnessPolicySha256) errors.push('search-limit receipt cannot reuse the policy hash as its artifact');
  if (isSha256(value.receiptId)) {
    try { if (calibrationAdmissionSearchReceiptSha256(value) !== value.receiptId) errors.push('search receipt ID does not match canonical bytes'); } catch { errors.push('search receipt ID cannot be recomputed'); }
  }
  return errors.length === 0;
}

export function calibrationAdmissionSearchReceiptSha256(value: Omit<AdmissionSearchReceiptV1, 'receiptId'> | JsonObject): string {
  return calibrationAdmissionSha256(withoutJsonKey(value, 'receiptId'));
}

export function validateCalibrationAdmissionSearchReceiptV1(value: unknown): CalibrationAdmissionCensusValidationV1 {
  const errors: string[] = [];
  validateSearchReceipt(value, errors);
  return result(errors);
}

export function isCalibrationAdmissionSearchReceiptV1(value: unknown): value is AdmissionSearchReceiptV1 {
  return validateCalibrationAdmissionSearchReceiptV1(value).ok;
}

function validateInvocationAndReceiptArrays(value: JsonObject, errors: string[]): void {
  if (!Array.isArray(value.invocationIntents) || !value.invocationIntents.every((entry) => isCalibrationAdmissionInvocationIntentV1(entry))) errors.push('search invocation intents are invalid');
  if (!Array.isArray(value.toolReceipts) || !value.toolReceipts.every((entry) => isCalibrationAdmissionToolReceiptV1(entry))) errors.push('search tool receipts are invalid');
  if (Array.isArray(value.invocationIntents)) {
    const ids = value.invocationIntents.map((entry) => isJsonRecord(entry) ? entry.intentId : undefined);
    if (!sortedUniqueByPredicate(ids, isSha256, true)) errors.push('search invocation intents must be sorted and unique');
  }
  if (Array.isArray(value.toolReceipts)) {
    const ids = value.toolReceipts.map((entry) => isJsonRecord(entry) ? entry.receiptId : undefined);
    if (!sortedUniqueByPredicate(ids, isSha256, true)) errors.push('search tool receipts must be sorted and unique');
  }
}

export function calibrationAdmissionSearchResultBundleId(value: Omit<CalibrationAdmissionSearchResultBundleV1, 'bundleId' | 'bundleSha256'> | JsonObject): string {
  return calibrationAdmissionSha256(withoutKeys(value, ['bundleId', 'bundleSha256']));
}

export function calibrationAdmissionSearchResultBundleSha256(value: Omit<CalibrationAdmissionSearchResultBundleV1, 'bundleSha256'> | JsonObject): string {
  return calibrationAdmissionSha256(withoutJsonKey(value, 'bundleSha256'));
}

export function validateCalibrationAdmissionSearchResultBundleV1(value: unknown): CalibrationAdmissionCensusValidationV1 {
  const errors: string[] = [];
  if (!isJsonRecord(value) || !exactKeys(value, ['version', 'bundleId', 'gate', 'verifiedContextSha256', 'eligibilitySnapshotSha256', 'invocationIntents', 'toolReceipts', 'result', 'searchReceipt', 'bundleSha256'])) return result(['search result bundle shape is invalid']);
  if (value.version !== 'v10.3-admission-search-result-bundle-v1') errors.push('search result bundle version is invalid');
  if (value.gate !== 'smoke' && value.gate !== 'canary') errors.push('search result bundle gate is invalid');
  for (const key of ['bundleId', 'bundleSha256', 'verifiedContextSha256', 'eligibilitySnapshotSha256']) if (!isSha256(value[key])) errors.push(`search result bundle ${key} is invalid`);
  validateInvocationAndReceiptArrays(value, errors);
  const resultValue = value.result;
  if (!isJsonRecord(resultValue) || !['witness', 'infeasibility'].includes(resultValue.kind as string)) errors.push('search result kind is invalid');
  if (isJsonRecord(resultValue) && resultValue.kind === 'witness') {
    const witnessResult = validateCalibrationAdmissionCohortWitnessV1(resultValue.witness);
    if (!witnessResult.ok) errors.push(...witnessResult.errors.map((error) => `witness: ${error}`));
    if (isJsonRecord(resultValue.witness) && (resultValue.witness.gate !== value.gate || resultValue.witness.verifiedContextSha256 !== value.verifiedContextSha256 || resultValue.witness.eligibilitySnapshotSha256 !== value.eligibilitySnapshotSha256)) errors.push('witness authority hashes do not match search result bundle');
  }
  if (isJsonRecord(resultValue) && resultValue.kind === 'infeasibility') {
    const certificateResult = validateCalibrationAdmissionInfeasibilityCertificateV1(resultValue.certificate);
    if (!certificateResult.ok) errors.push(...certificateResult.errors.map((error) => `certificate: ${error}`));
    if (isJsonRecord(resultValue.certificate) && (resultValue.certificate.gate !== value.gate || resultValue.certificate.verifiedContextSha256 !== value.verifiedContextSha256 || resultValue.certificate.eligibilitySnapshotSha256 !== value.eligibilitySnapshotSha256)) errors.push('certificate authority hashes do not match search result bundle');
  }
  const searchErrors: string[] = [];
  const receiptValid = validateSearchReceipt(value.searchReceipt, searchErrors);
  if (!receiptValid) errors.push(...searchErrors.map((error) => `search receipt: ${error}`));
  if (isJsonRecord(value.searchReceipt) && (value.searchReceipt.gate !== value.gate || value.searchReceipt.eligibilitySnapshotSha256 !== value.eligibilitySnapshotSha256)) errors.push('search receipt authority does not match search result bundle');
  if (isSha256(value.bundleId)) {
    try { if (calibrationAdmissionSearchResultBundleId(value) !== value.bundleId) errors.push('search result bundle ID does not match canonical bytes'); } catch { errors.push('search result bundle ID cannot be recomputed'); }
  }
  if (isSha256(value.bundleSha256)) {
    try { if (calibrationAdmissionSearchResultBundleSha256(value) !== value.bundleSha256) errors.push('search result bundle hash does not match canonical bytes'); } catch { errors.push('search result bundle hash cannot be recomputed'); }
  }
  return result(errors);
}

export function isCalibrationAdmissionSearchResultBundleV1(value: unknown): value is CalibrationAdmissionSearchResultBundleV1 {
  return validateCalibrationAdmissionSearchResultBundleV1(value).ok;
}

export function calibrationAdmissionWitnessReviewReceiptSha256(value: Omit<CalibrationAdmissionWitnessReviewReceiptV1, 'receiptId'> | JsonObject): string {
  return calibrationAdmissionSha256(withoutJsonKey(value, 'receiptId'));
}

export function validateCalibrationAdmissionWitnessReviewReceiptV1(value: unknown): CalibrationAdmissionCensusValidationV1 {
  const errors: string[] = [];
  if (!isJsonRecord(value) || !exactKeys(value, ['version', 'receiptId', 'witnessSha256', 'eligibilitySnapshotSha256', 'verifiedContextSha256', 'blindReviewReceiptId', 'independentlyRegeneratedWitnessSha256s', 'regenerationToolReceiptSha256s', 'constraintChecksSha256', 'constraintCheckToolReceiptSha256', 'reviewerDecisionIds', 'decision'])) return result(['witness review receipt shape is invalid']);
  if (value.version !== 'v10.3-admission-witness-review-receipt-v1') errors.push('witness review receipt version is invalid');
  for (const key of ['receiptId', 'witnessSha256', 'eligibilitySnapshotSha256', 'verifiedContextSha256', 'blindReviewReceiptId', 'constraintChecksSha256', 'constraintCheckToolReceiptSha256']) if (!isSha256(value[key])) errors.push(`witness review receipt ${key} is invalid`);
  hashTuple(value.independentlyRegeneratedWitnessSha256s, 2, 'independent witness regenerations', errors, false);
  hashTuple(value.regenerationToolReceiptSha256s, 2, 'regeneration tool receipts', errors);
  hashTuple(value.reviewerDecisionIds, 2, 'reviewer decisions', errors);
  if (Array.isArray(value.independentlyRegeneratedWitnessSha256s) && value.independentlyRegeneratedWitnessSha256s.some((entry) => entry !== value.witnessSha256)) errors.push('independent regenerations must equal the reviewed witness');
  if (value.decision !== 'approved' && value.decision !== 'rejected') errors.push('witness review decision is invalid');
  if (isSha256(value.receiptId)) {
    try { if (calibrationAdmissionWitnessReviewReceiptSha256(value) !== value.receiptId) errors.push('witness review receipt ID does not match canonical bytes'); } catch { errors.push('witness review receipt ID cannot be recomputed'); }
  }
  return result(errors);
}

export function isCalibrationAdmissionWitnessReviewReceiptV1(value: unknown): value is CalibrationAdmissionWitnessReviewReceiptV1 {
  return validateCalibrationAdmissionWitnessReviewReceiptV1(value).ok;
}

export function calibrationAdmissionWitnessReviewBundleId(value: Omit<CalibrationAdmissionWitnessReviewBundleV1, 'bundleId' | 'bundleSha256'> | JsonObject): string {
  return calibrationAdmissionSha256(withoutKeys(value, ['bundleId', 'bundleSha256']));
}

export function calibrationAdmissionWitnessReviewBundleSha256(value: Omit<CalibrationAdmissionWitnessReviewBundleV1, 'bundleSha256'> | JsonObject): string {
  return calibrationAdmissionSha256(withoutJsonKey(value, 'bundleSha256'));
}

function witnessTarget(value: unknown, witnessSha256: string, eligibilitySnapshotSha256: string, verifiedContextSha256: string, errors: string[], name: string): void {
  if (!isJsonRecord(value) || value.kind !== 'witness' || value.witnessSha256 !== witnessSha256 || value.eligibilitySnapshotSha256 !== eligibilitySnapshotSha256 || value.verifiedContextSha256 !== verifiedContextSha256) errors.push(`${name} must target the exact witness and context`);
}

export function validateCalibrationAdmissionWitnessReviewBundleV1(value: unknown): CalibrationAdmissionCensusValidationV1 {
  const errors: string[] = [];
  if (!isJsonRecord(value) || !exactKeys(value, ['version', 'bundleId', 'gate', 'verifiedContextSha256', 'eligibilitySnapshotSha256', 'searchResultBundle', 'regenerations', 'constraintCheck', 'blindAssignment', 'reviewerDecisions', 'blindReviewReceipt', 'witnessReviewReceipt', 'bundleSha256'])) return result(['witness review bundle shape is invalid']);
  if (value.version !== 'v10.3-admission-witness-review-bundle-v1') errors.push('witness review bundle version is invalid');
  if (value.gate !== 'smoke' && value.gate !== 'canary') errors.push('witness review bundle gate is invalid');
  for (const key of ['bundleId', 'bundleSha256', 'verifiedContextSha256', 'eligibilitySnapshotSha256']) if (!isSha256(value[key])) errors.push(`witness review bundle ${key} is invalid`);
  const searchResultValidation = validateCalibrationAdmissionSearchResultBundleV1(value.searchResultBundle);
  if (!searchResultValidation.ok) errors.push(...searchResultValidation.errors.map((error) => `search result: ${error}`));
  const searchResult = isJsonRecord(value.searchResultBundle) ? value.searchResultBundle : undefined;
  const resultValue = searchResult && isJsonRecord(searchResult.result) ? searchResult.result : undefined;
  if (!resultValue || resultValue.kind !== 'witness' || !isJsonRecord(resultValue.witness) || !isSha256(resultValue.witness.witnessSha256)) errors.push('witness review requires a witness search result');
  const witnessSha256 = resultValue && isJsonRecord(resultValue.witness) && typeof resultValue.witness.witnessSha256 === 'string' ? resultValue.witness.witnessSha256 : '';
  if (searchResult && (searchResult.gate !== value.gate || searchResult.verifiedContextSha256 !== value.verifiedContextSha256 || searchResult.eligibilitySnapshotSha256 !== value.eligibilitySnapshotSha256)) errors.push('search result does not match witness review authority');
  if (!Array.isArray(value.regenerations) || value.regenerations.length !== 2) errors.push('witness regenerations must contain exactly two entries');
  else for (const entry of value.regenerations) {
    if (!isJsonRecord(entry) || !exactKeys(entry, ['invocationIntent', 'toolReceipt', 'witnessSha256'])) { errors.push('witness regeneration shape is invalid'); continue; }
    if (!isCalibrationAdmissionInvocationIntentV1(entry.invocationIntent)) errors.push('witness regeneration invocation intent is invalid');
    if (!isCalibrationAdmissionToolReceiptV1(entry.toolReceipt)) errors.push('witness regeneration tool receipt is invalid');
    if (entry.witnessSha256 !== witnessSha256) errors.push('witness regeneration does not match search witness');
  }
  if (!isJsonRecord(value.constraintCheck) || !exactKeys(value.constraintCheck, ['invocationIntent', 'toolReceipt', 'constraintChecksSha256'])) errors.push('witness constraint check shape is invalid');
  else {
    if (!isCalibrationAdmissionInvocationIntentV1(value.constraintCheck.invocationIntent)) errors.push('witness constraint check invocation intent is invalid');
    if (!isCalibrationAdmissionToolReceiptV1(value.constraintCheck.toolReceipt)) errors.push('witness constraint check tool receipt is invalid');
    if (!isSha256(value.constraintCheck.constraintChecksSha256)) errors.push('witness constraint check hash is invalid');
  }
  const assignmentValid = isCalibrationAdmissionBlindAssignmentV1(value.blindAssignment);
  if (!assignmentValid) errors.push('witness blind assignment is invalid');
  else {
    const assignment = value.blindAssignment as JsonObject;
    witnessTarget(assignment.target, witnessSha256, String(value.eligibilitySnapshotSha256), String(value.verifiedContextSha256), errors, 'witness blind assignment');
  }
  if (!Array.isArray(value.reviewerDecisions) || value.reviewerDecisions.length !== 2) errors.push('witness reviewer decisions must contain exactly two entries');
  else for (const decision of value.reviewerDecisions) {
    if (!isCalibrationAdmissionDecisionV103(decision)) errors.push('witness reviewer decision is invalid');
    else {
      const decisionRecord = decision as unknown as JsonObject;
      witnessTarget(decisionRecord.target, witnessSha256, String(value.eligibilitySnapshotSha256), String(value.verifiedContextSha256), errors, 'witness reviewer decision');
      if (isJsonRecord(value.blindAssignment) && decisionRecord.blindAssignmentId !== value.blindAssignment.assignmentId) errors.push('witness decision does not bind blind assignment');
    }
  }
  if (!isCalibrationAdmissionBlindReviewReceiptV1(value.blindReviewReceipt)) errors.push('witness blind review receipt is invalid');
  else if (isJsonRecord(value.blindAssignment) && (value.blindReviewReceipt as unknown as JsonObject).assignmentId !== value.blindAssignment.assignmentId) errors.push('witness blind review receipt does not bind assignment');
  const witnessReviewValidation = validateCalibrationAdmissionWitnessReviewReceiptV1(value.witnessReviewReceipt);
  if (!witnessReviewValidation.ok) errors.push(...witnessReviewValidation.errors.map((error) => `witness review receipt: ${error}`));
  if (isJsonRecord(value.witnessReviewReceipt)) {
    if (value.witnessReviewReceipt.witnessSha256 !== witnessSha256 || value.witnessReviewReceipt.eligibilitySnapshotSha256 !== value.eligibilitySnapshotSha256 || value.witnessReviewReceipt.verifiedContextSha256 !== value.verifiedContextSha256) errors.push('witness review receipt authority does not match bundle');
    if (Array.isArray(value.reviewerDecisions) && JSON.stringify(value.witnessReviewReceipt.reviewerDecisionIds) !== JSON.stringify(value.reviewerDecisions.map((entry) => isJsonRecord(entry) ? entry.decisionId : undefined))) errors.push('witness review receipt decision IDs do not match decisions');
  }
  if (isSha256(value.bundleId)) {
    try { if (calibrationAdmissionWitnessReviewBundleId(value) !== value.bundleId) errors.push('witness review bundle ID does not match canonical bytes'); } catch { errors.push('witness review bundle ID cannot be recomputed'); }
  }
  if (isSha256(value.bundleSha256)) {
    try { if (calibrationAdmissionWitnessReviewBundleSha256(value) !== value.bundleSha256) errors.push('witness review bundle hash does not match canonical bytes'); } catch { errors.push('witness review bundle hash cannot be recomputed'); }
  }
  return result(errors);
}

export function isCalibrationAdmissionWitnessReviewBundleV1(value: unknown): value is CalibrationAdmissionWitnessReviewBundleV1 {
  return validateCalibrationAdmissionWitnessReviewBundleV1(value).ok;
}

function validateCountPair(value: unknown, errors: string[], name: string): boolean {
  if (!isJsonRecord(value) || !exactKeys(value, ['records', 'uniqueUnits']) || !safeInteger(value.records) || !safeInteger(value.uniqueUnits) || value.uniqueUnits > value.records) {
    errors.push(`${name} is invalid`);
    return false;
  }
  return true;
}

function validateDispositionMatrix(value: unknown, errors: string[], name: string): boolean {
  const dispositions = ['eligible_gold', 'eligible_sensitivity', 'mixed_evaluation', 'quarantine'];
  if (!isJsonRecord(value) || !exactKeys(value, dispositions)) { errors.push(`${name} disposition matrix shape is invalid`); return false; }
  for (const disposition of dispositions) {
    const cell = value[disposition];
    if (!isJsonRecord(cell) || !exactKeys(cell, ['total', 'byLabel'])) { errors.push(`${name}/${disposition} cell is invalid`); continue; }
    validateCountPair(cell.total, errors, `${name}/${disposition}/total`);
    if (!isJsonRecord(cell.byLabel) || !exactKeys(cell.byLabel, ['verified_ai', 'verified_human', 'mixed', 'quarantine'])) errors.push(`${name}/${disposition}/byLabel is invalid`);
    else for (const label of ['verified_ai', 'verified_human', 'mixed', 'quarantine']) validateCountPair(cell.byLabel[label], errors, `${name}/${disposition}/${label}`);
  }
  return errors.length === 0;
}

function validateCensusGate(value: unknown, gate: 'smoke' | 'canary', errors: string[]): void {
  if (!isJsonRecord(value)) { errors.push(`${gate} census summary is not an object`); return; }
  const required = gate === 'smoke'
    ? ['targetVerifiedAi', 'targetVerifiedHuman', 'deficitVerifiedAi', 'deficitVerifiedHuman', 'countReady', 'searchResultBundleSha256', 'searchResultBundleRelativePath', 'searchResultPublicationCompletionSha256', 'searchResultPublicationCompletionRelativePath', 'ready', 'gateFailures']
    : ['targetVerifiedAi', 'targetVerifiedHuman', 'deficitVerifiedAi', 'deficitVerifiedHuman', 'minimumSourceCheckoutsPerPolarity', 'availableSourceCapacityVerifiedAi', 'availableSourceCapacityVerifiedHuman', 'sourceCapacityDeficitVerifiedAi', 'sourceCapacityDeficitVerifiedHuman', 'countReady', 'searchResultBundleSha256', 'searchResultBundleRelativePath', 'searchResultPublicationCompletionSha256', 'searchResultPublicationCompletionRelativePath', 'ready', 'gateFailures'];
  const optional = ['witnessSha256', 'witnessReviewBundleSha256', 'witnessReviewBundleRelativePath', 'witnessReviewPublicationCompletionSha256', 'witnessReviewPublicationCompletionRelativePath', 'infeasibilityCertificateSha256'];
  const presentOptional = optional.filter((key) => Object.prototype.hasOwnProperty.call(value, key));
  if (!exactKeys(value, [...required, ...presentOptional])) errors.push(`${gate} census summary shape is invalid`);
  if (value.targetVerifiedAi !== (gate === 'smoke' ? 100 : 5000) || value.targetVerifiedHuman !== (gate === 'smoke' ? 100 : 5000)) errors.push(`${gate} census target is invalid`);
  for (const key of ['deficitVerifiedAi', 'deficitVerifiedHuman', ...(gate === 'canary' ? ['minimumSourceCheckoutsPerPolarity', 'availableSourceCapacityVerifiedAi', 'availableSourceCapacityVerifiedHuman', 'sourceCapacityDeficitVerifiedAi', 'sourceCapacityDeficitVerifiedHuman'] : [])]) if (!safeInteger(value[key])) errors.push(`${gate}/${key} is invalid`);
  if (gate === 'canary' && value.minimumSourceCheckoutsPerPolarity !== 10) errors.push('canary source-checkout minimum is invalid');
  if (typeof value.countReady !== 'boolean' || typeof value.ready !== 'boolean') errors.push(`${gate} readiness flags are invalid`);
  if (!isSha256(value.searchResultBundleSha256) || !isSha256(value.searchResultPublicationCompletionSha256) || typeof value.searchResultBundleRelativePath !== 'string' || typeof value.searchResultPublicationCompletionRelativePath !== 'string') errors.push(`${gate} search publication references are invalid`);
  for (const key of presentOptional) {
    if (key.endsWith('RelativePath')) { if (typeof value[key] !== 'string' || String(value[key]).length === 0) errors.push(`${gate}/${key} is invalid`); }
    else if (!isSha256(value[key])) errors.push(`${gate}/${key} is invalid`);
  }
  if (!Array.isArray(value.gateFailures) || !sortedUniqueByPredicate(value.gateFailures, (entry) => typeof entry === 'string' && CONSTRAINT_ID.test(entry), true)) errors.push(`${gate} gateFailures must be sorted and valid`);
  if (value.ready && (!isSha256(value.witnessSha256) || !isSha256(value.witnessReviewBundleSha256) || !isSha256(value.witnessReviewPublicationCompletionSha256) || typeof value.witnessReviewPublicationCompletionRelativePath !== 'string' || Object.prototype.hasOwnProperty.call(value, 'infeasibilityCertificateSha256'))) errors.push(`${gate} cannot be ready without an approved witness review publication and without infeasibility`);
  if (value.countReady && (value.deficitVerifiedAi !== 0 || value.deficitVerifiedHuman !== 0)) errors.push(`${gate} countReady requires zero polarity deficits`);
}

export function calibrationAdmissionCensusSha256(value: CalibrationAdmissionCensusV103 | JsonObject): string {
  return calibrationAdmissionSha256(value);
}

export function validateCalibrationAdmissionCensusV103(value: unknown): CalibrationAdmissionCensusValidationV1 {
  const errors: string[] = [];
  const keys = ['version', 'policyVersion', ...HASH_FIELDS, 'counts', 'smoke', 'canary'];
  if (!isJsonRecord(value) || !exactKeys(value, keys)) return result(['census object shape is invalid']);
  if (value.version !== 'v10.3-admission-census-v1' || value.policyVersion !== 'v10.3-admission-v1') errors.push('census version is invalid');
  for (const key of HASH_FIELDS) if (!isSha256(value[key])) errors.push(`census/${key} is invalid`);
  const counts = value.counts;
  if (!isJsonRecord(counts) || !exactKeys(counts, ['openSourceCount', 'sourceInventoryCandidateUnits', 'admissionRecords', 'unrepresentedCandidateUnits', 'uniqueContentUnits', 'dispositions', 'bySource', 'byLanguage', 'byFamily', 'recordRejectionReasons', 'sourceBlockerReasons'])) errors.push('census counts shape is invalid');
  else {
    for (const key of ['openSourceCount', 'sourceInventoryCandidateUnits', 'admissionRecords', 'unrepresentedCandidateUnits', 'uniqueContentUnits']) if (!safeInteger(counts[key])) errors.push(`census counts/${key} is invalid`);
    validateDispositionMatrix(counts.dispositions, errors, 'census counts');
    for (const [name, field] of [['bySource', 'sourceId'], ['byFamily', 'familyId']] as const) {
      const rows = counts[name];
      if (!Array.isArray(rows)) { errors.push(`census counts/${name} is invalid`); continue; }
      let previous = '';
      const seen = new Set<string>();
      for (const row of rows) {
        if (!isJsonRecord(row) || typeof row[field] !== 'string' || String(row[field]) <= previous || seen.has(String(row[field]))) errors.push(`census counts/${name} must be sorted and unique`);
        else { previous = String(row[field]); seen.add(previous); }
        if (isJsonRecord(row) && field === 'sourceId') validateDispositionMatrix(row.dispositions, errors, `census source ${String(row[field])}`);
        if (isJsonRecord(row) && field === 'familyId') validateDispositionMatrix(row.dispositions, errors, `census family ${String(row[field])}`);
      }
    }
    if (!Array.isArray(counts.byLanguage)) errors.push('census counts/byLanguage is invalid');
  }
  validateCensusGate(value.smoke, 'smoke', errors);
  validateCensusGate(value.canary, 'canary', errors);
  return result(errors);
}

export function isCalibrationAdmissionCensusV103(value: unknown): value is CalibrationAdmissionCensusV103 {
  return validateCalibrationAdmissionCensusV103(value).ok;
}

export type {
  AdmissionCohortWitnessV1,
  AdmissionCohortInfeasibilityCertificateV1,
  AdmissionSearchReceiptV1,
  CalibrationAdmissionSearchResultBundleV1,
  CalibrationAdmissionWitnessReviewReceiptV1,
  CalibrationAdmissionWitnessReviewBundleV1,
  CalibrationAdmissionCensusV103,
};
