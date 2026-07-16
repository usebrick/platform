import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import {
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionNormalizerRegistrySha256,
  calibrationAdmissionOverlapPolarityBindingSha256,
  calibrationAdmissionOverlapUniverseRecordSha256,
  calibrationAdmissionOverlapUniverseSha256,
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
  isCalibrationAdmissionInputGenerationV1,
  isCalibrationAdmissionInputGenerationProposalV1,
  type AdmissionNormalizerRegistryV1,
  type AdmissionOverlapUniverseRecordV1,
  type AdmissionOverlapUniverseV1,
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

function normalizerRegistry(): AdmissionNormalizerRegistryV1 {
  const body = {
    version: 'v10.3-admission-normalizers-v1' as const,
    entries: [
      {
        language: 'python',
        normalizerId: 'normalizer-python-v1',
        implementationSha256: sha('normalizer-implementation-python'),
        fixturesSha256: sha('normalizer-fixtures-python'),
        utf8Policy: 'strict' as const,
        shingleSize: 5 as const,
      },
      {
        language: 'typescript',
        normalizerId: 'normalizer-typescript-v1',
        implementationSha256: sha('normalizer-implementation-typescript'),
        fixturesSha256: sha('normalizer-fixtures-typescript'),
        utf8Policy: 'strict' as const,
        shingleSize: 5 as const,
      },
    ],
  };
  return { ...body, registrySha256: calibrationAdmissionNormalizerRegistrySha256(body) };
}

function overlapInputs(records: readonly CalibrationAdmissionRecordV103[]): {
  normalizerRegistry: AdmissionNormalizerRegistryV1;
  overlapUniverse: AdmissionOverlapUniverseV1;
  overlapUniverseRecords: Buffer;
} {
  const registry = normalizerRegistry();
  const rows: AdmissionOverlapUniverseRecordV1[] = records.map((admission, index) => {
    const intake = index < 100 ? 'declared_ai' as const : 'declared_human' as const;
    const overlapSide = index < 100 ? 'ai_side' as const : 'human_side' as const;
    const proposedLabel = index < 100 ? 'verified_ai' as const : 'verified_human' as const;
    const polarityBody = {
      intake,
      overlapSide,
      bindingAuthority: 'admission-record' as const,
      proposedLabel,
    };
    const polarity = {
      ...polarityBody,
      bindingSha256: calibrationAdmissionOverlapPolarityBindingSha256(polarityBody),
    };
    const body = {
      version: 'v10.3-overlap-universe-record-v1' as const,
      candidateUnitId: `candidate-${String(index).padStart(3, '0')}`,
      admissionRecordId: admission.recordId,
      materialSourceId: admission.materialSourceId,
      aggregateSourceIds: [admission.materialSourceId],
      locator: {
        kind: 'local_inventory_file' as const,
        localSourceId: admission.materialSourceId,
        normalizedPath: `src/${String(index).padStart(3, '0')}.${admission.language === 'python' ? 'py' : 'ts'}`,
      },
      polarity,
      contentSha256: admission.contentSha256,
      contentBytes: admission.contentBytes,
      language: admission.language,
      normalizerId: admission.language === 'python' ? 'normalizer-python-v1' : 'normalizer-typescript-v1',
      normalizationStatus: 'covered' as const,
      shingleSetSha256: sha(`shingles-${index}`),
      shingleCount: 1,
    };
    return { ...body, recordSha256: calibrationAdmissionOverlapUniverseRecordSha256(body) };
  });
  const overlapUniverseRecords = jsonl(rows);
  const universeBody = {
    version: 'v10.3-admission-overlap-universe-v1' as const,
    registerSha256: sha('overlap-register'),
    recordsJsonlSha256: sha256(overlapUniverseRecords),
    selectedAggregateCoverage: rows.length,
    baselineMaterialUnits: rows.length,
    repositoryMaterialUnits: 0,
    newCandidateUnits: 0,
    covered: rows.length,
    unsupported: 0,
    unreadable: 0,
    unresolvedCandidateUnitIds: [],
    normalizerRegistrySha256: registry.registrySha256,
  };
  return {
    normalizerRegistry: registry,
    overlapUniverse: { ...universeBody, universeSha256: calibrationAdmissionOverlapUniverseSha256(universeBody) },
    overlapUniverseRecords,
  };
}

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

function recordWithSource(recordIndex: number, materialSourceId: 'source-a' | 'source-b', familyCount = 3): CalibrationAdmissionRecordV103 {
  const original = record(recordIndex);
  const source = sourceInput(materialSourceId);
  const body = {
    ...original,
    materialSourceId,
    aggregateSourceIds: [materialSourceId],
    sourceReviewSha256: source.reviewSha,
    locator: { ...original.locator, materializationId: `${materialSourceId}-materialization` },
    claimedLineage: { ...original.claimedLineage, familyId: `family-${recordIndex % familyCount}` },
  };
  const recordId = calibrationAdmissionRecordId({
    materialSourceId: body.materialSourceId,
    logicalUnitId: body.logicalUnitId,
    locator: body.locator,
    contentSha256: body.contentSha256,
    contentBytes: body.contentBytes,
    language: body.language,
  });
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
  const overlap = overlapInputs(records);
  return {
    outputDirectory,
    transactionId: 'smoke-transaction',
    proposalId: 'smoke-input-proposal',
    evidenceBundleSha256: sha('evidence-bundle'),
    registerDelta,
    registerDeltaBytes: json(registerDelta),
    sources,
    records: jsonl(records),
    ...overlap,
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
      const input = request(root);
      const result = await materializeAdmissionSmokeInputGeneration(input);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(isCalibrationAdmissionInputGenerationProposalV1(result.value.proposal)).toBe(true);
      expect(isCalibrationAdmissionInputGenerationV1(result.value.inputGeneration)).toBe(true);
      expect(result.value.receipt).toMatchObject({
        recordCount: 200,
        positiveCount: 100,
        negativeCount: 100,
        normalizerRegistrySha256: input.normalizerRegistry.registrySha256,
        diagnosticOnly: true,
        authorityEligible: false,
      });
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

  it('rejects a cohort that declares a source but contributes no records', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-smoke-materializer-'));
    try {
      const input = request(root);
      const records = Array.from({ length: 200 }, (_, index) => recordWithSource(index, 'source-a', 5));
      const result = await materializeAdmissionSmokeInputGeneration({ ...input, records: jsonl(records) });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors).toContain('cohort:source_unrepresented:source-b');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails closed when the overlap registry or canonical stream binding is substituted', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-smoke-materializer-'));
    try {
      const input = request(root);
      const badRegistry = { ...input.normalizerRegistry, registrySha256: sha('substituted-registry') };
      const registryResult = await materializeAdmissionSmokeInputGeneration({ ...input, normalizerRegistry: badRegistry });
      expect(registryResult.ok).toBe(false);
      if (!registryResult.ok) expect(registryResult.errors.some((error) => error.startsWith('overlap:registry:'))).toBe(true);
      const reversed = Buffer.from(input.overlapUniverseRecords).toString('utf8').trimEnd().split('\n').reverse().join('\n') + '\n';
      const streamResult = await materializeAdmissionSmokeInputGeneration({ ...input, overlapUniverseRecords: reversed });
      expect(streamResult.ok).toBe(false);
      if (!streamResult.ok) expect(streamResult.errors.some((error) => error.startsWith('overlap:'))).toBe(true);
      await expect(access(join(root, '.staging-smoke-transaction'))).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns a fail-closed diagnostic for hostile runtime shapes without writing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-smoke-materializer-'));
    try {
      const base = request(root);
      const malformed = [
        null,
        { ...base, sources: [null, null] },
        { ...base, sources: [{ ...base.sources[0], sourceGeneration: null }, base.sources[1]] },
        { ...base, registerDelta: null },
        { ...base, outputDirectory: null },
      ];
      for (const value of malformed) {
        const result = await materializeAdmissionSmokeInputGeneration(value as never);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
      }
      await expect(access(join(root, '.staging-smoke-transaction'))).rejects.toThrow();
      await expect(access(join(root, 'generation-smoke'))).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects a non-canonical source-review byte stream before staging', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-smoke-materializer-'));
    try {
      const input = request(root);
      const source = input.sources[0]!;
      const reviewWithExtraSpace = Buffer.from(`${source.sourceReviewBytes.toString('utf8').trimEnd()} \n`, 'utf8');
      const result = await materializeAdmissionSmokeInputGeneration({
        ...input,
        sources: [{ ...source, sourceReviewBytes: reviewWithExtraSpace }, input.sources[1]!],
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors).toContain('source:source-a:review_bytes_not_canonical');
      await expect(access(join(root, '.staging-smoke-transaction'))).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects a Core-valid overlap row bound to the wrong admission record', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-smoke-materializer-'));
    try {
      const input = request(root);
      const rows = Buffer.from(input.overlapUniverseRecords).toString('utf8').trimEnd().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
      const first = rows[0]!;
      const second = rows[1]!;
      const { recordSha256: _ignored, ...firstBody } = first;
      const substitutedBody = {
        ...firstBody,
        admissionRecordId: second.admissionRecordId,
      };
      const substituted = { ...substitutedBody, recordSha256: calibrationAdmissionOverlapUniverseRecordSha256(substitutedBody) };
      const substitutedRecords = jsonl([substituted, ...rows.slice(1)]);
      const { universeSha256: _universeIgnored, ...universeBody } = input.overlapUniverse;
      const substitutedUniverseBody = { ...universeBody, recordsJsonlSha256: sha256(substitutedRecords) };
      const substitutedUniverse = {
        ...substitutedUniverseBody,
        universeSha256: calibrationAdmissionOverlapUniverseSha256(substitutedUniverseBody),
      };
      const result = await materializeAdmissionSmokeInputGeneration({
        ...input,
        overlapUniverse: substitutedUniverse,
        overlapUniverseRecords: substitutedRecords,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.some((error) => error.includes('duplicate_admission_record_binding') || error.includes('polarity_mismatch'))).toBe(true);
      await expect(access(join(root, '.staging-smoke-transaction'))).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
