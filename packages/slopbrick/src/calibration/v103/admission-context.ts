import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readdir, realpath, type FileHandle } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

import {
  calibrationAdmissionAuthorityCurrentSha256,
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionInputGenerationSha256,
  calibrationAdmissionOverlapCurrentSha256,
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
  isCalibrationAdmissionInputGenerationV1,
  isCalibrationAdmissionOverlapCurrentV1,
  isCalibrationAdmissionOverlapGenerationV1,
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
  isCalibrationAdmissionSourceGenerationApprovalV1,
  isCalibrationAdmissionSourceGenerationProposalV1,
  validateCalibrationAdmissionSourceGenerationGraphV1,
  type CalibrationAdmissionPreWitnessBundleV1,
  type CalibrationAdmissionInputGenerationV1,
  type CalibrationAdmissionRecordV103,
  type CalibrationAdmissionRecordStreamV1,
  type CalibrationAdmissionSourceCurrentV1,
  type CalibrationAdmissionSourceGenerationV1,
  type CalibrationAdmissionToolAuthoritySnapshotV1,
  type AdmissionOverlapGenerationV1,
} from '@usebrick/core';

import {
  isVerifiedAdmissionEvidenceContext,
  type VerifiedAdmissionEvidenceContextV1,
} from './admission-evidence-context';
import { resolveAdmissionToolAuthorityReceipt } from './admission-publication';
import { validatePrebuiltAdmissionAuthorityOverlapJoin } from './admission-authority-overlap-join';
import {
  calibrationAdmissionSourceSemanticAuthoritySha256,
  type PrebuiltAdmissionAuthoritySourceSemanticAuthorityV1,
} from './admission-authority-rebuild';

const CURRENT_RELATIVE_PATH = 'review/admission/authority/current.json';
const SOURCES_ROOT = 'sources';
const STATIC_ROOT = 'review/admission/authority/static-generations';
const STREAM_RELATIVE_PATH = 'review/admission/admission-records.jsonl';
const OVERLAP_GENERATIONS_ROOT = 'review/admission/global/overlap/generations';
const STATIC_BUNDLE_PATH = 'pre-witness-bundle.json';
const OVERLAP_INDEX_PATH = 'index.json';
const OVERLAP_RESOURCE_PATH = 'overlap-resource-receipt.json';
const OVERLAP_LEDGER_PATH = 'overlap-ledger.json';
const SOURCE_SEMANTIC_AUTHORITY_PATH = 'source-semantic-authority.json';
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
  readonly overlapAuthority: Readonly<{
    readonly inputGenerationSha256: string;
    readonly inputGenerationBytesSha256: string;
    readonly sourceAuthoritySha256: string;
    readonly generationSha256: string;
    readonly indexReceiptSha256: string;
    readonly resourceReceiptId: string;
    readonly ledgerSha256: string;
    readonly toolReceiptSha256: string;
    readonly authorityIndexSha256: string;
    readonly receiptSha256: string;
    readonly proofSha256: string;
  }>;
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
  const lexical = resolve(input);
  const inputMetadata = await lstat(lexical);
  if (inputMetadata.isSymbolicLink()) throw new Error('admission root must not be a symlink');
  if (!inputMetadata.isDirectory()) throw new Error('admission root must be a directory');
  const resolved = await realpath(lexical);
  if (basename(resolved) === 'admission' && basename(dirname(resolved)) === 'review') {
    await rejectSymlinkAncestors(dirname(dirname(resolved)), resolved);
    return { projectRoot: dirname(dirname(resolved)), admissionRoot: resolved };
  }
  const admissionRoot = join(resolved, 'review', 'admission');
  await rejectSymlinkAncestors(resolved, admissionRoot);
  const metadata = await lstat(admissionRoot);
  if (!metadata.isDirectory()) throw new Error('review/admission is not a directory');
  return { projectRoot: resolved, admissionRoot };
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
  const resolved = await realpath(canonical);
  if (!pathInside(root.admissionRoot, resolved)) throw new Error('referenced artifact escapes the contained admission root');
  let handle: FileHandle | undefined;
  try {
    handle = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW);
    const metadata = await handle.stat();
    if (!metadata.isFile()) throw new Error('referenced artifact is not a regular file');
    const bytes = await handle.readFile();
    if (await realpath(canonical) !== resolved) throw new Error('referenced artifact changed during read');
    return bytes;
  } finally {
    if (handle !== undefined) await handle.close().catch(() => undefined);
  }
}

async function readCanonicalJson(root: AdmissionRoot, absolutePath: string, label: string): Promise<unknown> {
  return (await readCanonicalJsonWithBytes(root, absolutePath, label)).value;
}

async function readCanonicalJsonWithBytes(root: AdmissionRoot, absolutePath: string, label: string): Promise<{ readonly value: unknown; readonly bytes: Buffer }> {
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
  return { value: parsed, bytes };
}

/** Verify that a selected immutable generation contains exactly its declared
 * generation descriptor and artifact leaves. This prevents an unlisted shard,
 * checkpoint, or projection from surviving beside otherwise valid envelopes. */
async function readCompleteGenerationTree(
  root: AdmissionRoot,
  directory: string,
  artifacts: readonly { readonly relativePath: string }[],
  label: string,
  descriptorName = 'generation.json',
  additionalRelativePaths: readonly string[] = [],
): Promise<Readonly<Record<string, Buffer>>> {
  await rejectSymlinkAncestors(root.admissionRoot, directory);
  const expected = new Set(artifacts.map((artifact) => artifact.relativePath));
  expected.add(descriptorName);
  for (const relativePath of additionalRelativePaths) expected.add(relativePath);
  const seen = new Set<string>();
  const walk = async (current: string, relativeDirectory: string): Promise<void> => {
    await rejectSymlinkAncestors(root.admissionRoot, current);
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const child = join(current, entry.name);
      await rejectSymlinkAncestors(root.admissionRoot, child);
      const childRelative = relativeDirectory === '' ? entry.name : `${relativeDirectory}/${entry.name}`;
      if (entry.isDirectory()) {
        await walk(child, childRelative);
      } else if (!entry.isFile() || !expected.has(childRelative)) {
        throw new Error(`${label} contains an orphan or non-file: ${childRelative}`);
      } else {
        seen.add(childRelative);
      }
    }
  };
  await walk(directory, '');
  for (const path of expected) if (!seen.has(path)) throw new Error(`${label} is missing ${path}`);
  const bytes: Record<string, Buffer> = {};
  for (const artifact of artifacts) {
    bytes[artifact.relativePath] = await readContainedFile(root, join(directory, artifact.relativePath));
  }
  return bytes;
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
  expectedSemanticSha256: string,
  label: string,
): void {
  const canonical = Buffer.from(calibrationAdmissionCanonicalJson(expected), 'utf8');
  if (artifact.sha256 !== hashBytes(canonical) || artifact.bytes !== canonical.byteLength) {
    throw new Error(`${label} artifact receipt does not match canonical bytes/hash`);
  }
  // The generation fields remain semantic self-hashes; the artifact receipt
  // is a raw-byte hash. Keep both contracts explicit at this boundary.
  if (expectedSemanticSha256.length !== 64) throw new Error(`${label} semantic hash is invalid`);
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
  // Static-generation artifact sha256 fields are raw canonical-byte hashes;
  // the generation fields above carry the semantic self-hashes. The complete
  // selected static tree has already been reopened, and this projection check
  // binds each required rich object to its declared raw byte receipt.
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
  readonly inputGenerationSha256: string;
  readonly overlapGenerationSha256: string;
  readonly preWitnessBundleSha256: string;
  readonly privacyLedgerSha256: string;
  readonly qualityLedgerSha256: string;
  readonly lineageLedgerSha256: string;
  readonly toolAuthoritySnapshot: CalibrationAdmissionToolAuthoritySnapshotV1;
  readonly artifacts: readonly { readonly kind: string; readonly relativePath: string; readonly bytes: number; readonly sha256: string }[];
} {
  return isCalibrationAdmissionStaticAuthorityGenerationV1(staticGeneration);
}

function verifyStaticGeneration(staticInput: unknown, current: { readonly generation: number; readonly staticGenerationSha256: string }): {
  readonly generation: number;
  readonly generationSha256: string;
  readonly inputGenerationSha256: string;
  readonly overlapGenerationSha256: string;
  readonly preWitnessBundleSha256: string;
  readonly privacyLedgerSha256: string;
  readonly qualityLedgerSha256: string;
  readonly lineageLedgerSha256: string;
  readonly toolAuthoritySnapshot: CalibrationAdmissionToolAuthoritySnapshotV1;
  readonly artifacts: readonly { readonly kind: string; readonly relativePath: string; readonly bytes: number; readonly sha256: string }[];
} {
  if (!verifyStaticGenerationShape(staticInput)) throw new Error('static authority generation failed Core validation');
  if (staticInput.generationSha256 !== calibrationAdmissionStaticAuthorityGenerationSha256(staticInput)) throw new Error('static authority generation self-hash mismatch');
  if (current.generation !== staticInput.generation || current.staticGenerationSha256 !== staticInput.generationSha256) throw new Error('authority current pointer does not bind static generation');
  return staticInput;
}

type VerifiedOverlapAuthority = VerifiedAdmissionContextV1['overlapAuthority'];

/**
 * Bind the runtime context to the exact overlap generation selected by the
 * static authority.  The static/overlap join is deliberately repeated here
 * instead of trusting the rich bundle's hash-only overlap receipt: this
 * caller has the bytes, the fixed paths, and the indexed tool-authority
 * resolver needed by the strict prebuilt proof.
 */
async function verifyRuntimeOverlapAuthority(
  root: AdmissionRoot,
  staticGeneration: ReturnType<typeof verifyStaticGeneration>,
  staticGenerationBytes: Uint8Array,
  bundle: CalibrationAdmissionPreWitnessBundleV1,
  inputAuthority: VerifiedInputAuthority,
): Promise<VerifiedOverlapAuthority> {
  const overlapGenerationPath = join(
    root.projectRoot,
    `${OVERLAP_GENERATIONS_ROOT}/${staticGeneration.overlapGenerationSha256}`,
  );
  const overlapGenerationRead = await readCanonicalJsonWithBytes(
    root,
    join(overlapGenerationPath, 'generation.json'),
    'overlap authority generation',
  );
  if (!isCalibrationAdmissionOverlapGenerationV1(overlapGenerationRead.value)) {
    throw new Error('overlap authority generation failed Core validation');
  }
  const overlapGeneration = overlapGenerationRead.value as AdmissionOverlapGenerationV1;
  if (overlapGeneration.inputGenerationSha256 !== staticGeneration.inputGenerationSha256
    || overlapGeneration.inputGenerationSha256 !== inputAuthority.generationSha256) {
    throw new Error('overlap authority generation does not bind the verified input generation');
  }
  if (overlapGeneration.universeSha256 !== bundle.overlapUniverse.universeSha256
    || overlapGeneration.overlapPolicySha256 !== bundle.overlapPolicy.policySha256) {
    throw new Error('overlap authority generation is not bound to the rich bundle overlap inputs');
  }
  await readCompleteGenerationTree(root, overlapGenerationPath, overlapGeneration.artifacts, 'overlap authority generation');
  const overlapCurrentRead = await readCanonicalJsonWithBytes(
    root,
    join(root.projectRoot, 'review', 'admission', 'global', 'overlap', 'current-generation.json'),
    'overlap current pointer',
  );
  if (!isCalibrationAdmissionOverlapCurrentV1(overlapCurrentRead.value)) {
    throw new Error('overlap current pointer failed Core validation');
  }
  if (overlapCurrentRead.value.currentSha256 !== calibrationAdmissionOverlapCurrentSha256(overlapCurrentRead.value)
    || overlapCurrentRead.value.generationSha256 !== overlapGeneration.generationSha256
    || overlapCurrentRead.value.generation !== overlapGeneration.generation
    || overlapCurrentRead.value.generationRelativePath !== `${OVERLAP_GENERATIONS_ROOT}/${overlapGeneration.generationSha256}`) {
    throw new Error('overlap current pointer does not bind selected generation');
  }
  const [indexRead, resourceRead, ledgerRead] = await Promise.all([
    readCanonicalJsonWithBytes(root, join(overlapGenerationPath, OVERLAP_INDEX_PATH), 'overlap index receipt'),
    readCanonicalJsonWithBytes(root, join(overlapGenerationPath, OVERLAP_RESOURCE_PATH), 'overlap resource receipt'),
    readCanonicalJsonWithBytes(root, join(overlapGenerationPath, OVERLAP_LEDGER_PATH), 'overlap ledger'),
  ]);
  if (!isCalibrationAdmissionOverlapResourceReceiptV1(resourceRead.value)) {
    throw new Error('overlap resource receipt failed Core validation');
  }
  const resource = resourceRead.value;
  if (isRecord(indexRead.value)
    && (indexRead.value.normalizerRegistrySha256 !== bundle.normalizerRegistry.registrySha256
      || indexRead.value.overlapPolicySha256 !== bundle.overlapPolicy.policySha256)
    || isRecord(resourceRead.value)
      && resourceRead.value.overlapPolicySha256 !== bundle.overlapPolicy.policySha256
    || isRecord(ledgerRead.value)
      && ledgerRead.value.normalizerRegistrySha256 !== bundle.normalizerRegistry.registrySha256) {
    throw new Error('overlap envelopes are not bound to the rich bundle normalizer/policy');
  }

  const bundleJoins: readonly [string, unknown, unknown][] = [
    ['index', bundle.overlapIndexReceipt, indexRead.value],
    ['resource', bundle.overlapResourceReceipt, resourceRead.value],
    ['ledger', bundle.overlapLedger, ledgerRead.value],
  ];
  for (const [label, bundleValue, diskValue] of bundleJoins) {
    if (calibrationAdmissionCanonicalJson(bundleValue) !== calibrationAdmissionCanonicalJson(diskValue)) {
      throw new Error(`overlap ${label} receipt is not bound to the rich bundle`);
    }
  }

  const overlapReceipts = bundle.toolReceipts.filter((receipt) =>
    calibrationAdmissionToolReceiptSha256(receipt) === resource.toolReceiptSha256,
  );
  if (overlapReceipts.length !== 1) {
    throw new Error('overlap resource receipt does not identify exactly one rich-bundle tool receipt');
  }
  const overlapReceipt = overlapReceipts[0]!;
  const overlapIntent = bundle.invocationIntents.find((intent) => intent.intentId === overlapReceipt.invocationIntentId);
  if (overlapIntent === undefined) throw new Error('overlap tool receipt invocation intent is missing from the rich bundle');

  const toolAuthority = await resolveAdmissionToolAuthorityReceipt({
    authorityRoot: join(root.projectRoot, 'review', 'admission', 'tool-authority'),
    authorityIndexSha256: staticGeneration.toolAuthoritySnapshot.indexGenerationSha256,
    receiptId: overlapReceipt.receiptId,
    receiptSha256: calibrationAdmissionToolReceiptSha256(overlapReceipt),
    invocationIntentId: overlapIntent.intentId,
    profileId: OVERLAP_TOOL_PROFILE_ID,
    action: 'authority:overlap',
    expectedSnapshot: staticGeneration.toolAuthoritySnapshot,
  });
  const validation = validatePrebuiltAdmissionAuthorityOverlapJoin({
    staticGeneration,
    staticGenerationBytes,
    overlapGeneration,
    overlapGenerationBytes: overlapGenerationRead.bytes,
    envelopes: {
      index: { value: indexRead.value, bytes: indexRead.bytes },
      resource: { value: resourceRead.value, bytes: resourceRead.bytes },
      ledger: { value: ledgerRead.value, bytes: ledgerRead.bytes },
    },
    toolAuthority,
  });
  if (!validation.ok) throw new Error(`overlap static authority join failed: ${validation.errors.join(', ')}`);

  const proofBody = {
    inputGenerationSha256: inputAuthority.generationSha256,
    inputGenerationBytesSha256: inputAuthority.generationBytesSha256,
    sourceAuthoritySha256: inputAuthority.sourceAuthoritySha256,
    staticGenerationSha256: staticGeneration.generationSha256,
    staticGenerationBytesSha256: hashBytes(staticGenerationBytes),
    overlapGenerationSha256: overlapGeneration.generationSha256,
    overlapGenerationBytesSha256: hashBytes(overlapGenerationRead.bytes),
    overlapCurrentBytesSha256: hashBytes(overlapCurrentRead.bytes),
    indexBytesSha256: hashBytes(indexRead.bytes),
    resourceBytesSha256: hashBytes(resourceRead.bytes),
    ledgerBytesSha256: hashBytes(ledgerRead.bytes),
    authorityIndexSha256: toolAuthority.authorityIndexSha256,
    receiptSha256: toolAuthority.receiptSha256,
    invocationIntentId: toolAuthority.invocationIntent.intentId,
  };
  return {
    inputGenerationSha256: inputAuthority.generationSha256,
    inputGenerationBytesSha256: inputAuthority.generationBytesSha256,
    sourceAuthoritySha256: inputAuthority.sourceAuthoritySha256,
    generationSha256: overlapGeneration.generationSha256,
    indexReceiptSha256: isRecord(indexRead.value) && typeof indexRead.value.receiptSha256 === 'string' ? indexRead.value.receiptSha256 : '',
    resourceReceiptId: resourceRead.value.receiptId,
    ledgerSha256: isRecord(ledgerRead.value) && typeof ledgerRead.value.ledgerSha256 === 'string' ? ledgerRead.value.ledgerSha256 : '',
    toolReceiptSha256: toolAuthority.receiptSha256,
    authorityIndexSha256: toolAuthority.authorityIndexSha256,
    receiptSha256: toolAuthority.receiptSha256,
    proofSha256: calibrationAdmissionSha256(proofBody),
  };
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
type VerifiedSourceAuthority = Readonly<{
  readonly sourceId: string;
  readonly generationSha256: string;
  readonly generationRelativePath: string;
  readonly artifactSetSha256: string;
  readonly currentBytesSha256: string;
  readonly generationBytesSha256: string;
  readonly sourceReviewBytesSha256: string;
  /** Raw canonical hash of the candidate semantic-authority sidecar. */
  readonly semanticAuthorityBytesSha256?: string;
}>;

function isSourceSemanticAuthorityShape(value: unknown): value is PrebuiltAdmissionAuthoritySourceSemanticAuthorityV1 {
  if (!isRecord(value)) return false;
  const expectedKeys = [
    'version', 'sourceId', 'proposalId', 'blindAssignment', 'decisions', 'blindReviewReceipt',
    ...(Object.prototype.hasOwnProperty.call(value, 'acquisitionSnapshot') ? ['acquisitionSnapshot'] : []),
    ...(Object.prototype.hasOwnProperty.call(value, 'materializationReceipt') ? ['materializationReceipt'] : []),
    ...(Object.prototype.hasOwnProperty.call(value, 'evidenceBundle') ? ['evidenceBundle'] : []),
    'authoritySha256',
  ].sort();
  const actualKeys = Object.keys(value).sort();
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index])
    && value.version === 'v10.3-admission-source-semantic-authority-v1'
    && typeof value.sourceId === 'string'
    && typeof value.proposalId === 'string'
    && Array.isArray(value.decisions)
    && value.decisions.length === 2
    && typeof value.authoritySha256 === 'string'
    && /^[a-f0-9]{64}$/u.test(value.authoritySha256)
    && calibrationAdmissionSourceSemanticAuthoritySha256(value) === value.authoritySha256;
}

type VerifiedCandidateSourceAuthority = Readonly<{
  readonly semanticAuthorityBytes: Buffer;
}>;

async function verifySourceReviewAuthorities(root: AdmissionRoot, bundle: CalibrationAdmissionPreWitnessBundleV1): Promise<ReadonlyMap<string, VerifiedSourceAuthority>> {
  const authorities = new Map<string, VerifiedSourceAuthority>();
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
    let candidate: VerifiedCandidateSourceAuthority | undefined;
    if (generation.approval.kind === 'independent_review') {
      const proposalPath = join(
        root.admissionRoot,
        SOURCES_ROOT,
        sourceId,
        'proposals',
        `${generation.proposalId}.json`,
      );
      const approvalPath = join(
        root.admissionRoot,
        SOURCES_ROOT,
        sourceId,
        'proposals',
        `${generation.proposalId}-approval.json`,
      );
      const semanticPath = join(generationDirectory, SOURCE_SEMANTIC_AUTHORITY_PATH);
      const [proposalRead, approvalRead, semanticRead] = await Promise.all([
        readCanonicalJsonWithBytes(root, proposalPath, `source ${sourceId} source-generation proposal`),
        readCanonicalJsonWithBytes(root, approvalPath, `source ${sourceId} source-generation approval`),
        readCanonicalJsonWithBytes(root, semanticPath, `source ${sourceId} semantic authority`),
      ]);
      if (!isCalibrationAdmissionSourceGenerationProposalV1(proposalRead.value)) {
        throw new Error(`source ${sourceId} source-generation proposal failed Core validation`);
      }
      if (!isCalibrationAdmissionSourceGenerationApprovalV1(approvalRead.value)) {
        throw new Error(`source ${sourceId} source-generation approval failed Core validation`);
      }
      if (!isSourceSemanticAuthorityShape(semanticRead.value)) {
        throw new Error(`source ${sourceId} semantic authority failed shape or self-hash validation`);
      }
      const graph = validateCalibrationAdmissionSourceGenerationGraphV1({
        proposal: proposalRead.value,
        sourceReview: review,
        generation,
        approval: approvalRead.value,
        blindAssignment: semanticRead.value.blindAssignment,
        decisions: semanticRead.value.decisions,
        blindReviewReceipt: semanticRead.value.blindReviewReceipt,
        ...(semanticRead.value.evidenceBundle === undefined ? {} : { evidenceBundle: semanticRead.value.evidenceBundle }),
        ...(semanticRead.value.acquisitionSnapshot === undefined ? {} : { acquisitionSnapshot: semanticRead.value.acquisitionSnapshot }),
        ...(semanticRead.value.materializationReceipt === undefined ? {} : { materializationReceipt: semanticRead.value.materializationReceipt }),
      });
      if (!graph.ok) throw new Error(`source ${sourceId} semantic authority graph is invalid: ${graph.errors.join(', ')}`);
      candidate = {
        semanticAuthorityBytes: semanticRead.bytes,
      };
    }
    await readCompleteGenerationTree(
      root,
      generationDirectory,
      generation.artifacts,
      `source ${sourceId} generation`,
      'source-generation.json',
      candidate === undefined ? [] : [SOURCE_SEMANTIC_AUTHORITY_PATH],
    );
    if (authorities.has(sourceId)) throw new Error(`source ${sourceId} appears more than once in the rich bundle`);
    authorities.set(sourceId, {
      sourceId,
      generationSha256: generation.generationSha256,
      generationRelativePath: current.generationRelativePath,
      artifactSetSha256: generation.artifactSetSha256,
      currentBytesSha256: hashBytes(Buffer.from(calibrationAdmissionCanonicalJson(current), 'utf8')),
      generationBytesSha256: hashBytes(Buffer.from(calibrationAdmissionCanonicalJson(generation), 'utf8')),
      sourceReviewBytesSha256: hashBytes(sourceReviewBytes),
      ...(candidate === undefined ? {} : { semanticAuthorityBytesSha256: hashBytes(candidate.semanticAuthorityBytes) }),
    });
  }
  return authorities;
}

type VerifiedInputAuthority = Readonly<{
  readonly generationSha256: string;
  readonly generationBytesSha256: string;
  readonly sourceAuthoritySha256: string;
}>;

async function verifyRuntimeInputGeneration(
  root: AdmissionRoot,
  staticGeneration: ReturnType<typeof verifyStaticGeneration>,
  bundle: CalibrationAdmissionPreWitnessBundleV1,
  evidence: VerifiedAdmissionEvidenceContextV1,
  streamBytes: Buffer,
  sources: ReadonlyMap<string, VerifiedSourceAuthority>,
): Promise<VerifiedInputAuthority> {
  const generationDirectory = join(
    root.projectRoot,
    'review',
    'admission',
    'authority',
    'input-generations',
    staticGeneration.inputGenerationSha256,
  );
  const generationRead = await readCanonicalJsonWithBytes(
    root,
    join(generationDirectory, 'generation.json'),
    'input authority generation',
  );
  if (!isCalibrationAdmissionInputGenerationV1(generationRead.value)) {
    throw new Error('input authority generation failed Core validation');
  }
  const generation = generationRead.value as CalibrationAdmissionInputGenerationV1;
  if (generation.generationSha256 !== calibrationAdmissionInputGenerationSha256(generation)) {
    throw new Error('input authority generation self-hash mismatch');
  }
  if (generation.generationSha256 !== staticGeneration.inputGenerationSha256) {
    throw new Error('static generation does not bind input authority generation');
  }
  const artifactBytes = await readCompleteGenerationTree(root, generationDirectory, generation.artifacts, 'input authority generation');
  for (const artifact of generation.artifacts) {
    const bytes = artifactBytes[artifact.relativePath];
    if (bytes === undefined || bytes.byteLength !== artifact.bytes || hashBytes(bytes) !== artifact.sha256) {
      throw new Error(`input authority artifact receipt does not match ${artifact.relativePath}`);
    }
  }
  if (generation.evidenceBundleSha256 !== evidence.bundle.bundleSha256) {
    throw new Error('input authority generation evidence bundle hash is not bound to the verified evidence context');
  }
  const recordArtifact = generation.artifacts.find((artifact) => artifact.kind === 'record_stream' && artifact.relativePath === 'admission-records.jsonl');
  if (recordArtifact === undefined || generation.admissionRecordStreamSha256 !== recordArtifact.sha256 || recordArtifact.sha256 !== hashBytes(streamBytes)) {
    throw new Error('input authority admission-record stream is not bound to the verified stream bytes');
  }
  const sourceIds = [...sources.keys()].sort();
  const generationSourceIds = generation.sourceGenerations.map((source) => source.sourceId);
  if (sourceIds.length !== generationSourceIds.length || sourceIds.some((sourceId, index) => sourceId !== generationSourceIds[index])) {
    throw new Error('input authority source set does not match the rich bundle source authorities');
  }
  for (const source of generation.sourceGenerations) {
    const authority = sources.get(source.sourceId);
    if (authority === undefined
      || source.generationSha256 !== authority.generationSha256
      || source.artifactSetSha256 !== authority.artifactSetSha256
      || source.relativePath !== `review/admission/${authority.generationRelativePath}`) {
      throw new Error(`input authority source ${source.sourceId} is not bound to its persisted source generation`);
    }
  }
  const sourceAuthoritySha256 = calibrationAdmissionSha256([...sources.values()]
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId))
    .map((authority) => ({
      sourceId: authority.sourceId,
      generationSha256: authority.generationSha256,
      generationRelativePath: authority.generationRelativePath,
      artifactSetSha256: authority.artifactSetSha256,
      currentBytesSha256: authority.currentBytesSha256,
      generationBytesSha256: authority.generationBytesSha256,
      sourceReviewBytesSha256: authority.sourceReviewBytesSha256,
      ...(authority.semanticAuthorityBytesSha256 === undefined
        ? {}
        : { semanticAuthorityBytesSha256: authority.semanticAuthorityBytesSha256 }),
    })));
  return {
    generationSha256: generation.generationSha256,
    generationBytesSha256: hashBytes(generationRead.bytes),
    sourceAuthoritySha256,
  };
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

function verifyStaticBundleAndStream(root: AdmissionRoot, staticPath: string, staticGeneration: ReturnType<typeof verifyStaticGeneration>): Promise<{ readonly bundle: CalibrationAdmissionPreWitnessBundleV1; readonly streamBytes: Buffer; readonly records: ReadonlyMap<string, VerifiedRecord>; readonly sources: ReadonlyMap<string, VerifiedSourceAuthority> }> {
  return (async () => {
    const artifacts = requiredStaticArtifactReceipts(staticGeneration);
    await readCompleteGenerationTree(root, staticPath, staticGeneration.artifacts, 'static authority generation');
    const bundle = verifyBundle(await readCanonicalJson(root, join(staticPath, STATIC_BUNDLE_PATH), 'pre-witness bundle'));
    verifyStaticLedgerAnchors(bundle, staticGeneration);
    verifyStaticArtifactReceipts(artifacts, bundle, staticGeneration);
    verifyToolAuthoritySnapshotEquality(bundle, staticGeneration);
    const sources = await verifySourceReviewAuthorities(root, bundle);
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
    return { bundle, streamBytes, records: verifiedRecords.recordMap, sources };
  })();
}

async function loadAndVerify(root: AdmissionRoot, evidence: VerifiedAdmissionEvidenceContextV1): Promise<{ readonly bundle: CalibrationAdmissionPreWitnessBundleV1; readonly streamBytes: Buffer; readonly records: ReadonlyMap<string, VerifiedRecord>; readonly overlapAuthority: VerifiedOverlapAuthority }> {
  const currentPath = join(root.projectRoot, CURRENT_RELATIVE_PATH);
  const current = verifyCurrentPointer(await readCanonicalJson(root, currentPath, 'authority current pointer'));
  const staticPath = join(root.projectRoot, current.staticGenerationRelativePath);
  if (!pathInside(root.admissionRoot, staticPath)) throw new Error('authority static generation escapes the contained admission root');
  const staticGenerationRead = await readCanonicalJsonWithBytes(root, join(staticPath, 'generation.json'), 'static authority generation');
  const staticGeneration = verifyStaticGeneration(staticGenerationRead.value, current);
  const verified = await verifyStaticBundleAndStream(root, staticPath, staticGeneration);
  const inputAuthority = await verifyRuntimeInputGeneration(root, staticGeneration, verified.bundle, evidence, verified.streamBytes, verified.sources);
  const overlapAuthority = await verifyRuntimeOverlapAuthority(root, staticGeneration, staticGenerationRead.bytes, verified.bundle, inputAuthority);
  // The evidence brand is checked before any evidence object property is read.
  if (!isVerifiedAdmissionEvidenceContext(evidence)) throw new Error('evidence context is not a verified SlopBrick context');
  return { ...verified, overlapAuthority };
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
      durable: structuredClone(verified.bundle),
      overlapAuthority: structuredClone(verified.overlapAuthority),
    };
    const contextSha256 = calibrationAdmissionSha256({
      durable: contextBody.durable,
      streamBytesSha256: hashBytes(verified.streamBytes),
      evidenceContextSha256: evidence.evidenceContextSha256,
      overlapAuthoritySha256: contextBody.overlapAuthority.proofSha256,
    });
    const context = deepFreeze({
      contextSha256,
      ...contextBody,
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
