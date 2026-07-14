/**
 * Crash-safe publication of the bounded overlap computation.
 *
 * The overlap builder is intentionally a computation-only primitive.  This
 * module is the authority boundary: it copies verified generation-local
 * leaves into a transaction-owned staging directory, materialises one
 * immutable generation, then CAS-promotes the current pointer.  No source
 * bytes are acquired here and no directory is discovered during recovery.
 */
import { createHash, randomBytes } from 'node:crypto';
import {
  mkdir,
  open,
  lstat,
  readFile,
  readdir,
  rename,
  realpath,
  rmdir,
  stat,
  unlink,
} from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

import {
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionSha256,
  isCalibrationAdmissionNormalizerRegistryV1,
  isCalibrationAdmissionOverlapCurrentV1,
  isCalibrationAdmissionOverlapGenerationV1,
  isCalibrationAdmissionOverlapPolicyV1,
  isCalibrationAdmissionOverlapPublicationLockV1,
  isCalibrationAdmissionOverlapPublicationTransactionV1,
  validateCalibrationAdmissionOverlapPublicationTransactionV1,
  isCalibrationAdmissionOverlapUniverseV1,
  isCalibrationAdmissionToolAuthoritySnapshotV1,
  validateCalibrationAdmissionOverlapIndexReceiptV1,
  validateCalibrationAdmissionOverlapLedgerV1,
  validateCalibrationAdmissionOverlapResourceReceiptV1,
  type CalibrationAdmissionArtifactReceiptV1,
  type AdmissionNormalizerRegistryV1,
  type AdmissionOverlapCurrentV1,
  type AdmissionOverlapGenerationV1,
  type AdmissionOverlapIndexReceiptV1,
  type AdmissionOverlapLedgerV1,
  type AdmissionOverlapPolicyV1,
  type AdmissionOverlapPublicationLockV1,
  type AdmissionOverlapPublicationTransactionV1,
  type AdmissionOverlapResourceReceiptV1,
  type AdmissionOverlapUniverseV1,
  type CalibrationAdmissionToolAuthoritySnapshotV1,
} from '@usebrick/core';
import type { AdmissionOverlapBuildResult } from './admission-overlap';

type AdmissionArtifactReceiptV1 = CalibrationAdmissionArtifactReceiptV1;

const SHA256 = /^[a-f0-9]{64}$/u;
const ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;

export const OVERLAP_RELATIVE_ROOT = 'review/admission/global/overlap';
export const OVERLAP_GENERATIONS_RELATIVE_ROOT = `${OVERLAP_RELATIVE_ROOT}/generations`;
export const OVERLAP_STAGING_RELATIVE_ROOT = `${OVERLAP_RELATIVE_ROOT}/staging-generation`;
export const OVERLAP_LOCK_RELATIVE_PATH = `${OVERLAP_RELATIVE_ROOT}/publication.lock`;
export const OVERLAP_TRANSACTION_RELATIVE_PATH = `${OVERLAP_RELATIVE_ROOT}/publication-transaction.json`;
export const OVERLAP_CURRENT_RELATIVE_PATH = `${OVERLAP_RELATIVE_ROOT}/current-generation.json`;

export type OverlapPublicationPhase =
  | 'lock-fsynced'
  | 'transaction-fsynced'
  | 'primary-outputs-staged-fsynced'
  | 'tool-receipt-indexed'
  | 'generation-directory-staged-fsynced'
  | 'generation-directory-promoted'
  | 'generations-parent-fsynced'
  | 'current-output-projections-staged-fsynced'
  | 'current-output-projections-promoted'
  | 'current-generation-promoted'
  | 'output-directories-fsynced'
  | 'complete'
  | 'cleanup'
  | 'cleanup-fsynced'
  | 'transaction-unlinked'
  | 'lock-unlinked';

export interface OverlapToolReceiptInput {
  readonly receiptId: string;
  readonly receiptSha256: string;
  readonly authorityIndexSha256: string;
}

export interface OverlapPublicationRequest {
  readonly root: string;
  /** Directory containing the builder's generation-local output leaves. */
  readonly generationLocalRoot: string;
  readonly buildResult: AdmissionOverlapBuildResult;
  readonly universe: AdmissionOverlapUniverseV1;
  readonly policy: AdmissionOverlapPolicyV1;
  readonly normalizerRegistry: AdmissionNormalizerRegistryV1;
  readonly generation: number;
  readonly inputGenerationSha256: string;
  readonly invocationIntentId: string;
  readonly toolAuthoritySnapshot: CalibrationAdmissionToolAuthoritySnapshotV1;
  readonly toolReceipt: OverlapToolReceiptInput;
  readonly operation?: 'create' | 'replace';
  readonly expectedCurrentGenerationSha256?: string;
  readonly recoveryNonce?: string;
  readonly phaseHook?: (phase: OverlapPublicationPhase) => void | Promise<void>;
}

export interface OverlapPublicationRecoveryRequest {
  readonly root: string;
  readonly transactionId?: string;
  readonly fromLock?: boolean;
  readonly recoveryNonce: string;
  readonly toolReceipt: OverlapToolReceiptInput;
  readonly acknowledgeNoLiveWriter: boolean;
  readonly phaseHook?: (phase: OverlapPublicationPhase) => void | Promise<void>;
}

/** Machine-readable publication outcome. `contended` never acquired the
 * lock; `post-completion` has already removed all recovery journals. */
export type OverlapPublicationStatus = 'complete' | 'recovery-required' | 'contended' | 'post-completion';

export interface OverlapPublicationResult {
  readonly complete: boolean;
  readonly recoveryRequired: boolean;
  readonly status: OverlapPublicationStatus;
  readonly transactionId: string;
  readonly generationSha256: string;
  readonly transactionPath: string;
  readonly lockPath: string;
  readonly currentPath: string;
}

export interface OverlapVerificationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly generationSha256?: string;
  readonly artifactCount: number;
}

export interface OverlapArtifactRelationInput {
  readonly generation: unknown;
  readonly index: unknown;
  readonly resource: unknown;
  readonly ledger: unknown;
}

export interface OverlapArtifactRelationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

export class OverlapPublicationPendingError extends Error {
  readonly result: OverlapPublicationResult;

  constructor(result: OverlapPublicationResult, message = 'Overlap publication requires recovery') {
    super(message);
    this.name = 'OverlapPublicationPendingError';
    this.result = result;
  }
}

/** Another writer owned the publication lock before this invocation acquired it. */
export class OverlapPublicationContendedError extends Error {
  readonly result: OverlapPublicationResult;

  constructor(result: OverlapPublicationResult, message = 'Overlap publication is already owned by another writer') {
    super(message);
    this.name = 'OverlapPublicationContendedError';
    this.result = result;
  }
}

/** The durable publication completed, but a post-completion diagnostic hook failed. */
export class OverlapPublicationPostCompletionError extends Error {
  readonly result: OverlapPublicationResult;

  constructor(result: OverlapPublicationResult, message = 'Overlap publication completed; post-completion hook failed') {
    super(message);
    this.name = 'OverlapPublicationPostCompletionError';
    this.result = result;
  }
}

interface Layout {
  readonly root: string;
  readonly overlap: string;
  readonly generations: string;
  readonly staging: string;
  readonly lockPath: string;
  readonly transactionPath: string;
  readonly currentPath: string;
}

interface PrimaryArtifact {
  readonly receipt: AdmissionArtifactReceiptV1;
  readonly sourcePath?: string;
  readonly inlineBytes?: Buffer;
  readonly stagedRelativePath: string;
  readonly stagedPath: string;
}

interface Context {
  readonly layout: Layout;
  readonly lock: AdmissionOverlapPublicationLockV1;
  transaction: AdmissionOverlapPublicationTransactionV1;
  readonly generation: AdmissionOverlapGenerationV1;
  readonly generationBytes: Buffer;
  readonly primary: readonly PrimaryArtifact[];
  readonly sourceRoot: string;
  readonly toolReceipt: OverlapToolReceiptInput;
  readonly phaseHook?: (phase: OverlapPublicationPhase) => void | Promise<void>;
}

function hash(value: unknown): string {
  return calibrationAdmissionSha256(value);
}

function sha(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonical(value: unknown): Buffer {
  return Buffer.from(calibrationAdmissionCanonicalJson(value), 'utf8');
}

function validSha(value: unknown): value is string { return typeof value === 'string' && SHA256.test(value); }
function validId(value: unknown): value is string { return typeof value === 'string' && ID.test(value); }
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function inside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !rel.startsWith('/'));
}

async function assertNoSymlinkPath(root: string, candidate: string): Promise<void> {
  const rootResolved = resolve(root);
  const candidateResolved = resolve(candidate);
  if (!inside(rootResolved, candidateResolved)) throw new Error('overlap_path_escape');
  const rel = relative(rootResolved, candidateResolved);
  let current = rootResolved;
  for (const segment of rel.split(sep)) {
    if (!segment) continue;
    current = join(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error('overlap_symlink_component');
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') break;
      throw error;
    }
  }
}

function rootRelative(layout: Layout, path: string): string {
  if (path.startsWith('/') || path.includes('\\') || path.includes('\u0000')) throw new Error('overlap_relative_path_invalid');
  const absolute = resolve(layout.root, path);
  if (!inside(layout.root, absolute)) throw new Error('overlap_relative_path_escape');
  return absolute;
}

function overlapRelative(layout: Layout, path: string): string {
  return rootRelative(layout, path.startsWith(`${OVERLAP_RELATIVE_ROOT}/`) || path === OVERLAP_RELATIVE_ROOT
    ? path
    : `${OVERLAP_RELATIVE_ROOT}/${path}`);
}

async function ensureLayout(rootInput: string): Promise<Layout> {
  const requested = resolve(rootInput);
  await mkdir(requested, { recursive: true });
  const root = await realpath(requested);
  const overlap = rootRelative({ root } as Layout, OVERLAP_RELATIVE_ROOT);
  const generations = rootRelative({ root } as Layout, OVERLAP_GENERATIONS_RELATIVE_ROOT);
  const staging = rootRelative({ root } as Layout, OVERLAP_STAGING_RELATIVE_ROOT);
  for (const path of [overlap, generations, staging]) await assertNoSymlinkPath(root, path);
  await mkdir(overlap, { recursive: true });
  await mkdir(generations, { recursive: true });
  await mkdir(staging, { recursive: true });
  for (const path of [overlap, generations, staging]) await assertNoSymlinkPath(root, path);
  return {
    root,
    overlap,
    generations,
    staging,
    lockPath: rootRelative({ root } as Layout, OVERLAP_LOCK_RELATIVE_PATH),
    transactionPath: rootRelative({ root } as Layout, OVERLAP_TRANSACTION_RELATIVE_PATH),
    currentPath: rootRelative({ root } as Layout, OVERLAP_CURRENT_RELATIVE_PATH),
  };
}

/** Construct the fixed layout without creating any directory. */
async function readLayout(rootInput: string): Promise<Layout> {
  const root = await realpath(resolve(rootInput));
  const layout = {
    root,
    overlap: rootRelative({ root } as Layout, OVERLAP_RELATIVE_ROOT),
    generations: rootRelative({ root } as Layout, OVERLAP_GENERATIONS_RELATIVE_ROOT),
    staging: rootRelative({ root } as Layout, OVERLAP_STAGING_RELATIVE_ROOT),
    lockPath: rootRelative({ root } as Layout, OVERLAP_LOCK_RELATIVE_PATH),
    transactionPath: rootRelative({ root } as Layout, OVERLAP_TRANSACTION_RELATIVE_PATH),
    currentPath: rootRelative({ root } as Layout, OVERLAP_CURRENT_RELATIVE_PATH),
  };
  return layout;
}

async function syncFile(path: string): Promise<void> {
  const handle = await open(path, 'r+');
  try { await handle.sync(); } finally { await handle.close(); }
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

async function writeExclusive(root: string, path: string, bytes: Uint8Array): Promise<void> {
  await assertNoSymlinkPath(root, path);
  await mkdir(dirname(path), { recursive: true });
  await assertNoSymlinkPath(root, dirname(path));
  const handle = await open(path, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  await syncDirectory(dirname(path));
}

async function writeReplace(root: string, path: string, bytes: Uint8Array, transactionId: string): Promise<void> {
  await assertNoSymlinkPath(root, path);
  const temporary = `${path}.${transactionId}.tmp`;
  try {
    await writeExclusive(root, temporary, bytes);
  } catch (error) {
    if ((error as { code?: string }).code !== 'EEXIST') throw error;
    const existing = await readFile(temporary);
    if (!Buffer.from(existing).equals(Buffer.from(bytes))) throw new Error('overlap_transaction_bytes_mismatch');
  }
  await assertNoSymlinkPath(root, path);
  await rename(temporary, path);
  await syncDirectory(dirname(path));
}

async function readJson(root: string, path: string): Promise<unknown> {
  await assertNoSymlinkPath(root, path);
  const bytes = await readFile(path);
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')) as unknown; } catch { throw new Error('overlap_authority_json_invalid'); }
  if (!Buffer.from(bytes).equals(canonical(value))) throw new Error('overlap_authority_noncanonical_json');
  return value;
}

async function assertBytes(root: string, path: string, expected: Uint8Array): Promise<void> {
  await assertNoSymlinkPath(root, path);
  const actual = await readFile(path);
  if (!Buffer.from(actual).equals(Buffer.from(expected))) throw new Error(`overlap_output_mismatch:${path}`);
}

async function removeKnown(root: string, path: string): Promise<void> {
  await assertNoSymlinkPath(root, path);
  try { await unlink(path); } catch (error) { if ((error as { code?: string }).code !== 'ENOENT') throw error; }
}

async function removeEmpty(path: string): Promise<void> {
  try { await rmdir(path); } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== 'ENOENT' && code !== 'ENOTEMPTY' && code !== 'EEXIST') throw error;
  }
}

function without(value: Record<string, unknown>, field: string): Record<string, unknown> {
  const copy = { ...value };
  delete copy[field];
  return copy;
}

function artifactSetSha256(artifacts: readonly AdmissionArtifactReceiptV1[]): string {
  return hash(artifacts);
}

function generationSha256(generation: Omit<AdmissionOverlapGenerationV1, 'generationSha256'>): string {
  return hash(generation);
}

function currentSha256(current: Omit<AdmissionOverlapCurrentV1, 'currentSha256'>): string {
  return hash(current);
}

function lockSha256(lock: Omit<AdmissionOverlapPublicationLockV1, 'lockSha256'>): string {
  return hash(lock);
}

function transactionSha256(transaction: Omit<AdmissionOverlapPublicationTransactionV1, 'transactionSha256'>): string {
  return hash(transaction);
}

function sortArtifacts(artifacts: readonly AdmissionArtifactReceiptV1[]): AdmissionArtifactReceiptV1[] {
  return [...artifacts].sort((left, right) => `${left.pathBase}\u0000${left.relativePath}\u0000${left.kind}\u0000${left.sha256}`.localeCompare(`${right.pathBase}\u0000${right.relativePath}\u0000${right.kind}\u0000${right.sha256}`));
}

function safeArtifactRelativePath(path: string): boolean {
  return path.length > 0 && !path.startsWith('/') && !path.includes('\\') && !path.includes('\u0000')
    && !path.split('/').some((part) => part === '' || part === '.' || part === '..');
}

function builderArtifacts(result: AdmissionOverlapBuildResult): AdmissionArtifactReceiptV1[] {
  const receipts = [
    ...result.indexReceipt.postingShards,
    ...result.indexReceipt.candidatePairShards,
    ...result.ledger.edgeShards,
    ...result.ledger.adjacencyShards,
    ...result.ledger.clusterSummaryShards,
    ...result.ledger.clusterMembershipShards,
  ];
  const paths = new Set<string>();
  const artifacts: AdmissionArtifactReceiptV1[] = [];
  for (const receipt of receipts) {
    if (receipt.pathBase !== 'generation_local' || !safeArtifactRelativePath(receipt.relativePath) || paths.has(receipt.relativePath)) throw new Error('overlap_builder_shard_receipt_invalid');
    paths.add(receipt.relativePath);
    artifacts.push({ pathBase: 'generation_local', relativePath: receipt.relativePath, kind: 'shard', bytes: receipt.bytes, sha256: receipt.sha256 });
  }
  const envelopes: readonly [string, 'index' | 'receipt' | 'ledger', unknown][] = [
    ['index.json', 'index', result.indexReceipt],
    ['overlap-resource-receipt.json', 'receipt', result.resourceReceipt],
    ['overlap-ledger.json', 'ledger', result.ledger],
  ];
  for (const [relativePath, kind, value] of envelopes) {
    if (paths.has(relativePath)) throw new Error('overlap_builder_envelope_collision');
    const bytes = canonical(value);
    paths.add(relativePath);
    artifacts.push({ pathBase: 'generation_local', relativePath, kind, bytes: bytes.byteLength, sha256: sha(bytes) });
  }
  return sortArtifacts(artifacts);
}

function deriveTransactionId(lock: Omit<AdmissionOverlapPublicationLockV1, 'lockSha256'>): string {
  return hash({
    domain: 'v10.3-admission-overlap-publication-transaction-id-v1',
    invocationIntentId: lock.invocationIntentId,
    inputGenerationSha256: lock.inputGenerationSha256,
    universeSha256: lock.universeSha256,
    normalizerRegistrySha256: lock.normalizerRegistrySha256,
    overlapPolicySha256: lock.overlapPolicySha256,
    operation: lock.operation,
    expectedCurrentState: lock.expectedCurrentState,
    recoveryNonce: lock.recoveryNonce,
  });
}

function deriveTransactionIdFromLock(lock: AdmissionOverlapPublicationLockV1): string {
  return deriveTransactionId(without(lock as unknown as Record<string, unknown>, 'lockSha256') as Omit<AdmissionOverlapPublicationLockV1, 'lockSha256'>);
}

function deriveTransactionIdFromTransaction(transaction: AdmissionOverlapPublicationTransactionV1): string {
  return hash({
    domain: 'v10.3-admission-overlap-publication-transaction-id-v1',
    invocationIntentId: transaction.invocationIntentId,
    inputGenerationSha256: transaction.inputGenerationSha256,
    universeSha256: transaction.universeSha256,
    normalizerRegistrySha256: transaction.normalizerRegistrySha256,
    overlapPolicySha256: transaction.overlapPolicySha256,
    operation: transaction.operation,
    expectedCurrentState: transaction.expectedCurrentState,
    recoveryNonce: transaction.recoveryNonce,
  });
}

function phaseRank(phase: AdmissionOverlapPublicationTransactionV1['state']['phase']): number {
  const ranks: Record<string, number> = {
    intent_fsynced: 0,
    primary_outputs_staged_fsynced: 1,
    tool_receipt_indexed: 2,
    generation_directory_staged_fsynced: 3,
    generation_directory_promoted: 4,
    generations_parent_fsynced: 5,
    current_output_projections_staged_fsynced: 6,
    current_output_projections_promoted: 7,
    current_generation_promoted: 8,
    output_directories_fsynced: 9,
    complete: 10,
  };
  return ranks[phase] ?? -1;
}

function atLeast(context: Context, phase: AdmissionOverlapPublicationTransactionV1['state']['phase']): boolean {
  return phaseRank(context.transaction.state.phase) >= phaseRank(phase);
}

function withState(context: Context, state: AdmissionOverlapPublicationTransactionV1['state']): AdmissionOverlapPublicationTransactionV1 {
  const base = { ...without(context.transaction as unknown as Record<string, unknown>, 'transactionSha256'), state } as Omit<AdmissionOverlapPublicationTransactionV1, 'transactionSha256'>;
  return { ...base, transactionSha256: transactionSha256(base) };
}

async function persistState(context: Context, state: AdmissionOverlapPublicationTransactionV1['state']): Promise<void> {
  context.transaction = withState(context, state);
  await writeReplace(context.layout.root, context.layout.transactionPath, canonical(context.transaction), context.transaction.transactionId);
}

async function invoke(context: Context, phase: OverlapPublicationPhase): Promise<void> {
  await context.phaseHook?.(phase);
}

function currentBase(generation: AdmissionOverlapGenerationV1, relativePath: string): Omit<AdmissionOverlapCurrentV1, 'currentSha256'> {
  return {
    version: 'v10.3-admission-overlap-current-v1',
    generation: generation.generation,
    generationSha256: generation.generationSha256,
    generationRelativePath: relativePath,
  };
}

function currentBytes(generation: AdmissionOverlapGenerationV1, relativePath: string): Buffer {
  const base = currentBase(generation, relativePath);
  return canonical({ ...base, currentSha256: currentSha256(base) });
}

function generationDirectoryRelative(generationSha: string): string {
  return `${OVERLAP_GENERATIONS_RELATIVE_ROOT}/${generationSha}`;
}

function stageDirectoryRelative(transactionId: string): string {
  return `${OVERLAP_STAGING_RELATIVE_ROOT}/${transactionId}`;
}

function stageArtifactRelative(transactionId: string, relativePath: string): string {
  return `${stageDirectoryRelative(transactionId)}/${relativePath}`;
}

function finalArtifactRelative(generationSha: string, relativePath: string): string {
  return `${generationDirectoryRelative(generationSha)}/${relativePath}`;
}

function primaryOutputSetSha256(artifacts: readonly AdmissionArtifactReceiptV1[]): string {
  return hash(artifacts.map((artifact) => ({ path: artifact.relativePath, bytes: artifact.bytes, sha256: artifact.sha256 })));
}

async function readCurrent(layout: Layout): Promise<AdmissionOverlapCurrentV1 | undefined> {
  let value: unknown;
  try { value = await readJson(layout.root, layout.currentPath); } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return undefined;
    throw error;
  }
  if (!isCalibrationAdmissionOverlapCurrentV1(value)) throw new Error('overlap_current_invalid');
  const generationPath = rootRelative(layout, `${value.generationRelativePath}/generation.json`);
  let generationValue: unknown;
  try { generationValue = await readJson(layout.root, generationPath); } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') throw new Error('overlap_current_not_anchored');
    throw error;
  }
  if (!isCalibrationAdmissionOverlapGenerationV1(generationValue) || generationValue.generationSha256 !== value.generationSha256 || generationValue.generation !== value.generation) throw new Error('overlap_current_not_anchored');
  try {
    await verifyGenerationTree(layout.root, rootRelative(layout, value.generationRelativePath), generationValue);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('overlap_generation_')) throw new Error('overlap_current_not_anchored');
    throw error;
  }
  return value;
}

function primaryStateFor(transactionId: string, artifacts: readonly AdmissionArtifactReceiptV1[]): Extract<AdmissionOverlapPublicationTransactionV1['state'], { phase: 'primary_outputs_staged_fsynced' }> {
  const primaryArtifacts = artifacts.map((artifact) => ({
    generationLocalRelativePath: artifact.relativePath,
    stagedRelativePath: stageArtifactRelative(transactionId, artifact.relativePath),
    bytes: artifact.bytes,
    sha256: artifact.sha256,
  }));
  return { phase: 'primary_outputs_staged_fsynced', primaryOutputSetSha256: primaryOutputSetSha256(artifacts), primaryArtifacts };
}

function primaryState(context: Context): Extract<AdmissionOverlapPublicationTransactionV1['state'], { phase: 'primary_outputs_staged_fsynced' }> {
  const artifacts = context.primary.map((entry) => entry.receipt);
  return primaryStateFor(context.transaction.transactionId, artifacts);
}

function toolState(context: Context): Extract<AdmissionOverlapPublicationTransactionV1['state'], { phase: 'tool_receipt_indexed' }> {
  const previous = context.transaction.state;
  const outputSet = 'primaryOutputSetSha256' in previous ? previous.primaryOutputSetSha256 : primaryOutputSetSha256(context.primary.map((entry) => entry.receipt));
  return {
    phase: 'tool_receipt_indexed',
    primaryOutputSetSha256: outputSet,
    toolReceiptId: context.toolReceipt.receiptId,
    toolReceiptSha256: context.toolReceipt.receiptSha256,
    toolAuthorityIndexSha256: context.toolReceipt.authorityIndexSha256,
  };
}

type PublishedOverlapPhase =
  | 'generation_directory_staged_fsynced'
  | 'generation_directory_promoted'
  | 'generations_parent_fsynced'
  | 'current_output_projections_staged_fsynced'
  | 'current_output_projections_promoted'
  | 'current_generation_promoted'
  | 'output_directories_fsynced'
  | 'complete';

function generationState(context: Context, phase: PublishedOverlapPhase): AdmissionOverlapPublicationTransactionV1['state'] {
  const previous = context.transaction.state;
  const outputSet = 'primaryOutputSetSha256' in previous ? previous.primaryOutputSetSha256 : primaryOutputSetSha256(context.primary.map((entry) => entry.receipt));
  const artifacts = context.primary.map((entry) => ({
    generationLocalRelativePath: entry.receipt.relativePath,
    stagedRelativePath: entry.stagedRelativePath,
    bytes: entry.receipt.bytes,
    sha256: entry.receipt.sha256,
  }));
  const generationPath = generationDirectoryRelative(context.generation.generationSha256);
  const projections = [{
    stagedRelativePath: `${OVERLAP_RELATIVE_ROOT}/current-generation.${context.transaction.transactionId}.tmp.json`,
    finalRelativePath: OVERLAP_CURRENT_RELATIVE_PATH,
    ...(context.lock.expectedCurrentState.kind === 'existing' ? { priorGenerationRelativePath: generationDirectoryRelative(context.lock.expectedCurrentState.generationSha256) } : {}),
    bytes: currentBytes(context.generation, generationPath).byteLength,
    sha256: sha(currentBytes(context.generation, generationPath)),
  }];
  return {
    phase,
    primaryOutputSetSha256: outputSet,
    toolReceiptId: context.toolReceipt.receiptId,
    toolReceiptSha256: context.toolReceipt.receiptSha256,
    toolAuthorityIndexSha256: context.toolReceipt.authorityIndexSha256,
    nextGenerationSha256: context.generation.generationSha256,
    generationDirectoryFinalRelativePath: generationPath,
    artifactSetSha256: context.generation.artifactSetSha256,
    generationArtifacts: artifacts,
    currentOutputProjections: projections,
  } as AdmissionOverlapPublicationTransactionV1['state'];
}

async function stagePrimary(context: Context): Promise<void> {
  const stage = overlapRelative(context.layout, stageDirectoryRelative(context.transaction.transactionId));
  await writeGenerationDescriptor(context, stage);
  for (const artifact of context.primary) {
    if (artifact.sourcePath !== undefined) await assertNoSymlinkPath(context.sourceRoot, artifact.sourcePath);
    const bytes = artifact.inlineBytes ?? (artifact.sourcePath === undefined ? undefined : await readFile(artifact.sourcePath));
    if (bytes === undefined) throw new Error(`overlap_source_artifact_missing:${artifact.receipt.relativePath}`);
    if (bytes.byteLength !== artifact.receipt.bytes || sha(bytes) !== artifact.receipt.sha256) throw new Error(`overlap_source_artifact_mismatch:${artifact.receipt.relativePath}`);
    try { await writeExclusive(context.layout.root, artifact.stagedPath, bytes); } catch (error) {
      if ((error as { code?: string }).code !== 'EEXIST') throw error;
      await assertBytes(context.layout.root, artifact.stagedPath, bytes);
    }
  }
  await syncDirectory(context.layout.staging);
}

async function writeGenerationDescriptor(context: Context, generationStagePath: string): Promise<void> {
  const path = join(generationStagePath, 'generation.json');
  try { await writeExclusive(context.layout.root, path, context.generationBytes); } catch (error) {
    if ((error as { code?: string }).code !== 'EEXIST') throw error;
    await assertBytes(context.layout.root, path, context.generationBytes);
  }
}

async function promoteGenerationDirectory(context: Context): Promise<void> {
  const stage = overlapRelative(context.layout, stageDirectoryRelative(context.transaction.transactionId));
  const final = overlapRelative(context.layout, generationDirectoryRelative(context.generation.generationSha256));
  await assertNoSymlinkPath(context.layout.root, stage);
  await assertNoSymlinkPath(context.layout.root, final);
  let finalExists = false;
  try { await stat(final); finalExists = true; } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
  }
  if (finalExists) {
    // A final hash-named directory is immutable. Verify the complete
    // descriptor/artifact set (including nested leaves) before removing only
    // this transaction's staging tree.
    await assertGeneration(context);
    try { await assertNoSymlinkPath(context.layout.root, stage); await stat(stage); } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return;
      throw error;
    }
    await removeTreeOwned(context.layout.root, stage, new Set(['generation.json', ...context.primary.map((artifact) => artifact.receipt.relativePath)]));
    return;
  }
  await verifyGenerationTree(context.layout.root, stage, context.generation);
  await rename(stage, final);
  await syncDirectory(dirname(final));
}

async function removeTreeOwned(root: string, directory: string, allowedFiles?: ReadonlySet<string>, relativeDirectory = ''): Promise<void> {
  await assertNoSymlinkPath(root, directory);
  let entries: string[];
  try { entries = await readdir(directory); } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    const child = join(directory, entry);
    await assertNoSymlinkPath(root, child);
    const metadata = await lstat(child);
    const childRelative = relativeDirectory === '' ? entry : `${relativeDirectory}/${entry}`;
    if (metadata.isDirectory()) {
      if (allowedFiles !== undefined && ![...allowedFiles].some((allowed) => allowed.startsWith(`${childRelative}/`))) throw new Error(`overlap_unknown_staging_path:${childRelative}`);
      await removeTreeOwned(root, child, allowedFiles, childRelative);
    }
    else {
      if (allowedFiles !== undefined && !allowedFiles.has(childRelative)) throw new Error(`overlap_unknown_staging_path:${childRelative}`);
      await unlink(child);
    }
  }
  await rmdir(directory);
}

/**
 * Validate the joins between the three disk-facing overlap envelopes.
 *
 * The individual Core validators prove shape and self-hashes.  This boundary
 * additionally proves that the envelopes describe one authority: the same
 * universe/policy, the same tool receipt, the index named by the ledger, and
 * the same coverage/count state.  It also binds each parsed envelope back to
 * the generation receipt so a valid JSON object cannot be substituted at a
 * known path.
 */
export function verifyOverlapArtifactRelations(input: OverlapArtifactRelationInput): OverlapArtifactRelationResult {
  const errors: string[] = [];
  const add = (error: string): void => { if (!errors.includes(error)) errors.push(error); };

  const required: readonly [string, 'index' | 'resource' | 'ledger'][] = [
    ['index.json', 'index'],
    ['overlap-resource-receipt.json', 'resource'],
    ['overlap-ledger.json', 'ledger'],
  ];
  const generationValid = isCalibrationAdmissionOverlapGenerationV1(input.generation);
  const candidateArtifacts = isRecord(input.generation) && Array.isArray(input.generation.artifacts)
    ? input.generation.artifacts
    : [];
  const artifactByPath = new Map<string, AdmissionArtifactReceiptV1>();
  for (const candidate of candidateArtifacts) {
    if (isRecord(candidate) && typeof candidate.relativePath === 'string') {
      artifactByPath.set(candidate.relativePath, candidate as unknown as AdmissionArtifactReceiptV1);
    }
  }
  for (const [path] of required) if (!artifactByPath.has(path)) add(`overlap_relation_envelope_missing:${path}`);
  if (!generationValid) {
    add('overlap_relation_generation_invalid');
    return { ok: false, errors };
  }

  const indexValid = validateCalibrationAdmissionOverlapIndexReceiptV1(input.index).ok;
  const resourceValid = validateCalibrationAdmissionOverlapResourceReceiptV1(input.resource).ok;
  const ledgerValid = validateCalibrationAdmissionOverlapLedgerV1(input.ledger).ok;
  if (!indexValid) add('overlap_relation_index_invalid');
  if (!resourceValid) add('overlap_relation_resource_invalid');
  if (!ledgerValid) add('overlap_relation_ledger_invalid');
  if (!indexValid || !resourceValid || !ledgerValid) return { ok: false, errors };

  const index = input.index as AdmissionOverlapIndexReceiptV1;
  const resource = input.resource as AdmissionOverlapResourceReceiptV1;
  const ledger = input.ledger as AdmissionOverlapLedgerV1;

  const authorityHashes = [
    input.generation.universeSha256 === index.universeSha256,
    input.generation.universeSha256 === resource.universeSha256,
    input.generation.universeSha256 === ledger.universeSha256,
    input.generation.overlapPolicySha256 === index.overlapPolicySha256,
    input.generation.overlapPolicySha256 === resource.overlapPolicySha256,
    input.generation.overlapPolicySha256 === ledger.overlapPolicySha256,
    index.normalizerRegistrySha256 === ledger.normalizerRegistrySha256,
    index.toolReceiptSha256 === resource.toolReceiptSha256,
  ];
  if (authorityHashes.some((matches) => !matches)) add('overlap_relation_authority_hash_mismatch');
  if (ledger.indexReceiptSha256 !== index.receiptSha256) add('overlap_relation_index_ledger_mismatch');
  if (index.complete !== resource.coverageComplete || index.complete !== ledger.coverageComplete) add('overlap_relation_coverage_mismatch');
  if (index.coveredCandidateUnits !== resource.recordCount) add('overlap_relation_count_mismatch');
  if (index.complete && (!resource.withinAllLimits || !ledger.coverageComplete)) add('overlap_relation_completion_mismatch');

  const envelopeValues: readonly [string, unknown, string][] = [
    ['index.json', input.index, 'index'],
    ['overlap-resource-receipt.json', input.resource, 'receipt'],
    ['overlap-ledger.json', input.ledger, 'ledger'],
  ];
  for (const [path, value, kind] of envelopeValues) {
    const artifact = artifactByPath.get(path);
    if (artifact === undefined) continue;
    const bytes = canonical(value);
    if (artifact.kind !== kind || artifact.pathBase !== 'generation_local'
      || artifact.bytes !== bytes.byteLength || artifact.sha256 !== sha(bytes)) {
      add(`overlap_relation_envelope_binding:${path}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

async function verifyGenerationTree(root: string, directory: string, generation: AdmissionOverlapGenerationV1): Promise<void> {
  await assertNoSymlinkPath(root, directory);
  const expectedFiles = new Set(['generation.json', ...generation.artifacts.map((artifact) => artifact.relativePath)]);
  const seen = new Set<string>();
  const walk = async (current: string, relativeDirectory: string): Promise<void> => {
    await assertNoSymlinkPath(root, current);
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const child = join(current, entry.name);
      await assertNoSymlinkPath(root, child);
      const childRelative = relativeDirectory === '' ? entry.name : `${relativeDirectory}/${entry.name}`;
      if (entry.isDirectory()) {
        await walk(child, childRelative);
      } else {
        if (!entry.isFile() || !expectedFiles.has(childRelative)) throw new Error(`overlap_generation_orphan:${childRelative}`);
        seen.add(childRelative);
      }
    }
  };
  await walk(directory, '');
  for (const expected of expectedFiles) if (!seen.has(expected)) throw new Error(`overlap_generation_missing:${expected}`);
  await assertBytes(root, join(directory, 'generation.json'), canonical(generation));
  for (const artifact of generation.artifacts) {
    const path = join(directory, artifact.relativePath);
    await assertNoSymlinkPath(root, path);
    const bytes = await readFile(path);
    if (bytes.byteLength !== artifact.bytes || sha(bytes) !== artifact.sha256) throw new Error(`overlap_generation_artifact_mismatch:${artifact.relativePath}`);
  }
  const envelope = (relativePath: string): Promise<unknown> => readJson(root, join(directory, relativePath));
  const relation = await Promise.all([
    envelope('index.json'),
    envelope('overlap-resource-receipt.json'),
    envelope('overlap-ledger.json'),
  ]).then(([index, resource, ledger]) => verifyOverlapArtifactRelations({ generation, index, resource, ledger }));
  if (!relation.ok) throw new Error(relation.errors[0] ?? 'overlap_relation_invalid');
}

async function assertGeneration(context: Context): Promise<void> {
  const final = overlapRelative(context.layout, generationDirectoryRelative(context.generation.generationSha256));
  await verifyGenerationTree(context.layout.root, final, context.generation);
}

/**
 * Validate the immutable generation-number chain before a recovery can reuse
 * a journal.  Hashing the parent link alone is not enough: a forged (or
 * stale) descriptor could point at the right parent while jumping over one
 * or more generations.  The first generation is always zero; every replace
 * must be exactly one greater than its parent's descriptor.
 */
async function assertGenerationNumberChain(
  layout: Layout,
  expectedCurrentState: AdmissionOverlapPublicationLockV1['expectedCurrentState'],
  generation: AdmissionOverlapGenerationV1,
): Promise<void> {
  if (expectedCurrentState.kind === 'absent') {
    if (generation.generation !== 0 || generation.parentGenerationSha256 !== undefined) throw new Error('overlap_recovery_generation_number_mismatch');
    return;
  }

  const parentSha = expectedCurrentState.generationSha256;
  const parentPath = rootRelative(layout, `${generationDirectoryRelative(parentSha)}/generation.json`);
  let parentValue: unknown;
  try {
    parentValue = await readJson(layout.root, parentPath);
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') throw new Error('overlap_recovery_parent_generation_missing');
    throw error;
  }
  if (!isCalibrationAdmissionOverlapGenerationV1(parentValue)
    || parentValue.generationSha256 !== parentSha
    || !Number.isSafeInteger(parentValue.generation)
    || parentValue.generation >= Number.MAX_SAFE_INTEGER
    || generation.generation !== parentValue.generation + 1) {
    throw new Error('overlap_recovery_generation_number_mismatch');
  }
  try {
    await verifyGenerationTree(layout.root, rootRelative(layout, generationDirectoryRelative(parentSha)), parentValue);
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT' || (error instanceof Error && error.message.startsWith('overlap_generation_'))) throw new Error('overlap_recovery_parent_generation_not_anchored');
    throw error;
  }
}

function primaryArtifactSummary(artifacts: readonly AdmissionArtifactReceiptV1[]): readonly { path: string; bytes: number; sha256: string }[] {
  return artifacts.map((artifact) => ({ path: artifact.relativePath, bytes: artifact.bytes, sha256: artifact.sha256 }));
}

async function verifyStagedPrimaryArtifacts(layout: Layout, transactionId: string, artifacts: readonly AdmissionArtifactReceiptV1[]): Promise<void> {
  for (const artifact of artifacts) {
    const path = rootRelative(layout, stageArtifactRelative(transactionId, artifact.relativePath));
    let bytes: Buffer;
    try { await assertNoSymlinkPath(layout.root, path); bytes = await readFile(path); } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') throw new Error(`overlap_recovery_primary_missing:${artifact.relativePath}`);
      throw error;
    }
    if (bytes.byteLength !== artifact.bytes || sha(bytes) !== artifact.sha256) throw new Error(`overlap_recovery_primary_mismatch:${artifact.relativePath}`);
  }
}

/** Bind a staged generation to the primary-output journal before resuming. */
async function assertJournaledPrimaryBinding(layout: Layout, transaction: AdmissionOverlapPublicationTransactionV1, generation: AdmissionOverlapGenerationV1): Promise<void> {
  const state = transaction.state;
  if (state.phase === 'intent_fsynced') throw new Error('overlap_recovery_primary_binding_missing');
  const expectedSummary = primaryArtifactSummary(generation.artifacts);
  if (!('primaryOutputSetSha256' in state) || state.primaryOutputSetSha256 !== primaryOutputSetSha256(generation.artifacts)) throw new Error('overlap_recovery_primary_output_set_mismatch');
  if ('primaryArtifacts' in state) {
    const journalSummary = state.primaryArtifacts.map((artifact) => ({ path: artifact.generationLocalRelativePath, bytes: artifact.bytes, sha256: artifact.sha256 }));
    if (calibrationAdmissionCanonicalJson(journalSummary) !== calibrationAdmissionCanonicalJson(expectedSummary)) throw new Error('overlap_recovery_primary_artifacts_mismatch');
    for (const artifact of state.primaryArtifacts) {
      if (artifact.stagedRelativePath !== stageArtifactRelative(transaction.transactionId, artifact.generationLocalRelativePath)) throw new Error('overlap_recovery_primary_path_mismatch');
    }
  }
  if (phaseRank(state.phase) <= phaseRank('generation_directory_staged_fsynced')) await verifyStagedPrimaryArtifacts(layout, transaction.transactionId, generation.artifacts);
}

function assertGenerationStateBinding(transaction: AdmissionOverlapPublicationTransactionV1, generation: AdmissionOverlapGenerationV1): void {
  if (!('nextGenerationSha256' in transaction.state)) throw new Error('overlap_recovery_generation_state_missing');
  const state = transaction.state;
  if (state.nextGenerationSha256 !== generation.generationSha256
    || state.generationDirectoryFinalRelativePath !== generationDirectoryRelative(generation.generationSha256)
    || state.artifactSetSha256 !== generation.artifactSetSha256
    || calibrationAdmissionCanonicalJson(state.generationArtifacts.map((artifact) => ({ path: artifact.generationLocalRelativePath, bytes: artifact.bytes, sha256: artifact.sha256 })))
      !== calibrationAdmissionCanonicalJson(generation.artifacts.map((artifact) => ({ path: artifact.relativePath, bytes: artifact.bytes, sha256: artifact.sha256 })))) throw new Error('overlap_recovery_generation_state_mismatch');
  for (const artifact of state.generationArtifacts) {
    if (artifact.stagedRelativePath !== stageArtifactRelative(transaction.transactionId, artifact.generationLocalRelativePath)) throw new Error('overlap_recovery_generation_state_path_mismatch');
  }
  const relativePath = generationDirectoryRelative(generation.generationSha256);
  const currentBytesValue = currentBytes(generation, relativePath);
  const expectedProjection = [{
    stagedRelativePath: `${OVERLAP_RELATIVE_ROOT}/current-generation.${transaction.transactionId}.tmp.json`,
    finalRelativePath: OVERLAP_CURRENT_RELATIVE_PATH,
    ...(transaction.expectedCurrentState.kind === 'existing' ? { priorGenerationRelativePath: generationDirectoryRelative(transaction.expectedCurrentState.generationSha256) } : {}),
    bytes: currentBytesValue.byteLength,
    sha256: sha(currentBytesValue),
  }];
  if (calibrationAdmissionCanonicalJson(state.currentOutputProjections) !== calibrationAdmissionCanonicalJson(expectedProjection)) throw new Error('overlap_recovery_current_projection_mismatch');
}

/**
 * Current is a self-authenticating pointer to the transaction's generation.
 * Recovery must refuse to continue once a phase says the pointer was
 * promoted unless that exact pointer and its complete immutable tree remain
 * present.
 */
async function assertCurrentGenerationPointer(layout: Layout, generation: AdmissionOverlapGenerationV1): Promise<void> {
  const current = await readCurrent(layout);
  if (current === undefined
    || current.generation !== generation.generation
    || current.generationSha256 !== generation.generationSha256
    || current.generationRelativePath !== generationDirectoryRelative(generation.generationSha256)) {
    throw new Error('overlap_current_generation_mismatch');
  }
}

async function assertCurrentGeneration(context: Context): Promise<void> {
  await assertCurrentGenerationPointer(context.layout, context.generation);
}

async function promoteCurrent(context: Context): Promise<void> {
  const relativePath = generationDirectoryRelative(context.generation.generationSha256);
  const bytes = currentBytes(context.generation, relativePath);
  const current = await readCurrent(context.layout);
  if (current?.generationSha256 === context.generation.generationSha256) {
    await assertBytes(context.layout.root, context.layout.currentPath, bytes);
    return;
  }
  if (context.lock.expectedCurrentState.kind === 'absent') {
    if (current !== undefined) throw new Error('overlap_expected_current_absent');
  } else if (current?.generationSha256 !== context.lock.expectedCurrentState.generationSha256) {
    throw new Error('overlap_expected_current_cas_failed');
  }
  const temporary = overlapRelative(context.layout, `current-generation.${context.transaction.transactionId}.tmp.json`);
  try { await writeExclusive(context.layout.root, temporary, bytes); } catch (error) {
    if ((error as { code?: string }).code !== 'EEXIST') throw error;
    await assertBytes(context.layout.root, temporary, bytes);
  }
  const reread = await readCurrent(context.layout);
  if (context.lock.expectedCurrentState.kind === 'absent' ? reread !== undefined : reread?.generationSha256 !== context.lock.expectedCurrentState.generationSha256) throw new Error('overlap_expected_current_cas_failed');
  await rename(temporary, context.layout.currentPath);
  await syncDirectory(context.layout.overlap);
}

async function clean(context: Context): Promise<void> {
  await invoke(context, 'cleanup');
  const stage = overlapRelative(context.layout, stageDirectoryRelative(context.transaction.transactionId));
  await removeTreeOwned(context.layout.root, stage, new Set(['generation.json', ...context.primary.map((artifact) => artifact.receipt.relativePath)]));
  await removeKnown(context.layout.root, overlapRelative(context.layout, `current-generation.${context.transaction.transactionId}.tmp.json`));
  // The staging tree and temporary projection are durable-cleaned while the
  // transaction journal remains available. A fault at this boundary can
  // resume through the normal transaction-backed recovery path.
  await syncDirectory(context.layout.overlap);
  await invoke(context, 'cleanup-fsynced');
  await removeKnown(context.layout.root, context.layout.transactionPath);
  // The transaction unlink is durable before its hook is exposed. A failure
  // in that hook is therefore recoverable through the still-present lock's
  // lock-only rollback path.
  await syncDirectory(context.layout.overlap);
  await invoke(context, 'transaction-unlinked');
  await removeKnown(context.layout.root, context.layout.lockPath);
  // Likewise make the lock unlink durable before notifying callers that the
  // publication has no remaining recovery journal.
  try {
    await syncDirectory(context.layout.overlap);
    await invoke(context, 'lock-unlinked');
    await syncDirectory(context.layout.overlap);
  } catch (error) {
    // At this boundary both recovery journals are already durably gone and
    // the current pointer/tree have been verified.  Report the diagnostic
    // hook fault without falsely advertising a recoverable publication.
    throw new OverlapPublicationPostCompletionError(
      result(context, true, false, 'post-completion'),
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function run(context: Context): Promise<OverlapPublicationResult> {
  try {
    // These phases are only valid while the current pointer still anchors the
    // transaction's generation.  This check also protects recovery after a
    // crash immediately following any of the phase journal writes.
    if (atLeast(context, 'generation_directory_promoted')) await assertGeneration(context);
    if (atLeast(context, 'current_output_projections_promoted')) await assertCurrentGeneration(context);
    if (!atLeast(context, 'primary_outputs_staged_fsynced')) {
      await stagePrimary(context);
      await persistState(context, primaryState(context));
      await invoke(context, 'primary-outputs-staged-fsynced');
    }
    if (!atLeast(context, 'tool_receipt_indexed')) {
      await persistState(context, toolState(context));
      await invoke(context, 'tool-receipt-indexed');
    }
    if (!atLeast(context, 'generation_directory_staged_fsynced')) {
      const stage = overlapRelative(context.layout, stageDirectoryRelative(context.transaction.transactionId));
      await writeGenerationDescriptor(context, stage);
      await syncDirectory(stage);
      await persistState(context, generationState(context, 'generation_directory_staged_fsynced'));
      await invoke(context, 'generation-directory-staged-fsynced');
    }
    if (!atLeast(context, 'generation_directory_promoted')) {
      await promoteGenerationDirectory(context);
      await persistState(context, generationState(context, 'generation_directory_promoted'));
      await invoke(context, 'generation-directory-promoted');
    }
    if (!atLeast(context, 'generations_parent_fsynced')) {
      await syncDirectory(context.layout.generations);
      await persistState(context, generationState(context, 'generations_parent_fsynced'));
      await invoke(context, 'generations-parent-fsynced');
    }
    if (!atLeast(context, 'current_output_projections_staged_fsynced')) {
      const bytes = currentBytes(context.generation, generationDirectoryRelative(context.generation.generationSha256));
      const temporary = overlapRelative(context.layout, `current-generation.${context.transaction.transactionId}.tmp.json`);
      try { await writeExclusive(context.layout.root, temporary, bytes); } catch (error) {
        if ((error as { code?: string }).code !== 'EEXIST') throw error;
        await assertBytes(context.layout.root, temporary, bytes);
      }
      await persistState(context, generationState(context, 'current_output_projections_staged_fsynced'));
      await invoke(context, 'current-output-projections-staged-fsynced');
    }
    if (!atLeast(context, 'current_output_projections_promoted')) {
      // Re-check the immutable final tree immediately before writing current;
      // a fault hook or an unexpected concurrent mutation must never leave a
      // valid-looking pointer to damaged bytes.
      await assertGeneration(context);
      await promoteCurrent(context);
      await persistState(context, generationState(context, 'current_output_projections_promoted'));
      await assertCurrentGeneration(context);
      await invoke(context, 'current-output-projections-promoted');
    }
    if (!atLeast(context, 'current_generation_promoted')) {
      await assertGeneration(context);
      await persistState(context, generationState(context, 'current_generation_promoted'));
      await assertCurrentGeneration(context);
      await invoke(context, 'current-generation-promoted');
    }
    if (!atLeast(context, 'output_directories_fsynced')) {
      await syncDirectory(context.layout.overlap);
      await syncDirectory(context.layout.generations);
      await persistState(context, generationState(context, 'output_directories_fsynced'));
      await assertCurrentGeneration(context);
      await invoke(context, 'output-directories-fsynced');
    }
    if (!atLeast(context, 'complete')) {
      await persistState(context, generationState(context, 'complete'));
      await assertCurrentGeneration(context);
      await invoke(context, 'complete');
    }
    await assertGeneration(context);
    await assertCurrentGeneration(context);
    await clean(context);
    return result(context, true, false, 'complete');
  } catch (error) {
    if (error instanceof OverlapPublicationPendingError
      || error instanceof OverlapPublicationContendedError
      || error instanceof OverlapPublicationPostCompletionError) throw error;
    throw new OverlapPublicationPendingError(result(context, false, true, 'recovery-required'), error instanceof Error ? error.message : String(error));
  }
}

function result(context: Context, complete: boolean, recoveryRequired: boolean, status: OverlapPublicationStatus): OverlapPublicationResult {
  return {
    complete,
    recoveryRequired,
    status,
    transactionId: context.transaction.transactionId,
    generationSha256: context.generation.generationSha256,
    transactionPath: context.layout.transactionPath,
    lockPath: context.layout.lockPath,
    currentPath: context.layout.currentPath,
  };
}

function validateRequest(request: OverlapPublicationRequest): void {
  if (!isCalibrationAdmissionOverlapUniverseV1(request.universe)) throw new Error('overlap_universe_invalid');
  if (!isCalibrationAdmissionOverlapPolicyV1(request.policy)) throw new Error('overlap_policy_invalid');
  if (!isCalibrationAdmissionNormalizerRegistryV1(request.normalizerRegistry)) throw new Error('overlap_registry_invalid');
  if (request.normalizerRegistry.registrySha256 !== request.universe.normalizerRegistrySha256) throw new Error('overlap_registry_hash_mismatch');
  if (!isCalibrationAdmissionToolAuthoritySnapshotV1(request.toolAuthoritySnapshot)) throw new Error('overlap_tool_snapshot_invalid');
  if (!validSha(request.inputGenerationSha256) || !validSha(request.invocationIntentId) || !validId(request.toolReceipt.receiptId) || !validSha(request.toolReceipt.receiptSha256) || !validSha(request.toolReceipt.authorityIndexSha256)) throw new Error('overlap_publication_binding_invalid');
  if (!Number.isSafeInteger(request.generation) || request.generation < 0) throw new Error('overlap_generation_invalid');
  if (request.toolAuthoritySnapshot.indexGenerationSha256 !== request.toolReceipt.authorityIndexSha256) throw new Error('overlap_tool_snapshot_index_mismatch');
  if (!request.toolAuthoritySnapshot.receiptIds.includes(request.toolReceipt.receiptId)) throw new Error('overlap_tool_snapshot_receipt_missing');
  if (!request.toolAuthoritySnapshot.invocationIntentIds.includes(request.invocationIntentId)) throw new Error('overlap_tool_snapshot_invocation_missing');
  if (request.buildResult.errors.length > 0 || !request.buildResult.ledger.coverageComplete || !request.buildResult.resourceReceipt.coverageComplete || !request.buildResult.resourceReceipt.withinAllLimits) throw new Error('overlap_build_incomplete');
}

async function makeContext(layout: Layout, request: OverlapPublicationRequest, lock: AdmissionOverlapPublicationLockV1, transaction: AdmissionOverlapPublicationTransactionV1, generation: AdmissionOverlapGenerationV1, artifacts: readonly AdmissionArtifactReceiptV1[], phaseHook?: (phase: OverlapPublicationPhase) => void | Promise<void>): Promise<Context> {
  const sourceRoot = await realpath(resolve(request.generationLocalRoot));
  const inline = new Map<string, Buffer>([
    ['index.json', canonical(request.buildResult.indexReceipt)],
    ['overlap-resource-receipt.json', canonical(request.buildResult.resourceReceipt)],
    ['overlap-ledger.json', canonical(request.buildResult.ledger)],
  ]);
  const primary = artifacts.map((receipt) => {
    const inlineBytes = inline.get(receipt.relativePath);
    const sourcePath = inlineBytes === undefined ? resolve(sourceRoot, receipt.relativePath) : undefined;
    if (sourcePath !== undefined && !inside(sourceRoot, sourcePath)) throw new Error('overlap_source_artifact_escape');
    const stagedRelativePath = stageArtifactRelative(transaction.transactionId, receipt.relativePath);
    return { receipt, ...(sourcePath === undefined ? {} : { sourcePath }), ...(inlineBytes === undefined ? {} : { inlineBytes }), stagedRelativePath, stagedPath: rootRelative(layout, stagedRelativePath) };
  });
  return { layout, lock, transaction, generation, generationBytes: canonical(generation), primary, sourceRoot, toolReceipt: request.toolReceipt, phaseHook };
}

export async function publishAdmissionOverlap(request: OverlapPublicationRequest): Promise<OverlapPublicationResult> {
  validateRequest(request);
  const layout = await ensureLayout(request.root);
  const current = await readCurrent(layout);
  const operation = request.operation ?? (current === undefined ? 'create' : 'replace');
  const expectedCurrentState = operation === 'create'
    ? { kind: 'absent' as const }
    : { kind: 'existing' as const, generationSha256: request.expectedCurrentGenerationSha256 ?? current?.generationSha256 ?? '' };
  if (operation === 'create' && current !== undefined) throw new Error('overlap_create_requires_absent_current');
  if (operation === 'replace' && (!validSha(expectedCurrentState.generationSha256) || current?.generationSha256 !== expectedCurrentState.generationSha256)) throw new Error('overlap_replace_expected_current_mismatch');
  if (operation === 'create' && request.generation !== 0) throw new Error('overlap_create_generation_must_be_zero');
  if (operation === 'replace' && (current === undefined || request.generation !== current.generation + 1)) throw new Error('overlap_generation_must_increment');
  const nonce = request.recoveryNonce ?? randomBytes(32).toString('hex');
  if (!validSha(nonce)) throw new Error('overlap_recovery_nonce_invalid');
  const lockBase: Omit<AdmissionOverlapPublicationLockV1, 'lockSha256'> = {
    version: 'v10.3-admission-overlap-publication-lock-v1',
    lockId: hash({ domain: 'v10.3-overlap-publication-lock-id-v1', nonce, inputGenerationSha256: request.inputGenerationSha256 }),
    intendedTransactionId: '',
    invocationIntentId: request.invocationIntentId,
    inputGenerationSha256: request.inputGenerationSha256,
    universeSha256: request.universe.universeSha256,
    normalizerRegistrySha256: request.normalizerRegistry.registrySha256,
    overlapPolicySha256: request.policy.policySha256,
    operation,
    expectedCurrentState,
    recoveryNonce: nonce,
  };
  const transactionId = deriveTransactionId(lockBase);
  const lock: AdmissionOverlapPublicationLockV1 = { ...lockBase, intendedTransactionId: transactionId, lockSha256: lockSha256({ ...lockBase, intendedTransactionId: transactionId }) };
  const artifacts = builderArtifacts(request.buildResult);
  const artifactSetSha256 = artifactSetSha256Fn(artifacts);
  const generationBase: Omit<AdmissionOverlapGenerationV1, 'generationSha256'> = {
    version: 'v10.3-admission-overlap-generation-v1',
    generation: request.generation,
    ...(current === undefined ? {} : { parentGenerationSha256: current.generationSha256 }),
    inputGenerationSha256: request.inputGenerationSha256,
    universeSha256: request.universe.universeSha256,
    overlapPolicySha256: request.policy.policySha256,
    artifactSetSha256,
    artifacts,
    toolAuthoritySnapshot: request.toolAuthoritySnapshot,
  };
  const generation: AdmissionOverlapGenerationV1 = { ...generationBase, generationSha256: generationSha256(generationBase) };
  const transactionBase = {
    version: 'v10.3-admission-overlap-publication-transaction-v1' as const,
    transactionId,
    lockSha256: lock.lockSha256,
    invocationIntentId: request.invocationIntentId,
    inputGenerationSha256: request.inputGenerationSha256,
    universeSha256: request.universe.universeSha256,
    normalizerRegistrySha256: request.normalizerRegistry.registrySha256,
    overlapPolicySha256: request.policy.policySha256,
    operation,
    expectedCurrentState,
    recoveryNonce: nonce,
    generationStagingRelativePath: stageDirectoryRelative(transactionId),
    currentGenerationTemporaryRelativePath: `${OVERLAP_RELATIVE_ROOT}/current-generation.${transactionId}.tmp.json`,
    currentGenerationFinalRelativePath: OVERLAP_CURRENT_RELATIVE_PATH,
    // stagePrimary runs before the transaction is exposed.  Record the exact
    // staged primary set in that first durable state so recovery never has to
    // trust a self-consistent, but independently forged, generation.json.
    state: primaryStateFor(transactionId, artifacts),
  } as Omit<AdmissionOverlapPublicationTransactionV1, 'transactionSha256'>;
  const transaction: AdmissionOverlapPublicationTransactionV1 = { ...transactionBase, transactionSha256: transactionSha256(transactionBase) };
  const context = await makeContext(layout, request, lock, transaction, generation, artifacts, request.phaseHook);
  try {
    try {
      await writeExclusive(layout.root, layout.lockPath, canonical(lock));
    } catch (error) {
      if ((error as { code?: string }).code === 'EEXIST') {
        throw new OverlapPublicationContendedError(result(context, false, false, 'contended'));
      }
      throw error;
    }
    await invoke(context, 'lock-fsynced');
    // Materialise the complete descriptor + primary set under the lock-owned
    // staging path before the transaction journal is exposed. A lock-only crash
    // can therefore prove and roll back this exact tree without discovering
    // unrelated work directories.
    await stagePrimary(context);
    await writeExclusive(layout.root, layout.transactionPath, canonical(transaction));
    await invoke(context, 'primary-outputs-staged-fsynced');
    await invoke(context, 'transaction-fsynced');
    return run(context);
  } catch (error) {
    if (error instanceof OverlapPublicationPendingError
      || error instanceof OverlapPublicationContendedError
      || error instanceof OverlapPublicationPostCompletionError) throw error;
    throw new OverlapPublicationPendingError(result(context, false, true, 'recovery-required'), error instanceof Error ? error.message : String(error));
  }
}

async function recoverContext(request: OverlapPublicationRecoveryRequest, layout: Layout): Promise<Context> {
  const lockValue = await readJson(layout.root, layout.lockPath);
  if (!isCalibrationAdmissionOverlapPublicationLockV1(lockValue)) throw new Error('overlap_lock_invalid');
  const lock = lockValue;
  if (lock.recoveryNonce !== request.recoveryNonce || (request.transactionId !== undefined && request.transactionId !== lock.intendedTransactionId)) throw new Error('overlap_recovery_binding_mismatch');
  if (deriveTransactionIdFromLock(lock) !== lock.intendedTransactionId) throw new Error('overlap_lock_transaction_identity_invalid');
  let transactionValue: unknown;
  try { transactionValue = await readJson(layout.root, layout.transactionPath); } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
    const stage = overlapRelative(layout, stageDirectoryRelative(lock.intendedTransactionId));
    let stagedGeneration: AdmissionOverlapGenerationV1 | undefined;
    try {
      const stagedValue = await readJson(layout.root, join(stage, 'generation.json'));
      if (!isCalibrationAdmissionOverlapGenerationV1(stagedValue)
        || stagedValue.generationSha256 !== calibrationAdmissionSha256(without(stagedValue as unknown as Record<string, unknown>, 'generationSha256'))
        || stagedValue.inputGenerationSha256 !== lock.inputGenerationSha256
        || stagedValue.universeSha256 !== lock.universeSha256
        || stagedValue.overlapPolicySha256 !== lock.overlapPolicySha256) throw new Error('overlap_lock_only_generation_mismatch');
      await assertGenerationNumberChain(layout, lock.expectedCurrentState, stagedValue);
      stagedGeneration = stagedValue;
      try { await verifyGenerationTree(layout.root, stage, stagedGeneration); } catch (verificationError) {
        if (!(verificationError instanceof Error) || verificationError.message.startsWith('overlap_generation_orphan')) throw verificationError;
        await removeTreeOwned(layout.root, stage, new Set(['generation.json', ...stagedGeneration.artifacts.map((artifact) => artifact.relativePath)]));
      }
    } catch (stagedError) {
      if ((stagedError as { code?: string }).code !== 'ENOENT') throw stagedError;
    }
    if (stagedGeneration === undefined) {
      // No descriptor means no proven owned tree. Preserve any partial or
      // unknown staging path and refuse recovery rather than deleting it.
      try { await stat(stage); throw new Error('overlap_lock_only_staging_unproven'); } catch (stageError) {
        if ((stageError as { code?: string }).code !== 'ENOENT') throw stageError;
      }
    } else {
      try { await removeTreeOwned(layout.root, stage, new Set(['generation.json', ...stagedGeneration.artifacts.map((artifact) => artifact.relativePath)])); } catch (cleanupError) { throw cleanupError; }
    }
    await removeKnown(layout.root, overlapRelative(layout, `current-generation.${lock.intendedTransactionId}.tmp.json`));
    await removeKnown(layout.root, layout.lockPath);
    await syncDirectory(layout.overlap);
    throw new Error('overlap_lock_only_recovery_complete');
  }
  if (!isCalibrationAdmissionOverlapPublicationTransactionV1(transactionValue)) {
    const diagnostic = validateCalibrationAdmissionOverlapPublicationTransactionV1(transactionValue);
    throw new Error(`overlap_transaction_invalid:${diagnostic.errors.join('|')}`);
  }
  const transaction = transactionValue;
  if (transaction.lockSha256 !== lock.lockSha256
    || transaction.transactionId !== lock.intendedTransactionId
    || transaction.invocationIntentId !== lock.invocationIntentId
    || transaction.inputGenerationSha256 !== lock.inputGenerationSha256
    || transaction.universeSha256 !== lock.universeSha256
    || transaction.normalizerRegistrySha256 !== lock.normalizerRegistrySha256
    || transaction.overlapPolicySha256 !== lock.overlapPolicySha256
    || transaction.operation !== lock.operation
    || calibrationAdmissionCanonicalJson(transaction.expectedCurrentState) !== calibrationAdmissionCanonicalJson(lock.expectedCurrentState)
    || transaction.recoveryNonce !== lock.recoveryNonce
    || transaction.generationStagingRelativePath !== stageDirectoryRelative(transaction.transactionId)
    || transaction.currentGenerationTemporaryRelativePath !== `${OVERLAP_RELATIVE_ROOT}/current-generation.${transaction.transactionId}.tmp.json`
    || transaction.currentGenerationFinalRelativePath !== OVERLAP_CURRENT_RELATIVE_PATH) throw new Error('overlap_transaction_lock_mismatch');
  if (transaction.state.phase === 'complete' && (!('nextGenerationSha256' in transaction.state) || transaction.state.nextGenerationSha256 === undefined)) throw new Error('overlap_completed_transaction_state_invalid');
  // The generation hash is journaled when the descriptor is staged, but the
  // hash-named final directory does not exist until the promotion boundary.
  // Before that boundary recovery must read the transaction-owned staging
  // descriptor; otherwise a crash at generation-directory-staged-fsynced is
  // incorrectly reported as a missing final generation.
  const generationPromoted = phaseRank(transaction.state.phase) >= phaseRank('generation_directory_promoted');
  let generationSha = generationPromoted && 'nextGenerationSha256' in transaction.state ? transaction.state.nextGenerationSha256 : undefined;
  let generationPath: string;
  if (generationSha) {
    generationPath = overlapRelative(layout, generationDirectoryRelative(generationSha));
  } else {
    generationPath = overlapRelative(layout, stageDirectoryRelative(transaction.transactionId));
  }
  let generationValue: unknown;
  try {
    generationValue = await readJson(layout.root, join(generationPath, 'generation.json'));
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
    throw new Error(`overlap_recovery_generation_missing:${join(generationPath, 'generation.json')}`);
  }
  if (!isCalibrationAdmissionOverlapGenerationV1(generationValue) || (generationSha !== undefined && generationValue.generationSha256 !== generationSha)) throw new Error('overlap_recovery_generation_invalid');
  const generation = generationValue;
  generationSha = generation.generationSha256;
  if (generation.inputGenerationSha256 !== transaction.inputGenerationSha256
    || generation.universeSha256 !== transaction.universeSha256
    || generation.overlapPolicySha256 !== transaction.overlapPolicySha256
    || (lock.expectedCurrentState.kind === 'existing' && generation.parentGenerationSha256 !== lock.expectedCurrentState.generationSha256)
    || (lock.expectedCurrentState.kind === 'absent' && generation.parentGenerationSha256 !== undefined)) throw new Error('overlap_recovery_generation_transaction_mismatch');
  await assertGenerationNumberChain(layout, lock.expectedCurrentState, generation);
  await assertJournaledPrimaryBinding(layout, transaction, generation);
  if ('nextGenerationSha256' in transaction.state) assertGenerationStateBinding(transaction, generation);
  const artifacts = generation.artifacts;
  const primary: PrimaryArtifact[] = [];
  for (const receipt of artifacts) {
    const finalPath = rootRelative(layout, finalArtifactRelative(generationSha!, receipt.relativePath));
    const stagedPath = rootRelative(layout, stageArtifactRelative(transaction.transactionId, receipt.relativePath));
    let sourcePath = finalPath;
    try { await stat(finalPath); } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') throw error;
      sourcePath = stagedPath;
    }
    primary.push({ receipt, sourcePath, stagedRelativePath: stageArtifactRelative(transaction.transactionId, receipt.relativePath), stagedPath });
  }
  const context: Context = { layout, lock, transaction, generation, generationBytes: canonical(generation), primary, sourceRoot: layout.root, toolReceipt: request.toolReceipt, phaseHook: request.phaseHook };
  if (!generation.toolAuthoritySnapshot.receiptIds.includes(request.toolReceipt.receiptId)
    || !generation.toolAuthoritySnapshot.invocationIntentIds.includes(transaction.invocationIntentId)
    || generation.toolAuthoritySnapshot.indexGenerationSha256 !== request.toolReceipt.authorityIndexSha256) throw new Error('overlap_recovery_tool_snapshot_mismatch');
  if ('toolReceiptId' in transaction.state) {
    if (request.toolReceipt.receiptId !== transaction.state.toolReceiptId
      || request.toolReceipt.receiptSha256 !== transaction.state.toolReceiptSha256
      || request.toolReceipt.authorityIndexSha256 !== transaction.state.toolAuthorityIndexSha256) throw new Error('overlap_recovery_tool_receipt_mismatch');
  }
  return context;
}

async function recoverOrphanCompleteTransaction(request: OverlapPublicationRecoveryRequest, layout: Layout): Promise<OverlapPublicationResult> {
  if (request.fromLock || request.transactionId === undefined) throw new Error('overlap_orphan_recovery_requires_transaction_selector');
  let transactionValue: unknown;
  try { transactionValue = await readJson(layout.root, layout.transactionPath); } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') throw new Error('overlap_orphan_transaction_missing');
    throw error;
  }
  if (!isCalibrationAdmissionOverlapPublicationTransactionV1(transactionValue)) {
    const diagnostic = validateCalibrationAdmissionOverlapPublicationTransactionV1(transactionValue);
    throw new Error(`overlap_orphan_transaction_invalid:${diagnostic.errors.join('|')}`);
  }
  const transaction = transactionValue;
  if (request.transactionId !== transaction.transactionId) throw new Error('overlap_orphan_transaction_selector_mismatch');
  if (request.recoveryNonce !== transaction.recoveryNonce) throw new Error('overlap_orphan_recovery_nonce_mismatch');
  if (deriveTransactionIdFromTransaction(transaction) !== transaction.transactionId
    || transaction.generationStagingRelativePath !== stageDirectoryRelative(transaction.transactionId)
    || transaction.currentGenerationTemporaryRelativePath !== `${OVERLAP_RELATIVE_ROOT}/current-generation.${transaction.transactionId}.tmp.json`
    || transaction.currentGenerationFinalRelativePath !== OVERLAP_CURRENT_RELATIVE_PATH) throw new Error('overlap_orphan_transaction_identity_invalid');
  if (transaction.state.phase !== 'complete' || !('nextGenerationSha256' in transaction.state)) throw new Error('overlap_orphan_transaction_state_invalid');
  if (request.toolReceipt.receiptId !== transaction.state.toolReceiptId
    || request.toolReceipt.receiptSha256 !== transaction.state.toolReceiptSha256
    || request.toolReceipt.authorityIndexSha256 !== transaction.state.toolAuthorityIndexSha256) throw new Error('overlap_orphan_tool_receipt_mismatch');

  const generationSha = transaction.state.nextGenerationSha256;
  const generationDirectory = overlapRelative(layout, generationDirectoryRelative(generationSha));
  const generationPath = join(generationDirectory, 'generation.json');
  let generationValue: unknown;
  try { generationValue = await readJson(layout.root, generationPath); } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') throw new Error('overlap_orphan_generation_missing');
    throw error;
  }
  if (!isCalibrationAdmissionOverlapGenerationV1(generationValue) || generationValue.generationSha256 !== generationSha) throw new Error('overlap_orphan_generation_invalid');
  const generation = generationValue;
  if (generation.inputGenerationSha256 !== transaction.inputGenerationSha256
    || generation.universeSha256 !== transaction.universeSha256
    || generation.overlapPolicySha256 !== transaction.overlapPolicySha256
    || (transaction.expectedCurrentState.kind === 'existing' && generation.parentGenerationSha256 !== transaction.expectedCurrentState.generationSha256)
    || (transaction.expectedCurrentState.kind === 'absent' && generation.parentGenerationSha256 !== undefined)) throw new Error('overlap_orphan_generation_transaction_mismatch');
  await assertGenerationNumberChain(layout, transaction.expectedCurrentState, generation);
  await assertJournaledPrimaryBinding(layout, transaction, generation);
  assertGenerationStateBinding(transaction, generation);
  try { await verifyGenerationTree(layout.root, generationDirectory, generation); } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') throw new Error('overlap_orphan_generation_not_anchored');
    throw error;
  }
  if (!generation.toolAuthoritySnapshot.receiptIds.includes(request.toolReceipt.receiptId)
    || !generation.toolAuthoritySnapshot.invocationIntentIds.includes(transaction.invocationIntentId)
    || generation.toolAuthoritySnapshot.indexGenerationSha256 !== request.toolReceipt.authorityIndexSha256) throw new Error('overlap_orphan_tool_snapshot_mismatch');
  await assertCurrentGenerationPointer(layout, generation);

  const allowed = new Set(['generation.json', ...transaction.state.generationArtifacts.map((artifact) => artifact.generationLocalRelativePath)]);
  await removeTreeOwned(layout.root, overlapRelative(layout, stageDirectoryRelative(transaction.transactionId)), allowed);
  await removeKnown(layout.root, overlapRelative(layout, `current-generation.${transaction.transactionId}.tmp.json`));
  await removeKnown(layout.root, layout.transactionPath);
  await syncDirectory(layout.overlap);
  return { complete: true, recoveryRequired: false, status: 'complete', transactionId: transaction.transactionId, generationSha256: generation.generationSha256, transactionPath: layout.transactionPath, lockPath: layout.lockPath, currentPath: layout.currentPath };
}

function artifactSetSha256Fn(artifacts: readonly AdmissionArtifactReceiptV1[]): string { return artifactSetSha256(artifacts); }

export async function recoverAdmissionOverlap(request: OverlapPublicationRecoveryRequest): Promise<OverlapPublicationResult> {
  if (!request.acknowledgeNoLiveWriter) throw new Error('overlap_recovery_requires_acknowledgement');
  if (!validSha(request.recoveryNonce)) throw new Error('overlap_recovery_nonce_invalid');
  if (!validId(request.toolReceipt.receiptId) || !validSha(request.toolReceipt.receiptSha256) || !validSha(request.toolReceipt.authorityIndexSha256)) throw new Error('overlap_recovery_tool_receipt_invalid');
  if (!request.transactionId && !request.fromLock) throw new Error('overlap_recovery_selector_required');
  if (request.transactionId && request.fromLock) throw new Error('overlap_recovery_selector_ambiguous');
  const layout = await ensureLayout(request.root);
  try {
    const context = await recoverContext(request, layout);
    return run(context);
  } catch (error) {
    // A crash after the lock unlink but before the transaction unlink leaves
    // a self-contained completed journal with no fixed lock.  Recover only
    // this transaction's known staging/temp paths; never discover or delete
    // another directory.
    if ((error as { code?: string }).code === 'ENOENT') {
      try {
        return await recoverOrphanCompleteTransaction(request, layout);
      } catch (orphanError) {
        throw orphanError;
      }
    }
    if (error instanceof Error && error.message === 'overlap_lock_only_recovery_complete') {
      return { complete: true, recoveryRequired: false, status: 'complete', transactionId: request.transactionId ?? 'lock-only', generationSha256: '', transactionPath: layout.transactionPath, lockPath: layout.lockPath, currentPath: layout.currentPath };
    }
    throw error;
  }
}

/** Verify only the immutable, explicitly selected generation and its current
 * pointer. This never discovers another generation and never mutates output. */
export async function verifyAdmissionOverlap(rootInput: string, selectedGenerationSha256?: string): Promise<OverlapVerificationResult> {
  const errors: string[] = [];
  let layout: Layout;
  try { layout = await readLayout(rootInput); } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)], artifactCount: 0 };
  }
  try {
    const current = await readCurrent(layout);
    if (!current) return { ok: false, errors: ['overlap_current_missing'], artifactCount: 0 };
    const generationSha = selectedGenerationSha256 ?? current.generationSha256;
    if (!validSha(generationSha)) return { ok: false, errors: ['overlap_generation_selector_invalid'], artifactCount: 0 };
    if (selectedGenerationSha256 === undefined && current.generationSha256 !== generationSha) errors.push('overlap_current_selector_mismatch');
    const path = rootRelative(layout, `${generationDirectoryRelative(generationSha)}/generation.json`);
    let value: unknown;
    try { value = await readJson(layout.root, path); }
    catch (error) {
      errors.push((error as { code?: string }).code === 'ENOENT' ? 'overlap_generation_missing' : (error instanceof Error ? error.message : String(error)));
      return { ok: false, errors, generationSha256: generationSha, artifactCount: 0 };
    }
    if (!isCalibrationAdmissionOverlapGenerationV1(value)) errors.push('overlap_generation_invalid');
    if (isCalibrationAdmissionOverlapGenerationV1(value)) {
      if (value.generationSha256 !== generationSha) errors.push('overlap_generation_hash_mismatch');
      const expected = new Set(['generation.json', ...value.artifacts.map((artifact) => artifact.relativePath)]);
      const walk = async (directory: string, relativeDirectory: string): Promise<void> => {
        await assertNoSymlinkPath(layout.root, directory);
        const entries = await readdir(directory, { withFileTypes: true });
        for (const entry of entries) {
          const child = join(directory, entry.name);
          await assertNoSymlinkPath(layout.root, child);
          const childRelative = relativeDirectory === '' ? entry.name : `${relativeDirectory}/${entry.name}`;
          if (entry.isDirectory()) await walk(child, childRelative);
          else if (!entry.isFile() || !expected.has(childRelative)) errors.push(`overlap_generation_orphan:${childRelative}`);
        }
      };
      await walk(dirname(path), '');
      for (const artifact of value.artifacts) {
        if (!safeArtifactRelativePath(artifact.relativePath)) { errors.push(`overlap_artifact_path_invalid:${artifact.relativePath}`); continue; }
        const artifactPath = rootRelative(layout, `${generationDirectoryRelative(generationSha)}/${artifact.relativePath}`);
        try {
          await assertNoSymlinkPath(layout.root, artifactPath);
          const bytes = await readFile(artifactPath);
          if (bytes.byteLength !== artifact.bytes || sha(bytes) !== artifact.sha256) errors.push(`overlap_artifact_hash_mismatch:${artifact.relativePath}`);
        } catch (error) {
          errors.push((error as { code?: string }).code === 'ENOENT' ? `overlap_artifact_missing:${artifact.relativePath}` : (error instanceof Error ? error.message : String(error)));
        }
      }
      const readEnvelope = async (relativePath: string): Promise<unknown> => {
        try { return await readJson(layout.root, rootRelative(layout, `${generationDirectoryRelative(generationSha)}/${relativePath}`)); }
        catch (error) {
          if ((error as { code?: string }).code !== 'ENOENT') errors.push(error instanceof Error ? error.message : String(error));
          return undefined;
        }
      };
      const [index, resource, ledger] = await Promise.all([
        readEnvelope('index.json'),
        readEnvelope('overlap-resource-receipt.json'),
        readEnvelope('overlap-ledger.json'),
      ]);
      errors.push(...verifyOverlapArtifactRelations({ generation: value, index, resource, ledger }).errors);
    }
    return { ok: errors.length === 0, errors, generationSha256: generationSha, artifactCount: isCalibrationAdmissionOverlapGenerationV1(value) ? value.artifacts.length : 0 };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return { ok: false, errors, artifactCount: 0 };
  }
}

export const authorityOverlap = publishAdmissionOverlap;
export const authorityOverlapRecover = recoverAdmissionOverlap;
