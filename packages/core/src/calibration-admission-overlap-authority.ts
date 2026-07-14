import { calibrationAdmissionSha256 } from './calibration-admission-evidence';
import { isCalibrationAdmissionToolAuthoritySnapshotV1 } from './calibration-admission-evidence';
import type { CalibrationAdmissionArtifactReceiptV1 } from './generated/calibration-admission-artifact-receipt';
import type { AdmissionOverlapCurrentV1 } from './generated/calibration-admission-overlap-current';
import type { AdmissionOverlapGenerationV1 } from './generated/calibration-admission-overlap-generation';
import type { AdmissionOverlapPublicationLockV1 } from './generated/calibration-admission-overlap-publication-lock';
import type { AdmissionOverlapPublicationTransactionV1 } from './generated/calibration-admission-overlap-publication-transaction';
import {
  exactKeys,
  isAdmissionId,
  isJsonRecord,
  isSha256,
  sortedUniqueByPredicate,
  withoutJsonKey,
} from './calibration-admission-primitives';

/** Pure semantic contracts for overlap generations and their recovery records. */

export interface AdmissionOverlapAuthorityValidationV1 {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

type JsonObject = Record<string, unknown>;
type ExpectedCurrentState = AdmissionOverlapPublicationLockV1['expectedCurrentState'];
type PrimaryArtifact = {
  readonly generationLocalRelativePath: string;
  readonly stagedRelativePath: string;
  readonly bytes: number;
  readonly sha256: string;
};
type Projection = {
  readonly stagedRelativePath: string;
  readonly finalRelativePath: string;
  readonly priorGenerationRelativePath?: string;
  readonly bytes: number;
  readonly sha256: string;
};

const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const MAX_ITEMS = 65_536;
const RELATIVE_PATH = /^(?!\/)(?!.*\\)(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*\/\/)(?!.*\/$)[^\u0000-\u001f]+$/;
const OVERLAP_ROOT = 'review/admission/global/overlap';
const GENERATIONS_ROOT = `${OVERLAP_ROOT}/generations`;
const CURRENT_FINAL = `${OVERLAP_ROOT}/current-generation.json`;

function result(errors: readonly string[]): AdmissionOverlapAuthorityValidationV1 {
  return { ok: errors.length === 0, errors: [...errors] };
}

function safeInteger(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= MAX_SAFE;
}

function relativePath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 4096 && RELATIVE_PATH.test(value);
}

function hashWithout(value: unknown, key: string): string {
  return calibrationAdmissionSha256(withoutJsonKey(value, key));
}

function expectedCurrentState(value: unknown): value is ExpectedCurrentState {
  if (!isJsonRecord(value)) return false;
  if (value.kind === 'absent') return exactKeys(value, ['kind']);
  return value.kind === 'existing' && exactKeys(value, ['kind', 'generationSha256']) && isSha256(value.generationSha256);
}

function overlapArtifactPath(kind: string, path: string): boolean {
  const leaf = path.slice(path.lastIndexOf('/') + 1);
  const rootLeaf = path === leaf;
  switch (kind) {
    case 'shard':
      return /^(postings|pairs|edges|adjacency)\/.+\.(json|jsonl|ndjson)$/.test(path)
        || /^clusters\/(summaries|memberships)\/.+\.(json|jsonl|ndjson)$/.test(path);
    case 'checkpoint': return path.startsWith('checkpoints/') && leaf.endsWith('.json');
    case 'index': return (rootLeaf && (leaf === 'index.json' || leaf === 'overlap-index.json' || leaf === 'overlap-index-receipt.json')) || path.startsWith('indexes/');
    case 'receipt': return rootLeaf && /(?:^|-)receipt\.json$/.test(leaf);
    case 'ledger': return rootLeaf && /(?:^|-)ledger\.json(?:l)?$/.test(leaf);
    case 'current_pointer': return rootLeaf && leaf === 'current-generation.json';
    case 'overlap_universe': return rootLeaf && leaf === 'overlap-universe.json';
    case 'overlap_universe_stream': return rootLeaf && leaf === 'overlap-universe-records.jsonl';
    default: return false;
  }
}

/**
 * The generic admission-artifact schema is intentionally shared with source
 * generations.  Overlap generations add their own bounded directory grammar
 * so a `shards/` receipt cannot be substituted for a `postings/` or `edges/`
 * output while retaining the common receipt shape.
 */
function overlapArtifact(value: unknown): value is CalibrationAdmissionArtifactReceiptV1 {
  if (!isJsonRecord(value) || !exactKeys(value, ['pathBase', 'relativePath', 'kind', 'bytes', 'sha256'])) return false;
  if (value.pathBase !== 'generation_local' || !relativePath(value.relativePath)
    || !safeInteger(value.bytes) || !isSha256(value.sha256) || typeof value.kind !== 'string') return false;
  return overlapArtifactPath(value.kind, value.relativePath);
}

function sortedArtifacts(value: unknown): value is readonly CalibrationAdmissionArtifactReceiptV1[] {
  if (!Array.isArray(value) || value.length > MAX_ITEMS || !value.every(overlapArtifact)) return false;
  const identities = value.map((entry) => `${entry.pathBase}\u0000${entry.relativePath}`);
  if (new Set(identities).size !== identities.length) return false;
  const keys = value.map((entry) => `${entry.pathBase}\u0000${entry.relativePath}\u0000${entry.kind}\u0000${entry.sha256}`);
  return sortedUniqueByPredicate(keys, (entry) => typeof entry === 'string', true);
}

function sortedPrimaryArtifacts(value: unknown): value is readonly PrimaryArtifact[] {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) return false;
  if (!value.every((entry) => {
    if (!isJsonRecord(entry) || !exactKeys(entry, ['generationLocalRelativePath', 'stagedRelativePath', 'bytes', 'sha256'])) return false;
    return relativePath(entry.generationLocalRelativePath) && relativePath(entry.stagedRelativePath)
      && safeInteger(entry.bytes) && isSha256(entry.sha256);
  })) return false;
  const paths = value.map((entry) => String((entry as JsonObject).generationLocalRelativePath));
  return sortedUniqueByPredicate(paths, (entry) => typeof entry === 'string', true);
}

function sortedProjections(value: unknown): value is readonly Projection[] {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) return false;
  if (!value.every((entry) => {
    if (!isJsonRecord(entry) || !exactKeys(entry, [
      'stagedRelativePath', 'finalRelativePath', 'bytes', 'sha256',
      ...(entry.priorGenerationRelativePath === undefined ? [] : ['priorGenerationRelativePath']),
    ])) return false;
    return relativePath(entry.stagedRelativePath) && relativePath(entry.finalRelativePath)
      && (entry.priorGenerationRelativePath === undefined || relativePath(entry.priorGenerationRelativePath))
      && safeInteger(entry.bytes) && isSha256(entry.sha256);
  })) return false;
  const paths = value.map((entry) => String((entry as JsonObject).finalRelativePath));
  return sortedUniqueByPredicate(paths, (entry) => typeof entry === 'string', true);
}

function state(value: unknown): boolean {
  if (!isJsonRecord(value) || typeof value.phase !== 'string') return false;
  if (value.phase === 'intent_fsynced') return exactKeys(value, ['phase']);
  if (value.phase === 'primary_outputs_staged_fsynced') {
    return exactKeys(value, ['phase', 'primaryOutputSetSha256', 'primaryArtifacts'])
      && isSha256(value.primaryOutputSetSha256) && sortedPrimaryArtifacts(value.primaryArtifacts);
  }
  if (value.phase === 'tool_receipt_indexed') {
    return exactKeys(value, ['phase', 'primaryOutputSetSha256', 'toolReceiptId', 'toolReceiptSha256', 'toolAuthorityIndexSha256'])
      && isSha256(value.primaryOutputSetSha256) && isAdmissionId(value.toolReceiptId)
      && isSha256(value.toolReceiptSha256) && isSha256(value.toolAuthorityIndexSha256);
  }
  const published = new Set([
    'generation_directory_staged_fsynced',
    'generation_directory_promoted',
    'generations_parent_fsynced',
    'current_output_projections_staged_fsynced',
    'current_output_projections_promoted',
    'current_generation_promoted',
    'output_directories_fsynced',
    'complete',
  ]);
  if (!published.has(value.phase)) return false;
  return exactKeys(value, [
    'phase', 'primaryOutputSetSha256', 'toolReceiptId', 'toolReceiptSha256',
    'toolAuthorityIndexSha256', 'nextGenerationSha256', 'generationDirectoryFinalRelativePath',
    'artifactSetSha256', 'generationArtifacts', 'currentOutputProjections',
  ]) && isSha256(value.primaryOutputSetSha256) && isAdmissionId(value.toolReceiptId)
    && isSha256(value.toolReceiptSha256) && isSha256(value.toolAuthorityIndexSha256)
    && isSha256(value.nextGenerationSha256) && relativePath(value.generationDirectoryFinalRelativePath)
    && isSha256(value.artifactSetSha256) && sortedPrimaryArtifacts(value.generationArtifacts)
    && sortedProjections(value.currentOutputProjections)
    && value.generationDirectoryFinalRelativePath === `${GENERATIONS_ROOT}/${value.nextGenerationSha256}`;
}

export function calibrationAdmissionOverlapGenerationArtifactSetSha256(
  artifacts: readonly CalibrationAdmissionArtifactReceiptV1[],
): string {
  return calibrationAdmissionSha256(artifacts);
}

export function calibrationAdmissionOverlapGenerationSha256(
  value: Omit<AdmissionOverlapGenerationV1, 'generationSha256'> | JsonObject,
): string { return hashWithout(value, 'generationSha256'); }

export function calibrationAdmissionOverlapCurrentSha256(
  value: Omit<AdmissionOverlapCurrentV1, 'currentSha256'> | JsonObject,
): string { return hashWithout(value, 'currentSha256'); }

export function calibrationAdmissionOverlapPublicationLockSha256(
  value: Omit<AdmissionOverlapPublicationLockV1, 'lockSha256'> | JsonObject,
): string { return hashWithout(value, 'lockSha256'); }

export function calibrationAdmissionOverlapPublicationTransactionSha256(
  value: Omit<AdmissionOverlapPublicationTransactionV1, 'transactionSha256'> | JsonObject,
): string { return hashWithout(value, 'transactionSha256'); }

export function validateCalibrationAdmissionOverlapGenerationV1(value: unknown): AdmissionOverlapAuthorityValidationV1 {
  const errors: string[] = [];
  if (!isJsonRecord(value)) return result(['overlap generation is not an object']);
  const keys = ['version', 'generation', ...(value.parentGenerationSha256 === undefined ? [] : ['parentGenerationSha256']), 'inputGenerationSha256', 'universeSha256', 'overlapPolicySha256', 'artifactSetSha256', 'artifacts', 'toolAuthoritySnapshot', 'generationSha256'];
  if (!exactKeys(value, keys)) errors.push('overlap generation object shape is invalid');
  if (value.version !== 'v10.3-admission-overlap-generation-v1') errors.push('overlap generation version is invalid');
  if (!safeInteger(value.generation)) errors.push('overlap generation number is invalid');
  if (value.parentGenerationSha256 !== undefined && !isSha256(value.parentGenerationSha256)) errors.push('parentGenerationSha256 is invalid');
  if (safeInteger(value.generation) && ((value.generation === 0 && value.parentGenerationSha256 !== undefined) || (value.generation > 0 && value.parentGenerationSha256 === undefined))) errors.push('generation parent does not match generation number');
  for (const key of ['inputGenerationSha256', 'universeSha256', 'overlapPolicySha256', 'artifactSetSha256', 'generationSha256']) if (!isSha256(value[key])) errors.push(`${key} is invalid`);
  if (!sortedArtifacts(value.artifacts)) errors.push('overlap generation artifacts are invalid, duplicated, or unsorted');
  if (!isCalibrationAdmissionToolAuthoritySnapshotV1(value.toolAuthoritySnapshot)) errors.push('tool authority snapshot is invalid');
  try {
    if (sortedArtifacts(value.artifacts) && calibrationAdmissionOverlapGenerationArtifactSetSha256(value.artifacts) !== value.artifactSetSha256) errors.push('artifactSetSha256 does not match artifacts');
    if (isSha256(value.generationSha256) && calibrationAdmissionOverlapGenerationSha256(value) !== value.generationSha256) errors.push('generationSha256 does not match canonical bytes');
  } catch { errors.push('overlap generation hashes cannot be recomputed'); }
  return result(errors);
}

export function isCalibrationAdmissionOverlapGenerationV1(value: unknown): value is AdmissionOverlapGenerationV1 {
  return validateCalibrationAdmissionOverlapGenerationV1(value).ok;
}

export function validateCalibrationAdmissionOverlapCurrentV1(value: unknown): AdmissionOverlapAuthorityValidationV1 {
  const errors: string[] = [];
  if (!isJsonRecord(value) || !exactKeys(value, ['version', 'generation', 'generationSha256', 'generationRelativePath', 'currentSha256'])) return result(['overlap current pointer shape is invalid']);
  if (value.version !== 'v10.3-admission-overlap-current-v1') errors.push('overlap current version is invalid');
  if (!safeInteger(value.generation)) errors.push('overlap current generation is invalid');
  if (!isSha256(value.generationSha256) || !isSha256(value.currentSha256)) errors.push('overlap current hashes are invalid');
  if (!relativePath(value.generationRelativePath) || value.generationRelativePath !== `${GENERATIONS_ROOT}/${value.generationSha256}`) errors.push('overlap current generation path is invalid');
  try { if (isSha256(value.currentSha256) && calibrationAdmissionOverlapCurrentSha256(value) !== value.currentSha256) errors.push('currentSha256 does not match canonical bytes'); } catch { errors.push('currentSha256 cannot be recomputed'); }
  return result(errors);
}

export function isCalibrationAdmissionOverlapCurrentV1(value: unknown): value is AdmissionOverlapCurrentV1 {
  return validateCalibrationAdmissionOverlapCurrentV1(value).ok;
}

function validatePublicationIdentity(value: JsonObject, errors: string[], kind: 'lock' | 'transaction'): void {
  const keys = kind === 'lock'
    ? ['version', 'lockId', 'intendedTransactionId', 'invocationIntentId', 'inputGenerationSha256', 'universeSha256', 'normalizerRegistrySha256', 'overlapPolicySha256', 'operation', 'expectedCurrentState', 'recoveryNonce', 'lockSha256']
    : ['version', 'transactionId', 'lockSha256', 'invocationIntentId', 'inputGenerationSha256', 'universeSha256', 'normalizerRegistrySha256', 'overlapPolicySha256', 'operation', 'expectedCurrentState', 'recoveryNonce', 'generationStagingRelativePath', 'currentGenerationTemporaryRelativePath', 'currentGenerationFinalRelativePath', 'state', 'transactionSha256'];
  if (!exactKeys(value, keys)) errors.push(`${kind} object shape is invalid`);
  const ids = kind === 'lock' ? ['lockId', 'intendedTransactionId'] : ['transactionId'];
  for (const key of ids) if (!isAdmissionId(value[key])) errors.push(`${key} is invalid`);
  const hashes = kind === 'lock'
    ? ['invocationIntentId', 'inputGenerationSha256', 'universeSha256', 'normalizerRegistrySha256', 'overlapPolicySha256', 'recoveryNonce', 'lockSha256']
    : ['lockSha256', 'invocationIntentId', 'inputGenerationSha256', 'universeSha256', 'normalizerRegistrySha256', 'overlapPolicySha256', 'recoveryNonce', 'transactionSha256'];
  for (const key of hashes) {
    if (!isSha256(value[key])) errors.push(`${key} is invalid`);
  }
  if (value.operation !== 'create' && value.operation !== 'replace') errors.push('operation is invalid');
  if (!expectedCurrentState(value.expectedCurrentState)) errors.push('expectedCurrentState is invalid');
  else if (value.operation === 'create' && value.expectedCurrentState.kind !== 'absent') errors.push('create operation must expect an absent current pointer');
  else if (value.operation === 'replace' && value.expectedCurrentState.kind !== 'existing') errors.push('replace operation must expect an existing current pointer');
}

export function validateCalibrationAdmissionOverlapPublicationLockV1(value: unknown): AdmissionOverlapAuthorityValidationV1 {
  const errors: string[] = [];
  if (!isJsonRecord(value)) return result(['overlap publication lock is not an object']);
  validatePublicationIdentity(value, errors, 'lock');
  try { if (isSha256(value.lockSha256) && calibrationAdmissionOverlapPublicationLockSha256(value) !== value.lockSha256) errors.push('lockSha256 does not match canonical bytes'); } catch { errors.push('lockSha256 cannot be recomputed'); }
  return result(errors);
}

export function isCalibrationAdmissionOverlapPublicationLockV1(value: unknown): value is AdmissionOverlapPublicationLockV1 {
  return validateCalibrationAdmissionOverlapPublicationLockV1(value).ok;
}

export function validateCalibrationAdmissionOverlapPublicationTransactionV1(value: unknown): AdmissionOverlapAuthorityValidationV1 {
  const errors: string[] = [];
  if (!isJsonRecord(value)) return result(['overlap publication transaction is not an object']);
  validatePublicationIdentity(value, errors, 'transaction');
  if (!relativePath(value.generationStagingRelativePath)) errors.push('generationStagingRelativePath is invalid');
  if (!relativePath(value.currentGenerationTemporaryRelativePath) || value.currentGenerationTemporaryRelativePath === CURRENT_FINAL) errors.push('currentGenerationTemporaryRelativePath is invalid');
  if (value.currentGenerationFinalRelativePath !== CURRENT_FINAL) errors.push('currentGenerationFinalRelativePath is invalid');
  if (!state(value.state)) errors.push('transaction state is invalid');
  try { if (isSha256(value.transactionSha256) && calibrationAdmissionOverlapPublicationTransactionSha256(value) !== value.transactionSha256) errors.push('transactionSha256 does not match canonical bytes'); } catch { errors.push('transactionSha256 cannot be recomputed'); }
  return result(errors);
}

export function isCalibrationAdmissionOverlapPublicationTransactionV1(value: unknown): value is AdmissionOverlapPublicationTransactionV1 {
  return validateCalibrationAdmissionOverlapPublicationTransactionV1(value).ok;
}
