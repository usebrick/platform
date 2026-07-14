import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/calibration/v103/admission-evidence-context', () => ({
  isVerifiedAdmissionEvidenceContext: (value: unknown): boolean => typeof value === 'object' && value !== null && (value as { readonly __verified?: unknown }).__verified === true,
}));

import { reviewAdmissionSources } from '../../src/calibration/v103/admission-review';
import {
  admissionDecisionLedgerSha256,
  admissionRecordJsonl,
  admissionRecordStreamContentSha256,
  admissionRecordStreamSha256,
  calibrationAdmissionBlindAssignmentId,
  calibrationAdmissionBlindReviewReceiptId,
  calibrationAdmissionAdjudicatorAssignmentId,
  calibrationAdmissionAdjudicatorReceiptId,
  calibrationAdmissionDecisionId,
  calibrationAdmissionInitialSourceIdsSha256,
  calibrationAdmissionMaterializationId,
  calibrationAdmissionRecordId,
  calibrationAdmissionReviewSamplePresentationKey,
  calibrationAdmissionReviewSampleSelectionKey,
  calibrationAdmissionSha256,
  calibrationAdmissionSourceRegisterEntrySha256,
  calibrationAdmissionSourceRegisterSha256,
  calibrationAdmissionSourceReviewSha256,
  type CalibrationAdmissionSourceRegisterV1,
  type CalibrationAdmissionRecordV103,
  type CalibrationAdmissionRecordStreamV1,
  type CalibrationAdmissionReviewSampleV1,
  type CalibrationAdmissionDecisionLedgerV1,
  type CalibrationAdmissionDecisionV103,
  type CalibrationAdmissionBlindAssignmentV1,
  type CalibrationAdmissionBlindReviewReceiptV1,
  type CalibrationAdmissionAdjudicatorAssignmentV1,
  type CalibrationAdmissionAdjudicatorReceiptV1,
  type CalibrationSourceReviewV103,
} from '@usebrick/core';

const context = { __verified: true, evidenceContextSha256: 'a'.repeat(64), unavailableEvidenceIds: [] };

const sha = (value: string): string => createHash('sha256').update(value).digest('hex');

interface StructuredGraphFixture {
  readonly register: CalibrationAdmissionSourceRegisterV1;
  readonly reviews: readonly CalibrationSourceReviewV103[];
  readonly record: CalibrationAdmissionRecordV103;
  readonly recordStream: CalibrationAdmissionRecordStreamV1;
  readonly sample: CalibrationAdmissionReviewSampleV1;
  readonly ledger: CalibrationAdmissionDecisionLedgerV1;
  readonly decisions: readonly CalibrationAdmissionDecisionV103[];
  readonly assignment: CalibrationAdmissionBlindAssignmentV1;
  readonly receipt: CalibrationAdmissionBlindReviewReceiptV1;
}

function makeStructuredGraph(): StructuredGraphFixture {
  const entries = [
    {
      sourceId: 'aggregate-a',
      kind: 'aggregate_inventory' as const,
      materialPartition: 'aggregate' as const,
      contributesToAdditiveCounts: false,
      childMaterialSourceIds: ['source-ai', 'source-human'],
      registerEvidenceIds: ['evidence-aggregate'],
      inventoryCandidateUnits: 452382,
    },
    {
      sourceId: 'source-ai',
      kind: 'material_source' as const,
      materialPartition: 'baseline' as const,
      contributesToAdditiveCounts: true,
      childMaterialSourceIds: [],
      registerEvidenceIds: ['evidence-source-ai'],
      inventoryCandidateUnits: 58089,
    },
    {
      sourceId: 'source-human',
      kind: 'material_source' as const,
      materialPartition: 'repository' as const,
      contributesToAdditiveCounts: true,
      childMaterialSourceIds: [],
      registerEvidenceIds: ['evidence-source-human'],
      inventoryCandidateUnits: 394293,
    },
  ].sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  const registerWithoutHash = {
    version: 'v10.3-admission-source-register-v1' as const,
    generation: 1,
    parentRegisterSha256: sha('parent-register'),
    initialSourceIdsSha256: calibrationAdmissionInitialSourceIdsSha256(entries.map((entry) => entry.sourceId)),
    appliedDeltaIds: ['delta-a'],
    rawDiscoveryPopulation: { declaredAi: 635830 as const, declaredHuman: 842520 as const, closedWorld: false as const },
    selectedCoverage: { total: 452382 as const, baselineMaterialUnits: 58089 as const, repositoryMaterialUnits: 394293 as const },
    entries,
  };
  const register = { ...registerWithoutHash, registerSha256: calibrationAdmissionSourceRegisterSha256(registerWithoutHash) };
  const reviews = register.entries.map((entry): CalibrationSourceReviewV103 => ({
    version: 'v10.3-source-review-v1',
    sourceId: entry.sourceId,
    sourceKind: entry.kind,
    contributesToAdditiveCounts: entry.contributesToAdditiveCounts,
    sourceRegisterEntrySha256: calibrationAdmissionSourceRegisterEntrySha256(entry),
    originEvidenceId: entry.registerEvidenceIds[0]!,
    origin: { kind: 'local_unpublished', localSourceId: entry.sourceId },
    materialization: entry.kind === 'aggregate_inventory'
      ? { kind: 'aggregate_only', childMaterialSourceIds: entry.childMaterialSourceIds }
      : (() => {
        const withoutId = { kind: 'git' as const, repositoryId: entry.sourceId, commitSha: sha(entry.sourceId).slice(0, 40) };
        return { ...withoutId, materializationId: calibrationAdmissionMaterializationId(entry.sourceId, entry.sourceId, withoutId) };
      })(),
    sourceRights: {
      status: 'absent',
      scope: entry.kind === 'aggregate_inventory' ? 'dataset' : 'code',
      analysisUse: 'unresolved',
      redistribution: 'unresolved',
      thirdPartyChain: 'incomplete',
      evidenceIds: [entry.registerEvidenceIds[0]!],
    },
    inventory: { physicalMemberCount: entry.inventoryCandidateUnits, candidateCodeUnitCount: entry.inventoryCandidateUnits, inventorySha256: sha(`inventory-${entry.sourceId}`), closedWorld: false },
    reviewerDecisionIds: [],
    reviewedAt: '2026-07-13T00:00:00.000Z',
    decision: 'source_quarantine',
    reasons: ['review_incomplete', 'source_wide_quarantine'],
  }));
  const sourceReview = reviews.find((review) => review.sourceId === 'source-ai')!;
  const contentSha256 = sha('record-content');
  const materializationWithoutId = { kind: 'git_file' as const, materializationId: 'mat-source-ai', normalizedPath: 'src/fixture.ts' };
  const recordWithoutId = {
    version: 'v10.3-admission-record-v1' as const,
    materialSourceId: 'source-ai',
    aggregateSourceIds: ['aggregate-a'],
    sourceReviewSha256: calibrationAdmissionSourceReviewSha256(sourceReview),
    logicalUnitId: 'unit-a',
    locator: materializationWithoutId,
    contentSha256,
    contentBytes: 42,
    language: 'typescript',
    stratum: 'production' as const,
    proposedLabel: 'verified_ai' as const,
    authorship: {
      kind: 'benchmark_attestation' as const,
      evidenceIds: ['evidence-authorship'],
      benchmarkId: 'benchmark-a',
      benchmarkVersion: 'v1',
      exactUnitBinding: 'unit-a',
      attestedAuthorship: 'ai_generated' as const,
      generator: {
        generatorProvider: 'provider-a',
        model: 'model-a',
        modelRevision: { status: 'pinned' as const, value: 'revision-a' },
        promptTaskId: 'prompt-a',
        promptSha256: sha('prompt-a'),
        outputSha256: contentSha256,
        generatedAt: '2026-07-13T00:00:00.000Z',
      },
      humanEditStatus: 'none' as const,
    },
    claimedLineage: { familyId: 'family-a', originRecordId: '', exactClusterId: 'exact-a', nearClusterId: 'near-a' },
    claimedAudits: { syntax: 'pass' as const, scaffoldByteShare: 0.1, privacy: 'pass' as const, secrets: 'pass' as const, exactOverlap: 'pass' as const, nearOverlap: 'pass' as const, familyLeakage: 'pass' as const, pairIntegrity: 'not_applicable' as const },
    reviewerDecisionIds: [] as string[],
    declaredDisposition: 'eligible_gold' as const,
    rejectionReasons: [] as const,
  };
  const recordId = calibrationAdmissionRecordId(recordWithoutId);
  const record = { ...recordWithoutId, recordId, claimedLineage: { ...recordWithoutId.claimedLineage, originRecordId: recordId } };
  const selected = [{
    logicalUnitId: 'unit-a',
    stratumId: 'production' as const,
    selectionKey: calibrationAdmissionReviewSampleSelectionKey('source-ai', 'unit-a', 'production'),
    presentationKey: calibrationAdmissionReviewSamplePresentationKey('source-ai', 'unit-a', 'production'),
  }];
  const sampleWithoutId = {
    version: 'v10.3-admission-review-sample-v1' as const,
    sampleId: 'sample-a',
    sourceId: 'source-ai',
    seed: 'slopbrick-v10.3-admission-review-v1' as const,
    populationSha256: calibrationAdmissionSha256([{ logicalUnitId: 'unit-a', stratumId: 'production' }]),
    populationCount: 1,
    strata: [{ stratumId: 'production' as const, populationCount: 1, requestedCount: 1 }],
    selected,
    selectionSha256: calibrationAdmissionSha256(selected.map(({ logicalUnitId, stratumId, selectionKey }) => ({ logicalUnitId, stratumId, selectionKey }))),
    presentationOrderSha256: calibrationAdmissionSha256(selected.map(({ logicalUnitId, stratumId, presentationKey }) => ({ logicalUnitId, stratumId, presentationKey }))),
    toolReceiptSha256: sha('sample-tool-receipt'),
  };
  const sample = sampleWithoutId;
  const assignmentWithoutId = {
    version: 'v10.3-admission-blind-assignment-v1' as const,
    target: { kind: 'record' as const, recordId },
    evidenceSetSha256: calibrationAdmissionSha256(['evidence-authorship', 'evidence-source-ai']),
    protocolEvidenceId: 'protocol-a',
    reviewerIds: ['reviewer-a', 'reviewer-b'] as [string, string],
    peerMaterialHiddenUntilBothSealed: true as const,
  };
  const assignment: CalibrationAdmissionBlindAssignmentV1 = { ...assignmentWithoutId, assignmentId: calibrationAdmissionBlindAssignmentId(assignmentWithoutId) };
  const decisionBase = {
    version: 'v10.3-admission-decision-v1' as const,
    target: { kind: 'record' as const, recordId },
    reviewerRoles: ['authorship', 'rights'] as ['authorship', 'rights'],
    evidenceIds: ['evidence-authorship', 'evidence-source-ai'],
    blindAssignmentId: assignment.assignmentId,
    result: { kind: 'admission' as const, proposedLabel: 'verified_ai' as const, humanEditStatus: 'none' as const, disposition: 'eligible_gold' as const },
    reasons: [] as const,
    decidedAt: '2026-07-13T00:00:00.000Z',
  };
  const makeDecision = (reviewerId: string): CalibrationAdmissionDecisionV103 => {
    const withoutId = { ...decisionBase, reviewerId };
    return { ...withoutId, decisionId: calibrationAdmissionDecisionId(withoutId) };
  };
  const decisions = [makeDecision('reviewer-a'), makeDecision('reviewer-b')].sort((left, right) => left.reviewerId.localeCompare(right.reviewerId));
  const recordWithDecisions = { ...record, reviewerDecisionIds: decisions.map((decision) => decision.decisionId).sort() };
  const recordBytes = admissionRecordJsonl([recordWithDecisions]);
  const recordStreamWithoutHash = {
    version: 'v10.3-admission-record-stream-v1' as const,
    relativePath: 'review/admission/admission-records.jsonl' as const,
    recordsJsonlSha256: admissionRecordStreamContentSha256(recordBytes),
    recordCount: 1,
    recordIdSetSha256: calibrationAdmissionSha256([recordWithDecisions.recordId]),
    canonicalRecordHashesSha256: calibrationAdmissionSha256([calibrationAdmissionSha256(recordWithDecisions)]),
  };
  const recordStream = { ...recordStreamWithoutHash, streamSha256: admissionRecordStreamSha256(recordStreamWithoutHash) };
  const receiptWithoutId = {
    version: 'v10.3-admission-blind-review-receipt-v1' as const,
    assignmentId: assignment.assignmentId,
    evidenceSetSha256: assignment.evidenceSetSha256,
    sealedDecisions: decisions.slice().sort((left, right) => left.reviewerId.localeCompare(right.reviewerId)).map((decision) => ({ reviewerId: decision.reviewerId, decisionId: decision.decisionId, peerDecisionVisibleBeforeSeal: false as const })) as [{ reviewerId: string; decisionId: string; peerDecisionVisibleBeforeSeal: false }, { reviewerId: string; decisionId: string; peerDecisionVisibleBeforeSeal: false }],
    unsealedOnlyAfterBothDecisionIdsExisted: true as const,
    protocolAuditorId: 'auditor-a',
    protocolAuditEvidenceIds: ['protocol-a'],
  };
  const receipt: CalibrationAdmissionBlindReviewReceiptV1 = { ...receiptWithoutId, receiptId: calibrationAdmissionBlindReviewReceiptId(receiptWithoutId) };
  const decisionBytes = admissionRecordJsonl(decisions);
  const assignmentBytes = admissionRecordJsonl([assignment]);
  const receiptBytes = admissionRecordJsonl([receipt]);
  const ledgerWithoutHash = {
    version: 'v10.3-admission-decision-ledger-v1' as const,
    ledgerId: 'ledger-a',
    sourceId: 'source-ai',
    sourceReviewSha256: calibrationAdmissionSourceReviewSha256(sourceReview),
    admissionRecordSetSha256: admissionRecordStreamContentSha256(recordBytes),
    reviewSampleId: sample.sampleId,
    decisionJsonlSha256: admissionRecordStreamContentSha256(decisionBytes),
    decisionIds: decisions.map((decision) => decision.decisionId).sort(),
    blindAssignmentJsonlSha256: admissionRecordStreamContentSha256(assignmentBytes),
    blindAssignmentIds: [assignment.assignmentId],
    blindReviewReceiptJsonlSha256: admissionRecordStreamContentSha256(receiptBytes),
    blindReviewReceiptIds: [receipt.receiptId],
    adjudicationDecisionIds: [],
  };
  const ledger = { ...ledgerWithoutHash, ledgerSha256: admissionDecisionLedgerSha256(ledgerWithoutHash) };
  return { register, reviews, record: recordWithDecisions, recordStream, sample, ledger, decisions, assignment, receipt };
}

interface StructuredAdjudicationGraphFixture extends StructuredGraphFixture {
  readonly adjudicatorAssignment: CalibrationAdmissionAdjudicatorAssignmentV1;
  readonly adjudicatorReceipt: CalibrationAdmissionAdjudicatorReceiptV1;
}

/** Extend the valid peer graph with one conflicting peer and one later adjudicator. */
function makeStructuredAdjudicationGraph(): StructuredAdjudicationGraphFixture {
  const base = makeStructuredGraph();
  const first = base.decisions[0]!;
  const secondContent = {
    ...base.decisions[1]!,
    result: { ...base.decisions[1]!.result, proposedLabel: 'verified_human' as const },
  };
  const { decisionId: _ignoredSecondId, ...secondWithoutId } = secondContent;
  const second: CalibrationAdmissionDecisionV103 = {
    ...secondWithoutId,
    decisionId: calibrationAdmissionDecisionId(secondWithoutId),
  };
  const priorDecisions = [first, second].sort((left, right) => left.reviewerId.localeCompare(right.reviewerId));
  const priorDecisionIds = priorDecisions.map((decision) => decision.decisionId).sort() as [string, string];
  const peerReceiptWithoutId = {
    ...base.receipt,
    sealedDecisions: priorDecisions.map((decision) => ({
      reviewerId: decision.reviewerId,
      decisionId: decision.decisionId,
      peerDecisionVisibleBeforeSeal: false as const,
    })) as CalibrationAdmissionBlindReviewReceiptV1['sealedDecisions'],
  };
  const { receiptId: _ignoredPeerReceiptId, ...peerReceiptContent } = peerReceiptWithoutId;
  const peerReceipt: CalibrationAdmissionBlindReviewReceiptV1 = {
    ...peerReceiptContent,
    receiptId: calibrationAdmissionBlindReviewReceiptId(peerReceiptContent),
  };
  const adjudicationEvidenceIds = [...priorDecisionIds, 'adjudicator-protocol'].sort() as [string, ...string[]];
  const adjudicatorAssignmentWithoutId = {
    version: 'v10.3-admission-adjudicator-assignment-v1' as const,
    target: base.assignment.target,
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
    target: base.assignment.target,
    reviewerId: adjudicatorAssignment.adjudicatorId,
    reviewerRoles: ['calibration'] as const,
    evidenceIds: adjudicationEvidenceIds,
    blindAssignmentId: adjudicatorAssignment.assignmentId,
    adjudicatesDecisionIds: priorDecisionIds,
    result: { kind: 'admission' as const, proposedLabel: 'quarantine' as const, humanEditStatus: 'unknown' as const, disposition: 'quarantine' as const },
    reasons: ['review_disagreement'] as const,
    decidedAt: '2026-07-13T00:01:00.000Z',
  };
  const adjudicatorDecision: CalibrationAdmissionDecisionV103 = {
    ...adjudicatorDecisionWithoutId,
    decisionId: calibrationAdmissionDecisionId(adjudicatorDecisionWithoutId),
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
  const record = { ...base.record, reviewerDecisionIds: priorDecisionIds };
  const recordBytes = admissionRecordJsonl([record]);
  const recordStreamWithoutHash = {
    ...base.recordStream,
    recordsJsonlSha256: admissionRecordStreamContentSha256(recordBytes),
    canonicalRecordHashesSha256: calibrationAdmissionSha256([calibrationAdmissionSha256(record)]),
  };
  const recordStream: CalibrationAdmissionRecordStreamV1 = {
    ...recordStreamWithoutHash,
    streamSha256: admissionRecordStreamSha256(recordStreamWithoutHash),
  };
  const decisions = [...priorDecisions, adjudicatorDecision].sort((left, right) => left.reviewerId.localeCompare(right.reviewerId));
  const decisionBytes = admissionRecordJsonl(decisions);
  const adjudicatorAssignmentBytes = admissionRecordJsonl([adjudicatorAssignment]);
  const adjudicatorReceiptBytes = admissionRecordJsonl([adjudicatorReceipt]);
  const ledgerWithoutHash = {
    ...base.ledger,
    admissionRecordSetSha256: admissionRecordStreamContentSha256(recordBytes),
    decisionJsonlSha256: admissionRecordStreamContentSha256(decisionBytes),
    decisionIds: decisions.map((decision) => decision.decisionId).sort(),
    blindReviewReceiptJsonlSha256: admissionRecordStreamContentSha256(admissionRecordJsonl([peerReceipt])),
    blindReviewReceiptIds: [peerReceipt.receiptId],
    adjudicatorAssignmentJsonlSha256: admissionRecordStreamContentSha256(adjudicatorAssignmentBytes),
    adjudicatorAssignmentIds: [adjudicatorAssignment.assignmentId],
    adjudicatorReceiptJsonlSha256: admissionRecordStreamContentSha256(adjudicatorReceiptBytes),
    adjudicatorReceiptIds: [adjudicatorReceipt.receiptId],
    adjudicationDecisionIds: [adjudicatorDecision.decisionId],
  };
  const ledger: CalibrationAdmissionDecisionLedgerV1 = {
    ...ledgerWithoutHash,
    ledgerSha256: admissionDecisionLedgerSha256(ledgerWithoutHash),
  };
  return { ...base, record, recordStream, decisions, receipt: peerReceipt, ledger, adjudicatorAssignment, adjudicatorReceipt };
}

describe('v10.3 admission review authority boundary', () => {
  it('fails closed before inspecting an unverified context', () => {
    const result = reviewAdmissionSources({ context: {}, sourceRegister: {}, sourceReviews: [] });
    expect(result).toMatchObject({ ready: false, authorityEligible: false, registeredSourceCount: 0, reviewedSourceCount: 0, candidateSourceCount: 0 });
    expect(result.blockers).toEqual(['verified_evidence_context_required']);
    expect(result.counts.eligibleUnits).toBe(0);
    expect(result.sources).toEqual([]);
  });

  it('reports structured authority as explicitly unavailable instead of counting supplied records or decisions', () => {
    const result = reviewAdmissionSources({
      context,
      sourceRegister: {},
      sourceReviews: [],
      admissionRecords: [{ recordId: 'record-a' }],
      decisions: [{ decisionId: 'decision-a' }],
    });
    expect(result.ready).toBe(false);
    expect(result.authorityEligible).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      'source_register_invalid',
      'admission_record_authority_not_implemented_in_this_slice',
      'decision_authority_not_implemented_in_this_slice',
    ]));
    expect(result.registeredSourceCount).toBe(0);
    expect(result.sources).toEqual([]);
  });

  it('does not synthesize a candidate or eligibility claim from malformed review inputs', () => {
    const result = reviewAdmissionSources({ context, sourceRegister: {}, sourceReviews: [{ sourceId: 'source-a', decision: 'candidate' }] });
    expect(result.ready).toBe(false);
    expect(result.authorityEligible).toBe(false);
    expect(result.candidateSourceCount).toBe(0);
    expect(result.counts.eligibleUnits).toBe(0);
    expect(result.blockers).toContain('source_register_invalid');
  });

  it('rejects non-array structured inputs instead of treating them as absent', () => {
    const result = reviewAdmissionSources({
      context,
      sourceRegister: {},
      sourceReviews: {} as unknown as readonly unknown[],
      admissionRecords: {} as unknown as readonly unknown[],
      decisions: {} as unknown as readonly unknown[],
    });
    expect(result.ready).toBe(false);
    expect(result.sources).toEqual([]);
    expect(result.blockers).toEqual(expect.arrayContaining(['source_register_invalid', 'source_reviews_invalid', 'admission_records_invalid', 'decisions_invalid']));
  });

  it('returns a diagnostic for null or array runtime inputs instead of throwing', () => {
    expect(reviewAdmissionSources(null as unknown as never).blockers).toEqual(['admission_review_input_invalid']);
    expect(reviewAdmissionSources([] as unknown as never).blockers).toEqual(['admission_review_input_invalid']);
  });

  it('consumes a non-empty record/sample/decision/ledger graph without turning it into eligibility', () => {
    const graph = makeStructuredGraph();
    const result = reviewAdmissionSources({
      context,
      sourceRegister: graph.register,
      sourceReviews: graph.reviews,
      admissionRecordStream: graph.recordStream,
      admissionRecords: [graph.record],
      reviewSamples: [graph.sample],
      decisions: graph.decisions,
      blindAssignments: [graph.assignment],
      blindReviewReceipts: [graph.receipt],
      decisionLedgers: [graph.ledger],
    });
    expect(result.ready).toBe(false);
    expect(result.authorityEligible).toBe(false);
    expect(result.counts.eligibleUnits).toBe(0);
    expect(result.blockers).toEqual(expect.arrayContaining(['static_authority_unavailable', 'witness_authority_unavailable']));
    expect(result.blockers).not.toContain('admission_record_authority_not_implemented_in_this_slice');
    expect(result.blockers).not.toContain('decision_authority_not_implemented_in_this_slice');
    expect(result.sources).toHaveLength(3);
  });

  it('consumes a dedicated disagreement adjudicator through the per-source ledger', () => {
    const graph = makeStructuredAdjudicationGraph();
    const result = reviewAdmissionSources({
      context,
      sourceRegister: graph.register,
      sourceReviews: graph.reviews,
      admissionRecordStream: graph.recordStream,
      admissionRecords: [graph.record],
      reviewSamples: [graph.sample],
      decisions: graph.decisions,
      blindAssignments: [graph.assignment],
      blindReviewReceipts: [graph.receipt],
      adjudicatorAssignments: [graph.adjudicatorAssignment],
      adjudicatorReceipts: [graph.adjudicatorReceipt],
      decisionLedgers: [graph.ledger],
    });
    expect(result.ready).toBe(false);
    expect(result.authorityEligible).toBe(false);
    expect(result.structured).toMatchObject({
      valid: true,
      adjudicatorAssignmentCount: 1,
      adjudicatorReceiptCount: 1,
    });
    expect(result.blockers).toEqual(expect.arrayContaining(['static_authority_unavailable', 'witness_authority_unavailable']));
    expect(result.blockers).not.toContain('structured_decision_ledger_invalid');
    expect(result.counts.eligibleUnits).toBe(0);

    const tamperedLedgerBody = {
      ...graph.ledger,
      adjudicatorAssignmentIds: [sha('missing-adjudicator-assignment')],
    };
    const tamperedLedger = {
      ...tamperedLedgerBody,
      ledgerSha256: admissionDecisionLedgerSha256(tamperedLedgerBody),
    };
    const tampered = reviewAdmissionSources({
      context,
      sourceRegister: graph.register,
      sourceReviews: graph.reviews,
      admissionRecordStream: graph.recordStream,
      admissionRecords: [graph.record],
      reviewSamples: [graph.sample],
      decisions: graph.decisions,
      blindAssignments: [graph.assignment],
      blindReviewReceipts: [graph.receipt],
      adjudicatorAssignments: [graph.adjudicatorAssignment],
      adjudicatorReceipts: [graph.adjudicatorReceipt],
      decisionLedgers: [tamperedLedger],
    });
    expect(tampered.sources).toEqual([]);
    expect(tampered.blockers).toContain('structured_decision_ledger_invalid');
    expect(tampered.blockers).toContain(`decision_ledger_coverage_adjudicator_assignment:${graph.adjudicatorAssignment.assignmentId}`);
  });

  it('rejects a record/source-review identity mismatch before projecting source counts', () => {
    const graph = makeStructuredGraph();
    const mismatchedRecord = { ...graph.record, sourceReviewSha256: sha('other-review') };
    const result = reviewAdmissionSources({
      context,
      sourceRegister: graph.register,
      sourceReviews: graph.reviews,
      admissionRecordStream: graph.recordStream,
      admissionRecords: [mismatchedRecord],
      reviewSamples: [graph.sample],
      decisions: graph.decisions,
      blindAssignments: [graph.assignment],
      blindReviewReceipts: [graph.receipt],
      decisionLedgers: [graph.ledger],
    });
    expect(result.sources).toEqual([]);
    expect(result.counts.eligibleUnits).toBe(0);
    expect(result.blockers).toContain('record_source_review_mismatch');
  });

  it('rejects orphaned record bytes without a canonical record stream', () => {
    const graph = makeStructuredGraph();
    const result = reviewAdmissionSources({
      context,
      sourceRegister: graph.register,
      sourceReviews: graph.reviews,
      admissionRecordBytes: new TextEncoder().encode('{}\n'),
    });
    expect(result.sources).toEqual([]);
    expect(result.blockers).toContain('admission_record_stream_required');
  });

  it('rejects an eligibility-bearing record without two reviewer decision IDs', () => {
    const graph = makeStructuredGraph();
    const result = reviewAdmissionSources({
      context,
      sourceRegister: graph.register,
      sourceReviews: graph.reviews,
      admissionRecordStream: graph.recordStream,
      admissionRecords: [{ ...graph.record, reviewerDecisionIds: [] }],
      reviewSamples: [graph.sample],
      decisions: graph.decisions,
      blindAssignments: [graph.assignment],
      blindReviewReceipts: [graph.receipt],
      decisionLedgers: [graph.ledger],
    });
    expect(result.sources).toEqual([]);
    expect(result.blockers).toContain(`record_decision_set_incomplete:${graph.record.recordId}`);
  });

  it('requires rights-role decisions to carry the source review rights evidence', () => {
    const graph = makeStructuredGraph();
    const withoutId = { ...graph.decisions[0]!, evidenceIds: ['evidence-authorship'] as const, decisionId: '' };
    const { decisionId: _ignoredDecisionId, ...decisionContent } = withoutId;
    const rightsEvidenceMissingDecision = { ...withoutId, decisionId: calibrationAdmissionDecisionId(decisionContent) };
    const result = reviewAdmissionSources({
      context,
      sourceRegister: graph.register,
      sourceReviews: graph.reviews,
      admissionRecordStream: graph.recordStream,
      admissionRecords: [graph.record],
      reviewSamples: [graph.sample],
      decisions: [rightsEvidenceMissingDecision, graph.decisions[1]!],
      blindAssignments: [graph.assignment],
      blindReviewReceipts: [graph.receipt],
      decisionLedgers: [graph.ledger],
    });
    expect(result.sources).toEqual([]);
    expect(result.blockers).toContain(`decision_rights_evidence_missing:${rightsEvidenceMissingDecision.decisionId}`);
    expect(result.blockers).toContain('structured_decision_graph_invalid');
  });

  it('rejects source-review decision references that are not present in the consumed graph', () => {
    const graph = makeStructuredGraph();
    const reviews = graph.reviews.map((review) => review.sourceId === 'aggregate-a'
      ? { ...review, reviewerDecisionIds: [sha('missing-source-review-decision')] }
      : review);
    const result = reviewAdmissionSources({
      context,
      sourceRegister: graph.register,
      sourceReviews: reviews,
      admissionRecordStream: graph.recordStream,
      admissionRecords: [graph.record],
      reviewSamples: [graph.sample],
      decisions: graph.decisions,
      blindAssignments: [graph.assignment],
      blindReviewReceipts: [graph.receipt],
      decisionLedgers: [graph.ledger],
    });
    expect(result.sources).toEqual([]);
    expect(result.blockers).toContain('source_review_decision_missing:aggregate-a:' + sha('missing-source-review-decision'));
    expect(result.blockers).toContain('structured_decision_graph_invalid');
  });

  it('rejects reviewer-independence violations in the consumed blind graph', () => {
    const graph = makeStructuredGraph();
    const sameReviewerAssignment = {
      ...graph.assignment,
      reviewerIds: ['reviewer-a', 'reviewer-a'] as [string, string],
    };
    const result = reviewAdmissionSources({
      context,
      sourceRegister: graph.register,
      sourceReviews: graph.reviews,
      admissionRecordStream: graph.recordStream,
      admissionRecords: [graph.record],
      reviewSamples: [graph.sample],
      decisions: graph.decisions,
      blindAssignments: [sameReviewerAssignment],
      blindReviewReceipts: [graph.receipt],
      decisionLedgers: [graph.ledger],
    });
    expect(result.sources).toEqual([]);
    expect(result.counts.eligibleUnits).toBe(0);
    expect(result.blockers).toContain('structured_decision_graph_invalid');
  });

  it('rejects a ledger self-hash mutation and never treats valid records as eligible', () => {
    const graph = makeStructuredGraph();
    const result = reviewAdmissionSources({
      context,
      sourceRegister: graph.register,
      sourceReviews: graph.reviews,
      admissionRecordStream: graph.recordStream,
      admissionRecords: [graph.record],
      reviewSamples: [graph.sample],
      decisions: graph.decisions,
      blindAssignments: [graph.assignment],
      blindReviewReceipts: [graph.receipt],
      decisionLedgers: [{ ...graph.ledger, ledgerSha256: sha('tampered-ledger') }],
    });
    expect(result.sources).toEqual([]);
    expect(result.counts.eligibleUnits).toBe(0);
    expect(result.blockers).toContain('structured_decision_ledger_invalid');
  });

  it('rejects assignment/receipt-only and decision-with-empty-ledger partial graphs', () => {
    const graph = makeStructuredGraph();
    const base = {
      context,
      sourceRegister: graph.register,
      sourceReviews: graph.reviews,
      admissionRecordStream: graph.recordStream,
      admissionRecords: [graph.record],
    };
    const assignmentOnly = reviewAdmissionSources({ ...base, blindAssignments: [graph.assignment] });
    expect(assignmentOnly.sources).toEqual([]);
    expect(assignmentOnly.blockers).toEqual(expect.arrayContaining(['decision_graph_incomplete', 'structured_decision_graph_invalid']));
    const decisionsWithoutLedger = reviewAdmissionSources({ ...base, decisions: graph.decisions, blindAssignments: [graph.assignment], blindReviewReceipts: [graph.receipt], decisionLedgers: [] });
    expect(decisionsWithoutLedger.sources).toEqual([]);
    expect(decisionsWithoutLedger.blockers).toEqual(expect.arrayContaining(['decision_graph_incomplete', 'decision_graph_inputs_required']));
    const bytesWithoutStream = reviewAdmissionSources({ ...base, admissionRecordStream: undefined, admissionRecordBytes: admissionRecordJsonl([graph.record]) });
    expect(bytesWithoutStream.sources).toEqual([]);
    expect(bytesWithoutStream.blockers).toContain('admission_record_stream_required');
  });

  it('rejects conflicting structured aliases and duplicate ledger/source identities', () => {
    const graph = makeStructuredGraph();
    const result = reviewAdmissionSources({
      context,
      sourceRegister: graph.register,
      sourceReviews: graph.reviews,
      admissionRecordStream: graph.recordStream,
      admissionRecords: [graph.record],
      reviewSamples: [graph.sample],
      decisions: graph.decisions,
      preWitnessDecisions: [...graph.decisions].reverse(),
      blindAssignments: [graph.assignment],
      blindReviewReceipts: [graph.receipt],
      decisionLedgers: [graph.ledger, graph.ledger],
    });
    expect(result.sources).toEqual([]);
    expect(result.blockers).toEqual(expect.arrayContaining([
      'structured_alias_conflict:decisions',
      `decision_ledger_duplicate_id:${graph.ledger.ledgerId}`,
      `decision_ledger_duplicate_source:${graph.ledger.sourceId}`,
    ]));
  });

  it('rejects a valid decision that is not covered by exactly one source ledger', () => {
    const graph = makeStructuredGraph();
    const withoutId = { ...graph.decisions[0]!, reviewerId: 'reviewer-c', decisionId: '' };
    const { decisionId: _ignoredDecisionId, ...decisionContent } = withoutId;
    const orphanDecision = { ...withoutId, decisionId: calibrationAdmissionDecisionId(decisionContent) };
    const result = reviewAdmissionSources({
      context,
      sourceRegister: graph.register,
      sourceReviews: graph.reviews,
      admissionRecordStream: graph.recordStream,
      admissionRecords: [graph.record],
      reviewSamples: [graph.sample],
      decisions: [...graph.decisions, orphanDecision],
      blindAssignments: [graph.assignment],
      blindReviewReceipts: [graph.receipt],
      decisionLedgers: [graph.ledger],
    });
    expect(result.sources).toEqual([]);
    expect(result.blockers).toContain(`decision_ledger_coverage_decision:${orphanDecision.decisionId}`);
    expect(result.blockers).toContain('structured_decision_ledger_invalid');
  });

  it('rejects decision, assignment, and receipt objects claimed by a cross-source ledger', () => {
    const graph = makeStructuredGraph();
    const humanReview = graph.reviews.find((review) => review.sourceId === 'source-human')!;
    const { reviewSampleId: _ignoredSampleId, ...ledgerWithoutSample } = graph.ledger;
    const foreignLedgerBody = {
      ...ledgerWithoutSample,
      ledgerId: 'ledger-b',
      sourceId: humanReview.sourceId,
      sourceReviewSha256: calibrationAdmissionSourceReviewSha256(humanReview),
      admissionRecordSetSha256: admissionRecordStreamContentSha256(admissionRecordJsonl([])),
    };
    const foreignLedger = { ...foreignLedgerBody, ledgerSha256: admissionDecisionLedgerSha256(foreignLedgerBody) };
    const result = reviewAdmissionSources({
      context,
      sourceRegister: graph.register,
      sourceReviews: graph.reviews,
      admissionRecordStream: graph.recordStream,
      admissionRecords: [graph.record],
      reviewSamples: [graph.sample],
      decisions: graph.decisions,
      blindAssignments: [graph.assignment],
      blindReviewReceipts: [graph.receipt],
      decisionLedgers: [graph.ledger, foreignLedger],
    });
    expect(result.sources).toEqual([]);
    expect(result.blockers).toContain('decision_ledger_cross_source:decision:' + graph.decisions[0]!.decisionId);
    expect(result.blockers).toContain('structured_decision_ledger_invalid');
  });
});
