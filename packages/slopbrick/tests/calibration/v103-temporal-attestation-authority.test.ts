import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { validateTemporalAdmissionAuthority } from '../../src/calibration/v103/temporal-attestation-authority';
import {
  calibrationAdmissionBlindAssignmentId,
  calibrationAdmissionBlindReviewReceiptId,
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionDecisionId,
  calibrationAdmissionSha256,
  calibrationHistoricalTemporalAttestationId,
  type CalibrationAdmissionBlindAssignmentV1,
  type CalibrationAdmissionBlindReviewReceiptV1,
  type CalibrationAdmissionDecisionV103,
  type CalibrationHistoricalTemporalAttestationV1,
} from '@usebrick/core';

const sha = (value: string): string => createHash('sha256').update(value).digest('hex');
const commit = (character: string): string => character.repeat(40);

interface TemporalGraphFixture {
  readonly attestation: CalibrationHistoricalTemporalAttestationV1;
  readonly assignment: CalibrationAdmissionBlindAssignmentV1;
  readonly decisions: readonly [CalibrationAdmissionDecisionV103, CalibrationAdmissionDecisionV103];
  readonly receipt: CalibrationAdmissionBlindReviewReceiptV1;
  readonly evidence: {
    readonly evidenceIds: readonly string[];
    readonly evidenceReceiptIds: readonly string[];
    readonly observedSha256: string;
    readonly allReceiptsVerified: true;
  };
}

function makeTemporalGraph(): TemporalGraphFixture {
  const attestationWithoutId = {
    version: 'v10.3-historical-temporal-attestation-v1' as const,
    attestationId: '',
    repositoryId: 'human-repo',
    immutableCommitSha: commit('a'),
    normalizedPath: 'src/example.py',
    blobSha: commit('b'),
    completeCommitGraphSha256: sha('complete-graph'),
    shallowRepository: false as const,
    graftsOrReplaceRefsPresent: false as const,
    introducedCommitSha: commit('c'),
    lastChangedCommitSha: commit('d'),
    introducedAt: '2019-01-01T00:00:00.000Z',
    lastChangedAt: '2019-06-01T00:00:00.000Z',
    cutoff: '2020-01-01T00:00:00.000Z' as const,
    bulkImportOrigin: 'ruled_out' as const,
    independentExternalObservation: {
      kind: 'timestamped_source_archive' as const,
      observedAt: '2019-07-01T00:00:00.000Z',
      exactBlobOrContentSha256: sha('exact-pre-cutoff-bytes'),
      evidenceIds: ['archive-observation'] as [string],
      evidenceReceiptIds: [sha('archive-receipt')] as [string],
    },
    toolReceiptSha256: sha('temporal-tool-receipt'),
  };
  const attestation: CalibrationHistoricalTemporalAttestationV1 = {
    ...attestationWithoutId,
    attestationId: calibrationHistoricalTemporalAttestationId(attestationWithoutId),
  };

  const assignmentWithoutId = {
    version: 'v10.3-admission-blind-assignment-v1' as const,
    assignmentId: '',
    target: {
      kind: 'temporal_attestation' as const,
      temporalAttestationId: attestation.attestationId,
      exactBlobOrContentSha256: attestation.independentExternalObservation.exactBlobOrContentSha256,
    },
    evidenceSetSha256: calibrationAdmissionSha256(['archive-observation']),
    protocolEvidenceId: 'blind-protocol-v1',
    reviewerIds: ['provenance-a', 'provenance-b'] as const,
    peerMaterialHiddenUntilBothSealed: true as const,
  };
  const assignment: CalibrationAdmissionBlindAssignmentV1 = {
    ...assignmentWithoutId,
    assignmentId: calibrationAdmissionBlindAssignmentId(assignmentWithoutId),
  };

  const makeDecision = (reviewerId: 'provenance-a' | 'provenance-b'): CalibrationAdmissionDecisionV103 => {
    const withoutId = {
      version: 'v10.3-admission-decision-v1' as const,
      decisionId: '',
      target: assignment.target,
      reviewerId,
      reviewerRoles: ['provenance'] as const,
      evidenceIds: ['archive-observation'],
      blindAssignmentId: assignment.assignmentId,
      result: { kind: 'temporal_attestation' as const, decision: 'accepted' as const },
      reasons: [] as const,
      decidedAt: '2019-08-01T00:00:00.000Z',
    };
    return { ...withoutId, decisionId: calibrationAdmissionDecisionId(withoutId) };
  };
  const decisions = [makeDecision('provenance-a'), makeDecision('provenance-b')] as [CalibrationAdmissionDecisionV103, CalibrationAdmissionDecisionV103];
  const receiptWithoutId = {
    version: 'v10.3-admission-blind-review-receipt-v1' as const,
    receiptId: '',
    assignmentId: assignment.assignmentId,
    evidenceSetSha256: assignment.evidenceSetSha256,
    sealedDecisions: decisions.map((decision) => ({
      reviewerId: decision.reviewerId,
      decisionId: decision.decisionId,
      peerDecisionVisibleBeforeSeal: false as const,
    })) as [CalibrationAdmissionBlindReviewReceiptV1['sealedDecisions'][0], CalibrationAdmissionBlindReviewReceiptV1['sealedDecisions'][0]],
    unsealedOnlyAfterBothDecisionIdsExisted: true as const,
    protocolAuditorId: 'protocol-auditor',
    protocolAuditEvidenceIds: ['blind-protocol-v1'],
  };
  const receipt: CalibrationAdmissionBlindReviewReceiptV1 = {
    ...receiptWithoutId,
    receiptId: calibrationAdmissionBlindReviewReceiptId(receiptWithoutId),
  };

  return {
    attestation,
    assignment,
    decisions,
    receipt,
    evidence: {
      evidenceIds: [...attestation.independentExternalObservation.evidenceIds],
      evidenceReceiptIds: [...attestation.independentExternalObservation.evidenceReceiptIds],
      observedSha256: attestation.independentExternalObservation.exactBlobOrContentSha256,
      allReceiptsVerified: true,
    },
  };
}

function inputFor(graph: TemporalGraphFixture): Parameters<typeof validateTemporalAdmissionAuthority>[0] {
  return {
    temporalAttestations: [graph.attestation],
    temporalEvidenceByAttestationId: { [graph.attestation.attestationId]: graph.evidence },
    assignments: [graph.assignment],
    decisions: graph.decisions,
    receipts: [graph.receipt],
  };
}

describe('v10.3 temporal-attestation authority projection', () => {
  it('accepts one exact pre-cutoff attestation with two provenance decisions and one receipt', () => {
    const graph = makeTemporalGraph();
    expect(validateTemporalAdmissionAuthority(inputFor(graph))).toEqual({ ok: true, errors: [] });
  });

  it('requires a deterministic one-to-one evidence map and exact observed bytes', () => {
    const graph = makeTemporalGraph();
    const missingMap = validateTemporalAdmissionAuthority({ ...inputFor(graph), temporalEvidenceByAttestationId: undefined });
    expect(missingMap.errors).toContain('temporal_evidence_map_required');

    const undefinedEntry = validateTemporalAdmissionAuthority({
      ...inputFor(graph),
      temporalEvidenceByAttestationId: { [graph.attestation.attestationId]: undefined },
    });
    expect(undefinedEntry.errors).toContain(`temporal_evidence_invalid:${graph.attestation.attestationId}`);

    const extraMap = validateTemporalAdmissionAuthority({
      ...inputFor(graph),
      temporalEvidenceByAttestationId: {
        [graph.attestation.attestationId]: graph.evidence,
        [sha('extra-attestation')]: graph.evidence,
      },
    });
    expect(extraMap.errors).toContain(`temporal_evidence_without_attestation:${sha('extra-attestation')}`);

    const mismatchedBytes = validateTemporalAdmissionAuthority({
      ...inputFor(graph),
      temporalEvidenceByAttestationId: {
        [graph.attestation.attestationId]: { ...graph.evidence, observedSha256: sha('different-bytes') },
      },
    });
    expect(mismatchedBytes.errors.some((error) => error.startsWith(`temporal_chain:${graph.attestation.attestationId}:temporal_external_bytes_hash_mismatch`))).toBe(true);
  });

  it('does not silently drop orphan or malformed receipts', () => {
    const graph = makeTemporalGraph();
    const orphanReceiptBody = {
      ...graph.receipt,
      receiptId: '',
      assignmentId: sha('unknown-assignment'),
    };
    const orphanReceipt = {
      ...orphanReceiptBody,
      receiptId: calibrationAdmissionBlindReviewReceiptId(orphanReceiptBody),
    };
    const orphan = validateTemporalAdmissionAuthority({
      ...inputFor(graph),
      receipts: [graph.receipt, orphanReceipt],
    });
    expect(orphan.errors).toContain(`temporal_receipt_unknown_assignment:${orphanReceipt.assignmentId}`);

    const malformedReceipt = {
      ...graph.receipt,
      sealedDecisions: [
        { ...graph.receipt.sealedDecisions[0], peerDecisionVisibleBeforeSeal: true },
        graph.receipt.sealedDecisions[1],
      ],
    };
    const malformed = validateTemporalAdmissionAuthority({
      ...inputFor(graph),
      receipts: [malformedReceipt],
    });
    expect(malformed.errors).toContain(`temporal_receipt_invalid:${graph.assignment.assignmentId}`);
  });

  it('rejects missing, duplicate, and foreign temporal graph members', () => {
    const graph = makeTemporalGraph();
    const missingAssignment = validateTemporalAdmissionAuthority({ ...inputFor(graph), assignments: [] });
    expect(missingAssignment.errors).toContain(`temporal_assignment_missing:${graph.attestation.attestationId}`);

    const duplicateAssignment = validateTemporalAdmissionAuthority({
      ...inputFor(graph),
      assignments: [graph.assignment, graph.assignment],
    });
    expect(duplicateAssignment.errors).toContain(`temporal_assignment_count_invalid:${graph.attestation.attestationId}`);

    const foreignDecision = { ...graph.decisions[0], target: { ...graph.decisions[0].target, temporalAttestationId: sha('foreign-attestation') }, decisionId: '' };
    const { decisionId: _ignored, ...foreignDecisionContent } = foreignDecision;
    const foreignDecisionWithId = {
      ...foreignDecision,
      decisionId: sha(calibrationAdmissionCanonicalJson(foreignDecisionContent)),
    };
    const foreign = validateTemporalAdmissionAuthority({
      ...inputFor(graph),
      decisions: [graph.decisions[1], foreignDecisionWithId],
    });
    expect(foreign.errors).toContain(`temporal_decision_without_attestation:${sha('foreign-attestation')}`);
  });

  it('rejects temporal graph members when the attestation projection is omitted', () => {
    const graph = makeTemporalGraph();
    const result = validateTemporalAdmissionAuthority({
      temporalEvidenceByAttestationId: {},
      assignments: [graph.assignment],
      decisions: graph.decisions,
      receipts: [graph.receipt],
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('temporal_graph_requires_attestations');
    expect(result.errors).toContain(`temporal_assignment_without_attestation:${graph.attestation.attestationId}`);
    expect(result.errors).toContain(`temporal_decision_without_attestation:${graph.attestation.attestationId}`);
  });

  it('keeps temporal gold fail-closed for post-cutoff, shallow, or unverified history', () => {
    const graph = makeTemporalGraph();
    const postCutoff = {
      ...graph.attestation,
      introducedAt: '2021-01-01T00:00:00.000Z',
      attestationId: '',
    };
    const postCutoffWithoutId = { ...postCutoff };
    const postCutoffWithId = {
      ...postCutoff,
      attestationId: calibrationHistoricalTemporalAttestationId(postCutoffWithoutId),
    };
    const result = validateTemporalAdmissionAuthority({ ...inputFor(graph), temporalAttestations: [postCutoffWithId] });
    expect(result.errors).toContain('temporal_attestation_invalid');

    const unverified = validateTemporalAdmissionAuthority({
      ...inputFor(graph),
      temporalEvidenceByAttestationId: {
        [graph.attestation.attestationId]: { ...graph.evidence, allReceiptsVerified: false },
      },
    });
    expect(unverified.errors.some((error) => error.endsWith(':temporal_external_receipt_not_verified'))).toBe(true);
  });
});
