import {
  calibrationAdmissionSha256,
  isCalibrationNestedPublicationHandoffV1,
} from './calibration-admission-evidence';
import type { CalibrationAdmissionWitnessPublicationCompletionV1 } from './generated/calibration-admission-witness-publication-completion';
import type { CalibrationAdmissionWitnessPublicationLockV1 } from './generated/calibration-admission-witness-publication-lock';
import type { CalibrationAdmissionWitnessPublicationTransactionV1 } from './generated/calibration-admission-witness-publication-transaction';
import type { CalibrationAdmissionWitnessRoutingReferenceV1 } from './generated/calibration-admission-witness-routing-reference';
import {
  exactKeys,
  isJsonRecord,
  isSha256,
  sortedUniqueByPredicate,
  withoutJsonKey,
} from './calibration-admission-primitives';

export interface CalibrationAdmissionWitnessPublicationValidationV1 {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

export interface CalibrationAdmissionWitnessPublicationGraphInputV1 {
  readonly lock: unknown;
  readonly transaction: unknown;
}

type JsonObject = Record<string, unknown>;

function result(errors: readonly string[]): CalibrationAdmissionWitnessPublicationValidationV1 {
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

function path(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096
    || value.startsWith('/') || value.includes('\\') || value.includes('//')) return false;
  return value.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..' && !/[\u0000-\u001f]/u.test(part));
}

function stateRef(value: unknown): boolean {
  if (!isJsonRecord(value)) return false;
  if (value.kind === 'absent') return exactKeys(value, ['kind']);
  return value.kind === 'existing' && exactKeys(value, ['kind', 'referenceSha256']) && isSha256(value.referenceSha256);
}

function hashWithout(value: unknown, key: string): string {
  return calibrationAdmissionSha256(withoutJsonKey(value, key));
}

function ids(value: unknown, name: string, errors: string[]): boolean {
  const valid = sortedUniqueByPredicate(value, isSha256, true);
  if (!valid) errors.push(`${name} must be sorted unique SHA-256 values`);
  return valid;
}

function commonPublicationFields(value: JsonObject, errors: string[]): boolean {
  const valid = isSha256(value.parentTransactionId)
    && isSha256(value.invocationIntentId)
    && path(value.bundleRelativePath)
    && isSha256(value.bundleSha256)
    && isSha256(value.namedPrimaryOutputProjectionSha256)
    && isSha256(value.publicationToolReceiptId)
    && isSha256(value.publicationToolReceiptSha256)
    && isSha256(value.toolAuthorityIndexSha256)
    && isCalibrationNestedPublicationHandoffV1(value.nestedHandoff);
  if (!valid) errors.push('witness publication completion fields are invalid');
  ids(value.requiredToolReceiptIds, 'requiredToolReceiptIds', errors);
  ids(value.requiredToolReceiptSha256s, 'requiredToolReceiptSha256s', errors);
  if (Array.isArray(value.requiredToolReceiptIds) && Array.isArray(value.requiredToolReceiptSha256s)
    && value.requiredToolReceiptIds.length !== value.requiredToolReceiptSha256s.length) errors.push('required tool receipt ID/hash sets must have equal length');
  return valid;
}

export function calibrationAdmissionWitnessRoutingReferenceSha256(
  value: Omit<CalibrationAdmissionWitnessRoutingReferenceV1, 'referenceSha256'> | JsonObject,
): string {
  return hashWithout({ ...value, referenceSha256: undefined }, 'referenceSha256');
}

export function calibrationAdmissionWitnessPublicationCompletionSha256(
  value: Omit<CalibrationAdmissionWitnessPublicationCompletionV1, 'completionSha256'> | JsonObject,
): string {
  return hashWithout({ ...value, completionSha256: undefined }, 'completionSha256');
}

export function calibrationAdmissionWitnessPublicationLockSha256(
  value: Omit<CalibrationAdmissionWitnessPublicationLockV1, 'lockSha256'> | JsonObject,
): string {
  return hashWithout({ ...value, lockSha256: undefined }, 'lockSha256');
}

export function calibrationAdmissionWitnessPublicationTransactionSha256(
  value: Omit<CalibrationAdmissionWitnessPublicationTransactionV1, 'transactionSha256'> | JsonObject,
): string {
  return hashWithout({ ...value, transactionSha256: undefined }, 'transactionSha256');
}

export function validateCalibrationAdmissionWitnessRoutingReferenceV1(value: unknown): CalibrationAdmissionWitnessPublicationValidationV1 {
  const errors: string[] = [];
  if (!isJsonRecord(value) || !exactKeys(value, ['version', 'gate', 'kind', 'bundleRelativePath', 'bundleSha256', 'publicationCompletionRelativePath', 'publicationCompletionSha256', 'referenceSha256'])) return result(['witness routing reference shape is invalid']);
  if (value.version !== 'v10.3-admission-witness-routing-reference-v1') errors.push('witness routing reference version is invalid');
  if (value.gate !== 'smoke' && value.gate !== 'canary') errors.push('witness routing reference gate is invalid');
  if (value.kind !== 'search_result' && value.kind !== 'witness_review') errors.push('witness routing reference kind is invalid');
  if (!path(value.bundleRelativePath) || !path(value.publicationCompletionRelativePath)) errors.push('witness routing reference path is invalid');
  if (!isSha256(value.bundleSha256) || !isSha256(value.publicationCompletionSha256) || !isSha256(value.referenceSha256)) errors.push('witness routing reference hash is invalid');
  if (isSha256(value.referenceSha256)) {
    try { if (calibrationAdmissionWitnessRoutingReferenceSha256(value) !== value.referenceSha256) errors.push('witness routing reference self-hash is invalid'); } catch { errors.push('witness routing reference cannot be hashed'); }
  }
  return result(errors);
}

export function isCalibrationAdmissionWitnessRoutingReferenceV1(value: unknown): value is CalibrationAdmissionWitnessRoutingReferenceV1 {
  return validateCalibrationAdmissionWitnessRoutingReferenceV1(value).ok;
}

export function validateCalibrationAdmissionWitnessPublicationCompletionV1(value: unknown): CalibrationAdmissionWitnessPublicationValidationV1 {
  const errors: string[] = [];
  if (!isJsonRecord(value) || !exactKeys(value, ['version', 'gate', 'kind', 'parentTransactionId', 'invocationIntentId', 'bundleRelativePath', 'bundleSha256', 'namedPrimaryOutputProjectionSha256', 'requiredToolReceiptIds', 'requiredToolReceiptSha256s', 'publicationToolReceiptId', 'publicationToolReceiptSha256', 'toolAuthorityIndexSha256', 'nestedHandoff', 'completionSha256'])) return result(['witness publication completion shape is invalid']);
  if (value.version !== 'v10.3-admission-witness-publication-completion-v1') errors.push('witness publication completion version is invalid');
  if (value.gate !== 'smoke' && value.gate !== 'canary') errors.push('witness publication completion gate is invalid');
  if (value.kind !== 'search_result' && value.kind !== 'witness_review') errors.push('witness publication completion kind is invalid');
  commonPublicationFields(value, errors);
  if (isSha256(value.completionSha256)) {
    try { if (calibrationAdmissionWitnessPublicationCompletionSha256(value) !== value.completionSha256) errors.push('witness publication completion self-hash is invalid'); } catch { errors.push('witness publication completion cannot be hashed'); }
  } else errors.push('witness publication completion hash is invalid');
  return result(errors);
}

export function isCalibrationAdmissionWitnessPublicationCompletionV1(value: unknown): value is CalibrationAdmissionWitnessPublicationCompletionV1 {
  return validateCalibrationAdmissionWitnessPublicationCompletionV1(value).ok;
}

export function validateCalibrationAdmissionWitnessPublicationLockV1(value: unknown): CalibrationAdmissionWitnessPublicationValidationV1 {
  const errors: string[] = [];
  if (!isJsonRecord(value) || !exactKeys(value, ['version', 'lockId', 'intendedTransactionId', 'operation', 'gate', 'invocationIntentId', 'bundleSha256', 'bundleRelativePath', 'expectedRoutingReferenceState', 'recoveryNonce', 'lockSha256'])) return result(['witness publication lock shape is invalid']);
  if (value.version !== 'v10.3-admission-witness-publication-lock-v1') errors.push('witness publication lock version is invalid');
  if (!isSha256(value.lockId) || !isSha256(value.intendedTransactionId) || !isSha256(value.invocationIntentId) || !isSha256(value.bundleSha256) || !isSha256(value.recoveryNonce) || !path(value.bundleRelativePath) || !stateRef(value.expectedRoutingReferenceState)) errors.push('witness publication lock fields are invalid');
  if (value.operation !== 'search_result' && value.operation !== 'witness_review') errors.push('witness publication lock operation is invalid');
  if (value.gate !== 'smoke' && value.gate !== 'canary') errors.push('witness publication lock gate is invalid');
  if (isSha256(value.lockSha256)) {
    try { if (calibrationAdmissionWitnessPublicationLockSha256(value) !== value.lockSha256) errors.push('witness publication lock self-hash is invalid'); } catch { errors.push('witness publication lock cannot be hashed'); }
  } else errors.push('witness publication lock hash is invalid');
  return result(errors);
}

export function isCalibrationAdmissionWitnessPublicationLockV1(value: unknown): value is CalibrationAdmissionWitnessPublicationLockV1 {
  return validateCalibrationAdmissionWitnessPublicationLockV1(value).ok;
}

const RECEIPT_PHASES = new Set(['publication_tool_receipt_indexed', 'completion_staged_fsynced', 'completion_promoted', 'completion_directory_fsynced', 'routing_reference_staged_fsynced', 'routing_reference_promoted', 'projections_directory_fsynced']);
const BUNDLE_PHASES = new Set(['bundle_staged_fsynced', 'bundle_promoted', 'output_directory_fsynced']);

function transactionState(value: unknown, operation: string, errors: string[]): boolean {
  if (!isJsonRecord(value) || typeof value.phase !== 'string') { errors.push('witness publication transaction state is invalid'); return false; }
  const phase = value.phase;
  if (phase === 'intent_fsynced') return exactKeys(value, ['phase']);
  const toolKeys = ['requiredToolReceiptIds', 'requiredToolReceiptSha256s', 'toolAuthorityIndexSha256'];
  if (phase === 'required_tool_receipts_indexed' || BUNDLE_PHASES.has(phase)) {
    if (!exactKeys(value, ['phase', ...toolKeys])) errors.push('witness publication transaction tool state shape is invalid');
    ids(value.requiredToolReceiptIds, 'transaction requiredToolReceiptIds', errors);
    ids(value.requiredToolReceiptSha256s, 'transaction requiredToolReceiptSha256s', errors);
    if (!isSha256(value.toolAuthorityIndexSha256)) errors.push('transaction tool authority index hash is invalid');
    return errors.length === 0;
  }
  if (phase === 'publication_tool_receipt_started') {
    if (!exactKeys(value, ['phase', ...toolKeys, 'nestedHandoffSha256', 'childTransactionId', 'childRecoveryNonce'])) errors.push('witness publication receipt-start state shape is invalid');
    ids(value.requiredToolReceiptIds, 'transaction requiredToolReceiptIds', errors); ids(value.requiredToolReceiptSha256s, 'transaction requiredToolReceiptSha256s', errors);
    for (const key of ['toolAuthorityIndexSha256', 'nestedHandoffSha256', 'childTransactionId', 'childRecoveryNonce']) if (!isSha256(value[key])) errors.push(`transaction ${key} is invalid`);
    return errors.length === 0;
  }
  if (RECEIPT_PHASES.has(phase) || phase === 'complete') {
    const required = ['phase', ...toolKeys, 'publicationToolReceiptId', 'publicationToolReceiptSha256', 'nestedHandoffSha256', 'childTransactionId', 'childRecoveryNonce', 'publicationCompletionSha256', 'publicationCompletionFinalRelativePath', 'nextRoutingReferenceSha256'];
    if (!exactKeys(value, [...required, ...(phase === 'complete' ? ['completion'] : [])])) errors.push('witness publication receipt state shape is invalid');
    ids(value.requiredToolReceiptIds, 'transaction requiredToolReceiptIds', errors); ids(value.requiredToolReceiptSha256s, 'transaction requiredToolReceiptSha256s', errors);
    for (const key of ['toolAuthorityIndexSha256', 'publicationToolReceiptId', 'publicationToolReceiptSha256', 'nestedHandoffSha256', 'childTransactionId', 'childRecoveryNonce', 'publicationCompletionSha256', 'nextRoutingReferenceSha256']) if (!isSha256(value[key])) errors.push(`transaction ${key} is invalid`);
    if (!path(value.publicationCompletionFinalRelativePath)) errors.push('transaction publication completion path is invalid');
    if (phase === 'complete') {
      const completion = isJsonRecord(value.completion) ? value.completion : undefined;
      if (!completion || !exactKeys(completion, operation === 'search_result' ? ['kind', 'searchToolReceiptId', 'searchToolReceiptSha256', 'publicationToolReceiptId', 'publicationToolReceiptSha256'] : ['kind', 'publicationToolReceiptId', 'publicationToolReceiptSha256'])) errors.push('witness publication completion summary shape is invalid');
      if (completion && completion.kind !== operation) errors.push('witness publication completion summary kind does not match operation');
    }
    return errors.length === 0;
  }
  errors.push('witness publication transaction phase is unknown');
  return false;
}

export function validateCalibrationAdmissionWitnessPublicationTransactionV1(value: unknown): CalibrationAdmissionWitnessPublicationValidationV1 {
  const errors: string[] = [];
  if (!isJsonRecord(value) || !exactKeys(value, ['version', 'transactionId', 'lockSha256', 'operation', 'gate', 'invocationIntentId', 'bundleSha256', 'bundleBytes', 'expectedRoutingReferenceState', 'bundleTemporaryRelativePath', 'bundleFinalRelativePath', 'completionTemporaryRelativePath', 'routingReferenceTemporaryRelativePath', 'routingReferenceFinalRelativePath', 'recoveryNonce', 'state', 'transactionSha256'])) return result(['witness publication transaction shape is invalid']);
  if (value.version !== 'v10.3-admission-witness-publication-transaction-v1') errors.push('witness publication transaction version is invalid');
  for (const key of ['transactionId', 'lockSha256', 'invocationIntentId', 'bundleSha256', 'recoveryNonce']) if (!isSha256(value[key])) errors.push(`witness publication transaction ${key} is invalid`);
  if (value.operation !== 'search_result' && value.operation !== 'witness_review') errors.push('witness publication transaction operation is invalid');
  if (value.gate !== 'smoke' && value.gate !== 'canary') errors.push('witness publication transaction gate is invalid');
  if (!Number.isSafeInteger(value.bundleBytes) || Number(value.bundleBytes) < 1) errors.push('witness publication transaction bundleBytes is invalid');
  if (!stateRef(value.expectedRoutingReferenceState)) errors.push('witness publication transaction expected reference state is invalid');
  for (const key of ['bundleTemporaryRelativePath', 'bundleFinalRelativePath', 'completionTemporaryRelativePath', 'routingReferenceTemporaryRelativePath', 'routingReferenceFinalRelativePath']) if (!path(value[key])) errors.push(`witness publication transaction ${key} is invalid`);
  transactionState(value.state, String(value.operation), errors);
  if (!isSha256(value.transactionSha256)) errors.push('witness publication transaction hash is invalid');
  else {
    try { if (calibrationAdmissionWitnessPublicationTransactionSha256(value) !== value.transactionSha256) errors.push('witness publication transaction self-hash is invalid'); } catch { errors.push('witness publication transaction cannot be hashed'); }
  }
  return result(errors);
}

export function isCalibrationAdmissionWitnessPublicationTransactionV1(value: unknown): value is CalibrationAdmissionWitnessPublicationTransactionV1 {
  return validateCalibrationAdmissionWitnessPublicationTransactionV1(value).ok;
}

export function validateCalibrationAdmissionWitnessPublicationGraph(input: CalibrationAdmissionWitnessPublicationGraphInputV1): CalibrationAdmissionWitnessPublicationValidationV1 {
  const errors: string[] = [];
  const lockValid = validateCalibrationAdmissionWitnessPublicationLockV1(input.lock);
  const transactionValid = validateCalibrationAdmissionWitnessPublicationTransactionV1(input.transaction);
  errors.push(...lockValid.errors.map((error) => `lock: ${error}`), ...transactionValid.errors.map((error) => `transaction: ${error}`));
  if (lockValid.ok && transactionValid.ok && isJsonRecord(input.lock) && isJsonRecord(input.transaction)) {
    for (const key of ['intendedTransactionId', 'operation', 'gate', 'invocationIntentId', 'bundleSha256', 'bundleRelativePath', 'recoveryNonce']) {
      const txKey = key === 'intendedTransactionId'
        ? 'transactionId'
        : key === 'bundleRelativePath'
          ? 'bundleFinalRelativePath'
          : key;
      if (input.lock[key] !== input.transaction[txKey]) errors.push(`lock/transaction ${key} binding mismatch`);
    }
    if (input.lock.lockSha256 !== input.transaction.lockSha256) errors.push('lock/transaction lock hash mismatch');
    if (!sameReferenceState(input.lock.expectedRoutingReferenceState, input.transaction.expectedRoutingReferenceState)) errors.push('lock/transaction expected reference state mismatch');
  }
  return result(errors);
}

export function validateCalibrationAdmissionWitnessPublicationGraphV1(input: CalibrationAdmissionWitnessPublicationGraphInputV1): CalibrationAdmissionWitnessPublicationValidationV1 {
  return validateCalibrationAdmissionWitnessPublicationGraph(input);
}

function sameReferenceState(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
