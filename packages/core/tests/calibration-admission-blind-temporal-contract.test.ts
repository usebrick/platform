import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
  calibrationAdmissionBlindAssignmentId,
  calibrationAdmissionBlindReviewReceiptId,
  calibrationHistoricalTemporalAttestationId,
  isCalibrationAdmissionBlindAssignmentV1,
  isCalibrationAdmissionBlindReviewReceiptV1,
  isCalibrationHistoricalTemporalAttestationV1,
  validateCalibrationAdmissionBlindReviewGraph,
  validateCalibrationHistoricalTemporalAttestation,
  validateCalibrationHistoricalTemporalGold,
  validateCalibrationHistoricalTemporalReviewChain,
  type CalibrationAdmissionBlindAssignmentV1,
  type CalibrationAdmissionBlindDecisionV1,
  type CalibrationAdmissionBlindReviewReceiptV1,
  type CalibrationHistoricalTemporalAttestationV1,
  type TemporalEvidenceVerificationV1,
} from '../src/calibration-admission-blind-temporal';
import { calibrationAdmissionCanonicalJson, calibrationAdmissionSha256 } from '../src/calibration-admission-evidence';

const root = fileURLToPath(new URL('..', import.meta.url));
const sha = (value: string): string => createHash('sha256').update(value).digest('hex');
const commit = (character: string): string => character.repeat(40);

function attestation(): CalibrationHistoricalTemporalAttestationV1 {
  const withoutId = {
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
  return {
    ...withoutId,
    attestationId: calibrationHistoricalTemporalAttestationId(withoutId),
  };
}

function assignmentFor(value: CalibrationHistoricalTemporalAttestationV1): CalibrationAdmissionBlindAssignmentV1 {
  const withoutId = {
    version: 'v10.3-admission-blind-assignment-v1' as const,
    assignmentId: '',
    target: {
      kind: 'temporal_attestation' as const,
      temporalAttestationId: value.attestationId,
      exactBlobOrContentSha256: value.independentExternalObservation.exactBlobOrContentSha256,
    },
    evidenceSetSha256: calibrationAdmissionSha256(['archive-observation']),
    protocolEvidenceId: 'blind-protocol-v1',
    reviewerIds: ['provenance-a', 'provenance-b'] as const,
    peerMaterialHiddenUntilBothSealed: true as const,
  };
  return { ...withoutId, assignmentId: calibrationAdmissionBlindAssignmentId(withoutId) };
}

function decisionFor(
  assignment: CalibrationAdmissionBlindAssignmentV1,
  reviewerId: 'provenance-a' | 'provenance-b',
  decision: 'accepted' | 'rejected' = 'accepted',
): CalibrationAdmissionBlindDecisionV1 {
  const withoutId = {
    version: 'v10.3-admission-decision-v1' as const,
    decisionId: '',
    target: assignment.target,
    reviewerId,
    reviewerRoles: ['provenance'] as const,
    evidenceIds: ['archive-observation'],
    blindAssignmentId: assignment.assignmentId,
    result: { kind: 'temporal_attestation' as const, decision },
    reasons: [] as const,
    decidedAt: '2019-08-01T00:00:00.000Z',
  };
  const { decisionId: _ignoredDecisionId, ...decisionWithoutId } = withoutId;
  const decisionId = sha(calibrationAdmissionCanonicalJson(decisionWithoutId));
  return { ...withoutId, decisionId };
}

function receiptFor(
  assignment: CalibrationAdmissionBlindAssignmentV1,
  decisions: readonly CalibrationAdmissionBlindDecisionV1[],
): CalibrationAdmissionBlindReviewReceiptV1 {
  const withoutId = {
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
  return { ...withoutId, receiptId: calibrationAdmissionBlindReviewReceiptId(withoutId) };
}

function evidenceBinding(value: CalibrationHistoricalTemporalAttestationV1): TemporalEvidenceVerificationV1 {
  return {
    evidenceIds: [...value.independentExternalObservation.evidenceIds],
    evidenceReceiptIds: [...value.independentExternalObservation.evidenceReceiptIds],
    observedSha256: value.independentExternalObservation.exactBlobOrContentSha256,
    allReceiptsVerified: true,
  };
}

describe('v10.3 blind-assignment, blind-receipt, and temporal contracts', () => {
  it('compiles strict schemas and accepts the canonical fixtures', () => {
    const ajv = new Ajv({ allErrors: true, strict: true });
    addFormats(ajv);
    const assignmentSchema = JSON.parse(readFileSync(join(root, 'schemas', 'v1', 'calibration-admission-blind-assignment.schema.json'), 'utf8')) as object;
    const receiptSchema = JSON.parse(readFileSync(join(root, 'schemas', 'v1', 'calibration-admission-blind-review-receipt.schema.json'), 'utf8')) as object;
    const temporalSchema = JSON.parse(readFileSync(join(root, 'schemas', 'v1', 'calibration-historical-temporal-attestation.schema.json'), 'utf8')) as object;
    const assignment = assignmentFor(attestation());
    const first = decisionFor(assignment, 'provenance-a');
    const second = decisionFor(assignment, 'provenance-b');
    const receipt = receiptFor(assignment, [first, second]);
    const temporal = attestation();
    expect(ajv.compile(assignmentSchema)(assignment)).toBe(true);
    expect(ajv.compile(receiptSchema)(receipt)).toBe(true);
    expect(ajv.compile(temporalSchema)(temporal)).toBe(true);
    expect(isCalibrationAdmissionBlindAssignmentV1(assignment)).toBe(true);
    expect(isCalibrationAdmissionBlindReviewReceiptV1(receipt)).toBe(true);
    expect(isCalibrationHistoricalTemporalAttestationV1(temporal)).toBe(true);
  });

  it('enforces canonical self-hashes and rejects unknown or reordered fields', () => {
    const temporal = attestation();
    const assignment = assignmentFor(temporal);
    const first = decisionFor(assignment, 'provenance-a');
    const second = decisionFor(assignment, 'provenance-b');
    const receipt = receiptFor(assignment, [first, second]);
    expect(isCalibrationAdmissionBlindAssignmentV1({ ...assignment, protocolEvidenceId: 'changed' })).toBe(false);
    expect(isCalibrationAdmissionBlindAssignmentV1({ ...assignment, extra: true })).toBe(false);
    expect(isCalibrationAdmissionBlindAssignmentV1({ ...assignment, reviewerIds: ['provenance-b', 'provenance-a'] })).toBe(false);
    expect(isCalibrationAdmissionBlindReviewReceiptV1({ ...receipt, receiptId: sha('wrong') })).toBe(false);
    expect(isCalibrationAdmissionBlindReviewReceiptV1({ ...receipt, sealedDecisions: [{ ...receipt.sealedDecisions[0], peerDecisionVisibleBeforeSeal: true }, receipt.sealedDecisions[1]] })).toBe(false);
    expect(isCalibrationHistoricalTemporalAttestationV1({ ...temporal, normalizedPath: '../example.py' })).toBe(false);
    expect(isCalibrationHistoricalTemporalAttestationV1({ ...temporal, attestationId: sha('wrong') })).toBe(false);
  });

  it('accepts the acyclic assignment -> two decisions -> receipt graph', () => {
    const temporal = attestation();
    const assignment = assignmentFor(temporal);
    const first = decisionFor(assignment, 'provenance-a');
    const second = decisionFor(assignment, 'provenance-b');
    const receipt = receiptFor(assignment, [first, second]);
    expect(validateCalibrationAdmissionBlindReviewGraph(assignment, [first, second], receipt)).toEqual({ ok: true, errors: [] });
    expect(validateCalibrationAdmissionBlindReviewGraph(assignment, [second, first], receipt).ok).toBe(false);
    const futureReceiptReference = { ...first, evidenceIds: [receipt.receiptId] };
    expect(validateCalibrationAdmissionBlindReviewGraph(assignment, [futureReceiptReference, second], receipt).ok).toBe(false);
    expect(validateCalibrationAdmissionBlindReviewGraph(assignment, [first], receipt).ok).toBe(false);
    expect(validateCalibrationAdmissionBlindReviewGraph(assignment, [first, { ...second, blindAssignmentId: sha('other') }], receipt).ok).toBe(false);

    const sourceAssignmentWithoutId = {
      ...assignment,
      assignmentId: '',
      target: { kind: 'source' as const, sourceId: 'source-a' },
      reviewerIds: ['reviewer-a', 'reviewer-b'] as const,
    };
    const { assignmentId: _sourceAssignmentId, ...sourceAssignmentContent } = sourceAssignmentWithoutId;
    const sourceAssignment: CalibrationAdmissionBlindAssignmentV1 = {
      ...sourceAssignmentWithoutId,
      assignmentId: calibrationAdmissionBlindAssignmentId(sourceAssignmentContent),
    };
    const sourceDecision = (reviewerId: 'reviewer-a' | 'reviewer-b', reviewerRoles: readonly string[]) => {
      const withoutId = {
        ...first,
        decisionId: '',
        target: sourceAssignment.target,
        reviewerId,
        reviewerRoles,
        blindAssignmentId: sourceAssignment.assignmentId,
        result: { kind: 'admission' as const, proposedLabel: 'verified_ai' as const, humanEditStatus: 'none' as const, disposition: 'eligible_gold' as const },
      };
      const { decisionId: _sourceDecisionId, ...sourceDecisionContent } = withoutId;
      return { ...withoutId, decisionId: sha(calibrationAdmissionCanonicalJson(sourceDecisionContent)) } as CalibrationAdmissionBlindDecisionV1;
    };
    const sourceDecisions = [sourceDecision('reviewer-a', ['authorship']), sourceDecision('reviewer-b', ['rights'])];
    const sourceReceipt = receiptFor(sourceAssignment, sourceDecisions);
    expect(validateCalibrationAdmissionBlindReviewGraph(sourceAssignment, sourceDecisions, sourceReceipt).ok).toBe(true);
    const conflatedRoleDecisions = [sourceDecision('reviewer-a', ['authorship', 'rights']), sourceDecision('reviewer-b', ['calibration'])];
    const conflatedRoleReceipt = receiptFor(sourceAssignment, conflatedRoleDecisions);
    expect(validateCalibrationAdmissionBlindReviewGraph(sourceAssignment, conflatedRoleDecisions, conflatedRoleReceipt).ok).toBe(false);
  });

  it('requires exact external bytes and verified evidence receipts for temporal gold', () => {
    const temporal = attestation();
    const binding = evidenceBinding(temporal);
    expect(validateCalibrationHistoricalTemporalAttestation(temporal, binding)).toEqual({ ok: true, errors: [] });
    expect(validateCalibrationHistoricalTemporalGold(temporal, binding)).toEqual({ ok: true, errors: [] });
    expect(validateCalibrationHistoricalTemporalGold(temporal, { ...binding, observedSha256: sha('different') }).ok).toBe(false);
    expect(validateCalibrationHistoricalTemporalGold(temporal, { ...binding, allReceiptsVerified: false }).ok).toBe(false);
    expect(validateCalibrationHistoricalTemporalGold(temporal, { ...binding, allReceiptsVerified: 'yes' as unknown as boolean }).ok).toBe(false);
    expect(validateCalibrationHistoricalTemporalGold(temporal, { ...binding, evidenceIds: ['other-evidence'] }).ok).toBe(false);
    expect(validateCalibrationHistoricalTemporalGold({ ...temporal, bulkImportOrigin: 'indeterminate' }, binding).ok).toBe(false);
    expect(validateCalibrationHistoricalTemporalGold({ ...temporal, introducedAt: '2021-01-01T00:00:00.000Z' }, binding).ok).toBe(false);
    expect(validateCalibrationHistoricalTemporalAttestation({ ...temporal, introducedAt: '2019-02-31T00:00:00.000Z' }).ok).toBe(false);
  });

  it('requires two independent accepted provenance decisions and their post-decision receipt', () => {
    const temporal = attestation();
    const assignment = assignmentFor(temporal);
    const first = decisionFor(assignment, 'provenance-a');
    const second = decisionFor(assignment, 'provenance-b');
    const receipt = receiptFor(assignment, [first, second]);
    expect(validateCalibrationHistoricalTemporalReviewChain(temporal, assignment, [first, second], receipt, evidenceBinding(temporal))).toEqual({ ok: true, errors: [] });
    expect(validateCalibrationHistoricalTemporalReviewChain(temporal, assignment, [first, decisionFor(assignment, 'provenance-b', 'rejected')], receipt, evidenceBinding(temporal)).ok).toBe(false);
    expect(validateCalibrationHistoricalTemporalReviewChain(temporal, assignment, [first, { ...second, reviewerRoles: ['authorship'] }], receipt, evidenceBinding(temporal)).ok).toBe(false);
    expect(validateCalibrationHistoricalTemporalReviewChain(temporal, assignment, [first, second], { ...receipt, assignmentId: sha('other') }, evidenceBinding(temporal)).ok).toBe(false);
  });

  it('keeps Git-only history sensitivity-only and rejects temporal graph mutations', () => {
    const temporal = attestation();
    expect(isCalibrationHistoricalTemporalAttestationV1({ ...temporal, shallowRepository: true })).toBe(false);
    expect(isCalibrationHistoricalTemporalAttestationV1({ ...temporal, graftsOrReplaceRefsPresent: true })).toBe(false);
    expect(isCalibrationHistoricalTemporalAttestationV1({ ...temporal, independentExternalObservation: { ...temporal.independentExternalObservation, observedAt: '2021-01-01T00:00:00.000Z' } })).toBe(false);
    expect(validateCalibrationHistoricalTemporalGold(temporal, { ...evidenceBinding(temporal), allReceiptsVerified: false }).ok).toBe(false);
    expect(validateCalibrationHistoricalTemporalAttestation({ ...temporal, lastChangedAt: '2018-01-01T00:00:00.000Z', introducedAt: '2019-01-01T00:00:00.000Z' }).ok).toBe(false);
  });
});
