import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  calibrationAdmissionAdjudicatorAssignmentId,
  calibrationAdmissionAdjudicatorReceiptId,
  validateCalibrationAdmissionAdjudicatorGraph,
  type CalibrationAdmissionAdjudicatorAssignmentV1,
  type CalibrationAdmissionAdjudicatorReceiptV1,
  type CalibrationAdmissionBlindAssignmentV1,
  type CalibrationAdmissionBlindDecisionV1,
  type CalibrationAdmissionBlindReviewReceiptV1,
} from '../src/calibration-admission-blind-temporal';
import {
  admissionDecisionLedgerSha256,
  admissionRecordJsonl,
  isCalibrationAdmissionDecisionLedgerV1,
  validateCalibrationAdmissionDecisionLedger,
  type CalibrationAdmissionDecisionLedgerV1,
} from '../src/calibration-admission-record-authority';
import { calibrationAdmissionCanonicalJson, calibrationAdmissionSha256 } from '../src/calibration-admission-evidence';

const sha = (value: string): string => createHash('sha256').update(value).digest('hex');

interface AdjudicationFixture {
  readonly peerAssignment: CalibrationAdmissionBlindAssignmentV1;
  readonly priorDecisions: readonly [CalibrationAdmissionBlindDecisionV1, CalibrationAdmissionBlindDecisionV1];
  readonly peerReceipt: CalibrationAdmissionBlindReviewReceiptV1;
  readonly adjudicatorAssignment: CalibrationAdmissionAdjudicatorAssignmentV1;
  readonly adjudicatorDecision: CalibrationAdmissionBlindDecisionV1;
  readonly adjudicatorReceipt: CalibrationAdmissionAdjudicatorReceiptV1;
}

function decisionId(value: Record<string, unknown>): string {
  return sha(calibrationAdmissionCanonicalJson(value));
}

function makeFixture(agreeing = false): AdjudicationFixture {
  const peerTarget = { kind: 'source' as const, sourceId: 'source-a' };
  const peerEvidenceIds = ['authorship-evidence', 'rights-evidence'];
  const peerAssignmentWithoutId = {
    version: 'v10.3-admission-blind-assignment-v1' as const,
    target: peerTarget,
    evidenceSetSha256: calibrationAdmissionSha256(peerEvidenceIds),
    protocolEvidenceId: 'peer-protocol',
    reviewerIds: ['reviewer-a', 'reviewer-b'] as [string, string],
    peerMaterialHiddenUntilBothSealed: true as const,
  };
  const peerAssignment: CalibrationAdmissionBlindAssignmentV1 = {
    ...peerAssignmentWithoutId,
    assignmentId: sha(calibrationAdmissionCanonicalJson(peerAssignmentWithoutId)),
  };
  const makePeerDecision = (reviewerId: 'reviewer-a' | 'reviewer-b', proposedLabel: 'verified_ai' | 'verified_human'): CalibrationAdmissionBlindDecisionV1 => {
    const withoutId = {
      version: 'v10.3-admission-decision-v1' as const,
      target: peerTarget,
      reviewerId,
      reviewerRoles: [reviewerId === 'reviewer-a' ? 'authorship' : 'rights'],
      evidenceIds: peerEvidenceIds,
      blindAssignmentId: peerAssignment.assignmentId,
      result: { kind: 'admission' as const, proposedLabel, humanEditStatus: 'none' as const, disposition: 'eligible_gold' as const },
      reasons: [] as const,
      decidedAt: '2026-07-13T00:00:00.000Z',
    };
    return { ...withoutId, decisionId: decisionId(withoutId) };
  };
  const first = makePeerDecision('reviewer-a', 'verified_ai');
  const second = makePeerDecision('reviewer-b', agreeing ? 'verified_ai' : 'verified_human');
  const priorDecisions = [first, second].sort((left, right) => left.reviewerId.localeCompare(right.reviewerId)) as [CalibrationAdmissionBlindDecisionV1, CalibrationAdmissionBlindDecisionV1];
  const peerReceiptWithoutId = {
    version: 'v10.3-admission-blind-review-receipt-v1' as const,
    assignmentId: peerAssignment.assignmentId,
    evidenceSetSha256: peerAssignment.evidenceSetSha256,
    sealedDecisions: priorDecisions.map((decision) => ({ reviewerId: decision.reviewerId, decisionId: decision.decisionId, peerDecisionVisibleBeforeSeal: false as const })) as [CalibrationAdmissionBlindReviewReceiptV1['sealedDecisions'][0], CalibrationAdmissionBlindReviewReceiptV1['sealedDecisions'][0]],
    unsealedOnlyAfterBothDecisionIdsExisted: true as const,
    protocolAuditorId: 'peer-auditor',
    protocolAuditEvidenceIds: ['peer-protocol'],
  };
  const peerReceipt: CalibrationAdmissionBlindReviewReceiptV1 = {
    ...peerReceiptWithoutId,
    receiptId: sha(calibrationAdmissionCanonicalJson(peerReceiptWithoutId)),
  };
  const priorDecisionIds = priorDecisions.map((decision) => decision.decisionId).sort() as [string, string];
  const adjudicationEvidenceIds = [...priorDecisionIds, 'adjudication-protocol'].sort() as [string, ...string[]];
  const adjudicatorAssignmentWithoutId = {
    version: 'v10.3-admission-adjudicator-assignment-v1' as const,
    target: peerTarget,
    priorDecisionIds,
    priorBlindReviewReceiptId: peerReceipt.receiptId,
    evidenceIds: adjudicationEvidenceIds,
    evidenceSetSha256: calibrationAdmissionSha256(adjudicationEvidenceIds),
    protocolEvidenceId: 'adjudicator-protocol',
    adjudicatorId: 'adjudicator-a',
    priorPeerReceiptRequired: true as const,
  };
  const adjudicatorAssignment: CalibrationAdmissionAdjudicatorAssignmentV1 = {
    ...adjudicatorAssignmentWithoutId,
    assignmentId: calibrationAdmissionAdjudicatorAssignmentId(adjudicatorAssignmentWithoutId),
  };
  const adjudicatorDecisionWithoutId = {
    version: 'v10.3-admission-decision-v1' as const,
    target: peerTarget,
    reviewerId: adjudicatorAssignment.adjudicatorId,
    reviewerRoles: ['calibration'] as const,
    evidenceIds: adjudicationEvidenceIds,
    blindAssignmentId: adjudicatorAssignment.assignmentId,
    adjudicatesDecisionIds: priorDecisionIds,
    result: { kind: 'admission' as const, proposedLabel: 'quarantine' as const, humanEditStatus: 'unknown' as const, disposition: 'quarantine' as const },
    reasons: ['review_disagreement'] as const,
    decidedAt: '2026-07-13T00:01:00.000Z',
  };
  const adjudicatorDecision: CalibrationAdmissionBlindDecisionV1 = {
    ...adjudicatorDecisionWithoutId,
    decisionId: decisionId(adjudicatorDecisionWithoutId),
  };
  const adjudicatorReceiptWithoutId = {
    version: 'v10.3-admission-adjudicator-receipt-v1' as const,
    assignmentId: adjudicatorAssignment.assignmentId,
    priorDecisionIds,
    priorBlindReviewReceiptId: peerReceipt.receiptId,
    evidenceSetSha256: adjudicatorAssignment.evidenceSetSha256,
    adjudicationDecisionId: adjudicatorDecision.decisionId,
    adjudicatorId: adjudicatorAssignment.adjudicatorId,
    priorPeerReceiptObservedBeforeAdjudication: true as const,
    protocolAuditorId: 'adjudicator-auditor',
    protocolAuditEvidenceIds: ['adjudicator-protocol'],
  };
  const adjudicatorReceipt: CalibrationAdmissionAdjudicatorReceiptV1 = {
    ...adjudicatorReceiptWithoutId,
    receiptId: calibrationAdmissionAdjudicatorReceiptId(adjudicatorReceiptWithoutId),
  };
  return { peerAssignment, priorDecisions, peerReceipt, adjudicatorAssignment, adjudicatorDecision, adjudicatorReceipt };
}

function bytesSha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function makeLedgerFixture(): {
  readonly ledger: CalibrationAdmissionDecisionLedgerV1;
  readonly decisionBytes: Buffer;
  readonly assignmentBytes: Buffer;
  readonly receiptBytes: Buffer;
  readonly adjudicatorAssignmentBytes: Buffer;
  readonly adjudicatorReceiptBytes: Buffer;
} {
  const graph = makeFixture();
  const decisions = [...graph.priorDecisions, graph.adjudicatorDecision].sort((left, right) => left.reviewerId.localeCompare(right.reviewerId));
  const decisionBytes = admissionRecordJsonl(decisions);
  const assignmentBytes = admissionRecordJsonl([graph.peerAssignment]);
  const receiptBytes = admissionRecordJsonl([graph.peerReceipt]);
  const adjudicatorAssignmentBytes = admissionRecordJsonl([graph.adjudicatorAssignment]);
  const adjudicatorReceiptBytes = admissionRecordJsonl([graph.adjudicatorReceipt]);
  const ledgerWithoutHash = {
    version: 'v10.3-admission-decision-ledger-v1' as const,
    ledgerId: 'ledger-adjudication-a',
    sourceId: 'source-a',
    sourceReviewSha256: sha('source-review'),
    admissionRecordSetSha256: sha('record-set'),
    decisionJsonlSha256: bytesSha256(decisionBytes),
    decisionIds: decisions.map((decision) => decision.decisionId).sort(),
    blindAssignmentJsonlSha256: bytesSha256(assignmentBytes),
    blindAssignmentIds: [graph.peerAssignment.assignmentId],
    blindReviewReceiptJsonlSha256: bytesSha256(receiptBytes),
    blindReviewReceiptIds: [graph.peerReceipt.receiptId],
    adjudicatorAssignmentJsonlSha256: bytesSha256(adjudicatorAssignmentBytes),
    adjudicatorAssignmentIds: [graph.adjudicatorAssignment.assignmentId],
    adjudicatorReceiptJsonlSha256: bytesSha256(adjudicatorReceiptBytes),
    adjudicatorReceiptIds: [graph.adjudicatorReceipt.receiptId],
    adjudicationDecisionIds: [graph.adjudicatorDecision.decisionId],
  };
  return {
    ledger: { ...ledgerWithoutHash, ledgerSha256: admissionDecisionLedgerSha256(ledgerWithoutHash) },
    decisionBytes,
    assignmentBytes,
    receiptBytes,
    adjudicatorAssignmentBytes,
    adjudicatorReceiptBytes,
  };
}

describe('v10.3 dedicated adjudicator assignment/receipt contract', () => {
  it('accepts a disagreement graph without changing the exact-two peer receipt', () => {
    const graph = makeFixture();
    expect(validateCalibrationAdmissionAdjudicatorGraph(
      graph.peerAssignment,
      [...graph.priorDecisions].reverse(),
      graph.peerReceipt,
      graph.adjudicatorAssignment,
      graph.adjudicatorDecision,
      graph.adjudicatorReceipt,
    )).toEqual({ ok: true, errors: [] });
    expect(graph.peerReceipt.sealedDecisions).toHaveLength(2);
  });

  it('rejects agreeing peers, swapped prior IDs, cross-assignment, missing receipt, and duplicate prior IDs', () => {
    const graph = makeFixture();
    const agreeing = makeFixture(true);
    expect(validateCalibrationAdmissionAdjudicatorGraph(
      agreeing.peerAssignment,
      agreeing.priorDecisions,
      agreeing.peerReceipt,
      agreeing.adjudicatorAssignment,
      agreeing.adjudicatorDecision,
      agreeing.adjudicatorReceipt,
    ).errors).toContain('adjudication requires conflicting prior decisions');

    const swappedPriorIds = [...graph.adjudicatorAssignment.priorDecisionIds].reverse() as [string, string];
    const swappedAssignmentContent = { ...graph.adjudicatorAssignment, assignmentId: '', priorDecisionIds: swappedPriorIds };
    const { assignmentId: _ignoredSwappedId, ...swappedAssignmentWithoutId } = swappedAssignmentContent;
    const swappedAssignment = { ...swappedAssignmentContent, assignmentId: calibrationAdmissionAdjudicatorAssignmentId(swappedAssignmentWithoutId) };
    expect(validateCalibrationAdmissionAdjudicatorGraph(graph.peerAssignment, graph.priorDecisions, graph.peerReceipt, swappedAssignment, graph.adjudicatorDecision, graph.adjudicatorReceipt).ok).toBe(false);

    const crossAssignmentContent = { ...graph.adjudicatorDecision, blindAssignmentId: graph.peerAssignment.assignmentId, decisionId: '' };
    const { decisionId: _ignoredCrossId, ...crossAssignmentWithoutId } = crossAssignmentContent;
    const crossAssignmentDecision = { ...crossAssignmentContent, decisionId: decisionId(crossAssignmentWithoutId) };
    expect(validateCalibrationAdmissionAdjudicatorGraph(graph.peerAssignment, graph.priorDecisions, graph.peerReceipt, graph.adjudicatorAssignment, crossAssignmentDecision, graph.adjudicatorReceipt).errors).toContain('adjudicator decision assignment mismatch');

    const missingReceiptContent = { ...graph.adjudicatorAssignment, assignmentId: '', priorBlindReviewReceiptId: sha('missing-peer-receipt') };
    const { assignmentId: _ignoredMissingReceiptId, ...missingReceiptWithoutId } = missingReceiptContent;
    const missingReceiptAssignment = { ...missingReceiptContent, assignmentId: calibrationAdmissionAdjudicatorAssignmentId(missingReceiptWithoutId) };
    expect(validateCalibrationAdmissionAdjudicatorGraph(graph.peerAssignment, graph.priorDecisions, graph.peerReceipt, missingReceiptAssignment, graph.adjudicatorDecision, graph.adjudicatorReceipt).errors).toContain('adjudicator prior receipt mismatch');

    const duplicatePriorContent = { ...graph.adjudicatorAssignment, assignmentId: '', priorDecisionIds: [graph.adjudicatorAssignment.priorDecisionIds[0], graph.adjudicatorAssignment.priorDecisionIds[0]] as [string, string] };
    const { assignmentId: _ignoredDuplicateId, ...duplicatePriorWithoutId } = duplicatePriorContent;
    const duplicatePriorAssignment = { ...duplicatePriorContent, assignmentId: calibrationAdmissionAdjudicatorAssignmentId(duplicatePriorWithoutId) };
    expect(validateCalibrationAdmissionAdjudicatorGraph(graph.peerAssignment, graph.priorDecisions, graph.peerReceipt, duplicatePriorAssignment, graph.adjudicatorDecision, graph.adjudicatorReceipt).ok).toBe(false);
  });

  it('binds dedicated adjudication JSONL through the decision ledger while retaining legacy ledgers', () => {
    const fixture = makeLedgerFixture();
    const graph = makeFixture();
    expect(isCalibrationAdmissionDecisionLedgerV1(fixture.ledger)).toBe(true);
    expect(validateCalibrationAdmissionDecisionLedger(
      fixture.ledger,
      fixture.decisionBytes,
      fixture.assignmentBytes,
      fixture.receiptBytes,
      undefined,
      fixture.adjudicatorAssignmentBytes,
      fixture.adjudicatorReceiptBytes,
    )).toEqual({ ok: true, errors: [] });

    const wrongAssignmentIdsBody = { ...fixture.ledger, adjudicatorAssignmentIds: [sha('wrong-assignment')] };
    const wrongAssignmentIds = { ...wrongAssignmentIdsBody, ledgerSha256: admissionDecisionLedgerSha256(wrongAssignmentIdsBody) };
    expect(validateCalibrationAdmissionDecisionLedger(
      wrongAssignmentIds,
      fixture.decisionBytes,
      fixture.assignmentBytes,
      fixture.receiptBytes,
      undefined,
      fixture.adjudicatorAssignmentBytes,
      fixture.adjudicatorReceiptBytes,
    ).errors).toContain('adjudicatorAssignmentIds do not match assignment JSONL');

    const wrongReceiptHashBody = { ...fixture.ledger, adjudicatorReceiptJsonlSha256: sha('wrong-receipt-jsonl') };
    const wrongReceiptHash = { ...wrongReceiptHashBody, ledgerSha256: admissionDecisionLedgerSha256(wrongReceiptHashBody) };
    expect(validateCalibrationAdmissionDecisionLedger(
      wrongReceiptHash,
      fixture.decisionBytes,
      fixture.assignmentBytes,
      fixture.receiptBytes,
      undefined,
      fixture.adjudicatorAssignmentBytes,
      fixture.adjudicatorReceiptBytes,
    ).errors).toContain('adjudicator receipt JSONL hash does not match ledger');

    expect(validateCalibrationAdmissionDecisionLedger(
      fixture.ledger,
      fixture.decisionBytes,
      fixture.assignmentBytes,
      fixture.receiptBytes,
      undefined,
      fixture.adjudicatorAssignmentBytes,
    ).errors).toContain('adjudicator receipt JSONL bytes must match ledger declaration');

    const orphanReceiptBody = {
      ...graph.adjudicatorReceipt,
      receiptId: '',
      assignmentId: sha('unknown-adjudicator-assignment'),
    };
    const { receiptId: _ignoredOrphanReceiptId, ...orphanReceiptWithoutId } = orphanReceiptBody;
    const orphanReceipt = {
      ...orphanReceiptBody,
      receiptId: calibrationAdmissionAdjudicatorReceiptId(orphanReceiptWithoutId),
    };
    const orphanReceiptBytes = admissionRecordJsonl([orphanReceipt]);
    const orphanLedgerBody = {
      ...fixture.ledger,
      adjudicatorReceiptJsonlSha256: bytesSha256(orphanReceiptBytes),
      adjudicatorReceiptIds: [orphanReceipt.receiptId],
    };
    const orphanLedger = { ...orphanLedgerBody, ledgerSha256: admissionDecisionLedgerSha256(orphanLedgerBody) };
    expect(validateCalibrationAdmissionDecisionLedger(
      orphanLedger,
      fixture.decisionBytes,
      fixture.assignmentBytes,
      fixture.receiptBytes,
      undefined,
      fixture.adjudicatorAssignmentBytes,
      orphanReceiptBytes,
    ).errors).toContain('adjudicator receipt references an unknown adjudicator assignment');
  });
});
