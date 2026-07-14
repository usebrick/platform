import { createHash } from 'node:crypto';
import { lstat, mkdir, open, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import {
  calibrationAdmissionOverlapPolicySha256,
  isCalibrationAdmissionOverlapPolicyV1,
  type AdmissionOverlapPolicyV1,
} from '@usebrick/core';

import { canonicalJson } from './canonical';

/**
 * The external-sort implementation in this file is deliberately a fixture
 * boundary.  It has no knowledge of a corpus, generation publication, or
 * recovery transaction.  Callers provide the work directory and the rows;
 * every output path is relative to that directory.
 */

export type AdmissionJsonRow = Record<string, unknown>;
export type AdmissionJsonRowInput =
  | Iterable<unknown>
  | AsyncIterable<unknown>;

export interface AdmissionBoundedShardReceiptV1 {
  /** Fixture-only receipt shape; this is not a Core schema or publication receipt. */
  readonly shardId: string;
  readonly pathBase: 'generation_local';
  readonly relativePath: string;
  readonly firstKey: string;
  readonly lastKey: string;
  readonly rowCount: number;
  readonly bytes: number;
  readonly sha256: string;
}

export interface AdmissionExternalSortResourceReceiptV1 {
  /** Fixture-only resource report; it must not be used as production evidence. */
  readonly version: 'v10.3-admission-external-sort-resource-fixture-v1';
  readonly configured: {
    readonly maxShardBytes: number;
    readonly maxOpenFiles: number;
    readonly maxWorkBytes: number;
  };
  readonly observed: {
    readonly maxShardBytes: number;
    readonly maxOpenFiles: number;
    readonly workBytes: number;
  };
  readonly incomplete: boolean;
  readonly withinAllLimits: boolean;
}

export interface AdmissionExternalSortOptions {
  readonly workDirectory: string;
  /** A scalar row field or a function that returns the stable sort key. */
  readonly key?: string | ((row: unknown) => string);
  /** Alias for key, useful when a caller wants to make the sort intent explicit. */
  readonly sortKey?: string | ((row: unknown) => string);
  /** Prefix for the contained shard directory/files. */
  readonly filePrefix?: string;
  /** The policy's 64 MiB limit is the default; tests may use a smaller value. */
  readonly maxShardBytes?: number;
  /** Tests may lower the policy's 64-file bound; this fixture uses one writer. */
  readonly maxOpenFiles?: number;
  /** Tests may lower the policy's 200 GiB work-directory bound. */
  readonly maxWorkBytes?: number;
  /** The fixture is intentionally single-worker, but accepts this explicit assertion. */
  readonly workerCount?: number;
  readonly workers?: number;
  readonly policy?: AdmissionOverlapPolicyV1;
}

export interface AdmissionExternalSortResult {
  readonly ok: boolean;
  readonly complete: boolean;
  readonly incomplete: boolean;
  readonly withinAllLimits: boolean;
  readonly workDirectory: string;
  readonly rowsRead: number;
  readonly rowsWritten: number;
  readonly bytesWritten: number;
  readonly maxShardBytes: number;
  readonly maxOpenFiles: number;
  readonly maxWorkBytes: number;
  readonly observedMaxOpenFiles: number;
  readonly shardReceipts: readonly AdmissionBoundedShardReceiptV1[];
  /** Alias retained for callers that name the output set `receipts`. */
  readonly receipts: readonly AdmissionBoundedShardReceiptV1[];
  readonly resourceReceipt: AdmissionExternalSortResourceReceiptV1;
  readonly errors: readonly string[];
}

interface SortEntry {
  readonly key: string;
  readonly json: string;
  readonly bytes: Buffer;
}

interface NormalizedLimits {
  readonly maxShardBytes: number;
  readonly maxOpenFiles: number;
  readonly maxWorkBytes: number;
}

const DEFAULT_POLICY_BASE: Omit<AdmissionOverlapPolicyV1, 'policySha256'> = {
  version: 'v10.3-admission-overlap-policy-v1',
  method: 'prefix-filter-exact-jaccard-0.80-v1',
  maxUnitBytes: 33_554_432,
  maxShardBytes: 67_108_864,
  maxOpenFiles: 64,
  maxHeapBytes: 4_294_967_296,
  maxRssBytes: 6_442_450_944,
  maxWorkBytes: 214_748_364_800,
  maxWallMilliseconds: 86_400_000,
};

/** Frozen policy materialized through Core's self-hash validator. */
export const DEFAULT_ADMISSION_OVERLAP_POLICY: AdmissionOverlapPolicyV1 = Object.freeze({
  ...DEFAULT_POLICY_BASE,
  policySha256: calibrationAdmissionOverlapPolicySha256(DEFAULT_POLICY_BASE),
});

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is AdmissionJsonRow {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asFinitePositiveInteger(value: number | undefined, fallback: number): number {
  return value === undefined ? fallback : value;
}

function normalizeLimits(
  options: AdmissionExternalSortOptions,
  policy: AdmissionOverlapPolicyV1,
): { readonly limits?: NormalizedLimits; readonly errors: readonly string[] } {
  const maxShardBytes = asFinitePositiveInteger(options.maxShardBytes, policy.maxShardBytes);
  const maxOpenFiles = asFinitePositiveInteger(options.maxOpenFiles, policy.maxOpenFiles);
  const maxWorkBytes = asFinitePositiveInteger(options.maxWorkBytes, policy.maxWorkBytes);
  const errors: string[] = [];
  if (!Number.isSafeInteger(maxShardBytes) || maxShardBytes < 1 || maxShardBytes > policy.maxShardBytes) {
    errors.push('max_shard_bytes_invalid');
  }
  if (!Number.isSafeInteger(maxOpenFiles) || maxOpenFiles < 0 || maxOpenFiles > policy.maxOpenFiles) {
    errors.push('max_open_files_invalid');
  }
  if (!Number.isSafeInteger(maxWorkBytes) || maxWorkBytes < 0 || maxWorkBytes > policy.maxWorkBytes) {
    errors.push('max_work_bytes_invalid');
  }
  return errors.length === 0
    ? { limits: { maxShardBytes, maxOpenFiles, maxWorkBytes }, errors }
    : { errors };
}

function emptyResult(
  workDirectory: string,
  limits: NormalizedLimits,
  errors: readonly string[],
  rowsRead = 0,
  rowsWritten = 0,
  bytesWritten = 0,
  receipts: readonly AdmissionBoundedShardReceiptV1[] = [],
  observedMaxOpenFiles = 0,
): AdmissionExternalSortResult {
  const incomplete = errors.length > 0;
  const withinAllLimits = !incomplete;
  const resourceReceipt: AdmissionExternalSortResourceReceiptV1 = {
    version: 'v10.3-admission-external-sort-resource-fixture-v1',
    configured: {
      maxShardBytes: limits.maxShardBytes,
      maxOpenFiles: limits.maxOpenFiles,
      maxWorkBytes: limits.maxWorkBytes,
    },
    observed: {
      maxShardBytes: receipts.reduce((maximum, receipt) => Math.max(maximum, receipt.bytes), 0),
      maxOpenFiles: observedMaxOpenFiles,
      workBytes: bytesWritten,
    },
    incomplete,
    withinAllLimits,
  };
  return {
    ok: !incomplete,
    complete: !incomplete,
    incomplete,
    withinAllLimits,
    workDirectory,
    rowsRead,
    rowsWritten,
    bytesWritten,
    maxShardBytes: limits.maxShardBytes,
    maxOpenFiles: limits.maxOpenFiles,
    maxWorkBytes: limits.maxWorkBytes,
    observedMaxOpenFiles,
    shardReceipts: receipts,
    receipts,
    resourceReceipt,
    errors: [...new Set(errors)],
  };
}

function keyFromRow(row: unknown, selector: AdmissionExternalSortOptions['key']): string {
  if (typeof selector === 'function') {
    const key = selector(row);
    if (typeof key !== 'string') throw new TypeError('sort key function must return a string');
    return key;
  }
  if (typeof selector === 'string') {
    if (!isRecord(row) || typeof row[selector] !== 'string') {
      throw new TypeError(`sort key field must be a string: ${selector}`);
    }
    return row[selector] as string;
  }
  if (isRecord(row) && typeof row.key === 'string') return row.key;
  // A canonical row is a safe deterministic fallback for fixture callers that
  // do not have a natural key. It also avoids silently dropping unknown rows.
  return canonicalJson(row);
}

function sortEntries(entries: readonly SortEntry[]): SortEntry[] {
  return [...entries].sort((left, right) => compareStrings(left.key, right.key)
    || compareStrings(left.json, right.json));
}

async function assertNoSymlinkPath(root: string, candidate: string): Promise<void> {
  const rootResolved = resolve(root);
  const candidateResolved = resolve(candidate);
  const relativePath = relative(rootResolved, candidateResolved);
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error('work_directory_containment_violation');
  }
  // Check the root itself and every existing descendant. `resolve()` is
  // lexical, so a symlinked work root must be rejected; fixed OS ancestors
  // such as macOS `/var` may legitimately be symlinks and are outside the
  // caller-owned containment boundary.
  try {
    if ((await lstat(rootResolved)).isSymbolicLink()) throw new Error('work_directory_symlink_component');
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
  }
  let current = rootResolved;
  for (const segment of relativePath.split(sep)) {
    if (!segment) continue;
    current = join(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error('work_directory_symlink_component');
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') break;
      throw error;
    }
  }
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

/**
 * Write bytes using O_EXCL. An exact pre-existing file is idempotently reused;
 * different bytes are a no-clobber conflict. Unknown files are never scanned
 * or removed by this fixture utility.
 */
async function writeNoClobber(path: string, bytes: Buffer, root: string): Promise<'written' | 'reused'> {
  await assertNoSymlinkPath(root, path);
  await mkdir(dirname(path), { recursive: true });
  await assertNoSymlinkPath(root, path);
  try {
    const handle = await open(path, 'wx', 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await syncDirectory(dirname(path));
    return 'written';
  } catch (error) {
    if ((error as { code?: string }).code !== 'EEXIST') throw error;
    await assertNoSymlinkPath(root, path);
    const existing = await readFile(path);
    if (!existing.equals(bytes)) throw new Error('no_clobber_conflict');
    return 'reused';
  }
}

function shardPath(prefix: string, index: number): string {
  return join('shards', prefix, `shard-${String(index).padStart(8, '0')}.jsonl`);
}

function validPrefix(value: string): boolean {
  return value !== '.' && value !== '..' && /^[A-Za-z0-9._-]+$/u.test(value) && value.length <= 64;
}

function receiptFor(
  prefix: string,
  index: number,
  relativePath: string,
  entries: readonly SortEntry[],
  bytes: Buffer,
): AdmissionBoundedShardReceiptV1 {
  return {
    shardId: `${prefix}-${String(index).padStart(8, '0')}`,
    pathBase: 'generation_local',
    relativePath,
    firstKey: entries[0]!.key,
    lastKey: entries[entries.length - 1]!.key,
    rowCount: entries.length,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  };
}

/**
 * Sort canonical JSON rows and emit deterministic bounded JSONL shards.
 *
 * This fixture intentionally keeps the input run in memory; the output and
 * resource gates mirror the later disk-backed authority while avoiding any
 * production-corpus, persistence, or recovery behavior in this slice.
 */
export async function externalSortAdmissionJsonRows(
  rows: AdmissionJsonRowInput,
  options: AdmissionExternalSortOptions,
): Promise<AdmissionExternalSortResult> {
  const workDirectory = resolve(options.workDirectory);
  const policy = options.policy ?? DEFAULT_ADMISSION_OVERLAP_POLICY;
  const policyValid = isCalibrationAdmissionOverlapPolicyV1(policy);
  const normalized = normalizeLimits(options, policyValid ? policy : DEFAULT_ADMISSION_OVERLAP_POLICY);
  const limits = normalized.limits ?? {
    maxShardBytes: policyValid ? policy.maxShardBytes : DEFAULT_ADMISSION_OVERLAP_POLICY.maxShardBytes,
    maxOpenFiles: policyValid ? policy.maxOpenFiles : DEFAULT_ADMISSION_OVERLAP_POLICY.maxOpenFiles,
    maxWorkBytes: policyValid ? policy.maxWorkBytes : DEFAULT_ADMISSION_OVERLAP_POLICY.maxWorkBytes,
  };
  const prefix = options.filePrefix ?? 'rows';
  if (!policyValid) return emptyResult(workDirectory, limits, ['overlap_policy_invalid']);
  if (normalized.errors.length > 0) return emptyResult(workDirectory, limits, normalized.errors);
  if (!validPrefix(prefix)) return emptyResult(workDirectory, limits, ['file_prefix_invalid']);
  if (options.workerCount !== undefined && options.workers !== undefined && options.workerCount !== options.workers) {
    return emptyResult(workDirectory, limits, ['worker_count_conflict']);
  }
  const workerCount = options.workerCount ?? options.workers ?? 1;
  if (!Number.isSafeInteger(workerCount) || workerCount !== 1) {
    return emptyResult(workDirectory, limits, ['fixture_requires_one_worker']);
  }

  try {
    await mkdir(workDirectory, { recursive: true });
    await assertNoSymlinkPath(workDirectory, workDirectory);
  } catch (error) {
    return emptyResult(workDirectory, limits, [error instanceof Error ? error.message : String(error)]);
  }

  const selector = options.key ?? options.sortKey;
  const entries: SortEntry[] = [];
  let rowsRead = 0;
  try {
    for await (const row of rows) {
      rowsRead += 1;
      let json: string;
      try {
        json = canonicalJson(row);
      } catch (error) {
        return emptyResult(workDirectory, limits, [
          'row_not_canonical_json',
          error instanceof Error ? error.message : String(error),
        ], rowsRead, 0, 0, [], 0);
      }
      let key: string;
      try {
        key = keyFromRow(row, selector);
      } catch (error) {
        return emptyResult(workDirectory, limits, [
          'sort_key_invalid',
          error instanceof Error ? error.message : String(error),
        ], rowsRead, 0, 0, [], 0);
      }
      const line = Buffer.from(`${json}\n`, 'utf8');
      if (line.byteLength > limits.maxShardBytes) {
        return emptyResult(workDirectory, limits, ['row_exceeds_max_shard_bytes'], rowsRead, 0, 0, [], 0);
      }
      entries.push({ key, json, bytes: line });
    }
  } catch (error) {
    return emptyResult(workDirectory, limits, [
      'row_stream_failed',
      error instanceof Error ? error.message : String(error),
    ], rowsRead, 0, 0, [], 0);
  }

  const sorted = sortEntries(entries);
  if (sorted.length === 0) return emptyResult(workDirectory, limits, [], rowsRead, 0, 0, [], 0);
  if (limits.maxOpenFiles < 1) {
    return emptyResult(workDirectory, limits, ['max_open_files_exceeded'], rowsRead, 0, 0, [], 0);
  }

  const receipts: AdmissionBoundedShardReceiptV1[] = [];
  let rowsWritten = 0;
  let bytesWritten = 0;
  let observedMaxOpenFiles = 0;
  let shardEntries: SortEntry[] = [];
  let shardBytes = 0;
  let shardIndex = 0;

  const flush = async (): Promise<string | undefined> => {
    if (shardEntries.length === 0) return undefined;
    if (bytesWritten + shardBytes > limits.maxWorkBytes) return 'max_work_bytes_exceeded';
    const bytes = Buffer.concat(shardEntries.map((entry) => entry.bytes));
    const relativePath = shardPath(prefix, shardIndex);
    const absolutePath = join(workDirectory, relativePath);
    await assertNoSymlinkPath(workDirectory, absolutePath);
    await writeNoClobber(absolutePath, bytes, workDirectory);
    const receipt = receiptFor(prefix, shardIndex, relativePath.split(sep).join('/'), shardEntries, bytes);
    receipts.push(receipt);
    rowsWritten += shardEntries.length;
    bytesWritten += bytes.byteLength;
    observedMaxOpenFiles = Math.max(observedMaxOpenFiles, 1);
    shardIndex += 1;
    shardEntries = [];
    shardBytes = 0;
    return undefined;
  };

  for (const entry of sorted) {
    if (shardEntries.length > 0 && shardBytes + entry.bytes.byteLength > limits.maxShardBytes) {
      try {
        const fault = await flush();
        if (fault) {
          return emptyResult(workDirectory, limits, [fault], rowsRead, rowsWritten, bytesWritten, receipts, observedMaxOpenFiles);
        }
      } catch (error) {
        return emptyResult(workDirectory, limits, [
          error instanceof Error ? error.message : String(error),
        ], rowsRead, rowsWritten, bytesWritten, receipts, observedMaxOpenFiles);
      }
    }
    shardEntries.push(entry);
    shardBytes += entry.bytes.byteLength;
  }
  try {
    const fault = await flush();
    if (fault) {
      return emptyResult(workDirectory, limits, [fault], rowsRead, rowsWritten, bytesWritten, receipts, observedMaxOpenFiles);
    }
  } catch (error) {
    return emptyResult(workDirectory, limits, [
      error instanceof Error ? error.message : String(error),
    ], rowsRead, rowsWritten, bytesWritten, receipts, observedMaxOpenFiles);
  }

  return emptyResult(workDirectory, limits, [], rowsRead, rowsWritten, bytesWritten, receipts, observedMaxOpenFiles);
}

/** Explicitly named aliases make the fixture boundary easy to consume. */
export const sortAndShardAdmissionJsonRows = externalSortAdmissionJsonRows;
export const buildAdmissionExternalSort = externalSortAdmissionJsonRows;
