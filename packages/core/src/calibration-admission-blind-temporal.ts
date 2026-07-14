import {
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionSha256,
} from './calibration-admission-evidence';
import { isCalibrationAdmissionReasonListV1 } from './calibration-admission-review';
import {
  exactKeys,
  isAdmissionId as id,
  isJsonRecord as isRecord,
  isSha256 as sha,
  sortedUniqueByPredicate as sortedUnique,
  withoutJsonKey as withoutKey,
} from './calibration-admission-primitives';

const GIT_SHA = /^[a-f0-9]{40,64}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const RELATIVE_PATH = /^(?!\/)(?!.*\\)(?!.*\/\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*(?:^|\/)\.(?:\/|$)).+$/;
const CUTOFF = '2020-01-01T00:00:00.000Z';
const CUTOFF_MS = Date.parse(CUTOFF);
const REVIEW_ROLES = new Set(['authorship', 'rights', 'leakage_privacy', 'calibration', 'provenance']);

export type CalibrationAdmissionBlindAssignmentTargetV1 =
  | { readonly kind: 'source'; readonly sourceId: string }
  | { readonly kind: 'record'; readonly recordId: string }
  | {
      readonly kind: 'temporal_attestation';
      readonly temporalAttestationId: string;
      readonly exactBlobOrContentSha256: string;
    }
  | {
      readonly kind: 'provider_revision_exception';
      readonly recordId: string;
      readonly providerVersioningEvidenceId: string;
    }
  | {
      readonly kind: 'witness';
      readonly witnessSha256: string;
      readonly eligibilitySnapshotSha256: string;
      readonly verifiedContextSha256: string;
    };

export interface CalibrationAdmissionBlindAssignmentV1 {
  readonly version: 'v10.3-admission-blind-assignment-v1';
  readonly assignmentId: string;
  readonly target: CalibrationAdmissionBlindAssignmentTargetV1;
  readonly evidenceSetSha256: string;
  readonly protocolEvidenceId: string;
  readonly reviewerIds: readonly [string, string];
  readonly peerMaterialHiddenUntilBothSealed: true;
}

export interface CalibrationAdmissionBlindReviewSealedDecisionV1 {
  readonly reviewerId: string;
  readonly decisionId: string;
  readonly peerDecisionVisibleBeforeSeal: false;
}

export interface CalibrationAdmissionBlindReviewReceiptV1 {
  readonly version: 'v10.3-admission-blind-review-receipt-v1';
  readonly receiptId: string;
  readonly assignmentId: string;
  readonly evidenceSetSha256: string;
  readonly sealedDecisions: readonly [
    CalibrationAdmissionBlindReviewSealedDecisionV1,
    CalibrationAdmissionBlindReviewSealedDecisionV1,
  ];
  readonly unsealedOnlyAfterBothDecisionIdsExisted: true;
  readonly protocolAuditorId: string;
  readonly protocolAuditEvidenceIds: readonly string[];
}

/**
 * A dedicated adjudication assignment.  It is intentionally separate from
 * the exact-two peer assignment so the original blind receipt remains a
 * two-decision contract while a disagreement can be resolved by a distinct
 * reviewer with an explicit evidence set.
 */
export interface CalibrationAdmissionAdjudicatorAssignmentV1 {
  readonly version: 'v10.3-admission-adjudicator-assignment-v1';
  readonly assignmentId: string;
  readonly target: CalibrationAdmissionBlindAssignmentTargetV1;
  readonly priorDecisionIds: readonly [string, string];
  readonly priorBlindReviewReceiptId: string;
  readonly evidenceIds: readonly [string, ...string[]];
  readonly evidenceSetSha256: string;
  readonly protocolEvidenceId: string;
  readonly adjudicatorId: string;
  readonly priorPeerReceiptRequired: true;
}

/**
 * Receipt for a single adjudication decision.  The prior peer receipt is
 * bound by id and is observed before adjudication, without changing the
 * exact-two peer receipt shape.
 */
export interface CalibrationAdmissionAdjudicatorReceiptV1 {
  readonly version: 'v10.3-admission-adjudicator-receipt-v1';
  readonly receiptId: string;
  readonly assignmentId: string;
  readonly priorDecisionIds: readonly [string, string];
  readonly priorBlindReviewReceiptId: string;
  readonly evidenceSetSha256: string;
  readonly adjudicationDecisionId: string;
  readonly adjudicatorId: string;
  readonly priorPeerReceiptObservedBeforeAdjudication: true;
  readonly protocolAuditorId: string;
  readonly protocolAuditEvidenceIds: readonly string[];
}

export interface CalibrationHistoricalTemporalExternalObservationV1 {
  readonly kind:
    | 'timestamped_source_archive'
    | 'package_registry_artifact'
    | 'release_transparency_log'
    | 'independent_content_archive';
  readonly observedAt: string;
  readonly exactBlobOrContentSha256: string;
  readonly evidenceIds: readonly [string, ...string[]];
  readonly evidenceReceiptIds: readonly [string, ...string[]];
}

export interface CalibrationHistoricalTemporalAttestationV1 {
  readonly version: 'v10.3-historical-temporal-attestation-v1';
  readonly attestationId: string;
  readonly repositoryId: string;
  readonly immutableCommitSha: string;
  readonly normalizedPath: string;
  readonly blobSha: string;
  readonly completeCommitGraphSha256: string;
  readonly shallowRepository: false;
  readonly graftsOrReplaceRefsPresent: false;
  readonly introducedCommitSha: string;
  readonly lastChangedCommitSha: string;
  readonly introducedAt: string;
  readonly lastChangedAt: string;
  readonly cutoff: typeof CUTOFF;
  readonly bulkImportOrigin: 'ruled_out' | 'indeterminate';
  readonly independentExternalObservation: CalibrationHistoricalTemporalExternalObservationV1;
  readonly toolReceiptSha256: string;
}

/** The small decision projection needed to prove the blind graph. */
export interface CalibrationAdmissionBlindDecisionV1 {
  readonly version: 'v10.3-admission-decision-v1';
  readonly decisionId: string;
  readonly target: CalibrationAdmissionBlindAssignmentTargetV1;
  readonly reviewerId: string;
  readonly reviewerRoles: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly blindAssignmentId: string;
  readonly adjudicatesDecisionIds?: readonly [string, string];
  readonly result:
    | {
        readonly kind: 'admission';
        readonly proposedLabel: 'verified_ai' | 'verified_human' | 'mixed' | 'quarantine';
        readonly humanEditStatus: 'none' | 'light' | 'substantial' | 'unknown' | 'not_applicable';
        readonly disposition: 'eligible_gold' | 'eligible_sensitivity' | 'mixed_evaluation' | 'quarantine';
      }
    | { readonly kind: 'provider_revision_exception'; readonly decision: 'accepted' | 'rejected' }
    | { readonly kind: 'temporal_attestation'; readonly decision: 'accepted' | 'rejected' }
    | { readonly kind: 'witness'; readonly decision: 'approved' | 'rejected' };
  readonly reasons: readonly string[];
  readonly decidedAt: string;
}

export interface TemporalEvidenceVerificationV1 {
  /** Evidence IDs resolved through the immutable evidence index. */
  readonly evidenceIds: readonly string[];
  /** Evidence-receipt IDs whose status is `verified` and whose bytes were re-read. */
  readonly evidenceReceiptIds: readonly string[];
  /** SHA-256 of the bytes observed by the independent evidence receipt. */
  readonly observedSha256: string;
  readonly allReceiptsVerified: boolean;
}

export interface CalibrationAdmissionBlindTemporalValidationV1 {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

function hashWithout(value: unknown, key: string): string {
  return calibrationAdmissionSha256(withoutKey(value, key));
}

function gitSha(value: unknown): value is string {
  return typeof value === 'string' && GIT_SHA.test(value);
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_TIME.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function validTarget(value: unknown): value is CalibrationAdmissionBlindAssignmentTargetV1 {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  if (value.kind === 'source') return exactKeys(value, ['kind', 'sourceId']) && id(value.sourceId);
  if (value.kind === 'record') return exactKeys(value, ['kind', 'recordId']) && sha(value.recordId);
  if (value.kind === 'temporal_attestation') {
    return exactKeys(value, ['kind', 'temporalAttestationId', 'exactBlobOrContentSha256'])
      && sha(value.temporalAttestationId) && sha(value.exactBlobOrContentSha256);
  }
  if (value.kind === 'provider_revision_exception') {
    return exactKeys(value, ['kind', 'recordId', 'providerVersioningEvidenceId'])
      && sha(value.recordId) && id(value.providerVersioningEvidenceId);
  }
  if (value.kind === 'witness') {
    return exactKeys(value, ['kind', 'witnessSha256', 'eligibilitySnapshotSha256', 'verifiedContextSha256'])
      && sha(value.witnessSha256) && sha(value.eligibilitySnapshotSha256) && sha(value.verifiedContextSha256);
  }
  return false;
}

function sameJson(left: unknown, right: unknown): boolean {
  try {
    return calibrationAdmissionCanonicalJson(left) === calibrationAdmissionCanonicalJson(right);
  } catch {
    return false;
  }
}

function validAssignment(value: unknown): value is CalibrationAdmissionBlindAssignmentV1 {
  if (!isRecord(value) || !exactKeys(value, ['version', 'assignmentId', 'target', 'evidenceSetSha256', 'protocolEvidenceId', 'reviewerIds', 'peerMaterialHiddenUntilBothSealed'])) return false;
  if (value.version !== 'v10.3-admission-blind-assignment-v1'
    || !sha(value.assignmentId)
    || !validTarget(value.target)
    || !sha(value.evidenceSetSha256)
    || !id(value.protocolEvidenceId)
    || !sortedUnique(value.reviewerIds, id)
    || value.reviewerIds.length !== 2
    || value.peerMaterialHiddenUntilBothSealed !== true) return false;
  try {
    return hashWithout(value, 'assignmentId') === value.assignmentId;
  } catch {
    return false;
  }
}

function validSealedDecision(value: unknown): value is CalibrationAdmissionBlindReviewSealedDecisionV1 {
  return isRecord(value)
    && exactKeys(value, ['reviewerId', 'decisionId', 'peerDecisionVisibleBeforeSeal'])
    && id(value.reviewerId)
    && sha(value.decisionId)
    && value.peerDecisionVisibleBeforeSeal === false;
}

function validReceipt(value: unknown): value is CalibrationAdmissionBlindReviewReceiptV1 {
  if (!isRecord(value) || !exactKeys(value, ['version', 'receiptId', 'assignmentId', 'evidenceSetSha256', 'sealedDecisions', 'unsealedOnlyAfterBothDecisionIdsExisted', 'protocolAuditorId', 'protocolAuditEvidenceIds'])) return false;
  if (value.version !== 'v10.3-admission-blind-review-receipt-v1'
    || !sha(value.receiptId)
    || !sha(value.assignmentId)
    || !sha(value.evidenceSetSha256)
    || !Array.isArray(value.sealedDecisions)
    || value.sealedDecisions.length !== 2
    || !value.sealedDecisions.every(validSealedDecision)
    || !sortedUnique(value.sealedDecisions.map((entry) => (entry as CalibrationAdmissionBlindReviewSealedDecisionV1).reviewerId), id)
    || new Set(value.sealedDecisions.map((entry) => (entry as CalibrationAdmissionBlindReviewSealedDecisionV1).decisionId)).size !== 2
    || value.unsealedOnlyAfterBothDecisionIdsExisted !== true
    || !id(value.protocolAuditorId)
    || !sortedUnique(value.protocolAuditEvidenceIds, id)) return false;
  try {
    return hashWithout(value, 'receiptId') === value.receiptId;
  } catch {
    return false;
  }
}

function validAdjudicatorAssignment(value: unknown): value is CalibrationAdmissionAdjudicatorAssignmentV1 {
  if (!isRecord(value) || !exactKeys(value, [
    'version',
    'assignmentId',
    'target',
    'priorDecisionIds',
    'priorBlindReviewReceiptId',
    'evidenceIds',
    'evidenceSetSha256',
    'protocolEvidenceId',
    'adjudicatorId',
    'priorPeerReceiptRequired',
  ])) return false;
  if (value.version !== 'v10.3-admission-adjudicator-assignment-v1'
    || !sha(value.assignmentId)
    || !validTarget(value.target)
    || !sortedUnique(value.priorDecisionIds, sha)
    || value.priorDecisionIds.length !== 2
    || !sha(value.priorBlindReviewReceiptId)
    || !sortedUnique(value.evidenceIds, id)
    || value.evidenceIds.length < 2
    || !sha(value.evidenceSetSha256)
    || calibrationAdmissionSha256(value.evidenceIds) !== value.evidenceSetSha256
    || !id(value.protocolEvidenceId)
    || !id(value.adjudicatorId)
    || value.priorPeerReceiptRequired !== true) return false;
  try {
    return hashWithout(value, 'assignmentId') === value.assignmentId;
  } catch {
    return false;
  }
}

function validAdjudicatorReceipt(value: unknown): value is CalibrationAdmissionAdjudicatorReceiptV1 {
  if (!isRecord(value) || !exactKeys(value, [
    'version',
    'receiptId',
    'assignmentId',
    'priorDecisionIds',
    'priorBlindReviewReceiptId',
    'evidenceSetSha256',
    'adjudicationDecisionId',
    'adjudicatorId',
    'priorPeerReceiptObservedBeforeAdjudication',
    'protocolAuditorId',
    'protocolAuditEvidenceIds',
  ])) return false;
  if (value.version !== 'v10.3-admission-adjudicator-receipt-v1'
    || !sha(value.receiptId)
    || !sha(value.assignmentId)
    || !sortedUnique(value.priorDecisionIds, sha)
    || value.priorDecisionIds.length !== 2
    || !sha(value.priorBlindReviewReceiptId)
    || !sha(value.evidenceSetSha256)
    || !sha(value.adjudicationDecisionId)
    || !id(value.adjudicatorId)
    || value.priorPeerReceiptObservedBeforeAdjudication !== true
    || !id(value.protocolAuditorId)
    || !sortedUnique(value.protocolAuditEvidenceIds, id)) return false;
  try {
    return hashWithout(value, 'receiptId') === value.receiptId;
  } catch {
    return false;
  }
}

function validResult(value: unknown): value is CalibrationAdmissionBlindDecisionV1['result'] {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  if (value.kind === 'admission') {
    return exactKeys(value, ['kind', 'proposedLabel', 'humanEditStatus', 'disposition'])
      && (value.proposedLabel === 'verified_ai' || value.proposedLabel === 'verified_human' || value.proposedLabel === 'mixed' || value.proposedLabel === 'quarantine')
      && (value.humanEditStatus === 'none' || value.humanEditStatus === 'light' || value.humanEditStatus === 'substantial' || value.humanEditStatus === 'unknown' || value.humanEditStatus === 'not_applicable')
      && (value.disposition === 'eligible_gold' || value.disposition === 'eligible_sensitivity' || value.disposition === 'mixed_evaluation' || value.disposition === 'quarantine');
  }
  if (value.kind === 'provider_revision_exception') return exactKeys(value, ['kind', 'decision']) && (value.decision === 'accepted' || value.decision === 'rejected');
  if (value.kind === 'temporal_attestation') return exactKeys(value, ['kind', 'decision']) && (value.decision === 'accepted' || value.decision === 'rejected');
  if (value.kind === 'witness') return exactKeys(value, ['kind', 'decision']) && (value.decision === 'approved' || value.decision === 'rejected');
  return false;
}

function validDecision(value: unknown): value is CalibrationAdmissionBlindDecisionV1 {
  if (!isRecord(value)) return false;
  const keys = ['version', 'decisionId', 'target', 'reviewerId', 'reviewerRoles', 'evidenceIds', 'blindAssignmentId', 'result', 'reasons', 'decidedAt'];
  if (value.adjudicatesDecisionIds !== undefined) keys.push('adjudicatesDecisionIds');
  if (!exactKeys(value, keys)
    || value.version !== 'v10.3-admission-decision-v1'
    || !sha(value.decisionId)
    || !validTarget(value.target)
    || !id(value.reviewerId)
    || !sortedUnique(value.reviewerRoles, (entry) => typeof entry === 'string' && REVIEW_ROLES.has(entry))
    || !Array.isArray(value.reviewerRoles)
    || value.reviewerRoles.length === 0
    || !sortedUnique(value.evidenceIds, id)
    || value.evidenceIds.length === 0
    || !sha(value.blindAssignmentId)
    || !validResult(value.result)
    || !isCalibrationAdmissionReasonListV1(value.reasons)
    || !validDate(value.decidedAt)) return false;
  if (value.adjudicatesDecisionIds !== undefined
    && (!Array.isArray(value.adjudicatesDecisionIds)
      || value.adjudicatesDecisionIds.length !== 2
      || !sortedUnique(value.adjudicatesDecisionIds, sha))) return false;
  if (value.target.kind === 'temporal_attestation'
    && (value.result.kind !== 'temporal_attestation'
      || value.reviewerRoles.length !== 1
      || value.reviewerRoles[0] !== 'provenance'
      || value.adjudicatesDecisionIds !== undefined)) return false;
  if (value.target.kind === 'witness'
    && (value.result.kind !== 'witness'
      || value.reviewerRoles.length !== 1
      || value.reviewerRoles[0] !== 'calibration'
      || value.adjudicatesDecisionIds !== undefined)) return false;
  if (value.target.kind === 'provider_revision_exception'
    && (value.result.kind !== 'provider_revision_exception'
      || value.reviewerRoles.length !== 1
      || value.reviewerRoles[0] !== 'provenance')) return false;
  if (value.target.kind === 'source' || value.target.kind === 'record') {
    if (value.result.kind !== 'admission') return false;
  }
  try {
    return hashWithout(value, 'decisionId') === value.decisionId;
  } catch {
    return false;
  }
}

function resultDecision(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (value.kind === 'temporal_attestation' && (value.decision === 'accepted' || value.decision === 'rejected')) return value.decision;
  return undefined;
}

export function calibrationAdmissionBlindAssignmentId(value: unknown): string {
  return hashWithout(value, 'assignmentId');
}

export function calibrationAdmissionBlindReviewReceiptId(value: unknown): string {
  return hashWithout(value, 'receiptId');
}

export function calibrationAdmissionAdjudicatorAssignmentId(value: unknown): string {
  return hashWithout(value, 'assignmentId');
}

export function calibrationAdmissionAdjudicatorReceiptId(value: unknown): string {
  return hashWithout(value, 'receiptId');
}

export function calibrationHistoricalTemporalAttestationId(value: unknown): string {
  return hashWithout(value, 'attestationId');
}

export function isCalibrationAdmissionBlindAssignmentV1(value: unknown): value is CalibrationAdmissionBlindAssignmentV1 {
  return validAssignment(value);
}

export function isCalibrationAdmissionBlindReviewReceiptV1(value: unknown): value is CalibrationAdmissionBlindReviewReceiptV1 {
  return validReceipt(value);
}

export function isCalibrationAdmissionAdjudicatorAssignmentV1(value: unknown): value is CalibrationAdmissionAdjudicatorAssignmentV1 {
  return validAdjudicatorAssignment(value);
}

export function isCalibrationAdmissionAdjudicatorReceiptV1(value: unknown): value is CalibrationAdmissionAdjudicatorReceiptV1 {
  return validAdjudicatorReceipt(value);
}

export function isCalibrationHistoricalTemporalAttestationV1(value: unknown): value is CalibrationHistoricalTemporalAttestationV1 {
  return validateCalibrationHistoricalTemporalAttestation(value).ok;
}

function temporalShapeErrors(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value) || !exactKeys(value, [
    'version',
    'attestationId',
    'repositoryId',
    'immutableCommitSha',
    'normalizedPath',
    'blobSha',
    'completeCommitGraphSha256',
    'shallowRepository',
    'graftsOrReplaceRefsPresent',
    'introducedCommitSha',
    'lastChangedCommitSha',
    'introducedAt',
    'lastChangedAt',
    'cutoff',
    'bulkImportOrigin',
    'independentExternalObservation',
    'toolReceiptSha256',
  ])) {
    return ['temporal_attestation_shape_invalid'];
  }
  if (value.version !== 'v10.3-historical-temporal-attestation-v1') errors.push('temporal_attestation_version_invalid');
  if (!sha(value.attestationId)) errors.push('temporal_attestation_id_invalid');
  if (!id(value.repositoryId)) errors.push('temporal_repository_id_invalid');
  if (!gitSha(value.immutableCommitSha) || !gitSha(value.blobSha) || !gitSha(value.introducedCommitSha) || !gitSha(value.lastChangedCommitSha)) errors.push('temporal_git_identity_invalid');
  if (typeof value.normalizedPath !== 'string' || !RELATIVE_PATH.test(value.normalizedPath)) errors.push('temporal_path_invalid');
  if (!sha(value.completeCommitGraphSha256)) errors.push('temporal_commit_graph_hash_invalid');
  if (value.shallowRepository !== false) errors.push('temporal_history_is_shallow');
  if (value.graftsOrReplaceRefsPresent !== false) errors.push('temporal_history_has_grafts_or_replace_refs');
  if (!validDate(value.introducedAt) || !validDate(value.lastChangedAt)) errors.push('temporal_timestamp_invalid');
  if (validDate(value.introducedAt) && Date.parse(value.introducedAt) > CUTOFF_MS) errors.push('temporal_introduction_after_cutoff');
  if (validDate(value.lastChangedAt) && Date.parse(value.lastChangedAt) > CUTOFF_MS) errors.push('temporal_last_change_after_cutoff');
  if (validDate(value.introducedAt) && validDate(value.lastChangedAt) && Date.parse(value.introducedAt) > Date.parse(value.lastChangedAt)) errors.push('temporal_timestamps_out_of_order');
  if (value.cutoff !== CUTOFF) errors.push('temporal_cutoff_invalid');
  if (value.bulkImportOrigin !== 'ruled_out' && value.bulkImportOrigin !== 'indeterminate') errors.push('temporal_bulk_import_origin_invalid');
  const observation = value.independentExternalObservation;
  if (!isRecord(observation) || !exactKeys(observation, ['kind', 'observedAt', 'exactBlobOrContentSha256', 'evidenceIds', 'evidenceReceiptIds'])) {
    errors.push('temporal_external_observation_shape_invalid');
  } else {
    if (!['timestamped_source_archive', 'package_registry_artifact', 'release_transparency_log', 'independent_content_archive'].includes(String(observation.kind))) errors.push('temporal_external_observation_kind_invalid');
    if (!validDate(observation.observedAt)) errors.push('temporal_external_observation_timestamp_invalid');
    if (validDate(observation.observedAt) && Date.parse(observation.observedAt) > CUTOFF_MS) errors.push('temporal_external_observation_after_cutoff');
    if (!sha(observation.exactBlobOrContentSha256)) errors.push('temporal_external_observation_hash_invalid');
    if (!Array.isArray(observation.evidenceIds) || observation.evidenceIds.length < 1 || !sortedUnique(observation.evidenceIds, id)) errors.push('temporal_external_evidence_ids_invalid');
    if (!Array.isArray(observation.evidenceReceiptIds) || observation.evidenceReceiptIds.length < 1 || !sortedUnique(observation.evidenceReceiptIds, sha)) errors.push('temporal_external_receipt_ids_invalid');
  }
  if (!sha(value.toolReceiptSha256)) errors.push('temporal_tool_receipt_hash_invalid');
  if (errors.length === 0) {
    try {
      if (calibrationHistoricalTemporalAttestationId(value) !== value.attestationId) errors.push('temporal_attestation_self_hash_mismatch');
    } catch {
      errors.push('temporal_attestation_self_hash_invalid');
    }
  }
  return errors;
}

export function validateCalibrationHistoricalTemporalAttestation(
  value: unknown,
  evidence?: TemporalEvidenceVerificationV1,
): CalibrationAdmissionBlindTemporalValidationV1 {
  const errors = temporalShapeErrors(value);
  if (errors.length === 0 && evidence !== undefined) {
    const observation = (value as CalibrationHistoricalTemporalAttestationV1).independentExternalObservation;
    if (!isRecord(evidence)
      || typeof evidence.allReceiptsVerified !== 'boolean'
      || !sha(evidence.observedSha256)
      || !sortedUnique(evidence.evidenceIds, id)
      || !sortedUnique(evidence.evidenceReceiptIds, sha)) {
      errors.push('temporal_external_evidence_binding_invalid');
    } else {
      if (evidence.allReceiptsVerified !== true) errors.push('temporal_external_receipt_not_verified');
      if (observation.exactBlobOrContentSha256 !== evidence.observedSha256) errors.push('temporal_external_bytes_hash_mismatch');
      if (!sameJson([...observation.evidenceIds], [...evidence.evidenceIds])) errors.push('temporal_external_evidence_set_mismatch');
      if (!sameJson([...observation.evidenceReceiptIds], [...evidence.evidenceReceiptIds])) errors.push('temporal_external_receipt_set_mismatch');
    }
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

export function validateCalibrationHistoricalTemporalGold(
  value: unknown,
  evidence: TemporalEvidenceVerificationV1,
): CalibrationAdmissionBlindTemporalValidationV1 {
  const result = validateCalibrationHistoricalTemporalAttestation(value, evidence);
  const errors = [...result.errors];
  if (isRecord(value) && value.bulkImportOrigin !== 'ruled_out') errors.push('temporal_bulk_import_origin_indeterminate');
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

/**
 * Validate the generic two-decision -> post-decision receipt graph.  This
 * routine is intentionally in-memory and does not resolve evidence or do I/O.
 */
export function validateCalibrationAdmissionBlindReviewGraph(
  assignmentValue: unknown,
  decisions: readonly unknown[],
  receiptValue: unknown,
): CalibrationAdmissionBlindTemporalValidationV1 {
  const errors: string[] = [];
  if (!Array.isArray(decisions)) return { ok: false, errors: ['blind_review_decisions_invalid'] };
  if (!validAssignment(assignmentValue)) errors.push('blind_assignment_invalid');
  if (!validReceipt(receiptValue)) errors.push('blind_review_receipt_invalid');
  if (decisions.length !== 2) errors.push('blind_review_requires_exactly_two_decisions');
  if (errors.length > 0) return { ok: false, errors: [...new Set(errors)] };
  const assignment = assignmentValue as CalibrationAdmissionBlindAssignmentV1;
  const receipt = receiptValue as CalibrationAdmissionBlindReviewReceiptV1;
  const parsed = decisions.map((decision) => ({ decision, valid: validDecision(decision) }));
  if (parsed.some((entry) => !entry.valid)) errors.push('blind_decision_invalid');
  if (errors.length > 0) return { ok: false, errors: [...new Set(errors)] };
  const validDecisions = parsed.map((entry) => entry.decision as CalibrationAdmissionBlindDecisionV1);
  const decisionIds = validDecisions.map((decision) => decision.decisionId);
  const reviewerIds = validDecisions.map((decision) => decision.reviewerId);
  const decisionOrder = validDecisions.map((decision) => `${calibrationAdmissionCanonicalJson(decision.target)}\u0000${decision.reviewerId}`);
  if (decisionOrder.length === 2 && decisionOrder[0]! >= decisionOrder[1]!) errors.push('blind_decisions_not_canonical_order');
  if (!sortedUnique(reviewerIds, id) || !sameJson([...reviewerIds].sort(), [...assignment.reviewerIds])) errors.push('blind_reviewers_do_not_match_assignment');
  if (!sameJson([...new Set(decisionIds)].sort(), [...receipt.sealedDecisions].map((entry) => entry.decisionId).sort())) errors.push('blind_receipt_decision_set_mismatch');
  if (!sameJson([...new Set(reviewerIds)].sort(), [...receipt.sealedDecisions].map((entry) => entry.reviewerId).sort())) errors.push('blind_receipt_reviewer_set_mismatch');
  if (receipt.assignmentId !== assignment.assignmentId || receipt.evidenceSetSha256 !== assignment.evidenceSetSha256) errors.push('blind_receipt_assignment_binding_mismatch');
  if (assignment.target.kind === 'source' || assignment.target.kind === 'record') {
    const authorshipReviewers = new Set(validDecisions.filter((decision) => decision.reviewerRoles.includes('authorship')).map((decision) => decision.reviewerId));
    const rightsReviewers = new Set(validDecisions.filter((decision) => decision.reviewerRoles.includes('rights')).map((decision) => decision.reviewerId));
    const distinctRoleReviewers = [...authorshipReviewers].some((reviewerId) => [...rightsReviewers].some((rightsReviewerId) => rightsReviewerId !== reviewerId));
    if (authorshipReviewers.size === 0 || rightsReviewers.size === 0 || !distinctRoleReviewers) errors.push('blind_admission_decisions_do_not_cover_authorship_and_rights');
  }
  for (const decision of validDecisions) {
    if (decision.blindAssignmentId !== assignment.assignmentId) errors.push('blind_decision_assignment_mismatch');
    if (!sameJson(decision.target, assignment.target)) errors.push('blind_decision_target_mismatch');
    if (calibrationAdmissionSha256(decision.evidenceIds) !== assignment.evidenceSetSha256) errors.push('blind_decision_evidence_set_mismatch');
    if (decision.evidenceIds.includes(receipt.receiptId)) errors.push('blind_decision_references_future_receipt');
  }
  const sealedById = new Map(receipt.sealedDecisions.map((entry) => [entry.decisionId, entry]));
  for (const decision of validDecisions) {
    const sealed = sealedById.get(decision.decisionId);
    if (!sealed || sealed.reviewerId !== decision.reviewerId || sealed.peerDecisionVisibleBeforeSeal !== false) errors.push('blind_receipt_sealed_decision_mismatch');
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

/**
 * Validate a disagreement-resolution graph without broadening the peer
 * receipt.  The peer graph remains exactly two independent decisions; the
 * adjudicator gets a separate assignment, decision and receipt that bind the
 * prior receipt and both prior decision ids.
 */
export function validateCalibrationAdmissionAdjudicatorGraph(
  peerAssignmentValue: unknown,
  priorDecisions: readonly unknown[],
  peerReceiptValue: unknown,
  adjudicatorAssignmentValue: unknown,
  adjudicatorDecisionValue: unknown,
  adjudicatorReceiptValue: unknown,
): CalibrationAdmissionBlindTemporalValidationV1 {
  const errors: string[] = [];
  // The assignment stores prior decision IDs in sorted hash order, while the
  // peer graph's canonical JSONL order is target then reviewer.  Normalize the
  // decoded prior values before delegating so a valid ledger is not rejected
  // merely because those two deterministic orderings differ.
  const orderedPriorDecisions = Array.isArray(priorDecisions) && priorDecisions.every(validDecision)
    ? [...priorDecisions].sort((left, right) => {
      const leftValue = left as CalibrationAdmissionBlindDecisionV1;
      const rightValue = right as CalibrationAdmissionBlindDecisionV1;
      const leftKey = `${calibrationAdmissionCanonicalJson(leftValue.target)}\u0000${leftValue.reviewerId}`;
      const rightKey = `${calibrationAdmissionCanonicalJson(rightValue.target)}\u0000${rightValue.reviewerId}`;
      if (leftKey < rightKey) return -1;
      if (leftKey > rightKey) return 1;
      return 0;
    })
    : priorDecisions;
  const peerGraph = validateCalibrationAdmissionBlindReviewGraph(peerAssignmentValue, orderedPriorDecisions, peerReceiptValue);
  errors.push(...peerGraph.errors);

  const assignmentValid = validAdjudicatorAssignment(adjudicatorAssignmentValue);
  const decisionValid = validDecision(adjudicatorDecisionValue);
  const receiptValid = validAdjudicatorReceipt(adjudicatorReceiptValue);
  if (!assignmentValid) errors.push('adjudicator_assignment_invalid');
  if (!decisionValid) errors.push('adjudicator_decision_invalid');
  if (!receiptValid) errors.push('adjudicator_receipt_invalid');
  if (!Array.isArray(priorDecisions) || priorDecisions.length !== 2) {
    errors.push('adjudicator_requires_exactly_two_prior_decisions');
  }

  const peerAssignment = validAssignment(peerAssignmentValue) ? peerAssignmentValue : undefined;
  const peerReceipt = validReceipt(peerReceiptValue) ? peerReceiptValue : undefined;
  const parsedPrior = Array.isArray(orderedPriorDecisions)
    ? orderedPriorDecisions.map((decision) => ({ decision, valid: validDecision(decision) }))
    : [];
  if (parsedPrior.some((entry) => !entry.valid)) errors.push('adjudicator_prior_decision_invalid');
  if (!peerAssignment || !peerReceipt || !assignmentValid || !decisionValid || !receiptValid
    || parsedPrior.length !== 2 || parsedPrior.some((entry) => !entry.valid)) {
    return { ok: false, errors: [...new Set(errors)] };
  }

  const assignment = adjudicatorAssignmentValue as CalibrationAdmissionAdjudicatorAssignmentV1;
  const adjudicatorDecision = adjudicatorDecisionValue as CalibrationAdmissionBlindDecisionV1;
  const receipt = adjudicatorReceiptValue as CalibrationAdmissionAdjudicatorReceiptV1;
  const validPriorDecisions = parsedPrior.map((entry) => entry.decision as CalibrationAdmissionBlindDecisionV1);
  const priorDecisionIds = validPriorDecisions.map((decision) => decision.decisionId).sort();

  if (!sameJson(assignment.target, peerAssignment.target)) errors.push('adjudicator_assignment_target_mismatch');
  if (assignment.assignmentId === peerAssignment.assignmentId) errors.push('adjudicator_assignment_reuses_peer_assignment');
  if (assignment.priorBlindReviewReceiptId !== peerReceipt.receiptId) errors.push('adjudicator prior receipt mismatch');
  if (!sameJson([...assignment.priorDecisionIds], priorDecisionIds)) errors.push('adjudicator prior decision ids mismatch');
  if (new Set(validPriorDecisions.map((decision) => decision.decisionId)).size !== 2) errors.push('adjudicator prior decision ids are not unique');
  if (!assignment.evidenceIds.includes(assignment.priorDecisionIds[0]!)
    || !assignment.evidenceIds.includes(assignment.priorDecisionIds[1]!)) {
    errors.push('adjudicator evidence set omits a prior decision');
  }
  if (validPriorDecisions.some((decision) => decision.adjudicatesDecisionIds !== undefined)) {
    errors.push('adjudicator prior decision already adjudicates decisions');
  }
  const firstPrior = validPriorDecisions[0]!;
  const secondPrior = validPriorDecisions[1]!;
  if (sameJson(
    { result: firstPrior.result, reasons: firstPrior.reasons },
    { result: secondPrior.result, reasons: secondPrior.reasons },
  )) errors.push('adjudication requires conflicting prior decisions');

  const peerReviewerIds = new Set(peerAssignment.reviewerIds);
  if (peerReviewerIds.has(assignment.adjudicatorId)) errors.push('adjudicator must be distinct from peer reviewers');

  if (!sameJson(adjudicatorDecision.target, assignment.target)) errors.push('adjudicator decision target mismatch');
  if (adjudicatorDecision.blindAssignmentId !== assignment.assignmentId) errors.push('adjudicator decision assignment mismatch');
  if (adjudicatorDecision.reviewerId !== assignment.adjudicatorId) errors.push('adjudicator reviewer mismatch');
  if (peerReviewerIds.has(adjudicatorDecision.reviewerId)) errors.push('adjudicator reviewer must be distinct from peer reviewers');
  if (!adjudicatorDecision.reviewerRoles.includes('calibration')) errors.push('adjudicator reviewer role invalid');
  if (adjudicatorDecision.target.kind !== 'source' && adjudicatorDecision.target.kind !== 'record') {
    errors.push('adjudicator target must be admission-bearing');
  }
  if (!adjudicatorDecision.adjudicatesDecisionIds
    || !sameJson([...adjudicatorDecision.adjudicatesDecisionIds], [...assignment.priorDecisionIds])) {
    errors.push('adjudicator decision prior ids mismatch');
  }
  if (calibrationAdmissionSha256(adjudicatorDecision.evidenceIds) !== assignment.evidenceSetSha256
    || !sameJson([...adjudicatorDecision.evidenceIds], [...assignment.evidenceIds])) {
    errors.push('adjudicator decision evidence set mismatch');
  }
  if (adjudicatorDecision.evidenceIds.includes(receipt.receiptId)) errors.push('adjudicator decision references future receipt');

  if (receipt.receiptId === peerReceipt.receiptId) errors.push('adjudicator receipt reuses peer receipt id');
  if (receipt.assignmentId !== assignment.assignmentId) errors.push('adjudicator receipt assignment mismatch');
  if (!sameJson([...receipt.priorDecisionIds], [...assignment.priorDecisionIds])) errors.push('adjudicator receipt prior ids mismatch');
  if (receipt.priorBlindReviewReceiptId !== peerReceipt.receiptId) errors.push('adjudicator receipt prior receipt mismatch');
  if (receipt.evidenceSetSha256 !== assignment.evidenceSetSha256) errors.push('adjudicator receipt evidence set mismatch');
  if (receipt.adjudicationDecisionId !== adjudicatorDecision.decisionId) errors.push('adjudicator receipt decision mismatch');
  if (receipt.adjudicatorId !== assignment.adjudicatorId) errors.push('adjudicator receipt reviewer mismatch');
  if (receipt.priorPeerReceiptObservedBeforeAdjudication !== true) errors.push('adjudicator prior receipt was not observed before adjudication');

  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

export function validateCalibrationHistoricalTemporalReviewChain(
  attestationValue: unknown,
  assignmentValue: unknown,
  decisions: readonly unknown[],
  receiptValue: unknown,
  evidence: TemporalEvidenceVerificationV1,
): CalibrationAdmissionBlindTemporalValidationV1 {
  const errors: string[] = [];
  const attestationResult = validateCalibrationHistoricalTemporalGold(attestationValue, evidence);
  errors.push(...attestationResult.errors);
  if (!validAssignment(assignmentValue)) errors.push('blind_assignment_invalid');
  else if (!isCalibrationHistoricalTemporalAttestationV1(attestationValue)) errors.push('temporal_attestation_invalid');
  else {
    const assignment = assignmentValue as CalibrationAdmissionBlindAssignmentV1;
    const attestation = attestationValue as CalibrationHistoricalTemporalAttestationV1;
    if (assignment.target.kind !== 'temporal_attestation'
      || assignment.target.temporalAttestationId !== attestation.attestationId
      || assignment.target.exactBlobOrContentSha256 !== attestation.independentExternalObservation.exactBlobOrContentSha256) errors.push('temporal_assignment_target_mismatch');
  }
  const graph = validateCalibrationAdmissionBlindReviewGraph(assignmentValue, decisions, receiptValue);
  errors.push(...graph.errors);
  if (Array.isArray(decisions) && decisions.length === 2 && decisions.every(validDecision)) {
    for (const decision of decisions as readonly CalibrationAdmissionBlindDecisionV1[]) {
      if (resultDecision(decision.result) !== 'accepted') errors.push('temporal_review_not_accepted_by_both');
    }
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}
