import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';

import {
  calibrationAdmissionManifestBuildReceiptSha256,
  calibrationAdmissionManifestCurrentSha256,
  calibrationAdmissionManifestGenerationSha256,
  calibrationAdmissionManifestPrerequisiteBundleSha256,
  calibrationAdmissionManifestPrerequisiteArtifactSetSha256,
  calibrationAdmissionManifestPrerequisitePublicationCompletionSha256,
  calibrationAdmissionManifestPrerequisitePublicationLockSha256,
  calibrationAdmissionManifestPrerequisitePublicationRequestSha256,
  calibrationAdmissionManifestPrerequisitePublicationTransactionSha256,
  calibrationAdmissionManifestPrerequisiteStagingSetSha256,
  calibrationAdmissionManifestPublicationLockSha256,
  calibrationAdmissionManifestPublicationTransactionSha256,
  calibrationAdmissionManifestPrerequisitePublicationCurrentSha256,
  isCalibrationAdmissionManifestBuildReceiptV1,
  isCalibrationAdmissionManifestCurrentV1,
  isCalibrationAdmissionManifestGenerationV1,
  isCalibrationAdmissionManifestPrerequisiteBundleV1,
  isCalibrationAdmissionManifestPrerequisitePublicationCompletionV1,
  isCalibrationAdmissionManifestPrerequisitePublicationCurrentV1,
  isCalibrationAdmissionManifestPrerequisitePublicationLockV1,
  isCalibrationAdmissionManifestPrerequisitePublicationRequestV1,
  isCalibrationAdmissionManifestPrerequisitePublicationTransactionV1,
  isCalibrationAdmissionManifestPrerequisiteStagingSetV1,
  isCalibrationAdmissionManifestPublicationLockV1,
  isCalibrationAdmissionManifestPublicationTransactionV1,
} from '../src/calibration-admission-manifest-prerequisites';

const root = fileURLToPath(new URL('..', import.meta.url));
const schemaRoot = join(root, 'schemas', 'v1');
const fixtureRoot = join(root, 'tests', 'fixtures', 'schema', 'valid');
const SHA = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const COMMIT = 'c'.repeat(40);

type JsonObject = Record<string, unknown>;

function schemaValidator(file: string) {
  const ajv = new Ajv({ allErrors: true, strict: true });
  for (const candidate of new Set([
    'calibration-nested-publication-handoff.schema.json',
    'calibration-admission-manifest-prerequisite-staging-set.schema.json',
    'calibration-admission-manifest-prerequisites.schema.json',
    file,
  ])) {
    if (candidate === file || candidate === 'calibration-nested-publication-handoff.schema.json'
      || candidate === 'calibration-admission-manifest-prerequisite-staging-set.schema.json'
      || candidate === 'calibration-admission-manifest-prerequisites.schema.json') {
      ajv.addSchema(JSON.parse(readFileSync(join(schemaRoot, candidate), 'utf8')) as object);
    }
  }
  const schema = JSON.parse(readFileSync(join(schemaRoot, file), 'utf8')) as { $id?: string };
  return ajv.getSchema(schema.$id!)!;
}

function handoff(): JsonObject {
  return JSON.parse(readFileSync(join(fixtureRoot, 'calibration-nested-publication-handoff.valid.json'), 'utf8')) as JsonObject;
}

function artifact(): JsonObject {
  return {
    artifactId: 'release-plan-artifact',
    relativePath: 'plans/release.md',
    bytes: 12,
    sha256: SHA,
    kind: 'release_plan',
    owner: 'release_asset_plan',
    mediaType: 'text/markdown',
    schemaId: null,
  };
}

function bundle(): JsonObject {
  const body: JsonObject = {
    version: 'v10.3-admission-manifest-prerequisites-v1',
    bundleId: 'bundle-1',
    implementationCommitSha: COMMIT,
    manifestBuilder: { behaviorSha256: SHA, artifactId: 'manifest-builder-artifact' },
    releaseMaterializationTasks1To6: {
      approvedCommitSha: COMMIT,
      planArtifactId: 'release-plan-artifact',
      approvalReceiptArtifactId: 'release-approval-artifact',
    },
    scoreWireClosure: { approvedCommitSha: COMMIT, closureReceiptArtifactId: 'score-wire-artifact' },
    runLifecycleVerification: {
      approvedCommitSha: COMMIT,
      runInitReceiptArtifactId: 'run-init-artifact',
      postScanReceiptArtifactId: 'post-scan-artifact',
    },
    packedRuntimes: [
      { nodeMajor: 22, tarballArtifactId: 'tarball-package', receiptArtifactId: 'runtime-node-22' },
      { nodeMajor: 24, tarballArtifactId: 'tarball-package', receiptArtifactId: 'runtime-node-24' },
    ],
    referencedArtifacts: [artifact()],
    referencedArtifactSetSha256: '',
  };
  body.referencedArtifactSetSha256 = calibrationAdmissionManifestPrerequisiteArtifactSetSha256(body.referencedArtifacts);
  return { ...body, bundleSha256: calibrationAdmissionManifestPrerequisiteBundleSha256(body) };
}

function stagingSet(): JsonObject {
  const body: JsonObject = {
    version: 'v10.3-admission-manifest-prerequisite-staging-set-v1',
    entries: [{
      artifactId: 'release-plan-artifact',
      kind: 'release_plan',
      mediaType: 'text/markdown',
      normalizedRelativePath: 'plans/release.md',
      bytes: 12,
      sha256: SHA,
    }],
    stagingSetSha256: '',
  };
  body.stagingSetSha256 = calibrationAdmissionManifestPrerequisiteStagingSetSha256(body);
  return body;
}

function publicationRequest(): JsonObject {
  const body: JsonObject = {
    version: 'v10.3-admission-manifest-prerequisite-publication-request-v1',
    requestId: 'request-1',
    operation: 'create',
    expectedCurrentState: { kind: 'absent' },
    sourceArtifacts: [{
      ...artifact(),
      source: { sourceRoot: 'platform_commit', normalizedRelativePath: 'plans/release.md', approvedCommitSha: COMMIT },
    }],
    stagingSet: stagingSet(),
    bundle: bundle(),
    requestSha256: '',
  };
  body.requestSha256 = calibrationAdmissionManifestPrerequisitePublicationRequestSha256(body);
  return body;
}

function prerequisiteLock(): JsonObject {
  const request = publicationRequest();
  const body: JsonObject = {
    version: 'v10.3-admission-manifest-prerequisite-publication-lock-v1',
    lockId: 'lock-1',
    intendedTransactionId: 'transaction-1',
    invocationIntentId: SHA,
    requestId: request.requestId,
    requestSha256: request.requestSha256,
    operation: 'create',
    expectedCurrentState: { kind: 'absent' },
    nextBundleSha256: (request.bundle as JsonObject).bundleSha256,
    artifactSetSha256: (request.bundle as JsonObject).referencedArtifactSetSha256,
    recoveryNonce: SHA_B,
    lockSha256: '',
  };
  body.lockSha256 = calibrationAdmissionManifestPrerequisitePublicationLockSha256(body);
  return body;
}

function prerequisiteTransaction(): JsonObject {
  const request = publicationRequest();
  const body: JsonObject = {
    version: 'v10.3-admission-manifest-prerequisite-publication-transaction-v1',
    transactionId: 'transaction-1',
    lockSha256: prerequisiteLock().lockSha256,
    invocationIntentId: SHA,
    requestId: request.requestId,
    requestSha256: request.requestSha256,
    operation: 'create',
    expectedCurrentState: { kind: 'absent' },
    nextBundleSha256: (request.bundle as JsonObject).bundleSha256,
    artifactSetSha256: (request.bundle as JsonObject).referencedArtifactSetSha256,
    requestTemporaryRelativePath: 'transactions/transaction-1/request.tmp.json',
    requestFinalRelativePath: 'requests/request-1.json',
    artifacts: [{
      artifactId: 'release-plan-artifact',
      stagedRelativePath: 'transactions/transaction-1/artifacts/release-plan.tmp',
      finalRelativePath: 'artifacts/release_plan/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      bytes: 12,
      sha256: SHA,
    }],
    bundleTemporaryRelativePath: 'transactions/transaction-1/bundle.tmp.json',
    bundleFinalRelativePath: 'bundles/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json',
    projectionTemporaryRelativePath: 'transactions/transaction-1/projection.tmp.json',
    projectionFinalRelativePath: 'review/admission/manifest-prerequisites/bundle.json',
    completionTemporaryRelativePath: 'transactions/transaction-1/completion.tmp.json',
    publicationCurrentTemporaryRelativePath: 'transactions/transaction-1/current.tmp.json',
    publicationCurrentFinalRelativePath: 'review/admission/manifest-prerequisites/publications/current.json',
    recoveryNonce: SHA_B,
    state: { phase: 'intent_fsynced' },
    transactionSha256: '',
  };
  body.transactionSha256 = calibrationAdmissionManifestPrerequisitePublicationTransactionSha256(body);
  return body;
}

function prerequisiteCompletion(): JsonObject {
  const body: JsonObject = {
    version: 'v10.3-admission-manifest-prerequisite-publication-completion-v1',
    requestId: 'request-1',
    requestSha256: SHA,
    requestRelativePath: 'requests/request-1.json',
    transactionId: 'transaction-1',
    invocationIntentId: SHA,
    bundleRelativePath: 'bundles/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json',
    bundleSha256: SHA,
    artifactSetSha256: SHA_B,
    namedPrimaryOutputProjectionSha256: SHA,
    publicationToolReceiptId: 'publication-receipt-1',
    publicationToolReceiptSha256: SHA_B,
    toolAuthorityIndexSha256: SHA,
    nestedHandoff: handoff(),
    completionSha256: '',
  };
  body.completionSha256 = calibrationAdmissionManifestPrerequisitePublicationCompletionSha256(body);
  return body;
}

function prerequisiteCurrent(): JsonObject {
  const body: JsonObject = {
    version: 'v10.3-admission-manifest-prerequisite-publication-current-v1',
    bundleRelativePath: 'bundles/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json',
    bundleSha256: SHA,
    completionRelativePath: 'publications/completions/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json',
    completionSha256: SHA_B,
    currentSha256: '',
  };
  body.currentSha256 = calibrationAdmissionManifestPrerequisitePublicationCurrentSha256(body);
  return body;
}

function buildReceipt(): JsonObject {
  const body: JsonObject = {
    version: 'v10.3-admission-manifest-build-receipt-v1',
    receiptId: 'build-receipt-1',
    manifestId: 'v10.3-admission-smoke',
    manifestSha256: SHA,
    manifestRelativePath: 'manifest.json',
    prerequisiteBundleSha256: SHA,
    prerequisiteBundleRelativePath: 'review/admission/manifest-prerequisites/bundle.json',
    prerequisitePublicationCompletionSha256: SHA_B,
    prerequisitePublicationCompletionRelativePath: 'review/admission/manifest-prerequisites/publications/completions/completion.json',
    prerequisitePublicationRequestSha256: SHA,
    prerequisitePublicationRequestRelativePath: 'review/admission/manifest-prerequisites/requests/request.json',
    manifestBuilderBehaviorSha256: SHA_B,
    packedRuntimeReceiptSetSha256: SHA,
    readyCensusSha256: SHA_B,
    witnessReviewBundleSha256: SHA,
    invocationIntentId: SHA,
    toolReceiptSha256: SHA_B,
    nestedHandoff: handoff(),
    expectedCurrentState: { kind: 'absent' },
    transactionId: 'manifest-transaction-1',
    receiptSha256: '',
  };
  body.receiptSha256 = calibrationAdmissionManifestBuildReceiptSha256(body);
  return body;
}

function generation(): JsonObject {
  const body: JsonObject = {
    version: 'v10.3-admission-manifest-generation-v1',
    manifestId: 'v10.3-admission-smoke',
    generation: 1,
    manifestSha256: SHA,
    manifestRelativePath: 'manifest.json',
    buildReceiptSha256: SHA_B,
    buildReceiptRelativePath: 'build-receipt.json',
    generationSha256: '',
  };
  body.generationSha256 = calibrationAdmissionManifestGenerationSha256(body);
  return body;
}

function manifestCurrent(): JsonObject {
  const body: JsonObject = {
    version: 'v10.3-admission-manifest-current-v1',
    manifestId: 'v10.3-admission-smoke',
    generation: 1,
    generationSha256: SHA,
    generationRelativePath: 'generations/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/generation.json',
    currentSha256: '',
  };
  body.currentSha256 = calibrationAdmissionManifestCurrentSha256(body);
  return body;
}

function manifestLock(): JsonObject {
  const body: JsonObject = {
    version: 'v10.3-admission-manifest-publication-lock-v1',
    lockId: 'manifest-lock-1',
    intendedTransactionId: 'manifest-transaction-1',
    invocationIntentId: SHA,
    manifestId: 'v10.3-admission-smoke',
    operation: 'create',
    expectedCurrentState: { kind: 'absent' },
    manifestSha256: SHA,
    prerequisiteBundleSha256: SHA_B,
    recoveryNonce: SHA,
    lockSha256: '',
  };
  body.lockSha256 = calibrationAdmissionManifestPublicationLockSha256(body);
  return body;
}

function manifestTransaction(): JsonObject {
  const body: JsonObject = {
    version: 'v10.3-admission-manifest-publication-transaction-v1',
    transactionId: 'manifest-transaction-1',
    lockSha256: manifestLock().lockSha256,
    invocationIntentId: SHA,
    manifestId: 'v10.3-admission-smoke',
    operation: 'create',
    expectedCurrentState: { kind: 'absent' },
    manifestSha256: SHA,
    prerequisiteBundleSha256: SHA_B,
    manifestStagingRelativePath: 'transactions/manifest-transaction-1/manifest.tmp.json',
    buildReceiptStagingRelativePath: 'transactions/manifest-transaction-1/build-receipt.tmp.json',
    generationLeafNames: ['manifest.json', 'build-receipt.json', 'generation.json'],
    recoveryNonce: SHA,
    state: { phase: 'intent_fsynced' },
    transactionSha256: '',
  };
  body.transactionSha256 = calibrationAdmissionManifestPublicationTransactionSha256(body);
  return body;
}

const cases = [
  ['calibration-admission-manifest-prerequisites.schema.json', bundle, isCalibrationAdmissionManifestPrerequisiteBundleV1],
  ['calibration-admission-manifest-prerequisite-staging-set.schema.json', stagingSet, isCalibrationAdmissionManifestPrerequisiteStagingSetV1],
  ['calibration-admission-manifest-prerequisite-publication-request.schema.json', publicationRequest, isCalibrationAdmissionManifestPrerequisitePublicationRequestV1],
  ['calibration-admission-manifest-prerequisite-publication-lock.schema.json', prerequisiteLock, isCalibrationAdmissionManifestPrerequisitePublicationLockV1],
  ['calibration-admission-manifest-prerequisite-publication-transaction.schema.json', prerequisiteTransaction, isCalibrationAdmissionManifestPrerequisitePublicationTransactionV1],
  ['calibration-admission-manifest-prerequisite-publication-completion.schema.json', prerequisiteCompletion, isCalibrationAdmissionManifestPrerequisitePublicationCompletionV1],
  ['calibration-admission-manifest-prerequisite-publication-current.schema.json', prerequisiteCurrent, isCalibrationAdmissionManifestPrerequisitePublicationCurrentV1],
  ['calibration-admission-manifest-build-receipt.schema.json', buildReceipt, isCalibrationAdmissionManifestBuildReceiptV1],
  ['calibration-admission-manifest-generation.schema.json', generation, isCalibrationAdmissionManifestGenerationV1],
  ['calibration-admission-manifest-current.schema.json', manifestCurrent, isCalibrationAdmissionManifestCurrentV1],
  ['calibration-admission-manifest-publication-lock.schema.json', manifestLock, isCalibrationAdmissionManifestPublicationLockV1],
  ['calibration-admission-manifest-publication-transaction.schema.json', manifestTransaction, isCalibrationAdmissionManifestPublicationTransactionV1],
] as const;

describe('Task 9B Core manifest contract foundation', () => {
  it.each(cases)('accepts a schema-valid, self-hashed %s', (schemaFile, build, isValid) => {
    const value = build();
    const validate = schemaValidator(schemaFile);
    expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
    expect(isValid(value)).toBe(true);
  });

  it.each(cases)('rejects unknown keys and self-hash mutation in %s', (schemaFile, build, isValid) => {
    const validate = schemaValidator(schemaFile);
    const unknown = build();
    unknown.unreviewedShortcut = true;
    expect(validate(unknown)).toBe(false);
    expect(isValid(unknown)).toBe(false);

    const mutated = build();
    for (const key of ['bundleSha256', 'stagingSetSha256', 'requestSha256', 'lockSha256', 'transactionSha256', 'completionSha256', 'currentSha256', 'receiptSha256', 'generationSha256']) {
      if (key in mutated) {
        mutated[key] = SHA_B;
        break;
      }
    }
    expect(validate(mutated)).toBe(true);
    expect(isValid(mutated)).toBe(false);
  });

  it('rejects schema substitution between prerequisite and manifest lifecycle kinds', () => {
    const value = bundle();
    expect(schemaValidator('calibration-admission-manifest-generation.schema.json')(value)).toBe(false);
    expect(isCalibrationAdmissionManifestGenerationV1(value)).toBe(false);
    expect(isCalibrationAdmissionManifestPrerequisiteBundleV1(generation())).toBe(false);
  });

  it('requires Node 22 and Node 24 to share one content-addressed package tarball', () => {
    const value = bundle();
    const mutated = {
      ...value,
      packedRuntimes: [
        ...(value.packedRuntimes as JsonObject[]).slice(0, 1),
        { ...(value.packedRuntimes as JsonObject[])[1], tarballArtifactId: 'different-package-tarball' },
      ],
      bundleSha256: '',
    } as JsonObject;
    mutated.bundleSha256 = calibrationAdmissionManifestPrerequisiteBundleSha256(mutated);
    expect(isCalibrationAdmissionManifestPrerequisiteBundleV1(mutated)).toBe(false);
  });
});
