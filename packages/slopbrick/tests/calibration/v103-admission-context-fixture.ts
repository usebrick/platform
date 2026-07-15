import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  calibrationAdmissionAuthorityCurrentSha256,
  calibrationAdmissionBlindAssignmentId,
  calibrationAdmissionBlindReviewReceiptId,
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionDecisionId,
  calibrationAdmissionEvidenceBundleSha256,
  calibrationAdmissionEvidenceIndexSha256,
  calibrationAdmissionEvidencePayloadSetSha256,
  calibrationAdmissionInputGenerationSha256,
  calibrationAdmissionPolicySha256,
  calibrationAdmissionLineageLedgerSha256,
  calibrationAdmissionMaterializationId,
  calibrationAdmissionOverlapGenerationArtifactSetSha256,
  calibrationAdmissionOverlapGenerationSha256,
  calibrationAdmissionOverlapCurrentSha256,
  calibrationAdmissionOverlapUniverseSha256,
  calibrationAdmissionOverlapIndexReceiptSha256,
  calibrationAdmissionOverlapLedgerSha256,
  calibrationAdmissionOverlapResourceReceiptId,
  calibrationAdmissionPreWitnessBundleSha256,
  calibrationAdmissionPrivacyLedgerSha256,
  calibrationAdmissionQualityLedgerSha256,
  calibrationAdmissionSha256,
  calibrationAdmissionSourceRegisterEntrySha256,
  calibrationAdmissionSourceCurrentSha256,
  calibrationAdmissionSourceGenerationArtifactSetSha256,
  calibrationAdmissionSourceGenerationApprovalSha256,
  calibrationAdmissionSourceGenerationProposalSha256,
  calibrationAdmissionSourceGenerationSha256,
  calibrationAdmissionSourceReviewSha256,
  calibrationAdmissionRecordId,
  calibrationAdmissionStaticAuthorityGenerationSha256,
  calibrationAdmissionToolReceiptSha256,
  admissionRecordStreamContentSha256,
  admissionRecordStreamSha256,
  calibrationAdmissionToolProfileSha256,
  FROZEN_ADMISSION_ACTIONS,
  FROZEN_ADMISSION_PROFILE_IDS,
  expandAdmissionWitnessConstraints,
  isCalibrationAdmissionAuthorityCurrentV1,
  isCalibrationAdmissionPreWitnessBundleV1,
  isCalibrationAdmissionSourceCurrentV1,
  isCalibrationAdmissionSourceGenerationV1,
  validateCalibrationAdmissionSourceGenerationGraphV1,
  validateCalibrationAdmissionPreWitnessBundleV1,
  type CalibrationAdmissionPreWitnessBundleV1,
  type CalibrationAdmissionRecordV103,
  type CalibrationAdmissionSourceGenerationV1,
  type CalibrationAdmissionStaticAuthorityGenerationV1,
} from '@usebrick/core';

import { buildVerifiedAdmissionEvidenceContext } from '../../src/calibration/v103/admission-evidence-context';
import {
  publishAdmissionToolInvocationIntent,
  publishAdmissionToolReceipt,
} from '../../src/calibration/v103/admission-publication';
import { calibrationAdmissionSourceSemanticAuthoritySha256 } from '../../src/calibration/v103/admission-authority-rebuild';

const roots: string[] = [];
const sha = (value: string): string => createHash('sha256').update(value).digest('hex');
const shaBytes = (value: Uint8Array): string => createHash('sha256').update(value).digest('hex');
const serialized = (value: unknown): Buffer => Buffer.from(`${calibrationAdmissionCanonicalJson(value)}\n`, 'utf8');
const fixture = (name: string): string => join(process.cwd(), '..', 'core', 'tests', 'fixtures', 'schema', 'valid', name);
const OVERLAP_INDEX_PATH = 'index.json';
const OVERLAP_RESOURCE_PATH = 'overlap-resource-receipt.json';
const OVERLAP_LEDGER_PATH = 'overlap-ledger.json';
const STATIC_BUNDLE_PATH = 'pre-witness-bundle.json';

async function emptyEvidenceContext(): Promise<Awaited<ReturnType<typeof buildVerifiedAdmissionEvidenceContext>> extends { ok: true; context: infer C } ? C : never> {
  const root = await mkdtemp(join(tmpdir(), 'slopbrick-runtime-evidence-'));
  roots.push(root);
  const original = JSON.parse(await readFile(fixture('calibration-admission-evidence-bundle.valid.json'), 'utf8')) as Record<string, unknown>;
  const accessReadOnly = new Set([
    'admission-context-v1', 'admission-static-ledgers-v1', 'admission-census-v1', 'admission-manifest-v1',
    'admission-source-node-v1', 'admission-source-parquet-v1', 'admission-git-acquire-v1',
    'admission-release-acquire-v1', 'admission-evidence-acquire-v1',
  ]);
  const profiles = FROZEN_ADMISSION_PROFILE_IDS.map((profileId) => {
    const network = profileId === 'admission-git-acquire-v1'
      ? { mode: 'exact_authorized_https' as const, transport: 'git' as const }
      : profileId === 'admission-release-acquire-v1'
        ? { mode: 'exact_authorized_https' as const, transport: 'release_asset' as const }
        : profileId === 'admission-evidence-acquire-v1'
          ? { mode: 'exact_authorized_https' as const, transport: 'evidence' as const }
          : { mode: 'deny' as const };
    const body = {
      version: 'v10.3-admission-tool-profile-v1' as const,
      profileId,
      allowedExecutableIds: ['corepack-pnpm', 'node'],
      allowedActions: [...FROZEN_ADMISSION_ACTIONS[profileId]],
      candidateByteAccess: accessReadOnly.has(profileId) ? 'read_only' as const : 'none' as const,
      network,
      resourceLimits: { maxHeapMiB: 2048, maxWallSeconds: 3600 },
    };
    return { ...body, profileSha256: calibrationAdmissionToolProfileSha256(body) };
  });
  const policyBody = {
    version: 'v10.3-admission-policy-v1' as const,
    policyId: 'v10.3-admission-v1' as const,
    initialRegisterEntryCount: 329 as const,
    selectedCoverage: 452382 as const,
    baselineMaterialUnits: 58089 as const,
    repositoryMaterialUnits: 394293 as const,
    labels: { positive: 'verified_ai' as const, negative: 'verified_human' as const },
    evidenceCasPolicy: 'sha256-wx-fsync-v1' as const,
    overlapPolicy: 'prefix-filter-exact-jaccard-0.80-v1' as const,
    reasonVocabularySha256: 'a'.repeat(64),
    toolProfileSha256s: profiles.map((profile) => profile.profileSha256).sort(),
    smoke: { unitsPerPolarity: 100 as const, maxSourceOrFamilyUnitsPerPolarity: 50 as const, minimumSourcesPerPolarity: 2 as const, minimumFamiliesPerPolarity: 3 as const, minimumLanguages: 2 as const, minimumUnitsPerRepresentedLanguagePerPolarity: 20 as const },
    canary: { unitsPerPolarity: 5000 as const, maxSourceUnitsPerPolarity: 500 as const, maxFamilyUnitsPerPolarity: 1000 as const, minimumSourcesPerPolarity: 10 as const, minimumFamiliesPerPolarity: 5 as const, minimumLanguages: 3 as const, minimumUnitsPerLanguagePerPolarity: 250 as const, minimumFamiliesPerLanguagePerPolarity: 3 as const, minimumAiGeneratorFamilies: 3 as const },
  };
  const policy = { ...policyBody, policySha256: calibrationAdmissionPolicySha256(policyBody) };
  const witness = (gate: 'smoke' | 'canary') => {
    const body = { version: 'v10.3-admission-witness-policy-v1' as const, policyId: policy.policyId, gate, algorithm: 'lexicographic-bnb-feasibility-v1' as const, seed: 'slopbrick-v10.3-admission-review-v1' as const, maxSearchNodes: (gate === 'smoke' ? 10000000 : 50000000) as 10000000 | 50000000, constraints: expandAdmissionWitnessConstraints(policy, gate), constraintsSha256: '' };
    const hashed = { ...body, constraintsSha256: calibrationAdmissionSha256(body.constraints) };
    return { ...hashed, witnessPolicySha256: calibrationAdmissionPolicySha256(hashed) };
  };
  const emptyIndexBody = { version: 'v10.3-admission-evidence-index-v1' as const, items: [], indexSha256: '' };
  const evidenceIndex = { ...emptyIndexBody, indexSha256: calibrationAdmissionEvidenceIndexSha256(emptyIndexBody) };
  const emptyPayloadBody = { version: 'v10.3-admission-evidence-payload-set-v1' as const, casPolicy: 'sha256-wx-fsync-v1' as const, payloads: [], payloadSetSha256: '' };
  const evidencePayloadSet = { ...emptyPayloadBody, payloadSetSha256: calibrationAdmissionEvidencePayloadSetSha256(emptyPayloadBody) };
  const toolAuthorityBody = {
    version: 'v10.3-admission-tool-authority-snapshot-v1' as const,
    indexGenerationSha256: 'd'.repeat(64),
    profileIds: profiles.map((profile) => profile.profileId).sort(),
    invocationIntentIds: [],
    receiptIds: [],
  };
  const toolAuthoritySnapshot = { ...toolAuthorityBody, snapshotSha256: calibrationAdmissionSha256(toolAuthorityBody) };
  const acquisitionAuthorityBody = {
    version: 'v10.3-admission-acquisition-snapshot-v1' as const,
    indexGenerationSha256: 'e'.repeat(64),
    artifactKeys: [],
  };
  const acquisitionAuthoritySnapshot = { ...acquisitionAuthorityBody, snapshotSha256: calibrationAdmissionSha256(acquisitionAuthorityBody) };
  const withoutHash = {
    ...original,
    policy,
    toolProfiles: profiles,
    witnessPolicies: [witness('canary'), witness('smoke')],
    invocationIntents: [],
    toolReceipts: [],
    toolAuthoritySnapshot,
    evidenceIndex,
    evidencePayloadSet,
    approvedEvidenceAcquisitions: [],
    evidenceAcquisitionReceipts: [],
    evidenceAcquisitionEnvelopes: [],
    acquisitionAuthoritySnapshot,
    evidenceReceipts: [],
    materializationReceipts: [],
    bundleSha256: '',
  };
  const bundle = { ...withoutHash, bundleSha256: calibrationAdmissionEvidenceBundleSha256(withoutHash) };
  await writeFile(join(root, 'evidence-bundle.json'), calibrationAdmissionCanonicalJson(bundle));
  const result = await buildVerifiedAdmissionEvidenceContext(root);
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.context;
}

function sourceReviews(register: Record<string, unknown>): unknown[] {
  const entries = register.entries as Array<Record<string, unknown>>;
  return entries.map((entry) => {
    const aggregate = entry.kind === 'aggregate_inventory';
    const materialization = aggregate
      ? { kind: 'aggregate_only' as const, childMaterialSourceIds: entry.childMaterialSourceIds }
      : (() => {
        const withoutId = { kind: 'git' as const, repositoryId: entry.sourceId, commitSha: sha(`commit-${String(entry.sourceId)}`).slice(0, 40) };
        return { ...withoutId, materializationId: calibrationAdmissionMaterializationId(String(entry.sourceId), String(entry.sourceId), withoutId) };
      })();
    return {
      version: 'v10.3-source-review-v1',
      sourceId: entry.sourceId,
      sourceKind: entry.kind,
      contributesToAdditiveCounts: entry.contributesToAdditiveCounts,
      sourceRegisterEntrySha256: calibrationAdmissionSourceRegisterEntrySha256(entry as never),
      originEvidenceId: (entry.registerEvidenceIds as string[])[0],
      origin: { kind: 'local_unpublished', localSourceId: entry.sourceId },
      materialization,
      sourceRights: {
        status: 'absent',
        scope: aggregate ? 'dataset' : 'code',
        analysisUse: 'unresolved',
        redistribution: 'unresolved',
        thirdPartyChain: 'incomplete',
        evidenceIds: [(entry.registerEvidenceIds as string[])[0]],
      },
      inventory: {
        physicalMemberCount: entry.inventoryCandidateUnits,
        candidateCodeUnitCount: entry.inventoryCandidateUnits,
        inventorySha256: sha(`inventory-${String(entry.sourceId)}`),
        closedWorld: false,
      },
      reviewerDecisionIds: [],
      reviewedAt: '2026-07-13T00:00:00.000Z',
      decision: 'source_quarantine',
      reasons: ['review_incomplete', 'source_wide_quarantine'],
    };
  });
}

/** Materialize the minimal immutable source-review authority used by runtime tests. */
async function materializeSourceReviewAuthorities(
  root: string,
  reviews: readonly unknown[],
  evidenceBundle: unknown,
): Promise<readonly { readonly sourceId: string; readonly generationSha256: string; readonly relativePath: string; readonly artifactSetSha256: string }[]> {
  const admissionRoot = join(root, 'review', 'admission');
  const evidenceBundleSha256 = (evidenceBundle as { readonly bundleSha256: string }).bundleSha256;
  const authorities = await Promise.all(reviews.map(async (value) => {
    const review = value as Record<string, unknown>;
    const sourceId = String(review.sourceId);
    const sourceReviewCanonical = calibrationAdmissionCanonicalJson(review);
    const sourceReviewBytes = Buffer.from(`${sourceReviewCanonical}\n`, 'utf8');
    const sourceReviewArtifact = {
      pathBase: 'generation_local' as const,
      relativePath: 'source-review.json',
      kind: 'source_review' as const,
      bytes: sourceReviewBytes.byteLength,
      sha256: createHash('sha256').update(sourceReviewBytes).digest('hex'),
    };
    const artifacts = [sourceReviewArtifact] as const;
    const proposalBody = {
      version: 'v10.3-admission-source-generation-proposal-v1' as const,
      proposalId: `proposal-${sourceId}`,
      sourceId,
      operation: 'create' as const,
      expectedCurrentState: { kind: 'absent' as const },
      sourceReviewSha256: calibrationAdmissionSourceReviewSha256(review),
      materializationAuthority: { kind: 'genesis' as const, evidenceBundleSha256 },
      artifacts,
    };
    const proposal = { ...proposalBody, proposalSha256: calibrationAdmissionSourceGenerationProposalSha256(proposalBody) };
    const generationBody = {
      version: 'v10.3-admission-source-generation-v1' as const,
      sourceId,
      generation: 0,
      proposalId: proposal.proposalId,
      proposalSha256: proposal.proposalSha256,
      approval: { kind: 'genesis_quarantine' as const, reason: 'review_incomplete' as const },
      sourceReviewSha256: proposal.sourceReviewSha256,
      artifacts,
      artifactSetSha256: calibrationAdmissionSourceGenerationArtifactSetSha256(artifacts),
    };
    const generation = { ...generationBody, generationSha256: calibrationAdmissionSourceGenerationSha256(generationBody) };
    const currentBody = {
      version: 'v10.3-admission-source-current-v1' as const,
      sourceId,
      generationSha256: generation.generationSha256,
      generationRelativePath: `sources/${sourceId}/generations/${generation.generationSha256}`,
    };
    const current = { ...currentBody, currentSha256: calibrationAdmissionSourceCurrentSha256(currentBody) };
    const validation = validateCalibrationAdmissionSourceGenerationGraphV1({
      proposal,
      sourceReview: review,
      generation,
      evidenceBundle,
    });
    if (!validation.ok) {
      throw new Error(`source-generation fixture failed validation for ${sourceId}: ${validation.errors.join('; ')}`);
    }
    if (!isCalibrationAdmissionSourceGenerationV1(generation) || !isCalibrationAdmissionSourceCurrentV1(current)) {
      throw new Error(`source-generation fixture shape failed for ${sourceId}`);
    }
    const generationDirectory = join(admissionRoot, current.generationRelativePath);
    await mkdir(generationDirectory, { recursive: true });
    await writeFile(join(generationDirectory, 'source-generation.json'), calibrationAdmissionCanonicalJson(generation));
    await writeFile(join(generationDirectory, 'source-review.json'), sourceReviewBytes);
    const currentDirectory = join(admissionRoot, 'sources', sourceId);
    await mkdir(currentDirectory, { recursive: true });
    await writeFile(join(currentDirectory, 'current.json'), calibrationAdmissionCanonicalJson(current));
    return {
      sourceId,
      generationSha256: generation.generationSha256,
      relativePath: `review/admission/${current.generationRelativePath}`,
      artifactSetSha256: generation.artifactSetSha256,
    };
  }));
  return authorities.sort((left, right) => left.sourceId.localeCompare(right.sourceId));
}

export async function runtimeFixture(): Promise<{ readonly root: string; readonly evidence: Awaited<ReturnType<typeof emptyEvidenceContext>>; readonly bundle: CalibrationAdmissionPreWitnessBundleV1; readonly recordId: string }> {
  const root = await mkdtemp(join(tmpdir(), 'slopbrick-runtime-context-'));
  roots.push(root);
  const rawBundle = JSON.parse(await readFile(fixture('calibration-admission-pre-witness-bundle.valid.json'), 'utf8')) as CalibrationAdmissionPreWitnessBundleV1;
  const overlapProfile = rawBundle.toolProfiles.find((profile) => profile.profileId === 'admission-static-ledgers-v1');
  if (!overlapProfile) throw new Error('rich fixture is missing the static-ledgers tool profile');
  const toolAuthorityRoot = join(root, 'review', 'admission', 'tool-authority');
  const coreIntent = await publishAdmissionToolInvocationIntent({
    toolAuthorityRoot,
    profileId: 'admission-core-contract-v1',
    action: 'core:contract',
    canonicalArgvSha256: '2'.repeat(64),
    inputSetSha256: '3'.repeat(64),
    executableBehaviorSha256: '4'.repeat(64),
  });
  const coreReceipt = await publishAdmissionToolReceipt({
    toolAuthorityRoot,
    invocationIntentId: coreIntent.intent.intentId,
    observedResourceUsage: { maxHeapMiB: 10, wallSeconds: 1 },
    exitCode: 0,
    outputSetSha256: '5'.repeat(64),
  });
  const overlapIntent = await publishAdmissionToolInvocationIntent({
    toolAuthorityRoot,
    profileId: overlapProfile.profileId,
    action: 'authority:overlap',
    canonicalArgvSha256: sha('overlap-argv'),
    inputSetSha256: sha('overlap-input'),
    executableBehaviorSha256: sha('overlap-executable'),
  });
  const overlapReceipt = await publishAdmissionToolReceipt({
    toolAuthorityRoot,
    invocationIntentId: overlapIntent.intent.intentId,
    observedResourceUsage: { maxHeapMiB: 64, wallSeconds: 1 },
    exitCode: 0,
    outputSetSha256: sha('overlap-output'),
  });
  const toolProfiles = await Promise.all(rawBundle.toolProfiles.map(async (profile) =>
    JSON.parse(await readFile(join(toolAuthorityRoot, 'profiles', `${profile.profileId}.json`), 'utf8')) as typeof profile,
  ));
  const { policySha256: _priorPolicySha256, ...policyWithoutHash } = rawBundle.policy;
  const policyBody = {
    ...policyWithoutHash,
    toolProfileSha256s: toolProfiles.map((profile) => profile.profileSha256).sort(),
  };
  const policy = { ...policyBody, policySha256: calibrationAdmissionPolicySha256(policyBody) };
  const witnessPolicies = (['smoke', 'canary'] as const).map((gate) => {
    const prior = rawBundle.witnessPolicies.find((candidate) => candidate.gate === gate);
    if (!prior) throw new Error(`rich fixture is missing the ${gate} witness policy`);
    const { witnessPolicySha256: _priorWitnessPolicySha256, ...priorWithoutHash } = prior;
    const witnessBody = {
      ...priorWithoutHash,
      policyId: policy.policyId,
      constraints: expandAdmissionWitnessConstraints(policy, gate),
      constraintsSha256: calibrationAdmissionSha256(expandAdmissionWitnessConstraints(policy, gate)),
    };
    return { ...witnessBody, witnessPolicySha256: calibrationAdmissionPolicySha256(witnessBody) };
  });
  const invocationIntents = [coreIntent.intent, overlapIntent.intent].sort((left, right) => left.intentId.localeCompare(right.intentId));
  const toolReceipts = [coreReceipt.receipt, overlapReceipt.receipt].sort((left, right) => left.receiptId.localeCompare(right.receiptId));
  const toolAuthorityBody = {
    version: 'v10.3-admission-tool-authority-snapshot-v1' as const,
    indexGenerationSha256: overlapReceipt.toolAuthorityIndexSha256,
    profileIds: rawBundle.toolProfiles.map((profile) => profile.profileId).sort(),
    invocationIntentIds: invocationIntents.map((intent) => intent.intentId).sort(),
    receiptIds: toolReceipts.map((receipt) => receipt.receiptId).sort(),
  };
  const toolAuthoritySnapshot = { ...toolAuthorityBody, snapshotSha256: calibrationAdmissionSha256(toolAuthorityBody) };
  const reviews = sourceReviews(rawBundle.sourceRegister as unknown as Record<string, unknown>);
  const evidence = await emptyEvidenceContext();
  const sourceAuthorities = await materializeSourceReviewAuthorities(root, reviews, evidence.bundle);
  const review = reviews[0] as Record<string, unknown>;
  const recordBody = {
    version: 'v10.3-admission-record-v1' as const,
    recordId: '',
    materialSourceId: review.sourceId,
    aggregateSourceIds: [review.sourceId],
    sourceReviewSha256: calibrationAdmissionSourceReviewSha256(review),
    logicalUnitId: 'unit-runtime-context',
    locator: { kind: 'git_file' as const, materializationId: 'materialization-runtime', normalizedPath: 'src/runtime.ts' },
    contentSha256: sha('runtime-content'),
    contentBytes: 14,
    language: 'typescript',
    stratum: 'production' as const,
    proposedLabel: 'quarantine' as const,
    authorship: { kind: 'unproven_claim' as const, evidenceIds: [review.originEvidenceId], declaredClaim: 'unknown' as const, missingFields: ['generator_identity'] },
    claimedLineage: { familyId: 'family-runtime', originRecordId: '', exactClusterId: 'exact-runtime', nearClusterId: 'near-runtime' },
    claimedAudits: { syntax: 'unsupported' as const, scaffoldByteShare: 0, privacy: 'review' as const, secrets: 'review' as const, exactOverlap: 'fail' as const, nearOverlap: 'unsupported' as const, familyLeakage: 'fail' as const, pairIntegrity: 'not_applicable' as const },
    reviewerDecisionIds: [sha('decision-runtime')],
    declaredDisposition: 'quarantine' as const,
    rejectionReasons: ['authorship_unproven' as const],
  };
  const recordId = calibrationAdmissionRecordId(recordBody);
  const record = { ...recordBody, recordId, claimedLineage: { ...recordBody.claimedLineage, originRecordId: recordId } };
  const streamBytes = Buffer.from(`${calibrationAdmissionCanonicalJson(record)}\n`, 'utf8');
  const recordSetSha = calibrationAdmissionSha256([recordId]);
  const streamBody = {
    ...rawBundle.admissionRecordStream,
    recordsJsonlSha256: admissionRecordStreamContentSha256(streamBytes),
    recordCount: 1,
    recordIdSetSha256: recordSetSha,
    canonicalRecordHashesSha256: calibrationAdmissionSha256([calibrationAdmissionSha256(record)]),
    streamSha256: '',
  };
  const stream = { ...streamBody, streamSha256: admissionRecordStreamSha256(streamBody) };
  const privacyBody = { ...rawBundle.privacyLedger, admissionRecordSetSha256: recordSetSha, coveredRecordIds: [], unresolvedRecordIds: [recordId], ledgerSha256: '' };
  const qualityBody = { ...rawBundle.qualityLedger, admissionRecordSetSha256: recordSetSha, coveredRecordIds: [], unresolvedRecordIds: [recordId], ledgerSha256: '' };
  const lineageBody = { ...rawBundle.lineageLedger, admissionRecordSetSha256: recordSetSha, coveredRecordIds: [], unresolvedRecordIds: [recordId], ledgerSha256: '' };
  const privacyLedger = { ...privacyBody, ledgerSha256: calibrationAdmissionPrivacyLedgerSha256(privacyBody) };
  const qualityLedger = { ...qualityBody, ledgerSha256: calibrationAdmissionQualityLedgerSha256(qualityBody) };
  const lineageLedger = { ...lineageBody, ledgerSha256: calibrationAdmissionLineageLedgerSha256(lineageBody) };
  const overlapPolarityBody = {
    intake: 'unassigned' as const,
    overlapSide: 'unassigned' as const,
    bindingAuthority: 'admission-record' as const,
    proposedLabel: 'quarantine' as const,
  };
  const overlapRecordBody = {
    version: 'v10.3-overlap-universe-record-v1' as const,
    candidateUnitId: recordId,
    materialSourceId: record.materialSourceId,
    aggregateSourceIds: [record.materialSourceId],
    locator: { kind: 'materialized_file' as const, materializationId: 'materialization-runtime', normalizedPath: 'src/runtime.ts' },
    polarity: { ...overlapPolarityBody, bindingSha256: calibrationAdmissionSha256(overlapPolarityBody) },
    contentSha256: record.contentSha256,
    contentBytes: record.contentBytes,
    language: 'TypeScript',
    normalizerId: rawBundle.normalizerRegistry.entries[0]!.normalizerId,
    normalizationStatus: 'covered' as const,
    shingleSetSha256: sha('runtime-shingles'),
    shingleCount: 1,
    admissionRecordId: recordId,
  };
  const overlapUniverseRecord = { ...overlapRecordBody, recordSha256: calibrationAdmissionSha256(overlapRecordBody) };
  const overlapUniverseRecordBytes = Buffer.from(`${calibrationAdmissionCanonicalJson(overlapUniverseRecord)}\n`, 'utf8');
  const overlapUniverseBody = {
    ...rawBundle.overlapUniverse,
    recordsJsonlSha256: shaBytes(overlapUniverseRecordBytes),
    selectedAggregateCoverage: 1,
    baselineMaterialUnits: 1,
    repositoryMaterialUnits: 0,
    newCandidateUnits: 0,
    covered: 1,
    unsupported: 0,
    unreadable: 0,
    unresolvedCandidateUnitIds: [],
    normalizerRegistrySha256: rawBundle.normalizerRegistry.registrySha256,
    universeSha256: '',
  };
  const overlapUniverse = { ...overlapUniverseBody, universeSha256: calibrationAdmissionOverlapUniverseSha256(overlapUniverseBody) };
  const overlapUniverseSha256 = overlapUniverse.universeSha256;
  const overlapPolicySha256 = rawBundle.overlapPolicy.policySha256;
  const normalizerRegistrySha256 = rawBundle.normalizerRegistry.registrySha256;
  const overlapToolReceiptSha256 = calibrationAdmissionToolReceiptSha256(overlapReceipt.receipt);
  const overlapIndexBody = {
    ...rawBundle.overlapIndexReceipt,
    universeSha256: overlapUniverseSha256,
    normalizerRegistrySha256,
    overlapPolicySha256,
    postingShards: [],
    candidatePairShards: [],
    checkpoints: [],
    coveredCandidateUnits: 1,
    complete: true,
    toolReceiptSha256: overlapToolReceiptSha256,
    receiptSha256: '',
  };
  const overlapIndexReceipt = {
    ...overlapIndexBody,
    receiptSha256: calibrationAdmissionOverlapIndexReceiptSha256(overlapIndexBody),
  };
  const overlapResourceBody = {
    ...rawBundle.overlapResourceReceipt,
    receiptId: '',
    universeSha256: overlapUniverseSha256,
    recordsJsonlSha256: stream.recordsJsonlSha256,
    overlapPolicySha256,
    recordCount: 1,
    coverageComplete: true,
    withinAllLimits: true,
    toolReceiptSha256: overlapToolReceiptSha256,
  };
  const overlapResourceReceipt = {
    ...overlapResourceBody,
    receiptId: calibrationAdmissionOverlapResourceReceiptId({ ...overlapResourceBody, receiptId: undefined }),
  };
  const overlapLedgerBody = {
    ...rawBundle.overlapLedger,
    universeSha256: overlapUniverseSha256,
    normalizerRegistrySha256,
    overlapPolicySha256,
    indexReceiptSha256: overlapIndexReceipt.receiptSha256,
    coverageComplete: true,
    unresolvedCandidateUnitIds: [],
    edgeShards: [],
    adjacencyShards: [],
    clusterSummaryShards: [],
    clusterMembershipShards: [],
    edgeCount: 0,
    adjacencyRowCount: 0,
    exactClusterCount: 0,
    nearClusterCount: 0,
    crossSideEdgeCount: 0,
    ledgerSha256: '',
  };
  const overlapLedger = {
    ...overlapLedgerBody,
    ledgerSha256: calibrationAdmissionOverlapLedgerSha256(overlapLedgerBody),
  };
  const bundleBody = {
    ...rawBundle,
    toolProfiles,
    policy,
    witnessPolicies,
    invocationIntents,
    toolReceipts,
    toolAuthoritySnapshot,
    overlapUniverse,
    overlapIndexReceipt,
    overlapLedger,
    overlapResourceReceipt,
    sourceReviews: reviews,
    admissionRecordStream: stream,
    privacyLedger,
    qualityLedger,
    lineageLedger,
    preWitnessBundleSha256: '',
  };
  const bundle = { ...bundleBody, preWitnessBundleSha256: calibrationAdmissionPreWitnessBundleSha256(bundleBody) } as CalibrationAdmissionPreWitnessBundleV1;
  if (!isCalibrationAdmissionPreWitnessBundleV1(bundle)) {
    const validation = validateCalibrationAdmissionPreWitnessBundleV1(bundle);
    throw new Error(`fixture bundle does not validate: ${validation.errors.join('; ')}`);
  }
  const inputUniverseBytes = Buffer.from(calibrationAdmissionCanonicalJson(overlapUniverse), 'utf8');
  const inputUniverseRecordsBytes = overlapUniverseRecordBytes;
  const inputArtifacts = [
    { pathBase: 'generation_local' as const, relativePath: 'admission-records.jsonl', kind: 'record_stream' as const, bytes: streamBytes.byteLength, sha256: shaBytes(streamBytes) },
    { pathBase: 'generation_local' as const, relativePath: 'overlap-universe.json', kind: 'overlap_universe' as const, bytes: inputUniverseBytes.byteLength, sha256: shaBytes(inputUniverseBytes) },
    { pathBase: 'generation_local' as const, relativePath: 'overlap-universe-records.jsonl', kind: 'overlap_universe_stream' as const, bytes: inputUniverseRecordsBytes.byteLength, sha256: shaBytes(inputUniverseRecordsBytes) },
  ].sort((left, right) => `${left.relativePath}\u0000${left.kind}\u0000${left.sha256}`.localeCompare(`${right.relativePath}\u0000${right.kind}\u0000${right.sha256}`));
  const inputGenerationBody = {
    version: 'v10.3-admission-input-generation-v1' as const,
    generation: 0,
    evidenceBundleSha256: evidence.bundle.bundleSha256,
    sourceGenerations: sourceAuthorities,
    admissionRecordStreamSha256: shaBytes(streamBytes),
    overlapUniverseSha256: shaBytes(inputUniverseBytes),
    overlapUniverseRecordsSha256: shaBytes(inputUniverseRecordsBytes),
    artifacts: inputArtifacts,
  };
  const inputGeneration = {
    ...inputGenerationBody,
    generationSha256: calibrationAdmissionSha256(inputGenerationBody),
  };
  const overlapEnvelopeArtifacts = [
    { pathBase: 'generation_local' as const, relativePath: OVERLAP_INDEX_PATH, kind: 'index' as const, bytes: Buffer.byteLength(calibrationAdmissionCanonicalJson(overlapIndexReceipt)), sha256: sha(calibrationAdmissionCanonicalJson(overlapIndexReceipt)) },
    { pathBase: 'generation_local' as const, relativePath: OVERLAP_LEDGER_PATH, kind: 'ledger' as const, bytes: Buffer.byteLength(calibrationAdmissionCanonicalJson(overlapLedger)), sha256: sha(calibrationAdmissionCanonicalJson(overlapLedger)) },
    { pathBase: 'generation_local' as const, relativePath: OVERLAP_RESOURCE_PATH, kind: 'receipt' as const, bytes: Buffer.byteLength(calibrationAdmissionCanonicalJson(overlapResourceReceipt)), sha256: sha(calibrationAdmissionCanonicalJson(overlapResourceReceipt)) },
  ].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const overlapGenerationBody = {
    version: 'v10.3-admission-overlap-generation-v1' as const,
    generation: 0,
    inputGenerationSha256: inputGeneration.generationSha256,
    universeSha256: overlapUniverseSha256,
    overlapPolicySha256,
    artifactSetSha256: calibrationAdmissionOverlapGenerationArtifactSetSha256(overlapEnvelopeArtifacts),
    artifacts: overlapEnvelopeArtifacts,
    toolAuthoritySnapshot,
    generationSha256: '',
  };
  const overlapGeneration = {
    ...overlapGenerationBody,
    generationSha256: calibrationAdmissionOverlapGenerationSha256(overlapGenerationBody),
  };
  const bundleBytes = Buffer.from(calibrationAdmissionCanonicalJson(bundle));
  const privacyBytes = Buffer.from(calibrationAdmissionCanonicalJson(privacyLedger));
  const qualityBytes = Buffer.from(calibrationAdmissionCanonicalJson(qualityLedger));
  const lineageBytes = Buffer.from(calibrationAdmissionCanonicalJson(lineageLedger));
  const artifacts = [
    { pathBase: 'generation_local' as const, relativePath: 'lineage-ledger.json', kind: 'ledger' as const, bytes: lineageBytes.byteLength, sha256: shaBytes(lineageBytes) },
    { pathBase: 'generation_local' as const, relativePath: 'pre-witness-bundle.json', kind: 'bundle' as const, bytes: bundleBytes.byteLength, sha256: shaBytes(bundleBytes) },
    { pathBase: 'generation_local' as const, relativePath: 'privacy-ledger.json', kind: 'ledger' as const, bytes: privacyBytes.byteLength, sha256: shaBytes(privacyBytes) },
    { pathBase: 'generation_local' as const, relativePath: 'quality-ledger.json', kind: 'ledger' as const, bytes: qualityBytes.byteLength, sha256: shaBytes(qualityBytes) },
  ].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const staticBody = {
    version: 'v10.3-admission-static-authority-generation-v1' as const,
    generation: 0,
    inputGenerationSha256: inputGeneration.generationSha256,
    overlapGenerationSha256: overlapGeneration.generationSha256,
    privacyLedgerSha256: privacyLedger.ledgerSha256,
    qualityLedgerSha256: qualityLedger.ledgerSha256,
    lineageLedgerSha256: lineageLedger.ledgerSha256,
    preWitnessBundleSha256: bundle.preWitnessBundleSha256,
    toolAuthoritySnapshot: bundle.toolAuthoritySnapshot,
    artifacts,
    generationSha256: '',
  };
  const staticGeneration = { ...staticBody, generationSha256: calibrationAdmissionStaticAuthorityGenerationSha256(staticBody) };
  const currentBody = {
    version: 'v10.3-admission-authority-current-v1' as const,
    generation: 0,
    staticGenerationSha256: staticGeneration.generationSha256,
    staticGenerationRelativePath: `review/admission/authority/static-generations/${staticGeneration.generationSha256}`,
    currentSha256: '',
  };
  const current = { ...currentBody, currentSha256: calibrationAdmissionAuthorityCurrentSha256(currentBody) };
  if (!isCalibrationAdmissionAuthorityCurrentV1(current)) throw new Error('fixture current pointer does not validate');
  const staticRoot = join(root, current.staticGenerationRelativePath);
  await mkdir(staticRoot, { recursive: true });
  await mkdir(join(root, 'review', 'admission'), { recursive: true });
  await writeFile(join(root, 'review', 'admission', 'authority', 'current.json'), calibrationAdmissionCanonicalJson(current));
  await writeFile(join(staticRoot, 'generation.json'), calibrationAdmissionCanonicalJson(staticGeneration));
  await writeFile(join(staticRoot, 'pre-witness-bundle.json'), bundleBytes);
  await writeFile(join(staticRoot, 'privacy-ledger.json'), privacyBytes);
  await writeFile(join(staticRoot, 'quality-ledger.json'), qualityBytes);
  await writeFile(join(staticRoot, 'lineage-ledger.json'), lineageBytes);
  await writeFile(join(root, 'review', 'admission', 'admission-records.jsonl'), streamBytes);
  const inputRoot = join(root, 'review', 'admission', 'authority', 'input-generations', inputGeneration.generationSha256);
  await mkdir(inputRoot, { recursive: true });
  await writeFile(join(inputRoot, 'generation.json'), calibrationAdmissionCanonicalJson(inputGeneration));
  await writeFile(join(inputRoot, 'admission-records.jsonl'), streamBytes);
  await writeFile(join(inputRoot, 'overlap-universe.json'), inputUniverseBytes);
  await writeFile(join(inputRoot, 'overlap-universe-records.jsonl'), inputUniverseRecordsBytes);
  const overlapRoot = join(root, 'review', 'admission', 'global', 'overlap', 'generations', overlapGeneration.generationSha256);
  await mkdir(overlapRoot, { recursive: true });
  await writeFile(join(overlapRoot, 'generation.json'), calibrationAdmissionCanonicalJson(overlapGeneration));
  await writeFile(join(overlapRoot, OVERLAP_INDEX_PATH), calibrationAdmissionCanonicalJson(overlapIndexReceipt));
  await writeFile(join(overlapRoot, OVERLAP_RESOURCE_PATH), calibrationAdmissionCanonicalJson(overlapResourceReceipt));
  await writeFile(join(overlapRoot, OVERLAP_LEDGER_PATH), calibrationAdmissionCanonicalJson(overlapLedger));
  const overlapCurrentBody = {
    version: 'v10.3-admission-overlap-current-v1' as const,
    generation: 0,
    generationSha256: overlapGeneration.generationSha256,
    generationRelativePath: `review/admission/global/overlap/generations/${overlapGeneration.generationSha256}`,
  };
  await writeFile(
    join(root, 'review', 'admission', 'global', 'overlap', 'current-generation.json'),
    calibrationAdmissionCanonicalJson({ ...overlapCurrentBody, currentSha256: calibrationAdmissionOverlapCurrentSha256(overlapCurrentBody) }),
  );
  return { root, evidence, bundle, recordId };
}

/**
 * Promote one source in the materialized runtime fixture to a complete,
 * acquired-independent-review graph.  The selected source deliberately has
 * no record in the one-record stream so the focused context tests exercise
 * source-authority joins without changing ledger/record fixtures.
 */
export async function runtimeCandidateFixture(): Promise<{
  readonly root: string;
  readonly evidence: Awaited<ReturnType<typeof emptyEvidenceContext>>;
  readonly bundle: CalibrationAdmissionPreWitnessBundleV1;
  readonly recordId: string;
  readonly candidateSourceId: string;
}> {
  const base = await runtimeFixture();
  const candidateReview = base.bundle.sourceReviews[1];
  if (candidateReview === undefined) throw new Error('runtime fixture is missing a second source review');
  const candidateSourceId = candidateReview.sourceId;
  const admissionRoot = join(base.root, 'review', 'admission');
  const authorityCurrentPath = join(admissionRoot, 'authority', 'current.json');
  const authorityCurrent = JSON.parse(await readFile(authorityCurrentPath, 'utf8')) as {
    readonly generation: number;
    readonly staticGenerationSha256: string;
    readonly staticGenerationRelativePath: string;
    readonly currentSha256: string;
  };
  const oldStaticPath = join(base.root, authorityCurrent.staticGenerationRelativePath);
  const oldStaticGeneration = JSON.parse(await readFile(join(oldStaticPath, 'generation.json'), 'utf8')) as CalibrationAdmissionStaticAuthorityGenerationV1;
  const oldBundle = JSON.parse(await readFile(join(oldStaticPath, STATIC_BUNDLE_PATH), 'utf8')) as CalibrationAdmissionPreWitnessBundleV1;
  const sourceCurrentPath = join(admissionRoot, 'sources', candidateSourceId, 'current.json');
  const oldSourceCurrent = JSON.parse(await readFile(sourceCurrentPath, 'utf8')) as {
    readonly generationSha256: string;
    readonly generationRelativePath: string;
  };
  const oldSourceGenerationPath = join(admissionRoot, oldSourceCurrent.generationRelativePath);
  const oldSourceGeneration = JSON.parse(await readFile(join(oldSourceGenerationPath, 'source-generation.json'), 'utf8')) as CalibrationAdmissionSourceGenerationV1;

  const rightsEvidenceId = `${candidateSourceId}-rights`;
  const evidenceIds = [candidateReview.originEvidenceId, rightsEvidenceId].sort();
  const assignmentBody = {
    version: 'v10.3-admission-blind-assignment-v1' as const,
    target: { kind: 'source' as const, sourceId: candidateSourceId },
    evidenceSetSha256: calibrationAdmissionSha256(evidenceIds),
    protocolEvidenceId: `${candidateSourceId}-protocol`,
    reviewerIds: ['reviewer-authorship', 'reviewer-rights'] as [string, string],
    peerMaterialHiddenUntilBothSealed: true as const,
  };
  const assignment = { ...assignmentBody, assignmentId: calibrationAdmissionBlindAssignmentId(assignmentBody) };
  const decisionBody = (reviewerId: 'reviewer-authorship' | 'reviewer-rights', reviewerRole: 'authorship' | 'rights') => ({
    version: 'v10.3-admission-decision-v1' as const,
    target: { kind: 'source' as const, sourceId: candidateSourceId },
    reviewerId,
    reviewerRoles: [reviewerRole] as [typeof reviewerRole],
    evidenceIds,
    blindAssignmentId: assignment.assignmentId,
    result: {
      kind: 'admission' as const,
      proposedLabel: 'verified_ai' as const,
      humanEditStatus: 'none' as const,
      disposition: 'eligible_gold' as const,
    },
    reasons: [] as const,
    decidedAt: '2026-07-15T00:00:00.000Z',
  });
  const decisionAContent = decisionBody('reviewer-authorship', 'authorship');
  const decisionBContent = decisionBody('reviewer-rights', 'rights');
  const decisions = [
    { ...decisionAContent, decisionId: calibrationAdmissionDecisionId(decisionAContent) },
    { ...decisionBContent, decisionId: calibrationAdmissionDecisionId(decisionBContent) },
  ].sort((left, right) => left.decisionId.localeCompare(right.decisionId));
  const receiptBody = {
    version: 'v10.3-admission-blind-review-receipt-v1' as const,
    assignmentId: assignment.assignmentId,
    evidenceSetSha256: assignment.evidenceSetSha256,
    sealedDecisions: decisions.slice().sort((left, right) => left.reviewerId.localeCompare(right.reviewerId)).map((decision) => ({
      reviewerId: decision.reviewerId,
      decisionId: decision.decisionId,
      peerDecisionVisibleBeforeSeal: false as const,
    })) as [{ reviewerId: string; decisionId: string; peerDecisionVisibleBeforeSeal: false }, { reviewerId: string; decisionId: string; peerDecisionVisibleBeforeSeal: false }],
    unsealedOnlyAfterBothDecisionIdsExisted: true as const,
    protocolAuditorId: `${candidateSourceId}-auditor`,
    protocolAuditEvidenceIds: [`${candidateSourceId}-protocol`],
  };
  const receipt = { ...receiptBody, receiptId: calibrationAdmissionBlindReviewReceiptId(receiptBody) };
  const reviewedSource = {
    ...candidateReview,
    origin: { kind: 'https' as const, url: `https://example.test/${candidateSourceId}.git` },
    sourceRights: {
      ...candidateReview.sourceRights,
      status: 'reviewed' as const,
      analysisUse: 'approved' as const,
      redistribution: 'approved' as const,
      thirdPartyChain: 'complete' as const,
      evidenceIds,
    },
    reviewerDecisionIds: decisions.map((decision) => decision.decisionId).sort(),
    decision: 'candidate' as const,
    reasons: [] as const,
  };
  const sourceReviewSha256 = calibrationAdmissionSourceReviewSha256(reviewedSource);
  const sourceReviewBytes = serialized(reviewedSource);
  const sourceArtifacts = oldSourceGeneration.artifacts.map((artifact) => artifact.kind === 'source_review' && artifact.relativePath === 'source-review.json'
    ? { ...artifact, bytes: sourceReviewBytes.byteLength, sha256: shaBytes(sourceReviewBytes) }
    : artifact);
  const sourceProposalBody = {
    version: 'v10.3-admission-source-generation-proposal-v1' as const,
    proposalId: oldSourceGeneration.proposalId,
    sourceId: candidateSourceId,
    operation: 'create' as const,
    expectedCurrentState: { kind: 'absent' as const },
    sourceReviewSha256,
    materializationAuthority: {
      kind: 'genesis' as const,
      evidenceBundleSha256: base.evidence.bundle.bundleSha256,
    },
    artifacts: sourceArtifacts,
  };
  const sourceProposal = {
    ...sourceProposalBody,
    proposalSha256: calibrationAdmissionSourceGenerationProposalSha256(sourceProposalBody),
  };
  const approvalBody = {
    version: 'v10.3-admission-source-generation-approval-v1' as const,
    approvalId: `${candidateSourceId}-approval`,
    proposalId: sourceProposal.proposalId,
    proposalSha256: sourceProposal.proposalSha256,
    blindAssignmentId: assignment.assignmentId,
    reviewerDecisionIds: decisions.map((decision) => decision.decisionId).sort() as [string, string],
    blindReviewReceiptId: receipt.receiptId,
  };
  const approval = {
    ...approvalBody,
    approvalSha256: calibrationAdmissionSourceGenerationApprovalSha256(approvalBody),
  };
  const sourceGenerationBody = {
    ...oldSourceGeneration,
    proposalSha256: sourceProposal.proposalSha256,
    approval: {
      kind: 'independent_review' as const,
      approvalId: approval.approvalId,
      approvalSha256: approval.approvalSha256,
    },
    sourceReviewSha256,
    artifacts: sourceArtifacts,
    artifactSetSha256: calibrationAdmissionSourceGenerationArtifactSetSha256(sourceArtifacts),
    generationSha256: '',
  };
  const sourceGeneration = {
    ...sourceGenerationBody,
    generationSha256: calibrationAdmissionSourceGenerationSha256(sourceGenerationBody),
  };
  const semanticBody = {
    version: 'v10.3-admission-source-semantic-authority-v1' as const,
    sourceId: candidateSourceId,
    proposalId: sourceProposal.proposalId,
    blindAssignment: assignment,
    decisions,
    blindReviewReceipt: receipt,
    evidenceBundle: base.evidence.bundle,
  };
  const semanticAuthority = {
    ...semanticBody,
    authoritySha256: calibrationAdmissionSourceSemanticAuthoritySha256(semanticBody),
  };
  const sourceCurrentBody = {
    ...oldSourceCurrent,
    generationSha256: sourceGeneration.generationSha256,
    generationRelativePath: `sources/${candidateSourceId}/generations/${sourceGeneration.generationSha256}`,
    currentSha256: '',
  };
  const sourceCurrent = {
    ...sourceCurrentBody,
    currentSha256: calibrationAdmissionSourceCurrentSha256(sourceCurrentBody),
  };
  const newSourceGenerationPath = join(admissionRoot, sourceCurrent.generationRelativePath);
  await mkdir(newSourceGenerationPath, { recursive: true });
  await writeFile(join(newSourceGenerationPath, 'source-generation.json'), calibrationAdmissionCanonicalJson(sourceGeneration));
  for (const artifact of sourceArtifacts) {
    const bytes = artifact.relativePath === 'source-review.json'
      ? sourceReviewBytes
      : await readFile(join(oldSourceGenerationPath, artifact.relativePath));
    await writeFile(join(newSourceGenerationPath, artifact.relativePath), bytes);
  }
  await writeFile(join(newSourceGenerationPath, 'source-semantic-authority.json'), calibrationAdmissionCanonicalJson(semanticAuthority));
  const proposalDirectory = join(admissionRoot, 'sources', candidateSourceId, 'proposals');
  await mkdir(proposalDirectory, { recursive: true });
  await writeFile(join(proposalDirectory, `${sourceProposal.proposalId}.json`), calibrationAdmissionCanonicalJson(sourceProposal));
  await writeFile(join(proposalDirectory, `${sourceProposal.proposalId}-approval.json`), calibrationAdmissionCanonicalJson(approval));
  await writeFile(sourceCurrentPath, calibrationAdmissionCanonicalJson(sourceCurrent));

  const nextBundleBody = {
    ...oldBundle,
    sourceReviews: oldBundle.sourceReviews.map((review) => review.sourceId === candidateSourceId ? reviewedSource : review),
    preWitnessBundleSha256: '',
  };
  const nextBundle = {
    ...nextBundleBody,
    preWitnessBundleSha256: calibrationAdmissionPreWitnessBundleSha256(nextBundleBody),
  } as CalibrationAdmissionPreWitnessBundleV1;
  const nextBundleBytes = Buffer.from(calibrationAdmissionCanonicalJson(nextBundle), 'utf8');

  const oldInputPath = join(base.root, 'review', 'admission', 'authority', 'input-generations', oldStaticGeneration.inputGenerationSha256);
  const oldInputGeneration = JSON.parse(await readFile(join(oldInputPath, 'generation.json'), 'utf8')) as Record<string, unknown> & { readonly sourceGenerations: readonly Record<string, unknown>[] };
  const nextInputBody = {
    ...oldInputGeneration,
    sourceGenerations: oldInputGeneration.sourceGenerations.map((source) => source.sourceId === candidateSourceId
      ? {
        ...source,
        generationSha256: sourceGeneration.generationSha256,
        artifactSetSha256: sourceGeneration.artifactSetSha256,
        relativePath: `review/admission/${sourceCurrent.generationRelativePath}`,
      }
      : source),
    generationSha256: '',
  };
  const nextInputGeneration = {
    ...nextInputBody,
    generationSha256: calibrationAdmissionInputGenerationSha256(nextInputBody),
  };
  const nextInputPath = join(base.root, 'review', 'admission', 'authority', 'input-generations', nextInputGeneration.generationSha256);
  await mkdir(nextInputPath, { recursive: true });
  await writeFile(join(nextInputPath, 'generation.json'), calibrationAdmissionCanonicalJson(nextInputGeneration));
  for (const artifact of (oldInputGeneration.artifacts as readonly { readonly relativePath: string }[])) {
    await writeFile(join(nextInputPath, artifact.relativePath), await readFile(join(oldInputPath, artifact.relativePath)));
  }

  const oldOverlapPath = join(base.root, 'review', 'admission', 'global', 'overlap', 'generations', oldStaticGeneration.overlapGenerationSha256);
  const oldOverlapGeneration = JSON.parse(await readFile(join(oldOverlapPath, 'generation.json'), 'utf8')) as Record<string, unknown>;
  const nextOverlapBody = {
    ...oldOverlapGeneration,
    inputGenerationSha256: nextInputGeneration.generationSha256,
    generationSha256: '',
  };
  const nextOverlapGeneration = {
    ...nextOverlapBody,
    generationSha256: calibrationAdmissionOverlapGenerationSha256(nextOverlapBody),
  };
  const nextOverlapPath = join(base.root, 'review', 'admission', 'global', 'overlap', 'generations', nextOverlapGeneration.generationSha256);
  await mkdir(nextOverlapPath, { recursive: true });
  await writeFile(join(nextOverlapPath, 'generation.json'), calibrationAdmissionCanonicalJson(nextOverlapGeneration));
  for (const filename of [OVERLAP_INDEX_PATH, OVERLAP_RESOURCE_PATH, OVERLAP_LEDGER_PATH]) {
    await writeFile(join(nextOverlapPath, filename), await readFile(join(oldOverlapPath, filename)));
  }
  const oldOverlapCurrentPath = join(base.root, 'review', 'admission', 'global', 'overlap', 'current-generation.json');
  const oldOverlapCurrent = JSON.parse(await readFile(oldOverlapCurrentPath, 'utf8')) as Record<string, unknown>;
  const nextOverlapCurrentBody = {
    ...oldOverlapCurrent,
    generationSha256: nextOverlapGeneration.generationSha256,
    generationRelativePath: `review/admission/global/overlap/generations/${nextOverlapGeneration.generationSha256}`,
    currentSha256: '',
  };
  await writeFile(oldOverlapCurrentPath, calibrationAdmissionCanonicalJson({
    ...nextOverlapCurrentBody,
    currentSha256: calibrationAdmissionOverlapCurrentSha256(nextOverlapCurrentBody),
  }));

  const nextStaticArtifacts = oldStaticGeneration.artifacts.map((artifact) => artifact.kind === 'bundle' && artifact.relativePath === STATIC_BUNDLE_PATH
    ? { ...artifact, bytes: nextBundleBytes.byteLength, sha256: shaBytes(nextBundleBytes) }
    : artifact);
  const nextStaticBody = {
    ...oldStaticGeneration,
    inputGenerationSha256: nextInputGeneration.generationSha256,
    overlapGenerationSha256: nextOverlapGeneration.generationSha256,
    preWitnessBundleSha256: nextBundle.preWitnessBundleSha256,
    artifacts: nextStaticArtifacts,
    generationSha256: '',
  };
  const nextStaticGeneration = {
    ...nextStaticBody,
    generationSha256: calibrationAdmissionStaticAuthorityGenerationSha256(nextStaticBody),
  };
  const nextStaticPath = join(base.root, 'review', 'admission', 'authority', 'static-generations', nextStaticGeneration.generationSha256);
  await mkdir(nextStaticPath, { recursive: true });
  await writeFile(join(nextStaticPath, 'generation.json'), calibrationAdmissionCanonicalJson(nextStaticGeneration));
  for (const artifact of nextStaticArtifacts) {
    const bytes = artifact.kind === 'bundle' && artifact.relativePath === STATIC_BUNDLE_PATH
      ? nextBundleBytes
      : await readFile(join(oldStaticPath, artifact.relativePath));
    await writeFile(join(nextStaticPath, artifact.relativePath), bytes);
  }
  const nextAuthorityCurrentBody = {
    ...authorityCurrent,
    staticGenerationSha256: nextStaticGeneration.generationSha256,
    staticGenerationRelativePath: `review/admission/authority/static-generations/${nextStaticGeneration.generationSha256}`,
    currentSha256: '',
  };
  await writeFile(authorityCurrentPath, calibrationAdmissionCanonicalJson({
    ...nextAuthorityCurrentBody,
    currentSha256: calibrationAdmissionAuthorityCurrentSha256(nextAuthorityCurrentBody),
  }));
  return { ...base, bundle: nextBundle, candidateSourceId };
}

/** Rewrite the exact authority graph after a focused bundle mutation. */
export async function rewriteRuntimeBundle(
  root: string,
  mutate: (bundle: CalibrationAdmissionPreWitnessBundleV1) => CalibrationAdmissionPreWitnessBundleV1,
): Promise<void> {
  const currentPath = join(root, 'review', 'admission', 'authority', 'current.json');
  const current = JSON.parse(await readFile(currentPath, 'utf8')) as {
    readonly version: 'v10.3-admission-authority-current-v1';
    readonly generation: number;
    readonly staticGenerationSha256: string;
    readonly staticGenerationRelativePath: string;
    readonly currentSha256: string;
  };
  const staticPath = join(root, current.staticGenerationRelativePath);
  const staticPathFile = join(staticPath, 'generation.json');
  const staticGeneration = JSON.parse(await readFile(staticPathFile, 'utf8')) as CalibrationAdmissionStaticAuthorityGenerationV1;
  const oldBundlePath = join(staticPath, 'pre-witness-bundle.json');
  const existing = JSON.parse(await readFile(oldBundlePath, 'utf8')) as CalibrationAdmissionPreWitnessBundleV1;
  const mutatedBody = { ...mutate(structuredClone(existing)), preWitnessBundleSha256: '' };
  const bundle = { ...mutatedBody, preWitnessBundleSha256: calibrationAdmissionPreWitnessBundleSha256(mutatedBody) } as CalibrationAdmissionPreWitnessBundleV1;
  const bundleBytes = Buffer.from(calibrationAdmissionCanonicalJson(bundle), 'utf8');
  const artifacts = staticGeneration.artifacts.map((artifact) => artifact.kind === 'bundle' && artifact.relativePath === 'pre-witness-bundle.json'
    ? { ...artifact, bytes: bundleBytes.byteLength, sha256: shaBytes(bundleBytes) }
    : artifact);
  const staticBody = {
    ...staticGeneration,
    privacyLedgerSha256: bundle.privacyLedger.ledgerSha256,
    qualityLedgerSha256: bundle.qualityLedger.ledgerSha256,
    lineageLedgerSha256: bundle.lineageLedger.ledgerSha256,
    preWitnessBundleSha256: bundle.preWitnessBundleSha256,
    toolAuthoritySnapshot: bundle.toolAuthoritySnapshot,
    artifacts,
    generationSha256: '',
  };
  const nextStatic = { ...staticBody, generationSha256: calibrationAdmissionStaticAuthorityGenerationSha256(staticBody) };
  const nextStaticPath = join(root, 'review', 'admission', 'authority', 'static-generations', nextStatic.generationSha256);
  await mkdir(nextStaticPath, { recursive: true });
  await writeFile(join(nextStaticPath, 'generation.json'), calibrationAdmissionCanonicalJson(nextStatic));
  for (const artifact of nextStatic.artifacts) {
    const bytes = artifact.relativePath === 'pre-witness-bundle.json'
      ? bundleBytes
      : await readFile(join(staticPath, artifact.relativePath));
    await writeFile(join(nextStaticPath, artifact.relativePath), bytes);
  }
  const currentBody = {
    ...current,
    staticGenerationSha256: nextStatic.generationSha256,
    staticGenerationRelativePath: `review/admission/authority/static-generations/${nextStatic.generationSha256}`,
    currentSha256: '',
  };
  const nextCurrent = { ...currentBody, currentSha256: calibrationAdmissionAuthorityCurrentSha256(currentBody) };
  await writeFile(currentPath, calibrationAdmissionCanonicalJson(nextCurrent));
}

/** Rewrite the exact record stream and re-publish its enclosing authority graph. */
export async function rewriteRuntimeRecord(
  root: string,
  mutate: (record: CalibrationAdmissionRecordV103) => CalibrationAdmissionRecordV103,
): Promise<void> {
  const currentPath = join(root, 'review', 'admission', 'authority', 'current.json');
  const current = JSON.parse(await readFile(currentPath, 'utf8')) as {
    readonly generation: number;
    readonly staticGenerationSha256: string;
    readonly staticGenerationRelativePath: string;
    readonly currentSha256: string;
    readonly version: 'v10.3-admission-authority-current-v1';
  };
  const staticPath = join(root, current.staticGenerationRelativePath);
  const staticGeneration = JSON.parse(await readFile(join(staticPath, 'generation.json'), 'utf8')) as CalibrationAdmissionStaticAuthorityGenerationV1;
  const existingBundle = JSON.parse(await readFile(join(staticPath, 'pre-witness-bundle.json'), 'utf8')) as CalibrationAdmissionPreWitnessBundleV1;
  const existingStream = await readFile(join(root, 'review', 'admission', 'admission-records.jsonl'), 'utf8');
  const records = existingStream.trimEnd().split('\n').filter((line) => line.length > 0).map((line) => JSON.parse(line) as CalibrationAdmissionRecordV103);
  const mutatedRecords = records.map(mutate);
  const streamBytes = Buffer.from(`${mutatedRecords.map((record) => calibrationAdmissionCanonicalJson(record)).join('\n')}\n`, 'utf8');
  const streamBody = {
    ...existingBundle.admissionRecordStream,
    recordsJsonlSha256: admissionRecordStreamContentSha256(streamBytes),
    recordCount: mutatedRecords.length,
    recordIdSetSha256: calibrationAdmissionSha256(mutatedRecords.map((record) => record.recordId).sort()),
    canonicalRecordHashesSha256: calibrationAdmissionSha256(mutatedRecords.map((record) => calibrationAdmissionSha256(record)).sort()),
    streamSha256: '',
  };
  const stream = { ...streamBody, streamSha256: admissionRecordStreamSha256(streamBody) };
  const bundleBody = { ...existingBundle, admissionRecordStream: stream, preWitnessBundleSha256: '' };
  const bundle = { ...bundleBody, preWitnessBundleSha256: calibrationAdmissionPreWitnessBundleSha256(bundleBody) } as CalibrationAdmissionPreWitnessBundleV1;
  const bundleBytes = Buffer.from(calibrationAdmissionCanonicalJson(bundle), 'utf8');
  const artifacts = staticGeneration.artifacts.map((artifact) => artifact.kind === 'bundle' && artifact.relativePath === 'pre-witness-bundle.json'
    ? { ...artifact, bytes: bundleBytes.byteLength, sha256: shaBytes(bundleBytes) }
    : artifact);
  const staticBody = {
    ...staticGeneration,
    preWitnessBundleSha256: bundle.preWitnessBundleSha256,
    toolAuthoritySnapshot: bundle.toolAuthoritySnapshot,
    artifacts,
    generationSha256: '',
  };
  const nextStatic = { ...staticBody, generationSha256: calibrationAdmissionStaticAuthorityGenerationSha256(staticBody) };
  const nextStaticPath = join(root, 'review', 'admission', 'authority', 'static-generations', nextStatic.generationSha256);
  await mkdir(nextStaticPath, { recursive: true });
  await writeFile(join(nextStaticPath, 'generation.json'), calibrationAdmissionCanonicalJson(nextStatic));
  for (const artifact of nextStatic.artifacts) {
    const bytes = artifact.relativePath === 'pre-witness-bundle.json'
      ? bundleBytes
      : await readFile(join(staticPath, artifact.relativePath));
    await writeFile(join(nextStaticPath, artifact.relativePath), bytes);
  }
  await writeFile(join(root, 'review', 'admission', 'admission-records.jsonl'), streamBytes);
  const currentBody = {
    ...current,
    staticGenerationSha256: nextStatic.generationSha256,
    staticGenerationRelativePath: `review/admission/authority/static-generations/${nextStatic.generationSha256}`,
    currentSha256: '',
  };
  const nextCurrent = { ...currentBody, currentSha256: calibrationAdmissionAuthorityCurrentSha256(currentBody) };
  await writeFile(currentPath, calibrationAdmissionCanonicalJson(nextCurrent));
}

/** Rewrite only the exact hash-named static generation metadata. */
export async function rewriteRuntimeStaticGeneration(
  root: string,
  mutate: (generation: CalibrationAdmissionStaticAuthorityGenerationV1) => CalibrationAdmissionStaticAuthorityGenerationV1,
): Promise<void> {
  const currentPath = join(root, 'review', 'admission', 'authority', 'current.json');
  const current = JSON.parse(await readFile(currentPath, 'utf8')) as {
    readonly generation: number;
    readonly staticGenerationSha256: string;
    readonly staticGenerationRelativePath: string;
    readonly currentSha256: string;
    readonly version: 'v10.3-admission-authority-current-v1';
  };
  const staticPath = join(root, current.staticGenerationRelativePath);
  const generation = JSON.parse(await readFile(join(staticPath, 'generation.json'), 'utf8')) as CalibrationAdmissionStaticAuthorityGenerationV1;
  const generationBody = { ...mutate(structuredClone(generation)), generationSha256: '' };
  const nextGeneration = { ...generationBody, generationSha256: calibrationAdmissionStaticAuthorityGenerationSha256(generationBody) };
  const nextStaticPath = join(root, 'review', 'admission', 'authority', 'static-generations', nextGeneration.generationSha256);
  await mkdir(nextStaticPath, { recursive: true });
  await writeFile(join(nextStaticPath, 'generation.json'), calibrationAdmissionCanonicalJson(nextGeneration));
  for (const artifact of nextGeneration.artifacts) {
    await writeFile(join(nextStaticPath, artifact.relativePath), await readFile(join(staticPath, artifact.relativePath)));
  }
  const currentBody = {
    ...current,
    staticGenerationSha256: nextGeneration.generationSha256,
    staticGenerationRelativePath: `review/admission/authority/static-generations/${nextGeneration.generationSha256}`,
    currentSha256: '',
  };
  const nextCurrent = { ...currentBody, currentSha256: calibrationAdmissionAuthorityCurrentSha256(currentBody) };
  await writeFile(currentPath, calibrationAdmissionCanonicalJson(nextCurrent));
}

/** Rewrite one source authority while preserving its external review bytes. */
export async function rewriteRuntimeSourceGeneration(
  root: string,
  sourceId: string,
  mutate: (generation: CalibrationAdmissionSourceGenerationV1) => CalibrationAdmissionSourceGenerationV1,
): Promise<void> {
  const admissionRoot = join(root, 'review', 'admission');
  const currentPath = join(admissionRoot, 'sources', sourceId, 'current.json');
  const current = JSON.parse(await readFile(currentPath, 'utf8')) as {
    readonly version: 'v10.3-admission-source-current-v1';
    readonly sourceId: string;
    readonly generationSha256: string;
    readonly generationRelativePath: string;
    readonly currentSha256: string;
  };
  const generationDirectory = join(admissionRoot, current.generationRelativePath);
  const generation = JSON.parse(await readFile(join(generationDirectory, 'source-generation.json'), 'utf8')) as CalibrationAdmissionSourceGenerationV1;
  const sourceReviewBytes = await readFile(join(generationDirectory, 'source-review.json'));
  const generationBody = { ...mutate(structuredClone(generation)), generationSha256: '' };
  const nextGeneration = { ...generationBody, generationSha256: calibrationAdmissionSourceGenerationSha256(generationBody) };
  const nextGenerationDirectory = join(admissionRoot, 'sources', sourceId, 'generations', nextGeneration.generationSha256);
  await mkdir(nextGenerationDirectory, { recursive: true });
  await writeFile(join(nextGenerationDirectory, 'source-generation.json'), calibrationAdmissionCanonicalJson(nextGeneration));
  await writeFile(join(nextGenerationDirectory, 'source-review.json'), sourceReviewBytes);
  const currentBody = {
    ...current,
    generationSha256: nextGeneration.generationSha256,
    generationRelativePath: `sources/${sourceId}/generations/${nextGeneration.generationSha256}`,
    currentSha256: '',
  };
  const nextCurrent = { ...currentBody, currentSha256: calibrationAdmissionSourceCurrentSha256(currentBody) };
  await writeFile(currentPath, calibrationAdmissionCanonicalJson(nextCurrent));
}

export async function cleanupRuntimeFixtures(): Promise<void> {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
}
