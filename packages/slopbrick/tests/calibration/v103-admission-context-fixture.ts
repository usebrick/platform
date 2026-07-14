import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  calibrationAdmissionAuthorityCurrentSha256,
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionEvidenceBundleSha256,
  calibrationAdmissionEvidenceIndexSha256,
  calibrationAdmissionEvidencePayloadSetSha256,
  calibrationAdmissionPolicySha256,
  calibrationAdmissionLineageLedgerSha256,
  calibrationAdmissionMaterializationId,
  calibrationAdmissionInvocationIntentId,
  calibrationAdmissionInvocationIntentSha256,
  calibrationAdmissionOverlapResourceReceiptId,
  calibrationAdmissionPreWitnessBundleSha256,
  calibrationAdmissionPrivacyLedgerSha256,
  calibrationAdmissionQualityLedgerSha256,
  calibrationAdmissionSha256,
  calibrationAdmissionSourceRegisterEntrySha256,
  calibrationAdmissionSourceCurrentSha256,
  calibrationAdmissionSourceGenerationArtifactSetSha256,
  calibrationAdmissionSourceGenerationProposalSha256,
  calibrationAdmissionSourceGenerationSha256,
  calibrationAdmissionSourceReviewSha256,
  calibrationAdmissionRecordId,
  calibrationAdmissionStaticAuthorityGenerationSha256,
  calibrationAdmissionToolReceiptId,
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

const roots: string[] = [];
const sha = (value: string): string => createHash('sha256').update(value).digest('hex');
const fixture = (name: string): string => join(process.cwd(), '..', 'core', 'tests', 'fixtures', 'schema', 'valid', name);

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
): Promise<void> {
  const admissionRoot = join(root, 'review', 'admission');
  const evidenceBundleSha256 = (evidenceBundle as { readonly bundleSha256: string }).bundleSha256;
  await Promise.all(reviews.map(async (value) => {
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
  }));
}

export async function runtimeFixture(): Promise<{ readonly root: string; readonly evidence: Awaited<ReturnType<typeof emptyEvidenceContext>>; readonly bundle: CalibrationAdmissionPreWitnessBundleV1; readonly recordId: string }> {
  const root = await mkdtemp(join(tmpdir(), 'slopbrick-runtime-context-'));
  roots.push(root);
  const rawBundle = JSON.parse(await readFile(fixture('calibration-admission-pre-witness-bundle.valid.json'), 'utf8')) as CalibrationAdmissionPreWitnessBundleV1;
  const overlapProfile = rawBundle.toolProfiles.find((profile) => profile.profileId === 'admission-static-ledgers-v1');
  if (!overlapProfile) throw new Error('rich fixture is missing the static-ledgers tool profile');
  const overlapIntentBody = {
    version: 'v10.3-admission-invocation-intent-v1' as const,
    profileId: overlapProfile.profileId,
    profileSha256: overlapProfile.profileSha256,
    action: 'authority:overlap' as const,
    canonicalArgvSha256: sha('overlap-argv'),
    inputSetSha256: sha('overlap-input'),
    executableBehaviorSha256: sha('overlap-executable'),
  };
  const overlapIntentWithId = { ...overlapIntentBody, intentId: calibrationAdmissionInvocationIntentId(overlapIntentBody) };
  const overlapIntent = { ...overlapIntentWithId, intentSha256: calibrationAdmissionInvocationIntentSha256(overlapIntentWithId) };
  const overlapReceiptBody = {
    version: 'v10.3-admission-tool-receipt-v1' as const,
    invocationIntentId: overlapIntent.intentId,
    profileId: overlapProfile.profileId,
    profileSha256: overlapProfile.profileSha256,
    action: overlapIntent.action,
    canonicalArgvSha256: overlapIntent.canonicalArgvSha256,
    inputSetSha256: overlapIntent.inputSetSha256,
    executableBehaviorSha256: overlapIntent.executableBehaviorSha256,
    observedResourceUsage: { maxHeapMiB: 64, wallSeconds: 1 },
    exitCode: 0,
    outputSetSha256: sha('overlap-output'),
  };
  const overlapReceipt = { ...overlapReceiptBody, receiptId: calibrationAdmissionToolReceiptId(overlapReceiptBody) };
  const invocationIntents = [...rawBundle.invocationIntents, overlapIntent].sort((left, right) => left.intentId.localeCompare(right.intentId));
  const toolReceipts = [...rawBundle.toolReceipts, overlapReceipt].sort((left, right) => left.receiptId.localeCompare(right.receiptId));
  const { snapshotSha256: _priorSnapshotSha256, ...toolAuthorityWithoutHash } = rawBundle.toolAuthoritySnapshot;
  const toolAuthorityBody = {
    ...toolAuthorityWithoutHash,
    invocationIntentIds: invocationIntents.map((intent) => intent.intentId).sort(),
    receiptIds: toolReceipts.map((receipt) => receipt.receiptId).sort(),
  };
  const toolAuthoritySnapshot = { ...toolAuthorityBody, snapshotSha256: calibrationAdmissionSha256(toolAuthorityBody) };
  const overlapResourceBody = {
    ...rawBundle.overlapResourceReceipt,
    toolReceiptSha256: calibrationAdmissionToolReceiptSha256(overlapReceipt),
    receiptId: '',
  };
  const overlapResourceReceipt = { ...overlapResourceBody, receiptId: calibrationAdmissionOverlapResourceReceiptId(overlapResourceBody) };
  const reviews = sourceReviews(rawBundle.sourceRegister as unknown as Record<string, unknown>);
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
  const bundleBody = {
    ...rawBundle,
    invocationIntents,
    toolReceipts,
    toolAuthoritySnapshot,
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
  const bundleBytes = Buffer.from(calibrationAdmissionCanonicalJson(bundle));
  const privacyBytes = Buffer.from(calibrationAdmissionCanonicalJson(privacyLedger));
  const qualityBytes = Buffer.from(calibrationAdmissionCanonicalJson(qualityLedger));
  const lineageBytes = Buffer.from(calibrationAdmissionCanonicalJson(lineageLedger));
  const artifacts = [
    { pathBase: 'generation_local' as const, relativePath: 'lineage-ledger.json', kind: 'ledger' as const, bytes: lineageBytes.byteLength, sha256: lineageLedger.ledgerSha256 },
    { pathBase: 'generation_local' as const, relativePath: 'pre-witness-bundle.json', kind: 'bundle' as const, bytes: bundleBytes.byteLength, sha256: bundle.preWitnessBundleSha256 },
    { pathBase: 'generation_local' as const, relativePath: 'privacy-ledger.json', kind: 'ledger' as const, bytes: privacyBytes.byteLength, sha256: privacyLedger.ledgerSha256 },
    { pathBase: 'generation_local' as const, relativePath: 'quality-ledger.json', kind: 'ledger' as const, bytes: qualityBytes.byteLength, sha256: qualityLedger.ledgerSha256 },
  ].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const staticBody = {
    version: 'v10.3-admission-static-authority-generation-v1' as const,
    generation: 0,
    inputGenerationSha256: sha('input-generation'),
    overlapGenerationSha256: sha('overlap-generation'),
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
  const evidence = await emptyEvidenceContext();
  await materializeSourceReviewAuthorities(root, reviews, evidence.bundle);
  return { root, evidence, bundle, recordId };
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
    ? { ...artifact, bytes: bundleBytes.byteLength, sha256: bundle.preWitnessBundleSha256 }
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
  await writeFile(join(nextStaticPath, 'pre-witness-bundle.json'), bundleBytes);
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
    ? { ...artifact, bytes: bundleBytes.byteLength, sha256: bundle.preWitnessBundleSha256 }
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
  await writeFile(join(nextStaticPath, 'pre-witness-bundle.json'), bundleBytes);
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
  const bundleBytes = await readFile(join(staticPath, 'pre-witness-bundle.json'));
  const generationBody = { ...mutate(structuredClone(generation)), generationSha256: '' };
  const nextGeneration = { ...generationBody, generationSha256: calibrationAdmissionStaticAuthorityGenerationSha256(generationBody) };
  const nextStaticPath = join(root, 'review', 'admission', 'authority', 'static-generations', nextGeneration.generationSha256);
  await mkdir(nextStaticPath, { recursive: true });
  await writeFile(join(nextStaticPath, 'generation.json'), calibrationAdmissionCanonicalJson(nextGeneration));
  await writeFile(join(nextStaticPath, 'pre-witness-bundle.json'), bundleBytes);
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
