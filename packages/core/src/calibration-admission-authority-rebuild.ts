import { calibrationAdmissionSha256 } from './calibration-admission-evidence';
import type { CalibrationAdmissionAuthorityRebuildLockV1 } from './generated/calibration-admission-authority-rebuild-lock';
import type { CalibrationAdmissionAuthorityRebuildTransactionV1 } from './generated/calibration-admission-authority-rebuild-transaction';
import {
  exactKeys,
  isAdmissionId,
  isJsonRecord,
  isSha256,
  sortedUniqueByPredicate,
  withoutJsonKey,
} from './calibration-admission-primitives';

/** Pure contracts for the static admission-authority rebuild lock and transaction. */

type JsonObject = Record<string, unknown>;
type ExpectedCurrentState = CalibrationAdmissionAuthorityRebuildLockV1['expectedCurrentState'];

const AUTHORITY_CURRENT_FINAL = 'review/admission/authority/current.json';
const MAX_SOURCE_GENERATION_DIRECTORIES = 452_382;

export interface CalibrationAdmissionAuthorityRebuildValidationV1 {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

export interface CalibrationAdmissionAuthorityRebuildGraphValidationV1 {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

export interface CalibrationAdmissionAuthorityRebuildGraphInputV1 {
  readonly lock: unknown;
  readonly transaction: unknown;
}

function result(errors: readonly string[]): CalibrationAdmissionAuthorityRebuildValidationV1 {
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

function graphResult(errors: readonly string[]): CalibrationAdmissionAuthorityRebuildGraphValidationV1 {
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

function relativePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096
    || value.startsWith('/') || value.includes('\\') || value.includes('//')) return false;
  const segments = value.split('/');
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..'
    && !/[\u0000-\u001f]/.test(segment));
}

function expectedCurrentState(value: unknown): value is ExpectedCurrentState {
  if (!isJsonRecord(value)) return false;
  if (value.kind === 'absent') return exactKeys(value, ['kind']);
  return value.kind === 'existing'
    && exactKeys(value, ['kind', 'staticGenerationSha256'])
    && isSha256(value.staticGenerationSha256);
}

function hashWithout(value: unknown, key: string): string {
  return calibrationAdmissionSha256(withoutJsonKey(value, key));
}

function sourceGenerationDirectory(value: unknown): boolean {
  if (!isJsonRecord(value)) return false;
  const keys = [
    'sourceId',
    'generationSha256',
    'artifactSetSha256',
    'generationStagingRelativePath',
    'generationFinalRelativePath',
    'generationsParentRelativePath',
    ...(value.priorGenerationRelativePath === undefined ? [] : ['priorGenerationRelativePath']),
    'currentPointerTemporaryRelativePath',
    'currentPointerFinalRelativePath',
  ];
  return exactKeys(value, keys)
    && isAdmissionId(value.sourceId)
    && isSha256(value.generationSha256)
    && isSha256(value.artifactSetSha256)
    && relativePath(value.generationStagingRelativePath)
    && relativePath(value.generationFinalRelativePath)
    && relativePath(value.generationsParentRelativePath)
    && (value.priorGenerationRelativePath === undefined || relativePath(value.priorGenerationRelativePath))
    && relativePath(value.currentPointerTemporaryRelativePath)
    && relativePath(value.currentPointerFinalRelativePath);
}

function sourceGenerationDirectories(value: unknown): value is readonly JsonObject[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SOURCE_GENERATION_DIRECTORIES
    || !value.every(sourceGenerationDirectory)) return false;
  return sortedUniqueByPredicate(
    value.map((entry) => String(entry.sourceId)),
    isAdmissionId,
    false,
  );
}

function state(value: unknown): boolean {
  if (!isJsonRecord(value) || typeof value.phase !== 'string') return false;
  if (value.phase === 'intent_fsynced') return exactKeys(value, ['phase']);

  const inputPhases = new Set([
    'source_generation_directories_staged_fsynced',
    'source_generation_directories_promoted',
    'source_generation_parents_fsynced',
    'input_generation_fsynced',
    'overlap_generation_verified',
  ]);
  if (inputPhases.has(value.phase)) {
    return exactKeys(value, ['phase', 'inputGenerationSha256'])
      && isSha256(value.inputGenerationSha256);
  }

  if (value.phase === 'primary_static_outputs_fsynced') {
    return exactKeys(value, ['phase', 'inputGenerationSha256', 'overlapGenerationSha256', 'primaryOutputSetSha256'])
      && isSha256(value.inputGenerationSha256)
      && isSha256(value.overlapGenerationSha256)
      && isSha256(value.primaryOutputSetSha256);
  }

  if (value.phase === 'tool_receipt_indexed') {
    return exactKeys(value, [
      'phase',
      'inputGenerationSha256',
      'overlapGenerationSha256',
      'primaryOutputSetSha256',
      'toolReceiptId',
      'toolReceiptSha256',
      'toolAuthorityIndexSha256',
    ])
      && isSha256(value.inputGenerationSha256)
      && isSha256(value.overlapGenerationSha256)
      && isSha256(value.primaryOutputSetSha256)
      && isAdmissionId(value.toolReceiptId)
      && isSha256(value.toolReceiptSha256)
      && isSha256(value.toolAuthorityIndexSha256);
  }

  const publishedPhases = new Set([
    'static_generation_staged_fsynced',
    'static_generation_promoted',
    'static_generations_parent_fsynced',
    'source_current_pointers_promoted',
    'authority_current_promoted',
    'output_directories_fsynced',
    'complete',
  ]);
  if (!publishedPhases.has(value.phase)) return false;
  return exactKeys(value, [
    'phase',
    'inputGenerationSha256',
    'overlapGenerationSha256',
    'primaryOutputSetSha256',
    'toolReceiptId',
    'toolReceiptSha256',
    'toolAuthorityIndexSha256',
    'staticGenerationSha256',
    'staticGenerationRelativePath',
  ])
    && isSha256(value.inputGenerationSha256)
    && isSha256(value.overlapGenerationSha256)
    && isSha256(value.primaryOutputSetSha256)
    && isAdmissionId(value.toolReceiptId)
    && isSha256(value.toolReceiptSha256)
    && isSha256(value.toolAuthorityIndexSha256)
    && isSha256(value.staticGenerationSha256)
    && relativePath(value.staticGenerationRelativePath);
}

export function calibrationAdmissionAuthorityRebuildLockSha256(
  value: Omit<CalibrationAdmissionAuthorityRebuildLockV1, 'lockSha256'> | JsonObject,
): string {
  return hashWithout(value, 'lockSha256');
}

export function calibrationAdmissionAuthorityRebuildTransactionSha256(
  value: Omit<CalibrationAdmissionAuthorityRebuildTransactionV1, 'transactionSha256'> | JsonObject,
): string {
  return hashWithout(value, 'transactionSha256');
}

export function validateCalibrationAdmissionAuthorityRebuildLockV1(
  value: unknown,
): CalibrationAdmissionAuthorityRebuildValidationV1 {
  try {
    const errors: string[] = [];
    if (!isJsonRecord(value)) return result(['authority rebuild lock is not an object']);
    if (!exactKeys(value, [
      'version',
      'lockId',
      'intendedTransactionId',
      'invocationIntentId',
      'inputGenerationProposalId',
      'inputGenerationProposalSha256',
      'operation',
      'expectedCurrentState',
      'recoveryNonce',
      'lockSha256',
    ])) errors.push('authority rebuild lock object shape is invalid');
    if (value.version !== 'v10.3-admission-authority-rebuild-lock-v1') errors.push('authority rebuild lock version is invalid');
    if (!isAdmissionId(value.lockId)) errors.push('authority rebuild lock ID is invalid');
    if (!isAdmissionId(value.intendedTransactionId)) errors.push('authority rebuild intended transaction ID is invalid');
    if (!isSha256(value.invocationIntentId)) errors.push('authority rebuild invocation intent ID is invalid');
    if (!isAdmissionId(value.inputGenerationProposalId)) errors.push('authority rebuild input-generation proposal ID is invalid');
    if (!isSha256(value.inputGenerationProposalSha256)) errors.push('authority rebuild input-generation proposal hash is invalid');
    if (value.operation !== 'create' && value.operation !== 'replace') errors.push('authority rebuild lock operation is invalid');
    if (!expectedCurrentState(value.expectedCurrentState)) errors.push('authority rebuild lock expected current state is invalid');
    if (value.operation === 'create' && isJsonRecord(value.expectedCurrentState) && value.expectedCurrentState.kind !== 'absent') {
      errors.push('authority rebuild create operation must expect an absent current pointer');
    }
    if (value.operation === 'replace' && isJsonRecord(value.expectedCurrentState) && value.expectedCurrentState.kind !== 'existing') {
      errors.push('authority rebuild replace operation must expect an existing current pointer');
    }
    if (!isSha256(value.recoveryNonce)) errors.push('authority rebuild recovery nonce is invalid');
    if (!isSha256(value.lockSha256)) errors.push('authority rebuild lock self-hash is invalid');
    try {
      if (isSha256(value.lockSha256) && calibrationAdmissionAuthorityRebuildLockSha256(value) !== value.lockSha256) {
        errors.push('authority rebuild lock self-hash does not match canonical bytes');
      }
    } catch {
      errors.push('authority rebuild lock cannot be canonicalized');
    }
    return result(errors);
  } catch {
    return result(['authority rebuild lock validation failed closed']);
  }
}

export function isCalibrationAdmissionAuthorityRebuildLockV1(
  value: unknown,
): value is CalibrationAdmissionAuthorityRebuildLockV1 {
  return validateCalibrationAdmissionAuthorityRebuildLockV1(value).ok;
}

export function validateCalibrationAdmissionAuthorityRebuildTransactionV1(
  value: unknown,
): CalibrationAdmissionAuthorityRebuildValidationV1 {
  try {
    const errors: string[] = [];
    if (!isJsonRecord(value)) return result(['authority rebuild transaction is not an object']);
    if (!exactKeys(value, [
      'version',
      'transactionId',
      'lockSha256',
      'invocationIntentId',
      'inputGenerationProposalId',
      'inputGenerationProposalSha256',
      'operation',
      'expectedCurrentState',
      'recoveryNonce',
      'inputGenerationRelativePath',
      'staticGenerationStagingRelativePath',
      'authorityCurrentTemporaryRelativePath',
      'authorityCurrentFinalRelativePath',
      'sourceGenerationDirectories',
      'state',
      'transactionSha256',
    ])) errors.push('authority rebuild transaction object shape is invalid');
    if (value.version !== 'v10.3-admission-authority-rebuild-transaction-v1') errors.push('authority rebuild transaction version is invalid');
    if (!isAdmissionId(value.transactionId)) errors.push('authority rebuild transaction ID is invalid');
    if (!isSha256(value.lockSha256)) errors.push('authority rebuild transaction lock hash is invalid');
    if (!isSha256(value.invocationIntentId)) errors.push('authority rebuild transaction invocation intent ID is invalid');
    if (!isAdmissionId(value.inputGenerationProposalId)) errors.push('authority rebuild transaction input-generation proposal ID is invalid');
    if (!isSha256(value.inputGenerationProposalSha256)) errors.push('authority rebuild transaction input-generation proposal hash is invalid');
    if (value.operation !== 'create' && value.operation !== 'replace') errors.push('authority rebuild transaction operation is invalid');
    if (!expectedCurrentState(value.expectedCurrentState)) errors.push('authority rebuild transaction expected current state is invalid');
    if (value.operation === 'create' && isJsonRecord(value.expectedCurrentState) && value.expectedCurrentState.kind !== 'absent') {
      errors.push('authority rebuild create operation must expect an absent current pointer');
    }
    if (value.operation === 'replace' && isJsonRecord(value.expectedCurrentState) && value.expectedCurrentState.kind !== 'existing') {
      errors.push('authority rebuild replace operation must expect an existing current pointer');
    }
    if (!isSha256(value.recoveryNonce)) errors.push('authority rebuild transaction recovery nonce is invalid');
    if (!relativePath(value.inputGenerationRelativePath)) errors.push('authority rebuild input-generation path is invalid');
    if (!relativePath(value.staticGenerationStagingRelativePath)) errors.push('authority rebuild static-generation staging path is invalid');
    if (!relativePath(value.authorityCurrentTemporaryRelativePath)
      || value.authorityCurrentTemporaryRelativePath === AUTHORITY_CURRENT_FINAL) {
      errors.push('authority rebuild authority-current temporary path is invalid');
    }
    if (value.authorityCurrentFinalRelativePath !== AUTHORITY_CURRENT_FINAL) errors.push('authority rebuild authority-current final path is invalid');
    if (!sourceGenerationDirectories(value.sourceGenerationDirectories)) errors.push('authority rebuild source-generation directories are invalid, duplicated, or unsorted');
    if (!state(value.state)) errors.push('authority rebuild transaction state is invalid');
    if (!isSha256(value.transactionSha256)) errors.push('authority rebuild transaction self-hash is invalid');
    try {
      if (isSha256(value.transactionSha256) && calibrationAdmissionAuthorityRebuildTransactionSha256(value) !== value.transactionSha256) {
        errors.push('authority rebuild transaction self-hash does not match canonical bytes');
      }
    } catch {
      errors.push('authority rebuild transaction cannot be canonicalized');
    }
    return result(errors);
  } catch {
    return result(['authority rebuild transaction validation failed closed']);
  }
}

export function isCalibrationAdmissionAuthorityRebuildTransactionV1(
  value: unknown,
): value is CalibrationAdmissionAuthorityRebuildTransactionV1 {
  return validateCalibrationAdmissionAuthorityRebuildTransactionV1(value).ok;
}

function sameExpectedCurrentState(left: ExpectedCurrentState, right: ExpectedCurrentState): boolean {
  if (left.kind !== right.kind) return false;
  return left.kind === 'absent'
    ? true
    : right.kind === 'existing' && left.staticGenerationSha256 === right.staticGenerationSha256;
}

/** Validate the pure lock → transaction identity handoff. */
export function validateCalibrationAdmissionAuthorityRebuildGraphV1(
  input: CalibrationAdmissionAuthorityRebuildGraphInputV1,
): CalibrationAdmissionAuthorityRebuildGraphValidationV1;
export function validateCalibrationAdmissionAuthorityRebuildGraphV1(
  lockValue: unknown,
  transactionValue: unknown,
): CalibrationAdmissionAuthorityRebuildGraphValidationV1;
export function validateCalibrationAdmissionAuthorityRebuildGraphV1(
  lockOrInput: unknown,
  transactionValue?: unknown,
): CalibrationAdmissionAuthorityRebuildGraphValidationV1 {
  const errors: string[] = [];
  const lockValue = transactionValue === undefined && isJsonRecord(lockOrInput) && 'lock' in lockOrInput
    && 'transaction' in lockOrInput
    ? lockOrInput.lock
    : lockOrInput;
  const resolvedTransactionValue = transactionValue === undefined && isJsonRecord(lockOrInput) && 'lock' in lockOrInput
    && 'transaction' in lockOrInput
    ? lockOrInput.transaction
    : transactionValue;
  const lock = isCalibrationAdmissionAuthorityRebuildLockV1(lockValue) ? lockValue : undefined;
  const transaction = isCalibrationAdmissionAuthorityRebuildTransactionV1(resolvedTransactionValue) ? resolvedTransactionValue : undefined;
  if (!lock) errors.push('authority rebuild lock is invalid');
  if (!transaction) errors.push('authority rebuild transaction is invalid');
  if (!lock || !transaction) return graphResult(errors);

  if (transaction.lockSha256 !== lock.lockSha256) errors.push('transaction does not bind lock self-hash');
  if (transaction.transactionId !== lock.intendedTransactionId) errors.push('transaction ID does not match lock intent');
  if (transaction.invocationIntentId !== lock.invocationIntentId) errors.push('invocation intent identity differs between lock and transaction');
  if (transaction.inputGenerationProposalId !== lock.inputGenerationProposalId
    || transaction.inputGenerationProposalSha256 !== lock.inputGenerationProposalSha256) {
    errors.push('input-generation proposal identity differs between lock and transaction');
  }
  if (transaction.operation !== lock.operation) errors.push('operation differs between lock and transaction');
  if (!sameExpectedCurrentState(lock.expectedCurrentState, transaction.expectedCurrentState)) {
    errors.push('expected current state differs between lock and transaction');
  }
  if (transaction.recoveryNonce !== lock.recoveryNonce) errors.push('recovery nonce differs between lock and transaction');
  return graphResult(errors);
}

/** Alias without the version suffix for callers following older Core APIs. */
export function validateCalibrationAdmissionAuthorityRebuildGraph(
  input: CalibrationAdmissionAuthorityRebuildGraphInputV1,
): CalibrationAdmissionAuthorityRebuildGraphValidationV1;
export function validateCalibrationAdmissionAuthorityRebuildGraph(
  lockValue: unknown,
  transactionValue: unknown,
): CalibrationAdmissionAuthorityRebuildGraphValidationV1;
export function validateCalibrationAdmissionAuthorityRebuildGraph(
  lockOrInput: unknown,
  transactionValue?: unknown,
): CalibrationAdmissionAuthorityRebuildGraphValidationV1 {
  return transactionValue === undefined
    ? validateCalibrationAdmissionAuthorityRebuildGraphV1(lockOrInput as CalibrationAdmissionAuthorityRebuildGraphInputV1)
    : validateCalibrationAdmissionAuthorityRebuildGraphV1(lockOrInput, transactionValue);
}
