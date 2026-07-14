import {
  admissionRecordJsonl,
  admissionRecordStreamContentSha256,
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionSourceRegisterSha256,
  calibrationAdmissionSourceReviewSha256,
  isCalibrationAdmissionBlindAssignmentV1,
  isCalibrationAdmissionBlindReviewReceiptV1,
  isCalibrationAdmissionAdjudicatorAssignmentV1,
  isCalibrationAdmissionAdjudicatorReceiptV1,
  isCalibrationAdmissionDecisionLedgerV1,
  isCalibrationAdmissionDecisionV103,
  isCalibrationAdmissionRecordV103,
  isCalibrationAdmissionRecordStreamV1,
  isCalibrationAdmissionReviewSampleV1,
  isCalibrationAdmissionSourceRegisterV1,
  isCalibrationHistoricalTemporalAttestationV1,
  sourceRegisterReviewCensusCounts,
  validateCalibrationAdmissionBlindReviewReceiptV1,
  validateCalibrationAdmissionDecisionLedger,
  validateCalibrationAdmissionDecisionV103,
  validateCalibrationAdmissionRecordStreamV1,
  validateCalibrationAdmissionReviewSampleV1,
  validateCalibrationAdmissionSourceRegisterReviewSet,
  type CalibrationAdmissionBlindAssignmentV1,
  type CalibrationAdmissionBlindReviewReceiptV1,
  type CalibrationAdmissionAdjudicatorAssignmentV1,
  type CalibrationAdmissionAdjudicatorReceiptV1,
  type CalibrationAdmissionDecisionLedgerV1,
  type CalibrationAdmissionDecisionV103,
  type CalibrationAdmissionRecordV103,
  type CalibrationAdmissionReviewSampleV1,
  type CalibrationAdmissionSourceRegisterV1,
  type CalibrationSourceReviewV103,
} from '@usebrick/core';
import {
  isVerifiedAdmissionEvidenceContext,
  type VerifiedAdmissionEvidenceContextV1,
} from './admission-evidence-context';
import { validateTemporalAdmissionAuthority } from './temporal-attestation-authority';

export interface AdmissionReviewInputV1 {
  readonly context: unknown;
  readonly sourceRegister: unknown;
  readonly sourceReviews: readonly unknown[];
  /** Canonical record stream and decoded records. Both are pure inputs. */
  readonly admissionRecordStream?: unknown;
  readonly admissionRecordBytes?: Uint8Array;
  readonly admissionRecords?: readonly unknown[];
  /** Deterministic blind-review sample projections. */
  readonly reviewSamples?: readonly unknown[];
  /** Blind assignments, decisions, and post-decision receipts. */
  readonly blindAssignments?: readonly unknown[];
  readonly blindReviewReceipts?: readonly unknown[];
  /** Dedicated disagreement-resolution assignment and receipt artifacts. */
  readonly adjudicatorAssignments?: readonly unknown[];
  readonly adjudicatorReceipts?: readonly unknown[];
  readonly decisions?: readonly unknown[];
  readonly decisionLedgers?: readonly unknown[];
  /** Names used by the persisted pre-witness bundle. */
  readonly preWitnessDecisions?: readonly unknown[];
  readonly preWitnessBlindAssignments?: readonly unknown[];
  readonly preWitnessBlindReviewReceipts?: readonly unknown[];
  readonly preWitnessAdjudicatorAssignments?: readonly unknown[];
  readonly preWitnessAdjudicatorReceipts?: readonly unknown[];
  /** Historical temporal attestations and their deterministic evidence bindings. */
  readonly temporalAttestations?: readonly unknown[];
  readonly temporalEvidenceByAttestationId?: Readonly<Record<string, unknown>>;
}

export interface AdmissionStructuredAuthoritySummaryV1 {
  readonly present: boolean;
  readonly valid: boolean;
  readonly recordCount: number;
  readonly reviewSampleCount: number;
  readonly decisionCount: number;
  readonly decisionLedgerCount: number;
  readonly adjudicatorAssignmentCount: number;
  readonly adjudicatorReceiptCount: number;
}

export interface AdmissionReviewSourceDiagnosticV1 {
  readonly sourceId: string;
  readonly decision: CalibrationSourceReviewV103['decision'] | 'unreviewed';
  readonly candidate: boolean;
  readonly quarantine: boolean;
  readonly reasons: readonly string[];
}

export interface AdmissionReviewCountsV1 {
  readonly selectedCoverage: number;
  readonly baselineMaterialUnits: number;
  readonly repositoryMaterialUnits: number;
  readonly additiveRegisteredUnits: number;
  readonly additiveRepresentedUnits: number;
  readonly additiveUnrepresentedUnits: number;
  readonly candidateUnits: number;
  readonly quarantineUnits: number;
  readonly eligibleUnits: 0;
}

export interface AdmissionReviewResultV1 {
  readonly version: 'v10.3-admission-review-v1';
  readonly ready: false;
  readonly authorityEligible: false;
  readonly evidenceContextSha256?: string;
  readonly sourceRegisterSha256?: string;
  readonly registeredSourceCount: number;
  readonly reviewedSourceCount: number;
  readonly candidateSourceCount: number;
  readonly counts: AdmissionReviewCountsV1;
  readonly sources: readonly AdmissionReviewSourceDiagnosticV1[];
  readonly structured: AdmissionStructuredAuthoritySummaryV1;
  readonly recordCounts: Readonly<Record<string, number>>;
  readonly blockers: readonly string[];
}

const ZERO_COUNTS: AdmissionReviewCountsV1 = Object.freeze({
  selectedCoverage: 0,
  baselineMaterialUnits: 0,
  repositoryMaterialUnits: 0,
  additiveRegisteredUnits: 0,
  additiveRepresentedUnits: 0,
  additiveUnrepresentedUnits: 0,
  quarantineUnits: 0,
  candidateUnits: 0,
  eligibleUnits: 0,
});

const EMPTY_STRUCTURED: AdmissionStructuredAuthoritySummaryV1 = Object.freeze({
  present: false,
  valid: true,
  recordCount: 0,
  reviewSampleCount: 0,
  decisionCount: 0,
  decisionLedgerCount: 0,
  adjudicatorAssignmentCount: 0,
  adjudicatorReceiptCount: 0,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): readonly unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function firstDefinedArray(
  input: AdmissionReviewInputV1,
  primary: 'decisions' | 'blindAssignments' | 'blindReviewReceipts',
  alias: 'preWitnessDecisions' | 'preWitnessBlindAssignments' | 'preWitnessBlindReviewReceipts',
): readonly unknown[] | undefined {
  const value = input[primary];
  if (value !== undefined) return asArray(value);
  return asArray(input[alias]);
}

function sameCanonical(left: unknown, right: unknown): boolean {
  try { return calibrationAdmissionCanonicalJson(left) === calibrationAdmissionCanonicalJson(right); } catch { return false; }
}

function structuredInputPresent(input: AdmissionReviewInputV1): boolean {
  return input.admissionRecordStream !== undefined
    || input.admissionRecordBytes !== undefined
    || input.admissionRecords !== undefined
    || input.reviewSamples !== undefined
    || input.blindAssignments !== undefined
    || input.blindReviewReceipts !== undefined
    || input.adjudicatorAssignments !== undefined
    || input.adjudicatorReceipts !== undefined
    || input.decisions !== undefined
    || input.decisionLedgers !== undefined
    || input.preWitnessDecisions !== undefined
    || input.preWitnessBlindAssignments !== undefined
    || input.preWitnessBlindReviewReceipts !== undefined
    || input.preWitnessAdjudicatorAssignments !== undefined
    || input.preWitnessAdjudicatorReceipts !== undefined
    || input.temporalAttestations !== undefined
    || input.temporalEvidenceByAttestationId !== undefined;
}

interface StructuredAuthorityValidationV1 {
  readonly summary: AdmissionStructuredAuthoritySummaryV1;
  readonly errors: readonly string[];
  readonly recordCounts: Readonly<Record<string, number>>;
}

/**
 * Validate the non-empty structured graph without touching the filesystem.
 * Core owns individual shape/hash contracts; this layer owns joins to the
 * register, source reviews, records, and per-source decision ledgers.
 */
function validateStructuredAuthority(
  input: AdmissionReviewInputV1,
  register: CalibrationAdmissionSourceRegisterV1,
  sourceReviews: readonly CalibrationSourceReviewV103[],
): StructuredAuthorityValidationV1 {
  if (!structuredInputPresent(input)) return { summary: EMPTY_STRUCTURED, errors: [], recordCounts: {} };

  const errors: string[] = [];
  const records = asArray(input.admissionRecords);
  const reviewSamples = asArray(input.reviewSamples);
  const decisions = input.decisions !== undefined
    ? asArray(input.decisions)
    : asArray(input.preWitnessDecisions);
  const assignments = input.blindAssignments !== undefined
    ? asArray(input.blindAssignments)
    : asArray(input.preWitnessBlindAssignments);
  const receipts = input.blindReviewReceipts !== undefined
    ? asArray(input.blindReviewReceipts)
    : asArray(input.preWitnessBlindReviewReceipts);
  const adjudicatorAssignments = input.adjudicatorAssignments !== undefined
    ? asArray(input.adjudicatorAssignments)
    : asArray(input.preWitnessAdjudicatorAssignments);
  const adjudicatorReceipts = input.adjudicatorReceipts !== undefined
    ? asArray(input.adjudicatorReceipts)
    : asArray(input.preWitnessAdjudicatorReceipts);
  const ledgers = asArray(input.decisionLedgers);
  const summary: AdmissionStructuredAuthoritySummaryV1 = {
    present: true,
    valid: false,
    recordCount: records?.length ?? 0,
    reviewSampleCount: reviewSamples?.length ?? 0,
    decisionCount: decisions?.length ?? 0,
    decisionLedgerCount: ledgers?.length ?? 0,
    adjudicatorAssignmentCount: adjudicatorAssignments?.length ?? 0,
    adjudicatorReceiptCount: adjudicatorReceipts?.length ?? 0,
  };

  if (input.admissionRecords !== undefined && records === undefined) errors.push('admission_records_invalid');
  if (input.reviewSamples !== undefined && reviewSamples === undefined) errors.push('review_samples_invalid');
  if (input.decisions !== undefined && decisions === undefined) errors.push('decisions_invalid');
  if (input.preWitnessDecisions !== undefined && decisions === undefined) errors.push('pre_witness_decisions_invalid');
  if (input.blindAssignments !== undefined && assignments === undefined) errors.push('blind_assignments_invalid');
  if (input.preWitnessBlindAssignments !== undefined && assignments === undefined) errors.push('pre_witness_blind_assignments_invalid');
  if (input.blindReviewReceipts !== undefined && receipts === undefined) errors.push('blind_review_receipts_invalid');
  if (input.preWitnessBlindReviewReceipts !== undefined && receipts === undefined) errors.push('pre_witness_blind_review_receipts_invalid');
  if (input.adjudicatorAssignments !== undefined && adjudicatorAssignments === undefined) errors.push('adjudicator_assignments_invalid');
  if (input.preWitnessAdjudicatorAssignments !== undefined && adjudicatorAssignments === undefined) errors.push('pre_witness_adjudicator_assignments_invalid');
  if (input.adjudicatorReceipts !== undefined && adjudicatorReceipts === undefined) errors.push('adjudicator_receipts_invalid');
  if (input.preWitnessAdjudicatorReceipts !== undefined && adjudicatorReceipts === undefined) errors.push('pre_witness_adjudicator_receipts_invalid');
  if (input.decisionLedgers !== undefined && ledgers === undefined) errors.push('decision_ledgers_invalid');
  if (input.temporalAttestations !== undefined && !Array.isArray(input.temporalAttestations)) errors.push('temporal_attestations_invalid');
  if (input.temporalEvidenceByAttestationId !== undefined && (!isRecord(input.temporalEvidenceByAttestationId) || Array.isArray(input.temporalEvidenceByAttestationId))) errors.push('temporal_evidence_map_invalid');
  if (input.admissionRecordBytes !== undefined && !(input.admissionRecordBytes instanceof Uint8Array)) errors.push('admission_record_bytes_invalid');
  if (input.admissionRecordBytes !== undefined && input.admissionRecordStream === undefined) errors.push('admission_record_stream_required');
  if (input.decisions !== undefined && input.preWitnessDecisions !== undefined && !sameCanonical(input.decisions, input.preWitnessDecisions)) errors.push('structured_alias_conflict:decisions');
  if (input.blindAssignments !== undefined && input.preWitnessBlindAssignments !== undefined && !sameCanonical(input.blindAssignments, input.preWitnessBlindAssignments)) errors.push('structured_alias_conflict:blind_assignments');
  if (input.blindReviewReceipts !== undefined && input.preWitnessBlindReviewReceipts !== undefined && !sameCanonical(input.blindReviewReceipts, input.preWitnessBlindReviewReceipts)) errors.push('structured_alias_conflict:blind_review_receipts');
  if (input.adjudicatorAssignments !== undefined && input.preWitnessAdjudicatorAssignments !== undefined && !sameCanonical(input.adjudicatorAssignments, input.preWitnessAdjudicatorAssignments)) errors.push('structured_alias_conflict:adjudicator_assignments');
  if (input.adjudicatorReceipts !== undefined && input.preWitnessAdjudicatorReceipts !== undefined && !sameCanonical(input.adjudicatorReceipts, input.preWitnessAdjudicatorReceipts)) errors.push('structured_alias_conflict:adjudicator_receipts');

  const recordValues = records ?? [];
  const sampleValues = reviewSamples ?? [];
  const decisionValues = decisions ?? [];
  const assignmentValues = assignments ?? [];
  const receiptValues = receipts ?? [];
  const adjudicatorAssignmentValues = adjudicatorAssignments ?? [];
  const adjudicatorReceiptValues = adjudicatorReceipts ?? [];
  const ledgerValues = ledgers ?? [];
  const temporalValidation = validateTemporalAdmissionAuthority({
    temporalAttestations: input.temporalAttestations,
    temporalEvidenceByAttestationId: input.temporalEvidenceByAttestationId,
    assignments: assignmentValues,
    decisions: decisionValues,
    receipts: receiptValues,
  });
  errors.push(...temporalValidation.errors);
  if (recordValues.length > 0 && input.admissionRecordStream === undefined) {
    errors.push('admission_record_stream_required');
    // Keep the old token for malformed callers of the pre-structured API.
    errors.push('admission_record_authority_not_implemented_in_this_slice');
  }
  if (input.admissionRecordBytes !== undefined && input.admissionRecordStream === undefined) {
    errors.push('admission_record_stream_required');
  }
  const decisionGraphPresent = decisionValues.length > 0
    || assignmentValues.length > 0
    || receiptValues.length > 0
    || adjudicatorAssignmentValues.length > 0
    || adjudicatorReceiptValues.length > 0
    || ledgerValues.length > 0;
  if (decisionGraphPresent && (decisionValues.length === 0 || assignmentValues.length === 0 || receiptValues.length === 0 || ledgerValues.length === 0)) {
    errors.push('decision_graph_incomplete');
  }
  if (decisionValues.length > 0 && (ledgerValues.length === 0 || assignmentValues.length === 0 || receiptValues.length === 0)) {
    errors.push('decision_graph_inputs_required');
    errors.push('decision_authority_not_implemented_in_this_slice');
  }
  if (ledgerValues.length > 0 && (decisionValues.length === 0 || assignmentValues.length === 0 || receiptValues.length === 0)) errors.push('decision_graph_inputs_required');

  const registerById = new Map(register.entries.map((entry) => [entry.sourceId, entry]));
  const reviewBySourceId = new Map(sourceReviews.map((review) => [review.sourceId, review]));
  const recordById = new Map<string, CalibrationAdmissionRecordV103>();
  const recordSourceIds: Record<string, string> = {};
  const recordCounts: Record<string, number> = {};

  if (input.admissionRecordStream !== undefined) {
    if (!isCalibrationAdmissionRecordStreamV1(input.admissionRecordStream)) {
      errors.push('admission_record_stream_invalid');
    } else if (records === undefined && input.admissionRecordStream.recordCount > 0) {
      errors.push('admission_records_required');
    } else {
      let bytes: Uint8Array;
      try {
        bytes = input.admissionRecordBytes instanceof Uint8Array
          ? input.admissionRecordBytes
          : admissionRecordJsonl(recordValues);
      } catch {
        bytes = new Uint8Array();
        errors.push('admission_record_bytes_invalid');
      }
      const streamValidation = validateCalibrationAdmissionRecordStreamV1(input.admissionRecordStream, bytes, recordValues);
      if (!streamValidation.ok) errors.push(...streamValidation.errors.map((error) => `record_stream: ${error}`));
    }
  }

  for (const value of recordValues) {
    const validation = isCalibrationAdmissionRecordV103(value)
      ? { ok: true, errors: [] as readonly string[] }
      : { ok: false, errors: ['record shape or identity is invalid'] as readonly string[] };
    if (!validation.ok) {
      errors.push(...validation.errors.map((error) => `record: ${error}`));
      continue;
    }
    const record = value as CalibrationAdmissionRecordV103;
    if (recordById.has(record.recordId)) errors.push(`duplicate admission record ${record.recordId}`);
    recordById.set(record.recordId, record);
    recordSourceIds[record.recordId] = record.materialSourceId;
    recordCounts[record.materialSourceId] = (recordCounts[record.materialSourceId] ?? 0) + 1;
    const entry = registerById.get(record.materialSourceId);
    const review = reviewBySourceId.get(record.materialSourceId);
    if (!entry || entry.kind !== 'material_source') errors.push(`record_source_identity_mismatch:${record.recordId}`);
    if (!review) errors.push(`record_source_review_missing:${record.recordId}`);
    else if (record.sourceReviewSha256 !== calibrationAdmissionSourceReviewSha256(review)) errors.push('record_source_review_mismatch');
    for (const aggregateSourceId of record.aggregateSourceIds) {
      const aggregate = registerById.get(aggregateSourceId);
      if (!aggregate || aggregate.kind !== 'aggregate_inventory' || !aggregate.childMaterialSourceIds.includes(record.materialSourceId)) {
        errors.push(`record_aggregate_identity_mismatch:${record.recordId}`);
      }
    }
  }
  for (const [sourceId, represented] of Object.entries(recordCounts)) {
    const entry = registerById.get(sourceId);
    if (entry && represented > entry.inventoryCandidateUnits) errors.push(`record_count_exceeds_source_inventory:${sourceId}`);
  }

  // Ledger target resolution must not infer a temporal source from a blind
  // assignment or repository name later in the graph.  Build the explicit
  // attestation-id -> repository/source map from validated attestations; an
  // absent mapping is intentionally left unresolved and Core fails closed.
  const sourceIdByTemporalAttestationId: Record<string, string> = {};
  const temporalAttestationValues = Array.isArray(input.temporalAttestations) ? input.temporalAttestations : [];
  for (const value of temporalAttestationValues) {
    if (!isCalibrationHistoricalTemporalAttestationV1(value)) continue;
    sourceIdByTemporalAttestationId[value.attestationId] = value.repositoryId;
  }

  const targetSourceId = (target: unknown): string | undefined => {
    if (!isRecord(target) || typeof target.kind !== 'string') return undefined;
    if (target.kind === 'source' && typeof target.sourceId === 'string') return target.sourceId;
    if ((target.kind === 'record' || target.kind === 'provider_revision_exception') && typeof target.recordId === 'string') return recordSourceIds[target.recordId];
    if (target.kind === 'temporal_attestation' && typeof target.temporalAttestationId === 'string') return sourceIdByTemporalAttestationId[target.temporalAttestationId];
    return undefined;
  };

  const sampleById = new Map<string, CalibrationAdmissionReviewSampleV1>();
  for (const value of sampleValues) {
    if (!isCalibrationAdmissionReviewSampleV1(value)) {
      errors.push('review_sample_invalid');
      continue;
    }
    const sample = value as CalibrationAdmissionReviewSampleV1;
    if (sampleById.has(sample.sampleId)) errors.push(`duplicate review sample ${sample.sampleId}`);
    sampleById.set(sample.sampleId, sample);
    if (!registerById.has(sample.sourceId) || registerById.get(sample.sourceId)?.kind !== 'material_source') errors.push(`review_sample_source_identity_mismatch:${sample.sampleId}`);
    const population = recordValues
      .filter((record): record is CalibrationAdmissionRecordV103 => isCalibrationAdmissionRecordV103(record) && record.materialSourceId === sample.sourceId)
      .map((record) => ({ logicalUnitId: record.logicalUnitId, stratumId: record.stratum }));
    const validation = validateCalibrationAdmissionReviewSampleV1(sample, population);
    if (!validation.ok) errors.push(...validation.errors.map((error) => `review_sample: ${error}`));
  }

  const assignmentById = new Map<string, CalibrationAdmissionBlindAssignmentV1>();
  for (const value of assignmentValues) {
    if (!isCalibrationAdmissionBlindAssignmentV1(value)) {
      errors.push('blind_assignment_invalid');
      continue;
    }
    const assignment = value as CalibrationAdmissionBlindAssignmentV1;
    if (assignmentById.has(assignment.assignmentId)) errors.push(`duplicate blind assignment ${assignment.assignmentId}`);
    assignmentById.set(assignment.assignmentId, assignment);
  }
  const adjudicatorAssignmentById = new Map<string, CalibrationAdmissionAdjudicatorAssignmentV1>();
  for (const value of adjudicatorAssignmentValues) {
    if (!isCalibrationAdmissionAdjudicatorAssignmentV1(value)) {
      errors.push('adjudicator_assignment_invalid');
      continue;
    }
    const assignment = value as CalibrationAdmissionAdjudicatorAssignmentV1;
    if (adjudicatorAssignmentById.has(assignment.assignmentId)) errors.push(`duplicate adjudicator assignment ${assignment.assignmentId}`);
    adjudicatorAssignmentById.set(assignment.assignmentId, assignment);
  }
  const decisionById = new Map<string, CalibrationAdmissionDecisionV103>();
  for (const value of decisionValues) {
    if (!isCalibrationAdmissionDecisionV103(value)) {
      errors.push('decision_invalid');
      continue;
    }
    const decision = value as CalibrationAdmissionDecisionV103;
    if (decisionById.has(decision.decisionId)) errors.push(`duplicate decision ${decision.decisionId}`);
    decisionById.set(decision.decisionId, decision);
    const assignment = assignmentById.get(decision.blindAssignmentId);
    const adjudicatorAssignment = adjudicatorAssignmentById.get(decision.blindAssignmentId);
    const validation = assignment !== undefined
      ? validateCalibrationAdmissionDecisionV103(decision, assignment)
      : adjudicatorAssignment !== undefined
        ? validateCalibrationAdmissionDecisionV103(decision)
        : validateCalibrationAdmissionDecisionV103(decision, assignment);
    if (!validation.ok) errors.push(...validation.errors.map((error) => `decision: ${error}`));
    const targetSource = targetSourceId(decision.target);
    if ((decision.target.kind === 'source' || decision.target.kind === 'record') && decision.reviewerRoles.includes('rights')) {
      const sourceReview = targetSource === undefined ? undefined : reviewBySourceId.get(targetSource);
      const rightsEvidenceIds = sourceReview?.sourceRights.evidenceIds ?? [];
      if (sourceReview === undefined || !rightsEvidenceIds.every((evidenceId) => decision.evidenceIds.includes(evidenceId))) {
        errors.push(`decision_rights_evidence_missing:${decision.decisionId}`);
      }
    }
    if (isRecord(decision.target) && decision.target.kind === 'record' && recordSourceIds[decision.target.recordId] === undefined) {
      errors.push(`decision_record_identity_missing:${decision.decisionId}`);
    }
  }
  const receiptById = new Map<string, CalibrationAdmissionBlindReviewReceiptV1>();
  for (const value of receiptValues) {
    if (!isCalibrationAdmissionBlindReviewReceiptV1(value)) {
      errors.push('blind_review_receipt_invalid');
      continue;
    }
    const receipt = value as CalibrationAdmissionBlindReviewReceiptV1;
    if (receiptById.has(receipt.receiptId)) errors.push(`duplicate blind review receipt ${receipt.receiptId}`);
    receiptById.set(receipt.receiptId, receipt);
    // The Core generated decision peer and the validator's authority-local
    // decision shape differ only at the optional tuple typing boundary. The
    // ledger validation below performs the complete decoded-decision join;
    // here validate the receipt shape and assignment binding independently.
    const validation = validateCalibrationAdmissionBlindReviewReceiptV1(receipt);
    if (!validation.ok) errors.push(...validation.errors.map((error) => `blind_review_receipt: ${error}`));
  }
  const adjudicatorReceiptById = new Map<string, CalibrationAdmissionAdjudicatorReceiptV1>();
  for (const value of adjudicatorReceiptValues) {
    if (!isCalibrationAdmissionAdjudicatorReceiptV1(value)) {
      errors.push('adjudicator_receipt_invalid');
      continue;
    }
    const receipt = value as CalibrationAdmissionAdjudicatorReceiptV1;
    if (adjudicatorReceiptById.has(receipt.receiptId)) errors.push(`duplicate adjudicator receipt ${receipt.receiptId}`);
    adjudicatorReceiptById.set(receipt.receiptId, receipt);
  }

  const ledgerIds = new Set<string>();
  const ledgerSources = new Set<string>();
  const ledgerDecisionMembership = new Map<string, string[]>();
  const ledgerAssignmentMembership = new Map<string, string[]>();
  const ledgerReceiptMembership = new Map<string, string[]>();
  const ledgerAdjudicatorAssignmentMembership = new Map<string, string[]>();
  const ledgerAdjudicatorReceiptMembership = new Map<string, string[]>();
  const addLedgerMembership = (membership: Map<string, string[]>, objectId: string, ledgerId: string): void => {
    const owners = membership.get(objectId) ?? [];
    owners.push(ledgerId);
    membership.set(objectId, owners);
  };
  for (const value of ledgerValues) {
    if (!isCalibrationAdmissionDecisionLedgerV1(value)) continue;
    const ledger = value as CalibrationAdmissionDecisionLedgerV1;
    if (ledgerIds.has(ledger.ledgerId)) errors.push(`decision_ledger_duplicate_id:${ledger.ledgerId}`);
    if (ledgerSources.has(ledger.sourceId)) errors.push(`decision_ledger_duplicate_source:${ledger.sourceId}`);
    ledgerIds.add(ledger.ledgerId);
    ledgerSources.add(ledger.sourceId);
    for (const decisionId of ledger.decisionIds) addLedgerMembership(ledgerDecisionMembership, decisionId, ledger.ledgerId);
    for (const assignmentId of ledger.blindAssignmentIds) addLedgerMembership(ledgerAssignmentMembership, assignmentId, ledger.ledgerId);
    for (const receiptId of ledger.blindReviewReceiptIds) addLedgerMembership(ledgerReceiptMembership, receiptId, ledger.ledgerId);
    for (const assignmentId of ledger.adjudicatorAssignmentIds ?? []) addLedgerMembership(ledgerAdjudicatorAssignmentMembership, assignmentId, ledger.ledgerId);
    for (const receiptId of ledger.adjudicatorReceiptIds ?? []) addLedgerMembership(ledgerAdjudicatorReceiptMembership, receiptId, ledger.ledgerId);
  }

  const requireExactlyOneLedger = (
    kind: 'decision' | 'assignment' | 'receipt' | 'adjudicator_assignment' | 'adjudicator_receipt',
    objectIds: Iterable<string>,
    membership: ReadonlyMap<string, readonly string[]>,
  ): void => {
    const suppliedIds = new Set(objectIds);
    for (const objectId of suppliedIds) {
      const owners = membership.get(objectId) ?? [];
      if (owners.length !== 1) errors.push(`decision_ledger_coverage_${kind}:${objectId}`);
    }
    for (const objectId of membership.keys()) {
      if (!suppliedIds.has(objectId)) errors.push(`decision_ledger_orphan_${kind}:${objectId}`);
    }
  };
  requireExactlyOneLedger('decision', decisionById.keys(), ledgerDecisionMembership);
  requireExactlyOneLedger('assignment', assignmentById.keys(), ledgerAssignmentMembership);
  requireExactlyOneLedger('receipt', receiptById.keys(), ledgerReceiptMembership);
  requireExactlyOneLedger('adjudicator_assignment', adjudicatorAssignmentById.keys(), ledgerAdjudicatorAssignmentMembership);
  requireExactlyOneLedger('adjudicator_receipt', adjudicatorReceiptById.keys(), ledgerAdjudicatorReceiptMembership);

  for (const value of ledgerValues) {
    if (!isCalibrationAdmissionDecisionLedgerV1(value)) {
      errors.push('decision_ledger_invalid');
      continue;
    }
    const ledger = value as CalibrationAdmissionDecisionLedgerV1;
    const sourceReview = reviewBySourceId.get(ledger.sourceId);
    if (!registerById.has(ledger.sourceId) || registerById.get(ledger.sourceId)?.kind !== 'material_source') errors.push(`decision_ledger_source_identity_mismatch:${ledger.ledgerId}`);
    if (!sourceReview || ledger.sourceReviewSha256 !== calibrationAdmissionSourceReviewSha256(sourceReview)) errors.push(`decision_ledger_source_review_mismatch:${ledger.ledgerId}`);
    const sample = ledger.reviewSampleId === undefined ? undefined : sampleById.get(ledger.reviewSampleId);
    if (ledger.reviewSampleId !== undefined && (!sample || sample.sourceId !== ledger.sourceId)) errors.push(`decision_ledger_sample_identity_mismatch:${ledger.ledgerId}`);
    const sourceRecords = recordValues.filter((record): record is CalibrationAdmissionRecordV103 => isCalibrationAdmissionRecordV103(record) && record.materialSourceId === ledger.sourceId);
    try {
      const expectedRecordSetSha256 = admissionRecordStreamContentSha256(admissionRecordJsonl(sourceRecords));
      if (ledger.admissionRecordSetSha256 !== expectedRecordSetSha256) errors.push(`decision_ledger_record_set_mismatch:${ledger.ledgerId}`);
    } catch {
      errors.push(`decision_ledger_record_set_invalid:${ledger.ledgerId}`);
    }
    const ledgerDecisions = decisionValues.filter((entry): entry is CalibrationAdmissionDecisionV103 => isCalibrationAdmissionDecisionV103(entry) && ledger.decisionIds.includes(entry.decisionId));
    const ledgerAssignments = assignmentValues.filter((entry): entry is CalibrationAdmissionBlindAssignmentV1 => isCalibrationAdmissionBlindAssignmentV1(entry) && ledger.blindAssignmentIds.includes(entry.assignmentId));
    const ledgerReceipts = receiptValues.filter((entry): entry is CalibrationAdmissionBlindReviewReceiptV1 => isCalibrationAdmissionBlindReviewReceiptV1(entry) && ledger.blindReviewReceiptIds.includes(entry.receiptId));
    const ledgerAdjudicatorAssignments = adjudicatorAssignmentValues.filter((entry): entry is CalibrationAdmissionAdjudicatorAssignmentV1 => isCalibrationAdmissionAdjudicatorAssignmentV1(entry) && (ledger.adjudicatorAssignmentIds ?? []).includes(entry.assignmentId));
    const ledgerAdjudicatorReceipts = adjudicatorReceiptValues.filter((entry): entry is CalibrationAdmissionAdjudicatorReceiptV1 => isCalibrationAdmissionAdjudicatorReceiptV1(entry) && (ledger.adjudicatorReceiptIds ?? []).includes(entry.receiptId));
    let decisionBytes: Uint8Array;
    let assignmentBytes: Uint8Array;
    let receiptBytes: Uint8Array;
    let adjudicatorAssignmentBytes: Uint8Array | undefined;
    let adjudicatorReceiptBytes: Uint8Array | undefined;
    try {
      decisionBytes = admissionRecordJsonl(ledgerDecisions);
      assignmentBytes = admissionRecordJsonl(ledgerAssignments);
      receiptBytes = admissionRecordJsonl(ledgerReceipts);
      adjudicatorAssignmentBytes = ledger.adjudicatorAssignmentIds === undefined ? undefined : admissionRecordJsonl(ledgerAdjudicatorAssignments);
      adjudicatorReceiptBytes = ledger.adjudicatorReceiptIds === undefined ? undefined : admissionRecordJsonl(ledgerAdjudicatorReceipts);
    } catch {
      errors.push(`decision_ledger_jsonl_invalid:${ledger.ledgerId}`);
      continue;
    }
    const validation = validateCalibrationAdmissionDecisionLedger(ledger, decisionBytes, assignmentBytes, receiptBytes, {
      recordSourceIds,
      sourceIdByRecordId: recordSourceIds,
      sourceIdByTemporalAttestationId,
    }, adjudicatorAssignmentBytes, adjudicatorReceiptBytes);
    if (!validation.ok) errors.push(...validation.errors.map((error) => `decision_ledger: ${error}`));
    for (const decisionId of ledger.decisionIds) {
      const decision = decisionById.get(decisionId);
      if (decision && targetSourceId(decision.target) !== undefined && targetSourceId(decision.target) !== ledger.sourceId) {
        errors.push(`decision_ledger_cross_source:decision:${decisionId}`);
      }
    }
    for (const assignmentId of ledger.blindAssignmentIds) {
      const assignment = assignmentById.get(assignmentId);
      if (assignment && targetSourceId(assignment.target) !== undefined && targetSourceId(assignment.target) !== ledger.sourceId) {
        errors.push(`decision_ledger_cross_source:assignment:${assignmentId}`);
      }
    }
    for (const receiptId of ledger.blindReviewReceiptIds) {
      const receipt = receiptById.get(receiptId);
      const assignment = receipt === undefined ? undefined : assignmentById.get(receipt.assignmentId);
      if (assignment && targetSourceId(assignment.target) !== undefined && targetSourceId(assignment.target) !== ledger.sourceId) {
        errors.push(`decision_ledger_cross_source:receipt:${receiptId}`);
      }
    }
    for (const assignmentId of ledger.adjudicatorAssignmentIds ?? []) {
      const assignment = adjudicatorAssignmentById.get(assignmentId);
      if (assignment && targetSourceId(assignment.target) !== undefined && targetSourceId(assignment.target) !== ledger.sourceId) {
        errors.push(`decision_ledger_cross_source:adjudicator_assignment:${assignmentId}`);
      }
    }
    for (const receiptId of ledger.adjudicatorReceiptIds ?? []) {
      const receipt = adjudicatorReceiptById.get(receiptId);
      const assignment = receipt === undefined ? undefined : adjudicatorAssignmentById.get(receipt.assignmentId);
      if (assignment && targetSourceId(assignment.target) !== undefined && targetSourceId(assignment.target) !== ledger.sourceId) {
        errors.push(`decision_ledger_cross_source:adjudicator_receipt:${receiptId}`);
      }
    }
  }
  for (const record of recordById.values()) {
    const requiresDecisions = record.declaredDisposition !== 'quarantine' || record.proposedLabel !== 'quarantine';
    if (requiresDecisions && record.reviewerDecisionIds.length < 2) errors.push(`record_decision_set_incomplete:${record.recordId}`);
    for (const decisionId of record.reviewerDecisionIds) {
      const decision = decisionById.get(decisionId);
      if (!decision) errors.push(`record_decision_missing:${record.recordId}`);
      else if (!isRecord(decision.target) || decision.target.kind !== 'record' || decision.target.recordId !== record.recordId) errors.push(`record_decision_identity_mismatch:${record.recordId}`);
      const owners = ledgerDecisionMembership.get(decisionId) ?? [];
      if (owners.length !== 1 || ledgerValues.find((entry) => isCalibrationAdmissionDecisionLedgerV1(entry) && entry.ledgerId === owners[0] && entry.sourceId === record.materialSourceId) === undefined) {
        errors.push(`record_decision_ledger_missing:${record.recordId}:${decisionId}`);
      }
    }
  }
  for (const sourceReview of sourceReviews) {
    for (const decisionId of sourceReview.reviewerDecisionIds) {
      const decision = decisionById.get(decisionId);
      if (!decision) {
        errors.push(`source_review_decision_missing:${sourceReview.sourceId}:${decisionId}`);
        continue;
      }
      if (targetSourceId(decision.target) !== sourceReview.sourceId) errors.push(`source_review_decision_source_mismatch:${sourceReview.sourceId}:${decisionId}`);
      const owners = ledgerDecisionMembership.get(decisionId) ?? [];
      if (owners.length !== 1) errors.push(`source_review_decision_ledger_missing:${sourceReview.sourceId}:${decisionId}`);
    }
  }
  if (errors.some((error) => error.startsWith('blind_') || error.startsWith('decision') || error.startsWith('record_decision') || error.startsWith('source_review_decision') || error.startsWith('adjudicator_') || error.startsWith('duplicate adjudicator'))) errors.push('structured_decision_graph_invalid');
  if (errors.some((error) => error.startsWith('temporal_') || error.startsWith('temporal_chain:'))) errors.push('structured_temporal_authority_invalid');
  if (errors.some((error) => error.startsWith('decision_ledger'))) errors.push('structured_decision_ledger_invalid');
  return { summary: { ...summary, valid: errors.length === 0 }, errors: [...new Set(errors)], recordCounts };
}

function diagnostic(
  blockers: readonly string[],
  context?: VerifiedAdmissionEvidenceContextV1,
  structured: AdmissionStructuredAuthoritySummaryV1 = EMPTY_STRUCTURED,
): AdmissionReviewResultV1 {
  return {
    version: 'v10.3-admission-review-v1',
    ready: false,
    authorityEligible: false,
    evidenceContextSha256: context?.evidenceContextSha256,
    sourceRegisterSha256: undefined,
    registeredSourceCount: 0,
    reviewedSourceCount: 0,
    candidateSourceCount: 0,
    counts: ZERO_COUNTS,
    sources: [],
    structured,
    recordCounts: {},
    blockers: [...new Set(blockers)],
  };
}

function sourceDiagnostics(
  register: CalibrationAdmissionSourceRegisterV1,
  reviews: readonly CalibrationSourceReviewV103[],
): readonly AdmissionReviewSourceDiagnosticV1[] {
  const reviewById = new Map(reviews.map((review) => [review.sourceId, review]));
  return register.entries.map((entry) => {
    const review = reviewById.get(entry.sourceId);
    const candidate = review?.decision === 'candidate';
    const decision: AdmissionReviewSourceDiagnosticV1['decision'] = review?.decision ?? 'unreviewed';
    return {
      sourceId: entry.sourceId,
      decision,
      candidate,
      // Candidate claims remain quarantined until static authorities and a
      // witness establish eligibility.
      quarantine: true,
      reasons: [...(review?.reasons ?? ['review_incomplete']), ...(candidate ? ['candidate_not_yet_eligible'] : [])].sort(),
    };
  }).sort((left, right) => left.sourceId.localeCompare(right.sourceId));
}

/** Pure, offline, fail-closed review diagnostic. */
export function reviewAdmissionSources(input: AdmissionReviewInputV1): AdmissionReviewResultV1 {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return diagnostic(['admission_review_input_invalid']);
  const context = isVerifiedAdmissionEvidenceContext(input.context) ? input.context : undefined;
  if (!context) return diagnostic(['verified_evidence_context_required']);

  const structuredBlockers: string[] = [];
  if (!Array.isArray(input.sourceReviews)) structuredBlockers.push('source_reviews_invalid');
  if (input.admissionRecords !== undefined && !Array.isArray(input.admissionRecords)) structuredBlockers.push('admission_records_invalid');
  if (input.reviewSamples !== undefined && !Array.isArray(input.reviewSamples)) structuredBlockers.push('review_samples_invalid');
  if (input.blindAssignments !== undefined && !Array.isArray(input.blindAssignments)) structuredBlockers.push('blind_assignments_invalid');
  if (input.blindReviewReceipts !== undefined && !Array.isArray(input.blindReviewReceipts)) structuredBlockers.push('blind_review_receipts_invalid');
  if (input.adjudicatorAssignments !== undefined && !Array.isArray(input.adjudicatorAssignments)) structuredBlockers.push('adjudicator_assignments_invalid');
  if (input.adjudicatorReceipts !== undefined && !Array.isArray(input.adjudicatorReceipts)) structuredBlockers.push('adjudicator_receipts_invalid');
  if (input.decisions !== undefined && !Array.isArray(input.decisions)) structuredBlockers.push('decisions_invalid');
  if (input.decisionLedgers !== undefined && !Array.isArray(input.decisionLedgers)) structuredBlockers.push('decision_ledgers_invalid');
  if (input.preWitnessDecisions !== undefined && !Array.isArray(input.preWitnessDecisions)) structuredBlockers.push('pre_witness_decisions_invalid');
  if (input.preWitnessBlindAssignments !== undefined && !Array.isArray(input.preWitnessBlindAssignments)) structuredBlockers.push('pre_witness_blind_assignments_invalid');
  if (input.preWitnessBlindReviewReceipts !== undefined && !Array.isArray(input.preWitnessBlindReviewReceipts)) structuredBlockers.push('pre_witness_blind_review_receipts_invalid');
  if (input.preWitnessAdjudicatorAssignments !== undefined && !Array.isArray(input.preWitnessAdjudicatorAssignments)) structuredBlockers.push('pre_witness_adjudicator_assignments_invalid');
  if (input.preWitnessAdjudicatorReceipts !== undefined && !Array.isArray(input.preWitnessAdjudicatorReceipts)) structuredBlockers.push('pre_witness_adjudicator_receipts_invalid');
  if (input.temporalAttestations !== undefined && !Array.isArray(input.temporalAttestations)) structuredBlockers.push('temporal_attestations_invalid');
  if (input.temporalEvidenceByAttestationId !== undefined && (!isRecord(input.temporalEvidenceByAttestationId) || Array.isArray(input.temporalEvidenceByAttestationId))) structuredBlockers.push('temporal_evidence_map_invalid');
  if (Array.isArray(input.admissionRecords) && input.admissionRecords.length > 0 && input.admissionRecordStream === undefined) {
    structuredBlockers.push('admission_record_stream_required', 'admission_record_authority_not_implemented_in_this_slice');
  }
  if (input.admissionRecordBytes !== undefined && input.admissionRecordStream === undefined) structuredBlockers.push('admission_record_stream_required');
  if (Array.isArray(input.decisions) && input.decisions.length > 0 && input.decisionLedgers === undefined) structuredBlockers.push('decision_authority_not_implemented_in_this_slice');
  const register = isCalibrationAdmissionSourceRegisterV1(input.sourceRegister) ? input.sourceRegister : undefined;
  if (structuredBlockers.some((blocker) => blocker.endsWith('_invalid') || blocker.endsWith('_not_implemented_in_this_slice'))) {
    return diagnostic([...(!register ? ['source_register_invalid'] : []), ...structuredBlockers], context, { ...EMPTY_STRUCTURED, present: structuredInputPresent(input), valid: false });
  }
  if (!register) return diagnostic(['source_register_invalid', ...structuredBlockers], context);
  if (structuredBlockers.length > 0) return diagnostic([...structuredBlockers, 'static_authority_unavailable', 'witness_authority_unavailable'], context, { ...EMPTY_STRUCTURED, present: structuredInputPresent(input), valid: false });

  const validation = validateCalibrationAdmissionSourceRegisterReviewSet(register, input.sourceReviews);
  if (!validation.ok) return diagnostic(validation.errors, context);
  const reviews = input.sourceReviews as readonly CalibrationSourceReviewV103[];
  const structured = validateStructuredAuthority(input, register, reviews);
  if (!structured.summary.valid) return diagnostic(structured.errors, context, structured.summary);

  const blockers = [
    'static_authority_unavailable',
    'witness_authority_unavailable',
    ...(Array.isArray(context.unavailableEvidenceIds) && context.unavailableEvidenceIds.length > 0 ? ['unavailable_evidence_remains_quarantine'] : []),
  ];
  if (!structured.summary.present && validation.candidateSourceCount > 0) blockers.unshift('structured_blind_review_authority_unavailable', 'structured_blind_decision_authority_unavailable');
  const counts = { ...sourceRegisterReviewCensusCounts(register, reviews, validation, structured.recordCounts), quarantineUnits: validation.additiveMaterialUnits };
  return {
    version: 'v10.3-admission-review-v1',
    ready: false,
    authorityEligible: false,
    evidenceContextSha256: context.evidenceContextSha256,
    sourceRegisterSha256: calibrationAdmissionSourceRegisterSha256(register),
    registeredSourceCount: validation.registeredSourceCount,
    reviewedSourceCount: validation.reviewedSourceCount,
    candidateSourceCount: validation.candidateSourceCount,
    counts,
    sources: sourceDiagnostics(register, reviews),
    structured: structured.summary,
    recordCounts: structured.recordCounts,
    blockers: [...new Set(blockers)],
  };
}
