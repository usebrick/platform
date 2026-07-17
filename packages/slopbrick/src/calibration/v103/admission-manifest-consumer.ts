/**
 * Read-only consumer boundary for an admission-backed v10.3.2 manifest.
 *
 * A manifest reference is routing data, not authority.  This module follows
 * the named, immutable graph from the manifest current pointer and verifies
 * every hash and semantic contract in the same process before exposing a
 * private branded value.  The brand is deliberately held in a module-private
 * WeakSet: JSON round-trips, casts, and object clones cannot manufacture it.
 */
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { join, posix, relative, resolve, sep } from 'node:path';

import {
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionManifestCurrentSha256,
  calibrationAdmissionManifestGenerationSha256,
  calibrationAdmissionSha256,
  isCalibrationAdmissionManifestBuildReceiptV1,
  isCalibrationAdmissionManifestCurrentV1,
  isCalibrationAdmissionManifestGenerationV1,
  isCalibrationAdmissionManifestPrerequisiteBundleV1,
  isCalibrationAdmissionManifestPrerequisitePublicationCompletionV1,
  isCalibrationAdmissionManifestPrerequisitePublicationRequestV1,
  isCalibrationCorpusManifestV103,
  type CalibrationAdmissionManifestBuildReceiptV1,
  type CalibrationAdmissionManifestCurrentV1,
  type CalibrationAdmissionManifestGenerationV1,
  type CalibrationAdmissionManifestPrerequisiteBundleV1,
  type CalibrationAdmissionManifestPrerequisitePublicationCompletionV1,
  type CalibrationAdmissionManifestPrerequisitePublicationRequestV1,
  type SlopbrickCalibrationCorpusManifestV103,
} from '@usebrick/core';

export type AdmissionManifestId = 'v10.3-admission-smoke' | 'v10.3-admission-canary';

/** The compact routing object emitted by `manifest:verify`. */
export interface CalibrationAdmissionManifestReferenceV1 {
  readonly version: 'v10.3-admission-manifest-reference-v1';
  readonly manifestId: AdmissionManifestId;
  readonly currentRelativePath: string;
  readonly currentSha256: string;
  readonly generationRelativePath: string;
  readonly generationSha256: string;
  readonly buildReceiptRelativePath: string;
  readonly buildReceiptSha256: string;
  readonly manifestRelativePath: string;
  readonly manifestSha256: string;
  readonly referenceSha256: string;
}

export interface OpenAdmissionManifestForConsumerInput {
  readonly root: string;
  readonly manifestId: string;
  readonly manifestReference: unknown;
  readonly expectedManifestSha256: string;
}

declare const verifiedAdmissionManifestBrand: unique symbol;

/** A value returned only after the complete immutable graph has been verified. */
export type VerifiedAdmissionManifestV1 = Readonly<{
  readonly manifest: SlopbrickCalibrationCorpusManifestV103;
  readonly reference: CalibrationAdmissionManifestReferenceV1;
  readonly [verifiedAdmissionManifestBrand]: true;
}>;

const verifiedValues = new WeakSet<object>();
const SHA256 = /^[a-f0-9]{64}$/u;
const RELATIVE_PATH = /^(?!\/)(?!.*\\)(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*\/\/)[^\u0000-\u001f]+$/u;
const MANIFEST_REFERENCE_VERSION = 'v10.3-admission-manifest-reference-v1';
const PREREQUISITE_ROOT = 'review/admission/manifest-prerequisites';

type JsonObject = Record<string, unknown>;

export class AdmissionManifestConsumerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdmissionManifestConsumerError';
  }
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: JsonObject, keys: readonly string[]): boolean {
  const expected = new Set(keys);
  return Object.keys(value).length === expected.size && Object.keys(value).every((key) => expected.has(key));
}

function isSha(value: unknown): value is string {
  return typeof value === 'string' && SHA256.test(value);
}

function isRelativePath(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 4096 && RELATIVE_PATH.test(value);
}

function isManifestId(value: unknown): value is AdmissionManifestId {
  return value === 'v10.3-admission-smoke' || value === 'v10.3-admission-canary';
}

function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(calibrationAdmissionCanonicalJson(value), 'utf8');
}

function withoutKey(value: JsonObject, key: string): JsonObject {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

function freezeDeep<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as JsonObject)) freezeDeep(child);
  return Object.freeze(value);
}

function inside(root: string, candidate: string): boolean {
  const candidateRelative = relative(root, candidate);
  return candidateRelative === ''
    || (!candidateRelative.startsWith(`..${sep}`) && candidateRelative !== '..' && !candidateRelative.startsWith('/'));
}

/** Reject symlinks and non-directory path components before every read. */
async function assertNoSymlinkPath(root: string, candidate: string): Promise<void> {
  const rootResolved = resolve(root);
  const candidateResolved = resolve(candidate);
  if (!inside(rootResolved, candidateResolved)) throw new AdmissionManifestConsumerError('admission manifest path escapes root');
  const relativePathValue = relative(rootResolved, candidateResolved);
  let current = rootResolved;
  for (const [index, segment] of relativePathValue.split(sep).filter(Boolean).entries()) {
    current = join(current, segment);
    let metadata;
    try {
      metadata = await lstat(current);
    } catch (error) {
      const code = (error as { readonly code?: string }).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') throw new AdmissionManifestConsumerError('admission manifest graph path is missing');
      throw error;
    }
    if (metadata.isSymbolicLink()) throw new AdmissionManifestConsumerError('admission manifest graph contains a symlink');
    if (index < relativePathValue.split(sep).filter(Boolean).length - 1 && !metadata.isDirectory()) {
      throw new AdmissionManifestConsumerError('admission manifest graph contains a non-directory path component');
    }
  }
}

async function canonicalRoot(rootInput: string): Promise<string> {
  let root: string;
  try {
    root = await realpath(resolve(rootInput));
  } catch {
    throw new AdmissionManifestConsumerError('admission manifest root is unavailable');
  }
  const metadata = await lstat(root);
  if (!metadata.isDirectory()) throw new AdmissionManifestConsumerError('admission manifest root is not a directory');
  return root;
}

function rootRelative(root: string, pathValue: string): string {
  if (!isRelativePath(pathValue)) throw new AdmissionManifestConsumerError('admission manifest graph path is invalid');
  const absolute = resolve(root, pathValue);
  if (!inside(root, absolute)) throw new AdmissionManifestConsumerError('admission manifest graph path escapes root');
  return absolute;
}

async function readBytes(root: string, pathValue: string, label: string): Promise<{ readonly bytes: Buffer; readonly sha256: string }> {
  const absolute = rootRelative(root, pathValue);
  await assertNoSymlinkPath(root, absolute);
  const metadata = await lstat(absolute);
  if (!metadata.isFile()) throw new AdmissionManifestConsumerError(`${label} is not a regular file`);
  const bytes = await readFile(absolute);
  return { bytes, sha256: hashBytes(bytes) };
}

async function readCanonicalJson<T>(root: string, pathValue: string, label: string): Promise<{ readonly value: T; readonly bytes: Buffer; readonly sha256: string }> {
  const read = await readBytes(root, pathValue, label);
  let value: unknown;
  try {
    value = JSON.parse(read.bytes.toString('utf8')) as unknown;
  } catch {
    throw new AdmissionManifestConsumerError(`${label} is not valid JSON`);
  }
  if (!Buffer.from(canonicalBytes(value)).equals(read.bytes)) {
    throw new AdmissionManifestConsumerError(`${label} is not canonical JSON`);
  }
  return { value: value as T, bytes: read.bytes, sha256: read.sha256 };
}

async function verifyGenerationDirectory(root: string, generationFile: string): Promise<void> {
  const generationDirectory = posix.dirname(generationFile);
  const absolute = rootRelative(root, generationDirectory);
  await assertNoSymlinkPath(root, absolute);
  const entries = await readdir(absolute, { withFileTypes: true });
  const expected = new Set(['generation.json', 'build-receipt.json', 'manifest.json']);
  if (entries.length !== expected.size || entries.some((entry) => !entry.isFile() || !expected.has(entry.name))) {
    throw new AdmissionManifestConsumerError('manifest generation contains an orphan or missing leaf');
  }
}

function parseReference(value: unknown): CalibrationAdmissionManifestReferenceV1 {
  let parsed = value;
  const serialized = typeof value === 'string' ? value : undefined;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      throw new AdmissionManifestConsumerError('manifest reference is not valid JSON');
    }
  }
  if (!isRecord(parsed) || !exactKeys(parsed, [
    'version', 'manifestId', 'currentRelativePath', 'currentSha256',
    'generationRelativePath', 'generationSha256', 'buildReceiptRelativePath',
    'buildReceiptSha256', 'manifestRelativePath', 'manifestSha256', 'referenceSha256',
  ]) || parsed.version !== MANIFEST_REFERENCE_VERSION || !isManifestId(parsed.manifestId)
    || !isRelativePath(parsed.currentRelativePath) || !isSha(parsed.currentSha256)
    || !isRelativePath(parsed.generationRelativePath) || !isSha(parsed.generationSha256)
    || !isRelativePath(parsed.buildReceiptRelativePath) || !isSha(parsed.buildReceiptSha256)
    || !isRelativePath(parsed.manifestRelativePath) || !isSha(parsed.manifestSha256)
    || !isSha(parsed.referenceSha256)) {
    throw new AdmissionManifestConsumerError('manifest reference contract is invalid');
  }
  if (calibrationAdmissionSha256(withoutKey(parsed, 'referenceSha256')) !== parsed.referenceSha256) {
    throw new AdmissionManifestConsumerError('manifest reference self-hash is invalid');
  }
  if (serialized !== undefined && serialized !== calibrationAdmissionCanonicalJson(parsed)) {
    throw new AdmissionManifestConsumerError('manifest reference is not canonical');
  }
  return parsed as unknown as CalibrationAdmissionManifestReferenceV1;
}

function assertHashField(value: JsonObject, field: string, label: string): void {
  const declared = value[field];
  if (!isSha(declared)) throw new AdmissionManifestConsumerError(`${label} hash is invalid`);
  const expected = calibrationAdmissionSha256(withoutKey(value, field));
  if (expected !== declared) throw new AdmissionManifestConsumerError(`${label} self-hash is invalid`);
}

function resolveGenerationFile(currentPath: string, generationRelativePath: string): string {
  const currentDirectory = posix.dirname(currentPath);
  const pointerPath = posix.join(currentDirectory, generationRelativePath);
  return pointerPath.endsWith('.json') ? pointerPath : posix.join(pointerPath, 'generation.json');
}

function requireSamePath(actual: string, expected: string, label: string): void {
  if (actual !== expected) throw new AdmissionManifestConsumerError(`${label} path is not anchored to its parent record`);
}

function artifactIdSet(bundle: CalibrationAdmissionManifestPrerequisiteBundleV1): Set<string> {
  return new Set(bundle.referencedArtifacts.map((artifact) => artifact.artifactId));
}

async function verifyPrerequisiteArtifacts(root: string, bundle: CalibrationAdmissionManifestPrerequisiteBundleV1): Promise<void> {
  const artifacts = new Map(bundle.referencedArtifacts.map((artifact) => [artifact.artifactId, artifact]));
  const required = [
    bundle.manifestBuilder.artifactId,
    bundle.releaseMaterializationTasks1To6.planArtifactId,
    bundle.releaseMaterializationTasks1To6.approvalReceiptArtifactId,
    bundle.scoreWireClosure.closureReceiptArtifactId,
    bundle.runLifecycleVerification.runInitReceiptArtifactId,
    bundle.runLifecycleVerification.postScanReceiptArtifactId,
    ...bundle.packedRuntimes.flatMap((runtime) => [runtime.tarballArtifactId, runtime.receiptArtifactId]),
  ];
  for (const artifactId of required) {
    if (!artifacts.has(artifactId)) throw new AdmissionManifestConsumerError(`prerequisite artifact ${artifactId} is not referenced`);
  }
  const builder = artifacts.get(bundle.manifestBuilder.artifactId)!;
  if (builder.kind !== 'manifest_builder' || builder.sha256 !== bundle.manifestBuilder.behaviorSha256) {
    throw new AdmissionManifestConsumerError('manifest builder artifact is not bound to its behavior hash');
  }
  for (const artifact of bundle.referencedArtifacts) {
    if (!artifact.relativePath.startsWith(`${PREREQUISITE_ROOT}/`)) {
      throw new AdmissionManifestConsumerError(`prerequisite artifact path is outside ${PREREQUISITE_ROOT}`);
    }
    const read = await readBytes(root, artifact.relativePath, `prerequisite artifact ${artifact.artifactId}`);
    if (read.bytes.byteLength !== artifact.bytes || read.sha256 !== artifact.sha256) {
      throw new AdmissionManifestConsumerError(`prerequisite artifact ${artifact.artifactId} bytes do not match its receipt`);
    }
  }
}

function assertReferencePaths(reference: CalibrationAdmissionManifestReferenceV1, manifestId: AdmissionManifestId): void {
  const manifestRoot = `manifests/${manifestId}`;
  requireSamePath(reference.currentRelativePath, `${manifestRoot}/current.json`, 'manifest current');
}

function assertPrerequisiteRelations(
  buildReceipt: CalibrationAdmissionManifestBuildReceiptV1,
  completion: CalibrationAdmissionManifestPrerequisitePublicationCompletionV1,
  request: CalibrationAdmissionManifestPrerequisitePublicationRequestV1,
  bundle: CalibrationAdmissionManifestPrerequisiteBundleV1,
): void {
  if (buildReceipt.prerequisiteBundleSha256 !== bundle.bundleSha256
    || buildReceipt.prerequisitePublicationCompletionSha256 !== completion.completionSha256
    || buildReceipt.prerequisitePublicationRequestSha256 !== request.requestSha256
    || buildReceipt.manifestBuilderBehaviorSha256 !== bundle.manifestBuilder.behaviorSha256) {
    throw new AdmissionManifestConsumerError('build receipt is not bound to the prerequisite graph');
  }
  requireSamePath(buildReceipt.prerequisiteBundleRelativePath, completion.bundleRelativePath, 'prerequisite bundle');
  requireSamePath(completion.requestRelativePath, buildReceipt.prerequisitePublicationRequestRelativePath, 'prerequisite request');
  if (completion.requestSha256 !== request.requestSha256 || completion.bundleSha256 !== bundle.bundleSha256
    || completion.artifactSetSha256 !== bundle.referencedArtifactSetSha256
    || request.bundle.bundleSha256 !== bundle.bundleSha256
    || calibrationAdmissionCanonicalJson(request.bundle) !== calibrationAdmissionCanonicalJson(bundle)) {
    throw new AdmissionManifestConsumerError('prerequisite request/completion/bundle relation is invalid');
  }
  const ids = artifactIdSet(bundle);
  const requestIds = new Set(request.sourceArtifacts.map((artifact) => artifact.artifactId));
  if (ids.size !== requestIds.size || [...ids].some((id) => !requestIds.has(id))) {
    throw new AdmissionManifestConsumerError('prerequisite artifact set is not closed');
  }
}

/** Return true only for the exact value returned by this module's verifier. */
export function isVerifiedAdmissionManifest(value: unknown): value is VerifiedAdmissionManifestV1 {
  return typeof value === 'object' && value !== null && verifiedValues.has(value);
}

/**
 * Open and verify one admission manifest. No output or mutation is performed.
 */
export async function openAdmissionManifestForConsumer(
  input: OpenAdmissionManifestForConsumerInput,
): Promise<VerifiedAdmissionManifestV1> {
  if (!isManifestId(input.manifestId) || !isSha(input.expectedManifestSha256)) {
    throw new AdmissionManifestConsumerError('manifest consumer input is invalid');
  }
  const reference = parseReference(input.manifestReference);
  if (reference.manifestId !== input.manifestId || reference.manifestSha256 !== input.expectedManifestSha256) {
    throw new AdmissionManifestConsumerError('manifest reference does not match the requested manifest');
  }
  assertReferencePaths(reference, input.manifestId);
  const root = await canonicalRoot(input.root);

  const currentRead = await readCanonicalJson<CalibrationAdmissionManifestCurrentV1>(root, reference.currentRelativePath, 'manifest current');
  if (!isCalibrationAdmissionManifestCurrentV1(currentRead.value)
    || currentRead.value.manifestId !== input.manifestId
    || currentRead.value.currentSha256 !== reference.currentSha256
    || currentRead.value.currentSha256 !== calibrationAdmissionManifestCurrentSha256(currentRead.value)) {
    throw new AdmissionManifestConsumerError('manifest current pointer is invalid or stale');
  }
  assertHashField(currentRead.value as unknown as JsonObject, 'currentSha256', 'manifest current');

  const generationFile = resolveGenerationFile(reference.currentRelativePath, currentRead.value.generationRelativePath);
  await verifyGenerationDirectory(root, generationFile);
  const generationRead = await readCanonicalJson<CalibrationAdmissionManifestGenerationV1>(root, generationFile, 'manifest generation');
  requireSamePath(reference.generationRelativePath, generationFile, 'manifest generation');
  if (!isCalibrationAdmissionManifestGenerationV1(generationRead.value)
    || generationRead.value.manifestId !== input.manifestId
    || generationRead.value.generation !== currentRead.value.generation
    || generationRead.value.generationSha256 !== currentRead.value.generationSha256
    || generationRead.value.generationSha256 !== reference.generationSha256
    || generationRead.value.manifestSha256 !== reference.manifestSha256
    || generationRead.value.generationSha256 !== calibrationAdmissionManifestGenerationSha256(generationRead.value)) {
    throw new AdmissionManifestConsumerError('manifest generation is invalid or not anchored to current');
  }
  assertHashField(generationRead.value as unknown as JsonObject, 'generationSha256', 'manifest generation');

  const generationDirectory = posix.dirname(generationFile);
  const buildReceiptPath = posix.join(generationDirectory, generationRead.value.buildReceiptRelativePath);
  const manifestPath = posix.join(generationDirectory, generationRead.value.manifestRelativePath);
  requireSamePath(reference.buildReceiptRelativePath, buildReceiptPath, 'manifest build receipt');
  requireSamePath(reference.manifestRelativePath, manifestPath, 'manifest leaf');

  const buildReceiptRead = await readCanonicalJson<CalibrationAdmissionManifestBuildReceiptV1>(root, buildReceiptPath, 'manifest build receipt');
  if (!isCalibrationAdmissionManifestBuildReceiptV1(buildReceiptRead.value)
    || buildReceiptRead.value.manifestId !== input.manifestId
    || buildReceiptRead.value.manifestSha256 !== reference.manifestSha256
    || buildReceiptRead.value.manifestRelativePath !== 'manifest.json'
    || buildReceiptRead.value.receiptSha256 !== generationRead.value.buildReceiptSha256
    || buildReceiptRead.value.receiptSha256 !== reference.buildReceiptSha256) {
    throw new AdmissionManifestConsumerError('manifest build receipt is invalid or not anchored');
  }
  assertHashField(buildReceiptRead.value as unknown as JsonObject, 'receiptSha256', 'manifest build receipt');

  const manifestRead = await readCanonicalJson<SlopbrickCalibrationCorpusManifestV103>(root, manifestPath, 'manifest leaf');
  if (!isCalibrationCorpusManifestV103(manifestRead.value)
    || manifestRead.value.methodVersion !== 'v10.3.2'
    || manifestRead.sha256 !== reference.manifestSha256) {
    throw new AdmissionManifestConsumerError('manifest leaf is not a valid admission-backed v10.3.2 manifest');
  }

  const completionRead = await readCanonicalJson<CalibrationAdmissionManifestPrerequisitePublicationCompletionV1>(
    root,
    buildReceiptRead.value.prerequisitePublicationCompletionRelativePath,
    'prerequisite publication completion',
  );
  if (!isCalibrationAdmissionManifestPrerequisitePublicationCompletionV1(completionRead.value)
    || completionRead.value.completionSha256 !== buildReceiptRead.value.prerequisitePublicationCompletionSha256) {
    throw new AdmissionManifestConsumerError('prerequisite publication completion is invalid');
  }
  assertHashField(completionRead.value as unknown as JsonObject, 'completionSha256', 'prerequisite publication completion');

  const requestRead = await readCanonicalJson<CalibrationAdmissionManifestPrerequisitePublicationRequestV1>(
    root,
    buildReceiptRead.value.prerequisitePublicationRequestRelativePath,
    'prerequisite publication request',
  );
  if (!isCalibrationAdmissionManifestPrerequisitePublicationRequestV1(requestRead.value)
    || requestRead.value.requestSha256 !== buildReceiptRead.value.prerequisitePublicationRequestSha256) {
    throw new AdmissionManifestConsumerError('prerequisite publication request is invalid');
  }
  assertHashField(requestRead.value as unknown as JsonObject, 'requestSha256', 'prerequisite publication request');

  const bundleRead = await readCanonicalJson<CalibrationAdmissionManifestPrerequisiteBundleV1>(
    root,
    completionRead.value.bundleRelativePath,
    'prerequisite bundle',
  );
  if (!isCalibrationAdmissionManifestPrerequisiteBundleV1(bundleRead.value)
    || bundleRead.value.bundleSha256 !== buildReceiptRead.value.prerequisiteBundleSha256) {
    throw new AdmissionManifestConsumerError('prerequisite bundle is invalid');
  }
  assertHashField(bundleRead.value as unknown as JsonObject, 'bundleSha256', 'prerequisite bundle');
  assertPrerequisiteRelations(buildReceiptRead.value, completionRead.value, requestRead.value, bundleRead.value);
  await verifyPrerequisiteArtifacts(root, bundleRead.value);

  const binding = manifestRead.value.admissionBinding;
  if (binding === null || binding === undefined
    || binding.prerequisiteBundleSha256 !== bundleRead.value.bundleSha256
    || binding.manifestBuilderBehaviorSha256 !== buildReceiptRead.value.manifestBuilderBehaviorSha256
    || binding.packedRuntimeReceiptSetSha256 !== buildReceiptRead.value.packedRuntimeReceiptSetSha256
    || binding.witnessReviewBundleSha256 !== buildReceiptRead.value.witnessReviewBundleSha256) {
    throw new AdmissionManifestConsumerError('manifest admission binding does not match verified graph');
  }

  // The current pointer is the mutable routing edge. Re-read it immediately
  // before exposing the branded value so an in-process pointer advance cannot
  // switch the consumer to a different valid generation after verification.
  const currentReread = await readCanonicalJson<CalibrationAdmissionManifestCurrentV1>(root, reference.currentRelativePath, 'manifest current');
  if (!isCalibrationAdmissionManifestCurrentV1(currentReread.value)
    || currentReread.value.currentSha256 !== reference.currentSha256
    || calibrationAdmissionManifestCurrentSha256(currentReread.value) !== reference.currentSha256
    || calibrationAdmissionCanonicalJson(currentReread.value) !== calibrationAdmissionCanonicalJson(currentRead.value)) {
    throw new AdmissionManifestConsumerError('manifest current pointer advanced during verification');
  }

  const result = freezeDeep({
    manifest: manifestRead.value,
    reference,
  }) as VerifiedAdmissionManifestV1;
  verifiedValues.add(result);
  return result;
}
