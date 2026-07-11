import { createHash } from 'node:crypto';
import { Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { inspect as nodeInspect } from 'node:util';
import { createInflateRaw } from 'node:zlib';
import * as yauzl from 'yauzl';

import {
  MATERIALIZATION_RECEIPT_FILENAME,
  MAX_ASSET_BYTES as MAX_MATERIALIZATION_ASSET_BYTES,
  MAX_DEPTH as MAX_MATERIALIZATION_DEPTH,
  MAX_MATERIALIZATION_ENTRIES,
  MAX_MATERIALIZATION_FILE_BYTES,
  MAX_MATERIALIZATION_TOTAL_FILE_BYTES,
  MAX_MATERIALIZATION_TOTAL_PATH_BYTES,
  MAX_PATH_BYTES as MAX_MATERIALIZATION_PATH_BYTES,
  MAX_SEGMENT_BYTES as MAX_MATERIALIZATION_SEGMENT_BYTES,
  isCanonicalMaterializationPathV1,
} from './materialization-receipt';

export const MAX_ENTRIES = MAX_MATERIALIZATION_ENTRIES;
export const MAX_ARCHIVE_BYTES = MAX_MATERIALIZATION_ASSET_BYTES;
export const MAX_FILE_BYTES = MAX_MATERIALIZATION_FILE_BYTES;
export const MAX_TOTAL_UNCOMPRESSED_BYTES = MAX_MATERIALIZATION_TOTAL_FILE_BYTES;
export const MAX_RATIO = 200;
export const MAX_PATH_BYTES = MAX_MATERIALIZATION_PATH_BYTES;
export const MAX_SEGMENT_BYTES = MAX_MATERIALIZATION_SEGMENT_BYTES;
export const MAX_DEPTH = MAX_MATERIALIZATION_DEPTH;
export const MAX_TOTAL_PATH_BYTES = MAX_MATERIALIZATION_TOTAL_PATH_BYTES;
export const MAX_EXTRA_FIELD_BYTES = 1024;
export const POSITIONAL_READ_CHUNK_BYTES = 64 * 1024;

const EOCD_SIGNATURE = 0x0605_4b50;
const ZIP64_EOCD_SIGNATURE = 0x0606_4b50;
const ZIP64_LOCATOR_SIGNATURE = 0x0706_4b50;
const CENTRAL_HEADER_SIGNATURE = 0x0201_4b50;
const LOCAL_HEADER_SIGNATURE = 0x0403_4b50;
const DATA_DESCRIPTOR_SIGNATURE = 0x0807_4b50;
const CLASSIC_COUNT_SENTINEL = 0xffff;
const CLASSIC_SIZE_SENTINEL = 0xffff_ffff;
const EOCD_BYTES = 22;
const ZIP64_EOCD_BYTES = 56;
const ZIP64_LOCATOR_BYTES = 20;
const CENTRAL_HEADER_BYTES = 46;
const LOCAL_HEADER_BYTES = 30;
const SIGNED_DESCRIPTOR_BYTES = 16;
const MAX_EOCD_SEARCH_BYTES = EOCD_BYTES + CLASSIC_COUNT_SENTINEL;
const RESERVED_RECEIPT_PATH = MATERIALIZATION_RECEIPT_FILENAME;
const S_IFMT = 0o170000;
const S_IFDIR = 0o040000;
const S_IFREG = 0o100000;
const DOS_VOLUME = 0x08;
const DOS_DIRECTORY = 0x10;
const DOS_DEVICE = 0x40;
const DOS_RESERVED = 0x80;
const ALLOWED_STORED_FLAGS = 0x0008 | 0x0800;
const ALLOWED_DEFLATE_FLAGS = 0x0002 | 0x0004 | 0x0008 | 0x0800;
const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let state = value;
  for (let bit = 0; bit < 8; bit += 1) {
    state = (state >>> 1) ^ (state & 1 ? 0xedb8_8320 : 0);
  }
  return state >>> 0;
});

export type SafeZipErrorCode =
  | 'ERR_SAFE_ZIP_ARGUMENT'
  | 'ERR_SAFE_ZIP_PLATFORM'
  | 'ERR_SAFE_ZIP_CACHE_UNTRUSTED'
  | 'ERR_SAFE_ZIP_ARCHIVE_INVALID'
  | 'ERR_SAFE_ZIP_ARCHIVE_MUTATED'
  | 'ERR_SAFE_ZIP_ENTRY_NAME'
  | 'ERR_SAFE_ZIP_ENTRY_COLLISION'
  | 'ERR_SAFE_ZIP_ENTRY_TYPE'
  | 'ERR_SAFE_ZIP_ENTRY_METADATA'
  | 'ERR_SAFE_ZIP_ENTRY_LIMIT'
  | 'ERR_SAFE_ZIP_ENTRY_RATIO'
  | 'ERR_SAFE_ZIP_STREAM'
  | 'ERR_SAFE_ZIP_RECEIPT'
  | 'ERR_SAFE_ZIP_TREE'
  | 'ERR_SAFE_ZIP_PUBLICATION';

const ERROR_MESSAGES: Readonly<Record<SafeZipErrorCode, string>> = {
  ERR_SAFE_ZIP_ARGUMENT: 'Safe ZIP validation failed: argument is invalid',
  ERR_SAFE_ZIP_PLATFORM: 'Safe ZIP validation failed: platform is unsupported',
  ERR_SAFE_ZIP_CACHE_UNTRUSTED: 'Safe ZIP validation failed: cache directory is not private',
  ERR_SAFE_ZIP_ARCHIVE_INVALID: 'Safe ZIP validation failed: archive container is invalid',
  ERR_SAFE_ZIP_ARCHIVE_MUTATED: 'Safe ZIP validation failed: archive changed during validation',
  ERR_SAFE_ZIP_ENTRY_NAME: 'Safe ZIP validation failed: entry name is invalid',
  ERR_SAFE_ZIP_ENTRY_COLLISION: 'Safe ZIP validation failed: entry paths collide',
  ERR_SAFE_ZIP_ENTRY_TYPE: 'Safe ZIP validation failed: entry type is forbidden',
  ERR_SAFE_ZIP_ENTRY_METADATA: 'Safe ZIP validation failed: entry metadata is invalid',
  ERR_SAFE_ZIP_ENTRY_LIMIT: 'Safe ZIP validation failed: entry limit was exceeded',
  ERR_SAFE_ZIP_ENTRY_RATIO: 'Safe ZIP validation failed: compression ratio was exceeded',
  ERR_SAFE_ZIP_STREAM: 'Safe ZIP validation failed: archive stream failed',
  ERR_SAFE_ZIP_RECEIPT: 'Safe ZIP validation failed: receipt is invalid',
  ERR_SAFE_ZIP_TREE: 'Safe ZIP validation failed: materialized tree is invalid',
  ERR_SAFE_ZIP_PUBLICATION: 'Safe ZIP validation failed: publication failed',
};

/** A path-free and cause-free error safe to expose outside the ZIP boundary. */
export class SafeZipError extends Error {
  readonly code: SafeZipErrorCode;

  constructor(code: SafeZipErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'SafeZipError';
    this.code = code;
    this.stack = `${this.name} [${this.code}]: ${this.message}`;
  }

  toJSON(): { readonly name: string; readonly code: SafeZipErrorCode; readonly message: string } {
    return { name: this.name, code: this.code, message: this.message };
  }

  [nodeInspect.custom](): string {
    return `${this.name} [${this.code}]: ${this.message}`;
  }
}

function fail(code: SafeZipErrorCode): never {
  throw new SafeZipError(code);
}

export function isSafeZipArchiveBytesV1(value: bigint): boolean {
  return value >= 1n && value <= BigInt(MAX_ARCHIVE_BYTES);
}

export function isSafeZipEntryCountV1(value: bigint): boolean {
  return value >= 0n && value <= BigInt(MAX_ENTRIES);
}

export function isSafeZipFileBytesV1(value: bigint): boolean {
  return value >= 0n && value <= BigInt(MAX_FILE_BYTES);
}

export function isSafeZipTotalUncompressedBytesV1(value: bigint): boolean {
  return value >= 0n && value <= BigInt(MAX_TOTAL_UNCOMPRESSED_BYTES);
}

export function isSafeZipTotalPathBytesV1(value: bigint): boolean {
  return value >= 0n && value <= BigInt(MAX_TOTAL_PATH_BYTES);
}

export function isSafeZipExtraFieldBytesV1(value: bigint): boolean {
  return value >= 0n && value <= BigInt(MAX_EXTRA_FIELD_BYTES);
}

export function isSafeZipRatioV1(uncompressedBytes: bigint, compressedBytes: bigint): boolean {
  if (uncompressedBytes < 0n || compressedBytes < 0n) return false;
  if (uncompressedBytes === 0n) return true;
  return compressedBytes > 0n && uncompressedBytes <= BigInt(MAX_RATIO) * compressedBytes;
}

/** Shared low-RAM counter for every unique explicit or implicit inventory path. */
export class SafeZipInventoryBudgetV1 {
  #entryCount: bigint;
  #totalPathBytes: bigint;

  constructor(entryCount = 0n, totalPathBytes = 0n) {
    if (!isSafeZipEntryCountV1(entryCount) || !isSafeZipTotalPathBytesV1(totalPathBytes)) {
      fail('ERR_SAFE_ZIP_ARGUMENT');
    }
    this.#entryCount = entryCount;
    this.#totalPathBytes = totalPathBytes;
  }

  get entryCount(): bigint {
    return this.#entryCount;
  }

  get totalPathBytes(): bigint {
    return this.#totalPathBytes;
  }

  reservePath(path: string): void {
    if (!isCanonicalMaterializationPathV1(path)) fail('ERR_SAFE_ZIP_ENTRY_NAME');
    const nextEntryCount = this.#entryCount + 1n;
    const nextPathBytes = this.#totalPathBytes + BigInt(Buffer.byteLength(path, 'ascii'));
    if (!isSafeZipEntryCountV1(nextEntryCount) || !isSafeZipTotalPathBytesV1(nextPathBytes)) {
      fail('ERR_SAFE_ZIP_ENTRY_LIMIT');
    }
    this.#entryCount = nextEntryCount;
    this.#totalPathBytes = nextPathBytes;
  }
}

export type SafeZipEntryKindV1 = 'file' | 'directory';

export interface SafeZipArchiveEntryV1 {
  readonly ordinal: number;
  readonly path: string;
  readonly kind: SafeZipEntryKindV1;
  readonly versionMadeBy: number;
  readonly versionNeededToExtract: number;
  readonly generalPurposeBitFlag: number;
  readonly compressionMethod: 0 | 8;
  readonly crc32: number;
  readonly compressedBytes: number;
  readonly uncompressedBytes: number;
  readonly internalFileAttributes: number;
  readonly externalFileAttributes: number;
  readonly localHeaderOffset: number;
  readonly dataStart: number;
  readonly dataEnd: number;
  readonly localRangeEnd: number;
}

export interface SafeZipInventoryEntryV1 {
  readonly path: string;
  readonly kind: SafeZipEntryKindV1;
  readonly explicit: boolean;
}

export interface RawSafeZipIndexV1 {
  readonly archiveBytes: number;
  readonly zip64: boolean;
  readonly centralStart: number;
  readonly centralEnd: number;
  readonly archiveEntries: readonly SafeZipArchiveEntryV1[];
  readonly inventory: readonly SafeZipInventoryEntryV1[];
  readonly totalCompressedBytes: number;
  readonly totalUncompressedBytes: number;
  readonly totalPathBytes: number;
}

interface ParsedCentralEntryV1 extends SafeZipArchiveEntryV1 {
  readonly rawName: Buffer;
  readonly rawExtra: Buffer;
}

interface CentralEntryBeforeLocalV1 {
  readonly ordinal: number;
  readonly path: string;
  readonly kind: SafeZipEntryKindV1;
  readonly versionMadeBy: number;
  readonly versionNeededToExtract: number;
  readonly generalPurposeBitFlag: number;
  readonly compressionMethod: 0 | 8;
  readonly crc32: number;
  readonly compressedBytes: number;
  readonly uncompressedBytes: number;
  readonly internalFileAttributes: number;
  readonly externalFileAttributes: number;
  readonly localHeaderOffset: number;
  readonly rawName: Buffer;
  readonly rawExtra: Buffer;
}

interface ParsedArchiveEndingV1 {
  readonly zip64: boolean;
  readonly entryCount: number;
  readonly centralStart: number;
  readonly centralEnd: number;
}

interface MutableInventoryEntryV1 {
  readonly path: string;
  readonly kind: SafeZipEntryKindV1;
  explicit: boolean;
}

export class Crc32V1 {
  #state = 0xffff_ffff;

  update(bytes: Uint8Array): void {
    let state = this.#state;
    for (const byte of bytes) {
      state = CRC32_TABLE[(state ^ byte) & 0xff]! ^ (state >>> 8);
    }
    this.#state = state >>> 0;
  }

  digest(): number {
    return (this.#state ^ 0xffff_ffff) >>> 0;
  }
}

/** Computes the unsigned CRC-32/ISO-HDLC value used by ZIP records. */
export function crc32V1(bytes: Uint8Array): number {
  const crc = new Crc32V1();
  crc.update(bytes);
  return crc.digest();
}

export interface SafeZipReadableHandle {
  read(
    buffer: Buffer,
    offset: number,
    length: number,
    position: number,
  ): Promise<{ readonly bytesRead: number; readonly buffer: Buffer }>;
}

function failedReadable(code: SafeZipErrorCode): Readable {
  return Readable.from((async function* () {
    fail(code);
  })());
}

/** A yauzl reader that borrows but never closes or repositions its FileHandle. */
export class BorrowedFileHandleReader extends yauzl.RandomAccessReader {
  readonly #handle: SafeZipReadableHandle;
  readonly #archiveBytes: number;
  #referenceCount = 0;
  #closeStarted = false;

  constructor(handle: SafeZipReadableHandle, archiveBytes: number) {
    super();
    if (!Number.isSafeInteger(archiveBytes) || archiveBytes < 0) fail('ERR_SAFE_ZIP_ARGUMENT');
    this.#handle = handle;
    this.#archiveBytes = archiveBytes;
  }

  override _readStreamForRange(start: number, end: number): Readable {
    if (
      !Number.isSafeInteger(start)
      || !Number.isSafeInteger(end)
      || start < 0
      || end < start
      || end > this.#archiveBytes
    ) return failedReadable('ERR_SAFE_ZIP_STREAM');

    const handle = this.#handle;
    return Readable.from((async function* () {
      let position = start;
      while (position < end) {
        const length = Math.min(POSITIONAL_READ_CHUNK_BYTES, end - position);
        const buffer = Buffer.allocUnsafe(length);
        let result: Awaited<ReturnType<SafeZipReadableHandle['read']>>;
        try {
          result = await handle.read(buffer, 0, length, position);
        } catch {
          fail('ERR_SAFE_ZIP_STREAM');
        }
        const { bytesRead } = result;
        if (!Number.isInteger(bytesRead) || bytesRead <= 0 || bytesRead > length) {
          fail('ERR_SAFE_ZIP_STREAM');
        }
        position += bytesRead;
        yield buffer.subarray(0, bytesRead);
      }
    })());
  }

  /** Runtime hooks invoked by yauzl and its range streams. */
  ref(): void {
    if (this.#closeStarted) fail('ERR_SAFE_ZIP_STREAM');
    this.#referenceCount += 1;
  }

  /** Runtime hooks invoked by yauzl and its range streams. */
  unref(): void {
    if (this.#referenceCount <= 0) fail('ERR_SAFE_ZIP_STREAM');
    this.#referenceCount -= 1;
    if (this.#referenceCount > 0) return;
    this.#closeStarted = true;
    this.close((error) => {
      if (error !== null) this.emit('error', new SafeZipError('ERR_SAFE_ZIP_STREAM'));
      else this.emit('close');
    });
  }

  /** Releases yauzl's constructor reference when initialization rejects. */
  releaseFailedInitializationV1(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        this.removeListener('close', onClose);
        this.removeListener('error', onError);
      };
      const onClose = (): void => {
        cleanup();
        resolve();
      };
      const onError = (): void => {
        cleanup();
        reject(new SafeZipError('ERR_SAFE_ZIP_STREAM'));
      };
      this.once('close', onClose);
      this.once('error', onError);
      try {
        this.unref();
      } catch {
        cleanup();
        reject(new SafeZipError('ERR_SAFE_ZIP_STREAM'));
      }
    });
  }

  override close(callback: (error: Error | null) => void): void {
    queueMicrotask(() => callback(null));
  }
}

function rethrowStable(error: unknown, fallback: SafeZipErrorCode): never {
  if (error instanceof SafeZipError) throw error;
  fail(fallback);
}

function validateArchiveArguments(handle: SafeZipReadableHandle, archiveBytes: number): void {
  if (
    handle === null
    || typeof handle !== 'object'
    || typeof handle.read !== 'function'
    || !Number.isSafeInteger(archiveBytes)
    || !isSafeZipArchiveBytesV1(BigInt(archiveBytes))
  ) fail('ERR_SAFE_ZIP_ARGUMENT');
}

async function readExactV1(
  handle: SafeZipReadableHandle,
  archiveBytes: number,
  position: bigint,
  length: bigint,
): Promise<Buffer> {
  const archiveLimit = BigInt(archiveBytes);
  if (position < 0n || length < 0n || position > archiveLimit || length > archiveLimit - position) {
    fail('ERR_SAFE_ZIP_ARCHIVE_INVALID');
  }
  if (length > BigInt(Number.MAX_SAFE_INTEGER)) fail('ERR_SAFE_ZIP_ARCHIVE_INVALID');
  const output = Buffer.alloc(Number(length));
  let written = 0;
  while (written < output.byteLength) {
    const requestBytes = Math.min(POSITIONAL_READ_CHUNK_BYTES, output.byteLength - written);
    const readPosition = position + BigInt(written);
    if (readPosition > BigInt(Number.MAX_SAFE_INTEGER)) fail('ERR_SAFE_ZIP_ARCHIVE_INVALID');
    try {
      const result = await handle.read(output, written, requestBytes, Number(readPosition));
      const { bytesRead } = result;
      if (!Number.isInteger(bytesRead) || bytesRead <= 0 || bytesRead > requestBytes) {
        fail('ERR_SAFE_ZIP_STREAM');
      }
      written += bytesRead;
    } catch (error) {
      rethrowStable(error, 'ERR_SAFE_ZIP_STREAM');
    }
  }
  return output;
}

function checkedAddV1(left: bigint, right: bigint, limit: bigint): bigint {
  if (left < 0n || right < 0n || left > limit || right > limit - left) {
    fail('ERR_SAFE_ZIP_ARCHIVE_INVALID');
  }
  return left + right;
}

function safeNumberV1(value: bigint, code: SafeZipErrorCode = 'ERR_SAFE_ZIP_ARCHIVE_INVALID'): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) fail(code);
  return Number(value);
}

function asciiFoldV1(value: string): string {
  let folded = '';
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    folded += code >= 0x41 && code <= 0x5a ? String.fromCharCode(code + 0x20) : value[index]!;
  }
  return folded;
}

function canonicalPathV1(rawName: Buffer): { readonly path: string; readonly directorySlash: boolean } {
  if (rawName.byteLength === 0 || rawName.byteLength > MAX_PATH_BYTES + 1) {
    fail('ERR_SAFE_ZIP_ENTRY_NAME');
  }
  for (const byte of rawName) {
    if (byte < 0x20 || byte > 0x7e || byte === 0x5c) fail('ERR_SAFE_ZIP_ENTRY_NAME');
  }
  const raw = rawName.toString('ascii');
  const directorySlash = raw.endsWith('/');
  if (
    raw.startsWith('/')
    || /^[A-Za-z]:/.test(raw)
    || raw.includes('//')
    || raw.endsWith('//')
  ) fail('ERR_SAFE_ZIP_ENTRY_NAME');
  const path = directorySlash ? raw.slice(0, -1) : raw;
  if (path.length === 0 || Buffer.byteLength(path, 'ascii') > MAX_PATH_BYTES) {
    fail('ERR_SAFE_ZIP_ENTRY_NAME');
  }
  const segments = path.split('/');
  if (segments.length > MAX_DEPTH) fail('ERR_SAFE_ZIP_ENTRY_NAME');
  for (const segment of segments) {
    if (
      segment.length === 0
      || segment === '.'
      || segment === '..'
      || Buffer.byteLength(segment, 'ascii') > MAX_SEGMENT_BYTES
    ) fail('ERR_SAFE_ZIP_ENTRY_NAME');
  }
  return { path, directorySlash };
}

function popcount3(value: number): number {
  return (value & 1) + ((value >>> 1) & 1) + ((value >>> 2) & 1);
}

function validateExtraFieldsV1(extra: Buffer, location: 'central' | 'local'): void {
  if (!isSafeZipExtraFieldBytesV1(BigInt(extra.byteLength))) fail('ERR_SAFE_ZIP_ENTRY_METADATA');
  const seen = new Set<number>();
  let cursor = 0;
  while (cursor < extra.byteLength) {
    if (extra.byteLength - cursor < 4) fail('ERR_SAFE_ZIP_ENTRY_METADATA');
    const id = extra.readUInt16LE(cursor);
    const payloadBytes = extra.readUInt16LE(cursor + 2);
    cursor += 4;
    if (payloadBytes > extra.byteLength - cursor || seen.has(id)) fail('ERR_SAFE_ZIP_ENTRY_METADATA');
    seen.add(id);
    const payload = extra.subarray(cursor, cursor + payloadBytes);
    cursor += payloadBytes;

    if (id === 0x5455) {
      if (payload.byteLength === 0) fail('ERR_SAFE_ZIP_ENTRY_METADATA');
      const flags = payload[0]!;
      if ((flags & 1) === 0 || (flags & ~0x07) !== 0) fail('ERR_SAFE_ZIP_ENTRY_METADATA');
      const expectedBytes = location === 'central' ? 5 : 1 + (4 * popcount3(flags));
      if (payload.byteLength !== expectedBytes) fail('ERR_SAFE_ZIP_ENTRY_METADATA');
      continue;
    }

    if (id === 0x7875) {
      if (payload.byteLength < 5 || payload[0] !== 1) fail('ERR_SAFE_ZIP_ENTRY_METADATA');
      const uidBytes = payload[1]!;
      if (uidBytes < 1 || uidBytes > 8 || 2 + uidBytes >= payload.byteLength) {
        fail('ERR_SAFE_ZIP_ENTRY_METADATA');
      }
      const gidBytes = payload[2 + uidBytes]!;
      if (gidBytes < 1 || gidBytes > 8 || payload.byteLength !== 3 + uidBytes + gidBytes) {
        fail('ERR_SAFE_ZIP_ENTRY_METADATA');
      }
      continue;
    }

    fail('ERR_SAFE_ZIP_ENTRY_METADATA');
  }
}

function classifyEntryKindV1(versionMadeBy: number, externalAttributes: number): SafeZipEntryKindV1 {
  const host = versionMadeBy >>> 8;
  if (host === 3 || host === 19) {
    const mode = (externalAttributes >>> 16) & 0xffff;
    const type = mode & S_IFMT;
    if (type === S_IFREG) return 'file';
    if (type === S_IFDIR) return 'directory';
    fail('ERR_SAFE_ZIP_ENTRY_TYPE');
  }
  if (host === 0) {
    const dos = externalAttributes & 0xff;
    if ((dos & (DOS_VOLUME | DOS_DEVICE | DOS_RESERVED)) !== 0) fail('ERR_SAFE_ZIP_ENTRY_TYPE');
    return (dos & DOS_DIRECTORY) !== 0 ? 'directory' : 'file';
  }
  fail('ERR_SAFE_ZIP_ENTRY_TYPE');
}

function registerInventoryPathV1(
  entries: Map<string, MutableInventoryEntryV1>,
  collisionPaths: Map<string, string>,
  path: string,
  kind: SafeZipEntryKindV1,
  budget: SafeZipInventoryBudgetV1,
): void {
  const segments = path.split('/');
  for (let depth = 1; depth <= segments.length; depth += 1) {
    const candidatePath = segments.slice(0, depth).join('/');
    const candidateKind: SafeZipEntryKindV1 = depth === segments.length ? kind : 'directory';
    const explicit = depth === segments.length;
    const collisionKey = asciiFoldV1(candidatePath);
    if (collisionKey === asciiFoldV1(RESERVED_RECEIPT_PATH)) fail('ERR_SAFE_ZIP_ENTRY_COLLISION');
    const priorPath = collisionPaths.get(collisionKey);
    if (priorPath !== undefined && priorPath !== candidatePath) fail('ERR_SAFE_ZIP_ENTRY_COLLISION');
    const prior = entries.get(candidatePath);
    if (prior !== undefined) {
      if (prior.kind !== candidateKind) fail('ERR_SAFE_ZIP_ENTRY_COLLISION');
      if (explicit && prior.explicit) fail('ERR_SAFE_ZIP_ENTRY_COLLISION');
      if (explicit) prior.explicit = true;
      continue;
    }
    budget.reservePath(candidatePath);
    collisionPaths.set(collisionKey, candidatePath);
    entries.set(candidatePath, { path: candidatePath, kind: candidateKind, explicit });
  }
}

async function parseArchiveEndingV1(
  handle: SafeZipReadableHandle,
  archiveBytes: number,
): Promise<ParsedArchiveEndingV1> {
  if (archiveBytes < EOCD_BYTES) fail('ERR_SAFE_ZIP_ARCHIVE_INVALID');
  const searchBytes = Math.min(archiveBytes, MAX_EOCD_SEARCH_BYTES);
  const searchStart = archiveBytes - searchBytes;
  const tail = await readExactV1(handle, archiveBytes, BigInt(searchStart), BigInt(searchBytes));
  const candidates: number[] = [];
  for (let cursor = 0; cursor <= tail.byteLength - EOCD_BYTES; cursor += 1) {
    if (tail.readUInt32LE(cursor) !== EOCD_SIGNATURE) continue;
    const commentBytes = tail.readUInt16LE(cursor + 20);
    if (cursor + EOCD_BYTES + commentBytes === tail.byteLength) candidates.push(searchStart + cursor);
  }
  if (candidates.length !== 1 || candidates[0] !== archiveBytes - EOCD_BYTES) {
    fail('ERR_SAFE_ZIP_ARCHIVE_INVALID');
  }
  const eocdOffset = candidates[0]!;
  const eocd = tail.subarray(tail.byteLength - EOCD_BYTES);
  if (eocd.readUInt16LE(20) !== 0) fail('ERR_SAFE_ZIP_ARCHIVE_INVALID');
  if (eocd.readUInt16LE(4) !== 0 || eocd.readUInt16LE(6) !== 0) {
    fail('ERR_SAFE_ZIP_ARCHIVE_INVALID');
  }
  const entriesOnDisk = eocd.readUInt16LE(8);
  const totalEntries = eocd.readUInt16LE(10);
  const centralSize32 = eocd.readUInt32LE(12);
  const centralStart32 = eocd.readUInt32LE(16);
  const sentinelFields = [
    entriesOnDisk === CLASSIC_COUNT_SENTINEL,
    totalEntries === CLASSIC_COUNT_SENTINEL,
    centralSize32 === CLASSIC_SIZE_SENTINEL,
    centralStart32 === CLASSIC_SIZE_SENTINEL,
  ];
  const sentinelCount = sentinelFields.filter(Boolean).length;
  if (sentinelCount !== 0 && sentinelCount !== sentinelFields.length) fail('ERR_SAFE_ZIP_ARCHIVE_INVALID');

  let entryCountBig: bigint;
  let centralSizeBig: bigint;
  let centralStartBig: bigint;
  let centralEndBig: bigint;
  let zip64 = false;
  if (sentinelCount === 0) {
    if (entriesOnDisk !== totalEntries) fail('ERR_SAFE_ZIP_ARCHIVE_INVALID');
    if (eocdOffset >= ZIP64_LOCATOR_BYTES) {
      const possibleLocator = await readExactV1(
        handle,
        archiveBytes,
        BigInt(eocdOffset - ZIP64_LOCATOR_BYTES),
        4n,
      );
      if (possibleLocator.readUInt32LE(0) === ZIP64_LOCATOR_SIGNATURE) {
        fail('ERR_SAFE_ZIP_ARCHIVE_INVALID');
      }
    }
    entryCountBig = BigInt(totalEntries);
    centralSizeBig = BigInt(centralSize32);
    centralStartBig = BigInt(centralStart32);
    centralEndBig = BigInt(eocdOffset);
  } else {
    zip64 = true;
    if (eocdOffset < ZIP64_LOCATOR_BYTES + ZIP64_EOCD_BYTES) fail('ERR_SAFE_ZIP_ARCHIVE_INVALID');
    const locatorOffset = eocdOffset - ZIP64_LOCATOR_BYTES;
    const locator = await readExactV1(handle, archiveBytes, BigInt(locatorOffset), BigInt(ZIP64_LOCATOR_BYTES));
    if (
      locator.readUInt32LE(0) !== ZIP64_LOCATOR_SIGNATURE
      || locator.readUInt32LE(4) !== 0
      || locator.readUInt32LE(16) !== 1
    ) fail('ERR_SAFE_ZIP_ARCHIVE_INVALID');
    const zip64OffsetBig = locator.readBigUInt64LE(8);
    const expectedZip64Offset = BigInt(locatorOffset - ZIP64_EOCD_BYTES);
    if (zip64OffsetBig !== expectedZip64Offset) fail('ERR_SAFE_ZIP_ARCHIVE_INVALID');
    const zip64Record = await readExactV1(
      handle,
      archiveBytes,
      zip64OffsetBig,
      BigInt(ZIP64_EOCD_BYTES),
    );
    if (
      zip64Record.readUInt32LE(0) !== ZIP64_EOCD_SIGNATURE
      || zip64Record.readBigUInt64LE(4) !== 44n
      || zip64Record.readUInt16LE(14) !== 45
      || zip64Record.readUInt32LE(16) !== 0
      || zip64Record.readUInt32LE(20) !== 0
    ) fail('ERR_SAFE_ZIP_ARCHIVE_INVALID');
    const zip64EntriesOnDisk = zip64Record.readBigUInt64LE(24);
    entryCountBig = zip64Record.readBigUInt64LE(32);
    if (zip64EntriesOnDisk !== entryCountBig) fail('ERR_SAFE_ZIP_ARCHIVE_INVALID');
    centralSizeBig = zip64Record.readBigUInt64LE(40);
    centralStartBig = zip64Record.readBigUInt64LE(48);
    centralEndBig = zip64OffsetBig;
  }

  if (!isSafeZipEntryCountV1(entryCountBig)) fail('ERR_SAFE_ZIP_ENTRY_LIMIT');
  const archiveLimit = BigInt(archiveBytes);
  const computedCentralEnd = checkedAddV1(centralStartBig, centralSizeBig, archiveLimit);
  if (computedCentralEnd !== centralEndBig) fail('ERR_SAFE_ZIP_ARCHIVE_INVALID');
  if (BigInt(CENTRAL_HEADER_BYTES) * entryCountBig > centralSizeBig) {
    fail('ERR_SAFE_ZIP_ARCHIVE_INVALID');
  }
  return {
    zip64,
    entryCount: safeNumberV1(entryCountBig, 'ERR_SAFE_ZIP_ENTRY_LIMIT'),
    centralStart: safeNumberV1(centralStartBig),
    centralEnd: safeNumberV1(centralEndBig),
  };
}

async function parseCentralEntriesV1(
  handle: SafeZipReadableHandle,
  archiveBytes: number,
  ending: ParsedArchiveEndingV1,
): Promise<{
  readonly entries: readonly CentralEntryBeforeLocalV1[];
  readonly inventory: readonly SafeZipInventoryEntryV1[];
  readonly totalCompressedBytes: bigint;
  readonly totalUncompressedBytes: bigint;
  readonly totalPathBytes: bigint;
}> {
  const entries: CentralEntryBeforeLocalV1[] = [];
  const inventory = new Map<string, MutableInventoryEntryV1>();
  const collisionPaths = new Map<string, string>();
  let cursor = BigInt(ending.centralStart);
  let totalCompressedBytes = 0n;
  let totalUncompressedBytes = 0n;
  const inventoryBudget = new SafeZipInventoryBudgetV1();
  let fileCount = 0;

  for (let ordinal = 0; ordinal < ending.entryCount; ordinal += 1) {
    const fixedEnd = checkedAddV1(cursor, BigInt(CENTRAL_HEADER_BYTES), BigInt(ending.centralEnd));
    const fixed = await readExactV1(handle, archiveBytes, cursor, BigInt(CENTRAL_HEADER_BYTES));
    if (fixed.readUInt32LE(0) !== CENTRAL_HEADER_SIGNATURE) fail('ERR_SAFE_ZIP_ARCHIVE_INVALID');
    const versionMadeBy = fixed.readUInt16LE(4);
    const versionNeededToExtract = fixed.readUInt16LE(6);
    const generalPurposeBitFlag = fixed.readUInt16LE(8);
    const method = fixed.readUInt16LE(10);
    const crc32 = fixed.readUInt32LE(16);
    const compressedBytes = fixed.readUInt32LE(20);
    const uncompressedBytes = fixed.readUInt32LE(24);
    const nameBytes = fixed.readUInt16LE(28);
    const extraBytes = fixed.readUInt16LE(30);
    const commentBytes = fixed.readUInt16LE(32);
    const diskStart = fixed.readUInt16LE(34);
    const internalFileAttributes = fixed.readUInt16LE(36);
    const externalFileAttributes = fixed.readUInt32LE(38);
    const localHeaderOffset = fixed.readUInt32LE(42);

    if (versionNeededToExtract > 20) fail('ERR_SAFE_ZIP_ENTRY_METADATA');
    if (method !== 0 && method !== 8) fail('ERR_SAFE_ZIP_ENTRY_METADATA');
    const allowedFlags = method === 0 ? ALLOWED_STORED_FLAGS : ALLOWED_DEFLATE_FLAGS;
    if ((generalPurposeBitFlag & ~allowedFlags) !== 0) fail('ERR_SAFE_ZIP_ENTRY_METADATA');
    if (commentBytes !== 0 || diskStart !== 0) fail('ERR_SAFE_ZIP_ENTRY_METADATA');
    if (
      compressedBytes === CLASSIC_SIZE_SENTINEL
      || uncompressedBytes === CLASSIC_SIZE_SENTINEL
      || localHeaderOffset === CLASSIC_SIZE_SENTINEL
    ) fail('ERR_SAFE_ZIP_ENTRY_METADATA');
    if (nameBytes === 0 || nameBytes > MAX_PATH_BYTES + 1) fail('ERR_SAFE_ZIP_ENTRY_NAME');
    if (!isSafeZipExtraFieldBytesV1(BigInt(extraBytes))) fail('ERR_SAFE_ZIP_ENTRY_METADATA');

    cursor = fixedEnd;
    const variableBytes = BigInt(nameBytes + extraBytes);
    const variableEnd = checkedAddV1(cursor, variableBytes, BigInt(ending.centralEnd));
    const variable = await readExactV1(handle, archiveBytes, cursor, variableBytes);
    cursor = variableEnd;
    const rawName = Buffer.from(variable.subarray(0, nameBytes));
    const rawExtra = Buffer.from(variable.subarray(nameBytes));
    const { path, directorySlash } = canonicalPathV1(rawName);
    validateExtraFieldsV1(rawExtra, 'central');
    const kind = classifyEntryKindV1(versionMadeBy, externalFileAttributes);
    if ((kind === 'directory') !== directorySlash) fail('ERR_SAFE_ZIP_ENTRY_TYPE');

    if (kind === 'directory') {
      if (
        method !== 0
        || (generalPurposeBitFlag & 0x0008) !== 0
        || crc32 !== 0
        || compressedBytes !== 0
        || uncompressedBytes !== 0
      ) fail('ERR_SAFE_ZIP_ENTRY_METADATA');
    } else {
      fileCount += 1;
      if (!isSafeZipFileBytesV1(BigInt(uncompressedBytes))) fail('ERR_SAFE_ZIP_ENTRY_LIMIT');
      if (method === 0 && compressedBytes !== uncompressedBytes) fail('ERR_SAFE_ZIP_ENTRY_METADATA');
      if (!isSafeZipRatioV1(BigInt(uncompressedBytes), BigInt(compressedBytes))) {
        fail('ERR_SAFE_ZIP_ENTRY_RATIO');
      }
      totalCompressedBytes += BigInt(compressedBytes);
      totalUncompressedBytes += BigInt(uncompressedBytes);
      if (!isSafeZipTotalUncompressedBytesV1(totalUncompressedBytes)) fail('ERR_SAFE_ZIP_ENTRY_LIMIT');
    }

    registerInventoryPathV1(
      inventory,
      collisionPaths,
      path,
      kind,
      inventoryBudget,
    );
    entries.push({
      ordinal,
      path,
      kind,
      versionMadeBy,
      versionNeededToExtract,
      generalPurposeBitFlag,
      compressionMethod: method,
      crc32,
      compressedBytes,
      uncompressedBytes,
      internalFileAttributes,
      externalFileAttributes,
      localHeaderOffset,
      rawName,
      rawExtra,
    });
  }

  if (cursor !== BigInt(ending.centralEnd)) fail('ERR_SAFE_ZIP_ARCHIVE_INVALID');
  if (fileCount === 0) fail('ERR_SAFE_ZIP_ENTRY_LIMIT');
  if (
    !isSafeZipRatioV1(totalUncompressedBytes, totalCompressedBytes)
  ) fail('ERR_SAFE_ZIP_ENTRY_RATIO');

  const sortedInventory = [...inventory.values()]
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
    .map(({ path, kind, explicit }) => ({ path, kind, explicit }));
  return {
    entries,
    inventory: sortedInventory,
    totalCompressedBytes,
    totalUncompressedBytes,
    totalPathBytes: inventoryBudget.totalPathBytes,
  };
}

async function parseLocalEntriesV1(
  handle: SafeZipReadableHandle,
  archiveBytes: number,
  centralStart: number,
  entries: readonly CentralEntryBeforeLocalV1[],
): Promise<readonly ParsedCentralEntryV1[]> {
  const parsed: ParsedCentralEntryV1[] = [];
  for (const entry of entries) {
    const localOffset = BigInt(entry.localHeaderOffset);
    checkedAddV1(localOffset, BigInt(LOCAL_HEADER_BYTES), BigInt(centralStart));
    const fixed = await readExactV1(handle, archiveBytes, localOffset, BigInt(LOCAL_HEADER_BYTES));
    if (fixed.readUInt32LE(0) !== LOCAL_HEADER_SIGNATURE) fail('ERR_SAFE_ZIP_ARCHIVE_INVALID');
    const versionNeededToExtract = fixed.readUInt16LE(4);
    const flags = fixed.readUInt16LE(6);
    const method = fixed.readUInt16LE(8);
    const localCrc32 = fixed.readUInt32LE(14);
    const localCompressedBytes = fixed.readUInt32LE(18);
    const localUncompressedBytes = fixed.readUInt32LE(22);
    const nameBytes = fixed.readUInt16LE(26);
    const extraBytes = fixed.readUInt16LE(28);
    if (
      versionNeededToExtract !== entry.versionNeededToExtract
      || versionNeededToExtract > 20
      || flags !== entry.generalPurposeBitFlag
      || method !== entry.compressionMethod
    ) fail('ERR_SAFE_ZIP_ENTRY_METADATA');
    if (nameBytes === 0 || nameBytes > MAX_PATH_BYTES + 1) fail('ERR_SAFE_ZIP_ENTRY_NAME');
    if (!isSafeZipExtraFieldBytesV1(BigInt(extraBytes))) fail('ERR_SAFE_ZIP_ENTRY_METADATA');

    const variableStart = checkedAddV1(localOffset, BigInt(LOCAL_HEADER_BYTES), BigInt(centralStart));
    const variableBytes = BigInt(nameBytes + extraBytes);
    checkedAddV1(variableStart, variableBytes, BigInt(centralStart));
    const variable = await readExactV1(handle, archiveBytes, variableStart, variableBytes);
    const rawName = variable.subarray(0, nameBytes);
    const rawExtra = variable.subarray(nameBytes);
    if (!rawName.equals(entry.rawName)) fail('ERR_SAFE_ZIP_ENTRY_METADATA');
    validateExtraFieldsV1(rawExtra, 'local');

    const dataStartBig = checkedAddV1(variableStart, variableBytes, BigInt(centralStart));
    const dataEndBig = checkedAddV1(dataStartBig, BigInt(entry.compressedBytes), BigInt(centralStart));
    let localRangeEndBig = dataEndBig;
    if ((entry.generalPurposeBitFlag & 0x0008) === 0) {
      if (
        localCrc32 !== entry.crc32
        || localCompressedBytes !== entry.compressedBytes
        || localUncompressedBytes !== entry.uncompressedBytes
      ) fail('ERR_SAFE_ZIP_ENTRY_METADATA');
    } else {
      if (localCrc32 !== 0 || localCompressedBytes !== 0 || localUncompressedBytes !== 0) {
        fail('ERR_SAFE_ZIP_ENTRY_METADATA');
      }
      const descriptorEndBig = checkedAddV1(
        dataEndBig,
        BigInt(SIGNED_DESCRIPTOR_BYTES),
        BigInt(centralStart),
      );
      const descriptor = await readExactV1(
        handle,
        archiveBytes,
        dataEndBig,
        BigInt(SIGNED_DESCRIPTOR_BYTES),
      );
      if (
        descriptor.readUInt32LE(0) !== DATA_DESCRIPTOR_SIGNATURE
        || descriptor.readUInt32LE(4) !== entry.crc32
        || descriptor.readUInt32LE(8) !== entry.compressedBytes
        || descriptor.readUInt32LE(12) !== entry.uncompressedBytes
      ) fail('ERR_SAFE_ZIP_ENTRY_METADATA');
      localRangeEndBig = descriptorEndBig;
    }
    if (localRangeEndBig > BigInt(centralStart)) fail('ERR_SAFE_ZIP_ARCHIVE_INVALID');
    parsed.push({
      ...entry,
      dataStart: safeNumberV1(dataStartBig),
      dataEnd: safeNumberV1(dataEndBig),
      localRangeEnd: safeNumberV1(localRangeEndBig),
    });
  }

  const ranges = [...parsed].sort((left, right) => left.localHeaderOffset - right.localHeaderOffset);
  let expectedStart = 0;
  for (const entry of ranges) {
    if (entry.localHeaderOffset !== expectedStart) fail('ERR_SAFE_ZIP_ARCHIVE_INVALID');
    expectedStart = entry.localRangeEnd;
  }
  if (expectedStart !== centralStart) fail('ERR_SAFE_ZIP_ARCHIVE_INVALID');
  return parsed;
}

interface InternalRawSafeZipParseV1 {
  readonly index: RawSafeZipIndexV1;
  readonly rawEntries: readonly ParsedCentralEntryV1[];
}

async function parseRawSafeZipInternalV1(
  handle: SafeZipReadableHandle,
  archiveBytes: number,
): Promise<InternalRawSafeZipParseV1> {
  validateArchiveArguments(handle, archiveBytes);
  const ending = await parseArchiveEndingV1(handle, archiveBytes);
  const central = await parseCentralEntriesV1(handle, archiveBytes, ending);
  const parsedEntries = await parseLocalEntriesV1(
    handle,
    archiveBytes,
    ending.centralStart,
    central.entries,
  );
  const publicEntries = parsedEntries.map((entry) => {
    const { rawName: _rawName, rawExtra: _rawExtra, ...normalized } = entry;
    return Object.freeze(normalized);
  });
  Object.freeze(publicEntries);
  const publicInventory = central.inventory.map((entry) => Object.freeze({ ...entry }));
  Object.freeze(publicInventory);
  const index: RawSafeZipIndexV1 = Object.freeze({
    archiveBytes,
    zip64: ending.zip64,
    centralStart: ending.centralStart,
    centralEnd: ending.centralEnd,
    archiveEntries: publicEntries,
    inventory: publicInventory,
    totalCompressedBytes: safeNumberV1(central.totalCompressedBytes, 'ERR_SAFE_ZIP_ENTRY_LIMIT'),
    totalUncompressedBytes: safeNumberV1(central.totalUncompressedBytes, 'ERR_SAFE_ZIP_ENTRY_LIMIT'),
    totalPathBytes: safeNumberV1(central.totalPathBytes, 'ERR_SAFE_ZIP_ENTRY_LIMIT'),
  });
  return { index, rawEntries: parsedEntries };
}

/**
 * Parses the complete safe-zip-v1 raw container without trusting library-decoded
 * names, local headers, descriptors, sizes, or ranges.
 */
export async function parseRawSafeZipV1(
  handle: SafeZipReadableHandle,
  archiveBytes: number,
): Promise<RawSafeZipIndexV1> {
  return (await parseRawSafeZipInternalV1(handle, archiveBytes)).index;
}

export type SafeZipLowLevelReaderV1 = Pick<yauzl.ZipFile, 'openReadStreamLowLevel'>;

export interface ValidateSafeZipEntryContentOptionsV1 {
  readonly maxTotalUncompressedBytes?: number | bigint;
  readonly onChunk?: (chunk: Buffer) => void | Promise<void>;
}

export interface ValidatedSafeZipEntryContentV1 {
  readonly bytes: number;
  readonly crc32: number;
  readonly sha256: string;
  readonly rawInputBytes: number;
  readonly remainingTotalUncompressedBytes: number;
}

export interface OpenValidatedSafeZipV1Result {
  readonly index: RawSafeZipIndexV1;
  validateEntryContent(
    entry: SafeZipArchiveEntryV1,
    options?: ValidateSafeZipEntryContentOptionsV1,
  ): Promise<ValidatedSafeZipEntryContentV1>;
  release(): Promise<void>;
}

function validateNormalizedEntryForStreamV1(entry: SafeZipArchiveEntryV1): void {
  if (
    entry === null
    || typeof entry !== 'object'
    || entry.kind !== 'file'
    || (entry.compressionMethod !== 0 && entry.compressionMethod !== 8)
    || !Number.isSafeInteger(entry.dataStart)
    || entry.dataStart < 0
    || !Number.isSafeInteger(entry.compressedBytes)
    || entry.compressedBytes < 0
    || !Number.isSafeInteger(entry.uncompressedBytes)
    || entry.uncompressedBytes < 0
    || entry.uncompressedBytes > MAX_FILE_BYTES
    || !Number.isSafeInteger(entry.crc32)
    || entry.crc32 < 0
    || entry.crc32 > 0xffff_ffff
    || BigInt(entry.dataStart) + BigInt(entry.compressedBytes) > BigInt(Number.MAX_SAFE_INTEGER)
  ) fail('ERR_SAFE_ZIP_ARGUMENT');
  if (entry.compressionMethod === 0 && entry.compressedBytes !== entry.uncompressedBytes) {
    fail('ERR_SAFE_ZIP_ENTRY_METADATA');
  }
}

/** Promise adapter for yauzl 3.4.0's documented callback-only low-level API. */
export function openRawSafeZipEntryStreamV1(
  zipFile: SafeZipLowLevelReaderV1,
  entry: Pick<SafeZipArchiveEntryV1, 'dataStart' | 'compressedBytes'>,
): Promise<Readable> {
  if (
    zipFile === null
    || typeof zipFile !== 'object'
    || typeof zipFile.openReadStreamLowLevel !== 'function'
    || entry === null
    || typeof entry !== 'object'
    || !Number.isSafeInteger(entry.dataStart)
    || entry.dataStart < 0
    || !Number.isSafeInteger(entry.compressedBytes)
    || entry.compressedBytes < 0
    || BigInt(entry.dataStart) + BigInt(entry.compressedBytes) > BigInt(Number.MAX_SAFE_INTEGER)
  ) return Promise.reject(new SafeZipError('ERR_SAFE_ZIP_ARGUMENT'));

  return new Promise<Readable>((resolve, reject) => {
    let settled = false;
    const finish = (error: Error | null, stream?: Readable): void => {
      if (settled) return;
      settled = true;
      if (error !== null || stream === undefined || typeof stream.on !== 'function') {
        reject(new SafeZipError('ERR_SAFE_ZIP_STREAM'));
        return;
      }
      resolve(stream);
    };
    try {
      zipFile.openReadStreamLowLevel(
        entry.dataStart,
        entry.compressedBytes,
        0,
        entry.compressedBytes,
        false,
        null,
        finish as (error: Error | null, stream: Readable) => void,
      );
    } catch {
      finish(new Error());
    }
  });
}

function contentBudgetV1(value: number | bigint | undefined): bigint {
  if (value === undefined) return BigInt(MAX_TOTAL_UNCOMPRESSED_BYTES);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0 || value > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      fail('ERR_SAFE_ZIP_ARGUMENT');
    }
    return BigInt(value);
  }
  if (
    typeof value !== 'bigint'
    || value < 0n
    || value > BigInt(MAX_TOTAL_UNCOMPRESSED_BYTES)
  ) {
    fail('ERR_SAFE_ZIP_ARGUMENT');
  }
  return value;
}

/**
 * Consumes one validated raw range, owning decompression and independently
 * checking input consumption, output size, CRC-32, SHA-256, and early budgets.
 */
export async function validateSafeZipEntryContentV1(
  zipFile: SafeZipLowLevelReaderV1,
  entry: SafeZipArchiveEntryV1,
  options: ValidateSafeZipEntryContentOptionsV1 = {},
): Promise<ValidatedSafeZipEntryContentV1> {
  validateNormalizedEntryForStreamV1(entry);
  if (options === null || typeof options !== 'object') fail('ERR_SAFE_ZIP_ARGUMENT');
  if (options.onChunk !== undefined && typeof options.onChunk !== 'function') fail('ERR_SAFE_ZIP_ARGUMENT');
  const totalBudget = contentBudgetV1(options.maxTotalUncompressedBytes);
  if (BigInt(entry.uncompressedBytes) > totalBudget) fail('ERR_SAFE_ZIP_ENTRY_LIMIT');

  const rawStream = await openRawSafeZipEntryStreamV1(zipFile, entry);
  const crc = new Crc32V1();
  const sha256 = createHash('sha256');
  let rawInputBytes = 0n;
  let outputBytes = 0n;
  const declaredInputBytes = BigInt(entry.compressedBytes);
  const declaredOutputBytes = BigInt(entry.uncompressedBytes);

  const rawCounter = new Transform({
    transform(chunk: Buffer | Uint8Array, _encoding, callback): void {
      const bytes = Buffer.from(chunk);
      const next = rawInputBytes + BigInt(bytes.byteLength);
      if (next > declaredInputBytes) {
        callback(new SafeZipError('ERR_SAFE_ZIP_STREAM'));
        return;
      }
      rawInputBytes = next;
      callback(null, bytes);
    },
  });
  const sink = new Writable({
    write(chunk: Buffer | Uint8Array, _encoding, callback): void {
      const bytes = Buffer.from(chunk);
      const next = outputBytes + BigInt(bytes.byteLength);
      if (next > declaredOutputBytes || next > totalBudget) {
        callback(new SafeZipError('ERR_SAFE_ZIP_ENTRY_LIMIT'));
        return;
      }
      outputBytes = next;
      crc.update(bytes);
      sha256.update(bytes);
      if (options.onChunk === undefined) {
        callback();
        return;
      }
      Promise.resolve(options.onChunk(bytes)).then(
        () => callback(),
        () => callback(new SafeZipError('ERR_SAFE_ZIP_STREAM')),
      );
    },
  });
  const inflater = entry.compressionMethod === 8 ? createInflateRaw() : undefined;
  try {
    if (inflater === undefined) await pipeline(rawStream, rawCounter, sink);
    else await pipeline(rawStream, rawCounter, inflater, sink);
  } catch (error) {
    rethrowStable(error, 'ERR_SAFE_ZIP_STREAM');
  }

  if (rawInputBytes !== declaredInputBytes || outputBytes !== declaredOutputBytes) {
    fail('ERR_SAFE_ZIP_ENTRY_METADATA');
  }
  if (inflater !== undefined && BigInt(inflater.bytesWritten) !== declaredInputBytes) {
    fail('ERR_SAFE_ZIP_ENTRY_METADATA');
  }
  const actualCrc32 = crc.digest();
  if (actualCrc32 !== entry.crc32) fail('ERR_SAFE_ZIP_ENTRY_METADATA');
  return {
    bytes: safeNumberV1(outputBytes, 'ERR_SAFE_ZIP_ENTRY_LIMIT'),
    crc32: actualCrc32,
    sha256: sha256.digest('hex'),
    rawInputBytes: safeNumberV1(rawInputBytes, 'ERR_SAFE_ZIP_ENTRY_LIMIT'),
    remainingTotalUncompressedBytes: safeNumberV1(totalBudget - outputBytes, 'ERR_SAFE_ZIP_ENTRY_LIMIT'),
  };
}

function isSameBufferV1(actual: unknown, expected: Buffer): boolean {
  return Buffer.isBuffer(actual) && actual.equals(expected);
}

function crosscheckYauzlEntryV1(entry: yauzl.Entry, expected: ParsedCentralEntryV1): void {
  if (
    !isSameBufferV1(entry.fileNameRaw, expected.rawName)
    || !isSameBufferV1(entry.extraFieldRaw, expected.rawExtra)
    || !Buffer.isBuffer(entry.fileCommentRaw)
    || entry.fileCommentRaw.byteLength !== 0
    || entry.fileNameLength !== expected.rawName.byteLength
    || entry.extraFieldLength !== expected.rawExtra.byteLength
    || entry.fileCommentLength !== 0
    || entry.versionMadeBy !== expected.versionMadeBy
    || entry.versionNeededToExtract !== expected.versionNeededToExtract
    || entry.generalPurposeBitFlag !== expected.generalPurposeBitFlag
    || entry.compressionMethod !== expected.compressionMethod
    || entry.crc32 !== expected.crc32
    || entry.compressedSize !== expected.compressedBytes
    || entry.uncompressedSize !== expected.uncompressedBytes
    || entry.internalFileAttributes !== expected.internalFileAttributes
    || entry.externalFileAttributes !== expected.externalFileAttributes
    || entry.relativeOffsetOfLocalHeader !== expected.localHeaderOffset
  ) fail('ERR_SAFE_ZIP_ENTRY_METADATA');
}

function closeZipFileV1(zipFile: yauzl.ZipFile, priorError: () => boolean): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let lifecycleFailed = priorError();
    const onError = (): void => { lifecycleFailed = true; };
    const onClose = (): void => {
      zipFile.removeListener('error', onError);
      if (lifecycleFailed) reject(new SafeZipError('ERR_SAFE_ZIP_STREAM'));
      else resolve();
    };
    zipFile.on('error', onError);
    zipFile.once('close', onClose);
    try {
      zipFile.close();
    } catch {
      zipFile.removeListener('close', onClose);
      zipFile.removeListener('error', onError);
      reject(new SafeZipError('ERR_SAFE_ZIP_STREAM'));
    }
  });
}

/**
 * Opens yauzl over the same borrowed descriptor, ordinally cross-checks its
 * metadata against the raw authority, and returns a close-aware content session.
 */
export async function openValidatedSafeZipV1FromBorrowedHandle(
  handle: SafeZipReadableHandle,
  archiveBytes: number,
): Promise<OpenValidatedSafeZipV1Result> {
  const parsedRaw = await parseRawSafeZipInternalV1(handle, archiveBytes);
  const rawIndex = parsedRaw.index;
  const rawEntries = parsedRaw.rawEntries;
  const reader = new BorrowedFileHandleReader(handle, archiveBytes);
  let zipFile: yauzl.ZipFile;
  try {
    zipFile = await yauzl.fromRandomAccessReaderPromise(reader, archiveBytes, {
      autoClose: false,
      decodeStrings: false,
      validateEntrySizes: true,
    });
  } catch (error) {
    await reader.releaseFailedInitializationV1().catch(() => undefined);
    rethrowStable(error, 'ERR_SAFE_ZIP_ARCHIVE_INVALID');
  }

  let lifecycleError = false;
  const recordLifecycleError = (): void => { lifecycleError = true; };
  zipFile.on('error', recordLifecycleError);
  try {
    let ordinal = 0;
    for await (const yauzlEntry of zipFile.eachEntry()) {
      const expected = rawEntries[ordinal];
      if (expected === undefined) fail('ERR_SAFE_ZIP_ENTRY_METADATA');
      crosscheckYauzlEntryV1(yauzlEntry, expected);
      ordinal += 1;
    }
    if (ordinal !== rawEntries.length || lifecycleError) fail('ERR_SAFE_ZIP_ENTRY_METADATA');
  } catch (error) {
    zipFile.removeListener('error', recordLifecycleError);
    await closeZipFileV1(zipFile, () => lifecycleError).catch(() => undefined);
    rethrowStable(error, 'ERR_SAFE_ZIP_ARCHIVE_INVALID');
  }

  let released = false;
  let releasePromise: Promise<void> | undefined;
  const release = (): Promise<void> => {
    if (releasePromise !== undefined) return releasePromise;
    released = true;
    zipFile.removeListener('error', recordLifecycleError);
    releasePromise = closeZipFileV1(zipFile, () => lifecycleError);
    return releasePromise;
  };
  const publicEntries = rawIndex.archiveEntries;
  return {
    index: rawIndex,
    validateEntryContent: async (entry, options) => {
      const normalized = entry !== null && typeof entry === 'object'
        ? publicEntries[entry.ordinal]
        : undefined;
      if (
        released
        || lifecycleError
        || !zipFile.isOpen
        || normalized === undefined
        || normalized !== entry
      ) fail('ERR_SAFE_ZIP_ARGUMENT');
      return validateSafeZipEntryContentV1(zipFile, normalized, options);
    },
    release,
  };
}
