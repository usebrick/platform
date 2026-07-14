import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import {
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionEvidenceBundleSha256,
  calibrationAdmissionEvidenceSourceLocatorSha256,
  calibrationAdmissionSha256,
  calibrationAdmissionToolReceiptSha256,
  isCalibrationAdmissionToolAuthorityIndexV1,
  isCalibrationAdmissionToolProfileV1,
  isCalibrationAdmissionInvocationIntentV1,
  isCalibrationAdmissionToolReceiptV1,
  isCalibrationAdmissionAcquisitionIndexV1,
  isCalibrationAdmissionEvidenceBundleV1,
  isCalibrationAdmissionEvidenceIndexV1,
  isCalibrationAdmissionEvidencePayloadSetV1,
  isCalibrationApprovedEvidenceAcquisitionV1,
  isCalibrationEvidenceAcquisitionEnvelopeV1,
  isCalibrationEvidenceAcquisitionReceiptV1,
  isCalibrationEvidenceCasPrimaryCompletionV1,
  type CalibrationAdmissionEvidenceBundleV1,
  type CalibrationAdmissionEvidenceIndexV1,
  type CalibrationAdmissionEvidencePayloadV1,
  type CalibrationAdmissionEvidencePayloadSetV1,
  type CalibrationAdmissionEvidenceReceiptV1,
  type CalibrationAdmissionAcquisitionIndexV1,
  type CalibrationApprovedEvidenceAcquisitionV1,
  type CalibrationEvidenceAcquisitionEnvelopeV1,
  type CalibrationEvidenceAcquisitionReceiptV1,
  type CalibrationEvidenceCasPrimaryCompletionV1,
  type CalibrationAdmissionMaterializationReceiptV1,
  type CalibrationAdmissionInvocationIntentV1,
  type CalibrationAdmissionToolProfileV1,
  type CalibrationAdmissionToolReceiptV1,
} from '@usebrick/core';
import { admissionEvidenceCasReservation, admissionEvidenceCasTransactionId, readAdmissionEvidenceCasBytes } from './admission-evidence-cas';

const SHA256 = /^[a-f0-9]{64}$/;

declare const verifiedAdmissionEvidenceContextBrand: unique symbol;

export type VerifiedAdmissionEvidenceContextV1 = Readonly<{
  readonly evidenceContextSha256: string;
  readonly bundle: CalibrationAdmissionEvidenceBundleV1;
  readonly verifiedEvidenceIds: readonly string[];
  readonly unavailableEvidenceIds: readonly string[];
  readonly [verifiedAdmissionEvidenceContextBrand]: true;
}>;

export interface AdmissionEvidenceContextInput {
  readonly bundle?: unknown;
  readonly materializationRoots?: Readonly<Record<string, string>>;
  readonly materializationRoot?: string;
  /** Bind the context to the frozen tool profile that performed verification. */
  readonly expectedProfileId?: string;
  /** Bind the context to the immutable evidence:verify invocation intent. */
  readonly expectedInvocationIntentId?: string;
}

export type AdmissionEvidenceContextResult =
  | { readonly ok: true; readonly context: VerifiedAdmissionEvidenceContextV1 }
  | { readonly ok: false; readonly errors: readonly string[] };

const verifiedContexts = new WeakSet<object>();

type RuntimeEvidenceBundle = {
  readonly policy: { readonly evidenceCasPolicy: string };
  readonly toolProfiles: readonly CalibrationAdmissionToolProfileV1[];
  readonly toolAuthoritySnapshot: {
    readonly indexGenerationSha256: string;
    readonly profileIds: readonly string[];
    readonly invocationIntentIds: readonly string[];
    readonly receiptIds: readonly string[];
  };
  readonly invocationIntents: readonly CalibrationAdmissionInvocationIntentV1[];
  readonly approvedEvidenceAcquisitions: readonly CalibrationApprovedEvidenceAcquisitionV1[];
  readonly evidenceAcquisitionReceipts: readonly CalibrationEvidenceAcquisitionReceiptV1[];
  readonly evidenceAcquisitionEnvelopes: readonly CalibrationEvidenceAcquisitionEnvelopeV1[];
  readonly acquisitionAuthoritySnapshot: {
    readonly indexGenerationSha256: string;
    readonly artifactKeys: readonly string[];
  };
  readonly evidenceIndex: CalibrationAdmissionEvidenceIndexV1;
  readonly evidencePayloadSet: Omit<CalibrationAdmissionEvidencePayloadSetV1, 'payloads'> & { readonly payloads: readonly CalibrationAdmissionEvidencePayloadV1[] };
  readonly evidenceReceipts: readonly CalibrationAdmissionEvidenceReceiptV1[];
  readonly materializationReceipts: readonly CalibrationAdmissionMaterializationReceiptV1[];
  readonly toolReceipts: readonly CalibrationAdmissionToolReceiptV1[];
  readonly bundleSha256: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function freezeDeep<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value !== 'object' || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const child = (value as Record<PropertyKey, unknown>)[key];
    freezeDeep(child, seen);
  }
  return Object.freeze(value);
}

function sha256Bytes(bytes: Buffer): string {
  // Core's canonical hash is for JSON values. Actual evidence bytes are
  // hashed as bytes here; keeping this local avoids accidental JSON encoding.
  return createHash('sha256').update(bytes).digest('hex');
}

async function fixedBundle(root: string): Promise<unknown> {
  const candidate = join(root, 'evidence-bundle.json');
  await containedRegularFile(candidate, root);
  const bytes = await readFile(candidate);
  const parsed = JSON.parse(bytes.toString('utf8')) as unknown;
  if (bytes.toString('utf8') !== calibrationAdmissionCanonicalJson(parsed)) throw new Error('evidence-bundle.json is not canonical');
  return parsed;
}

async function resolveAdmissionRoot(input: string): Promise<string> {
  const resolved = await realpath(resolve(input));
  if (basename(resolved) === 'admission' && basename(dirname(resolved)) === 'review') return resolved;
  const canonical = join(resolved, 'review', 'admission');
  try {
    const metadata = await lstat(canonical);
    if (metadata.isDirectory()) return await realpath(canonical);
  } catch {
    // Direct package-local roots remain supported for bounded unit tests. The
    // canonical v10.3 root has review/admission and takes the branch above.
  }
  return resolved;
}

async function containedRegularFile(path: string, base: string): Promise<void> {
  const canonicalBase = await realpath(base);
  const absolute = resolve(path);
  const metadata = await lstat(absolute);
  if (!metadata.isFile()) throw new Error('materialization reference is not a regular file');
  // lstat above intentionally rejects a symlink at the leaf. Resolve the
  // complete path as well so a symlinked ancestor cannot redirect a regular
  // file outside the configured materialization root.
  const canonical = await realpath(absolute);
  const canonicalParent = await realpath(resolve(absolute, '..'));
  const parentRelative = relative(canonicalBase, canonicalParent);
  const fileRelative = relative(canonicalBase, canonical);
  if (parentRelative === '..' || parentRelative.startsWith('..') || parentRelative.includes('\\')
    || fileRelative === '..' || fileRelative.startsWith('..') || fileRelative.includes('\\')) {
    throw new Error('materialization path escapes root');
  }
}

type MaterializationCandidate = Readonly<{ path: string; base: string; allowFallback: boolean }>;

function materializationCandidatePaths(root: string, payload: CalibrationAdmissionEvidencePayloadV1, options: AdmissionEvidenceContextInput): readonly MaterializationCandidate[] {
  const storage = payload.storage;
  if (storage.kind !== 'materialization_reference') return [];
  const configured = options.materializationRoots?.[storage.materializationId];
  if (configured !== undefined) {
    const base = resolve(configured);
    return [{ path: join(base, storage.normalizedPath), base, allowFallback: false }];
  }
  if (options.materializationRoot) {
    const base = resolve(options.materializationRoot, storage.materializationId);
    return [{ path: join(base, storage.normalizedPath), base, allowFallback: false }];
  }
  const candidates: MaterializationCandidate[] = [];
  const firstBase = join(root, 'materializations', storage.materializationId);
  // The package-local fallback roots are untrusted filesystem paths.  Use
  // the admission root as the containment anchor so a symlinked
  // `materializations/` or materialization-id directory cannot redefine the
  // base itself and redirect verification outside the admission tree.
  candidates.push({ path: join(firstBase, storage.normalizedPath), base: root, allowFallback: true });
  const secondBase = join(root, 'materialized', storage.materializationId);
  candidates.push({ path: join(secondBase, storage.normalizedPath), base: root, allowFallback: true });
  return candidates;
}

function isMissingPathError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { readonly code?: unknown }).code === 'ENOENT';
}

async function verifyPayloadBytes(
  root: string,
  payload: CalibrationAdmissionEvidencePayloadV1,
  options: AdmissionEvidenceContextInput,
): Promise<'verified' | 'unavailable'> {
  if (payload.storage.kind === 'local_unpublished_reference') return 'unavailable';
  if (payload.storage.kind === 'evidence_cas') {
    const expected = `evidence-cas/sha256/${payload.sha256.slice(0, 2)}/${payload.sha256}`;
    if (payload.storage.casRelativePath !== expected) throw new Error(`payload ${payload.payloadId}: CAS path is not hash-derived`);
    const bytes = await readAdmissionEvidenceCasBytes(root, payload.sha256);
    if (bytes.byteLength !== payload.bytes || sha256Bytes(bytes) !== payload.sha256) throw new Error(`payload ${payload.payloadId}: CAS bytes mismatch`);
    return 'verified';
  }
  const paths = materializationCandidatePaths(root, payload, options);
  if (paths.length === 0) throw new Error(`payload ${payload.payloadId}: no materialization root is configured`);
  for (const candidate of paths) {
    try {
      await containedRegularFile(candidate.path, candidate.base);
      const bytes = await readFile(candidate.path);
      if (bytes.byteLength !== payload.bytes || sha256Bytes(bytes) !== payload.sha256) {
        throw new Error(`payload ${payload.payloadId}: materialization bytes are unavailable or mismatched`);
      }
      return 'verified';
    } catch (error) {
      // The two package-local fallback layouts are only alternatives when a
      // candidate is absent. A present-but-mismatched or symlinked file is a
      // hard failure and must not be hidden by another fallback.
      if (candidate.allowFallback && isMissingPathError(error)) continue;
      throw error;
    }
  }
  throw new Error(`payload ${payload.payloadId}: materialization bytes are unavailable or mismatched`);
}

function validateBundleReferences(bundle: RuntimeEvidenceBundle): string[] {
  const errors: string[] = [];
  const index = bundle.evidenceIndex;
  const payloadSet = bundle.evidencePayloadSet;
  if (bundle.policy.evidenceCasPolicy !== 'sha256-wx-fsync-v1') errors.push('policy evidence CAS algorithm is unsupported');
  const payloadById = new Map(payloadSet.payloads.map((payload) => [payload.payloadId, payload]));
  const evidenceIds = new Set(index.items.map((item) => item.evidenceId));
  const receipts = new Map<string, CalibrationAdmissionEvidenceReceiptV1>();
  for (const receipt of bundle.evidenceReceipts) {
    if (receipts.has(receipt.receiptId)) errors.push(`evidence receipt ${receipt.receiptId}: duplicate receipt id`);
    receipts.set(receipt.receiptId, receipt);
  }
  for (const payload of payloadSet.payloads) {
    if (!evidenceIds.has(payload.evidenceId)) errors.push(`payload ${payload.payloadId}: evidence index reference is missing`);
    const item = index.items.find((candidate) => candidate.evidenceId === payload.evidenceId);
    if (item && calibrationAdmissionEvidenceSourceLocatorSha256(item.locator) !== payload.sourceLocatorSha256) errors.push(`payload ${payload.payloadId}: source locator hash mismatch`);
  }
  for (const receipt of bundle.evidenceReceipts) {
    if (!payloadById.has(receipt.payloadId)) errors.push(`evidence receipt ${receipt.receiptId}: payload reference is missing`);
    if (!evidenceIds.has(receipt.evidenceId)) errors.push(`evidence receipt ${receipt.receiptId}: evidence reference is missing`);
    if (receipt.status === 'verified' && receipt.verificationMethod === 'offline-local-unpublished-reference-v1') errors.push(`evidence receipt ${receipt.receiptId}: local unpublished evidence cannot be verified`);
    if (receipt.status === 'unavailable' && receipt.verificationMethod !== 'offline-local-unpublished-reference-v1') errors.push(`evidence receipt ${receipt.receiptId}: unavailable status requires local unpublished method`);
    if (!payloadById.has(receipt.payloadId)) continue;
  }
  for (const payload of payloadSet.payloads) {
    const matching = bundle.evidenceReceipts.filter((receipt) => receipt.payloadId === payload.payloadId);
    if (matching.length !== 1) errors.push(`payload ${payload.payloadId}: expected exactly one evidence receipt, found ${matching.length}`);
    if (payload.storage.kind === 'materialization_reference') {
      const storage = payload.storage;
      const matchingMaterializations = bundle.materializationReceipts.filter((receipt) => receipt.receiptId === storage.materializationReceiptId);
      if (matchingMaterializations.length !== 1) {
        errors.push(`payload ${payload.payloadId}: expected exactly one materialization receipt, found ${matchingMaterializations.length}`);
      } else if (matchingMaterializations[0]!.materializationId !== storage.materializationId) {
        errors.push(`payload ${payload.payloadId}: materialization receipt is bound to a different materialization`);
      }
    }
  }
  return errors;
}

function casCompletionRelativePath(primaryCompletionSha256: string): string {
  return `evidence-cas/completions/${primaryCompletionSha256}.json`;
}

async function readContainedCanonicalJson(root: string, relativePath: string, label: string): Promise<unknown> {
  const path = join(root, relativePath);
  await containedRegularFile(path, root);
  const bytes = await readFile(path);
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8')) as unknown;
  } catch (error) {
    throw new Error(`${label}: invalid JSON`, { cause: error });
  }
  if (bytes.toString('utf8') !== calibrationAdmissionCanonicalJson(parsed)) {
    throw new Error(`${label}: JSON is not canonical`);
  }
  return parsed;
}

type AcquisitionAuthorityArtifact = CalibrationAdmissionAcquisitionIndexV1['artifacts'][number];
type IndexedAcquisitionArtifact = Readonly<{
  readonly artifact: AcquisitionAuthorityArtifact;
  readonly bytes: Buffer;
  readonly parsed?: unknown;
}>;

function acquisitionArtifactKey(artifact: Pick<AcquisitionAuthorityArtifact, 'kind' | 'objectId'>): string {
  // Core's acquisition-index validator uses this exact projection for the
  // snapshot artifactKeys contract.  Keep the path out of the key: a path is
  // an object projection, while kind+objectId is the immutable authority id.
  return `${artifact.kind}:${artifact.objectId}`;
}

function authorityObjectRelativePath(relativePath: string): string {
  // Publication artifacts are recorded relative to the corpus root, while
  // context verification is rooted at review/admission.  Accept both forms
  // but never normalize a traversal into an authority path.
  if (relativePath.startsWith('review/admission/')) return relativePath.slice('review/admission/'.length);
  return relativePath;
}

async function readIndexedAcquisitionArtifact(
  root: string,
  artifact: AcquisitionAuthorityArtifact,
  label: string,
): Promise<IndexedAcquisitionArtifact> {
  const relativePath = authorityObjectRelativePath(artifact.relativePath);
  const path = join(root, relativePath);
  await containedRegularFile(path, root);
  const bytes = await readFile(path);
  if (sha256Bytes(bytes) !== artifact.sha256) throw new Error(`${label}: indexed bytes hash mismatch`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8')) as unknown;
  } catch (error) {
    // Ledger projections can be JSONL and are still covered by the byte hash;
    // object-bearing acquisition artifacts must be parseable JSON.
    if (!artifact.kind.endsWith('_ledger')) throw new Error(`${label}: indexed object is not valid JSON`, { cause: error });
    return { artifact, bytes };
  }
  if (bytes.toString('utf8') !== calibrationAdmissionCanonicalJson(parsed)) {
    throw new Error(`${label}: indexed JSON is not canonical`);
  }
  if (!indexedAcquisitionObjectMatches(artifact.kind, artifact.objectId, parsed)) {
    throw new Error(`${label}: indexed object id does not match its bytes`);
  }
  return { artifact, bytes, parsed };
}

function indexedAcquisitionObjectMatches(kind: string, objectId: string, value: unknown): boolean {
  if (kind.endsWith('_ledger')) return true;
  if (!isRecord(value)) return false;
  const field = kind.endsWith('_authorization')
    ? 'authorizationId'
    : kind === 'evidence_cas_primary_completion'
      ? 'primaryCompletionSha256'
      : kind === 'evidence_envelope'
        ? 'envelopeId'
        : kind === 'evidence_index'
          ? 'indexSha256'
          : kind === 'evidence_payload_set'
            ? 'payloadSetSha256'
            : kind === 'evidence_bundle'
              ? 'bundleSha256'
              : 'receiptId';
  return value[field] === objectId;
}

function hasAcquisitionAuthorityReferences(bundle: RuntimeEvidenceBundle): boolean {
  return bundle.evidencePayloadSet.payloads.some((payload) => payload.storage.kind === 'evidence_cas')
    || bundle.approvedEvidenceAcquisitions.length > 0
    || bundle.evidenceAcquisitionReceipts.length > 0
    || bundle.evidenceAcquisitionEnvelopes.length > 0;
}

/**
 * Replay the fixed tool-authority graph for bundles that contain execution
 * claims. A profiles-only empty bundle has no execution authority to replay;
 * once an intent or receipt is present, every referenced profile/intent/receipt
 * must resolve through the immutable current-generation chain and exact bytes.
 */
async function validateToolAuthority(root: string, bundle: RuntimeEvidenceBundle): Promise<string[]> {
  if (bundle.invocationIntents.length === 0 && bundle.toolReceipts.length === 0) return [];
  const errors: string[] = [];
  const add = (message: string): void => { errors.push(message); };
  let current: Record<string, unknown>;
  try {
    const parsed = await readContainedCanonicalJson(root, 'tool-authority/index.json', 'tool authority current index');
    if (!isCalibrationAdmissionToolAuthorityIndexV1(parsed)) throw new Error('tool authority current index is invalid');
    current = parsed as unknown as Record<string, unknown>;
  } catch (error) {
    add(error instanceof Error ? error.message : String(error));
    return errors;
  }

  const seen = new Set<string>();
  const indexedProfiles = new Map<string, CalibrationAdmissionToolProfileV1>();
  const indexedIntents = new Map<string, CalibrationAdmissionInvocationIntentV1>();
  const indexedReceipts = new Map<string, CalibrationAdmissionToolReceiptV1>();
  let cursor: Record<string, unknown> | undefined = current;
  let snapshotFound = false;
  while (cursor !== undefined) {
    const indexSha256 = String(cursor.indexSha256);
    if (seen.has(indexSha256)) { add('tool authority generation parent cycle detected'); break; }
    seen.add(indexSha256);
    try {
      const generation = await readContainedCanonicalJson(root, `tool-authority/index-generations/${indexSha256}.json`, `tool authority generation ${indexSha256}`);
      if (!isCalibrationAdmissionToolAuthorityIndexV1(generation)
        || generation.indexSha256 !== indexSha256
        || generation.generation !== cursor.generation) throw new Error('tool authority generation is not anchored to immutable bytes');
      const profiles = new Map<string, CalibrationAdmissionToolProfileV1>();
      for (const reference of generation.profiles) {
        const relativePath = `tool-authority/${reference.relativePath}`;
        const value = await readContainedCanonicalJson(root, relativePath, `tool authority profile ${reference.profileId}`);
        const bytes = Buffer.from(calibrationAdmissionCanonicalJson(value), 'utf8');
        if (sha256Bytes(bytes) !== reference.sha256 || !isCalibrationAdmissionToolProfileV1(value) || value.profileId !== reference.profileId) {
          throw new Error(`tool authority profile ${reference.profileId} is not byte-bound`);
        }
        profiles.set(reference.profileId, value);
        indexedProfiles.set(reference.profileId, value);
      }
      const intents = new Map<string, CalibrationAdmissionInvocationIntentV1>();
      for (const reference of generation.invocationIntents) {
        const value = await readContainedCanonicalJson(root, `tool-authority/${reference.relativePath}`, `tool authority intent ${reference.intentId}`);
        const bytes = Buffer.from(calibrationAdmissionCanonicalJson(value), 'utf8');
        const profile = isRecord(value) ? profiles.get(String(value.profileId)) : undefined;
        if (sha256Bytes(bytes) !== reference.sha256 || !profile || !isCalibrationAdmissionInvocationIntentV1(value, profile) || value.intentId !== reference.intentId) {
          throw new Error(`tool authority intent ${reference.intentId} is not byte-bound`);
        }
        intents.set(reference.intentId, value);
        indexedIntents.set(reference.intentId, value);
      }
      for (const reference of generation.receipts) {
        const value = await readContainedCanonicalJson(root, `tool-authority/${reference.relativePath}`, `tool authority receipt ${reference.receiptId}`);
        const bytes = Buffer.from(calibrationAdmissionCanonicalJson(value), 'utf8');
        const profile = isRecord(value) ? profiles.get(String(value.profileId)) : undefined;
        const intent = isRecord(value) ? intents.get(String(value.invocationIntentId)) : undefined;
        if (sha256Bytes(bytes) !== reference.sha256 || !profile || !intent || !isCalibrationAdmissionToolReceiptV1(value, profile, intent) || value.receiptId !== reference.receiptId) {
          throw new Error(`tool authority receipt ${reference.receiptId} is not byte-bound`);
        }
        indexedReceipts.set(reference.receiptId, value);
      }
      if (indexSha256 === bundle.toolAuthoritySnapshot.indexGenerationSha256) {
        snapshotFound = true;
        const profileIds = generation.profiles.map((reference) => reference.profileId).sort();
        const intentIds = generation.invocationIntents.map((reference) => reference.intentId).sort();
        const receiptIds = generation.receipts.map((reference) => reference.receiptId).sort();
        if (JSON.stringify(profileIds) !== JSON.stringify([...bundle.toolAuthoritySnapshot.profileIds].sort())
          || JSON.stringify(intentIds) !== JSON.stringify([...bundle.toolAuthoritySnapshot.invocationIntentIds].sort())
          || JSON.stringify(receiptIds) !== JSON.stringify([...bundle.toolAuthoritySnapshot.receiptIds].sort())) {
          add('tool authority snapshot does not match its immutable generation');
        }
      }
      if (generation.generation === 0) {
        if (generation.parentIndexSha256 !== undefined) add('tool authority bootstrap generation has a parent');
        break;
      }
      if (generation.parentIndexSha256 === undefined) { add('tool authority generation parent is missing'); break; }
      const parent = await readContainedCanonicalJson(root, `tool-authority/index-generations/${generation.parentIndexSha256}.json`, `tool authority parent generation ${generation.parentIndexSha256}`);
      if (!isCalibrationAdmissionToolAuthorityIndexV1(parent)
        || parent.indexSha256 !== generation.parentIndexSha256
        || parent.generation + 1 !== generation.generation) {
        add('tool authority generation chain is not contiguous');
        break;
      }
      cursor = parent as unknown as Record<string, unknown>;
    } catch (error) {
      add(error instanceof Error ? error.message : String(error));
      break;
    }
  }
  if (!snapshotFound) add('tool authority snapshot is not present in the current immutable generation chain');
  for (const profile of bundle.toolProfiles) {
    const indexed = indexedProfiles.get(profile.profileId);
    if (!indexed || calibrationAdmissionCanonicalJson(indexed) !== calibrationAdmissionCanonicalJson(profile)) {
      add(`tool authority profile ${profile.profileId} in the bundle does not match indexed immutable bytes`);
    }
  }
  for (const intent of bundle.invocationIntents) {
    const indexed = indexedIntents.get(intent.intentId);
    if (!indexed || calibrationAdmissionCanonicalJson(indexed) !== calibrationAdmissionCanonicalJson(intent)) {
      add(`tool authority intent ${intent.intentId} in the bundle does not match indexed immutable bytes`);
    }
  }
  for (const receipt of bundle.toolReceipts) {
    const indexed = indexedReceipts.get(receipt.receiptId);
    if (!indexed || calibrationAdmissionCanonicalJson(indexed) !== calibrationAdmissionCanonicalJson(receipt)) {
      add(`tool authority receipt ${receipt.receiptId} in the bundle does not match indexed immutable bytes`);
    }
  }
  const currentIntentIds = bundle.invocationIntents.map((intent) => intent.intentId).sort();
  const currentReceiptIds = bundle.toolReceipts.map((receipt) => receipt.receiptId).sort();
  if (JSON.stringify(currentIntentIds) !== JSON.stringify([...bundle.toolAuthoritySnapshot.invocationIntentIds].sort())
    || JSON.stringify(currentReceiptIds) !== JSON.stringify([...bundle.toolAuthoritySnapshot.receiptIds].sort())) {
    add('tool authority snapshot does not cover the bundle execution claims');
  }
  return [...new Set(errors)];
}

/**
 * Replays the durable acquisition index chain.  CAS transactions and
 * reservations are deliberately absent from this check: after publication
 * they are transient cleanup state, while the indexed object set and
 * immutable CAS primary completion remain authoritative.
 */
async function validateAcquisitionAuthority(root: string, bundle: RuntimeEvidenceBundle): Promise<string[]> {
  if (!hasAcquisitionAuthorityReferences(bundle)) return [];
  const errors: string[] = [];
  const add = (message: string): void => { errors.push(message); };
  const snapshot = bundle.acquisitionAuthoritySnapshot;
  let current: CalibrationAdmissionAcquisitionIndexV1;
  try {
    const parsed = await readContainedCanonicalJson(root, 'acquisitions/index.json', 'acquisition authority current index');
    if (!isCalibrationAdmissionAcquisitionIndexV1(parsed)) throw new Error('acquisition authority current index is invalid');
    current = parsed;
  } catch (error) {
    add(error instanceof Error ? error.message : String(error));
    return errors;
  }

  const seen = new Set<string>();
  const allArtifacts = new Map<string, IndexedAcquisitionArtifact>();
  let cursor: CalibrationAdmissionAcquisitionIndexV1 | undefined = current;
  let foundSnapshot = false;
  let snapshotGeneration: number | undefined;
  while (cursor !== undefined) {
    if (seen.has(cursor.indexSha256)) {
      add('acquisition authority generation parent cycle detected');
      break;
    }
    seen.add(cursor.indexSha256);
    try {
      const generation = await readContainedCanonicalJson(
        root,
        `acquisitions/index-generations/${cursor.indexSha256}.json`,
        `acquisition authority generation ${cursor.indexSha256}`,
      );
      if (!isCalibrationAdmissionAcquisitionIndexV1(generation)
        || generation.indexSha256 !== cursor.indexSha256
        || generation.generation !== cursor.generation) {
        throw new Error('acquisition authority generation is not anchored to its immutable bytes');
      }
      const generationKeys: string[] = [];
      for (const artifact of generation.artifacts) {
        const key = acquisitionArtifactKey(artifact);
        generationKeys.push(key);
        try {
          const indexed = await readIndexedAcquisitionArtifact(root, artifact, `acquisition artifact ${key}`);
          const prior = allArtifacts.get(key);
          if (prior !== undefined && (prior.artifact.sha256 !== indexed.artifact.sha256 || prior.artifact.relativePath !== indexed.artifact.relativePath)) {
            throw new Error('acquisition authority object changed across generations');
          }
          allArtifacts.set(key, indexed);
        } catch (error) {
          add(error instanceof Error ? error.message : String(error));
        }
      }
      if (cursor.indexSha256 === snapshot.indexGenerationSha256) {
        foundSnapshot = true;
        snapshotGeneration = cursor.generation;
        const expected = [...snapshot.artifactKeys].sort();
        const actual = [...generationKeys].sort();
        if (JSON.stringify(expected) !== JSON.stringify(actual)) add('acquisition authority snapshot artifact keys do not match its immutable generation');
      }
      if (cursor.generation === 0) {
        if (cursor.parentIndexSha256 !== undefined) add('acquisition authority generation zero has a parent');
        break;
      }
      if (cursor.parentIndexSha256 === undefined) {
        add('acquisition authority generation parent is missing');
        break;
      }
      const parent = await readContainedCanonicalJson(
        root,
        `acquisitions/index-generations/${cursor.parentIndexSha256}.json`,
        `acquisition authority parent generation ${cursor.parentIndexSha256}`,
      );
      if (!isCalibrationAdmissionAcquisitionIndexV1(parent)
        || parent.indexSha256 !== cursor.parentIndexSha256
        || parent.generation + 1 !== cursor.generation) {
        add('acquisition authority generation chain is not contiguous');
        break;
      }
      cursor = parent;
    } catch (error) {
      add(error instanceof Error ? error.message : String(error));
      break;
    }
  }
  if (!foundSnapshot) add('acquisition authority snapshot is not present in the current immutable generation chain');
  else if (snapshotGeneration === current.generation) add('acquisition authority snapshot must be a strict ancestor of the current index');

  const requiredKeys = new Set<string>();
  // The durable evidence projections are published in the descendant index
  // after the bundle snapshots its parent.  Requiring these joins prevents a
  // context from treating an unindexed bundle or stale payload projection as
  // authoritative merely because its self-hashes are valid.
  requiredKeys.add(`evidence_index:${bundle.evidenceIndex.indexSha256}`);
  requiredKeys.add(`evidence_payload_set:${bundle.evidencePayloadSet.payloadSetSha256}`);
  requiredKeys.add(`evidence_bundle:${bundle.bundleSha256}`);
  for (const authorization of bundle.approvedEvidenceAcquisitions) requiredKeys.add(`evidence_authorization:${authorization.authorizationId}`);
  for (const receipt of bundle.evidenceAcquisitionReceipts) requiredKeys.add(`evidence_receipt:${receipt.receiptId}`);
  for (const envelope of bundle.evidenceAcquisitionEnvelopes) {
    requiredKeys.add(`evidence_envelope:${envelope.envelopeId}`);
    requiredKeys.add(`evidence_cas_primary_completion:${envelope.primaryCompletionSha256}`);
  }
  for (const key of requiredKeys) if (!allArtifacts.has(key)) add(`acquisition authority object ${key} is not indexed by the current immutable chain`);
  return [...new Set(errors)];
}

/**
 * The Core bundle validator checks each acquisition object independently. A
 * verified context is a stronger boundary: every CAS payload must resolve the
 * complete authorization -> receipt -> envelope -> immutable primary
 * completion chain, including the exact bytes/hash/path projections. CAS
 * transactions and reservations may be removed after publication; the
 * envelope's embedded reservation and immutable primary remain authoritative.
 */
async function validateCasAcquisitionJoins(root: string, bundle: RuntimeEvidenceBundle): Promise<string[]> {
  const errors: string[] = [];
  const add = (message: string): void => { errors.push(message); };
  const payloadById = new Map(bundle.evidencePayloadSet.payloads.map((payload) => [payload.payloadId, payload]));
  const usedReceiptHashes = new Set<string>();

  for (const payload of bundle.evidencePayloadSet.payloads) {
    if (payload.storage.kind !== 'evidence_cas') continue;
    const storage = payload.storage;
    const authorizations = bundle.approvedEvidenceAcquisitions.filter((candidate) => candidate.authorizationId === storage.authorizationId);
    if (authorizations.length !== 1) {
      add(`payload ${payload.payloadId}: expected exactly one acquisition authorization, found ${authorizations.length}`);
      continue;
    }
    const authorization = authorizations[0]!;
    if (!isCalibrationApprovedEvidenceAcquisitionV1(authorization)
      || authorization.evidenceId !== payload.evidenceId
      || authorization.expectedBytes !== payload.bytes
      || authorization.expectedSha256 !== payload.sha256) {
      add(`payload ${payload.payloadId}: acquisition authorization does not match payload`);
    }

    const receipts = bundle.evidenceAcquisitionReceipts.filter((candidate) => candidate.authorizationId === authorization.authorizationId);
    if (receipts.length !== 1) {
      add(`payload ${payload.payloadId}: expected exactly one acquisition receipt, found ${receipts.length}`);
      continue;
    }
    const acquisitionReceipt = receipts[0]!;
    if (!isCalibrationEvidenceAcquisitionReceiptV1(acquisitionReceipt)
      || acquisitionReceipt.authorizationSha256 !== authorization.authorizationSha256
      || acquisitionReceipt.evidenceId !== payload.evidenceId
      || acquisitionReceipt.observedBytes !== payload.bytes
      || acquisitionReceipt.observedSha256 !== payload.sha256
      || acquisitionReceipt.observedMediaType !== authorization.expectedMediaType) {
      add(`payload ${payload.payloadId}: acquisition receipt does not match authorization/payload`);
    }

    const envelopes = bundle.evidenceAcquisitionEnvelopes.filter((candidate) => candidate.payloadId === payload.payloadId);
    if (envelopes.length !== 1) {
      add(`payload ${payload.payloadId}: expected exactly one acquisition envelope, found ${envelopes.length}`);
      continue;
    }
    const envelope = envelopes[0]!;
    if (!isCalibrationEvidenceAcquisitionEnvelopeV1(envelope)) {
      add(`payload ${payload.payloadId}: acquisition envelope is invalid`);
      continue;
    }
    usedReceiptHashes.add(envelope.acquisitionReceiptSha256);
    if (envelope.authorizationId !== authorization.authorizationId
      || envelope.acquisitionReceiptSha256 !== acquisitionReceipt.receiptSha256
      || envelope.casTransactionId !== acquisitionReceipt.casTransactionId
      || envelope.primaryCompletionSha256 !== acquisitionReceipt.primaryCompletionSha256
      || envelope.toolReceiptSha256 !== acquisitionReceipt.toolReceiptSha256
      || envelope.invocationIntentId !== envelope.reservation.invocationIntentId
      || envelope.reservation.authorizationId !== envelope.authorizationId) {
      add(`payload ${payload.payloadId}: acquisition envelope does not join receipt/reservation`);
    }
    const expectedReservation = admissionEvidenceCasReservation(
      envelope.authorizationId,
      envelope.invocationIntentId,
      envelope.reservation.recoveryNonce,
    );
    if (calibrationAdmissionCanonicalJson(expectedReservation) !== calibrationAdmissionCanonicalJson(envelope.reservation)) {
      add(`payload ${payload.payloadId}: acquisition reservation is not derived from its authorization, invocation, and recovery nonce`);
    }

    const intent = bundle.invocationIntents.find((candidate) => candidate.intentId === envelope.invocationIntentId);
    if (!intent || intent.profileId !== 'admission-evidence-acquire-v1' || intent.action !== 'evidence:acquire') {
      add(`payload ${payload.payloadId}: acquisition envelope intent is not the evidence:acquire authority`);
    }
    const toolReceipts = bundle.toolReceipts.filter((candidate) => calibrationAdmissionToolReceiptSha256(candidate) === acquisitionReceipt.toolReceiptSha256);
    if (toolReceipts.length !== 1) {
      add(`payload ${payload.payloadId}: expected exactly one indexed acquisition tool receipt, found ${toolReceipts.length}`);
    } else {
      const toolReceipt = toolReceipts[0]!;
      if (toolReceipt.invocationIntentId !== envelope.invocationIntentId
        || toolReceipt.profileId !== 'admission-evidence-acquire-v1'
        || toolReceipt.action !== 'evidence:acquire'
        || toolReceipt.exitCode !== 0) {
        add(`payload ${payload.payloadId}: acquisition tool receipt does not match envelope intent`);
      }
    }

    const expectedPrimaryPath = casCompletionRelativePath(envelope.primaryCompletionSha256);
    if (envelope.primaryCompletionRelativePath !== expectedPrimaryPath) {
      add(`payload ${payload.payloadId}: acquisition envelope primary path is not hash-derived`);
    }
    let primary: CalibrationEvidenceCasPrimaryCompletionV1 | undefined;
    try {
      const parsed = await readContainedCanonicalJson(root, expectedPrimaryPath, `payload ${payload.payloadId} CAS primary completion`);
      if (!isCalibrationEvidenceCasPrimaryCompletionV1(parsed)) throw new Error('CAS primary completion is invalid');
      primary = parsed;
    } catch (error) {
      add(`payload ${payload.payloadId}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (primary) {
      const expectedCasTransactionId = admissionEvidenceCasTransactionId({
        authorizationId: envelope.authorizationId,
        reservationSha256: envelope.reservation.reservationSha256,
        evidenceId: payload.evidenceId,
        finalRelativePath: storage.casRelativePath,
        temporaryRelativePath: `evidence-cas/transactions/$transaction.tmp`,
        expectedBytes: payload.bytes,
        expectedSha256: payload.sha256,
        invocationIntentId: envelope.invocationIntentId,
        recoveryNonce: envelope.reservation.recoveryNonce,
      });
      if (primary.primaryCompletionSha256 !== envelope.primaryCompletionSha256
        || primary.transactionId !== envelope.casTransactionId
        || envelope.casTransactionId !== expectedCasTransactionId
        || primary.authorizationId !== envelope.authorizationId
        || primary.reservationSha256 !== envelope.reservation.reservationSha256
        || primary.evidenceId !== payload.evidenceId
        || primary.invocationIntentId !== envelope.invocationIntentId
        || primary.finalRelativePath !== storage.casRelativePath
        || primary.observedBytes !== payload.bytes
        || primary.observedSha256 !== payload.sha256
        || calibrationAdmissionSha256(primary.networkObservation) !== primary.networkObservationSha256
        || primary.networkObservation.requestUrl !== authorization.url
        || calibrationAdmissionCanonicalJson(primary.networkObservation.redirectChain) !== calibrationAdmissionCanonicalJson(authorization.approvedRedirectUrls)
        || primary.networkObservation.observedMediaType !== authorization.expectedMediaType
        || primary.networkObservation.observedMediaType !== acquisitionReceipt.observedMediaType
        || calibrationAdmissionCanonicalJson(primary.networkObservation.redirectChain) !== calibrationAdmissionCanonicalJson(acquisitionReceipt.redirectChain)
        || calibrationAdmissionSha256(primary.networkObservation.resolvedPublicAddresses) !== acquisitionReceipt.resolvedPublicAddressesSha256
        || !primary.networkObservation.resolvedPublicAddresses.includes(primary.networkObservation.connectedPeerAddress)) {
        add(`payload ${payload.payloadId}: CAS primary completion does not join envelope/receipt/payload`);
      }
    }
  }

  for (const envelope of bundle.evidenceAcquisitionEnvelopes) {
    const payload = payloadById.get(envelope.payloadId);
    if (!payload || payload.storage.kind !== 'evidence_cas') add(`acquisition envelope ${envelope.envelopeId}: payload is not an evidence CAS payload`);
  }
  for (const receipt of bundle.evidenceAcquisitionReceipts) {
    if (!usedReceiptHashes.has(receipt.receiptSha256)) add(`acquisition receipt ${receipt.receiptId}: receipt is not joined by an acquisition envelope`);
  }
  return [...new Set(errors)];
}

function parseInput(input: unknown): { bundleInput: undefined; options: AdmissionEvidenceContextInput } {
  if (input === undefined) return { bundleInput: undefined, options: {} };
  if (!isRecord(input)) throw new Error('evidence:verify accepts only fixed-path input options');
  if ('bundle' in input) throw new Error('evidence:verify does not accept a bundle override');
  const allowed = new Set(['materializationRoots', 'materializationRoot', 'expectedProfileId', 'expectedInvocationIntentId']);
  if (Object.keys(input).some((key) => !allowed.has(key))) throw new Error('evidence:verify accepts only fixed-path and authority-binding options');
  if ('materializationRoot' in input && (typeof input.materializationRoot !== 'string' || input.materializationRoot.length === 0)) throw new Error('materializationRoot must be a non-empty path');
  if ('materializationRoots' in input) {
    if (!isRecord(input.materializationRoots) || Object.entries(input.materializationRoots).some(([materializationId, path]) => materializationId.length === 0 || typeof path !== 'string' || path.length === 0)) {
      throw new Error('materializationRoots must map materialization ids to non-empty paths');
    }
  }
  if ('expectedProfileId' in input && (typeof input.expectedProfileId !== 'string' || input.expectedProfileId.length === 0)) throw new Error('expectedProfileId must be a non-empty profile id');
  if ('expectedInvocationIntentId' in input && (typeof input.expectedInvocationIntentId !== 'string' || !SHA256.test(input.expectedInvocationIntentId))) throw new Error('expectedInvocationIntentId must be a lowercase SHA-256');
  return { bundleInput: undefined, options: input as AdmissionEvidenceContextInput };
}

export async function buildVerifiedAdmissionEvidenceContext(root: string, input?: unknown): Promise<AdmissionEvidenceContextResult> {
  const errors: string[] = [];
  let admissionRoot: string;
  let options: AdmissionEvidenceContextInput;
  let bundleInput: unknown;
  try {
    admissionRoot = await resolveAdmissionRoot(root);
    ({ bundleInput, options } = parseInput(input));
    if (bundleInput === undefined) bundleInput = await fixedBundle(admissionRoot);
  } catch (error) {
    return { ok: false, errors: [`unable to read evidence-bundle.json: ${error instanceof Error ? error.message : String(error)}`] };
  }
  if (!isCalibrationAdmissionEvidenceBundleV1(bundleInput)) {
    return { ok: false, errors: ['evidence bundle failed Core shape/hash/reference validation'] };
  }
  const bundle = bundleInput as unknown as RuntimeEvidenceBundle;
  if (calibrationAdmissionEvidenceBundleSha256(bundle) !== bundle.bundleSha256) errors.push('evidence bundle self-hash mismatch');
  errors.push(...validateBundleReferences(bundle));
  if (!isCalibrationAdmissionEvidenceIndexV1(bundle.evidenceIndex)) errors.push('evidence index is invalid');
  if (!isCalibrationAdmissionEvidencePayloadSetV1(bundle.evidencePayloadSet, bundle.evidenceIndex)) errors.push('evidence payload set is invalid');
  if (!isCalibrationAdmissionEvidenceIndexV1(bundle.evidenceIndex) || !isCalibrationAdmissionEvidencePayloadSetV1(bundle.evidencePayloadSet, bundle.evidenceIndex)) return { ok: false, errors };
  errors.push(...await validateAcquisitionAuthority(admissionRoot, bundle));
  errors.push(...await validateCasAcquisitionJoins(admissionRoot, bundle));

  if (options.expectedProfileId !== undefined) {
    const profile = bundle.toolProfiles.find((candidate) => candidate.profileId === options.expectedProfileId);
    if (!profile) {
      errors.push(`expected tool profile ${options.expectedProfileId} is not present in the evidence bundle`);
    }
  }
  if (options.expectedInvocationIntentId !== undefined) {
    const intent = bundle.invocationIntents.find((candidate) => candidate.intentId === options.expectedInvocationIntentId);
    if (!intent) {
      errors.push(`expected invocation intent ${options.expectedInvocationIntentId} is not present in the evidence bundle`);
    } else {
      if (options.expectedProfileId !== undefined && intent.profileId !== options.expectedProfileId) errors.push('expected invocation intent is bound to a different tool profile');
      if (intent.action !== 'evidence:verify') errors.push('expected invocation intent is not an evidence:verify intent');
      const receipts = bundle.toolReceipts.filter((candidate) => candidate.invocationIntentId === intent.intentId && candidate.profileId === intent.profileId && candidate.action === intent.action && candidate.exitCode === 0);
      if (receipts.length !== 1) errors.push(`expected invocation intent must have exactly one successful tool receipt, found ${receipts.length}`);
    }
  }
  if (errors.length > 0) return { ok: false, errors: [...new Set(errors)] };

  const materializationHashes = new Set(bundle.evidencePayloadSet.payloads.filter((payload) => payload.storage.kind === 'materialization_reference').map((payload) => payload.sha256));
  const byteVerifiedEvidenceIds = new Set<string>();
  const verifiedEvidenceIds: string[] = [];
  const unavailableEvidenceIds: string[] = [];
  for (const payload of bundle.evidencePayloadSet.payloads) {
    if (payload.storage.kind === 'evidence_cas' && materializationHashes.has(payload.sha256)) errors.push(`payload ${payload.payloadId}: CAS copy of materialization-owned bytes is forbidden`);
    try {
      const status = await verifyPayloadBytes(admissionRoot, payload, options);
      if (status === 'verified') byteVerifiedEvidenceIds.add(payload.evidenceId);
      else unavailableEvidenceIds.push(payload.evidenceId);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  const payloadById = new Map(bundle.evidencePayloadSet.payloads.map((payload) => [payload.payloadId, payload]));
  for (const receipt of bundle.evidenceReceipts) {
    const payload = payloadById.get(receipt.payloadId);
    const matchingToolReceipts = bundle.toolReceipts.filter((toolReceipt) => SHA256.test(receipt.toolReceiptSha256) && calibrationAdmissionToolReceiptSha256(toolReceipt) === receipt.toolReceiptSha256);
    if (matchingToolReceipts.length !== 1) {
      errors.push(`evidence receipt ${receipt.receiptId}: expected exactly one indexed task tool receipt, found ${matchingToolReceipts.length}`);
    } else {
      const toolReceipt = matchingToolReceipts[0]!;
      if (toolReceipt.action !== 'evidence:verify' || toolReceipt.exitCode !== 0 || (options.expectedInvocationIntentId !== undefined && toolReceipt.invocationIntentId !== options.expectedInvocationIntentId)) {
        errors.push(`evidence receipt ${receipt.receiptId}: task tool receipt is not the expected successful evidence:verify receipt`);
      }
    }
    if (!payload) continue;
    const expectedMethod = payload.storage.kind === 'evidence_cas'
      ? 'offline-evidence-cas-v1'
      : payload.storage.kind === 'materialization_reference'
        ? 'offline-materialization-file-v1'
        : 'offline-local-unpublished-reference-v1';
    if (receipt.verificationMethod !== expectedMethod) errors.push(`evidence receipt ${receipt.receiptId}: verification method does not match payload storage`);
    if (receipt.status === 'verified') {
      if (!byteVerifiedEvidenceIds.has(receipt.evidenceId)) errors.push(`evidence receipt ${receipt.receiptId}: receipt claims bytes that did not verify`);
      if (receipt.observedBytes !== payload.bytes || receipt.observedSha256 !== payload.sha256) errors.push(`evidence receipt ${receipt.receiptId}: observed bytes do not match the payload`);
      else verifiedEvidenceIds.push(receipt.evidenceId);
    } else if (payload.storage.kind === 'local_unpublished_reference' && receipt.status === 'unavailable' && receipt.verificationMethod === 'offline-local-unpublished-reference-v1') {
      unavailableEvidenceIds.push(payload.evidenceId);
    } else {
      errors.push(`evidence receipt ${receipt.receiptId}: non-verified evidence cannot enter a verified context`);
    }
  }
  errors.push(...await validateToolAuthority(admissionRoot, bundle));
  if (errors.length > 0) return { ok: false, errors: [...new Set(errors)] };
  const frozenBundle = freezeDeep(structuredClone(bundle));
  const context = freezeDeep({
    evidenceContextSha256: calibrationAdmissionSha256(frozenBundle),
    bundle: frozenBundle as unknown as CalibrationAdmissionEvidenceBundleV1,
    verifiedEvidenceIds: [...new Set(verifiedEvidenceIds)].sort(),
    unavailableEvidenceIds: [...new Set(unavailableEvidenceIds)].sort(),
  }) as unknown as VerifiedAdmissionEvidenceContextV1;
  verifiedContexts.add(context as object);
  return { ok: true, context };
}

export function isVerifiedAdmissionEvidenceContext(value: unknown): value is VerifiedAdmissionEvidenceContextV1 {
  return typeof value === 'object' && value !== null && verifiedContexts.has(value);
}

export const isVerifiedEvidenceContext = isVerifiedAdmissionEvidenceContext;

export function assertVerifiedAdmissionEvidenceContext(value: unknown): asserts value is VerifiedAdmissionEvidenceContextV1 {
  if (!isVerifiedAdmissionEvidenceContext(value)) throw new Error('Admission evidence context is not a verified SlopBrick context');
}
