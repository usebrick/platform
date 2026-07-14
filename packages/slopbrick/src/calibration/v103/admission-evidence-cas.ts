import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import {
  lstat,
  link,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import {
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionSha256,
  isCalibrationAdmissionEvidenceCasTransactionV1,
  isCalibrationEvidenceAcquisitionReservationV1,
  isCalibrationEvidenceCasPrimaryCompletionV1,
} from '@usebrick/core';

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const CAS_ROOT = 'evidence-cas';
const CAS_PREFIX = 'evidence-cas/sha256';
const RESERVATIONS_ROOT = `${CAS_ROOT}/reservations`;
const TRANSACTIONS_ROOT = `${CAS_ROOT}/transactions`;
const COMPLETIONS_ROOT = `${CAS_ROOT}/completions`;

export type AdmissionEvidenceCasPhase =
  | 'intent-written'
  | 'intent-fsynced'
  | 'reservation-created'
  | 'network-observation-fsynced'
  | 'temporary-created'
  | 'temporary-written'
  | 'temporary-fsynced'
  | 'object-promoted'
  | 'cas-directories-fsynced'
  | 'temporary-removed'
  | 'primary-completion-fsynced'
  | 'transaction-fsynced';

export interface AdmissionEvidenceCasWriteRequest {
  readonly root: string;
  readonly bytes: Uint8Array | string;
  readonly expectedSha256?: string;
  readonly expectedBytes?: number;
  readonly authorizationId?: string;
  readonly evidenceId?: string;
  readonly invocationIntentId?: string;
  readonly recoveryNonce?: string;
  readonly transactionId?: string;
  readonly phaseHook?: (phase: AdmissionEvidenceCasPhase) => void | Promise<void>;
}

export interface AdmissionEvidenceCasResult {
  readonly transactionId: string;
  readonly reservationId: string;
  readonly reservationSha256: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly finalRelativePath: string;
  readonly finalPath: string;
  readonly primaryCompletionRelativePath: string;
  readonly primaryCompletionSha256: string;
  readonly idempotent: boolean;
}

export interface AdmissionEvidenceCasRecoveryOptions {
  /** The transaction's exact recovery capability; never infer or default it. */
  readonly recoveryNonce: string;
  /** Explicit operator assertion that no writer still owns this transaction. */
  readonly acknowledgeNoLiveWriter: true;
}

export interface AdmissionEvidenceCasRecoveryResult extends AdmissionEvidenceCasResult {
  readonly recovered: boolean;
}

function assertSha256(value: string): void {
  if (!SHA256.test(value)) throw new Error('Evidence CAS requires a lowercase SHA-256 digest');
}

function assertId(value: string): void {
  if (!SAFE_ID.test(value)) throw new Error('Evidence CAS requires a safe transaction/authorization id');
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function safeRelative(value: string): boolean {
  return value.length > 0
    && !value.startsWith('/')
    && !value.includes('\\')
    && !value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..');
}

function canonicalHash(value: unknown, omitted: readonly string[]): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Expected a JSON object');
  const copy: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) if (!omitted.includes(key)) copy[key] = child;
  return calibrationAdmissionSha256(copy);
}

export function admissionEvidenceCasRelativePath(sha256: string): string {
  assertSha256(sha256);
  return `${CAS_PREFIX}/${sha256.slice(0, 2)}/${sha256}`;
}

export const evidenceCasRelativePath = admissionEvidenceCasRelativePath;

function transactionRelativePath(transactionId: string): string {
  assertId(transactionId);
  return `${TRANSACTIONS_ROOT}/${transactionId}.json`;
}

function temporaryRelativePath(transactionId: string): string {
  assertId(transactionId);
  return `${TRANSACTIONS_ROOT}/${transactionId}.tmp`;
}

function observationRelativePath(transactionId: string): string {
  assertId(transactionId);
  return `${TRANSACTIONS_ROOT}/${transactionId}.network.json`;
}

/**
 * Derive the CAS transaction identity from its immutable intent projection.
 * The temporary path is normalized because it is transaction-owned and thus
 * contains the identity being derived. Mutable phase/observation state and
 * transaction self-hashes are intentionally excluded.
 */
export function admissionEvidenceCasTransactionId(input: {
  readonly authorizationId: string;
  readonly reservationSha256: string;
  readonly evidenceId: string;
  readonly finalRelativePath: string;
  readonly temporaryRelativePath: string;
  readonly expectedBytes: number;
  readonly expectedSha256: string;
  readonly invocationIntentId: string;
  readonly recoveryNonce: string;
}): string {
  return calibrationAdmissionSha256({
    domain: 'v10.3-admission-evidence-cas-transaction-id-v1',
    authorizationId: input.authorizationId,
    reservationSha256: input.reservationSha256,
    evidenceId: input.evidenceId,
    finalRelativePath: input.finalRelativePath,
    // This path is fixed by the CAS layout; the concrete transaction id is
    // deliberately omitted to avoid a circular identity calculation.
    temporaryRelativePath: `${TRANSACTIONS_ROOT}/$transaction.tmp`,
    expectedBytes: input.expectedBytes,
    expectedSha256: input.expectedSha256,
    invocationIntentId: input.invocationIntentId,
    recoveryNonce: input.recoveryNonce,
  });
}

function reservationRelativePath(authorizationId: string): string {
  assertId(authorizationId);
  return `${RESERVATIONS_ROOT}/${authorizationId}.json`;
}

function completionRelativePath(primaryCompletionSha256: string): string {
  assertSha256(primaryCompletionSha256);
  return `${COMPLETIONS_ROOT}/${primaryCompletionSha256}.json`;
}

async function syncFile(path: string): Promise<void> {
  const handle = await open(path, constants.O_RDONLY);
  try { await handle.sync(); } finally { await handle.close(); }
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, constants.O_RDONLY);
  try { await handle.sync(); } finally { await handle.close(); }
}

async function ensureContainedDirectory(root: string, path: string): Promise<void> {
  const canonicalRoot = await realpath(root).catch(() => { throw new Error('Evidence CAS root does not exist'); });
  const absolute = resolve(path);
  const rel = relative(canonicalRoot, absolute);
  if (rel === '' || rel.startsWith('..') || rel.includes('\\')) throw new Error('Evidence CAS path escapes its root');
  let current = canonicalRoot;
  for (const part of rel.split('/')) {
    current = join(current, part);
    try {
      const metadata = await lstat(current);
      if (!metadata.isDirectory()) throw new Error('Evidence CAS directory is not a directory');
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') throw error;
      try {
        await mkdir(current, { mode: 0o700 });
      } catch (mkdirError) {
        if ((mkdirError as { code?: string }).code !== 'EEXIST') throw mkdirError;
      }
      const metadata = await lstat(current);
      if (!metadata.isDirectory()) throw new Error('Evidence CAS directory creation failed');
    }
  }
}

async function assertContainedRegularFile(root: string, path: string): Promise<void> {
  const canonicalRoot = await realpath(root);
  const metadata = await lstat(path);
  if (!metadata.isFile()) throw new Error('Evidence CAS path is not a regular file');
  const canonical = await realpath(path);
  const rel = relative(canonicalRoot, canonical);
  if (rel.startsWith('..') || rel.includes('\\')) throw new Error('Evidence CAS path escapes its root');
}

async function writeCanonicalWx(path: string, value: unknown): Promise<Buffer> {
  const bytes = Buffer.from(calibrationAdmissionCanonicalJson(value), 'utf8');
  await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
  return bytes;
}

async function writeCanonicalReplace(path: string, value: unknown, token: string): Promise<Buffer> {
  const bytes = Buffer.from(calibrationAdmissionCanonicalJson(value), 'utf8');
  // Multiple identical callers may advance the same deterministic journal at
  // once. A per-writer temp name prevents one caller from unlinking another's
  // temp file; the final rename remains atomic and every state is revalidated
  // by the next phase/idempotent retry.
  const temporary = `${path}.${token}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
    await syncFile(temporary);
    await rename(temporary, path);
    await syncDirectory(dirname(path));
    return bytes;
  } catch (error) {
    try { await unlink(temporary); } catch (cleanup) { if ((cleanup as { code?: string }).code !== 'ENOENT') throw cleanup; }
    throw error;
  }
}

async function invokeHook(hook: AdmissionEvidenceCasWriteRequest['phaseHook'], phase: AdmissionEvidenceCasPhase): Promise<void> {
  if (hook) await hook(phase);
}

async function resolveAdmissionRoot(input: string): Promise<string> {
  const resolved = await realpath(resolve(input));
  if (basename(resolved) === 'admission' && basename(dirname(resolved)) === 'review') return resolved;
  const canonical = join(resolved, 'review', 'admission');
  try {
    const metadata = await lstat(canonical);
    if (metadata.isDirectory()) return await realpath(canonical);
  } catch {
    // A package-local/test CAS root is intentionally supported for direct
    // engine tests and legacy callers; canonical v10.3 roots already contain
    // review/admission and take the branch above.
  }
  return resolved;
}

function offlineNetworkObservation(sha256: string, bytes: number): Record<string, unknown> {
  return {
    requestUrl: `https://offline.invalid/evidence-cas/${sha256}`,
    redirectChain: [],
    resolvedPublicAddresses: ['offline'],
    connectedPeerAddress: 'offline',
    observedMediaType: bytes === 0 ? 'application/octet-stream' : 'application/octet-stream',
  };
}

/**
 * Derive the one-use reservation proof from the immutable acquisition intent.
 * Context verification uses the same projection so a forged bundle cannot
 * choose a self-consistent reservation hash that was never issued by CAS.
 */
export function admissionEvidenceCasReservation(
  authorizationId: string,
  invocationIntentId: string,
  recoveryNonce: string,
): Record<string, unknown> {
  const withoutHashes = {
    version: 'v10.3-evidence-acquisition-reservation-v1',
    reservationId: '',
    authorizationId,
    invocationIntentId,
    recoveryNonce,
  };
  const reservationId = canonicalHash(withoutHashes, ['reservationId', 'reservationSha256']);
  const withoutSelfHash = { ...withoutHashes, reservationId };
  return { ...withoutSelfHash, reservationSha256: canonicalHash(withoutSelfHash, ['reservationSha256']) };
}

const makeReservation = admissionEvidenceCasReservation;

function makeTransaction(input: {
  transactionId: string;
  authorizationId: string;
  reservationSha256: string;
  evidenceId: string;
  finalRelativePath: string;
  temporaryRelativePath: string;
  expectedBytes: number;
  expectedSha256: string;
  invocationIntentId: string;
  recoveryNonce: string;
}): Record<string, unknown> {
  const withoutHash = {
    version: 'v10.3-admission-evidence-cas-transaction-v1',
    transactionId: input.transactionId,
    authorizationId: input.authorizationId,
    reservationSha256: input.reservationSha256,
    evidenceId: input.evidenceId,
    finalRelativePath: input.finalRelativePath,
    temporaryRelativePath: input.temporaryRelativePath,
    expectedBytes: input.expectedBytes,
    expectedSha256: input.expectedSha256,
    invocationIntentId: input.invocationIntentId,
    recoveryNonce: input.recoveryNonce,
    state: { phase: 'intent_fsynced' },
  };
  return { ...withoutHash, transactionSha256: canonicalHash(withoutHash, ['transactionSha256']) };
}

function assertTransactionIdentity(transaction: Record<string, unknown>): void {
  if (typeof transaction.transactionId !== 'string' || !SHA256.test(transaction.transactionId)) {
    throw new Error('Evidence CAS transaction id is not a lowercase SHA-256');
  }
  const expected = admissionEvidenceCasTransactionId({
    authorizationId: String(transaction.authorizationId),
    reservationSha256: String(transaction.reservationSha256),
    evidenceId: String(transaction.evidenceId),
    finalRelativePath: String(transaction.finalRelativePath),
    temporaryRelativePath: String(transaction.temporaryRelativePath),
    expectedBytes: Number(transaction.expectedBytes),
    expectedSha256: String(transaction.expectedSha256),
    invocationIntentId: String(transaction.invocationIntentId),
    recoveryNonce: String(transaction.recoveryNonce),
  });
  if (transaction.transactionId !== expected) {
    throw new Error('Evidence CAS transaction id is not derived from its immutable intent');
  }
}

function transactionMatches(value: unknown, expected: Record<string, unknown>): boolean {
  if (!isCalibrationAdmissionEvidenceCasTransactionV1(value)) return false;
  const transaction = value as unknown as Record<string, unknown>;
  return Object.entries(expected).every(([key, child]) => child === undefined || transaction[key] === child);
}

async function readTransaction(path: string, expected: Record<string, unknown>): Promise<Record<string, unknown>> {
  await assertContainedRegularFile(dirname(dirname(path)), path);
  const bytes = await readFile(path);
  const text = bytes.toString('utf8');
  const parsed = JSON.parse(text) as unknown;
  if (text !== calibrationAdmissionCanonicalJson(parsed)) throw new Error('Evidence CAS transaction is not canonical');
  if (!isCalibrationAdmissionEvidenceCasTransactionV1(parsed)) throw new Error('Evidence CAS transaction is invalid');
  const transaction = parsed as unknown as Record<string, unknown>;
  assertTransactionIdentity(transaction);
  for (const [key, child] of Object.entries(expected)) {
    if (child !== undefined && transaction[key] !== child) throw new Error(`Evidence CAS transaction collision on ${key}`);
  }
  return transaction;
}

async function readReservation(path: string, expected: Record<string, unknown>): Promise<Record<string, unknown>> {
  await assertContainedRegularFile(dirname(dirname(path)), path);
  const bytes = await readFile(path);
  const text = bytes.toString('utf8');
  const parsed = JSON.parse(text) as unknown;
  if (text !== calibrationAdmissionCanonicalJson(parsed)) throw new Error('Evidence CAS reservation is not canonical');
  if (!isCalibrationEvidenceAcquisitionReservationV1(parsed)) throw new Error('Evidence CAS reservation is invalid');
  const reservation = parsed as unknown as Record<string, unknown>;
  if (!Object.entries(expected).every(([key, child]) => reservation[key] === child)) throw new Error('Evidence CAS reservation collision');
  return reservation;
}

async function sameBytes(path: string, bytes: Uint8Array, expectedSha256: string): Promise<boolean> {
  await assertContainedRegularFile(dirname(dirname(path)), path);
  const current = await readFile(path);
  return current.byteLength === bytes.byteLength && digest(current) === expectedSha256;
}

async function updateTransaction(
  transactionPath: string,
  transaction: Record<string, unknown>,
  state: Record<string, unknown>,
  token: string,
  hook: AdmissionEvidenceCasWriteRequest['phaseHook'],
  phase?: AdmissionEvidenceCasPhase,
): Promise<Record<string, unknown>> {
  const next: Record<string, unknown> = { ...transaction, state };
  next.transactionSha256 = canonicalHash(next, ['transactionSha256']);
  await writeCanonicalReplace(transactionPath, next, token);
  await invokeHook(hook, phase ?? 'transaction-fsynced');
  return next;
}

async function writePrimaryCompletion(
  root: string,
  transaction: Record<string, unknown>,
  observation: Record<string, unknown>,
): Promise<{ readonly relativePath: string; readonly sha256: string }> {
  const primaryWithoutHash = {
    version: 'v10.3-evidence-cas-primary-completion-v1',
    transactionId: transaction.transactionId,
    authorizationId: transaction.authorizationId,
    reservationSha256: transaction.reservationSha256,
    evidenceId: transaction.evidenceId,
    invocationIntentId: transaction.invocationIntentId,
    finalRelativePath: transaction.finalRelativePath,
    observedBytes: transaction.expectedBytes,
    observedSha256: transaction.expectedSha256,
    networkObservation: observation,
    networkObservationSha256: canonicalHash(observation, []),
  };
  const primaryCompletionSha256 = canonicalHash(primaryWithoutHash, ['primaryCompletionSha256']);
  const completion = { ...primaryWithoutHash, primaryCompletionSha256 };
  if (!isCalibrationEvidenceCasPrimaryCompletionV1(completion)) throw new Error('Evidence CAS primary completion failed Core validation');
  const relativePath = completionRelativePath(primaryCompletionSha256);
  const path = join(root, relativePath);
  await ensureContainedDirectory(root, dirname(path));
  const bytes = Buffer.from(calibrationAdmissionCanonicalJson(completion), 'utf8');
  try {
    await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if ((error as { code?: string }).code !== 'EEXIST') throw error;
    if (!(await sameBytes(path, bytes, digest(bytes)))) throw new Error('Evidence CAS primary completion collision');
  }
  await syncFile(path);
  await syncDirectory(dirname(path));
  return { relativePath, sha256: primaryCompletionSha256 };
}

async function verifyExistingCasCompletion(
  root: string,
  transaction: Record<string, unknown>,
  primaryCompletionSha256: string,
): Promise<void> {
  const finalRelativePath = String(transaction.finalRelativePath);
  const finalPath = join(root, finalRelativePath);
  await assertContainedRegularFile(root, finalPath);
  const finalBytes = await readFile(finalPath);
  if (finalBytes.byteLength !== Number(transaction.expectedBytes) || digest(finalBytes) !== String(transaction.expectedSha256)) {
    throw new Error('Evidence CAS idempotent final bytes mismatch');
  }
  const state = transaction.state as Record<string, unknown>;
  const primaryRelativePath = state.primaryCompletionRelativePath;
  if (typeof primaryRelativePath !== 'string' || primaryRelativePath !== completionRelativePath(primaryCompletionSha256)) {
    throw new Error('Evidence CAS idempotent primary completion path mismatch');
  }
  const primaryPath = join(root, primaryRelativePath);
  await assertContainedRegularFile(root, primaryPath);
  const primaryBytes = await readFile(primaryPath);
  const primary = JSON.parse(primaryBytes.toString('utf8')) as unknown;
  if (primaryBytes.toString('utf8') !== calibrationAdmissionCanonicalJson(primary)
    || !isCalibrationEvidenceCasPrimaryCompletionV1(primary)) {
    throw new Error('Evidence CAS idempotent primary completion is invalid');
  }
  const record = primary as unknown as Record<string, unknown>;
  if (record.primaryCompletionSha256 !== primaryCompletionSha256
    || record.transactionId !== transaction.transactionId
    || record.authorizationId !== transaction.authorizationId
    || record.reservationSha256 !== transaction.reservationSha256
    || record.evidenceId !== transaction.evidenceId
    || record.invocationIntentId !== transaction.invocationIntentId
    || record.finalRelativePath !== transaction.finalRelativePath
    || record.observedBytes !== transaction.expectedBytes
    || record.observedSha256 !== transaction.expectedSha256) {
    throw new Error('Evidence CAS idempotent primary completion does not match transaction');
  }
  if (typeof state.networkObservationRelativePath !== 'string' || typeof state.networkObservationSha256 !== 'string') {
    throw new Error('Evidence CAS idempotent network observation is missing');
  }
  if (state.networkObservationRelativePath !== observationRelativePath(String(transaction.transactionId))) {
    throw new Error('Evidence CAS idempotent network observation path is not transaction-owned');
  }
  const observationPath = join(root, state.networkObservationRelativePath);
  await assertContainedRegularFile(root, observationPath);
  const observationBytes = await readFile(observationPath);
  const observation = JSON.parse(observationBytes.toString('utf8')) as unknown;
  if (observationBytes.toString('utf8') !== calibrationAdmissionCanonicalJson(observation)
    || canonicalHash(observation, []) !== state.networkObservationSha256
    || record.networkObservationSha256 !== state.networkObservationSha256
    || canonicalHash(record.networkObservation, []) !== state.networkObservationSha256) {
    throw new Error('Evidence CAS idempotent network observation does not match transaction');
  }
}

function resultFrom(transaction: Record<string, unknown>, root: string, reservationId: string, primaryCompletionSha256: string, idempotent: boolean, recovered: boolean): AdmissionEvidenceCasResult | AdmissionEvidenceCasRecoveryResult {
  const transactionId = String(transaction.transactionId);
  const sha256 = String(transaction.expectedSha256);
  return {
    transactionId,
    reservationId,
    reservationSha256: String(transaction.reservationSha256),
    sha256,
    bytes: Number(transaction.expectedBytes),
    finalRelativePath: String(transaction.finalRelativePath),
    finalPath: join(root, String(transaction.finalRelativePath)),
    primaryCompletionRelativePath: completionRelativePath(primaryCompletionSha256),
    primaryCompletionSha256,
    idempotent,
    ...(recovered ? { recovered: true } : {}),
  } as AdmissionEvidenceCasResult | AdmissionEvidenceCasRecoveryResult;
}

async function removeOwnTransaction(root: string, transactionId: string, expected?: Record<string, unknown>): Promise<void> {
  const path = join(root, transactionRelativePath(transactionId));
  try {
    await assertContainedRegularFile(root, path);
    const parsed = JSON.parse((await readFile(path)).toString('utf8')) as unknown;
    if (!isCalibrationAdmissionEvidenceCasTransactionV1(parsed)) throw new Error('Evidence CAS loser cleanup found an invalid transaction');
    const record = parsed as unknown as Record<string, unknown>;
    if (record.transactionId !== transactionId
      || (expected !== undefined && (record.transactionSha256 !== expected.transactionSha256
        || record.authorizationId !== expected.authorizationId
        || record.evidenceId !== expected.evidenceId
        || record.expectedSha256 !== expected.expectedSha256
        || record.invocationIntentId !== expected.invocationIntentId
        || record.recoveryNonce !== expected.recoveryNonce))) {
      throw new Error('Evidence CAS loser cleanup refused a changed transaction');
    }
    await unlink(path);
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
  }
  await syncDirectory(dirname(path));
}

/**
 * Store bytes in the derived evidence CAS path. The final object is never
 * opened for writing: a transaction-local temporary is fsynced and promoted
 * with a no-clobber hard link. Journals remain until an owning acquisition
 * envelope proves the indexed completion.
 */
export async function putAdmissionEvidenceCas(request: AdmissionEvidenceCasWriteRequest): Promise<AdmissionEvidenceCasResult> {
  const bytes = typeof request.bytes === 'string' ? Buffer.from(request.bytes, 'utf8') : Buffer.from(request.bytes);
  const sha256 = request.expectedSha256 ?? digest(bytes);
  assertSha256(sha256);
  if (digest(bytes) !== sha256) throw new Error('Evidence CAS bytes do not match expected SHA-256');
  if (request.expectedBytes !== undefined && request.expectedBytes !== bytes.byteLength) throw new Error('Evidence CAS bytes do not match expected byte count');
  const root = await resolveAdmissionRoot(request.root);
  const requestedTransactionId = request.transactionId;
  let transactionId = '';
  let recoveryNonce = '';
  let invocationIntentId = '';
  let authorizationId = request.authorizationId ?? calibrationAdmissionSha256({ domain: 'v10.3-local-evidence-authorization-v1', sha256, bytes: bytes.byteLength });
  let evidenceId = request.evidenceId ?? calibrationAdmissionSha256({ domain: 'v10.3-local-evidence-id-v1', sha256 });
  assertId(authorizationId); assertId(evidenceId);
  // Derive every immutable input from the content and caller-provided
  // authorization, then derive the transaction id from that complete
  // projection. This makes retries in a new process/root converge on the
  // same journal id and prevents an arbitrary caller-selected id from
  // authorizing a different immutable intent.
  invocationIntentId = request.invocationIntentId ?? calibrationAdmissionSha256({ domain: 'v10.3-local-evidence-cas-intent-v2', sha256, bytes: bytes.byteLength, authorizationId, evidenceId });
  recoveryNonce = request.recoveryNonce ?? calibrationAdmissionSha256({ domain: 'v10.3-local-evidence-cas-recovery-nonce-v1', sha256, bytes: bytes.byteLength, authorizationId, evidenceId, invocationIntentId });
  assertSha256(invocationIntentId); assertSha256(recoveryNonce);
  const deterministicReservation = makeReservation(authorizationId, invocationIntentId, recoveryNonce);
  transactionId = admissionEvidenceCasTransactionId({
    authorizationId,
    reservationSha256: String(deterministicReservation.reservationSha256),
    evidenceId,
    finalRelativePath: admissionEvidenceCasRelativePath(sha256),
    temporaryRelativePath: `${TRANSACTIONS_ROOT}/$transaction.tmp`,
    expectedBytes: bytes.byteLength,
    expectedSha256: sha256,
    invocationIntentId,
    recoveryNonce,
  });
  if (requestedTransactionId !== undefined && requestedTransactionId !== transactionId) {
    throw new Error('Evidence CAS transaction id does not match its immutable intent');
  }
  assertId(transactionId); assertId(authorizationId); assertSha256(invocationIntentId); assertSha256(recoveryNonce); assertId(evidenceId);
  const finalRelativePath = admissionEvidenceCasRelativePath(sha256);
  const transactionPath = join(root, transactionRelativePath(transactionId));
  const temporaryRelative = temporaryRelativePath(transactionId);
  const temporaryPath = join(root, temporaryRelative);
  const reservationPath = join(root, reservationRelativePath(authorizationId));
  const reservationDirectory = dirname(reservationPath);
  await ensureContainedDirectory(root, join(root, CAS_PREFIX, sha256.slice(0, 2)));
  await ensureContainedDirectory(root, dirname(transactionPath));
  await ensureContainedDirectory(root, reservationDirectory);
  await ensureContainedDirectory(root, join(root, COMPLETIONS_ROOT));

  let reservation = makeReservation(authorizationId, invocationIntentId, recoveryNonce);
  let transactionInput = {
    transactionId,
    authorizationId,
    reservationSha256: String(reservation.reservationSha256),
    evidenceId,
    finalRelativePath,
    temporaryRelativePath: temporaryRelative,
    expectedBytes: bytes.byteLength,
    expectedSha256: sha256,
    invocationIntentId,
    recoveryNonce,
  };
  let transaction: Record<string, unknown>;
  let transactionAlreadyExisted = false;
  try {
    await writeCanonicalWx(transactionPath, makeTransaction(transactionInput));
    transaction = makeTransaction(transactionInput);
    await invokeHook(request.phaseHook, 'intent-written');
  } catch (error) {
    if ((error as { code?: string }).code !== 'EEXIST') throw error;
    transactionAlreadyExisted = true;
    transaction = await readTransaction(transactionPath, {
      transactionId,
      authorizationId: request.authorizationId,
      evidenceId: request.evidenceId,
      expectedBytes: bytes.byteLength,
      expectedSha256: sha256,
      finalRelativePath,
      temporaryRelativePath: temporaryRelative,
      invocationIntentId: request.invocationIntentId,
      recoveryNonce: request.recoveryNonce,
    });
    authorizationId = String(transaction.authorizationId);
    evidenceId = String(transaction.evidenceId);
    invocationIntentId = String(transaction.invocationIntentId);
    recoveryNonce = String(transaction.recoveryNonce);
    reservation = makeReservation(authorizationId, invocationIntentId, recoveryNonce);
    transactionInput = {
      transactionId,
      authorizationId,
      reservationSha256: String(reservation.reservationSha256),
      evidenceId,
      finalRelativePath,
      temporaryRelativePath: temporaryRelative,
      expectedBytes: bytes.byteLength,
      expectedSha256: sha256,
      invocationIntentId,
      recoveryNonce,
    };
    if (transaction.state && (transaction.state as Record<string, unknown>).phase === 'cas_complete_waiting_metadata') {
      const state = transaction.state as Record<string, unknown>;
      const primary = String(state.primaryCompletionSha256);
      const existingReservation = await readReservation(reservationPath, { authorizationId, invocationIntentId });
      if (existingReservation.reservationSha256 !== transaction.reservationSha256
        || existingReservation.recoveryNonce !== transaction.recoveryNonce) {
        throw new Error('Evidence CAS idempotent reservation does not match transaction');
      }
      await verifyExistingCasCompletion(root, transaction, primary);
      return resultFrom(transaction, root, String(existingReservation.reservationId), primary, true, false);
    }
  }
  await syncFile(transactionPath);
  await invokeHook(request.phaseHook, 'intent-fsynced');

  let reservationCreated = false;
  try {
    await writeCanonicalWx(reservationPath, reservation);
    reservationCreated = true;
  } catch (error) {
    if ((error as { code?: string }).code !== 'EEXIST') throw error;
    // A reservation is keyed by authorizationId, but its canonical payload
    // also binds invocation intent and recovery nonce.  The schema does not
    // carry a transactionId, so a competing writer can only be identified by
    // the reservation hash.  Read/validate the winner first, then remove
    // only this transaction's journal on any collision (including the case
    // where the winner used a different invocation intent and readReservation
    // itself throws).  Never unlink the shared reservation or the winner's
    // transaction.
    let existing: Record<string, unknown>;
    try {
      existing = await readReservation(reservationPath, { authorizationId });
    } catch (readError) {
      await removeOwnTransaction(root, transactionId, transaction);
      throw new Error('Evidence CAS authorization reservation collision', { cause: readError });
    }
    if (existing.reservationSha256 !== reservation.reservationSha256) {
      await removeOwnTransaction(root, transactionId, transaction);
      throw new Error('Evidence CAS authorization reservation collision');
    }
    // A matching reservation is only reusable for an idempotent retry of the
    // same deterministic transaction. A different immutable payload can
    // otherwise share the authorization/invocation/nonce reservation and
    // continue into observation/DNS as if it had won the one-use slot.
    if (!transactionAlreadyExisted) {
      await removeOwnTransaction(root, transactionId, transaction);
      throw new Error('Evidence CAS authorization reservation is owned by another transaction');
    }
  }
  if (reservationCreated) {
    await syncFile(reservationPath);
    await syncDirectory(reservationDirectory);
  }
  await invokeHook(request.phaseHook, 'reservation-created');

  const observation = offlineNetworkObservation(sha256, bytes.byteLength);
  const observationRelative = observationRelativePath(transactionId);
  const observationPath = join(root, observationRelative);
  const observationSha256 = canonicalHash(observation, []);
  const transactionState = () => transaction.state as Record<string, unknown>;
  let phase = String(transactionState().phase);
  if (phase === 'intent_fsynced') {
    await writeCanonicalWx(observationPath, observation).catch(async (error) => {
      if ((error as { code?: string }).code !== 'EEXIST') throw error;
      await assertContainedRegularFile(root, observationPath);
      const existingBytes = await readFile(observationPath);
      const expectedBytes = Buffer.from(calibrationAdmissionCanonicalJson(observation), 'utf8');
      if (!existingBytes.equals(expectedBytes)) throw new Error('Evidence CAS network observation collision');
    });
    await syncFile(observationPath);
    await syncDirectory(dirname(observationPath));
    transaction = await updateTransaction(transactionPath, transaction, { phase: 'network_observation_fsynced', networkObservationRelativePath: observationRelative, networkObservationSha256: observationSha256 }, transactionId, request.phaseHook, 'network-observation-fsynced');
    phase = 'network_observation_fsynced';
  }
  const stateWithObservation = () => ({ networkObservationRelativePath: observationRelative, networkObservationSha256: observationSha256 });
  if (phase === 'network_observation_fsynced') {
    try {
      await writeFile(temporaryPath, bytes, { flag: 'wx', mode: 0o600 });
      await invokeHook(request.phaseHook, 'temporary-created');
      await invokeHook(request.phaseHook, 'temporary-written');
    } catch (error) {
      if ((error as { code?: string }).code !== 'EEXIST') throw error;
      await assertContainedRegularFile(root, temporaryPath);
      if (!(await sameBytes(temporaryPath, bytes, sha256))) throw new Error('Evidence CAS temporary collision');
    }
    await syncFile(temporaryPath);
    await invokeHook(request.phaseHook, 'temporary-fsynced');
    transaction = await updateTransaction(transactionPath, transaction, { phase: 'temporary_fsynced', ...stateWithObservation() }, transactionId, request.phaseHook);
    phase = 'temporary_fsynced';
  }
  if (phase === 'temporary_fsynced') {
    try {
      await link(temporaryPath, join(root, finalRelativePath));
      await invokeHook(request.phaseHook, 'object-promoted');
    } catch (error) {
      if ((error as { code?: string }).code !== 'EEXIST') throw error;
      await assertContainedRegularFile(root, join(root, finalRelativePath));
      if (!(await sameBytes(join(root, finalRelativePath), bytes, sha256))) throw new Error('Evidence CAS final collision');
    }
    transaction = await updateTransaction(transactionPath, transaction, { phase: 'object_promoted', ...stateWithObservation() }, transactionId, request.phaseHook);
    phase = 'object_promoted';
  }
  if (phase === 'object_promoted') {
    await syncDirectory(dirname(join(root, finalRelativePath)));
    await syncDirectory(dirname(temporaryPath));
    await invokeHook(request.phaseHook, 'cas-directories-fsynced');
    transaction = await updateTransaction(transactionPath, transaction, { phase: 'cas_directories_fsynced', ...stateWithObservation() }, transactionId, request.phaseHook);
    phase = 'cas_directories_fsynced';
  }
  if (phase === 'cas_directories_fsynced') {
    if (!(await sameBytes(join(root, finalRelativePath), bytes, sha256))) throw new Error('Evidence CAS final rehash failed');
    try { await unlink(temporaryPath); } catch (error) { if ((error as { code?: string }).code !== 'ENOENT') throw error; }
    await invokeHook(request.phaseHook, 'temporary-removed');
    await syncDirectory(dirname(temporaryPath));
    transaction = await updateTransaction(transactionPath, transaction, { phase: 'temporary_removed', ...stateWithObservation() }, transactionId, request.phaseHook);
    phase = 'temporary_removed';
  }
  if (phase === 'temporary_removed') {
    const primary = await writePrimaryCompletion(root, transaction, observation);
    await invokeHook(request.phaseHook, 'primary-completion-fsynced');
    transaction = await updateTransaction(transactionPath, transaction, { phase: 'cas_complete_waiting_metadata', ...stateWithObservation(), primaryCompletionRelativePath: primary.relativePath, primaryCompletionSha256: primary.sha256 }, transactionId, request.phaseHook);
    await invokeHook(request.phaseHook, 'transaction-fsynced');
    return resultFrom(transaction, root, String(reservation.reservationId), primary.sha256, false, false);
  }
  if (phase === 'cas_complete_waiting_metadata') {
    const state = transactionState();
    const primary = String(state.primaryCompletionSha256);
    await verifyExistingCasCompletion(root, transaction, primary);
    return resultFrom(transaction, root, String(reservation.reservationId), primary, true, false);
  }
  throw new Error(`Unsupported Evidence CAS transaction phase: ${phase}`);
}

export const writeAdmissionEvidenceCas = putAdmissionEvidenceCas;
export const putEvidenceCas = putAdmissionEvidenceCas;

export async function readAdmissionEvidenceCasBytes(rootInput: string, sha256: string): Promise<Buffer> {
  assertSha256(sha256);
  const root = await resolveAdmissionRoot(rootInput);
  const path = join(root, admissionEvidenceCasRelativePath(sha256));
  await assertContainedRegularFile(root, path);
  const bytes = await readFile(path);
  if (digest(bytes) !== sha256) throw new Error('Evidence CAS object hash mismatch');
  return bytes;
}

export async function recoverAdmissionEvidenceCas(rootInput: string, transactionId: string, options: AdmissionEvidenceCasRecoveryOptions): Promise<AdmissionEvidenceCasRecoveryResult> {
  assertId(transactionId);
  // Recovery is an operator-authorized mutation.  Do not make either proof
  // optional: a transaction id alone is not sufficient authority to resume or
  // rewrite a CAS journal.
  if (!options || options.acknowledgeNoLiveWriter !== true) throw new Error('Evidence CAS recovery requires no-live-writer acknowledgement');
  if (typeof options.recoveryNonce !== 'string' || options.recoveryNonce.length === 0) throw new Error('Evidence CAS recovery requires a recovery nonce');
  assertSha256(options.recoveryNonce);
  const root = await resolveAdmissionRoot(rootInput);
  const transactionPath = join(root, transactionRelativePath(transactionId));
  const transaction = await readTransaction(transactionPath, { transactionId });
  if (transaction.recoveryNonce !== options.recoveryNonce) throw new Error('Evidence CAS recovery nonce mismatch');
  if (transaction.temporaryRelativePath !== temporaryRelativePath(transactionId)) throw new Error('Evidence CAS recovery temporary path is not transaction-owned');
  if (transaction.finalRelativePath !== admissionEvidenceCasRelativePath(String(transaction.expectedSha256))) throw new Error('Evidence CAS recovery final path is not hash-derived');
  const transactionState = transaction.state as Record<string, unknown>;
  if (typeof transactionState.networkObservationRelativePath === 'string'
    && transactionState.networkObservationRelativePath !== observationRelativePath(transactionId)) {
    throw new Error('Evidence CAS recovery network observation path is not transaction-owned');
  }
  const reservationPath = join(root, reservationRelativePath(String(transaction.authorizationId)));
  const reservation = await readReservation(reservationPath, { authorizationId: transaction.authorizationId, invocationIntentId: transaction.invocationIntentId });
  if (reservation.reservationSha256 !== transaction.reservationSha256 || reservation.recoveryNonce !== transaction.recoveryNonce) throw new Error('Evidence CAS transaction reservation mismatch');
  // Validate or materialize the network observation before touching the final
  // CAS inode. A forged/symlinked observation must not leave a promoted final
  // object (or a deleted temporary) behind when recovery rejects it.
  let observation: Record<string, unknown>;
  let observationRelative: string;
  const state = transaction.state as Record<string, unknown>;
  if (typeof state.networkObservationRelativePath === 'string') {
    observationRelative = state.networkObservationRelativePath;
    if (!safeRelative(observationRelative)) throw new Error('Evidence CAS recovery network observation path is unsafe');
    const observationPath = join(root, observationRelative);
    await assertContainedRegularFile(root, observationPath);
    const observationBytes = await readFile(observationPath);
    const observationText = observationBytes.toString('utf8');
    const parsed = JSON.parse(observationText) as unknown;
    if (observationText !== calibrationAdmissionCanonicalJson(parsed)) throw new Error('Evidence CAS recovery network observation is not canonical');
    if (canonicalHash(parsed, []) !== state.networkObservationSha256) throw new Error('Evidence CAS recovery network observation mismatch');
    observation = parsed as Record<string, unknown>;
  } else {
    // A crash can leave only the intent-fsynced journal. Recovery must make
    // the observation durable before it writes a primary completion that
    // references that observation; otherwise the later verified-context join
    // would point at a missing file.
    observationRelative = observationRelativePath(transactionId);
    observation = offlineNetworkObservation(String(transaction.expectedSha256), Number(transaction.expectedBytes));
    const observationPath = join(root, observationRelative);
    const observationBytes = Buffer.from(calibrationAdmissionCanonicalJson(observation), 'utf8');
    try {
      await writeFile(observationPath, observationBytes, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if ((error as { code?: string }).code !== 'EEXIST') throw error;
      await assertContainedRegularFile(root, observationPath);
      const existingBytes = await readFile(observationPath);
      if (!existingBytes.equals(observationBytes)) throw new Error('Evidence CAS recovery network observation collision');
    }
    await syncFile(observationPath);
    await syncDirectory(dirname(observationPath));
  }
  // Validate an existing primary completion before promoting or deleting any
  // CAS inode. This keeps recovery fail-closed even if the completion marker
  // was substituted after the transaction reached its metadata phase.
  let primarySha = typeof state.primaryCompletionSha256 === 'string' ? state.primaryCompletionSha256 : '';
  if (primarySha) {
    if (typeof state.primaryCompletionRelativePath !== 'string'
      || !safeRelative(state.primaryCompletionRelativePath)
      || state.primaryCompletionRelativePath !== completionRelativePath(primarySha)) {
      throw new Error('Evidence CAS recovery primary completion path mismatch');
    }
    const primaryPath = join(root, String(state.primaryCompletionRelativePath));
    await assertContainedRegularFile(root, primaryPath);
    const primaryBytes = await readFile(primaryPath, 'utf8');
    const primary = JSON.parse(primaryBytes) as unknown;
    if (!isCalibrationEvidenceCasPrimaryCompletionV1(primary)) throw new Error('Evidence CAS recovery primary completion is invalid');
    if (primaryBytes !== calibrationAdmissionCanonicalJson(primary)) throw new Error('Evidence CAS recovery primary completion is not canonical');
    const primaryRecord = primary as unknown as Record<string, unknown>;
    if (primaryRecord.primaryCompletionSha256 !== primarySha) throw new Error('Evidence CAS recovery primary completion hash mismatch');
    // Every projection field is checked against the transaction. The primary
    // marker is the durable claim that the byte object is complete; accepting
    // a self-consistent marker for another transaction would let a forged
    // journal point recovery at unrelated evidence.
    const expectedPrimaryFields: Record<string, unknown> = {
      transactionId: transaction.transactionId,
      authorizationId: transaction.authorizationId,
      reservationSha256: transaction.reservationSha256,
      evidenceId: transaction.evidenceId,
      invocationIntentId: transaction.invocationIntentId,
      finalRelativePath: transaction.finalRelativePath,
      observedBytes: transaction.expectedBytes,
      observedSha256: transaction.expectedSha256,
      networkObservationSha256: canonicalHash(observation, []),
    };
    for (const [key, expected] of Object.entries(expectedPrimaryFields)) {
      if (primaryRecord[key] !== expected) throw new Error(`Evidence CAS recovery primary completion ${key} mismatch`);
    }
    if (canonicalHash(primaryRecord.networkObservation, []) !== canonicalHash(observation, [])) {
      throw new Error('Evidence CAS recovery primary completion network observation mismatch');
    }
  }
  const finalPath = join(root, String(transaction.finalRelativePath));
  const temporaryPath = join(root, String(transaction.temporaryRelativePath));
  await assertContainedRegularFile(root, finalPath).catch(async (error) => {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
    await assertContainedRegularFile(root, temporaryPath);
    const temporaryBytes = await readFile(temporaryPath);
    if (temporaryBytes.byteLength !== transaction.expectedBytes || digest(temporaryBytes) !== transaction.expectedSha256) {
      throw new Error('Evidence CAS recovery temporary bytes mismatch');
    }
    await link(temporaryPath, finalPath);
    await syncDirectory(dirname(finalPath));
  });
  const finalBytes = await readFile(finalPath);
  if (finalBytes.byteLength !== transaction.expectedBytes || digest(finalBytes) !== transaction.expectedSha256) throw new Error('Evidence CAS recovery final bytes mismatch');
  try { await unlink(temporaryPath); } catch (error) { if ((error as { code?: string }).code !== 'ENOENT') throw error; }
  await syncDirectory(dirname(temporaryPath));
  if (!primarySha) {
    const primary = await writePrimaryCompletion(root, transaction, observation);
    primarySha = primary.sha256;
  }
  if (state.phase !== 'cas_complete_waiting_metadata') {
    const next = { phase: 'cas_complete_waiting_metadata', networkObservationRelativePath: observationRelative, networkObservationSha256: state.networkObservationSha256 ?? canonicalHash(observation, []), primaryCompletionRelativePath: completionRelativePath(primarySha), primaryCompletionSha256: primarySha };
    const nextTransaction: Record<string, unknown> = { ...transaction, state: next };
    nextTransaction.transactionSha256 = canonicalHash(nextTransaction, ['transactionSha256']);
    await writeCanonicalReplace(transactionPath, nextTransaction, transactionId);
  }
  return resultFrom(transaction, root, String(reservation.reservationId), primarySha, true, true) as AdmissionEvidenceCasRecoveryResult;
}
