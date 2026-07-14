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

/**
 * Caller-supplied objects for the pure static-authority graph join. The
 * optional `priorCurrent` is the pointer observed by a replace proposal;
 * `current` is the pointer that should publish the supplied static generation.
 * This contract never reads either path or artifact bytes.
 */
export interface CalibrationAdmissionStaticAuthorityGraphInputV1 {
  readonly proposal: unknown;
  readonly inputGeneration: unknown;
  readonly staticGeneration: unknown;
  readonly priorCurrent?: unknown;
  readonly current: unknown;
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

function sameArtifact(left: CalibrationAdmissionArtifactReceiptV1, right: CalibrationAdmissionArtifactReceiptV1): boolean {
  return left.pathBase === right.pathBase
    && left.relativePath === right.relativePath
    && left.kind === right.kind
    && left.bytes === right.bytes
    && left.sha256 === right.sha256;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function findArtifacts(
  artifacts: readonly CalibrationAdmissionArtifactReceiptV1[],
  kind: CalibrationAdmissionArtifactReceiptV1['kind'],
  relativePath: string,
): readonly CalibrationAdmissionArtifactReceiptV1[] {
  return artifacts.filter((entry) => entry.kind === kind && entry.relativePath === relativePath);
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

/**
 * Validate the cross-object joins that can be proven before the rich
 * pre-witness bundle and filesystem authority exist.
 *
 * The graph is intentionally narrow: it binds proposal → input generation,
 * input generation → static generation, static ledger/bundle receipt anchors,
 * and the observed/published current-pointer CAS relation. It does not claim
 * that any referenced hash has been read from disk or that the opaque
 * preWitnessBundleSha256 points to a final witness-free bundle.
 */
export function validateCalibrationAdmissionStaticAuthorityGraphV1(
  input: CalibrationAdmissionStaticAuthorityGraphInputV1,
): CalibrationAdmissionStaticAuthorityValidationV1 {
  const errors: string[] = [];
  if (!isJsonRecord(input)) return result(['static authority graph input is not an object']);

  const proposal = isCalibrationAdmissionInputGenerationProposalV1(input.proposal) ? input.proposal : undefined;
  const inputGeneration = isCalibrationAdmissionInputGenerationV1(input.inputGeneration) ? input.inputGeneration : undefined;
  const staticGeneration = isCalibrationAdmissionStaticAuthorityGenerationV1(input.staticGeneration) ? input.staticGeneration : undefined;
  const current = isCalibrationAdmissionAuthorityCurrentV1(input.current) ? input.current : undefined;
  const priorCurrent = input.priorCurrent === undefined
    ? undefined
    : isCalibrationAdmissionAuthorityCurrentV1(input.priorCurrent) ? input.priorCurrent : undefined;

  if (!proposal) errors.push('static authority graph proposal is invalid');
  if (!inputGeneration) errors.push('static authority graph input generation is invalid');
  if (!staticGeneration) errors.push('static authority graph static generation is invalid');
  if (!current) errors.push('static authority graph published current pointer is invalid');
  if (input.priorCurrent !== undefined && !priorCurrent) errors.push('static authority graph prior current pointer is invalid');
  if (!proposal || !inputGeneration || !staticGeneration || !current) return result(errors);

  const proposalSourceIds = proposal.sourceGenerationProposals.map((entry) => String((entry as Record<string, unknown>).sourceId));
  const inputSourceIds = inputGeneration.sourceGenerations.map((entry) => entry.sourceId);
  if (!sameStrings(proposalSourceIds, inputSourceIds)) errors.push('proposal and input generation source IDs do not match');
  if (proposal.evidenceBundleSha256 !== inputGeneration.evidenceBundleSha256) errors.push('proposal and input generation evidence bundle hashes do not match');

  const inputArtifacts = inputGeneration.artifacts;
  const inputRoles = [
    ['record_stream', 'admission-records.jsonl', 'admissionRecordStreamSha256', proposal.admissionRecordStream] as const,
    ['overlap_universe', 'overlap-universe.json', 'overlapUniverseSha256', proposal.overlapUniverse] as const,
    ['overlap_universe_stream', 'overlap-universe-records.jsonl', 'overlapUniverseRecordsSha256', proposal.overlapUniverseRecords] as const,
  ];
  for (const [kind, relativePath, hashKey, proposalArtifact] of inputRoles) {
    const matches = findArtifacts(inputArtifacts, kind, relativePath);
    if (matches.length !== 1) {
      errors.push(`input generation must contain exactly one ${kind} artifact`);
      continue;
    }
    const inputArtifactValue = matches[0]!;
    if (!sameArtifact(proposalArtifact, inputArtifactValue)) errors.push(`${kind} artifact is not identical between proposal and input generation`);
    if (inputArtifactValue.sha256 !== inputGeneration[hashKey]) errors.push(`${kind} artifact hash is not bound to the input generation field`);
  }

  if (inputGenerationSha256ForGraph(inputGeneration) !== staticGeneration.inputGenerationSha256) {
    errors.push('static generation does not bind the supplied input generation');
  }

  const staticRoles = [
    ['ledger', 'privacy-ledger.json', 'privacyLedgerSha256'],
    ['ledger', 'quality-ledger.json', 'qualityLedgerSha256'],
    ['ledger', 'lineage-ledger.json', 'lineageLedgerSha256'],
    ['bundle', 'pre-witness-bundle.json', 'preWitnessBundleSha256'],
  ] as const;
  for (const [kind, relativePath, hashKey] of staticRoles) {
    const matches = findArtifacts(staticGeneration.artifacts, kind, relativePath);
    if (matches.length !== 1) {
      errors.push(`static generation must contain exactly one ${relativePath} artifact`);
      continue;
    }
    if (matches[0]!.sha256 !== staticGeneration[hashKey]) errors.push(`${relativePath} artifact hash is not bound to the static generation field`);
  }

  if (current.staticGenerationSha256 !== staticGeneration.generationSha256 || current.generation !== staticGeneration.generation) {
    errors.push('published current pointer does not anchor the supplied static generation');
  }

  if (proposal.operation === 'create') {
    if (inputGeneration.generation !== 0 || inputGeneration.parentInputGenerationSha256 !== undefined) errors.push('create proposal must publish input generation zero without a parent');
    if (staticGeneration.generation !== 0 || staticGeneration.parentStaticGenerationSha256 !== undefined) errors.push('create proposal must publish static generation zero without a parent');
    if (priorCurrent !== undefined) errors.push('create proposal must not carry a prior current pointer');
  } else {
    if (inputGeneration.generation === 0 || inputGeneration.parentInputGenerationSha256 === undefined) errors.push('replace proposal must publish an input generation with a parent');
    if (staticGeneration.generation === 0 || staticGeneration.parentStaticGenerationSha256 === undefined) errors.push('replace proposal must publish a static generation with a parent');
    if (!priorCurrent) {
      errors.push('replace proposal must provide the prior current pointer');
    } else if (proposal.expectedCurrentState.kind !== 'existing'
      || priorCurrent.staticGenerationSha256 !== proposal.expectedCurrentState.staticGenerationSha256
      || staticGeneration.parentStaticGenerationSha256 !== priorCurrent.staticGenerationSha256
      || staticGeneration.generation !== priorCurrent.generation + 1) {
      errors.push('replace proposal CAS state does not match the prior current pointer');
    }
  }

  return result(errors);
}

function inputGenerationSha256ForGraph(value: CalibrationAdmissionInputGenerationV1): string {
  return calibrationAdmissionInputGenerationSha256(value);
}
