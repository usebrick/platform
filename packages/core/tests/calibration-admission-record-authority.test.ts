import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  admissionDecisionLedgerSha256,
  admissionRecordJsonl,
  admissionRecordStreamSha256,
  calibrationAdmissionBlindAssignmentId,
  calibrationAdmissionBlindReviewReceiptId,
  calibrationAdmissionDecisionId,
  calibrationAdmissionRecordId,
  calibrationAdmissionReviewSampleSelectionKey,
  calibrationAdmissionReviewSamplePresentationKey,
  calibrationAdmissionSha256,
  isCalibrationAdmissionDecisionV103,
  isCalibrationAdmissionDecisionLedgerV1,
  isCalibrationAdmissionRecordStreamV1,
  isCalibrationAdmissionRecordV103,
  isCalibrationAdmissionReviewSampleV1,
  validateCalibrationAdmissionBlindAssignmentV1,
  validateCalibrationAdmissionBlindReviewReceiptV1,
  validateCalibrationAdmissionDecisionLedger,
  validateCalibrationAdmissionDecisionV103,
  validateCalibrationAdmissionRecordStreamV1,
  validateCalibrationAdmissionReviewSampleV1,
  type CalibrationAdmissionDecisionV103,
  type CalibrationAdmissionDecisionLedgerV1,
  type CalibrationAdmissionRecordV103,
  type CalibrationAdmissionRecordStreamV1,
  type CalibrationAdmissionReviewSampleV1,
} from '../src/calibration-admission-record-authority';

const sha = (value: string): string => createHash('sha256').update(value).digest('hex');

function recordWithoutId(): Omit<CalibrationAdmissionRecordV103, 'recordId'> {
  return {
    version: 'v10.3-admission-record-v1',
    materialSourceId: 'source-a',
    aggregateSourceIds: ['aggregate-a'],
    sourceReviewSha256: sha('source-review'),
    logicalUnitId: 'unit-a',
    locator: { kind: 'git_file', materializationId: 'mat-a', normalizedPath: 'src/a.ts' },
    contentSha256: sha('content-a'),
    contentBytes: 42,
    language: 'typescript',
    stratum: 'production',
    proposedLabel: 'verified_ai',
    authorship: {
      kind: 'benchmark_attestation',
      evidenceIds: ['evidence-authorship'],
      benchmarkId: 'benchmark-a',
      benchmarkVersion: 'v1',
      exactUnitBinding: 'unit-a',
      attestedAuthorship: 'ai_generated',
      generator: {
        generatorProvider: 'provider-a',
        model: 'model-a',
        modelRevision: { status: 'pinned', value: 'revision-a' },
        promptTaskId: 'prompt-a',
        promptSha256: sha('prompt-a'),
        outputSha256: sha('content-a'),
        generatedAt: '2026-07-13T00:00:00.000Z',
      },
      humanEditStatus: 'none',
    },
    claimedLineage: {
      familyId: 'family-a',
      originRecordId: 'pending',
      exactClusterId: 'exact-a',
      nearClusterId: 'near-a',
    },
    claimedAudits: {
      syntax: 'pass',
      scaffoldByteShare: 0.1,
      privacy: 'pass',
      secrets: 'pass',
      exactOverlap: 'pass',
      nearOverlap: 'pass',
      familyLeakage: 'pass',
      pairIntegrity: 'not_applicable',
    },
    reviewerDecisionIds: [sha('decision-a'), sha('decision-b')].sort(),
    declaredDisposition: 'eligible_gold',
    rejectionReasons: [],
  };
}

function makeRecord(): CalibrationAdmissionRecordV103 {
  const withoutId = recordWithoutId();
  const idInput = {
    materialSourceId: withoutId.materialSourceId,
    logicalUnitId: withoutId.logicalUnitId,
    locator: withoutId.locator,
    contentSha256: withoutId.contentSha256,
    contentBytes: withoutId.contentBytes,
    language: withoutId.language,
  };
  const recordId = calibrationAdmissionRecordId(idInput);
  return { ...withoutId, recordId, claimedLineage: { ...withoutId.claimedLineage, originRecordId: recordId } };
}

function makeDecision(): CalibrationAdmissionDecisionV103 {
  const withoutId = {
    version: 'v10.3-admission-decision-v1' as const,
    target: { kind: 'record' as const, recordId: makeRecord().recordId },
    reviewerId: 'reviewer-a',
    reviewerRoles: ['authorship' as const, 'rights' as const],
    evidenceIds: ['evidence-authorship', 'evidence-rights'],
    blindAssignmentId: calibrationAdmissionBlindAssignmentId(makeAssignment()),
    result: {
      kind: 'admission' as const,
      proposedLabel: 'verified_ai' as const,
      humanEditStatus: 'none' as const,
      disposition: 'eligible_gold' as const,
    },
    reasons: [],
    decidedAt: '2026-07-13T00:00:00.000Z',
  };
  return { ...withoutId, decisionId: calibrationAdmissionDecisionId(withoutId) };
}

function makeAssignment() {
  const withoutId = {
    version: 'v10.3-admission-blind-assignment-v1' as const,
    assignmentId: '',
    target: { kind: 'record' as const, recordId: makeRecord().recordId },
    evidenceSetSha256: calibrationAdmissionSha256(['evidence-authorship', 'evidence-rights']),
    protocolEvidenceId: 'protocol-a',
    reviewerIds: ['reviewer-a', 'reviewer-b'] as [string, string],
    peerMaterialHiddenUntilBothSealed: true as const,
  };
  const { assignmentId: _ignored, ...withoutAssignmentId } = withoutId;
  return { ...withoutId, assignmentId: calibrationAdmissionBlindAssignmentId(withoutAssignmentId) };
}

function makeSample(): CalibrationAdmissionReviewSampleV1 {
  const population = [
    { logicalUnitId: 'unit-a', stratumId: 'production' as const },
    { logicalUnitId: 'unit-b', stratumId: 'production' as const },
  ];
  const selectedLogicalUnitId = population
    .slice()
    .sort((left, right) => calibrationAdmissionReviewSampleSelectionKey('source-a', left.logicalUnitId, left.stratumId).localeCompare(calibrationAdmissionReviewSampleSelectionKey('source-a', right.logicalUnitId, right.stratumId)))[0]!.logicalUnitId;
  const selected = [{
    logicalUnitId: selectedLogicalUnitId,
    stratumId: 'production' as const,
    selectionKey: calibrationAdmissionReviewSampleSelectionKey('source-a', selectedLogicalUnitId, 'production'),
    presentationKey: calibrationAdmissionReviewSamplePresentationKey('source-a', selectedLogicalUnitId, 'production'),
  }];
  return {
    version: 'v10.3-admission-review-sample-v1',
    sampleId: 'sample-a',
    sourceId: 'source-a',
    seed: 'slopbrick-v10.3-admission-review-v1',
    populationSha256: calibrationAdmissionSha256(population),
    populationCount: 2,
    strata: [{ stratumId: 'production', populationCount: 2, requestedCount: 1 }],
    selected,
    selectionSha256: calibrationAdmissionSha256(selected.map(({ logicalUnitId, stratumId, selectionKey }) => ({ logicalUnitId, stratumId, selectionKey }))),
    presentationOrderSha256: calibrationAdmissionSha256(selected.map(({ logicalUnitId, stratumId, presentationKey }) => ({ logicalUnitId, stratumId, presentationKey }))),
    toolReceiptSha256: sha('tool-receipt'),
  };
}

function makeLedger(): { ledger: CalibrationAdmissionDecisionLedgerV1; decisions: readonly CalibrationAdmissionDecisionV103[] } {
  const decision = makeDecision();
  const second = { ...decision, reviewerId: 'reviewer-b', decisionId: '' };
  const secondWithoutId = { ...second } as Record<string, unknown>;
  delete secondWithoutId.decisionId;
  const decisionB = { ...second, decisionId: calibrationAdmissionDecisionId(secondWithoutId) };
  const decisions = [decision, decisionB].sort((left, right) => left.reviewerId.localeCompare(right.reviewerId));
  const assignments = [makeAssignment()];
  const receiptWithoutId = {
    version: 'v10.3-admission-blind-review-receipt-v1',
    receiptId: '',
    assignmentId: assignments[0]!.assignmentId,
    evidenceSetSha256: assignments[0]!.evidenceSetSha256,
    sealedDecisions: [
      { reviewerId: 'reviewer-a', decisionId: decision.decisionId, peerDecisionVisibleBeforeSeal: false as const },
      { reviewerId: 'reviewer-b', decisionId: decisionB.decisionId, peerDecisionVisibleBeforeSeal: false as const },
    ] as [{ reviewerId: string; decisionId: string; peerDecisionVisibleBeforeSeal: false }, { reviewerId: string; decisionId: string; peerDecisionVisibleBeforeSeal: false }],
    unsealedOnlyAfterBothDecisionIdsExisted: true as const,
    protocolAuditorId: 'auditor-a',
    protocolAuditEvidenceIds: ['protocol-a'],
  };
  const { receiptId: _ignoredReceiptId, ...withoutReceiptId } = receiptWithoutId;
  const receipts = [{ ...receiptWithoutId, receiptId: calibrationAdmissionBlindReviewReceiptId(withoutReceiptId) }];
  const decisionsBytes = admissionRecordJsonl(decisions);
  const assignmentsBytes = admissionRecordJsonl(assignments);
  const receiptsBytes = admissionRecordJsonl(receipts);
  const withoutHash = {
    version: 'v10.3-admission-decision-ledger-v1' as const,
    ledgerId: 'ledger-a',
    sourceId: 'source-a',
    sourceReviewSha256: sha('source-review'),
    admissionRecordSetSha256: sha('record-set'),
    reviewSampleId: 'sample-a',
    decisionJsonlSha256: sha256Bytes(decisionsBytes),
    decisionIds: decisions.map((value) => value.decisionId).sort(),
    blindAssignmentJsonlSha256: sha256Bytes(assignmentsBytes),
    blindAssignmentIds: assignments.map((value) => value.assignmentId),
    blindReviewReceiptJsonlSha256: sha256Bytes(receiptsBytes),
    blindReviewReceiptIds: receipts.map((value) => value.receiptId),
    adjudicationDecisionIds: [],
  };
  return {
    decisions,
    ledger: { ...withoutHash, ledgerSha256: admissionDecisionLedgerSha256(withoutHash) },
  };
}

function sha256Bytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

describe('v10.3 admission record/review authority contracts', () => {
  it('accepts a canonical record and derives a stable identity from immutable fields', () => {
    const record = makeRecord();
    expect(record.recordId).toBe(calibrationAdmissionRecordId({
      materialSourceId: record.materialSourceId,
      logicalUnitId: record.logicalUnitId,
      locator: record.locator,
      contentSha256: record.contentSha256,
      contentBytes: record.contentBytes,
      language: record.language,
    }));
    expect(isCalibrationAdmissionRecordV103(record)).toBe(true);
    expect(isCalibrationAdmissionRecordV103({ ...record, contentBytes: 43 })).toBe(false);
  });

  it('validates stream bytes and rejects missing, extra, duplicate, or non-canonical records', () => {
    const record = makeRecord();
    const bytes = admissionRecordJsonl([record]);
    const withoutHash = {
      version: 'v10.3-admission-record-stream-v1' as const,
      relativePath: 'review/admission/admission-records.jsonl' as const,
      recordsJsonlSha256: sha256Bytes(bytes),
      recordCount: 1,
      recordIdSetSha256: calibrationAdmissionSha256([record.recordId]),
      canonicalRecordHashesSha256: calibrationAdmissionSha256([calibrationAdmissionSha256(record)]),
    };
    const stream: CalibrationAdmissionRecordStreamV1 = { ...withoutHash, streamSha256: admissionRecordStreamSha256(withoutHash) };
    expect(isCalibrationAdmissionRecordStreamV1(stream)).toBe(true);
    expect(validateCalibrationAdmissionRecordStreamV1(stream, bytes, [record])).toMatchObject({ ok: true });
    expect(validateCalibrationAdmissionRecordStreamV1(stream, admissionRecordJsonl([record, record]), [record, record]).ok).toBe(false);
    expect(validateCalibrationAdmissionRecordStreamV1(stream, Buffer.from(`${JSON.stringify(record)}\n`), [record]).ok).toBe(false);
  });

  it('enforces review sample keys, stratum counts, and selection/presentation hashes', () => {
    const sample = makeSample();
    const population = [
      { logicalUnitId: 'unit-a', stratumId: 'production' as const },
      { logicalUnitId: 'unit-b', stratumId: 'production' as const },
    ];
    expect(isCalibrationAdmissionReviewSampleV1(sample)).toBe(true);
    expect(validateCalibrationAdmissionReviewSampleV1(sample, population)).toMatchObject({ ok: true });
    expect(validateCalibrationAdmissionReviewSampleV1({ ...sample, selected: [{ ...sample.selected[0]!, selectionKey: sha('wrong') }] }, population).ok).toBe(false);
    const nonMinimumLogicalUnitId = population.find((entry) => entry.logicalUnitId !== sample.selected[0]!.logicalUnitId)!.logicalUnitId;
    const nonMinimumSelected = [{
      logicalUnitId: nonMinimumLogicalUnitId,
      stratumId: 'production' as const,
      selectionKey: calibrationAdmissionReviewSampleSelectionKey('source-a', nonMinimumLogicalUnitId, 'production'),
      presentationKey: calibrationAdmissionReviewSamplePresentationKey('source-a', nonMinimumLogicalUnitId, 'production'),
    }];
    expect(validateCalibrationAdmissionReviewSampleV1({
      ...sample,
      selected: nonMinimumSelected,
      selectionSha256: calibrationAdmissionSha256(nonMinimumSelected.map(({ logicalUnitId, stratumId, selectionKey }) => ({ logicalUnitId, stratumId, selectionKey }))),
      presentationOrderSha256: calibrationAdmissionSha256(nonMinimumSelected.map(({ logicalUnitId, stratumId, presentationKey }) => ({ logicalUnitId, stratumId, presentationKey }))),
    }, population).errors).toContain('selected entries are not the smallest selection keys for each stratum');
    expect(validateCalibrationAdmissionReviewSampleV1({ ...sample, strata: [{ stratumId: 'production', populationCount: 2, requestedCount: 2 }] }).ok).toBe(false);
    expect(validateCalibrationAdmissionReviewSampleV1({ ...sample, selected: [], selectionSha256: calibrationAdmissionSha256([]), presentationOrderSha256: calibrationAdmissionSha256([]) }).ok).toBe(false);
  });

  it('accepts a hash-bound ledger and rejects JSONL/hash/ID-set mutations', () => {
    const { ledger, decisions } = makeLedger();
    expect(isCalibrationAdmissionDecisionV103(decisions[0])).toBe(true);
    expect(isCalibrationAdmissionDecisionLedgerV1(ledger)).toBe(true);
    const assignments = [makeAssignment()];
    const receiptWithoutId = {
      version: 'v10.3-admission-blind-review-receipt-v1' as const, receiptId: '', assignmentId: assignments[0]!.assignmentId, evidenceSetSha256: assignments[0]!.evidenceSetSha256,
      sealedDecisions: decisions.slice().sort((left, right) => left.reviewerId.localeCompare(right.reviewerId)).map((value) => ({ reviewerId: value.reviewerId, decisionId: value.decisionId, peerDecisionVisibleBeforeSeal: false })),
      unsealedOnlyAfterBothDecisionIdsExisted: true as const, protocolAuditorId: 'auditor-a', protocolAuditEvidenceIds: ['protocol-a'],
    };
    const { receiptId: _ignoredReceiptId, ...withoutReceiptId } = receiptWithoutId;
    const receipts = [{ ...receiptWithoutId, receiptId: calibrationAdmissionBlindReviewReceiptId(withoutReceiptId) }];
    const validation = validateCalibrationAdmissionDecisionLedger(ledger, admissionRecordJsonl(decisions), admissionRecordJsonl(assignments), admissionRecordJsonl(receipts), {
      recordSourceIds: { [String((decisions[0]!.target as { recordId: string }).recordId)]: 'source-a' },
    });
    expect(validation).toMatchObject({ ok: true });
    const unsortedDecisions = decisions.slice().reverse();
    const unsortedDecisionBytes = admissionRecordJsonl(unsortedDecisions);
    const unsortedLedgerBody = {
      ...ledger,
      decisionJsonlSha256: sha256Bytes(unsortedDecisionBytes),
      decisionIds: decisions.map((value) => value.decisionId).sort(),
    };
    const unsortedLedger = { ...unsortedLedgerBody, ledgerSha256: admissionDecisionLedgerSha256(unsortedLedgerBody) };
    const unsortedValidation = validateCalibrationAdmissionDecisionLedger(unsortedLedger, unsortedDecisionBytes, admissionRecordJsonl(assignments), admissionRecordJsonl(receipts), {
      recordSourceIds: { [String((decisions[0]!.target as { recordId: string }).recordId)]: 'source-a' },
    });
    expect(unsortedValidation.ok).toBe(false);
    expect(unsortedValidation.errors).toContain('decision JSONL must be ordered by canonical target then reviewerId');
    expect(validateCalibrationAdmissionDecisionLedger({ ...ledger, decisionIds: [] }, admissionRecordJsonl(decisions), admissionRecordJsonl(assignments), admissionRecordJsonl(receipts)).ok).toBe(false);
    expect(validateCalibrationAdmissionDecisionLedger(ledger, Buffer.from(`${admissionRecordJsonl(decisions).toString('utf8')}\n`), admissionRecordJsonl(assignments), admissionRecordJsonl(receipts)).ok).toBe(false);
    expect(validateCalibrationAdmissionDecisionLedger({ ...ledger, ledgerSha256: sha('tampered') }, admissionRecordJsonl(decisions), admissionRecordJsonl(assignments), admissionRecordJsonl(receipts)).ok).toBe(false);
  });

  it('rejects a decision whose target/result/assignment or reviewer role is inconsistent', () => {
    const decision = makeDecision();
    expect(validateCalibrationAdmissionDecisionV103(decision, { assignmentId: 'other', target: decision.target }).ok).toBe(false);
    const invalidDate = { ...decision, decidedAt: '2026-02-31T00:00:00.000Z', decisionId: '' };
    const { decisionId: _ignoredInvalidDateId, ...invalidDateContent } = invalidDate;
    expect(validateCalibrationAdmissionDecisionV103({
      ...invalidDate,
      decisionId: calibrationAdmissionDecisionId(invalidDateContent),
    }).ok).toBe(false);
    const withoutId = { ...decision, reviewerRoles: [] as const, decisionId: '' };
    const copy = { ...withoutId } as Record<string, unknown>;
    delete copy.decisionId;
    expect(validateCalibrationAdmissionDecisionV103({ ...withoutId, decisionId: calibrationAdmissionDecisionId(copy) }).ok).toBe(false);
    const temporalWithoutId = {
      ...decision,
      target: { kind: 'temporal_attestation' as const, temporalAttestationId: sha('temporal-a'), exactBlobOrContentSha256: sha('temporal-content') },
      reviewerRoles: ['provenance'] as const,
      result: { kind: 'temporal_attestation' as const, decision: 'accepted' as const },
      adjudicatesDecisionIds: [sha('prior-a'), sha('prior-b')].sort() as [string, string],
      decisionId: '',
    };
    const { decisionId: _ignoredTemporalId, ...temporalContent } = temporalWithoutId;
    const temporalDecision = { ...temporalWithoutId, decisionId: calibrationAdmissionDecisionId(temporalContent) };
    const temporalValidation = validateCalibrationAdmissionDecisionV103(temporalDecision);
    expect(temporalValidation.ok).toBe(false);
    expect(temporalValidation.errors).toContain('temporal attestation decisions cannot adjudicate');
  });

  it('binds assignment/receipt self-hashes and rejects evidence or cross-assignment mutations', () => {
    const assignment = makeAssignment();
    const { decisions } = makeLedger();
    const receiptWithoutId = {
      version: 'v10.3-admission-blind-review-receipt-v1' as const,
      assignmentId: assignment.assignmentId,
      evidenceSetSha256: assignment.evidenceSetSha256,
      sealedDecisions: decisions.slice().sort((left, right) => left.reviewerId.localeCompare(right.reviewerId)).map((value) => ({ reviewerId: value.reviewerId, decisionId: value.decisionId, peerDecisionVisibleBeforeSeal: false as const })),
      unsealedOnlyAfterBothDecisionIdsExisted: true as const,
      protocolAuditorId: 'auditor-a',
      protocolAuditEvidenceIds: ['protocol-a'],
    };
    const receipt = { ...receiptWithoutId, receiptId: calibrationAdmissionBlindReviewReceiptId(receiptWithoutId) };
    expect(validateCalibrationAdmissionBlindAssignmentV1(assignment).ok).toBe(true);
    expect(validateCalibrationAdmissionBlindReviewReceiptV1(receipt, decisions, assignment).ok).toBe(true);
    expect(validateCalibrationAdmissionBlindAssignmentV1({ ...assignment, protocolEvidenceId: 'protocol-b' }).ok).toBe(false);
    expect(validateCalibrationAdmissionBlindReviewReceiptV1({ ...receipt, evidenceSetSha256: sha('wrong') }, decisions, assignment).ok).toBe(false);
    const mismatchedWithoutId = { ...assignment, evidenceSetSha256: sha('wrong'), assignmentId: '' };
    const mismatchedAssignment = { ...mismatchedWithoutId, assignmentId: calibrationAdmissionBlindAssignmentId(mismatchedWithoutId) };
    expect(validateCalibrationAdmissionDecisionV103(decisions[0], mismatchedAssignment).ok).toBe(false);
  });

  it('rejects duplicate joins, missing one-to-one receipts, and non-subset adjudications', () => {
    const { ledger, decisions } = makeLedger();
    const assignment = makeAssignment();
    const receiptWithoutId = {
      version: 'v10.3-admission-blind-review-receipt-v1' as const,
      assignmentId: assignment.assignmentId,
      evidenceSetSha256: assignment.evidenceSetSha256,
      sealedDecisions: decisions.slice().sort((left, right) => left.reviewerId.localeCompare(right.reviewerId)).map((value) => ({ reviewerId: value.reviewerId, decisionId: value.decisionId, peerDecisionVisibleBeforeSeal: false as const })),
      unsealedOnlyAfterBothDecisionIdsExisted: true as const,
      protocolAuditorId: 'auditor-a',
      protocolAuditEvidenceIds: ['protocol-a'],
    };
    const receipt = { ...receiptWithoutId, receiptId: calibrationAdmissionBlindReviewReceiptId(receiptWithoutId) };
    const assignmentsBytes = admissionRecordJsonl([assignment]);
    const receiptsBytes = admissionRecordJsonl([receipt]);
    const noReceiptLedgerBody = { ...ledger, blindReviewReceiptJsonlSha256: sha256Bytes(admissionRecordJsonl([])), blindReviewReceiptIds: [] };
    const noReceiptLedger = { ...noReceiptLedgerBody, ledgerSha256: admissionDecisionLedgerSha256(noReceiptLedgerBody) };
    expect(validateCalibrationAdmissionDecisionLedger(noReceiptLedger, admissionRecordJsonl(decisions), assignmentsBytes, admissionRecordJsonl([])).ok).toBe(false);
    expect(validateCalibrationAdmissionDecisionLedger(ledger, undefined, assignmentsBytes, receiptsBytes).ok).toBe(false);
    const duplicateAssignments = admissionRecordJsonl([assignment, assignment]);
    expect(validateCalibrationAdmissionDecisionLedger(ledger, admissionRecordJsonl(decisions), duplicateAssignments, receiptsBytes).ok).toBe(false);
    const adjudicationBody = { ...ledger, adjudicationDecisionIds: [sha('not-a-decision')] };
    const adjudicationLedger = { ...adjudicationBody, ledgerSha256: admissionDecisionLedgerSha256(adjudicationBody) };
    expect(validateCalibrationAdmissionDecisionLedger(adjudicationLedger, admissionRecordJsonl(decisions), assignmentsBytes, receiptsBytes).ok).toBe(false);
    const listedNonAdjudicatorBody = { ...ledger, adjudicationDecisionIds: [decisions[0]!.decisionId] };
    const listedNonAdjudicatorLedger = { ...listedNonAdjudicatorBody, ledgerSha256: admissionDecisionLedgerSha256(listedNonAdjudicatorBody) };
    expect(validateCalibrationAdmissionDecisionLedger(listedNonAdjudicatorLedger, admissionRecordJsonl(decisions), assignmentsBytes, receiptsBytes).ok).toBe(false);
    const recordId = String((decisions[0]!.target as { recordId: string }).recordId);
    expect(validateCalibrationAdmissionDecisionLedger(ledger, admissionRecordJsonl(decisions), assignmentsBytes, receiptsBytes, { recordSourceIds: { [recordId]: 'source-b' } }).ok).toBe(false);
    expect(validateCalibrationAdmissionDecisionLedger(ledger, admissionRecordJsonl(decisions), assignmentsBytes, receiptsBytes, { recordSourceIds: {} }).ok).toBe(false);

    const noRoleCoverageDecisions = decisions.map((entry) => {
      const withoutId = { ...entry, reviewerRoles: ['calibration' as const], decisionId: '' };
      const { decisionId: _ignoredDecisionId, ...decisionContent } = withoutId;
      return { ...withoutId, decisionId: calibrationAdmissionDecisionId(decisionContent) };
    });
    const noRoleCoverageReceiptWithoutId = {
      ...receiptWithoutId,
      sealedDecisions: noRoleCoverageDecisions.map((entry) => ({ reviewerId: entry.reviewerId, decisionId: entry.decisionId, peerDecisionVisibleBeforeSeal: false as const }))
        .sort((left, right) => left.reviewerId.localeCompare(right.reviewerId)) as [{ reviewerId: string; decisionId: string; peerDecisionVisibleBeforeSeal: false }, { reviewerId: string; decisionId: string; peerDecisionVisibleBeforeSeal: false }],
    };
    const noRoleReceiptContent = noRoleCoverageReceiptWithoutId;
    const noRoleCoverageReceipt = { ...noRoleCoverageReceiptWithoutId, receiptId: calibrationAdmissionBlindReviewReceiptId(noRoleReceiptContent) };
    const noRoleDecisionsBytes = admissionRecordJsonl(noRoleCoverageDecisions);
    const noRoleReceiptsBytes = admissionRecordJsonl([noRoleCoverageReceipt]);
    const noRoleLedgerWithoutHash = {
      ...ledger,
      decisionJsonlSha256: sha256Bytes(noRoleDecisionsBytes),
      decisionIds: noRoleCoverageDecisions.map((entry) => entry.decisionId),
      blindReviewReceiptJsonlSha256: sha256Bytes(noRoleReceiptsBytes),
      blindReviewReceiptIds: [noRoleCoverageReceipt.receiptId],
    };
    const noRoleLedger = { ...noRoleLedgerWithoutHash, ledgerSha256: admissionDecisionLedgerSha256(noRoleLedgerWithoutHash) };
    expect(validateCalibrationAdmissionDecisionLedger(noRoleLedger, noRoleDecisionsBytes, assignmentsBytes, noRoleReceiptsBytes, { recordSourceIds: { [recordId]: 'source-a' } }).ok).toBe(false);
  });

  it('requires exactly one adjudicator for conflicting decisions in an assignment', () => {
    const { ledger } = makeLedger();
    const assignments = [makeAssignment()];
    const baselineDecisions = [makeDecision(), (() => {
      const first = makeDecision();
      const withoutId = { ...first, reviewerId: 'reviewer-b', decisionId: '' } as Record<string, unknown>;
      delete withoutId.decisionId;
      return { ...withoutId, decisionId: calibrationAdmissionDecisionId(withoutId) } as CalibrationAdmissionDecisionV103;
    })()];
    const conflictingWithoutId = {
      ...baselineDecisions[1]!,
      result: { ...baselineDecisions[1]!.result, proposedLabel: 'verified_human' as const },
    } as Record<string, unknown>;
    delete conflictingWithoutId.decisionId;
    const conflictingDecision = {
      ...conflictingWithoutId,
      decisionId: calibrationAdmissionDecisionId(conflictingWithoutId),
    } as CalibrationAdmissionDecisionV103;
    const decisions = [baselineDecisions[0]!, conflictingDecision].sort((left, right) => left.reviewerId.localeCompare(right.reviewerId));
    const receiptContent = {
      version: 'v10.3-admission-blind-review-receipt-v1' as const,
      assignmentId: assignments[0]!.assignmentId,
      evidenceSetSha256: assignments[0]!.evidenceSetSha256,
      sealedDecisions: decisions.slice().sort((left, right) => left.reviewerId.localeCompare(right.reviewerId)).map((decision) => ({
        reviewerId: decision.reviewerId,
        decisionId: decision.decisionId,
        peerDecisionVisibleBeforeSeal: false as const,
      })) as [{ reviewerId: string; decisionId: string; peerDecisionVisibleBeforeSeal: false }, { reviewerId: string; decisionId: string; peerDecisionVisibleBeforeSeal: false }],
      unsealedOnlyAfterBothDecisionIdsExisted: true as const,
      protocolAuditorId: 'auditor-a',
      protocolAuditEvidenceIds: ['protocol-a'],
    };
    const receipts = [{ ...receiptContent, receiptId: calibrationAdmissionBlindReviewReceiptId(receiptContent) }];
    const decisionBytes = admissionRecordJsonl(decisions);
    const assignmentBytes = admissionRecordJsonl(assignments);
    const receiptBytes = admissionRecordJsonl(receipts);
    const ledgerContent = {
      ...ledger,
      decisionJsonlSha256: sha256Bytes(decisionBytes),
      decisionIds: decisions.map((decision) => decision.decisionId).sort(),
      blindAssignmentJsonlSha256: sha256Bytes(assignmentBytes),
      blindAssignmentIds: assignments.map((assignment) => assignment.assignmentId),
      blindReviewReceiptJsonlSha256: sha256Bytes(receiptBytes),
      blindReviewReceiptIds: receipts.map((receipt) => receipt.receiptId),
      adjudicationDecisionIds: [],
    };
    const conflictingLedger = { ...ledgerContent, ledgerSha256: admissionDecisionLedgerSha256(ledgerContent) };
    const validation = validateCalibrationAdmissionDecisionLedger(conflictingLedger, decisionBytes, assignmentBytes, receiptBytes);
    expect(validation.ok).toBe(false);
    expect(validation.errors).toContain('conflicting decisions require exactly one adjudicator');
  });

  it('fails closed for a one-decision adjudicator receipt in this bounded slice', () => {
    const { decisions } = makeLedger();
    const assignment = makeAssignment();
    // The current receipt contract seals exactly two decisions. Until a
    // dedicated adjudicator-receipt contract exists, a third-reviewer edge
    // cannot be represented without weakening the blind-review invariant.
    const receiptContent = {
      version: 'v10.3-admission-blind-review-receipt-v1' as const,
      assignmentId: assignment.assignmentId,
      evidenceSetSha256: assignment.evidenceSetSha256,
      sealedDecisions: [{ reviewerId: 'reviewer-a', decisionId: decisions[0]!.decisionId, peerDecisionVisibleBeforeSeal: false as const }] as unknown as [{ reviewerId: string; decisionId: string; peerDecisionVisibleBeforeSeal: false }, { reviewerId: string; decisionId: string; peerDecisionVisibleBeforeSeal: false }],
      unsealedOnlyAfterBothDecisionIdsExisted: true as const,
      protocolAuditorId: 'auditor-a',
      protocolAuditEvidenceIds: ['protocol-a'],
    };
    const receipt = { ...receiptContent, receiptId: calibrationAdmissionBlindReviewReceiptId(receiptContent) };
    const validation = validateCalibrationAdmissionBlindReviewReceiptV1(receipt, decisions, assignment);
    expect(validation.ok).toBe(false);
    expect(validation.errors).toContain('receipt must seal exactly two decisions');
  });
});
