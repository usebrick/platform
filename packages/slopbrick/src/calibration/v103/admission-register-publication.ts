/**
 * Offline v10.3 source-register publication/recovery.
 *
 * This module owns only the local, already-authorized register-generation
 * transaction. It does not acquire bytes, inspect Git, or promote corpus
 * labels. Every mutation is rooted below the supplied fixture/control-plane
 * root and is journaled before the corresponding output mutation.
 */
import { createHash, randomBytes } from 'node:crypto';
import {
  mkdir,
  open,
  lstat,
  readFile,
  rename,
  realpath,
  rmdir,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import {
  calibrationAdmissionSha256,
  calibrationAdmissionCanonicalJson,
  calibrationRegisterGenerationLockSha256,
  calibrationRegisterGenerationReceiptSha256,
  calibrationRegisterGenerationTransactionSha256,
  isCalibrationAdmissionRegisterDeltaV1,
  isCalibrationAdmissionSourceRegisterV1,
  isCalibrationRegisterGenerationLockV1,
  isCalibrationRegisterGenerationReceiptV1,
  isCalibrationRegisterGenerationTransactionV1,
  validateCalibrationRegisterGenerationGraph,
  type CalibrationAdmissionRegisterDeltaV1,
  type CalibrationAdmissionSourceRegisterV1,
  type CalibrationRegisterGenerationLockV1,
  type CalibrationRegisterGenerationReceiptV1,
  type CalibrationRegisterGenerationTransactionV1,
  type CalibrationRegisterSourceGenerationV1,
} from '@usebrick/core';

const SHA256 = /^[a-f0-9]{64}$/;
const ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const REGISTER_RELATIVE_PATH = 'review/admission/source-register-v1.json';
const LOCK_RELATIVE_PATH = 'review/admission/register-generation.lock';
const TRANSACTION_RELATIVE_PATH = 'review/admission/register-generation-transaction.json';
const REGISTER_GENERATIONS_RELATIVE_ROOT = 'register-generations';
const SOURCES_RELATIVE_ROOT = 'sources';

type RegisterTransactionPhase = CalibrationRegisterGenerationTransactionV1['state']['phase'];

const PHASE_RANK: Record<RegisterTransactionPhase, number> = {
  intent_fsynced: 0,
  source_generation_directories_staged_fsynced: 1,
  source_generation_directories_promoted: 2,
  source_generation_parents_fsynced: 3,
  generation_file_fsynced: 4,
  source_current_pointers_promoted: 5,
  current_register_temporary_fsynced: 6,
  current_register_promoted: 7,
  output_directory_fsynced: 8,
  tool_receipt_indexed: 9,
  generation_receipt_staged_fsynced: 10,
  generation_receipt_promoted: 11,
  receipt_directories_fsynced: 12,
  complete: 13,
};

export type RegisterPublicationPhase =
  | 'lock-fsynced'
  | 'transaction-fsynced'
  | 'source-generation-staged-fsynced'
  | 'source-generation-promoted'
  | 'source-current-promoted'
  | 'register-promoted'
  | 'tool-receipt-indexed'
  | 'receipt-promoted'
  | 'complete'
  | 'cleanup';

export interface RegisterSourceGenerationInput {
  readonly sourceId: string;
  readonly bytes: Uint8Array;
  readonly proposalId?: string;
  readonly artifactSetSha256?: string;
}

export interface RegisterToolReceiptInput {
  readonly receiptId: string;
  readonly receiptSha256: string;
  readonly authorityIndexSha256: string;
  readonly publicationTransactionId: string;
}

export interface RegisterPublicationRequest {
  readonly root: string;
  readonly delta: unknown;
  readonly nextRegister: unknown;
  readonly sourceGenerations: readonly RegisterSourceGenerationInput[];
  readonly invocationIntentId: string;
  readonly toolReceipt: RegisterToolReceiptInput;
  readonly recoveryNonce?: string;
  readonly phaseHook?: (phase: RegisterPublicationPhase) => void | Promise<void>;
}

export interface RegisterPublicationRecoveryRequest {
  readonly root: string;
  /** Optional explicit selector; omitted means recover the fixed lock's transaction. */
  readonly transactionId?: string;
  readonly recoveryNonce: string;
  readonly toolReceipt: RegisterToolReceiptInput;
  readonly acknowledgeNoLiveWriter: boolean;
  readonly phaseHook?: (phase: RegisterPublicationPhase) => void | Promise<void>;
}

export interface RegisterPublicationResult {
  readonly complete: boolean;
  readonly recoveryRequired: boolean;
  readonly transactionId: string;
  readonly nextRegisterSha256: string;
  readonly receiptSha256?: string;
  readonly transactionPath: string;
  readonly lockPath: string;
}

export class RegisterPublicationPendingError extends Error {
  readonly result: RegisterPublicationResult;

  constructor(result: RegisterPublicationResult, message = 'Register publication requires recovery') {
    super(message);
    this.name = 'RegisterPublicationPendingError';
    this.result = result;
  }
}

interface Layout {
  readonly root: string;
  readonly admission: string;
  readonly registerPath: string;
  readonly lockPath: string;
  readonly transactionPath: string;
  readonly generations: string;
  readonly sources: string;
}

interface Context {
  readonly layout: Layout;
  readonly delta: CalibrationAdmissionRegisterDeltaV1;
  readonly nextRegister: CalibrationAdmissionSourceRegisterV1;
  readonly lock: CalibrationRegisterGenerationLockV1;
  transaction: CalibrationRegisterGenerationTransactionV1;
  readonly receipt: CalibrationRegisterGenerationReceiptV1;
  readonly nextRegisterBytes: Buffer;
  readonly sourceBytes: ReadonlyMap<string, Buffer>;
  readonly phaseHook?: (phase: RegisterPublicationPhase) => void | Promise<void>;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function id(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value);
}

function sha(value: unknown): value is string {
  return typeof value === 'string' && SHA256.test(value);
}

function canonical(value: unknown): Buffer {
  return Buffer.from(calibrationAdmissionCanonicalJson(value), 'utf8');
}

function inside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !rel.startsWith('/'));
}

function rootPath(layout: Layout, relativePath: string): string {
  if (relativePath.startsWith('/') || relativePath.includes('\\')) throw new Error('Register path must be relative and POSIX-shaped');
  const absolute = resolve(layout.root, relativePath);
  if (!inside(layout.root, absolute)) throw new Error('Register path escapes root');
  return absolute;
}

function admissionPath(layout: Layout, relativePath: string): string {
  return rootPath(layout, `review/admission/${relativePath}`);
}

async function ensureLayout(rootInput: string): Promise<Layout> {
  const requestedRoot = resolve(rootInput);
  await mkdir(requestedRoot, { recursive: true });
  const root = await realpath(requestedRoot);
  await mkdir(root, { recursive: true });
  const admission = join(root, 'review', 'admission');
  const generations = join(admission, REGISTER_GENERATIONS_RELATIVE_ROOT);
  const sources = join(admission, SOURCES_RELATIVE_ROOT);
  // Check before mkdir as well as after it.  A pre-existing symlink in the
  // control-plane path must never be traversed by recursive mkdir.
  await Promise.all([
    assertNoSymlinkPath(root, admission),
    assertNoSymlinkPath(root, generations),
    assertNoSymlinkPath(root, sources),
  ]);
  await Promise.all([
    mkdir(admission, { recursive: true }),
    mkdir(generations, { recursive: true }),
    mkdir(sources, { recursive: true }),
  ]);
  await Promise.all([
    assertNoSymlinkPath(root, admission),
    assertNoSymlinkPath(root, generations),
    assertNoSymlinkPath(root, sources),
  ]);
  return {
    root,
    admission,
    registerPath: rootPath({ root } as Layout, REGISTER_RELATIVE_PATH),
    lockPath: rootPath({ root } as Layout, LOCK_RELATIVE_PATH),
    transactionPath: rootPath({ root } as Layout, TRANSACTION_RELATIVE_PATH),
    generations,
    sources,
  };
}

async function assertNoSymlinkPath(root: string, candidate: string): Promise<void> {
  const relativePath = relative(root, candidate);
  if (relativePath.startsWith(`..${sep}`) || relativePath === '..' || relativePath.startsWith('/')) throw new Error('Register path escapes root');
  let current = root;
  for (const segment of relativePath.split(sep)) {
    if (!segment) continue;
    current = join(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error(`Register path contains a symlink: ${relativePath}`);
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') break;
      throw error;
    }
  }
}

async function syncFile(path: string): Promise<void> {
  const handle = await open(path, 'r+');
  try { await handle.sync(); } finally { await handle.close(); }
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

async function writeExclusive(path: string, bytes: Uint8Array, root?: string): Promise<void> {
  if (root) await assertNoSymlinkPath(root, path);
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(path, 'wx', 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally { await handle.close(); }
  await syncDirectory(dirname(path));
}

async function writeReplace(path: string, bytes: Uint8Array, transactionId: string, root?: string): Promise<void> {
  if (root) await assertNoSymlinkPath(root, path);
  const temporary = `${path}.${transactionId}.tmp`;
  if (root) await assertNoSymlinkPath(root, temporary);
  try {
    await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if ((error as { code?: string }).code !== 'EEXIST') throw error;
    await assertExistingBytes(temporary, bytes, root);
  }
  await syncFile(temporary);
  if (root) await assertNoSymlinkPath(root, path);
  await rename(temporary, path);
  await syncDirectory(dirname(path));
}

async function readJsonWithin(root: string, path: string): Promise<unknown> {
  await assertNoSymlinkPath(root, path);
  const bytes = await readFile(path);
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString('utf8')) as unknown;
  } catch {
    throw new Error(`Invalid JSON: ${path}`);
  }
  // All authority records written by this module are canonical.  Recovery
  // must not silently accept a byte-mutated journal that happens to parse.
  if (!Buffer.from(bytes).equals(canonical(value))) throw new Error(`Non-canonical JSON authority: ${path}`);
  return value;
}

async function readBytesWithin(root: string, path: string): Promise<Buffer> {
  await assertNoSymlinkPath(root, path);
  return readFile(path);
}

async function ensureDirectory(root: string, path: string): Promise<void> {
  await assertNoSymlinkPath(root, path);
  await mkdir(path, { recursive: true });
  await assertNoSymlinkPath(root, path);
}

function sourceGenerationPaths(layout: Layout, transactionId: string, sourceId: string, generationSha256: string): {
  readonly staging: string;
  readonly finalDirectory: string;
  readonly finalFile: string;
  readonly parent: string;
  readonly currentTemporary: string;
  readonly currentFinal: string;
} {
  const sourceRoot = `${SOURCES_RELATIVE_ROOT}/${sourceId}`;
  const parent = `${sourceRoot}/generations`;
  return {
    staging: `transactions/${transactionId}/sources/${sourceId}/generation`,
    finalDirectory: `${parent}/${generationSha256}`,
    finalFile: `${parent}/${generationSha256}/source-generation.json`,
    parent,
    currentTemporary: `${sourceRoot}/current.${transactionId}.tmp.json`,
    currentFinal: `${sourceRoot}/current.json`,
  };
}

function transactionPaths(transactionId: string, nextHash: string): {
  readonly immutableRegister: string;
  readonly currentTemporary: string;
  readonly receiptTemporary: string;
  readonly receiptFinal: string;
} {
  const receiptId = `generation-receipt-${transactionId}`;
  return {
    immutableRegister: `register-generations/${nextHash}/register.json`,
    currentTemporary: `transactions/${transactionId}/current-register.tmp.json`,
    receiptTemporary: `transactions/${transactionId}/generation-receipt.tmp.json`,
    receiptFinal: `register-generations/receipts/${receiptId}.json`,
  };
}

function nextRegisterStagingRelativePath(transactionId: string): string {
  return `transactions/${transactionId}/next-register.json`;
}

function registerReceiptId(transactionId: string): string {
  return `generation-receipt-${transactionId}`;
}

function deriveTransactionId(delta: CalibrationAdmissionRegisterDeltaV1, nextHash: string, invocationIntentId: string, recoveryNonce: string): string {
  return calibrationAdmissionSha256({
    domain: 'v10.3-register-generation-transaction-id-v1',
    // The lock carries the delta ID, parent, next hash, intent, and nonce, so
    // a lock-only crash can recompute this identity without opening a
    // transaction.  The proposal's self-hash is still checked separately
    // before any roll-forward.
    deltaId: delta.deltaId,
    parentRegisterSha256: delta.parentRegisterSha256,
    nextRegisterSha256: nextHash,
    invocationIntentId,
    recoveryNonce,
  });
}

function deriveTransactionIdFromLock(lock: CalibrationRegisterGenerationLockV1): string {
  return calibrationAdmissionSha256({
    domain: 'v10.3-register-generation-transaction-id-v1',
    deltaId: lock.deltaId,
    parentRegisterSha256: lock.expectedCurrentRegisterSha256,
    nextRegisterSha256: lock.nextRegisterSha256,
    invocationIntentId: lock.invocationIntentId,
    recoveryNonce: lock.recoveryNonce,
  });
}

function makeLock(delta: CalibrationAdmissionRegisterDeltaV1, nextHash: string, invocationIntentId: string, recoveryNonce: string, transactionId: string): CalibrationRegisterGenerationLockV1 {
  const base = {
    version: 'v10.3-register-generation-lock-v1' as const,
    lockId: `lock-${transactionId}`,
    intendedTransactionId: transactionId,
    invocationIntentId,
    expectedCurrentRegisterSha256: delta.parentRegisterSha256,
    nextRegisterSha256: nextHash,
    deltaId: delta.deltaId,
    recoveryNonce,
  };
  return { ...base, lockSha256: calibrationRegisterGenerationLockSha256(base) };
}

function makeSourceGeneration(
  layout: Layout,
  transactionId: string,
  source: RegisterSourceGenerationInput,
  generationSha256: string,
  artifactSetSha256: string,
): CalibrationRegisterSourceGenerationV1 {
  const paths = sourceGenerationPaths(layout, transactionId, source.sourceId, generationSha256);
  return {
    sourceId: source.sourceId,
    proposalId: source.proposalId ?? `proposal-${source.sourceId}`,
    generationSha256,
    artifactSetSha256,
    generationStagingRelativePath: paths.staging,
    generationFinalRelativePath: paths.finalFile,
    generationsParentRelativePath: paths.parent,
    currentPointerTemporaryRelativePath: paths.currentTemporary,
    currentPointerFinalRelativePath: paths.currentFinal,
  };
}

function makeTransaction(
  delta: CalibrationAdmissionRegisterDeltaV1,
  nextHash: string,
  invocationIntentId: string,
  lock: CalibrationRegisterGenerationLockV1,
  sourceGenerations: readonly CalibrationRegisterSourceGenerationV1[],
  paths: ReturnType<typeof transactionPaths>,
  transactionId: string,
): CalibrationRegisterGenerationTransactionV1 {
  const base = {
    version: 'v10.3-register-generation-transaction-v1' as const,
    transactionId,
    lockSha256: lock.lockSha256,
    invocationIntentId,
    expectedCurrentRegisterSha256: delta.parentRegisterSha256,
    nextRegisterSha256: nextHash,
    deltaId: delta.deltaId,
    sourceGenerations: sourceGenerations as CalibrationRegisterGenerationTransactionV1['sourceGenerations'],
    immutableGenerationRelativePath: paths.immutableRegister,
    currentRegisterTemporaryRelativePath: paths.currentTemporary,
    state: { phase: 'intent_fsynced' as const },
  };
  return { ...base, transactionSha256: calibrationRegisterGenerationTransactionSha256(base) };
}

function withState(transaction: CalibrationRegisterGenerationTransactionV1, state: CalibrationRegisterGenerationTransactionV1['state']): CalibrationRegisterGenerationTransactionV1 {
  const base = { ...transaction, state };
  return { ...base, transactionSha256: calibrationRegisterGenerationTransactionSha256(base) };
}

function validToolReceipt(toolReceipt: RegisterToolReceiptInput): boolean {
  return id(toolReceipt.receiptId) && sha(toolReceipt.receiptSha256) && sha(toolReceipt.authorityIndexSha256) && id(toolReceipt.publicationTransactionId);
}

function buildReceipt(delta: CalibrationAdmissionRegisterDeltaV1, transaction: CalibrationRegisterGenerationTransactionV1, toolReceipt: RegisterToolReceiptInput): CalibrationRegisterGenerationReceiptV1 {
  const base = {
    version: 'v10.3-register-generation-receipt-v1' as const,
    receiptId: registerReceiptId(transaction.transactionId),
    generation: delta.generation,
    deltaId: delta.deltaId,
    sourceGenerationSha256s: transaction.sourceGenerations.map((source) => source.generationSha256) as CalibrationRegisterGenerationReceiptV1['sourceGenerationSha256s'],
    parentRegisterSha256: delta.parentRegisterSha256,
    nextRegisterSha256: transaction.nextRegisterSha256,
    lockSha256: transaction.lockSha256,
    transactionId: transaction.transactionId,
    toolReceiptSha256: toolReceipt.receiptSha256,
  };
  return { ...base, receiptSha256: calibrationRegisterGenerationReceiptSha256(base) };
}

async function invoke(context: Context, phase: RegisterPublicationPhase): Promise<void> {
  await context.phaseHook?.(phase);
}

async function readCurrentRegister(layout: Layout): Promise<{ readonly value: CalibrationAdmissionSourceRegisterV1; readonly bytes: Buffer } | undefined> {
  await assertNoSymlinkPath(layout.root, layout.registerPath);
  try {
    const bytes = await readFile(layout.registerPath);
    let value: unknown;
    try { value = JSON.parse(bytes.toString('utf8')) as unknown; } catch { throw new Error('Current register is not valid JSON'); }
    if (!Buffer.from(bytes).equals(canonical(value)) || !isCalibrationAdmissionSourceRegisterV1(value)) throw new Error('Current register is invalid or non-canonical');
    return { value, bytes };
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return undefined;
    throw error;
  }
}

async function ensureCurrentParent(layout: Layout, expectedSha256: string): Promise<void> {
  const current = await readCurrentRegister(layout);
  if (!current || current.value.registerSha256 !== expectedSha256) throw new Error('Current register does not match expected parent hash');
}

function transactionRank(context: Context): number {
  return PHASE_RANK[context.transaction.state.phase];
}

function atLeast(context: Context, phase: RegisterTransactionPhase): boolean {
  return transactionRank(context) >= PHASE_RANK[phase];
}

async function persistState(context: Context, state: CalibrationRegisterGenerationTransactionV1['state']): Promise<void> {
  context.transaction = withState(context.transaction, state);
  await writeReplace(context.layout.transactionPath, canonical(context.transaction), context.transaction.transactionId, context.layout.root);
}

function receiptState(
  context: Context,
  phase: 'generation_receipt_staged_fsynced' | 'generation_receipt_promoted' | 'receipt_directories_fsynced' | 'complete',
  toolReceipt: RegisterToolReceiptInput,
): CalibrationRegisterGenerationTransactionV1['state'] {
  const paths = transactionPaths(context.transaction.transactionId, context.transaction.nextRegisterSha256);
  return {
    phase,
    toolReceiptId: toolReceipt.receiptId,
    toolReceiptSha256: toolReceipt.receiptSha256,
    toolAuthorityIndexSha256: toolReceipt.authorityIndexSha256,
    toolAuthorityPublicationTransactionId: toolReceipt.publicationTransactionId,
    generationReceiptId: context.receipt.receiptId,
    generationReceiptSha256: context.receipt.receiptSha256,
    generationReceiptTemporaryRelativePath: paths.receiptTemporary,
    generationReceiptFinalRelativePath: paths.receiptFinal,
  };
}

function isReceiptState(state: CalibrationRegisterGenerationTransactionV1['state']): state is Extract<CalibrationRegisterGenerationTransactionV1['state'], { readonly generationReceiptFinalRelativePath: string }> {
  return 'generationReceiptFinalRelativePath' in state && 'generationReceiptTemporaryRelativePath' in state;
}

function isToolBoundState(state: CalibrationRegisterGenerationTransactionV1['state']): state is Extract<CalibrationRegisterGenerationTransactionV1['state'], { readonly toolReceiptSha256: string }> {
  return state.phase === 'tool_receipt_indexed' || isReceiptState(state);
}

function toolReceiptMatchesState(state: Extract<CalibrationRegisterGenerationTransactionV1['state'], { readonly toolReceiptSha256: string }>, toolReceipt: RegisterToolReceiptInput): boolean {
  return state.toolReceiptId === toolReceipt.receiptId
    && state.toolReceiptSha256 === toolReceipt.receiptSha256
    && state.toolAuthorityIndexSha256 === toolReceipt.authorityIndexSha256
    && state.toolAuthorityPublicationTransactionId === toolReceipt.publicationTransactionId;
}

async function assertExistingBytes(path: string, expected: Uint8Array, root?: string): Promise<void> {
  if (root) await assertNoSymlinkPath(root, path);
  const actual = await readFile(path);
  if (!Buffer.from(actual).equals(Buffer.from(expected))) throw new Error(`Existing register output differs: ${path}`);
}

async function removeKnownFile(root: string, path: string): Promise<void> {
  await assertNoSymlinkPath(root, path);
  try { await unlink(path); } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
  }
}

async function removeEmptyDirectory(path: string): Promise<void> {
  try { await rmdir(path); } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== 'ENOENT' && code !== 'ENOTEMPTY' && code !== 'EEXIST') throw error;
  }
}

function pointerBytes(source: CalibrationRegisterSourceGenerationV1): Buffer {
  const base = {
    version: 'v10.3-admission-source-current-v1',
    sourceId: source.sourceId,
    generationSha256: source.generationSha256,
    generationRelativePath: source.generationFinalRelativePath.endsWith('/source-generation.json')
      ? source.generationFinalRelativePath.slice(0, -'/source-generation.json'.length)
      : source.generationFinalRelativePath,
  };
  return canonical({ ...base, currentSha256: calibrationAdmissionSha256(base) });
}

async function promoteSourceCurrentPointer(context: Context, source: CalibrationRegisterSourceGenerationV1, bytes: Uint8Array): Promise<void> {
  const pointerTemporary = admissionPath(context.layout, source.currentPointerTemporaryRelativePath);
  const pointerFinal = admissionPath(context.layout, source.currentPointerFinalRelativePath);
  await ensureDirectory(context.layout.root, dirname(pointerFinal));
  await Promise.all([
    assertNoSymlinkPath(context.layout.root, pointerTemporary),
    assertNoSymlinkPath(context.layout.root, pointerFinal),
  ]);
  try {
    const existing = await readFile(pointerFinal);
    if (!Buffer.from(existing).equals(Buffer.from(bytes))) throw new Error(`Source current pointer CAS mismatch: ${source.sourceId}`);
    return;
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
  }
  try {
    await writeExclusive(pointerTemporary, bytes, context.layout.root);
  } catch (error) {
    if ((error as { code?: string }).code !== 'EEXIST') throw error;
    await assertExistingBytes(pointerTemporary, bytes, context.layout.root);
  }
  await assertNoSymlinkPath(context.layout.root, pointerFinal);
  try { await rename(pointerTemporary, pointerFinal); } catch (error) {
    if ((error as { code?: string }).code !== 'EEXIST') throw error;
    await assertExistingBytes(pointerFinal, bytes, context.layout.root);
    await removeKnownFile(context.layout.root, pointerTemporary);
  }
  await syncDirectory(dirname(pointerFinal));
}

async function assertSourceCurrentPointer(layout: Layout, source: CalibrationRegisterSourceGenerationV1): Promise<void> {
  const pointerFinal = admissionPath(layout, source.currentPointerFinalRelativePath);
  const expected = pointerBytes(source);
  const actual = await readBytesWithin(layout.root, pointerFinal);
  if (!actual.equals(expected)) throw new Error(`Source current pointer hash mismatch: ${source.sourceId}`);
}

async function assertPublishedOutputs(context: Context): Promise<void> {
  if (atLeast(context, 'source_current_pointers_promoted')) {
    for (const source of context.transaction.sourceGenerations) {
      const bytes = context.sourceBytes.get(source.sourceId);
      if (!bytes) throw new Error(`Missing source bytes for ${source.sourceId}`);
      await assertExistingBytes(admissionPath(context.layout, source.generationFinalRelativePath), bytes, context.layout.root);
      await assertSourceCurrentPointer(context.layout, source);
    }
  }
  if (atLeast(context, 'current_register_promoted')) {
    const current = await readCurrentRegister(context.layout);
    if (!current || current.value.registerSha256 !== context.transaction.nextRegisterSha256 || !current.bytes.equals(context.nextRegisterBytes)) throw new Error('Published current register bytes no longer match the transaction');
  }
  if (atLeast(context, 'generation_receipt_promoted')) {
    if (!isReceiptState(context.transaction.state)) throw new Error('Receipt phase is missing receipt paths');
    await assertExistingBytes(admissionPath(context.layout, context.transaction.state.generationReceiptFinalRelativePath), canonical(context.receipt), context.layout.root);
  }
}

async function sourcePaths(context: Context, source: CalibrationRegisterSourceGenerationV1): Promise<{
  readonly stageDirectory: string;
  readonly stagedFile: string;
  readonly finalDirectory: string;
  readonly finalFile: string;
  readonly parentDirectory: string;
}> {
  const stageDirectory = admissionPath(context.layout, source.generationStagingRelativePath);
  const finalDirectory = admissionPath(context.layout, source.generationFinalRelativePath.replace(/\/[^/]+$/, ''));
  const finalFile = admissionPath(context.layout, source.generationFinalRelativePath);
  const parentDirectory = admissionPath(context.layout, source.generationsParentRelativePath);
  await Promise.all([
    assertNoSymlinkPath(context.layout.root, stageDirectory),
    assertNoSymlinkPath(context.layout.root, finalDirectory),
    assertNoSymlinkPath(context.layout.root, finalFile),
    assertNoSymlinkPath(context.layout.root, parentDirectory),
  ]);
  return { stageDirectory, stagedFile: join(stageDirectory, 'source-generation.json'), finalDirectory, finalFile, parentDirectory };
}

async function publishSources(context: Context): Promise<void> {
  const sources = context.transaction.sourceGenerations;
  if (!atLeast(context, 'source_generation_directories_staged_fsynced')) {
    for (const source of sources) {
      const bytes = context.sourceBytes.get(source.sourceId);
      if (!bytes) throw new Error(`Missing staged source bytes for ${source.sourceId}`);
      const paths = await sourcePaths(context, source);
      await ensureDirectory(context.layout.root, paths.stageDirectory);
      try { await writeExclusive(paths.stagedFile, bytes, context.layout.root); } catch (error) {
        if ((error as { code?: string }).code !== 'EEXIST') throw error;
        await assertExistingBytes(paths.stagedFile, bytes, context.layout.root);
      }
      await invoke(context, 'source-generation-staged-fsynced');
    }
    await persistState(context, { phase: 'source_generation_directories_staged_fsynced' });
  }

  if (!atLeast(context, 'source_generation_directories_promoted')) {
    for (const source of sources) {
    const bytes = context.sourceBytes.get(source.sourceId);
    if (!bytes) throw new Error(`Missing staged source bytes for ${source.sourceId}`);
      const paths = await sourcePaths(context, source);
      await ensureDirectory(context.layout.root, dirname(paths.finalDirectory));
      let finalExists = false;
      try { await stat(paths.finalFile); finalExists = true; } catch (error) {
        if ((error as { code?: string }).code !== 'ENOENT') throw error;
      }
      if (finalExists) {
        await assertExistingBytes(paths.finalFile, bytes, context.layout.root);
        // The final generation is immutable.  Remove only the known staged
        // leaf, preserving any unexpected diagnostic file for investigation.
        await removeKnownFile(context.layout.root, paths.stagedFile);
        await removeEmptyDirectory(paths.stageDirectory);
      } else {
        await assertNoSymlinkPath(context.layout.root, paths.stageDirectory);
        try { await rename(paths.stageDirectory, paths.finalDirectory); } catch (error) {
          if ((error as { code?: string }).code !== 'EEXIST') throw error;
          await assertExistingBytes(paths.finalFile, bytes, context.layout.root);
          await removeKnownFile(context.layout.root, paths.stagedFile);
          await removeEmptyDirectory(paths.stageDirectory);
        }
      }
      await syncDirectory(dirname(paths.finalDirectory));
      await invoke(context, 'source-generation-promoted');
    }
    await persistState(context, { phase: 'source_generation_directories_promoted' });
  }

  if (!atLeast(context, 'source_generation_parents_fsynced')) {
    for (const source of sources) {
      const paths = await sourcePaths(context, source);
      await syncDirectory(paths.parentDirectory);
    }
    await persistState(context, { phase: 'source_generation_parents_fsynced' });
  }

  if (!atLeast(context, 'generation_file_fsynced')) {
    for (const source of sources) {
      const bytes = context.sourceBytes.get(source.sourceId);
      if (!bytes) throw new Error(`Missing source bytes for ${source.sourceId}`);
      const paths = await sourcePaths(context, source);
      await assertExistingBytes(paths.finalFile, bytes, context.layout.root);
      if (sha256(bytes) !== source.generationSha256) throw new Error(`Source generation hash mismatch: ${source.sourceId}`);
      await syncFile(paths.finalFile);
    }
    await persistState(context, { phase: 'generation_file_fsynced' });
  }

  if (!atLeast(context, 'source_current_pointers_promoted')) {
    for (const source of sources) {
      await promoteSourceCurrentPointer(context, source, pointerBytes(source));
      await invoke(context, 'source-current-promoted');
    }
    await persistState(context, { phase: 'source_current_pointers_promoted' });
  }
}

async function publishRegisterAndReceipt(context: Context, toolReceipt: RegisterToolReceiptInput): Promise<void> {
  const tx = context.transaction;
  const paths = transactionPaths(tx.transactionId, tx.nextRegisterSha256);
  const registerBytes = context.nextRegisterBytes;
  const currentTemporary = admissionPath(context.layout, tx.currentRegisterTemporaryRelativePath);
  const immutable = admissionPath(context.layout, tx.immutableGenerationRelativePath);
  await Promise.all([assertNoSymlinkPath(context.layout.root, currentTemporary), assertNoSymlinkPath(context.layout.root, immutable), assertNoSymlinkPath(context.layout.root, context.layout.registerPath)]);
  if (!atLeast(context, 'current_register_temporary_fsynced')) {
    try { await writeExclusive(currentTemporary, registerBytes, context.layout.root); } catch (error) {
      if ((error as { code?: string }).code !== 'EEXIST') throw error;
      await assertExistingBytes(currentTemporary, registerBytes, context.layout.root);
    }
    await persistState(context, { phase: 'current_register_temporary_fsynced' });
  } else {
    try { await assertExistingBytes(currentTemporary, registerBytes, context.layout.root); } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') throw error;
      // The temporary may already have been renamed to the immutable output.
    }
  }

  await ensureDirectory(context.layout.root, dirname(immutable));
  let immutableExists = false;
  try { await stat(immutable); immutableExists = true; } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
  }
  if (immutableExists) {
    await assertExistingBytes(immutable, registerBytes, context.layout.root);
    await removeKnownFile(context.layout.root, currentTemporary);
  } else {
    await assertNoSymlinkPath(context.layout.root, currentTemporary);
    try { await rename(currentTemporary, immutable); } catch (error) {
      if ((error as { code?: string }).code !== 'EEXIST') throw error;
      await assertExistingBytes(immutable, registerBytes, context.layout.root);
      await removeKnownFile(context.layout.root, currentTemporary);
    }
  }
  await syncDirectory(dirname(immutable));

  if (!atLeast(context, 'current_register_promoted')) {
    const current = await readCurrentRegister(context.layout);
    if (current?.value.registerSha256 === tx.nextRegisterSha256) {
      if (!current.bytes.equals(registerBytes)) throw new Error('Current register already points to different next-register bytes');
    } else {
      if (!current || current.value.registerSha256 !== tx.expectedCurrentRegisterSha256) throw new Error('Expected-current register CAS failed');
      await assertNoSymlinkPath(context.layout.root, context.layout.registerPath);
      try { await writeExclusive(currentTemporary, registerBytes, context.layout.root); } catch (error) {
        if ((error as { code?: string }).code !== 'EEXIST') throw error;
        await assertExistingBytes(currentTemporary, registerBytes, context.layout.root);
      }
      const reread = await readCurrentRegister(context.layout);
      if (!reread || reread.value.registerSha256 !== tx.expectedCurrentRegisterSha256) throw new Error('Expected-current register CAS failed before promotion');
      await rename(currentTemporary, context.layout.registerPath);
      await syncDirectory(dirname(context.layout.registerPath));
    }
    await persistState(context, { phase: 'current_register_promoted' });
    await invoke(context, 'register-promoted');
  }

  if (!atLeast(context, 'output_directory_fsynced')) {
    await syncDirectory(context.layout.admission);
    await syncDirectory(dirname(immutable));
    await persistState(context, { phase: 'output_directory_fsynced' });
  }

  if (!atLeast(context, 'tool_receipt_indexed')) {
    if (!validToolReceipt(toolReceipt)) throw new Error('Invalid tool receipt binding');
    await persistState(context, { phase: 'tool_receipt_indexed', toolReceiptId: toolReceipt.receiptId, toolReceiptSha256: toolReceipt.receiptSha256, toolAuthorityIndexSha256: toolReceipt.authorityIndexSha256, toolAuthorityPublicationTransactionId: toolReceipt.publicationTransactionId });
    await invoke(context, 'tool-receipt-indexed');
  }

  const receipt = context.receipt;
  const receiptBytes = canonical(receipt);
  const receiptFinal = admissionPath(context.layout, paths.receiptFinal);
  const receiptTemporary = admissionPath(context.layout, paths.receiptTemporary);
  await Promise.all([assertNoSymlinkPath(context.layout.root, receiptFinal), assertNoSymlinkPath(context.layout.root, receiptTemporary)]);
  if (!atLeast(context, 'generation_receipt_staged_fsynced')) {
    try { await writeExclusive(receiptTemporary, receiptBytes, context.layout.root); } catch (error) {
      if ((error as { code?: string }).code !== 'EEXIST') throw error;
      await assertExistingBytes(receiptTemporary, receiptBytes, context.layout.root);
    }
    await persistState(context, receiptState(context, 'generation_receipt_staged_fsynced', toolReceipt));
  }
  await ensureDirectory(context.layout.root, dirname(receiptFinal));
  if (!atLeast(context, 'generation_receipt_promoted')) {
    let receiptExists = false;
    try { await stat(receiptFinal); receiptExists = true; } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') throw error;
    }
    if (receiptExists) {
      await assertExistingBytes(receiptFinal, receiptBytes, context.layout.root);
      await removeKnownFile(context.layout.root, receiptTemporary);
    } else {
      await rename(receiptTemporary, receiptFinal);
    }
    await syncDirectory(dirname(receiptFinal));
    await persistState(context, receiptState(context, 'generation_receipt_promoted', toolReceipt));
    await invoke(context, 'receipt-promoted');
  }
  if (!atLeast(context, 'receipt_directories_fsynced')) {
    await syncDirectory(dirname(receiptFinal));
    await persistState(context, receiptState(context, 'receipt_directories_fsynced', toolReceipt));
  }
  if (!atLeast(context, 'complete')) {
    await persistState(context, receiptState(context, 'complete', toolReceipt));
    await invoke(context, 'complete');
  }
}

async function clean(context: Context): Promise<void> {
  await invoke(context, 'cleanup');
  const txRoot = join(context.layout.admission, 'transactions', context.transaction.transactionId);
  await removeKnownFile(context.layout.root, context.layout.transactionPath);
  await removeKnownFile(context.layout.root, context.layout.lockPath);
  await removeKnownFile(context.layout.root, admissionPath(context.layout, nextRegisterStagingRelativePath(context.transaction.transactionId)));
  await removeKnownFile(context.layout.root, admissionPath(context.layout, context.transaction.currentRegisterTemporaryRelativePath));
  const receiptTemp = isReceiptState(context.transaction.state) ? context.transaction.state.generationReceiptTemporaryRelativePath : undefined;
  if (receiptTemp) await removeKnownFile(context.layout.root, admissionPath(context.layout, receiptTemp));
  for (const source of context.transaction.sourceGenerations) {
    const staged = admissionPath(context.layout, source.generationStagingRelativePath);
    await removeKnownFile(context.layout.root, join(staged, 'source-generation.json'));
    await removeEmptyDirectory(staged);
    await removeEmptyDirectory(dirname(staged));
    await removeEmptyDirectory(dirname(dirname(staged)));
    await removeKnownFile(context.layout.root, admissionPath(context.layout, source.currentPointerTemporaryRelativePath));
  }
  await removeEmptyDirectory(join(txRoot, 'sources'));
  await removeEmptyDirectory(txRoot);
  await syncDirectory(context.layout.admission);
}

function result(context: Context, complete: boolean, recoveryRequired: boolean): RegisterPublicationResult {
  return {
    complete,
    recoveryRequired,
    transactionId: context.transaction.transactionId,
    nextRegisterSha256: context.transaction.nextRegisterSha256,
    receiptSha256: context.receipt.receiptSha256,
    transactionPath: context.layout.transactionPath,
    lockPath: context.layout.lockPath,
  };
}

async function run(context: Context, toolReceipt: RegisterToolReceiptInput): Promise<RegisterPublicationResult> {
  try {
    // Re-open every output already claimed by the journal before advancing
    // another boundary.  This prevents a post-hook mutation from being
    // silently carried forward by an idempotent recovery call.
    await assertPublishedOutputs(context);
    if (!atLeast(context, 'source_current_pointers_promoted')) await publishSources(context);
    if (!atLeast(context, 'complete')) await publishRegisterAndReceipt(context, toolReceipt);
    if (context.transaction.state.phase !== 'complete') throw new Error(`Unsupported register recovery phase: ${context.transaction.state.phase}`);
    await assertPublishedOutputs(context);
    const graph = validateCalibrationRegisterGenerationGraph(context.delta, context.lock, context.transaction, context.receipt);
    if (!graph.ok) throw new Error(`Register graph is invalid before cleanup: ${graph.errors.join('; ')}`);
    await clean(context);
    return result(context, true, false);
  } catch (error) {
    if (error instanceof RegisterPublicationPendingError) throw error;
    throw new RegisterPublicationPendingError(result(context, false, true), error instanceof Error ? error.message : String(error));
  }
}

function makeContext(layout: Layout, delta: CalibrationAdmissionRegisterDeltaV1, nextRegister: CalibrationAdmissionSourceRegisterV1, sourceInputs: readonly RegisterSourceGenerationInput[], invocationIntentId: string, toolReceipt: RegisterToolReceiptInput, recoveryNonce: string, phaseHook?: (phase: RegisterPublicationPhase) => void | Promise<void>): Context {
  const sourceBytes = new Map(sourceInputs.map((source) => [source.sourceId, Buffer.from(source.bytes)] as const));
  const transactionId = deriveTransactionId(delta, nextRegister.registerSha256, invocationIntentId, recoveryNonce);
  const lock = makeLock(delta, nextRegister.registerSha256, invocationIntentId, recoveryNonce, transactionId);
  const paths = transactionPaths(transactionId, nextRegister.registerSha256);
  const fixedSources = [...sourceInputs]
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId))
    .map((source) => makeSourceGeneration(layout, transactionId, source, sha256(source.bytes), source.artifactSetSha256 ?? sha256(canonical({ sourceId: source.sourceId, bytesSha256: sha256(source.bytes) }))));
  const transaction = makeTransaction(delta, nextRegister.registerSha256, invocationIntentId, lock, fixedSources, paths, transactionId);
  const receipt = buildReceipt(delta, transaction, toolReceipt);
  const completeTransaction = withState(transaction, {
    phase: 'complete',
    toolReceiptId: toolReceipt.receiptId,
    toolReceiptSha256: toolReceipt.receiptSha256,
    toolAuthorityIndexSha256: toolReceipt.authorityIndexSha256,
    toolAuthorityPublicationTransactionId: toolReceipt.publicationTransactionId,
    generationReceiptId: receipt.receiptId,
    generationReceiptSha256: receipt.receiptSha256,
    generationReceiptTemporaryRelativePath: paths.receiptTemporary,
    generationReceiptFinalRelativePath: paths.receiptFinal,
  });
  // Journal starts pre-output; the complete projection is only used to build
  // the final graph check after publication.
  void completeTransaction;
  return { layout, delta, nextRegister, lock, transaction, receipt, nextRegisterBytes: canonical(nextRegister), sourceBytes, phaseHook };
}

async function validateRequest(request: RegisterPublicationRequest, layout: Layout): Promise<Context> {
  if (!isCalibrationAdmissionRegisterDeltaV1(request.delta)) throw new Error('Invalid register delta');
  if (!isCalibrationAdmissionSourceRegisterV1(request.nextRegister)) throw new Error('Invalid next register');
  if (!sha(request.invocationIntentId)) throw new Error('Invalid invocation intent ID');
  if (!validToolReceipt(request.toolReceipt)) throw new Error('Invalid tool receipt binding');
  const delta = request.delta;
  const nextRegister = request.nextRegister;
  if (nextRegister.parentRegisterSha256 !== delta.parentRegisterSha256 || nextRegister.generation !== delta.generation) throw new Error('Next register does not bind delta parent/generation');
  if (nextRegister.appliedDeltaIds.at(-1) !== delta.deltaId) throw new Error('Next register does not apply delta');
  if (request.sourceGenerations.length !== delta.addedSources.length) throw new Error('Source-generation count does not match delta');
  const sourceBytes = new Map<string, Buffer>();
  for (const source of request.sourceGenerations) {
    if (!id(source.sourceId) || sourceBytes.has(source.sourceId)) throw new Error('Duplicate or invalid source-generation ID');
    if (source.proposalId !== undefined && !id(source.proposalId)) throw new Error(`Invalid source proposal ID: ${source.sourceId}`);
    if (source.artifactSetSha256 !== undefined && !sha(source.artifactSetSha256)) throw new Error(`Invalid source artifact-set hash: ${source.sourceId}`);
    const bytes = Buffer.from(source.bytes);
    sourceBytes.set(source.sourceId, bytes);
  }
  const ids = [...sourceBytes.keys()].sort();
  const deltaIds = delta.addedSources.map((source) => source.sourceId);
  if (ids.length !== deltaIds.length || ids.some((sourceId, index) => sourceId !== deltaIds[index])) throw new Error('Source-generation IDs do not match delta');
  for (const source of delta.addedSources) {
    const bytes = sourceBytes.get(source.sourceId)!;
    if (sha256(bytes) !== source.sourceGenerationSha256) throw new Error(`Source-generation bytes do not match ${source.sourceId}`);
  }
  await ensureCurrentParent(layout, delta.parentRegisterSha256);
  const recoveryNonce = request.recoveryNonce ?? randomBytes(32).toString('hex');
  if (!sha(recoveryNonce)) throw new Error('Invalid recovery nonce');
  const context = makeContext(layout, delta, nextRegister, request.sourceGenerations, request.invocationIntentId, request.toolReceipt, recoveryNonce, request.phaseHook);
  const transactionBytes = canonical(context.transaction);
  await writeExclusive(layout.lockPath, canonical(context.lock), layout.root);
  await invoke(context, 'lock-fsynced');
  await writeExclusive(layout.transactionPath, transactionBytes, layout.root);
  await writeExclusive(admissionPath(layout, nextRegisterStagingRelativePath(context.transaction.transactionId)), context.nextRegisterBytes, layout.root);
  const proposalPath = admissionPath(layout, `register-generations/proposals/${delta.deltaId}.json`);
  try { await writeExclusive(proposalPath, canonical(delta), layout.root); } catch (error) {
    if ((error as { code?: string }).code !== 'EEXIST') throw error;
    await assertExistingBytes(proposalPath, canonical(delta));
  }
  await invoke(context, 'transaction-fsynced');
  return context;
}

export async function publishRegisterGeneration(request: RegisterPublicationRequest): Promise<RegisterPublicationResult> {
  const layout = await ensureLayout(request.root);
  const context = await validateRequest(request, layout);
  const resultValue = await run(context, request.toolReceipt);
  return resultValue;
}

export async function recoverRegisterGeneration(request: RegisterPublicationRecoveryRequest): Promise<RegisterPublicationResult> {
  if (!request.acknowledgeNoLiveWriter) throw new Error('Recovery requires --acknowledge-no-live-writer');
  if (!validToolReceipt(request.toolReceipt)) throw new Error('Invalid tool receipt binding');
  const layout = await ensureLayout(request.root);
  const lockValue = await readJsonWithin(layout.root, layout.lockPath);
  if (!isCalibrationRegisterGenerationLockV1(lockValue)) throw new Error('Register lock is invalid');
  const lock = lockValue;
  if (lock.recoveryNonce !== request.recoveryNonce || (request.transactionId !== undefined && request.transactionId !== lock.intendedTransactionId)) throw new Error('Recovery nonce or transaction binding mismatch');
  if (deriveTransactionIdFromLock(lock) !== lock.intendedTransactionId) throw new Error('Recovery lock transaction identity is invalid');

  let transactionValue: unknown;
  try {
    transactionValue = await readJsonWithin(layout.root, layout.transactionPath);
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
    // A crash after the lock fsync but before transaction creation is the
    // lock-only recovery case.  The self-hashed lock and its derived identity
    // are the closed set needed to prove that no unknown transaction is selected.
    await removeKnownFile(layout.root, layout.lockPath);
    await removeKnownFile(layout.root, admissionPath(layout, nextRegisterStagingRelativePath(lock.intendedTransactionId)));
    await removeEmptyDirectory(join(layout.admission, 'transactions', lock.intendedTransactionId));
    await syncDirectory(layout.admission);
    return {
      complete: true,
      recoveryRequired: false,
      transactionId: lock.intendedTransactionId,
      nextRegisterSha256: lock.nextRegisterSha256,
      transactionPath: layout.transactionPath,
      lockPath: layout.lockPath,
    };
  }
  if (!isCalibrationRegisterGenerationTransactionV1(transactionValue)) throw new Error('Register transaction is invalid');
  const transaction = transactionValue;
  if (lock.intendedTransactionId !== transaction.transactionId
    || transaction.lockSha256 !== lock.lockSha256
    || transaction.invocationIntentId !== lock.invocationIntentId
    || transaction.expectedCurrentRegisterSha256 !== lock.expectedCurrentRegisterSha256
    || transaction.nextRegisterSha256 !== lock.nextRegisterSha256
    || transaction.deltaId !== lock.deltaId) throw new Error('Recovery nonce or transaction binding mismatch');
  const deltaValue = await readJsonWithin(layout.root, admissionPath(layout, `register-generations/proposals/${transaction.deltaId}.json`));
  if (!isCalibrationAdmissionRegisterDeltaV1(deltaValue)) throw new Error('Recovery delta proposal is unavailable or invalid');
  const delta = deltaValue;
  if (delta.deltaId !== lock.deltaId || delta.parentRegisterSha256 !== lock.expectedCurrentRegisterSha256) throw new Error('Recovery delta does not bind the register lock');
  if (deriveTransactionId(delta, lock.nextRegisterSha256, lock.invocationIntentId, lock.recoveryNonce) !== lock.intendedTransactionId) throw new Error('Recovery transaction identity does not match its delta');
  let nextRegister: unknown;
  try {
    nextRegister = await readJsonWithin(layout.root, admissionPath(layout, transaction.immutableGenerationRelativePath));
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
    nextRegister = await readJsonWithin(layout.root, admissionPath(layout, nextRegisterStagingRelativePath(transaction.transactionId)));
  }
  if (!isCalibrationAdmissionSourceRegisterV1(nextRegister)
    || nextRegister.registerSha256 !== transaction.nextRegisterSha256
    || nextRegister.parentRegisterSha256 !== delta.parentRegisterSha256
    || nextRegister.generation !== delta.generation) throw new Error('Recovery next register is unavailable, invalid, or hash-mismatched');
  const sourceBytes = new Map<string, Buffer>();
  for (const source of transaction.sourceGenerations) {
    const finalFile = admissionPath(layout, source.generationFinalRelativePath);
    try {
      sourceBytes.set(source.sourceId, await readBytesWithin(layout.root, finalFile));
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') throw error;
      sourceBytes.set(source.sourceId, await readBytesWithin(layout.root, join(admissionPath(layout, source.generationStagingRelativePath), 'source-generation.json')));
    }
    if (sha256(sourceBytes.get(source.sourceId)!) !== source.generationSha256) throw new Error(`Recovery source-generation hash mismatch: ${source.sourceId}`);
  }
  if (PHASE_RANK[transaction.state.phase] >= PHASE_RANK.source_current_pointers_promoted) {
    for (const source of transaction.sourceGenerations) await assertSourceCurrentPointer(layout, source);
  }
  const toolReceipt = request.toolReceipt;
  let receipt: CalibrationRegisterGenerationReceiptV1;
  if (transaction.state.phase === 'complete') {
    const receiptValue = await readJsonWithin(layout.root, admissionPath(layout, transaction.state.generationReceiptFinalRelativePath));
    if (!isCalibrationRegisterGenerationReceiptV1(receiptValue)) throw new Error('Completed register receipt is invalid');
    const graph = validateCalibrationRegisterGenerationGraph(delta, lock, transaction, receiptValue);
    if (!graph.ok) throw new Error(`Completed register graph is invalid: ${graph.errors.join('; ')}`);
    if (!toolReceiptMatchesState(transaction.state, toolReceipt) || receiptValue.toolReceiptSha256 !== toolReceipt.receiptSha256) throw new Error('Completed register tool receipt binding mismatch');
    receipt = receiptValue;
  } else {
    if (isToolBoundState(transaction.state) && !toolReceiptMatchesState(transaction.state, toolReceipt)) throw new Error('Recovery tool receipt binding mismatch');
    receipt = buildReceipt(delta, transaction, toolReceipt);
  }
  const context: Context = {
    layout,
    delta,
    nextRegister,
    lock,
    transaction,
    receipt,
    nextRegisterBytes: canonical(nextRegister),
    sourceBytes,
    phaseHook: request.phaseHook,
  };
  const resultValue = await run(context, toolReceipt);
  return resultValue;
}

export const registerPublishRound = publishRegisterGeneration;
export const registerRecover = recoverRegisterGeneration;

export const REGISTER_PUBLICATION_LOCK_RELATIVE_PATH = LOCK_RELATIVE_PATH;
export const REGISTER_PUBLICATION_TRANSACTION_RELATIVE_PATH = TRANSACTION_RELATIVE_PATH;
export const REGISTER_CURRENT_RELATIVE_PATH = REGISTER_RELATIVE_PATH;
