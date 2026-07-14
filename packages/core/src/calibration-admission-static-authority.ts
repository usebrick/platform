import type { CalibrationAdmissionArtifactReceiptV1 } from './generated/calibration-admission-artifact-receipt';
import type { CalibrationAdmissionAuthorityCurrentV1 } from './generated/calibration-admission-authority-current';
import type { CalibrationAdmissionInputGenerationProposalV1 } from './generated/calibration-admission-input-generation-proposal';
import type { CalibrationAdmissionInputGenerationV1 } from './generated/calibration-admission-input-generation';
import type { CalibrationAdmissionStaticAuthorityGenerationV1 } from './generated/calibration-admission-static-authority-generation';
import type { CalibrationAdmissionToolAuthoritySnapshotV1 } from './generated/calibration-admission-tool-authority-snapshot';
import { isCalibrationAdmissionToolAuthoritySnapshotV1 } from './calibration-admission-evidence';
import { calibrationAdmissionSha256 } from './calibration-admission-evidence';
import {
  exactKeys,
  isAdmissionId,
  isJsonRecord,
  isSha256,
  sortedUniqueByPredicate,
  withoutJsonKey,
} from './calibration-admission-primitives';
import { isCalibrationAdmissionArtifactReceiptV1 } from './calibration-admission-source-generation';

export type {
  CalibrationAdmissionAuthorityCurrentV1,
  CalibrationAdmissionInputGenerationProposalV1,
  CalibrationAdmissionInputGenerationV1,
  CalibrationAdmissionStaticAuthorityGenerationV1,
  CalibrationAdmissionToolAuthoritySnapshotV1,
};

export interface CalibrationAdmissionStaticAuthorityValidationV1 {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

const AUTHORITY_ROOT = 'review/admission/authority';
const STATIC_GENERATIONS_ROOT = `${AUTHORITY_ROOT}/static-generations`;
const SOURCE_GENERATIONS_ROOT = 'review/admission/sources';
const SAFE_RELATIVE_PATH = /^(?!\/)(?!.*\\)(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*\/\/)(?!.*\/$)[^\u0000-\u001f]+$/;
const MAX_SOURCE_REFERENCES = 452382;
const MAX_GENERATION_ARTIFACTS = 65536;

function result(errors: readonly string[]): CalibrationAdmissionStaticAuthorityValidationV1 {
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

function safeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function relativePath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 4096 && SAFE_RELATIVE_PATH.test(value);
}

function hashWithout(value: unknown, key: string): string {
  return calibrationAdmissionSha256(withoutJsonKey(value, key));
}

function expectedCurrentState(value: unknown): value is { readonly kind: 'absent' } | { readonly kind: 'existing'; readonly staticGenerationSha256: string } {
  if (!isJsonRecord(value)) return false;
  if (value.kind === 'absent') return exactKeys(value, ['kind']);
  return value.kind === 'existing'
    && exactKeys(value, ['kind', 'staticGenerationSha256'])
    && isSha256(value.staticGenerationSha256);
}

function artifactPathMatches(kind: string, relative: string): boolean {
  const leaf = relative.slice(relative.lastIndexOf('/') + 1);
  const rootLeaf = relative === leaf;
  switch (kind) {
    case 'record_stream': return rootLeaf && leaf === 'admission-records.jsonl';
    case 'overlap_universe': return rootLeaf && leaf === 'overlap-universe.json';
    case 'overlap_universe_stream': return rootLeaf && leaf === 'overlap-universe-records.jsonl';
    case 'ledger': return rootLeaf && (leaf === 'ledger.json' || leaf.endsWith('-ledger.json') || leaf.endsWith('-ledger.jsonl'));
    case 'bundle': return rootLeaf && (leaf === 'bundle.json' || leaf.endsWith('-bundle.json'));
    case 'receipt': return rootLeaf && (leaf === 'receipt.json' || leaf.endsWith('-receipt.json'));
    case 'index': return rootLeaf && (leaf === 'index.json' || leaf.endsWith('-index.json'));
    // Mutable current projections are never generation-local artifacts.
    case 'current_pointer': return false;
    default: return isCalibrationAdmissionArtifactReceiptV1({ pathBase: 'generation_local', relativePath: relative, kind, bytes: 0, sha256: 'a'.repeat(64) });
  }
}

function authorityArtifact(value: unknown): value is CalibrationAdmissionArtifactReceiptV1 {
  if (!isCalibrationAdmissionArtifactReceiptV1(value) || value.pathBase !== 'generation_local') return false;
  return artifactPathMatches(value.kind, value.relativePath);
}

function sortedAuthorityArtifacts(value: unknown, allowEmpty = false): value is readonly CalibrationAdmissionArtifactReceiptV1[] {
  if (!Array.isArray(value) || value.length > MAX_GENERATION_ARTIFACTS || (!allowEmpty && value.length === 0) || !value.every(authorityArtifact)) return false;
  const identities = value.map((entry) => `${entry.pathBase}\u0000${entry.relativePath}`);
  if (new Set(identities).size !== identities.length) return false;
  const keys = value.map((entry) => `${entry.pathBase}\u0000${entry.relativePath}\u0000${entry.kind}\u0000${entry.sha256}`);
  return sortedUniqueByPredicate(keys, (entry) => typeof entry === 'string', true);
}

function sourceProposal(value: unknown): boolean {
  if (!isJsonRecord(value)) return false;
  const keys = ['sourceId', 'proposalId', 'proposalRelativePath', 'proposalSha256', ...(value.approvalRelativePath === undefined ? [] : ['approvalRelativePath']), ...(value.approvalSha256 === undefined ? [] : ['approvalSha256'])];
  if (!exactKeys(value, keys) || !isAdmissionId(value.sourceId) || !isAdmissionId(value.proposalId)
    || !relativePath(value.proposalRelativePath) || !isSha256(value.proposalSha256)) return false;
  const expectedProposalPath = `${SOURCE_GENERATIONS_ROOT}/${value.sourceId}/proposals/${value.proposalId}.json`;
  if (value.proposalRelativePath !== expectedProposalPath) return false;
  const hasApprovalPath = value.approvalRelativePath !== undefined;
  const hasApprovalHash = value.approvalSha256 !== undefined;
  if (hasApprovalPath !== hasApprovalHash) return false;
  if (hasApprovalPath && (!relativePath(value.approvalRelativePath) || !isSha256(value.approvalSha256)
    || value.approvalRelativePath !== `${SOURCE_GENERATIONS_ROOT}/${value.sourceId}/proposals/${value.proposalId}-approval.json`)) return false;
  return true;
}

function sortedSourceProposals(value: unknown): value is readonly Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SOURCE_REFERENCES || !value.every(sourceProposal)) return false;
  return sortedUniqueByPredicate(value.map((entry) => String((entry as Record<string, unknown>).sourceId)), isAdmissionId, true);
}

function inputArtifact(value: unknown, expectedKind: string, expectedPath: string): boolean {
  return authorityArtifact(value)
    && value.kind === expectedKind
    && value.relativePath === expectedPath;
}

function sourceGeneration(value: unknown): boolean {
  if (!isJsonRecord(value) || !exactKeys(value, ['sourceId', 'generationSha256', 'relativePath', 'artifactSetSha256'])) return false;
  if (!isAdmissionId(value.sourceId) || !isSha256(value.generationSha256) || !isSha256(value.artifactSetSha256) || !relativePath(value.relativePath)) return false;
  return value.relativePath === `${SOURCE_GENERATIONS_ROOT}/${value.sourceId}/generations/${value.generationSha256}`;
}

function sortedSourceGenerations(value: unknown): value is readonly Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SOURCE_REFERENCES || !value.every(sourceGeneration)) return false;
  return sortedUniqueByPredicate(value.map((entry) => String((entry as Record<string, unknown>).sourceId)), isAdmissionId, true);
}

export function calibrationAdmissionInputGenerationProposalSha256(
  value: Omit<CalibrationAdmissionInputGenerationProposalV1, 'proposalSha256'> | Record<string, unknown>,
): string {
  return hashWithout(value, 'proposalSha256');
}

export function calibrationAdmissionInputGenerationSha256(
  value: Omit<CalibrationAdmissionInputGenerationV1, 'generationSha256'> | Record<string, unknown>,
): string {
  return hashWithout(value, 'generationSha256');
}

export function calibrationAdmissionStaticAuthorityGenerationSha256(
  value: Omit<CalibrationAdmissionStaticAuthorityGenerationV1, 'generationSha256'> | Record<string, unknown>,
): string {
  return hashWithout(value, 'generationSha256');
}

export function calibrationAdmissionAuthorityCurrentSha256(
  value: Omit<CalibrationAdmissionAuthorityCurrentV1, 'currentSha256'> | Record<string, unknown>,
): string {
  return hashWithout(value, 'currentSha256');
}

export function validateCalibrationAdmissionInputGenerationProposalV1(value: unknown): CalibrationAdmissionStaticAuthorityValidationV1 {
  const errors: string[] = [];
  if (!isJsonRecord(value)) return result(['input-generation proposal is not an object']);
  const keys = ['version', 'proposalId', 'operation', 'expectedCurrentState', 'evidenceBundleSha256', 'sourceGenerationProposals', 'admissionRecordStream', 'overlapUniverse', 'overlapUniverseRecords', 'proposalSha256'];
  if (!exactKeys(value, keys)) errors.push('input-generation proposal object shape is invalid');
  if (value.version !== 'v10.3-admission-input-generation-proposal-v1') errors.push('input-generation proposal version is invalid');
  if (!isAdmissionId(value.proposalId)) errors.push('input-generation proposal ID is invalid');
  if (value.operation !== 'create' && value.operation !== 'replace') errors.push('input-generation proposal operation is invalid');
  if (!expectedCurrentState(value.expectedCurrentState)) errors.push('input-generation proposal expected current state is invalid');
  if (value.operation === 'create' && isJsonRecord(value.expectedCurrentState) && value.expectedCurrentState.kind !== 'absent') errors.push('create proposal must expect an absent current pointer');
  if (value.operation === 'replace' && isJsonRecord(value.expectedCurrentState) && value.expectedCurrentState.kind !== 'existing') errors.push('replace proposal must expect an existing current pointer');
  if (!isSha256(value.evidenceBundleSha256)) errors.push('input-generation proposal evidence bundle hash is invalid');
  if (!sortedSourceProposals(value.sourceGenerationProposals)) errors.push('input-generation source proposals are invalid, duplicated, or unsorted');
  if (!inputArtifact(value.admissionRecordStream, 'record_stream', 'admission-records.jsonl')) errors.push('input-generation record-stream artifact is invalid');
  if (!inputArtifact(value.overlapUniverse, 'overlap_universe', 'overlap-universe.json')) errors.push('input-generation overlap-universe artifact is invalid');
  if (!inputArtifact(value.overlapUniverseRecords, 'overlap_universe_stream', 'overlap-universe-records.jsonl')) errors.push('input-generation overlap-universe stream artifact is invalid');
  if (!isSha256(value.proposalSha256)) errors.push('input-generation proposal self-hash is invalid');
  try {
    if (isSha256(value.proposalSha256) && calibrationAdmissionInputGenerationProposalSha256(value) !== value.proposalSha256) errors.push('input-generation proposal self-hash does not match canonical bytes');
  } catch { errors.push('input-generation proposal cannot be canonicalized'); }
  return result(errors);
}

export function isCalibrationAdmissionInputGenerationProposalV1(value: unknown): value is CalibrationAdmissionInputGenerationProposalV1 {
  return validateCalibrationAdmissionInputGenerationProposalV1(value).ok;
}

export function validateCalibrationAdmissionInputGenerationV1(value: unknown): CalibrationAdmissionStaticAuthorityValidationV1 {
  const errors: string[] = [];
  if (!isJsonRecord(value)) return result(['input generation is not an object']);
  const keys = ['version', 'generation', ...(value.parentInputGenerationSha256 === undefined ? [] : ['parentInputGenerationSha256']), 'evidenceBundleSha256', 'sourceGenerations', 'admissionRecordStreamSha256', 'overlapUniverseSha256', 'overlapUniverseRecordsSha256', 'artifacts', 'generationSha256'];
  if (!exactKeys(value, keys)) errors.push('input generation object shape is invalid');
  if (value.version !== 'v10.3-admission-input-generation-v1') errors.push('input generation version is invalid');
  if (!safeInteger(value.generation)) errors.push('input generation number is invalid');
  if (value.parentInputGenerationSha256 !== undefined && !isSha256(value.parentInputGenerationSha256)) errors.push('input generation parent hash is invalid');
  if (safeInteger(value.generation) && ((value.generation === 0 && value.parentInputGenerationSha256 !== undefined) || (value.generation > 0 && value.parentInputGenerationSha256 === undefined))) errors.push('input generation parent does not match generation number');
  if (!isSha256(value.evidenceBundleSha256) || !sortedSourceGenerations(value.sourceGenerations) || !isSha256(value.admissionRecordStreamSha256) || !isSha256(value.overlapUniverseSha256) || !isSha256(value.overlapUniverseRecordsSha256) || !sortedAuthorityArtifacts(value.artifacts) || !isSha256(value.generationSha256)) errors.push('input generation references or artifacts are invalid');
  try {
    if (isSha256(value.generationSha256) && calibrationAdmissionInputGenerationSha256(value) !== value.generationSha256) errors.push('input generation self-hash does not match canonical bytes');
  } catch { errors.push('input generation cannot be canonicalized'); }
  return result(errors);
}

export function isCalibrationAdmissionInputGenerationV1(value: unknown): value is CalibrationAdmissionInputGenerationV1 {
  return validateCalibrationAdmissionInputGenerationV1(value).ok;
}

export function validateCalibrationAdmissionStaticAuthorityGenerationV1(value: unknown): CalibrationAdmissionStaticAuthorityValidationV1 {
  const errors: string[] = [];
  if (!isJsonRecord(value)) return result(['static authority generation is not an object']);
  const keys = ['version', 'generation', ...(value.parentStaticGenerationSha256 === undefined ? [] : ['parentStaticGenerationSha256']), 'inputGenerationSha256', 'overlapGenerationSha256', 'privacyLedgerSha256', 'qualityLedgerSha256', 'lineageLedgerSha256', 'preWitnessBundleSha256', 'toolAuthoritySnapshot', 'artifacts', 'generationSha256'];
  if (!exactKeys(value, keys)) errors.push('static authority generation object shape is invalid');
  if (value.version !== 'v10.3-admission-static-authority-generation-v1') errors.push('static authority generation version is invalid');
  if (!safeInteger(value.generation)) errors.push('static authority generation number is invalid');
  if (value.parentStaticGenerationSha256 !== undefined && !isSha256(value.parentStaticGenerationSha256)) errors.push('static authority parent hash is invalid');
  if (safeInteger(value.generation) && ((value.generation === 0 && value.parentStaticGenerationSha256 !== undefined) || (value.generation > 0 && value.parentStaticGenerationSha256 === undefined))) errors.push('static authority parent does not match generation number');
  for (const key of ['inputGenerationSha256', 'overlapGenerationSha256', 'privacyLedgerSha256', 'qualityLedgerSha256', 'lineageLedgerSha256', 'preWitnessBundleSha256']) if (!isSha256(value[key])) errors.push(`${key} is invalid`);
  if (!isCalibrationAdmissionToolAuthoritySnapshotV1(value.toolAuthoritySnapshot)) errors.push('static authority tool snapshot is invalid');
  if (!sortedAuthorityArtifacts(value.artifacts)) errors.push('static authority artifacts are invalid, duplicated, or unsorted');
  if (!isSha256(value.generationSha256)) errors.push('static authority generation self-hash is invalid');
  try {
    if (isSha256(value.generationSha256) && calibrationAdmissionStaticAuthorityGenerationSha256(value) !== value.generationSha256) errors.push('static authority generation self-hash does not match canonical bytes');
  } catch { errors.push('static authority generation cannot be canonicalized'); }
  return result(errors);
}

export function isCalibrationAdmissionStaticAuthorityGenerationV1(value: unknown): value is CalibrationAdmissionStaticAuthorityGenerationV1 {
  return validateCalibrationAdmissionStaticAuthorityGenerationV1(value).ok;
}

export function validateCalibrationAdmissionAuthorityCurrentV1(value: unknown): CalibrationAdmissionStaticAuthorityValidationV1 {
  const errors: string[] = [];
  if (!isJsonRecord(value) || !exactKeys(value, ['version', 'generation', 'staticGenerationSha256', 'staticGenerationRelativePath', 'currentSha256'])) return result(['authority current pointer shape is invalid']);
  if (value.version !== 'v10.3-admission-authority-current-v1') errors.push('authority current pointer version is invalid');
  if (!safeInteger(value.generation)) errors.push('authority current generation is invalid');
  if (!isSha256(value.staticGenerationSha256)) errors.push('authority current static generation hash is invalid');
  if (!relativePath(value.staticGenerationRelativePath) || value.staticGenerationRelativePath !== `${STATIC_GENERATIONS_ROOT}/${value.staticGenerationSha256}`) errors.push('authority current static generation path is invalid');
  if (!isSha256(value.currentSha256)) errors.push('authority current self-hash is invalid');
  try {
    if (isSha256(value.currentSha256) && calibrationAdmissionAuthorityCurrentSha256(value) !== value.currentSha256) errors.push('authority current self-hash does not match canonical bytes');
  } catch { errors.push('authority current cannot be canonicalized'); }
  return result(errors);
}

export function isCalibrationAdmissionAuthorityCurrentV1(value: unknown): value is CalibrationAdmissionAuthorityCurrentV1 {
  return validateCalibrationAdmissionAuthorityCurrentV1(value).ok;
}
