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
  calibrationAdmissionSourceCurrentSha256,
  calibrationAdmissionSourceGenerationSha256,
  calibrationAdmissionSourceReviewSha256,
  calibrationAdmissionStaticAuthorityGenerationSha256,
  calibrationAdmissionToolReceiptSha256,
  isCalibrationAdmissionAuthorityCurrentV1,
  isCalibrationAdmissionOverlapResourceReceiptV1,
  isCalibrationAdmissionPreWitnessBundleV1,
  isCalibrationAdmissionRecordV103,
  isCalibrationAdmissionSourceCurrentV1,
  isCalibrationAdmissionSourceGenerationV1,
  isCalibrationAdmissionStaticAuthorityGenerationV1,
  isCalibrationAdmissionToolReceiptV1,
  validateCalibrationAdmissionPreWitnessBundleV1,
  validateCalibrationAdmissionLineageLedgerV1,
  validateCalibrationAdmissionPrivacyLedgerV1,
  validateCalibrationAdmissionQualityLedgerV1,
  validateCalibrationAdmissionRecordStreamV1,
  validateCalibrationAdmissionSourceRegisterReviewSet,
  type CalibrationAdmissionPreWitnessBundleV1,
  type CalibrationAdmissionRecordV103,
  type CalibrationAdmissionRecordStreamV1,
  type CalibrationAdmissionSourceCurrentV1,
  type CalibrationAdmissionSourceGenerationV1,
} from '@usebrick/core';

import {
  isVerifiedAdmissionEvidenceContext,
  type VerifiedAdmissionEvidenceContextV1,
} from './admission-evidence-context';

const CURRENT_RELATIVE_PATH = 'review/admission/authority/current.json';
const SOURCES_ROOT = 'sources';
const STATIC_ROOT = 'review/admission/authority/static-generations';
const STREAM_RELATIVE_PATH = 'review/admission/admission-records.jsonl';
const STATIC_BUNDLE_PATH = 'pre-witness-bundle.json';
const OVERLAP_TOOL_PROFILE_ID = 'admission-static-ledgers-v1';
const REQUIRED_STATIC_ARTIFACTS = [
  ['ledger', 'privacy-ledger.json'],
  ['ledger', 'quality-ledger.json'],
  ['ledger', 'lineage-ledger.json'],
  ['bundle', STATIC_BUNDLE_PATH],
] as const;

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
type VerifiedRecord = Readonly<{
  readonly record: CalibrationAdmissionRecordV103;
  readonly canonicalJson: string;
  readonly canonicalSha256: string;
}>;
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

function hasUtf8Bom(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
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
  if (hasUtf8Bom(bytes)) throw new Error(`${label} must not contain a UTF-8 BOM`);
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
  if (hasUtf8Bom(bytes)) throw new Error('record stream must not contain a UTF-8 BOM');
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

function validateBundleLedgers(bundle: CalibrationAdmissionPreWitnessBundleV1, recordIds: readonly string[]): readonly string[] {
  const errors: string[] = [];
  const stream = bundle.admissionRecordStream;
  const recordSetSha256 = calibrationAdmissionSha256(recordIds);
  if (stream.recordIdSetSha256 !== recordSetSha256) errors.push('record stream recordIdSetSha256 does not match its records');
  const ledgers: readonly [string, { readonly ok: boolean; readonly errors: readonly string[] }][] = [
    ['privacy', validateCalibrationAdmissionPrivacyLedgerV1(bundle.privacyLedger, recordIds)],
    ['quality', validateCalibrationAdmissionQualityLedgerV1(bundle.qualityLedger, recordIds)],
    ['lineage', validateCalibrationAdmissionLineageLedgerV1(bundle.lineageLedger, recordIds)],
  ];
  for (const [name, validation] of ledgers) {
    if (!validation.ok) errors.push(...validation.errors.map((error) => `${name} ledger: ${error}`));
  }
  try {
    if (calibrationAdmissionPrivacyLedgerSha256(bundle.privacyLedger) !== bundle.privacyLedger.ledgerSha256) errors.push('privacy ledger self-hash does not match canonical bytes');
    if (calibrationAdmissionQualityLedgerSha256(bundle.qualityLedger) !== bundle.qualityLedger.ledgerSha256) errors.push('quality ledger self-hash does not match canonical bytes');
    if (calibrationAdmissionLineageLedgerSha256(bundle.lineageLedger) !== bundle.lineageLedger.ledgerSha256) errors.push('lineage ledger self-hash does not match canonical bytes');
  } catch {
    errors.push('ledger canonical hash validation failed');
  }
  return errors;
}

function validateOverlapResourceReceipt(bundle: CalibrationAdmissionPreWitnessBundleV1): readonly string[] {
  const errors: string[] = [];
  const overlap = bundle.overlapResourceReceipt;
  if (!isCalibrationAdmissionOverlapResourceReceiptV1(overlap)) {
    errors.push('overlap resource receipt failed Core validation');
    return errors;
  }
  if (overlap.coverageComplete !== true || overlap.withinAllLimits !== true) {
    errors.push('overlap resource receipt is incomplete or exceeded a configured limit');
  }
  const matching = bundle.toolReceipts.filter((receipt) => {
    if (calibrationAdmissionToolReceiptSha256(receipt) !== overlap.toolReceiptSha256) return false;
    const profile = bundle.toolProfiles.find((candidate) => candidate.profileId === receipt.profileId);
    const intent = bundle.invocationIntents.find((candidate) => candidate.intentId === receipt.invocationIntentId);
    return profile !== undefined && intent !== undefined && isCalibrationAdmissionToolReceiptV1(receipt, profile, intent)
      && receipt.profileId === OVERLAP_TOOL_PROFILE_ID
      && receipt.action === 'authority:overlap'
      && receipt.exitCode === 0
      && bundle.toolAuthoritySnapshot.receiptIds.includes(receipt.receiptId)
      && bundle.toolAuthoritySnapshot.invocationIntentIds.includes(intent.intentId);
  });
  if (matching.length !== 1) {
    errors.push('overlap resource receipt must bind exactly one successful indexed authority:overlap tool receipt');
  }
  return errors;
}

type StaticArtifactReceipt = Readonly<{ readonly kind: string; readonly relativePath: string; readonly bytes: number; readonly sha256: string }>;

type RequiredStaticArtifactReceipts = Readonly<{
  readonly privacyLedger: StaticArtifactReceipt;
  readonly qualityLedger: StaticArtifactReceipt;
  readonly lineageLedger: StaticArtifactReceipt;
  readonly bundle: StaticArtifactReceipt;
}>;

function requiredStaticArtifactReceipts(staticGeneration: { readonly artifacts: readonly StaticArtifactReceipt[] }): RequiredStaticArtifactReceipts {
  const findExactlyOne = (kind: string, relativePath: string): StaticArtifactReceipt => {
    const matches = staticGeneration.artifacts.filter((artifact) => artifact.kind === kind && artifact.relativePath === relativePath);
    if (matches.length !== 1) throw new Error(`static authority generation must contain exactly one ${relativePath} artifact`);
    return matches[0]!;
  };
  return {
    privacyLedger: findExactlyOne(REQUIRED_STATIC_ARTIFACTS[0]![0], REQUIRED_STATIC_ARTIFACTS[0]![1]),
    qualityLedger: findExactlyOne(REQUIRED_STATIC_ARTIFACTS[1]![0], REQUIRED_STATIC_ARTIFACTS[1]![1]),
    lineageLedger: findExactlyOne(REQUIRED_STATIC_ARTIFACTS[2]![0], REQUIRED_STATIC_ARTIFACTS[2]![1]),
    bundle: findExactlyOne(REQUIRED_STATIC_ARTIFACTS[3]![0], REQUIRED_STATIC_ARTIFACTS[3]![1]),
  };
}

function verifyCanonicalArtifactBytes(
  artifact: StaticArtifactReceipt,
  expected: unknown,
  expectedSha256: string,
  label: string,
): void {
  const canonical = Buffer.from(calibrationAdmissionCanonicalJson(expected), 'utf8');
  if (artifact.sha256 !== expectedSha256 || artifact.bytes !== canonical.byteLength) {
    throw new Error(`${label} artifact receipt does not match canonical bytes/hash`);
  }
}

function verifyStaticLedgerAnchors(bundle: CalibrationAdmissionPreWitnessBundleV1, staticGeneration: { readonly privacyLedgerSha256: string; readonly qualityLedgerSha256: string; readonly lineageLedgerSha256: string; readonly preWitnessBundleSha256: string }): void {
  if (staticGeneration.preWitnessBundleSha256 !== bundle.preWitnessBundleSha256) throw new Error('static generation does not bind the pre-witness bundle hash');
  if (staticGeneration.privacyLedgerSha256 !== bundle.privacyLedger.ledgerSha256 || staticGeneration.qualityLedgerSha256 !== bundle.qualityLedger.ledgerSha256 || staticGeneration.lineageLedgerSha256 !== bundle.lineageLedger.ledgerSha256) {
    throw new Error('static generation ledger joins do not match the rich bundle');
  }
}

function verifyStaticArtifactReceipts(
  artifacts: RequiredStaticArtifactReceipts,
  bundle: CalibrationAdmissionPreWitnessBundleV1,
  staticGeneration: {
    readonly privacyLedgerSha256: string;
    readonly qualityLedgerSha256: string;
    readonly lineageLedgerSha256: string;
    readonly preWitnessBundleSha256: string;
  },
): void {
  // Static-generation artifact sha256 fields are the semantic hashes carried
  // by the static graph; their byte counts still bind the exact canonical rich
  // projections without reading those projections from disk.
  verifyCanonicalArtifactBytes(artifacts.privacyLedger, bundle.privacyLedger, staticGeneration.privacyLedgerSha256, 'privacy ledger');
  verifyCanonicalArtifactBytes(artifacts.qualityLedger, bundle.qualityLedger, staticGeneration.qualityLedgerSha256, 'quality ledger');
  verifyCanonicalArtifactBytes(artifacts.lineageLedger, bundle.lineageLedger, staticGeneration.lineageLedgerSha256, 'lineage ledger');
  verifyCanonicalArtifactBytes(artifacts.bundle, bundle, staticGeneration.preWitnessBundleSha256, 'pre-witness bundle');
}

function verifyToolAuthoritySnapshotEquality(bundle: CalibrationAdmissionPreWitnessBundleV1, staticGeneration: { readonly toolAuthoritySnapshot: unknown }): void {
  if (calibrationAdmissionCanonicalJson(staticGeneration.toolAuthoritySnapshot) !== calibrationAdmissionCanonicalJson(bundle.toolAuthoritySnapshot)) {
    throw new Error('static and rich bundle tool authority snapshots differ');
  }
}

function verifyStaticGenerationShape(staticGeneration: unknown): staticGeneration is {
  readonly generation: number;
  readonly generationSha256: string;
  readonly preWitnessBundleSha256: string;
  readonly privacyLedgerSha256: string;
  readonly qualityLedgerSha256: string;
  readonly lineageLedgerSha256: string;
  readonly toolAuthoritySnapshot: unknown;
  readonly artifacts: readonly { readonly kind: string; readonly relativePath: string; readonly bytes: number; readonly sha256: string }[];
} {
  return isCalibrationAdmissionStaticAuthorityGenerationV1(staticGeneration);
}

function verifyStaticGeneration(staticInput: unknown, current: { readonly generation: number; readonly staticGenerationSha256: string }): {
  readonly generation: number;
  readonly generationSha256: string;
  readonly preWitnessBundleSha256: string;
  readonly privacyLedgerSha256: string;
  readonly qualityLedgerSha256: string;
  readonly lineageLedgerSha256: string;
  readonly toolAuthoritySnapshot: unknown;
  readonly artifacts: readonly { readonly kind: string; readonly relativePath: string; readonly bytes: number; readonly sha256: string }[];
} {
  if (!verifyStaticGenerationShape(staticInput)) throw new Error('static authority generation failed Core validation');
  if (staticInput.generationSha256 !== calibrationAdmissionStaticAuthorityGenerationSha256(staticInput)) throw new Error('static authority generation self-hash mismatch');
  if (current.generation !== staticInput.generation || current.staticGenerationSha256 !== staticInput.generationSha256) throw new Error('authority current pointer does not bind static generation');
  return staticInput;
}

function verifyCurrentPointer(currentInput: unknown): { readonly generation: number; readonly staticGenerationSha256: string; readonly staticGenerationRelativePath: string; readonly currentSha256: string } {
  if (!isCalibrationAdmissionAuthorityCurrentV1(currentInput)) throw new Error('authority current pointer failed Core validation');
  if (currentInput.currentSha256 !== calibrationAdmissionAuthorityCurrentSha256(currentInput)) throw new Error('authority current pointer self-hash mismatch');
  const expectedStaticRelative = `${STATIC_ROOT}/${currentInput.staticGenerationSha256}`;
  if (currentInput.staticGenerationRelativePath !== expectedStaticRelative) throw new Error('authority current pointer static path/hash join mismatch');
  return currentInput;
}

function verifyBundle(bundleInput: unknown): CalibrationAdmissionPreWitnessBundleV1 {
  if (!isCalibrationAdmissionPreWitnessBundleV1(bundleInput)) {
    const validation = validateCalibrationAdmissionPreWitnessBundleV1(bundleInput);
    throw new Error(`pre-witness bundle failed Core validation${!validation.ok && validation.errors.length > 0 ? `: ${validation.errors.join(', ')}` : ''}`);
  }
  if (bundleInput.preWitnessBundleSha256 !== calibrationAdmissionPreWitnessBundleSha256(bundleInput)) throw new Error('pre-witness bundle self-hash mismatch');
  return bundleInput;
}

/**
 * Bind every rich-bundle source review to its immutable, byte-backed source
 * generation.  The source layout is deliberately fixed: callers cannot
 * substitute a projection path or discover a different generation directory.
 */
async function verifySourceReviewAuthorities(root: AdmissionRoot, bundle: CalibrationAdmissionPreWitnessBundleV1): Promise<void> {
  for (const review of bundle.sourceReviews) {
    const sourceId = review.sourceId;
    const currentPath = join(root.admissionRoot, SOURCES_ROOT, sourceId, 'current.json');
    const currentInput = await readCanonicalJson(root, currentPath, `source ${sourceId} current pointer`);
    if (!isCalibrationAdmissionSourceCurrentV1(currentInput)) throw new Error(`source ${sourceId} current pointer failed Core validation`);
    const current = currentInput as CalibrationAdmissionSourceCurrentV1;
    if (current.currentSha256 !== calibrationAdmissionSourceCurrentSha256(current)) throw new Error(`source ${sourceId} current pointer self-hash mismatch`);
    const expectedGenerationRelativePath = `${SOURCES_ROOT}/${sourceId}/generations/${current.generationSha256}`;
    if (current.sourceId !== sourceId || current.generationRelativePath !== expectedGenerationRelativePath) {
      throw new Error(`source ${sourceId} current pointer source/hash/path join mismatch`);
    }

    const generationDirectory = join(root.admissionRoot, current.generationRelativePath);
    if (!pathInside(root.admissionRoot, generationDirectory)) throw new Error(`source ${sourceId} generation escapes the contained admission root`);
    const generationInput = await readCanonicalJson(root, join(generationDirectory, 'source-generation.json'), `source ${sourceId} generation`);
    if (!isCalibrationAdmissionSourceGenerationV1(generationInput)) throw new Error(`source ${sourceId} generation failed Core validation`);
    const generation = generationInput as CalibrationAdmissionSourceGenerationV1;
    if (generation.generationSha256 !== calibrationAdmissionSourceGenerationSha256(generation)) throw new Error(`source ${sourceId} generation self-hash mismatch`);
    if (generation.generationSha256 !== current.generationSha256) throw new Error(`source ${sourceId} generation hash does not match its current pointer`);
    const sourceReviewSha256 = calibrationAdmissionSourceReviewSha256(review);
    if (generation.sourceId !== sourceId || generation.sourceReviewSha256 !== sourceReviewSha256) {
      throw new Error(`source ${sourceId} generation source-review hash is not bound to the rich bundle`);
    }

    const sourceReviewArtifacts = generation.artifacts.filter((artifact) => artifact.kind === 'source_review' && artifact.relativePath === 'source-review.json');
    if (sourceReviewArtifacts.length !== 1) throw new Error(`source ${sourceId} generation must contain exactly one source-review artifact`);
    const sourceReviewArtifact = sourceReviewArtifacts[0]!;
    if (sourceReviewArtifact.pathBase !== 'generation_local') throw new Error(`source ${sourceId} source-review artifact must be generation-local`);
    const sourceReviewBytes = await readContainedFile(root, join(generationDirectory, sourceReviewArtifact.relativePath));
    if (hasUtf8Bom(sourceReviewBytes)) throw new Error(`source ${sourceId} source-review artifact must not contain a UTF-8 BOM`);
    const expectedSourceReviewBytes = Buffer.from(`${calibrationAdmissionCanonicalJson(review)}\n`, 'utf8');
    if (sourceReviewArtifact.bytes !== expectedSourceReviewBytes.byteLength
      || sourceReviewBytes.byteLength !== sourceReviewArtifact.bytes
      || sourceReviewArtifact.sha256 !== hashBytes(sourceReviewBytes)
      || !sourceReviewBytes.equals(expectedSourceReviewBytes)) {
      throw new Error(`source ${sourceId} source-review artifact receipt does not match canonical bytes/hash`);
    }
  }
}

function verifyStreamRecords(bundle: CalibrationAdmissionPreWitnessBundleV1, streamBytes: Buffer): { readonly recordIds: readonly string[]; readonly recordMap: ReadonlyMap<string, VerifiedRecord> } {
  const parsedRecords = parseCanonicalJsonl(streamBytes);
  const stream = bundle.admissionRecordStream as CalibrationAdmissionRecordStreamV1;
  const streamValidation = validateCalibrationAdmissionRecordStreamV1(stream, streamBytes, parsedRecords);
  if (!streamValidation.ok) throw new Error(`record stream failed Core validation: ${streamValidation.errors.join(', ')}`);
  const recordMap = new Map<string, VerifiedRecord>();
  const recordIds: string[] = [];
  for (const value of parsedRecords) {
    if (!isCalibrationAdmissionRecordV103(value)) throw new Error('record stream contains a record that failed Core validation');
    if (recordMap.has(value.recordId)) throw new Error(`record stream contains duplicate record ID ${value.recordId}`);
    recordIds.push(value.recordId);
    const canonicalJson = calibrationAdmissionCanonicalJson(value);
    recordMap.set(value.recordId, {
      record: value as unknown as CalibrationAdmissionRecordV103,
      canonicalJson,
      canonicalSha256: hashBytes(Buffer.from(canonicalJson, 'utf8')),
    });
  }
  return { recordIds, recordMap };
}

function validateRecordAuthority(
  bundle: CalibrationAdmissionPreWitnessBundleV1,
  records: ReadonlyMap<string, VerifiedRecord>,
): readonly string[] {
  const errors: string[] = [];
  const sourceReviews = new Map(bundle.sourceReviews.map((review) => [review.sourceId, review]));
  const privacyResults = new Map(bundle.privacyLedger.results.map((result) => [result.recordId, result]));
  const qualityResults = new Map(bundle.qualityLedger.results.map((result) => [result.recordId, result]));
  const lineageResults = new Map(bundle.lineageLedger.results.map((result) => [result.recordId, result]));
  const unresolvedRecordIds = new Set([
    ...bundle.privacyLedger.unresolvedRecordIds,
    ...bundle.qualityLedger.unresolvedRecordIds,
    ...bundle.lineageLedger.unresolvedRecordIds,
  ]);

  for (const verified of records.values()) {
    const record = verified.record;
    if (verified.canonicalSha256 !== calibrationAdmissionSha256(record)
      || verified.canonicalJson !== calibrationAdmissionCanonicalJson(record)) {
      errors.push(`record ${record.recordId} canonical binding is invalid`);
    }

    const sourceReview = sourceReviews.get(record.materialSourceId);
    if (sourceReview === undefined || record.sourceReviewSha256 !== calibrationAdmissionSourceReviewSha256(sourceReview)) {
      errors.push(`record ${record.recordId} source review hash is not bound to its material source`);
    }
    if (unresolvedRecordIds.has(record.recordId) && record.declaredDisposition !== 'quarantine') {
      errors.push(`record ${record.recordId} is unresolved but not quarantined`);
    }

    const privacy = privacyResults.get(record.recordId);
    if (privacy !== undefined) {
      if (record.contentSha256 !== privacy.contentSha256) errors.push(`record ${record.recordId} content hash differs from privacy result`);
      if (record.claimedAudits.privacy !== privacy.privacyStatus || record.claimedAudits.secrets !== privacy.secretStatus) {
        errors.push(`record ${record.recordId} claimed privacy audits differ from the privacy result`);
      }
      if (privacy.reviewerDecisionIds.some((decisionId) => !record.reviewerDecisionIds.includes(decisionId))) {
        errors.push(`record ${record.recordId} does not include all privacy reviewer decisions`);
      }
    }

    const quality = qualityResults.get(record.recordId);
    if (quality !== undefined) {
      if (record.contentSha256 !== quality.contentSha256) errors.push(`record ${record.recordId} content hash differs from quality result`);
      if (record.claimedAudits.syntax !== quality.syntaxStatus || record.claimedAudits.scaffoldByteShare !== quality.scaffoldByteShare) {
        errors.push(`record ${record.recordId} claimed quality audits differ from the quality result`);
      }
    }

    const lineage = lineageResults.get(record.recordId);
    if (lineage !== undefined) {
      const claimedPairGroupId = record.claimedLineage.pairGroupId ?? null;
      if (record.contentSha256 !== lineage.contentSha256
        || record.claimedLineage.familyId !== lineage.familyId
        || claimedPairGroupId !== lineage.pairGroupId
        || record.claimedLineage.exactClusterId !== lineage.exactClusterId
        || record.claimedLineage.nearClusterId !== lineage.nearClusterId) {
        errors.push(`record ${record.recordId} claimed lineage differs from the lineage result`);
      }
    }
  }
  return errors;
}

function verifyStaticBundleAndStream(root: AdmissionRoot, staticPath: string, staticGeneration: ReturnType<typeof verifyStaticGeneration>): Promise<{ readonly bundle: CalibrationAdmissionPreWitnessBundleV1; readonly streamBytes: Buffer; readonly records: ReadonlyMap<string, VerifiedRecord> }> {
  return (async () => {
    const artifacts = requiredStaticArtifactReceipts(staticGeneration);
    const bundle = verifyBundle(await readCanonicalJson(root, join(staticPath, STATIC_BUNDLE_PATH), 'pre-witness bundle'));
    verifyStaticLedgerAnchors(bundle, staticGeneration);
    verifyStaticArtifactReceipts(artifacts, bundle, staticGeneration);
    verifyToolAuthoritySnapshotEquality(bundle, staticGeneration);
    await verifySourceReviewAuthorities(root, bundle);
    const stream = bundle.admissionRecordStream as CalibrationAdmissionRecordStreamV1;
    if (stream.relativePath !== STREAM_RELATIVE_PATH) throw new Error('pre-witness bundle record stream path is not the fixed admission path');
    const streamBytes = await readContainedFile(root, join(root.projectRoot, stream.relativePath));
    const verifiedRecords = verifyStreamRecords(bundle, streamBytes);
    const recordIds = verifiedRecords.recordIds;
    const sourceReviewValidation = validateCalibrationAdmissionSourceRegisterReviewSet(bundle.sourceRegister, bundle.sourceReviews);
    if (!sourceReviewValidation.ok) throw new Error(`source register/review ID or binding validation failed: ${sourceReviewValidation.errors.join(', ')}`);
    const ledgerErrors = validateBundleLedgers(bundle, recordIds);
    if (ledgerErrors.length > 0) throw new Error(ledgerErrors.join('; '));
    const recordAuthorityErrors = validateRecordAuthority(bundle, verifiedRecords.recordMap);
    if (recordAuthorityErrors.length > 0) throw new Error(recordAuthorityErrors.join('; '));
    const overlapErrors = validateOverlapResourceReceipt(bundle);
    if (overlapErrors.length > 0) throw new Error(overlapErrors.join('; '));
    return { bundle, streamBytes, records: verifiedRecords.recordMap };
  })();
}

async function loadAndVerify(root: AdmissionRoot, evidence: VerifiedAdmissionEvidenceContextV1): Promise<{ readonly bundle: CalibrationAdmissionPreWitnessBundleV1; readonly streamBytes: Buffer; readonly records: ReadonlyMap<string, VerifiedRecord> }> {
  const currentPath = join(root.projectRoot, CURRENT_RELATIVE_PATH);
  const current = verifyCurrentPointer(await readCanonicalJson(root, currentPath, 'authority current pointer'));
  const staticPath = join(root.projectRoot, current.staticGenerationRelativePath);
  if (!pathInside(root.admissionRoot, staticPath)) throw new Error('authority static generation escapes the contained admission root');
  const staticGeneration = verifyStaticGeneration(await readCanonicalJson(root, join(staticPath, 'generation.json'), 'static authority generation'), current);
  const verified = await verifyStaticBundleAndStream(root, staticPath, staticGeneration);
  // The evidence brand is checked before any evidence object property is read.
  if (!isVerifiedAdmissionEvidenceContext(evidence)) throw new Error('evidence context is not a verified SlopBrick context');
  return verified;
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
  return { disposition: record.record.declaredDisposition, reasons: [...record.record.rejectionReasons] };
}
