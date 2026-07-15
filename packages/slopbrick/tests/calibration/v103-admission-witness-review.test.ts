import { describe, expect, it } from 'vitest';
import {
  calibrationAdmissionBlindAssignmentId,
  calibrationAdmissionBlindReviewReceiptId,
  calibrationAdmissionDecisionId,
  calibrationAdmissionInvocationIntentId,
  calibrationAdmissionInvocationIntentSha256,
  calibrationAdmissionSearchReceiptSha256,
  calibrationAdmissionSearchResultBundleId,
  calibrationAdmissionSearchResultBundleSha256,
  calibrationAdmissionSha256,
  calibrationAdmissionToolReceiptId,
  calibrationAdmissionToolReceiptSha256,
  calibrationAdmissionWitnessReviewReceiptSha256,
  validateCalibrationAdmissionWitnessReviewBundleV1,
  type CalibrationAdmissionBlindAssignmentV1,
  type CalibrationAdmissionBlindReviewReceiptV1,
  type CalibrationAdmissionDecisionV103,
  type CalibrationAdmissionInvocationIntentV1,
  type CalibrationAdmissionSearchResultBundleV1,
  type CalibrationAdmissionToolReceiptV1,
} from '@usebrick/core';
import {
  searchAdmissionWitness,
  type AdmissionWitnessCandidateV1,
} from '../../src/calibration/v103/admission-cohort-witness';
import { buildAdmissionWitnessReviewBundle } from '../../src/calibration/v103/admission-witness-review';

const H = 'a'.repeat(64);

function hash(value: unknown): string {
  return calibrationAdmissionSha256(value);
}

function id(n: number): string {
  return n.toString(16).padStart(64, '0');
}

function candidates(): AdmissionWitnessCandidateV1[] {
  const output: AdmissionWitnessCandidateV1[] = [];
  for (const label of ['verified_ai', 'verified_human'] as const) {
    for (let index = 0; index < 100; index += 1) {
      output.push({
        recordId: id((label === 'verified_ai' ? 1 : 10_000) + index),
        contentClusterId: `cluster-${label}-${index}`,
        label,
        language: index % 2 === 0 ? 'typescript' : 'python',
        materialSourceId: `source-${Math.floor(index / 25)}`,
        repositoryId: `repo-${Math.floor(index / 25)}`,
        familyId: `family-${Math.floor(index / 20)}`,
        split: index % 3 === 0 ? 'train' : index % 3 === 1 ? 'validation' : 'test',
        selectionKey: `${label}|${index.toString().padStart(6, '0')}`,
      });
    }
  }
  return output;
}

function intent(action: string, salt: string): CalibrationAdmissionInvocationIntentV1 {
  const body = {
    version: 'v10.3-admission-invocation-intent-v1' as const,
    profileId: 'admission-census-v1' as const,
    profileSha256: H,
    action,
    canonicalArgvSha256: hash(`argv:${salt}`),
    inputSetSha256: hash(`input:${salt}`),
    executableBehaviorSha256: hash(`behavior:${salt}`),
  };
  const withId = { ...body, intentId: calibrationAdmissionInvocationIntentId(body) };
  return { ...withId, intentSha256: calibrationAdmissionInvocationIntentSha256(withId) };
}

function receipt(invocationIntent: CalibrationAdmissionInvocationIntentV1, outputSetSha256: string): CalibrationAdmissionToolReceiptV1 {
  const body = {
    version: 'v10.3-admission-tool-receipt-v1' as const,
    invocationIntentId: invocationIntent.intentId,
    profileId: invocationIntent.profileId,
    profileSha256: invocationIntent.profileSha256,
    action: invocationIntent.action,
    canonicalArgvSha256: invocationIntent.canonicalArgvSha256,
    inputSetSha256: invocationIntent.inputSetSha256,
    executableBehaviorSha256: invocationIntent.executableBehaviorSha256,
    observedResourceUsage: { rssBytes: 1 },
    exitCode: 0,
    outputSetSha256,
  };
  return { ...body, receiptId: calibrationAdmissionToolReceiptId(body) };
}

function searchBundle(): CalibrationAdmissionSearchResultBundleV1 {
  const result = searchAdmissionWitness({
    gate: 'smoke',
    eligibilitySnapshotSha256: H,
    verifiedContextSha256: H,
    candidates: candidates(),
  });
  expect(result.kind).toBe('witness');
  if (result.kind !== 'witness') throw new Error('fixture did not produce a witness');
  const searchIntent = intent('witness:search', 'search');
  const searchReceiptTool = receipt(searchIntent, result.witness.witnessSha256);
  const searchReceiptBody = {
    version: 'v10.3-admission-search-receipt-v1' as const,
    gate: 'smoke' as const,
    witnessPolicySha256: H,
    eligibilitySnapshotSha256: H,
    candidateOrderSha256: hash(candidates().map((candidate) => candidate.selectionKey)),
    visitedNodes: result.visitedNodes,
    prunedNodes: result.prunedNodes,
    terminal: result.terminal,
    terminalArtifactSha256: result.witness.witnessSha256,
    toolReceiptSha256: calibrationAdmissionToolReceiptSha256(searchReceiptTool),
  };
  const searchReceipt = { ...searchReceiptBody, receiptId: calibrationAdmissionSearchReceiptSha256(searchReceiptBody) };
  const body = {
    version: 'v10.3-admission-search-result-bundle-v1' as const,
    gate: 'smoke' as const,
    verifiedContextSha256: H,
    eligibilitySnapshotSha256: H,
    invocationIntents: [searchIntent],
    toolReceipts: [searchReceiptTool],
    result: { kind: 'witness' as const, witness: result.witness },
    searchReceipt,
  };
  const withId = { ...body, bundleId: calibrationAdmissionSearchResultBundleId(body) };
  return { ...withId, bundleSha256: calibrationAdmissionSearchResultBundleSha256(withId) };
}

function reviewGraph() {
  const search = searchBundle();
  const witness = search.result.kind === 'witness' ? search.result.witness : undefined;
  if (!witness) throw new Error('fixture did not produce a witness');
  const regeneration1Intent = intent('witness:regenerate', 'regeneration-1');
  const regeneration2Intent = intent('witness:regenerate', 'regeneration-2');
  const regeneration1 = receipt(regeneration1Intent, witness.witnessSha256);
  const regeneration2 = receipt(regeneration2Intent, witness.witnessSha256);
  const constraintIntent = intent('witness:constraint-check', 'constraint-check');
  const constraintChecksSha256 = hash({ witnessSha256: witness.witnessSha256, checks: ['polarity', 'diversity', 'splits'] });
  const constraintReceipt = receipt(constraintIntent, constraintChecksSha256);
  const target = {
    kind: 'witness' as const,
    witnessSha256: witness.witnessSha256,
    eligibilitySnapshotSha256: H,
    verifiedContextSha256: H,
  };
  const assignmentBody = {
    version: 'v10.3-admission-blind-assignment-v1' as const,
    target,
    evidenceSetSha256: hash(['witness-constraint-evidence']),
    protocolEvidenceId: 'witness-review-protocol',
    reviewerIds: ['reviewer-a', 'reviewer-b'] as [string, string],
    peerMaterialHiddenUntilBothSealed: true as const,
  };
  const assignment: CalibrationAdmissionBlindAssignmentV1 = {
    ...assignmentBody,
    assignmentId: calibrationAdmissionBlindAssignmentId(assignmentBody),
  };
  const decisionBody = (reviewerId: string) => ({
    version: 'v10.3-admission-decision-v1' as const,
    target,
    reviewerId,
    reviewerRoles: ['calibration'] as ['calibration'],
    evidenceIds: ['witness-constraint-evidence'] as [string],
    blindAssignmentId: assignment.assignmentId,
    result: { kind: 'witness' as const, decision: 'approved' as const },
    reasons: [],
    decidedAt: '2026-07-15T00:00:00.000Z',
  });
  const decisionA: CalibrationAdmissionDecisionV103 = { ...decisionBody('reviewer-a'), decisionId: calibrationAdmissionDecisionId(decisionBody('reviewer-a')) };
  const decisionB: CalibrationAdmissionDecisionV103 = { ...decisionBody('reviewer-b'), decisionId: calibrationAdmissionDecisionId(decisionBody('reviewer-b')) };
  const blindReceiptBody = {
    version: 'v10.3-admission-blind-review-receipt-v1' as const,
    assignmentId: assignment.assignmentId,
    evidenceSetSha256: assignment.evidenceSetSha256,
    sealedDecisions: [
      { reviewerId: 'reviewer-a', decisionId: decisionA.decisionId, peerDecisionVisibleBeforeSeal: false as const },
      { reviewerId: 'reviewer-b', decisionId: decisionB.decisionId, peerDecisionVisibleBeforeSeal: false as const },
    ] as [{ reviewerId: string; decisionId: string; peerDecisionVisibleBeforeSeal: false }, { reviewerId: string; decisionId: string; peerDecisionVisibleBeforeSeal: false }],
    unsealedOnlyAfterBothDecisionIdsExisted: true as const,
    protocolAuditorId: 'protocol-auditor',
    protocolAuditEvidenceIds: ['witness-review-protocol'],
  };
  const blindReviewReceipt: CalibrationAdmissionBlindReviewReceiptV1 = {
    ...blindReceiptBody,
    receiptId: calibrationAdmissionBlindReviewReceiptId(blindReceiptBody),
  };
  return {
    searchResultBundle: search,
    regenerations: [
      { invocationIntent: regeneration1Intent, toolReceipt: regeneration1, witnessSha256: witness.witnessSha256 },
      { invocationIntent: regeneration2Intent, toolReceipt: regeneration2, witnessSha256: witness.witnessSha256 },
    ] as const,
    constraintCheck: { invocationIntent: constraintIntent, toolReceipt: constraintReceipt, constraintChecksSha256 },
    blindAssignment: assignment,
    reviewerDecisions: [decisionA, decisionB] as const,
    blindReviewReceipt,
  };
}

describe('Task 3B witness-review graph', () => {
  it('builds one complete acyclic witness-review bundle', () => {
    const result = buildAdmissionWitnessReviewBundle(reviewGraph());
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.bundle.witnessReviewReceipt.decision).toBe('approved');
    expect(validateCalibrationAdmissionWitnessReviewBundleV1(result.bundle)).toEqual({ ok: true, errors: [] });
  });

  it('rejects a regeneration receipt that is not bound to its intent/output', () => {
    const graph = reviewGraph();
    const broken = {
      ...graph,
      regenerations: [
        { ...graph.regenerations[0], toolReceipt: { ...graph.regenerations[0].toolReceipt, outputSetSha256: H } },
        graph.regenerations[1],
      ] as const,
    };
    const result = buildAdmissionWitnessReviewBundle(broken);
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.errors.join('; ')).toContain('regeneration');
  });

  it('fails closed on disagreement or a non-witness review target', () => {
    const graph = reviewGraph();
    const disagreement = {
      ...graph,
      reviewerDecisions: [
        graph.reviewerDecisions[0],
        { ...graph.reviewerDecisions[1], result: { kind: 'witness' as const, decision: 'rejected' as const }, decisionId: calibrationAdmissionDecisionId({ ...graph.reviewerDecisions[1], result: { kind: 'witness' as const, decision: 'rejected' as const }, decisionId: undefined }) },
      ] as const,
    };
    expect(buildAdmissionWitnessReviewBundle(disagreement).ok).toBe(false);
    const nonWitness = { ...graph, blindAssignment: { ...graph.blindAssignment, target: { kind: 'source' as const, sourceId: 'source' } } };
    expect(buildAdmissionWitnessReviewBundle(nonWitness).ok).toBe(false);
  });
});
