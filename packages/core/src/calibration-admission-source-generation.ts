import { createHash } from 'node:crypto';

import {
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionSha256,
  isCalibrationAdmissionAcquisitionSnapshotV1,
  isCalibrationAdmissionEvidenceBundleV1,
  isCalibrationAdmissionMaterializationReceiptV1,
} from './calibration-admission-evidence';
import {
  calibrationAdmissionSourceReviewSha256,
  isCalibrationSourceReviewV103,
} from './calibration-admission-review';
import { validateCalibrationAdmissionDecisionV103 } from './calibration-admission-record-authority';
import {
  exactKeys,
  isAdmissionId as id,
  isJsonRecord as isRecord,
  isSha256 as sha,
  sortedUniqueByPredicate,
  withoutJsonKey as withoutKey,
} from './calibration-admission-primitives';

const SHA256 = /^[a-f0-9]{64}$/;
const SOURCE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const CALIBRATION_ADMISSION_SOURCE_GENERATION_ARTIFACT_KINDS = [
  'source_review',
  'review_sample',
  'review_decisions',
  'admission_records',
  'record_stream',
  'overlap_universe',
  'overlap_universe_stream',
  'shard',
  'checkpoint',
  'index',
  'receipt',
  'ledger',
  'bundle',
  'current_pointer',
] as const;

export type CalibrationAdmissionSourceGenerationArtifactKind =
  (typeof CALIBRATION_ADMISSION_SOURCE_GENERATION_ARTIFACT_KINDS)[number];

export interface CalibrationAdmissionArtifactReceiptV1 {
  readonly pathBase: 'generation_local' | 'admission_root_content_addressed';
  readonly relativePath: string;
  readonly kind: CalibrationAdmissionSourceGenerationArtifactKind;
  readonly bytes: number;
  readonly sha256: string;
}

export type CalibrationAdmissionSourceCurrentStateV1 =
  | { readonly kind: 'absent' }
  | { readonly kind: 'existing'; readonly generationSha256: string };

export type CalibrationAdmissionSourceGenerationMaterializationAuthorityV1 =
  | { readonly kind: 'genesis'; readonly evidenceBundleSha256: string }
  | {
      readonly kind: 'acquired';
      readonly acquisitionIndexGenerationSha256: string;
      readonly materializationReceiptId: string;
      readonly materializationReceiptSha256: string;
    };

export interface CalibrationAdmissionSourceGenerationProposalV1 {
  readonly version: 'v10.3-admission-source-generation-proposal-v1';
  readonly proposalId: string;
  readonly sourceId: string;
  readonly operation: 'create' | 'replace';
  readonly expectedCurrentState: CalibrationAdmissionSourceCurrentStateV1;
  readonly sourceReviewSha256: string;
  readonly materializationAuthority: CalibrationAdmissionSourceGenerationMaterializationAuthorityV1;
  readonly artifacts: readonly CalibrationAdmissionArtifactReceiptV1[];
  readonly proposalSha256: string;
}

export interface CalibrationAdmissionSourceGenerationApprovalV1 {
  readonly version: 'v10.3-admission-source-generation-approval-v1';
  readonly approvalId: string;
  readonly proposalId: string;
  readonly proposalSha256: string;
  readonly blindAssignmentId: string;
  readonly reviewerDecisionIds: readonly [string, string];
  readonly blindReviewReceiptId: string;
  readonly approvalSha256: string;
}

export type CalibrationAdmissionSourceGenerationApprovalBranchV1 =
  | { readonly kind: 'genesis_quarantine'; readonly reason: 'review_incomplete' }
  | { readonly kind: 'independent_review'; readonly approvalId: string; readonly approvalSha256: string };

export interface CalibrationAdmissionSourceGenerationV1 {
  readonly version: 'v10.3-admission-source-generation-v1';
  readonly sourceId: string;
  readonly generation: number;
  readonly parentGenerationSha256?: string;
  readonly proposalId: string;
  readonly proposalSha256: string;
  readonly approval: CalibrationAdmissionSourceGenerationApprovalBranchV1;
  readonly sourceReviewSha256: string;
  readonly artifacts: readonly CalibrationAdmissionArtifactReceiptV1[];
  readonly artifactSetSha256: string;
  readonly generationSha256: string;
}

export interface CalibrationAdmissionSourceCurrentV1 {
  readonly version: 'v10.3-admission-source-current-v1';
  readonly sourceId: string;
  readonly generationSha256: string;
  readonly generationRelativePath: string;
  readonly currentSha256: string;
}

export interface CalibrationAdmissionSourceGenerationValidationV1 {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

/** Inputs required to prove the cross-object source-generation graph. */
export interface CalibrationAdmissionSourceGenerationGraphInputV1 {
  readonly proposal: unknown;
  readonly sourceReview: unknown;
  readonly generation: unknown;
  readonly current?: unknown;
  readonly priorGeneration?: unknown;
  readonly approval?: unknown;
  readonly blindAssignment?: unknown;
  readonly decisions?: readonly unknown[];
  readonly blindReviewReceipt?: unknown;
  readonly evidenceBundle?: unknown;
  readonly acquisitionSnapshot?: unknown;
  readonly materializationReceipt?: unknown;
}

function strictDateTime(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_TIME.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function safeInteger(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

function sortedUniqueStrings(value: unknown, predicate: (entry: unknown) => boolean): value is readonly string[] {
  return sortedUniqueByPredicate(value, predicate, true);
}

function hashWithout(value: unknown, key: string): string {
  return calibrationAdmissionSha256(withoutKey(value, key));
}

function canonicalJsonFileSha256(value: unknown): string {
  return createHash('sha256').update(`${calibrationAdmissionCanonicalJson(value)}\n`, 'utf8').digest('hex');
}

function pathParts(value: unknown): readonly string[] | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.startsWith('/') || value.includes('\\') || value.includes('//')) return undefined;
  const parts = value.split('/');
  if (parts.some((part) => part.length === 0 || part === '.' || part === '..' || /[\u0000-\u001f]/.test(part))) return undefined;
  return parts;
}

function hasHashSegment(parts: readonly string[]): boolean {
  return parts.some((part) => SHA256.test(part));
}

function generationLocalPath(value: unknown): boolean {
  const parts = pathParts(value);
  if (!parts || parts.includes('generations') || hasHashSegment(parts)) return false;
  return true;
}

function admissionRootCasPath(value: unknown, digest: string): boolean {
  const parts = pathParts(value);
  if (!parts || parts.length !== 4) return false;
  return parts[0] === 'evidence-cas'
    && parts[1] === 'sha256'
    && parts[2] === digest.slice(0, 2)
    && parts[3] === digest;
}

function basename(value: string): string {
  return value.slice(value.lastIndexOf('/') + 1);
}

/**
 * The artifact contract deliberately maps each kind to a small, closed path
 * vocabulary.  This prevents a receipt for one schema/media role from being
 * substituted into another role while still leaving shard/checkpoint names
 * extensible inside their dedicated subtrees.
 */
export function isCalibrationAdmissionArtifactKindPathV1(
  kind: CalibrationAdmissionSourceGenerationArtifactKind,
  relativePath: string,
): boolean {
  const leaf = basename(relativePath);
  const rootLeaf = relativePath === leaf;
  switch (kind) {
    case 'source_review': return rootLeaf && leaf === 'source-review.json';
    case 'review_sample': return rootLeaf && leaf === 'review-sample.json';
    case 'review_decisions': return rootLeaf && (leaf === 'reviewer-a.jsonl' || leaf === 'reviewer-b.jsonl');
    case 'admission_records': return rootLeaf && leaf === 'candidate-records.jsonl';
    case 'record_stream': return rootLeaf && leaf === 'admission-records.jsonl';
    case 'overlap_universe': return rootLeaf && leaf === 'overlap-universe.json';
    case 'overlap_universe_stream': return rootLeaf && leaf === 'overlap-universe-records.jsonl';
    case 'shard': return relativePath.startsWith('shards/') && /\.(json|jsonl|ndjson)$/.test(leaf);
    case 'checkpoint': return relativePath.startsWith('checkpoints/') && leaf.endsWith('.json');
    case 'index': return (relativePath.startsWith('indexes/') || leaf === 'index.json') && leaf.endsWith('.json');
    case 'receipt': return rootLeaf && (leaf === 'receipt.json' || leaf.endsWith('-receipt.json'));
    case 'ledger': return rootLeaf && (leaf === 'decision-ledger.json' || leaf.endsWith('-ledger.json') || leaf.endsWith('-ledger.jsonl'));
    case 'bundle': return rootLeaf && (leaf === 'bundle.json' || leaf.endsWith('-bundle.json'));
    case 'current_pointer': return rootLeaf && leaf === 'current.json';
  }
}

function artifactReceipt(value: unknown): value is CalibrationAdmissionArtifactReceiptV1 {
  if (!isRecord(value) || !exactKeys(value, ['pathBase', 'relativePath', 'kind', 'bytes', 'sha256'])) return false;
  if ((value.pathBase !== 'generation_local' && value.pathBase !== 'admission_root_content_addressed')
    || !sortedUniqueStrings([value.kind], (entry) => CALIBRATION_ADMISSION_SOURCE_GENERATION_ARTIFACT_KINDS.includes(entry as CalibrationAdmissionSourceGenerationArtifactKind))
    || !safeInteger(value.bytes) || !sha(value.sha256) || typeof value.relativePath !== 'string') return false;
  const kind = value.kind as CalibrationAdmissionSourceGenerationArtifactKind;
  if (value.pathBase === 'generation_local') return generationLocalPath(value.relativePath) && isCalibrationAdmissionArtifactKindPathV1(kind, value.relativePath);
  // CAS paths are reserved for immutable evidence bundles. Mutable projections
  // (including current pointers) must never be smuggled into the evidence CAS.
  if (kind !== 'bundle') return false;
  return admissionRootCasPath(value.relativePath, value.sha256);
}

function artifactSortKey(value: CalibrationAdmissionArtifactReceiptV1): string {
  return `${value.pathBase}\u0000${value.relativePath}\u0000${value.kind}\u0000${value.sha256}`;
}

function artifacts(value: unknown): value is readonly CalibrationAdmissionArtifactReceiptV1[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every(artifactReceipt)) return false;
  const keys = value.map(artifactSortKey);
  const paths = value.map((artifact) => `${artifact.pathBase}\u0000${artifact.relativePath}`);
  if (new Set(paths).size !== paths.length) return false;
  for (let index = 1; index < keys.length; index += 1) if (keys[index - 1]! >= keys[index]!) return false;
  return true;
}

function expectedState(value: unknown): value is CalibrationAdmissionSourceCurrentStateV1 {
  if (!isRecord(value)) return false;
  if (value.kind === 'absent') return exactKeys(value, ['kind']);
  return value.kind === 'existing' && exactKeys(value, ['kind', 'generationSha256']) && sha(value.generationSha256);
}

function materializationAuthority(value: unknown): value is CalibrationAdmissionSourceGenerationMaterializationAuthorityV1 {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  if (value.kind === 'genesis') return exactKeys(value, ['kind', 'evidenceBundleSha256']) && sha(value.evidenceBundleSha256);
  return value.kind === 'acquired'
    && exactKeys(value, ['kind', 'acquisitionIndexGenerationSha256', 'materializationReceiptId', 'materializationReceiptSha256'])
    && sha(value.acquisitionIndexGenerationSha256)
    && id(value.materializationReceiptId)
    && sha(value.materializationReceiptSha256);
}

export function calibrationAdmissionSourceGenerationProposalSha256(value: unknown): string {
  return hashWithout(value, 'proposalSha256');
}

export function calibrationAdmissionSourceGenerationApprovalSha256(value: unknown): string {
  return hashWithout(value, 'approvalSha256');
}

export function calibrationAdmissionSourceGenerationArtifactSetSha256(value: readonly CalibrationAdmissionArtifactReceiptV1[]): string {
  return calibrationAdmissionSha256(value);
}

export function calibrationAdmissionSourceGenerationSha256(value: unknown): string {
  return hashWithout(value, 'generationSha256');
}

export function calibrationAdmissionSourceCurrentSha256(value: unknown): string {
  return hashWithout(value, 'currentSha256');
}

export function isCalibrationAdmissionArtifactReceiptV1(value: unknown): value is CalibrationAdmissionArtifactReceiptV1 {
  return artifactReceipt(value);
}

export function isCalibrationAdmissionSourceGenerationProposalV1(value: unknown): value is CalibrationAdmissionSourceGenerationProposalV1 {
  if (!isRecord(value) || !exactKeys(value, ['version', 'proposalId', 'sourceId', 'operation', 'expectedCurrentState', 'sourceReviewSha256', 'materializationAuthority', 'artifacts', 'proposalSha256'])) return false;
  if (value.version !== 'v10.3-admission-source-generation-proposal-v1'
    || !id(value.proposalId) || !SOURCE_ID.test(String(value.sourceId))
    || (value.operation !== 'create' && value.operation !== 'replace')
    || !expectedState(value.expectedCurrentState)
    || (value.operation === 'create' && value.expectedCurrentState.kind !== 'absent')
    || (value.operation === 'replace' && value.expectedCurrentState.kind !== 'existing')
    || !sha(value.sourceReviewSha256)
    || !materializationAuthority(value.materializationAuthority)
    || !artifacts(value.artifacts)
    || !sha(value.proposalSha256)) return false;
  try { return calibrationAdmissionSourceGenerationProposalSha256(value) === value.proposalSha256; } catch { return false; }
}

export function isCalibrationAdmissionSourceGenerationApprovalV1(value: unknown): value is CalibrationAdmissionSourceGenerationApprovalV1 {
  if (!isRecord(value) || !exactKeys(value, ['version', 'approvalId', 'proposalId', 'proposalSha256', 'blindAssignmentId', 'reviewerDecisionIds', 'blindReviewReceiptId', 'approvalSha256'])) return false;
  if (value.version !== 'v10.3-admission-source-generation-approval-v1'
    || !id(value.approvalId) || !id(value.proposalId) || !sha(value.proposalSha256)
    || !sha(value.blindAssignmentId) || !sortedUniqueStrings(value.reviewerDecisionIds, sha)
    || value.reviewerDecisionIds.length !== 2 || !sha(value.blindReviewReceiptId) || !sha(value.approvalSha256)) return false;
  try { return calibrationAdmissionSourceGenerationApprovalSha256(value) === value.approvalSha256; } catch { return false; }
}

function approvalBranch(value: unknown): value is CalibrationAdmissionSourceGenerationApprovalBranchV1 {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  if (value.kind === 'genesis_quarantine') return exactKeys(value, ['kind', 'reason']) && value.reason === 'review_incomplete';
  return value.kind === 'independent_review'
    && exactKeys(value, ['kind', 'approvalId', 'approvalSha256'])
    && id(value.approvalId) && sha(value.approvalSha256);
}

export function isCalibrationAdmissionSourceGenerationV1(value: unknown): value is CalibrationAdmissionSourceGenerationV1 {
  if (!isRecord(value) || !exactKeys(value, [
    'version', 'sourceId', 'generation', ...(value.parentGenerationSha256 === undefined ? [] : ['parentGenerationSha256']),
    'proposalId', 'proposalSha256', 'approval', 'sourceReviewSha256', 'artifacts', 'artifactSetSha256', 'generationSha256',
  ])) return false;
  if (value.version !== 'v10.3-admission-source-generation-v1'
    || !SOURCE_ID.test(String(value.sourceId)) || !safeInteger(value.generation)
    || (value.parentGenerationSha256 !== undefined && !sha(value.parentGenerationSha256))
    || !id(value.proposalId) || !sha(value.proposalSha256) || !approvalBranch(value.approval)
    || !sha(value.sourceReviewSha256) || !artifacts(value.artifacts) || !sha(value.artifactSetSha256) || !sha(value.generationSha256)
    || (value.generation === 0 && value.parentGenerationSha256 !== undefined)
    || (value.generation > 0 && value.parentGenerationSha256 === undefined)) return false;
  if (value.approval.kind === 'genesis_quarantine' && (value.generation !== 0)) return false;
  try {
    return calibrationAdmissionSourceGenerationArtifactSetSha256(value.artifacts) === value.artifactSetSha256
      && calibrationAdmissionSourceGenerationSha256(value) === value.generationSha256;
  } catch { return false; }
}

export function isCalibrationAdmissionSourceCurrentV1(value: unknown): value is CalibrationAdmissionSourceCurrentV1 {
  if (!isRecord(value) || !exactKeys(value, ['version', 'sourceId', 'generationSha256', 'generationRelativePath', 'currentSha256'])) return false;
  if (value.version !== 'v10.3-admission-source-current-v1' || !SOURCE_ID.test(String(value.sourceId)) || !sha(value.generationSha256)
    || typeof value.generationRelativePath !== 'string'
    || value.generationRelativePath !== `sources/${value.sourceId}/generations/${value.generationSha256}`
    || !sha(value.currentSha256)) return false;
  try { return calibrationAdmissionSourceCurrentSha256(value) === value.currentSha256; } catch { return false; }
}

function sourceTarget(value: unknown, sourceId: string): boolean {
  if (!isRecord(value) || value.kind !== 'source' || !exactKeys(value, ['kind', 'sourceId'])) return false;
  return value.sourceId === sourceId;
}

type SourceDecision = {
  readonly decisionId: string;
  readonly reviewerId: string;
  readonly reviewerRoles: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly blindAssignmentId: string;
  readonly target: unknown;
  readonly result: unknown;
  readonly adjudicatesDecisionIds?: readonly [string, string];
};

function decision(value: unknown, sourceId: string): value is SourceDecision {
  if (!validateCalibrationAdmissionDecisionV103(value).ok) return false;
  if (!isRecord(value) || !exactKeys(value, [
    'version', 'decisionId', 'target', 'reviewerId', 'reviewerRoles', 'evidenceIds', 'blindAssignmentId',
    ...(value.adjudicatesDecisionIds === undefined ? [] : ['adjudicatesDecisionIds']), 'result', 'reasons', 'decidedAt',
  ])) return false;
  if (value.version !== 'v10.3-admission-decision-v1' || !sha(value.decisionId) || !sourceTarget(value.target, sourceId)
    || !id(value.reviewerId) || !sortedUniqueStrings(value.reviewerRoles, (entry) => ['authorship', 'rights', 'leakage_privacy', 'calibration', 'provenance'].includes(String(entry)))
    || !Array.isArray(value.evidenceIds) || !sortedUniqueStrings(value.evidenceIds, id) || value.evidenceIds.length === 0
    || !sha(value.blindAssignmentId) || !isRecord(value.result)
    || value.result.kind !== 'admission' || !['verified_ai', 'verified_human', 'mixed', 'quarantine'].includes(String(value.result.proposedLabel))
    || !['none', 'light', 'substantial', 'unknown', 'not_applicable'].includes(String(value.result.humanEditStatus))
    || !['eligible_gold', 'eligible_sensitivity', 'mixed_evaluation', 'quarantine'].includes(String(value.result.disposition))
    || !strictDateTime(value.decidedAt)) return false;
  if (value.adjudicatesDecisionIds !== undefined && (!Array.isArray(value.adjudicatesDecisionIds) || value.adjudicatesDecisionIds.length !== 2 || !sortedUniqueStrings(value.adjudicatesDecisionIds, sha))) return false;
  try { return hashWithout(value, 'decisionId') === value.decisionId; } catch { return false; }
}

type SourceBlindAssignment = {
  readonly assignmentId: string;
  readonly target: unknown;
  readonly evidenceSetSha256: string;
  readonly protocolEvidenceId: string;
  readonly reviewerIds: readonly [string, string];
};

function blindAssignment(value: unknown, sourceId: string): value is SourceBlindAssignment {
  if (!isRecord(value) || !exactKeys(value, ['version', 'assignmentId', 'target', 'evidenceSetSha256', 'protocolEvidenceId', 'reviewerIds', 'peerMaterialHiddenUntilBothSealed'])) return false;
  if (value.version !== 'v10.3-admission-blind-assignment-v1' || !sha(value.assignmentId) || !sourceTarget(value.target, sourceId)
    || !sha(value.evidenceSetSha256) || !id(value.protocolEvidenceId) || !sortedUniqueStrings(value.reviewerIds, id)
    || value.reviewerIds.length !== 2 || value.peerMaterialHiddenUntilBothSealed !== true) return false;
  try {
    return hashWithout(value, 'assignmentId') === value.assignmentId;
  } catch {
    return false;
  }
}

type SourceBlindReviewReceipt = {
  readonly receiptId: string;
  readonly assignmentId: string;
  readonly evidenceSetSha256: string;
  readonly sealedDecisions: readonly [{ readonly reviewerId: string; readonly decisionId: string; readonly peerDecisionVisibleBeforeSeal: false }, { readonly reviewerId: string; readonly decisionId: string; readonly peerDecisionVisibleBeforeSeal: false }];
};

function blindReviewReceipt(value: unknown, sourceId: string): value is SourceBlindReviewReceipt {
  if (!isRecord(value) || !exactKeys(value, ['version', 'receiptId', 'assignmentId', 'evidenceSetSha256', 'sealedDecisions', 'unsealedOnlyAfterBothDecisionIdsExisted', 'protocolAuditorId', 'protocolAuditEvidenceIds'])) return false;
  if (value.version !== 'v10.3-admission-blind-review-receipt-v1' || !sha(value.receiptId) || !sha(value.assignmentId) || !sha(value.evidenceSetSha256)
    || !Array.isArray(value.sealedDecisions) || value.sealedDecisions.length !== 2 || !id(value.protocolAuditorId)
    || !sortedUniqueStrings(value.protocolAuditEvidenceIds, id) || value.unsealedOnlyAfterBothDecisionIdsExisted !== true) return false;
  const sealed = value.sealedDecisions as readonly Record<string, unknown>[];
  return sealed[0] !== undefined && sealed[1] !== undefined
    && String(sealed[0].reviewerId) < String(sealed[1].reviewerId)
    && new Set(sealed.map((entry) => entry.decisionId)).size === 2
    && sealed.every((entry) => isRecord(entry)
    && exactKeys(entry, ['reviewerId', 'decisionId', 'peerDecisionVisibleBeforeSeal'])
    && id(entry.reviewerId) && sha(entry.decisionId) && entry.peerDecisionVisibleBeforeSeal === false)
    && Boolean(sourceId)
    && hashWithout(value, 'receiptId') === value.receiptId;
}

function sameJson(left: unknown, right: unknown): boolean {
  return calibrationAdmissionCanonicalJson(left) === calibrationAdmissionCanonicalJson(right);
}

function push(errors: string[], message: string): void {
  if (!errors.includes(message)) errors.push(message);
}

function validateMaterializationAuthority(
  proposal: CalibrationAdmissionSourceGenerationProposalV1,
  sourceId: string,
  input: CalibrationAdmissionSourceGenerationGraphInputV1,
  errors: string[],
): void {
  const authority = proposal.materializationAuthority;
  if (authority.kind === 'genesis') {
    const bundle = isCalibrationAdmissionEvidenceBundleV1(input.evidenceBundle) ? input.evidenceBundle : undefined;
    if (!bundle || bundle.bundleSha256 !== authority.evidenceBundleSha256) push(errors, 'genesis evidence bundle is missing or hash-mismatched');
    return;
  }
  const snapshot = isCalibrationAdmissionAcquisitionSnapshotV1(input.acquisitionSnapshot) ? input.acquisitionSnapshot : undefined;
  if (!snapshot || snapshot.indexGenerationSha256 !== authority.acquisitionIndexGenerationSha256) {
    push(errors, 'acquired authority snapshot is missing or hash-mismatched');
  }
  const materialization = input.materializationReceipt;
  if (!isCalibrationAdmissionMaterializationReceiptV1(materialization)
    || materialization.sourceId !== sourceId
    || materialization.receiptId !== authority.materializationReceiptId
    || calibrationAdmissionSha256(materialization) !== authority.materializationReceiptSha256
    || !snapshot?.artifactKeys.includes(`materialization_receipt:${materialization.receiptId}`)) {
    push(errors, 'acquired materialization receipt is missing, stale, or not indexed');
  }
}

/** Validate one source-generation proposal's shape and self-hash. */
export function validateCalibrationAdmissionSourceGenerationProposalV1(value: unknown): CalibrationAdmissionSourceGenerationValidationV1 {
  return isCalibrationAdmissionSourceGenerationProposalV1(value)
    ? { ok: true, errors: [] }
    : { ok: false, errors: ['source-generation proposal failed shape, path, operation, artifact, or self-hash validation'] };
}

/**
 * Validate the complete proposal -> review/approval -> generation -> current
 * graph. All joins are pure and operate on caller-supplied immutable objects;
 * filesystem resolution belongs to SlopBrick.
 */
export function validateCalibrationAdmissionSourceGenerationGraphV1(
  input: CalibrationAdmissionSourceGenerationGraphInputV1,
): CalibrationAdmissionSourceGenerationValidationV1 {
  if (!isRecord(input)) return { ok: false, errors: ['source-generation graph input is invalid'] };
  const errors: string[] = [];
  const proposal = isCalibrationAdmissionSourceGenerationProposalV1(input.proposal) ? input.proposal : undefined;
  const review = isCalibrationSourceReviewV103(input.sourceReview) ? input.sourceReview : undefined;
  const generation = isCalibrationAdmissionSourceGenerationV1(input.generation) ? input.generation : undefined;
  if (!proposal) push(errors, 'source-generation proposal is invalid');
  if (!review) push(errors, 'source review is invalid');
  if (!generation) push(errors, 'source generation is invalid');
  if (!proposal || !review || !generation) return { ok: false, errors };

  if (proposal.sourceId !== review.sourceId || proposal.sourceId !== generation.sourceId) push(errors, 'source-generation source IDs do not match');
  if (proposal.sourceReviewSha256 !== calibrationAdmissionSourceReviewSha256(review) || generation.sourceReviewSha256 !== proposal.sourceReviewSha256) push(errors, 'source-review hash is not bound through proposal and generation');
  if (proposal.proposalId !== generation.proposalId || proposal.proposalSha256 !== generation.proposalSha256) push(errors, 'generation does not bind its exact proposal');
  if (!sameJson(proposal.artifacts, generation.artifacts)) push(errors, 'generation artifacts do not exactly match proposal artifacts');
  if (proposal.operation === 'create' && (generation.generation !== 0 || generation.parentGenerationSha256 !== undefined)) push(errors, 'create proposal must produce generation zero without a parent');
  if (proposal.operation === 'replace') {
    const expectedGenerationSha256 = proposal.expectedCurrentState.kind === 'existing'
      ? proposal.expectedCurrentState.generationSha256
      : undefined;
    if (generation.parentGenerationSha256 !== expectedGenerationSha256) push(errors, 'replace generation parent does not match expected current');
    const current = isCalibrationAdmissionSourceCurrentV1(input.current) ? input.current : undefined;
    if (!current || current.generationSha256 !== expectedGenerationSha256) push(errors, 'replace proposal current pointer does not match expected generation');
    if (current && current.sourceId !== proposal.sourceId) push(errors, 'replace proposal current pointer source ID does not match source generation');
    if (input.priorGeneration === undefined) {
      push(errors, 'replace generation must provide its readable prior generation');
    } else {
      const prior = isCalibrationAdmissionSourceGenerationV1(input.priorGeneration) ? input.priorGeneration : undefined;
      if (!prior || prior.generation + 1 !== generation.generation || prior.generationSha256 !== generation.parentGenerationSha256) push(errors, 'replace generation is not exactly one after its readable prior generation');
      if (prior && prior.sourceId !== generation.sourceId) push(errors, 'replace prior generation source ID does not match source generation');
    }
  } else if (input.current !== undefined) {
    push(errors, 'create proposal must start from an absent current pointer');
  }

  const sourceArtifact = generation.artifacts.find((artifact) => artifact.kind === 'source_review');
  if (!sourceArtifact
    || sourceArtifact.sha256 !== canonicalJsonFileSha256(review)
    || sourceArtifact.bytes !== Buffer.byteLength(`${calibrationAdmissionCanonicalJson(review)}\n`, 'utf8')) push(errors, 'source-review artifact is missing or not byte-bound');
  validateMaterializationAuthority(proposal, proposal.sourceId, input, errors);

  if (generation.approval.kind === 'genesis_quarantine') {
    if (review.decision !== 'source_quarantine' || !review.reasons.includes('review_incomplete') || review.reviewerDecisionIds.length !== 0) push(errors, 'genesis quarantine requires source_quarantine review_incomplete with no decisions');
    if (input.approval !== undefined) push(errors, 'genesis quarantine must not carry an approval object');
  } else {
    if (review.decision !== 'candidate') push(errors, 'independent-review generation requires a candidate source review');
    const approval = isCalibrationAdmissionSourceGenerationApprovalV1(input.approval) ? input.approval : undefined;
    if (!approval || approval.approvalId !== generation.approval.approvalId || approval.approvalSha256 !== generation.approval.approvalSha256 || approval.proposalId !== proposal.proposalId || approval.proposalSha256 !== proposal.proposalSha256) {
      push(errors, 'independent-review generation does not bind its exact approval/proposal');
    } else {
      const assignment = blindAssignment(input.blindAssignment, proposal.sourceId) ? input.blindAssignment : undefined;
      const decisions = Array.isArray(input.decisions) ? input.decisions : [];
      if (input.decisions !== undefined && !Array.isArray(input.decisions)) push(errors, 'approval decisions are missing or invalid');
      if (!assignment || assignment.assignmentId !== approval.blindAssignmentId) push(errors, 'approval blind assignment is missing or mismatched');
      const typedDecisions = decisions.filter((entry): entry is SourceDecision => decision(entry, proposal.sourceId));
      if (decisions.length !== 2 || typedDecisions.length !== decisions.length) push(errors, 'approval decisions are missing or invalid');
      const decisionIds = typedDecisions.map((entry) => entry.decisionId).sort();
      if (!sameJson(decisionIds, [...approval.reviewerDecisionIds].sort())) push(errors, 'approval decision IDs do not match supplied decisions');
      if (assignment && (!typedDecisions.every((entry) => entry.blindAssignmentId === assignment.assignmentId)
        || !typedDecisions.every((entry) => calibrationAdmissionSha256(entry.evidenceIds) === assignment.evidenceSetSha256)
        || !sameJson([...assignment.reviewerIds].sort(), typedDecisions.map((entry) => entry.reviewerId).sort())
        || typedDecisions.some((entry) => entry.adjudicatesDecisionIds !== undefined)
        // A candidate that claims reviewed/approved rights must carry
        // concrete rights evidence. Empty evidence is valid only for
        // quarantine/ambiguous records and must never become an approval
        // path through a vacuous subset check.
        || review.sourceRights.evidenceIds.length === 0
        || typedDecisions.some((entry) => entry.reviewerRoles.includes('authorship')) !== true
        || typedDecisions.some((entry) => entry.reviewerRoles.includes('rights')) !== true
        || !typedDecisions.some((entry) => entry.reviewerRoles.includes('authorship') && typedDecisions.some((other) => other.reviewerRoles.includes('rights') && other.reviewerId !== entry.reviewerId))
        || !review.sourceRights.evidenceIds.every((evidenceId) => typedDecisions.some((entry) => entry.reviewerRoles.includes('rights') && entry.evidenceIds.includes(evidenceId))))) push(errors, 'approval decisions do not provide independent blind authorship/rights coverage');
      const receipt = blindReviewReceipt(input.blindReviewReceipt, proposal.sourceId) ? input.blindReviewReceipt : undefined;
      if (!receipt || receipt.receiptId !== approval.blindReviewReceiptId || receipt.assignmentId !== approval.blindAssignmentId || receipt.evidenceSetSha256 !== assignment?.evidenceSetSha256) push(errors, 'approval blind-review receipt is missing or mismatched');
      if (receipt && (!sameJson(receipt.sealedDecisions.map((entry) => entry.decisionId).sort(), decisionIds)
        || !sameJson(receipt.sealedDecisions.map((entry) => entry.reviewerId).sort(), typedDecisions.map((entry) => entry.reviewerId).sort()))) push(errors, 'blind-review receipt does not seal the exact decisions');
      if (!sameJson([...review.reviewerDecisionIds].sort(), decisionIds)) push(errors, 'source review decision IDs do not match approval decisions');
      if (typedDecisions.length === 2 && !sameJson((typedDecisions[0] as SourceDecision).result, (typedDecisions[1] as SourceDecision).result)) push(errors, 'source review decisions disagree');
    }
  }
  return { ok: errors.length === 0, errors };
}
