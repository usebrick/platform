/**
 * Offline acquisition-index publication.
 *
 * This module deliberately has a small authority surface.  It reads only
 * schema-shaped JSON and regular files below the supplied root, writes
 * transaction-owned files with wx/atomic operations, and never imports a
 * network client or a process-spawning helper.  Network acquisition is owned
 * by a later task; this publisher only makes already-owned bytes durable.
 */
import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rmdir,
  unlink,
  link,
} from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import {
  FROZEN_ADMISSION_ACTIONS,
  FROZEN_ADMISSION_PROFILE_IDS,
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionInvocationIntentId,
  calibrationAdmissionSha256,
  calibrationAdmissionToolReceiptId,
  isCalibrationAdmissionEvidenceBundleV1,
  isCalibrationAdmissionInvocationIntentV1,
  isCalibrationAdmissionToolAuthorityIndexV1,
  isCalibrationAdmissionToolProfileV1,
  isCalibrationAdmissionToolReceiptV1,
  isCalibrationToolAuthorityPublicationLockV1,
  isCalibrationToolAuthorityPublicationTransactionV1,
} from '@usebrick/core';
import type {
  CalibrationAdmissionAcquisitionIndexV1,
  CalibrationAdmissionInvocationIntentV1,
  CalibrationToolAuthorityPublicationLockV1,
  CalibrationToolAuthorityPublicationTransactionV1,
  CalibrationAcquisitionPublicationLockV1,
  CalibrationAcquisitionPublicationProposalV1,
  CalibrationAcquisitionPublicationTransactionV1,
  CalibrationAdmissionToolProfileV1,
  CalibrationAdmissionToolReceiptV1,
} from '@usebrick/core';

const SHA256 = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const LOWER_ID = /^[a-f0-9]{64}$/;
const RELATIVE_PATH = /^(?!\/)(?!.*\\)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*(?:^|\/)\.(?:\/|$))(?!.*\/\/)[^\u0000-\u001f]+$/;
const ACQUISITION_ARTIFACT_KINDS = new Set([
  'evidence_authorization',
  'source_authorization',
  'round_authorization',
  'evidence_receipt',
  'evidence_cas_primary_completion',
  'source_receipt',
  'round_receipt',
  'materialization_receipt',
  'materialization_receipt_ledger',
  'evidence_envelope',
  'evidence_index',
  'evidence_payload_set',
  'evidence_verification_receipt_ledger',
  'evidence_bundle',
]);
const PROFILE_ID = 'admission-acquisition-publication-v1';
const PUBLICATION_ACTION = 'acquisition:publish';
const PUBLICATION_VERSION = 'v10.3-acquisition-publication-proposal-v1';
const INDEX_VERSION = 'v10.3-admission-acquisition-index-v1';
const LOCK_VERSION = 'v10.3-acquisition-publication-lock-v1';
const TRANSACTION_VERSION = 'v10.3-acquisition-publication-transaction-v1';
const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_RECOVERY_DEPTH = 10_000;

/** The frozen resource budget for this admission action. */
export const ADMISSION_PUBLICATION_HEAP_BYTES = 2 * 1024 * 1024 * 1024;
export const ADMISSION_PUBLICATION_WORKERS = 1;
export const ADMISSION_PUBLICATION_PROFILE_ID = PROFILE_ID;
export const ADMISSION_PUBLICATION_ACTION = PUBLICATION_ACTION;

/** Canonical top-level layout used by the v10.3 command. */
export const ACQUISITIONS_RELATIVE_ROOT = 'review/admission/acquisitions';
export const ACQUISITIONS_INDEX_RELATIVE_PATH = `${ACQUISITIONS_RELATIVE_ROOT}/index.json`;
export const ACQUISITIONS_GENERATIONS_RELATIVE_ROOT = `${ACQUISITIONS_RELATIVE_ROOT}/index-generations`;
export const ACQUISITIONS_TRANSACTIONS_RELATIVE_ROOT = `${ACQUISITIONS_RELATIVE_ROOT}/transactions`;
export const ACQUISITION_PUBLICATION_LOCK_RELATIVE_PATH = 'review/admission/acquisition-publication.lock';
export const ACQUISITION_PUBLICATION_TRANSACTION_RELATIVE_PATH = 'review/admission/acquisition-publication-transaction.json';
/** @deprecated Use the plan-defined parent admission lock path. */
export const ACQUISITIONS_LOCK_RELATIVE_PATH = ACQUISITION_PUBLICATION_LOCK_RELATIVE_PATH;

export type AcquisitionPublicationPhase =
  | 'lock-written'
  | 'lock-file-fsynced'
  | 'lock-directory-fsynced'
  | 'intent-written'
  | 'intent-fsynced'
  | 'artifact-staged'
  | 'artifact-staged-fsynced'
  | 'artifacts-staged-fsynced'
  | 'artifacts-promoted'
  | 'artifact-promoted'
  | 'index-generation-fsynced'
  | 'next-index-temporary-fsynced'
  | 'index-promoted'
  | 'output-directories-fsynced'
  | 'publication-tool-receipt-indexed'
  | 'complete'
  | 'cleanup';

/** Durable boundaries exposed only to bounded fault-matrix tests/embedders. */
export type ToolAuthorityPublicationPhase =
  | 'lock-file-fsynced'
  | 'transaction-fsynced'
  | 'artifacts-staged-fsynced'
  | 'artifacts-promoted'
  | 'index-generation-fsynced'
  | 'next-index-temporary-fsynced'
  | 'index-promoted'
  | 'output-directories-fsynced'
  | 'complete'
  | 'transaction-unlinked'
  | 'lock-unlinked';

export interface AcquisitionPublicationReceiptInput {
  readonly root: string;
  readonly transactionId: string;
  readonly invocationIntentId: string;
  readonly proposalSha256: string;
  readonly nextIndexSha256: string;
  readonly operation: 'create' | 'replace';
  readonly argvSha256?: string;
  /** Optional deterministic fault hook for the local authority writer. */
  readonly toolAuthorityPhaseHook?: (phase: ToolAuthorityPublicationPhase) => void | Promise<void>;
}

export interface AcquisitionPublicationReceiptResult {
  readonly receiptId: string;
  readonly receiptSha256: string;
  readonly toolAuthorityIndexSha256: string;
}

export type AcquisitionPublicationReceiptPublisher = (
  input: AcquisitionPublicationReceiptInput,
) => Promise<AcquisitionPublicationReceiptResult>;

export interface AcquisitionPublicationRequest {
  /** Absolute or process-relative root of the v10.3 control plane. */
  readonly root: string;
  /** A parsed proposal. `proposalPath` is only used by the CLI. */
  readonly proposal: unknown;
  /** Optional proposal bytes path, retained in the transaction sidecar. */
  readonly proposalPath?: string;
  readonly invocationIntentId?: string;
  readonly recoveryNonce?: string;
  readonly phaseHook?: (phase: AcquisitionPublicationPhase) => void | Promise<void>;
  readonly toolAuthorityPhaseHook?: (phase: ToolAuthorityPublicationPhase) => void | Promise<void>;
  /** A test/embedding hook for the separately owned tool-authority publisher. */
  readonly publishToolReceipt?: AcquisitionPublicationReceiptPublisher;
  /** Root of the global tool authority. Defaults to root/review/admission/tool-authority. */
  readonly toolAuthorityRoot?: string;
  /** Use an admission-root layout (`root/acquisitions`) for isolated callers. */
  readonly publicationRoot?: string;
}

export interface AcquisitionPublicationResult {
  readonly complete: boolean;
  readonly promoted: boolean;
  readonly recoveryRequired: boolean;
  readonly transactionId: string;
  readonly nextIndexSha256: string;
  readonly currentIndexSha256?: string;
  readonly transactionPath: string;
  readonly lockPath: string;
  readonly publicationToolReceiptId?: string;
  readonly publicationToolReceiptSha256?: string;
  readonly toolAuthorityIndexSha256?: string;
  readonly reason?: string;
}

export interface AcquisitionPublicationRecoveryRequest {
  readonly root: string;
  readonly transactionId?: string;
  readonly fromLock?: boolean;
  readonly recoveryNonce: string;
  /** Optional CLI binding; when supplied it must equal the lock intent. */
  readonly invocationIntentId?: string;
  readonly acknowledgeNoLiveWriter: boolean;
  readonly phaseHook?: (phase: AcquisitionPublicationPhase) => void | Promise<void>;
  readonly toolAuthorityPhaseHook?: (phase: ToolAuthorityPublicationPhase) => void | Promise<void>;
  readonly publishToolReceipt?: AcquisitionPublicationReceiptPublisher;
  readonly toolAuthorityRoot?: string;
  readonly publicationRoot?: string;
}

export class AcquisitionPublicationPendingError extends Error {
  readonly result: AcquisitionPublicationResult;

  constructor(result: AcquisitionPublicationResult, message = 'Acquisition publication output is durable but its post-output authority receipt is not indexed') {
    super(message);
    this.name = 'AcquisitionPublicationPendingError';
    this.result = result;
  }
}

type ExpectedCurrentState =
  | { readonly kind: 'absent' }
  | { readonly kind: 'existing'; readonly indexSha256: string };

type AcquisitionArtifact = CalibrationAdmissionAcquisitionIndexV1['artifacts'][number];
type ProposalArtifact = CalibrationAcquisitionPublicationProposalV1['artifacts'][number];
type TransactionArtifact = CalibrationAcquisitionPublicationTransactionV1['artifacts'][number];

interface Layout {
  readonly root: string;
  readonly admissionRoot: string;
  readonly publicationRoot: string;
  readonly indexPath: string;
  readonly indexRelativePath: string;
  readonly generationsRoot: string;
  readonly transactionsRoot: string;
  readonly lockPath: string;
}

interface ValidatedProposal {
  readonly proposal: CalibrationAcquisitionPublicationProposalV1;
  readonly proposalBytes: Buffer;
  readonly proposalSha256: string;
  readonly artifacts: readonly ProposalArtifact[];
}

interface PublicationContext {
  readonly layout: Layout;
  readonly validated: ValidatedProposal;
  readonly invocationIntentId: string;
  readonly recoveryNonce: string;
  readonly transactionId: string;
  readonly lock: CalibrationAcquisitionPublicationLockV1;
  readonly lockPath: string;
  readonly transactionPath: string;
  readonly proposalSidecarPath: string;
  readonly transaction: CalibrationAcquisitionPublicationTransactionV1;
  readonly proposalSidecarBytes: Buffer;
  readonly publishToolReceipt?: AcquisitionPublicationReceiptPublisher;
  readonly toolAuthorityRoot?: string;
  readonly phaseHook?: (phase: AcquisitionPublicationPhase) => void | Promise<void>;
  readonly toolAuthorityPhaseHook?: (phase: ToolAuthorityPublicationPhase) => void | Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const expected = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return keys.length <= expected.size
    && keys.every((key) => expected.has(key))
    && required.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isSha(value: unknown): value is string {
  return typeof value === 'string' && SHA256.test(value);
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value);
}

function isLowerId(value: unknown): value is string {
  return typeof value === 'string' && LOWER_ID.test(value);
}

function isRelativePath(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 4096 && RELATIVE_PATH.test(value)
    && !/^[A-Za-z]:/.test(value);
}

function isSafeBytes(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_ARTIFACT_BYTES;
}

function deepCanonical(value: unknown): string {
  return calibrationAdmissionCanonicalJson(value);
}

function hashWithout(value: Record<string, unknown>, ...keys: readonly string[]): string {
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(value)) if (!keys.includes(key)) copy[key] = value[key];
  return calibrationAdmissionSha256(copy);
}

export function acquisitionIndexSha256(value: unknown): string {
  if (!isRecord(value)) throw new Error('Acquisition index must be an object');
  return hashWithout(value, 'indexSha256');
}

export const calibrationAdmissionAcquisitionIndexSha256 = acquisitionIndexSha256;

export function acquisitionPublicationProposalSha256(value: unknown): string {
  if (!isRecord(value)) throw new Error('Acquisition publication proposal must be an object');
  return hashWithout(value, 'proposalSha256');
}

export const calibrationAcquisitionPublicationProposalSha256 = acquisitionPublicationProposalSha256;

export function acquisitionPublicationProposalId(value: unknown): string {
  if (!isRecord(value)) throw new Error('Acquisition publication proposal must be an object');
  return hashWithout(value, 'proposalId', 'proposalSha256');
}

export function acquisitionPublicationArtifactSetSha256(value: unknown): string {
  if (!Array.isArray(value)) throw new Error('Acquisition publication artifacts must be an array');
  return calibrationAdmissionSha256(value);
}

function sortArtifacts(artifacts: readonly AcquisitionArtifact[]): readonly AcquisitionArtifact[] {
  return [...artifacts].sort((left, right) => {
    const a = `${left.kind}\u0000${left.objectId}\u0000${left.relativePath}\u0000${left.sha256}`;
    const b = `${right.kind}\u0000${right.objectId}\u0000${right.relativePath}\u0000${right.sha256}`;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function artifactKey(artifact: AcquisitionArtifact): string {
  return `${artifact.kind}\u0000${artifact.objectId}\u0000${artifact.relativePath}`;
}

function proposalArtifactKey(artifact: ProposalArtifact): string {
  return `${artifact.kind}\u0000${artifact.objectId}\u0000${artifact.finalRelativePath}`;
}

function validateExpectedCurrentState(value: unknown): value is ExpectedCurrentState {
  if (!isRecord(value)) return false;
  if (value.kind === 'absent') return exactKeys(value, ['kind']);
  return value.kind === 'existing' && exactKeys(value, ['kind', 'indexSha256']) && isSha(value.indexSha256);
}

function validateIndexShape(value: unknown): value is CalibrationAdmissionAcquisitionIndexV1 {
  if (!isRecord(value) || !exactKeys(value, ['version', 'generation', 'artifacts', 'indexSha256'], ['parentIndexSha256'])) return false;
  if (value.version !== INDEX_VERSION || typeof value.generation !== 'number' || !Number.isSafeInteger(value.generation) || value.generation < 0 || !Array.isArray(value.artifacts) || !isSha(value.indexSha256)) return false;
  if (value.parentIndexSha256 !== undefined && !isSha(value.parentIndexSha256)) return false;
  let previous = '';
  const seen = new Set<string>();
  for (const raw of value.artifacts) {
    if (!isRecord(raw) || !exactKeys(raw, ['kind', 'objectId', 'relativePath', 'sha256'])) return false;
    if (typeof raw.kind !== 'string' || !ACQUISITION_ARTIFACT_KINDS.has(raw.kind) || !isId(raw.objectId) || !isRelativePath(raw.relativePath) || !isSha(raw.sha256)) return false;
    const key = artifactKey(raw as unknown as AcquisitionArtifact);
    if (seen.has(key) || key <= previous) return false;
    seen.add(key);
    previous = key;
  }
  if (value.generation === 0 && (value.parentIndexSha256 !== undefined || value.artifacts.length !== 0)) return false;
  if (value.generation > 0 && value.parentIndexSha256 === undefined) return false;
  try { return acquisitionIndexSha256(value) === value.indexSha256; } catch { return false; }
}

/** Pure schema/semantic validation for an acquisition index. */
export function isCalibrationAdmissionAcquisitionIndexV1(value: unknown): value is CalibrationAdmissionAcquisitionIndexV1 {
  return validateIndexShape(value);
}

export function assertCalibrationAdmissionAcquisitionIndexV1(value: unknown): asserts value is CalibrationAdmissionAcquisitionIndexV1 {
  if (!validateIndexShape(value)) throw new Error('Acquisition index is not schema-valid or has an invalid self-hash');
}

function validateProposalArtifact(value: unknown): value is ProposalArtifact {
  if (!isRecord(value) || !exactKeys(value, ['kind', 'objectId', 'sourceRelativePath', 'finalRelativePath', 'bytes', 'sha256'])) return false;
  return typeof value.kind === 'string'
    && ACQUISITION_ARTIFACT_KINDS.has(value.kind)
    && isId(value.objectId)
    && isRelativePath(value.sourceRelativePath)
    && isRelativePath(value.finalRelativePath)
    && isSafeBytes(value.bytes)
    && isSha(value.sha256);
}

function validateProposalShape(value: unknown): value is CalibrationAcquisitionPublicationProposalV1 {
  if (!isRecord(value) || !exactKeys(value, ['version', 'proposalId', 'operation', 'expectedCurrentState', 'nextIndex', 'artifacts', 'proposalSha256'])) return false;
  if (value.version !== PUBLICATION_VERSION || !isLowerId(value.proposalId) || (value.operation !== 'create' && value.operation !== 'replace') || !validateExpectedCurrentState(value.expectedCurrentState) || !validateIndexShape(value.nextIndex) || !Array.isArray(value.artifacts) || !isSha(value.proposalSha256)) return false;
  if (!value.artifacts.every(validateProposalArtifact)) return false;
  const proposal = value as unknown as CalibrationAcquisitionPublicationProposalV1;
  const expectedState = proposal.expectedCurrentState;
  if (proposal.operation === 'create') {
    if (expectedState.kind !== 'absent' || proposal.nextIndex.generation !== 0 || proposal.nextIndex.parentIndexSha256 !== undefined || proposal.nextIndex.artifacts.length !== 0 || proposal.artifacts.length !== 0) return false;
  } else {
    if (expectedState.kind !== 'existing' || proposal.nextIndex.generation < 1 || proposal.nextIndex.parentIndexSha256 !== expectedState.indexSha256) return false;
  }
  const next = new Map(proposal.nextIndex.artifacts.map((artifact) => [artifactKey(artifact), artifact]));
  const seen = new Set<string>();
  const finalPaths = new Set<string>();
  for (const artifact of proposal.artifacts) {
    const key = proposalArtifactKey(artifact);
    if (seen.has(key)) return false;
    if (finalPaths.has(artifact.finalRelativePath)) return false;
    finalPaths.add(artifact.finalRelativePath);
    seen.add(key);
    const indexed = next.get(`${artifact.kind}\u0000${artifact.objectId}\u0000${artifact.finalRelativePath}`);
    if (!indexed || indexed.sha256 !== artifact.sha256 || indexed.objectId !== artifact.objectId || indexed.kind !== artifact.kind || indexed.relativePath !== artifact.finalRelativePath) return false;
  }
  if (seen.size !== next.size) return false;
  try {
    if (acquisitionPublicationProposalSha256(value) !== value.proposalSha256) return false;
    if (acquisitionPublicationProposalId(value) !== value.proposalId) return false;
  } catch { return false; }
  return true;
}

/** Pure schema/semantic validation for an acquisition publication proposal. */
export function isCalibrationAcquisitionPublicationProposalV1(value: unknown): value is CalibrationAcquisitionPublicationProposalV1 {
  return validateProposalShape(value);
}

export const isCalibrationAdmissionAcquisitionPublicationProposalV1 = isCalibrationAcquisitionPublicationProposalV1;

export function assertCalibrationAcquisitionPublicationProposalV1(value: unknown): asserts value is CalibrationAcquisitionPublicationProposalV1 {
  if (!validateProposalShape(value)) throw new Error('Acquisition publication proposal is not schema-valid or has an invalid self-hash');
}

function isInside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !rel.includes(`..${sep}`) && !rel.startsWith('/') && !rel.includes('\\'));
}

async function ensureDirectory(root: string, path: string): Promise<void> {
  if (!isInside(root, resolve(path))) throw new Error('Acquisition publication path escapes root');
  await mkdir(path, { recursive: true, mode: 0o700 });
  const metadata = await lstat(path);
  if (!metadata.isDirectory()) throw new Error('Acquisition publication directory is not a directory');
  const canonical = await realpath(path);
  if (!isInside(root, canonical)) throw new Error('Acquisition publication directory escapes root');
}

async function regularContainedFile(root: string, path: string): Promise<void> {
  const metadata = await lstat(path);
  if (!metadata.isFile()) throw new Error('Acquisition artifact must be a regular file (symlinks are forbidden)');
  const canonical = await realpath(path);
  if (!isInside(root, canonical)) throw new Error('Acquisition artifact path escapes root');
}

async function syncFile(path: string): Promise<void> {
  const handle = await open(path, constants.O_RDONLY);
  try { await handle.sync(); } finally { await handle.close(); }
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, constants.O_RDONLY);
  try { await handle.sync(); } finally { await handle.close(); }
}

async function invokeHook(hook: AcquisitionPublicationRequest['phaseHook'] | AcquisitionPublicationRecoveryRequest['phaseHook'], phase: AcquisitionPublicationPhase): Promise<void> {
  if (hook) await hook(phase);
}

async function writeWx(path: string, bytes: Uint8Array): Promise<void> {
  const handle = await open(path, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}

async function writeReplace(path: string, bytes: Uint8Array, token: string): Promise<void> {
  const temp = `${path}.${token}.tmp`;
  try {
    await writeWx(temp, bytes);
    await rename(temp, path);
    await syncDirectory(dirname(path));
  } catch (error) {
    try { await unlink(temp); } catch (cleanupError) { if ((cleanupError as { code?: string }).code !== 'ENOENT') throw cleanupError; }
    throw error;
  }
}

async function readJsonFile(path: string): Promise<unknown> {
  const bytes = await readFile(path);
  const text = bytes.toString('utf8');
  const parsed = JSON.parse(text) as unknown;
  if (!Buffer.from(deepCanonical(parsed), 'utf8').equals(bytes)) throw new Error('Durable JSON is not canonical');
  return parsed;
}

async function removeAcquisitionOwnedPath(root: string, path: string, expectedBytes?: Uint8Array, expectedSha256?: string): Promise<void> {
  const absolute = resolve(path);
  if (!isInside(root, absolute)) throw new Error('Acquisition cleanup path escapes root');
  try {
    await regularContainedFile(root, absolute);
    if (expectedBytes !== undefined) {
      const actual = await readFile(absolute);
      if (!actual.equals(expectedBytes)) throw new Error(`Acquisition cleanup refused changed file: ${relative(root, absolute)}`);
    }
    if (expectedSha256 !== undefined) {
      const actual = await readFile(absolute);
      if (createHash('sha256').update(actual).digest('hex') !== expectedSha256) throw new Error(`Acquisition cleanup refused changed file: ${relative(root, absolute)}`);
    }
    await unlink(absolute);
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
  }
}

async function hashFile(path: string): Promise<{ readonly bytes: Buffer; readonly sha256: string }> {
  const bytes = await readFile(path);
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
}

async function resolveLayout(rootInput: string, publicationRootInput?: string): Promise<Layout> {
  const suppliedRoot = await realpath(resolve(rootInput));
  const root = basename(suppliedRoot) === 'admission' && basename(dirname(suppliedRoot)) === 'review'
    ? resolve(suppliedRoot, '..', '..')
    : suppliedRoot;
  const admissionRoot = publicationRootInput
    ? (basename(resolve(publicationRootInput)) === 'admission' ? resolve(publicationRootInput) : resolve(root, publicationRootInput))
    : (basename(suppliedRoot) === 'admission' && basename(dirname(suppliedRoot)) === 'review' ? suppliedRoot : join(root, 'review', 'admission'));
  if (!isInside(root, admissionRoot)) throw new Error('Acquisition publication root escapes root');
  await ensureDirectory(root, admissionRoot);
  const acquisitions = join(admissionRoot, 'acquisitions');
  const generationsRoot = join(acquisitions, 'index-generations');
  const transactionsRoot = join(acquisitions, 'transactions');
  await ensureDirectory(root, acquisitions);
  await ensureDirectory(root, generationsRoot);
  await ensureDirectory(root, transactionsRoot);
  return {
    root,
    admissionRoot,
    publicationRoot: acquisitions,
    indexPath: join(acquisitions, 'index.json'),
    indexRelativePath: `${relative(root, acquisitions).split(sep).join('/')}/index.json`,
    generationsRoot,
    transactionsRoot,
    lockPath: join(admissionRoot, 'acquisition-publication.lock'),
  };
}

function expectedIndexPath(layout: Layout, sha256: string): string {
  if (!SHA256.test(sha256)) throw new Error('Invalid acquisition index hash');
  return join(layout.generationsRoot, `${sha256}.json`);
}

function expectedIndexRelativePath(layout: Layout, sha256: string): string {
  return `${relative(layout.root, expectedIndexPath(layout, sha256)).split(sep).join('/')}`;
}

function transactionPath(layout: Layout, transactionId: string): string {
  if (!isLowerId(transactionId)) throw new Error('Invalid acquisition publication transaction id');
  // The plan deliberately uses one fixed transaction path. Recovery obtains
  // the intended transaction ID from the fixed lock and never discovers a
  // journal by scanning a directory.
  return join(layout.admissionRoot, 'acquisition-publication-transaction.json');
}

function transactionProposalSidecarPath(layout: Layout, transactionId: string): string {
  if (!isLowerId(transactionId)) throw new Error('Invalid acquisition publication transaction id');
  return join(layout.transactionsRoot, `${transactionId}.proposal.json`);
}

function transactionStageRoot(layout: Layout, transactionId: string): string {
  return join(layout.transactionsRoot, transactionId);
}

function transactionArtifactStagePath(layout: Layout, transactionId: string, index: number): string {
  return join(transactionStageRoot(layout, transactionId), `artifact-${index}.bin`);
}

function transactionIndexStagePath(layout: Layout, transactionId: string): string {
  return join(transactionStageRoot(layout, transactionId), 'index-generation.json');
}

function transactionCurrentIndexTempPath(layout: Layout, transactionId: string): string {
  return join(transactionStageRoot(layout, transactionId), 'current-index.json');
}

function relativePath(root: string, path: string): string {
  return relative(root, path).split(sep).join('/');
}

function lockWithoutHash(lock: CalibrationAcquisitionPublicationLockV1): Record<string, unknown> {
  const { lockSha256: _ignored, ...rest } = lock;
  return rest;
}

function transactionWithoutHash(transaction: CalibrationAcquisitionPublicationTransactionV1): Record<string, unknown> {
  const { transactionSha256: _ignored, ...rest } = transaction;
  return rest;
}

function makeTransactionId(
  operation: 'create' | 'replace',
  expectedCurrentState: ExpectedCurrentState,
  nextIndexSha256: string,
  artifactSetSha256: string,
  invocationIntentId: string,
  recoveryNonce: string,
): string {
  return calibrationAdmissionSha256({
    domain: 'v10.3-acquisition-publication-transaction-id-v1',
    operation,
    expectedCurrentState,
    nextIndexSha256,
    artifactSetSha256,
    invocationIntentId,
    recoveryNonce,
  });
}

/**
 * Recompute the acquisition transaction identity from its immutable intent.
 * State/phase fields and transaction self-hashes are deliberately absent: a
 * recovery selector must authorize only the proposal that acquired the lock,
 * regardless of how far its mutable journal progressed before a crash.
 */
function expectedAcquisitionTransactionId(
  lock: Pick<CalibrationAcquisitionPublicationLockV1, 'operation' | 'expectedCurrentState' | 'nextIndexSha256' | 'artifactSetSha256' | 'invocationIntentId' | 'recoveryNonce'>,
): string {
  return makeTransactionId(
    lock.operation,
    lock.expectedCurrentState,
    lock.nextIndexSha256,
    lock.artifactSetSha256,
    lock.invocationIntentId,
    lock.recoveryNonce,
  );
}

function makeLock(
  transactionId: string,
  invocationIntentId: string,
  proposal: CalibrationAcquisitionPublicationProposalV1,
  artifactSetSha256: string,
  recoveryNonce: string,
): CalibrationAcquisitionPublicationLockV1 {
  const base: Omit<CalibrationAcquisitionPublicationLockV1, 'lockSha256'> = {
    version: LOCK_VERSION,
    lockId: calibrationAdmissionSha256({ domain: 'v10.3-acquisition-publication-lock-id-v1', transactionId }),
    intendedTransactionId: transactionId,
    invocationIntentId,
    operation: proposal.operation,
    expectedCurrentState: proposal.expectedCurrentState,
    nextIndexSha256: proposal.nextIndex.indexSha256,
    artifactSetSha256,
    recoveryNonce,
  } satisfies Omit<CalibrationAcquisitionPublicationLockV1, 'lockSha256'>;
  return { ...base, lockSha256: calibrationAdmissionSha256(base) };
}

function makeTransaction(
  layout: Layout,
  lock: CalibrationAcquisitionPublicationLockV1,
  proposal: CalibrationAcquisitionPublicationProposalV1,
  transactionId: string,
  invocationIntentId: string,
): CalibrationAcquisitionPublicationTransactionV1 {
  const artifacts: TransactionArtifact[] = proposal.artifacts.map((artifact, index) => ({
    stagedRelativePath: relativePath(layout.root, transactionArtifactStagePath(layout, transactionId, index)),
    finalRelativePath: artifact.finalRelativePath,
    bytes: artifact.bytes,
    sha256: artifact.sha256,
  }));
  const base: Omit<CalibrationAcquisitionPublicationTransactionV1, 'transactionSha256'> = {
    version: TRANSACTION_VERSION,
    transactionId,
    lockSha256: lock.lockSha256,
    invocationIntentId,
    operation: proposal.operation,
    expectedCurrentState: proposal.expectedCurrentState,
    nextIndexSha256: proposal.nextIndex.indexSha256,
    artifacts,
    immutableIndexGenerationRelativePath: expectedIndexRelativePath(layout, proposal.nextIndex.indexSha256),
    nextIndexTemporaryRelativePath: relativePath(layout.root, transactionCurrentIndexTempPath(layout, transactionId)),
    state: { phase: 'intent_fsynced' as const },
  };
  return { ...base, transactionSha256: calibrationAdmissionSha256(base) };
}

function withTransactionState(
  transaction: CalibrationAcquisitionPublicationTransactionV1,
  state: CalibrationAcquisitionPublicationTransactionV1['state'],
): CalibrationAcquisitionPublicationTransactionV1 {
  const base = { ...transaction, state };
  return { ...base, transactionSha256: calibrationAdmissionSha256(transactionWithoutHash(base)) };
}

function validateLock(value: unknown): value is CalibrationAcquisitionPublicationLockV1 {
  if (!isRecord(value) || !exactKeys(value, ['version', 'lockId', 'intendedTransactionId', 'invocationIntentId', 'operation', 'expectedCurrentState', 'nextIndexSha256', 'artifactSetSha256', 'recoveryNonce', 'lockSha256'])) return false;
  if (value.version !== LOCK_VERSION || !isLowerId(value.lockId) || !isLowerId(value.intendedTransactionId) || !isLowerId(value.invocationIntentId) || (value.operation !== 'create' && value.operation !== 'replace') || !validateExpectedCurrentState(value.expectedCurrentState) || !isSha(value.nextIndexSha256) || !isSha(value.artifactSetSha256) || !isSha(value.recoveryNonce) || !isSha(value.lockSha256)) return false;
  return calibrationAdmissionSha256(lockWithoutHash(value as unknown as CalibrationAcquisitionPublicationLockV1)) === value.lockSha256
    && value.lockId === calibrationAdmissionSha256({ domain: 'v10.3-acquisition-publication-lock-id-v1', transactionId: value.intendedTransactionId });
}

function validateTransaction(value: unknown): value is CalibrationAcquisitionPublicationTransactionV1 {
  if (!isRecord(value) || !exactKeys(value, ['version', 'transactionId', 'lockSha256', 'invocationIntentId', 'operation', 'expectedCurrentState', 'nextIndexSha256', 'artifacts', 'immutableIndexGenerationRelativePath', 'nextIndexTemporaryRelativePath', 'state', 'transactionSha256'])) return false;
  if (value.version !== TRANSACTION_VERSION || !isLowerId(value.transactionId) || !isSha(value.lockSha256) || !isLowerId(value.invocationIntentId) || (value.operation !== 'create' && value.operation !== 'replace') || !validateExpectedCurrentState(value.expectedCurrentState) || !isSha(value.nextIndexSha256) || !Array.isArray(value.artifacts) || !isRelativePath(value.immutableIndexGenerationRelativePath) || !isRelativePath(value.nextIndexTemporaryRelativePath) || !isSha(value.transactionSha256)) return false;
  if (!value.artifacts.every((artifact) => isRecord(artifact) && exactKeys(artifact, ['stagedRelativePath', 'finalRelativePath', 'bytes', 'sha256']) && isRelativePath(artifact.stagedRelativePath) && isRelativePath(artifact.finalRelativePath) && isSafeBytes(artifact.bytes) && isSha(artifact.sha256))) return false;
  if (!isRecord(value.state) || typeof value.state.phase !== 'string') return false;
  const phase = value.state.phase;
  const phases = new Set(['intent_fsynced', 'artifacts_staged_fsynced', 'artifacts_promoted', 'index_generation_fsynced', 'next_index_temporary_fsynced', 'index_promoted', 'output_directories_fsynced', 'publication_tool_receipt_indexed', 'complete']);
  if (!phases.has(phase)) return false;
  if (phase === 'publication_tool_receipt_indexed' || phase === 'complete') {
    if (!exactKeys(value.state, ['phase', 'publicationToolReceiptId', 'publicationToolReceiptSha256', 'toolAuthorityIndexSha256'])
      || !isLowerId(value.state.publicationToolReceiptId)
      || !isSha(value.state.publicationToolReceiptSha256)
      || !isSha(value.state.toolAuthorityIndexSha256)) return false;
  } else if (!exactKeys(value.state, ['phase'])) {
    return false;
  }
  try { return calibrationAdmissionSha256(transactionWithoutHash(value as unknown as CalibrationAcquisitionPublicationTransactionV1)) === value.transactionSha256; } catch { return false; }
}

async function loadProposal(root: string, proposal: unknown, proposalPath?: string): Promise<ValidatedProposal> {
  assertCalibrationAcquisitionPublicationProposalV1(proposal);
  const canonical = Buffer.from(deepCanonical(proposal), 'utf8');
  const proposalSha256 = (proposal as CalibrationAcquisitionPublicationProposalV1).proposalSha256;
  if (createHash('sha256').update(canonical).digest('hex') === '') throw new Error('unreachable');
  if (proposalPath !== undefined) {
    const absolute = resolve(root, proposalPath);
    const canonicalPath = await realpath(absolute).catch(() => absolute);
    if (!isInside(root, canonicalPath)) throw new Error('Publication proposal path escapes root');
    await regularContainedFile(root, absolute);
    const bytes = await readFile(absolute);
    let parsed: unknown;
    try { parsed = JSON.parse(bytes.toString('utf8')) as unknown; } catch { throw new Error('Publication proposal is not valid JSON'); }
    if (!isCalibrationAcquisitionPublicationProposalV1(parsed) || (parsed as CalibrationAcquisitionPublicationProposalV1).proposalSha256 !== proposalSha256) throw new Error('Publication proposal object does not match proposal bytes');
    if (!Buffer.from(deepCanonical(parsed), 'utf8').equals(bytes)) throw new Error('Publication proposal bytes are not canonical');
  }
  return { proposal: proposal as CalibrationAcquisitionPublicationProposalV1, proposalBytes: canonical, proposalSha256, artifacts: proposal.artifacts };
}

async function verifyAndReadArtifacts(layout: Layout, validated: ValidatedProposal): Promise<readonly Buffer[]> {
  const bytes: Buffer[] = [];
  for (const artifact of validated.artifacts) {
    const source = resolve(layout.root, artifact.sourceRelativePath);
    if (!isInside(layout.root, source)) throw new Error(`Artifact source path escapes root: ${artifact.sourceRelativePath}`);
    // The publication tree is metadata-only.  Do not allow a proposal to
    // write its lock, transaction, current index, or an arbitrary outside
    // tree through the final path fields.
    const publicationPrefix = `${relative(layout.root, layout.publicationRoot).split(sep).join('/')}/`;
    if (!artifact.finalRelativePath.startsWith(publicationPrefix)) throw new Error(`Artifact final path is outside acquisitions metadata: ${artifact.finalRelativePath}`);
    const generationsPrefix = `${relative(layout.root, layout.generationsRoot).split(sep).join('/')}/`;
    if (artifact.finalRelativePath.endsWith('/index.json')
      || artifact.finalRelativePath === ACQUISITIONS_LOCK_RELATIVE_PATH
      || artifact.finalRelativePath.includes('/transactions/')
      || artifact.finalRelativePath.startsWith(generationsPrefix)) {
      throw new Error(`Artifact final path collides with publication state: ${artifact.finalRelativePath}`);
    }
    await ensureNoUnexpectedFinal(layout, artifact);
    await regularContainedFile(layout.root, source);
    const actual = await hashFile(source);
    if (actual.bytes.byteLength !== artifact.bytes) throw new Error(`Artifact byte count mismatch: ${artifact.sourceRelativePath}`);
    if (actual.sha256 !== artifact.sha256) throw new Error(`Artifact SHA-256 mismatch: ${artifact.sourceRelativePath}`);
    bytes.push(actual.bytes);
  }
  // A bundle can only snapshot an already immutable *strict ancestor*
  // generation. Validate the complete parent chain before any output is
  // staged; an arbitrary self-hashed or descendant pointer is not authority.
  for (let index = 0; index < validated.artifacts.length; index += 1) {
    const artifact = validated.artifacts[index]!;
    if (artifact.kind !== 'evidence_bundle') continue;
    let parsed: unknown;
    try { parsed = JSON.parse(bytes[index]!.toString('utf8')) as unknown; } catch { throw new Error('Evidence bundle artifact is not valid JSON'); }
    if (!isCalibrationAdmissionEvidenceBundleV1(parsed)) throw new Error('Evidence bundle artifact failed Core validation');
    if (!Buffer.from(deepCanonical(parsed), 'utf8').equals(bytes[index]!)) throw new Error('Evidence bundle artifact is not canonical');
    const snapshot = isRecord(parsed.acquisitionAuthoritySnapshot) ? parsed.acquisitionAuthoritySnapshot : undefined;
    const snapshotHash = snapshot?.indexGenerationSha256;
    if (snapshotHash !== undefined && !isSha(snapshotHash)) throw new Error('Evidence bundle acquisition snapshot hash is invalid');
    if (validated.proposal.nextIndex.generation === 0) {
      if (snapshotHash !== undefined) throw new Error('Generation-zero evidence bundle cannot snapshot an acquisition generation');
      continue;
    }
    if (snapshotHash === undefined) throw new Error('Evidence bundle is missing its acquisition ancestor snapshot');
    let cursorHash = validated.proposal.nextIndex.parentIndexSha256;
    let expectedGeneration = validated.proposal.nextIndex.generation - 1;
    let found = false;
    const seen = new Set<string>();
    while (cursorHash !== undefined) {
      if (seen.has(cursorHash)) throw new Error('Evidence bundle acquisition ancestor chain contains a cycle');
      seen.add(cursorHash);
      const generationPath = expectedIndexPath(layout, cursorHash);
      await regularContainedFile(layout.root, generationPath);
      const generationBytes = await readFile(generationPath);
      let generationValue: unknown;
      try { generationValue = JSON.parse(generationBytes.toString('utf8')) as unknown; } catch { throw new Error('Evidence bundle acquisition ancestor generation is invalid'); }
      assertCalibrationAdmissionAcquisitionIndexV1(generationValue);
      const generation = generationValue as CalibrationAdmissionAcquisitionIndexV1;
      if (!Buffer.from(deepCanonical(generation), 'utf8').equals(generationBytes)
        || generation.indexSha256 !== cursorHash
        || generation.generation !== expectedGeneration) {
        throw new Error('Evidence bundle acquisition ancestor generation is not contiguous');
      }
      if (cursorHash === snapshotHash) found = true;
      if (generation.generation === 0) {
        if (generation.parentIndexSha256 !== undefined) throw new Error('Evidence bundle acquisition ancestor bootstrap has a parent');
        break;
      }
      cursorHash = generation.parentIndexSha256;
      expectedGeneration -= 1;
    }
    if (!found) throw new Error('Evidence bundle acquisition snapshot is not a strict ancestor generation');
  }
  return bytes;
}

async function readCurrentIndex(layout: Layout): Promise<{ readonly exists: boolean; readonly bytes?: Buffer; readonly value?: CalibrationAdmissionAcquisitionIndexV1; readonly sha256?: string }> {
  try {
    await regularContainedFile(layout.root, layout.indexPath);
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return { exists: false };
    throw error;
  }
  const bytes = await readFile(layout.indexPath);
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')) as unknown; } catch { throw new Error('Current acquisition index is not valid JSON'); }
  assertCalibrationAdmissionAcquisitionIndexV1(value);
  const sha256 = (value as CalibrationAdmissionAcquisitionIndexV1).indexSha256;
  if (!Buffer.from(deepCanonical(value), 'utf8').equals(bytes)) throw new Error('Current acquisition index is not canonical');
  const seen = new Set<string>();
  let cursor = value as CalibrationAdmissionAcquisitionIndexV1;
  while (true) {
    if (seen.has(cursor.indexSha256)) throw new Error('Acquisition index generation parent cycle detected');
    seen.add(cursor.indexSha256);
    const generationPath = expectedIndexPath(layout, cursor.indexSha256);
    await regularContainedFile(layout.root, generationPath);
    const generationBytes = await readFile(generationPath);
    let generationValue: unknown;
    try { generationValue = JSON.parse(generationBytes.toString('utf8')) as unknown; } catch { throw new Error('Immutable acquisition index generation is invalid'); }
    assertCalibrationAdmissionAcquisitionIndexV1(generationValue);
    if (!Buffer.from(deepCanonical(generationValue), 'utf8').equals(generationBytes)
      || (generationValue as CalibrationAdmissionAcquisitionIndexV1).indexSha256 !== cursor.indexSha256) {
      throw new Error('Current acquisition index is not anchored to its immutable generation');
    }
    if (cursor.generation === 0) {
      if (cursor.parentIndexSha256 !== undefined) throw new Error('Acquisition bootstrap generation has a parent');
      break;
    }
    if (cursor.parentIndexSha256 === undefined) throw new Error('Acquisition index generation parent is missing');
    const parentPath = expectedIndexPath(layout, cursor.parentIndexSha256);
    await regularContainedFile(layout.root, parentPath);
    const parentBytes = await readFile(parentPath);
    let parentValue: unknown;
    try { parentValue = JSON.parse(parentBytes.toString('utf8')) as unknown; } catch { throw new Error('Acquisition parent index generation is invalid'); }
    assertCalibrationAdmissionAcquisitionIndexV1(parentValue);
    if (!Buffer.from(deepCanonical(parentValue), 'utf8').equals(parentBytes)
      || (parentValue as CalibrationAdmissionAcquisitionIndexV1).indexSha256 !== cursor.parentIndexSha256
      || cursor.generation !== (parentValue as CalibrationAdmissionAcquisitionIndexV1).generation + 1) {
      throw new Error('Acquisition index generation chain is not contiguous');
    }
    cursor = parentValue as CalibrationAdmissionAcquisitionIndexV1;
  }
  return { exists: true, bytes, value: value as CalibrationAdmissionAcquisitionIndexV1, sha256 };
}

/**
 * A missing current pointer is only a valid genesis state when the complete
 * acquisition publication tree is empty.  Once immutable generations,
 * transaction journals, or promoted artifact paths exist, recreating
 * generation zero would silently rewind the authority history.
 */
async function assertAcquisitionGenesisTreeEmpty(
  layout: Layout,
  allowedTransactionId?: string,
  allowedNextIndex?: CalibrationAdmissionAcquisitionIndexV1,
): Promise<void> {
  const [generationEntries, transactionEntries, acquisitionEntries] = await Promise.all([
    readdir(layout.generationsRoot),
    readdir(layout.transactionsRoot),
    readdir(layout.publicationRoot),
  ]);
  const unexpectedAcquisitionEntries = acquisitionEntries.filter((entry) => !['index-generations', 'transactions', 'index.json'].includes(entry));
  const allowedSidecar = allowedTransactionId === undefined ? undefined : `${allowedTransactionId}.proposal.json`;
  const allowedStage = allowedTransactionId === undefined ? undefined : allowedTransactionId;
  const unexpectedTransactions = transactionEntries.filter((entry) => entry !== allowedSidecar && entry !== allowedStage);
  const allowedGeneration = allowedNextIndex === undefined ? undefined : `${allowedNextIndex.indexSha256}.json`;
  const unexpectedGenerations = generationEntries.filter((entry) => entry !== allowedGeneration);
  if (unexpectedGenerations.length > 0 || unexpectedTransactions.length > 0 || unexpectedAcquisitionEntries.length > 0) {
    throw new Error('Acquisition current index is absent but publication history exists');
  }
  if (allowedNextIndex !== undefined && generationEntries.includes(allowedGeneration!)) {
    const generationPath = expectedIndexPath(layout, allowedNextIndex.indexSha256);
    await regularContainedFile(layout.root, generationPath);
    const bytes = await readFile(generationPath);
    if (!bytes.equals(Buffer.from(deepCanonical(allowedNextIndex), 'utf8'))) {
      throw new Error('Acquisition staged index generation does not match the locked proposal');
    }
  }
  if (allowedTransactionId !== undefined) return;
  for (const path of [layout.lockPath, transactionPath(layout, '0'.repeat(64))]) {
    try {
      await lstat(path);
      throw new Error('Acquisition current index is absent but a publication transaction is present');
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') throw error;
    }
  }
}

async function checkExpectedCurrent(layout: Layout, expected: ExpectedCurrentState): Promise<CalibrationAdmissionAcquisitionIndexV1 | undefined> {
  const current = await readCurrentIndex(layout);
  if (expected.kind === 'absent') {
    if (current.exists) throw new Error('Expected acquisition current index to be absent');
    await assertAcquisitionGenesisTreeEmpty(layout);
  } else if (!current.exists || current.sha256 !== expected.indexSha256) {
    throw new Error('Expected acquisition current index hash is stale');
  }
  return current.value;
}

function currentIndexMatchesExpected(current: { readonly exists: boolean; readonly sha256?: string }, expected: ExpectedCurrentState): boolean {
  return expected.kind === 'absent' ? !current.exists : current.exists && current.sha256 === expected.indexSha256;
}

async function ensureNoUnexpectedFinal(layout: Layout, artifact: ProposalArtifact): Promise<void> {
  const final = resolve(layout.root, artifact.finalRelativePath);
  if (!isInside(layout.root, final)) throw new Error(`Artifact final path escapes root: ${artifact.finalRelativePath}`);
  try {
    const metadata = await lstat(final);
    if (metadata.isSymbolicLink()) throw new Error(`Artifact final path is a symlink: ${artifact.finalRelativePath}`);
    throw new Error(`Artifact final path already exists: ${artifact.finalRelativePath}`);
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
  }
}

async function stageArtifacts(context: PublicationContext, sourceBytes: readonly Buffer[]): Promise<void> {
  const stageRoot = transactionStageRoot(context.layout, context.transactionId);
  await ensureDirectory(context.layout.root, stageRoot);
  for (let index = 0; index < context.validated.artifacts.length; index += 1) {
    const artifact = context.validated.artifacts[index]!;
    const stage = transactionArtifactStagePath(context.layout, context.transactionId, index);
    try {
      await writeWx(stage, sourceBytes[index]!);
      await invokeHook(context.phaseHook, 'artifact-staged');
      await invokeHook(context.phaseHook, 'artifact-staged-fsynced');
    } catch (error) {
      if ((error as { code?: string }).code !== 'EEXIST') throw error;
      await regularContainedFile(context.layout.root, stage);
      const existing = await readFile(stage);
      if (existing.byteLength !== artifact.bytes || createHash('sha256').update(existing).digest('hex') !== artifact.sha256) throw new Error('Transaction stage collision');
    }
  }
  await syncDirectory(stageRoot);
  await updateTransaction(context, 'artifacts_staged_fsynced');
  await invokeHook(context.phaseHook, 'artifacts-staged-fsynced');
}

async function promoteArtifacts(context: PublicationContext): Promise<void> {
  // Re-check the compare-and-swap parent after the fixed lock/journal
  // boundary and immediately before any final artifact link.  A stale writer
  // must not leave promoted evidence behind while discovering the conflict
  // only at current-index rename.
  const current = await readCurrentIndex(context.layout);
  if (!currentIndexMatchesExpected(current, context.validated.proposal.expectedCurrentState)
    && current.sha256 !== context.validated.proposal.nextIndex.indexSha256) {
    throw new Error('Acquisition current index changed before artifact promotion (stale CAS)');
  }
  for (let index = 0; index < context.transaction.artifacts.length; index += 1) {
    const beforeArtifact = await readCurrentIndex(context.layout);
    if (!currentIndexMatchesExpected(beforeArtifact, context.validated.proposal.expectedCurrentState)
      && beforeArtifact.sha256 !== context.validated.proposal.nextIndex.indexSha256) {
      throw new Error('Acquisition current index changed during artifact promotion (stale CAS)');
    }
    const txArtifact = context.transaction.artifacts[index]!;
    const final = resolve(context.layout.root, txArtifact.finalRelativePath);
    const stage = resolve(context.layout.root, txArtifact.stagedRelativePath);
    if (!isInside(context.layout.root, final) || !isInside(context.layout.root, stage)) throw new Error('Transaction artifact path escapes root');
    await regularContainedFile(context.layout.root, stage);
    const staged = await hashFile(stage);
    if (staged.bytes.byteLength !== txArtifact.bytes || staged.sha256 !== txArtifact.sha256) throw new Error(`Transaction stage bytes mismatch: ${txArtifact.stagedRelativePath}`);
    await ensureDirectory(context.layout.root, dirname(final));
    try {
      await link(stage, final);
      await invokeHook(context.phaseHook, 'artifact-promoted');
    } catch (error) {
      if ((error as { code?: string }).code !== 'EEXIST') throw error;
      await regularContainedFile(context.layout.root, final);
      const existing = await hashFile(final);
      if (existing.bytes.byteLength !== txArtifact.bytes || existing.sha256 !== txArtifact.sha256) throw new Error(`Artifact destination collision: ${txArtifact.finalRelativePath}`);
    }
    await syncDirectory(dirname(final));
  }
  await updateTransaction(context, 'artifacts_promoted');
  await invokeHook(context.phaseHook, 'artifacts-promoted');
}

async function promoteIndexGeneration(context: PublicationContext): Promise<void> {
  const generationPath = expectedIndexPath(context.layout, context.validated.proposal.nextIndex.indexSha256);
  const generationStage = transactionIndexStagePath(context.layout, context.transactionId);
  const bytes = Buffer.from(deepCanonical(context.validated.proposal.nextIndex), 'utf8');
  await ensureDirectory(context.layout.root, dirname(generationPath));
  try {
    await writeWx(generationStage, bytes);
  } catch (error) {
    if ((error as { code?: string }).code !== 'EEXIST') throw error;
    await regularContainedFile(context.layout.root, generationStage);
    const existing = await readFile(generationStage);
    if (!existing.equals(bytes)) throw new Error('Index generation stage collision');
  }
  await syncFile(generationStage);
  try {
    await link(generationStage, generationPath);
  } catch (error) {
    if ((error as { code?: string }).code !== 'EEXIST') throw error;
    await regularContainedFile(context.layout.root, generationPath);
    const existing = await readFile(generationPath);
    if (!existing.equals(bytes)) throw new Error('Immutable acquisition index generation collision');
  }
  await syncDirectory(dirname(generationPath));
  await updateTransaction(context, 'index_generation_fsynced');
  await invokeHook(context.phaseHook, 'index-generation-fsynced');
}

async function stageCurrentIndex(context: PublicationContext): Promise<void> {
  const bytes = Buffer.from(deepCanonical(context.validated.proposal.nextIndex), 'utf8');
  const temporary = transactionCurrentIndexTempPath(context.layout, context.transactionId);
  try {
    await writeWx(temporary, bytes);
  } catch (error) {
    if ((error as { code?: string }).code !== 'EEXIST') throw error;
    await regularContainedFile(context.layout.root, temporary);
    const existing = await readFile(temporary);
    if (!existing.equals(bytes)) throw new Error('Current index temporary collision');
  }
  await syncFile(temporary);
  await updateTransaction(context, 'next_index_temporary_fsynced');
  await invokeHook(context.phaseHook, 'next-index-temporary-fsynced');
}

async function promoteCurrentIndex(context: PublicationContext): Promise<void> {
  const temporary = transactionCurrentIndexTempPath(context.layout, context.transactionId);
  const current = await readCurrentIndex(context.layout);
  if (!currentIndexMatchesExpected(current, context.validated.proposal.expectedCurrentState)) {
    // If the next index is already current, this is an idempotent recovery;
    // otherwise a writer won the CAS and this transaction must stay visible.
    if (current.sha256 === context.validated.proposal.nextIndex.indexSha256) {
      await updateTransaction(context, 'index_promoted');
      await invokeHook(context.phaseHook, 'index-promoted');
      return;
    }
    throw new Error('Acquisition current index changed during publication (stale CAS)');
  }
  if (context.validated.proposal.expectedCurrentState.kind === 'absent') {
    try {
      await link(temporary, context.layout.indexPath);
    } catch (error) {
      if ((error as { code?: string }).code !== 'EEXIST') throw error;
      const raced = await readCurrentIndex(context.layout);
      if (raced.sha256 !== context.validated.proposal.nextIndex.indexSha256) throw new Error('Acquisition current index create collision');
    }
  } else {
    // The lock serializes writers; hash-check immediately before the atomic
    // rename gives replace mode its compare-and-swap boundary.
    await rename(temporary, context.layout.indexPath);
  }
  await syncDirectory(context.layout.publicationRoot);
  await updateTransaction(context, 'index_promoted');
  await invokeHook(context.phaseHook, 'index-promoted');
}

async function syncOutputDirectories(context: PublicationContext): Promise<void> {
  const directories = new Set<string>([
    context.layout.admissionRoot,
    context.layout.publicationRoot,
    context.layout.generationsRoot,
    context.layout.transactionsRoot,
    transactionStageRoot(context.layout, context.transactionId),
    ...context.transaction.artifacts.map((artifact) => dirname(resolve(context.layout.root, artifact.finalRelativePath))),
  ]);
  for (const directory of directories) await syncDirectory(directory);
  await updateTransaction(context, 'output_directories_fsynced');
  await invokeHook(context.phaseHook, 'output-directories-fsynced');
}

async function updateTransaction(context: PublicationContext, phase: Exclude<CalibrationAcquisitionPublicationTransactionV1['state']['phase'], 'publication_tool_receipt_indexed' | 'complete'>): Promise<void> {
  const next = withTransactionState(context.transaction, { phase });
  // The context object is immutable by type, but recovery needs the newest
  // journal.  Replace the field through a narrowly scoped runtime update.
  (context as { transaction: CalibrationAcquisitionPublicationTransactionV1 }).transaction = next;
  await writeReplace(context.transactionPath, Buffer.from(deepCanonical(next), 'utf8'), context.transactionId);
  await invokeHook(context.phaseHook, phase.replaceAll('_', '-') as AcquisitionPublicationPhase);
}

async function updateTransactionWithReceipt(context: PublicationContext, result: AcquisitionPublicationReceiptResult): Promise<void> {
  const next = withTransactionState(context.transaction, {
    phase: 'publication_tool_receipt_indexed',
    publicationToolReceiptId: result.receiptId,
    publicationToolReceiptSha256: result.receiptSha256,
    toolAuthorityIndexSha256: result.toolAuthorityIndexSha256,
  });
  (context as { transaction: CalibrationAcquisitionPublicationTransactionV1 }).transaction = next;
  await writeReplace(context.transactionPath, Buffer.from(deepCanonical(next), 'utf8'), context.transactionId);
  await invokeHook(context.phaseHook, 'publication-tool-receipt-indexed');
}

async function cleanupTransaction(context: PublicationContext): Promise<void> {
  const current = context.transaction;
  if (current.state.phase !== 'complete') {
    if (current.state.phase !== 'publication_tool_receipt_indexed') throw new Error('Cannot clean a publication before its tool-authority receipt is indexed');
    const next = withTransactionState(current, {
      phase: 'complete',
      publicationToolReceiptId: current.state.publicationToolReceiptId,
      publicationToolReceiptSha256: current.state.publicationToolReceiptSha256,
      toolAuthorityIndexSha256: current.state.toolAuthorityIndexSha256,
    });
    (context as { transaction: CalibrationAcquisitionPublicationTransactionV1 }).transaction = next;
    await writeReplace(context.transactionPath, Buffer.from(deepCanonical(next), 'utf8'), context.transactionId);
    await invokeHook(context.phaseHook, 'complete');
  }
  // Remove transaction-owned staging first. Validate and remove the proposal
  // sidecar before releasing the fixed lock; a substituted sidecar must leave
  // the lock visible rather than allowing cleanup to finish with an orphaned
  // intent. A crash after sidecar removal is fail-closed (the lock remains).
  for (let index = 0; index < context.transaction.artifacts.length; index += 1) {
    const artifact = context.transaction.artifacts[index]!;
    await removeAcquisitionOwnedPath(context.layout.root, transactionArtifactStagePath(context.layout, context.transactionId, index), undefined, artifact.sha256);
  }
  const nextIndexBytes = Buffer.from(deepCanonical(context.validated.proposal.nextIndex), 'utf8');
  const nextIndexSha256 = createHash('sha256').update(nextIndexBytes).digest('hex');
  await removeAcquisitionOwnedPath(context.layout.root, transactionIndexStagePath(context.layout, context.transactionId), nextIndexBytes, nextIndexSha256);
  await removeAcquisitionOwnedPath(context.layout.root, transactionCurrentIndexTempPath(context.layout, context.transactionId), nextIndexBytes, nextIndexSha256);
  try { await rmdir(transactionStageRoot(context.layout, context.transactionId)); } catch (error) { if ((error as { code?: string }).code !== 'ENOENT') throw error; }
  await syncDirectory(context.layout.transactionsRoot);
  await removeAcquisitionOwnedPath(context.layout.root, context.transactionPath, Buffer.from(deepCanonical(context.transaction), 'utf8'));
  await syncDirectory(context.layout.admissionRoot);
  await removeAcquisitionOwnedPath(context.layout.root, context.proposalSidecarPath, context.proposalSidecarBytes);
  await syncDirectory(context.layout.transactionsRoot);
  await removeAcquisitionOwnedPath(context.layout.root, context.lockPath, Buffer.from(deepCanonical(context.lock), 'utf8'));
  await syncDirectory(context.layout.admissionRoot);
  await invokeHook(context.phaseHook, 'cleanup');
}

async function unavailableResult(context: PublicationContext, reason: string): Promise<AcquisitionPublicationResult> {
  return {
    complete: false,
    promoted: context.transaction.state.phase === 'index_promoted' || context.transaction.state.phase === 'output_directories_fsynced',
    recoveryRequired: true,
    transactionId: context.transactionId,
    nextIndexSha256: context.validated.proposal.nextIndex.indexSha256,
    currentIndexSha256: context.transaction.state.phase === 'index_promoted' || context.transaction.state.phase === 'output_directories_fsynced' ? context.validated.proposal.nextIndex.indexSha256 : undefined,
    transactionPath: context.transactionPath,
    lockPath: context.lockPath,
    reason,
  };
}

async function resolveAuthorityPublisher(context: PublicationContext): Promise<AcquisitionPublicationReceiptPublisher | undefined> {
  if (context.publishToolReceipt) return context.publishToolReceipt;
  if (!context.toolAuthorityRoot) return undefined;
  return createLocalToolAuthorityPublisher(context.toolAuthorityRoot);
}

async function ensureAuthorityIntentBeforeOutput(context: PublicationContext): Promise<void> {
  if (!context.toolAuthorityRoot) throw new Error('A tool-authority root is required before acquisition output mutation');
  await publishLocalToolAuthorityIntent(context.toolAuthorityRoot, {
    root: context.layout.root,
    transactionId: context.transactionId,
    invocationIntentId: context.invocationIntentId,
    proposalSha256: context.validated.proposalSha256,
    nextIndexSha256: context.validated.proposal.nextIndex.indexSha256,
    operation: context.validated.proposal.operation,
    toolAuthorityPhaseHook: context.toolAuthorityPhaseHook,
  });
}

/**
 * A receipt publisher is an injectable seam for embedders/tests, but it is not
 * allowed to mint completion by returning three plausible hashes.  Re-open
 * the authority index and the referenced immutable objects before the
 * acquisition transaction can advance to cleanup.
 */
async function validatePublishedToolReceipt(
  context: PublicationContext,
  result: AcquisitionPublicationReceiptResult,
): Promise<void> {
  if (!isLowerId(result.receiptId) || !isSha(result.receiptSha256) || !isSha(result.toolAuthorityIndexSha256)) throw new Error('Tool-authority receipt publisher returned an invalid result');
  if (!context.toolAuthorityRoot) throw new Error('A tool-authority root is required to validate the publication receipt');
  const authorityRoot = await realpath(resolve(context.toolAuthorityRoot));
  // Validate the complete immutable chain instead of trusting only a
  // self-hashed current pointer. This closes the injected-publisher/race
  // window between authority intent and receipt validation.
  const index = await authorityCurrentIndex(authorityRoot);
  if (index.indexSha256 !== result.toolAuthorityIndexSha256) throw new Error('Publication receipt points at a different tool-authority generation');
  const profileRef = index.profiles.find((candidate) => candidate.profileId === PROFILE_ID);
  const intentRef = index.invocationIntents.find((candidate) => candidate.intentId === context.invocationIntentId);
  const receiptRef = index.receipts.find((candidate) => candidate.receiptId === result.receiptId);
  if (!profileRef || !intentRef || !receiptRef) throw new Error('Publication receipt is not indexed with its profile and invocation intent');
  if (receiptRef.sha256 !== result.receiptSha256) throw new Error('Publication receipt bytes do not match the indexed reference');

  const readIndexed = async (relativePath: string, expectedSha256: string): Promise<unknown> => {
    const absolute = resolve(authorityRoot, relativePath);
    if (!isInside(authorityRoot, absolute)) throw new Error('Tool-authority reference escapes its root');
    await regularContainedFile(authorityRoot, absolute);
    const bytes = await readFile(absolute);
    if (createHash('sha256').update(bytes).digest('hex') !== expectedSha256) throw new Error('Tool-authority referenced bytes changed');
    if (!Buffer.from(calibrationAdmissionCanonicalJson(JSON.parse(bytes.toString('utf8'))), 'utf8').equals(bytes)) throw new Error('Tool-authority referenced JSON is not canonical');
    return JSON.parse(bytes.toString('utf8')) as unknown;
  };

  const profile = await readIndexed(profileRef.relativePath, profileRef.sha256);
  if (!isCalibrationAdmissionToolProfileV1(profile) || profile.profileId !== PROFILE_ID) throw new Error('Publication tool profile is invalid');
  const intent = await readIndexed(intentRef.relativePath, intentRef.sha256);
  if (!isCalibrationAdmissionInvocationIntentV1(intent, profile) || intent.intentId !== context.invocationIntentId || intent.profileId !== PROFILE_ID || intent.action !== PUBLICATION_ACTION) throw new Error('Publication invocation intent is invalid or mismatched');
  const receipt = await readIndexed(receiptRef.relativePath, receiptRef.sha256);
  if (!isCalibrationAdmissionToolReceiptV1(receipt, profile, intent) || receipt.receiptId !== result.receiptId || receipt.action !== PUBLICATION_ACTION || receipt.exitCode !== 0 || receipt.outputSetSha256 !== context.validated.proposal.nextIndex.indexSha256) throw new Error('Publication tool receipt is invalid or not bound to the promoted output');
}

function acquisitionArtifactDescriptors(context: PublicationContext): readonly Record<string, unknown>[] {
  return context.validated.artifacts.map((artifact, index) => ({
    stagedRelativePath: relativePath(context.layout.root, transactionArtifactStagePath(context.layout, context.transactionId, index)),
    finalRelativePath: artifact.finalRelativePath,
    bytes: artifact.bytes,
    sha256: artifact.sha256,
  })).sort((left, right) => {
    const a = `${String(left.finalRelativePath)}\u0000${String(left.sha256)}`;
    const b = `${String(right.finalRelativePath)}\u0000${String(right.sha256)}`;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function assertAcquisitionTransactionArtifactBinding(context: PublicationContext): void {
  const actual = context.transaction.artifacts.map((artifact) => ({
    stagedRelativePath: artifact.stagedRelativePath,
    finalRelativePath: artifact.finalRelativePath,
    bytes: artifact.bytes,
    sha256: artifact.sha256,
  })).sort((left, right) => {
    const a = `${left.finalRelativePath}\u0000${left.sha256}`;
    const b = `${right.finalRelativePath}\u0000${right.sha256}`;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  if (deepCanonical(actual) !== deepCanonical(acquisitionArtifactDescriptors(context))) throw new Error('Acquisition transaction artifact set does not match its proposal');
}

async function verifyPromotedAcquisitionOutput(context: PublicationContext): Promise<void> {
  assertAcquisitionTransactionArtifactBinding(context);
  const current = await readCurrentIndex(context.layout);
  if (current.sha256 !== context.validated.proposal.nextIndex.indexSha256 || !current.value) throw new Error('Acquisition recovered current index does not match the requested next generation');
  const indexed = new Map(current.value.artifacts.map((artifact) => [artifactKey(artifact), artifact]));
  for (const artifact of context.validated.artifacts) {
    const final = resolve(context.layout.root, artifact.finalRelativePath);
    await regularContainedFile(context.layout.root, final);
    const bytes = await readFile(final);
    if (bytes.byteLength !== artifact.bytes || createHash('sha256').update(bytes).digest('hex') !== artifact.sha256) throw new Error(`Acquisition recovered artifact bytes changed: ${artifact.finalRelativePath}`);
    const indexedArtifact = indexed.get(`${artifact.kind}\u0000${artifact.objectId}\u0000${artifact.finalRelativePath}`);
    if (!indexedArtifact || indexedArtifact.sha256 !== artifact.sha256) throw new Error(`Acquisition recovered artifact is not indexed: ${artifact.finalRelativePath}`);
  }
}

async function revalidateIndexedAuthorityReceipt(context: PublicationContext): Promise<void> {
  const state = context.transaction.state;
  if (state.phase !== 'publication_tool_receipt_indexed' && state.phase !== 'complete') return;
  await verifyPromotedAcquisitionOutput(context);
  await validatePublishedToolReceipt(context, {
    receiptId: state.publicationToolReceiptId,
    receiptSha256: state.publicationToolReceiptSha256,
    toolAuthorityIndexSha256: state.toolAuthorityIndexSha256,
  });
}

async function runTransaction(context: PublicationContext): Promise<AcquisitionPublicationResult> {
  try {
    // The invocation intent is an authority object, not a post-output receipt.
    // Persist and revalidate it before any acquisition artifact is staged or
    // promoted; recovery repeats this check for every later phase.
    await ensureAuthorityIntentBeforeOutput(context);
    assertAcquisitionTransactionArtifactBinding(context);
    const phase = context.transaction.state.phase;
    if (phase === 'intent_fsynced') {
      const sourceBytes = await verifyAndReadArtifacts(context.layout, context.validated);
      await stageArtifacts(context, sourceBytes);
    }
    if (context.transaction.state.phase === 'artifacts_staged_fsynced') await promoteArtifacts(context);
    if (context.transaction.state.phase === 'artifacts_promoted') await promoteIndexGeneration(context);
    if (context.transaction.state.phase === 'index_generation_fsynced') await stageCurrentIndex(context);
    if (context.transaction.state.phase === 'next_index_temporary_fsynced') await promoteCurrentIndex(context);
    if (context.transaction.state.phase === 'index_promoted') await syncOutputDirectories(context);
    if (context.transaction.state.phase === 'output_directories_fsynced') {
      const publisher = await resolveAuthorityPublisher(context);
      if (!publisher) {
        const pending = await unavailableResult(context, 'Post-output tool-authority receipt publisher is unavailable');
        return pending;
      }
      let receipt: AcquisitionPublicationReceiptResult;
      try {
        receipt = await publisher({
          root: context.layout.root,
          transactionId: context.transactionId,
          invocationIntentId: context.invocationIntentId,
          proposalSha256: context.validated.proposalSha256,
          nextIndexSha256: context.validated.proposal.nextIndex.indexSha256,
          operation: context.validated.proposal.operation,
          toolAuthorityPhaseHook: context.toolAuthorityPhaseHook,
        });
      } catch (error) {
        return unavailableResult(context, error instanceof Error ? error.message : String(error));
      }
      try {
        await validatePublishedToolReceipt(context, receipt);
      } catch (error) {
        return unavailableResult(context, error instanceof Error ? error.message : String(error));
      }
      await updateTransactionWithReceipt(context, receipt);
    }
    if (context.transaction.state.phase === 'publication_tool_receipt_indexed') {
      await revalidateIndexedAuthorityReceipt(context);
      const result = {
        complete: true,
        promoted: true,
        recoveryRequired: false,
        transactionId: context.transactionId,
        nextIndexSha256: context.validated.proposal.nextIndex.indexSha256,
        currentIndexSha256: context.validated.proposal.nextIndex.indexSha256,
        transactionPath: context.transactionPath,
        lockPath: context.lockPath,
        publicationToolReceiptId: context.transaction.state.publicationToolReceiptId,
        publicationToolReceiptSha256: context.transaction.state.publicationToolReceiptSha256,
        toolAuthorityIndexSha256: context.transaction.state.toolAuthorityIndexSha256,
      } satisfies AcquisitionPublicationResult;
      await cleanupTransaction(context);
      return result;
    }
    if (context.transaction.state.phase === 'complete') {
      await revalidateIndexedAuthorityReceipt(context);
      const result = {
        complete: true,
        promoted: true,
        recoveryRequired: false,
        transactionId: context.transactionId,
        nextIndexSha256: context.validated.proposal.nextIndex.indexSha256,
        currentIndexSha256: context.validated.proposal.nextIndex.indexSha256,
        transactionPath: context.transactionPath,
        lockPath: context.lockPath,
        publicationToolReceiptId: context.transaction.state.publicationToolReceiptId,
        publicationToolReceiptSha256: context.transaction.state.publicationToolReceiptSha256,
        toolAuthorityIndexSha256: context.transaction.state.toolAuthorityIndexSha256,
      } satisfies AcquisitionPublicationResult;
      await cleanupTransaction(context);
      return result;
    }
    return unavailableResult(context, 'Publication stopped before post-output authority receipt');
  } catch (error) {
    // A fault hook or an I/O error is intentionally allowed to escape while
    // the lock/journal remain.  Recovery can inspect exact state and resume.
    throw error;
  }
}

async function buildNewContext(request: AcquisitionPublicationRequest): Promise<PublicationContext> {
  const layout = await resolveLayout(request.root, request.publicationRoot);
  const validated = await loadProposal(layout.root, request.proposal, request.proposalPath);
  const expectedCurrent = await checkExpectedCurrent(layout, validated.proposal.expectedCurrentState);
  if (validated.proposal.operation === 'replace'
    && expectedCurrent !== undefined
    && validated.proposal.nextIndex.generation !== expectedCurrent.generation + 1) {
    throw new Error('Acquisition next index generation must advance by exactly one');
  }
  const sourceBytes = await verifyAndReadArtifacts(layout, validated);
  void sourceBytes; // Rehashed again during staging after the lock boundary.
  const invocationIntentId = request.invocationIntentId ?? String(publicationIntent(toolAuthorityProfile(PROFILE_ID), {
    root: layout.root,
    transactionId: 'pending',
    invocationIntentId: '',
    proposalSha256: validated.proposalSha256,
    nextIndexSha256: validated.proposal.nextIndex.indexSha256,
    operation: validated.proposal.operation,
  }).intentId);
  if (!isLowerId(invocationIntentId)) throw new Error('Invocation intent id must be a lowercase SHA-256');
  const recoveryNonce = request.recoveryNonce ?? randomBytes(32).toString('hex');
  if (!isLowerId(recoveryNonce)) throw new Error('Recovery nonce must be a lowercase SHA-256');
  const artifactSetSha256 = acquisitionPublicationArtifactSetSha256(validated.artifacts);
  const transactionId = makeTransactionId(validated.proposal.operation, validated.proposal.expectedCurrentState, validated.proposal.nextIndex.indexSha256, artifactSetSha256, invocationIntentId, recoveryNonce);
  const lock = makeLock(transactionId, invocationIntentId, validated.proposal, artifactSetSha256, recoveryNonce);
  const txPath = transactionPath(layout, transactionId);
  const sidecarPath = transactionProposalSidecarPath(layout, transactionId);
  const sidecarBytes = Buffer.from(deepCanonical(validated.proposal), 'utf8');
  // Persist the exact proposal in a deterministic transaction-owned sidecar
  // before acquiring the fixed lock.  This is what makes --from-lock safe in
  // the crash window where the lock has fsynced but transaction intent has not.
  let sidecarCreated = false;
  try {
    await writeWx(sidecarPath, sidecarBytes);
    sidecarCreated = true;
  } catch (error) {
    if ((error as { code?: string }).code !== 'EEXIST') throw error;
    // A deterministic sidecar may already belong to the writer that won the
    // fixed lock. Re-open and compare its exact bytes; never let a loser
    // delete a winner's proposal or accept a substituted sidecar.
    await regularContainedFile(layout.root, sidecarPath);
    const existing = await readFile(sidecarPath);
    if (!existing.equals(sidecarBytes)) throw new Error('Acquisition proposal sidecar collision');
  }
  await syncDirectory(layout.transactionsRoot);
  let lockCreated = false;
  try {
    await writeWx(layout.lockPath, Buffer.from(deepCanonical(lock), 'utf8'));
    lockCreated = true;
    await invokeHook(request.phaseHook, 'lock-written');
    await syncFile(layout.lockPath);
    await invokeHook(request.phaseHook, 'lock-file-fsynced');
    await syncDirectory(layout.admissionRoot);
    await invokeHook(request.phaseHook, 'lock-directory-fsynced');
  } catch (error) {
    if (!lockCreated) {
      if (sidecarCreated) {
        await regularContainedFile(layout.root, sidecarPath);
        const existing = await readFile(sidecarPath);
        if (!existing.equals(sidecarBytes)) throw new Error('Acquisition proposal sidecar changed during loser cleanup');
        try { await unlink(sidecarPath); } catch (cleanupError) { if ((cleanupError as { code?: string }).code !== 'ENOENT') throw cleanupError; }
      }
      try { await syncDirectory(layout.transactionsRoot); } catch { /* preserve original failure */ }
    }
    throw error;
  }
  const transaction = makeTransaction(layout, lock, validated.proposal, transactionId, invocationIntentId);
  await writeWx(txPath, Buffer.from(deepCanonical(transaction), 'utf8'));
  await invokeHook(request.phaseHook, 'intent-written');
  await syncFile(txPath);
  await invokeHook(request.phaseHook, 'intent-fsynced');
  await syncDirectory(layout.admissionRoot);
  return {
    layout,
    validated,
    invocationIntentId,
    recoveryNonce,
    transactionId,
    lock,
    lockPath: layout.lockPath,
    transactionPath: txPath,
    proposalSidecarPath: sidecarPath,
    transaction,
    proposalSidecarBytes: sidecarBytes,
    publishToolReceipt: request.publishToolReceipt,
    toolAuthorityRoot: request.toolAuthorityRoot ? resolve(request.toolAuthorityRoot) : join(layout.root, 'review', 'admission', 'tool-authority'),
    phaseHook: request.phaseHook,
    toolAuthorityPhaseHook: request.toolAuthorityPhaseHook,
  };
}

/** Publish a schema-valid offline acquisition proposal. */
export async function publishAcquisitionPublication(request: AcquisitionPublicationRequest): Promise<AcquisitionPublicationResult> {
  const context = await buildNewContext(request);
  return runTransaction(context);
}

export const publishAcquisition = publishAcquisitionPublication;
export const acquisitionPublish = publishAcquisitionPublication;

async function readLock(layout: Layout): Promise<CalibrationAcquisitionPublicationLockV1> {
  await regularContainedFile(layout.root, layout.lockPath);
  const parsed = await readJsonFile(layout.lockPath);
  if (!validateLock(parsed)) throw new Error('Acquisition publication lock is invalid');
  return parsed;
}

async function readProposalSidecar(layout: Layout, transactionId: string): Promise<ValidatedProposal> {
  const sidecar = transactionProposalSidecarPath(layout, transactionId);
  await regularContainedFile(layout.root, sidecar);
  const bytes = await readFile(sidecar);
  let parsed: unknown;
  try { parsed = JSON.parse(bytes.toString('utf8')) as unknown; } catch { throw new Error('Acquisition proposal sidecar is invalid JSON'); }
  if (!isCalibrationAcquisitionPublicationProposalV1(parsed)) throw new Error('Acquisition proposal sidecar is not schema-valid');
  const canonical = Buffer.from(deepCanonical(parsed), 'utf8');
  if (!canonical.equals(bytes)) throw new Error('Acquisition proposal sidecar is not canonical');
  return { proposal: parsed, proposalBytes: bytes, proposalSha256: parsed.proposalSha256, artifacts: parsed.artifacts };
}

async function readTransactionFile(layout: Layout, id: string): Promise<CalibrationAcquisitionPublicationTransactionV1> {
  const path = transactionPath(layout, id);
  await regularContainedFile(layout.root, path);
  const parsed = await readJsonFile(path);
  if (!validateTransaction(parsed)) throw new Error('Acquisition publication transaction is invalid');
  if (parsed.transactionId !== id) throw new Error('Acquisition publication transaction id mismatch');
  return parsed;
}

async function recoverContext(request: AcquisitionPublicationRecoveryRequest): Promise<PublicationContext> {
  if (!request.acknowledgeNoLiveWriter) throw new Error('Recovery requires --acknowledge-no-live-writer');
  if (!isLowerId(request.recoveryNonce)) throw new Error('Recovery nonce must be a lowercase SHA-256');
  const layout = await resolveLayout(request.root, request.publicationRoot);
  const lock = await readLock(layout);
  const transactionId = request.fromLock ? lock.intendedTransactionId : request.transactionId;
  if (!transactionId || !isLowerId(transactionId)) throw new Error('Recovery requires a transaction id or --from-lock');
  if (transactionId !== lock.intendedTransactionId) throw new Error('Recovery transaction does not match lock intended transaction');
  if (lock.recoveryNonce !== request.recoveryNonce) throw new Error('Recovery nonce does not match lock');
  if (request.invocationIntentId !== undefined && request.invocationIntentId !== lock.invocationIntentId) throw new Error('Recovery invocation intent does not match lock');
  const recomputedTransactionId = expectedAcquisitionTransactionId(lock);
  if (recomputedTransactionId !== lock.intendedTransactionId) throw new Error('Publication lock intended transaction id is not derived from its immutable intent');
  const validated = await readProposalSidecar(layout, transactionId);
  if (validated.proposal.operation !== lock.operation || validated.proposal.nextIndex.indexSha256 !== lock.nextIndexSha256 || JSON.stringify(validated.proposal.expectedCurrentState) !== JSON.stringify(lock.expectedCurrentState) || acquisitionPublicationArtifactSetSha256(validated.artifacts) !== lock.artifactSetSha256) throw new Error('Publication lock does not match its proposal sidecar');
  const currentForGeneration = await readCurrentIndex(layout);
  if (validated.proposal.expectedCurrentState.kind === 'absent' && !currentForGeneration.exists) {
    await assertAcquisitionGenesisTreeEmpty(layout, transactionId, validated.proposal.nextIndex);
  }
  if (validated.proposal.operation === 'replace'
    && currentForGeneration.sha256 !== validated.proposal.nextIndex.indexSha256
    && currentForGeneration.value !== undefined
    && validated.proposal.expectedCurrentState.kind === 'existing'
    && currentForGeneration.sha256 === validated.proposal.expectedCurrentState.indexSha256
    && validated.proposal.nextIndex.generation !== currentForGeneration.value.generation + 1) {
    throw new Error('Acquisition next index generation must advance by exactly one');
  }
  const txPath = transactionPath(layout, transactionId);
  let transaction: CalibrationAcquisitionPublicationTransactionV1;
  try {
    transaction = await readTransactionFile(layout, transactionId);
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
    // If cleanup crashed after removing the fixed transaction, the sidecar
    // and lock still provide the exact proposal. Prefer a promoted-output
    // proof so recovery does not try to recreate already-existing files.
    transaction = makeTransaction(layout, lock, validated.proposal, transactionId, lock.invocationIntentId);
    const current = await readCurrentIndex(layout);
    let promoted = current.sha256 === validated.proposal.nextIndex.indexSha256;
    if (promoted) {
      try {
        for (const artifact of validated.artifacts) {
          const final = resolve(layout.root, artifact.finalRelativePath);
          await regularContainedFile(layout.root, final);
          const actual = await hashFile(final);
          if (actual.bytes.byteLength !== artifact.bytes || actual.sha256 !== artifact.sha256) { promoted = false; break; }
        }
        const generation = expectedIndexPath(layout, validated.proposal.nextIndex.indexSha256);
        await regularContainedFile(layout.root, generation);
      } catch { promoted = false; }
    }
    if (promoted) transaction = withTransactionState(transaction, { phase: 'output_directories_fsynced' });
    await writeWx(txPath, Buffer.from(deepCanonical(transaction), 'utf8'));
    await syncFile(txPath);
    await syncDirectory(layout.admissionRoot);
    await invokeHook(request.phaseHook, 'intent-fsynced');
  }
  if (transaction.lockSha256 !== lock.lockSha256
    || transaction.invocationIntentId !== lock.invocationIntentId
    || transaction.operation !== lock.operation
    || transaction.nextIndexSha256 !== lock.nextIndexSha256
    || deepCanonical(transaction.expectedCurrentState) !== deepCanonical(lock.expectedCurrentState)) {
    throw new Error('Publication transaction does not match lock intent');
  }
  const expectedTransactionArtifacts = validated.artifacts.map((artifact, index) => ({
    stagedRelativePath: relativePath(layout.root, transactionArtifactStagePath(layout, transactionId, index)),
    finalRelativePath: artifact.finalRelativePath,
    bytes: artifact.bytes,
    sha256: artifact.sha256,
  })).sort((left, right) => `${left.finalRelativePath}\u0000${left.sha256}`.localeCompare(`${right.finalRelativePath}\u0000${right.sha256}`));
  const actualTransactionArtifacts = transaction.artifacts.map((artifact) => ({
    stagedRelativePath: artifact.stagedRelativePath,
    finalRelativePath: artifact.finalRelativePath,
    bytes: artifact.bytes,
    sha256: artifact.sha256,
  })).sort((left, right) => `${left.finalRelativePath}\u0000${left.sha256}`.localeCompare(`${right.finalRelativePath}\u0000${right.sha256}`));
  if (deepCanonical(expectedTransactionArtifacts) !== deepCanonical(actualTransactionArtifacts)) throw new Error('Publication transaction artifact set does not match its proposal sidecar');
  return {
    layout,
    validated,
    invocationIntentId: lock.invocationIntentId,
    recoveryNonce: lock.recoveryNonce,
    transactionId,
    lock,
    lockPath: layout.lockPath,
    transactionPath: txPath,
    proposalSidecarPath: transactionProposalSidecarPath(layout, transactionId),
    transaction,
    proposalSidecarBytes: Buffer.from(deepCanonical(validated.proposal), 'utf8'),
    publishToolReceipt: request.publishToolReceipt,
    toolAuthorityRoot: request.toolAuthorityRoot ? resolve(request.toolAuthorityRoot) : join(layout.root, 'review', 'admission', 'tool-authority'),
    phaseHook: request.phaseHook,
    toolAuthorityPhaseHook: request.toolAuthorityPhaseHook,
  };
}

async function rollbackUnpromotedStaleAcquisition(context: PublicationContext): Promise<AcquisitionPublicationResult | undefined> {
  if (context.transaction.state.phase !== 'intent_fsynced'
    && context.transaction.state.phase !== 'artifacts_staged_fsynced'
    && context.transaction.state.phase !== 'artifacts_promoted') return undefined;
  const current = await readCurrentIndex(context.layout);
  if (currentIndexMatchesExpected(current, context.validated.proposal.expectedCurrentState)
    || current.sha256 === context.validated.proposal.nextIndex.indexSha256) return undefined;
  const phase = context.transaction.state.phase;
  const ownedInodes = new Map<string, { readonly dev: number | bigint; readonly ino: number | bigint }>();
  for (const artifact of context.transaction.artifacts) {
    const final = resolve(context.layout.root, artifact.finalRelativePath);
    const staged = resolve(context.layout.root, artifact.stagedRelativePath);
    let finalMetadata: Awaited<ReturnType<typeof lstat>> | undefined;
    let stagedMetadata: Awaited<ReturnType<typeof lstat>> | undefined;
    try {
      await regularContainedFile(context.layout.root, final);
      finalMetadata = await lstat(final);
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') return undefined;
    }
    try {
      await regularContainedFile(context.layout.root, staged);
      stagedMetadata = await lstat(staged);
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') return undefined;
    }
    // A promoted path is removable only when it is still the hard link
    // created from this transaction's staged inode. If one side disappeared,
    // preserve the lock and leave recovery to an operator rather than
    // deleting a same-byte competing final path.
    if (finalMetadata === undefined || stagedMetadata === undefined) {
      // A staged-only artifact is the normal unpromoted state after the
      // `artifacts_staged_fsynced` boundary and can be removed as transaction
      // owned. Once promotion was recorded, however, any missing side of the
      // hard-link pair is ambiguous; preserve the lock rather than deleting a
      // same-byte path that may belong to another writer.
      if (finalMetadata !== undefined || (stagedMetadata !== undefined && phase === 'artifacts_promoted')) return undefined;
      continue;
    }
    if (finalMetadata.dev !== stagedMetadata.dev || finalMetadata.ino !== stagedMetadata.ino) return undefined;
    const finalBytes = await readFile(final);
    const stagedBytes = await readFile(staged);
    if (finalBytes.byteLength !== artifact.bytes || stagedBytes.byteLength !== artifact.bytes
      || createHash('sha256').update(finalBytes).digest('hex') !== artifact.sha256
      || createHash('sha256').update(stagedBytes).digest('hex') !== artifact.sha256) {
      return undefined;
    }
    ownedInodes.set(artifact.finalRelativePath, { dev: finalMetadata.dev, ino: finalMetadata.ino });
  }
  for (const artifact of context.transaction.artifacts) {
    const staged = resolve(context.layout.root, artifact.stagedRelativePath);
    const final = resolve(context.layout.root, artifact.finalRelativePath);
    const expectedInode = ownedInodes.get(artifact.finalRelativePath);
    if (expectedInode !== undefined) {
      try {
        const stagedMetadata = await lstat(staged);
        const finalMetadata = await lstat(final);
        if (stagedMetadata.dev !== expectedInode.dev || stagedMetadata.ino !== expectedInode.ino
          || finalMetadata.dev !== expectedInode.dev || finalMetadata.ino !== expectedInode.ino) return undefined;
      } catch (error) {
        if ((error as { code?: string }).code === 'ENOENT') return undefined;
        throw error;
      }
    }
    try {
      await removeAcquisitionOwnedPath(context.layout.root, staged, undefined, artifact.sha256);
    } catch (error) { if ((error as { code?: string }).code !== 'ENOENT') throw error; }
    if (expectedInode !== undefined) {
      try {
        const finalMetadata = await lstat(final);
        if (finalMetadata.dev !== expectedInode.dev || finalMetadata.ino !== expectedInode.ino) return undefined;
      } catch (error) {
        if ((error as { code?: string }).code === 'ENOENT') return undefined;
        throw error;
      }
    }
    try {
      await removeAcquisitionOwnedPath(context.layout.root, final, undefined, artifact.sha256);
    } catch (error) { if ((error as { code?: string }).code !== 'ENOENT') throw error; }
  }
  const nextIndexBytes = Buffer.from(deepCanonical(context.validated.proposal.nextIndex), 'utf8');
  const nextIndexSha256 = createHash('sha256').update(nextIndexBytes).digest('hex');
  await removeAcquisitionOwnedPath(context.layout.root, transactionIndexStagePath(context.layout, context.transactionId), nextIndexBytes, nextIndexSha256);
  await removeAcquisitionOwnedPath(context.layout.root, transactionCurrentIndexTempPath(context.layout, context.transactionId), nextIndexBytes, nextIndexSha256);
  await removeAcquisitionOwnedPath(context.layout.root, context.transactionPath, Buffer.from(deepCanonical(context.transaction), 'utf8'));
  await removeAcquisitionOwnedPath(context.layout.root, context.proposalSidecarPath, context.proposalSidecarBytes);
  await removeAcquisitionOwnedPath(context.layout.root, context.lockPath, Buffer.from(deepCanonical(context.lock), 'utf8'));
  await syncDirectory(context.layout.transactionsRoot);
  await syncDirectory(context.layout.admissionRoot);
  return {
    complete: false,
    promoted: false,
    recoveryRequired: false,
    transactionId: context.transactionId,
    nextIndexSha256: context.validated.proposal.nextIndex.indexSha256,
    transactionPath: context.transactionPath,
    lockPath: context.lockPath,
    reason: 'Rolled back an unpromoted acquisition after the expected current index became stale',
  };
}

/** Resume a fixed-lock publication after an interruption. */
export async function recoverAcquisitionPublication(request: AcquisitionPublicationRecoveryRequest): Promise<AcquisitionPublicationResult> {
  const context = await recoverContext(request);
  try {
    return await runTransaction(context);
  } catch (error) {
    if (error instanceof Error && /artifact promotion.*stale CAS/.test(error.message)) {
      const rolledBack = await rollbackUnpromotedStaleAcquisition(context);
      if (rolledBack) return rolledBack;
    }
    throw error;
  }
}

export const recoverAcquisition = recoverAcquisitionPublication;
export const acquisitionRecoverPublication = recoverAcquisitionPublication;

/**
 * Verify that a path is one of the fixed acquisition publication paths.  This
 * is exported for callers that validate proposals before opening any source
 * bytes.
 */
export function isContainedAcquisitionPublicationPath(root: string, candidate: string): boolean {
  const absoluteRoot = resolve(root);
  const absolute = resolve(root, candidate);
  return isInside(absoluteRoot, absolute) && isRelativePath(candidate);
}

function authorityShaWithout(value: Record<string, unknown>, key: string): string {
  const copy = { ...value };
  delete copy[key];
  return calibrationAdmissionSha256(copy);
}

interface AuthorityIndex {
  readonly version: 'v10.3-admission-tool-authority-index-v1';
  readonly generation: number;
  readonly parentIndexSha256?: string;
  readonly profiles: readonly { readonly profileId: string; readonly relativePath: string; readonly sha256: string }[];
  readonly invocationIntents: readonly { readonly intentId: string; readonly relativePath: string; readonly sha256: string }[];
  readonly receipts: readonly { readonly receiptId: string; readonly relativePath: string; readonly sha256: string }[];
  readonly indexSha256: string;
}

function validateAuthorityIndex(value: unknown): value is AuthorityIndex {
  return isCalibrationAdmissionToolAuthorityIndexV1(value);
}

function localAuthorityReceipt(
  input: AcquisitionPublicationReceiptInput,
  profile: CalibrationAdmissionToolProfileV1,
  intent: CalibrationAdmissionInvocationIntentV1,
): CalibrationAdmissionToolReceiptV1 {
  const withoutId = {
    version: 'v10.3-admission-tool-receipt-v1',
    invocationIntentId: intent.intentId,
    profileId: profile.profileId,
    profileSha256: profile.profileSha256,
    action: intent.action,
    canonicalArgvSha256: intent.canonicalArgvSha256,
    inputSetSha256: intent.inputSetSha256,
    executableBehaviorSha256: intent.executableBehaviorSha256,
    observedResourceUsage: { heapBytes: ADMISSION_PUBLICATION_HEAP_BYTES, workers: ADMISSION_PUBLICATION_WORKERS },
    exitCode: 0,
    outputSetSha256: input.nextIndexSha256,
  };
  const receipt = { receiptId: calibrationAdmissionToolReceiptId(withoutId), ...withoutId };
  if (!isCalibrationAdmissionToolReceiptV1(receipt, profile, intent)) throw new Error('Local publication tool receipt failed Core validation');
  return receipt;
}

const TOOL_AUTHORITY_LOCK_NAME = 'tool-authority.lock';
const TOOL_AUTHORITY_TRANSACTION_NAME = 'tool-authority-transaction.json';
const TOOL_AUTHORITY_TRANSACTIONS_ROOT = 'transactions';
const TOOL_AUTHORITY_COMPLETIONS_ROOT = 'completions';

function toolAuthorityProfile(profileId: (typeof FROZEN_ADMISSION_PROFILE_IDS)[number]): Record<string, unknown> {
  const readOnly = new Set([
    'admission-context-v1',
    'admission-static-ledgers-v1',
    'admission-census-v1',
    'admission-manifest-v1',
    'admission-source-node-v1',
    'admission-source-parquet-v1',
    'admission-git-acquire-v1',
    'admission-release-acquire-v1',
    'admission-evidence-acquire-v1',
  ]);
  const transport = profileId === 'admission-git-acquire-v1'
    ? 'git'
    : profileId === 'admission-release-acquire-v1'
      ? 'release_asset'
      : profileId === 'admission-evidence-acquire-v1' ? 'evidence' : undefined;
  const withoutHash = {
    version: 'v10.3-admission-tool-profile-v1',
    profileId,
    allowedExecutableIds: ['corepack-pnpm', 'node'],
    allowedActions: [...FROZEN_ADMISSION_ACTIONS[profileId]].sort(),
    candidateByteAccess: readOnly.has(profileId) ? 'read_only' : 'none',
    network: transport === undefined ? { mode: 'deny' } : { mode: 'exact_authorized_https', transport },
    resourceLimits: { maxHeapMiB: 2048, maxWallSeconds: 3600 },
  };
  const profile = { ...withoutHash, profileSha256: calibrationAdmissionSha256(withoutHash) };
  if (!isCalibrationAdmissionToolProfileV1(profile)) throw new Error(`Unable to construct frozen tool profile ${profileId}`);
  return profile as unknown as Record<string, unknown>;
}

function authorityIndexHash(value: Record<string, unknown>): string {
  const copy = { ...value };
  delete copy.indexSha256;
  return calibrationAdmissionSha256(copy);
}

function authorityLockHash(value: Record<string, unknown>): string {
  const copy = { ...value };
  delete copy.lockSha256;
  return calibrationAdmissionSha256(copy);
}

function authorityTransactionHash(value: Record<string, unknown>): string {
  const copy = { ...value };
  delete copy.transactionSha256;
  return calibrationAdmissionSha256(copy);
}

function canonicalBytesSha256(value: unknown): string {
  return createHash('sha256').update(Buffer.from(deepCanonical(value), 'utf8')).digest('hex');
}

async function writeAuthorityObject(authorityRoot: string, relativePath: string, value: unknown): Promise<{ readonly bytes: Buffer; readonly sha256: string }> {
  const absolute = resolve(authorityRoot, relativePath);
  if (!isInside(authorityRoot, absolute)) throw new Error('Tool-authority object path escapes root');
  await ensureDirectory(authorityRoot, dirname(absolute));
  const bytes = Buffer.from(deepCanonical(value), 'utf8');
  try { await writeWx(absolute, bytes); } catch (error) {
    if ((error as { code?: string }).code !== 'EEXIST') throw error;
    // Never follow a pre-existing symlink on a collision path.  The normal
    // no-clobber path is contained, but an attacker can substitute the leaf
    // between the wx attempt and this comparison.
    await regularContainedFile(authorityRoot, absolute);
    const existing = await readFile(absolute);
    if (!existing.equals(bytes)) throw new Error(`Tool-authority object collision: ${relativePath}`);
  }
  await syncFile(absolute);
  await syncDirectory(dirname(absolute));
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
}

async function publishAuthorityBootstrapGeneration(authorityRoot: string, index: Record<string, unknown>): Promise<void> {
  if (!validateAuthorityIndex(index)) throw new Error('Tool-authority bootstrap index failed semantic validation');
  const generationPath = join(authorityRoot, 'index-generations', `${index.indexSha256}.json`);
  await writeAuthorityObject(authorityRoot, relativePath(authorityRoot, generationPath), index);
  const currentPath = join(authorityRoot, 'index.json');
  const bytes = Buffer.from(deepCanonical(index), 'utf8');
  try {
    await writeWx(currentPath, bytes);
  } catch (error) {
    if ((error as { code?: string }).code !== 'EEXIST') throw error;
    await regularContainedFile(authorityRoot, currentPath);
    const existing = await readFile(currentPath);
    if (!existing.equals(bytes)) throw new Error('Tool-authority bootstrap current index collision');
  }
  await syncDirectory(authorityRoot);
}

type AuthorityTransactionState =
  | 'intent_fsynced'
  | 'artifacts_staged_fsynced'
  | 'artifacts_promoted'
  | 'index_generation_fsynced'
  | 'next_index_temporary_fsynced'
  | 'index_promoted'
  | 'output_directories_fsynced'
  | 'complete';

async function invokeToolAuthorityHook(
  hook: AcquisitionPublicationReceiptInput['toolAuthorityPhaseHook'],
  phase: ToolAuthorityPublicationPhase,
): Promise<void> {
  if (hook) await hook(phase);
}

async function updateAuthorityTransaction(
  authorityRoot: string,
  transactionPath: string,
  transaction: Record<string, unknown>,
  phase: AuthorityTransactionState,
): Promise<Record<string, unknown>> {
  const nextBase = { ...transaction, state: { phase } };
  const next = { ...nextBase, transactionSha256: authorityTransactionHash(nextBase) };
  if (!isCalibrationToolAuthorityPublicationTransactionV1(next)) throw new Error(`Tool-authority transaction phase ${phase} is invalid`);
  await writeReplace(transactionPath, Buffer.from(deepCanonical(next), 'utf8'), String(next.transactionId));
  await syncDirectory(authorityRoot);
  return next as unknown as Record<string, unknown>;
}

async function authorityCurrentIndex(authorityRoot: string): Promise<AuthorityIndex> {
  const currentPath = join(authorityRoot, 'index.json');
  await regularContainedFile(authorityRoot, currentPath);
  const currentBytes = await readFile(currentPath);
  let parsed: unknown;
  try { parsed = JSON.parse(currentBytes.toString('utf8')) as unknown; } catch { throw new Error('Tool-authority current index is unavailable or invalid'); }
  if (!validateAuthorityIndex(parsed)) throw new Error('Tool-authority current index is unavailable or invalid');
  if (!Buffer.from(deepCanonical(parsed), 'utf8').equals(currentBytes)) throw new Error('Tool-authority current index is not canonical');
  const seen = new Set<string>();
  let cursor = parsed;
  while (true) {
    if (seen.has(cursor.indexSha256)) throw new Error('Tool-authority generation parent cycle detected');
    seen.add(cursor.indexSha256);
    const generationPath = join(authorityRoot, 'index-generations', `${cursor.indexSha256}.json`);
    await regularContainedFile(authorityRoot, generationPath);
    const generationBytes = await readFile(generationPath);
    let generationValue: unknown;
    try { generationValue = JSON.parse(generationBytes.toString('utf8')) as unknown; } catch { throw new Error('Tool-authority immutable generation is invalid'); }
    if (!validateAuthorityIndex(generationValue)
      || generationValue.indexSha256 !== cursor.indexSha256
      || !Buffer.from(deepCanonical(generationValue), 'utf8').equals(generationBytes)) {
      throw new Error('Tool-authority current index is not anchored to its immutable generation');
    }
    if (cursor.generation === 0) {
      if (cursor.parentIndexSha256 !== undefined) throw new Error('Tool-authority bootstrap generation has a parent');
      break;
    }
    if (cursor.parentIndexSha256 === undefined) throw new Error('Tool-authority generation parent is missing');
    const parentPath = join(authorityRoot, 'index-generations', `${cursor.parentIndexSha256}.json`);
    await regularContainedFile(authorityRoot, parentPath);
    const parentBytes = await readFile(parentPath);
    let parentValue: unknown;
    try { parentValue = JSON.parse(parentBytes.toString('utf8')) as unknown; } catch { throw new Error('Tool-authority parent generation is invalid'); }
    if (!validateAuthorityIndex(parentValue)
      || parentValue.indexSha256 !== cursor.parentIndexSha256
      || !Buffer.from(deepCanonical(parentValue), 'utf8').equals(parentBytes)
      || cursor.generation !== parentValue.generation + 1) {
      throw new Error('Tool-authority generation chain is not contiguous');
    }
    cursor = parentValue;
  }
  return parsed;
}

async function promoteAuthorityArtifact(authorityRoot: string, stagedRelativePath: string, finalRelativePath: string, expectedBytes: number, expectedSha256: string): Promise<void> {
  const staged = resolve(authorityRoot, stagedRelativePath);
  const final = resolve(authorityRoot, finalRelativePath);
  if (!isInside(authorityRoot, staged) || !isInside(authorityRoot, final)) throw new Error('Tool-authority artifact path escapes root');
  await regularContainedFile(authorityRoot, staged);
  const stagedBytes = await readFile(staged);
  if (stagedBytes.byteLength !== expectedBytes || createHash('sha256').update(stagedBytes).digest('hex') !== expectedSha256) throw new Error('Tool-authority staged artifact bytes mismatch');
  await ensureDirectory(authorityRoot, dirname(final));
    try {
      await link(staged, final);
    } catch (error) {
      if ((error as { code?: string }).code !== 'EEXIST') throw error;
      await regularContainedFile(authorityRoot, final);
      const existing = await readFile(final);
      if (!existing.equals(stagedBytes)) throw new Error('Tool-authority artifact collision');
    }
  await syncDirectory(dirname(final));
}

interface AuthorityArtifactSpec {
  readonly stagedRelativePath: string;
  readonly finalRelativePath: string;
  readonly value: unknown;
  readonly bytes: number;
  readonly sha256: string;
}

function authorityArtifactSetSha256(artifacts: readonly Pick<AuthorityArtifactSpec, 'stagedRelativePath' | 'finalRelativePath' | 'bytes' | 'sha256'>[]): string {
  const descriptors = artifacts
    .map((artifact) => ({
      // The transaction id is derived from this set, so bind the staged path
      // through a stable placeholder rather than omitting it (which would
      // let a self-rehashed transaction substitute an arbitrary stage file).
      stagedRelativePath: artifact.stagedRelativePath.replace(
        new RegExp(`^${TOOL_AUTHORITY_TRANSACTIONS_ROOT}/(?:pending|[a-f0-9]{64})/`),
        `${TOOL_AUTHORITY_TRANSACTIONS_ROOT}/$transaction/`,
      ),
      finalRelativePath: artifact.finalRelativePath,
      bytes: artifact.bytes,
      sha256: artifact.sha256,
    }))
    .sort((left, right) => {
      const a = `${left.finalRelativePath}\u0000${left.sha256}`;
      const b = `${right.finalRelativePath}\u0000${right.sha256}`;
      return a < b ? -1 : a > b ? 1 : 0;
    });
  return calibrationAdmissionSha256(descriptors);
}

function toolAuthorityTransactionId(
  operation: 'create' | 'replace',
  expectedCurrentState: { readonly kind: 'absent' } | { readonly kind: 'existing'; readonly indexSha256: string },
  nextIndexSha256: string,
  artifactSetSha256: string,
): string {
  return calibrationAdmissionSha256({
    domain: 'v10.3-tool-authority-publication-transaction-v1',
    operation,
    expectedCurrentState,
    nextIndexSha256,
    artifactSetSha256,
  });
}

function toolAuthorityRecoveryNonce(
  transactionId: string,
  expectedCurrentState: { readonly kind: 'absent' } | { readonly kind: 'existing'; readonly indexSha256: string },
): string {
  return calibrationAdmissionSha256({
    domain: 'v10.3-tool-authority-recovery-nonce-v1',
    transactionId,
    parentIndexSha256: expectedCurrentState.kind === 'existing' ? expectedCurrentState.indexSha256 : null,
  });
}

function authorityTransactionSidecarRelativePath(transactionId: string): string {
  if (!isLowerId(transactionId)) throw new Error('Invalid tool-authority transaction id');
  return `${TOOL_AUTHORITY_TRANSACTIONS_ROOT}/${transactionId}/intent.json`;
}

function authorityCompletionRelativePath(transactionId: string): string {
  if (!isLowerId(transactionId)) throw new Error('Invalid tool-authority transaction id');
  return `${TOOL_AUTHORITY_COMPLETIONS_ROOT}/${transactionId}.json`;
}

async function optionalAuthorityCurrentIndex(authorityRoot: string): Promise<AuthorityIndex | undefined> {
  const currentPath = join(authorityRoot, 'index.json');
  try {
    await regularContainedFile(authorityRoot, currentPath);
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return undefined;
    throw error;
  }
  return await authorityCurrentIndex(authorityRoot);
}

function authorityCurrentState(index: AuthorityIndex | undefined): { readonly kind: 'absent' } | { readonly kind: 'existing'; readonly indexSha256: string } {
  return index === undefined ? { kind: 'absent' } : { kind: 'existing', indexSha256: index.indexSha256 };
}

function authorityTransactionArtifacts(transaction: CalibrationToolAuthorityPublicationTransactionV1): readonly Pick<AuthorityArtifactSpec, 'stagedRelativePath' | 'finalRelativePath' | 'bytes' | 'sha256'>[] {
  return transaction.artifacts.map((artifact) => ({
    stagedRelativePath: artifact.stagedRelativePath,
    finalRelativePath: artifact.finalRelativePath,
    bytes: artifact.bytes,
    sha256: artifact.sha256,
  }));
}

async function publishAuthorityGeneration(input: {
  readonly authorityRoot: string;
  readonly operation: 'create' | 'replace';
  readonly expectedCurrentState: { readonly kind: 'absent' } | { readonly kind: 'existing'; readonly indexSha256: string };
  readonly nextIndex: AuthorityIndex;
  readonly artifacts: readonly AuthorityArtifactSpec[];
  readonly phaseHook?: (phase: ToolAuthorityPublicationPhase) => void | Promise<void>;
}): Promise<{ readonly transactionId: string; readonly recoveryNonce: string; readonly indexSha256: string }> {
  const authorityRoot = await realpath(input.authorityRoot);
  await ensureDirectory(authorityRoot, authorityRoot);
  await ensureDirectory(authorityRoot, join(authorityRoot, TOOL_AUTHORITY_TRANSACTIONS_ROOT));
  await ensureDirectory(authorityRoot, join(authorityRoot, 'index-generations'));
  await ensureDirectory(authorityRoot, join(authorityRoot, 'profiles'));
  await ensureDirectory(authorityRoot, join(authorityRoot, 'invocation-intents'));
  await ensureDirectory(authorityRoot, join(authorityRoot, 'receipts'));
  await ensureDirectory(authorityRoot, join(authorityRoot, TOOL_AUTHORITY_COMPLETIONS_ROOT));
  if (!validateAuthorityIndex(input.nextIndex)) throw new Error('Tool-authority next index is invalid');
  const current = await optionalAuthorityCurrentIndex(authorityRoot);
  const observedState = authorityCurrentState(current);
  if (JSON.stringify(observedState) !== JSON.stringify(input.expectedCurrentState)) {
    if (current?.indexSha256 === input.nextIndex.indexSha256) {
      await authorityGeneration(authorityRoot, `index-generations/${input.nextIndex.indexSha256}.json`, input.nextIndex.indexSha256, input.expectedCurrentState);
      return { transactionId: '', recoveryNonce: '', indexSha256: current.indexSha256 };
    }
    throw new Error('Tool-authority current index does not match expected state');
  }
  if (input.nextIndex.generation === 0 && input.expectedCurrentState.kind !== 'absent') throw new Error('Tool-authority generation zero requires an absent current index');
  if (input.nextIndex.generation > 0 && input.nextIndex.parentIndexSha256 !== (input.expectedCurrentState.kind === 'existing' ? input.expectedCurrentState.indexSha256 : undefined)) throw new Error('Tool-authority next generation parent does not match expected current state');
  if (current !== undefined && input.nextIndex.generation !== current.generation + 1) throw new Error('Tool-authority generation must advance by exactly one');
  const generationRelativePath = `index-generations/${input.nextIndex.indexSha256}.json`;
  const generationBytes = Buffer.from(deepCanonical(input.nextIndex), 'utf8');
  const generationArtifact: AuthorityArtifactSpec = {
    stagedRelativePath: `${TOOL_AUTHORITY_TRANSACTIONS_ROOT}/pending/index-generation.json`,
    finalRelativePath: generationRelativePath,
    value: input.nextIndex,
    bytes: generationBytes.byteLength,
    sha256: createHash('sha256').update(generationBytes).digest('hex'),
  };
  const artifacts = [...input.artifacts, generationArtifact].map((artifact) => ({ ...artifact }));
  const artifactSetSha256 = authorityArtifactSetSha256(artifacts);
  const transactionId = toolAuthorityTransactionId(
    input.operation,
    input.expectedCurrentState,
    input.nextIndex.indexSha256,
    artifactSetSha256,
  );
  const recoveryNonce = toolAuthorityRecoveryNonce(transactionId, input.expectedCurrentState);
  const transactionArtifacts = artifacts.map((artifact) => ({
    stagedRelativePath: artifact.stagedRelativePath.replace('/pending/', `/${transactionId}/`),
    finalRelativePath: artifact.finalRelativePath,
    bytes: artifact.bytes,
    sha256: artifact.sha256,
  }));
  const lockWithoutIds: Record<string, unknown> = {
    version: 'v10.3-tool-authority-publication-lock-v1',
    intendedTransactionId: transactionId,
    operation: input.operation,
    expectedCurrentState: input.expectedCurrentState,
    nextIndexSha256: input.nextIndex.indexSha256,
    artifactSetSha256,
    recoveryNonce,
  };
  const lockBase = { ...lockWithoutIds, lockId: calibrationAdmissionSha256(lockWithoutIds) };
  const lock = { ...lockBase, lockSha256: authorityLockHash(lockBase) };
  if (!isCalibrationToolAuthorityPublicationLockV1(lock)) throw new Error('Tool-authority publication lock failed Core validation');
  const transactionBase: Record<string, unknown> = {
    version: 'v10.3-tool-authority-publication-transaction-v1',
    transactionId,
    lockSha256: lock.lockSha256,
    operation: input.operation,
    expectedCurrentState: input.expectedCurrentState,
    nextIndexSha256: input.nextIndex.indexSha256,
    artifacts: transactionArtifacts,
    immutableIndexGenerationRelativePath: generationRelativePath,
    nextIndexTemporaryRelativePath: `${TOOL_AUTHORITY_TRANSACTIONS_ROOT}/${transactionId}/current-index.json`,
    state: { phase: 'intent_fsynced' },
  };
  const transaction = { ...transactionBase, transactionSha256: authorityTransactionHash(transactionBase) };
  if (!isCalibrationToolAuthorityPublicationTransactionV1(transaction)) throw new Error('Tool-authority publication transaction failed Core validation');
  const transactionPath = join(authorityRoot, TOOL_AUTHORITY_TRANSACTION_NAME);
  const lockPath = join(authorityRoot, TOOL_AUTHORITY_LOCK_NAME);
  const transactionSidecarPath = join(authorityRoot, authorityTransactionSidecarRelativePath(transactionId));
  const transactionDirectory = dirname(transactionSidecarPath);
  await ensureDirectory(authorityRoot, transactionDirectory);
  // Stage exact object bytes and a schema-valid intent sidecar before lock
  // acquisition. This gives from-lock recovery a non-discoverable source of
  // truth even if the fixed transaction has not been written yet.
  for (const [index, artifact] of artifacts.entries()) {
    const transactionArtifact = transactionArtifacts[index]!;
    await writeAuthorityObject(authorityRoot, transactionArtifact.stagedRelativePath, artifact.value);
  }
  await writeAuthorityObject(authorityRoot, authorityTransactionSidecarRelativePath(transactionId), transaction);
  await syncDirectory(transactionDirectory);
  let lockOwned = false;
  try {
    await writeWx(lockPath, Buffer.from(deepCanonical(lock), 'utf8'));
    lockOwned = true;
    await syncFile(lockPath);
    await syncDirectory(authorityRoot);
    await invokeToolAuthorityHook(input.phaseHook, 'lock-file-fsynced');
    const afterLock = await optionalAuthorityCurrentIndex(authorityRoot);
    if (JSON.stringify(authorityCurrentState(afterLock)) !== JSON.stringify(input.expectedCurrentState)) throw new Error('Tool-authority current index changed before publication lock was acquired');
    await writeWx(transactionPath, Buffer.from(deepCanonical(transaction), 'utf8'));
    await syncFile(transactionPath);
    await syncDirectory(authorityRoot);
    await invokeToolAuthorityHook(input.phaseHook, 'transaction-fsynced');
    let currentTransaction = transaction as unknown as Record<string, unknown>;
    for (const artifact of transaction.artifacts) {
      await promoteAuthorityArtifact(authorityRoot, artifact.stagedRelativePath, artifact.finalRelativePath, artifact.bytes, artifact.sha256);
    }
    currentTransaction = await updateAuthorityTransaction(authorityRoot, transactionPath, currentTransaction, 'artifacts_staged_fsynced');
    await invokeToolAuthorityHook(input.phaseHook, 'artifacts-staged-fsynced');
    currentTransaction = await updateAuthorityTransaction(authorityRoot, transactionPath, currentTransaction, 'artifacts_promoted');
    await invokeToolAuthorityHook(input.phaseHook, 'artifacts-promoted');
    await authorityGeneration(authorityRoot, generationRelativePath, input.nextIndex.indexSha256, input.expectedCurrentState);
    currentTransaction = await updateAuthorityTransaction(authorityRoot, transactionPath, currentTransaction, 'index_generation_fsynced');
    await invokeToolAuthorityHook(input.phaseHook, 'index-generation-fsynced');
    await writeAuthorityObject(authorityRoot, String(transaction.nextIndexTemporaryRelativePath), input.nextIndex);
    currentTransaction = await updateAuthorityTransaction(authorityRoot, transactionPath, currentTransaction, 'next_index_temporary_fsynced');
    await invokeToolAuthorityHook(input.phaseHook, 'next-index-temporary-fsynced');
    const currentBeforePromote = await optionalAuthorityCurrentIndex(authorityRoot);
    if (JSON.stringify(authorityCurrentState(currentBeforePromote)) !== JSON.stringify(input.expectedCurrentState)) {
      if (currentBeforePromote?.indexSha256 !== input.nextIndex.indexSha256) throw new Error('Tool-authority current index changed during publication');
    }
    if (currentBeforePromote?.indexSha256 !== input.nextIndex.indexSha256) {
      await rename(resolve(authorityRoot, String(transaction.nextIndexTemporaryRelativePath)), join(authorityRoot, 'index.json'));
      await syncDirectory(authorityRoot);
    }
    currentTransaction = await updateAuthorityTransaction(authorityRoot, transactionPath, currentTransaction, 'index_promoted');
    await invokeToolAuthorityHook(input.phaseHook, 'index-promoted');
    await syncDirectory(join(authorityRoot, 'index-generations'));
    await syncDirectory(join(authorityRoot, 'profiles'));
    await syncDirectory(join(authorityRoot, 'invocation-intents'));
    await syncDirectory(join(authorityRoot, 'receipts'));
    currentTransaction = await updateAuthorityTransaction(authorityRoot, transactionPath, currentTransaction, 'output_directories_fsynced');
    await invokeToolAuthorityHook(input.phaseHook, 'output-directories-fsynced');
    currentTransaction = await updateAuthorityTransaction(authorityRoot, transactionPath, currentTransaction, 'complete');
    await invokeToolAuthorityHook(input.phaseHook, 'complete');
    await writeAuthorityObject(authorityRoot, authorityCompletionRelativePath(transactionId), currentTransaction);
    await removeAuthorityTransactionOwnedFiles(authorityRoot, currentTransaction as unknown as CalibrationToolAuthorityPublicationTransactionV1, false);
    await removeAuthorityOwnedPath(authorityRoot, TOOL_AUTHORITY_TRANSACTION_NAME, canonicalBytesSha256(currentTransaction));
    await syncDirectory(authorityRoot);
    await invokeToolAuthorityHook(input.phaseHook, 'transaction-unlinked');
    await removeAuthorityOwnedPath(authorityRoot, TOOL_AUTHORITY_LOCK_NAME, canonicalBytesSha256(lock));
    await syncDirectory(authorityRoot);
    await invokeToolAuthorityHook(input.phaseHook, 'lock-unlinked');
    return { transactionId, recoveryNonce, indexSha256: input.nextIndex.indexSha256 };
  } catch (error) {
    if (!lockOwned) {
      // A losing writer must only remove its own staging/sidecar. A winner's
      // fixed lock/transaction and immutable objects are never touched. When
      // two identical requests share the deterministic transaction ID, the
      // winner owns the same staged paths; leave them for that winner rather
      // than deleting shared state on an EEXIST lock race.
      let sharedTransaction = false;
      try {
        const winner = await readAuthorityLock(authorityRoot);
        sharedTransaction = winner.intendedTransactionId === transactionId;
      } catch { /* preserve the original lock/write error */ }
      if (!sharedTransaction) {
        try { await removeAuthorityTransactionOwnedFiles(authorityRoot, transaction as unknown as CalibrationToolAuthorityPublicationTransactionV1, false); } catch { /* preserve original race error */ }
      }
    }
    throw error;
  }
}

export interface ToolAuthorityPublicationRecoveryRequest {
  /** The v10.3 project root, review/admission root, or tool-authority root. */
  readonly root: string;
  readonly transactionId?: string;
  readonly fromLock?: boolean;
  readonly recoveryNonce: string;
  readonly acknowledgeNoLiveWriter: boolean;
}

export interface ToolAuthorityPublicationRecoveryResult {
  readonly complete: boolean;
  readonly recovered: boolean;
  readonly rolledBack: boolean;
  readonly transactionId: string;
  readonly nextIndexSha256: string;
  readonly currentIndexSha256?: string;
  readonly lockPath: string;
  readonly transactionPath: string;
  readonly reason?: string;
}

async function resolveToolAuthorityRoot(rootInput: string): Promise<string> {
  const supplied = await realpath(resolve(rootInput));
  if (basename(supplied) === 'tool-authority') return supplied;
  const admission = basename(supplied) === 'admission' && basename(dirname(supplied)) === 'review'
    ? supplied
    : join(supplied, 'review', 'admission');
  return await realpath(join(admission, 'tool-authority'));
}

async function readAuthorityLock(authorityRoot: string): Promise<CalibrationToolAuthorityPublicationLockV1> {
  const lockPath = join(authorityRoot, TOOL_AUTHORITY_LOCK_NAME);
  await regularContainedFile(authorityRoot, lockPath);
  const lock = await readJsonFile(lockPath);
  if (!isCalibrationToolAuthorityPublicationLockV1(lock)) throw new Error('Tool-authority publication lock is invalid');
  return lock;
}

async function readAuthorityTransaction(authorityRoot: string, transactionId: string): Promise<CalibrationToolAuthorityPublicationTransactionV1> {
  const transactionPath = join(authorityRoot, TOOL_AUTHORITY_TRANSACTION_NAME);
  await regularContainedFile(authorityRoot, transactionPath);
  const transaction = await readJsonFile(transactionPath);
  if (!isCalibrationToolAuthorityPublicationTransactionV1(transaction)) throw new Error('Tool-authority publication transaction is invalid');
  if (transaction.transactionId !== transactionId) throw new Error('Tool-authority publication transaction id mismatch');
  return transaction;
}

async function readAuthorityTransactionSidecar(authorityRoot: string, transactionId: string): Promise<CalibrationToolAuthorityPublicationTransactionV1> {
  const path = join(authorityRoot, authorityTransactionSidecarRelativePath(transactionId));
  await regularContainedFile(authorityRoot, path);
  const transaction = await readJsonFile(path);
  if (!isCalibrationToolAuthorityPublicationTransactionV1(transaction)) throw new Error('Tool-authority transaction sidecar is invalid');
  if (transaction.transactionId !== transactionId) throw new Error('Tool-authority transaction sidecar id mismatch');
  return transaction;
}

async function readAuthorityCompletion(authorityRoot: string, transactionId: string): Promise<CalibrationToolAuthorityPublicationTransactionV1> {
  const path = join(authorityRoot, authorityCompletionRelativePath(transactionId));
  await regularContainedFile(authorityRoot, path);
  const transaction = await readJsonFile(path);
  if (!isCalibrationToolAuthorityPublicationTransactionV1(transaction) || transaction.transactionId !== transactionId || transaction.state.phase !== 'complete') throw new Error('Tool-authority completion marker is invalid');
  return transaction;
}

async function removeAuthorityOwnedPath(authorityRoot: string, relativePath: string, expectedSha256?: string): Promise<void> {
  const absolute = resolve(authorityRoot, relativePath);
  if (!isInside(authorityRoot, absolute)) throw new Error('Tool-authority cleanup path escapes root');
  try {
    await regularContainedFile(authorityRoot, absolute);
    if (expectedSha256 !== undefined) {
      const bytes = await readFile(absolute);
      if (createHash('sha256').update(bytes).digest('hex') !== expectedSha256) throw new Error(`Tool-authority cleanup refused changed file: ${relativePath}`);
    }
    await unlink(absolute);
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
  }
}

async function removeAuthorityTransactionOwnedFiles(
  authorityRoot: string,
  transaction: CalibrationToolAuthorityPublicationTransactionV1,
  removeFinalObjects: boolean,
): Promise<void> {
  for (const artifact of transaction.artifacts) {
    await removeAuthorityOwnedPath(authorityRoot, artifact.stagedRelativePath, artifact.sha256);
    if (removeFinalObjects) await removeAuthorityOwnedPath(authorityRoot, artifact.finalRelativePath, artifact.sha256);
  }
  let temporaryExpectedSha256: string | undefined;
  const temporaryPath = resolve(authorityRoot, transaction.nextIndexTemporaryRelativePath);
  let temporaryPresent = false;
  try {
    await regularContainedFile(authorityRoot, temporaryPath);
    temporaryPresent = true;
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
  }
  if (temporaryPresent) {
    const generationPath = resolve(authorityRoot, transaction.immutableIndexGenerationRelativePath);
    await regularContainedFile(authorityRoot, generationPath);
    const temporaryBytes = await readFile(temporaryPath);
    const generationBytes = await readFile(generationPath);
    if (!temporaryBytes.equals(generationBytes)) throw new Error('Tool-authority temporary current index does not match immutable generation');
    temporaryExpectedSha256 = createHash('sha256').update(generationBytes).digest('hex');
  }
  await removeAuthorityOwnedPath(authorityRoot, transaction.nextIndexTemporaryRelativePath, temporaryExpectedSha256);
  // The sidecar is an immutable intent copy, not the mutable transaction
  // journal. Re-open it immediately before cleanup and prove its stable
  // identity/artifact projection still belongs to this transaction; a
  // substituted sidecar must fail closed rather than being unlinked.
  const sidecarPath = join(authorityRoot, authorityTransactionSidecarRelativePath(transaction.transactionId));
  let sidecarExpectedSha256: string | undefined;
  try {
    const sidecar = await readAuthorityTransactionSidecar(authorityRoot, transaction.transactionId);
    if (sidecar.lockSha256 !== transaction.lockSha256
      || sidecar.operation !== transaction.operation
      || sidecar.nextIndexSha256 !== transaction.nextIndexSha256
      || deepCanonical(sidecar.expectedCurrentState) !== deepCanonical(transaction.expectedCurrentState)
      || authorityArtifactSetSha256(authorityTransactionArtifacts(sidecar)) !== authorityArtifactSetSha256(authorityTransactionArtifacts(transaction))) {
      throw new Error('Tool-authority transaction sidecar does not match transaction intent');
    }
    sidecarExpectedSha256 = createHash('sha256').update(Buffer.from(deepCanonical(sidecar), 'utf8')).digest('hex');
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
  }
  await removeAuthorityOwnedPath(authorityRoot, authorityTransactionSidecarRelativePath(transaction.transactionId), sidecarExpectedSha256);
  try { await rmdir(join(authorityRoot, TOOL_AUTHORITY_TRANSACTIONS_ROOT, transaction.transactionId)); } catch (error) { if ((error as { code?: string }).code !== 'ENOENT') throw error; }
  await syncDirectory(join(authorityRoot, TOOL_AUTHORITY_TRANSACTIONS_ROOT));
}

async function readAuthorityReferencedJson(authorityRoot: string, relativePath: string, expectedSha256: string): Promise<unknown> {
  const absolute = resolve(authorityRoot, relativePath);
  if (!isInside(authorityRoot, absolute)) throw new Error('Tool-authority reference escapes root');
  await regularContainedFile(authorityRoot, absolute);
  const bytes = await readFile(absolute);
  if (createHash('sha256').update(bytes).digest('hex') !== expectedSha256) throw new Error(`Tool-authority referenced bytes changed: ${relativePath}`);
  let parsed: unknown;
  try { parsed = JSON.parse(bytes.toString('utf8')) as unknown; } catch { throw new Error(`Tool-authority referenced JSON is invalid: ${relativePath}`); }
  if (!Buffer.from(deepCanonical(parsed), 'utf8').equals(bytes)) throw new Error(`Tool-authority referenced JSON is not canonical: ${relativePath}`);
  return parsed;
}

async function validateAuthorityGenerationObjects(authorityRoot: string, index: AuthorityIndex): Promise<void> {
  const profiles = new Map<string, CalibrationAdmissionToolProfileV1>();
  for (const ref of index.profiles) {
    const profile = await readAuthorityReferencedJson(authorityRoot, ref.relativePath, ref.sha256);
    if (!isCalibrationAdmissionToolProfileV1(profile) || profile.profileId !== ref.profileId) throw new Error(`Tool-authority profile reference is invalid: ${ref.profileId}`);
    profiles.set(ref.profileId, profile);
  }
  const intents = new Map<string, CalibrationAdmissionInvocationIntentV1>();
  for (const ref of index.invocationIntents) {
    const intent = await readAuthorityReferencedJson(authorityRoot, ref.relativePath, ref.sha256);
    const profile = isRecord(intent) ? profiles.get(String(intent.profileId)) : undefined;
    if (!profile || !isCalibrationAdmissionInvocationIntentV1(intent, profile) || intent.intentId !== ref.intentId) throw new Error(`Tool-authority invocation-intent reference is invalid: ${ref.intentId}`);
    intents.set(ref.intentId, intent);
  }
  for (const ref of index.receipts) {
    const receipt = await readAuthorityReferencedJson(authorityRoot, ref.relativePath, ref.sha256);
    const profile = isRecord(receipt) ? profiles.get(String(receipt.profileId)) : undefined;
    const intent = isRecord(receipt) ? intents.get(String(receipt.invocationIntentId)) : undefined;
    if (!profile || !intent || !isCalibrationAdmissionToolReceiptV1(receipt, profile, intent) || receipt.receiptId !== ref.receiptId) throw new Error(`Tool-authority receipt reference is invalid: ${ref.receiptId}`);
  }
}

async function authorityGeneration(authorityRoot: string, relativePath: string, expectedSha256: string, expectedCurrentState?: { readonly kind: 'absent' } | { readonly kind: 'existing'; readonly indexSha256: string }): Promise<AuthorityIndex> {
  const absolute = resolve(authorityRoot, relativePath);
  await regularContainedFile(authorityRoot, absolute);
  const bytes = await readFile(absolute);
  if (createHash('sha256').update(bytes).digest('hex') !== createHash('sha256').update(Buffer.from(deepCanonical(JSON.parse(bytes.toString('utf8'))), 'utf8')).digest('hex')) throw new Error('Tool-authority generation bytes are not canonical');
  const parsed = JSON.parse(bytes.toString('utf8')) as unknown;
  if (!validateAuthorityIndex(parsed) || parsed.indexSha256 !== expectedSha256) throw new Error('Tool-authority immutable generation is invalid');
  if (expectedCurrentState?.kind === 'existing' && parsed.parentIndexSha256 !== expectedCurrentState.indexSha256) throw new Error('Tool-authority immutable generation parent does not match expected current state');
  if (expectedCurrentState?.kind === 'absent' && parsed.generation !== 0) throw new Error('Tool-authority generation is not a bootstrap generation');
  if (expectedCurrentState?.kind === 'existing') {
    const parentPath = join(authorityRoot, 'index-generations', `${expectedCurrentState.indexSha256}.json`);
    await regularContainedFile(authorityRoot, parentPath);
    const parentBytes = await readFile(parentPath);
    let parentValue: unknown;
    try { parentValue = JSON.parse(parentBytes.toString('utf8')) as unknown; } catch { throw new Error('Tool-authority expected current generation is invalid'); }
    if (!validateAuthorityIndex(parentValue)
      || !Buffer.from(deepCanonical(parentValue), 'utf8').equals(parentBytes)
      || (parentValue as AuthorityIndex).indexSha256 !== expectedCurrentState.indexSha256
      || parsed.generation !== (parentValue as AuthorityIndex).generation + 1) {
      throw new Error('Tool-authority next generation is not exactly one after expected current');
    }
  }
  await validateAuthorityGenerationObjects(authorityRoot, parsed);
  return parsed;
}

function assertAuthorityTransactionMatchesLock(
  lock: CalibrationToolAuthorityPublicationLockV1,
  transaction: CalibrationToolAuthorityPublicationTransactionV1,
): void {
  if (transaction.lockSha256 !== lock.lockSha256
    || transaction.operation !== lock.operation
    || transaction.nextIndexSha256 !== lock.nextIndexSha256
    || deepCanonical(transaction.expectedCurrentState) !== deepCanonical(lock.expectedCurrentState)
    || transaction.immutableIndexGenerationRelativePath !== `index-generations/${lock.nextIndexSha256}.json`
    || transaction.nextIndexTemporaryRelativePath !== `${TOOL_AUTHORITY_TRANSACTIONS_ROOT}/${transaction.transactionId}/current-index.json`) {
    throw new Error('Tool-authority transaction does not match lock intent');
  }
  const stagedPrefix = `${TOOL_AUTHORITY_TRANSACTIONS_ROOT}/${transaction.transactionId}/`;
  if (transaction.artifacts.some((artifact) => !artifact.stagedRelativePath.startsWith(stagedPrefix))) {
    throw new Error('Tool-authority transaction staged artifact path is not transaction-owned');
  }
}

async function verifyAuthorityPromotedOutput(
  authorityRoot: string,
  transaction: CalibrationToolAuthorityPublicationTransactionV1,
  expectedCurrentState: CalibrationToolAuthorityPublicationLockV1['expectedCurrentState'],
): Promise<AuthorityIndex> {
  for (const artifact of transaction.artifacts) {
    const absolute = resolve(authorityRoot, artifact.finalRelativePath);
    await regularContainedFile(authorityRoot, absolute);
    const bytes = await readFile(absolute);
    if (bytes.byteLength !== artifact.bytes || createHash('sha256').update(bytes).digest('hex') !== artifact.sha256) {
      throw new Error(`Tool-authority final artifact mismatch: ${artifact.finalRelativePath}`);
    }
  }
  const generation = await authorityGeneration(
    authorityRoot,
    transaction.immutableIndexGenerationRelativePath,
    transaction.nextIndexSha256,
    expectedCurrentState,
  );
  const current = await authorityCurrentIndex(authorityRoot);
  if (current.indexSha256 !== transaction.nextIndexSha256) throw new Error('Tool-authority current index does not match recovered generation');
  return generation;
}

/** Recover one fixed tool-authority infrastructure transaction. */
export async function recoverToolAuthorityPublication(request: ToolAuthorityPublicationRecoveryRequest): Promise<ToolAuthorityPublicationRecoveryResult> {
  if (!request.acknowledgeNoLiveWriter) throw new Error('Tool-authority recovery requires --acknowledge-no-live-writer');
  if (!isLowerId(request.recoveryNonce)) throw new Error('Tool-authority recovery nonce must be a lowercase SHA-256');
  if (request.fromLock === true && request.transactionId !== undefined) throw new Error('Tool-authority recovery accepts exactly one transaction selector');
  if (request.fromLock !== true && request.transactionId === undefined) throw new Error('Tool-authority recovery requires --from-lock or --transaction-id');
  const authorityRoot = await resolveToolAuthorityRoot(request.root);
  const lock = await readAuthorityLock(authorityRoot);
  const transactionId = request.fromLock ? lock.intendedTransactionId : request.transactionId;
  if (!transactionId || !isLowerId(transactionId) || transactionId !== lock.intendedTransactionId) throw new Error('Tool-authority recovery transaction does not match lock');
  if (lock.recoveryNonce !== request.recoveryNonce) throw new Error('Tool-authority recovery nonce does not match lock');
  const recomputedTransactionId = toolAuthorityTransactionId(
    lock.operation,
    lock.expectedCurrentState,
    lock.nextIndexSha256,
    lock.artifactSetSha256,
  );
  if (recomputedTransactionId !== lock.intendedTransactionId) throw new Error('Tool-authority lock intended transaction id is not derived from its immutable intent');
  const recomputedRecoveryNonce = toolAuthorityRecoveryNonce(recomputedTransactionId, lock.expectedCurrentState);
  if (recomputedRecoveryNonce !== lock.recoveryNonce) throw new Error('Tool-authority lock recovery nonce is not derived from its immutable intent');
  const lockPath = join(authorityRoot, TOOL_AUTHORITY_LOCK_NAME);
  const transactionPath = join(authorityRoot, TOOL_AUTHORITY_TRANSACTION_NAME);
  let transaction: CalibrationToolAuthorityPublicationTransactionV1 | undefined;
  try {
    transaction = await readAuthorityTransaction(authorityRoot, transactionId);
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
    try {
      transaction = await readAuthorityTransactionSidecar(authorityRoot, transactionId);
      if (transaction.lockSha256 !== lock.lockSha256 || transaction.nextIndexSha256 !== lock.nextIndexSha256) throw new Error('Tool-authority transaction sidecar does not match lock');
    } catch (sidecarError) {
      if ((sidecarError as { code?: string }).code !== 'ENOENT') throw sidecarError;
      const completion = await readAuthorityCompletion(authorityRoot, transactionId).catch((completionError) => {
        if ((completionError as { code?: string }).code === 'ENOENT') return undefined;
        throw completionError;
      });
      const current = await optionalAuthorityCurrentIndex(authorityRoot);
      if (completion && current?.indexSha256 === lock.nextIndexSha256 && completion.nextIndexSha256 === lock.nextIndexSha256 && authorityArtifactSetSha256(authorityTransactionArtifacts(completion)) === lock.artifactSetSha256) {
        assertAuthorityTransactionMatchesLock(lock, completion);
        await verifyAuthorityPromotedOutput(authorityRoot, completion, lock.expectedCurrentState);
        await removeAuthorityOwnedPath(authorityRoot, TOOL_AUTHORITY_LOCK_NAME, canonicalBytesSha256(lock));
        await syncDirectory(authorityRoot);
        return { complete: true, recovered: true, rolledBack: false, transactionId, nextIndexSha256: lock.nextIndexSha256, currentIndexSha256: current.indexSha256, lockPath, transactionPath, reason: 'Validated completion marker found after transaction unlink' };
      }
      throw new Error('Tool-authority lock has no transaction or validated completion marker');
    }
  }
  assertAuthorityTransactionMatchesLock(lock, transaction);
  if (authorityArtifactSetSha256(authorityTransactionArtifacts(transaction)) !== lock.artifactSetSha256) throw new Error('Tool-authority transaction artifact set does not match lock');
  let current = await optionalAuthorityCurrentIndex(authorityRoot);
  let phase = transaction.state.phase;
  const verifyStages = async (): Promise<void> => {
    for (const artifact of transaction!.artifacts) {
      await regularContainedFile(authorityRoot, resolve(authorityRoot, artifact.stagedRelativePath));
      const bytes = await readFile(resolve(authorityRoot, artifact.stagedRelativePath));
      if (bytes.byteLength !== artifact.bytes || createHash('sha256').update(bytes).digest('hex') !== artifact.sha256) throw new Error(`Tool-authority staged artifact mismatch: ${artifact.stagedRelativePath}`);
    }
  };
  const verifyFinals = async (): Promise<void> => {
    for (const artifact of transaction!.artifacts) {
      const absolute = resolve(authorityRoot, artifact.finalRelativePath);
      await regularContainedFile(authorityRoot, absolute);
      const bytes = await readFile(absolute);
      if (bytes.byteLength !== artifact.bytes || createHash('sha256').update(bytes).digest('hex') !== artifact.sha256) throw new Error(`Tool-authority final artifact mismatch: ${artifact.finalRelativePath}`);
    }
  };
  if (phase === 'intent_fsynced') {
    try { await verifyStages(); } catch (error) {
      await removeAuthorityTransactionOwnedFiles(authorityRoot, transaction, false);
      await removeAuthorityOwnedPath(authorityRoot, TOOL_AUTHORITY_TRANSACTION_NAME, canonicalBytesSha256(transaction));
      await removeAuthorityOwnedPath(authorityRoot, TOOL_AUTHORITY_LOCK_NAME, canonicalBytesSha256(lock));
      await syncDirectory(authorityRoot);
      return { complete: false, recovered: true, rolledBack: true, transactionId, nextIndexSha256: lock.nextIndexSha256, lockPath, transactionPath, reason: error instanceof Error ? `Rolled back incomplete staging: ${error.message}` : 'Rolled back incomplete staging' };
    }
    transaction = await updateAuthorityTransaction(authorityRoot, transactionPath, transaction as unknown as Record<string, unknown>, 'artifacts_staged_fsynced') as unknown as CalibrationToolAuthorityPublicationTransactionV1;
    phase = 'artifacts_staged_fsynced';
  }
  if (phase === 'artifacts_staged_fsynced') {
    await verifyStages();
    for (const artifact of transaction.artifacts) await promoteAuthorityArtifact(authorityRoot, artifact.stagedRelativePath, artifact.finalRelativePath, artifact.bytes, artifact.sha256);
    transaction = await updateAuthorityTransaction(authorityRoot, transactionPath, transaction as unknown as Record<string, unknown>, 'artifacts_promoted') as unknown as CalibrationToolAuthorityPublicationTransactionV1;
    phase = 'artifacts_promoted';
  }
  if (phase === 'artifacts_promoted') {
    await verifyFinals();
    await authorityGeneration(authorityRoot, transaction.immutableIndexGenerationRelativePath, transaction.nextIndexSha256, transaction.expectedCurrentState);
    transaction = await updateAuthorityTransaction(authorityRoot, transactionPath, transaction as unknown as Record<string, unknown>, 'index_generation_fsynced') as unknown as CalibrationToolAuthorityPublicationTransactionV1;
    phase = 'index_generation_fsynced';
  }
  if (phase === 'index_generation_fsynced') {
    await verifyFinals();
    const generation = await authorityGeneration(authorityRoot, transaction.immutableIndexGenerationRelativePath, transaction.nextIndexSha256, transaction.expectedCurrentState);
    await writeAuthorityObject(authorityRoot, transaction.nextIndexTemporaryRelativePath, generation);
    transaction = await updateAuthorityTransaction(authorityRoot, transactionPath, transaction as unknown as Record<string, unknown>, 'next_index_temporary_fsynced') as unknown as CalibrationToolAuthorityPublicationTransactionV1;
    phase = 'next_index_temporary_fsynced';
  }
  if (phase === 'next_index_temporary_fsynced') {
    current = await optionalAuthorityCurrentIndex(authorityRoot);
    const expectedCurrent = lock.expectedCurrentState.kind === 'absent' ? !current : current?.indexSha256 === lock.expectedCurrentState.indexSha256;
    if (!expectedCurrent && current?.indexSha256 !== transaction.nextIndexSha256) throw new Error('Tool-authority current index changed during recovery');
    if (current?.indexSha256 !== transaction.nextIndexSha256) {
      await rename(resolve(authorityRoot, transaction.nextIndexTemporaryRelativePath), join(authorityRoot, 'index.json'));
      await syncDirectory(authorityRoot);
    }
    transaction = await updateAuthorityTransaction(authorityRoot, transactionPath, transaction as unknown as Record<string, unknown>, 'index_promoted') as unknown as CalibrationToolAuthorityPublicationTransactionV1;
    phase = 'index_promoted';
  }
  if (phase === 'index_promoted') {
    current = await authorityCurrentIndex(authorityRoot);
    if (current.indexSha256 !== transaction.nextIndexSha256) throw new Error('Tool-authority recovered current index does not match next generation');
    await syncDirectory(join(authorityRoot, 'index-generations'));
    await syncDirectory(join(authorityRoot, 'profiles'));
    await syncDirectory(join(authorityRoot, 'invocation-intents'));
    await syncDirectory(join(authorityRoot, 'receipts'));
    transaction = await updateAuthorityTransaction(authorityRoot, transactionPath, transaction as unknown as Record<string, unknown>, 'output_directories_fsynced') as unknown as CalibrationToolAuthorityPublicationTransactionV1;
    phase = 'output_directories_fsynced';
  }
  if (phase === 'output_directories_fsynced') transaction = await updateAuthorityTransaction(authorityRoot, transactionPath, transaction as unknown as Record<string, unknown>, 'complete') as unknown as CalibrationToolAuthorityPublicationTransactionV1;
  // A completion/cleanup crash must not turn a stale or tampered authority
  // tree into a successful recovery. Re-open every referenced object,
  // generation, and current pointer immediately before unlinking the lock.
  await verifyAuthorityPromotedOutput(authorityRoot, transaction, lock.expectedCurrentState);
  await removeAuthorityTransactionOwnedFiles(authorityRoot, transaction, false);
  await removeAuthorityOwnedPath(authorityRoot, TOOL_AUTHORITY_TRANSACTION_NAME, canonicalBytesSha256(transaction));
  await syncDirectory(authorityRoot);
  await removeAuthorityOwnedPath(authorityRoot, TOOL_AUTHORITY_LOCK_NAME, canonicalBytesSha256(lock));
  await syncDirectory(authorityRoot);
  current = await authorityCurrentIndex(authorityRoot);
  return { complete: true, recovered: true, rolledBack: false, transactionId, nextIndexSha256: transaction.nextIndexSha256, currentIndexSha256: current.indexSha256, lockPath, transactionPath };
}

async function bootstrapToolAuthority(authorityRoot: string): Promise<void> {
  const currentPath = join(authorityRoot, 'index.json');
  try {
    // Check the pointer itself before validating its immutable chain. An
    // ENOENT from a missing generation is corruption, not an empty authority
    // root and must never trigger a new genesis.
    await regularContainedFile(authorityRoot, currentPath);
    await authorityCurrentIndex(authorityRoot);
    return;
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
    const entries = await readdir(authorityRoot);
    if (entries.length > 0) {
      throw new Error('Tool-authority current index is absent but authority history exists');
    }
  }
  const profiles: Array<Record<string, unknown>> = [];
  const refs: Array<Record<string, unknown>> = [];
  const artifacts: AuthorityArtifactSpec[] = [];
  for (const profileId of [...FROZEN_ADMISSION_PROFILE_IDS].sort()) {
    const profile = toolAuthorityProfile(profileId);
    const profilePath = `profiles/${profileId}.json`;
    const profileBytes = Buffer.from(deepCanonical(profile), 'utf8');
    profiles.push(profile);
    refs.push({ profileId, relativePath: profilePath, sha256: createHash('sha256').update(profileBytes).digest('hex') });
    artifacts.push({
      stagedRelativePath: `${TOOL_AUTHORITY_TRANSACTIONS_ROOT}/pending/profile-${profileId}.json`,
      finalRelativePath: profilePath,
      value: profile,
      bytes: profileBytes.byteLength,
      sha256: createHash('sha256').update(profileBytes).digest('hex'),
    });
  }
  const withoutHash: Record<string, unknown> = {
    version: 'v10.3-admission-tool-authority-index-v1',
    generation: 0,
    profiles: refs,
    invocationIntents: [],
    receipts: [],
  };
  const index = { ...withoutHash, indexSha256: authorityIndexHash(withoutHash) };
  await publishAuthorityGeneration({
    authorityRoot,
    operation: 'create',
    expectedCurrentState: { kind: 'absent' },
    nextIndex: index as AuthorityIndex,
    artifacts,
  });
}

function publicationIntent(profile: Record<string, unknown>, input: AcquisitionPublicationReceiptInput): Record<string, unknown> {
  const withoutHashes = {
    version: 'v10.3-admission-invocation-intent-v1',
    intentId: '',
    profileId: profile.profileId,
    profileSha256: profile.profileSha256,
    action: PUBLICATION_ACTION,
    canonicalArgvSha256: input.argvSha256 ?? calibrationAdmissionSha256({ action: PUBLICATION_ACTION, operation: input.operation, proposalSha256: input.proposalSha256 }),
    inputSetSha256: calibrationAdmissionSha256({ proposalSha256: input.proposalSha256, operation: input.operation, nextIndexSha256: input.nextIndexSha256 }),
    executableBehaviorSha256: calibrationAdmissionSha256({ node: process.version, action: PUBLICATION_ACTION, network: 'deny' }),
  };
  const intentId = calibrationAdmissionInvocationIntentId({ ...withoutHashes, intentSha256: '' });
  const withId = { ...withoutHashes, intentId };
  return { ...withId, intentSha256: calibrationAdmissionSha256(withId) };
}

// Retained below only as a historical implementation reference while the
// locked generation publisher is exercised by the live path.
async function createLegacyLocalToolAuthorityPublisher(authorityRootInput: string): Promise<AcquisitionPublicationReceiptPublisher> {
  const authorityRootInputAbsolute = resolve(authorityRootInput);
  await mkdir(authorityRootInputAbsolute, { recursive: true, mode: 0o700 });
  const authorityRoot = await realpath(authorityRootInputAbsolute);
  return async (input) => {
    await mkdir(authorityRoot, { recursive: true, mode: 0o700 });
    await bootstrapToolAuthority(authorityRoot);
    const indexPath = join(authorityRoot, 'index.json');
    const indexParsed = await readJsonFile(indexPath);
    if (!validateAuthorityIndex(indexParsed)) throw new Error('Tool-authority current index is unavailable or invalid');
    const index = indexParsed as AuthorityIndex;
    const profileRef = index.profiles.find((ref) => ref.profileId === PROFILE_ID);
    if (!profileRef) throw new Error('Tool-authority profile is not indexed');
    const profilePath = resolve(authorityRoot, profileRef.relativePath);
    await regularContainedFile(authorityRoot, profilePath);
    const profileBytes = await readFile(profilePath);
    if (createHash('sha256').update(profileBytes).digest('hex') !== profileRef.sha256) throw new Error('Indexed publication profile bytes changed');
    const profile = JSON.parse(profileBytes.toString('utf8')) as Record<string, unknown>;
    if (!isCalibrationAdmissionToolProfileV1(profile) || profile.profileId !== PROFILE_ID) throw new Error('Publication profile is invalid');
    const intent = publicationIntent(profile, input);
    if (intent.intentId !== input.invocationIntentId) throw new Error('Publication invocation intent id does not match the frozen profile/input contract');
    if (!isRecord(intent)) throw new Error('Publication invocation intent is invalid');
    const intentBytes = Buffer.from(deepCanonical(intent), 'utf8');
    const intentSha256 = createHash('sha256').update(intentBytes).digest('hex');
    const intentRef = { intentId: input.invocationIntentId, relativePath: `invocation-intents/${input.invocationIntentId}.json`, sha256: intentSha256 };
    const existingIntent = index.invocationIntents.find((ref) => ref.intentId === input.invocationIntentId);
    if (existingIntent && existingIntent.sha256 !== intentSha256) throw new Error('Publication invocation intent collision');
    const receipt = localAuthorityReceipt(input, profile as unknown as CalibrationAdmissionToolProfileV1, intent as unknown as CalibrationAdmissionInvocationIntentV1);
    const receiptId = String(receipt.receiptId);
    const receiptPath = `receipts/${receiptId}.json`;
    const receiptBytes = Buffer.from(deepCanonical(receipt), 'utf8');
    const receiptSha256 = createHash('sha256').update(receiptBytes).digest('hex');
    const receiptRef = { receiptId, relativePath: receiptPath, sha256: receiptSha256 };
    const existingReceipt = index.receipts.find((ref) => ref.receiptId === receiptId);
    if (existingReceipt && existingReceipt.sha256 !== receiptSha256) throw new Error('Tool-authority receipt collision');
    if (existingReceipt && existingIntent) return { receiptId, receiptSha256, toolAuthorityIndexSha256: index.indexSha256 };

    const withIntent = existingIntent ? index : {
      version: index.version,
      generation: index.generation + 1,
      parentIndexSha256: index.indexSha256,
      profiles: index.profiles,
      invocationIntents: [...index.invocationIntents, intentRef].sort((a, b) => a.intentId.localeCompare(b.intentId)),
      receipts: index.receipts,
      indexSha256: '',
    };
    if (!validateAuthorityIndex({ ...withIntent, indexSha256: authorityIndexHash(withIntent as unknown as Record<string, unknown>) })) throw new Error('Publication intent generation is invalid');
    const intentIndex = { ...withIntent, indexSha256: authorityIndexHash(withIntent as unknown as Record<string, unknown>) } as Record<string, unknown>;
    const withReceipt = {
      version: index.version,
      generation: Number(intentIndex.generation) + (existingReceipt ? 0 : 1),
      parentIndexSha256: String(intentIndex.indexSha256),
      profiles: index.profiles,
      invocationIntents: intentIndex.invocationIntents,
      receipts: existingReceipt ? index.receipts : [...index.receipts, receiptRef].sort((a, b) => a.receiptId.localeCompare(b.receiptId)),
      indexSha256: '',
    };
    const finalIndex = { ...withReceipt, indexSha256: authorityIndexHash(withReceipt as unknown as Record<string, unknown>) } as Record<string, unknown>;
    if (!validateAuthorityIndex(finalIndex)) throw new Error('Publication receipt generation is invalid');
    const transactionId = calibrationAdmissionSha256({ domain: 'v10.3-tool-authority-publication-transaction-v1', parent: index.indexSha256, next: finalIndex.indexSha256, receiptId });
    const recoveryNonce = calibrationAdmissionSha256({ domain: 'v10.3-tool-authority-recovery-nonce-v1', transactionId, parent: index.indexSha256 });
    const artifactSetSha256 = calibrationAdmissionSha256({ intent: intentRef, receipt: receiptRef, next: finalIndex.indexSha256 });
    const lockWithoutId = {
      version: 'v10.3-tool-authority-publication-lock-v1',
      intendedTransactionId: transactionId,
      operation: 'replace',
      expectedCurrentState: { kind: 'existing', indexSha256: index.indexSha256 },
      nextIndexSha256: finalIndex.indexSha256,
      artifactSetSha256,
      recoveryNonce,
    };
    const lockId = calibrationAdmissionSha256(lockWithoutId);
    const lockBase = { ...lockWithoutId, lockId };
    const lock = { ...lockBase, lockSha256: authorityLockHash(lockBase) };
    const transactionBase = {
      version: 'v10.3-tool-authority-publication-transaction-v1',
      transactionId,
      lockSha256: lock.lockSha256,
      operation: 'replace',
      expectedCurrentState: lock.expectedCurrentState,
      nextIndexSha256: finalIndex.indexSha256,
      artifacts: [
        ...(existingIntent ? [] : [{ stagedRelativePath: `${TOOL_AUTHORITY_TRANSACTIONS_ROOT}/${transactionId}/intent.json`, finalRelativePath: intentRef.relativePath, bytes: intentBytes.byteLength, sha256: intentSha256 }]),
        ...(existingReceipt ? [] : [{ stagedRelativePath: `${TOOL_AUTHORITY_TRANSACTIONS_ROOT}/${transactionId}/receipt.json`, finalRelativePath: receiptPath, bytes: receiptBytes.byteLength, sha256: receiptSha256 }]),
      ],
      immutableIndexGenerationRelativePath: `index-generations/${finalIndex.indexSha256}.json`,
      nextIndexTemporaryRelativePath: `${TOOL_AUTHORITY_TRANSACTIONS_ROOT}/${transactionId}/current-index.json`,
      state: { phase: 'intent_fsynced' },
    };
    const transaction = { ...transactionBase, transactionSha256: authorityTransactionHash(transactionBase) };
    const lockPath = join(authorityRoot, TOOL_AUTHORITY_LOCK_NAME);
    const transactionPath = join(authorityRoot, TOOL_AUTHORITY_TRANSACTION_NAME);
    let currentTransaction: Record<string, unknown> = transaction as unknown as Record<string, unknown>;
    let lockOwned = false;
    try {
      await writeWx(lockPath, Buffer.from(deepCanonical(lock), 'utf8'));
      lockOwned = true;
      if (!isCalibrationToolAuthorityPublicationLockV1(lock)) throw new Error('Tool-authority publication lock failed Core validation');
      await syncFile(lockPath);
      await syncDirectory(authorityRoot);
      await invokeToolAuthorityHook(input.toolAuthorityPhaseHook, 'lock-file-fsynced');
      const currentAfterLock = await authorityCurrentIndex(authorityRoot);
      if (currentAfterLock.indexSha256 !== index.indexSha256) throw new Error('Tool-authority current index changed before publication lock was acquired');
      await writeWx(transactionPath, Buffer.from(deepCanonical(transaction), 'utf8'));
      await syncFile(transactionPath);
      await syncDirectory(authorityRoot);
      await invokeToolAuthorityHook(input.toolAuthorityPhaseHook, 'transaction-fsynced');
      if (!isCalibrationToolAuthorityPublicationTransactionV1(transaction)) throw new Error('Tool-authority publication transaction failed Core validation');

      const artifacts = transaction.artifacts as unknown as Array<Record<string, unknown>>;
      await ensureDirectory(authorityRoot, join(authorityRoot, TOOL_AUTHORITY_TRANSACTIONS_ROOT, transactionId));
      for (const artifact of artifacts) {
        const value = artifact.finalRelativePath === intentRef.relativePath ? intent : receipt;
        await writeAuthorityObject(authorityRoot, String(artifact.stagedRelativePath), value);
      }
      currentTransaction = await updateAuthorityTransaction(authorityRoot, transactionPath, currentTransaction, 'artifacts_staged_fsynced');
      await invokeToolAuthorityHook(input.toolAuthorityPhaseHook, 'artifacts-staged-fsynced');
      for (const artifact of artifacts) {
        await promoteAuthorityArtifact(authorityRoot, String(artifact.stagedRelativePath), String(artifact.finalRelativePath), Number(artifact.bytes), String(artifact.sha256));
      }
      currentTransaction = await updateAuthorityTransaction(authorityRoot, transactionPath, currentTransaction, 'artifacts_promoted');
      await invokeToolAuthorityHook(input.toolAuthorityPhaseHook, 'artifacts-promoted');

      const generationRelativePath = String(transaction.immutableIndexGenerationRelativePath);
      await writeAuthorityObject(authorityRoot, generationRelativePath, finalIndex);
      currentTransaction = await updateAuthorityTransaction(authorityRoot, transactionPath, currentTransaction, 'index_generation_fsynced');
      await invokeToolAuthorityHook(input.toolAuthorityPhaseHook, 'index-generation-fsynced');

      const temporaryRelativePath = String(transaction.nextIndexTemporaryRelativePath);
      await writeAuthorityObject(authorityRoot, temporaryRelativePath, finalIndex);
      currentTransaction = await updateAuthorityTransaction(authorityRoot, transactionPath, currentTransaction, 'next_index_temporary_fsynced');
      await invokeToolAuthorityHook(input.toolAuthorityPhaseHook, 'next-index-temporary-fsynced');

      const currentBeforePromote = await authorityCurrentIndex(authorityRoot);
      if (currentBeforePromote.indexSha256 !== index.indexSha256) throw new Error('Tool-authority current index changed during publication');
      const temporaryPath = resolve(authorityRoot, temporaryRelativePath);
      const currentPath = join(authorityRoot, 'index.json');
      await rename(temporaryPath, currentPath);
      await syncDirectory(authorityRoot);
      currentTransaction = await updateAuthorityTransaction(authorityRoot, transactionPath, currentTransaction, 'index_promoted');
      await invokeToolAuthorityHook(input.toolAuthorityPhaseHook, 'index-promoted');
      await syncDirectory(join(authorityRoot, 'index-generations'));
      await syncDirectory(join(authorityRoot, 'profiles'));
      await syncDirectory(join(authorityRoot, 'invocation-intents'));
      await syncDirectory(join(authorityRoot, 'receipts'));
      currentTransaction = await updateAuthorityTransaction(authorityRoot, transactionPath, currentTransaction, 'output_directories_fsynced');
      await invokeToolAuthorityHook(input.toolAuthorityPhaseHook, 'output-directories-fsynced');
      currentTransaction = await updateAuthorityTransaction(authorityRoot, transactionPath, currentTransaction, 'complete');
      await invokeToolAuthorityHook(input.toolAuthorityPhaseHook, 'complete');

      for (const artifact of artifacts) {
        try { await unlink(resolve(authorityRoot, String(artifact.stagedRelativePath))); } catch (error) { if ((error as { code?: string }).code !== 'ENOENT') throw error; }
      }
      try { await rmdir(join(authorityRoot, TOOL_AUTHORITY_TRANSACTIONS_ROOT, transactionId)); } catch (error) { if ((error as { code?: string }).code !== 'ENOENT') throw error; }
      await syncDirectory(join(authorityRoot, TOOL_AUTHORITY_TRANSACTIONS_ROOT));
      try { await unlink(transactionPath); } catch (error) { if ((error as { code?: string }).code !== 'ENOENT') throw error; }
      await syncDirectory(authorityRoot);
      await invokeToolAuthorityHook(input.toolAuthorityPhaseHook, 'transaction-unlinked');
      try { await unlink(lockPath); } catch (error) { if ((error as { code?: string }).code !== 'ENOENT') throw error; }
      await syncDirectory(authorityRoot);
      await invokeToolAuthorityHook(input.toolAuthorityPhaseHook, 'lock-unlinked');
    } catch (error) {
      // A stale-current rejection happens before any immutable object is
      // promoted, so it is safe to remove only this writer's lock/journal.
      if (lockOwned && error instanceof Error && /changed before publication lock|changed during publication/.test(error.message)) {
        try { await unlink(transactionPath); } catch (cleanupError) { if ((cleanupError as { code?: string }).code !== 'ENOENT') throw cleanupError; }
        try { await unlink(lockPath); } catch (cleanupError) { if ((cleanupError as { code?: string }).code !== 'ENOENT') throw cleanupError; }
        await syncDirectory(authorityRoot);
      }
      throw error;
    }
    return { receiptId, receiptSha256, toolAuthorityIndexSha256: String(finalIndex.indexSha256) };
  };
}

async function publicationProfile(authorityRoot: string, index: AuthorityIndex): Promise<CalibrationAdmissionToolProfileV1> {
  const profileRef = index.profiles.find((ref) => ref.profileId === PROFILE_ID);
  if (!profileRef) throw new Error('Tool-authority profile is not indexed');
  const profile = await readAuthorityReferencedJson(authorityRoot, profileRef.relativePath, profileRef.sha256);
  if (!isCalibrationAdmissionToolProfileV1(profile) || profile.profileId !== PROFILE_ID) throw new Error('Publication profile is invalid');
  return profile;
}

async function publishLocalToolAuthorityIntent(
  authorityRootInput: string,
  input: AcquisitionPublicationReceiptInput,
): Promise<{ readonly indexSha256: string; readonly intent: CalibrationAdmissionInvocationIntentV1; readonly profile: CalibrationAdmissionToolProfileV1 }> {
  const authorityRootInputAbsolute = resolve(authorityRootInput);
  await mkdir(authorityRootInputAbsolute, { recursive: true, mode: 0o700 });
  const authorityRoot = await realpath(authorityRootInputAbsolute);
  await bootstrapToolAuthority(authorityRoot);
  const index = await authorityCurrentIndex(authorityRoot);
  await validateAuthorityGenerationObjects(authorityRoot, index);
  const profile = await publicationProfile(authorityRoot, index);
  const intent = publicationIntent(profile as unknown as Record<string, unknown>, input);
  if (intent.intentId !== input.invocationIntentId) throw new Error('Publication invocation intent id does not match the frozen profile/input contract');
  if (!isCalibrationAdmissionInvocationIntentV1(intent, profile)) throw new Error('Publication invocation intent is invalid');
  const intentBytes = Buffer.from(deepCanonical(intent), 'utf8');
  const intentSha256 = createHash('sha256').update(intentBytes).digest('hex');
  const intentRef = { intentId: intent.intentId, relativePath: `invocation-intents/${intent.intentId}.json`, sha256: intentSha256 };
  const existing = index.invocationIntents.find((ref) => ref.intentId === intent.intentId);
  if (existing) {
    if (existing.sha256 !== intentSha256) throw new Error('Publication invocation intent collision');
    await readAuthorityReferencedJson(authorityRoot, existing.relativePath, existing.sha256);
    return { indexSha256: index.indexSha256, intent, profile };
  }
  const withoutHash = {
    version: index.version,
    generation: index.generation + 1,
    parentIndexSha256: index.indexSha256,
    profiles: index.profiles,
    invocationIntents: [...index.invocationIntents, intentRef].sort((left, right) => left.intentId.localeCompare(right.intentId)),
    receipts: index.receipts,
  };
  const nextIndex = { ...withoutHash, indexSha256: authorityIndexHash(withoutHash) } as AuthorityIndex;
  if (!validateAuthorityIndex(nextIndex)) throw new Error('Publication intent generation is invalid');
  const result = await publishAuthorityGeneration({
    authorityRoot,
    operation: 'replace',
    expectedCurrentState: { kind: 'existing', indexSha256: index.indexSha256 },
    nextIndex,
    artifacts: [{
      stagedRelativePath: `${TOOL_AUTHORITY_TRANSACTIONS_ROOT}/pending/intent-object.json`,
      finalRelativePath: intentRef.relativePath,
      value: intent,
      bytes: intentBytes.byteLength,
      sha256: intentSha256,
    }],
    phaseHook: input.toolAuthorityPhaseHook,
  });
  return { indexSha256: result.indexSha256, intent, profile };
}

async function createLocalToolAuthorityPublisher(authorityRootInput: string): Promise<AcquisitionPublicationReceiptPublisher> {
  const authorityRootInputAbsolute = resolve(authorityRootInput);
  await mkdir(authorityRootInputAbsolute, { recursive: true, mode: 0o700 });
  const authorityRoot = await realpath(authorityRootInputAbsolute);
  return async (input) => {
    const intentResult = await publishLocalToolAuthorityIntent(authorityRoot, input);
    const index = await authorityCurrentIndex(authorityRoot);
    const intentRef = index.invocationIntents.find((ref) => ref.intentId === input.invocationIntentId);
    if (!intentRef) throw new Error('Publication invocation intent is not indexed');
    const receipt = localAuthorityReceipt(input, intentResult.profile, intentResult.intent);
    const receiptBytes = Buffer.from(deepCanonical(receipt), 'utf8');
    const receiptSha256 = createHash('sha256').update(receiptBytes).digest('hex');
    const receiptRef = { receiptId: receipt.receiptId, relativePath: `receipts/${receipt.receiptId}.json`, sha256: receiptSha256 };
    const existingReceipt = index.receipts.find((ref) => ref.receiptId === receipt.receiptId);
    if (existingReceipt) {
      if (existingReceipt.sha256 !== receiptSha256) throw new Error('Tool-authority receipt collision');
      await readAuthorityReferencedJson(authorityRoot, existingReceipt.relativePath, existingReceipt.sha256);
      return { receiptId: receipt.receiptId, receiptSha256, toolAuthorityIndexSha256: index.indexSha256 };
    }
    const withoutHash = {
      version: index.version,
      generation: index.generation + 1,
      parentIndexSha256: index.indexSha256,
      profiles: index.profiles,
      invocationIntents: index.invocationIntents,
      receipts: [...index.receipts, receiptRef].sort((left, right) => left.receiptId.localeCompare(right.receiptId)),
    };
    const nextIndex = { ...withoutHash, indexSha256: authorityIndexHash(withoutHash) } as AuthorityIndex;
    if (!validateAuthorityIndex(nextIndex)) throw new Error('Publication receipt generation is invalid');
    const result = await publishAuthorityGeneration({
      authorityRoot,
      operation: 'replace',
      expectedCurrentState: { kind: 'existing', indexSha256: index.indexSha256 },
      nextIndex,
      artifacts: [{
        stagedRelativePath: `${TOOL_AUTHORITY_TRANSACTIONS_ROOT}/pending/receipt.json`,
        finalRelativePath: receiptRef.relativePath,
        value: receipt,
        bytes: receiptBytes.byteLength,
        sha256: receiptSha256,
      }],
      phaseHook: input.toolAuthorityPhaseHook,
    });
    return { receiptId: receipt.receiptId, receiptSha256, toolAuthorityIndexSha256: result.indexSha256 };
  };
}
