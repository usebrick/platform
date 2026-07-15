/**
 * Transaction-owned publication for one v10.3 witness search/review bundle.
 *
 * The caller supplies an already validated bundle and already indexed tool
 * receipts. This module only makes those bytes durable below the fixed
 * `review/admission/witnesses/<gate>` topology. It never discovers a bundle,
 * invents a receipt, promotes a label, or changes the live census.
 */
import { constants } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rmdir,
  unlink,
} from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

import {
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionSearchReceiptSha256,
  calibrationAdmissionSha256,
  calibrationAdmissionToolReceiptSha256,
  calibrationAdmissionWitnessPublicationCompletionSha256,
  calibrationAdmissionWitnessPublicationLockSha256,
  calibrationAdmissionWitnessPublicationTransactionSha256,
  calibrationAdmissionWitnessRoutingReferenceSha256,
  isCalibrationAdmissionSearchResultBundleV1,
  isCalibrationAdmissionWitnessReviewBundleV1,
  isCalibrationNestedPublicationHandoffV1,
  validateCalibrationAdmissionWitnessPublicationGraph,
  validateCalibrationAdmissionWitnessPublicationCompletionV1,
  validateCalibrationAdmissionWitnessPublicationLockV1,
  validateCalibrationAdmissionWitnessRoutingReferenceV1,
  validateCalibrationAdmissionWitnessPublicationTransactionV1,
  type CalibrationAdmissionSearchResultBundleV1,
  type CalibrationAdmissionWitnessPublicationCompletionV1,
  type CalibrationAdmissionWitnessPublicationLockV1,
  type CalibrationAdmissionWitnessPublicationTransactionV1,
  type CalibrationAdmissionWitnessReviewBundleV1,
  type CalibrationAdmissionWitnessRoutingReferenceV1,
  type CalibrationNestedPublicationHandoffV1,
} from '@usebrick/core';

const SHA256 = /^[a-f0-9]{64}$/u;
const RELATIVE_PATH = /^(?!\/)(?!.*\\)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*(?:^|\/)\.(?:\/|$))(?!.*\/\/)[^\u0000-\u001f]+$/u;
const MAX_BUNDLE_BYTES = 2 * 1024 * 1024 * 1024;

export type AdmissionWitnessPublicationKindV1 = 'search_result' | 'witness_review';
export type AdmissionWitnessPublicationGateV1 = 'smoke' | 'canary';

export type AdmissionWitnessPublicationPhaseV1 =
  | 'lock-fsynced'
  | 'transaction-fsynced'
  | 'required-tool-receipts-indexed'
  | 'bundle-staged-fsynced'
  | 'bundle-promoted'
  | 'output-directory-fsynced'
  | 'publication-tool-receipt-started'
  | 'publication-tool-receipt-indexed'
  | 'completion-staged-fsynced'
  | 'completion-promoted'
  | 'completion-directory-fsynced'
  | 'routing-reference-staged-fsynced'
  | 'routing-reference-promoted'
  | 'projections-directory-fsynced'
  | 'complete'
  | 'lock-unlinked'
  | 'transaction-unlinked';

export interface AdmissionWitnessPublicationToolReceiptV1 {
  readonly receiptId: string;
  readonly receiptSha256: string;
  readonly authorityIndexSha256: string;
}

export interface AdmissionWitnessPublicationRequiredToolReceiptV1 {
  readonly receiptId: string;
  readonly receiptSha256: string;
}

export interface AdmissionWitnessPublicationRequestV1 {
  readonly root?: string;
  readonly projectRoot?: string;
  readonly gate: AdmissionWitnessPublicationGateV1;
  readonly kind: AdmissionWitnessPublicationKindV1;
  readonly bundle: unknown;
  readonly invocationIntentId: string;
  readonly namedPrimaryOutputProjectionSha256: string;
  readonly publicationToolReceipt: AdmissionWitnessPublicationToolReceiptV1;
  readonly requiredToolReceipts?: readonly AdmissionWitnessPublicationRequiredToolReceiptV1[];
  readonly nestedHandoff: CalibrationNestedPublicationHandoffV1;
  readonly recoveryNonce?: string;
  readonly phaseHook?: (phase: AdmissionWitnessPublicationPhaseV1) => void | Promise<void>;
}

export interface AdmissionWitnessPublicationRecoveryRequestV1 extends AdmissionWitnessPublicationRequestV1 {
  readonly recoveryNonce: string;
  readonly acknowledgeNoLiveWriter: boolean;
  readonly transactionId?: string;
  readonly fromLock?: boolean;
}

export interface AdmissionWitnessPublicationResultV1 {
  readonly complete: boolean;
  readonly recoveryRequired: boolean;
  readonly status: 'complete' | 'recovery-required' | 'lock-only';
  readonly gate: AdmissionWitnessPublicationGateV1;
  readonly kind: AdmissionWitnessPublicationKindV1;
  readonly transactionId: string;
  readonly recoveryNonce: string;
  readonly bundleSha256: string;
  readonly bundlePath: string;
  readonly publicationCompletionSha256: string;
  readonly publicationCompletionPath: string;
  readonly routingReferenceSha256: string;
  readonly routingReferencePath: string;
  readonly lockPath: string;
  readonly transactionPath: string;
}

export class AdmissionWitnessPublicationPendingError extends Error {
  readonly result: AdmissionWitnessPublicationResultV1;

  constructor(result: AdmissionWitnessPublicationResultV1, message = 'witness publication requires recovery') {
    super(message);
    this.name = 'AdmissionWitnessPublicationPendingError';
    this.result = result;
  }
}

export class AdmissionWitnessPublicationContendedError extends Error {
  readonly result: AdmissionWitnessPublicationResultV1;

  constructor(result: AdmissionWitnessPublicationResultV1, message = 'witness publication is already locked by another transaction') {
    super(message);
    this.name = 'AdmissionWitnessPublicationContendedError';
    this.result = result;
  }
}

type JsonObject = Record<string, unknown>;
type ExpectedReferenceState = { readonly kind: 'absent' } | { readonly kind: 'existing'; readonly referenceSha256: string };
type TransactionState = CalibrationAdmissionWitnessPublicationTransactionV1['state'];

interface Layout {
  readonly root: string;
  readonly gateRoot: string;
  readonly stagingRoot: string;
  readonly lock: string;
  readonly transaction: string;
  readonly bundleFinal: string;
  readonly completionFinal: string;
  readonly routingFinal: string;
  readonly bundleTemporary: string;
  readonly completionTemporary: string;
  readonly routingTemporary: string;
  readonly relative: {
    readonly bundleFinal: string;
    readonly completionFinal: string;
    readonly routingFinal: string;
    readonly bundleTemporary: string;
    readonly completionTemporary: string;
    readonly routingTemporary: string;
  };
}

interface PreparedPublication {
  readonly layout: Layout;
  readonly gate: AdmissionWitnessPublicationGateV1;
  readonly kind: AdmissionWitnessPublicationKindV1;
  readonly bundle: CalibrationAdmissionSearchResultBundleV1 | CalibrationAdmissionWitnessReviewBundleV1;
  readonly bundleBytes: Buffer;
  readonly bundleSha256: string;
  readonly invocationIntentId: string;
  readonly namedPrimaryOutputProjectionSha256: string;
  readonly publicationToolReceipt: AdmissionWitnessPublicationToolReceiptV1;
  readonly requiredToolReceiptIds: readonly string[];
  readonly requiredToolReceiptSha256s: readonly string[];
  readonly nestedHandoff: CalibrationNestedPublicationHandoffV1;
  readonly recoveryNonce: string;
  readonly expectedRoutingReferenceState: ExpectedReferenceState;
  readonly lock: CalibrationAdmissionWitnessPublicationLockV1;
  readonly completion: CalibrationAdmissionWitnessPublicationCompletionV1;
  readonly completionBytes: Buffer;
  readonly routing: CalibrationAdmissionWitnessRoutingReferenceV1;
  readonly routingBytes: Buffer;
  readonly requestHook?: AdmissionWitnessPublicationRequestV1['phaseHook'];
  lockOnly?: boolean;
  transaction: CalibrationAdmissionWitnessPublicationTransactionV1;
}

class PublicationBoundaryError extends Error {
  readonly phase: AdmissionWitnessPublicationPhaseV1;

  constructor(phase: AdmissionWitnessPublicationPhaseV1, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'PublicationBoundaryError';
    this.phase = phase;
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha(value: unknown): value is string { return typeof value === 'string' && SHA256.test(value); }

function contained(root: string, candidate: string): boolean {
  const child = relative(root, candidate);
  return child === '' || (child !== '..' && !child.startsWith(`..${sep}`) && !child.startsWith('/') && !child.includes('\\'));
}

function safeRelative(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 4096 && RELATIVE_PATH.test(value);
}

function absoluteContained(root: string, path: string): string {
  if (!safeRelative(path)) throw new Error('witness publication path is unsafe');
  const candidate = resolve(root, path);
  if (!contained(root, candidate)) throw new Error('witness publication path escapes project root');
  return candidate;
}

async function assertNoSymlinkPath(root: string, candidate: string): Promise<void> {
  if (!contained(root, candidate) || candidate === root) throw new Error('witness publication path escapes project root');
  const parts = relative(root, candidate).split(sep).filter(Boolean);
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    try {
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink()) throw new Error('witness publication symlink path component');
      if (index < parts.length - 1 && !metadata.isDirectory()) throw new Error('witness publication non-directory path component');
    } catch (error) {
      if (isObject(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) break;
      throw error;
    }
  }
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

async function ensureDirectory(root: string, path: string): Promise<void> {
  await assertNoSymlinkPath(root, path).catch(async (error) => {
    if (!(isObject(error) && error.code === 'ENOENT')) throw error;
  });
  await mkdir(path, { recursive: true });
  await assertNoSymlinkPath(root, path);
  await syncDirectory(path);
}

async function readOptional(root: string, path: string): Promise<Buffer | undefined> {
  await assertNoSymlinkPath(root, path);
  try { return await readFile(path); } catch (error) {
    if (isObject(error) && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function readCanonical(root: string, path: string): Promise<unknown | undefined> {
  const bytes = await readOptional(root, path);
  if (bytes === undefined) return undefined;
  const text = bytes.toString('utf8');
  let value: unknown;
  try { value = JSON.parse(text) as unknown; } catch { throw new Error(`witness publication JSON is invalid: ${path}`); }
  if (text !== calibrationAdmissionCanonicalJson(value)) throw new Error(`witness publication JSON is not canonical: ${path}`);
  return value;
}

async function writeExclusive(root: string, path: string, bytes: Uint8Array): Promise<void> {
  await assertNoSymlinkPath(root, path);
  await ensureDirectory(root, dirname(path));
  let handle;
  try {
    handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle?.close().catch(() => undefined);
  }
  await syncDirectory(dirname(path));
}

async function writeNoClobber(root: string, path: string, bytes: Uint8Array): Promise<void> {
  try {
    await writeExclusive(root, path, bytes);
    return;
  } catch (error) {
    if (!(isObject(error) && error.code === 'EEXIST')) throw error;
  }
  await assertNoSymlinkPath(root, path);
  const existing = await readFile(path);
  if (!Buffer.from(existing).equals(Buffer.from(bytes))) throw new Error(`witness publication byte collision: ${path}`);
}

async function writeReplace(root: string, path: string, bytes: Uint8Array, transactionId: string): Promise<void> {
  const temporary = `${path}.${transactionId}.next`;
  await writeNoClobber(root, temporary, bytes);
  await assertNoSymlinkPath(root, path);
  await rename(temporary, path);
  await syncDirectory(dirname(path));
}

async function assertBytes(root: string, path: string, bytes: Uint8Array, label: string): Promise<void> {
  const actual = await readOptional(root, path);
  if (actual === undefined) throw new Error(`${label} is missing`);
  if (!Buffer.from(actual).equals(Buffer.from(bytes))) throw new Error(`${label} bytes changed`);
}

async function promote(root: string, staging: string, finalPath: string, bytes: Uint8Array, label: string): Promise<void> {
  await writeNoClobber(root, staging, bytes);
  await assertBytes(root, staging, bytes, `${label} staging`);
  const existing = await readOptional(root, finalPath);
  if (existing !== undefined) {
    if (!Buffer.from(existing).equals(Buffer.from(bytes))) throw new Error(`${label} final bytes changed`);
    await unlink(staging);
    await syncDirectory(dirname(staging));
    return;
  }
  await ensureDirectory(root, dirname(finalPath));
  const raced = await readOptional(root, finalPath);
  if (raced !== undefined) {
    if (!Buffer.from(raced).equals(Buffer.from(bytes))) throw new Error(`${label} final appeared with different bytes`);
    await unlink(staging);
    await syncDirectory(dirname(staging));
    return;
  }
  await assertNoSymlinkPath(root, staging);
  await assertNoSymlinkPath(root, finalPath);
  await rename(staging, finalPath);
  await syncDirectory(dirname(finalPath));
}

async function invokeHook(hook: AdmissionWitnessPublicationRequestV1['phaseHook'], phase: AdmissionWitnessPublicationPhaseV1): Promise<void> {
  try { await hook?.(phase); } catch (error) { throw new PublicationBoundaryError(phase, error); }
}

function canonical(value: unknown): Buffer { return Buffer.from(calibrationAdmissionCanonicalJson(value), 'utf8'); }

function compare(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }

function asBundle(value: unknown, kind: AdmissionWitnessPublicationKindV1): CalibrationAdmissionSearchResultBundleV1 | CalibrationAdmissionWitnessReviewBundleV1 {
  if (kind === 'search_result' && isCalibrationAdmissionSearchResultBundleV1(value)) return value;
  if (kind === 'witness_review' && isCalibrationAdmissionWitnessReviewBundleV1(value)) return value;
  throw new Error(`witness ${kind} bundle does not satisfy the Core contract`);
}

function searchBundleFor(kind: AdmissionWitnessPublicationKindV1, bundle: CalibrationAdmissionSearchResultBundleV1 | CalibrationAdmissionWitnessReviewBundleV1): CalibrationAdmissionSearchResultBundleV1 {
  return kind === 'search_result'
    ? bundle as CalibrationAdmissionSearchResultBundleV1
    : (bundle as CalibrationAdmissionWitnessReviewBundleV1).searchResultBundle;
}

function requiredReceipts(
  request: AdmissionWitnessPublicationRequestV1,
  bundle: CalibrationAdmissionSearchResultBundleV1 | CalibrationAdmissionWitnessReviewBundleV1,
): { readonly ids: string[]; readonly hashes: string[] } {
  const source = request.requiredToolReceipts === undefined
    ? searchBundleFor(request.kind, bundle).toolReceipts.map((receipt) => ({ receiptId: receipt.receiptId, receiptSha256: calibrationAdmissionToolReceiptSha256(receipt) }))
    : [...request.requiredToolReceipts];
  if (source.length === 0) throw new Error('witness publication requires indexed result tool receipts');
  const seen = new Set<string>();
  for (const receipt of source) {
    if (!sha(receipt.receiptId) || !sha(receipt.receiptSha256)) throw new Error('witness publication required tool receipt selector is invalid');
    if (!seen.add(receipt.receiptId)) throw new Error('witness publication required tool receipts are duplicated');
  }
  const search = searchBundleFor(request.kind, bundle);
  const receiptHashes = new Set(search.toolReceipts.map((receipt) => calibrationAdmissionToolReceiptSha256(receipt)));
  for (const receipt of source) if (!receiptHashes.has(receipt.receiptSha256)) throw new Error('witness publication required tool receipt is not present in the bundle');
  if (!sha(search.searchReceipt.toolReceiptSha256) || !receiptHashes.has(search.searchReceipt.toolReceiptSha256)) {
    throw new Error('witness publication search receipt is not bound to an indexed tool receipt');
  }
  return {
    ids: source.map((entry) => entry.receiptId).sort(compare),
    hashes: source.map((entry) => entry.receiptSha256).sort(compare),
  };
}

function stateFromReference(value: unknown): ExpectedReferenceState {
  if (value === undefined) return { kind: 'absent' };
  if (!validateCalibrationAdmissionWitnessRoutingReferenceV1(value).ok) throw new Error('existing witness routing reference is invalid');
  if (!isObject(value) || !sha(value.referenceSha256)) throw new Error('existing witness routing reference is invalid');
  return { kind: 'existing', referenceSha256: value.referenceSha256 };
}

function routeName(kind: AdmissionWitnessPublicationKindV1): string {
  return kind === 'search_result' ? 'search-reference.json' : 'witness-review-reference.json';
}

async function makeLayout(rootInput: string, gate: AdmissionWitnessPublicationGateV1, kind: AdmissionWitnessPublicationKindV1, bundleSha256: string, transactionId: string, completionSha256: string): Promise<Layout> {
  if (typeof rootInput !== 'string' || rootInput.length === 0 || rootInput.includes('\u0000') || rootInput.includes('\\')) throw new Error('witness publication root is unsafe');
  const lexical = resolve(rootInput);
  const metadata = await lstat(lexical);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error('witness publication root must be a real directory');
  const root = await realpath(lexical);
  const relativeRoot = `review/admission/witnesses/${gate}`;
  const bundleFinalRelative = `${relativeRoot}/${kind === 'search_result' ? 'search-results' : 'witness-reviews'}/${bundleSha256}.json`;
  const completionFinalRelative = `${relativeRoot}/publication-completions/${completionSha256}.json`;
  const routingFinalRelative = `${relativeRoot}/projections/${routeName(kind)}`;
  const stagingRelative = `${relativeRoot}/.staging/${transactionId}`;
  const relativePaths = {
    bundleFinal: bundleFinalRelative,
    completionFinal: completionFinalRelative,
    routingFinal: routingFinalRelative,
    bundleTemporary: `${stagingRelative}/bundle.json`,
    completionTemporary: `${stagingRelative}/completion.json`,
    routingTemporary: `${stagingRelative}/routing-reference.json`,
  } as const;
  const paths = Object.fromEntries(Object.entries(relativePaths).map(([key, value]) => [key, absoluteContained(root, value)])) as typeof relativePaths;
  const gateRoot = absoluteContained(root, relativeRoot);
  const stagingRoot = absoluteContained(root, stagingRelative);
  const lockRelative = `${relativeRoot}/publication.lock`;
  const transactionRelative = `${relativeRoot}/publication-transaction.json`;
  return {
    root,
    gateRoot,
    stagingRoot,
    lock: absoluteContained(root, lockRelative),
    transaction: absoluteContained(root, transactionRelative),
    bundleFinal: paths.bundleFinal,
    completionFinal: paths.completionFinal,
    routingFinal: paths.routingFinal,
    bundleTemporary: paths.bundleTemporary,
    completionTemporary: paths.completionTemporary,
    routingTemporary: paths.routingTemporary,
    relative: relativePaths,
  };
}

function initialTransaction(input: {
  readonly transactionId: string;
  readonly lockSha256: string;
  readonly operation: AdmissionWitnessPublicationKindV1;
  readonly gate: AdmissionWitnessPublicationGateV1;
  readonly invocationIntentId: string;
  readonly bundleSha256: string;
  readonly bundleBytes: number;
  readonly expectedRoutingReferenceState: ExpectedReferenceState;
  readonly layout: Layout;
  readonly recoveryNonce: string;
}): CalibrationAdmissionWitnessPublicationTransactionV1 {
  const body: Omit<CalibrationAdmissionWitnessPublicationTransactionV1, 'transactionSha256'> = {
    version: 'v10.3-admission-witness-publication-transaction-v1',
    transactionId: input.transactionId,
    lockSha256: input.lockSha256,
    operation: input.operation,
    gate: input.gate,
    invocationIntentId: input.invocationIntentId,
    bundleSha256: input.bundleSha256,
    bundleBytes: input.bundleBytes,
    expectedRoutingReferenceState: input.expectedRoutingReferenceState,
    bundleTemporaryRelativePath: input.layout.relative.bundleTemporary,
    bundleFinalRelativePath: input.layout.relative.bundleFinal,
    completionTemporaryRelativePath: input.layout.relative.completionTemporary,
    routingReferenceTemporaryRelativePath: input.layout.relative.routingTemporary,
    routingReferenceFinalRelativePath: input.layout.relative.routingFinal,
    recoveryNonce: input.recoveryNonce,
    state: { phase: 'intent_fsynced' },
  };
  return { ...body, transactionSha256: calibrationAdmissionWitnessPublicationTransactionSha256(body) };
}

function result(context: PreparedPublication, complete: boolean, status: AdmissionWitnessPublicationResultV1['status']): AdmissionWitnessPublicationResultV1 {
  return {
    complete,
    recoveryRequired: !complete,
    status,
    gate: context.gate,
    kind: context.kind,
    transactionId: context.transaction.transactionId,
    recoveryNonce: context.recoveryNonce,
    bundleSha256: context.bundleSha256,
    bundlePath: context.layout.bundleFinal,
    publicationCompletionSha256: context.completion.completionSha256,
    publicationCompletionPath: context.layout.completionFinal,
    routingReferenceSha256: context.routing.referenceSha256,
    routingReferencePath: context.layout.routingFinal,
    lockPath: context.layout.lock,
    transactionPath: context.layout.transaction,
  };
}

function phaseRank(phase: TransactionState['phase']): number {
  return [
    'intent_fsynced',
    'required_tool_receipts_indexed',
    'bundle_staged_fsynced',
    'bundle_promoted',
    'output_directory_fsynced',
    'publication_tool_receipt_started',
    'publication_tool_receipt_indexed',
    'completion_staged_fsynced',
    'completion_promoted',
    'completion_directory_fsynced',
    'routing_reference_staged_fsynced',
    'routing_reference_promoted',
    'projections_directory_fsynced',
    'complete',
  ].indexOf(phase);
}

function updateTransaction(context: PreparedPublication, state: TransactionState): CalibrationAdmissionWitnessPublicationTransactionV1 {
  const body = { ...context.transaction, state } as Omit<CalibrationAdmissionWitnessPublicationTransactionV1, 'transactionSha256'>;
  const next = { ...body, transactionSha256: calibrationAdmissionWitnessPublicationTransactionSha256(body) };
  const validation = validateCalibrationAdmissionWitnessPublicationTransactionV1(next);
  if (!validation.ok) throw new Error(`witness publication transaction state is invalid: ${validation.errors.join('; ')}`);
  return next;
}

async function persistState(context: PreparedContext, state: TransactionState, hookPhase: AdmissionWitnessPublicationPhaseV1): Promise<void> {
  context.transaction = updateTransaction(context, state);
  await writeReplace(context.layout.root, context.layout.transaction, canonical(context.transaction), context.transaction.transactionId);
  await invokeHook(context.requestHook, hookPhase);
}

function bindPublicationGraph(context: PreparedPublication): void {
  const graph = validateCalibrationAdmissionWitnessPublicationGraph({ lock: context.lock, transaction: context.transaction });
  if (!graph.ok) throw new Error(`witness publication lock/transaction graph is invalid: ${graph.errors.join('; ')}`);
}

// The hook is kept outside the public Core shape and is never persisted.
type PreparedContext = PreparedPublication;

async function prepare(request: AdmissionWitnessPublicationRequestV1, resume: boolean): Promise<PreparedContext> {
  if (request.root !== undefined && request.projectRoot !== undefined && resolve(request.root) !== resolve(request.projectRoot)) throw new Error('witness publication root aliases disagree');
  const root = request.root ?? request.projectRoot;
  if (root === undefined) throw new Error('witness publication root is required');
  if (request.gate !== 'smoke' && request.gate !== 'canary') throw new Error('witness publication gate is invalid');
  if (request.kind !== 'search_result' && request.kind !== 'witness_review') throw new Error('witness publication kind is invalid');
  if (!sha(request.invocationIntentId) || !sha(request.namedPrimaryOutputProjectionSha256)) throw new Error('witness publication invocation/output hashes are invalid');
  const publicationToolReceipt = request.publicationToolReceipt;
  if (!sha(publicationToolReceipt.receiptId) || !sha(publicationToolReceipt.receiptSha256) || !sha(publicationToolReceipt.authorityIndexSha256)) throw new Error('witness publication tool receipt is invalid');
  if (!isCalibrationNestedPublicationHandoffV1(request.nestedHandoff)) throw new Error('witness publication nested handoff is invalid');
  const bundle = asBundle(request.bundle, request.kind);
  if (bundle.gate !== request.gate) throw new Error('witness publication bundle gate does not match request');
  const bundleBytes = canonical(bundle);
  if (bundleBytes.length < 1 || bundleBytes.length > MAX_BUNDLE_BYTES) throw new Error('witness publication bundle size is out of bounds');
  const required = requiredReceipts(request, bundle);
  const expectedRouteRelative = `review/admission/witnesses/${request.gate}/projections/${routeName(request.kind)}`;
  const transactionNonce = request.recoveryNonce ?? calibrationAdmissionSha256({
    domain: 'v10.3-admission-witness-publication-recovery-nonce-v1',
    gate: request.gate,
    kind: request.kind,
    bundleSha256: bundle.bundleSha256,
    invocationIntentId: request.invocationIntentId,
  });
  if (!sha(transactionNonce)) throw new Error('witness publication recovery nonce is invalid');
  const provisionalTransactionId = calibrationAdmissionSha256({
    domain: 'v10.3-admission-witness-publication-transaction-v1',
    gate: request.gate,
    kind: request.kind,
    invocationIntentId: request.invocationIntentId,
    bundleSha256: bundle.bundleSha256,
    recoveryNonce: transactionNonce,
    expectedRoutingReferencePath: expectedRouteRelative,
  });
  const provisionalLayout = await makeLayout(root, request.gate, request.kind, bundle.bundleSha256, provisionalTransactionId, hashPlaceholder());
  const existingRoute = await readCanonical(provisionalLayout.root, provisionalLayout.routingFinal);
  const existingLock = await readCanonical(provisionalLayout.root, provisionalLayout.lock);
  const existingTransaction = await readCanonical(provisionalLayout.root, provisionalLayout.transaction);
  let expectedRoutingReferenceState = stateFromReference(existingRoute);
  // Recovery must bind to the state captured by the live lock, not to a route
  // that may already have been promoted before the process crashed. Otherwise
  // a crash after routing promotion would derive a different transaction id.
  if (resume && existingLock !== undefined) {
    const lockValidation = validateCalibrationAdmissionWitnessPublicationLockV1(existingLock);
    if (!lockValidation.ok || !isObject(existingLock)) throw new Error('witness publication recovery lock is invalid');
    if (existingLock.gate !== request.gate || existingLock.operation !== request.kind
      || existingLock.invocationIntentId !== request.invocationIntentId || existingLock.bundleSha256 !== bundle.bundleSha256
      || existingLock.recoveryNonce !== transactionNonce) {
      throw new Error('witness publication recovery lock does not match request');
    }
    expectedRoutingReferenceState = existingLock.expectedRoutingReferenceState as ExpectedReferenceState;
  }
  const transactionId = calibrationAdmissionSha256({
    domain: 'v10.3-admission-witness-publication-transaction-v1',
    gate: request.gate,
    kind: request.kind,
    invocationIntentId: request.invocationIntentId,
    bundleSha256: bundle.bundleSha256,
    recoveryNonce: transactionNonce,
    expectedRoutingReferenceState,
  });
  const layout = await makeLayout(root, request.gate, request.kind, bundle.bundleSha256, transactionId, hashPlaceholder());
  const lockBody: Omit<CalibrationAdmissionWitnessPublicationLockV1, 'lockSha256'> = {
    version: 'v10.3-admission-witness-publication-lock-v1',
    lockId: calibrationAdmissionSha256({ domain: 'v10.3-admission-witness-publication-lock-v1', transactionId, recoveryNonce: transactionNonce }),
    intendedTransactionId: transactionId,
    operation: request.kind,
    gate: request.gate,
    invocationIntentId: request.invocationIntentId,
    bundleSha256: bundle.bundleSha256,
    bundleRelativePath: layout.relative.bundleFinal,
    expectedRoutingReferenceState,
    recoveryNonce: transactionNonce,
  };
  const lock: CalibrationAdmissionWitnessPublicationLockV1 = { ...lockBody, lockSha256: calibrationAdmissionWitnessPublicationLockSha256(lockBody) };
  if (request.nestedHandoff.parentTransactionId !== transactionId) throw new Error('witness publication nested handoff parent transaction does not match');
  const completionBody: Omit<CalibrationAdmissionWitnessPublicationCompletionV1, 'completionSha256'> = {
    version: 'v10.3-admission-witness-publication-completion-v1',
    gate: request.gate,
    kind: request.kind,
    parentTransactionId: transactionId,
    invocationIntentId: request.invocationIntentId,
    bundleRelativePath: layout.relative.bundleFinal,
    bundleSha256: bundle.bundleSha256,
    namedPrimaryOutputProjectionSha256: request.namedPrimaryOutputProjectionSha256,
    requiredToolReceiptIds: [...required.ids],
    requiredToolReceiptSha256s: [...required.hashes],
    publicationToolReceiptId: publicationToolReceipt.receiptId,
    publicationToolReceiptSha256: publicationToolReceipt.receiptSha256,
    toolAuthorityIndexSha256: publicationToolReceipt.authorityIndexSha256,
    nestedHandoff: request.nestedHandoff,
  };
  const completion: CalibrationAdmissionWitnessPublicationCompletionV1 = { ...completionBody, completionSha256: calibrationAdmissionWitnessPublicationCompletionSha256(completionBody) };
  const finalLayout = await makeLayout(root, request.gate, request.kind, bundle.bundleSha256, transactionId, completion.completionSha256);
  const routingBody: Omit<CalibrationAdmissionWitnessRoutingReferenceV1, 'referenceSha256'> = {
    version: 'v10.3-admission-witness-routing-reference-v1',
    gate: request.gate,
    kind: request.kind,
    bundleRelativePath: finalLayout.relative.bundleFinal,
    bundleSha256: bundle.bundleSha256,
    publicationCompletionRelativePath: finalLayout.relative.completionFinal,
    publicationCompletionSha256: completion.completionSha256,
  };
  const routing: CalibrationAdmissionWitnessRoutingReferenceV1 = { ...routingBody, referenceSha256: calibrationAdmissionWitnessRoutingReferenceSha256(routingBody) };
  const transaction = initialTransaction({
    transactionId,
    lockSha256: lock.lockSha256,
    operation: request.kind,
    gate: request.gate,
    invocationIntentId: request.invocationIntentId,
    bundleSha256: bundle.bundleSha256,
    bundleBytes: bundleBytes.length,
    expectedRoutingReferenceState,
    layout: finalLayout,
    recoveryNonce: transactionNonce,
  });
  const context: PreparedContext = {
    layout: finalLayout,
    gate: request.gate,
    kind: request.kind,
    bundle,
    bundleBytes,
    bundleSha256: bundle.bundleSha256,
    invocationIntentId: request.invocationIntentId,
    namedPrimaryOutputProjectionSha256: request.namedPrimaryOutputProjectionSha256,
    publicationToolReceipt,
    requiredToolReceiptIds: required.ids,
    requiredToolReceiptSha256s: required.hashes,
    nestedHandoff: request.nestedHandoff,
    recoveryNonce: transactionNonce,
    expectedRoutingReferenceState,
    lock,
    completion,
    completionBytes: canonical(completion),
    routing,
    routingBytes: canonical(routing),
    transaction,
    requestHook: request.phaseHook,
  };
  const graph = validateCalibrationAdmissionWitnessPublicationGraph({ lock: context.lock, transaction: context.transaction });
  if (!graph.ok) throw new Error(`witness publication graph is invalid: ${graph.errors.join('; ')}`);
  if (existingLock === undefined && existingTransaction !== undefined) throw new Error('witness publication transaction exists without its lock');
  if (existingLock !== undefined) {
    if (existingTransaction === undefined) {
      if (!resume || !(request as AdmissionWitnessPublicationRecoveryRequestV1).fromLock) throw new AdmissionWitnessPublicationContendedError(result(context, false, 'recovery-required'), 'witness publication lock exists without a transaction journal');
      const lockValidation = validateCalibrationAdmissionWitnessPublicationLockV1(existingLock);
      if (!lockValidation.ok || !isObject(existingLock) || existingLock.lockSha256 !== context.lock.lockSha256) throw new Error('witness publication lock-only journal does not match request');
      context.lockOnly = true;
      return context;
    }
    if (!validateCalibrationAdmissionWitnessPublicationGraph({ lock: existingLock, transaction: existingTransaction }).ok) {
      if (!resume) throw new AdmissionWitnessPublicationContendedError(result(context, false, 'recovery-required'), 'witness publication lock/transaction is not recoverable');
      throw new Error('witness publication lock/transaction graph is invalid');
    }
    const existingLockObject = existingLock as JsonObject;
    if (existingLockObject.lockSha256 !== context.lock.lockSha256 || !resume) throw new AdmissionWitnessPublicationContendedError(result(context, false, 'recovery-required'));
    if (!isObject(existingTransaction)) throw new Error('witness publication transaction is invalid');
    context.transaction = existingTransaction as unknown as CalibrationAdmissionWitnessPublicationTransactionV1;
  } else if (resume) {
    throw new Error('witness publication transaction is missing');
  }
  return context;
}

function hashPlaceholder(): string { return '0'.repeat(64); }

async function existingComplete(request: AdmissionWitnessPublicationRequestV1): Promise<AdmissionWitnessPublicationResultV1 | undefined> {
  const rootInput = request.root ?? request.projectRoot;
  if (rootInput === undefined) return undefined;
  const bundle = asBundle(request.bundle, request.kind);
  const bundleBytes = canonical(bundle);
  const provisional = await makeLayout(rootInput, request.gate, request.kind, bundle.bundleSha256, hashPlaceholder(), hashPlaceholder());
  const routeValue = await readCanonical(provisional.root, provisional.routingFinal);
  if (routeValue === undefined) return undefined;
  if (!validateCalibrationAdmissionWitnessRoutingReferenceV1(routeValue).ok || !isObject(routeValue)) throw new Error('existing witness routing reference is invalid');
  if (routeValue.gate !== request.gate || routeValue.kind !== request.kind || routeValue.bundleSha256 !== bundle.bundleSha256) return undefined;
  const completionPath = absoluteContained(provisional.root, String(routeValue.publicationCompletionRelativePath));
  const completionValue = await readCanonical(provisional.root, completionPath);
  if (!validateCalibrationAdmissionWitnessPublicationCompletionV1(completionValue).ok || !isObject(completionValue)) throw new Error('existing witness publication completion is invalid');
  if (completionValue.gate !== request.gate || completionValue.kind !== request.kind || completionValue.bundleSha256 !== bundle.bundleSha256 || completionValue.invocationIntentId !== request.invocationIntentId || completionValue.publicationToolReceiptId !== request.publicationToolReceipt.receiptId || completionValue.publicationToolReceiptSha256 !== request.publicationToolReceipt.receiptSha256) {
    throw new Error('witness publication existing completion does not match request');
  }
  if (!sha(completionValue.parentTransactionId) || !sha(completionValue.completionSha256) || !sha(routeValue.referenceSha256) || routeValue.publicationCompletionSha256 !== completionValue.completionSha256) throw new Error('witness routing reference completion hash mismatch');
  const layout = await makeLayout(provisional.root, request.gate, request.kind, bundle.bundleSha256, completionValue.parentTransactionId, completionValue.completionSha256);
  return {
    complete: true,
    recoveryRequired: false,
    status: 'complete',
    gate: request.gate,
    kind: request.kind,
    transactionId: completionValue.parentTransactionId,
    recoveryNonce: request.recoveryNonce ?? calibrationAdmissionSha256({ domain: 'v10.3-admission-witness-publication-idempotent-replay-v1', transactionId: completionValue.parentTransactionId }),
    bundleSha256: bundle.bundleSha256,
    bundlePath: layout.bundleFinal,
    publicationCompletionSha256: completionValue.completionSha256,
    publicationCompletionPath: layout.completionFinal,
    routingReferenceSha256: routeValue.referenceSha256 as string,
    routingReferencePath: layout.routingFinal,
    lockPath: layout.lock,
    transactionPath: layout.transaction,
  };
}

async function writeLockAndTransaction(context: PreparedContext): Promise<void> {
  await writeExclusive(context.layout.root, context.layout.lock, canonical(context.lock));
  await invokeHook(context.requestHook, 'lock-fsynced');
  await writeExclusive(context.layout.root, context.layout.transaction, canonical(context.transaction));
  await invokeHook(context.requestHook, 'transaction-fsynced');
  bindPublicationGraph(context);
}

async function cleanup(context: PreparedContext): Promise<void> {
  await invokeHook(context.requestHook, 'lock-unlinked');
  await assertNoSymlinkPath(context.layout.root, context.layout.lock);
  await unlink(context.layout.lock).catch((error: unknown) => { if (!(isObject(error) && error.code === 'ENOENT')) throw error; });
  await syncDirectory(dirname(context.layout.lock));
  await invokeHook(context.requestHook, 'transaction-unlinked');
  await assertNoSymlinkPath(context.layout.root, context.layout.transaction);
  await unlink(context.layout.transaction).catch((error: unknown) => { if (!(isObject(error) && error.code === 'ENOENT')) throw error; });
  await syncDirectory(dirname(context.layout.transaction));
  await unlink(context.layout.bundleTemporary).catch((error: unknown) => { if (!(isObject(error) && error.code === 'ENOENT')) throw error; });
  await unlink(context.layout.completionTemporary).catch((error: unknown) => { if (!(isObject(error) && error.code === 'ENOENT')) throw error; });
  await unlink(context.layout.routingTemporary).catch((error: unknown) => { if (!(isObject(error) && error.code === 'ENOENT')) throw error; });
  await rmdir(context.layout.stagingRoot).catch((error: unknown) => { if (!(isObject(error) && (error.code === 'ENOENT' || error.code === 'ENOTEMPTY'))) throw error; });
}

async function cleanupLockOnly(context: PreparedContext): Promise<AdmissionWitnessPublicationResultV1> {
  await assertNoSymlinkPath(context.layout.root, context.layout.lock);
  await unlink(context.layout.lock).catch((error: unknown) => { if (!(isObject(error) && error.code === 'ENOENT')) throw error; });
  await syncDirectory(dirname(context.layout.lock));
  return result(context, false, 'lock-only');
}

async function execute(context: PreparedContext, resume: boolean): Promise<AdmissionWitnessPublicationResultV1> {
  try {
    if (!resume) await writeLockAndTransaction(context);
    const currentRank = () => phaseRank(context.transaction.state.phase);
    if (currentRank() < 1) await persistState(context, { phase: 'required_tool_receipts_indexed', requiredToolReceiptIds: [...context.requiredToolReceiptIds], requiredToolReceiptSha256s: [...context.requiredToolReceiptSha256s], toolAuthorityIndexSha256: context.publicationToolReceipt.authorityIndexSha256 }, 'required-tool-receipts-indexed');
    if (currentRank() < 2) {
      await writeNoClobber(context.layout.root, context.layout.bundleTemporary, context.bundleBytes);
      await assertBytes(context.layout.root, context.layout.bundleTemporary, context.bundleBytes, 'witness bundle staging');
      await persistState(context, { phase: 'bundle_staged_fsynced', requiredToolReceiptIds: [...context.requiredToolReceiptIds], requiredToolReceiptSha256s: [...context.requiredToolReceiptSha256s], toolAuthorityIndexSha256: context.publicationToolReceipt.authorityIndexSha256 }, 'bundle-staged-fsynced');
    }
    if (phaseRank(context.transaction.state.phase) < 3) {
      await promote(context.layout.root, context.layout.bundleTemporary, context.layout.bundleFinal, context.bundleBytes, 'witness bundle');
      await persistState(context, { phase: 'bundle_promoted', requiredToolReceiptIds: [...context.requiredToolReceiptIds], requiredToolReceiptSha256s: [...context.requiredToolReceiptSha256s], toolAuthorityIndexSha256: context.publicationToolReceipt.authorityIndexSha256 }, 'bundle-promoted');
    }
    if (phaseRank(context.transaction.state.phase) < 4) {
      await syncDirectory(context.layout.gateRoot);
      await persistState(context, { phase: 'output_directory_fsynced', requiredToolReceiptIds: [...context.requiredToolReceiptIds], requiredToolReceiptSha256s: [...context.requiredToolReceiptSha256s], toolAuthorityIndexSha256: context.publicationToolReceipt.authorityIndexSha256 }, 'output-directory-fsynced');
    }
    if (phaseRank(context.transaction.state.phase) < 5) {
      await persistState(context, { phase: 'publication_tool_receipt_started', requiredToolReceiptIds: [...context.requiredToolReceiptIds], requiredToolReceiptSha256s: [...context.requiredToolReceiptSha256s], toolAuthorityIndexSha256: context.publicationToolReceipt.authorityIndexSha256, nestedHandoffSha256: context.nestedHandoff.handoffSha256, childTransactionId: context.nestedHandoff.childTransactionId, childRecoveryNonce: context.nestedHandoff.childRecoveryNonce }, 'publication-tool-receipt-started');
    }
    const receiptState = {
      requiredToolReceiptIds: [...context.requiredToolReceiptIds],
      requiredToolReceiptSha256s: [...context.requiredToolReceiptSha256s],
      toolAuthorityIndexSha256: context.publicationToolReceipt.authorityIndexSha256,
      publicationToolReceiptId: context.publicationToolReceipt.receiptId,
      publicationToolReceiptSha256: context.publicationToolReceipt.receiptSha256,
      nestedHandoffSha256: context.nestedHandoff.handoffSha256,
      childTransactionId: context.nestedHandoff.childTransactionId,
      childRecoveryNonce: context.nestedHandoff.childRecoveryNonce,
      publicationCompletionSha256: context.completion.completionSha256,
      publicationCompletionFinalRelativePath: context.layout.relative.completionFinal,
      nextRoutingReferenceSha256: context.routing.referenceSha256,
    };
    if (phaseRank(context.transaction.state.phase) < 6) await persistState(context, { phase: 'publication_tool_receipt_indexed', ...receiptState }, 'publication-tool-receipt-indexed');
    if (phaseRank(context.transaction.state.phase) < 7) {
      await writeNoClobber(context.layout.root, context.layout.completionTemporary, context.completionBytes);
      await assertBytes(context.layout.root, context.layout.completionTemporary, context.completionBytes, 'publication completion staging');
      await persistState(context, { phase: 'completion_staged_fsynced', ...receiptState }, 'completion-staged-fsynced');
    }
    if (phaseRank(context.transaction.state.phase) < 8) {
      await promote(context.layout.root, context.layout.completionTemporary, context.layout.completionFinal, context.completionBytes, 'publication completion');
      await persistState(context, { phase: 'completion_promoted', ...receiptState }, 'completion-promoted');
    }
    if (phaseRank(context.transaction.state.phase) < 9) {
      await syncDirectory(dirname(context.layout.completionFinal));
      await persistState(context, { phase: 'completion_directory_fsynced' as const, ...receiptState }, 'completion-directory-fsynced');
    }
    if (phaseRank(context.transaction.state.phase) < 10) {
      await writeNoClobber(context.layout.root, context.layout.routingTemporary, context.routingBytes);
      await assertBytes(context.layout.root, context.layout.routingTemporary, context.routingBytes, 'routing reference staging');
      await persistState(context, { phase: 'routing_reference_staged_fsynced' as const, ...receiptState }, 'routing-reference-staged-fsynced');
    }
    if (phaseRank(context.transaction.state.phase) < 11) {
      const existing = await readCanonical(context.layout.root, context.layout.routingFinal);
      const expected = context.expectedRoutingReferenceState;
      if (expected.kind === 'absent' && existing !== undefined && calibrationAdmissionCanonicalJson(existing) !== calibrationAdmissionCanonicalJson(context.routing)) throw new Error('witness routing reference CAS mismatch');
      if (expected.kind === 'existing' && (existing === undefined || !isObject(existing) || existing.referenceSha256 !== expected.referenceSha256)) throw new Error('witness routing reference CAS changed');
      await promote(context.layout.root, context.layout.routingTemporary, context.layout.routingFinal, context.routingBytes, 'routing reference');
      await persistState(context, { phase: 'routing_reference_promoted' as const, ...receiptState }, 'routing-reference-promoted');
    }
    if (phaseRank(context.transaction.state.phase) < 12) {
      await syncDirectory(dirname(context.layout.routingFinal));
      await persistState(context, { phase: 'projections_directory_fsynced' as const, ...receiptState }, 'projections-directory-fsynced');
    }
    if (phaseRank(context.transaction.state.phase) < 13) {
      const search = searchBundleFor(context.kind, context.bundle);
      const completionSummary = context.kind === 'search_result'
        ? { kind: 'search_result' as const, searchToolReceiptId: search.searchReceipt.receiptId, searchToolReceiptSha256: search.searchReceipt.toolReceiptSha256, publicationToolReceiptId: context.publicationToolReceipt.receiptId, publicationToolReceiptSha256: context.publicationToolReceipt.receiptSha256 }
        : { kind: 'witness_review' as const, publicationToolReceiptId: context.publicationToolReceipt.receiptId, publicationToolReceiptSha256: context.publicationToolReceipt.receiptSha256 };
      await persistState(context, { phase: 'complete', ...receiptState, completion: completionSummary }, 'complete');
    }
    await cleanup(context);
    return result(context, true, 'complete');
  } catch (error) {
    if (error instanceof PublicationBoundaryError) throw new AdmissionWitnessPublicationPendingError(result(context, false, 'recovery-required'), `witness publication paused at ${error.phase}: ${error.message}`);
    throw error;
  }
}

export async function publishAdmissionWitness(request: AdmissionWitnessPublicationRequestV1): Promise<AdmissionWitnessPublicationResultV1> {
  const replay = await existingComplete(request);
  if (replay !== undefined) return replay;
  const context = await prepare(request, false);
  return execute(context, false);
}

export async function publishAdmissionWitnessPublication(request: AdmissionWitnessPublicationRequestV1): Promise<AdmissionWitnessPublicationResultV1> {
  return publishAdmissionWitness(request);
}

export async function recoverAdmissionWitnessPublication(request: AdmissionWitnessPublicationRecoveryRequestV1): Promise<AdmissionWitnessPublicationResultV1> {
  if (!request.acknowledgeNoLiveWriter) throw new Error('witness publication recovery requires acknowledgeNoLiveWriter');
  if (!sha(request.recoveryNonce)) throw new Error('witness publication recovery nonce is invalid');
  const context = await prepare(request, true);
  if (context.recoveryNonce !== request.recoveryNonce) throw new Error('witness publication recovery nonce does not match lock');
  if (request.transactionId !== undefined && request.transactionId !== context.transaction.transactionId) throw new Error('witness publication recovery transaction selector does not match lock');
  if (context.lockOnly) return cleanupLockOnly(context);
  return execute(context, true);
}

export async function recoverAdmissionWitness(request: AdmissionWitnessPublicationRecoveryRequestV1): Promise<AdmissionWitnessPublicationResultV1> {
  return recoverAdmissionWitnessPublication(request);
}
