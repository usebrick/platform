import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

import {
  calibrationAdmissionAuthorityCurrentSha256,
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionLineageLedgerSha256,
  calibrationAdmissionPreWitnessBundleSha256,
  calibrationAdmissionPrivacyLedgerSha256,
  calibrationAdmissionQualityLedgerSha256,
  calibrationAdmissionSha256,
  calibrationAdmissionStaticAuthorityGenerationSha256,
  isCalibrationAdmissionAuthorityCurrentV1,
  isCalibrationAdmissionPreWitnessBundleV1,
  isCalibrationAdmissionRecordV103,
  isCalibrationAdmissionStaticAuthorityGenerationV1,
  validateCalibrationAdmissionPreWitnessBundleV1,
  validateCalibrationAdmissionRecordStreamV1,
  validateCalibrationAdmissionSourceRegisterReviewSet,
  type CalibrationAdmissionPreWitnessBundleV1,
  type CalibrationAdmissionRecordV103,
  type CalibrationAdmissionRecordStreamV1,
} from '@usebrick/core';

import {
  isVerifiedAdmissionEvidenceContext,
  type VerifiedAdmissionEvidenceContextV1,
} from './admission-evidence-context';

const CURRENT_RELATIVE_PATH = 'review/admission/authority/current.json';
const STATIC_ROOT = 'review/admission/authority/static-generations';
const STREAM_RELATIVE_PATH = 'review/admission/admission-records.jsonl';
const STATIC_BUNDLE_PATH = 'pre-witness-bundle.json';
const HASH = /^[a-f0-9]{64}$/u;

const verifiedAdmissionContextBrand: unique symbol = Symbol('slopbrick.verified-admission-context');

export type VerifiedAdmissionContextV1 = Readonly<{
  readonly contextSha256: string;
  readonly durable: CalibrationAdmissionPreWitnessBundleV1;
  readonly [verifiedAdmissionContextBrand]: true;
}>;

export type VerifiedAdmissionContextResult =
  | { readonly ok: true; readonly context: VerifiedAdmissionContextV1 }
  | { readonly ok: false; readonly errors: readonly string[] };

const verifiedContexts = new WeakSet<object>();
type VerifiedRecord = Readonly<Pick<CalibrationAdmissionRecordV103, 'recordId' | 'declaredDisposition' | 'rejectionReasons'>>;
const verifiedRecordMaps = new WeakMap<object, ReadonlyMap<string, VerifiedRecord>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value !== 'object' || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key], seen);
  }
  return Object.freeze(value);
}

function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function uniqueErrors(errors: readonly string[]): readonly string[] {
  return [...new Set(errors.filter((error) => error.length > 0))];
}

type AdmissionRoot = Readonly<{ readonly projectRoot: string; readonly admissionRoot: string }>;

async function resolveAdmissionRoot(input: string): Promise<AdmissionRoot> {
  if (typeof input !== 'string' || input.length === 0) throw new Error('admission root must be a non-empty path');
  const resolved = await realpath(resolve(input));
  if (basename(resolved) === 'admission' && basename(dirname(resolved)) === 'review') {
    return { projectRoot: dirname(dirname(resolved)), admissionRoot: resolved };
  }
  const admissionRoot = join(resolved, 'review', 'admission');
  const metadata = await lstat(admissionRoot);
  if (metadata.isSymbolicLink()) throw new Error('review/admission cannot be a symlink');
  if (!metadata.isDirectory()) throw new Error('review/admission is not a directory');
  return { projectRoot: resolved, admissionRoot: await realpath(admissionRoot) };
}

function pathInside(base: string, candidate: string): boolean {
  const baseRelative = relative(base, candidate);
  return baseRelative === '' || (baseRelative !== '..' && !baseRelative.startsWith(`..${sep}`) && !baseRelative.startsWith('/') && !baseRelative.includes('\\'));
}

async function rejectSymlinkAncestors(base: string, target: string): Promise<void> {
  const targetRelative = relative(base, target);
  if (!pathInside(base, target) || targetRelative === '' || targetRelative.startsWith('..')) throw new Error('path escapes the contained admission root');
  let current = base;
  const segments = targetRelative.split(/[\\/]+/u).filter(Boolean);
  for (const [index, segment] of segments.entries()) {
    current = join(current, segment);
    const metadata = await lstat(current);
    if (metadata.isSymbolicLink()) throw new Error('symlink path components are not accepted');
    if (index < segments.length - 1 && !metadata.isDirectory()) throw new Error('path component is not a directory');
  }
}

async function readContainedFile(root: AdmissionRoot, absolutePath: string): Promise<Buffer> {
  const canonical = resolve(absolutePath);
  if (!pathInside(root.admissionRoot, canonical)) throw new Error('path escapes the contained admission root');
  await rejectSymlinkAncestors(root.admissionRoot, canonical);
  const metadata = await lstat(canonical);
  if (!metadata.isFile()) throw new Error('referenced artifact is not a regular file');
  const resolved = await realpath(canonical);
  if (!pathInside(root.admissionRoot, resolved)) throw new Error('referenced artifact escapes the contained admission root');
  return readFile(canonical);
}

async function readCanonicalJson(root: AdmissionRoot, absolutePath: string, label: string): Promise<unknown> {
  const bytes = await readContainedFile(root, absolutePath);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} is not valid UTF-8`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  let canonical: string;
  try {
    canonical = calibrationAdmissionCanonicalJson(parsed);
  } catch {
    throw new Error(`${label} cannot be canonicalized`);
  }
  if (text !== canonical) throw new Error(`${label} is not canonical JSON`);
  return parsed;
}

function parseCanonicalJsonl(bytes: Uint8Array): readonly unknown[] {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (text.length === 0) return [];
  if (!text.endsWith('\n')) throw new Error('record stream must end with a final newline');
  const lines = text.slice(0, -1).split('\n');
  if (lines.some((line) => line.length === 0)) throw new Error('record stream contains a blank line');
  const values: unknown[] = [];
  for (const line of lines) {
    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch {
      throw new Error('record stream contains invalid JSON');
    }
    if (!isRecord(value) || calibrationAdmissionCanonicalJson(value) !== line) throw new Error('record stream contains non-canonical JSON');
    values.push(value);
  }
  return values;
}

function staticArtifactPath(staticPath: string, relativePath: string): string {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || relativePath.includes('\\') || relativePath.startsWith('/') || relativePath.split('/').some((part) => part === '.' || part === '..' || part.length === 0)) {
    throw new Error('static artifact path is unsafe');
  }
  return join(staticPath, relativePath);
}

function validHash(value: unknown): value is string {
  return typeof value === 'string' && HASH.test(value);
}

function validateBundleLedgers(bundle: CalibrationAdmissionPreWitnessBundleV1, recordSetSha256: string): readonly string[] {
  const errors: string[] = [];
  const stream = bundle.admissionRecordStream;
  if (stream.recordIdSetSha256 !== recordSetSha256) errors.push('record stream recordIdSetSha256 does not match its records');
  if (bundle.privacyLedger.admissionRecordSetSha256 !== recordSetSha256) errors.push('privacy ledger record set does not match the record stream');
  if (bundle.qualityLedger.admissionRecordSetSha256 !== recordSetSha256) errors.push('quality ledger record set does not match the record stream');
  if (bundle.lineageLedger.admissionRecordSetSha256 !== recordSetSha256) errors.push('lineage ledger record set does not match the record stream');
  try {
    if (calibrationAdmissionPrivacyLedgerSha256(bundle.privacyLedger) !== bundle.privacyLedger.ledgerSha256) errors.push('privacy ledger self-hash does not match canonical bytes');
    if (calibrationAdmissionQualityLedgerSha256(bundle.qualityLedger) !== bundle.qualityLedger.ledgerSha256) errors.push('quality ledger self-hash does not match canonical bytes');
    if (calibrationAdmissionLineageLedgerSha256(bundle.lineageLedger) !== bundle.lineageLedger.ledgerSha256) errors.push('lineage ledger self-hash does not match canonical bytes');
  } catch {
    errors.push('ledger canonical hash validation failed');
  }
  const overlap = bundle.overlapResourceReceipt as unknown as Record<string, unknown>;
  if (overlap.coverageComplete !== true || overlap.withinAllLimits !== true) errors.push('overlap resource receipt is incomplete or exceeded a configured limit');
  return errors;
}

async function verifyStaticArtifacts(root: AdmissionRoot, staticPath: string, staticGeneration: Record<string, unknown>): Promise<readonly string[]> {
  const errors: string[] = [];
  const artifacts = Array.isArray(staticGeneration.artifacts) ? staticGeneration.artifacts : [];
  const seen = new Set<string>();
  for (const artifact of artifacts) {
    if (!isRecord(artifact) || typeof artifact.relativePath !== 'string') {
      errors.push('static authority artifact receipt is malformed');
      continue;
    }
    if (seen.has(artifact.relativePath)) {
      errors.push(`duplicate static authority artifact path ${artifact.relativePath}`);
      continue;
    }
    seen.add(artifact.relativePath);
    try {
      const bytes = await readContainedFile(root, staticArtifactPath(staticPath, artifact.relativePath));
      if (bytes.byteLength !== artifact.bytes) errors.push(`static artifact ${artifact.relativePath} byte count mismatch`);
      if (!validHash(artifact.sha256) || hashBytes(bytes) !== artifact.sha256) errors.push(`static artifact ${artifact.relativePath} hash mismatch`);
    } catch (error) {
      errors.push(`static artifact ${artifact.relativePath}: ${errorMessage(error)}`);
    }
  }
  return errors;
}

async function loadAndVerify(root: AdmissionRoot, evidence: VerifiedAdmissionEvidenceContextV1): Promise<{ readonly bundle: CalibrationAdmissionPreWitnessBundleV1; readonly streamBytes: Buffer; readonly records: ReadonlyMap<string, VerifiedRecord> }> {
  const currentPath = join(root.projectRoot, CURRENT_RELATIVE_PATH);
  const currentInput = await readCanonicalJson(root, currentPath, 'authority current pointer');
  if (!isCalibrationAdmissionAuthorityCurrentV1(currentInput)) throw new Error('authority current pointer failed Core validation');
  const current = currentInput;
  if (current.currentSha256 !== calibrationAdmissionAuthorityCurrentSha256(current)) throw new Error('authority current pointer self-hash mismatch');
  const expectedStaticRelative = `${STATIC_ROOT}/${current.staticGenerationSha256}`;
  if (current.staticGenerationRelativePath !== expectedStaticRelative) throw new Error('authority current pointer static path/hash join mismatch');
  const staticPath = join(root.projectRoot, current.staticGenerationRelativePath);
  if (!pathInside(root.admissionRoot, staticPath)) throw new Error('authority static generation escapes the contained admission root');
  const staticInput = await readCanonicalJson(root, join(staticPath, 'generation.json'), 'static authority generation');
  // The generation object is conventionally stored at generation.json in the
  // fixture/runtime directory. A hash-named generation may also carry the
  // object as static-generation.json; no directory discovery is allowed.
  const staticGenerationInput = staticInput;
  if (!isCalibrationAdmissionStaticAuthorityGenerationV1(staticGenerationInput)) throw new Error('static authority generation failed Core validation');
  const staticGeneration = staticGenerationInput;
  if (staticGeneration.generationSha256 !== calibrationAdmissionStaticAuthorityGenerationSha256(staticGeneration)) throw new Error('static authority generation self-hash mismatch');
  if (current.generation !== staticGeneration.generation || current.staticGenerationSha256 !== staticGeneration.generationSha256) throw new Error('authority current pointer does not bind static generation');
  const staticArtifacts = await verifyStaticArtifacts(root, staticPath, staticGeneration as unknown as Record<string, unknown>);
  if (staticArtifacts.length > 0) throw new Error(staticArtifacts.join('; '));
  const requiredArtifacts = [
    ['bundle', STATIC_BUNDLE_PATH],
    ['ledger', 'privacy-ledger.json'],
    ['ledger', 'quality-ledger.json'],
    ['ledger', 'lineage-ledger.json'],
  ] as const;
  for (const [kind, artifactPath] of requiredArtifacts) {
    const matches = staticGeneration.artifacts.filter((artifact) => artifact.kind === kind && artifact.relativePath === artifactPath);
    if (matches.length !== 1) throw new Error(`static authority generation must contain exactly one ${artifactPath} artifact`);
  }
  const bundleArtifact = staticGeneration.artifacts.find((artifact) => artifact.relativePath === STATIC_BUNDLE_PATH && artifact.kind === 'bundle')!;
  const bundleInput = await readCanonicalJson(root, join(staticPath, STATIC_BUNDLE_PATH), 'pre-witness bundle');
  if (!isCalibrationAdmissionPreWitnessBundleV1(bundleInput)) {
    const validation = validateCalibrationAdmissionPreWitnessBundleV1(bundleInput);
    throw new Error(`pre-witness bundle failed Core validation${!validation.ok && validation.errors.length > 0 ? `: ${validation.errors.join(', ')}` : ''}`);
  }
  const bundle = bundleInput;
  if (bundle.preWitnessBundleSha256 !== calibrationAdmissionPreWitnessBundleSha256(bundle)) throw new Error('pre-witness bundle self-hash mismatch');
  if (bundleArtifact.sha256 !== hashBytes(Buffer.from(calibrationAdmissionCanonicalJson(bundle))) || bundleArtifact.bytes !== Buffer.byteLength(calibrationAdmissionCanonicalJson(bundle))) throw new Error('pre-witness bundle artifact receipt does not match canonical bytes');
  if (staticGeneration.preWitnessBundleSha256 !== bundle.preWitnessBundleSha256) throw new Error('static generation does not bind the pre-witness bundle hash');
  if (staticGeneration.privacyLedgerSha256 !== bundle.privacyLedger.ledgerSha256 || staticGeneration.qualityLedgerSha256 !== bundle.qualityLedger.ledgerSha256 || staticGeneration.lineageLedgerSha256 !== bundle.lineageLedger.ledgerSha256) throw new Error('static generation ledger joins do not match the rich bundle');
  if (calibrationAdmissionCanonicalJson(staticGeneration.toolAuthoritySnapshot) !== calibrationAdmissionCanonicalJson(bundle.toolAuthoritySnapshot)) throw new Error('static and rich bundle tool authority snapshots differ');
  const stream = bundle.admissionRecordStream as CalibrationAdmissionRecordStreamV1;
  if (stream.relativePath !== STREAM_RELATIVE_PATH) throw new Error('pre-witness bundle record stream path is not the fixed admission path');
  const streamPath = join(root.projectRoot, stream.relativePath);
  const streamBytes = await readContainedFile(root, streamPath);
  const parsedRecords = parseCanonicalJsonl(streamBytes);
  const streamValidation = validateCalibrationAdmissionRecordStreamV1(stream, streamBytes, parsedRecords);
  if (!streamValidation.ok) throw new Error(`record stream failed Core validation: ${streamValidation.errors.join(', ')}`);
  const recordMap = new Map<string, VerifiedRecord>();
  for (const value of parsedRecords) {
    if (!isCalibrationAdmissionRecordV103(value)) throw new Error('record stream contains a record that failed Core validation');
    if (recordMap.has(value.recordId)) throw new Error(`record stream contains duplicate record ID ${value.recordId}`);
    recordMap.set(value.recordId, value as unknown as VerifiedRecord);
  }
  const sourceReviewValidation = validateCalibrationAdmissionSourceRegisterReviewSet(bundle.sourceRegister, bundle.sourceReviews);
  if (!sourceReviewValidation.ok) throw new Error(`source register/review ID or binding validation failed: ${sourceReviewValidation.errors.join(', ')}`);
  const ledgerErrors = validateBundleLedgers(bundle, stream.recordIdSetSha256);
  if (ledgerErrors.length > 0) throw new Error(ledgerErrors.join('; '));
  // The evidence brand is checked before any evidence object property is read.
  if (!isVerifiedAdmissionEvidenceContext(evidence)) throw new Error('evidence context is not a verified SlopBrick context');
  return { bundle, streamBytes, records: recordMap };
}

/**
 * Build the runtime-only, byte-backed admission context. The optional input
 * is intentionally rejected in the production surface: tests must exercise
 * real contained files, never an injectable filesystem, resolver, or bundle.
 */
export async function buildVerifiedAdmissionContext(root: string, evidence: VerifiedAdmissionEvidenceContextV1, input?: unknown): Promise<VerifiedAdmissionContextResult> {
  try {
    if (input !== undefined) return { ok: false, errors: ['fixture or dependency-injection input is not accepted by the production context factory'] };
    if (!isVerifiedAdmissionEvidenceContext(evidence)) return { ok: false, errors: ['evidence context is not a verified SlopBrick context'] };
    const admissionRoot = await resolveAdmissionRoot(root);
    const verified = await loadAndVerify(admissionRoot, evidence);
    const contextBody = {
      contextSha256: '',
      durable: structuredClone(verified.bundle),
    };
    const contextSha256 = calibrationAdmissionSha256({
      durable: contextBody.durable,
      streamBytesSha256: hashBytes(verified.streamBytes),
      evidenceContextSha256: evidence.evidenceContextSha256,
    });
    const context = deepFreeze({
      ...contextBody,
      contextSha256,
      [verifiedAdmissionContextBrand]: true as const,
    }) as VerifiedAdmissionContextV1;
    verifiedContexts.add(context as object);
    verifiedRecordMaps.set(context as object, verified.records);
    return { ok: true, context };
  } catch (error) {
    return { ok: false, errors: uniqueErrors([errorMessage(error)]) };
  }
}

export function isVerifiedAdmissionContext(value: unknown): value is VerifiedAdmissionContextV1 {
  return typeof value === 'object' && value !== null && verifiedContexts.has(value);
}

class InvalidAdmissionContextError extends Error {
  public constructor() {
    super('Invalid verified admission context brand');
    this.name = 'InvalidAdmissionContextError';
  }
}

type AdmissionDisposition = 'eligible_gold' | 'eligible_sensitivity' | 'mixed_evaluation' | 'quarantine';
type AdmissionDispositionReason = string;

export type AdmissionDispositionResult = Readonly<{
  readonly disposition: AdmissionDisposition;
  readonly reasons: readonly AdmissionDispositionReason[];
}>;

/** @internal Re-exported by admission-disposition.ts; the WeakMap stays private here. */
export function deriveAdmissionDisposition(context: VerifiedAdmissionContextV1, recordId: string): AdmissionDispositionResult {
  if (!isVerifiedAdmissionContext(context)) throw new InvalidAdmissionContextError();
  const record = verifiedRecordMaps.get(context as object)?.get(recordId);
  if (!record) return { disposition: 'quarantine', reasons: ['unknown_record_id'] };
  return { disposition: record.declaredDisposition, reasons: [...record.rejectionReasons] };
}
