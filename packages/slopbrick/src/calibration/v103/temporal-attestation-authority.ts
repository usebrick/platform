import {
  isCalibrationAdmissionBlindAssignmentV1,
  isCalibrationAdmissionBlindReviewReceiptV1,
  isCalibrationAdmissionDecisionV103,
  isCalibrationHistoricalTemporalAttestationV1,
  validateCalibrationHistoricalTemporalReviewChain,
  type TemporalEvidenceVerificationV1,
} from '@usebrick/core';

/**
 * The temporal portion of a pre-witness admission bundle is an explicit,
 * deterministic join rather than an ambient lookup.  The map key is the
 * attestation id, so every evidence verification is bound to exactly one
 * attestation before Core validates the bytes and review chain.
 */
export interface TemporalAdmissionAuthorityInputV1 {
  readonly temporalAttestations?: unknown;
  readonly temporalEvidenceByAttestationId?: unknown;
  readonly assignments?: unknown;
  readonly decisions?: unknown;
  readonly receipts?: unknown;
}

export interface TemporalAdmissionAuthorityValidationV1 {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sortedSet(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  const a = sortedSet(left);
  const b = sortedSet(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function temporalTargetId(value: unknown): string | undefined {
  if (!isRecord(value) || !isRecord(value.target) || value.target.kind !== 'temporal_attestation') return undefined;
  return typeof value.target.temporalAttestationId === 'string' ? value.target.temporalAttestationId : undefined;
}

/**
 * Validate all temporal attestations in a supplied structured admission graph.
 * This function is pure: it performs no filesystem, network, or evidence
 * resolution.  Core remains the authority for the attestation and blind
 * review-chain contracts; this layer only performs the deterministic joins
 * between the arrays in the SlopBrick input projection.
 */
export function validateTemporalAdmissionAuthority(
  input: TemporalAdmissionAuthorityInputV1,
): TemporalAdmissionAuthorityValidationV1 {
  const errors: string[] = [];
  const hasAttestations = input.temporalAttestations !== undefined;
  const hasEvidenceMap = input.temporalEvidenceByAttestationId !== undefined;
  const attestations = hasAttestations
    ? (Array.isArray(input.temporalAttestations) ? input.temporalAttestations : undefined)
    : [];
  const evidenceMap = hasEvidenceMap && isRecord(input.temporalEvidenceByAttestationId)
    ? input.temporalEvidenceByAttestationId
    : undefined;
  const assignments = input.assignments === undefined
    ? []
    : (Array.isArray(input.assignments) ? input.assignments : undefined);
  const decisions = input.decisions === undefined
    ? []
    : (Array.isArray(input.decisions) ? input.decisions : undefined);
  const receipts = input.receipts === undefined
    ? []
    : (Array.isArray(input.receipts) ? input.receipts : undefined);

  if (hasAttestations && attestations === undefined) errors.push('temporal_attestations_invalid');
  if (hasEvidenceMap && evidenceMap === undefined) errors.push('temporal_evidence_map_invalid');
  if (input.assignments !== undefined && assignments === undefined) errors.push('temporal_assignments_invalid');
  if (input.decisions !== undefined && decisions === undefined) errors.push('temporal_decisions_invalid');
  if (input.receipts !== undefined && receipts === undefined) errors.push('temporal_receipts_invalid');
  if (errors.length > 0 && attestations === undefined) return { ok: false, errors: [...new Set(errors)] };

  const attestationById = new Map<string, unknown>();
  for (const value of attestations ?? []) {
    if (!isCalibrationHistoricalTemporalAttestationV1(value)) {
      errors.push('temporal_attestation_invalid');
      continue;
    }
    if (attestationById.has(value.attestationId)) errors.push(`temporal_attestation_duplicate:${value.attestationId}`);
    attestationById.set(value.attestationId, value);
  }

  const attestationIds = [...attestationById.keys()];
  if (attestationIds.length > 0 && !hasEvidenceMap) errors.push('temporal_evidence_map_required');
  if (hasEvidenceMap && evidenceMap === undefined) errors.push('temporal_evidence_map_invalid');
  if (evidenceMap !== undefined && !sameIds(Object.keys(evidenceMap), attestationIds)) {
    for (const key of Object.keys(evidenceMap)) if (!attestationById.has(key)) errors.push(`temporal_evidence_without_attestation:${key}`);
    for (const id of attestationIds) if (!(id in evidenceMap)) errors.push(`temporal_evidence_missing:${id}`);
  }
  if (attestationIds.length === 0 && evidenceMap !== undefined && Object.keys(evidenceMap).length > 0) {
    for (const key of Object.keys(evidenceMap)) errors.push(`temporal_evidence_without_attestation:${key}`);
  }

  const temporalAssignments = (assignments ?? []).filter((value) => temporalTargetId(value) !== undefined);
  const temporalDecisions = (decisions ?? []).filter((value) => temporalTargetId(value) !== undefined);
  const assignmentById = new Map<string, unknown>();
  for (const value of assignments ?? []) {
    if (isCalibrationAdmissionBlindAssignmentV1(value)) assignmentById.set(value.assignmentId, value);
  }
  const temporalActive = attestationIds.length > 0
    || hasEvidenceMap
    || temporalAssignments.length > 0
    || temporalDecisions.length > 0;
  const temporalReceipts: unknown[] = [];
  for (const value of receipts ?? []) {
    const valid = isCalibrationAdmissionBlindReviewReceiptV1(value);
    const assignmentId = isRecord(value) && typeof value.assignmentId === 'string' ? value.assignmentId : undefined;
    if (!valid) {
      if (temporalActive) errors.push(assignmentId === undefined ? 'temporal_receipt_invalid' : `temporal_receipt_invalid:${assignmentId}`);
      continue;
    }
    const assignment = assignmentById.get(value.assignmentId);
    if (isCalibrationAdmissionBlindAssignmentV1(assignment) && assignment.target.kind === 'temporal_attestation') {
      temporalReceipts.push(value);
    } else if (assignment === undefined && temporalActive) {
      // A valid receipt with no supplied assignment cannot be classified as a
      // temporal or non-temporal receipt.  Keep the projection fail-closed;
      // the generic structured validator will also report the orphan.
      errors.push(`temporal_receipt_unknown_assignment:${value.assignmentId}`);
    }
  }

  // A temporal assignment or decision is not self-authenticating.  Without
  // the attestation projection (and its evidence map), those graph members
  // cannot be resolved to exact externally observed bytes, so reject them
  // explicitly rather than treating an empty attestation set as success.
  if (attestationIds.length === 0
    && (temporalAssignments.length > 0 || temporalDecisions.length > 0 || temporalReceipts.length > 0)) {
    errors.push('temporal_graph_requires_attestations');
  }

  for (const value of temporalAssignments) {
    const id = temporalTargetId(value);
    if (id !== undefined && !attestationById.has(id)) errors.push(`temporal_assignment_without_attestation:${id}`);
    if (!isCalibrationAdmissionBlindAssignmentV1(value)) errors.push('temporal_assignment_invalid');
  }
  for (const value of temporalDecisions) {
    const id = temporalTargetId(value);
    if (id !== undefined && !attestationById.has(id)) errors.push(`temporal_decision_without_attestation:${id}`);
    if (!isCalibrationAdmissionDecisionV103(value)) errors.push('temporal_decision_invalid');
  }
  for (const value of temporalReceipts) {
    if (!isCalibrationAdmissionBlindReviewReceiptV1(value)) continue;
    const assignment = assignmentById.get(value.assignmentId);
    const attestationId = temporalTargetId(assignment);
    if (attestationId !== undefined && !attestationById.has(attestationId)) {
      errors.push(`temporal_receipt_without_attestation:${value.receiptId}`);
    }
  }

  for (const attestationId of attestationIds) {
    const attestation = attestationById.get(attestationId);
    const matchingAssignments = temporalAssignments.filter((value) => temporalTargetId(value) === attestationId);
    if (matchingAssignments.length === 0) {
      errors.push(`temporal_assignment_missing:${attestationId}`);
      continue;
    }
    if (matchingAssignments.length !== 1) {
      errors.push(`temporal_assignment_count_invalid:${attestationId}`);
      continue;
    }
    const assignment = matchingAssignments[0];
    if (!isCalibrationAdmissionBlindAssignmentV1(assignment) || !isCalibrationHistoricalTemporalAttestationV1(attestation)) continue;
    if (assignment.target.kind !== 'temporal_attestation'
      || assignment.target.temporalAttestationId !== attestation.attestationId
      || assignment.target.exactBlobOrContentSha256 !== attestation.independentExternalObservation.exactBlobOrContentSha256) {
      errors.push(`temporal_assignment_target_mismatch:${attestationId}`);
    }

    const matchingDecisions = temporalDecisions.filter((value) => temporalTargetId(value) === attestationId);
    const matchingReceipts = temporalReceipts.filter((value) => isRecord(value) && value.assignmentId === assignment.assignmentId);
    if (matchingDecisions.length !== 2) errors.push(`temporal_decision_count_invalid:${attestationId}`);
    if (matchingReceipts.length !== 1) errors.push(`temporal_receipt_count_invalid:${attestationId}`);

    const evidence = evidenceMap?.[attestationId];
    if (evidence === undefined) {
      errors.push(`temporal_evidence_invalid:${attestationId}`);
      continue;
    }
    const receipt = matchingReceipts[0];
    if (receipt === undefined) continue;
    const chain = validateCalibrationHistoricalTemporalReviewChain(
      attestation,
      assignment,
      matchingDecisions,
      receipt,
      evidence as TemporalEvidenceVerificationV1,
    );
    for (const error of chain.errors) errors.push(`temporal_chain:${attestationId}:${error}`);
  }

  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}
