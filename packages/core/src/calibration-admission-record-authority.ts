import { createHash } from 'node:crypto';

import {
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionSha256,
} from './calibration-admission-evidence';
import type { CalibrationAdmissionReasonV1 } from './calibration-admission-review';
import {
  isCalibrationAdmissionAdjudicatorAssignmentV1,
  isCalibrationAdmissionAdjudicatorReceiptV1,
  validateCalibrationAdmissionAdjudicatorGraph,
} from './calibration-admission-blind-temporal';
import type {
  CalibrationAdmissionAdjudicatorAssignmentV1,
  CalibrationAdmissionAdjudicatorReceiptV1,
} from './calibration-admission-blind-temporal';
import {
  exactKeys,
  isAdmissionId as id,
  isJsonRecord as isRecord,
  isSha256 as sha,
  sortedUniqueByPredicate as sortedUnique,
  withoutJsonKey as withoutKey,
} from './calibration-admission-primitives';

export { calibrationAdmissionCanonicalJson, calibrationAdmissionSha256 };

/**
 * Core-only contracts for the v10.3 admission record and blind-review slice.
 *
 * These contracts are published through the Core facade for the bounded
 * offline review/census diagnostic. They remain non-eligibility primitives:
 * callers must still supply the complete surrounding authority graph before a
 * record or decision can influence a future census.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ADMISSION_REASONS = new Set<CalibrationAdmissionReasonV1>([
  'source_unregistered', 'source_revision_mutable', 'source_bytes_unbound',
  'source_inventory_open', 'source_inventory_mismatch', 'aggregate_material_conservation_failed',
  'material_source_conflict', 'evidence_unresolved', 'evidence_receipt_stale',
  'record_container_projection_unsupported', 'materialization_unsupported', 'materialization_unverified',
  'materialization_receipt_stale', 'license_absent', 'license_scope_ambiguous', 'analysis_use_unresolved',
  'analysis_use_denied', 'redistribution_unresolved', 'redistribution_denied', 'third_party_rights_unresolved',
  'authorship_unproven', 'generator_identity_missing', 'generator_revision_missing', 'prompt_binding_missing',
  'output_binding_mismatch', 'human_edit_unknown', 'human_edit_substantial', 'human_provenance_missing',
  'historical_cutoff_failed', 'historical_attestation_missing', 'historical_graph_incomplete', 'mixed_authorship',
  'family_unknown', 'pair_incomplete', 'pair_content_unsafe', 'exact_cross_polarity_overlap',
  'near_cross_polarity_overlap', 'unpaired_family_cross_polarity', 'split_leakage', 'lineage_ledger_incomplete',
  'overlap_universe_incomplete', 'overlap_authority_incomplete', 'privacy_ledger_incomplete', 'quality_ledger_incomplete',
  'adapter_audit_mismatch', 'privacy_high_confidence', 'secret_high_confidence', 'privacy_review_unresolved',
  'syntax_invalid', 'language_normalizer_unsupported', 'scaffold_dominant', 'trivial_or_inert_target',
  'duplicate_record', 'blind_review_receipt_missing', 'witness_review_receipt_missing', 'review_incomplete',
  'review_disagreement', 'source_wide_quarantine',
]);

export type AdmissionRecordStratum = 'production' | 'test' | 'generated' | 'vendor' | 'minified' | 'example' | 'other';
export type AdmissionProposedLabel = 'verified_ai' | 'verified_human' | 'mixed' | 'quarantine';
export type AdmissionDisposition = 'eligible_gold' | 'eligible_sensitivity' | 'mixed_evaluation' | 'quarantine';

export interface CalibrationAdmissionRecordLocatorGitFileV103 {
  readonly kind: 'git_file';
  readonly materializationId: string;
  readonly normalizedPath: string;
}
export interface CalibrationAdmissionRecordLocatorReleaseArchiveFileV103 {
  readonly kind: 'release_archive_file';
  readonly materializationId: string;
  readonly normalizedPath: string;
}
export interface CalibrationAdmissionRecordLocatorContainerV103 {
  readonly kind: 'record_container';
  readonly materializationId: string;
  readonly containerSha256: string;
  readonly rowKey: string;
  readonly field: string;
}
export type CalibrationAdmissionRecordLocatorV103 =
  | CalibrationAdmissionRecordLocatorGitFileV103
  | CalibrationAdmissionRecordLocatorReleaseArchiveFileV103
  | CalibrationAdmissionRecordLocatorContainerV103;

export interface CalibrationAdmissionGeneratorEvidenceV103 {
  readonly generatorProvider: string;
  readonly model: string;
  readonly modelRevision:
    | { readonly status: 'pinned'; readonly value: string }
    | {
        readonly status: 'provider_not_exposed';
        readonly hostedServiceProductId: string;
        readonly provider: string;
        readonly modelAlias: string;
        readonly generationDate: string;
        readonly providerVersioningEvidenceId: string;
        readonly acceptingReviewerDecisionIds: readonly [string, string];
      };
  readonly promptTaskId: string;
  readonly promptSha256: string;
  readonly outputSha256: string;
  readonly generatedAt: string;
}
export interface CalibrationAdmissionGeneratorRecordAuthorshipV103 extends CalibrationAdmissionGeneratorEvidenceV103 {
  readonly kind: 'generator_record';
  readonly evidenceIds: readonly string[];
  readonly generatorSource:
    | { readonly kind: 'source_commit'; readonly commitSha: string }
    | { readonly kind: 'hosted_service' };
  readonly humanEditStatus: 'none' | 'light' | 'substantial' | 'unknown';
}
export interface CalibrationAdmissionBenchmarkAuthorshipV103 {
  readonly kind: 'benchmark_attestation';
  readonly evidenceIds: readonly string[];
  readonly benchmarkId: string;
  readonly benchmarkVersion: string;
  readonly exactUnitBinding: string;
  readonly attestedAuthorship: 'ai_generated' | 'human_written';
  readonly generator?: CalibrationAdmissionGeneratorEvidenceV103;
  readonly humanEditStatus: 'none' | 'light' | 'substantial' | 'unknown' | 'not_applicable';
}
export interface CalibrationAdmissionRepositoryAuthorshipV103 {
  readonly kind: 'repository_attestation';
  readonly evidenceIds: readonly string[];
  readonly scope: 'file' | 'directory' | 'repository';
  readonly generatorFamily: string;
  readonly humanEditStatus: 'none' | 'light' | 'substantial' | 'unknown';
}
export interface CalibrationAdmissionHistoricalAuthorshipV103 {
  readonly kind: 'historical_inference';
  readonly evidenceIds: readonly string[];
  readonly blobSha: string;
  readonly introducedAt: string;
  readonly lastChangedAt: string;
  readonly cutoff: '2020-01-01T00:00:00.000Z';
  readonly temporalAttestationId?: string;
}
export interface CalibrationAdmissionUnprovenAuthorshipV103 {
  readonly kind: 'unproven_claim';
  readonly evidenceIds: readonly string[];
  readonly declaredClaim: 'ai' | 'human' | 'mixed' | 'unknown';
  readonly missingFields: readonly string[];
}
export type CalibrationAdmissionAuthorshipV103 =
  | CalibrationAdmissionGeneratorRecordAuthorshipV103
  | CalibrationAdmissionBenchmarkAuthorshipV103
  | CalibrationAdmissionRepositoryAuthorshipV103
  | CalibrationAdmissionHistoricalAuthorshipV103
  | CalibrationAdmissionUnprovenAuthorshipV103;

export interface CalibrationAdmissionClaimedLineageV103 {
  readonly familyId: string;
  readonly pairGroupId?: string;
  readonly originRecordId: string;
  readonly exactClusterId: string;
  readonly nearClusterId: string;
}
export interface CalibrationAdmissionClaimedAuditsV103 {
  readonly syntax: 'pass' | 'fail' | 'unsupported';
  readonly scaffoldByteShare: number;
  readonly privacy: 'pass' | 'review' | 'fail';
  readonly secrets: 'pass' | 'review' | 'fail';
  readonly exactOverlap: 'pass' | 'fail';
  readonly nearOverlap: 'pass' | 'fail' | 'unsupported';
  readonly familyLeakage: 'pass' | 'fail';
  readonly pairIntegrity: 'pass' | 'fail' | 'not_applicable';
}

export interface CalibrationAdmissionRecordV103 {
  readonly version: 'v10.3-admission-record-v1';
  readonly recordId: string;
  readonly materialSourceId: string;
  readonly aggregateSourceIds: readonly string[];
  readonly sourceReviewSha256: string;
  readonly logicalUnitId: string;
  readonly locator: CalibrationAdmissionRecordLocatorV103;
  readonly contentSha256: string;
  readonly contentBytes: number;
  readonly language: string;
  readonly stratum: AdmissionRecordStratum;
  readonly proposedLabel: AdmissionProposedLabel;
  readonly authorship: CalibrationAdmissionAuthorshipV103;
  readonly claimedLineage: CalibrationAdmissionClaimedLineageV103;
  readonly claimedAudits: CalibrationAdmissionClaimedAuditsV103;
  readonly reviewerDecisionIds: readonly string[];
  readonly declaredDisposition: AdmissionDisposition;
  readonly rejectionReasons: readonly CalibrationAdmissionReasonV1[];
}

export interface CalibrationAdmissionRecordStreamV1 {
  readonly version: 'v10.3-admission-record-stream-v1';
  readonly relativePath: 'review/admission/admission-records.jsonl';
  readonly recordsJsonlSha256: string;
  readonly recordCount: number;
  readonly recordIdSetSha256: string;
  readonly canonicalRecordHashesSha256: string;
  readonly streamSha256: string;
}

export interface CalibrationAdmissionReviewSampleStratumV1 {
  readonly stratumId: AdmissionRecordStratum;
  readonly populationCount: number;
  readonly requestedCount: number;
}
export interface CalibrationAdmissionReviewSampleSelectedV1 {
  readonly logicalUnitId: string;
  readonly stratumId: AdmissionRecordStratum;
  readonly selectionKey: string;
  readonly presentationKey: string;
}
export interface CalibrationAdmissionReviewSampleV1 {
  readonly version: 'v10.3-admission-review-sample-v1';
  readonly sampleId: string;
  readonly sourceId: string;
  readonly seed: 'slopbrick-v10.3-admission-review-v1';
  readonly populationSha256: string;
  readonly populationCount: number;
  readonly strata: readonly CalibrationAdmissionReviewSampleStratumV1[];
  readonly selected: readonly CalibrationAdmissionReviewSampleSelectedV1[];
  readonly selectionSha256: string;
  readonly presentationOrderSha256: string;
  readonly toolReceiptSha256: string;
}

export type CalibrationAdmissionDecisionTargetV103 =
  | { readonly kind: 'source'; readonly sourceId: string }
  | { readonly kind: 'record'; readonly recordId: string }
  | { readonly kind: 'provider_revision_exception'; readonly recordId: string; readonly providerVersioningEvidenceId: string }
  | { readonly kind: 'witness'; readonly witnessSha256: string; readonly eligibilitySnapshotSha256: string; readonly verifiedContextSha256: string }
  | { readonly kind: 'temporal_attestation'; readonly temporalAttestationId: string; readonly exactBlobOrContentSha256: string };
export type CalibrationAdmissionDecisionResultV103 =
  | { readonly kind: 'admission'; readonly proposedLabel: AdmissionProposedLabel; readonly humanEditStatus: 'none' | 'light' | 'substantial' | 'unknown' | 'not_applicable'; readonly disposition: AdmissionDisposition }
  | { readonly kind: 'provider_revision_exception'; readonly decision: 'accepted' | 'rejected' }
  | { readonly kind: 'temporal_attestation'; readonly decision: 'accepted' | 'rejected' }
  | { readonly kind: 'witness'; readonly decision: 'approved' | 'rejected' };
export interface CalibrationAdmissionDecisionV103 {
  readonly version: 'v10.3-admission-decision-v1';
  readonly decisionId: string;
  readonly target: CalibrationAdmissionDecisionTargetV103;
  readonly reviewerId: string;
  readonly reviewerRoles: readonly ('authorship' | 'rights' | 'leakage_privacy' | 'calibration' | 'provenance')[];
  readonly evidenceIds: readonly string[];
  readonly blindAssignmentId: string;
  readonly adjudicatesDecisionIds?: readonly [string, string];
  readonly result: CalibrationAdmissionDecisionResultV103;
  readonly reasons: readonly CalibrationAdmissionReasonV1[];
  readonly decidedAt: string;
}

export interface CalibrationAdmissionBlindAssignmentV1 {
  readonly version: 'v10.3-admission-blind-assignment-v1';
  readonly assignmentId: string;
  readonly target: CalibrationAdmissionDecisionTargetV103;
  readonly evidenceSetSha256: string;
  readonly protocolEvidenceId: string;
  readonly reviewerIds: readonly [string, string];
  readonly peerMaterialHiddenUntilBothSealed: true;
}
export interface CalibrationAdmissionBlindReviewReceiptV1 {
  readonly version: 'v10.3-admission-blind-review-receipt-v1';
  readonly receiptId: string;
  readonly assignmentId: string;
  readonly evidenceSetSha256: string;
  readonly sealedDecisions: readonly [{ readonly reviewerId: string; readonly decisionId: string; readonly peerDecisionVisibleBeforeSeal: false }, { readonly reviewerId: string; readonly decisionId: string; readonly peerDecisionVisibleBeforeSeal: false }];
  readonly unsealedOnlyAfterBothDecisionIdsExisted: true;
  readonly protocolAuditorId: string;
  readonly protocolAuditEvidenceIds: readonly string[];
}
export interface CalibrationAdmissionDecisionLedgerV1 {
  readonly version: 'v10.3-admission-decision-ledger-v1';
  readonly ledgerId: string;
  readonly sourceId: string;
  readonly sourceReviewSha256: string;
  readonly admissionRecordSetSha256: string;
  readonly reviewSampleId?: string;
  readonly decisionJsonlSha256: string;
  readonly decisionIds: readonly string[];
  readonly blindAssignmentJsonlSha256: string;
  readonly blindAssignmentIds: readonly string[];
  readonly blindReviewReceiptJsonlSha256: string;
  readonly blindReviewReceiptIds: readonly string[];
  /** Optional dedicated adjudication assignment JSONL ledger. */
  readonly adjudicatorAssignmentJsonlSha256?: string;
  readonly adjudicatorAssignmentIds?: readonly string[];
  /** Optional dedicated adjudication receipt JSONL ledger. */
  readonly adjudicatorReceiptJsonlSha256?: string;
  readonly adjudicatorReceiptIds?: readonly string[];
  readonly adjudicationDecisionIds: readonly string[];
  readonly ledgerSha256: string;
}

export type CalibrationAdmissionSourceResolutionMapV1 = Readonly<Record<string, string>> | ReadonlyMap<string, string>;
export interface CalibrationAdmissionDecisionLedgerResolutionContextV1 {
  readonly recordSourceIds?: CalibrationAdmissionSourceResolutionMapV1;
  readonly sourceIdByRecordId?: CalibrationAdmissionSourceResolutionMapV1;
  readonly providerRevisionRecordSourceIds?: CalibrationAdmissionSourceResolutionMapV1;
  readonly temporalAttestationSourceIds?: CalibrationAdmissionSourceResolutionMapV1;
  readonly sourceIdByTemporalAttestationId?: CalibrationAdmissionSourceResolutionMapV1;
  readonly witnessSourceIds?: CalibrationAdmissionSourceResolutionMapV1;
  readonly sourceIdByWitnessSha256?: CalibrationAdmissionSourceResolutionMapV1;
}

export interface AdmissionContractValidationV1 {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

function nonEmpty(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
function integer(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
function iso(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}
function sameCanonical(left: unknown, right: unknown): boolean {
  try { return calibrationAdmissionCanonicalJson(left) === calibrationAdmissionCanonicalJson(right); } catch { return false; }
}
function result(ok: boolean, errors: string[] = []): AdmissionContractValidationV1 { return { ok, errors }; }
function push(ok: boolean, errors: string[], condition: boolean, message: string): boolean {
  if (!condition) errors.push(message);
  return ok && condition;
}

export function admissionRecordJsonl(values: readonly unknown[]): Buffer {
  return Buffer.from(values.map((value) => calibrationAdmissionCanonicalJson(value)).join('\n') + (values.length > 0 ? '\n' : ''), 'utf8');
}
function parseCanonicalJsonl(bytes: Uint8Array): { values?: unknown[]; error?: string } {
  const text = Buffer.from(bytes).toString('utf8');
  if (text.length === 0) return { values: [] };
  if (!text.endsWith('\n')) return { error: 'JSONL must end with exactly one newline' };
  const lines = text.slice(0, -1).split('\n');
  if (lines.some((line) => line.length === 0)) return { error: 'JSONL contains a blank line' };
  const values: unknown[] = [];
  for (const line of lines) {
    try {
      const value = JSON.parse(line) as unknown;
      if (!isRecord(value) || calibrationAdmissionCanonicalJson(value) !== line) return { error: 'JSONL line is not canonical JSON' };
      values.push(value);
    } catch { return { error: 'JSONL contains invalid JSON' }; }
  }
  return { values };
}

export function calibrationAdmissionRecordId(value: Pick<CalibrationAdmissionRecordV103, 'materialSourceId' | 'logicalUnitId' | 'locator' | 'contentSha256' | 'contentBytes' | 'language'> | Record<string, unknown>): string {
  return calibrationAdmissionSha256({
    materialSourceId: value.materialSourceId,
    logicalUnitId: value.logicalUnitId,
    locator: value.locator,
    contentSha256: value.contentSha256,
    contentBytes: value.contentBytes,
    language: value.language,
  });
}

export function admissionRecordStreamSha256(value: Omit<CalibrationAdmissionRecordStreamV1, 'streamSha256'> | Record<string, unknown>): string {
  return calibrationAdmissionSha256(withoutKey(value, 'streamSha256'));
}
export function admissionRecordStreamContentSha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function calibrationAdmissionReviewSampleSelectionKey(sourceId: string, logicalUnitId: string, _stratumId: string): string {
  // The selection key is deliberately the byte-level protocol string from the
  // v10.3 plan; strata affect quotas, not the per-unit ordering key.
  return createHash('sha256').update(`slopbrick-v10.3-admission-review-v1\u0000${sourceId}\u0000${logicalUnitId}`, 'utf8').digest('hex');
}
export function calibrationAdmissionReviewSamplePresentationKey(sourceId: string, logicalUnitId: string, stratumId: string): string {
  return calibrationAdmissionSha256({ domain: 'v10.3-admission-review-presentation-v1', seed: 'slopbrick-v10.3-admission-review-v1', sourceId, logicalUnitId, stratumId });
}
export function calibrationAdmissionDecisionId(value: Omit<CalibrationAdmissionDecisionV103, 'decisionId'> | Record<string, unknown>): string {
  return calibrationAdmissionSha256(withoutKey(value, 'decisionId'));
}
export function calibrationAdmissionBlindAssignmentId(value: Omit<CalibrationAdmissionBlindAssignmentV1, 'assignmentId'> | Record<string, unknown>): string {
  return calibrationAdmissionSha256(withoutKey(value, 'assignmentId'));
}
export function calibrationAdmissionBlindReviewReceiptId(value: Omit<CalibrationAdmissionBlindReviewReceiptV1, 'receiptId'> | Record<string, unknown>): string {
  return calibrationAdmissionSha256(withoutKey(value, 'receiptId'));
}
export function admissionDecisionLedgerSha256(value: Omit<CalibrationAdmissionDecisionLedgerV1, 'ledgerSha256'> | Record<string, unknown>): string {
  return calibrationAdmissionSha256(withoutKey(value, 'ledgerSha256'));
}

function validRelativePath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !value.includes('\\') && !value.split('/').some((part) => part === '' || part === '.' || part === '..');
}

function validateLocator(value: unknown, errors: string[]): boolean {
  if (!isRecord(value) || typeof value.kind !== 'string') { errors.push('locator must be an object'); return false; }
  if (value.kind === 'git_file' || value.kind === 'release_archive_file') {
    const ok = exactKeys(value, ['kind', 'materializationId', 'normalizedPath']);
    push(ok, errors, id(value.materializationId), 'locator.materializationId must be an id');
    push(ok, errors, validRelativePath(value.normalizedPath), 'locator.normalizedPath must be relative and normalized');
    return ok && id(value.materializationId) && validRelativePath(value.normalizedPath);
  }
  if (value.kind === 'record_container') {
    const ok = exactKeys(value, ['kind', 'materializationId', 'containerSha256', 'rowKey', 'field']);
    push(ok, errors, id(value.materializationId), 'locator.materializationId must be an id');
    push(ok, errors, sha(value.containerSha256), 'locator.containerSha256 must be sha256');
    push(ok, errors, nonEmpty(value.rowKey), 'locator.rowKey must be non-empty');
    push(ok, errors, nonEmpty(value.field), 'locator.field must be non-empty');
    return ok && id(value.materializationId) && sha(value.containerSha256) && nonEmpty(value.rowKey) && nonEmpty(value.field);
  }
  errors.push('locator.kind is unknown');
  return false;
}

function validateGeneratorEvidence(value: unknown, errors: string[]): boolean {
  if (!isRecord(value)) { errors.push('generator evidence must be an object'); return false; }
  const ok = exactKeys(value, ['generatorProvider', 'model', 'modelRevision', 'promptTaskId', 'promptSha256', 'outputSha256', 'generatedAt']);
  push(ok, errors, nonEmpty(value.generatorProvider), 'generatorProvider must be non-empty');
  push(ok, errors, nonEmpty(value.model), 'model must be non-empty');
  if (isRecord(value.modelRevision)) {
    if (value.modelRevision.status === 'pinned') {
      const revisionOk = exactKeys(value.modelRevision, ['status', 'value']);
      push(ok, errors, nonEmpty(value.modelRevision.value), 'pinned revision value must be non-empty');
      if (!revisionOk) errors.push('modelRevision has unexpected keys');
    } else if (value.modelRevision.status === 'provider_not_exposed') {
      const exceptionOk = exactKeys(value.modelRevision, ['status', 'hostedServiceProductId', 'provider', 'modelAlias', 'generationDate', 'providerVersioningEvidenceId', 'acceptingReviewerDecisionIds']);
      push(ok, errors, nonEmpty(value.modelRevision.hostedServiceProductId), 'hostedServiceProductId must be non-empty');
      push(ok, errors, nonEmpty(value.modelRevision.provider), 'provider must be non-empty');
      push(ok, errors, nonEmpty(value.modelRevision.modelAlias), 'modelAlias must be non-empty');
      push(ok, errors, iso(value.modelRevision.generationDate), 'generationDate must be an ISO timestamp');
      push(ok, errors, id(value.modelRevision.providerVersioningEvidenceId), 'providerVersioningEvidenceId must be an id');
      push(ok, errors, Array.isArray(value.modelRevision.acceptingReviewerDecisionIds) && value.modelRevision.acceptingReviewerDecisionIds.length === 2 && value.modelRevision.acceptingReviewerDecisionIds.every(sha) && value.modelRevision.acceptingReviewerDecisionIds[0] !== value.modelRevision.acceptingReviewerDecisionIds[1], 'acceptingReviewerDecisionIds must contain two distinct decisions');
      if (!exceptionOk) errors.push('provider_not_exposed revision has unexpected keys');
    } else errors.push('modelRevision.status is unknown');
  } else errors.push('modelRevision must be an object');
  push(ok, errors, nonEmpty(value.promptTaskId), 'promptTaskId must be non-empty');
  push(ok, errors, sha(value.promptSha256), 'promptSha256 must be sha256');
  push(ok, errors, sha(value.outputSha256), 'outputSha256 must be sha256');
  push(ok, errors, iso(value.generatedAt), 'generatedAt must be an ISO timestamp');
  return ok && nonEmpty(value.generatorProvider) && nonEmpty(value.model) && isRecord(value.modelRevision)
    && (value.modelRevision.status === 'provider_not_exposed' || (value.modelRevision.status === 'pinned' && nonEmpty(value.modelRevision.value)))
    && nonEmpty(value.promptTaskId) && sha(value.promptSha256) && sha(value.outputSha256) && iso(value.generatedAt);
}

function validateAuthorship(value: unknown, errors: string[]): boolean {
  if (!isRecord(value) || typeof value.kind !== 'string') { errors.push('authorship must be an object'); return false; }
  const evidenceOk = sortedUnique(value.evidenceIds, id, false);
  if (!evidenceOk) errors.push('authorship.evidenceIds must be sorted unique ids');
  if (value.kind === 'generator_record') {
    const ok = exactKeys(value, ['kind', 'evidenceIds', 'generatorProvider', 'model', 'modelRevision', 'generatorSource', 'promptTaskId', 'promptSha256', 'outputSha256', 'generatedAt', 'humanEditStatus']);
    const generatorOk = validateGeneratorEvidence({ generatorProvider: value.generatorProvider, model: value.model, modelRevision: value.modelRevision, promptTaskId: value.promptTaskId, promptSha256: value.promptSha256, outputSha256: value.outputSha256, generatedAt: value.generatedAt }, errors);
    const sourceOk = isRecord(value.generatorSource)
      && ((value.generatorSource.kind === 'source_commit' && exactKeys(value.generatorSource, ['kind', 'commitSha']) && sha(value.generatorSource.commitSha))
        || (value.generatorSource.kind === 'hosted_service' && exactKeys(value.generatorSource, ['kind'])));
    const editOk = value.humanEditStatus === 'none' || value.humanEditStatus === 'light' || value.humanEditStatus === 'substantial' || value.humanEditStatus === 'unknown';
    push(ok, errors, sourceOk, 'generatorSource is invalid'); push(ok, errors, editOk, 'humanEditStatus is invalid');
    return ok && evidenceOk && generatorOk && sourceOk && editOk;
  }
  if (value.kind === 'benchmark_attestation') {
    const ok = exactKeys(value, ['kind', 'evidenceIds', 'benchmarkId', 'benchmarkVersion', 'exactUnitBinding', 'attestedAuthorship', 'generator', 'humanEditStatus'])
      || exactKeys(value, ['kind', 'evidenceIds', 'benchmarkId', 'benchmarkVersion', 'exactUnitBinding', 'attestedAuthorship', 'humanEditStatus']);
    const authoredOk = value.attestedAuthorship === 'ai_generated' || value.attestedAuthorship === 'human_written';
    const editOk = value.humanEditStatus === 'none' || value.humanEditStatus === 'light' || value.humanEditStatus === 'substantial' || value.humanEditStatus === 'unknown' || value.humanEditStatus === 'not_applicable';
    push(ok, errors, nonEmpty(value.benchmarkId), 'benchmarkId must be non-empty'); push(ok, errors, nonEmpty(value.benchmarkVersion), 'benchmarkVersion must be non-empty');
    push(ok, errors, nonEmpty(value.exactUnitBinding), 'exactUnitBinding must be non-empty'); push(ok, errors, authoredOk, 'attestedAuthorship is invalid'); push(ok, errors, editOk, 'humanEditStatus is invalid');
    const generatorOk = value.generator === undefined || validateGeneratorEvidence(value.generator, errors);
    const branchOk = value.attestedAuthorship === 'ai_generated' ? generatorOk && value.generator !== undefined && value.humanEditStatus !== 'not_applicable' : value.generator === undefined && value.humanEditStatus === 'not_applicable';
    if (!branchOk) errors.push('benchmark authorship generator/human-edit binding is invalid');
    return ok && evidenceOk && nonEmpty(value.benchmarkId) && nonEmpty(value.benchmarkVersion) && nonEmpty(value.exactUnitBinding) && authoredOk && editOk && branchOk;
  }
  if (value.kind === 'repository_attestation') {
    const ok = exactKeys(value, ['kind', 'evidenceIds', 'scope', 'generatorFamily', 'humanEditStatus']);
    const scopeOk = value.scope === 'file' || value.scope === 'directory' || value.scope === 'repository';
    const editOk = value.humanEditStatus === 'none' || value.humanEditStatus === 'light' || value.humanEditStatus === 'substantial' || value.humanEditStatus === 'unknown';
    push(ok, errors, scopeOk, 'repository scope is invalid'); push(ok, errors, nonEmpty(value.generatorFamily), 'generatorFamily must be non-empty'); push(ok, errors, editOk, 'humanEditStatus is invalid');
    return ok && evidenceOk && scopeOk && nonEmpty(value.generatorFamily) && editOk;
  }
  if (value.kind === 'historical_inference') {
    const ok = exactKeys(value, ['kind', 'evidenceIds', 'blobSha', 'introducedAt', 'lastChangedAt', 'cutoff', 'temporalAttestationId'])
      || exactKeys(value, ['kind', 'evidenceIds', 'blobSha', 'introducedAt', 'lastChangedAt', 'cutoff']);
    push(ok, errors, sha(value.blobSha), 'historical blobSha must be sha256');
    push(ok, errors, iso(value.introducedAt) && iso(value.lastChangedAt) && value.cutoff === '2020-01-01T00:00:00.000Z', 'historical timestamps/cutoff are invalid');
    if (value.temporalAttestationId !== undefined) push(ok, errors, id(value.temporalAttestationId), 'temporalAttestationId must be an id');
    return ok && evidenceOk && sha(value.blobSha) && iso(value.introducedAt) && iso(value.lastChangedAt) && value.cutoff === '2020-01-01T00:00:00.000Z' && (value.temporalAttestationId === undefined || id(value.temporalAttestationId));
  }
  if (value.kind === 'unproven_claim') {
    const ok = exactKeys(value, ['kind', 'evidenceIds', 'declaredClaim', 'missingFields']);
    const claimOk = value.declaredClaim === 'ai' || value.declaredClaim === 'human' || value.declaredClaim === 'mixed' || value.declaredClaim === 'unknown';
    const missingOk = Array.isArray(value.missingFields) && value.missingFields.length > 0 && value.missingFields.every(nonEmpty);
    push(ok, errors, claimOk, 'declaredClaim is invalid'); push(ok, errors, missingOk, 'missingFields must be non-empty');
    return ok && evidenceOk && claimOk && missingOk;
  }
  errors.push('authorship.kind is unknown');
  return false;
}

function validStratum(value: unknown): value is AdmissionRecordStratum {
  return value === 'production' || value === 'test' || value === 'generated' || value === 'vendor' || value === 'minified' || value === 'example' || value === 'other';
}
function validLabel(value: unknown): value is AdmissionProposedLabel {
  return value === 'verified_ai' || value === 'verified_human' || value === 'mixed' || value === 'quarantine';
}
function validDisposition(value: unknown): value is AdmissionDisposition {
  return value === 'eligible_gold' || value === 'eligible_sensitivity' || value === 'mixed_evaluation' || value === 'quarantine';
}

export function validateCalibrationAdmissionRecordV103(value: unknown): AdmissionContractValidationV1 {
  const errors: string[] = [];
  if (!isRecord(value)) return result(false, ['record must be an object']);
  const okShape = exactKeys(value, ['version', 'recordId', 'materialSourceId', 'aggregateSourceIds', 'sourceReviewSha256', 'logicalUnitId', 'locator', 'contentSha256', 'contentBytes', 'language', 'stratum', 'proposedLabel', 'authorship', 'claimedLineage', 'claimedAudits', 'reviewerDecisionIds', 'declaredDisposition', 'rejectionReasons']);
  push(okShape, errors, value.version === 'v10.3-admission-record-v1', 'record version is invalid');
  push(okShape, errors, sha(value.recordId), 'recordId must be sha256');
  push(okShape, errors, id(value.materialSourceId), 'materialSourceId must be an id');
  push(okShape, errors, sortedUnique(value.aggregateSourceIds, id, false), 'aggregateSourceIds must be sorted unique ids');
  push(okShape, errors, sha(value.sourceReviewSha256), 'sourceReviewSha256 must be sha256');
  push(okShape, errors, id(value.logicalUnitId), 'logicalUnitId must be an id');
  const locatorOk = validateLocator(value.locator, errors);
  push(okShape, errors, sha(value.contentSha256), 'contentSha256 must be sha256');
  push(okShape, errors, integer(value.contentBytes), 'contentBytes must be a non-negative safe integer');
  push(okShape, errors, nonEmpty(value.language), 'language must be non-empty');
  push(okShape, errors, validStratum(value.stratum), 'stratum is invalid');
  push(okShape, errors, validLabel(value.proposedLabel), 'proposedLabel is invalid');
  const authorshipOk = validateAuthorship(value.authorship, errors);
  if (isRecord(value.authorship)) {
    if (value.authorship.kind === 'benchmark_attestation') {
      const expectedLabel = value.authorship.attestedAuthorship === 'ai_generated' ? 'verified_ai' : 'verified_human';
      push(okShape, errors, value.proposedLabel === expectedLabel, 'benchmark authorship and proposedLabel disagree');
      if (isRecord(value.authorship.generator)) push(okShape, errors, value.authorship.generator.outputSha256 === value.contentSha256, 'benchmark generator output hash does not match content');
    }
    if (value.authorship.kind === 'generator_record') {
      push(okShape, errors, value.authorship.outputSha256 === value.contentSha256, 'generator output hash does not match content');
    }
    if (value.authorship.kind === 'unproven_claim') {
      push(okShape, errors, value.declaredDisposition === 'quarantine', 'unproven authorship must remain quarantined');
    }
  }
  if (isRecord(value.claimedLineage)) {
    const lineageShape = exactKeys(value.claimedLineage, ['familyId', 'pairGroupId', 'originRecordId', 'exactClusterId', 'nearClusterId']) || exactKeys(value.claimedLineage, ['familyId', 'originRecordId', 'exactClusterId', 'nearClusterId']);
    push(okShape, errors, lineageShape, 'claimedLineage has unexpected keys');
    push(okShape, errors, id(value.claimedLineage.familyId), 'lineage.familyId must be an id');
    if (value.claimedLineage.pairGroupId !== undefined) push(okShape, errors, id(value.claimedLineage.pairGroupId), 'lineage.pairGroupId must be an id');
    push(okShape, errors, sha(value.claimedLineage.originRecordId), 'lineage.originRecordId must be a record id');
    push(okShape, errors, id(value.claimedLineage.exactClusterId), 'lineage.exactClusterId must be an id');
    push(okShape, errors, id(value.claimedLineage.nearClusterId), 'lineage.nearClusterId must be an id');
  } else errors.push('claimedLineage must be an object');
  if (isRecord(value.claimedAudits)) {
    const auditShape = exactKeys(value.claimedAudits, ['syntax', 'scaffoldByteShare', 'privacy', 'secrets', 'exactOverlap', 'nearOverlap', 'familyLeakage', 'pairIntegrity']);
    push(okShape, errors, auditShape, 'claimedAudits has unexpected keys');
    for (const field of ['syntax', 'privacy', 'secrets', 'exactOverlap', 'nearOverlap', 'familyLeakage', 'pairIntegrity']) push(okShape, errors, value.claimedAudits[field] === 'pass' || value.claimedAudits[field] === 'fail' || (field === 'syntax' && value.claimedAudits[field] === 'unsupported') || (field === 'privacy' && value.claimedAudits[field] === 'review') || (field === 'secrets' && value.claimedAudits[field] === 'review') || (field === 'nearOverlap' && value.claimedAudits[field] === 'unsupported') || (field === 'pairIntegrity' && value.claimedAudits[field] === 'not_applicable'), 'audit value is invalid');
    push(okShape, errors, typeof value.claimedAudits.scaffoldByteShare === 'number' && Number.isFinite(value.claimedAudits.scaffoldByteShare) && value.claimedAudits.scaffoldByteShare >= 0 && value.claimedAudits.scaffoldByteShare <= 1, 'scaffoldByteShare must be in [0,1]');
  } else errors.push('claimedAudits must be an object');
  push(okShape, errors, sortedUnique(value.reviewerDecisionIds, sha), 'reviewerDecisionIds must be sorted unique decision hashes');
  push(okShape, errors, validDisposition(value.declaredDisposition), 'declaredDisposition is invalid');
  const reasonsOk = sortedUnique(value.rejectionReasons, (entry) => typeof entry === 'string' && ADMISSION_REASONS.has(entry as CalibrationAdmissionReasonV1));
  push(okShape, errors, reasonsOk, 'rejectionReasons must be sorted known reasons');
  const expectedId = calibrationAdmissionRecordId(value as Record<string, unknown>);
  push(okShape, errors, value.recordId === expectedId, 'recordId does not match immutable identity fields');
  return result(okShape && errors.length === 0, errors);
}
export function isCalibrationAdmissionRecordV103(value: unknown): value is CalibrationAdmissionRecordV103 {
  return validateCalibrationAdmissionRecordV103(value).ok;
}

export function validateCalibrationAdmissionRecordStreamV1(value: unknown, bytes?: Uint8Array, records?: readonly unknown[]): AdmissionContractValidationV1 {
  const errors: string[] = [];
  if (!isRecord(value)) return result(false, ['stream must be an object']);
  const shape = exactKeys(value, ['version', 'relativePath', 'recordsJsonlSha256', 'recordCount', 'recordIdSetSha256', 'canonicalRecordHashesSha256', 'streamSha256']);
  push(shape, errors, value.version === 'v10.3-admission-record-stream-v1', 'stream version is invalid');
  push(shape, errors, value.relativePath === 'review/admission/admission-records.jsonl', 'stream relativePath is invalid');
  push(shape, errors, sha(value.recordsJsonlSha256), 'recordsJsonlSha256 must be sha256');
  push(shape, errors, integer(value.recordCount), 'recordCount must be a non-negative integer');
  push(shape, errors, sha(value.recordIdSetSha256), 'recordIdSetSha256 must be sha256');
  push(shape, errors, sha(value.canonicalRecordHashesSha256), 'canonicalRecordHashesSha256 must be sha256');
  push(shape, errors, sha(value.streamSha256), 'streamSha256 must be sha256');
  push(shape, errors, value.streamSha256 === admissionRecordStreamSha256(value), 'streamSha256 does not match content');
  if (bytes !== undefined) {
    const parsed = parseCanonicalJsonl(bytes);
    if (parsed.error) errors.push(parsed.error);
    const parsedValues = parsed.values ?? [];
    push(shape, errors, admissionRecordStreamContentSha256(bytes) === value.recordsJsonlSha256, 'recordsJsonlSha256 does not match bytes');
    push(shape, errors, parsedValues.length === value.recordCount, 'recordCount does not match JSONL');
    if (records !== undefined) push(shape, errors, sameCanonical(parsedValues, records), 'supplied records do not match JSONL');
    const recordIds: string[] = [];
    const recordHashes: string[] = [];
    let allRecords = true;
    for (const entry of parsedValues) {
      const validation = validateCalibrationAdmissionRecordV103(entry);
      if (!validation.ok) { allRecords = false; errors.push(...validation.errors.map((error) => 'record: ' + error)); continue; }
      const record = entry as CalibrationAdmissionRecordV103;
      recordIds.push(record.recordId); recordHashes.push(calibrationAdmissionSha256(record));
    }
    push(shape, errors, allRecords, 'stream contains invalid records');
    const sortedIds = [...recordIds].sort();
    const sortedHashes = [...recordHashes].sort();
    push(shape, errors, recordIds.every((idValue, index) => index === 0 || sortedIds[index - 1]! < idValue) && sameCanonical(recordIds, sortedIds), 'records must be ordered by recordId');
    push(shape, errors, calibrationAdmissionSha256(sortedIds) === value.recordIdSetSha256, 'recordIdSetSha256 does not match records');
    push(shape, errors, calibrationAdmissionSha256(sortedHashes) === value.canonicalRecordHashesSha256, 'canonicalRecordHashesSha256 does not match records');
  }
  return result(shape && errors.length === 0, errors);
}
export function isCalibrationAdmissionRecordStreamV1(value: unknown): value is CalibrationAdmissionRecordStreamV1 {
  return validateCalibrationAdmissionRecordStreamV1(value).ok;
}

export function validateCalibrationAdmissionReviewSampleV1(value: unknown, population?: readonly { readonly logicalUnitId: string; readonly stratumId: string }[]): AdmissionContractValidationV1 {
  const errors: string[] = [];
  if (!isRecord(value)) return result(false, ['sample must be an object']);
  const shape = exactKeys(value, ['version', 'sampleId', 'sourceId', 'seed', 'populationSha256', 'populationCount', 'strata', 'selected', 'selectionSha256', 'presentationOrderSha256', 'toolReceiptSha256']);
  push(shape, errors, value.version === 'v10.3-admission-review-sample-v1', 'sample version is invalid');
  push(shape, errors, id(value.sampleId), 'sampleId must be an id'); push(shape, errors, id(value.sourceId), 'sourceId must be an id');
  push(shape, errors, value.seed === 'slopbrick-v10.3-admission-review-v1', 'sample seed is invalid'); push(shape, errors, sha(value.populationSha256), 'populationSha256 must be sha256');
  push(shape, errors, integer(value.populationCount), 'populationCount must be a non-negative integer'); push(shape, errors, sha(value.selectionSha256), 'selectionSha256 must be sha256');
  push(shape, errors, sha(value.presentationOrderSha256), 'presentationOrderSha256 must be sha256'); push(shape, errors, sha(value.toolReceiptSha256), 'toolReceiptSha256 must be sha256');
  const strata = Array.isArray(value.strata) ? value.strata : [];
  let stratumCount = 0;
  let strataOk = Array.isArray(value.strata) && strata.length > 0;
  let previousStratum = '';
  const requested = new Map<string, number>();
  for (const entry of strata) {
    if (!isRecord(entry) || !exactKeys(entry, ['stratumId', 'populationCount', 'requestedCount']) || !validStratum(entry.stratumId) || !integer(entry.populationCount) || !integer(entry.requestedCount) || entry.requestedCount > entry.populationCount || String(entry.stratumId) <= previousStratum) strataOk = false;
    if (isRecord(entry) && validStratum(entry.stratumId) && integer(entry.populationCount) && integer(entry.requestedCount)) {
      stratumCount += entry.populationCount; requested.set(entry.stratumId, entry.requestedCount); previousStratum = entry.stratumId;
    }
  }
  push(shape, errors, strataOk, 'strata must be sorted, unique, and bounded'); push(shape, errors, stratumCount === value.populationCount, 'strata population counts do not sum to populationCount');
  const selected = Array.isArray(value.selected) ? value.selected : [];
  let selectedOk = Array.isArray(value.selected);
  let previousPresentation = '';
  const selectedKeys = new Set<string>();
  const selections: Array<{ logicalUnitId: string; stratumId: string; selectionKey: string }> = [];
  const presentations: Array<{ logicalUnitId: string; stratumId: string; presentationKey: string }> = [];
  const counts = new Map<string, number>();
  for (const entry of selected) {
    const validEntry = isRecord(entry) && exactKeys(entry, ['logicalUnitId', 'stratumId', 'selectionKey', 'presentationKey']) && id(entry.logicalUnitId) && validStratum(entry.stratumId) && sha(entry.selectionKey) && sha(entry.presentationKey);
    if (!validEntry) { selectedOk = false; continue; }
    const selectedEntry = entry as { logicalUnitId: string; stratumId: AdmissionRecordStratum; selectionKey: string; presentationKey: string };
    const selectionKey = calibrationAdmissionReviewSampleSelectionKey(value.sourceId as string, selectedEntry.logicalUnitId, selectedEntry.stratumId);
    const presentationKey = calibrationAdmissionReviewSamplePresentationKey(value.sourceId as string, selectedEntry.logicalUnitId, selectedEntry.stratumId);
    if (selectedEntry.selectionKey !== selectionKey || selectedEntry.presentationKey !== presentationKey || selectedEntry.presentationKey <= previousPresentation || selectedKeys.has(selectedEntry.logicalUnitId)) selectedOk = false;
    if (!requested.has(selectedEntry.stratumId) || (counts.get(selectedEntry.stratumId) ?? 0) >= requested.get(selectedEntry.stratumId)!) selectedOk = false;
    selectedKeys.add(selectedEntry.logicalUnitId); counts.set(selectedEntry.stratumId, (counts.get(selectedEntry.stratumId) ?? 0) + 1); previousPresentation = selectedEntry.presentationKey;
    selections.push({ logicalUnitId: selectedEntry.logicalUnitId, stratumId: selectedEntry.stratumId, selectionKey: selectedEntry.selectionKey });
    presentations.push({ logicalUnitId: selectedEntry.logicalUnitId, stratumId: selectedEntry.stratumId, presentationKey: selectedEntry.presentationKey });
  }
  for (const [stratumId, count] of counts) if (!requested.has(stratumId) || count > requested.get(stratumId)!) selectedOk = false;
  for (const [stratumId, requestedCount] of requested) {
    if ((counts.get(stratumId) ?? 0) !== requestedCount) selectedOk = false;
  }
  push(shape, errors, selectedOk, 'selected entries have invalid keys or counts');
  push(shape, errors, calibrationAdmissionSha256(selections.slice().sort((left, right) => left.logicalUnitId.localeCompare(right.logicalUnitId))) === value.selectionSha256, 'selectionSha256 does not match selected entries');
  push(shape, errors, calibrationAdmissionSha256(presentations) === value.presentationOrderSha256, 'presentationOrderSha256 does not match selected entries');
  if (population !== undefined) {
    const populationEntries: Array<{ logicalUnitId: string; stratumId: AdmissionRecordStratum }> = [];
    let populationOk = Array.isArray(population);
    for (const entry of Array.isArray(population) ? population : []) {
      if (!isRecord(entry) || !id(entry.logicalUnitId) || !validStratum(entry.stratumId)) {
        populationOk = false;
        continue;
      }
      populationEntries.push({ logicalUnitId: entry.logicalUnitId, stratumId: entry.stratumId });
    }
    push(shape, errors, populationOk && new Set(populationEntries.map((entry) => entry.logicalUnitId + '\u0000' + entry.stratumId)).size === populationEntries.length, 'population entries must be valid and unique');
    push(shape, errors, populationEntries.length === value.populationCount, 'population length does not match populationCount');
    push(shape, errors, calibrationAdmissionSha256(populationEntries) === value.populationSha256, 'populationSha256 does not match population');
    const available = new Set(populationEntries.map((entry) => entry.logicalUnitId + '\u0000' + entry.stratumId));
    for (const entry of selected) if (isRecord(entry)) push(shape, errors, available.has(String(entry.logicalUnitId) + '\u0000' + String(entry.stratumId)), 'selected entry is outside population');
    for (const [stratumId, requestedCount] of requested) {
      const expected = populationEntries
        .filter((entry) => entry.stratumId === stratumId)
        .map((entry) => ({ ...entry, selectionKey: calibrationAdmissionReviewSampleSelectionKey(value.sourceId as string, entry.logicalUnitId, entry.stratumId) }))
        .sort((left, right) => left.selectionKey.localeCompare(right.selectionKey) || left.logicalUnitId.localeCompare(right.logicalUnitId))
        .slice(0, requestedCount)
        .map((entry) => entry.logicalUnitId)
        .sort();
      const actual = selected
        .filter((entry) => isRecord(entry) && entry.stratumId === stratumId)
        .map((entry) => String(entry.logicalUnitId))
        .sort();
      push(shape, errors, sameCanonical(expected, actual), 'selected entries are not the smallest selection keys for each stratum');
    }
  }
  return result(shape && errors.length === 0, errors);
}
export function isCalibrationAdmissionReviewSampleV1(value: unknown): value is CalibrationAdmissionReviewSampleV1 { return validateCalibrationAdmissionReviewSampleV1(value).ok; }

function validateDecisionTarget(value: unknown, errors: string[]): boolean {
  if (!isRecord(value) || typeof value.kind !== 'string') { errors.push('decision target must be an object'); return false; }
  if (value.kind === 'source') return exactKeys(value, ['kind', 'sourceId']) && id(value.sourceId);
  if (value.kind === 'record') return exactKeys(value, ['kind', 'recordId']) && sha(value.recordId);
  if (value.kind === 'provider_revision_exception') return exactKeys(value, ['kind', 'recordId', 'providerVersioningEvidenceId']) && sha(value.recordId) && id(value.providerVersioningEvidenceId);
  if (value.kind === 'witness') return exactKeys(value, ['kind', 'witnessSha256', 'eligibilitySnapshotSha256', 'verifiedContextSha256']) && sha(value.witnessSha256) && sha(value.eligibilitySnapshotSha256) && sha(value.verifiedContextSha256);
  if (value.kind === 'temporal_attestation') return exactKeys(value, ['kind', 'temporalAttestationId', 'exactBlobOrContentSha256']) && sha(value.temporalAttestationId) && sha(value.exactBlobOrContentSha256);
  errors.push('decision target kind is unknown');
  return false;
}

function validateDecisionResult(value: unknown, errors: string[]): boolean {
  if (!isRecord(value) || typeof value.kind !== 'string') { errors.push('decision result must be an object'); return false; }
  if (value.kind === 'admission') {
    const ok = exactKeys(value, ['kind', 'proposedLabel', 'humanEditStatus', 'disposition']);
    push(ok, errors, validLabel(value.proposedLabel), 'admission result proposedLabel is invalid');
    push(ok, errors, value.humanEditStatus === 'none' || value.humanEditStatus === 'light' || value.humanEditStatus === 'substantial' || value.humanEditStatus === 'unknown' || value.humanEditStatus === 'not_applicable', 'admission result humanEditStatus is invalid');
    push(ok, errors, validDisposition(value.disposition), 'admission result disposition is invalid');
    return ok && validLabel(value.proposedLabel) && (value.humanEditStatus === 'none' || value.humanEditStatus === 'light' || value.humanEditStatus === 'substantial' || value.humanEditStatus === 'unknown' || value.humanEditStatus === 'not_applicable') && validDisposition(value.disposition);
  }
  if (value.kind === 'provider_revision_exception' || value.kind === 'temporal_attestation') return exactKeys(value, ['kind', 'decision']) && (value.decision === 'accepted' || value.decision === 'rejected');
  if (value.kind === 'witness') return exactKeys(value, ['kind', 'decision']) && (value.decision === 'approved' || value.decision === 'rejected');
  errors.push('decision result kind is unknown');
  return false;
}

function validReviewerRoles(value: unknown): value is readonly ('authorship' | 'rights' | 'leakage_privacy' | 'calibration' | 'provenance')[] {
  const roles = new Set(['authorship', 'rights', 'leakage_privacy', 'calibration', 'provenance']);
  return sortedUnique(value, (entry) => typeof entry === 'string' && roles.has(entry), false);
}

export function validateCalibrationAdmissionBlindAssignmentV1(value: unknown, decision?: CalibrationAdmissionDecisionV103): AdmissionContractValidationV1 {
  const errors: string[] = [];
  if (!isRecord(value)) return result(false, ['blind assignment must be an object']);
  const shape = exactKeys(value, ['version', 'assignmentId', 'target', 'evidenceSetSha256', 'protocolEvidenceId', 'reviewerIds', 'peerMaterialHiddenUntilBothSealed']);
  push(shape, errors, value.version === 'v10.3-admission-blind-assignment-v1', 'assignment version is invalid');
  push(shape, errors, sha(value.assignmentId), 'assignmentId must be sha256');
  const targetOk = validateDecisionTarget(value.target, errors); push(shape, errors, targetOk, 'assignment target is invalid');
  push(shape, errors, sha(value.evidenceSetSha256), 'evidenceSetSha256 must be sha256');
  push(shape, errors, id(value.protocolEvidenceId), 'protocolEvidenceId must be an id');
  const reviewerIds = Array.isArray(value.reviewerIds) ? value.reviewerIds : [];
  push(shape, errors, reviewerIds.length === 2 && reviewerIds.every(id) && String(reviewerIds[0]) !== String(reviewerIds[1]) && String(reviewerIds[0]) < String(reviewerIds[1]), 'reviewerIds must contain two sorted distinct ids');
  push(shape, errors, value.peerMaterialHiddenUntilBothSealed === true, 'peer material must remain hidden until both seals');
  push(shape, errors, value.assignmentId === calibrationAdmissionBlindAssignmentId(value), 'assignmentId does not match canonical assignment content');
  if (decision !== undefined) {
    push(shape, errors, sameCanonical(value.target, decision.target) && decision.blindAssignmentId === value.assignmentId, 'decision does not bind assignment target/id');
    push(shape, errors, calibrationAdmissionSha256(decision.evidenceIds) === value.evidenceSetSha256, 'decision evidence IDs do not match assignment evidence set');
  }
  return result(shape && errors.length === 0, errors);
}

export function isCalibrationAdmissionDecisionV103(value: unknown): value is CalibrationAdmissionDecisionV103 {
  return validateCalibrationAdmissionDecisionV103(value).ok;
}

export function validateCalibrationAdmissionDecisionV103(value: unknown, assignment?: unknown): AdmissionContractValidationV1 {
  const errors: string[] = [];
  if (!isRecord(value)) return result(false, ['decision must be an object']);
  const shape = exactKeys(value, ['version', 'decisionId', 'target', 'reviewerId', 'reviewerRoles', 'evidenceIds', 'blindAssignmentId', 'adjudicatesDecisionIds', 'result', 'reasons', 'decidedAt']) || exactKeys(value, ['version', 'decisionId', 'target', 'reviewerId', 'reviewerRoles', 'evidenceIds', 'blindAssignmentId', 'result', 'reasons', 'decidedAt']);
  push(shape, errors, value.version === 'v10.3-admission-decision-v1', 'decision version is invalid');
  push(shape, errors, sha(value.decisionId), 'decisionId must be sha256');
  const targetOk = validateDecisionTarget(value.target, errors); const resultOk = validateDecisionResult(value.result, errors);
  push(shape, errors, targetOk, 'decision target is invalid'); push(shape, errors, id(value.reviewerId), 'reviewerId must be an id');
  const rolesOk = validReviewerRoles(value.reviewerRoles);
  push(shape, errors, rolesOk && Array.isArray(value.reviewerRoles) && value.reviewerRoles.length > 0, 'reviewerRoles must be a non-empty sorted unique role list');
  push(shape, errors, sortedUnique(value.evidenceIds, id, false), 'evidenceIds must be sorted unique ids');
  push(shape, errors, sha(value.blindAssignmentId), 'blindAssignmentId must be sha256');
  if (value.adjudicatesDecisionIds !== undefined) {
    const adjudicates = value.adjudicatesDecisionIds;
    const adjudicationOk = Array.isArray(adjudicates) && adjudicates.length === 2 && adjudicates.every(sha) && String(adjudicates[0]) < String(adjudicates[1]);
    push(shape, errors, adjudicationOk, 'adjudicatesDecisionIds must be two sorted decision ids');
  }
  const reasonsOk = sortedUnique(value.reasons, (entry) => typeof entry === 'string' && ADMISSION_REASONS.has(entry as CalibrationAdmissionReasonV1)); push(shape, errors, reasonsOk, 'reasons must be sorted known reasons');
  push(shape, errors, iso(value.decidedAt), 'decidedAt must be an ISO timestamp');
  if (isRecord(value.target) && isRecord(value.result)) {
    const targetKind = value.target.kind;
    const resultKind = value.result.kind;
    if (targetKind === 'source' || targetKind === 'record') {
      push(shape, errors, resultKind === 'admission', 'source/record decisions must use admission result');
    } else if (targetKind === 'provider_revision_exception') {
      push(shape, errors, resultKind === 'provider_revision_exception', 'provider exception target/result mismatch');
      push(shape, errors, sameCanonical(value.reviewerRoles, ['provenance']), 'provider exception requires provenance role');
    } else if (targetKind === 'temporal_attestation') {
      push(shape, errors, resultKind === 'temporal_attestation', 'temporal target/result mismatch');
      push(shape, errors, sameCanonical(value.reviewerRoles, ['provenance']), 'temporal attestation requires provenance role');
      push(shape, errors, value.adjudicatesDecisionIds === undefined, 'temporal attestation decisions cannot adjudicate');
    } else if (targetKind === 'witness') {
      push(shape, errors, resultKind === 'witness', 'witness target/result mismatch');
      push(shape, errors, sameCanonical(value.reviewerRoles, ['calibration']), 'witness decisions require calibration role');
      push(shape, errors, value.adjudicatesDecisionIds === undefined, 'witness decisions cannot adjudicate');
    }
  }
  if (assignment !== undefined) {
    const assignmentValidation = validateCalibrationAdmissionBlindAssignmentV1(assignment, value as unknown as CalibrationAdmissionDecisionV103);
    if (!assignmentValidation.ok) errors.push(...assignmentValidation.errors.map((error) => 'assignment: ' + error));
  }
  const expectedId = calibrationAdmissionDecisionId(value);
  push(shape, errors, value.decisionId === expectedId, 'decisionId does not match canonical decision content');
  return result(shape && errors.length === 0, errors);
}

export function validateCalibrationAdmissionBlindReviewReceiptV1(value: unknown, decisions?: readonly CalibrationAdmissionDecisionV103[], assignment?: CalibrationAdmissionBlindAssignmentV1): AdmissionContractValidationV1 {
  const errors: string[] = [];
  if (!isRecord(value)) return result(false, ['blind review receipt must be an object']);
  const shape = exactKeys(value, ['version', 'receiptId', 'assignmentId', 'evidenceSetSha256', 'sealedDecisions', 'unsealedOnlyAfterBothDecisionIdsExisted', 'protocolAuditorId', 'protocolAuditEvidenceIds']);
  push(shape, errors, value.version === 'v10.3-admission-blind-review-receipt-v1', 'receipt version is invalid');
  push(shape, errors, sha(value.receiptId), 'receiptId must be sha256');
  push(shape, errors, sha(value.assignmentId), 'receipt assignmentId must be sha256');
  push(shape, errors, sha(value.evidenceSetSha256), 'receipt evidenceSetSha256 must be sha256');
  push(shape, errors, Array.isArray(value.sealedDecisions) && value.sealedDecisions.length === 2, 'receipt must seal exactly two decisions');
  push(shape, errors, value.unsealedOnlyAfterBothDecisionIdsExisted === true, 'receipt unseal flag must be true');
  push(shape, errors, id(value.protocolAuditorId), 'protocolAuditorId must be an id');
  push(shape, errors, sortedUnique(value.protocolAuditEvidenceIds, id, false), 'protocolAuditEvidenceIds must be sorted unique ids');
  const sealed = Array.isArray(value.sealedDecisions) ? value.sealedDecisions : [];
  const sealedIds: string[] = [];
  const sealedReviewers: string[] = [];
  let sealedOk = sealed.length === 2;
  for (const entry of sealed) {
    if (!isRecord(entry) || !exactKeys(entry, ['reviewerId', 'decisionId', 'peerDecisionVisibleBeforeSeal']) || !id(entry.reviewerId) || !sha(entry.decisionId) || entry.peerDecisionVisibleBeforeSeal !== false) {
      sealedOk = false; continue;
    }
    sealedIds.push(entry.decisionId); sealedReviewers.push(entry.reviewerId);
  }
  push(shape, errors, sealedOk && new Set(sealedIds).size === 2 && new Set(sealedReviewers).size === 2 && sealedReviewers[0]! < sealedReviewers[1]!, 'receipt sealed decisions must be sorted distinct reviewer/decision pairs');
  push(shape, errors, value.receiptId === calibrationAdmissionBlindReviewReceiptId(value), 'receiptId does not match canonical receipt content');
  if (assignment !== undefined) {
    push(shape, errors, value.assignmentId === assignment.assignmentId && sameCanonical(assignment.reviewerIds, sealedReviewers), 'receipt does not bind assignment reviewers/id');
    push(shape, errors, value.evidenceSetSha256 === assignment.evidenceSetSha256, 'receipt does not bind assignment evidence set');
  }
  if (decisions !== undefined) {
    const decisionIds = new Set(decisions.map((decision) => decision.decisionId));
    push(shape, errors, sealedIds.every((decisionId) => decisionIds.has(decisionId)), 'receipt references an unknown decision');
    for (const entry of sealed) if (isRecord(entry)) {
      const matching = decisions.find((decision) => decision.decisionId === entry.decisionId);
      if (matching) {
        push(shape, errors, matching.reviewerId === entry.reviewerId, 'receipt reviewer does not match decision reviewer');
        if (assignment) {
          push(shape, errors, matching.blindAssignmentId === assignment.assignmentId, 'receipt decision crosses assignment');
          push(shape, errors, sameCanonical(matching.target, assignment.target), 'receipt decision target does not match assignment');
          push(shape, errors, calibrationAdmissionSha256(matching.evidenceIds) === assignment.evidenceSetSha256, 'receipt decision evidence does not match assignment');
        }
      }
    }
  }
  return result(shape && errors.length === 0, errors);
}

function validateLedgerShape(value: unknown): { readonly shape: boolean; readonly errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(value)) return { shape: false, errors: ['ledger must be an object'] };
  const requiredKeys = ['version', 'ledgerId', 'sourceId', 'sourceReviewSha256', 'admissionRecordSetSha256', 'decisionJsonlSha256', 'decisionIds', 'blindAssignmentJsonlSha256', 'blindAssignmentIds', 'blindReviewReceiptJsonlSha256', 'blindReviewReceiptIds', 'adjudicationDecisionIds', 'ledgerSha256'];
  const optionalKeys = ['reviewSampleId', 'adjudicatorAssignmentJsonlSha256', 'adjudicatorAssignmentIds', 'adjudicatorReceiptJsonlSha256', 'adjudicatorReceiptIds'];
  const keys = Object.keys(value);
  const shape = requiredKeys.every((key) => keys.includes(key))
    && keys.every((key) => requiredKeys.includes(key) || optionalKeys.includes(key));
  push(shape, errors, value.version === 'v10.3-admission-decision-ledger-v1', 'ledger version is invalid');
  push(shape, errors, id(value.ledgerId), 'ledgerId must be an id'); push(shape, errors, id(value.sourceId), 'ledger sourceId must be an id');
  push(shape, errors, sha(value.sourceReviewSha256), 'ledger sourceReviewSha256 must be sha256'); push(shape, errors, sha(value.admissionRecordSetSha256), 'ledger admissionRecordSetSha256 must be sha256');
  if (value.reviewSampleId !== undefined) push(shape, errors, id(value.reviewSampleId), 'ledger reviewSampleId must be an id');
  push(shape, errors, sha(value.decisionJsonlSha256), 'ledger decisionJsonlSha256 must be sha256'); push(shape, errors, sortedUnique(value.decisionIds, sha), 'ledger decisionIds must be sorted unique sha256 ids');
  push(shape, errors, sha(value.blindAssignmentJsonlSha256), 'ledger blindAssignmentJsonlSha256 must be sha256'); push(shape, errors, sortedUnique(value.blindAssignmentIds, sha), 'ledger blindAssignmentIds must be sorted unique hashes');
  push(shape, errors, sha(value.blindReviewReceiptJsonlSha256), 'ledger blindReviewReceiptJsonlSha256 must be sha256'); push(shape, errors, sortedUnique(value.blindReviewReceiptIds, sha), 'ledger blindReviewReceiptIds must be sorted unique hashes');
  const hasAdjudicatorAssignmentLedger = value.adjudicatorAssignmentJsonlSha256 !== undefined || value.adjudicatorAssignmentIds !== undefined;
  push(shape, errors, !hasAdjudicatorAssignmentLedger || (value.adjudicatorAssignmentJsonlSha256 !== undefined && value.adjudicatorAssignmentIds !== undefined), 'adjudicator assignment ledger hash and ids must be supplied together');
  if (hasAdjudicatorAssignmentLedger) {
    push(shape, errors, sha(value.adjudicatorAssignmentJsonlSha256), 'ledger adjudicatorAssignmentJsonlSha256 must be sha256');
    push(shape, errors, sortedUnique(value.adjudicatorAssignmentIds, sha), 'ledger adjudicatorAssignmentIds must be sorted unique hashes');
  }
  const hasAdjudicatorReceiptLedger = value.adjudicatorReceiptJsonlSha256 !== undefined || value.adjudicatorReceiptIds !== undefined;
  push(shape, errors, !hasAdjudicatorReceiptLedger || (value.adjudicatorReceiptJsonlSha256 !== undefined && value.adjudicatorReceiptIds !== undefined), 'adjudicator receipt ledger hash and ids must be supplied together');
  if (hasAdjudicatorReceiptLedger) {
    push(shape, errors, sha(value.adjudicatorReceiptJsonlSha256), 'ledger adjudicatorReceiptJsonlSha256 must be sha256');
    push(shape, errors, sortedUnique(value.adjudicatorReceiptIds, sha), 'ledger adjudicatorReceiptIds must be sorted unique hashes');
  }
  push(shape, errors, sortedUnique(value.adjudicationDecisionIds, sha), 'ledger adjudicationDecisionIds must be sorted unique sha256 ids');
  push(shape, errors, sha(value.ledgerSha256), 'ledgerSha256 must be sha256'); push(shape, errors, value.ledgerSha256 === admissionDecisionLedgerSha256(value), 'ledgerSha256 does not match ledger content');
  return { shape, errors };
}

function lookupResolution(map: CalibrationAdmissionSourceResolutionMapV1 | undefined, key: string): { readonly configured: boolean; readonly sourceId?: string } {
  if (map === undefined) return { configured: false };
  if (map instanceof Map) return { configured: true, sourceId: map.get(key) };
  return { configured: true, sourceId: (map as Readonly<Record<string, string>>)[key] };
}

function validateTargetSourceResolution(
  target: unknown,
  sourceId: string,
  context: CalibrationAdmissionDecisionLedgerResolutionContextV1 | undefined,
  errors: string[],
): void {
  if (!isRecord(target) || target.kind === 'source') return;
  if (context === undefined) {
    errors.push('decision target is unresolved or belongs to another ledger source');
    return;
  }
  let resolution: { configured: boolean; sourceId?: string } = { configured: false };
  if (target.kind === 'record' && sha(target.recordId)) {
    resolution = lookupResolution(context.recordSourceIds ?? context.sourceIdByRecordId, target.recordId);
  } else if (target.kind === 'provider_revision_exception' && sha(target.recordId)) {
    resolution = lookupResolution(context.providerRevisionRecordSourceIds ?? context.recordSourceIds ?? context.sourceIdByRecordId, target.recordId);
  } else if (target.kind === 'temporal_attestation' && sha(target.temporalAttestationId)) {
    resolution = lookupResolution(context.temporalAttestationSourceIds ?? context.sourceIdByTemporalAttestationId, target.temporalAttestationId);
  } else if (target.kind === 'witness' && sha(target.witnessSha256)) {
    resolution = lookupResolution(context.witnessSourceIds ?? context.sourceIdByWitnessSha256, target.witnessSha256);
  }
  if (!resolution.configured || resolution.sourceId !== sourceId) errors.push('decision target is unresolved or belongs to another ledger source');
}

export function validateCalibrationAdmissionDecisionLedger(
  value: unknown,
  decisionBytes?: Uint8Array,
  assignmentBytes?: Uint8Array,
  receiptBytes?: Uint8Array,
  context?: CalibrationAdmissionDecisionLedgerResolutionContextV1,
  adjudicatorAssignmentBytes?: Uint8Array,
  adjudicatorReceiptBytes?: Uint8Array,
): AdmissionContractValidationV1 {
  const base = validateLedgerShape(value);
  const errors = [...base.errors];
  if (!base.shape || !isRecord(value)) return result(false, errors);
  const parseSection = (bytes: Uint8Array | undefined, expectedHash: unknown, name: string): unknown[] => {
    if (bytes === undefined) return [];
    const parsed = parseCanonicalJsonl(bytes);
    if (parsed.error) { errors.push(name + ': ' + parsed.error); return []; }
    push(base.shape, errors, admissionRecordStreamContentSha256(bytes) === expectedHash, name + ' JSONL hash does not match ledger');
    return parsed.values ?? [];
  };
  const decisionValues = parseSection(decisionBytes, value.decisionJsonlSha256, 'decision');
  const assignmentValues = parseSection(assignmentBytes, value.blindAssignmentJsonlSha256, 'assignment');
  const receiptValues = parseSection(receiptBytes, value.blindReviewReceiptJsonlSha256, 'receipt');
  const suppliedSections = [decisionBytes, assignmentBytes, receiptBytes].filter((bytes): bytes is Uint8Array => bytes !== undefined).length;
  push(base.shape, errors, suppliedSections === 0 || suppliedSections === 3, 'decision, assignment, and receipt JSONL must be supplied together');
  const adjudicatorAssignmentLedgerPresent = value.adjudicatorAssignmentJsonlSha256 !== undefined || value.adjudicatorAssignmentIds !== undefined;
  const adjudicatorReceiptLedgerPresent = value.adjudicatorReceiptJsonlSha256 !== undefined || value.adjudicatorReceiptIds !== undefined;
  const adjudicatorAssignmentValues = parseSection(adjudicatorAssignmentBytes, value.adjudicatorAssignmentJsonlSha256, 'adjudicator assignment');
  const adjudicatorReceiptValues = parseSection(adjudicatorReceiptBytes, value.adjudicatorReceiptJsonlSha256, 'adjudicator receipt');
  push(base.shape, errors, adjudicatorAssignmentLedgerPresent === (adjudicatorAssignmentBytes !== undefined), 'adjudicator assignment JSONL bytes must match ledger declaration');
  push(base.shape, errors, adjudicatorReceiptLedgerPresent === (adjudicatorReceiptBytes !== undefined), 'adjudicator receipt JSONL bytes must match ledger declaration');
  push(base.shape, errors, adjudicatorAssignmentLedgerPresent === adjudicatorReceiptLedgerPresent, 'adjudicator assignment and receipt ledgers must be declared together');
  push(base.shape, errors, (!adjudicatorAssignmentLedgerPresent && !adjudicatorReceiptLedgerPresent) || decisionBytes !== undefined, 'adjudication JSONL requires decision JSONL');
  const adjudicatorAssignmentMap = new Map<string, CalibrationAdmissionAdjudicatorAssignmentV1>();
  const adjudicatorAssignmentEntries: CalibrationAdmissionAdjudicatorAssignmentV1[] = [];
  for (const entry of adjudicatorAssignmentValues) {
    if (!isCalibrationAdmissionAdjudicatorAssignmentV1(entry)) {
      errors.push('adjudicator assignment: invalid assignment');
      continue;
    }
    const assignment = entry as CalibrationAdmissionAdjudicatorAssignmentV1;
    adjudicatorAssignmentEntries.push(assignment);
    if (adjudicatorAssignmentMap.has(assignment.assignmentId)) errors.push('adjudicator assignment JSONL contains duplicate assignment IDs');
    adjudicatorAssignmentMap.set(assignment.assignmentId, assignment);
    if (isRecord(assignment.target) && assignment.target.kind === 'source' && assignment.target.sourceId !== value.sourceId) errors.push('adjudicator assignment crosses ledger source');
    validateTargetSourceResolution(assignment.target, value.sourceId as string, context, errors);
  }
  if (adjudicatorAssignmentBytes !== undefined) {
    push(base.shape, errors, sameCanonical([...adjudicatorAssignmentMap.keys()], value.adjudicatorAssignmentIds), 'adjudicatorAssignmentIds do not match assignment JSONL');
  }
  const adjudicatorReceiptMap = new Map<string, CalibrationAdmissionAdjudicatorReceiptV1>();
  const adjudicatorReceiptEntries: CalibrationAdmissionAdjudicatorReceiptV1[] = [];
  for (const entry of adjudicatorReceiptValues) {
    if (!isCalibrationAdmissionAdjudicatorReceiptV1(entry)) {
      errors.push('adjudicator receipt: invalid receipt');
      continue;
    }
    const receipt = entry as CalibrationAdmissionAdjudicatorReceiptV1;
    adjudicatorReceiptEntries.push(receipt);
    if (adjudicatorReceiptMap.has(receipt.receiptId)) errors.push('adjudicator receipt JSONL contains duplicate receipt IDs');
    adjudicatorReceiptMap.set(receipt.receiptId, receipt);
  }
  if (adjudicatorReceiptBytes !== undefined) {
    push(base.shape, errors, sameCanonical([...adjudicatorReceiptMap.keys()], value.adjudicatorReceiptIds), 'adjudicatorReceiptIds do not match receipt JSONL');
  }
  for (const receipt of adjudicatorReceiptEntries) {
    if (!adjudicatorAssignmentMap.has(receipt.assignmentId)) {
      errors.push('adjudicator receipt references an unknown adjudicator assignment');
    }
  }
  if (decisionBytes !== undefined) {
    const decisions: CalibrationAdmissionDecisionV103[] = [];
    for (const entry of decisionValues) {
      const validation = validateCalibrationAdmissionDecisionV103(entry);
      if (!validation.ok) errors.push(...validation.errors.map((error) => 'decision: ' + error)); else decisions.push(entry as CalibrationAdmissionDecisionV103);
    }
    const ids = decisions.map((decision) => decision.decisionId);
    push(base.shape, errors, new Set(ids).size === ids.length, 'decision JSONL contains duplicate decision IDs');
    push(base.shape, errors, sameCanonical(ids.slice().sort(), value.decisionIds), 'decisionIds do not match decision JSONL');
    const canonicalDecisionOrder = [...decisions].sort((left, right) => {
      const leftTarget = calibrationAdmissionCanonicalJson(left.target);
      const rightTarget = calibrationAdmissionCanonicalJson(right.target);
      if (leftTarget < rightTarget) return -1;
      if (leftTarget > rightTarget) return 1;
      if (left.reviewerId < right.reviewerId) return -1;
      if (left.reviewerId > right.reviewerId) return 1;
      return 0;
    });
    push(
      base.shape,
      errors,
      decisions.every((decision, index) => decision.decisionId === canonicalDecisionOrder[index]?.decisionId),
      'decision JSONL must be ordered by canonical target then reviewerId',
    );
    const assignmentMap = new Map<string, CalibrationAdmissionBlindAssignmentV1>();
    const assignmentEntries: CalibrationAdmissionBlindAssignmentV1[] = [];
    for (const entry of assignmentValues) {
      const validation = validateCalibrationAdmissionBlindAssignmentV1(entry);
      if (!validation.ok) errors.push(...validation.errors.map((error) => 'assignment: ' + error)); else {
        const assignment = entry as CalibrationAdmissionBlindAssignmentV1;
        assignmentEntries.push(assignment);
        if (assignmentMap.has(assignment.assignmentId)) errors.push('assignment JSONL contains duplicate assignment IDs');
        assignmentMap.set(assignment.assignmentId, assignment);
        if (isRecord(assignment.target) && assignment.target.kind === 'source' && assignment.target.sourceId !== value.sourceId) errors.push('assignment crosses ledger source');
        validateTargetSourceResolution(assignment.target, value.sourceId as string, context, errors);
      }
    }
    push(base.shape, errors, assignmentEntries.length === assignmentMap.size, 'assignment JSONL contains duplicate assignment IDs');
    push(base.shape, errors, sameCanonical([...assignmentMap.keys()], value.blindAssignmentIds), 'blindAssignmentIds do not match assignment JSONL');
    const decisionsByAssignment = new Map<string, CalibrationAdmissionDecisionV103[]>();
    for (const decision of decisions) {
      const assignment = assignmentMap.get(decision.blindAssignmentId);
      const adjudicatorAssignment = adjudicatorAssignmentMap.get(decision.blindAssignmentId);
      push(base.shape, errors, assignment !== undefined || adjudicatorAssignment !== undefined, 'decision references an unknown blind assignment');
      if (assignment) {
        const validation = validateCalibrationAdmissionDecisionV103(decision, assignment);
        if (!validation.ok) errors.push(...validation.errors.map((error) => 'decision-assignment: ' + error));
        const grouped = decisionsByAssignment.get(assignment.assignmentId) ?? [];
        grouped.push(decision); decisionsByAssignment.set(assignment.assignmentId, grouped);
      } else if (adjudicatorAssignment) {
        const validation = validateCalibrationAdmissionDecisionV103(decision);
        if (!validation.ok) errors.push(...validation.errors.map((error) => 'adjudicator-decision: ' + error));
      }
      if (isRecord(decision.target) && decision.target.kind === 'source' && decision.target.sourceId !== value.sourceId) errors.push('decision crosses ledger source');
      validateTargetSourceResolution(decision.target, value.sourceId as string, context, errors);
    }
    for (const assignment of assignmentEntries) {
      const grouped = decisionsByAssignment.get(assignment.assignmentId) ?? [];
      const assignmentAdjudicators = grouped.filter((decision) => decision.adjudicatesDecisionIds !== undefined);
      if (assignmentAdjudicators.length > 0) {
        push(base.shape, errors, grouped.length === 1 && assignmentAdjudicators.length === 1, 'adjudicator assignment must contain exactly one adjudicator decision');
      } else {
        push(base.shape, errors, grouped.length === 2, 'each assignment must have exactly two decisions');
      }
      if ((assignment.target.kind === 'source' || assignment.target.kind === 'record') && grouped.length === 2 && assignmentAdjudicators.length === 0) {
        const authorshipReviewers = new Set(grouped.filter((decision) => decision.reviewerRoles.includes('authorship')).map((decision) => decision.reviewerId));
        const rightsReviewers = new Set(grouped.filter((decision) => decision.reviewerRoles.includes('rights')).map((decision) => decision.reviewerId));
        const distinctRoleReviewers = [...authorshipReviewers].some((reviewerId) => [...rightsReviewers].some((rightsReviewerId) => rightsReviewerId !== reviewerId));
        push(base.shape, errors, authorshipReviewers.size > 0 && rightsReviewers.size > 0 && distinctRoleReviewers, 'source/record assignment decisions must cover authorship and rights roles with distinct reviewers');
      }
    }
    const adjudicators = decisions.filter((decision) => decision.adjudicatesDecisionIds !== undefined);
    const adjudicatorIds = adjudicators.map((decision) => decision.decisionId).sort();
    const listedAdjudicatorIds = [...(value.adjudicationDecisionIds as readonly string[])].sort();
    push(base.shape, errors, sameCanonical(adjudicatorIds, listedAdjudicatorIds), 'adjudicationDecisionIds must exactly equal decisions with adjudicatesDecisionIds');
    const decisionById = new Map(decisions.map((decision) => [decision.decisionId, decision]));
    const adjudicatorSet = new Set(adjudicatorIds);
    const adjudicatedPairs = new Set<string>();
    for (const adjudicator of adjudicators) {
      const priorIds = adjudicator.adjudicatesDecisionIds ?? [];
      const priors = priorIds.map((priorId) => decisionById.get(priorId));
      push(base.shape, errors, priors.length === 2 && priors.every((prior): prior is CalibrationAdmissionDecisionV103 => prior !== undefined), 'adjudicator references missing prior decision');
      if (priors.length === 2 && priors.every((prior): prior is CalibrationAdmissionDecisionV103 => prior !== undefined)) {
        const priorPairKey = priorIds.join('\u0000');
        push(base.shape, errors, !adjudicatedPairs.has(priorPairKey), 'adjudication prior pair must be unique');
        adjudicatedPairs.add(priorPairKey);
        push(base.shape, errors, priors.every((prior) => !adjudicatorSet.has(prior.decisionId)), 'adjudicator priors cannot themselves adjudicate');
        push(base.shape, errors, priors.every((prior) => sameCanonical(prior.target, adjudicator.target)), 'adjudicator target must match both prior targets');
        push(base.shape, errors, priors[0]!.blindAssignmentId === priors[1]!.blindAssignmentId, 'adjudicator priors must come from one blind assignment');
        push(base.shape, errors, priors[0]!.reviewerId !== priors[1]!.reviewerId, 'adjudicator priors must have distinct reviewers');
        push(base.shape, errors, priors.every((prior) => prior.blindAssignmentId !== adjudicator.blindAssignmentId), 'adjudicator assignment must differ from both prior assignments');
        push(base.shape, errors, priors.every((prior) => prior.reviewerId !== adjudicator.reviewerId), 'adjudicator reviewer must differ from both prior reviewers');
        push(base.shape, errors, priorIds.every((priorId) => adjudicator.evidenceIds.includes(priorId)), 'adjudicator evidence must include both prior decisions');
      }
    }
    // A disagreement between the two blinded decisions is not itself an
    // admission. It must have exactly one later adjudicator that names both
    // prior decision IDs. Conversely, an adjudicator for agreeing decisions
    // is a contradictory extra edge and is rejected.
    for (const assignment of assignmentEntries) {
      const grouped = decisionsByAssignment.get(assignment.assignmentId) ?? [];
      if (grouped.length !== 2 || grouped.some((decision) => decision.adjudicatesDecisionIds !== undefined)) continue;
      const [first, second] = grouped;
      const pair = [first!.decisionId, second!.decisionId].sort();
      const pairKey = pair.join('\u0000');
      const pairAdjudicators = adjudicators.filter((decision) => {
        const priorIds = [...(decision.adjudicatesDecisionIds ?? [])].sort();
        return priorIds.length === 2 && priorIds.join('\u0000') === pairKey;
      });
      const conflicting = !sameCanonical(
        { result: first!.result, reasons: first!.reasons },
        { result: second!.result, reasons: second!.reasons },
      );
      if (conflicting) push(base.shape, errors, pairAdjudicators.length === 1, 'conflicting decisions require exactly one adjudicator');
      else push(base.shape, errors, pairAdjudicators.length === 0, 'agreeing decisions must not have an adjudicator');
    }
    const receipts: CalibrationAdmissionBlindReviewReceiptV1[] = [];
    const receiptIds = new Set<string>();
    for (const entry of receiptValues) {
      const validation = validateCalibrationAdmissionBlindReviewReceiptV1(entry, decisions);
      if (!validation.ok) errors.push(...validation.errors.map((error) => 'receipt: ' + error)); else {
        const receipt = entry as CalibrationAdmissionBlindReviewReceiptV1;
        if (receiptIds.has(receipt.receiptId)) errors.push('receipt JSONL contains duplicate receipt IDs');
        receiptIds.add(receipt.receiptId); receipts.push(receipt);
      }
    }
    push(base.shape, errors, sameCanonical(receipts.map((receipt) => receipt.receiptId), value.blindReviewReceiptIds), 'blindReviewReceiptIds do not match receipt JSONL');
    const receiptsByAssignment = new Map<string, number>();
    for (const receipt of receipts) {
      const assignment = assignmentMap.get(receipt.assignmentId);
      if (assignment) {
        const validation = validateCalibrationAdmissionBlindReviewReceiptV1(receipt, decisions, assignment);
        if (!validation.ok) errors.push(...validation.errors.map((error) => 'receipt-assignment: ' + error));
        receiptsByAssignment.set(receipt.assignmentId, (receiptsByAssignment.get(receipt.assignmentId) ?? 0) + 1);
      } else errors.push('receipt references an unknown blind assignment');
    }
    for (const assignment of assignmentEntries) push(base.shape, errors, receiptsByAssignment.get(assignment.assignmentId) === 1, 'each assignment must have exactly one receipt');
    const peerReceiptById = new Map(receipts.map((receipt) => [receipt.receiptId, receipt]));
    for (const adjudicatorAssignment of adjudicatorAssignmentEntries) {
      const adjudicatorDecisions = decisions.filter((decision) => decision.blindAssignmentId === adjudicatorAssignment.assignmentId);
      push(base.shape, errors, adjudicatorDecisions.length === 1, 'each adjudicator assignment must have exactly one adjudicator decision');
      const adjudicatorReceipts = adjudicatorReceiptEntries.filter((receipt) => receipt.assignmentId === adjudicatorAssignment.assignmentId);
      push(base.shape, errors, adjudicatorReceipts.length === 1, 'each adjudicator assignment must have exactly one adjudicator receipt');
      const adjudicatorDecision = adjudicatorDecisions[0];
      const adjudicatorReceipt = adjudicatorReceipts[0];
      const priorDecisions = adjudicatorAssignment.priorDecisionIds.map((decisionId) => decisionById.get(decisionId));
      const peerAssignment = priorDecisions[0] === undefined
        ? undefined
        : assignmentMap.get(priorDecisions[0].blindAssignmentId);
      const peerReceipt = peerReceiptById.get(adjudicatorAssignment.priorBlindReviewReceiptId);
      if (adjudicatorDecision !== undefined && adjudicatorReceipt !== undefined && peerAssignment !== undefined && peerReceipt !== undefined) {
        const graph = validateCalibrationAdmissionAdjudicatorGraph(
          peerAssignment,
          priorDecisions,
          peerReceipt,
          adjudicatorAssignment,
          adjudicatorDecision,
          adjudicatorReceipt,
        );
        if (!graph.ok) errors.push(...graph.errors.map((error) => 'adjudicator: ' + error));
      } else {
        if (priorDecisions.some((decision) => decision === undefined)) errors.push('adjudicator assignment references an unknown prior decision');
        if (peerAssignment === undefined) errors.push('adjudicator assignment references an unknown peer assignment');
        if (peerReceipt === undefined) errors.push('adjudicator assignment references an unknown peer receipt');
      }
    }
    const decisionIdSet = new Set(ids);
    for (const adjudicationId of value.adjudicationDecisionIds as readonly string[]) push(base.shape, errors, decisionIdSet.has(adjudicationId), 'adjudicationDecisionIds must be a subset of decisionIds');
  }
  return result(base.shape && errors.length === 0, errors);
}

export function isCalibrationAdmissionDecisionLedgerV1(value: unknown): value is CalibrationAdmissionDecisionLedgerV1 {
  const validation = validateLedgerShape(value);
  return validation.shape && validation.errors.length === 0;
}
