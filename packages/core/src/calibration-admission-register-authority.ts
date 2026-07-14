import { calibrationAdmissionSha256 } from './calibration-admission-evidence';
import type { AddedSource, CalibrationAdmissionRegisterDeltaV1 } from './generated/calibration-admission-register-delta';
import type { CalibrationRegisterGenerationReceiptV1 } from './generated/calibration-register-generation-receipt';
import type { CalibrationRegisterGenerationLockV1 } from './generated/calibration-register-generation-lock';
import type {
  CalibrationRegisterGenerationTransactionV1,
  SourceGeneration,
} from './generated/calibration-register-generation-transaction';
import {
  exactKeys,
  isAdmissionId as id,
  isJsonRecord as isRecord,
  isSha256 as sha,
  sortedUniqueByPredicate as sortedUnique,
  withoutJsonKey as withoutKey,
} from './calibration-admission-primitives';

const SHA256 = /^[a-f0-9]{64}$/;
const PHASES = new Set([
  'intent_fsynced',
  'source_generation_directories_staged_fsynced',
  'source_generation_directories_promoted',
  'source_generation_parents_fsynced',
  'generation_file_fsynced',
  'source_current_pointers_promoted',
  'current_register_temporary_fsynced',
  'current_register_promoted',
  'output_directory_fsynced',
  'tool_receipt_indexed',
  'generation_receipt_staged_fsynced',
  'generation_receipt_promoted',
  'receipt_directories_fsynced',
  'complete',
]);

function safeGeneration(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}

function unique(value: readonly string[]): boolean {
  return new Set(value).size === value.length;
}

function hashWithout(value: unknown, key: string): string {
  return calibrationAdmissionSha256(withoutKey(value, key));
}

function relativePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.startsWith('/') || value.includes('\\') || value.includes('//')) return false;
  const segments = value.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return false;
  if (segments.includes('index-generations') || segments.includes('authority')) return false;
  return true;
}

function sourceGeneration(value: unknown): value is SourceGeneration {
  if (!isRecord(value) || !exactKeys(value, [
    'sourceId',
    'proposalId',
    'generationSha256',
    'artifactSetSha256',
    'generationStagingRelativePath',
    'generationFinalRelativePath',
    'generationsParentRelativePath',
    ...(value.priorGenerationRelativePath === undefined ? [] : ['priorGenerationRelativePath']),
    'currentPointerTemporaryRelativePath',
    'currentPointerFinalRelativePath',
  ])) return false;
  if (!id(value.sourceId) || !id(value.proposalId) || !sha(value.generationSha256) || !sha(value.artifactSetSha256)
    || !relativePath(value.generationStagingRelativePath) || !relativePath(value.generationFinalRelativePath)
    || !relativePath(value.generationsParentRelativePath)
    || (value.priorGenerationRelativePath !== undefined && !relativePath(value.priorGenerationRelativePath))
    || !relativePath(value.currentPointerTemporaryRelativePath) || !relativePath(value.currentPointerFinalRelativePath)) return false;
  const generationParent = value.generationsParentRelativePath;
  const finalPath = value.generationFinalRelativePath;
  const sourceRoot = generationParent.endsWith('/generations')
    ? generationParent.slice(0, -'/generations'.length)
    : undefined;
  // A generation is a source-owned hash-named child of its exact generations
  // parent.  This rejects a flat/root `generations/<hash>` claim that cannot
  // be safely joined to a source during recovery.
  if (sourceRoot === undefined || sourceRoot.length === 0
      || !sourceRoot.endsWith(`/${value.sourceId}`)
    || generationParent !== `sources/${value.sourceId}/generations`
    || finalPath !== `${generationParent}/${value.generationSha256}/source-generation.json`
    || finalPath.startsWith('generations/')) return false;
  const pointerFinal = value.currentPointerFinalRelativePath;
  const pointerTemporary = value.currentPointerTemporaryRelativePath;
  if (pointerFinal !== `${sourceRoot}/current.json`
    || pointerTemporary === pointerFinal
    || !pointerTemporary.startsWith(`${sourceRoot}/`)
    || !pointerTemporary.endsWith('.tmp.json')) return false;
  if (value.generationStagingRelativePath === finalPath
    || value.generationStagingRelativePath === generationParent
    || !value.generationStagingRelativePath.includes(value.sourceId)) return false;
  if (value.priorGenerationRelativePath !== undefined) {
    const priorParts = value.priorGenerationRelativePath.split('/');
    const parentParts = generationParent.split('/');
    if (priorParts.length !== parentParts.length + 2
      || priorParts.slice(0, parentParts.length).join('/') !== generationParent
      || !SHA256.test(priorParts[parentParts.length] ?? '')
      || priorParts[parentParts.length + 1] !== 'source-generation.json'
      || value.priorGenerationRelativePath === finalPath) return false;
  }
  return true;
}

function addedSource(value: unknown): value is AddedSource {
  if (!isRecord(value) || !exactKeys(value, [
    'sourceId',
    'sourceGenerationSha256',
    'registerEntrySha256',
    'sourceReviewSha256',
    'sourceAcquisitionAuthorizationId',
    'sourceAcquisitionReceiptId',
    'sourceAcquisitionReceiptSha256',
    'materializationReceiptId',
    'materializationReceiptSha256',
  ])) return false;
  return id(value.sourceId) && sha(value.sourceGenerationSha256) && sha(value.registerEntrySha256)
    && sha(value.sourceReviewSha256) && id(value.sourceAcquisitionAuthorizationId)
    && id(value.sourceAcquisitionReceiptId) && sha(value.sourceAcquisitionReceiptSha256)
    && id(value.materializationReceiptId) && sha(value.materializationReceiptSha256);
}

export function calibrationAdmissionRegisterDeltaSha256(value: unknown): string {
  return hashWithout(value, 'deltaSha256');
}

export function calibrationRegisterGenerationReceiptSha256(value: unknown): string {
  return hashWithout(value, 'receiptSha256');
}

export function calibrationRegisterGenerationLockSha256(value: unknown): string {
  return hashWithout(value, 'lockSha256');
}

export function calibrationRegisterGenerationTransactionSha256(value: unknown): string {
  return hashWithout(value, 'transactionSha256');
}

export function isCalibrationAdmissionRegisterDeltaV1(value: unknown): value is CalibrationAdmissionRegisterDeltaV1 {
  if (!isRecord(value) || !exactKeys(value, ['version', 'deltaId', 'generation', 'parentRegisterSha256', 'acquisitionRoundId', 'acquisitionRoundReceiptSha256', 'addedSources', 'deltaSha256'])) return false;
  if (value.version !== 'v10.3-admission-register-delta-v1' || !id(value.deltaId) || !safeGeneration(value.generation)
    || !sha(value.parentRegisterSha256) || !id(value.acquisitionRoundId) || !sha(value.acquisitionRoundReceiptSha256)
    || !Array.isArray(value.addedSources) || (value.addedSources.length !== 1 && value.addedSources.length !== 2)
    || !value.addedSources.every(addedSource) || !sha(value.deltaSha256)) return false;
  if (!sortedUnique(value.addedSources.map((entry) => entry.sourceId), id)) return false;
  if (!unique(value.addedSources.map((entry) => entry.sourceGenerationSha256))) return false;
  try { return calibrationAdmissionRegisterDeltaSha256(value) === value.deltaSha256; } catch { return false; }
}

export function isCalibrationRegisterGenerationReceiptV1(value: unknown): value is CalibrationRegisterGenerationReceiptV1 {
  if (!isRecord(value) || !exactKeys(value, ['version', 'receiptId', 'generation', 'deltaId', 'sourceGenerationSha256s', 'parentRegisterSha256', 'nextRegisterSha256', 'lockSha256', 'transactionId', 'toolReceiptSha256', 'receiptSha256'])) return false;
  if (value.version !== 'v10.3-register-generation-receipt-v1' || !id(value.receiptId) || !safeGeneration(value.generation)
    || !id(value.deltaId) || !Array.isArray(value.sourceGenerationSha256s)
    || (value.sourceGenerationSha256s.length !== 1 && value.sourceGenerationSha256s.length !== 2)
    || !value.sourceGenerationSha256s.every(sha) || !sha(value.parentRegisterSha256) || !sha(value.nextRegisterSha256)
    || !sha(value.lockSha256) || !id(value.transactionId) || !sha(value.toolReceiptSha256) || !sha(value.receiptSha256)
    || value.parentRegisterSha256 === value.nextRegisterSha256) return false;
  if (!unique(value.sourceGenerationSha256s)) return false;
  try { return calibrationRegisterGenerationReceiptSha256(value) === value.receiptSha256; } catch { return false; }
}

export function isCalibrationRegisterGenerationLockV1(value: unknown): value is CalibrationRegisterGenerationLockV1 {
  if (!isRecord(value) || !exactKeys(value, ['version', 'lockId', 'intendedTransactionId', 'invocationIntentId', 'expectedCurrentRegisterSha256', 'nextRegisterSha256', 'deltaId', 'recoveryNonce', 'lockSha256'])) return false;
  if (value.version !== 'v10.3-register-generation-lock-v1' || !id(value.lockId) || !id(value.intendedTransactionId)
    || !sha(value.invocationIntentId) || !sha(value.expectedCurrentRegisterSha256) || !sha(value.nextRegisterSha256)
    || !id(value.deltaId) || !sha(value.recoveryNonce) || !sha(value.lockSha256)
    || value.expectedCurrentRegisterSha256 === value.nextRegisterSha256) return false;
  try { return calibrationRegisterGenerationLockSha256(value) === value.lockSha256; } catch { return false; }
}

function state(value: unknown): boolean {
  if (!isRecord(value) || typeof value.phase !== 'string' || !PHASES.has(value.phase)) return false;
  if (value.phase === 'tool_receipt_indexed') return exactKeys(value, ['phase', 'toolReceiptId', 'toolReceiptSha256', 'toolAuthorityIndexSha256', 'toolAuthorityPublicationTransactionId'])
    && id(value.toolReceiptId) && sha(value.toolReceiptSha256) && sha(value.toolAuthorityIndexSha256) && id(value.toolAuthorityPublicationTransactionId);
  if (value.phase === 'generation_receipt_staged_fsynced' || value.phase === 'generation_receipt_promoted' || value.phase === 'receipt_directories_fsynced' || value.phase === 'complete') {
    return exactKeys(value, ['phase', 'toolReceiptId', 'toolReceiptSha256', 'toolAuthorityIndexSha256', 'toolAuthorityPublicationTransactionId', 'generationReceiptId', 'generationReceiptSha256', 'generationReceiptTemporaryRelativePath', 'generationReceiptFinalRelativePath'])
      && id(value.toolReceiptId) && sha(value.toolReceiptSha256) && sha(value.toolAuthorityIndexSha256) && id(value.toolAuthorityPublicationTransactionId)
      && id(value.generationReceiptId) && sha(value.generationReceiptSha256) && relativePath(value.generationReceiptTemporaryRelativePath)
      && relativePath(value.generationReceiptFinalRelativePath) && value.generationReceiptTemporaryRelativePath !== value.generationReceiptFinalRelativePath;
  }
  return exactKeys(value, ['phase']);
}

export function isCalibrationRegisterGenerationTransactionV1(value: unknown): value is CalibrationRegisterGenerationTransactionV1 {
  if (!isRecord(value) || !exactKeys(value, ['version', 'transactionId', 'lockSha256', 'invocationIntentId', 'expectedCurrentRegisterSha256', 'nextRegisterSha256', 'deltaId', 'sourceGenerations', 'immutableGenerationRelativePath', 'currentRegisterTemporaryRelativePath', 'state', 'transactionSha256'])) return false;
  if (value.version !== 'v10.3-register-generation-transaction-v1' || !id(value.transactionId) || !sha(value.lockSha256)
    || !sha(value.invocationIntentId) || !sha(value.expectedCurrentRegisterSha256) || !sha(value.nextRegisterSha256)
    || !id(value.deltaId) || !Array.isArray(value.sourceGenerations)
    || (value.sourceGenerations.length !== 1 && value.sourceGenerations.length !== 2)
    || !value.sourceGenerations.every(sourceGeneration) || !relativePath(value.immutableGenerationRelativePath)
    || !relativePath(value.currentRegisterTemporaryRelativePath) || !state(value.state) || !sha(value.transactionSha256)
    || value.expectedCurrentRegisterSha256 === value.nextRegisterSha256) return false;
  const sourceIds = value.sourceGenerations.map((entry) => entry.sourceId);
  if (!sortedUnique(sourceIds, id)) return false;
  const statePaths = isRecord(value.state) && ('generationReceiptTemporaryRelativePath' in value.state || 'generationReceiptFinalRelativePath' in value.state)
    ? [value.state.generationReceiptTemporaryRelativePath, value.state.generationReceiptFinalRelativePath]
    : [];
  const allPaths = [
    ...value.sourceGenerations.flatMap((entry) => [
      entry.generationStagingRelativePath,
      entry.generationFinalRelativePath,
      entry.generationsParentRelativePath,
      ...(entry.priorGenerationRelativePath === undefined ? [] : [entry.priorGenerationRelativePath]),
      entry.currentPointerTemporaryRelativePath,
      entry.currentPointerFinalRelativePath,
    ]),
    value.immutableGenerationRelativePath,
    value.currentRegisterTemporaryRelativePath,
    ...statePaths,
  ];
  if (new Set(allPaths).size !== allPaths.length) return false;
  if (value.immutableGenerationRelativePath !== `register-generations/${value.nextRegisterSha256}/register.json`
    || value.currentRegisterTemporaryRelativePath === value.immutableGenerationRelativePath) return false;
  if (isRecord(value.state) && ('generationReceiptTemporaryRelativePath' in value.state || 'generationReceiptFinalRelativePath' in value.state)) {
    if (typeof value.state.generationReceiptTemporaryRelativePath !== 'string' || typeof value.state.generationReceiptFinalRelativePath !== 'string'
      || value.state.generationReceiptFinalRelativePath !== `register-generations/receipts/${value.state.generationReceiptId}.json`
      || value.state.generationReceiptTemporaryRelativePath !== `transactions/${value.transactionId}/generation-receipt.tmp.json`
      || value.state.generationReceiptTemporaryRelativePath === value.state.generationReceiptFinalRelativePath) return false;
  }
  try { return calibrationRegisterGenerationTransactionSha256(value) === value.transactionSha256; } catch { return false; }
}

export interface CalibrationRegisterGenerationGraphValidationV1 {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

/** Validate the one-way delta -> lock -> transaction -> receipt handoff. */
export function validateCalibrationRegisterGenerationGraph(
  deltaValue: unknown,
  lockValue: unknown,
  transactionValue: unknown,
  receiptValue: unknown,
): CalibrationRegisterGenerationGraphValidationV1 {
  const errors: string[] = [];
  const delta = isCalibrationAdmissionRegisterDeltaV1(deltaValue) ? deltaValue : undefined;
  const lock = isCalibrationRegisterGenerationLockV1(lockValue) ? lockValue : undefined;
  const transaction = isCalibrationRegisterGenerationTransactionV1(transactionValue) ? transactionValue : undefined;
  const receipt = isCalibrationRegisterGenerationReceiptV1(receiptValue) ? receiptValue : undefined;
  if (!delta) errors.push('invalid register delta');
  if (!lock) errors.push('invalid register generation lock');
  if (!transaction) errors.push('invalid register generation transaction');
  if (!receipt) errors.push('invalid register generation receipt');
  if (!delta || !lock || !transaction || !receipt) return { ok: false, errors };
  if (lock.deltaId !== delta.deltaId || lock.expectedCurrentRegisterSha256 !== delta.parentRegisterSha256) errors.push('lock does not bind delta parent or ID');
  if (transaction.lockSha256 !== calibrationRegisterGenerationLockSha256(lock) || transaction.transactionId !== lock.intendedTransactionId) errors.push('transaction does not bind lock identity');
  if (transaction.deltaId !== delta.deltaId || transaction.expectedCurrentRegisterSha256 !== delta.parentRegisterSha256 || transaction.nextRegisterSha256 === transaction.expectedCurrentRegisterSha256) errors.push('transaction does not bind delta register transition');
  if (transaction.sourceGenerations.length !== delta.addedSources.length) errors.push('transaction source-generation count does not match delta');
  const deltaSourceIds = delta.addedSources.map((source) => source.sourceId);
  const txSourceIds = transaction.sourceGenerations.map((source) => source.sourceId);
  if (deltaSourceIds.length !== txSourceIds.length || deltaSourceIds.some((sourceId, index) => sourceId !== txSourceIds[index])) errors.push('transaction source-generation IDs do not match delta');
  if (receipt.generation !== delta.generation || receipt.deltaId !== delta.deltaId || receipt.parentRegisterSha256 !== delta.parentRegisterSha256) errors.push('receipt does not bind delta generation/parent');
  if (receipt.lockSha256 !== calibrationRegisterGenerationLockSha256(lock) || receipt.transactionId !== transaction.transactionId) errors.push('receipt does not bind lock/transaction');
  if (receipt.sourceGenerationSha256s.length !== transaction.sourceGenerations.length
    || receipt.sourceGenerationSha256s.some((hash, index) => hash !== transaction.sourceGenerations[index]?.generationSha256)) errors.push('receipt source-generation hashes do not match transaction');
  if (delta.addedSources.length !== transaction.sourceGenerations.length
    || delta.addedSources.some((source, index) => source.sourceGenerationSha256 !== transaction.sourceGenerations[index]?.generationSha256)) errors.push('transaction source-generation hashes do not match delta');
  if (delta.addedSources.length !== receipt.sourceGenerationSha256s.length
    || delta.addedSources.some((source, index) => source.sourceGenerationSha256 !== receipt.sourceGenerationSha256s[index])) errors.push('receipt source-generation hashes do not match delta');
  if (receipt.nextRegisterSha256 !== transaction.nextRegisterSha256) errors.push('receipt next-register hash does not match transaction');
  if (lock.nextRegisterSha256 !== transaction.nextRegisterSha256 || lock.invocationIntentId !== transaction.invocationIntentId) errors.push('lock does not bind transaction next-register or invocation intent');
  const transactionState = transaction.state;
  if (!isRecord(transactionState) || transactionState.phase !== 'complete') {
    errors.push('generation receipt requires a complete receipt-bearing transaction phase');
  } else {
    if (receipt.toolReceiptSha256 !== transactionState.toolReceiptSha256) errors.push('receipt tool hash does not match transaction phase');
    if (receipt.receiptId !== transactionState.generationReceiptId) errors.push('receipt ID does not match transaction phase');
    if (receipt.receiptSha256 !== transactionState.generationReceiptSha256) errors.push('receipt hash does not match transaction phase');
    if (!transactionState.generationReceiptFinalRelativePath.endsWith(`/${receipt.receiptId}.json`)) errors.push('receipt final path does not bind receipt ID');
    if (!transactionState.generationReceiptTemporaryRelativePath.includes(transaction.transactionId)) errors.push('receipt temporary path does not bind transaction ID');
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}
