import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  FROZEN_ADMISSION_ACTIONS,
  FROZEN_ADMISSION_PROFILE_IDS,
  calibrationAdmissionEvidenceBundleSha256,
  calibrationAdmissionEvidenceId,
  calibrationAdmissionEvidenceIndexSha256,
  calibrationAdmissionEvidencePayloadId,
  calibrationAdmissionEvidencePayloadSetSha256,
  calibrationAdmissionEvidenceReceiptId,
  calibrationAdmissionEvidenceSourceLocatorSha256,
  calibrationAdmissionInvocationIntentId,
  calibrationAdmissionInvocationIntentSha256,
  calibrationAdmissionMaterializationReceiptId,
  calibrationAdmissionPolicySha256,
  calibrationAdmissionSha256,
  calibrationAdmissionToolProfileSha256,
  calibrationAdmissionToolReceiptId,
  calibrationAdmissionToolReceiptSha256,
  calibrationEvidenceAcquisitionEnvelopeId,
  calibrationEvidenceAcquisitionReceiptId,
  calibrationAdmissionCanonicalJson,
  expandAdmissionWitnessConstraints,
  type CalibrationAdmissionEvidenceBundleV1,
  type CalibrationAdmissionEvidencePayloadV1,
  type CalibrationAdmissionPolicyV1,
  type AdmissionWitnessPolicyV1,
} from '@usebrick/core';

import { admissionEvidenceCasRelativePath, putAdmissionEvidenceCas } from '../../src/calibration/v103/admission-evidence-cas';
import { buildVerifiedAdmissionEvidenceContext } from '../../src/calibration/v103/admission-evidence-context';

const roots: string[] = [];
const digest = (value: string): string => createHash('sha256').update(value).digest('hex');
const repeated = (value: string): string => value.repeat(64);

function makeProfiles() {
  const readOnly = new Set([
    'admission-context-v1',
    'admission-static-ledgers-v1',
    'admission-census-v1',
    'admission-manifest-v1',
    'admission-source-node-v1',
    'admission-source-parquet-v1',
    'admission-git-acquire-v1',
    'admission-release-acquire-v1',
    'admission-evidence-acquire-v1',
  ]);
  const network = (profileId: string) => profileId === 'admission-git-acquire-v1'
    ? { mode: 'exact_authorized_https' as const, transport: 'git' as const }
    : profileId === 'admission-release-acquire-v1'
      ? { mode: 'exact_authorized_https' as const, transport: 'release_asset' as const }
      : profileId === 'admission-evidence-acquire-v1'
        ? { mode: 'exact_authorized_https' as const, transport: 'evidence' as const }
        : { mode: 'deny' as const };
  return FROZEN_ADMISSION_PROFILE_IDS.map((profileId) => {
    const withoutHash = {
      version: 'v10.3-admission-tool-profile-v1' as const,
      profileId,
      allowedExecutableIds: ['corepack-pnpm', 'node'],
      allowedActions: [...FROZEN_ADMISSION_ACTIONS[profileId]],
      candidateByteAccess: readOnly.has(profileId) ? 'read_only' as const : 'none' as const,
      network: network(profileId),
      resourceLimits: { maxHeapMiB: 2048, maxWallSeconds: 3600 },
    };
    return { ...withoutHash, profileSha256: calibrationAdmissionToolProfileSha256(withoutHash) };
  });
}

function makePolicy(profiles: ReturnType<typeof makeProfiles>): CalibrationAdmissionPolicyV1 {
  const withoutHash = {
    version: 'v10.3-admission-policy-v1' as const,
    policyId: 'v10.3-admission-v1' as const,
    initialRegisterEntryCount: 329 as const,
    selectedCoverage: 452382 as const,
    baselineMaterialUnits: 58089 as const,
    repositoryMaterialUnits: 394293 as const,
    labels: { positive: 'verified_ai' as const, negative: 'verified_human' as const },
    evidenceCasPolicy: 'sha256-wx-fsync-v1' as const,
    overlapPolicy: 'prefix-filter-exact-jaccard-0.80-v1' as const,
    reasonVocabularySha256: repeated('a'),
    toolProfileSha256s: profiles.map((profile) => profile.profileSha256).sort(),
    smoke: {
      unitsPerPolarity: 100 as const,
      maxSourceOrFamilyUnitsPerPolarity: 50 as const,
      minimumSourcesPerPolarity: 2 as const,
      minimumFamiliesPerPolarity: 3 as const,
      minimumLanguages: 2 as const,
      minimumUnitsPerRepresentedLanguagePerPolarity: 20 as const,
    },
    canary: {
      unitsPerPolarity: 5000 as const,
      maxSourceUnitsPerPolarity: 500 as const,
      maxFamilyUnitsPerPolarity: 1000 as const,
      minimumSourcesPerPolarity: 10 as const,
      minimumFamiliesPerPolarity: 5 as const,
      minimumLanguages: 3 as const,
      minimumUnitsPerLanguagePerPolarity: 250 as const,
      minimumFamiliesPerLanguagePerPolarity: 3 as const,
      minimumAiGeneratorFamilies: 3 as const,
    },
  };
  return { ...withoutHash, policySha256: calibrationAdmissionPolicySha256(withoutHash) };
}

function makeWitness(policy: CalibrationAdmissionPolicyV1, gate: 'smoke' | 'canary'): AdmissionWitnessPolicyV1 {
  const withoutHash = {
    version: 'v10.3-admission-witness-policy-v1' as const,
    policyId: policy.policyId,
    gate,
    algorithm: 'lexicographic-bnb-feasibility-v1' as const,
    seed: 'slopbrick-v10.3-admission-review-v1' as const,
    maxSearchNodes: (gate === 'smoke' ? 10000000 : 50000000) as 10000000 | 50000000,
    constraints: expandAdmissionWitnessConstraints(policy, gate),
    constraintsSha256: '',
  };
  const withConstraintsHash = { ...withoutHash, constraintsSha256: calibrationAdmissionSha256(withoutHash.constraints) };
  return { ...withConstraintsHash, witnessPolicySha256: calibrationAdmissionPolicySha256(withConstraintsHash) };
}

function makeToolArtifacts(
  profiles: ReturnType<typeof makeProfiles>,
  profileId: 'admission-context-v1' | 'admission-evidence-acquire-v1',
  action: 'evidence:verify' | 'evidence:acquire',
) {
  const profile = profiles.find((candidate) => candidate.profileId === profileId)!;
  const intentWithoutHashes = {
    version: 'v10.3-admission-invocation-intent-v1' as const,
    intentId: '',
    profileId,
    profileSha256: profile.profileSha256,
    action,
    canonicalArgvSha256: repeated(action === 'evidence:verify' ? '1' : '2'),
    inputSetSha256: repeated(action === 'evidence:verify' ? '3' : '4'),
    executableBehaviorSha256: repeated(action === 'evidence:verify' ? '5' : '6'),
    ...(profileId === 'admission-evidence-acquire-v1' ? { networkAuthorizationSha256: repeated('9') } : {}),
    intentSha256: '',
  };
  const intentWithId = { ...intentWithoutHashes, intentId: calibrationAdmissionInvocationIntentId(intentWithoutHashes) };
  const intent = { ...intentWithId, intentSha256: calibrationAdmissionInvocationIntentSha256(intentWithId) };
  const receiptWithoutId = {
    version: 'v10.3-admission-tool-receipt-v1' as const,
    receiptId: '',
    invocationIntentId: intent.intentId,
    profileId,
    profileSha256: profile.profileSha256,
    action,
    canonicalArgvSha256: intent.canonicalArgvSha256,
    inputSetSha256: intent.inputSetSha256,
    executableBehaviorSha256: intent.executableBehaviorSha256,
    ...(intent.networkAuthorizationSha256 !== undefined ? { networkAuthorizationSha256: intent.networkAuthorizationSha256 } : {}),
    observedResourceUsage: { wallSeconds: 1 },
    exitCode: 0 as const,
    outputSetSha256: repeated(action === 'evidence:verify' ? '7' : '8'),
  };
  const receipt = { ...receiptWithoutId, receiptId: calibrationAdmissionToolReceiptId(receiptWithoutId) };
  return { profile, intent, receipt, receiptSha256: calibrationAdmissionToolReceiptSha256(receipt) };
}

function makeEvidenceParts(storage: CalibrationAdmissionEvidencePayloadV1['storage'], bytes: Buffer) {
  const locator = storage.kind === 'materialization_reference'
    ? { kind: 'materialized_file' as const, materializationId: storage.materializationId, normalizedPath: storage.normalizedPath }
    : { kind: 'immutable_https' as const, url: 'https://example.test/evidence.txt', immutability: 'content_addressed_release_asset' as const };
  const itemWithoutId = {
    kind: 'authorship_attestation' as const,
    locator,
    bytes: bytes.byteLength,
    mediaType: 'text/plain',
    sha256: digest(bytes.toString('utf8')),
    claimScopes: ['fixture'],
  };
  const evidenceId = calibrationAdmissionEvidenceId(itemWithoutId);
  const item = { ...itemWithoutId, evidenceId };
  const payloadWithoutId = {
    version: 'v10.3-admission-evidence-payload-v1' as const,
    payloadId: '',
    evidenceId,
    bytes: bytes.byteLength,
    sha256: item.sha256,
    mediaType: item.mediaType,
    sourceLocatorSha256: calibrationAdmissionEvidenceSourceLocatorSha256(locator),
    storage,
  };
  const payload = { ...payloadWithoutId, payloadId: calibrationAdmissionEvidencePayloadId(payloadWithoutId) };
  const indexWithoutHash = { version: 'v10.3-admission-evidence-index-v1' as const, items: [item], indexSha256: '' };
  const evidenceIndex = { ...indexWithoutHash, indexSha256: calibrationAdmissionEvidenceIndexSha256(indexWithoutHash) };
  const payloadSetWithoutHash = { version: 'v10.3-admission-evidence-payload-set-v1' as const, casPolicy: 'sha256-wx-fsync-v1' as const, payloads: [payload], payloadSetSha256: '' };
  const evidencePayloadSet = { ...payloadSetWithoutHash, payloadSetSha256: calibrationAdmissionEvidencePayloadSetSha256(payloadSetWithoutHash) };
  return { evidenceId, payload, evidenceIndex, evidencePayloadSet };
}

function makeAuthorization(evidenceId: string, bytes: Buffer, url = 'https://example.test/evidence.txt') {
  const idWithout = {
    version: 'v10.3-approved-evidence-acquisition-v1' as const,
    approvedBy: 'fixture-reviewer',
    approvedAt: '2026-07-13T00:00:00.000Z',
    evidenceId,
    url,
    approvedRedirectUrls: [] as string[],
    expectedBytes: bytes.byteLength,
    expectedSha256: digest(bytes.toString('utf8')),
    expectedMediaType: 'application/octet-stream',
    maxTransferBytes: 1024,
  };
  const authorizationId = calibrationAdmissionSha256(idWithout);
  const withId = { ...idWithout, authorizationId };
  return { ...withId, authorizationSha256: calibrationAdmissionSha256(withId) };
}

function makeEvidenceReceipt(
  payload: ReturnType<typeof makeEvidenceParts>['payload'],
  evidenceIndex: ReturnType<typeof makeEvidenceParts>['evidenceIndex'],
  evidencePayloadSet: ReturnType<typeof makeEvidenceParts>['evidencePayloadSet'],
  toolReceiptSha256: string,
) {
  const withoutId = {
    version: 'v10.3-admission-evidence-receipt-v1' as const,
    receiptId: '',
    evidenceId: payload.evidenceId,
    evidenceIndexSha256: evidenceIndex.indexSha256,
    payloadId: payload.payloadId,
    payloadSetSha256: evidencePayloadSet.payloadSetSha256,
    verificationMethod: payload.storage.kind === 'evidence_cas' ? 'offline-evidence-cas-v1' as const : 'offline-materialization-file-v1' as const,
    observedBytes: payload.bytes,
    observedSha256: payload.sha256,
    toolReceiptSha256,
    status: 'verified' as const,
  };
  return { ...withoutId, receiptId: calibrationAdmissionEvidenceReceiptId(withoutId) };
}

function makeMaterializationReceipt(materializationId: string) {
  const withoutId = {
    version: 'v10.3-admission-materialization-receipt-v1' as const,
    receiptId: '',
    materializationId,
    sourceId: 'source-fixture',
    repositoryId: 'repo-fixture',
    acquisitionAuthorizationId: 'materialization-auth',
    acquisitionAuthorizationSha256: repeated('9'),
    acquisitionTransactionId: 'materialization-txn',
    primaryMaterializedOutputSha256: repeated('a'),
    childToolReceiptSha256: repeated('b'),
    verifiedUnitSetSha256: repeated('c'),
    payload: {
      kind: 'git' as const,
      originUrl: 'https://example.test/repo.git',
      commitSha: 'a'.repeat(40),
      treeSha: 'b'.repeat(40),
      inventorySha256: repeated('d'),
    },
  };
  return { ...withoutId, receiptId: calibrationAdmissionMaterializationReceiptId(withoutId) };
}

function makeBundle(input: {
  profiles: ReturnType<typeof makeProfiles>;
  payload: ReturnType<typeof makeEvidenceParts>['payload'];
  evidenceIndex: ReturnType<typeof makeEvidenceParts>['evidenceIndex'];
  evidencePayloadSet: ReturnType<typeof makeEvidenceParts>['evidencePayloadSet'];
  intents: ReturnType<typeof makeToolArtifacts>['intent'][];
  toolReceipts: ReturnType<typeof makeToolArtifacts>['receipt'][];
  approvedEvidenceAcquisitions?: readonly unknown[];
  evidenceAcquisitionReceipts?: readonly unknown[];
  evidenceAcquisitionEnvelopes?: readonly unknown[];
  materializationReceipts?: readonly unknown[];
  evidenceReceipts: readonly unknown[];
  acquisitionAuthoritySnapshot?: Readonly<{ readonly indexGenerationSha256: string; readonly artifactKeys: readonly string[]; }>;
}): CalibrationAdmissionEvidenceBundleV1 {
  const policy = makePolicy(input.profiles);
  const authorityWithoutHash = {
    version: 'v10.3-admission-tool-authority-snapshot-v1' as const,
    indexGenerationSha256: repeated('e'),
    profileIds: input.profiles.map((profile) => profile.profileId).sort(),
    invocationIntentIds: input.intents.map((intent) => intent.intentId).sort(),
    receiptIds: input.toolReceipts.map((receipt) => receipt.receiptId).sort(),
  };
  const toolAuthoritySnapshot = { ...authorityWithoutHash, snapshotSha256: calibrationAdmissionSha256(authorityWithoutHash) };
  const acquisitionAuthorityWithoutHash = {
    version: 'v10.3-admission-acquisition-snapshot-v1' as const,
    indexGenerationSha256: input.acquisitionAuthoritySnapshot?.indexGenerationSha256 ?? repeated('f'),
    artifactKeys: [...(input.acquisitionAuthoritySnapshot?.artifactKeys ?? [])],
  };
  const acquisitionAuthoritySnapshot = { ...acquisitionAuthorityWithoutHash, snapshotSha256: calibrationAdmissionSha256(acquisitionAuthorityWithoutHash) };
  const withoutHash = {
    version: 'v10.3-admission-evidence-bundle-v1' as const,
    policy,
    witnessPolicies: [makeWitness(policy, 'canary'), makeWitness(policy, 'smoke')] as [AdmissionWitnessPolicyV1, AdmissionWitnessPolicyV1],
    toolProfiles: input.profiles,
    invocationIntents: input.intents,
    toolReceipts: input.toolReceipts,
    toolAuthoritySnapshot,
    evidenceIndex: input.evidenceIndex,
    evidencePayloadSet: input.evidencePayloadSet,
    approvedEvidenceAcquisitions: input.approvedEvidenceAcquisitions ?? [],
    evidenceAcquisitionReceipts: input.evidenceAcquisitionReceipts ?? [],
    evidenceAcquisitionEnvelopes: input.evidenceAcquisitionEnvelopes ?? [],
    acquisitionAuthoritySnapshot,
    evidenceReceipts: input.evidenceReceipts,
    materializationReceipts: input.materializationReceipts ?? [],
    bundleSha256: '',
  };
  const finalBundle = { ...withoutHash, bundleSha256: calibrationAdmissionEvidenceBundleSha256(withoutHash) } as CalibrationAdmissionEvidenceBundleV1;
  return finalBundle;
}

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'slopbrick-context-hardening-'));
  roots.push(root);
  return root;
}

function acquisitionIndex(
  generation: number,
  parentIndexSha256: string | undefined,
  artifacts: readonly { readonly kind: string; readonly objectId: string; readonly relativePath: string; readonly sha256: string }[],
) {
  const withoutHash = {
    version: 'v10.3-admission-acquisition-index-v1' as const,
    generation,
    ...(parentIndexSha256 === undefined ? {} : { parentIndexSha256 }),
    artifacts: [...artifacts].sort((left, right) => {
      const a = `${left.kind}\u0000${left.objectId}\u0000${left.relativePath}\u0000${left.sha256}`;
      const b = `${right.kind}\u0000${right.objectId}\u0000${right.relativePath}\u0000${right.sha256}`;
      return a < b ? -1 : a > b ? 1 : 0;
    }),
  };
  return { ...withoutHash, indexSha256: calibrationAdmissionSha256(withoutHash) };
}

async function materializeToolAuthority(root: string, bundle: CalibrationAdmissionEvidenceBundleV1): Promise<CalibrationAdmissionEvidenceBundleV1> {
  const authorityRoot = join(root, 'tool-authority');
  const profileRefs = bundle.toolProfiles.map((profile) => {
    const relativePath = `profiles/${profile.profileId}.json`;
    const bytes = Buffer.from(calibrationAdmissionCanonicalJson(profile));
    return { profileId: profile.profileId, relativePath, sha256: digest(bytes.toString('utf8')), bytes };
  });
  const intentRefs = bundle.invocationIntents.map((intent) => {
    const relativePath = `invocation-intents/${intent.intentId}.json`;
    const bytes = Buffer.from(calibrationAdmissionCanonicalJson(intent));
    return { intentId: intent.intentId, relativePath, sha256: digest(bytes.toString('utf8')), bytes };
  });
  const receiptRefs = bundle.toolReceipts.map((receipt) => {
    const relativePath = `receipts/${receipt.receiptId}.json`;
    const bytes = Buffer.from(calibrationAdmissionCanonicalJson(receipt));
    return { receiptId: receipt.receiptId, relativePath, sha256: digest(bytes.toString('utf8')), bytes };
  });
  profileRefs.sort((left, right) => left.profileId.localeCompare(right.profileId));
  intentRefs.sort((left, right) => left.intentId.localeCompare(right.intentId));
  receiptRefs.sort((left, right) => left.receiptId.localeCompare(right.receiptId));
  const generationZeroWithoutHash = {
    version: 'v10.3-admission-tool-authority-index-v1' as const,
    generation: 0,
    profiles: profileRefs.map(({ profileId, relativePath, sha256 }) => ({ profileId, relativePath, sha256 })),
    invocationIntents: [] as readonly unknown[],
    receipts: [] as readonly unknown[],
  };
  const generationZero = { ...generationZeroWithoutHash, indexSha256: calibrationAdmissionSha256(generationZeroWithoutHash) };
  const generationOneWithoutHash = {
    version: 'v10.3-admission-tool-authority-index-v1' as const,
    generation: 1,
    parentIndexSha256: generationZero.indexSha256,
    profiles: profileRefs.map(({ profileId, relativePath, sha256 }) => ({ profileId, relativePath, sha256 })),
    invocationIntents: intentRefs.map(({ intentId, relativePath, sha256 }) => ({ intentId, relativePath, sha256 })),
    receipts: receiptRefs.map(({ receiptId, relativePath, sha256 }) => ({ receiptId, relativePath, sha256 })),
  };
  const generationOne = { ...generationOneWithoutHash, indexSha256: calibrationAdmissionSha256(generationOneWithoutHash) };
  for (const reference of [...profileRefs, ...intentRefs, ...receiptRefs]) {
    const relativePath = 'profileId' in reference ? reference.relativePath : reference.relativePath;
    await mkdir(join(authorityRoot, relativePath, '..'), { recursive: true });
    await writeFile(join(authorityRoot, relativePath), reference.bytes);
  }
  await mkdir(join(authorityRoot, 'index-generations'), { recursive: true });
  await writeFile(join(authorityRoot, 'index-generations', `${generationZero.indexSha256}.json`), calibrationAdmissionCanonicalJson(generationZero));
  await writeFile(join(authorityRoot, 'index-generations', `${generationOne.indexSha256}.json`), calibrationAdmissionCanonicalJson(generationOne));
  await writeFile(join(authorityRoot, 'index.json'), calibrationAdmissionCanonicalJson(generationOne));
  const snapshotWithoutHash = {
    version: 'v10.3-admission-tool-authority-snapshot-v1' as const,
    indexGenerationSha256: generationOne.indexSha256,
    profileIds: bundle.toolProfiles.map((profile) => profile.profileId).sort(),
    invocationIntentIds: bundle.invocationIntents.map((intent) => intent.intentId).sort(),
    receiptIds: bundle.toolReceipts.map((receipt) => receipt.receiptId).sort(),
  };
  const toolAuthoritySnapshot = { ...snapshotWithoutHash, snapshotSha256: calibrationAdmissionSha256(snapshotWithoutHash) };
  const withoutBundleHash = { ...bundle, toolAuthoritySnapshot, bundleSha256: '' };
  return { ...withoutBundleHash, bundleSha256: calibrationAdmissionEvidenceBundleSha256(withoutBundleHash) } as CalibrationAdmissionEvidenceBundleV1;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('v10.3 verified-context acquisition and materialization hardening', () => {
  it('rejects a CAS payload when its acquisition envelope is absent', async () => {
    const root = await fixtureRoot();
    const profiles = makeProfiles();
    const verify = makeToolArtifacts(profiles, 'admission-context-v1', 'evidence:verify');
    const bytes = Buffer.from('cas-envelope-required', 'utf8');
    const parts = makeEvidenceParts({ kind: 'evidence_cas', casAlgorithm: 'sha256', casRelativePath: admissionEvidenceCasRelativePath(digest(bytes.toString('utf8'))), authorizationId: 'auth-placeholder' }, bytes);
    const authorization = makeAuthorization(parts.evidenceId, bytes);
    const payload = { ...parts.payload, storage: { ...parts.payload.storage, authorizationId: authorization.authorizationId } };
    const rebuiltParts = makeEvidenceParts(payload.storage, bytes);
    const evidenceReceipt = makeEvidenceReceipt(rebuiltParts.payload, rebuiltParts.evidenceIndex, rebuiltParts.evidencePayloadSet, verify.receiptSha256);
    const bundle = makeBundle({
      profiles,
      payload: rebuiltParts.payload,
      evidenceIndex: rebuiltParts.evidenceIndex,
      evidencePayloadSet: rebuiltParts.evidencePayloadSet,
      intents: [verify.intent],
      toolReceipts: [verify.receipt],
      approvedEvidenceAcquisitions: [authorization],
      evidenceReceipts: [evidenceReceipt],
    });
    await writeFile(join(root, 'evidence-bundle.json'), calibrationAdmissionCanonicalJson(bundle));

    const result = await buildVerifiedAdmissionEvidenceContext(root);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toMatch(/acquisition receipt|envelope/i);
  });

  it('rejects an otherwise valid-looking CAS bundle when the primary completion is substituted', async () => {
    const root = await fixtureRoot();
    const profiles = makeProfiles();
    const verify = makeToolArtifacts(profiles, 'admission-context-v1', 'evidence:verify');
    const acquire = makeToolArtifacts(profiles, 'admission-evidence-acquire-v1', 'evidence:acquire');
    const bytes = Buffer.from('cas-primary-join', 'utf8');
    const sha256 = digest(bytes.toString('utf8'));
    const authorizationPlaceholder = makeAuthorization('evidence-placeholder', bytes);
    const partsPlaceholder = makeEvidenceParts({ kind: 'evidence_cas', casAlgorithm: 'sha256', casRelativePath: admissionEvidenceCasRelativePath(sha256), authorizationId: authorizationPlaceholder.authorizationId }, bytes);
    const authorization = makeAuthorization(partsPlaceholder.evidenceId, bytes, `https://offline.invalid/evidence-cas/${sha256}`);
    const parts = makeEvidenceParts({ kind: 'evidence_cas', casAlgorithm: 'sha256', casRelativePath: admissionEvidenceCasRelativePath(sha256), authorizationId: authorization.authorizationId }, bytes);
    const cas = await putAdmissionEvidenceCas({
      root,
      bytes,
      authorizationId: authorization.authorizationId,
      evidenceId: parts.evidenceId,
      invocationIntentId: acquire.intent.intentId,
      recoveryNonce: repeated('1'),
    });
    const reservation = JSON.parse(await readFile(join(root, 'evidence-cas', 'reservations', `${authorization.authorizationId}.json`), 'utf8')) as Record<string, unknown>;
    const acquisitionReceiptWithoutId = {
      version: 'v10.3-evidence-acquisition-receipt-v1' as const,
      receiptId: '',
      authorizationId: authorization.authorizationId,
      authorizationSha256: authorization.authorizationSha256,
      evidenceId: parts.evidenceId,
      observedBytes: bytes.byteLength,
      observedSha256: sha256,
      observedMediaType: 'application/octet-stream',
      redirectChain: [] as string[],
      resolvedPublicAddressesSha256: calibrationAdmissionSha256(['offline']),
      casTransactionId: cas.transactionId,
      primaryCompletionSha256: cas.primaryCompletionSha256,
      toolReceiptSha256: acquire.receiptSha256,
      receiptSha256: '',
    };
    const acquisitionReceiptId = calibrationEvidenceAcquisitionReceiptId(acquisitionReceiptWithoutId);
    const acquisitionReceiptWithId = { ...acquisitionReceiptWithoutId, receiptId: acquisitionReceiptId };
    const { receiptSha256: _receiptSha256, ...acquisitionReceiptHashInput } = acquisitionReceiptWithId;
    const acquisitionReceipt = { ...acquisitionReceiptWithId, receiptSha256: calibrationAdmissionSha256(acquisitionReceiptHashInput) };
    const envelopeWithoutHashes = {
      version: 'v10.3-evidence-acquisition-envelope-v1' as const,
      envelopeId: '',
      authorizationId: authorization.authorizationId,
      reservation,
      invocationIntentId: acquire.intent.intentId,
      casTransactionId: cas.transactionId,
      primaryCompletionRelativePath: cas.primaryCompletionRelativePath,
      primaryCompletionSha256: cas.primaryCompletionSha256,
      acquisitionReceiptSha256: acquisitionReceipt.receiptSha256,
      payloadId: parts.payload.payloadId,
      toolReceiptSha256: acquire.receiptSha256,
      envelopeSha256: '',
    };
    const envelopeWithId = { ...envelopeWithoutHashes, envelopeId: calibrationEvidenceAcquisitionEnvelopeId(envelopeWithoutHashes) };
    const { envelopeSha256: _envelopeSha256, ...envelopeHashInput } = envelopeWithId;
    const envelope = { ...envelopeWithId, envelopeSha256: calibrationAdmissionSha256(envelopeHashInput) };
    const evidenceReceipt = makeEvidenceReceipt(parts.payload, parts.evidenceIndex, parts.evidencePayloadSet, verify.receiptSha256);
    let bundle = makeBundle({
      profiles,
      payload: parts.payload,
      evidenceIndex: parts.evidenceIndex,
      evidencePayloadSet: parts.evidencePayloadSet,
      intents: [verify.intent, acquire.intent],
      toolReceipts: [verify.receipt, acquire.receipt],
      approvedEvidenceAcquisitions: [authorization],
      evidenceAcquisitionReceipts: [acquisitionReceipt],
      evidenceAcquisitionEnvelopes: [envelope],
      evidenceReceipts: [evidenceReceipt],
    });
    const primaryPath = join(root, cas.primaryCompletionRelativePath);
    const primary = JSON.parse(await readFile(primaryPath, 'utf8')) as Record<string, unknown>;
    await writeFile(primaryPath, calibrationAdmissionCanonicalJson({ ...primary, observedBytes: bytes.byteLength + 1 }));
    await writeFile(join(root, 'evidence-bundle.json'), calibrationAdmissionCanonicalJson(bundle));

    const result = await buildVerifiedAdmissionEvidenceContext(root);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toMatch(/primary completion/i);
  });

  it('rejects an unrelated tool receipt for the verified evidence receipt', async () => {
    const root = await fixtureRoot();
    const profiles = makeProfiles();
    const verify = makeToolArtifacts(profiles, 'admission-context-v1', 'evidence:verify');
    const acquire = makeToolArtifacts(profiles, 'admission-evidence-acquire-v1', 'evidence:acquire');
    const bytes = Buffer.from('unrelated-tool-receipt', 'utf8');
    const matId = 'materialization-fixture';
    const materializationReceipt = makeMaterializationReceipt(matId);
    const materializedParts = makeEvidenceParts({ kind: 'materialization_reference', materializationReceiptId: materializationReceipt.receiptId, materializationId: matId, normalizedPath: 'src/file.txt' }, bytes);
    const evidenceReceipt = makeEvidenceReceipt(materializedParts.payload, materializedParts.evidenceIndex, materializedParts.evidencePayloadSet, acquire.receiptSha256);
    const base = join(root, 'materializations', matId, 'src');
    await (await import('node:fs/promises')).mkdir(base, { recursive: true });
    await writeFile(join(base, 'file.txt'), bytes);
    const bundle = makeBundle({
      profiles,
      payload: materializedParts.payload,
      evidenceIndex: materializedParts.evidenceIndex,
      evidencePayloadSet: materializedParts.evidencePayloadSet,
      intents: [verify.intent, acquire.intent],
      toolReceipts: [verify.receipt, acquire.receipt],
      materializationReceipts: [materializationReceipt],
      evidenceReceipts: [evidenceReceipt],
    });
    await writeFile(join(root, 'evidence-bundle.json'), calibrationAdmissionCanonicalJson(bundle));
    const result = await buildVerifiedAdmissionEvidenceContext(root);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toMatch(/evidence:verify|task tool receipt/i);
  });

  it('rejects a materialization file symlink even when its outside target has the expected bytes', async () => {
    const root = await fixtureRoot();
    const outside = await fixtureRoot();
    const profiles = makeProfiles();
    const verify = makeToolArtifacts(profiles, 'admission-context-v1', 'evidence:verify');
    const bytes = Buffer.from('materialization-symlink', 'utf8');
    const matId = 'materialization-symlink-fixture';
    const materializationReceipt = makeMaterializationReceipt(matId);
    const parts = makeEvidenceParts({ kind: 'materialization_reference', materializationReceiptId: materializationReceipt.receiptId, materializationId: matId, normalizedPath: 'src/file.txt' }, bytes);
    const materializationRoot = join(root, 'configured-materialization');
    await (await import('node:fs/promises')).mkdir(join(materializationRoot, 'src'), { recursive: true });
    await writeFile(join(outside, 'outside.txt'), bytes);
    await symlink(join(outside, 'outside.txt'), join(materializationRoot, 'src', 'file.txt'));
    const evidenceReceipt = makeEvidenceReceipt(parts.payload, parts.evidenceIndex, parts.evidencePayloadSet, verify.receiptSha256);
    const bundle = makeBundle({
      profiles,
      payload: parts.payload,
      evidenceIndex: parts.evidenceIndex,
      evidencePayloadSet: parts.evidencePayloadSet,
      intents: [verify.intent],
      toolReceipts: [verify.receipt],
      materializationReceipts: [materializationReceipt],
      evidenceReceipts: [evidenceReceipt],
    });
    await writeFile(join(root, 'evidence-bundle.json'), calibrationAdmissionCanonicalJson(bundle));
    const result = await buildVerifiedAdmissionEvidenceContext(root, { materializationRoots: { [matId]: materializationRoot } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toMatch(/regular file|escapes|materialization/i);
    expect((await lstat(join(materializationRoot, 'src', 'file.txt'))).isSymbolicLink()).toBe(true);
  });

  it('rejects a default materialization fallback whose ancestor is a symlink', async () => {
    const root = await fixtureRoot();
    const outside = await fixtureRoot();
    const profiles = makeProfiles();
    const verify = makeToolArtifacts(profiles, 'admission-context-v1', 'evidence:verify');
    const bytes = Buffer.from('materialization-ancestor-symlink', 'utf8');
    const matId = 'materialization-ancestor-fixture';
    const materializationReceipt = makeMaterializationReceipt(matId);
    const parts = makeEvidenceParts({ kind: 'materialization_reference', materializationReceiptId: materializationReceipt.receiptId, materializationId: matId, normalizedPath: 'src/file.txt' }, bytes);
    await mkdir(join(outside, 'src'), { recursive: true });
    await writeFile(join(outside, 'src', 'file.txt'), bytes);
    await mkdir(join(root, 'materializations'), { recursive: true });
    await symlink(outside, join(root, 'materializations', matId));
    const evidenceReceipt = makeEvidenceReceipt(parts.payload, parts.evidenceIndex, parts.evidencePayloadSet, verify.receiptSha256);
    const bundle = makeBundle({
      profiles,
      payload: parts.payload,
      evidenceIndex: parts.evidenceIndex,
      evidencePayloadSet: parts.evidencePayloadSet,
      intents: [verify.intent],
      toolReceipts: [verify.receipt],
      materializationReceipts: [materializationReceipt],
      evidenceReceipts: [evidenceReceipt],
    });
    await writeFile(join(root, 'evidence-bundle.json'), calibrationAdmissionCanonicalJson(bundle));
    const result = await buildVerifiedAdmissionEvidenceContext(root);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toMatch(/regular file|escapes|materialization/i);
  });

  it('accepts an indexed CAS bundle after transient transaction and reservation cleanup', async () => {
    const root = await fixtureRoot();
    const profiles = makeProfiles();
    const verify = makeToolArtifacts(profiles, 'admission-context-v1', 'evidence:verify');
    const acquire = makeToolArtifacts(profiles, 'admission-evidence-acquire-v1', 'evidence:acquire');
    const bytes = Buffer.from('cas-post-cleanup', 'utf8');
    const sha256 = digest(bytes.toString('utf8'));
    const placeholder = makeAuthorization('evidence-placeholder', bytes);
    const placeholderParts = makeEvidenceParts({ kind: 'evidence_cas', casAlgorithm: 'sha256', casRelativePath: admissionEvidenceCasRelativePath(sha256), authorizationId: placeholder.authorizationId }, bytes);
    const authorization = makeAuthorization(placeholderParts.evidenceId, bytes, `https://offline.invalid/evidence-cas/${sha256}`);
    const parts = makeEvidenceParts({ kind: 'evidence_cas', casAlgorithm: 'sha256', casRelativePath: admissionEvidenceCasRelativePath(sha256), authorizationId: authorization.authorizationId }, bytes);
    const cas = await putAdmissionEvidenceCas({
      root,
      bytes,
      authorizationId: authorization.authorizationId,
      evidenceId: parts.evidenceId,
      invocationIntentId: acquire.intent.intentId,
      recoveryNonce: repeated('1'),
    });
    const reservation = JSON.parse(await readFile(join(root, 'evidence-cas', 'reservations', `${authorization.authorizationId}.json`), 'utf8')) as Record<string, unknown>;
    const acquisitionReceiptWithoutId = {
      version: 'v10.3-evidence-acquisition-receipt-v1' as const,
      receiptId: '',
      authorizationId: authorization.authorizationId,
      authorizationSha256: authorization.authorizationSha256,
      evidenceId: parts.evidenceId,
      observedBytes: bytes.byteLength,
      observedSha256: sha256,
      observedMediaType: 'application/octet-stream',
      redirectChain: [] as string[],
      resolvedPublicAddressesSha256: calibrationAdmissionSha256(['offline']),
      casTransactionId: cas.transactionId,
      primaryCompletionSha256: cas.primaryCompletionSha256,
      toolReceiptSha256: acquire.receiptSha256,
      receiptSha256: '',
    };
    const acquisitionReceiptWithId = { ...acquisitionReceiptWithoutId, receiptId: calibrationEvidenceAcquisitionReceiptId(acquisitionReceiptWithoutId) };
    const { receiptSha256: _receiptSha256, ...acquisitionReceiptHashInput } = acquisitionReceiptWithId;
    const acquisitionReceipt = { ...acquisitionReceiptWithId, receiptSha256: calibrationAdmissionSha256(acquisitionReceiptHashInput) };
    const envelopeWithoutHashes = {
      version: 'v10.3-evidence-acquisition-envelope-v1' as const,
      envelopeId: '',
      authorizationId: authorization.authorizationId,
      reservation,
      invocationIntentId: acquire.intent.intentId,
      casTransactionId: cas.transactionId,
      primaryCompletionRelativePath: cas.primaryCompletionRelativePath,
      primaryCompletionSha256: cas.primaryCompletionSha256,
      acquisitionReceiptSha256: acquisitionReceipt.receiptSha256,
      payloadId: parts.payload.payloadId,
      toolReceiptSha256: acquire.receiptSha256,
      envelopeSha256: '',
    };
    const envelopeWithId = { ...envelopeWithoutHashes, envelopeId: calibrationEvidenceAcquisitionEnvelopeId(envelopeWithoutHashes) };
    const { envelopeSha256: _envelopeSha256, ...envelopeHashInput } = envelopeWithId;
    const envelope = { ...envelopeWithId, envelopeSha256: calibrationAdmissionSha256(envelopeHashInput) };
    const evidenceReceipt = makeEvidenceReceipt(parts.payload, parts.evidenceIndex, parts.evidencePayloadSet, verify.receiptSha256);

    const gen0 = acquisitionIndex(0, undefined, []);
    let bundle = makeBundle({
      profiles,
      payload: parts.payload,
      evidenceIndex: parts.evidenceIndex,
      evidencePayloadSet: parts.evidencePayloadSet,
      intents: [verify.intent, acquire.intent],
      toolReceipts: [verify.receipt, acquire.receipt],
      approvedEvidenceAcquisitions: [authorization],
      evidenceAcquisitionReceipts: [acquisitionReceipt],
      evidenceAcquisitionEnvelopes: [envelope],
      evidenceReceipts: [evidenceReceipt],
      acquisitionAuthoritySnapshot: { indexGenerationSha256: gen0.indexSha256, artifactKeys: [] },
    });
    bundle = await materializeToolAuthority(root, bundle);
    const primaryBytes = await readFile(join(root, cas.primaryCompletionRelativePath));
    const authorityFiles: readonly { readonly kind: string; readonly objectId: string; readonly relativePath: string; readonly value: unknown; readonly bytes: Buffer }[] = [
      { kind: 'evidence_authorization', objectId: authorization.authorizationId, relativePath: `acquisitions/authorizations/evidence/${authorization.authorizationId}.json`, value: authorization, bytes: Buffer.from(calibrationAdmissionCanonicalJson(authorization)) },
      { kind: 'evidence_receipt', objectId: acquisitionReceipt.receiptId, relativePath: `acquisitions/receipts/evidence/${acquisitionReceipt.receiptId}.json`, value: acquisitionReceipt, bytes: Buffer.from(calibrationAdmissionCanonicalJson(acquisitionReceipt)) },
      { kind: 'evidence_envelope', objectId: envelope.envelopeId, relativePath: `acquisitions/evidence-envelopes/${envelope.envelopeId}.json`, value: envelope, bytes: Buffer.from(calibrationAdmissionCanonicalJson(envelope)) },
      { kind: 'evidence_cas_primary_completion', objectId: cas.primaryCompletionSha256, relativePath: `acquisitions/evidence-cas-primary-completions/${cas.primaryCompletionSha256}.json`, value: JSON.parse(primaryBytes.toString('utf8')), bytes: primaryBytes },
      { kind: 'evidence_index', objectId: parts.evidenceIndex.indexSha256, relativePath: `acquisitions/evidence-generations/index-${parts.evidenceIndex.indexSha256}.json`, value: parts.evidenceIndex, bytes: Buffer.from(calibrationAdmissionCanonicalJson(parts.evidenceIndex)) },
      { kind: 'evidence_payload_set', objectId: parts.evidencePayloadSet.payloadSetSha256, relativePath: `acquisitions/evidence-generations/payload-set-${parts.evidencePayloadSet.payloadSetSha256}.json`, value: parts.evidencePayloadSet, bytes: Buffer.from(calibrationAdmissionCanonicalJson(parts.evidencePayloadSet)) },
      { kind: 'evidence_bundle', objectId: bundle.bundleSha256, relativePath: `acquisitions/evidence-generations/bundle-${bundle.bundleSha256}.json`, value: bundle, bytes: Buffer.from(calibrationAdmissionCanonicalJson(bundle)) },
    ];
    for (const file of authorityFiles) {
      await mkdir(join(root, file.relativePath, '..'), { recursive: true });
      await writeFile(join(root, file.relativePath), file.bytes);
    }
    const artifacts = authorityFiles.map((file) => ({ kind: file.kind, objectId: file.objectId, relativePath: file.relativePath, sha256: digest(file.bytes.toString('utf8')) }));
    const gen1 = acquisitionIndex(1, gen0.indexSha256, artifacts);
    await mkdir(join(root, 'acquisitions', 'index-generations'), { recursive: true });
    await writeFile(join(root, 'acquisitions', 'index-generations', `${gen0.indexSha256}.json`), calibrationAdmissionCanonicalJson(gen0));
    await writeFile(join(root, 'acquisitions', 'index-generations', `${gen1.indexSha256}.json`), calibrationAdmissionCanonicalJson(gen1));
    await writeFile(join(root, 'acquisitions', 'index.json'), calibrationAdmissionCanonicalJson(gen1));
    await writeFile(join(root, 'evidence-bundle.json'), calibrationAdmissionCanonicalJson(bundle));
    await rm(join(root, 'evidence-cas', 'reservations', `${authorization.authorizationId}.json`), { force: true });
    await rm(join(root, 'evidence-cas', 'transactions', `${cas.transactionId}.json`), { force: true });
    await rm(join(root, 'evidence-cas', 'transactions', `${cas.transactionId}.network.json`), { force: true });

    const result = await buildVerifiedAdmissionEvidenceContext(root);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.context.verifiedEvidenceIds).toEqual([parts.payload.evidenceId]);
  });
});
