import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionSha256,
} from '../src/calibration-admission-evidence';
import {
  calibrationAdmissionMaterializationId,
  calibrationAdmissionSourceReviewSha256,
  isCalibrationSourceReviewV103,
} from '../src/calibration-admission-review';
import type { CalibrationSourceReviewV103 } from '../src/generated/calibration-source-review';
import {
  calibrationAdmissionSourceGenerationApprovalSha256,
  calibrationAdmissionSourceGenerationArtifactSetSha256,
  calibrationAdmissionSourceGenerationProposalSha256,
  calibrationAdmissionSourceGenerationSha256,
  calibrationAdmissionSourceCurrentSha256,
  isCalibrationAdmissionArtifactReceiptV1,
  isCalibrationAdmissionSourceGenerationApprovalV1,
  isCalibrationAdmissionSourceGenerationProposalV1,
  isCalibrationAdmissionSourceGenerationV1,
  isCalibrationAdmissionSourceCurrentV1,
  validateCalibrationAdmissionSourceGenerationGraphV1,
  type CalibrationAdmissionArtifactReceiptV1,
  type CalibrationAdmissionSourceGenerationApprovalV1,
  type CalibrationAdmissionSourceGenerationProposalV1,
} from '../src/calibration-admission-source-generation';

const sha = (value: string): string => createHash('sha256').update(value).digest('hex');

function makeSourceReview(): CalibrationSourceReviewV103 {
  const gitMaterializationWithoutId = {
    kind: 'git' as const,
    repositoryId: 'repository-fixture',
    commitSha: 'a'.repeat(40),
  };
  return {
    version: 'v10.3-source-review-v1' as const,
    sourceId: 'fixture-source',
    sourceKind: 'material_source' as const,
    contributesToAdditiveCounts: true,
    sourceRegisterEntrySha256: sha('register-entry'),
    originEvidenceId: 'origin-evidence',
    origin: { kind: 'https' as const, url: 'https://example.test/fixture.git' },
    materialization: {
      ...gitMaterializationWithoutId,
      materializationId: calibrationAdmissionMaterializationId('fixture-source', 'repository-fixture', gitMaterializationWithoutId),
    },
    sourceRights: {
      status: 'reviewed' as const,
      scope: 'code' as const,
      analysisUse: 'approved' as const,
      redistribution: 'approved' as const,
      thirdPartyChain: 'complete' as const,
      evidenceIds: ['origin-evidence'],
    },
    inventory: {
      physicalMemberCount: 1,
      candidateCodeUnitCount: 1,
      inventorySha256: sha('inventory'),
      closedWorld: true,
    },
    reviewerDecisionIds: [],
    reviewedAt: '2026-07-13T00:00:00.000Z',
    decision: 'source_quarantine' as const,
    reasons: ['review_incomplete' as const],
  };
}

function makeArtifacts(review: CalibrationSourceReviewV103): readonly CalibrationAdmissionArtifactReceiptV1[] {
  const reviewBytes = Buffer.byteLength(`${calibrationAdmissionCanonicalJson(review)}\n`, 'utf8');
  const reviewArtifact: CalibrationAdmissionArtifactReceiptV1 = {
    pathBase: 'generation_local',
    relativePath: 'source-review.json',
    kind: 'source_review',
    bytes: reviewBytes,
    sha256: sha(`${calibrationAdmissionCanonicalJson(review)}\n`),
  };
  const ledgerArtifact: CalibrationAdmissionArtifactReceiptV1 = {
    pathBase: 'generation_local',
    relativePath: 'decision-ledger.json',
    kind: 'ledger',
    bytes: 2,
    sha256: sha('{}'),
  };
  return [ledgerArtifact, reviewArtifact];
}

function makeProposal(review: CalibrationSourceReviewV103, artifacts: readonly CalibrationAdmissionArtifactReceiptV1[], evidenceBundleSha256 = sha('evidence-bundle')) {
  const withoutHash: Omit<CalibrationAdmissionSourceGenerationProposalV1, 'proposalSha256'> = {
    version: 'v10.3-admission-source-generation-proposal-v1',
    proposalId: 'proposal-fixture',
    sourceId: review.sourceId,
    operation: 'create',
    expectedCurrentState: { kind: 'absent' },
    sourceReviewSha256: calibrationAdmissionSourceReviewSha256(review),
    materializationAuthority: { kind: 'genesis', evidenceBundleSha256 },
    artifacts,
  };
  return { ...withoutHash, proposalSha256: calibrationAdmissionSourceGenerationProposalSha256(withoutHash) };
}

function makeIndependentGraphFixture() {
  const reviewBase = {
    ...makeSourceReview(),
    decision: 'candidate' as const,
    reviewerDecisionIds: [] as string[],
    reasons: [] as CalibrationSourceReviewV103['reasons'],
  };
  const assignmentWithoutHash = {
    version: 'v10.3-admission-blind-assignment-v1' as const,
    assignmentId: '',
    target: { kind: 'source' as const, sourceId: reviewBase.sourceId },
    evidenceSetSha256: calibrationAdmissionSha256(['origin-evidence', 'review-evidence']),
    protocolEvidenceId: 'protocol-fixture',
    reviewerIds: ['reviewer-a', 'reviewer-b'] as [string, string],
    peerMaterialHiddenUntilBothSealed: true as const,
  };
  const { assignmentId: _assignmentId, ...assignmentContent } = assignmentWithoutHash;
  const assignment = {
    ...assignmentWithoutHash,
    assignmentId: calibrationAdmissionSha256(assignmentContent),
  };
  const decisionWithoutHash = (reviewerId: 'reviewer-a' | 'reviewer-b', reviewerRole: 'authorship' | 'rights') => ({
    version: 'v10.3-admission-decision-v1' as const,
    decisionId: '',
    target: { kind: 'source' as const, sourceId: reviewBase.sourceId },
    reviewerId,
    reviewerRoles: [reviewerRole] as const,
    evidenceIds: ['origin-evidence', 'review-evidence'],
    blindAssignmentId: assignment.assignmentId,
    result: {
      kind: 'admission' as const,
      proposedLabel: 'verified_ai' as const,
      humanEditStatus: 'none' as const,
      disposition: 'eligible_gold' as const,
    },
    reasons: [] as const,
    decidedAt: '2026-07-13T00:00:00.000Z',
  });
  const makeDecision = (reviewerId: 'reviewer-a' | 'reviewer-b', reviewerRole: 'authorship' | 'rights') => {
    const withoutHash = decisionWithoutHash(reviewerId, reviewerRole);
    const { decisionId: _decisionId, ...decisionContent } = withoutHash;
    return { ...withoutHash, decisionId: calibrationAdmissionSha256(decisionContent) };
  };
  const decisions = [makeDecision('reviewer-a', 'authorship'), makeDecision('reviewer-b', 'rights')]
    .sort((left, right) => left.decisionId.localeCompare(right.decisionId));
  const review = {
    ...reviewBase,
    reviewerDecisionIds: decisions.map((decision) => decision.decisionId),
  } as CalibrationSourceReviewV103;
  const artifacts = makeArtifacts(review);
  const evidenceBundle = JSON.parse(readFileSync(new URL('./fixtures/schema/valid/calibration-admission-evidence-bundle.valid.json', import.meta.url), 'utf8')) as { bundleSha256: string };
  const proposal = makeProposal(review, artifacts, evidenceBundle.bundleSha256);
  const approvalWithoutHash = {
    version: 'v10.3-admission-source-generation-approval-v1' as const,
    approvalId: 'approval-fixture',
    proposalId: proposal.proposalId,
    proposalSha256: proposal.proposalSha256,
    blindAssignmentId: assignment.assignmentId,
    reviewerDecisionIds: decisions.map((decision) => decision.decisionId) as [string, string],
    blindReviewReceiptId: '',
  };
  const receiptWithoutHash = {
    version: 'v10.3-admission-blind-review-receipt-v1' as const,
    receiptId: '',
    assignmentId: assignment.assignmentId,
    evidenceSetSha256: assignment.evidenceSetSha256,
    sealedDecisions: decisions.slice().sort((left, right) => left.reviewerId.localeCompare(right.reviewerId)).map((decision) => ({
      reviewerId: decision.reviewerId,
      decisionId: decision.decisionId,
      peerDecisionVisibleBeforeSeal: false as const,
    })) as [{ reviewerId: string; decisionId: string; peerDecisionVisibleBeforeSeal: false }, { reviewerId: string; decisionId: string; peerDecisionVisibleBeforeSeal: false }],
    unsealedOnlyAfterBothDecisionIdsExisted: true as const,
    protocolAuditorId: 'auditor-fixture',
    protocolAuditEvidenceIds: ['protocol-fixture'],
  };
  const { receiptId: _receiptId, ...receiptContent } = receiptWithoutHash;
  const receipt = { ...receiptWithoutHash, receiptId: calibrationAdmissionSha256(receiptContent) };
  const approvalWithReceipt = { ...approvalWithoutHash, blindReviewReceiptId: receipt.receiptId };
  const approval = { ...approvalWithReceipt, approvalSha256: calibrationAdmissionSourceGenerationApprovalSha256(approvalWithReceipt) };
  const generationWithoutHash = {
    version: 'v10.3-admission-source-generation-v1' as const,
    sourceId: review.sourceId,
    generation: 0,
    proposalId: proposal.proposalId,
    proposalSha256: proposal.proposalSha256,
    approval: { kind: 'independent_review' as const, approvalId: approval.approvalId, approvalSha256: approval.approvalSha256 },
    sourceReviewSha256: proposal.sourceReviewSha256,
    artifacts,
    artifactSetSha256: calibrationAdmissionSourceGenerationArtifactSetSha256(artifacts),
  };
  const generation = { ...generationWithoutHash, generationSha256: calibrationAdmissionSourceGenerationSha256(generationWithoutHash) };
  return { review, artifacts, proposal, generation, assignment, decisions, receipt, approval, evidenceBundle };
}

describe('v10.3 source-generation contracts', () => {
  it('keeps artifact roles and paths closed and content-addressed', () => {
    const review = makeSourceReview();
    const [ledger, sourceReview] = makeArtifacts(review) as [CalibrationAdmissionArtifactReceiptV1, CalibrationAdmissionArtifactReceiptV1];
    expect(isCalibrationAdmissionArtifactReceiptV1(ledger)).toBe(true);
    expect(isCalibrationAdmissionArtifactReceiptV1(sourceReview)).toBe(true);
    expect(isCalibrationAdmissionArtifactReceiptV1({ ...sourceReview, relativePath: 'generations/source-review.json' })).toBe(false);
    expect(isCalibrationAdmissionArtifactReceiptV1({ ...sourceReview, kind: 'ledger' })).toBe(false);
    expect(isCalibrationAdmissionArtifactReceiptV1({
      pathBase: 'admission_root_content_addressed',
      relativePath: `evidence-cas/sha256/${sourceReview.sha256.slice(0, 2)}/${sourceReview.sha256}`,
      kind: 'bundle',
      bytes: 1,
      sha256: sourceReview.sha256,
    })).toBe(true);
    expect(isCalibrationAdmissionArtifactReceiptV1({
      pathBase: 'admission_root_content_addressed',
      relativePath: `evidence-cas/sha256/${sourceReview.sha256.slice(0, 2)}/${sourceReview.sha256}`,
      kind: 'current_pointer',
      bytes: 1,
      sha256: sourceReview.sha256,
    })).toBe(false);
  });

  it('binds proposal, generation, and current self-hashes', () => {
    const review = makeSourceReview();
    expect(isCalibrationSourceReviewV103(review)).toBe(true);
    const artifacts = makeArtifacts(review);
    const proposal = makeProposal(review, artifacts);
    expect(isCalibrationAdmissionSourceGenerationProposalV1(proposal)).toBe(true);
    expect(isCalibrationAdmissionSourceGenerationProposalV1({ ...proposal, sourceId: 'other-source' })).toBe(false);

    const generationWithoutHash = {
      version: 'v10.3-admission-source-generation-v1' as const,
      sourceId: review.sourceId,
      generation: 0,
      proposalId: proposal.proposalId,
      proposalSha256: proposal.proposalSha256,
      approval: { kind: 'genesis_quarantine' as const, reason: 'review_incomplete' as const },
      sourceReviewSha256: proposal.sourceReviewSha256,
      artifacts,
      artifactSetSha256: calibrationAdmissionSourceGenerationArtifactSetSha256(artifacts),
    };
    const generation = { ...generationWithoutHash, generationSha256: calibrationAdmissionSourceGenerationSha256(generationWithoutHash) };
    expect(isCalibrationAdmissionSourceGenerationV1(generation)).toBe(true);
    expect(isCalibrationAdmissionSourceGenerationV1({ ...generation, artifacts: [artifacts[1]!, artifacts[0]!] })).toBe(false);

    const currentWithoutHash = {
      version: 'v10.3-admission-source-current-v1' as const,
      sourceId: review.sourceId,
      generationSha256: generation.generationSha256,
      generationRelativePath: `sources/${review.sourceId}/generations/${generation.generationSha256}`,
    };
    const current = { ...currentWithoutHash, currentSha256: calibrationAdmissionSourceCurrentSha256(currentWithoutHash) };
    expect(isCalibrationAdmissionSourceCurrentV1(current)).toBe(true);
    expect(isCalibrationAdmissionSourceCurrentV1({ ...current, generationRelativePath: 'sources/fixture-source/current.json' })).toBe(false);

    const missingGenesisEvidence = validateCalibrationAdmissionSourceGenerationGraphV1({
      proposal,
      sourceReview: review,
      generation,
    });
    expect(missingGenesisEvidence.ok).toBe(false);
    expect(missingGenesisEvidence.errors).toContain('genesis evidence bundle is missing or hash-mismatched');
    const currentSuppliedForCreate = validateCalibrationAdmissionSourceGenerationGraphV1({
      proposal,
      sourceReview: review,
      generation,
      current,
    });
    expect(currentSuppliedForCreate.errors).toContain('create proposal must start from an absent current pointer');

    const alteredArtifacts = [
      { ...artifacts[0]!, sha256: sha('altered-ledger') },
      artifacts[1]!,
    ];
    const alteredGenerationWithoutHash = {
      ...generationWithoutHash,
      artifacts: alteredArtifacts,
      artifactSetSha256: calibrationAdmissionSourceGenerationArtifactSetSha256(alteredArtifacts),
    };
    const alteredGeneration = {
      ...alteredGenerationWithoutHash,
      generationSha256: calibrationAdmissionSourceGenerationSha256(alteredGenerationWithoutHash),
    };
    const artifactMismatch = validateCalibrationAdmissionSourceGenerationGraphV1({
      proposal,
      sourceReview: review,
      generation: alteredGeneration,
    });
    expect(artifactMismatch.errors).toContain('generation artifacts do not exactly match proposal artifacts');
  });

  it('requires approval IDs to be sorted, exactly two, and self-hashed', () => {
    const withoutHash: Omit<CalibrationAdmissionSourceGenerationApprovalV1, 'approvalSha256'> = {
      version: 'v10.3-admission-source-generation-approval-v1',
      approvalId: 'approval-fixture',
      proposalId: 'proposal-fixture',
      proposalSha256: sha('proposal'),
      blindAssignmentId: sha('assignment-fixture'),
      reviewerDecisionIds: [sha('decision-a'), sha('decision-b')],
      blindReviewReceiptId: sha('blind-receipt-fixture'),
    };
    const approval = { ...withoutHash, approvalSha256: calibrationAdmissionSourceGenerationApprovalSha256(withoutHash) };
    expect(isCalibrationAdmissionSourceGenerationApprovalV1(approval)).toBe(true);
    expect(isCalibrationAdmissionSourceGenerationApprovalV1({ ...approval, reviewerDecisionIds: [approval.reviewerDecisionIds[1]!, approval.reviewerDecisionIds[0]!] })).toBe(false);
    expect(isCalibrationAdmissionSourceGenerationApprovalV1({ ...approval, approvalSha256: sha('wrong') })).toBe(false);
  });

  it('accepts a complete independent-review source-generation graph', () => {
    const fixture = makeIndependentGraphFixture();
    expect(validateCalibrationAdmissionSourceGenerationGraphV1({
      proposal: fixture.proposal,
      sourceReview: fixture.review,
      generation: fixture.generation,
      approval: fixture.approval,
      blindAssignment: fixture.assignment,
      decisions: fixture.decisions,
      blindReviewReceipt: fixture.receipt,
      evidenceBundle: fixture.evidenceBundle,
    })).toEqual({ ok: true, errors: [] });
  });

  it('rejects empty decision evidence and binds replacement current/prior source IDs', () => {
    const fixture = makeIndependentGraphFixture();
    const emptyEvidence = { ...fixture.decisions[0]!, evidenceIds: [] as string[] };
    const { decisionId: _decisionId, ...emptyEvidenceContent } = emptyEvidence;
    const emptyEvidenceDecision = {
      ...emptyEvidence,
      decisionId: calibrationAdmissionSha256(emptyEvidenceContent),
    };
    const emptyEvidenceResult = validateCalibrationAdmissionSourceGenerationGraphV1({
      proposal: fixture.proposal,
      sourceReview: fixture.review,
      generation: fixture.generation,
      approval: fixture.approval,
      blindAssignment: fixture.assignment,
      decisions: [emptyEvidenceDecision, fixture.decisions[1]!],
      blindReviewReceipt: fixture.receipt,
    });
    expect(emptyEvidenceResult.errors).toContain('approval decisions are missing or invalid');

    const priorWithoutSourceHash = { ...fixture.generation, sourceId: 'other-source' };
    const { generationSha256: _priorGenerationSha256, ...priorContent } = priorWithoutSourceHash;
    const priorGeneration = {
      ...priorWithoutSourceHash,
      generationSha256: calibrationAdmissionSourceGenerationSha256(priorContent),
    };
    const replaceProposalWithoutHash = {
      ...fixture.proposal,
      operation: 'replace' as const,
      expectedCurrentState: { kind: 'existing' as const, generationSha256: priorGeneration.generationSha256 },
    };
    const replaceProposal = {
      ...replaceProposalWithoutHash,
      proposalSha256: calibrationAdmissionSourceGenerationProposalSha256(replaceProposalWithoutHash),
    };
    const replaceApprovalWithoutHash = {
      ...fixture.approval,
      proposalSha256: replaceProposal.proposalSha256,
    };
    const replaceApproval = {
      ...replaceApprovalWithoutHash,
      approvalSha256: calibrationAdmissionSourceGenerationApprovalSha256(replaceApprovalWithoutHash),
    };
    const replaceGenerationWithoutHash = {
      ...fixture.generation,
      generation: 1,
      parentGenerationSha256: priorGeneration.generationSha256,
      proposalSha256: replaceProposal.proposalSha256,
      approval: { kind: 'independent_review' as const, approvalId: replaceApproval.approvalId, approvalSha256: replaceApproval.approvalSha256 },
    };
    const replaceGeneration = {
      ...replaceGenerationWithoutHash,
      generationSha256: calibrationAdmissionSourceGenerationSha256(replaceGenerationWithoutHash),
    };
    const wrongCurrentWithoutHash = {
      version: 'v10.3-admission-source-current-v1' as const,
      sourceId: 'other-source',
      generationSha256: priorGeneration.generationSha256,
      generationRelativePath: `sources/other-source/generations/${priorGeneration.generationSha256}`,
    };
    const wrongCurrent = {
      ...wrongCurrentWithoutHash,
      currentSha256: calibrationAdmissionSourceCurrentSha256(wrongCurrentWithoutHash),
    };
    const sourceBindingResult = validateCalibrationAdmissionSourceGenerationGraphV1({
      proposal: replaceProposal,
      sourceReview: fixture.review,
      generation: replaceGeneration,
      current: wrongCurrent,
      priorGeneration,
      approval: replaceApproval,
      blindAssignment: fixture.assignment,
      decisions: fixture.decisions,
      blindReviewReceipt: fixture.receipt,
    });
    expect(sourceBindingResult.errors).toContain('replace proposal current pointer source ID does not match source generation');
    expect(sourceBindingResult.errors).toContain('replace prior generation source ID does not match source generation');

    expect(validateCalibrationAdmissionSourceGenerationGraphV1({
      proposal: fixture.proposal,
      sourceReview: fixture.review,
      generation: fixture.generation,
      approval: fixture.approval,
      blindAssignment: fixture.assignment,
      decisions: {} as unknown as readonly unknown[],
      blindReviewReceipt: fixture.receipt,
    }).ok).toBe(false);
  });

  it('requires the rights reviewer to cover every source-rights evidence ID', () => {
    const fixture = makeIndependentGraphFixture();
    const alteredReview = {
      ...fixture.review,
      sourceRights: { ...fixture.review.sourceRights, evidenceIds: ['rights-evidence'] },
    };
    const result = validateCalibrationAdmissionSourceGenerationGraphV1({
      proposal: fixture.proposal,
      sourceReview: alteredReview,
      generation: fixture.generation,
      approval: fixture.approval,
      blindAssignment: fixture.assignment,
      decisions: fixture.decisions,
      blindReviewReceipt: fixture.receipt,
      evidenceBundle: fixture.evidenceBundle,
    });
    expect(result.errors).toContain('approval decisions do not provide independent blind authorship/rights coverage');

    const emptyRightsReview = {
      ...fixture.review,
      sourceRights: { ...fixture.review.sourceRights, evidenceIds: [] },
    };
    const emptyRightsResult = validateCalibrationAdmissionSourceGenerationGraphV1({
      proposal: fixture.proposal,
      sourceReview: emptyRightsReview,
      generation: fixture.generation,
      approval: fixture.approval,
      blindAssignment: fixture.assignment,
      decisions: fixture.decisions,
      blindReviewReceipt: fixture.receipt,
      evidenceBundle: fixture.evidenceBundle,
    });
    expect(emptyRightsResult.errors).toContain('approval decisions do not provide independent blind authorship/rights coverage');
  });
});
