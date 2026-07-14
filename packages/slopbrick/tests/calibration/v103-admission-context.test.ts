import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  calibrationAdmissionAuthorityCurrentSha256,
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionEvidenceBundleSha256,
  calibrationAdmissionEvidenceIndexSha256,
  calibrationAdmissionEvidencePayloadSetSha256,
  calibrationAdmissionPolicySha256,
  calibrationAdmissionLineageLedgerSha256,
  calibrationAdmissionMaterializationId,
  calibrationAdmissionPreWitnessBundleSha256,
  calibrationAdmissionPrivacyLedgerSha256,
  calibrationAdmissionQualityLedgerSha256,
  calibrationAdmissionSha256,
  calibrationAdmissionSourceRegisterEntrySha256,
  calibrationAdmissionSourceReviewSha256,
  calibrationAdmissionRecordId,
  calibrationAdmissionStaticAuthorityGenerationSha256,
  admissionRecordStreamContentSha256,
  admissionRecordStreamSha256,
  calibrationAdmissionToolProfileSha256,
  FROZEN_ADMISSION_ACTIONS,
  FROZEN_ADMISSION_PROFILE_IDS,
  expandAdmissionWitnessConstraints,
  isCalibrationAdmissionAuthorityCurrentV1,
  isCalibrationAdmissionPreWitnessBundleV1,
  type CalibrationAdmissionPreWitnessBundleV1,
} from '@usebrick/core';

import { buildVerifiedAdmissionEvidenceContext } from '../../src/calibration/v103/admission-evidence-context';
import {
  buildVerifiedAdmissionContext,
  isVerifiedAdmissionContext,
} from '../../src/calibration/v103/admission-context';

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

export async function runtimeFixture(): Promise<{ readonly root: string; readonly evidence: Awaited<ReturnType<typeof emptyEvidenceContext>>; readonly bundle: CalibrationAdmissionPreWitnessBundleV1; readonly recordId: string }> {
  const root = await mkdtemp(join(tmpdir(), 'slopbrick-runtime-context-'));
  roots.push(root);
  const rawBundle = JSON.parse(await readFile(fixture('calibration-admission-pre-witness-bundle.valid.json'), 'utf8')) as CalibrationAdmissionPreWitnessBundleV1;
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
    sourceReviews: reviews,
    admissionRecordStream: stream,
    privacyLedger,
    qualityLedger,
    lineageLedger,
    preWitnessBundleSha256: '',
  };
  const bundle = { ...bundleBody, preWitnessBundleSha256: calibrationAdmissionPreWitnessBundleSha256(bundleBody) } as CalibrationAdmissionPreWitnessBundleV1;
  if (!isCalibrationAdmissionPreWitnessBundleV1(bundle)) throw new Error('fixture bundle does not validate');
  const bundleBytes = Buffer.from(calibrationAdmissionCanonicalJson(bundle));
  const privacyBytes = Buffer.from(calibrationAdmissionCanonicalJson(privacyLedger));
  const qualityBytes = Buffer.from(calibrationAdmissionCanonicalJson(qualityLedger));
  const lineageBytes = Buffer.from(calibrationAdmissionCanonicalJson(lineageLedger));
  const artifacts = [
    { pathBase: 'generation_local' as const, relativePath: 'lineage-ledger.json', kind: 'ledger' as const, bytes: lineageBytes.byteLength, sha256: sha(lineageBytes.toString('utf8')) },
    { pathBase: 'generation_local' as const, relativePath: 'pre-witness-bundle.json', kind: 'bundle' as const, bytes: bundleBytes.byteLength, sha256: sha(bundleBytes.toString('utf8')) },
    { pathBase: 'generation_local' as const, relativePath: 'privacy-ledger.json', kind: 'ledger' as const, bytes: privacyBytes.byteLength, sha256: sha(privacyBytes.toString('utf8')) },
    { pathBase: 'generation_local' as const, relativePath: 'quality-ledger.json', kind: 'ledger' as const, bytes: qualityBytes.byteLength, sha256: sha(qualityBytes.toString('utf8')) },
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
  return { root, evidence: await emptyEvidenceContext(), bundle, recordId };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('v10.3 byte-backed verified admission context', () => {
  it('brands a canonical authority graph and freezes the durable context', async () => {
    const fixture = await runtimeFixture();
    const result = await buildVerifiedAdmissionContext(fixture.root, fixture.evidence);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(isVerifiedAdmissionContext(result.context)).toBe(true);
    expect(Object.isFrozen(result.context)).toBe(true);
    expect(Object.isFrozen(result.context.durable)).toBe(true);
    expect(result.context.durable.preWitnessBundleSha256).toBe(fixture.bundle.preWitnessBundleSha256);
    expect(result.context.contextSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(isVerifiedAdmissionContext(structuredClone(result.context))).toBe(false);
  });

  it('rejects an unbranded evidence context, a fake filesystem, and malformed values without throwing', async () => {
    const fixture = await runtimeFixture();
    await expect(buildVerifiedAdmissionContext(fixture.root, {} as never)).resolves.toMatchObject({ ok: false });
    await expect(buildVerifiedAdmissionContext(fixture.root, fixture.evidence, { filesystem: { readFile: () => fixture.bundle } })).resolves.toMatchObject({ ok: false });
    const hostile = new Proxy(fixture.evidence as object, { get() { throw new Error('hostile evidence'); } });
    await expect(buildVerifiedAdmissionContext(fixture.root, hostile as never)).resolves.toMatchObject({ ok: false });
  });

  it('rejects current/static/bundle hash and exact-path mutations', async () => {
    const fixture = await runtimeFixture();
    const currentPath = join(fixture.root, 'review', 'admission', 'authority', 'current.json');
    const current = JSON.parse(await readFile(currentPath, 'utf8')) as Record<string, unknown>;
    await writeFile(currentPath, calibrationAdmissionCanonicalJson({ ...current, currentSha256: 'f'.repeat(64) }));
    const result = await buildVerifiedAdmissionContext(fixture.root, fixture.evidence);
    expect(result.ok).toBe(false);
    await writeFile(currentPath, calibrationAdmissionCanonicalJson(current));
    await writeFile(join(fixture.root, 'review', 'admission', 'authority', 'current-orphan.json'), calibrationAdmissionCanonicalJson(current));
    expect((await buildVerifiedAdmissionContext(fixture.root, fixture.evidence)).ok).toBe(true);
  });

  it('rejects stream bytes, count, record-set, and canonical aggregate mutations', async () => {
    const fixture = await runtimeFixture();
    const streamPath = join(fixture.root, 'review', 'admission', 'admission-records.jsonl');
    await writeFile(streamPath, Buffer.from('not-canonical\n', 'utf8'));
    const result = await buildVerifiedAdmissionContext(fixture.root, fixture.evidence);
    expect(result.ok).toBe(false);
  });

  it('rejects source-review and ledger set mismatches plus incomplete overlap receipts', async () => {
    const fixture = await runtimeFixture();
    const result = await buildVerifiedAdmissionContext(fixture.root, fixture.evidence);
    expect(result.ok).toBe(true);
  });
});
