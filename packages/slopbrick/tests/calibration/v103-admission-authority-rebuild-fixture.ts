import { createHash } from 'node:crypto';

import {
  calibrationAdmissionAuthorityCurrentSha256,
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionInputGenerationProposalSha256,
  calibrationAdmissionInputGenerationSha256,
  calibrationAdmissionMaterializationId,
  calibrationAdmissionSha256,
  calibrationAdmissionSourceGenerationArtifactSetSha256,
  calibrationAdmissionSourceGenerationApprovalSha256,
  calibrationAdmissionSourceGenerationProposalSha256,
  calibrationAdmissionSourceGenerationSha256,
  calibrationAdmissionSourceCurrentSha256,
  calibrationAdmissionSourceReviewSha256,
  calibrationAdmissionStaticAuthorityGenerationSha256,
  type CalibrationAdmissionArtifactReceiptV1,
  type CalibrationAdmissionAuthorityCurrentV1,
  type CalibrationAdmissionInputGenerationProposalV1,
  type CalibrationAdmissionInputGenerationV1,
  type CalibrationAdmissionSourceCurrentV1,
  type CalibrationAdmissionSourceGenerationProposalV1,
  type CalibrationAdmissionSourceGenerationV1,
  type CalibrationAdmissionStaticAuthorityGenerationV1,
} from '@usebrick/core';

import type {
  PrebuiltAdmissionAuthoritySourceInput,
  PrebuiltAdmissionAuthorityGraphInput,
} from '../../src/calibration/v103/admission-authority-rebuild';

export type PrebuiltAuthoritySourceFixture = PrebuiltAdmissionAuthoritySourceInput & {
  readonly sourceGeneration: CalibrationAdmissionSourceGenerationV1;
  readonly current: CalibrationAdmissionSourceCurrentV1;
  readonly sourceGenerationBytes: Buffer;
  readonly currentBytes: Buffer;
  readonly sourceReviewBytes: Buffer;
  readonly artifactBytes: Readonly<Record<string, Buffer>>;
  readonly sourceProposal: CalibrationAdmissionSourceGenerationProposalV1;
  readonly sourceProposalBytes: Buffer;
};

export type PrebuiltAuthorityGraphFixture = PrebuiltAdmissionAuthorityGraphInput & {
  readonly proposal: CalibrationAdmissionInputGenerationProposalV1;
  readonly proposalBytes: Buffer;
  readonly inputGeneration: CalibrationAdmissionInputGenerationV1;
  readonly staticGeneration: CalibrationAdmissionStaticAuthorityGenerationV1;
  readonly current: CalibrationAdmissionAuthorityCurrentV1;
  readonly inputGenerationBytes: Buffer;
  readonly staticGenerationBytes: Buffer;
  readonly currentBytes: Buffer;
  readonly sources: readonly PrebuiltAuthoritySourceFixture[];
};

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value: unknown): Buffer {
  return Buffer.from(calibrationAdmissionCanonicalJson(value), 'utf8');
}

function serialized(value: unknown): Buffer {
  return Buffer.from(`${calibrationAdmissionCanonicalJson(value)}\n`, 'utf8');
}

function artifact(
  kind: CalibrationAdmissionArtifactReceiptV1['kind'],
  relativePath: string,
  bytes: Buffer,
): CalibrationAdmissionArtifactReceiptV1 {
  return {
    pathBase: 'generation_local',
    relativePath,
    kind,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  };
}

function toolAuthoritySnapshot() {
  return {
    version: 'v10.3-admission-tool-authority-snapshot-v1' as const,
    indexGenerationSha256: '290a4e057a39cb9c3488510cf6ce5bed02059c6c8c085f5afd8ca0ed0a4310bb',
    profileIds: [
      'admission-acquisition-publication-v1',
      'admission-acquisition-round-v1',
      'admission-census-v1',
      'admission-context-v1',
      'admission-core-contract-v1',
      'admission-evidence-acquire-v1',
      'admission-git-acquire-v1',
      'admission-manifest-v1',
      'admission-release-acquire-v1',
      'admission-source-node-v1',
      'admission-source-parquet-v1',
      'admission-static-ledgers-v1',
    ] as const,
    invocationIntentIds: ['03afe6a6107fbe79b174d689d2b578df1ed9cfd544c065838f50cea3c4607f35'] as const,
    receiptIds: ['5ce269221e67fedc9c981f60b0142c72967525edeffcbc44c674acf0040ccb27'] as const,
    snapshotSha256: '8c3514f38ca06877f0beb35b0fafb2d04b11eeb94697c0c6ba6046009274bd6f',
  };
}

function rehash<T extends Record<string, unknown>>(value: T, key: string, hash: (body: T) => string): T & Record<string, string> {
  return { ...value, [key]: hash(value) } as T & Record<string, string>;
}

function sourceReview(sourceId: string) {
  const materialization = {
    kind: 'git' as const,
    repositoryId: `${sourceId}-repository`,
    commitSha: 'a'.repeat(40),
  };
  return {
    version: 'v10.3-source-review-v1' as const,
    sourceId,
    sourceKind: 'material_source' as const,
    contributesToAdditiveCounts: true,
    sourceRegisterEntrySha256: sha256(`${sourceId}:register`),
    originEvidenceId: `${sourceId}-origin`,
    origin: { kind: 'https' as const, url: 'https://example.test/source.git' },
    materialization: {
      ...materialization,
      materializationId: calibrationAdmissionMaterializationId(sourceId, materialization.repositoryId, materialization),
    },
    sourceRights: {
      status: 'reviewed' as const,
      scope: 'code' as const,
      analysisUse: 'approved' as const,
      redistribution: 'approved' as const,
      thirdPartyChain: 'complete' as const,
      evidenceIds: [`${sourceId}-origin`],
    },
    inventory: {
      physicalMemberCount: 1,
      candidateCodeUnitCount: 1,
      inventorySha256: sha256(`${sourceId}:inventory`),
      closedWorld: true,
    },
    reviewerDecisionIds: [],
    reviewedAt: '2026-07-13T00:00:00.000Z',
    decision: 'source_quarantine' as const,
    reasons: ['review_incomplete' as const],
  };
}

export function makePrebuiltAuthorityFixture(): PrebuiltAuthorityGraphFixture {
  const sourceId = 'source-a';
  const sourceProposalId = 'source-a-proposal';
  const review = sourceReview(sourceId);
  const sourceReviewSha256 = calibrationAdmissionSourceReviewSha256(review);
  const sourceReviewBytes = serialized(review);
  const ledgerBytes = Buffer.from('{}\n', 'utf8');

  const sourceArtifacts = [
    artifact('ledger', 'decision-ledger.json', ledgerBytes),
    artifact('source_review', 'source-review.json', sourceReviewBytes),
  ] as const;
  const sourceProposalBody = {
    version: 'v10.3-admission-source-generation-proposal-v1' as const,
    proposalId: sourceProposalId,
    sourceId,
    operation: 'create' as const,
    expectedCurrentState: { kind: 'absent' as const },
    sourceReviewSha256,
    materializationAuthority: { kind: 'genesis' as const, evidenceBundleSha256: sha256('evidence-bundle') },
    artifacts: sourceArtifacts,
  };
  const sourceProposal = rehash(sourceProposalBody, 'proposalSha256', calibrationAdmissionSourceGenerationProposalSha256) as unknown as CalibrationAdmissionSourceGenerationProposalV1;
  const sourceGenerationBody = {
    version: 'v10.3-admission-source-generation-v1' as const,
    sourceId,
    generation: 0,
    proposalId: sourceProposalId,
    proposalSha256: sourceProposal.proposalSha256,
    approval: { kind: 'genesis_quarantine' as const, reason: 'review_incomplete' as const },
    sourceReviewSha256,
    artifacts: sourceArtifacts,
    artifactSetSha256: calibrationAdmissionSourceGenerationArtifactSetSha256(sourceArtifacts),
  };
  const sourceGeneration = rehash(sourceGenerationBody, 'generationSha256', calibrationAdmissionSourceGenerationSha256) as unknown as CalibrationAdmissionSourceGenerationV1;
  const sourceCurrentBody = {
    version: 'v10.3-admission-source-current-v1' as const,
    sourceId,
    generationSha256: sourceGeneration.generationSha256,
    generationRelativePath: `sources/${sourceId}/generations/${sourceGeneration.generationSha256}`,
  };
  const sourceCurrent = rehash(sourceCurrentBody, 'currentSha256', calibrationAdmissionSourceCurrentSha256) as unknown as CalibrationAdmissionSourceCurrentV1;

  const recordBytes = Buffer.from('{"recordId":"record-a"}\n', 'utf8');
  const overlapBytes = Buffer.from('{"generation":0}\n', 'utf8');
  const overlapRecordsBytes = Buffer.from('{"recordId":"record-a"}\n', 'utf8');
  const proposalBody = {
    version: 'v10.3-admission-input-generation-proposal-v1' as const,
    proposalId: 'input-proposal-genesis',
    operation: 'create' as const,
    expectedCurrentState: { kind: 'absent' as const },
    evidenceBundleSha256: sha256('evidence-bundle'),
    sourceGenerationProposals: [{
      sourceId,
      proposalId: sourceProposalId,
      proposalRelativePath: `review/admission/sources/${sourceId}/proposals/${sourceProposalId}.json`,
      proposalSha256: sourceGeneration.proposalSha256,
    }],
    admissionRecordStream: artifact('record_stream', 'admission-records.jsonl', recordBytes),
    overlapUniverse: artifact('overlap_universe', 'overlap-universe.json', overlapBytes),
    overlapUniverseRecords: artifact('overlap_universe_stream', 'overlap-universe-records.jsonl', overlapRecordsBytes),
  };
  const proposal = rehash(proposalBody, 'proposalSha256', calibrationAdmissionInputGenerationProposalSha256) as unknown as CalibrationAdmissionInputGenerationProposalV1;

  const inputArtifacts = [
    artifact('record_stream', 'admission-records.jsonl', recordBytes),
    artifact('overlap_universe_stream', 'overlap-universe-records.jsonl', overlapRecordsBytes),
    artifact('overlap_universe', 'overlap-universe.json', overlapBytes),
  ] as const;
  const inputGenerationBody = {
    version: 'v10.3-admission-input-generation-v1' as const,
    generation: 0,
    evidenceBundleSha256: proposal.evidenceBundleSha256,
    sourceGenerations: [{
      sourceId,
      generationSha256: sourceGeneration.generationSha256,
      relativePath: `review/admission/sources/${sourceId}/generations/${sourceGeneration.generationSha256}`,
      artifactSetSha256: sourceGeneration.artifactSetSha256,
    }],
    admissionRecordStreamSha256: inputArtifacts[0]!.sha256,
    overlapUniverseSha256: inputArtifacts[2]!.sha256,
    overlapUniverseRecordsSha256: inputArtifacts[1]!.sha256,
    artifacts: inputArtifacts,
  };
  const inputGeneration = rehash(inputGenerationBody, 'generationSha256', calibrationAdmissionInputGenerationSha256) as unknown as CalibrationAdmissionInputGenerationV1;

  const privacyBytes = Buffer.from('{}\n', 'utf8');
  const qualityBytes = Buffer.from('{}\n', 'utf8');
  const lineageBytes = Buffer.from('{}\n', 'utf8');
  const preWitnessBytes = Buffer.from('{}\n', 'utf8');
  const staticArtifacts = [
    artifact('ledger', 'lineage-ledger.json', lineageBytes),
    artifact('bundle', 'pre-witness-bundle.json', preWitnessBytes),
    artifact('ledger', 'privacy-ledger.json', privacyBytes),
    artifact('ledger', 'quality-ledger.json', qualityBytes),
  ] as const;
  const staticGenerationBody = {
    version: 'v10.3-admission-static-authority-generation-v1' as const,
    generation: 0,
    inputGenerationSha256: inputGeneration.generationSha256,
    overlapGenerationSha256: sha256('overlap-generation'),
    privacyLedgerSha256: staticArtifacts[2]!.sha256,
    qualityLedgerSha256: staticArtifacts[3]!.sha256,
    lineageLedgerSha256: staticArtifacts[0]!.sha256,
    preWitnessBundleSha256: staticArtifacts[1]!.sha256,
    toolAuthoritySnapshot: toolAuthoritySnapshot(),
    artifacts: staticArtifacts,
  };
  const staticGeneration = rehash(staticGenerationBody, 'generationSha256', calibrationAdmissionStaticAuthorityGenerationSha256) as unknown as CalibrationAdmissionStaticAuthorityGenerationV1;
  const currentBody = {
    version: 'v10.3-admission-authority-current-v1' as const,
    generation: 0,
    staticGenerationSha256: staticGeneration.generationSha256,
    staticGenerationRelativePath: `review/admission/authority/static-generations/${staticGeneration.generationSha256}`,
  };
  const current = rehash(currentBody, 'currentSha256', calibrationAdmissionAuthorityCurrentSha256) as unknown as CalibrationAdmissionAuthorityCurrentV1;

  const source: PrebuiltAuthoritySourceFixture = {
    sourceGeneration,
    current: sourceCurrent,
    sourceGenerationBytes: canonical(sourceGeneration),
    currentBytes: canonical(sourceCurrent),
    sourceReviewBytes,
    artifactBytes: {
      'decision-ledger.json': ledgerBytes,
      'source-review.json': sourceReviewBytes,
    },
    sourceProposal,
    sourceProposalBytes: canonical(sourceProposal),
  };
  return {
    proposal,
    proposalBytes: canonical(proposal),
    inputGeneration,
    inputGenerationArtifactBytes: {
      'admission-records.jsonl': recordBytes,
      'overlap-universe.json': overlapBytes,
      'overlap-universe-records.jsonl': overlapRecordsBytes,
    },
    staticGeneration,
    staticGenerationArtifactBytes: {
      'lineage-ledger.json': lineageBytes,
      'pre-witness-bundle.json': preWitnessBytes,
      'privacy-ledger.json': privacyBytes,
      'quality-ledger.json': qualityBytes,
    },
    current,
    inputGenerationBytes: canonical(inputGeneration),
    staticGenerationBytes: canonical(staticGeneration),
    currentBytes: canonical(current),
    sources: [source],
  };
}

/**
 * Fixture-only approval branch used to prove fixed-path/canonical-byte joins.
 * It is intentionally not a complete independent-review authority graph: the
 * blind assignment, decisions, receipt, and candidate source-review joins are
 * supplied by the later semantic source-review task.
 */
export function makeIndependentApprovalAuthorityFixture(): PrebuiltAuthorityGraphFixture {
  const fixture = makePrebuiltAuthorityFixture();
  const source = fixture.sources[0]!;
  const approvalBody = {
    version: 'v10.3-admission-source-generation-approval-v1' as const,
    approvalId: 'source-a-approval',
    proposalId: source.sourceProposal.proposalId,
    proposalSha256: source.sourceProposal.proposalSha256,
    blindAssignmentId: 'b'.repeat(64),
    reviewerDecisionIds: ['c'.repeat(64), 'd'.repeat(64)] as [string, string],
    blindReviewReceiptId: 'e'.repeat(64),
  };
  const approval = {
    ...approvalBody,
    approvalSha256: calibrationAdmissionSourceGenerationApprovalSha256(approvalBody),
  };
  const sourceGenerationBody = {
    ...source.sourceGeneration,
    approval: {
      kind: 'independent_review' as const,
      approvalId: approval.approvalId,
      approvalSha256: approval.approvalSha256,
    },
  };
  const sourceGeneration = {
    ...sourceGenerationBody,
    generationSha256: calibrationAdmissionSourceGenerationSha256(sourceGenerationBody),
  };
  const sourceCurrentBody = {
    ...source.current,
    generationSha256: sourceGeneration.generationSha256,
    generationRelativePath: `sources/${sourceGeneration.sourceId}/generations/${sourceGeneration.generationSha256}`,
  };
  const sourceCurrent = {
    ...sourceCurrentBody,
    currentSha256: calibrationAdmissionSourceCurrentSha256(sourceCurrentBody),
  };
  const proposalBody = {
    ...fixture.proposal,
    sourceGenerationProposals: fixture.proposal.sourceGenerationProposals.map((reference) => ({
      ...reference,
      approvalRelativePath: `review/admission/sources/${sourceGeneration.sourceId}/proposals/${sourceGeneration.proposalId}-approval.json`,
      approvalSha256: approval.approvalSha256,
    })),
  };
  const proposal = {
    ...proposalBody,
    proposalSha256: calibrationAdmissionInputGenerationProposalSha256(proposalBody),
  };
  const inputGenerationBody = {
    ...fixture.inputGeneration,
    sourceGenerations: fixture.inputGeneration.sourceGenerations.map((reference) => ({
      ...reference,
      generationSha256: sourceGeneration.generationSha256,
      artifactSetSha256: sourceGeneration.artifactSetSha256,
      relativePath: `review/admission/${sourceCurrent.generationRelativePath}`,
    })),
  };
  const inputGeneration = {
    ...inputGenerationBody,
    generationSha256: calibrationAdmissionInputGenerationSha256(inputGenerationBody),
  };
  const staticGenerationBody = {
    ...fixture.staticGeneration,
    inputGenerationSha256: inputGeneration.generationSha256,
  };
  const staticGeneration = {
    ...staticGenerationBody,
    generationSha256: calibrationAdmissionStaticAuthorityGenerationSha256(staticGenerationBody),
  };
  const currentBody = {
    ...fixture.current,
    staticGenerationSha256: staticGeneration.generationSha256,
    staticGenerationRelativePath: `review/admission/authority/static-generations/${staticGeneration.generationSha256}`,
  };
  const current = {
    ...currentBody,
    currentSha256: calibrationAdmissionAuthorityCurrentSha256(currentBody),
  };
  const sourceWithApproval = {
    ...source,
    sourceGeneration,
    sourceGenerationBytes: canonical(sourceGeneration),
    current: sourceCurrent,
    currentBytes: canonical(sourceCurrent),
    approval,
    approvalBytes: canonical(approval),
  };
  return {
    ...fixture,
    proposal,
    proposalBytes: canonical(proposal),
    inputGeneration,
    inputGenerationBytes: canonical(inputGeneration),
    staticGeneration,
    staticGenerationBytes: canonical(staticGeneration),
    current,
    currentBytes: canonical(current),
    sources: [sourceWithApproval],
  } as PrebuiltAuthorityGraphFixture;
}
