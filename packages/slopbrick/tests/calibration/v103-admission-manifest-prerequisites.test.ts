import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import {
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionManifestPrerequisiteBundleSha256,
  calibrationAdmissionManifestPrerequisitePublicationCompletionSha256,
  calibrationAdmissionManifestPrerequisitePublicationRequestSha256,
  calibrationAdmissionManifestPrerequisiteStagingSetSha256,
  calibrationAdmissionSha256,
  calibrationPackedRuntimeReceiptSha256,
  calibrationReleasePrerequisiteApprovalSha256,
  calibrationRunLifecycleReceiptSha256,
  calibrationScoreWireClosureReceiptSha256,
} from '@usebrick/core';

import {
  isVerifiedAdmissionManifestPrerequisites,
  openAdmissionManifestPrerequisitesForConsumer,
} from '../../src/calibration/v103/admission-manifest-prerequisites';

type JsonObject = Record<string, any>;

const commitSha = 'c'.repeat(40);
const sha = (value: string): string => createHash('sha256').update(value).digest('hex');
const bytes = (value: string): Buffer => Buffer.from(value, 'utf8');
const canonical = (value: unknown): Buffer => Buffer.from(calibrationAdmissionCanonicalJson(value), 'utf8');

function tarGzip(memberPath: string, memberBytes: Buffer): Buffer {
  const header = Buffer.alloc(512);
  header.write(memberPath, 0, 100, 'utf8');
  header.write('0000644\0', 100, 8, 'ascii');
  header.write('0000000\0', 108, 8, 'ascii');
  header.write('0000000\0', 116, 8, 'ascii');
  header.write(memberBytes.length.toString(8).padStart(11, '0') + '\0', 124, 12, 'ascii');
  header.write('00000000000\0', 136, 12, 'ascii');
  header.fill(' ', 148, 156);
  header.write('0', 156, 1, 'ascii');
  const checksum = [...header].reduce((sum, value) => sum + value, 0);
  header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  const padding = Buffer.alloc((512 - (memberBytes.length % 512)) % 512);
  return gzipSync(Buffer.concat([header, memberBytes, padding, Buffer.alloc(1024)]));
}

async function handoff(): Promise<JsonObject> {
  return JSON.parse(await readFile(join(process.cwd(), '..', 'core', 'tests', 'fixtures', 'schema', 'valid', 'calibration-nested-publication-handoff.valid.json'), 'utf8')) as JsonObject;
}

function artifact(
  artifactId: string,
  kind: string,
  data: Buffer,
  extra: JsonObject = {},
): JsonObject {
  const schemaId: Record<string, string | null> = {
    release_plan: null,
    release_plan_approval: 'https://usebrick.dev/schemas/v1/calibration-release-prerequisite-approval.schema.json',
    score_wire_closure_receipt: 'https://usebrick.dev/schemas/v1/calibration-score-wire-closure-receipt.schema.json',
    run_init_receipt: 'https://usebrick.dev/schemas/v1/calibration-run-lifecycle-receipt.schema.json',
    post_scan_receipt: 'https://usebrick.dev/schemas/v1/calibration-run-lifecycle-receipt.schema.json',
    packed_runtime_receipt: 'https://usebrick.dev/schemas/v1/calibration-packed-runtime-receipt.schema.json',
    package_tarball: null,
    manifest_builder: null,
  };
  const owner = kind === 'release_plan' || kind === 'release_plan_approval' ? 'release_asset_plan'
    : kind === 'score_wire_closure_receipt' ? 'score_wire_gate'
      : kind === 'run_init_receipt' || kind === 'post_scan_receipt' ? 'run_lifecycle_gate'
        : kind === 'packed_runtime_receipt' || kind === 'package_tarball' ? 'packed_runtime_matrix'
        : 'admission_manifest_builder';
  const mediaType = kind === 'release_plan' ? 'text/markdown'
    : kind === 'package_tarball' ? 'application/gzip'
      : kind === 'manifest_builder' ? 'application/javascript' : 'application/json';
  const digest = kind === 'package_tarball' ? createHash('sha256').update(data).digest('hex') : sha(data.toString('utf8'));
  const relativePath = kind === 'package_tarball'
    ? `review/admission/manifest-prerequisites/tarballs/${digest}.tgz`
    : `review/admission/manifest-prerequisites/artifacts/${kind}/${digest}`;
  return {
    artifactId,
    relativePath,
    bytes: data.byteLength,
    sha256: digest,
    kind,
    owner,
    mediaType,
    schemaId: schemaId[kind],
    ...extra,
    data,
  };
}

function receiptData(): {
  readonly artifacts: JsonObject[];
  readonly builder: JsonObject;
  readonly tarballs: JsonObject[];
  readonly behaviorSha256: string;
} {
  const builderBytes = bytes('export const builder = true;');
  const builder = artifact('builder', 'manifest_builder', builderBytes, {
    packageTarballArtifactId: 'tarball-22',
    packageMemberRelativePath: 'package/dist/calibration/v103/admission.cjs',
  });
  const tarball22 = artifact('tarball-22', 'package_tarball', tarGzip('package/dist/calibration/v103/admission.cjs', builderBytes));
  const tarball24 = artifact('tarball-24', 'package_tarball', tarGzip('package/dist/calibration/v103/admission.cjs', bytes('export const builder = true; node24')));
  const approvalBody = {
    version: 'v10.3-release-prerequisite-approval-v1' as const,
    receiptId: 'approval-1',
    planSha256: sha('plan'),
    approvedCommitSha: commitSha,
    taskEvidenceSummarySha256: sha('approval-evidence'),
    reviewerIds: ['reviewer-a', 'reviewer-b'] as [string, string],
    decision: 'approved' as const,
  };
  const approval = { ...approvalBody, receiptSha256: calibrationReleasePrerequisiteApprovalSha256(approvalBody) };
  const scoreBody = {
    version: 'v10.3-score-wire-closure-receipt-v1' as const,
    receiptId: 'score-1',
    approvedCommitSha: commitSha,
    scoreContractSha256: sha('score-contract'),
    verificationEvidenceSha256: sha('score-evidence'),
    reviewerIds: ['reviewer-a', 'reviewer-b'] as [string, string],
    decision: 'approved' as const,
  };
  const score = { ...scoreBody, receiptSha256: calibrationScoreWireClosureReceiptSha256(scoreBody) };
  const run = (kind: 'run_init' | 'post_scan', id: string) => {
    const body = {
      version: 'v10.3-run-lifecycle-receipt-v1' as const,
      receiptId: id,
      kind,
      approvedCommitSha: commitSha,
      behaviorSha256: sha(`${kind}-behavior`),
      verificationEvidenceSha256: sha(`${kind}-evidence`),
      reviewerIds: ['reviewer-a', 'reviewer-b'] as [string, string],
      decision: 'approved' as const,
    };
    return { ...body, receiptSha256: calibrationRunLifecycleReceiptSha256(body) };
  };
  const runtime = (nodeMajor: 22 | 24, id: string, tarball: JsonObject) => {
    const body = {
      version: 'v10.3-packed-runtime-receipt-v1' as const,
      receiptId: id,
      approvedCommitSha: commitSha,
      nodeMajor,
      packageVersion: '0.45.0' as const,
      tarballSha256: tarball.sha256,
      manifestBuilderBehaviorSha256: builder.sha256,
      installCommandSha256: sha(`install-${nodeMajor}`),
      verificationCommandSha256: sha(`verify-${nodeMajor}`),
      outputSetSha256: sha(`output-${nodeMajor}`),
      reviewerIds: ['reviewer-a', 'reviewer-b'] as [string, string],
      decision: 'approved' as const,
      exitCode: 0 as const,
    };
    return { ...body, receiptSha256: calibrationPackedRuntimeReceiptSha256(body) };
  };
  const runtime22 = artifact('runtime-22', 'packed_runtime_receipt', canonical(runtime(22, 'runtime-22', tarball22)));
  const runtime24 = artifact('runtime-24', 'packed_runtime_receipt', canonical(runtime(24, 'runtime-24', tarball24)));
  const approvalArtifact = artifact('approval', 'release_plan_approval', canonical(approval));
  const scoreArtifact = artifact('score', 'score_wire_closure_receipt', canonical(score));
  const initArtifact = artifact('run-init', 'run_init_receipt', canonical(run('run_init', 'run-init')));
  const scanArtifact = artifact('post-scan', 'post_scan_receipt', canonical(run('post_scan', 'post-scan')));
  return {
    artifacts: [builder, tarball22, tarball24, runtime22, runtime24, approvalArtifact, scoreArtifact, initArtifact, scanArtifact],
    builder,
    tarballs: [tarball22, tarball24],
    behaviorSha256: builder.sha256,
  };
}

async function createFixture(): Promise<{ readonly root: string; readonly reference: JsonObject; readonly paths: { readonly artifact: string; readonly request: string } }> {
  const root = await mkdtemp(join(tmpdir(), 'slopbrick-prerequisite-verifier-'));
  const prerequisiteRoot = 'review/admission/manifest-prerequisites';
  const data = receiptData();
  const plan = artifact('plan', 'release_plan', bytes('# release plan\n'));
  const artifacts = [...data.artifacts, plan].sort((left, right) => left.artifactId.localeCompare(right.artifactId));
  const artifactSetSha256 = calibrationAdmissionSha256(artifacts.map(({ data: _data, ...value }) => value));
  const bundleBody = {
    version: 'v10.3-admission-manifest-prerequisites-v1' as const,
    bundleId: 'bundle-1',
    implementationCommitSha: commitSha,
    manifestBuilder: { behaviorSha256: data.behaviorSha256, artifactId: 'builder' },
    releaseMaterializationTasks1To6: { approvedCommitSha: commitSha, planArtifactId: 'plan', approvalReceiptArtifactId: 'approval' },
    scoreWireClosure: { approvedCommitSha: commitSha, closureReceiptArtifactId: 'score' },
    runLifecycleVerification: { approvedCommitSha: commitSha, runInitReceiptArtifactId: 'run-init', postScanReceiptArtifactId: 'post-scan' },
    packedRuntimes: [
      { nodeMajor: 22 as const, tarballArtifactId: 'tarball-22', receiptArtifactId: 'runtime-22' },
      { nodeMajor: 24 as const, tarballArtifactId: 'tarball-24', receiptArtifactId: 'runtime-24' },
    ],
    referencedArtifacts: artifacts.map(({ data: _data, ...value }) => value),
    referencedArtifactSetSha256: artifactSetSha256,
  };
  const bundle = { ...bundleBody, bundleSha256: calibrationAdmissionManifestPrerequisiteBundleSha256(bundleBody) };
  const stagingEntries = artifacts.filter((value) => value.artifactId !== 'plan').map((value) => ({
    artifactId: value.artifactId,
    kind: value.kind,
    mediaType: value.mediaType,
    normalizedRelativePath: `staging/${value.artifactId}`,
    bytes: value.bytes,
    sha256: value.sha256,
  }));
  const stagingBody = { version: 'v10.3-admission-manifest-prerequisite-staging-set-v1' as const, entries: stagingEntries };
  const stagingSet = { ...stagingBody, stagingSetSha256: calibrationAdmissionManifestPrerequisiteStagingSetSha256(stagingBody) };
  const bundlePath = `${prerequisiteRoot}/bundles/${bundle.bundleSha256}.json`;
  const requestPath = `${prerequisiteRoot}/requests/request-1.json`;
  const completionPath = `${prerequisiteRoot}/publications/completions/completion-1.json`;
  const sourceArtifacts = artifacts.map(({ data: _data, ...value }) => ({
    ...value,
    source: value.artifactId === 'plan'
      ? { sourceRoot: 'platform_commit' as const, normalizedRelativePath: 'docs/calibration/release-plan.md', approvedCommitSha: commitSha }
      : { sourceRoot: 'prerequisite_staging' as const, normalizedRelativePath: `staging/${value.artifactId}`, stagingSetSha256: stagingSet.stagingSetSha256 },
  }));
  const requestBody = {
    version: 'v10.3-admission-manifest-prerequisite-publication-request-v1' as const,
    requestId: 'request-1',
    operation: 'create' as const,
    expectedCurrentState: { kind: 'absent' as const },
    sourceArtifacts,
    stagingSet,
    bundle,
  };
  const request = { ...requestBody, requestSha256: calibrationAdmissionManifestPrerequisitePublicationRequestSha256(requestBody) };
  const completionBody = {
    version: 'v10.3-admission-manifest-prerequisite-publication-completion-v1' as const,
    requestId: request.requestId,
    requestSha256: request.requestSha256,
    requestRelativePath: requestPath,
    transactionId: 'transaction-1',
    invocationIntentId: sha('invocation'),
    bundleRelativePath: bundlePath,
    bundleSha256: bundle.bundleSha256,
    artifactSetSha256: bundle.referencedArtifactSetSha256,
    namedPrimaryOutputProjectionSha256: sha('projection'),
    publicationToolReceiptId: 'publication-receipt-1',
    publicationToolReceiptSha256: sha('publication-receipt'),
    toolAuthorityIndexSha256: sha('authority-index'),
    nestedHandoff: await handoff(),
  };
  const completion = { ...completionBody, completionSha256: calibrationAdmissionManifestPrerequisitePublicationCompletionSha256(completionBody) };
  const referenceBody = {
    version: 'v10.3-admission-manifest-prerequisite-reference-v1' as const,
    bundleRelativePath: bundlePath,
    bundleSha256: bundle.bundleSha256,
    completionRelativePath: completionPath,
    completionSha256: completion.completionSha256,
    requestRelativePath: requestPath,
    requestSha256: request.requestSha256,
  };
  const reference = { ...referenceBody, referenceSha256: calibrationAdmissionSha256(referenceBody) };
  for (const value of artifacts) {
    const path = join(root, value.relativePath);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, value.data);
  }
  for (const [path, value] of [[bundlePath, bundle], [requestPath, request], [completionPath, completion]] as const) {
    const absolute = join(root, path);
    await mkdir(join(absolute, '..'), { recursive: true });
    await writeFile(absolute, canonical(value));
  }
  return { root, reference, paths: { artifact: join(root, data.builder.relativePath), request: join(root, requestPath) } };
}

describe('v10.3 immutable admission prerequisite verifier', () => {
  it('opens a complete immutable prerequisite graph and returns a private brand', async () => {
    const fixture = await createFixture();
    try {
      const verified = await openAdmissionManifestPrerequisitesForConsumer({ root: fixture.root, reference: fixture.reference });
      expect(verified.bundle.bundleSha256).toBe(fixture.reference.bundleSha256);
      expect(verified.request.requestSha256).toBe(fixture.reference.requestSha256);
      expect(Object.isFrozen(fixture.reference)).toBe(false);
      expect(Object.isFrozen(verified)).toBe(true);
      expect(isVerifiedAdmissionManifestPrerequisites(verified)).toBe(true);
      expect(isVerifiedAdmissionManifestPrerequisites(JSON.parse(JSON.stringify(verified)))).toBe(false);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('rejects a mutated reference or artifact before exposing the brand', async () => {
    const referenceFixture = await createFixture();
    try {
      await expect(openAdmissionManifestPrerequisitesForConsumer({ root: referenceFixture.root, reference: { ...referenceFixture.reference, bundleSha256: 'f'.repeat(64) } })).rejects.toThrow(/reference/i);
    } finally {
      await rm(referenceFixture.root, { recursive: true, force: true });
    }

    const artifactFixture = await createFixture();
    try {
      await writeFile(artifactFixture.paths.artifact, bytes('tampered'));
      await expect(openAdmissionManifestPrerequisitesForConsumer({ root: artifactFixture.root, reference: artifactFixture.reference })).rejects.toThrow(/artifact|bytes|hash/i);
    } finally {
      await rm(artifactFixture.root, { recursive: true, force: true });
    }
  });
});
