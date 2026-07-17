/**
 * Read-only verifier for the immutable prerequisite graph consumed by the
 * v10.3.2 manifest builder.
 *
 * The current publication pointer is deliberately not accepted here as
 * authority. Callers provide one complete historical reference, then this
 * module reopens every named byte and reconstructs the Core contracts in the
 * same process. Publication/current routing support is a separate boundary.
 */
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { gunzipSync } from 'node:zlib';

import {
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionManifestPrerequisiteArtifactSetSha256,
  calibrationAdmissionManifestPrerequisiteBundleSha256,
  calibrationAdmissionManifestPrerequisitePublicationCompletionSha256,
  calibrationAdmissionManifestPrerequisitePublicationRequestSha256,
  calibrationAdmissionManifestPrerequisiteStagingSetSha256,
  calibrationAdmissionSha256,
  calibrationPackedRuntimeReceiptSha256,
  calibrationReleasePrerequisiteApprovalSha256,
  calibrationRunLifecycleReceiptSha256,
  calibrationScoreWireClosureReceiptSha256,
  isCalibrationAdmissionManifestPrerequisitePublicationCompletionV1,
  isCalibrationAdmissionManifestPrerequisiteStagingSetV1,
  isCalibrationPackedRuntimeReceiptV1,
  isCalibrationReleasePrerequisiteApprovalV1,
  isCalibrationRunLifecycleReceiptV1,
  isCalibrationScoreWireClosureReceiptV1,
  type CalibrationAdmissionManifestPrerequisiteBundleV1,
  type CalibrationAdmissionManifestPrerequisitePublicationCompletionV1,
  type CalibrationAdmissionManifestPrerequisitePublicationRequestV1,
  validateCalibrationAdmissionManifestPrerequisiteBundleV1,
  validateCalibrationAdmissionManifestPrerequisitePublicationRequestV1,
} from '@usebrick/core';

const SHA256 = /^[a-f0-9]{64}$/u;
const RELATIVE_PATH = /^(?!\/)(?!.*\\)(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*\/\/)[^\u0000-\u001f]+$/u;
const PREREQUISITE_ROOT = 'review/admission/manifest-prerequisites';
const MAX_PREREQUISITE_BYTES = 64 * 1024 * 1024;

type JsonObject = Record<string, unknown>;
type PrerequisiteArtifact = CalibrationAdmissionManifestPrerequisiteBundleV1['referencedArtifacts'][number];
type SourceArtifact = CalibrationAdmissionManifestPrerequisitePublicationRequestV1['sourceArtifacts'][number];

export interface AdmissionManifestPrerequisiteReferenceV1 {
  readonly version: 'v10.3-admission-manifest-prerequisite-reference-v1';
  readonly bundleRelativePath: string;
  readonly bundleSha256: string;
  readonly completionRelativePath: string;
  readonly completionSha256: string;
  readonly requestRelativePath: string;
  readonly requestSha256: string;
  readonly referenceSha256: string;
}

export interface OpenAdmissionManifestPrerequisitesForConsumerInput {
  readonly root: string;
  readonly reference: unknown;
}

declare const verifiedPrerequisitesBrand: unique symbol;

export type VerifiedAdmissionManifestPrerequisitesV1 = Readonly<{
  readonly reference: AdmissionManifestPrerequisiteReferenceV1;
  readonly bundle: CalibrationAdmissionManifestPrerequisiteBundleV1;
  readonly completion: CalibrationAdmissionManifestPrerequisitePublicationCompletionV1;
  readonly request: CalibrationAdmissionManifestPrerequisitePublicationRequestV1;
  readonly [verifiedPrerequisitesBrand]: true;
}>;

const verifiedPrerequisites = new WeakSet<object>();

export class AdmissionManifestPrerequisiteVerifierError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'AdmissionManifestPrerequisiteVerifierError';
  }
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSha(value: unknown): value is string {
  return typeof value === 'string' && SHA256.test(value);
}

function isRelativePath(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 4096 && RELATIVE_PATH.test(value);
}

function withoutKey(value: JsonObject, key: string): JsonObject {
  const result = { ...value };
  delete result[key];
  return result;
}

function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(calibrationAdmissionCanonicalJson(value), 'utf8');
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value !== 'object' || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key], seen);
  }
  return Object.freeze(value);
}

function inside(root: string, candidate: string): boolean {
  const candidateRelative = relative(root, candidate);
  return candidateRelative === ''
    || (!candidateRelative.startsWith(`..${sep}`) && candidateRelative !== '..' && !candidateRelative.startsWith('/') && !candidateRelative.includes('\\'));
}

async function assertNoSymlinkPath(root: string, candidate: string): Promise<void> {
  const rootResolved = resolve(root);
  const candidateResolved = resolve(candidate);
  if (!inside(rootResolved, candidateResolved)) throw new AdmissionManifestPrerequisiteVerifierError('prerequisite path escapes root');
  const segments = relative(rootResolved, candidateResolved).split(sep).filter(Boolean);
  let current = rootResolved;
  for (const [index, segment] of segments.entries()) {
    current = `${current}${sep}${segment}`;
    let metadata;
    try {
      metadata = await lstat(current);
    } catch (error) {
      const code = (error as { readonly code?: string }).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') throw new AdmissionManifestPrerequisiteVerifierError('prerequisite path is missing');
      throw error;
    }
    if (metadata.isSymbolicLink()) throw new AdmissionManifestPrerequisiteVerifierError('prerequisite graph contains a symlink');
    if (index < segments.length - 1 && !metadata.isDirectory()) throw new AdmissionManifestPrerequisiteVerifierError('prerequisite graph contains a non-directory path component');
  }
}

async function canonicalRoot(input: string): Promise<string> {
  let root: string;
  try {
    root = await realpath(resolve(input));
  } catch {
    throw new AdmissionManifestPrerequisiteVerifierError('prerequisite root is unavailable');
  }
  const metadata = await lstat(root);
  if (!metadata.isDirectory()) throw new AdmissionManifestPrerequisiteVerifierError('prerequisite root is not a directory');
  return root;
}

function containedPath(root: string, pathValue: string): string {
  if (!isRelativePath(pathValue)) throw new AdmissionManifestPrerequisiteVerifierError('prerequisite path is invalid');
  const absolute = resolve(root, pathValue);
  if (!inside(root, absolute)) throw new AdmissionManifestPrerequisiteVerifierError('prerequisite path escapes root');
  return absolute;
}

async function readBytes(root: string, pathValue: string, label: string): Promise<{ readonly bytes: Buffer; readonly sha256: string }> {
  const absolute = containedPath(root, pathValue);
  await assertNoSymlinkPath(root, absolute);
  const metadata = await lstat(absolute);
  if (!metadata.isFile() || metadata.size > MAX_PREREQUISITE_BYTES) throw new AdmissionManifestPrerequisiteVerifierError(`${label} is not a bounded regular file`);
  let handle;
  try {
    handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size !== metadata.size || opened.size > MAX_PREREQUISITE_BYTES) throw new AdmissionManifestPrerequisiteVerifierError(`${label} changed or is not a bounded regular file`);
    const bytes = await handle.readFile();
    return { bytes, sha256: hashBytes(bytes) };
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function readCanonicalJson<T>(root: string, pathValue: string, label: string): Promise<{ readonly value: T; readonly bytes: Buffer; readonly sha256: string }> {
  const read = await readBytes(root, pathValue, label);
  let value: unknown;
  try {
    value = JSON.parse(read.bytes.toString('utf8')) as unknown;
  } catch {
    throw new AdmissionManifestPrerequisiteVerifierError(`${label} is not valid JSON`);
  }
  if (!Buffer.from(canonicalBytes(value)).equals(read.bytes)) throw new AdmissionManifestPrerequisiteVerifierError(`${label} is not canonical JSON`);
  return { value: value as T, bytes: read.bytes, sha256: read.sha256 };
}

function exactKeys(value: JsonObject, keys: readonly string[]): boolean {
  const expected = new Set(keys);
  return Object.keys(value).length === expected.size && Object.keys(value).every((key) => expected.has(key));
}

function parseReference(value: unknown): AdmissionManifestPrerequisiteReferenceV1 {
  const serialized = typeof value === 'string' ? value : undefined;
  let parsed = value;
  if (serialized !== undefined) {
    try {
      parsed = JSON.parse(serialized) as unknown;
    } catch {
      throw new AdmissionManifestPrerequisiteVerifierError('prerequisite reference is not valid JSON');
    }
  }
  if (!isRecord(parsed) || !exactKeys(parsed, [
    'version', 'bundleRelativePath', 'bundleSha256', 'completionRelativePath',
    'completionSha256', 'requestRelativePath', 'requestSha256', 'referenceSha256',
  ]) || parsed.version !== 'v10.3-admission-manifest-prerequisite-reference-v1'
    || !isRelativePath(parsed.bundleRelativePath) || !isSha(parsed.bundleSha256)
    || !isRelativePath(parsed.completionRelativePath) || !isSha(parsed.completionSha256)
    || !isRelativePath(parsed.requestRelativePath) || !isSha(parsed.requestSha256)
    || !isSha(parsed.referenceSha256)) {
    throw new AdmissionManifestPrerequisiteVerifierError('prerequisite reference contract is invalid');
  }
  if (calibrationAdmissionSha256(withoutKey(parsed, 'referenceSha256')) !== parsed.referenceSha256) {
    throw new AdmissionManifestPrerequisiteVerifierError('prerequisite reference self-hash is invalid');
  }
  if (serialized !== undefined && serialized !== calibrationAdmissionCanonicalJson(parsed)) {
    throw new AdmissionManifestPrerequisiteVerifierError('prerequisite reference is not canonical');
  }
  return parsed as unknown as AdmissionManifestPrerequisiteReferenceV1;
}

function assertSelfHash(value: JsonObject, field: string, label: string, hash: (value: unknown) => string): void {
  const declared = value[field];
  if (!isSha(declared) || hash(value) !== declared) throw new AdmissionManifestPrerequisiteVerifierError(`${label} self-hash is invalid`);
}

function assertGraphPaths(reference: AdmissionManifestPrerequisiteReferenceV1): void {
  for (const [label, pathValue] of [
    ['bundle', reference.bundleRelativePath],
    ['completion', reference.completionRelativePath],
    ['request', reference.requestRelativePath],
  ] as const) {
    if (!pathValue.startsWith(`${PREREQUISITE_ROOT}/`)) throw new AdmissionManifestPrerequisiteVerifierError(`${label} path is outside the prerequisite root`);
  }
}

function artifactById(bundle: CalibrationAdmissionManifestPrerequisiteBundleV1): Map<string, PrerequisiteArtifact> {
  return new Map(bundle.referencedArtifacts.map((artifact) => [artifact.artifactId, artifact]));
}

function requiredArtifactIds(bundle: CalibrationAdmissionManifestPrerequisiteBundleV1): readonly string[] {
  return [
    bundle.manifestBuilder.artifactId,
    bundle.releaseMaterializationTasks1To6.planArtifactId,
    bundle.releaseMaterializationTasks1To6.approvalReceiptArtifactId,
    bundle.scoreWireClosure.closureReceiptArtifactId,
    bundle.runLifecycleVerification.runInitReceiptArtifactId,
    bundle.runLifecycleVerification.postScanReceiptArtifactId,
    ...bundle.packedRuntimes.flatMap((runtime) => [runtime.tarballArtifactId, runtime.receiptArtifactId]),
  ];
}

function assertArtifactMetadata(bundle: CalibrationAdmissionManifestPrerequisiteBundleV1, request: CalibrationAdmissionManifestPrerequisitePublicationRequestV1): void {
  const bundleArtifacts = artifactById(bundle);
  const sourceArtifacts = new Map(request.sourceArtifacts.map((artifact) => [artifact.artifactId, artifact]));
  if (sourceArtifacts.size !== bundleArtifacts.size || [...bundleArtifacts.keys()].some((id) => !sourceArtifacts.has(id))) {
    throw new AdmissionManifestPrerequisiteVerifierError('source artifact set is not closed over the prerequisite bundle');
  }
  for (const [id, source] of sourceArtifacts) {
    const artifact = bundleArtifacts.get(id)!;
    const sourceWithoutSource = { ...source } as JsonObject;
    delete sourceWithoutSource.source;
    if (calibrationAdmissionCanonicalJson(sourceWithoutSource) !== calibrationAdmissionCanonicalJson(artifact)) {
      throw new AdmissionManifestPrerequisiteVerifierError(`source artifact ${id} metadata does not match the bundle`);
    }
  }
  if (bundle.packedRuntimes[0].tarballArtifactId !== bundle.packedRuntimes[1].tarballArtifactId) {
    throw new AdmissionManifestPrerequisiteVerifierError('Node 22 and Node 24 receipts must use the same package tarball artifact');
  }
  const requiredIds = requiredArtifactIds(bundle);
  const required = new Set(requiredIds);
  const sharedTarballId = bundle.packedRuntimes[0].tarballArtifactId;
  const unexpectedDuplicate = requiredIds.some((id, index) => requiredIds.indexOf(id) !== index && id !== sharedTarballId);
  if (unexpectedDuplicate || [...required].some((id) => !bundleArtifacts.has(id))) {
    throw new AdmissionManifestPrerequisiteVerifierError('required prerequisite artifact is missing or duplicated');
  }
  if (bundle.releaseMaterializationTasks1To6.approvedCommitSha !== bundle.implementationCommitSha
    || bundle.scoreWireClosure.approvedCommitSha !== bundle.implementationCommitSha
    || bundle.runLifecycleVerification.approvedCommitSha !== bundle.implementationCommitSha) {
    throw new AdmissionManifestPrerequisiteVerifierError('prerequisite section commit is not bound to the implementation commit');
  }
  const expectedKinds: readonly (readonly [string, string])[] = [
    [bundle.manifestBuilder.artifactId, 'manifest_builder'],
    [bundle.releaseMaterializationTasks1To6.planArtifactId, 'release_plan'],
    [bundle.releaseMaterializationTasks1To6.approvalReceiptArtifactId, 'release_plan_approval'],
    [bundle.scoreWireClosure.closureReceiptArtifactId, 'score_wire_closure_receipt'],
    [bundle.runLifecycleVerification.runInitReceiptArtifactId, 'run_init_receipt'],
    [bundle.runLifecycleVerification.postScanReceiptArtifactId, 'post_scan_receipt'],
    ...bundle.packedRuntimes.flatMap((runtime) => [[runtime.tarballArtifactId, 'package_tarball'], [runtime.receiptArtifactId, 'packed_runtime_receipt']] as const),
  ];
  for (const [id, kind] of expectedKinds) {
    if (bundleArtifacts.get(id)?.kind !== kind) throw new AdmissionManifestPrerequisiteVerifierError(`prerequisite artifact ${id} is not a ${kind}`);
  }
  const builderPointer = bundleArtifacts.get(bundle.manifestBuilder.artifactId)!;
  if (builderPointer.packageTarballArtifactId === undefined
    || !bundle.packedRuntimes.some((runtime) => runtime.tarballArtifactId === builderPointer.packageTarballArtifactId)
    || typeof builderPointer.packageMemberRelativePath !== 'string'
    || builderPointer.packageMemberRelativePath.length === 0) {
    throw new AdmissionManifestPrerequisiteVerifierError('manifest builder artifact is not bound to a packed tarball member');
  }
  const builder = bundleArtifacts.get(bundle.manifestBuilder.artifactId)!;
  if (builder.kind !== 'manifest_builder' || builder.sha256 !== bundle.manifestBuilder.behaviorSha256) {
    throw new AdmissionManifestPrerequisiteVerifierError('manifest builder artifact is not bound to its behavior hash');
  }
  const stagingById = new Map(request.stagingSet.entries.map((entry) => [entry.artifactId, entry]));
  for (const source of request.sourceArtifacts as readonly SourceArtifact[]) {
    if (source.source.sourceRoot === 'prerequisite_staging') {
      const entry = stagingById.get(source.artifactId);
      if (entry === undefined || entry.normalizedRelativePath !== source.source.normalizedRelativePath
        || entry.kind !== source.kind || entry.mediaType !== source.mediaType
        || entry.bytes !== source.bytes || entry.sha256 !== source.sha256
        || source.source.stagingSetSha256 !== request.stagingSet.stagingSetSha256) {
        throw new AdmissionManifestPrerequisiteVerifierError(`staging entry ${source.artifactId} is not anchored`);
      }
    } else if (source.source.approvedCommitSha !== bundle.implementationCommitSha) {
      throw new AdmissionManifestPrerequisiteVerifierError(`platform artifact ${source.artifactId} is not bound to the implementation commit`);
    }
  }
  const stagedIds = new Set(request.sourceArtifacts.filter((source) => source.source.sourceRoot === 'prerequisite_staging').map((source) => source.artifactId));
  if (stagingById.size !== stagedIds.size || [...stagingById.keys()].some((id) => !stagedIds.has(id))) {
    throw new AdmissionManifestPrerequisiteVerifierError('staging set contains an unreferenced artifact');
  }
}

function parseJsonArtifact(bytes: Buffer, label: string): JsonObject {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString('utf8')) as unknown;
  } catch {
    throw new AdmissionManifestPrerequisiteVerifierError(`${label} is not valid JSON`);
  }
  if (!isRecord(value)) throw new AdmissionManifestPrerequisiteVerifierError(`${label} is not a JSON object`);
  if (!Buffer.from(canonicalBytes(value)).equals(bytes)) throw new AdmissionManifestPrerequisiteVerifierError(`${label} is not canonical JSON`);
  return value;
}

function assertTypedArtifact(artifact: PrerequisiteArtifact, bytes: Buffer, bundle: CalibrationAdmissionManifestPrerequisiteBundleV1): void {
  if (artifact.kind === 'release_plan' || artifact.kind === 'package_tarball' || artifact.kind === 'manifest_builder') return;
  const value = parseJsonArtifact(bytes, `prerequisite artifact ${artifact.artifactId}`);
  if (artifact.kind === 'release_plan_approval') {
    if (!isCalibrationReleasePrerequisiteApprovalV1(value) || value.approvedCommitSha !== bundle.implementationCommitSha
      || calibrationReleasePrerequisiteApprovalSha256(value) !== value.receiptSha256) throw new AdmissionManifestPrerequisiteVerifierError('release approval receipt is invalid or stale');
  } else if (artifact.kind === 'score_wire_closure_receipt') {
    if (!isCalibrationScoreWireClosureReceiptV1(value) || value.approvedCommitSha !== bundle.implementationCommitSha
      || calibrationScoreWireClosureReceiptSha256(value) !== value.receiptSha256) throw new AdmissionManifestPrerequisiteVerifierError('score/wire receipt is invalid or stale');
  } else if (artifact.kind === 'run_init_receipt' || artifact.kind === 'post_scan_receipt') {
    if (!isCalibrationRunLifecycleReceiptV1(value) || value.kind !== (artifact.kind === 'run_init_receipt' ? 'run_init' : 'post_scan')
      || value.approvedCommitSha !== bundle.implementationCommitSha || calibrationRunLifecycleReceiptSha256(value) !== value.receiptSha256) {
      throw new AdmissionManifestPrerequisiteVerifierError(`${artifact.kind} receipt is invalid or stale`);
    }
  } else if (artifact.kind === 'packed_runtime_receipt') {
    if (!isCalibrationPackedRuntimeReceiptV1(value) || value.approvedCommitSha !== bundle.implementationCommitSha
      || value.manifestBuilderBehaviorSha256 !== bundle.manifestBuilder.behaviorSha256
      || calibrationPackedRuntimeReceiptSha256(value) !== value.receiptSha256) throw new AdmissionManifestPrerequisiteVerifierError('packed runtime receipt is invalid or stale');
    const runtime = bundle.packedRuntimes.find((candidate) => candidate.receiptArtifactId === artifact.artifactId);
    if (runtime === undefined || runtime.nodeMajor !== value.nodeMajor) throw new AdmissionManifestPrerequisiteVerifierError('packed runtime receipt is not bound to its node-major slot');
    const tarball = bundle.referencedArtifacts.find((candidate) => candidate.artifactId === runtime.tarballArtifactId);
    if (tarball === undefined || tarball.sha256 !== value.tarballSha256) throw new AdmissionManifestPrerequisiteVerifierError('packed runtime receipt is not bound to its tarball');
  }
}

function tarMemberBytes(gzipBytes: Buffer, memberPath: string): Buffer | undefined {
  let tarBytes: Buffer;
  try { tarBytes = gunzipSync(gzipBytes); } catch { return undefined; }
  let found: Buffer | undefined;
  for (let offset = 0; offset + 512 <= tarBytes.length;) {
    const header = tarBytes.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/u, '');
    if (name.length === 0) break;
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/u, '');
    const path = prefix.length > 0 ? `${prefix}/${name}` : name;
    const sizeText = header.subarray(124, 136).toString('ascii').replace(/\0.*$/u, '').trim();
    const size = Number.parseInt(sizeText || '0', 8);
    if (!Number.isSafeInteger(size) || size < 0) return undefined;
    const bodyStart = offset + 512;
    const bodyEnd = bodyStart + size;
    if (bodyEnd > tarBytes.length) return undefined;
    const type = header.subarray(156, 157).toString('ascii');
    if (path === memberPath) {
      if (type !== '' && type !== '0') return undefined;
      if (found !== undefined) return undefined;
      found = Buffer.from(tarBytes.subarray(bodyStart, bodyEnd));
    }
    offset = bodyStart + Math.ceil(size / 512) * 512;
  }
  return found;
}

async function verifyArtifactBytes(root: string, bundle: CalibrationAdmissionManifestPrerequisiteBundleV1): Promise<void> {
  const bytesById = new Map<string, Buffer>();
  for (const artifact of bundle.referencedArtifacts) {
    if (!artifact.relativePath.startsWith(`${PREREQUISITE_ROOT}/`)) throw new AdmissionManifestPrerequisiteVerifierError(`artifact ${artifact.artifactId} escapes the prerequisite root`);
    const read = await readBytes(root, artifact.relativePath, `prerequisite artifact ${artifact.artifactId}`);
    if (read.bytes.byteLength !== artifact.bytes || read.sha256 !== artifact.sha256) throw new AdmissionManifestPrerequisiteVerifierError(`artifact ${artifact.artifactId} bytes or hash do not match`);
    bytesById.set(artifact.artifactId, read.bytes);
    assertTypedArtifact(artifact, read.bytes, bundle);
  }
  const builder = bundle.referencedArtifacts.find((artifact) => artifact.artifactId === bundle.manifestBuilder.artifactId)!;
  const tarball = bytesById.get(builder.packageTarballArtifactId!);
  const member = tarball === undefined ? undefined : tarMemberBytes(tarball, builder.packageMemberRelativePath!);
  if (member === undefined || hashBytes(member) !== builder.sha256) {
    throw new AdmissionManifestPrerequisiteVerifierError('manifest builder artifact does not match its packed tarball member');
  }
}

function assertRelations(
  reference: AdmissionManifestPrerequisiteReferenceV1,
  bundle: CalibrationAdmissionManifestPrerequisiteBundleV1,
  completion: CalibrationAdmissionManifestPrerequisitePublicationCompletionV1,
  request: CalibrationAdmissionManifestPrerequisitePublicationRequestV1,
): void {
  if (completion.requestId !== request.requestId
    || completion.bundleRelativePath !== reference.bundleRelativePath || completion.bundleSha256 !== reference.bundleSha256
    || completion.completionSha256 !== reference.completionSha256 || completion.requestRelativePath !== reference.requestRelativePath
    || completion.requestSha256 !== reference.requestSha256 || request.requestSha256 !== reference.requestSha256
    || request.bundle.bundleSha256 !== bundle.bundleSha256
    || calibrationAdmissionCanonicalJson(request.bundle) !== calibrationAdmissionCanonicalJson(bundle)
    || completion.artifactSetSha256 !== bundle.referencedArtifactSetSha256
    || calibrationAdmissionManifestPrerequisiteArtifactSetSha256(bundle) !== bundle.referencedArtifactSetSha256) {
    throw new AdmissionManifestPrerequisiteVerifierError('prerequisite completion/request/bundle relation is invalid');
  }
  assertArtifactMetadata(bundle, request);
  if (calibrationAdmissionManifestPrerequisiteBundleSha256(bundle) !== bundle.bundleSha256
    || calibrationAdmissionManifestPrerequisitePublicationRequestSha256(request) !== request.requestSha256
    || calibrationAdmissionManifestPrerequisitePublicationCompletionSha256(completion) !== completion.completionSha256
    || !isCalibrationAdmissionManifestPrerequisiteStagingSetV1(request.stagingSet)
    || calibrationAdmissionManifestPrerequisiteStagingSetSha256(request.stagingSet) !== request.stagingSet.stagingSetSha256) {
    throw new AdmissionManifestPrerequisiteVerifierError('prerequisite self-hash or staging set is invalid');
  }
}

/** Return true only for the exact private value returned by the verifier. */
export function isVerifiedAdmissionManifestPrerequisites(value: unknown): value is VerifiedAdmissionManifestPrerequisitesV1 {
  return typeof value === 'object' && value !== null && verifiedPrerequisites.has(value);
}

/** Open one complete immutable prerequisite graph without writing or discovering files. */
export async function openAdmissionManifestPrerequisitesForConsumer(
  input: OpenAdmissionManifestPrerequisitesForConsumerInput,
): Promise<VerifiedAdmissionManifestPrerequisitesV1> {
  // Never freeze a caller-owned reference object while branding the result.
  // `parseReference` validates object inputs in place, so clone it before the
  // immutable result graph is constructed.
  const reference = structuredClone(parseReference(input.reference));
  assertGraphPaths(reference);
  const root = await canonicalRoot(input.root);
  const bundleRead = await readCanonicalJson<CalibrationAdmissionManifestPrerequisiteBundleV1>(root, reference.bundleRelativePath, 'prerequisite bundle');
  const completionRead = await readCanonicalJson<CalibrationAdmissionManifestPrerequisitePublicationCompletionV1>(root, reference.completionRelativePath, 'prerequisite completion');
  const requestRead = await readCanonicalJson<CalibrationAdmissionManifestPrerequisitePublicationRequestV1>(root, reference.requestRelativePath, 'prerequisite request');
  const bundleValidation = validateCalibrationAdmissionManifestPrerequisiteBundleV1(bundleRead.value);
  const requestValidation = validateCalibrationAdmissionManifestPrerequisitePublicationRequestV1(requestRead.value);
  const invalidContracts = [
    !bundleValidation.ok ? `bundle:${bundleValidation.errors.join('|')}` : undefined,
    !isCalibrationAdmissionManifestPrerequisitePublicationCompletionV1(completionRead.value) ? 'completion' : undefined,
    !requestValidation.ok ? `request:${requestValidation.errors.join('|')}` : undefined,
  ].filter((value): value is string => value !== undefined);
  if (invalidContracts.length > 0 || bundleRead.sha256 === '' || completionRead.sha256 === '' || requestRead.sha256 === '') {
    throw new AdmissionManifestPrerequisiteVerifierError(`prerequisite graph contract is invalid: ${invalidContracts.join(',')}`);
  }
  if (bundleRead.value.bundleSha256 !== reference.bundleSha256 || completionRead.value.completionSha256 !== reference.completionSha256 || requestRead.value.requestSha256 !== reference.requestSha256) {
    throw new AdmissionManifestPrerequisiteVerifierError('prerequisite graph does not match its reference');
  }
  assertRelations(reference, bundleRead.value, completionRead.value, requestRead.value);
  await verifyArtifactBytes(root, bundleRead.value);
  const result = deepFreeze({ reference, bundle: bundleRead.value, completion: completionRead.value, request: requestRead.value }) as VerifiedAdmissionManifestPrerequisitesV1;
  verifiedPrerequisites.add(result as object);
  return result;
}
