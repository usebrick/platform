import { createHash } from 'node:crypto';

import { canonicalJson } from './canonical';

export const MATERIALIZATION_RECEIPT_FILENAME = '.slopbrick-materialization-receipt.v1.json';
export const MAX_MATERIALIZATION_ENTRIES = 100_000;
export const MAX_MATERIALIZATION_FILE_BYTES = 32 * 1024 * 1024;
export const MAX_MATERIALIZATION_TOTAL_FILE_BYTES = 1024 * 1024 * 1024;
export const MAX_MATERIALIZATION_TOTAL_PATH_BYTES = 64 * 1024 * 1024;
export const MAX_RECEIPT_BYTES = 146_117_987;
export const CACHE_REF_BYTES = 161;

export const MAX_ASSET_BYTES = 5 * 1024 ** 3;
export const MAX_PATH_BYTES = 4096;
export const MAX_SEGMENT_BYTES = 255;
export const MAX_DEPTH = 64;
const TREE_BASENAME_PATTERN = /^\.v103-tree-[0-9a-f]{32}$/;
const LOWER_SHA256_PATTERN = /^[0-9a-f]{64}$/;

export interface MaterializationDirectoryEntryV1 {
  readonly path: string;
  readonly kind: 'directory';
}

export interface MaterializationFileEntryV1 {
  readonly path: string;
  readonly kind: 'file';
  readonly bytes: number;
  readonly sha256: string;
}

export type MaterializationInventoryEntryV1 = MaterializationDirectoryEntryV1 | MaterializationFileEntryV1;

export interface MaterializationReceiptV1 {
  readonly receiptVersion: 'v1';
  readonly extractionPolicy: 'safe-zip-v1';
  readonly assetSha256: string;
  readonly assetBytes: number;
  readonly inventorySha256: string;
  readonly entries: readonly MaterializationInventoryEntryV1[];
}

export interface MaterializationCacheRefV1 {
  readonly version: 'v1';
  readonly treeBasename: string;
  readonly receiptSha256: string;
}

export interface CanonicalMaterializationDocument<T> {
  readonly value: T;
  readonly text: string;
  readonly byteLength: number;
  readonly sha256: string;
}

export type MaterializationCodecResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false };

interface MaterializationInventoryBudgetV1 {
  totalPathBytes: bigint;
  totalFileBytes: bigint;
}

interface NormalizedMaterializationEntriesV1 {
  readonly supplied: readonly MaterializationInventoryEntryV1[];
  readonly canonical: readonly MaterializationInventoryEntryV1[];
}

function valid<T>(value: T): MaterializationCodecResult<T> {
  return { ok: true, value };
}

function invalid<T>(): MaterializationCodecResult<T> {
  return { ok: false };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function snapshotRecord(value: unknown): Record<string, unknown> | undefined {
  try {
    if (!isRecord(value)) return undefined;
    const snapshot = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(value)) snapshot[key] = value[key];
    return snapshot;
  } catch {
    return undefined;
  }
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isSafeIntegerBetween(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= minimum
    && value <= maximum;
}

export function isMaterializationEntryCountV1(value: bigint): boolean {
  return value >= 0n && value <= BigInt(MAX_MATERIALIZATION_ENTRIES);
}

export function isMaterializationTotalPathBytesV1(value: bigint): boolean {
  return value >= 0n && value <= BigInt(MAX_MATERIALIZATION_TOTAL_PATH_BYTES);
}

export function isMaterializationTotalFileBytesV1(value: bigint): boolean {
  return value >= 0n && value <= BigInt(MAX_MATERIALIZATION_TOTAL_FILE_BYTES);
}

function asciiFold(value: string): string {
  let folded = '';
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    folded += String.fromCharCode(code >= 0x41 && code <= 0x5a ? code + 0x20 : code);
  }
  return folded;
}

function compareAscii(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

export function isCanonicalMaterializationPathV1(path: unknown): path is string {
  if (typeof path !== 'string' || path.length < 1 || path.length > MAX_PATH_BYTES) return false;
  if (path.startsWith('/') || path.endsWith('/') || path.includes('//') || path.includes('\\')) return false;
  for (let index = 0; index < path.length; index += 1) {
    const code = path.charCodeAt(index);
    if (code < 0x20 || code > 0x7e) return false;
  }
  const segments = path.split('/');
  if (segments.length > MAX_DEPTH || segments.some((segment) => (
    segment.length < 1
    || segment.length > MAX_SEGMENT_BYTES
    || segment === '.'
    || segment === '..'
  ))) return false;
  if (/^[A-Za-z]:/.test(segments[0]!)) return false;
  const foldedPath = asciiFold(path);
  const foldedReceiptPath = asciiFold(MATERIALIZATION_RECEIPT_FILENAME);
  return foldedPath !== foldedReceiptPath && !foldedPath.startsWith(`${foldedReceiptPath}/`);
}

function copyEntry(value: unknown): MaterializationInventoryEntryV1 | undefined {
  if (!isRecord(value) || typeof value.path !== 'string' || !isCanonicalMaterializationPathV1(value.path)) {
    return undefined;
  }
  if (value.kind === 'directory') {
    if (!hasExactKeys(value, ['path', 'kind'])) return undefined;
    return { path: value.path, kind: 'directory' };
  }
  if (value.kind === 'file') {
    if (!hasExactKeys(value, ['path', 'kind', 'bytes', 'sha256'])) return undefined;
    if (!isSafeIntegerBetween(value.bytes, 0, MAX_MATERIALIZATION_FILE_BYTES)) return undefined;
    if (typeof value.sha256 !== 'string' || !LOWER_SHA256_PATTERN.test(value.sha256)) return undefined;
    return { path: value.path, kind: 'file', bytes: value.bytes, sha256: value.sha256 };
  }
  return undefined;
}

function parentPaths(path: string): readonly string[] {
  const parts = path.split('/');
  const parents: string[] = [];
  for (let index = 1; index < parts.length; index += 1) parents.push(parts.slice(0, index).join('/'));
  return parents;
}

function addEntry(
  entries: Map<string, MaterializationInventoryEntryV1>,
  collisions: Map<string, string>,
  entry: MaterializationInventoryEntryV1,
  allowDirectoryDuplicate: boolean,
  budget: MaterializationInventoryBudgetV1,
): boolean {
  const folded = asciiFold(entry.path);
  const collision = collisions.get(folded);
  if (collision !== undefined && collision !== entry.path) return false;
  const existing = entries.get(entry.path);
  if (existing !== undefined) {
    return allowDirectoryDuplicate && existing.kind === 'directory' && entry.kind === 'directory';
  }
  const nextEntryCount = BigInt(entries.size) + 1n;
  const nextPathBytes = budget.totalPathBytes + BigInt(entry.path.length);
  const nextFileBytes = budget.totalFileBytes + BigInt(entry.kind === 'file' ? entry.bytes : 0);
  if (
    !isMaterializationEntryCountV1(nextEntryCount)
    || !isMaterializationTotalPathBytesV1(nextPathBytes)
    || !isMaterializationTotalFileBytesV1(nextFileBytes)
  ) return false;
  collisions.set(folded, entry.path);
  entries.set(entry.path, entry);
  budget.totalPathBytes = nextPathBytes;
  budget.totalFileBytes = nextFileBytes;
  return true;
}

function normalizeEntries(input: unknown): NormalizedMaterializationEntriesV1 | undefined {
  let length: number;
  try {
    if (!Array.isArray(input)) return undefined;
    length = input.length;
  } catch {
    return undefined;
  }
  if (
    !Number.isSafeInteger(length)
    || length < 0
    || length > MAX_MATERIALIZATION_ENTRIES
  ) return undefined;
  const entries = new Map<string, MaterializationInventoryEntryV1>();
  const collisions = new Map<string, string>();
  const budget: MaterializationInventoryBudgetV1 = { totalPathBytes: 0n, totalFileBytes: 0n };
  const supplied: MaterializationInventoryEntryV1[] = [];
  let hasFile = false;

  for (let index = 0; index < length; index += 1) {
    let candidate: unknown;
    try {
      candidate = input[index];
    } catch {
      return undefined;
    }
    const entry = copyEntry(snapshotRecord(candidate));
    if (entry === undefined) return undefined;
    supplied.push(entry);
    for (const parent of parentPaths(entry.path)) {
      if (!addEntry(entries, collisions, { path: parent, kind: 'directory' }, true, budget)) return undefined;
    }
    if (!addEntry(entries, collisions, entry, entry.kind === 'directory', budget)) return undefined;
    if (entry.kind === 'file') hasFile = true;
  }

  if (!hasFile) return undefined;

  return {
    supplied,
    canonical: [...entries.values()].sort((left, right) => compareAscii(left.path, right.path)),
  };
}

function entriesEqual(
  left: readonly MaterializationInventoryEntryV1[],
  right: readonly MaterializationInventoryEntryV1[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => {
    const other = right[index];
    if (!other || entry.path !== other.path || entry.kind !== other.kind) return false;
    return entry.kind === 'directory'
      || (other.kind === 'file' && entry.bytes === other.bytes && entry.sha256 === other.sha256);
  });
}

function inventorySha256(entries: readonly MaterializationInventoryEntryV1[]): string {
  const hash = createHash('sha256');
  hash.update('[');
  for (let index = 0; index < entries.length; index += 1) {
    if (index > 0) hash.update(',');
    hash.update(canonicalJson(entries[index]));
  }
  hash.update(']');
  return hash.digest('hex');
}

function canonicalEntriesByteLength(entries: readonly MaterializationInventoryEntryV1[]): number {
  let length = 2 + Math.max(0, entries.length - 1);
  for (const entry of entries) length += Buffer.byteLength(canonicalJson(entry), 'utf8');
  return length;
}

function snapshotCanonicalReceiptV1(value: unknown): MaterializationReceiptV1 | undefined {
  const snapshot = snapshotRecord(value);
  if (!snapshot || !hasExactKeys(snapshot, [
    'receiptVersion',
    'extractionPolicy',
    'assetSha256',
    'assetBytes',
    'inventorySha256',
    'entries',
  ])) return undefined;
  if (snapshot.receiptVersion !== 'v1' || snapshot.extractionPolicy !== 'safe-zip-v1') return undefined;
  if (typeof snapshot.assetSha256 !== 'string' || !LOWER_SHA256_PATTERN.test(snapshot.assetSha256)) return undefined;
  if (!isSafeIntegerBetween(snapshot.assetBytes, 1, MAX_ASSET_BYTES)) return undefined;
  if (typeof snapshot.inventorySha256 !== 'string' || !LOWER_SHA256_PATTERN.test(snapshot.inventorySha256)) {
    return undefined;
  }
  const normalized = normalizeEntries(snapshot.entries);
  if (!normalized || !entriesEqual(normalized.supplied, normalized.canonical)) return undefined;
  if (inventorySha256(normalized.canonical) !== snapshot.inventorySha256) return undefined;
  return {
    receiptVersion: 'v1',
    extractionPolicy: 'safe-zip-v1',
    assetSha256: snapshot.assetSha256,
    assetBytes: snapshot.assetBytes,
    inventorySha256: snapshot.inventorySha256,
    entries: normalized.canonical,
  };
}

export function buildMaterializationReceiptV1(input: {
  readonly assetSha256: string;
  readonly assetBytes: number;
  readonly entries: readonly MaterializationInventoryEntryV1[];
}): MaterializationCodecResult<MaterializationReceiptV1> {
  const snapshot = snapshotRecord(input);
  if (!snapshot || !hasExactKeys(snapshot, ['assetSha256', 'assetBytes', 'entries'])) return invalid();
  if (typeof snapshot.assetSha256 !== 'string' || !LOWER_SHA256_PATTERN.test(snapshot.assetSha256)) return invalid();
  if (!isSafeIntegerBetween(snapshot.assetBytes, 1, MAX_ASSET_BYTES)) return invalid();
  const normalized = normalizeEntries(snapshot.entries);
  if (!normalized) return invalid();
  const entries = normalized.canonical;
  return valid({
    receiptVersion: 'v1',
    extractionPolicy: 'safe-zip-v1',
    assetSha256: snapshot.assetSha256,
    assetBytes: snapshot.assetBytes,
    inventorySha256: inventorySha256(entries),
    entries,
  });
}

export function isMaterializationReceiptByteLengthV1(value: bigint): boolean {
  return value >= 1n && value <= BigInt(MAX_RECEIPT_BYTES);
}

export function isMaterializationCacheRefByteLengthV1(value: bigint): boolean {
  return value === BigInt(CACHE_REF_BYTES);
}

function snapshotCanonicalInputBytes(
  value: unknown,
  acceptsLength: (length: bigint) => boolean,
): Uint8Array | undefined {
  try {
    if (!ArrayBuffer.isView(value) || !(value instanceof Uint8Array)) return undefined;
    const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
    const byteLengthGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength')?.get;
    const byteOffsetGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteOffset')?.get;
    const bufferGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer')?.get;
    if (!byteLengthGetter || !byteOffsetGetter || !bufferGetter) return undefined;
    const byteLength = byteLengthGetter.call(value) as number;
    if (!Number.isSafeInteger(byteLength) || !acceptsLength(BigInt(byteLength))) return undefined;
    const byteOffset = byteOffsetGetter.call(value) as number;
    const buffer = bufferGetter.call(value) as ArrayBufferLike;
    return Buffer.from(new Uint8Array(buffer, byteOffset, byteLength));
  } catch {
    return undefined;
  }
}

function receiptByteLengthBeforeRender(receipt: MaterializationReceiptV1): number {
  const emptyEntriesText = canonicalJson({ ...receipt, entries: [] });
  return Buffer.byteLength(emptyEntriesText, 'utf8') - 2
    + canonicalEntriesByteLength(receipt.entries)
    + 1;
}

export function renderMaterializationReceiptV1(
  receipt: MaterializationReceiptV1,
): MaterializationCodecResult<CanonicalMaterializationDocument<MaterializationReceiptV1>> {
  const snapshot = snapshotCanonicalReceiptV1(receipt);
  if (!snapshot) return invalid();
  const measuredBytes = receiptByteLengthBeforeRender(snapshot);
  if (measuredBytes > MAX_RECEIPT_BYTES) return invalid();
  let text: string;
  try {
    text = `${canonicalJson(snapshot)}\n`;
  } catch {
    return invalid();
  }
  const byteLength = Buffer.byteLength(text, 'utf8');
  if (byteLength !== measuredBytes || !isMaterializationReceiptByteLengthV1(BigInt(byteLength))) return invalid();
  return valid({
    value: snapshot,
    text,
    byteLength,
    sha256: createHash('sha256').update(text, 'utf8').digest('hex'),
  });
}

function decodeCanonicalInput(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

export function parseCanonicalMaterializationReceiptV1(
  bytes: Uint8Array,
): MaterializationCodecResult<CanonicalMaterializationDocument<MaterializationReceiptV1>> {
  const snapshot = snapshotCanonicalInputBytes(bytes, isMaterializationReceiptByteLengthV1);
  if (!snapshot) return invalid();
  const text = decodeCanonicalInput(snapshot);
  if (!text || !text.endsWith('\n') || text.endsWith('\n\n') || text.endsWith('\r\n')) return invalid();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(0, -1));
  } catch {
    return invalid();
  }
  const receipt = snapshotCanonicalReceiptV1(parsed);
  if (!receipt) return invalid();
  const rendered = renderMaterializationReceiptV1(receipt);
  return rendered.ok && rendered.value.text === text ? rendered : invalid();
}

function isCacheRefShape(value: unknown): value is MaterializationCacheRefV1 {
  return isRecord(value)
    && hasExactKeys(value, ['version', 'treeBasename', 'receiptSha256'])
    && value.version === 'v1'
    && typeof value.treeBasename === 'string'
    && TREE_BASENAME_PATTERN.test(value.treeBasename)
    && typeof value.receiptSha256 === 'string'
    && LOWER_SHA256_PATTERN.test(value.receiptSha256);
}

export function buildMaterializationCacheRefV1(input: {
  readonly treeBasename: string;
  readonly receiptSha256: string;
}): MaterializationCodecResult<MaterializationCacheRefV1> {
  const snapshot = snapshotRecord(input);
  if (!snapshot || !hasExactKeys(snapshot, ['treeBasename', 'receiptSha256'])) return invalid();
  const reference: unknown = {
    version: 'v1',
    treeBasename: snapshot.treeBasename,
    receiptSha256: snapshot.receiptSha256,
  };
  return isCacheRefShape(reference) ? valid(reference) : invalid();
}

export function renderMaterializationCacheRefV1(
  reference: MaterializationCacheRefV1,
): MaterializationCodecResult<CanonicalMaterializationDocument<MaterializationCacheRefV1>> {
  const snapshot = snapshotRecord(reference);
  if (!snapshot || !isCacheRefShape(snapshot)) return invalid();
  let text: string;
  try {
    text = `${canonicalJson(snapshot)}\n`;
  } catch {
    return invalid();
  }
  const byteLength = Buffer.byteLength(text, 'utf8');
  if (byteLength !== CACHE_REF_BYTES) return invalid();
  return valid({
    value: snapshot,
    text,
    byteLength,
    sha256: createHash('sha256').update(text, 'utf8').digest('hex'),
  });
}

export function parseCanonicalMaterializationCacheRefV1(
  bytes: Uint8Array,
): MaterializationCodecResult<CanonicalMaterializationDocument<MaterializationCacheRefV1>> {
  const snapshot = snapshotCanonicalInputBytes(bytes, isMaterializationCacheRefByteLengthV1);
  if (!snapshot) return invalid();
  const text = decodeCanonicalInput(snapshot);
  if (!text || !text.endsWith('\n') || text.endsWith('\r\n')) return invalid();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(0, -1));
  } catch {
    return invalid();
  }
  if (!isCacheRefShape(parsed)) return invalid();
  const rendered = renderMaterializationCacheRefV1(parsed);
  return rendered.ok && rendered.value.text === text ? rendered : invalid();
}
