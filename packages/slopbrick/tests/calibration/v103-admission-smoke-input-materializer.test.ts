import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import {
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionInputGenerationProposalSha256,
  calibrationAdmissionMaterializationId,
  calibrationAdmissionRecordId,
  calibrationAdmissionRegisterDeltaSha256,
  calibrationAdmissionSha256,
  calibrationAdmissionSourceGenerationApprovalSha256,
  calibrationAdmissionSourceGenerationArtifactSetSha256,
  calibrationAdmissionSourceGenerationProposalSha256,
  calibrationAdmissionSourceGenerationSha256,
  calibrationAdmissionSourceReviewSha256,
  type CalibrationAdmissionRecordV103,
} from '@usebrick/core';

import { calibrationAdmissionSourceSemanticAuthoritySha256 } from '../../src/calibration/v103/admission-authority-rebuild';
import { materializeAdmissionSmokeInputGeneration } from '../../src/calibration/v103/admission-smoke-input-materializer';

const sha = (seed: string): string => createHash('sha256').update(seed).digest('hex');
const json = (value: unknown): Buffer => Buffer.from(calibrationAdmissionCanonicalJson(value), 'utf8');
const jsonl = (values: readonly unknown[]): Buffer => Buffer.from(values.map((value) => `${calibrationAdmissionCanonicalJson(value)}\n`).join(''), 'utf8');

function sourceInput(sourceId: 'source-a' | 'source-b') {
  const reviewBase = {
    version: 'v10.3-source-review-v1' as const,
    sourceId,
    sourceKind: 'material_source' as const,
    contributesToAdditiveCounts: true as const,
    sourceRegisterEntrySha256: sha(`${sourceId}:register`),
    originEvidenceId: `${sourceId}-origin`,
    origin: { kind: 'https' as const, url: `https://example.test/${sourceId}.git` },
    materialization: {
      kind: 'git' as const,
      materializationId: '',
      repositoryId: `${sourceId}-repo`,
      commitSha: 'a'.repeat(40),
    },
    sourceRights: {
      status: 'reviewed' as const,
      scope: 'code' as const,
      analysisUse: 'approved' as const,
      redistribution: 'approved' as const,
      thirdPartyChain: 'complete' as const,
      evidenceIds: [`${sourceId}-rights`],
    },
    inventory: { physicalMemberCount: 100, candidateCodeUnitCount: 100, inventorySha256: sha(`${sourceId}:inventory`), closedWorld: true as const },
    reviewerDecisionIds: [sha(`${sourceId}:reviewer-a`), sha(`${sourceId}:reviewer-b`)].sort(),
    reviewedAt: '2026-07-16T00:00:00.000Z',
    decision: 'candidate' as const,
    reasons: [] as const,
  };
  const review = {
    ...reviewBase,
    materialization: {
      ...reviewBase.materialization,
      materializationId: calibrationAdmissionMaterializationId(sourceId, reviewBase.materialization.repositoryId, reviewBase.materialization),
    },
  };
  const reviewBytes = Buffer.from(`${calibrationAdmissionCanonicalJson(review)}\n`, 'utf8');
  const reviewSha = calibrationAdmissionSourceReviewSha256(review);
  const ledgerBytes = Buffer.from('{}\n', 'utf8');
  const sourceArtifacts = [
    { pathBase: 'generation_local' as const, relativePath: 'decision-ledger.json', kind: 'ledger' as const, bytes: ledgerBytes.byteLength, sha256: sha(`${sourceId}:ledger`) },
    { pathBase: 'generation_local' as const, relativePath: 'source-review.json', kind: 'source_review' as const, bytes: reviewBytes.byteLength, sha256: sha256(reviewBytes) },
  ].sort((left, right) => `${left.relativePath}${left.kind}`.localeCompare(`${right.relativePath}${right.kind}`));
  const proposalBody = {
    version: 'v10.3-admission-source-generation-proposal-v1' as const,
    proposalId: `${sourceId}-proposal`,
    sourceId,
    operation: 'create' as const,
    expectedCurrentState: { kind: 'absent' as const },
    sourceReviewSha256: reviewSha,
    materializationAuthority: { kind: 'genesis' as const, evidenceBundleSha256: sha('evidence-bundle') },
    artifacts: sourceArtifacts,
  };
  const proposal = { ...proposalBody, proposalSha256: calibrationAdmissionSourceGenerationProposalSha256(proposalBody) };
  const approvalBody = {
    version: 'v10.3-admission-source-generation-approval-v1' as const,
    approvalId: `${sourceId}-approval`,
    proposalId: proposal.proposalId,
    proposalSha256: proposal.proposalSha256,
    blindAssignmentId: sha(`${sourceId}:assignment`),
    reviewerDecisionIds: [sha(`${sourceId}:decision-a`), sha(`${sourceId}:decision-b`)].sort() as [string, string],
    blindReviewReceiptId: sha(`${sourceId}:blind-receipt`),
  };
  const approval = { ...approvalBody, approvalSha256: calibrationAdmissionSourceGenerationApprovalSha256(approvalBody) };
  const generationBody = {
    version: 'v10.3-admission-source-generation-v1' as const,
    sourceId,
    generation: 0,
    proposalId: proposal.proposalId,
    proposalSha256: proposal.proposalSha256,
    approval: { kind: 'independent_review' as const, approvalId: approval.approvalId, approvalSha256: approval.approvalSha256 },
    sourceReviewSha256: reviewSha,
    artifacts: sourceArtifacts,
    artifactSetSha256: calibrationAdmissionSourceGenerationArtifactSetSha256(sourceArtifacts),
  };
  const generation = { ...generationBody, generationSha256: calibrationAdmissionSourceGenerationSha256(generationBody) };
  const semanticBody = {
    version: 'v10.3-admission-source-semantic-authority-v1' as const,
    sourceId,
    proposalId: proposal.proposalId,
    blindAssignment: { assignmentId: approval.blindAssignmentId },
    decisions: [{ decisionId: approval.reviewerDecisionIds[0] }, { decisionId: approval.reviewerDecisionIds[1] }],
    blindReviewReceipt: { receiptId: approval.blindReviewReceiptId },
  };
  const semanticAuthority = { ...semanticBody, authoritySha256: calibrationAdmissionSourceSemanticAuthoritySha256(semanticBody) };
  return {
    sourceId,
    sourceGeneration: generation,
    sourceGenerationBytes: json(generation),
    sourceProposal: proposal,
    sourceProposalBytes: json(proposal),
    sourceReviewBytes: reviewBytes,
    semanticAuthority,
    semanticAuthorityBytes: json(semanticAuthority),
    generation,
    reviewSha,
  };
}

function sha256(value: Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }

function record(index: number): CalibrationAdmissionRecordV103 {
  const positive = index < 100;
  const pair = index % 100;
  const sourceId = index % 2 === 0 ? 'source-a' : 'source-b';
  const label = positive ? 'verified_ai' : 'verified_human';
  const body = {
    version: 'v10.3-admission-record-v1' as const,
    recordId: '',
    materialSourceId: sourceId,
    aggregateSourceIds: [sourceId],
    sourceReviewSha256: sourceId === 'source-a' ? sourceInput('source-a').reviewSha : sourceInput('source-b').reviewSha,
    logicalUnitId: `unit-${index}`,
    locator: { kind: 'git_file' as const, materializationId: `${sourceId}-materialization`, normalizedPath: `src/${index}.ts` },
    contentSha256: sha(`content-${index}`),
    contentBytes: 100 + index,
    language: index % 2 === 0 ? 'typescript' : 'python',
    stratum: 'production' as const,
    proposedLabel: label,
    authorship: {
      kind: 'benchmark_attestation' as const,
      evidenceIds: [sha(`authorship-${index}`)],
      benchmarkId: 'smoke-benchmark',
      benchmarkVersion: 'v1',
      exactUnitBinding: `unit-${index}`,
      attestedAuthorship: positive ? 'ai_generated' as const : 'human_written' as const,
      ...(positive ? {
        generator: {
          generatorProvider: 'smoke-provider', model: 'smoke-model', modelRevision: { status: 'pinned' as const, value: 'smoke-revision' },
          promptTaskId: `prompt-${index}`, promptSha256: sha(`prompt-${index}`), outputSha256: sha(`content-${index}`), generatedAt: '2026-07-16T00:00:00.000Z',
        },
        humanEditStatus: 'none' as const,
      } : { humanEditStatus: 'not_applicable' as const }),
    },
    claimedLineage: { familyId: `family-${index % 3}`, pairGroupId: `pair-${pair}`, originRecordId: '', exactClusterId: `exact-${index}`, nearClusterId: `near-${index}` },
    claimedAudits: { syntax: 'pass' as const, scaffoldByteShare: 0.1, privacy: 'pass' as const, secrets: 'pass' as const, exactOverlap: 'pass' as const, nearOverlap: 'pass' as const, familyLeakage: 'pass' as const, pairIntegrity: 'pass' as const },
    reviewerDecisionIds: [sha(`decision-a-${index}`), sha(`decision-b-${index}`)].sort(),
    declaredDisposition: 'eligible_gold' as const,
    rejectionReasons: [],
  };
  const recordId = calibrationAdmissionRecordId({ materialSourceId: body.materialSourceId, logicalUnitId: body.logicalUnitId, locator: body.locator, contentSha256: body.contentSha256, contentBytes: body.contentBytes, language: body.language });
  return { ...body, recordId, claimedLineage: { ...body.claimedLineage, originRecordId: recordId } };
}

function request(outputDirectory: string) {
  const sources = [sourceInput('source-a'), sourceInput('source-b')];
  const addedSources = sources.map((source) => ({
    sourceId: source.sourceId,
    sourceGenerationSha256: source.generation.generationSha256,
    registerEntrySha256: sha(`${source.sourceId}:entry`),
    sourceReviewSha256: source.reviewSha,
    sourceAcquisitionAuthorizationId: `${source.sourceId}-authorization`,
    sourceAcquisitionReceiptId: `${source.sourceId}-receipt`,
    sourceAcquisitionReceiptSha256: sha(`${source.sourceId}:acquisition-receipt`),
    materializationReceiptId: `${source.sourceId}-materialization`,
    materializationReceiptSha256: sha(`${source.sourceId}:materialization-receipt`),
  }));
  const deltaBody = {
    version: 'v10.3-admission-register-delta-v1' as const,
    deltaId: 'smoke-delta',
    generation: 1,
    parentRegisterSha256: sha('parent-register'),
    acquisitionRoundId: 'smoke-round',
    acquisitionRoundReceiptSha256: sha('round-receipt'),
    addedSources,
  };
  const registerDelta = { ...deltaBody, deltaSha256: calibrationAdmissionRegisterDeltaSha256(deltaBody) };
  const records = Array.from({ length: 200 }, (_, index) => record(index));
  return {
    outputDirectory,
    transactionId: 'smoke-transaction',
    proposalId: 'smoke-input-proposal',
    evidenceBundleSha256: sha('evidence-bundle'),
    registerDelta,
    registerDeltaBytes: json(registerDelta),
    sources,
    records: jsonl(records),
    overlapUniverse: { version: 'v10.3-admission-overlap-universe-v1', recordCount: 200, recordIds: records.map((entry) => entry.recordId).sort(), universeSha256: sha('universe') },
    overlapUniverseRecords: jsonl(records.map((entry) => ({ recordId: entry.recordId, contentSha256: entry.contentSha256 }))),
  };
}

describe('v10.3 smoke input materializer', () => {
  it('fails closed before creating output when semantic source authority is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-smoke-materializer-'));
    try {
      const input = request(root);
      const result = await materializeAdmissionSmokeInputGeneration({
        ...input,
        sources: input.sources.map((source, index) => index === 0 ? { ...source, semanticAuthority: undefined as never, semanticAuthorityBytes: undefined as never } : source),
      });
      expect(result.ok).toBe(false);
      await expect(access(join(root, '.staging-smoke-transaction'))).rejects.toThrow();
      await expect(access(join(root, 'generation-smoke'))).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('materializes one atomic diagnostic generation after all authority and cohort checks pass', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-smoke-materializer-'));
    try {
      const result = await materializeAdmissionSmokeInputGeneration(request(root));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.receipt).toMatchObject({ recordCount: 200, positiveCount: 100, negativeCount: 100, diagnosticOnly: true, authorityEligible: false });
      await expect(readFile(join(result.value.finalDirectory, 'generation.json'), 'utf8')).resolves.toContain(result.value.inputGeneration.generationSha256);
      await expect(readFile(join(result.value.finalDirectory, 'receipt.json'), 'utf8')).resolves.toContain('diagnosticOnly');
      const replay = await materializeAdmissionSmokeInputGeneration(request(root));
      expect(replay.ok).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not delete a pre-existing staging directory owned by another transaction', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-smoke-materializer-'));
    const staging = join(root, '.staging-smoke-transaction');
    const sentinel = join(staging, 'owned-by-other-transaction');
    try {
      await mkdir(staging);
      await writeFile(sentinel, 'keep-me', 'utf8');
      const result = await materializeAdmissionSmokeInputGeneration(request(root));
      expect(result.ok).toBe(false);
      await expect(readFile(sentinel, 'utf8')).resolves.toBe('keep-me');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
