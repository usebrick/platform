import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  calibrationAdmissionBindingSha256,
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionManifestBuildReceiptSha256,
  calibrationAdmissionManifestCurrentSha256,
  calibrationAdmissionManifestGenerationSha256,
  calibrationAdmissionManifestPrerequisiteBundleSha256,
  calibrationAdmissionManifestPrerequisitePublicationCompletionSha256,
  calibrationAdmissionManifestPrerequisitePublicationRequestSha256,
  calibrationAdmissionManifestPrerequisiteStagingSetSha256,
  calibrationAdmissionSha256,
} from '@usebrick/core';
import {
  isVerifiedAdmissionManifest,
  openAdmissionManifestForConsumer,
} from '../../src/calibration/v103/admission-manifest-consumer';

type JsonObject = Record<string, any>;

const manifestId = 'v10.3-admission-smoke' as const;
const commitSha = 'c'.repeat(40);
const SHA = (value: string): string => createHash('sha256').update(value).digest('hex');
const hashBytes = (value: Uint8Array): string => createHash('sha256').update(value).digest('hex');
const bytesFor = (value: string): Buffer => Buffer.from(`fixture:${value}`, 'utf8');
const canonical = (value: unknown): Buffer => Buffer.from(calibrationAdmissionCanonicalJson(value), 'utf8');
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

async function fixtureHandoff(): Promise<JsonObject> {
  return JSON.parse(await readFile(join(repoRoot, 'packages/core/tests/fixtures/schema/valid/calibration-nested-publication-handoff.valid.json'), 'utf8')) as JsonObject;
}

function artifact(id: string, kind: string, data: Buffer, packageTarballArtifactId?: string): JsonObject {
  const sha256 = SHA(data.toString('utf8'));
  const schemaByKind: Record<string, string | null> = {
    release_plan: null,
    release_plan_approval: 'https://usebrick.dev/schemas/v1/calibration-release-prerequisite-approval.schema.json',
    score_wire_closure_receipt: 'https://usebrick.dev/schemas/v1/calibration-score-wire-closure-receipt.schema.json',
    run_init_receipt: 'https://usebrick.dev/schemas/v1/calibration-run-lifecycle-receipt.schema.json',
    post_scan_receipt: 'https://usebrick.dev/schemas/v1/calibration-run-lifecycle-receipt.schema.json',
    packed_runtime_receipt: 'https://usebrick.dev/schemas/v1/calibration-packed-runtime-receipt.schema.json',
    package_tarball: null,
    manifest_builder: null,
  };
  const prefix = kind === 'package_tarball'
    ? 'review/admission/manifest-prerequisites/tarballs'
    : 'review/admission/manifest-prerequisites/artifacts';
  const relativePath = kind === 'package_tarball'
    ? `${prefix}/${sha256}.tgz`
    : `${prefix}/${kind}/${sha256}`;
  return {
    artifactId: id,
    relativePath,
    bytes: data.byteLength,
    sha256,
    kind,
    owner: kind === 'manifest_builder' ? 'admission_manifest_builder'
      : kind === 'release_plan' || kind === 'release_plan_approval' ? 'release_asset_plan'
        : kind === 'score_wire_closure_receipt' ? 'score_wire_gate'
          : kind === 'run_init_receipt' || kind === 'post_scan_receipt' ? 'run_lifecycle_gate'
            : 'packed_runtime_matrix',
    mediaType: kind === 'release_plan' ? 'text/markdown'
      : kind === 'package_tarball' ? 'application/gzip'
        : kind === 'manifest_builder' ? 'application/javascript' : 'application/json',
    schemaId: schemaByKind[kind],
    ...(kind === 'manifest_builder' ? {
      packageTarballArtifactId,
      packageMemberRelativePath: 'package/dist/calibration/v103/admission.cjs',
    } : {}),
    data,
  };
}

async function createFixture(): Promise<{
  readonly root: string;
  readonly reference: JsonObject;
  readonly manifestSha256: string;
  readonly paths: { readonly current: string; readonly generation: string; readonly manifest: string };
}> {
  const root = await mkdtemp(join(tmpdir(), 'slopbrick-manifest-consumer-'));
  const prerequisiteRoot = 'review/admission/manifest-prerequisites';
  const artifacts = [
    artifact('builder-artifact', 'manifest_builder', bytesFor('builder'), 'tarball-node-22'),
    artifact('post-scan-artifact', 'post_scan_receipt', bytesFor('post-scan')),
    artifact('release-approval-artifact', 'release_plan_approval', bytesFor('release-approval')),
    artifact('release-plan-artifact', 'release_plan', bytesFor('release-plan')),
    artifact('run-init-artifact', 'run_init_receipt', bytesFor('run-init')),
    artifact('runtime-node-22', 'packed_runtime_receipt', bytesFor('runtime-22')),
    artifact('runtime-node-24', 'packed_runtime_receipt', bytesFor('runtime-24')),
    artifact('score-wire-artifact', 'score_wire_closure_receipt', bytesFor('score-wire')),
    artifact('tarball-node-22', 'package_tarball', bytesFor('tarball-22')),
    artifact('tarball-node-24', 'package_tarball', bytesFor('tarball-24')),
  ].sort((left, right) => left.artifactId.localeCompare(right.artifactId));
  const artifactSetSha256 = calibrationAdmissionSha256(artifacts.map(({ data: _data, ...value }) => value));
  const bundleBody: JsonObject = {
    version: 'v10.3-admission-manifest-prerequisites-v1',
    bundleId: 'bundle-1',
    implementationCommitSha: commitSha,
    manifestBuilder: { behaviorSha256: artifacts[0]!.sha256, artifactId: 'builder-artifact' },
    releaseMaterializationTasks1To6: {
      approvedCommitSha: commitSha,
      planArtifactId: 'release-plan-artifact',
      approvalReceiptArtifactId: 'release-approval-artifact',
    },
    scoreWireClosure: { approvedCommitSha: commitSha, closureReceiptArtifactId: 'score-wire-artifact' },
    runLifecycleVerification: {
      approvedCommitSha: commitSha,
      runInitReceiptArtifactId: 'run-init-artifact',
      postScanReceiptArtifactId: 'post-scan-artifact',
    },
    packedRuntimes: [
      { nodeMajor: 22, tarballArtifactId: 'tarball-node-22', receiptArtifactId: 'runtime-node-22' },
      { nodeMajor: 24, tarballArtifactId: 'tarball-node-24', receiptArtifactId: 'runtime-node-24' },
    ],
    referencedArtifacts: artifacts.map(({ data: _data, ...value }) => value),
    referencedArtifactSetSha256: artifactSetSha256,
  };
  const bundle = { ...bundleBody, bundleSha256: calibrationAdmissionManifestPrerequisiteBundleSha256(bundleBody) };

  const stagingEntries = artifacts
    .filter((value) => value.kind !== 'release_plan')
    .map((value) => ({
      artifactId: value.artifactId,
      kind: value.kind,
      mediaType: value.mediaType,
      normalizedRelativePath: `staging/${value.artifactId}`,
      bytes: value.bytes,
      sha256: value.sha256,
    }));
  const stagingBody = {
    version: 'v10.3-admission-manifest-prerequisite-staging-set-v1',
    entries: stagingEntries,
  };
  const stagingSet = { ...stagingBody, stagingSetSha256: calibrationAdmissionManifestPrerequisiteStagingSetSha256(stagingBody) };
  const sourceArtifacts = artifacts.map(({ data: _data, ...value }) => ({
    ...value,
    source: value.kind === 'release_plan'
      ? { sourceRoot: 'platform_commit', normalizedRelativePath: 'docs/calibration/release-plan.md', approvedCommitSha: commitSha }
      : { sourceRoot: 'prerequisite_staging', normalizedRelativePath: `staging/${value.artifactId}`, stagingSetSha256: stagingSet.stagingSetSha256 },
  }));
  const requestBody: JsonObject = {
    version: 'v10.3-admission-manifest-prerequisite-publication-request-v1',
    requestId: 'request-1',
    operation: 'create',
    expectedCurrentState: { kind: 'absent' },
    sourceArtifacts,
    stagingSet,
    bundle,
  };
  const request = { ...requestBody, requestSha256: calibrationAdmissionManifestPrerequisitePublicationRequestSha256(requestBody) };
  const bundlePath = `${prerequisiteRoot}/bundles/${bundle.bundleSha256}.json`;
  const requestPath = `${prerequisiteRoot}/requests/${request.requestSha256}.json`;
  const completionBody: JsonObject = {
    version: 'v10.3-admission-manifest-prerequisite-publication-completion-v1',
    requestId: request.requestId,
    requestSha256: request.requestSha256,
    requestRelativePath: requestPath,
    transactionId: 'transaction-1',
    invocationIntentId: SHA('invocation'),
    bundleRelativePath: bundlePath,
    bundleSha256: bundle.bundleSha256,
    artifactSetSha256: bundle.referencedArtifactSetSha256,
    namedPrimaryOutputProjectionSha256: SHA('projection'),
    publicationToolReceiptId: 'publication-receipt-1',
    publicationToolReceiptSha256: SHA('publication-receipt'),
    toolAuthorityIndexSha256: SHA('authority-index'),
    nestedHandoff: await fixtureHandoff(),
  };
  const completion = { ...completionBody, completionSha256: calibrationAdmissionManifestPrerequisitePublicationCompletionSha256(completionBody) };
  const completionPath = `${prerequisiteRoot}/publications/completions/completion-1.json`;
  const runtimeReceiptSetSha256 = SHA('runtime-receipt-set');
  const witnessReviewBundleSha256 = SHA('witness-review-bundle');
  const builderBehaviorSha256 = artifacts[0]!.sha256;

  const bindingBody: JsonObject = {
    version: 'v10.3-admission-manifest-binding-v1',
    verifiedContextSha256: SHA('verified-context'),
    eligibilitySnapshotSha256: SHA('eligibility'),
    censusSha256: SHA('census'),
    admissionRecordsSha256: SHA('records'),
    sourceReviewSetSha256: SHA('source-review'),
    witnessSha256: SHA('witness'),
    searchResultBundleSha256: SHA('search'),
    searchResultPublicationCompletionSha256: SHA('search-completion'),
    witnessReviewBundleSha256,
    witnessReviewPublicationCompletionSha256: SHA('witness-completion'),
    witnessReviewReceiptSetSha256: SHA('witness-receipts'),
    evidenceIndexSha256: SHA('evidence-index'),
    evidencePayloadSetSha256: SHA('evidence-payload'),
    evidenceReceiptSetSha256: SHA('evidence-receipts'),
    toolProfileSetSha256: SHA('tool-profiles'),
    toolReceiptSetSha256: SHA('tool-receipts'),
    blindReviewReceiptSetSha256: SHA('blind-receipts'),
    temporalAttestationSetSha256: SHA('temporal'),
    materializationReceiptSetSha256: SHA('materialization'),
    prerequisiteBundleSha256: bundle.bundleSha256,
    manifestBuilderBehaviorSha256: builderBehaviorSha256,
    packedRuntimeReceiptSetSha256: runtimeReceiptSetSha256,
  };
  const binding = { ...bindingBody, bindingSha256: calibrationAdmissionBindingSha256(bindingBody) };
  const manifestBody: JsonObject = {
    version: 'v10.3',
    generatedAt: '2026-07-17T00:00:00.000Z',
    methodVersion: 'v10.3.2',
    admissionBinding: binding,
    leakageReview: {
      protocolVersion: 'v10.3-review-v1',
      reviewedAt: '2026-07-17T00:00:00.000Z',
      reviewerIds: ['reviewer-1'],
      noCrossPolarityFamilyOrCluster: true,
    },
    repositories: [{
      repositoryId: 'repo-1',
      familyId: 'family-1',
      originUrl: 'https://example.test/repo-1',
      commitSha,
      acquiredAt: '2026-07-17T00:00:00.000Z',
      license: 'MIT',
    }],
    files: [{
      sourceId: `repo-1@${commitSha}:src/App.tsx`,
      repositoryId: 'repo-1',
      familyId: 'family-1',
      normalizedPath: 'src/App.tsx',
      contentSha256: SHA('app'),
      language: 'TypeScript',
      stratum: 'production',
      clusterId: 'cluster-1',
      label: 'verified_ai',
      tier: 'gold',
      split: 'train',
      admissionRecordId: 'record-1',
      materializationId: 'materialization-1',
      evidence: { kind: 'manual_protocol', reference: 'https://example.test/evidence/app', protocolId: 'protocol-1' },
    }],
  };
  const manifestSha256 = hashBytes(canonical(manifestBody));
  const buildReceiptBody: JsonObject = {
    version: 'v10.3-admission-manifest-build-receipt-v1',
    receiptId: 'build-receipt-1',
    manifestId,
    manifestSha256,
    manifestRelativePath: 'manifest.json',
    prerequisiteBundleSha256: bundle.bundleSha256,
    prerequisiteBundleRelativePath: bundlePath,
    prerequisitePublicationCompletionSha256: completion.completionSha256,
    prerequisitePublicationCompletionRelativePath: completionPath,
    prerequisitePublicationRequestSha256: request.requestSha256,
    prerequisitePublicationRequestRelativePath: requestPath,
    manifestBuilderBehaviorSha256: builderBehaviorSha256,
    packedRuntimeReceiptSetSha256: runtimeReceiptSetSha256,
    readyCensusSha256: SHA('ready-census'),
    witnessReviewBundleSha256,
    invocationIntentId: SHA('manifest-invocation'),
    toolReceiptSha256: SHA('manifest-tool-receipt'),
    nestedHandoff: await fixtureHandoff(),
    expectedCurrentState: { kind: 'absent' },
    transactionId: 'manifest-transaction-1',
  };
  const buildReceipt = { ...buildReceiptBody, receiptSha256: calibrationAdmissionManifestBuildReceiptSha256(buildReceiptBody) };
  const manifestRoot = `manifests/${manifestId}`;
  const generationBody: JsonObject = {
    version: 'v10.3-admission-manifest-generation-v1',
    manifestId,
    generation: 1,
    manifestSha256,
    manifestRelativePath: 'manifest.json',
    buildReceiptSha256: buildReceipt.receiptSha256,
    buildReceiptRelativePath: 'build-receipt.json',
  };
  const generation = { ...generationBody, generationSha256: calibrationAdmissionManifestGenerationSha256(generationBody) };
  const generationRoot = `${manifestRoot}/generations/${generation.generationSha256}`;
  const currentBody = {
    version: 'v10.3-admission-manifest-current-v1',
    manifestId,
    generation: 1,
    generationSha256: generation.generationSha256,
    generationRelativePath: `generations/${generation.generationSha256}`,
  };
  const current = { ...currentBody, currentSha256: calibrationAdmissionManifestCurrentSha256(currentBody) };
  const referenceBody = {
    version: 'v10.3-admission-manifest-reference-v1',
    manifestId,
    currentRelativePath: `${manifestRoot}/current.json`,
    currentSha256: current.currentSha256,
    generationRelativePath: `${generationRoot}/generation.json`,
    generationSha256: generation.generationSha256,
    buildReceiptRelativePath: `${generationRoot}/build-receipt.json`,
    buildReceiptSha256: buildReceipt.receiptSha256,
    manifestRelativePath: `${generationRoot}/manifest.json`,
    manifestSha256,
  };
  const reference = { ...referenceBody, referenceSha256: calibrationAdmissionSha256(referenceBody) };

  for (const value of artifacts) {
    const artifactPath = join(root, value.relativePath);
    await mkdir(join(artifactPath, '..'), { recursive: true });
    await writeFile(artifactPath, value.data);
  }
  const jsonFiles: readonly [string, unknown][] = [
    [bundlePath, bundle],
    [requestPath, request],
    [completionPath, completion],
    [`${generationRoot}/manifest.json`, manifestBody],
    [`${generationRoot}/build-receipt.json`, buildReceipt],
    [`${generationRoot}/generation.json`, generation],
    [`${manifestRoot}/current.json`, current],
  ];
  for (const [pathValue, value] of jsonFiles) {
    const path = join(root, pathValue);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, canonical(value));
  }
  return {
    root,
    reference,
    manifestSha256,
    paths: {
      current: join(root, `${manifestRoot}/current.json`),
      generation: join(root, `${generationRoot}/generation.json`),
      manifest: join(root, `${generationRoot}/manifest.json`),
    },
  };
}

describe('v10.3 admission manifest consumer', () => {
  it('opens a complete immutable graph and returns a private brand', async () => {
    const fixture = await createFixture();
    const verified = await openAdmissionManifestForConsumer({
      root: fixture.root,
      manifestId,
      manifestReference: fixture.reference,
      expectedManifestSha256: fixture.manifestSha256,
    });
    expect(verified.manifest.methodVersion).toBe('v10.3.2');
    expect(isVerifiedAdmissionManifest(verified)).toBe(true);
    expect(isVerifiedAdmissionManifest(JSON.parse(JSON.stringify(verified)))).toBe(false);
  });

  it('rejects a reference mutation before opening the corpus root', async () => {
    const fixture = await createFixture();
    const mutated = { ...fixture.reference, manifestSha256: 'f'.repeat(64) };
    await expect(openAdmissionManifestForConsumer({
      root: '/does/not/exist',
      manifestId,
      manifestReference: mutated,
      expectedManifestSha256: fixture.manifestSha256,
    })).rejects.toThrow(/self-hash|match the requested/i);
  });

  it('rejects an immutable generation mutation and never returns a brand', async () => {
    const fixture = await createFixture();
    const generation = JSON.parse(await readFile(fixture.paths.generation, 'utf8')) as JsonObject;
    generation.generation = 2;
    await writeFile(fixture.paths.generation, canonical(generation));
    await expect(openAdmissionManifestForConsumer({
      root: fixture.root,
      manifestId,
      manifestReference: fixture.reference,
      expectedManifestSha256: fixture.manifestSha256,
    })).rejects.toThrow(/generation/i);
  });

  it('rejects an orphan file in the immutable generation directory', async () => {
    const fixture = await createFixture();
    await writeFile(join(fixture.paths.generation, '..', 'unexpected.json'), '{}');
    await expect(openAdmissionManifestForConsumer({
      root: fixture.root,
      manifestId,
      manifestReference: fixture.reference,
      expectedManifestSha256: fixture.manifestSha256,
    })).rejects.toThrow(/orphan|missing/i);
  });
});
