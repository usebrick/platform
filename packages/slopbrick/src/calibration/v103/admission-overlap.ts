import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, open, readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join, relative, resolve, sep } from 'node:path';

import {
  ADMISSION_OVERLAP_RESOURCE_LIMITS,
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionNormalizerRegistrySha256,
  calibrationAdmissionOverlapEdgeRowSha256,
  calibrationAdmissionOverlapCheckpointSha256,
  calibrationAdmissionOverlapIndexReceiptSha256,
  calibrationAdmissionOverlapLedgerSha256,
  calibrationAdmissionOverlapResourceReceiptId,
  calibrationAdmissionSha256,
  isCalibrationAdmissionNormalizerRegistryV1,
  isCalibrationAdmissionOverlapCheckpointV1,
  isCalibrationAdmissionOverlapIndexReceiptV1,
  isCalibrationAdmissionOverlapLedgerV1,
  isCalibrationAdmissionOverlapResourceReceiptV1,
  isCalibrationAdmissionOverlapAdjacencyRowV1,
  isCalibrationAdmissionOverlapClusterMembershipRowV1,
  isCalibrationAdmissionOverlapClusterSummaryRowV1,
  isCalibrationAdmissionOverlapEdgeRowV1,
  isCalibrationAdmissionOverlapPolicyV1,
  isCalibrationAdmissionOverlapUniverseRecordV1,
  isCalibrationAdmissionOverlapUniverseV1,
  isAdmissionOverlapJaccardAtLeast80,
  isAdmissionOverlapSizeCompatible,
  type AdmissionBoundedShardReceiptV1,
  type AdmissionNormalizerRegistryV1,
  type AdmissionOverlapAdjacencyRowV1,
  type AdmissionOverlapClusterMembershipRowV1,
  type AdmissionOverlapClusterSummaryRowV1,
  type AdmissionOverlapCheckpointV1,
  type AdmissionOverlapEdgeRowV1,
  type AdmissionOverlapIndexReceiptV1,
  type AdmissionOverlapLedgerV1,
  type AdmissionOverlapPolicyV1,
  type AdmissionOverlapResourceReceiptV1,
  type AdmissionOverlapUniverseRecordV1,
  type AdmissionOverlapUniverseV1,
} from '@usebrick/core';

import {
  ADMISSION_LEXICAL_RUNTIME_BINDINGS,
  admissionShingleSetSha256,
  normalizeAdmissionBytes,
  type AdmissionNormalizationSuccess,
} from './admission-normalizers';
import { canonicalJson } from './canonical';

/** Bytes supplied by the authority's already-validated local/archive resolver. */
export type AdmissionByteResolver = (
  record: AdmissionOverlapUniverseRecordV1,
) => Promise<Uint8Array>;

export interface AdmissionOverlapBuildResult {
  readonly ledger: AdmissionOverlapLedgerV1;
  readonly resourceReceipt: AdmissionOverlapResourceReceiptV1;
  readonly indexReceipt: AdmissionOverlapIndexReceiptV1;
  readonly errors: readonly string[];
}

/** Optional local checkpoint controls for bounded overlap computation. */
export interface AdmissionOverlapBuildOptions {
  /** The task-scoped invocation intent that owns each checkpoint. */
  readonly invocationIntentId?: string;
  /** Local, non-authoritative checkpoint directory (defaults to work/checkpoints). */
  readonly checkpointDirectory?: string;
  /** A previously persisted terminal checkpoint to resume without input reads. */
  readonly resumeFromCheckpoint?: AdmissionOverlapCheckpointV1;
}

interface NormalizedUnit {
  readonly candidateUnitId: string;
  readonly language: string;
  readonly contentSha256: string;
  readonly overlapSide: 'ai_side' | 'human_side' | 'unassigned';
  readonly polarityBindingSha256: string;
  readonly tokens: readonly string[];
  readonly shingles: readonly string[];
}

interface UnitReference {
  readonly candidateUnitId: string;
  readonly offset: number;
  readonly bytes: number;
  readonly contentSha256: string;
  readonly language: string;
  readonly overlapSide: NormalizedUnit['overlapSide'];
  readonly polarityBindingSha256: string;
  readonly shingleSetSha256: string;
}

interface ResourceState {
  readonly startedAt: number;
  bytesRead: number;
  workBytes: number;
  maxUnitBytes: number;
  maxShardBytes: number;
  maxOpenFiles: number;
  maxHeapBytes: number;
  maxRssBytes: number;
  failed: boolean;
}

interface RawRow {
  readonly key: string;
  readonly value: string;
}

interface RunLimits {
  readonly chunkBytes: number;
  readonly maxOpenFiles: number;
  readonly maxWorkBytes: number;
}

interface SortResult {
  readonly path?: string;
  readonly runs: readonly string[];
}

class ResourceLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResourceLimitError';
  }
}

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function receiptKey(value: string): string {
  // Shard receipts are printable metadata; the NUL separators used by the
  // internal tuple sort must never leak into the persisted range fields.
  return value.replace(/\u0000/gu, '|');
}

function edgeKey(left: string, right: string, kind: string): string {
  return `${left}\u0000${right}\u0000${kind}`;
}

function pairKey(left: string, right: string): string {
  return `${left}\u0000${right}`;
}

function prefixLength(shingleCount: number): number {
  if (shingleCount === 0) return 0;
  const ceilFourFifths = Number((4n * BigInt(shingleCount) + 4n) / 5n);
  return shingleCount - ceilFourFifths + 1;
}

function exactSimilarity(left: readonly string[], right: readonly string[]): { intersection: number; union: number } {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let intersection = 0;
  for (const shingle of leftSet) if (rightSet.has(shingle)) intersection += 1;
  return { intersection, union: leftSet.size + rightSet.size - intersection };
}

function crossSide(
  left: NormalizedUnit['overlapSide'],
  right: NormalizedUnit['overlapSide'],
): boolean {
  return (left === 'ai_side' && right === 'human_side')
    || (left === 'human_side' && right === 'ai_side');
}

function normalizedEdge(left: NormalizedUnit, right: NormalizedUnit, kind: 'exact' | 'near'): AdmissionOverlapEdgeRowV1 {
  const similarity = exactSimilarity(left.shingles, right.shingles);
  return {
    leftCandidateUnitId: left.candidateUnitId,
    rightCandidateUnitId: right.candidateUnitId,
    leftPolarityBindingSha256: left.polarityBindingSha256,
    rightPolarityBindingSha256: right.polarityBindingSha256,
    leftOverlapSide: left.overlapSide,
    rightOverlapSide: right.overlapSide,
    kind,
    intersection: similarity.intersection,
    union: similarity.union,
    crossSide: crossSide(left.overlapSide, right.overlapSide),
  };
}

function updateResource(state: ResourceState): void {
  const memory = process.memoryUsage();
  state.maxHeapBytes = Math.max(state.maxHeapBytes, memory.heapUsed);
  state.maxRssBytes = Math.max(state.maxRssBytes, memory.rss);
  if (state.workBytes > ADMISSION_OVERLAP_RESOURCE_LIMITS.maxWorkBytes) {
    state.failed = true;
    throw new ResourceLimitError('max_work_bytes_exceeded');
  }
  if (state.maxHeapBytes > ADMISSION_OVERLAP_RESOURCE_LIMITS.maxHeapBytes) {
    state.failed = true;
    throw new ResourceLimitError('max_heap_bytes_exceeded');
  }
  if (state.maxRssBytes > ADMISSION_OVERLAP_RESOURCE_LIMITS.maxRssBytes) {
    state.failed = true;
    throw new ResourceLimitError('max_rss_bytes_exceeded');
  }
  if (Date.now() - state.startedAt > ADMISSION_OVERLAP_RESOURCE_LIMITS.maxWallMilliseconds) {
    state.failed = true;
    throw new ResourceLimitError('max_wall_milliseconds_exceeded');
  }
}

function observedWithinLimits(state: ResourceState, policy: AdmissionOverlapPolicyV1): boolean {
  const wallMilliseconds = Date.now() - state.startedAt;
  return !state.failed
    && state.maxUnitBytes <= policy.maxUnitBytes
    && state.maxHeapBytes <= policy.maxHeapBytes
    && state.maxRssBytes <= policy.maxRssBytes
    && state.workBytes <= policy.maxWorkBytes
    && state.maxOpenFiles <= policy.maxOpenFiles
    && state.maxShardBytes <= policy.maxShardBytes
    && wallMilliseconds <= policy.maxWallMilliseconds;
}

function addWork(state: ResourceState, bytes: number): void {
  state.workBytes += bytes;
  updateResource(state);
}

async function assertNoSymlinkPath(root: string, candidate: string): Promise<void> {
  const rootResolved = resolve(root);
  const candidateResolved = resolve(candidate);
  const relativePath = relative(rootResolved, candidateResolved);
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || relativePath.includes(`..${sep}`)) {
    throw new Error('generation_local_path_escape');
  }
  try {
    if ((await lstat(rootResolved)).isSymbolicLink()) throw new Error('generation_local_symlink_component');
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
  }
  let current = rootResolved;
  for (const segment of relativePath.split(sep)) {
    if (segment.length === 0) continue;
    current = join(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error('generation_local_symlink_component');
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') throw error;
      break;
    }
  }
}

async function writeNoClobber(path: string, bytes: Buffer): Promise<void> {
  try {
    const handle = await open(path, 'wx', 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as { code?: string }).code !== 'EEXIST') throw error;
    const existing = await readFile(path);
    if (!existing.equals(bytes)) throw new Error('no_clobber_conflict');
  }
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

const CHECKPOINT_PHASES = ['postings', 'candidate_pairs', 'exact_edges', 'clusters'] as const;
type AdmissionOverlapCheckpointPhase = (typeof CHECKPOINT_PHASES)[number];
const CHECKPOINT_VERSION = 'v10.3-admission-overlap-checkpoint-v1' as const;
const RESUME_RESULT_VERSION = 'v10.3-admission-overlap-resume-result-v1' as const;

function checkpointDirectory(root: string, options: AdmissionOverlapBuildOptions): string {
  const base = resolve(root);
  const candidate = resolve(options.checkpointDirectory ?? join(base, 'checkpoints'));
  if (candidate !== base && !candidate.startsWith(`${base}${sep}`)) throw new Error('checkpoint_directory_escape');
  return candidate;
}

function sortedHashes(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function checkpointId(
  phase: AdmissionOverlapCheckpointPhase,
  universeSha256: string,
  normalizerRegistrySha256: string,
  overlapPolicySha256: string,
  invocationIntentId: string,
  inputShardSha256s: readonly string[],
  outputShardSha256s: readonly string[],
  continuationCursorSha256: string,
): string {
  const phaseNumber = CHECKPOINT_PHASES.indexOf(phase) + 1;
  const digest = calibrationAdmissionSha256({
    version: CHECKPOINT_VERSION,
    phase,
    universeSha256,
    normalizerRegistrySha256,
    overlapPolicySha256,
    invocationIntentId,
    inputShardSha256s,
    outputShardSha256s,
    continuationCursorSha256,
  });
  // The numeric prefix makes the index receipt's checkpoint list both phase
  // ordered and lexicographically sorted, as required by Core validation.
  return `${String(phaseNumber).padStart(2, '0')}-${digest}`;
}

function makeCheckpoint(
  phase: AdmissionOverlapCheckpointPhase,
  universe: AdmissionOverlapUniverseV1,
  policy: AdmissionOverlapPolicyV1,
  normalizerRegistry: AdmissionNormalizerRegistryV1,
  invocationIntentId: string,
  inputShardSha256s: readonly string[],
  outputShardSha256s: readonly string[],
): AdmissionOverlapCheckpointV1 {
  const sortedInputs = sortedHashes(inputShardSha256s);
  const sortedOutputs = sortedHashes(outputShardSha256s);
  const continuationCursorSha256 = calibrationAdmissionSha256({
    version: CHECKPOINT_VERSION,
    phase,
    universeSha256: universe.universeSha256,
    recordsJsonlSha256: universe.recordsJsonlSha256,
    normalizerRegistrySha256: normalizerRegistry.registrySha256,
    overlapPolicySha256: policy.policySha256,
    inputShardSha256s: sortedInputs,
    outputShardSha256s: sortedOutputs,
  });
  const body = {
    version: CHECKPOINT_VERSION,
    checkpointId: checkpointId(
      phase,
      universe.universeSha256,
      normalizerRegistry.registrySha256,
      policy.policySha256,
      invocationIntentId,
      sortedInputs,
      sortedOutputs,
      continuationCursorSha256,
    ),
    universeSha256: universe.universeSha256,
    normalizerRegistrySha256: normalizerRegistry.registrySha256,
    overlapPolicySha256: policy.policySha256,
    invocationIntentId,
    phase,
    inputShardSha256s: sortedInputs,
    outputShardSha256s: sortedOutputs,
    continuationCursorSha256,
  } satisfies Omit<AdmissionOverlapCheckpointV1, 'checkpointSha256'>;
  return { ...body, checkpointSha256: calibrationAdmissionOverlapCheckpointSha256(body) };
}

async function persistCheckpoint(
  root: string,
  options: AdmissionOverlapBuildOptions,
  checkpoint: AdmissionOverlapCheckpointV1,
): Promise<void> {
  const directory = checkpointDirectory(root, options);
  await mkdir(directory, { recursive: true });
  await assertNoSymlinkPath(resolve(root), directory);
  const path = join(directory, `${checkpoint.checkpointId}.json`);
  await assertNoSymlinkPath(resolve(root), path);
  await writeNoClobber(path, Buffer.from(`${canonicalJson(checkpoint)}\n`, 'utf8'));
  await syncDirectory(directory);
}

function checkpointMatches(
  checkpoint: AdmissionOverlapCheckpointV1,
  universe: AdmissionOverlapUniverseV1,
  policy: AdmissionOverlapPolicyV1,
  normalizerRegistry: AdmissionNormalizerRegistryV1,
  invocationIntentId: string,
): boolean {
  return isCalibrationAdmissionOverlapCheckpointV1(checkpoint)
    && checkpoint.universeSha256 === universe.universeSha256
    && checkpoint.normalizerRegistrySha256 === normalizerRegistry.registrySha256
    && checkpoint.overlapPolicySha256 === policy.policySha256
    && checkpoint.invocationIntentId === invocationIntentId;
}

async function readCheckpoint(
  root: string,
  options: AdmissionOverlapBuildOptions,
  expected: AdmissionOverlapCheckpointV1,
): Promise<AdmissionOverlapCheckpointV1> {
  const directory = checkpointDirectory(root, options);
  await assertNoSymlinkPath(resolve(root), directory);
  const path = join(directory, `${expected.checkpointId}.json`);
  await assertNoSymlinkPath(resolve(root), path);
  const bytes = await readFile(path);
  const parsed = JSON.parse(bytes.toString('utf8')) as unknown;
  if (!isCalibrationAdmissionOverlapCheckpointV1(parsed) || canonicalJson(parsed) !== bytes.toString('utf8').trim() || canonicalJson(parsed) !== canonicalJson(expected)) {
    throw new Error('checkpoint_bytes_invalid');
  }
  const expectedId = checkpointId(
    parsed.phase,
    parsed.universeSha256,
    parsed.normalizerRegistrySha256,
    parsed.overlapPolicySha256,
    parsed.invocationIntentId,
    parsed.inputShardSha256s,
    parsed.outputShardSha256s,
    parsed.continuationCursorSha256,
  );
  if (expectedId !== parsed.checkpointId) throw new Error('checkpoint_id_invalid');
  return parsed;
}

interface ResumeSidecar {
  readonly version: typeof RESUME_RESULT_VERSION;
  readonly checkpointSha256: string;
  readonly result: AdmissionOverlapBuildResult;
}

async function verifyResumeShardHashes(root: string, checkpoint: AdmissionOverlapCheckpointV1, result: AdmissionOverlapBuildResult): Promise<void> {
  const shardReceipts = [
    ...result.indexReceipt.postingShards,
    ...result.indexReceipt.candidatePairShards,
    ...result.ledger.edgeShards,
    ...result.ledger.adjacencyShards,
    ...result.ledger.clusterSummaryShards,
    ...result.ledger.clusterMembershipShards,
  ];
  const outputHashes = new Set(checkpoint.outputShardSha256s);
  for (const receipt of shardReceipts) {
    if (!outputHashes.has(receipt.sha256)) throw new Error('checkpoint_output_shard_unbound');
    const path = join(root, receipt.relativePath);
    await assertNoSymlinkPath(resolve(root), path);
    const bytes = await readFile(path);
    if (sha256(bytes) !== receipt.sha256 || bytes.byteLength !== receipt.bytes) throw new Error('checkpoint_output_shard_mismatch');
  }
  if (outputHashes.size !== shardReceipts.length) throw new Error('checkpoint_output_shard_set_mismatch');
}

function isResumableResult(
  value: unknown,
  checkpoint: AdmissionOverlapCheckpointV1,
): value is AdmissionOverlapBuildResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const result = value as Partial<AdmissionOverlapBuildResult>;
  if (!Array.isArray(result.errors) || result.errors.some((error) => typeof error !== 'string')) return false;
  if (!isCalibrationAdmissionOverlapIndexReceiptV1(result.indexReceipt)
    || !isCalibrationAdmissionOverlapLedgerV1(result.ledger)
    || !isCalibrationAdmissionOverlapResourceReceiptV1(result.resourceReceipt)) return false;
  const index = result.indexReceipt;
  const ledger = result.ledger;
  const resource = result.resourceReceipt;
  const terminal = index.checkpoints.at(-1);
  return result.errors.length === 0
    && index.complete
    && resource.coverageComplete
    && resource.withinAllLimits
    && ledger.coverageComplete
    && ledger.indexReceiptSha256 === index.receiptSha256
    && index.universeSha256 === checkpoint.universeSha256
    && index.normalizerRegistrySha256 === checkpoint.normalizerRegistrySha256
    && index.overlapPolicySha256 === checkpoint.overlapPolicySha256
    && ledger.universeSha256 === checkpoint.universeSha256
    && ledger.normalizerRegistrySha256 === checkpoint.normalizerRegistrySha256
    && ledger.overlapPolicySha256 === checkpoint.overlapPolicySha256
    && resource.universeSha256 === checkpoint.universeSha256
    && resource.overlapPolicySha256 === checkpoint.overlapPolicySha256
    && terminal?.checkpointSha256 === checkpoint.checkpointSha256;
}

async function resumeFromTerminalCheckpoint(
  root: string,
  options: AdmissionOverlapBuildOptions,
  universe: AdmissionOverlapUniverseV1,
  policy: AdmissionOverlapPolicyV1,
  normalizerRegistry: AdmissionNormalizerRegistryV1,
): Promise<AdmissionOverlapBuildResult> {
  const checkpoint = options.resumeFromCheckpoint;
  const invocationIntentId = options.invocationIntentId;
  if (checkpoint === undefined || invocationIntentId === undefined) throw new Error('checkpoint_resume_requires_invocation_intent');
  if (!checkpointMatches(checkpoint, universe, policy, normalizerRegistry, invocationIntentId)) {
    if (checkpoint.invocationIntentId !== invocationIntentId) throw new Error('checkpoint_invocation_intent_mismatch');
    throw new Error('checkpoint_authority_mismatch');
  }
  const persisted = await readCheckpoint(root, options, checkpoint);
  if (persisted.phase !== 'clusters') throw new Error('checkpoint_phase_not_resumable');
  const directory = checkpointDirectory(root, options);
  await assertNoSymlinkPath(resolve(root), directory);
  const sidecarPath = join(directory, 'result.json');
  await assertNoSymlinkPath(resolve(root), sidecarPath);
  const sidecarBytes = await readFile(sidecarPath);
  const sidecar = JSON.parse(sidecarBytes.toString('utf8')) as unknown;
  if (typeof sidecar !== 'object' || sidecar === null || Array.isArray(sidecar)) throw new Error('checkpoint_result_invalid');
  if (canonicalJson(sidecar) !== sidecarBytes.toString('utf8').trim()) throw new Error('checkpoint_result_noncanonical');
  const value = sidecar as Partial<ResumeSidecar>;
  if (value.version !== RESUME_RESULT_VERSION || value.checkpointSha256 !== checkpoint.checkpointSha256 || value.result === undefined) throw new Error('checkpoint_result_binding_invalid');
  const result = value.result;
  if (!isResumableResult(result, checkpoint)) throw new Error('checkpoint_result_invalid');
  await verifyResumeShardHashes(root, checkpoint, result);
  return result;
}

function ensureWithin(value: number, limit: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > limit) {
    throw new ResourceLimitError(`${name}_exceeded`);
  }
}

async function appendBuffer(handle: Awaited<ReturnType<typeof open>>, buffer: string[]): Promise<number> {
  if (buffer.length === 0) return 0;
  const bytes = Buffer.from(buffer.join(''), 'utf8');
  await handle.write(bytes);
  buffer.length = 0;
  return bytes.byteLength;
}

async function syncClose(handle: Awaited<ReturnType<typeof open>>): Promise<void> {
  await handle.sync();
  await handle.close();
}

function lineBytes(value: unknown): Buffer {
  return Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
}

function safeJsonLine(line: string): Record<string, unknown> {
  const value: unknown = JSON.parse(line);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('sort_row_not_object');
  return value as Record<string, unknown>;
}

function sortRows(rows: readonly RawRow[]): RawRow[] {
  return [...rows].sort((left, right) => compare(left.key, right.key) || compare(left.value, right.value));
}

/**
 * A small k-way merge primitive. It is deliberately bounded by run count and
 * chunk bytes; a caller exceeding the frozen open-file envelope fails closed
 * rather than silently falling back to an unbounded in-memory sort.
 */
async function sortJsonlFile(
  inputPath: string,
  outputPath: string,
  runDirectory: string,
  keyOf: (row: Record<string, unknown>) => string,
  limits: RunLimits,
  state: ResourceState,
): Promise<SortResult> {
  await mkdir(runDirectory, { recursive: true });
  const containmentRoot = resolve(join(runDirectory, '..', '..'));
  await assertNoSymlinkPath(containmentRoot, runDirectory);
  await assertNoSymlinkPath(containmentRoot, outputPath);
  const runs: string[] = [];
  const rows: RawRow[] = [];
  let chunkBytes = 0;
  let runIndex = 0;
  const flushRun = async (): Promise<void> => {
    if (rows.length === 0) return;
    const sorted = sortRows(rows);
    const bytes = Buffer.concat(sorted.map((row) => Buffer.from(`${row.value}\n`, 'utf8')));
    const path = join(runDirectory, `run-${String(runIndex).padStart(8, '0')}.jsonl`);
    await assertNoSymlinkPath(containmentRoot, path);
    await writeNoClobber(path, bytes);
    addWork(state, bytes.byteLength);
    runs.push(path);
    runIndex += 1;
    rows.length = 0;
    chunkBytes = 0;
  };
  const reader = createInterface({ input: createReadStream(inputPath, { encoding: 'utf8' }), crlfDelay: Infinity });
  try {
    for await (const line of reader) {
      if (line.length === 0) continue;
      addWork(state, Buffer.byteLength(line, 'utf8') + 1);
      const row = safeJsonLine(line);
      const value = canonicalJson(row);
      const bytes = Buffer.byteLength(value, 'utf8') + 1;
      if (bytes > limits.chunkBytes) throw new ResourceLimitError('sort_row_exceeds_chunk_bound');
      rows.push({ key: keyOf(row), value });
      chunkBytes += bytes;
      if (chunkBytes >= limits.chunkBytes) await flushRun();
    }
  } finally {
    reader.close();
  }
  await flushRun();
  if (runs.length === 0) {
    await writeNoClobber(outputPath, Buffer.alloc(0));
    return { path: outputPath, runs };
  }
  // Merge one line per run at a time. A previous implementation read every
  // run into arrays, which defeated the bounded-memory contract precisely when
  // the input became large. The cursors below retain only one decoded line per
  // open run plus a small output buffer. If a single pass would exceed the
  // open-file envelope, merge bounded batches into another run and repeat.
  interface Cursor {
    readonly iterator: AsyncIterator<string>;
    line?: string;
  }
  async function* runLines(path: string): AsyncIterable<string> {
    const reader = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
    try {
      for await (const line of reader) {
        if (line.length === 0) continue;
        addWork(state, Buffer.byteLength(line, 'utf8') + 1);
        yield line;
      }
    } finally {
      reader.close();
    }
  }
  const mergeBatch = async (batch: readonly string[], destination: string): Promise<void> => {
    if (batch.length + 1 > limits.maxOpenFiles) throw new ResourceLimitError('max_open_files_exceeded');
    state.maxOpenFiles = Math.max(state.maxOpenFiles, batch.length + 1);
    const cursors: Cursor[] = batch.map((path) => ({ iterator: runLines(path)[Symbol.asyncIterator]() }));
    for (const cursor of cursors) {
      const next = await cursor.iterator.next();
      if (!next.done) cursor.line = next.value;
    }
    await assertNoSymlinkPath(containmentRoot, destination);
    let outputHandle: Awaited<ReturnType<typeof open>> | undefined;
    const outputBuffer: string[] = [];
    try {
      outputHandle = await open(destination, 'wx', 0o600);
      while (true) {
        let selected = -1;
        let selectedKey = '';
        let selectedLine = '';
        for (let index = 0; index < cursors.length; index += 1) {
          const line = cursors[index]!.line;
          if (line === undefined) continue;
          const key = keyOf(safeJsonLine(line));
          if (selected < 0 || key < selectedKey || (key === selectedKey && line < selectedLine)) {
            selected = index;
            selectedKey = key;
            selectedLine = line;
          }
        }
        if (selected < 0) break;
        outputBuffer.push(`${selectedLine}\n`);
        if (outputBuffer.length >= 1024) await flushRawBuffer(outputHandle, outputBuffer, state);
        const next = await cursors[selected]!.iterator.next();
        cursors[selected]!.line = next.done ? undefined : next.value;
      }
      await flushRawBuffer(outputHandle, outputBuffer, state);
      await outputHandle.sync();
    } finally {
      if (outputHandle !== undefined) await outputHandle.close();
      await Promise.all(cursors.map(async (cursor) => {
        if (cursor.iterator.return !== undefined) await cursor.iterator.return();
      }));
    }
  };

  let currentRuns = runs;
  let pass = 0;
  const batchSize = Math.max(1, limits.maxOpenFiles - 1);
  while (currentRuns.length > batchSize) {
    const nextRuns: string[] = [];
    for (let index = 0; index < currentRuns.length; index += batchSize) {
      const batch = currentRuns.slice(index, index + batchSize);
      const destination = join(runDirectory, `merge-${String(pass).padStart(4, '0')}-${String(nextRuns.length).padStart(8, '0')}.jsonl`);
      await mergeBatch(batch, destination);
      nextRuns.push(destination);
    }
    currentRuns = nextRuns;
    pass += 1;
  }
  await mergeBatch(currentRuns, outputPath);
  return { path: outputPath, runs };
}

class ShardWriter<T> {
  private readonly rows: Buffer[] = [];
  private readonly keys: string[] = [];
  private bytes = 0;
  private index = 0;
  private readonly receipts: AdmissionBoundedShardReceiptV1[] = [];

  constructor(
    private readonly root: string,
    private readonly directory: string,
    private readonly prefix: string,
    private readonly maxBytes: number,
    private readonly state: ResourceState,
  ) {}

  async write(row: T, key: string): Promise<void> {
    const bytes = lineBytes(row);
    if (bytes.byteLength > this.maxBytes) throw new ResourceLimitError('row_exceeds_max_shard_bytes');
    if (this.bytes > 0 && this.bytes + bytes.byteLength > this.maxBytes) await this.flush();
    this.rows.push(bytes);
    this.keys.push(receiptKey(key));
    this.bytes += bytes.byteLength;
    this.state.maxShardBytes = Math.max(this.state.maxShardBytes, this.bytes);
  }

  async flush(): Promise<void> {
    if (this.rows.length === 0) return;
    const bytes = Buffer.concat(this.rows);
    const relativePath = `${this.directory}/${this.prefix}-${String(this.index).padStart(8, '0')}.jsonl`;
    const absolutePath = join(this.root, relativePath);
    await assertNoSymlinkPath(this.root, absolutePath);
    await mkdir(join(this.root, this.directory), { recursive: true });
    await assertNoSymlinkPath(this.root, absolutePath);
    await writeNoClobber(absolutePath, bytes);
    addWork(this.state, bytes.byteLength);
    this.receipts.push({
      shardId: `${this.prefix}-${String(this.index).padStart(8, '0')}`,
      pathBase: 'generation_local',
      relativePath,
      firstKey: this.keys[0]!,
      lastKey: this.keys.at(-1)!,
      rowCount: this.rows.length,
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
    });
    this.index += 1;
    this.rows.length = 0;
    this.keys.length = 0;
    this.bytes = 0;
  }

  async close(): Promise<readonly AdmissionBoundedShardReceiptV1[]> {
    await this.flush();
    return this.receipts;
  }
}

async function verifyShards(
  root: string,
  receipts: readonly AdmissionBoundedShardReceiptV1[],
  isRow: (value: unknown) => boolean,
  keyOf?: (value: Record<string, unknown>) => string,
): Promise<void> {
  let previousReceiptPath = '';
  for (const receipt of receipts) {
    if (receipt.pathBase !== 'generation_local') throw new Error('shard_path_base_invalid');
    if (receipt.relativePath <= previousReceiptPath) throw new Error('shard_receipt_order_invalid');
    previousReceiptPath = receipt.relativePath;
    const absolute = join(root, receipt.relativePath);
    await assertNoSymlinkPath(root, absolute);
    const bytes = await readFile(absolute);
    if (bytes.byteLength !== receipt.bytes || sha256(bytes) !== receipt.sha256) throw new Error('shard_receipt_hash_mismatch');
    const text = bytes.toString('utf8');
    const lines = text.length === 0 ? [] : text.endsWith('\n') ? text.slice(0, -1).split('\n') : (() => { throw new Error('shard_final_newline_required'); })();
    if (lines.length !== receipt.rowCount) throw new Error('shard_row_count_mismatch');
    let previousKey = '';
    for (const line of lines) {
      const row = safeJsonLine(line);
      if (canonicalJson(row) !== line || !isRow(row)) throw new Error('shard_row_contract_invalid');
      if (keyOf !== undefined) {
        const key = receiptKey(keyOf(row));
        if (key < previousKey) throw new Error('shard_row_order_invalid');
        previousKey = key;
      }
    }
    if (keyOf !== undefined && lines.length > 0) {
      const first = receiptKey(keyOf(safeJsonLine(lines[0]!)));
      const last = receiptKey(keyOf(safeJsonLine(lines.at(-1)!)));
      if (first !== receipt.firstKey || last !== receipt.lastKey) throw new Error('shard_range_mismatch');
    }
  }
}

function emptyIndex(
  universe: AdmissionOverlapUniverseV1,
  policy: AdmissionOverlapPolicyV1,
  toolReceiptSha256: string,
  checkpoints: readonly AdmissionOverlapCheckpointV1[] = [],
): AdmissionOverlapIndexReceiptV1 {
  const base: Omit<AdmissionOverlapIndexReceiptV1, 'receiptSha256'> = {
    version: 'v10.3-overlap-index-receipt-v1',
    universeSha256: universe.universeSha256,
    normalizerRegistrySha256: universe.normalizerRegistrySha256,
    overlapPolicySha256: policy.policySha256,
    method: 'prefix-filter-exact-jaccard-0.80-v1',
    postingShards: [],
    candidatePairShards: [],
    checkpoints: [...checkpoints],
    coveredCandidateUnits: 0,
    complete: false,
    toolReceiptSha256,
  };
  return { ...base, receiptSha256: calibrationAdmissionOverlapIndexReceiptSha256(base) };
}

function emptyLedger(universe: AdmissionOverlapUniverseV1, policy: AdmissionOverlapPolicyV1, indexReceiptSha256: string): AdmissionOverlapLedgerV1 {
  const base: Omit<AdmissionOverlapLedgerV1, 'ledgerSha256'> = {
    version: 'v10.3-admission-overlap-v1',
    universeSha256: universe.universeSha256,
    method: 'prefix-filter-exact-jaccard-0.80-v1',
    normalizerRegistrySha256: universe.normalizerRegistrySha256,
    overlapPolicySha256: policy.policySha256,
    indexReceiptSha256,
    coverageComplete: false,
    unresolvedCandidateUnitIds: [...universe.unresolvedCandidateUnitIds],
    edgeShards: [],
    adjacencyShards: [],
    clusterSummaryShards: [],
    clusterMembershipShards: [],
    edgeCount: 0,
    adjacencyRowCount: 0,
    exactClusterCount: 0,
    nearClusterCount: 0,
    crossSideEdgeCount: 0,
  };
  return { ...base, ledgerSha256: calibrationAdmissionOverlapLedgerSha256(base) };
}

function emptyResource(
  universe: AdmissionOverlapUniverseV1,
  policy: AdmissionOverlapPolicyV1,
  toolReceiptSha256: string,
  state: ResourceState,
): AdmissionOverlapResourceReceiptV1 {
  const base: Omit<AdmissionOverlapResourceReceiptV1, 'receiptId'> = {
    version: 'v10.3-overlap-resource-receipt-v1',
    universeSha256: universe.universeSha256,
    recordsJsonlSha256: universe.recordsJsonlSha256,
    overlapPolicySha256: policy.policySha256,
    realContentDistributionSha256: sha256('no-covered-content'),
    recordCount: 0,
    tokenCount: 0,
    shingleCount: 0,
    configuredLimits: { ...ADMISSION_OVERLAP_RESOURCE_LIMITS },
    observed: {
      maxUnitBytes: state.maxUnitBytes,
      maxHeapBytes: state.maxHeapBytes,
      maxRssBytes: state.maxRssBytes,
      maxWorkBytes: state.workBytes,
      maxOpenFiles: state.maxOpenFiles,
      maxShardBytes: state.maxShardBytes,
      wallMilliseconds: Date.now() - state.startedAt,
    },
    coverageComplete: false,
    withinAllLimits: false,
    toolReceiptSha256,
  };
  return { ...base, receiptId: calibrationAdmissionOverlapResourceReceiptId(base) };
}

function toUnit(record: AdmissionOverlapUniverseRecordV1, normalized: AdmissionNormalizationSuccess): NormalizedUnit {
  return {
    candidateUnitId: record.candidateUnitId,
    language: record.language,
    contentSha256: record.contentSha256,
    overlapSide: record.polarity.overlapSide,
    polarityBindingSha256: record.polarity.bindingSha256,
    tokens: normalized.tokens,
    shingles: normalized.shingles,
  };
}

async function* jsonRows(path: string): AsyncIterable<Record<string, unknown>> {
  const reader = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
  try {
    for await (const line of reader) {
      if (line.length > 0) yield safeJsonLine(line);
    }
  } finally {
    reader.close();
  }
}

async function readUnitAt(
  handle: Awaited<ReturnType<typeof open>>,
  reference: UnitReference,
): Promise<NormalizedUnit> {
  const buffer = Buffer.alloc(reference.bytes);
  const result = await handle.read(buffer, 0, reference.bytes, reference.offset);
  if (result.bytesRead !== reference.bytes) throw new Error('unit_row_truncated');
  const value = JSON.parse(buffer.toString('utf8')) as NormalizedUnit;
  if (value.candidateUnitId !== reference.candidateUnitId || typeof value.candidateUnitId !== 'string' || typeof value.language !== 'string'
    || value.contentSha256 !== reference.contentSha256 || value.language !== reference.language
    || value.overlapSide !== reference.overlapSide || value.polarityBindingSha256 !== reference.polarityBindingSha256
    || !Array.isArray(value.shingles) || !Array.isArray(value.tokens)
    || !value.shingles.every((entry): entry is string => typeof entry === 'string')
    || !value.tokens.every((entry): entry is string => typeof entry === 'string')
    || [...value.shingles].sort(compare).some((entry, index) => entry !== value.shingles[index])
    || new Set(value.shingles).size !== value.shingles.length
    || admissionShingleSetSha256(value.shingles) !== reference.shingleSetSha256) throw new Error('unit_row_invalid');
  return value;
}

function referenceFor(
  unit: NormalizedUnit,
  offset: number,
  bytes: number,
): UnitReference {
  return {
    candidateUnitId: unit.candidateUnitId,
    offset,
    bytes,
    contentSha256: unit.contentSha256,
    language: unit.language,
    overlapSide: unit.overlapSide,
    polarityBindingSha256: unit.polarityBindingSha256,
    shingleSetSha256: admissionShingleSetSha256(unit.shingles),
  };
}

function addRawLine(buffer: string[], row: unknown): number {
  const value = canonicalJson(row);
  buffer.push(`${value}\n`);
  return Buffer.byteLength(value, 'utf8') + 1;
}

async function flushRawBuffer(
  handle: Awaited<ReturnType<typeof open>>,
  buffer: string[],
  state: ResourceState,
): Promise<void> {
  const bytes = await appendBuffer(handle, buffer);
  if (bytes > 0) addWork(state, bytes);
}

function sortedSideSet(values: readonly NormalizedUnit['overlapSide'][]): NormalizedUnit['overlapSide'][] {
  const order: readonly NormalizedUnit['overlapSide'][] = ['ai_side', 'human_side', 'unassigned'];
  return [...new Set(values)].sort((left, right) => order.indexOf(left) - order.indexOf(right));
}

class DisjointSet {
  private readonly parents = new Map<string, string>();

  constructor(ids: Iterable<string>) {
    for (const id of ids) this.parents.set(id, id);
  }

  find(id: string): string {
    let parent = this.parents.get(id);
    if (parent === undefined) throw new Error('unknown_union_find_id');
    while (parent !== this.parents.get(parent)) {
      const next = this.parents.get(parent);
      if (next === undefined) throw new Error('broken_union_find_parent');
      parent = next;
    }
    let cursor = id;
    while (cursor !== parent) {
      const next = this.parents.get(cursor);
      if (next === undefined) throw new Error('broken_union_find_parent');
      this.parents.set(cursor, parent);
      cursor = next;
    }
    return parent;
  }

  union(left: string, right: string): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot === rightRoot) return;
    const root = leftRoot < rightRoot ? leftRoot : rightRoot;
    const child = root === leftRoot ? rightRoot : leftRoot;
    this.parents.set(child, root);
  }
}

function makeToolReceipt(policy: AdmissionOverlapPolicyV1): string {
  return calibrationAdmissionSha256({
    version: 'v10.3-admission-overlap-builder-v1',
    implementation: 'disk-bounded-postings-prefix-filter-v1',
    policySha256: policy.policySha256,
  });
}

const DEFAULT_NORMALIZER_REGISTRY_BASE: Omit<AdmissionNormalizerRegistryV1, 'registrySha256'> = {
  version: 'v10.3-admission-normalizers-v1' as const,
  entries: [{
    language: 'TypeScript',
    normalizerId: 'normalizer-typescript-v1',
    implementationSha256: ADMISSION_LEXICAL_RUNTIME_BINDINGS[0]!.implementationSha256,
    fixturesSha256: ADMISSION_LEXICAL_RUNTIME_BINDINGS[0]!.fixturesSha256,
    utf8Policy: 'strict' as const,
    shingleSize: 5 as const,
  }],
};
const DEFAULT_NORMALIZER_REGISTRY: AdmissionNormalizerRegistryV1 = {
  ...DEFAULT_NORMALIZER_REGISTRY_BASE,
  registrySha256: calibrationAdmissionNormalizerRegistrySha256(DEFAULT_NORMALIZER_REGISTRY_BASE),
};

/**
 * Build the bounded global-overlap authority from one verified record stream.
 *
 * The source stream is consumed once. Normalized units are persisted as a
 * temporary JSONL index, unbounded postings/pairs are externally sorted into
 * bounded runs, and authoritative edges/adjacency/cluster outputs are emitted
 * as <=64 MiB generation-local shards. The temporary index keeps only scalar
 * byte offsets in memory; it never retains source bytes.
 */
export async function buildAdmissionOverlapLedger(
  universe: AdmissionOverlapUniverseV1,
  universeRecords: AsyncIterable<AdmissionOverlapUniverseRecordV1>,
  readBytes: AdmissionByteResolver,
  workDirectory: string,
  policy: AdmissionOverlapPolicyV1,
  normalizerRegistry?: AdmissionNormalizerRegistryV1,
  options: AdmissionOverlapBuildOptions = {},
): Promise<AdmissionOverlapBuildResult> {
  const startedAt = Date.now();
  const state: ResourceState = {
    startedAt,
    bytesRead: 0,
    workBytes: 0,
    maxUnitBytes: 0,
    maxShardBytes: 0,
    maxOpenFiles: 0,
    maxHeapBytes: process.memoryUsage().heapUsed,
    maxRssBytes: process.memoryUsage().rss,
    failed: false,
  };
  const errors: string[] = [];
  const root = resolve(workDirectory);
  const tempRoot = join(root, '.overlap-work-v1');
  const toolReceiptSha256 = isCalibrationAdmissionOverlapPolicyV1(policy)
    ? makeToolReceipt(policy)
    : sha256('invalid-policy');
  const validUniverse = isCalibrationAdmissionOverlapUniverseV1(universe);
  const validPolicy = isCalibrationAdmissionOverlapPolicyV1(policy);
  const registry = normalizerRegistry ?? DEFAULT_NORMALIZER_REGISTRY;
  const validRegistry = isCalibrationAdmissionNormalizerRegistryV1(registry);

  if (options.resumeFromCheckpoint !== undefined) {
    if (!validUniverse || !validPolicy || !validRegistry) throw new Error('checkpoint_resume_authority_invalid');
    return resumeFromTerminalCheckpoint(root, options, universe, policy, registry);
  }
  if (options.invocationIntentId !== undefined && !/^[a-f0-9]{64}$/.test(options.invocationIntentId)) {
    throw new Error('checkpoint_invocation_intent_invalid');
  }
  const completedCheckpoints: AdmissionOverlapCheckpointV1[] = [];
  const recordCheckpoint = async (
    phase: AdmissionOverlapCheckpointPhase,
    inputShardSha256s: readonly string[],
    outputShardSha256s: readonly string[],
  ): Promise<void> => {
    if (options.invocationIntentId === undefined) return;
    const checkpoint = makeCheckpoint(phase, universe, policy, registry, options.invocationIntentId, inputShardSha256s, outputShardSha256s);
    await persistCheckpoint(root, options, checkpoint);
    completedCheckpoints.push(checkpoint);
  };

  if (!validUniverse) errors.push('overlap_universe_invalid');
  if (!validPolicy) errors.push('overlap_policy_invalid');
  if (!validRegistry) errors.push('normalizer_registry_invalid');
  if (validRegistry && registry.registrySha256 !== universe.normalizerRegistrySha256) errors.push('normalizer_registry_hash_mismatch');

  const empty = (): AdmissionOverlapBuildResult => {
    const effectivePolicy = validPolicy ? policy : ({
      ...ADMISSION_OVERLAP_RESOURCE_LIMITS,
      version: 'v10.3-admission-overlap-policy-v1',
      method: 'prefix-filter-exact-jaccard-0.80-v1',
      policySha256: sha256('invalid-policy'),
    } as AdmissionOverlapPolicyV1);
    const indexReceipt = emptyIndex(universe, effectivePolicy, toolReceiptSha256, completedCheckpoints);
    const resourceReceipt = emptyResource(universe, effectivePolicy, toolReceiptSha256, state);
    return {
      indexReceipt,
      resourceReceipt,
      ledger: emptyLedger(universe, effectivePolicy, indexReceipt.receiptSha256),
      errors: [...new Set(errors)],
    };
  };
  if (errors.length > 0) return empty();

  const runLimits: RunLimits = {
    chunkBytes: Math.min(33_554_432, Math.max(1_048_576, Math.floor(policy.maxHeapBytes / 32))),
    maxOpenFiles: policy.maxOpenFiles,
    maxWorkBytes: policy.maxWorkBytes,
  };
  const references = new Map<string, UnitReference>();
  const unresolved = new Set<string>();
  const distribution = createHash('sha256');
  const recordStreamHash = createHash('sha256');
  const registryByLanguage = new Map(registry.entries.map((entry) => [entry.language, entry]));
  let recordCount = 0;
  let covered = 0;
  let unsupported = 0;
  let unreadable = 0;
  let tokenCount = 0;
  let shingleCount = 0;
  let previousId = '';
  let unitsHandle: Awaited<ReturnType<typeof open>> | undefined;
  let contentHandle: Awaited<ReturnType<typeof open>> | undefined;
  let shingleHandle: Awaited<ReturnType<typeof open>> | undefined;
  let unitOffset = 0;

  try {
    await mkdir(root, { recursive: true });
    await assertNoSymlinkPath(root, root);
    await mkdir(join(tempRoot, 'raw'), { recursive: true });
    await assertNoSymlinkPath(root, tempRoot);
    await assertNoSymlinkPath(root, join(tempRoot, 'raw'));
    unitsHandle = await open(join(tempRoot, 'units.jsonl'), 'wx', 0o600);
    contentHandle = await open(join(tempRoot, 'raw', 'content.jsonl'), 'wx', 0o600);
    shingleHandle = await open(join(tempRoot, 'raw', 'shingles.jsonl'), 'wx', 0o600);
    state.maxOpenFiles = Math.max(state.maxOpenFiles, 3);
    const contentBuffer: string[] = [];
    const shingleBuffer: string[] = [];
    let contentBufferBytes = 0;
    let shingleBufferBytes = 0;

    for await (const record of universeRecords) {
      recordCount += 1;
      if (!isCalibrationAdmissionOverlapUniverseRecordV1(record)) {
        errors.push(`record ${recordCount}: invalid_overlap_record`);
        continue;
      }
      recordStreamHash.update(`${calibrationAdmissionCanonicalJson(record)}\n`, 'utf8');
      if (record.candidateUnitId <= previousId) {
        errors.push(`record ${recordCount}: candidate_order_or_duplicate`);
        continue;
      }
      previousId = record.candidateUnitId;
      const registered = registryByLanguage.get(record.language);
      if (record.normalizationStatus === 'covered' && registered?.normalizerId !== record.normalizerId) {
        errors.push(`record ${record.candidateUnitId}: covered_normalizer_binding`);
        unresolved.add(record.candidateUnitId);
        continue;
      }
      if (record.normalizationStatus === 'unreadable' && registered !== undefined && registered.normalizerId !== record.normalizerId) {
        errors.push(`record ${record.candidateUnitId}: unreadable_normalizer_binding`);
        unresolved.add(record.candidateUnitId);
        continue;
      }
      if (record.normalizationStatus === 'unsupported' && registered?.normalizerId === record.normalizerId) {
        errors.push(`record ${record.candidateUnitId}: unsupported_normalizer_binding`);
        unresolved.add(record.candidateUnitId);
        continue;
      }
      let bytes: Uint8Array;
      try {
        bytes = await readBytes(record);
      } catch (error) {
        errors.push(`record ${record.candidateUnitId}: byte_resolution_failed`);
        unresolved.add(record.candidateUnitId);
        continue;
      }
      state.bytesRead += bytes.byteLength;
      state.maxUnitBytes = Math.max(state.maxUnitBytes, bytes.byteLength);
      if (bytes.byteLength > policy.maxUnitBytes) throw new ResourceLimitError('max_unit_bytes_exceeded');
      addWork(state, bytes.byteLength);
      const contentDigest = sha256(bytes);
      if (contentDigest !== record.contentSha256 || bytes.byteLength !== record.contentBytes) {
        errors.push(`record ${record.candidateUnitId}: content_binding_mismatch`);
        unresolved.add(record.candidateUnitId);
        continue;
      }
      const normalized = normalizeAdmissionBytes(record.language, bytes, registry);
      if (record.normalizationStatus === 'unsupported' || !normalized.ok) {
        if (record.normalizationStatus === 'unsupported' && normalized.status !== 'unsupported') {
          errors.push(`record ${record.candidateUnitId}: unsupported_status_mismatch`);
        }
        if (record.normalizationStatus === 'unreadable' && normalized.status !== 'unreadable') {
          errors.push(`record ${record.candidateUnitId}: unreadable_status_mismatch`);
        }
        if (record.normalizationStatus === 'unsupported') unsupported += 1;
        else unreadable += 1;
        unresolved.add(record.candidateUnitId);
        distribution.update(`${record.candidateUnitId}\u0000${record.language}\u0000${record.normalizationStatus}\n`);
        updateResource(state);
        continue;
      }
      if (record.normalizationStatus !== 'covered'
        || normalized.normalizerId !== record.normalizerId
        || normalized.shingleCount !== record.shingleCount
        || normalized.shingleSetSha256 !== record.shingleSetSha256) {
        errors.push(`record ${record.candidateUnitId}: normalization_binding_mismatch`);
        unresolved.add(record.candidateUnitId);
        continue;
      }
      const unit = toUnit(record, normalized);
      const line = lineBytes(unit);
      ensureWithin(line.byteLength, policy.maxUnitBytes, 'normalized_unit_bytes');
      await unitsHandle.write(line, 0, line.byteLength, unitOffset);
      addWork(state, line.byteLength);
      references.set(unit.candidateUnitId, referenceFor(unit, unitOffset, line.byteLength));
      if (references.size * 320 > policy.maxHeapBytes / 2) throw new ResourceLimitError('max_heap_bytes_exceeded');
      unitOffset += line.byteLength;
      contentBufferBytes += addRawLine(contentBuffer, { key: unit.contentSha256, candidateUnitId: unit.candidateUnitId });
      for (const shingle of unit.shingles) {
        shingleBufferBytes += addRawLine(shingleBuffer, { key: `${unit.language}\u0000${shingle}`, candidateUnitId: unit.candidateUnitId });
      }
      if (contentBufferBytes >= 1_048_576) {
        await flushRawBuffer(contentHandle, contentBuffer, state);
        contentBufferBytes = 0;
      }
      if (shingleBufferBytes >= 1_048_576) {
        await flushRawBuffer(shingleHandle, shingleBuffer, state);
        shingleBufferBytes = 0;
      }
      covered += 1;
      tokenCount += unit.tokens.length;
      shingleCount += unit.shingles.length;
      distribution.update(`${unit.candidateUnitId}\u0000${unit.language}\u0000${unit.tokens.length}\u0000${unit.shingles.length}\n`);
      updateResource(state);
    }
    await flushRawBuffer(contentHandle, contentBuffer, state);
    await flushRawBuffer(shingleHandle, shingleBuffer, state);
    await syncClose(unitsHandle);
    await syncClose(contentHandle);
    await syncClose(shingleHandle);
    unitsHandle = undefined;
    contentHandle = undefined;
    shingleHandle = undefined;

    const completion = (universeRecords as unknown as {
      readonly complete?: Promise<{ readonly ok: boolean; readonly errors?: readonly string[] }>;
    }).complete;
    if (completion !== undefined) {
      const stats = await completion;
      if (!stats.ok) errors.push(...(stats.errors ?? ['universe_stream_incomplete']));
    }

    const expectedRecords = universe.selectedAggregateCoverage + universe.newCandidateUnits;
    if (recordCount !== expectedRecords) errors.push('record_count_summary_mismatch');
    if (covered !== universe.covered || unsupported !== universe.unsupported || unreadable !== universe.unreadable) errors.push('status_count_summary_mismatch');
    if (JSON.stringify([...unresolved].sort()) !== JSON.stringify(universe.unresolvedCandidateUnitIds)) errors.push('unresolved_summary_mismatch');
    if (recordStreamHash.digest('hex') !== universe.recordsJsonlSha256) errors.push('records_jsonl_hash_mismatch');
    if (references.size !== covered) errors.push('covered_reference_count_mismatch');

    if (covered === 0 || errors.length > 0 || unresolved.size > 0) {
      const indexReceipt = emptyIndex(universe, policy, toolReceiptSha256);
      const resourceBase: Omit<AdmissionOverlapResourceReceiptV1, 'receiptId'> = {
        version: 'v10.3-overlap-resource-receipt-v1',
        universeSha256: universe.universeSha256,
        recordsJsonlSha256: universe.recordsJsonlSha256,
        overlapPolicySha256: policy.policySha256,
        realContentDistributionSha256: distribution.digest('hex'),
        recordCount,
        tokenCount,
        shingleCount,
        configuredLimits: { ...ADMISSION_OVERLAP_RESOURCE_LIMITS },
        observed: {
          maxUnitBytes: state.maxUnitBytes,
          maxHeapBytes: state.maxHeapBytes,
          maxRssBytes: state.maxRssBytes,
          maxWorkBytes: state.workBytes,
          maxOpenFiles: state.maxOpenFiles,
          maxShardBytes: state.maxShardBytes,
          wallMilliseconds: Date.now() - startedAt,
        },
        coverageComplete: false,
        withinAllLimits: observedWithinLimits(state, policy),
        toolReceiptSha256,
      };
      return {
        indexReceipt,
        resourceReceipt: { ...resourceBase, receiptId: calibrationAdmissionOverlapResourceReceiptId(resourceBase) },
        ledger: emptyLedger(universe, policy, indexReceipt.receiptSha256),
        errors: [...new Set(errors)],
      };
    }

    // The remaining phases are implemented below using the disk index and
    // externally sorted relation files. Keep the open handle count explicit.
    const frequencyPath = join(tempRoot, 'frequency.jsonl');
    const sortedShinglePath = join(tempRoot, 'sorted-shingles.jsonl');
    await sortJsonlFile(
      join(tempRoot, 'raw', 'shingles.jsonl'),
      sortedShinglePath,
      join(tempRoot, 'runs', 'shingles'),
      (row) => typeof row.key === 'string' ? row.key : '',
      runLimits,
      state,
    );
    const frequencyHandle = await open(frequencyPath, 'wx', 0o600);
    state.maxOpenFiles = Math.max(state.maxOpenFiles, 1);
    let frequencyBuffer: string[] = [];
    let currentFrequencyKey = '';
    let frequencyCount = 0;
    for await (const row of jsonRows(sortedShinglePath)) {
      const key = typeof row.key === 'string' ? row.key : '';
      if (key !== currentFrequencyKey && currentFrequencyKey !== '') {
        addRawLine(frequencyBuffer, { key: currentFrequencyKey, count: frequencyCount });
        if (frequencyBuffer.join('').length >= 1_048_576) await flushRawBuffer(frequencyHandle, frequencyBuffer, state);
        frequencyCount = 0;
      }
      if (key !== currentFrequencyKey) currentFrequencyKey = key;
      frequencyCount += 1;
    }
    if (currentFrequencyKey !== '') addRawLine(frequencyBuffer, { key: currentFrequencyKey, count: frequencyCount });
    await flushRawBuffer(frequencyHandle, frequencyBuffer, state);
    await syncClose(frequencyHandle);

    const frequency = new Map<string, number>();
    for await (const row of jsonRows(frequencyPath)) {
      if (typeof row.key !== 'string' || typeof row.count !== 'number') throw new Error('frequency_row_invalid');
      frequency.set(row.key, row.count);
      if (frequency.size * 96 > policy.maxHeapBytes) throw new ResourceLimitError('max_heap_bytes_exceeded');
    }
    for (const key of [...frequency.keys()].sort(compare)) distribution.update(`${key}\u0000${frequency.get(key)!}\n`);
    const order = new Map<string, number>();
    [...frequency.keys()].sort((left, right) => (frequency.get(left)! - frequency.get(right)!) || compare(left, right))
      .forEach((key, index) => order.set(key, index));

    const postingsRaw = join(tempRoot, 'raw', 'postings.jsonl');
    const postingsHandle = await open(postingsRaw, 'wx', 0o600);
    const postingsBuffer: string[] = [];
    for await (const row of jsonRows(join(tempRoot, 'units.jsonl'))) {
      const unit = row as unknown as NormalizedUnit;
      const ordered = [...unit.shingles].sort((left, right) => (order.get(`${unit.language}\u0000${left}`)! - order.get(`${unit.language}\u0000${right}`)!) || compare(left, right));
      for (const shingle of ordered.slice(0, prefixLength(ordered.length))) {
        addRawLine(postingsBuffer, { key: `${unit.language}\u0000${shingle}`, candidateUnitId: unit.candidateUnitId });
        if (postingsBuffer.length >= 1024) await flushRawBuffer(postingsHandle, postingsBuffer, state);
      }
    }
    await flushRawBuffer(postingsHandle, postingsBuffer, state);
    await syncClose(postingsHandle);

    const sortedPostings = join(tempRoot, 'sorted-postings.jsonl');
    await sortJsonlFile(postingsRaw, sortedPostings, join(tempRoot, 'runs', 'postings'), (row) => `${String(row.key)}\u0000${String(row.candidateUnitId)}`, runLimits, state);
    const postingWriter = new ShardWriter<Record<string, unknown>>(root, 'postings', 'posting', policy.maxShardBytes, state);
    const pairsRaw = join(tempRoot, 'raw', 'pairs.jsonl');
    const pairsHandle = await open(pairsRaw, 'wx', 0o600);
    const pairsBuffer: string[] = [];
    let postingGroupKey = '';
    let postingGroup: string[] = [];
    const flushPostingGroup = async (): Promise<void> => {
      for (let left = 0; left < postingGroup.length; left += 1) {
        for (let right = left + 1; right < postingGroup.length; right += 1) {
          if (state.workBytes > policy.maxWorkBytes - 256) throw new ResourceLimitError('max_work_bytes_exceeded');
          const first = postingGroup[left]! < postingGroup[right]! ? postingGroup[left]! : postingGroup[right]!;
          const second = first === postingGroup[left]! ? postingGroup[right]! : postingGroup[left]!;
          addRawLine(pairsBuffer, { leftCandidateUnitId: first, rightCandidateUnitId: second, sharedPrefixShingles: 1 });
          if (pairsBuffer.length >= 1024) await flushRawBuffer(pairsHandle, pairsBuffer, state);
        }
      }
      postingGroup = [];
    };
    for await (const row of jsonRows(sortedPostings)) {
      const key = typeof row.key === 'string' ? row.key : '';
      const id = typeof row.candidateUnitId === 'string' ? row.candidateUnitId : '';
      if (key !== postingGroupKey && postingGroupKey !== '') await flushPostingGroup();
      if (key !== postingGroupKey) postingGroupKey = key;
      if (id !== '') postingGroup.push(id);
      if (postingGroup.length * 64 > policy.maxHeapBytes / 2) throw new ResourceLimitError('max_heap_bytes_exceeded');
      await postingWriter.write(row, `${key}\u0000${id}`);
    }
    await flushPostingGroup();
    await flushRawBuffer(pairsHandle, pairsBuffer, state);
    await syncClose(pairsHandle);
    const postingShards = await postingWriter.close();
    await recordCheckpoint('postings', [], postingShards.map((receipt) => receipt.sha256));

    const sortedPairs = join(tempRoot, 'sorted-pairs.jsonl');
    await sortJsonlFile(pairsRaw, sortedPairs, join(tempRoot, 'runs', 'pairs'), (row) => `${String(row.leftCandidateUnitId)}\u0000${String(row.rightCandidateUnitId)}`, runLimits, state);
    const pairWriter = new ShardWriter<Record<string, unknown>>(root, 'pairs', 'pair', policy.maxShardBytes, state);
    const edgeRaw = join(tempRoot, 'raw', 'edges.jsonl');
    const edgeHandle = await open(edgeRaw, 'wx', 0o600);
    const edgeBuffer: string[] = [];
    const unitsReadHandle = await open(join(tempRoot, 'units.jsonl'), 'r');
    state.maxOpenFiles = Math.max(state.maxOpenFiles, 2);
    const getUnit = async (id: string): Promise<NormalizedUnit> => {
      const reference = references.get(id);
      if (reference === undefined) throw new Error('unknown_candidate_unit');
      return readUnitAt(unitsReadHandle, reference);
    };
    const writeEdge = async (edge: AdmissionOverlapEdgeRowV1): Promise<void> => {
      addRawLine(edgeBuffer, edge);
      if (edgeBuffer.length >= 512) await flushRawBuffer(edgeHandle, edgeBuffer, state);
    };
    let pairLeft = '';
    let pairRight = '';
    let pairShared = 0;
    const flushPair = async (): Promise<void> => {
      if (pairLeft === '') return;
      await pairWriter.write({
        leftCandidateUnitId: pairLeft,
        rightCandidateUnitId: pairRight,
        sharedPrefixShingles: pairShared,
      }, `${pairLeft}\u0000${pairRight}`);
      const leftRef = references.get(pairLeft);
      const rightRef = references.get(pairRight);
      if (leftRef === undefined || rightRef === undefined) throw new Error('pair_reference_missing');
      const left = await getUnit(pairLeft);
      const right = await getUnit(pairRight);
      const leftCount = left.shingles.length;
      const rightCount = right.shingles.length;
      if (isAdmissionOverlapSizeCompatible(leftCount, rightCount)) {
        const similarity = exactSimilarity(left.shingles, right.shingles);
        if (left.contentSha256 !== right.contentSha256 && isAdmissionOverlapJaccardAtLeast80(similarity.intersection, similarity.union)) {
          await writeEdge(normalizedEdge(left, right, 'near'));
        }
      }
      pairLeft = '';
      pairRight = '';
      pairShared = 0;
    };
    for await (const row of jsonRows(sortedPairs)) {
      const left = typeof row.leftCandidateUnitId === 'string' ? row.leftCandidateUnitId : '';
      const right = typeof row.rightCandidateUnitId === 'string' ? row.rightCandidateUnitId : '';
      if (left !== pairLeft || right !== pairRight) {
        await flushPair();
        pairLeft = left;
        pairRight = right;
      }
      pairShared += typeof row.sharedPrefixShingles === 'number' ? row.sharedPrefixShingles : 0;
    }
    await flushPair();
    const candidatePairShards = await pairWriter.close();
    await recordCheckpoint('candidate_pairs', postingShards.map((receipt) => receipt.sha256), candidatePairShards.map((receipt) => receipt.sha256));

    const contentSorted = join(tempRoot, 'sorted-content.jsonl');
    await sortJsonlFile(join(tempRoot, 'raw', 'content.jsonl'), contentSorted, join(tempRoot, 'runs', 'content'), (row) => `${String(row.key)}\u0000${String(row.candidateUnitId)}`, runLimits, state);
    let contentKey = '';
    let contentGroup: string[] = [];
    const flushContentGroup = async (): Promise<void> => {
      for (let left = 0; left < contentGroup.length; left += 1) {
        for (let right = left + 1; right < contentGroup.length; right += 1) {
          const first = contentGroup[left]! < contentGroup[right]! ? contentGroup[left]! : contentGroup[right]!;
          const second = first === contentGroup[left]! ? contentGroup[right]! : contentGroup[left]!;
          await writeEdge(normalizedEdge(await getUnit(first), await getUnit(second), 'exact'));
        }
      }
      contentGroup = [];
    };
    for await (const row of jsonRows(contentSorted)) {
      const key = typeof row.key === 'string' ? row.key : '';
      const id = typeof row.candidateUnitId === 'string' ? row.candidateUnitId : '';
      if (key !== contentKey && contentKey !== '') await flushContentGroup();
      if (key !== contentKey) contentKey = key;
      if (id !== '') contentGroup.push(id);
      if (contentGroup.length * 64 > policy.maxHeapBytes / 2) throw new ResourceLimitError('max_heap_bytes_exceeded');
    }
    await flushContentGroup();
    await flushRawBuffer(edgeHandle, edgeBuffer, state);
    await syncClose(edgeHandle);
    await unitsReadHandle.close();

    const sortedEdges = join(tempRoot, 'sorted-edges.jsonl');
    await sortJsonlFile(edgeRaw, sortedEdges, join(tempRoot, 'runs', 'edges'), (row) => edgeKey(String(row.leftCandidateUnitId), String(row.rightCandidateUnitId), String(row.kind)), runLimits, state);
    const edgeWriter = new ShardWriter<AdmissionOverlapEdgeRowV1>(root, 'edges', 'edge', policy.maxShardBytes, state);
    const adjacencyRaw = join(tempRoot, 'raw', 'adjacency.jsonl');
    const adjacencyHandle = await open(adjacencyRaw, 'wx', 0o600);
    const adjacencyBuffer: string[] = [];
    const exactSets = new DisjointSet(references.keys());
    const nearSets = new DisjointSet(references.keys());
    let edgeCount = 0;
    let crossSideEdgeCount = 0;
    for await (const row of jsonRows(sortedEdges)) {
      const edge = row as unknown as AdmissionOverlapEdgeRowV1;
      const edgeHash = calibrationAdmissionOverlapEdgeRowSha256(edge);
      await edgeWriter.write(edge, edgeKey(edge.leftCandidateUnitId, edge.rightCandidateUnitId, edge.kind));
      const leftAdj: AdmissionOverlapAdjacencyRowV1 = {
        candidateUnitId: edge.leftCandidateUnitId,
        neighborCandidateUnitId: edge.rightCandidateUnitId,
        edgeRowSha256: edgeHash,
        kind: edge.kind,
      };
      const rightAdj: AdmissionOverlapAdjacencyRowV1 = {
        candidateUnitId: edge.rightCandidateUnitId,
        neighborCandidateUnitId: edge.leftCandidateUnitId,
        edgeRowSha256: edgeHash,
        kind: edge.kind,
      };
      addRawLine(adjacencyBuffer, leftAdj);
      addRawLine(adjacencyBuffer, rightAdj);
      if (adjacencyBuffer.length >= 512) await flushRawBuffer(adjacencyHandle, adjacencyBuffer, state);
      if (edge.kind === 'exact') exactSets.union(edge.leftCandidateUnitId, edge.rightCandidateUnitId);
      else nearSets.union(edge.leftCandidateUnitId, edge.rightCandidateUnitId);
      edgeCount += 1;
      if (edge.crossSide) crossSideEdgeCount += 1;
    }
    await flushRawBuffer(adjacencyHandle, adjacencyBuffer, state);
    await syncClose(adjacencyHandle);
    const edgeShards = await edgeWriter.close();
    await recordCheckpoint('exact_edges', candidatePairShards.map((receipt) => receipt.sha256), edgeShards.map((receipt) => receipt.sha256));

    const sortedAdjacency = join(tempRoot, 'sorted-adjacency.jsonl');
    await sortJsonlFile(adjacencyRaw, sortedAdjacency, join(tempRoot, 'runs', 'adjacency'), (row) => `${String(row.candidateUnitId)}\u0000${String(row.neighborCandidateUnitId)}\u0000${String(row.kind)}`, runLimits, state);
    const adjacencyWriter = new ShardWriter<AdmissionOverlapAdjacencyRowV1>(root, 'adjacency', 'adjacency', policy.maxShardBytes, state);
    let adjacencyRowCount = 0;
    for await (const row of jsonRows(sortedAdjacency)) {
      await adjacencyWriter.write(row as unknown as AdmissionOverlapAdjacencyRowV1, `${String(row.candidateUnitId)}\u0000${String(row.neighborCandidateUnitId)}\u0000${String(row.kind)}`);
      adjacencyRowCount += 1;
    }
    const adjacencyShards = await adjacencyWriter.close();

    const membershipsRaw = join(tempRoot, 'raw', 'memberships.jsonl');
    const membershipsHandle = await open(membershipsRaw, 'wx', 0o600);
    const membershipsBuffer: string[] = [];
    for (const id of [...references.keys()].sort(compare)) {
      const reference = references.get(id)!;
      for (const [kind, sets] of [['exact', exactSets], ['near', nearSets] ] as const) {
        const clusterId = `${kind}-${sets.find(id)}`;
        const membership: AdmissionOverlapClusterMembershipRowV1 = { kind, clusterId, candidateUnitId: id, overlapSide: reference.overlapSide };
        addRawLine(membershipsBuffer, { key: `${kind}\u0000${clusterId}\u0000${id}`, ...membership });
        if (membershipsBuffer.length >= 512) await flushRawBuffer(membershipsHandle, membershipsBuffer, state);
      }
    }
    await flushRawBuffer(membershipsHandle, membershipsBuffer, state);
    await syncClose(membershipsHandle);
    const sortedMemberships = join(tempRoot, 'sorted-memberships.jsonl');
    await sortJsonlFile(membershipsRaw, sortedMemberships, join(tempRoot, 'runs', 'memberships'), (row) => String(row.key), runLimits, state);
    const membershipWriter = new ShardWriter<AdmissionOverlapClusterMembershipRowV1>(root, 'clusters/memberships', 'membership', policy.maxShardBytes, state);
    const summaryWriter = new ShardWriter<AdmissionOverlapClusterSummaryRowV1>(root, 'clusters/summaries', 'summary', policy.maxShardBytes, state);
    let currentCluster = '';
    let currentKind: 'exact' | 'near' = 'exact';
    let currentMembers = 0;
    let currentSides: NormalizedUnit['overlapSide'][] = [];
    let membershipHash = createHash('sha256');
    let exactClusterCount = 0;
    let nearClusterCount = 0;
    const flushCluster = async (): Promise<void> => {
      if (currentCluster === '') return;
      const summary: AdmissionOverlapClusterSummaryRowV1 = {
        clusterId: currentCluster,
        kind: currentKind,
        canonicalCandidateUnitId: currentCluster.slice(currentKind.length + 1),
        memberCount: currentMembers,
        overlapSideSet: sortedSideSet(currentSides) as AdmissionOverlapClusterSummaryRowV1['overlapSideSet'],
        membershipRowsSha256: membershipHash.digest('hex'),
      };
      await summaryWriter.write(summary, currentCluster);
      if (currentKind === 'exact') exactClusterCount += 1;
      else nearClusterCount += 1;
      currentMembers = 0;
      currentSides = [];
      membershipHash = createHash('sha256');
    };
    for await (const row of jsonRows(sortedMemberships)) {
      const { key: _sortKey, ...membershipValue } = row;
      const membership = membershipValue as unknown as AdmissionOverlapClusterMembershipRowV1;
      if (membership.clusterId !== currentCluster || membership.kind !== currentKind) {
        await flushCluster();
        currentCluster = membership.clusterId;
        currentKind = membership.kind;
      }
      await membershipWriter.write(membership, `${membership.kind}\u0000${membership.clusterId}\u0000${membership.candidateUnitId}`);
      membershipHash.update(lineBytes(membership));
      currentMembers += 1;
      currentSides.push(membership.overlapSide);
    }
    await flushCluster();
    const clusterMembershipShards = await membershipWriter.close();
    const clusterSummaryShards = await summaryWriter.close();
    await recordCheckpoint(
      'clusters',
      edgeShards.map((receipt) => receipt.sha256),
      [
        ...postingShards,
        ...candidatePairShards,
        ...edgeShards,
        ...adjacencyShards,
        ...clusterSummaryShards,
        ...clusterMembershipShards,
      ].map((receipt) => receipt.sha256),
    );

    await verifyShards(root, postingShards, () => true, (row) => `${String(row.key)}\u0000${String(row.candidateUnitId)}`);
    await verifyShards(root, candidatePairShards, () => true, (row) => `${String(row.leftCandidateUnitId)}\u0000${String(row.rightCandidateUnitId)}`);
    await verifyShards(root, edgeShards, isCalibrationAdmissionOverlapEdgeRowV1, (row) => edgeKey(String(row.leftCandidateUnitId), String(row.rightCandidateUnitId), String(row.kind)));
    await verifyShards(root, adjacencyShards, isCalibrationAdmissionOverlapAdjacencyRowV1, (row) => `${String(row.candidateUnitId)}\u0000${String(row.neighborCandidateUnitId)}\u0000${String(row.kind)}`);
    await verifyShards(root, clusterSummaryShards, isCalibrationAdmissionOverlapClusterSummaryRowV1, (row) => String(row.clusterId));
    await verifyShards(root, clusterMembershipShards, isCalibrationAdmissionOverlapClusterMembershipRowV1, (row) => `${String(row.kind)}\u0000${String(row.clusterId)}\u0000${String(row.candidateUnitId)}`);
    updateResource(state);

    const complete = errors.length === 0 && unresolved.size === 0 && recordCount === expectedRecords
      && covered === expectedRecords && observedWithinLimits(state, policy);
    const indexBase: Omit<AdmissionOverlapIndexReceiptV1, 'receiptSha256'> = {
      version: 'v10.3-overlap-index-receipt-v1',
      universeSha256: universe.universeSha256,
      normalizerRegistrySha256: universe.normalizerRegistrySha256,
      overlapPolicySha256: policy.policySha256,
      method: 'prefix-filter-exact-jaccard-0.80-v1',
      postingShards: [...postingShards],
      candidatePairShards: [...candidatePairShards],
      checkpoints: [...completedCheckpoints],
      coveredCandidateUnits: covered,
      complete,
      toolReceiptSha256,
    };
    const indexReceipt: AdmissionOverlapIndexReceiptV1 = { ...indexBase, receiptSha256: calibrationAdmissionOverlapIndexReceiptSha256(indexBase) };
    const ledgerBase: Omit<AdmissionOverlapLedgerV1, 'ledgerSha256'> = {
      version: 'v10.3-admission-overlap-v1',
      universeSha256: universe.universeSha256,
      method: 'prefix-filter-exact-jaccard-0.80-v1',
      normalizerRegistrySha256: universe.normalizerRegistrySha256,
      overlapPolicySha256: policy.policySha256,
      indexReceiptSha256: indexReceipt.receiptSha256,
      coverageComplete: complete,
      unresolvedCandidateUnitIds: [...unresolved].sort(compare),
      edgeShards: [...edgeShards],
      adjacencyShards: [...adjacencyShards],
      clusterSummaryShards: [...clusterSummaryShards],
      clusterMembershipShards: [...clusterMembershipShards],
      edgeCount,
      adjacencyRowCount,
      exactClusterCount,
      nearClusterCount,
      crossSideEdgeCount,
    };
    const ledger: AdmissionOverlapLedgerV1 = { ...ledgerBase, ledgerSha256: calibrationAdmissionOverlapLedgerSha256(ledgerBase) };
    const observed = {
      maxUnitBytes: state.maxUnitBytes,
      maxHeapBytes: state.maxHeapBytes,
      maxRssBytes: state.maxRssBytes,
      maxWorkBytes: state.workBytes,
      maxOpenFiles: state.maxOpenFiles,
      maxShardBytes: state.maxShardBytes,
      wallMilliseconds: Date.now() - startedAt,
    };
    const withinAllLimits = !state.failed
      && observed.maxUnitBytes <= ADMISSION_OVERLAP_RESOURCE_LIMITS.maxUnitBytes
      && observed.maxHeapBytes <= ADMISSION_OVERLAP_RESOURCE_LIMITS.maxHeapBytes
      && observed.maxRssBytes <= ADMISSION_OVERLAP_RESOURCE_LIMITS.maxRssBytes
      && observed.maxWorkBytes <= ADMISSION_OVERLAP_RESOURCE_LIMITS.maxWorkBytes
      && observed.maxOpenFiles <= ADMISSION_OVERLAP_RESOURCE_LIMITS.maxOpenFiles
      && observed.maxShardBytes <= ADMISSION_OVERLAP_RESOURCE_LIMITS.maxShardBytes
      && observed.wallMilliseconds <= ADMISSION_OVERLAP_RESOURCE_LIMITS.maxWallMilliseconds;
    const resourceBase: Omit<AdmissionOverlapResourceReceiptV1, 'receiptId'> = {
      version: 'v10.3-overlap-resource-receipt-v1',
      universeSha256: universe.universeSha256,
      recordsJsonlSha256: universe.recordsJsonlSha256,
      overlapPolicySha256: policy.policySha256,
      realContentDistributionSha256: distribution.digest('hex'),
      recordCount,
      tokenCount,
      shingleCount,
      configuredLimits: { ...ADMISSION_OVERLAP_RESOURCE_LIMITS },
      observed,
      coverageComplete: complete,
      withinAllLimits,
      toolReceiptSha256,
    };
    const result: AdmissionOverlapBuildResult = {
      ledger,
      indexReceipt,
      resourceReceipt: { ...resourceBase, receiptId: calibrationAdmissionOverlapResourceReceiptId(resourceBase) },
      errors: [...new Set(errors)],
    };
    if (options.invocationIntentId !== undefined && complete && completedCheckpoints.at(-1)?.phase === 'clusters') {
      const sidecar: ResumeSidecar = {
        version: RESUME_RESULT_VERSION,
        checkpointSha256: completedCheckpoints.at(-1)!.checkpointSha256,
        result,
      };
      const directory = checkpointDirectory(root, options);
      await mkdir(directory, { recursive: true });
      await writeNoClobber(join(directory, 'result.json'), Buffer.from(`${canonicalJson(sidecar)}\n`, 'utf8'));
      await syncDirectory(directory);
    }
    return result;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    state.failed = true;
    return empty();
  } finally {
    for (const handle of [unitsHandle, contentHandle, shingleHandle]) {
      if (handle !== undefined) {
        try { await handle.close(); } catch { /* best effort close after a failed run */ }
      }
    }
    try { updateResource(state); } catch { state.failed = true; }
  }
}
