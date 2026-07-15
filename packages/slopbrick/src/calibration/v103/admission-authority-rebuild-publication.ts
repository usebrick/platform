/**
 * Fixture-scale transactional publication of an already validated authority
 * graph. This module is deliberately not a corpus builder or CLI authority:
 * callers must provide every graph object and byte map explicitly. Source
 * proposal/approval bytes are optional on the prebuilt graph input; when they
 * are present, this publisher persists and revalidates their fixed paths as
 * part of the same transaction. Tool-receipt metadata is still not an indexed
 * receipt object, so a successful transaction proves only local byte
 * publication/recovery, not corpus-admission readiness.
 */
import { constants } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  unlink,
} from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

import {
  calibrationAdmissionAuthorityRebuildTransactionSha256,
  calibrationAdmissionCanonicalJson,
  isCalibrationAdmissionAuthorityCurrentV1,
  isCalibrationAdmissionInputGenerationProposalV1,
  isCalibrationAdmissionInputGenerationV1,
  isCalibrationAdmissionSourceCurrentV1,
  isCalibrationAdmissionStaticAuthorityGenerationV1,
  validateCalibrationAdmissionAuthorityRebuildGraphV1,
  validateCalibrationAdmissionAuthorityRebuildLockV1,
  validateCalibrationAdmissionAuthorityRebuildTransactionV1,
  type CalibrationAdmissionAuthorityRebuildTransactionV1,
} from '@usebrick/core';

import {
  planPrebuiltAdmissionAuthorityPublication,
  type PrebuiltAdmissionAuthorityPublicationPlanSuccess,
  type PrebuiltAdmissionAuthorityPublicationPlanInput,
} from './admission-authority-publication-plan';
import {
  validatePrebuiltAdmissionAuthorityGraph,
  type PrebuiltAdmissionAuthoritySourceInput,
  type PrebuiltAdmissionAuthorityGraphInput,
} from './admission-authority-rebuild';

const ADMISSION_RELATIVE_ROOT = 'review/admission';
const AUTHORITY_RELATIVE_ROOT = `${ADMISSION_RELATIVE_ROOT}/authority`;
const LOCK_RELATIVE_PATH = `${AUTHORITY_RELATIVE_ROOT}/rebuild.lock`;
const TRANSACTION_RELATIVE_PATH = `${AUTHORITY_RELATIVE_ROOT}/rebuild-transaction.json`;
const AUTHORITY_CURRENT_RELATIVE_PATH = `${AUTHORITY_RELATIVE_ROOT}/current.json`;
const SHA256 = /^[a-f0-9]{64}$/u;
const ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;

function canonicalInputGenerationPath(generationSha256: string): string {
  return `${AUTHORITY_RELATIVE_ROOT}/input-generations/${generationSha256}/generation.json`;
}

function canonicalStaticGenerationPath(generationSha256: string): string {
  return `${AUTHORITY_RELATIVE_ROOT}/static-generations/${generationSha256}`;
}

export type PrebuiltAuthorityPublicationPhase =
  | 'lock-fsynced'
  | 'transaction-fsynced'
  | 'source-generation-directories-staged-fsynced'
  | 'source-generation-directories-promoted'
  | 'source-generation-parents-fsynced'
  | 'input-generation-fsynced'
  | 'primary-static-outputs-fsynced'
  | 'tool-receipt-indexed'
  | 'static-generation-staged-fsynced'
  | 'static-generation-promoted'
  | 'static-generations-parent-fsynced'
  | 'source-current-pointers-promoted'
  | 'authority-current-promoted'
  | 'output-directories-fsynced'
  | 'complete';

export interface PrebuiltAuthorityPublicationToolReceipt {
  /** Metadata supplied by the caller; snapshot membership is a later authority-context gate. */
  readonly receiptId: string;
  readonly receiptSha256: string;
  readonly authorityIndexSha256: string;
  readonly primaryOutputSetSha256: string;
}

export interface PrebuiltAuthorityPublicationRequest {
  /** Existing project root. It is never discovered from a child path. */
  readonly root?: string;
  /** Alias for root, retained for callers using loader terminology. */
  readonly projectRoot?: string;
  readonly graph: PrebuiltAdmissionAuthorityGraphInput;
  readonly plan?: PrebuiltAdmissionAuthorityPublicationPlanSuccess;
  readonly planInput?: PrebuiltAdmissionAuthorityPublicationPlanInput;
  readonly toolReceipt: PrebuiltAuthorityPublicationToolReceipt;
  readonly phaseHook?: (phase: PrebuiltAuthorityPublicationPhase) => void | Promise<void>;
}

export interface PrebuiltAuthorityPublicationRecoveryRequest extends PrebuiltAuthorityPublicationRequest {
  readonly recoveryNonce: string;
  readonly acknowledgeNoLiveWriter: boolean;
  readonly transactionId?: string;
  readonly fromLock?: boolean;
}

export type PrebuiltAuthorityPublicationStatus = 'complete' | 'recovery-required' | 'lock-only';

export interface PrebuiltAuthorityPublicationResult {
  readonly complete: boolean;
  readonly recoveryRequired: boolean;
  readonly status: PrebuiltAuthorityPublicationStatus;
  readonly transactionId: string;
  readonly generationSha256: string;
  readonly lockPath: string;
  readonly transactionPath: string;
  readonly currentPath: string;
}

export class PrebuiltAuthorityPublicationPendingError extends Error {
  readonly result: PrebuiltAuthorityPublicationResult;

  constructor(result: PrebuiltAuthorityPublicationResult, message = 'prebuilt authority publication requires recovery') {
    super(message);
    this.name = 'PrebuiltAuthorityPublicationPendingError';
    this.result = result;
  }
}

type Layout = Readonly<{
  readonly root: string;
  readonly admission: string;
  readonly lock: string;
  readonly transaction: string;
  readonly current: string;
}>;

type PublicationContext = {
  readonly layout: Layout;
  readonly graph: PrebuiltAdmissionAuthorityGraphInput;
  readonly plan: PrebuiltAdmissionAuthorityPublicationPlanSuccess;
  readonly toolReceipt: PrebuiltAuthorityPublicationToolReceipt;
  readonly phaseHook?: (phase: PrebuiltAuthorityPublicationPhase) => void | Promise<void>;
  transaction: CalibrationAdmissionAuthorityRebuildTransactionV1;
};

type PublicationTransactionPhase = CalibrationAdmissionAuthorityRebuildTransactionV1['state']['phase'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha(value: unknown): value is string { return typeof value === 'string' && SHA256.test(value); }
function id(value: unknown): value is string { return typeof value === 'string' && ID.test(value); }

function inside(root: string, candidate: string): boolean {
  const child = relative(root, candidate);
  return child === '' || (child !== '..' && !child.startsWith(`..${sep}`) && !child.startsWith('/') && !child.includes('\\'));
}

function absoluteContained(root: string, relativePath: string): string {
  if (relativePath.length === 0 || relativePath.startsWith('/') || relativePath.includes('\\') || relativePath.includes('\u0000')) {
    throw new Error('authority publication path is unsafe');
  }
  const candidate = resolve(root, relativePath);
  if (!inside(root, candidate)) throw new Error('authority publication path escapes project root');
  return candidate;
}

async function assertNoSymlinkPath(root: string, candidate: string): Promise<void> {
  if (!inside(root, candidate) || candidate === root) throw new Error('authority publication path escapes project root');
  const parts = relative(root, candidate).split(sep).filter(Boolean);
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    try {
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink()) throw new Error('authority publication symlink path component');
      if (index < parts.length - 1 && !metadata.isDirectory()) throw new Error('authority publication non-directory path component');
    } catch (error) {
      if (isRecord(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) break;
      throw error;
    }
  }
}

async function layoutFor(rootInput: string): Promise<Layout> {
  if (typeof rootInput !== 'string' || rootInput.length === 0 || rootInput.includes('\u0000') || rootInput.includes('\\')) {
    throw new Error('authority publication root is unsafe');
  }
  const lexical = resolve(rootInput);
  const rootMeta = await lstat(lexical);
  if (!rootMeta.isDirectory() || rootMeta.isSymbolicLink()) throw new Error('authority publication root must be a real directory');
  const root = await realpath(lexical);
  const admission = join(root, ADMISSION_RELATIVE_ROOT);
  await assertNoSymlinkPath(root, admission).catch(async (error) => {
    if (isRecord(error) && error.code === 'ENOENT') return;
    throw error;
  });
  return {
    root,
    admission,
    lock: absoluteContained(root, LOCK_RELATIVE_PATH),
    transaction: absoluteContained(root, TRANSACTION_RELATIVE_PATH),
    current: absoluteContained(root, AUTHORITY_CURRENT_RELATIVE_PATH),
  };
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

async function ensureDirectory(root: string, path: string): Promise<void> {
  await assertNoSymlinkPath(root, path).catch(async (error) => {
    if (!(isRecord(error) && error.code === 'ENOENT')) throw error;
  });
  await mkdir(path, { recursive: true });
  await assertNoSymlinkPath(root, path);
  await syncDirectory(path);
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
    if (!(isRecord(error) && error.code === 'EEXIST')) throw error;
  }
  await assertNoSymlinkPath(root, path);
  const existing = await readFile(path);
  if (!Buffer.from(existing).equals(Buffer.from(bytes))) throw new Error(`authority publication byte collision: ${path}`);
}

async function writeReplace(root: string, path: string, bytes: Uint8Array, transactionId: string): Promise<void> {
  const temporary = `${path}.${transactionId}.tmp`;
  await writeNoClobber(root, temporary, bytes);
  await assertNoSymlinkPath(root, path);
  await rename(temporary, path);
  await syncDirectory(dirname(path));
}

async function readOptional(root: string, path: string): Promise<Buffer | undefined> {
  await assertNoSymlinkPath(root, path);
  try { return await readFile(path); } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function readCanonical(root: string, path: string): Promise<unknown | undefined> {
  const bytes = await readOptional(root, path);
  if (bytes === undefined) return undefined;
  const text = bytes.toString('utf8');
  let value: unknown;
  try { value = JSON.parse(text) as unknown; } catch { throw new Error(`authority publication JSON is invalid: ${path}`); }
  if (text !== calibrationAdmissionCanonicalJson(value)) throw new Error(`authority publication JSON is not canonical: ${path}`);
  return value;
}

async function assertBytes(root: string, path: string, expected: Uint8Array, label: string): Promise<void> {
  await assertNoSymlinkPath(root, path);
  const actual = await readFile(path).catch((error: unknown) => {
    if (isRecord(error) && error.code === 'ENOENT') throw new Error(`${label} is missing`);
    throw error;
  });
  if (!Buffer.from(actual).equals(Buffer.from(expected))) throw new Error(`${label} bytes changed`);
}

function canonical(value: unknown): Buffer { return Buffer.from(calibrationAdmissionCanonicalJson(value), 'utf8'); }

function entries(value: unknown, label: string): ReadonlyMap<string, Uint8Array> {
  const map = new Map<string, Uint8Array>();
  if (isRecord(value)) {
    for (const [path, bytes] of Object.entries(value)) {
      if (typeof path !== 'string' || !(bytes instanceof Uint8Array)) throw new Error(`${label} artifact bytes are invalid`);
      if (map.has(path)) throw new Error(`${label} artifact bytes are duplicated`);
      map.set(path, bytes);
    }
    return map;
  }
  if (!Array.isArray(value)) throw new Error(`${label} artifact bytes are invalid`);
  for (const item of value) {
    if (!isRecord(item) || typeof item.relativePath !== 'string' || !(item.bytes instanceof Uint8Array) || map.has(item.relativePath)) {
      throw new Error(`${label} artifact bytes are invalid`);
    }
    map.set(item.relativePath, item.bytes);
  }
  return map;
}

function sourceFor(graph: PrebuiltAdmissionAuthorityGraphInput, sourceId: string): PrebuiltAdmissionAuthoritySourceInput {
  const source = graph.sources.find((candidate) => isRecord(candidate.sourceGeneration) && candidate.sourceGeneration.sourceId === sourceId);
  if (!source) throw new Error(`authority publication source is missing: ${sourceId}`);
  return source;
}

function sourceGenerationDirectory(
  context: PublicationContext,
  sourceId: string,
): CalibrationAdmissionAuthorityRebuildTransactionV1['sourceGenerationDirectories'][number] {
  const found = context.transaction.sourceGenerationDirectories.find((source) => source.sourceId === sourceId);
  if (!found) throw new Error(`authority publication transaction source is missing: ${sourceId}`);
  return found;
}

function updateState(
  transaction: CalibrationAdmissionAuthorityRebuildTransactionV1,
  state: CalibrationAdmissionAuthorityRebuildTransactionV1['state'],
): CalibrationAdmissionAuthorityRebuildTransactionV1 {
  const next = { ...transaction, state } as Omit<CalibrationAdmissionAuthorityRebuildTransactionV1, 'transactionSha256'>;
  return { ...next, transactionSha256: calibrationAdmissionAuthorityRebuildTransactionSha256(next) };
}

async function persistState(context: PublicationContext, state: CalibrationAdmissionAuthorityRebuildTransactionV1['state']): Promise<void> {
  context.transaction = updateState(context.transaction, state);
  await writeReplace(context.layout.root, context.layout.transaction, canonical(context.transaction), context.transaction.transactionId);
}

async function boundary(context: PublicationContext, phase: PrebuiltAuthorityPublicationPhase): Promise<void> {
  await context.phaseHook?.(phase);
}

function result(context: PublicationContext, status: PrebuiltAuthorityPublicationStatus, complete: boolean): PrebuiltAuthorityPublicationResult {
  return {
    complete,
    recoveryRequired: !complete,
    status,
    transactionId: context.transaction.transactionId,
    generationSha256: context.graph.staticGeneration && isRecord(context.graph.staticGeneration)
      ? String(context.graph.staticGeneration.generationSha256)
      : '',
    lockPath: context.layout.lock,
    transactionPath: context.layout.transaction,
    currentPath: context.layout.current,
  };
}

function assertTransactionStateBindings(context: PublicationContext): void {
  const phase = context.transaction.state.phase as PublicationTransactionPhase;
  if (phase === 'overlap_generation_verified') {
    throw new Error('authority publication does not accept the overlap-generation intermediate phase');
  }
  if (phase === 'intent_fsynced') return;
  const state = context.transaction.state as unknown as Record<string, unknown>;
  const inputGeneration = context.graph.inputGeneration as { generationSha256: string };
  const staticGeneration = context.graph.staticGeneration as { generationSha256: string; overlapGenerationSha256: string };
  if (state.inputGenerationSha256 !== inputGeneration.generationSha256) {
    throw new Error('authority publication transaction input-generation binding mismatch');
  }
  if (phase === 'primary_static_outputs_fsynced'
    || phase === 'tool_receipt_indexed'
    || phase === 'static_generation_staged_fsynced'
    || phase === 'static_generation_promoted'
    || phase === 'static_generations_parent_fsynced'
    || phase === 'source_current_pointers_promoted'
    || phase === 'authority_current_promoted'
    || phase === 'output_directories_fsynced'
    || phase === 'complete') {
    if (state.overlapGenerationSha256 !== staticGeneration.overlapGenerationSha256
      || state.primaryOutputSetSha256 !== context.toolReceipt.primaryOutputSetSha256) {
      throw new Error('authority publication transaction primary-output binding mismatch');
    }
  }
  if (phase === 'tool_receipt_indexed'
    || phase === 'static_generation_staged_fsynced'
    || phase === 'static_generation_promoted'
    || phase === 'static_generations_parent_fsynced'
    || phase === 'source_current_pointers_promoted'
    || phase === 'authority_current_promoted'
    || phase === 'output_directories_fsynced'
    || phase === 'complete') {
    if (state.toolReceiptId !== context.toolReceipt.receiptId
      || state.toolReceiptSha256 !== context.toolReceipt.receiptSha256
      || state.toolAuthorityIndexSha256 !== context.toolReceipt.authorityIndexSha256) {
      throw new Error('authority publication transaction tool-receipt binding mismatch');
    }
  }
  if (phase === 'static_generation_staged_fsynced'
    || phase === 'static_generation_promoted'
    || phase === 'static_generations_parent_fsynced'
    || phase === 'source_current_pointers_promoted'
    || phase === 'authority_current_promoted'
    || phase === 'output_directories_fsynced'
    || phase === 'complete') {
    if (state.staticGenerationSha256 !== staticGeneration.generationSha256
      || state.staticGenerationRelativePath !== context.plan.paths.staticGenerationFinalRelativePath) {
      throw new Error('authority publication transaction static-generation binding mismatch');
    }
  }
}

function validateToolReceipt(tool: PrebuiltAuthorityPublicationToolReceipt): void {
  if (!id(tool.receiptId) || !sha(tool.receiptSha256) || !sha(tool.authorityIndexSha256) || !sha(tool.primaryOutputSetSha256)) {
    throw new Error('authority publication tool receipt metadata is invalid');
  }
}

function validatePlanGraph(plan: PrebuiltAdmissionAuthorityPublicationPlanSuccess, graph: PrebuiltAdmissionAuthorityGraphInput, tool: PrebuiltAuthorityPublicationToolReceipt): void {
  if (!validateCalibrationAdmissionAuthorityRebuildLockV1(plan.lock).ok
    || !validateCalibrationAdmissionAuthorityRebuildTransactionV1(plan.transaction).ok
    || !validateCalibrationAdmissionAuthorityRebuildGraphV1(plan.lock, plan.transaction).ok) {
    throw new Error('authority publication plan lock/transaction is invalid');
  }
  const graphValidation = validatePrebuiltAdmissionAuthorityGraph(graph);
  if (!graphValidation.ok) throw new Error(graphValidation.errors.join('; '));
  if (!isCalibrationAdmissionInputGenerationProposalV1(graph.proposal)
    || !isCalibrationAdmissionInputGenerationV1(graph.inputGeneration)
    || !isCalibrationAdmissionStaticAuthorityGenerationV1(graph.staticGeneration)
    || !isCalibrationAdmissionAuthorityCurrentV1(graph.current)) throw new Error('authority publication graph types are invalid');
  if (graph.proposal.operation !== plan.lock.operation
    || calibrationAdmissionCanonicalJson(graph.proposal.expectedCurrentState)
      !== calibrationAdmissionCanonicalJson(plan.lock.expectedCurrentState)) {
    throw new Error('authority publication graph operation/CAS state does not match plan');
  }
  if (plan.lock.operation === 'create') {
    if (graph.inputGeneration.generation !== 0
      || graph.inputGeneration.parentInputGenerationSha256 !== undefined
      || graph.staticGeneration.generation !== 0
      || graph.staticGeneration.parentStaticGenerationSha256 !== undefined
      || graph.priorCurrent !== undefined) {
      throw new Error('authority publication create graph ancestry does not match plan');
    }
  } else {
    const priorInputHash = plan.paths.priorInputGenerationRelativePath?.split('/').at(-2);
    if (graph.inputGeneration.generation === 0
      || graph.inputGeneration.parentInputGenerationSha256 === undefined
      || graph.inputGeneration.parentInputGenerationSha256 !== priorInputHash
      || plan.lock.expectedCurrentState.kind !== 'existing'
      || graph.staticGeneration.generation === 0
      || graph.staticGeneration.parentStaticGenerationSha256 !== plan.lock.expectedCurrentState.staticGenerationSha256
      || !isCalibrationAdmissionAuthorityCurrentV1(graph.priorCurrent)
      || graph.priorCurrent.staticGenerationSha256 !== plan.lock.expectedCurrentState.staticGenerationSha256) {
      throw new Error('authority publication replace graph ancestry does not match plan');
    }
  }
  if (graph.proposal.proposalId !== plan.lock.inputGenerationProposalId
    || graph.proposal.proposalSha256 !== plan.lock.inputGenerationProposalSha256) throw new Error('authority publication proposal does not match plan');
  if (plan.paths.lockRelativePath !== LOCK_RELATIVE_PATH
    || plan.paths.transactionRelativePath !== TRANSACTION_RELATIVE_PATH
    || plan.paths.authorityCurrentFinalRelativePath !== AUTHORITY_CURRENT_RELATIVE_PATH
    || plan.paths.inputGenerationRelativePath !== plan.transaction.inputGenerationRelativePath
    || plan.paths.authorityCurrentTemporaryRelativePath !== plan.transaction.authorityCurrentTemporaryRelativePath
    || plan.paths.authorityCurrentFinalRelativePath !== plan.transaction.authorityCurrentFinalRelativePath
    || plan.paths.staticGenerationStagingRelativePath !== plan.transaction.staticGenerationStagingRelativePath
    || calibrationAdmissionCanonicalJson(plan.paths.sourceGenerationDirectories)
      !== calibrationAdmissionCanonicalJson(plan.transaction.sourceGenerationDirectories)) {
    throw new Error('authority publication plan paths do not match its transaction');
  }
  if (plan.paths.inputGenerationRelativePath !== canonicalInputGenerationPath(graph.inputGeneration.generationSha256)
    || plan.paths.staticGenerationFinalRelativePath !== canonicalStaticGenerationPath(graph.staticGeneration.generationSha256)
    || plan.paths.staticGenerationStagingRelativePath !== `${AUTHORITY_RELATIVE_ROOT}/staging/${plan.transaction.transactionId}`
    || plan.paths.authorityCurrentTemporaryRelativePath !== `${AUTHORITY_RELATIVE_ROOT}/current.${plan.transaction.transactionId}.tmp.json`
    || (plan.lock.operation === 'create' && plan.paths.priorInputGenerationRelativePath !== undefined)
    || (plan.lock.operation === 'replace'
      && plan.paths.priorInputGenerationRelativePath !== canonicalInputGenerationPath(plan.paths.priorInputGenerationRelativePath?.split('/').at(-2) ?? ''))) {
    throw new Error('authority publication plan paths are not fixed-topology');
  }
  if (graph.inputGeneration.generationSha256 !== plan.paths.inputGenerationRelativePath.split('/').at(-2)) throw new Error('authority publication input generation does not match plan');
  if (graph.staticGeneration.generationSha256 !== plan.paths.staticGenerationFinalRelativePath.split('/').at(-1)) throw new Error('authority publication static generation does not match plan');
  if (graph.current.staticGenerationSha256 !== graph.staticGeneration.generationSha256) throw new Error('authority publication current does not match static generation');
  if (graph.current.staticGenerationRelativePath !== plan.paths.staticGenerationFinalRelativePath) throw new Error('authority publication current path does not match plan');
  if (plan.transaction.state.phase !== 'intent_fsynced') {
    if (plan.transaction.state.phase === 'overlap_generation_verified') {
      throw new Error('authority publication plan uses unsupported overlap-generation intermediate phase');
    }
    const state = plan.transaction.state;
    if (!('staticGenerationSha256' in state)
      || state.staticGenerationSha256 !== graph.staticGeneration.generationSha256
      || state.staticGenerationRelativePath !== plan.paths.staticGenerationFinalRelativePath) {
      throw new Error('authority publication transaction state does not match static generation');
    }
  }
  const sourceDescriptors = plan.transaction.sourceGenerationDirectories;
  if (sourceDescriptors.length !== graph.sources.length) throw new Error('authority publication source descriptor count does not match graph');
  for (const descriptor of sourceDescriptors) {
    const source = sourceFor(graph, descriptor.sourceId);
    if (!isRecord(source.sourceGeneration)
      || source.sourceGeneration.sourceId !== descriptor.sourceId
      || source.sourceGeneration.generationSha256 !== descriptor.generationSha256
      || source.sourceGeneration.artifactSetSha256 !== descriptor.artifactSetSha256) {
      throw new Error(`authority publication source descriptor does not match graph: ${descriptor.sourceId}`);
    }
    const sourceRoot = `review/admission/sources/${descriptor.sourceId}`;
    if (descriptor.generationsParentRelativePath !== `${sourceRoot}/generations`
      || descriptor.generationFinalRelativePath !== `${sourceRoot}/generations/${descriptor.generationSha256}`
      || descriptor.generationStagingRelativePath !== `${sourceRoot}/staging/${plan.transaction.transactionId}`
      || descriptor.currentPointerTemporaryRelativePath !== `${sourceRoot}/current.${plan.transaction.transactionId}.tmp.json`
      || descriptor.currentPointerFinalRelativePath !== `${sourceRoot}/current.json`
      || (source.sourceGeneration.parentGenerationSha256 === undefined
        ? descriptor.priorGenerationRelativePath !== undefined
        : descriptor.priorGenerationRelativePath !== `${sourceRoot}/generations/${source.sourceGeneration.parentGenerationSha256}`)) {
      throw new Error(`authority publication source descriptor path is not canonical: ${descriptor.sourceId}`);
    }
  }
  validateToolReceipt(tool);
}

function assertGenerationLocalArtifacts(value: unknown, label: string): void {
  if (!Array.isArray(value)) return;
  for (const artifact of value) {
    if (!isRecord(artifact) || artifact.pathBase !== 'generation_local') throw new Error(`${label} contains non-generation-local artifacts`);
  }
}

function assertSourceProposalBytesForPublication(graph: PrebuiltAdmissionAuthorityGraphInput): void {
  for (const source of graph.sources) {
    const sourceId = isRecord(source.sourceGeneration) && typeof source.sourceGeneration.sourceId === 'string'
      ? source.sourceGeneration.sourceId
      : 'unknown';
    if (source.sourceProposal === undefined || source.sourceProposalBytes === undefined) {
      throw new Error(`authority publication source proposal bytes are required: ${sourceId}`);
    }
    const sourceGeneration = isRecord(source.sourceGeneration) ? source.sourceGeneration : undefined;
    const approval = sourceGeneration !== undefined && isRecord(sourceGeneration.approval) ? sourceGeneration.approval : undefined;
    if (approval?.kind === 'independent_review'
      && (source.approval === undefined || source.approvalBytes === undefined)) {
      throw new Error(`authority publication source approval bytes are required: ${sourceId}`);
    }
  }
}

async function preflight(request: PrebuiltAuthorityPublicationRequest): Promise<PublicationContext> {
  const rootInput = request.root ?? request.projectRoot;
  if (request.root !== undefined && request.projectRoot !== undefined && resolve(request.root) !== resolve(request.projectRoot)) throw new Error('authority publication root aliases disagree');
  if (rootInput === undefined) throw new Error('authority publication root is required');
  const layout = await layoutFor(rootInput);
  const plan = request.plan ?? (request.planInput === undefined ? undefined : planPrebuiltAdmissionAuthorityPublication(request.planInput));
  if (!plan || !plan.ok) throw new Error(plan && !plan.ok ? plan.errors.join('; ') : 'authority publication plan is required');
  validatePlanGraph(plan, request.graph, request.toolReceipt);
  assertSourceProposalBytesForPublication(request.graph);
  assertGenerationLocalArtifacts(isRecord(request.graph.inputGeneration) ? request.graph.inputGeneration.artifacts : undefined, 'input generation');
  assertGenerationLocalArtifacts(isRecord(request.graph.staticGeneration) ? request.graph.staticGeneration.artifacts : undefined, 'static generation');
  for (const source of request.graph.sources) {
    assertGenerationLocalArtifacts(isRecord(source.sourceGeneration) ? source.sourceGeneration.artifacts : undefined, 'source generation');
  }
  return {
    layout,
    graph: request.graph,
    plan,
    toolReceipt: request.toolReceipt,
    phaseHook: request.phaseHook,
    transaction: plan.transaction,
  };
}

async function assertReplacePriorCurrent(context: PublicationContext, existing: unknown): Promise<void> {
  if (!context.graph.priorCurrentBytes || !isCalibrationAdmissionAuthorityCurrentV1(context.graph.priorCurrent)) {
    throw new Error('authority publication replace prior current evidence is required');
  }
  const existingBytes = await readOptional(context.layout.root, context.layout.current);
  if (existingBytes === undefined || !Buffer.from(existingBytes).equals(Buffer.from(context.graph.priorCurrentBytes))) {
    throw new Error('authority publication replace prior current bytes do not match disk');
  }
  const prior = context.graph.priorCurrent;
  if (!isCalibrationAdmissionAuthorityCurrentV1(existing)
    || existing.currentSha256 !== prior.currentSha256
    || existing.generation !== prior.generation
    || existing.staticGenerationSha256 !== prior.staticGenerationSha256
    || existing.staticGenerationRelativePath !== prior.staticGenerationRelativePath) {
    throw new Error('authority publication replace prior current pointer does not match disk');
  }
}

async function assertExpectedCurrentBeforeMutation(context: PublicationContext): Promise<void> {
  const existing = await readCanonical(context.layout.root, context.layout.current);
  if (context.plan.lock.operation === 'create') {
    if (existing !== undefined) throw new Error('authority publication create current is not absent');
    return;
  }
  if (context.plan.lock.expectedCurrentState.kind !== 'existing'
    || !isCalibrationAdmissionAuthorityCurrentV1(existing)
    || existing.staticGenerationSha256 !== context.plan.lock.expectedCurrentState.staticGenerationSha256) {
    throw new Error('authority publication replace current CAS mismatch');
  }
  await assertReplacePriorCurrent(context, existing);
}

async function materializeProposal(context: PublicationContext): Promise<void> {
  const proposal = context.graph.proposal as { proposalId: string };
  const path = absoluteContained(context.layout.root, `${AUTHORITY_RELATIVE_ROOT}/proposals/${proposal.proposalId}.json`);
  await writeNoClobber(context.layout.root, path, context.graph.proposalBytes);
  for (const source of context.graph.sources) {
    const sourceId = isRecord(source.sourceGeneration) && typeof source.sourceGeneration.sourceId === 'string'
      ? source.sourceGeneration.sourceId
      : undefined;
    if (sourceId === undefined) throw new Error('authority publication source ID is invalid');
    if (source.sourceProposal !== undefined || source.sourceProposalBytes !== undefined) {
      if (source.sourceProposal === undefined || source.sourceProposalBytes === undefined) {
        throw new Error(`authority publication source proposal bytes are incomplete: ${sourceId}`);
      }
      const sourceProposalPath = absoluteContained(
        context.layout.root,
        `${ADMISSION_RELATIVE_ROOT}/sources/${sourceId}/proposals/${source.sourceProposal.proposalId}.json`,
      );
      await writeNoClobber(context.layout.root, sourceProposalPath, source.sourceProposalBytes);
    }
    if (source.approval !== undefined || source.approvalBytes !== undefined) {
      if (source.approval === undefined || source.approvalBytes === undefined) {
        throw new Error(`authority publication source approval bytes are incomplete: ${sourceId}`);
      }
      const proposalId = isRecord(source.sourceGeneration) && typeof source.sourceGeneration.proposalId === 'string'
        ? source.sourceGeneration.proposalId
        : undefined;
      if (proposalId === undefined) throw new Error(`authority publication source proposal ID is invalid: ${sourceId}`);
      const approvalPath = absoluteContained(
        context.layout.root,
        `${ADMISSION_RELATIVE_ROOT}/sources/${sourceId}/proposals/${proposalId}-approval.json`,
      );
      await writeNoClobber(context.layout.root, approvalPath, source.approvalBytes);
    }
  }
}

async function materializeInput(context: PublicationContext): Promise<void> {
  const dir = absoluteContained(context.layout.root, dirname(context.plan.paths.inputGenerationRelativePath));
  await ensureDirectory(context.layout.root, dir);
  await writeNoClobber(context.layout.root, absoluteContained(context.layout.root, context.plan.paths.inputGenerationRelativePath), context.graph.inputGenerationBytes);
  const artifactMap = entries(context.graph.inputGenerationArtifactBytes, 'input generation');
  for (const [path, bytes] of artifactMap) await writeNoClobber(context.layout.root, join(dir, path), bytes);
  await syncDirectory(dir);
}

async function verifyInput(context: PublicationContext): Promise<void> {
  const dir = absoluteContained(context.layout.root, dirname(context.plan.paths.inputGenerationRelativePath));
  await assertBytes(context.layout.root, absoluteContained(context.layout.root, context.plan.paths.inputGenerationRelativePath), context.graph.inputGenerationBytes, 'input generation');
  for (const [path, bytes] of entries(context.graph.inputGenerationArtifactBytes, 'input generation')) {
    await assertBytes(context.layout.root, join(dir, path), bytes, `input artifact ${path}`);
  }
}

async function materializeSourceStage(context: PublicationContext, source: PrebuiltAdmissionAuthoritySourceInput, descriptor: CalibrationAdmissionAuthorityRebuildTransactionV1['sourceGenerationDirectories'][number]): Promise<void> {
  const stage = absoluteContained(context.layout.root, descriptor.generationStagingRelativePath);
  await ensureDirectory(context.layout.root, stage);
  await writeNoClobber(context.layout.root, join(stage, 'source-generation.json'), source.sourceGenerationBytes);
  await writeNoClobber(context.layout.root, join(stage, 'source-review.json'), source.sourceReviewBytes);
  for (const [path, bytes] of entries(source.artifactBytes, `source ${descriptor.sourceId}`)) {
    if (path === 'source-review.json') continue;
    await writeNoClobber(context.layout.root, join(stage, path), bytes);
  }
  await syncDirectory(stage);
}

async function promoteSourceDirectory(context: PublicationContext, descriptor: CalibrationAdmissionAuthorityRebuildTransactionV1['sourceGenerationDirectories'][number], source: PrebuiltAdmissionAuthoritySourceInput): Promise<void> {
  const stage = absoluteContained(context.layout.root, descriptor.generationStagingRelativePath);
  const final = absoluteContained(context.layout.root, descriptor.generationFinalRelativePath);
  await ensureDirectory(context.layout.root, dirname(final));
  const existing = await lstat(final).then((value) => value).catch((error: unknown) => {
    if (isRecord(error) && error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (existing !== undefined) {
    if (!existing.isDirectory() || existing.isSymbolicLink()) throw new Error('authority publication source final is not a directory');
    await verifySourceDirectory(context, final, source, descriptor.sourceId);
    return;
  }
  await verifySourceDirectory(context, stage, source, descriptor.sourceId);
  await assertNoSymlinkPath(context.layout.root, stage);
  await rename(stage, final);
  await syncDirectory(dirname(final));
}

async function verifySourceDirectory(
  context: PublicationContext,
  directory: string,
  source: PrebuiltAdmissionAuthoritySourceInput,
  sourceId: string,
): Promise<void> {
  await assertBytes(context.layout.root, join(directory, 'source-generation.json'), source.sourceGenerationBytes, `source ${sourceId} generation`);
  await assertBytes(context.layout.root, join(directory, 'source-review.json'), source.sourceReviewBytes, `source ${sourceId} review`);
  for (const [path, bytes] of entries(source.artifactBytes, `source ${sourceId}`)) {
    await assertBytes(context.layout.root, join(directory, path), bytes, `source ${sourceId} artifact ${path}`);
  }
}

async function materializeStaticStage(context: PublicationContext): Promise<void> {
  const stage = absoluteContained(context.layout.root, context.plan.paths.staticGenerationStagingRelativePath);
  await ensureDirectory(context.layout.root, stage);
  await writeNoClobber(context.layout.root, join(stage, 'generation.json'), context.graph.staticGenerationBytes);
  for (const [path, bytes] of entries(context.graph.staticGenerationArtifactBytes, 'static generation')) {
    await writeNoClobber(context.layout.root, join(stage, path), bytes);
  }
  await syncDirectory(stage);
}

async function promoteStaticDirectory(context: PublicationContext): Promise<void> {
  const stage = absoluteContained(context.layout.root, context.plan.paths.staticGenerationStagingRelativePath);
  const final = absoluteContained(context.layout.root, context.plan.paths.staticGenerationFinalRelativePath);
  await ensureDirectory(context.layout.root, dirname(final));
  const existing = await lstat(final).then((value) => value).catch((error: unknown) => {
    if (isRecord(error) && error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (existing !== undefined) {
    if (!existing.isDirectory() || existing.isSymbolicLink()) throw new Error('authority publication static final is not a directory');
    await verifyStaticDirectory(context, final);
    return;
  }
  await verifyStaticDirectory(context, stage);
  await rename(stage, final);
  await syncDirectory(dirname(final));
}

async function verifyStaticDirectory(context: PublicationContext, directory: string): Promise<void> {
  await assertBytes(context.layout.root, join(directory, 'generation.json'), context.graph.staticGenerationBytes, 'static generation');
  for (const [path, bytes] of entries(context.graph.staticGenerationArtifactBytes, 'static generation')) {
    await assertBytes(context.layout.root, join(directory, path), bytes, `static artifact ${path}`);
  }
}

async function verifySourceCurrents(context: PublicationContext): Promise<void> {
  for (const descriptor of context.transaction.sourceGenerationDirectories) {
    const source = sourceFor(context.graph, descriptor.sourceId);
    const path = absoluteContained(context.layout.root, descriptor.currentPointerFinalRelativePath);
    await assertBytes(context.layout.root, path, source.currentBytes, `source ${descriptor.sourceId} current`);
    const parsed = await readCanonical(context.layout.root, path);
    if (!isCalibrationAdmissionSourceCurrentV1(parsed)
      || parsed.sourceId !== descriptor.sourceId
      || parsed.generationSha256 !== descriptor.generationSha256) {
      throw new Error(`authority publication source current does not match generation: ${descriptor.sourceId}`);
    }
  }
}

async function verifyAuthorityCurrent(context: PublicationContext): Promise<void> {
  const current = context.graph.current as { currentSha256: string };
  const staticGeneration = context.graph.staticGeneration as { generationSha256: string };
  await assertBytes(context.layout.root, context.layout.current, context.graph.currentBytes, 'authority current');
  const parsed = await readCanonical(context.layout.root, context.layout.current);
  if (!isCalibrationAdmissionAuthorityCurrentV1(parsed)
    || parsed.currentSha256 !== current.currentSha256
    || parsed.staticGenerationSha256 !== staticGeneration.generationSha256
    || parsed.staticGenerationRelativePath !== context.plan.paths.staticGenerationFinalRelativePath) {
    throw new Error('authority publication current does not match static generation');
  }
}

async function verifySourceProposalObjects(context: PublicationContext): Promise<void> {
  for (const source of context.graph.sources) {
    const sourceId = isRecord(source.sourceGeneration) && typeof source.sourceGeneration.sourceId === 'string'
      ? source.sourceGeneration.sourceId
      : undefined;
    if (sourceId === undefined) throw new Error('authority publication source ID is invalid');
    if (source.sourceProposal !== undefined || source.sourceProposalBytes !== undefined) {
      if (source.sourceProposal === undefined || source.sourceProposalBytes === undefined) {
        throw new Error(`authority publication source proposal bytes are incomplete: ${sourceId}`);
      }
      await assertBytes(
        context.layout.root,
        absoluteContained(context.layout.root, `${ADMISSION_RELATIVE_ROOT}/sources/${sourceId}/proposals/${source.sourceProposal.proposalId}.json`),
        source.sourceProposalBytes,
        `source ${sourceId} proposal`,
      );
    }
    if (source.approval !== undefined || source.approvalBytes !== undefined) {
      if (source.approval === undefined || source.approvalBytes === undefined) {
        throw new Error(`authority publication source approval bytes are incomplete: ${sourceId}`);
      }
      const proposalId = isRecord(source.sourceGeneration) && typeof source.sourceGeneration.proposalId === 'string'
        ? source.sourceGeneration.proposalId
        : undefined;
      if (proposalId === undefined) throw new Error(`authority publication source proposal ID is invalid: ${sourceId}`);
      await assertBytes(
        context.layout.root,
        absoluteContained(context.layout.root, `${ADMISSION_RELATIVE_ROOT}/sources/${sourceId}/proposals/${proposalId}-approval.json`),
        source.approvalBytes,
        `source ${sourceId} approval`,
      );
    }
  }
}

/**
 * Re-check every output that is durable at the transaction's current phase.
 * Recovery never trusts a phase marker alone: a caller may have crashed or a
 * fault hook may have changed bytes after the marker was fsynced.
 */
async function verifyDurableOutputs(context: PublicationContext): Promise<void> {
  const phase = context.transaction.state.phase as PublicationTransactionPhase;
  if (phase === 'intent_fsynced') return;

  const proposal = context.graph.proposal as { proposalId: string };
  await assertBytes(
    context.layout.root,
    absoluteContained(context.layout.root, `${AUTHORITY_RELATIVE_ROOT}/proposals/${proposal.proposalId}.json`),
    context.graph.proposalBytes,
    'input-generation proposal',
  );
  await verifySourceProposalObjects(context);

  if (phase === 'source_generation_directories_staged_fsynced') {
    for (const descriptor of context.transaction.sourceGenerationDirectories) {
      await verifySourceDirectory(
        context,
        absoluteContained(context.layout.root, descriptor.generationStagingRelativePath),
        sourceFor(context.graph, descriptor.sourceId),
        descriptor.sourceId,
      );
    }
    return;
  }

  const sourceFinalPhases = new Set<PublicationTransactionPhase>([
    'source_generation_directories_promoted',
    'source_generation_parents_fsynced',
    'input_generation_fsynced',
    'primary_static_outputs_fsynced',
    'tool_receipt_indexed',
    'static_generation_staged_fsynced',
    'static_generation_promoted',
    'static_generations_parent_fsynced',
    'source_current_pointers_promoted',
    'authority_current_promoted',
    'output_directories_fsynced',
    'complete',
  ]);
  if (sourceFinalPhases.has(phase)) {
    for (const descriptor of context.transaction.sourceGenerationDirectories) {
      await verifySourceDirectory(
        context,
        absoluteContained(context.layout.root, descriptor.generationFinalRelativePath),
        sourceFor(context.graph, descriptor.sourceId),
        descriptor.sourceId,
      );
    }
  }

  const inputPhases = new Set<PublicationTransactionPhase>([
    'input_generation_fsynced',
    'primary_static_outputs_fsynced',
    'tool_receipt_indexed',
    'static_generation_staged_fsynced',
    'static_generation_promoted',
    'static_generations_parent_fsynced',
    'source_current_pointers_promoted',
    'authority_current_promoted',
    'output_directories_fsynced',
    'complete',
  ]);
  if (inputPhases.has(phase)) await verifyInput(context);

  if (phase === 'static_generation_staged_fsynced') {
    await verifyStaticDirectory(
      context,
      absoluteContained(context.layout.root, context.plan.paths.staticGenerationStagingRelativePath),
    );
    return;
  }

  const staticFinalPhases = new Set<PublicationTransactionPhase>([
    'static_generation_promoted',
    'static_generations_parent_fsynced',
    'source_current_pointers_promoted',
    'authority_current_promoted',
    'output_directories_fsynced',
    'complete',
  ]);
  if (staticFinalPhases.has(phase)) {
    await verifyStaticDirectory(
      context,
      absoluteContained(context.layout.root, context.plan.paths.staticGenerationFinalRelativePath),
    );
  }

  const sourceCurrentPhases = new Set<PublicationTransactionPhase>([
    'source_current_pointers_promoted',
    'authority_current_promoted',
    'output_directories_fsynced',
    'complete',
  ]);
  if (sourceCurrentPhases.has(phase)) await verifySourceCurrents(context);

  const authorityCurrentPhases = new Set<PublicationTransactionPhase>([
    'authority_current_promoted',
    'output_directories_fsynced',
    'complete',
  ]);
  if (authorityCurrentPhases.has(phase)) await verifyAuthorityCurrent(context);
}

async function materializeSourceCurrents(context: PublicationContext): Promise<void> {
  for (const descriptor of context.transaction.sourceGenerationDirectories) {
    const source = sourceFor(context.graph, descriptor.sourceId);
    const path = absoluteContained(context.layout.root, descriptor.currentPointerFinalRelativePath);
    const temporary = absoluteContained(context.layout.root, descriptor.currentPointerTemporaryRelativePath);
    await writeNoClobber(context.layout.root, temporary, source.currentBytes);
    const existing = await readOptional(context.layout.root, path);
    if (existing !== undefined) {
      const parsed = await readCanonical(context.layout.root, path);
      const priorHash = descriptor.priorGenerationRelativePath?.split('/').at(-1);
      if (!isCalibrationAdmissionSourceCurrentV1(parsed)
        || (parsed.generationSha256 !== descriptor.generationSha256 && parsed.generationSha256 !== priorHash)) {
        throw new Error(`authority publication source current CAS mismatch: ${descriptor.sourceId}`);
      }
      if (parsed.generationSha256 === descriptor.generationSha256
        && !Buffer.from(existing).equals(Buffer.from(source.currentBytes))) {
        throw new Error(`authority publication source current bytes changed: ${descriptor.sourceId}`);
      }
    }
    const beforeRename = await readOptional(context.layout.root, path);
    if (existing === undefined) {
      if (beforeRename !== undefined) throw new Error(`authority publication source current appeared before promotion: ${descriptor.sourceId}`);
    } else if (beforeRename === undefined || !Buffer.from(beforeRename).equals(Buffer.from(existing))) {
      throw new Error(`authority publication source current changed before promotion: ${descriptor.sourceId}`);
    }
    await rename(temporary, path);
    await syncDirectory(dirname(path));
  }
}

async function materializeAuthorityCurrent(context: PublicationContext): Promise<void> {
  const existing = await readCanonical(context.layout.root, context.layout.current);
  if (context.plan.lock.operation === 'create') {
    if (existing !== undefined) throw new Error('authority publication create current is not absent');
  } else {
    const expected = context.plan.lock.expectedCurrentState;
    if (expected.kind !== 'existing') throw new Error('authority publication replace expected state is invalid');
    if (isCalibrationAdmissionAuthorityCurrentV1(existing)
      && existing.currentSha256 === (context.graph.current as { currentSha256?: string }).currentSha256) {
      await assertBytes(context.layout.root, context.layout.current, context.graph.currentBytes, 'authority current');
    } else {
      if (!isCalibrationAdmissionAuthorityCurrentV1(existing)
        || existing.staticGenerationSha256 !== expected.staticGenerationSha256) throw new Error('authority publication replace current CAS mismatch');
      await assertReplacePriorCurrent(context, existing);
    }
  }
  // Re-read the current pointer immediately before the no-clobber rename so a
  // concurrent writer cannot slip between the earlier CAS check and commit.
  const beforeRename = await readCanonical(context.layout.root, context.layout.current);
  if (context.plan.lock.operation === 'create') {
    if (beforeRename !== undefined) throw new Error('authority publication create current changed before promotion');
  } else if (isCalibrationAdmissionAuthorityCurrentV1(context.graph.current)
    && isCalibrationAdmissionAuthorityCurrentV1(beforeRename)
    && beforeRename.currentSha256 === context.graph.current.currentSha256) {
    await assertBytes(context.layout.root, context.layout.current, context.graph.currentBytes, 'authority current');
  } else {
    await assertReplacePriorCurrent(context, beforeRename);
  }
  await writeReplace(context.layout.root, context.layout.current, context.graph.currentBytes, context.transaction.transactionId);
}

async function cleanupJournals(context: PublicationContext): Promise<void> {
  const tx = await readOptional(context.layout.root, context.layout.transaction);
  if (tx !== undefined && !Buffer.from(tx).equals(canonical(context.transaction))) throw new Error('authority publication transaction changed during cleanup');
  const lock = await readOptional(context.layout.root, context.layout.lock);
  if (lock !== undefined && !Buffer.from(lock).equals(canonical(context.plan.lock))) throw new Error('authority publication lock changed during cleanup');
  await assertNoSymlinkPath(context.layout.root, context.layout.transaction);
  await assertNoSymlinkPath(context.layout.root, context.layout.lock);
  await unlink(context.layout.transaction).catch((error: unknown) => { if (!(isRecord(error) && error.code === 'ENOENT')) throw error; });
  await unlink(context.layout.lock).catch((error: unknown) => { if (!(isRecord(error) && error.code === 'ENOENT')) throw error; });
  await syncDirectory(dirname(context.layout.transaction));
}

async function cleanupLockOnly(context: PublicationContext): Promise<PrebuiltAuthorityPublicationResult> {
  await assertNoSymlinkPath(context.layout.root, context.layout.lock);
  await unlink(context.layout.lock).catch((error: unknown) => {
    if (!(isRecord(error) && error.code === 'ENOENT')) throw error;
  });
  await syncDirectory(dirname(context.layout.lock));
  return result(context, 'lock-only', true);
}

async function run(context: PublicationContext): Promise<PrebuiltAuthorityPublicationResult> {
  assertTransactionStateBindings(context);
  const state = context.transaction.state.phase;
  if (state === 'complete') {
    assertTransactionStateBindings(context);
    await verifyDurableOutputs(context);
    const completed = result(context, 'complete', true);
    await cleanupJournals(context);
    return completed;
  }
  if (state === 'intent_fsynced') {
    await materializeProposal(context);
    for (const descriptor of context.transaction.sourceGenerationDirectories) await materializeSourceStage(context, sourceFor(context.graph, descriptor.sourceId), descriptor);
    await persistState(context, { phase: 'source_generation_directories_staged_fsynced', inputGenerationSha256: String((context.graph.inputGeneration as { generationSha256: string }).generationSha256) });
    await boundary(context, 'source-generation-directories-staged-fsynced');
  }
  if (context.transaction.state.phase === 'source_generation_directories_staged_fsynced') {
    assertTransactionStateBindings(context);
    await verifyDurableOutputs(context);
    for (const descriptor of context.transaction.sourceGenerationDirectories) await promoteSourceDirectory(context, descriptor, sourceFor(context.graph, descriptor.sourceId));
    await persistState(context, { phase: 'source_generation_directories_promoted', inputGenerationSha256: String((context.graph.inputGeneration as { generationSha256: string }).generationSha256) });
    await boundary(context, 'source-generation-directories-promoted');
  }
  if (context.transaction.state.phase === 'source_generation_directories_promoted') {
    assertTransactionStateBindings(context);
    await verifyDurableOutputs(context);
    for (const descriptor of context.transaction.sourceGenerationDirectories) await syncDirectory(dirname(absoluteContained(context.layout.root, descriptor.generationFinalRelativePath)));
    await persistState(context, { phase: 'source_generation_parents_fsynced', inputGenerationSha256: String((context.graph.inputGeneration as { generationSha256: string }).generationSha256) });
    await boundary(context, 'source-generation-parents-fsynced');
  }
  if (context.transaction.state.phase === 'source_generation_parents_fsynced') {
    assertTransactionStateBindings(context);
    await verifyDurableOutputs(context);
    await materializeInput(context);
    await persistState(context, { phase: 'input_generation_fsynced', inputGenerationSha256: String((context.graph.inputGeneration as { generationSha256: string }).generationSha256) });
    await boundary(context, 'input-generation-fsynced');
  }
  if (context.transaction.state.phase === 'input_generation_fsynced') {
    assertTransactionStateBindings(context);
    await verifyDurableOutputs(context);
    await verifyInput(context);
    const staticGeneration = context.graph.staticGeneration as { overlapGenerationSha256: string };
    await persistState(context, {
      phase: 'primary_static_outputs_fsynced',
      inputGenerationSha256: String((context.graph.inputGeneration as { generationSha256: string }).generationSha256),
      overlapGenerationSha256: staticGeneration.overlapGenerationSha256,
      primaryOutputSetSha256: context.toolReceipt.primaryOutputSetSha256,
    });
    await boundary(context, 'primary-static-outputs-fsynced');
  }
  if (context.transaction.state.phase === 'primary_static_outputs_fsynced') {
    assertTransactionStateBindings(context);
    await verifyDurableOutputs(context);
    const current = context.transaction.state;
    await persistState(context, {
      phase: 'tool_receipt_indexed',
      inputGenerationSha256: current.inputGenerationSha256,
      overlapGenerationSha256: current.overlapGenerationSha256,
      primaryOutputSetSha256: current.primaryOutputSetSha256,
      toolReceiptId: context.toolReceipt.receiptId,
      toolReceiptSha256: context.toolReceipt.receiptSha256,
      toolAuthorityIndexSha256: context.toolReceipt.authorityIndexSha256,
    });
    await boundary(context, 'tool-receipt-indexed');
  }
  if (context.transaction.state.phase === 'tool_receipt_indexed') {
    assertTransactionStateBindings(context);
    await verifyDurableOutputs(context);
    const current = context.transaction.state;
    await materializeStaticStage(context);
    await persistState(context, {
      phase: 'static_generation_staged_fsynced',
      inputGenerationSha256: current.inputGenerationSha256,
      overlapGenerationSha256: current.overlapGenerationSha256,
      primaryOutputSetSha256: current.primaryOutputSetSha256,
      toolReceiptId: current.toolReceiptId,
      toolReceiptSha256: current.toolReceiptSha256,
      toolAuthorityIndexSha256: current.toolAuthorityIndexSha256,
      staticGenerationSha256: String((context.graph.staticGeneration as { generationSha256: string }).generationSha256),
      staticGenerationRelativePath: context.plan.paths.staticGenerationFinalRelativePath,
    });
    await boundary(context, 'static-generation-staged-fsynced');
  }
  if (context.transaction.state.phase === 'static_generation_staged_fsynced') {
    assertTransactionStateBindings(context);
    await verifyDurableOutputs(context);
    await promoteStaticDirectory(context);
    const current = context.transaction.state;
    await persistState(context, { ...current, phase: 'static_generation_promoted' });
    await boundary(context, 'static-generation-promoted');
  }
  if (context.transaction.state.phase === 'static_generation_promoted') {
    assertTransactionStateBindings(context);
    await verifyDurableOutputs(context);
    const current = context.transaction.state;
    await syncDirectory(dirname(absoluteContained(context.layout.root, context.plan.paths.staticGenerationFinalRelativePath)));
    await persistState(context, { ...current, phase: 'static_generations_parent_fsynced' });
    await boundary(context, 'static-generations-parent-fsynced');
  }
  if (context.transaction.state.phase === 'static_generations_parent_fsynced') {
    assertTransactionStateBindings(context);
    await verifyDurableOutputs(context);
    await materializeSourceCurrents(context);
    const current = context.transaction.state;
    await persistState(context, { ...current, phase: 'source_current_pointers_promoted' });
    await boundary(context, 'source-current-pointers-promoted');
  }
  if (context.transaction.state.phase === 'source_current_pointers_promoted') {
    assertTransactionStateBindings(context);
    await verifyDurableOutputs(context);
    await materializeAuthorityCurrent(context);
    const current = context.transaction.state;
    await persistState(context, { ...current, phase: 'authority_current_promoted' });
    await boundary(context, 'authority-current-promoted');
  }
  if (context.transaction.state.phase === 'authority_current_promoted') {
    assertTransactionStateBindings(context);
    await verifyDurableOutputs(context);
    const current = context.transaction.state;
    await persistState(context, { ...current, phase: 'output_directories_fsynced' });
    await boundary(context, 'output-directories-fsynced');
  }
  if (context.transaction.state.phase === 'output_directories_fsynced') {
    assertTransactionStateBindings(context);
    await verifyDurableOutputs(context);
    const current = context.transaction.state;
    await persistState(context, { ...current, phase: 'complete' });
    await boundary(context, 'complete');
    assertTransactionStateBindings(context);
    await verifyDurableOutputs(context);
    const completed = result(context, 'complete', true);
    await cleanupJournals(context);
    return completed;
  }
  return result(context, 'recovery-required', false);
}

async function createContext(request: PrebuiltAuthorityPublicationRequest): Promise<PublicationContext> {
  const context = await preflight(request);
  await assertExpectedCurrentBeforeMutation(context);
  const existingLock = await readOptional(context.layout.root, context.layout.lock);
  if (existingLock !== undefined) throw new Error('authority publication is contended');
  await ensureDirectory(context.layout.root, dirname(context.layout.lock));
  await writeExclusive(context.layout.root, context.layout.lock, canonical(context.plan.lock));
  try {
    await boundary(context, 'lock-fsynced');
  } catch (error) {
    throw new PrebuiltAuthorityPublicationPendingError(result(context, 'recovery-required', false), error instanceof Error ? error.message : String(error));
  }
  await writeExclusive(context.layout.root, context.layout.transaction, canonical(context.transaction));
  try {
    await boundary(context, 'transaction-fsynced');
  } catch (error) {
    throw new PrebuiltAuthorityPublicationPendingError(result(context, 'recovery-required', false), error instanceof Error ? error.message : String(error));
  }
  return context;
}

export async function publishPrebuiltAdmissionAuthority(request: PrebuiltAuthorityPublicationRequest): Promise<PrebuiltAuthorityPublicationResult> {
  const context = await createContext(request);
  try {
    return await run(context);
  } catch (error) {
    if (error instanceof PrebuiltAuthorityPublicationPendingError) throw error;
    throw new PrebuiltAuthorityPublicationPendingError(result(context, 'recovery-required', false), error instanceof Error ? error.message : String(error));
  }
}

export async function recoverPrebuiltAdmissionAuthority(request: PrebuiltAuthorityPublicationRecoveryRequest): Promise<PrebuiltAuthorityPublicationResult> {
  if (!request.acknowledgeNoLiveWriter) throw new Error('authority recovery requires no-live-writer acknowledgement');
  const context = await preflight(request);
  const lockBytes = await readOptional(context.layout.root, context.layout.lock);
  const transactionBytes = await readOptional(context.layout.root, context.layout.transaction);
  if (lockBytes === undefined && transactionBytes === undefined) throw new Error('authority recovery has no fixed journal');
  if (lockBytes === undefined) {
    if (transactionBytes === undefined) throw new Error('authority recovery has no fixed journal');
    const orphanTransaction = await readCanonical(context.layout.root, context.layout.transaction);
    if (!validateCalibrationAdmissionAuthorityRebuildTransactionV1(orphanTransaction).ok
      || !isRecord(orphanTransaction)
      || orphanTransaction.transactionId !== context.plan.transaction.transactionId
      || orphanTransaction.recoveryNonce !== request.recoveryNonce
      || (request.transactionId !== undefined && request.transactionId !== orphanTransaction.transactionId)
      || !isRecord(orphanTransaction.state)
      || orphanTransaction.state.phase !== 'complete') {
      throw new Error('authority recovery transaction is orphaned before complete');
    }
    const withoutState = (value: Record<string, unknown>): Record<string, unknown> => {
      const copy = { ...value };
      delete copy.state;
      delete copy.transactionSha256;
      return copy;
    };
    if (calibrationAdmissionCanonicalJson(withoutState(orphanTransaction))
      !== calibrationAdmissionCanonicalJson(withoutState(context.plan.transaction as unknown as Record<string, unknown>))) {
      throw new Error('authority recovery orphan transaction plan mismatch');
    }
    context.transaction = orphanTransaction as unknown as CalibrationAdmissionAuthorityRebuildTransactionV1;
    assertTransactionStateBindings(context);
    await verifyDurableOutputs(context);
    await unlink(context.layout.transaction);
    await syncDirectory(dirname(context.layout.transaction));
    return result(context, 'complete', true);
  }
  const lockValue = await readCanonical(context.layout.root, context.layout.lock);
  if (!validateCalibrationAdmissionAuthorityRebuildLockV1(lockValue).ok
    || !isRecord(lockValue)
    || lockValue.lockSha256 !== context.plan.lock.lockSha256
    || lockValue.intendedTransactionId !== context.plan.transaction.transactionId
    || lockValue.recoveryNonce !== request.recoveryNonce) {
    throw new Error('authority recovery lock binding mismatch');
  }
  if (transactionBytes === undefined) {
    if (request.fromLock !== true || request.transactionId !== undefined) {
      throw new Error('authority recovery lock-only journal requires only explicit fromLock acknowledgement');
    }
    return cleanupLockOnly(context);
  }
  if (request.fromLock === true) throw new Error('authority recovery transaction journal cannot use fromLock selector');
  const transactionValue = await readCanonical(context.layout.root, context.layout.transaction);
  if (!validateCalibrationAdmissionAuthorityRebuildTransactionV1(transactionValue).ok) throw new Error('authority recovery transaction is invalid');
  if (!isRecord(transactionValue) || transactionValue.transactionId !== context.plan.transaction.transactionId
    || transactionValue.recoveryNonce !== request.recoveryNonce || (request.transactionId !== undefined && request.transactionId !== transactionValue.transactionId)) {
    throw new Error('authority recovery transaction binding mismatch');
  }
  const withoutState = (value: Record<string, unknown>): Record<string, unknown> => {
    const copy = { ...value };
    delete copy.state;
    delete copy.transactionSha256;
    return copy;
  };
  if (calibrationAdmissionCanonicalJson(withoutState(transactionValue))
    !== calibrationAdmissionCanonicalJson(withoutState(context.plan.transaction as unknown as Record<string, unknown>))) {
    throw new Error('authority recovery transaction plan mismatch');
  }
  context.transaction = transactionValue as unknown as CalibrationAdmissionAuthorityRebuildTransactionV1;
  return run(context);
}

export const publishPrebuiltAuthority = publishPrebuiltAdmissionAuthority;
export const recoverPrebuiltAuthority = recoverPrebuiltAdmissionAuthority;

/** Compatibility aliases for the Task 2B handoff naming. */
export type PrebuiltAuthorityPublicationFiles = PrebuiltAdmissionAuthorityGraphInput;
export type PrebuiltAuthorityPublicationPhaseHook = (phase: PrebuiltAuthorityPublicationPhase) => void | Promise<void>;
export type PrebuiltAuthorityRecoveryRequest = PrebuiltAuthorityPublicationRecoveryRequest;
export const publishAuthorityRebuild = publishPrebuiltAdmissionAuthority;
export const recoverAuthorityRebuild = recoverPrebuiltAdmissionAuthority;
