import { createHash, randomBytes as cryptoRandomBytes } from 'node:crypto';
import { constants, Dir, type BigIntStats } from 'node:fs';
import {
  link as linkFileDefault,
  lstat as lstatFileDefault,
  mkdir as mkdirDirectoryDefault,
  open as openFileDefault,
  opendir as openDirectoryDefault,
  realpath as realpathFileDefault,
  rmdir as removeDirectoryDefault,
  unlink as unlinkFileDefault,
  type FileHandle,
} from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { inspect as nodeInspect } from 'node:util';
import { createInflateRaw } from 'node:zlib';
import * as yauzl from 'yauzl';

import {
  MATERIALIZATION_RECEIPT_FILENAME,
  CACHE_REF_BYTES,
  MAX_ASSET_BYTES as MAX_MATERIALIZATION_ASSET_BYTES,
  MAX_DEPTH as MAX_MATERIALIZATION_DEPTH,
  MAX_MATERIALIZATION_ENTRIES,
  MAX_MATERIALIZATION_FILE_BYTES,
  MAX_MATERIALIZATION_TOTAL_FILE_BYTES,
  MAX_MATERIALIZATION_TOTAL_PATH_BYTES,
  MAX_PATH_BYTES as MAX_MATERIALIZATION_PATH_BYTES,
  MAX_SEGMENT_BYTES as MAX_MATERIALIZATION_SEGMENT_BYTES,
  MAX_RECEIPT_BYTES,
  buildMaterializationCacheRefV1,
  buildMaterializationReceiptV1,
  isCanonicalMaterializationPathV1,
  parseCanonicalMaterializationCacheRefV1,
  parseCanonicalMaterializationReceiptV1,
  renderMaterializationCacheRefV1,
  renderMaterializationReceiptV1,
  type MaterializationInventoryEntryV1,
  type MaterializationReceiptV1,
} from './materialization-receipt';
import {
  hashFileHandleSha256,
  inspectTrustedCanonicalCacheDirectory,
  requireTrustedPosixCapabilities,
  sameTrustedPosixFileIdentity,
  type TrustedPosixFilesystemSecurityCapabilities,
  type TrustedPosixLstat,
  type TrustedPosixOpenFile,
  type TrustedPosixRealpath,
} from './trusted-posix-cache';

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
export const DIR_MODE = 0o700;
export const FILE_MODE = 0o600;
export const TEMP_ATTEMPTS = 8;

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

export interface ExtractReleaseArchiveOptions {
  readonly archivePath: string;
  readonly expectedAssetSha256: string;
  readonly expectedAssetBytes: number;
  readonly cacheDirectory: string;
  readonly extractionPolicy: 'safe-zip-v1';
}

export interface ExtractReleaseArchiveResult {
  readonly treePath: string;
  readonly receipt: MaterializationReceiptV1;
  readonly cacheStatus: 'created' | 'reused';
}

export interface ExtractReleaseArchiveFilesystemSecurity
  extends TrustedPosixFilesystemSecurityCapabilities {
  readonly directoryFlag?: number | undefined;
}

export interface ExtractReleaseArchiveDependencies {
  readonly filesystemSecurity?: ExtractReleaseArchiveFilesystemSecurity;
  readonly realpathFile?: TrustedPosixRealpath;
  readonly lstatFile?: TrustedPosixLstat;
  readonly openFile?: TrustedPosixOpenFile;
  readonly mkdirDirectory?: typeof mkdirDirectoryDefault;
  readonly openDirectory?: typeof openDirectoryDefault;
  readonly linkFile?: typeof linkFileDefault;
  readonly unlinkFile?: typeof unlinkFileDefault;
  readonly removeDirectory?: typeof removeDirectoryDefault;
  readonly randomBytes?: (size: number) => Uint8Array;
}

interface SnapshotExtractReleaseArchiveOptions extends ExtractReleaseArchiveOptions {}

interface RequiredExtractReleaseArchiveDependencies {
  readonly filesystemSecurity: ExtractReleaseArchiveFilesystemSecurity;
  readonly realpathFile: TrustedPosixRealpath;
  readonly lstatFile: TrustedPosixLstat;
  readonly openFile: TrustedPosixOpenFile;
  readonly mkdirDirectory: typeof mkdirDirectoryDefault;
  readonly openDirectory: typeof openDirectoryDefault;
  readonly linkFile: typeof linkFileDefault;
  readonly unlinkFile: typeof unlinkFileDefault;
  readonly removeDirectory: typeof removeDirectoryDefault;
  readonly randomBytes: (size: number) => Uint8Array;
}

interface OwnedArchiveV1 {
  readonly handle: FileHandle;
  readonly pathIdentity: BigIntStats;
  closed: boolean;
}

interface TrustedReadResultV1 {
  readonly bytes: Buffer;
  readonly sha256: string;
  readonly identity: BigIntStats;
}

interface VerifiedTreeV1 {
  readonly treePath: string;
  readonly receipt: MaterializationReceiptV1;
  readonly receiptSha256: string;
  readonly identitySnapshot: readonly VerifiedTreeIdentitySnapshotEntryV1[];
}

interface VerifiedStableReferenceV1 {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly bytes: number;
  readonly sha256: string;
}

interface VerifiedPublicationV1 {
  readonly tree: VerifiedTreeV1;
  readonly stableReference: VerifiedStableReferenceV1;
}

interface RetainedTreePathV1 {
  readonly path: string;
  readonly canonicalPath: string;
  readonly kind: VerifiedTreeIdentitySnapshotEntryV1['kind'];
  readonly identity: BigIntStats;
  readonly expectedBytes?: number;
}

interface VerifiedTreeIdentitySnapshotEntryV1 {
  readonly path: string;
  readonly kind: 'root' | 'receipt' | 'directory' | 'file';
  readonly dev: bigint;
  readonly ino: bigint;
  readonly bytes?: number;
}

interface OwnedPathV1 {
  readonly path: string;
  readonly kind: 'file' | 'directory';
  readonly dev: bigint;
  readonly ino: bigint;
}

const LOWER_SHA256_V1 = /^[0-9a-f]{64}$/;
const TREE_BASENAME_V1 = /^\.v103-tree-[0-9a-f]{32}$/;
const EXTRACT_OPTION_KEYS_V1 = [
  'archivePath',
  'cacheDirectory',
  'expectedAssetBytes',
  'expectedAssetSha256',
  'extractionPolicy',
] as const;

function errnoCodeV1(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  try {
    return 'code' in error && typeof error.code === 'string' ? error.code : undefined;
  } catch {
    return undefined;
  }
}

function snapshotExtractReleaseArchiveOptionsV1(
  input: unknown,
): SnapshotExtractReleaseArchiveOptions {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      fail('ERR_SAFE_ZIP_ARGUMENT');
    }
    const record = input as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    if (
      keys.length !== EXTRACT_OPTION_KEYS_V1.length
      || !keys.every((key, index) => key === EXTRACT_OPTION_KEYS_V1[index])
    ) fail('ERR_SAFE_ZIP_ARGUMENT');
    const archivePath = record.archivePath;
    const expectedAssetSha256 = record.expectedAssetSha256;
    const expectedAssetBytes = record.expectedAssetBytes;
    const cacheDirectory = record.cacheDirectory;
    const extractionPolicy = record.extractionPolicy;
    if (
      typeof archivePath !== 'string'
      || typeof expectedAssetSha256 !== 'string'
      || !LOWER_SHA256_V1.test(expectedAssetSha256)
      || typeof expectedAssetBytes !== 'number'
      || !Number.isSafeInteger(expectedAssetBytes)
      || !isSafeZipArchiveBytesV1(BigInt(expectedAssetBytes))
      || typeof cacheDirectory !== 'string'
      || extractionPolicy !== 'safe-zip-v1'
      || !isAbsolute(cacheDirectory)
      || resolve(cacheDirectory) !== cacheDirectory
      || !isAbsolute(archivePath)
      || resolve(archivePath) !== archivePath
      || archivePath !== join(cacheDirectory, `${expectedAssetSha256}.zip`)
      || dirname(archivePath) !== cacheDirectory
    ) fail('ERR_SAFE_ZIP_ARGUMENT');
    return {
      archivePath,
      expectedAssetSha256,
      expectedAssetBytes,
      cacheDirectory,
      extractionPolicy,
    };
  } catch (error) {
    rethrowStable(error, 'ERR_SAFE_ZIP_ARGUMENT');
  }
}

function optionalDependencyV1<T>(value: unknown, fallback: T): T {
  if (value === undefined) return fallback;
  if (typeof value !== 'function') fail('ERR_SAFE_ZIP_ARGUMENT');
  return value as T;
}

function snapshotExtractDependenciesV1(
  input: ExtractReleaseArchiveDependencies | undefined,
): RequiredExtractReleaseArchiveDependencies {
  try {
    if (input !== undefined && (typeof input !== 'object' || input === null || Array.isArray(input))) {
      fail('ERR_SAFE_ZIP_ARGUMENT');
    }
    const record = (input ?? {}) as ExtractReleaseArchiveDependencies;
    const suppliedSecurity = record.filesystemSecurity;
    if (
      suppliedSecurity !== undefined
      && (typeof suppliedSecurity !== 'object' || suppliedSecurity === null || Array.isArray(suppliedSecurity))
    ) fail('ERR_SAFE_ZIP_ARGUMENT');
    const defaultEffectiveUid = typeof process.geteuid === 'function' ? process.geteuid() : undefined;
    return {
      filesystemSecurity: {
        noFollowFlag: suppliedSecurity === undefined ? constants.O_NOFOLLOW : suppliedSecurity.noFollowFlag,
        nonBlockingFlag: suppliedSecurity === undefined
          ? constants.O_NONBLOCK
          : suppliedSecurity.nonBlockingFlag,
        directoryFlag: suppliedSecurity === undefined ? constants.O_DIRECTORY : suppliedSecurity.directoryFlag,
        effectiveUid: suppliedSecurity === undefined ? defaultEffectiveUid : suppliedSecurity.effectiveUid,
      },
      realpathFile: optionalDependencyV1(record.realpathFile, realpathFileDefault),
      lstatFile: optionalDependencyV1(record.lstatFile, lstatFileDefault),
      openFile: optionalDependencyV1(record.openFile, openFileDefault),
      mkdirDirectory: optionalDependencyV1(record.mkdirDirectory, mkdirDirectoryDefault),
      openDirectory: optionalDependencyV1(record.openDirectory, openDirectoryDefault),
      linkFile: optionalDependencyV1(record.linkFile, linkFileDefault),
      unlinkFile: optionalDependencyV1(record.unlinkFile, unlinkFileDefault),
      removeDirectory: optionalDependencyV1(record.removeDirectory, removeDirectoryDefault),
      randomBytes: optionalDependencyV1(record.randomBytes, cryptoRandomBytes),
    };
  } catch (error) {
    rethrowStable(error, 'ERR_SAFE_ZIP_ARGUMENT');
  }
}

async function lstatBigV1(
  dependencies: RequiredExtractReleaseArchiveDependencies,
  path: string,
): Promise<BigIntStats> {
  return dependencies.lstatFile(path, { bigint: true }) as unknown as Promise<BigIntStats>;
}

function exactModeV1(metadata: BigIntStats, mode: number): boolean {
  return Number(metadata.mode & 0o7777n) === mode;
}

function ownedByV1(metadata: BigIntStats, effectiveUid: number): boolean {
  return metadata.uid === BigInt(effectiveUid);
}

function sameIdentityV1(left: BigIntStats, right: BigIntStats): boolean {
  return sameTrustedPosixFileIdentity(left, right);
}

async function closeNonOwnerFileHandleBoundedV1(
  handle: FileHandle,
): Promise<{ readonly firstCloseFailed: boolean }> {
  try {
    await handle.close();
    return { firstCloseFailed: false };
  } catch {
    return { firstCloseFailed: true };
  }
}

async function closeNonOwnerFileHandleBestEffortV1(handle: FileHandle): Promise<void> {
  try { await closeNonOwnerFileHandleBoundedV1(handle); } catch { /* preserve the primary failure */ }
}

async function closeFileHandleV1(handle: FileHandle, code: SafeZipErrorCode): Promise<void> {
  const outcome = await closeNonOwnerFileHandleBoundedV1(handle);
  if (outcome.firstCloseFailed) fail(code);
}

async function closeDirectoryBoundedV1(
  directory: Dir,
): Promise<{ readonly firstCloseFailed: boolean }> {
  try {
    await directory.close();
    return { firstCloseFailed: false };
  } catch {
    let genuineDirectory = false;
    try { genuineDirectory = directory instanceof Dir; } catch { /* stable failure below */ }
    if (genuineDirectory) {
      try {
        await (Dir.prototype.close as (this: Dir) => Promise<void>).call(directory);
      } catch {
        // A first close may have completed before reporting failure. The one
        // branded recovery is best effort and ERR_DIR_CLOSED is acceptable.
      }
    }
    return { firstCloseFailed: true };
  }
}

async function closeDirectoryBestEffortV1(directory: Dir): Promise<void> {
  try { await closeDirectoryBoundedV1(directory); } catch { /* preserve the primary failure */ }
}

async function openOwnedArchiveV1(
  options: SnapshotExtractReleaseArchiveOptions,
  dependencies: RequiredExtractReleaseArchiveDependencies,
  effectiveUid: number,
  readFlags: number,
): Promise<OwnedArchiveV1> {
  let before: BigIntStats;
  try {
    before = await lstatBigV1(dependencies, options.archivePath);
    if (
      !before.isFile()
      || before.size !== BigInt(options.expectedAssetBytes)
      || !ownedByV1(before, effectiveUid)
      || before.nlink !== 1n
    ) fail('ERR_SAFE_ZIP_ARCHIVE_INVALID');
  } catch (error) {
    rethrowStable(error, 'ERR_SAFE_ZIP_ARCHIVE_INVALID');
  }

  let handle: FileHandle;
  try {
    handle = await dependencies.openFile(options.archivePath, readFlags);
  } catch {
    fail('ERR_SAFE_ZIP_ARCHIVE_INVALID');
  }
  const owned: OwnedArchiveV1 = { handle, pathIdentity: before, closed: false };
  try {
    const opened = await handle.stat({ bigint: true });
    if (
      !opened.isFile()
      || opened.size !== BigInt(options.expectedAssetBytes)
      || !ownedByV1(opened, effectiveUid)
      || opened.nlink !== 1n
      || !sameIdentityV1(opened, before)
    ) fail('ERR_SAFE_ZIP_ARCHIVE_MUTATED');
    await verifyArchiveDescriptorV1(owned, options, dependencies, effectiveUid);
    return owned;
  } catch (error) {
    owned.closed = true;
    try { await handle.close(); } catch { /* stable failure below */ }
    rethrowStable(error, 'ERR_SAFE_ZIP_ARCHIVE_MUTATED');
  }
}

async function verifyArchiveDescriptorV1(
  archive: OwnedArchiveV1,
  options: SnapshotExtractReleaseArchiveOptions,
  dependencies: RequiredExtractReleaseArchiveDependencies,
  effectiveUid: number,
): Promise<BigIntStats> {
  if (archive.closed) fail('ERR_SAFE_ZIP_ARCHIVE_MUTATED');
  try {
    const before = await archive.handle.stat({ bigint: true });
    if (
      !before.isFile()
      || before.size !== BigInt(options.expectedAssetBytes)
      || before.nlink !== 1n
      || !ownedByV1(before, effectiveUid)
      || !sameIdentityV1(before, archive.pathIdentity)
    ) fail('ERR_SAFE_ZIP_ARCHIVE_MUTATED');
    const hashed = await hashFileHandleSha256(archive.handle, options.expectedAssetBytes);
    if (
      hashed.status !== 'hashed'
      || hashed.bytesRead !== options.expectedAssetBytes
      || hashed.sha256 !== options.expectedAssetSha256
    ) fail('ERR_SAFE_ZIP_ARCHIVE_MUTATED');
    const after = await archive.handle.stat({ bigint: true });
    const pathAfter = await lstatBigV1(dependencies, options.archivePath);
    if (
      !after.isFile()
      || after.size !== BigInt(options.expectedAssetBytes)
      || after.nlink !== 1n
      || !ownedByV1(after, effectiveUid)
      || !sameIdentityV1(after, before)
      || !sameIdentityV1(after, archive.pathIdentity)
      || !pathAfter.isFile()
      || pathAfter.size !== BigInt(options.expectedAssetBytes)
      || pathAfter.nlink !== 1n
      || !ownedByV1(pathAfter, effectiveUid)
      || !sameIdentityV1(pathAfter, archive.pathIdentity)
    ) fail('ERR_SAFE_ZIP_ARCHIVE_MUTATED');
    return after;
  } catch (error) {
    rethrowStable(error, 'ERR_SAFE_ZIP_ARCHIVE_MUTATED');
  }
}

async function readExactFileHandleV1(
  handle: FileHandle,
  byteLength: number,
  code: SafeZipErrorCode,
): Promise<Buffer> {
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) fail(code);
  const bytes = Buffer.alloc(byteLength);
  let position = 0;
  while (position < byteLength) {
    const length = Math.min(POSITIONAL_READ_CHUNK_BYTES, byteLength - position);
    let bytesRead: number;
    try {
      ({ bytesRead } = await handle.read(bytes, position, length, position));
    } catch {
      fail(code);
    }
    if (!Number.isInteger(bytesRead) || bytesRead <= 0 || bytesRead > length) fail(code);
    position += bytesRead;
  }
  return bytes;
}

async function readTrustedFileV1(
  path: string,
  dependencies: RequiredExtractReleaseArchiveDependencies,
  effectiveUid: number,
  readFlags: number,
  minimumBytes: number,
  maximumBytes: number,
  exactBytes: number | undefined,
  code: SafeZipErrorCode,
  allowTransientSecondLink = false,
): Promise<TrustedReadResultV1> {
  const allowedLinkCount = (value: bigint): boolean => (
    value === 1n || (allowTransientSecondLink && value === 2n)
  );
  let before: BigIntStats;
  try {
    before = await lstatBigV1(dependencies, path);
  } catch {
    fail(code);
  }
  const size = before.size;
  if (
    !before.isFile()
    || !ownedByV1(before, effectiveUid)
    || !allowedLinkCount(before.nlink)
    || !exactModeV1(before, FILE_MODE)
    || size < BigInt(minimumBytes)
    || size > BigInt(maximumBytes)
    || (exactBytes !== undefined && size !== BigInt(exactBytes))
  ) fail(code);
  const byteLength = safeNumberV1(size, code);

  let handle: FileHandle;
  try {
    handle = await dependencies.openFile(path, readFlags);
  } catch {
    fail(code);
  }
  let bytes: Buffer;
  let finalIdentity: BigIntStats;
  try {
    const opened = await handle.stat({ bigint: true });
    if (
      !opened.isFile()
      || opened.size !== size
      || !allowedLinkCount(opened.nlink)
      || !ownedByV1(opened, effectiveUid)
      || !exactModeV1(opened, FILE_MODE)
      || !sameIdentityV1(opened, before)
    ) fail(code);
    bytes = await readExactFileHandleV1(handle, byteLength, code);
    finalIdentity = await handle.stat({ bigint: true });
    if (
      !finalIdentity.isFile()
      || finalIdentity.size !== size
      || !allowedLinkCount(finalIdentity.nlink)
      || !ownedByV1(finalIdentity, effectiveUid)
      || !exactModeV1(finalIdentity, FILE_MODE)
      || !sameIdentityV1(finalIdentity, opened)
    ) fail(code);
  } catch (error) {
    await closeNonOwnerFileHandleBestEffortV1(handle);
    rethrowStable(error, code);
  }
  await closeFileHandleV1(handle, code);
  let after: BigIntStats;
  try {
    after = await lstatBigV1(dependencies, path);
  } catch {
    fail(code);
  }
  if (
    !after.isFile()
    || after.size !== size
    || !allowedLinkCount(after.nlink)
    || !ownedByV1(after, effectiveUid)
    || !exactModeV1(after, FILE_MODE)
    || !sameIdentityV1(after, before)
    || !sameIdentityV1(after, finalIdentity)
  ) fail(code);
  return {
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    identity: after,
  };
}

async function hashTrustedMaterializedFileV1(
  path: string,
  dependencies: RequiredExtractReleaseArchiveDependencies,
  effectiveUid: number,
  readFlags: number,
): Promise<{ readonly bytes: number; readonly sha256: string; readonly identity: BigIntStats }> {
  let before: BigIntStats;
  try {
    before = await lstatBigV1(dependencies, path);
  } catch {
    fail('ERR_SAFE_ZIP_TREE');
  }
  if (
    !before.isFile()
    || before.size < 0n
    || before.size > BigInt(MAX_FILE_BYTES)
    || before.nlink !== 1n
    || !ownedByV1(before, effectiveUid)
    || !exactModeV1(before, FILE_MODE)
  ) fail('ERR_SAFE_ZIP_TREE');
  const bytes = safeNumberV1(before.size, 'ERR_SAFE_ZIP_TREE');
  let handle: FileHandle;
  try {
    handle = await dependencies.openFile(path, readFlags);
  } catch {
    fail('ERR_SAFE_ZIP_TREE');
  }
  let afterHandle: BigIntStats;
  let sha256: string;
  try {
    const opened = await handle.stat({ bigint: true });
    if (
      !opened.isFile()
      || opened.size !== before.size
      || opened.nlink !== 1n
      || !ownedByV1(opened, effectiveUid)
      || !exactModeV1(opened, FILE_MODE)
      || !sameIdentityV1(opened, before)
    ) fail('ERR_SAFE_ZIP_TREE');
    const hashed = await hashFileHandleSha256(handle, bytes);
    if (hashed.status !== 'hashed' || hashed.bytesRead !== bytes) fail('ERR_SAFE_ZIP_TREE');
    sha256 = hashed.sha256;
    afterHandle = await handle.stat({ bigint: true });
    if (
      !afterHandle.isFile()
      || afterHandle.size !== before.size
      || afterHandle.nlink !== 1n
      || !ownedByV1(afterHandle, effectiveUid)
      || !exactModeV1(afterHandle, FILE_MODE)
      || !sameIdentityV1(afterHandle, opened)
    ) fail('ERR_SAFE_ZIP_TREE');
  } catch (error) {
    await closeNonOwnerFileHandleBestEffortV1(handle);
    rethrowStable(error, 'ERR_SAFE_ZIP_TREE');
  }
  await closeFileHandleV1(handle, 'ERR_SAFE_ZIP_TREE');
  let afterPath: BigIntStats;
  try {
    afterPath = await lstatBigV1(dependencies, path);
  } catch {
    fail('ERR_SAFE_ZIP_TREE');
  }
  if (
    !afterPath.isFile()
    || afterPath.size !== before.size
    || afterPath.nlink !== 1n
    || !ownedByV1(afterPath, effectiveUid)
    || !exactModeV1(afterPath, FILE_MODE)
    || !sameIdentityV1(afterPath, before)
    || !sameIdentityV1(afterPath, afterHandle)
  ) fail('ERR_SAFE_ZIP_TREE');
  return { bytes, sha256, identity: afterPath };
}

async function openTrustedDirectoryHandleV1(
  path: string,
  dependencies: RequiredExtractReleaseArchiveDependencies,
  effectiveUid: number,
  directoryReadFlags: number,
  code: SafeZipErrorCode,
): Promise<{ readonly handle: FileHandle; readonly identity: BigIntStats }> {
  let before: BigIntStats;
  try {
    before = await lstatBigV1(dependencies, path);
  } catch {
    fail(code);
  }
  if (!before.isDirectory() || !ownedByV1(before, effectiveUid) || !exactModeV1(before, DIR_MODE)) {
    fail(code);
  }
  let handle: FileHandle;
  try {
    handle = await dependencies.openFile(path, directoryReadFlags);
  } catch {
    fail(code);
  }
  try {
    const opened = await handle.stat({ bigint: true });
    if (
      !opened.isDirectory()
      || !ownedByV1(opened, effectiveUid)
      || !exactModeV1(opened, DIR_MODE)
      || !sameIdentityV1(opened, before)
    ) fail(code);
    return { handle, identity: before };
  } catch (error) {
    await closeNonOwnerFileHandleBestEffortV1(handle);
    rethrowStable(error, code);
  }
}

async function finishTrustedDirectoryHandleV1(
  path: string,
  opened: { readonly handle: FileHandle; readonly identity: BigIntStats },
  dependencies: RequiredExtractReleaseArchiveDependencies,
  effectiveUid: number,
  code: SafeZipErrorCode,
): Promise<void> {
  let handleIdentity: BigIntStats;
  try {
    handleIdentity = await opened.handle.stat({ bigint: true });
    if (
      !handleIdentity.isDirectory()
      || !ownedByV1(handleIdentity, effectiveUid)
      || !exactModeV1(handleIdentity, DIR_MODE)
      || !sameIdentityV1(handleIdentity, opened.identity)
    ) fail(code);
  } catch (error) {
    await closeNonOwnerFileHandleBestEffortV1(opened.handle);
    rethrowStable(error, code);
  }
  await closeFileHandleV1(opened.handle, code);
  let after: BigIntStats;
  try {
    after = await lstatBigV1(dependencies, path);
  } catch {
    fail(code);
  }
  if (
    !after.isDirectory()
    || !ownedByV1(after, effectiveUid)
    || !exactModeV1(after, DIR_MODE)
    || !sameIdentityV1(after, opened.identity)
    || !sameIdentityV1(after, handleIdentity)
  ) fail(code);
}

function entriesMatchV1(
  left: readonly MaterializationInventoryEntryV1[],
  right: readonly MaterializationInventoryEntryV1[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => {
    const other = right[index];
    if (other === undefined || entry.path !== other.path || entry.kind !== other.kind) return false;
    return entry.kind === 'directory'
      || (other.kind === 'file' && entry.bytes === other.bytes && entry.sha256 === other.sha256);
  });
}

function compareAsciiPathV1(
  left: MaterializationInventoryEntryV1,
  right: MaterializationInventoryEntryV1,
): number {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}

async function revalidateRetainedTreePathsV1(
  retained: readonly RetainedTreePathV1[],
  dependencies: RequiredExtractReleaseArchiveDependencies,
  effectiveUid: number,
): Promise<readonly VerifiedTreeIdentitySnapshotEntryV1[]> {
  const snapshot: VerifiedTreeIdentitySnapshotEntryV1[] = [];
  for (const expected of retained) {
    const code: SafeZipErrorCode = expected.kind === 'receipt'
      ? 'ERR_SAFE_ZIP_RECEIPT'
      : 'ERR_SAFE_ZIP_TREE';
    try {
      const current = await lstatBigV1(dependencies, expected.path);
      if (
        !sameIdentityV1(current, expected.identity)
        || !ownedByV1(current, effectiveUid)
        || (expected.kind === 'directory' || expected.kind === 'root'
          ? !current.isDirectory() || !exactModeV1(current, DIR_MODE)
          : !current.isFile()
            || !exactModeV1(current, FILE_MODE)
            || current.nlink !== 1n
            || current.size !== BigInt(expected.expectedBytes!))
      ) fail(code);
      const base = {
        path: expected.canonicalPath,
        kind: expected.kind,
        dev: current.dev,
        ino: current.ino,
      } as const;
      snapshot.push(Object.freeze(
        expected.kind === 'file' || expected.kind === 'receipt'
          ? { ...base, bytes: expected.expectedBytes! }
          : base,
      ));
    } catch (error) {
      rethrowStable(error, code);
    }
  }
  snapshot.sort((left, right) => (
    left.path < right.path ? -1
      : left.path > right.path ? 1
        : left.kind < right.kind ? -1
          : left.kind > right.kind ? 1
            : 0
  ));
  return Object.freeze(snapshot);
}

function identitySnapshotsMatchV1(
  left: readonly VerifiedTreeIdentitySnapshotEntryV1[],
  right: readonly VerifiedTreeIdentitySnapshotEntryV1[],
): boolean {
  return left.length === right.length && left.every((entry, index) => {
    const other = right[index];
    return other !== undefined
      && entry.path === other.path
      && entry.kind === other.kind
      && entry.dev === other.dev
      && entry.ino === other.ino
      && entry.bytes === other.bytes;
  });
}

function sameVerifiedTreeV1(left: VerifiedTreeV1, right: VerifiedTreeV1): boolean {
  return left.treePath === right.treePath
    && left.receiptSha256 === right.receiptSha256
    && identitySnapshotsMatchV1(left.identitySnapshot, right.identitySnapshot)
    && left.receipt.assetSha256 === right.receipt.assetSha256
    && left.receipt.assetBytes === right.receipt.assetBytes
    && left.receipt.inventorySha256 === right.receipt.inventorySha256
    && entriesMatchV1(left.receipt.entries, right.receipt.entries);
}

function sameVerifiedPublicationV1(
  left: VerifiedPublicationV1,
  right: VerifiedPublicationV1,
): boolean {
  return left.stableReference.dev === right.stableReference.dev
    && left.stableReference.ino === right.stableReference.ino
    && left.stableReference.bytes === right.stableReference.bytes
    && left.stableReference.sha256 === right.stableReference.sha256
    && sameVerifiedTreeV1(left.tree, right.tree);
}

async function verifyMaterializedTreeV1(
  treePath: string,
  options: SnapshotExtractReleaseArchiveOptions,
  dependencies: RequiredExtractReleaseArchiveDependencies,
  effectiveUid: number,
  readFlags: number,
  directoryReadFlags: number,
  expectedReceiptSha256?: string,
): Promise<VerifiedTreeV1> {
  if (
    dirname(treePath) !== options.cacheDirectory
    || !TREE_BASENAME_V1.test(basename(treePath))
  ) fail('ERR_SAFE_ZIP_TREE');

  const receiptPath = join(treePath, MATERIALIZATION_RECEIPT_FILENAME);
  const receiptDocument = await readTrustedFileV1(
    receiptPath,
    dependencies,
    effectiveUid,
    readFlags,
    1,
    MAX_RECEIPT_BYTES,
    undefined,
    'ERR_SAFE_ZIP_RECEIPT',
  );
  const parsedReceipt = parseCanonicalMaterializationReceiptV1(receiptDocument.bytes);
  if (
    !parsedReceipt.ok
    || parsedReceipt.value.sha256 !== receiptDocument.sha256
    || (expectedReceiptSha256 !== undefined && parsedReceipt.value.sha256 !== expectedReceiptSha256)
    || parsedReceipt.value.value.assetSha256 !== options.expectedAssetSha256
    || parsedReceipt.value.value.assetBytes !== options.expectedAssetBytes
  ) fail('ERR_SAFE_ZIP_RECEIPT');

  const inventoryBudget = new SafeZipInventoryBudgetV1();
  const collisionPaths = new Map<string, string>();
  const actualEntries: MaterializationInventoryEntryV1[] = [];
  const retainedPaths: RetainedTreePathV1[] = [{
    path: receiptPath,
    canonicalPath: MATERIALIZATION_RECEIPT_FILENAME,
    kind: 'receipt',
    identity: receiptDocument.identity,
    expectedBytes: receiptDocument.bytes.byteLength,
  }];
  const directories: Array<{ readonly absolute: string; readonly relative: string }> = [
    { absolute: treePath, relative: '' },
  ];
  let receiptSeen = false;
  let totalFileBytes = 0n;
  let rootIdentity: BigIntStats | undefined;

  for (let directoryIndex = 0; directoryIndex < directories.length; directoryIndex += 1) {
    const current = directories[directoryIndex]!;
    const opened = await openTrustedDirectoryHandleV1(
      current.absolute,
      dependencies,
      effectiveUid,
      directoryReadFlags,
      'ERR_SAFE_ZIP_TREE',
    );
    if (current.relative === '') rootIdentity = opened.identity;
    retainedPaths.push({
      path: current.absolute,
      canonicalPath: current.relative,
      kind: current.relative === '' ? 'root' : 'directory',
      identity: opened.identity,
    });
    let directory;
    try {
      directory = await dependencies.openDirectory(current.absolute);
    } catch {
      await closeNonOwnerFileHandleBestEffortV1(opened.handle);
      fail('ERR_SAFE_ZIP_TREE');
    }
    let directoryFailed = false;
    try {
      while (true) {
        const entry = await directory.read();
        if (entry === null) break;
        const relativePath = current.relative === ''
          ? entry.name
          : `${current.relative}/${entry.name}`;
        if (current.relative === '' && entry.name === MATERIALIZATION_RECEIPT_FILENAME) {
          if (receiptSeen) fail('ERR_SAFE_ZIP_TREE');
          receiptSeen = true;
          continue;
        }
        if (!isCanonicalMaterializationPathV1(relativePath)) fail('ERR_SAFE_ZIP_TREE');
        const collisionKey = asciiFoldV1(relativePath);
        const priorPath = collisionPaths.get(collisionKey);
        if (priorPath !== undefined && priorPath !== relativePath) fail('ERR_SAFE_ZIP_TREE');
        collisionPaths.set(collisionKey, relativePath);
        inventoryBudget.reservePath(relativePath);

        const absolutePath = join(treePath, ...relativePath.split('/'));
        if (dirname(absolutePath) === absolutePath || !absolutePath.startsWith(`${treePath}/`)) {
          fail('ERR_SAFE_ZIP_TREE');
        }
        let metadata: BigIntStats;
        try {
          metadata = await lstatBigV1(dependencies, absolutePath);
        } catch {
          fail('ERR_SAFE_ZIP_TREE');
        }
        if (metadata.isDirectory()) {
          if (!ownedByV1(metadata, effectiveUid) || !exactModeV1(metadata, DIR_MODE)) {
            fail('ERR_SAFE_ZIP_TREE');
          }
          actualEntries.push({ path: relativePath, kind: 'directory' });
          directories.push({ absolute: absolutePath, relative: relativePath });
          continue;
        }
        if (!metadata.isFile()) fail('ERR_SAFE_ZIP_TREE');
        totalFileBytes += metadata.size;
        if (!isSafeZipTotalUncompressedBytesV1(totalFileBytes)) fail('ERR_SAFE_ZIP_TREE');
        const hashed = await hashTrustedMaterializedFileV1(
          absolutePath,
          dependencies,
          effectiveUid,
          readFlags,
        );
        retainedPaths.push({
          path: absolutePath,
          canonicalPath: relativePath,
          kind: 'file',
          identity: hashed.identity,
          expectedBytes: hashed.bytes,
        });
        actualEntries.push({
          path: relativePath,
          kind: 'file',
          bytes: hashed.bytes,
          sha256: hashed.sha256,
        });
      }
    } catch (error) {
      directoryFailed = true;
      await closeDirectoryBestEffortV1(directory);
      await closeNonOwnerFileHandleBestEffortV1(opened.handle);
      rethrowStable(error, 'ERR_SAFE_ZIP_TREE');
    }
    if (!directoryFailed) {
      const directoryClose = await closeDirectoryBoundedV1(directory);
      if (directoryClose.firstCloseFailed) {
        await closeNonOwnerFileHandleBestEffortV1(opened.handle);
        fail('ERR_SAFE_ZIP_TREE');
      }
      await finishTrustedDirectoryHandleV1(
        current.absolute,
        opened,
        dependencies,
        effectiveUid,
        'ERR_SAFE_ZIP_TREE',
      );
    }
  }

  if (!receiptSeen || rootIdentity === undefined) fail('ERR_SAFE_ZIP_TREE');
  actualEntries.sort(compareAsciiPathV1);
  const rebuilt = buildMaterializationReceiptV1({
    assetSha256: options.expectedAssetSha256,
    assetBytes: options.expectedAssetBytes,
    entries: actualEntries,
  });
  if (!rebuilt.ok || !entriesMatchV1(rebuilt.value.entries, actualEntries)) fail('ERR_SAFE_ZIP_TREE');
  const rendered = renderMaterializationReceiptV1(rebuilt.value);
  if (
    !rendered.ok
    || rendered.value.text !== receiptDocument.bytes.toString('utf8')
    || rendered.value.sha256 !== parsedReceipt.value.sha256
    || !entriesMatchV1(rendered.value.value.entries, parsedReceipt.value.value.entries)
  ) fail('ERR_SAFE_ZIP_RECEIPT');

  const identitySnapshot = await revalidateRetainedTreePathsV1(
    retainedPaths,
    dependencies,
    effectiveUid,
  );

  let finalRoot: BigIntStats;
  try {
    finalRoot = await lstatBigV1(dependencies, treePath);
  } catch {
    fail('ERR_SAFE_ZIP_TREE');
  }
  if (
    !finalRoot.isDirectory()
    || !ownedByV1(finalRoot, effectiveUid)
    || !exactModeV1(finalRoot, DIR_MODE)
    || !sameIdentityV1(finalRoot, rootIdentity)
  ) fail('ERR_SAFE_ZIP_TREE');
  return {
    treePath,
    receipt: rendered.value.value,
    receiptSha256: rendered.value.sha256,
    identitySnapshot,
  };
}

async function verifyPublishedReferenceV1(
  referencePath: string,
  options: SnapshotExtractReleaseArchiveOptions,
  dependencies: RequiredExtractReleaseArchiveDependencies,
  effectiveUid: number,
  readFlags: number,
  directoryReadFlags: number,
  allowTransientSecondReferenceLink = false,
): Promise<VerifiedPublicationV1> {
  const referenceDocument = await readTrustedFileV1(
    referencePath,
    dependencies,
    effectiveUid,
    readFlags,
    CACHE_REF_BYTES,
    CACHE_REF_BYTES,
    CACHE_REF_BYTES,
    'ERR_SAFE_ZIP_PUBLICATION',
    allowTransientSecondReferenceLink,
  );
  const parsedReference = parseCanonicalMaterializationCacheRefV1(referenceDocument.bytes);
  if (!parsedReference.ok || parsedReference.value.sha256 !== referenceDocument.sha256) {
    fail('ERR_SAFE_ZIP_PUBLICATION');
  }
  const treePath = join(options.cacheDirectory, parsedReference.value.value.treeBasename);
  if (
    dirname(treePath) !== options.cacheDirectory
    || basename(treePath) !== parsedReference.value.value.treeBasename
  ) fail('ERR_SAFE_ZIP_PUBLICATION');
  const tree = await verifyMaterializedTreeV1(
    treePath,
    options,
    dependencies,
    effectiveUid,
    readFlags,
    directoryReadFlags,
    parsedReference.value.value.receiptSha256,
  );
  let stableReference: VerifiedStableReferenceV1;
  try {
    const referenceAfter = await lstatBigV1(dependencies, referencePath);
    if (
      !referenceAfter.isFile()
      || referenceAfter.size !== BigInt(CACHE_REF_BYTES)
      || (referenceAfter.nlink !== 1n
        && (!allowTransientSecondReferenceLink || referenceAfter.nlink !== 2n))
      || !ownedByV1(referenceAfter, effectiveUid)
      || !exactModeV1(referenceAfter, FILE_MODE)
      || !sameIdentityV1(referenceAfter, referenceDocument.identity)
    ) fail('ERR_SAFE_ZIP_PUBLICATION');
    stableReference = Object.freeze({
      dev: referenceAfter.dev,
      ino: referenceAfter.ino,
      bytes: CACHE_REF_BYTES,
      sha256: referenceDocument.sha256,
    });
  } catch (error) {
    rethrowStable(error, 'ERR_SAFE_ZIP_PUBLICATION');
  }
  return Object.freeze({ tree, stableReference });
}

async function stableReferenceExistsV1(
  referencePath: string,
  dependencies: RequiredExtractReleaseArchiveDependencies,
): Promise<boolean> {
  try {
    await lstatBigV1(dependencies, referencePath);
    return true;
  } catch (error) {
    if (errnoCodeV1(error) === 'ENOENT') return false;
    fail('ERR_SAFE_ZIP_PUBLICATION');
  }
}

function randomHexTokenV1(
  dependencies: RequiredExtractReleaseArchiveDependencies,
  code: SafeZipErrorCode,
): string {
  try {
    const bytes = dependencies.randomBytes(16);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== 16) fail(code);
    return Buffer.from(bytes).toString('hex');
  } catch (error) {
    rethrowStable(error, code);
  }
}

async function createPrivateDirectoryV1(
  path: string,
  owned: OwnedPathV1[],
  dependencies: RequiredExtractReleaseArchiveDependencies,
  effectiveUid: number,
  directoryReadFlags: number,
  code: SafeZipErrorCode,
): Promise<void> {
  try {
    await dependencies.mkdirDirectory(path, { mode: DIR_MODE });
  } catch (error) {
    if (errnoCodeV1(error) === 'EEXIST') throw error;
    fail(code);
  }
  let handle: FileHandle;
  try {
    handle = await dependencies.openFile(path, directoryReadFlags);
  } catch {
    fail(code);
  }
  let openedIdentity: BigIntStats;
  try {
    await handle.chmod(DIR_MODE);
    const metadata = await handle.stat({ bigint: true });
    if (!metadata.isDirectory() || !ownedByV1(metadata, effectiveUid) || !exactModeV1(metadata, DIR_MODE)) {
      fail(code);
    }
    openedIdentity = metadata;
  } catch (error) {
    await closeNonOwnerFileHandleBestEffortV1(handle);
    rethrowStable(error, code);
  }
  await closeFileHandleV1(handle, code);
  let pathAfterClose: BigIntStats;
  try {
    pathAfterClose = await lstatBigV1(dependencies, path);
    if (
      !pathAfterClose.isDirectory()
      || !ownedByV1(pathAfterClose, effectiveUid)
      || !exactModeV1(pathAfterClose, DIR_MODE)
      || !sameIdentityV1(pathAfterClose, openedIdentity)
    ) fail(code);
  } catch (error) {
    rethrowStable(error, code);
  }
  owned.push({
    path,
    kind: 'directory',
    dev: openedIdentity.dev,
    ino: openedIdentity.ino,
  });
}

async function createRandomTreeV1(
  options: SnapshotExtractReleaseArchiveOptions,
  owned: OwnedPathV1[],
  dependencies: RequiredExtractReleaseArchiveDependencies,
  effectiveUid: number,
  directoryReadFlags: number,
): Promise<string> {
  for (let attempt = 0; attempt < TEMP_ATTEMPTS; attempt += 1) {
    const path = join(options.cacheDirectory, `.v103-tree-${randomHexTokenV1(dependencies, 'ERR_SAFE_ZIP_TREE')}`);
    try {
      await createPrivateDirectoryV1(
        path,
        owned,
        dependencies,
        effectiveUid,
        directoryReadFlags,
        'ERR_SAFE_ZIP_TREE',
      );
      return path;
    } catch (error) {
      if (errnoCodeV1(error) === 'EEXIST') continue;
      rethrowStable(error, 'ERR_SAFE_ZIP_TREE');
    }
  }
  fail('ERR_SAFE_ZIP_TREE');
}

async function writeAllV1(
  handle: FileHandle,
  bytes: Uint8Array,
  startPosition: number,
  code: SafeZipErrorCode,
): Promise<number> {
  let offset = 0;
  while (offset < bytes.byteLength) {
    let bytesWritten: number;
    try {
      ({ bytesWritten } = await handle.write(bytes, offset, bytes.byteLength - offset, startPosition + offset));
    } catch {
      fail(code);
    }
    if (!Number.isInteger(bytesWritten) || bytesWritten <= 0 || bytesWritten > bytes.byteLength - offset) {
      fail(code);
    }
    offset += bytesWritten;
  }
  return offset;
}

async function openExclusiveOutputV1(
  path: string,
  dependencies: RequiredExtractReleaseArchiveDependencies,
  effectiveUid: number,
  outputFlags: number,
  owned: OwnedPathV1[],
  code: SafeZipErrorCode,
): Promise<FileHandle> {
  let handle: FileHandle;
  try {
    handle = await dependencies.openFile(path, outputFlags, FILE_MODE);
  } catch (error) {
    if (errnoCodeV1(error) === 'EEXIST') throw error;
    fail(code);
  }
  try {
    await handle.chmod(FILE_MODE);
    const metadata = await handle.stat({ bigint: true });
    if (
      !metadata.isFile()
      || metadata.nlink !== 1n
      || !ownedByV1(metadata, effectiveUid)
      || !exactModeV1(metadata, FILE_MODE)
    ) fail(code);
    owned.push({ path, kind: 'file', dev: metadata.dev, ino: metadata.ino });
    return handle;
  } catch (error) {
    await closeNonOwnerFileHandleBestEffortV1(handle);
    rethrowStable(error, code);
  }
}

async function writeExclusiveSyncedFileV1(
  path: string,
  bytes: Uint8Array,
  dependencies: RequiredExtractReleaseArchiveDependencies,
  effectiveUid: number,
  outputFlags: number,
  owned: OwnedPathV1[],
  code: SafeZipErrorCode,
): Promise<void> {
  const handle = await openExclusiveOutputV1(
    path,
    dependencies,
    effectiveUid,
    outputFlags,
    owned,
    code,
  );
  try {
    await writeAllV1(handle, bytes, 0, code);
    const metadata = await handle.stat({ bigint: true });
    if (metadata.size !== BigInt(bytes.byteLength) || metadata.nlink !== 1n) fail(code);
    await handle.sync();
  } catch (error) {
    await closeNonOwnerFileHandleBestEffortV1(handle);
    rethrowStable(error, code);
  }
  await closeFileHandleV1(handle, code);
}

async function syncTrustedDirectoryV1(
  path: string,
  dependencies: RequiredExtractReleaseArchiveDependencies,
  effectiveUid: number,
  directoryReadFlags: number,
  code: SafeZipErrorCode,
): Promise<void> {
  const opened = await openTrustedDirectoryHandleV1(
    path,
    dependencies,
    effectiveUid,
    directoryReadFlags,
    code,
  );
  try {
    await opened.handle.sync();
  } catch (error) {
    await closeNonOwnerFileHandleBestEffortV1(opened.handle);
    rethrowStable(error, code);
  }
  await finishTrustedDirectoryHandleV1(path, opened, dependencies, effectiveUid, code);
}

function isPrivateCacheDirectoryV1(metadata: BigIntStats, effectiveUid: number): boolean {
  return metadata.isDirectory()
    && ownedByV1(metadata, effectiveUid)
    && (metadata.mode & 0o077n) === 0n;
}

async function syncTrustedCacheDirectoryV1(
  cacheDirectory: string,
  dependencies: RequiredExtractReleaseArchiveDependencies,
  effectiveUid: number,
  directoryReadFlags: number,
): Promise<void> {
  try {
    const trusted = await inspectTrustedCanonicalCacheDirectory(
      cacheDirectory,
      effectiveUid,
      dependencies.realpathFile,
      dependencies.lstatFile,
    );
    if (trusted.status !== 'trusted' || trusted.path !== cacheDirectory) {
      fail('ERR_SAFE_ZIP_CACHE_UNTRUSTED');
    }
    const before = await lstatBigV1(dependencies, cacheDirectory);
    if (!isPrivateCacheDirectoryV1(before, effectiveUid)) fail('ERR_SAFE_ZIP_CACHE_UNTRUSTED');
    const handle = await dependencies.openFile(cacheDirectory, directoryReadFlags);
    try {
      const opened = await handle.stat({ bigint: true });
      if (!isPrivateCacheDirectoryV1(opened, effectiveUid) || !sameIdentityV1(opened, before)) {
        fail('ERR_SAFE_ZIP_CACHE_UNTRUSTED');
      }
      await handle.sync();
      const afterSync = await handle.stat({ bigint: true });
      if (!isPrivateCacheDirectoryV1(afterSync, effectiveUid) || !sameIdentityV1(afterSync, opened)) {
        fail('ERR_SAFE_ZIP_CACHE_UNTRUSTED');
      }
    } catch (error) {
      await closeNonOwnerFileHandleBestEffortV1(handle);
      rethrowStable(error, 'ERR_SAFE_ZIP_PUBLICATION');
    }
    await closeFileHandleV1(handle, 'ERR_SAFE_ZIP_PUBLICATION');
    const after = await lstatBigV1(dependencies, cacheDirectory);
    if (!isPrivateCacheDirectoryV1(after, effectiveUid) || !sameIdentityV1(after, before)) {
      fail('ERR_SAFE_ZIP_CACHE_UNTRUSTED');
    }
  } catch (error) {
    rethrowStable(error, 'ERR_SAFE_ZIP_PUBLICATION');
  }
}

async function unlinkOwnedFileV1(
  owned: OwnedPathV1,
  dependencies: RequiredExtractReleaseArchiveDependencies,
): Promise<boolean> {
  try {
    const current = await lstatBigV1(dependencies, owned.path);
    if (!current.isFile() || current.dev !== owned.dev || current.ino !== owned.ino) return false;
    await dependencies.unlinkFile(owned.path);
    return true;
  } catch (error) {
    return errnoCodeV1(error) === 'ENOENT';
  }
}

async function cleanupOwnedPathsV1(
  owned: readonly OwnedPathV1[],
  dependencies: RequiredExtractReleaseArchiveDependencies,
): Promise<void> {
  for (let index = owned.length - 1; index >= 0; index -= 1) {
    const candidate = owned[index]!;
    try {
      const current = await lstatBigV1(dependencies, candidate.path);
      if (
        current.dev !== candidate.dev
        || current.ino !== candidate.ino
        || (candidate.kind === 'file' ? !current.isFile() : !current.isDirectory())
      ) continue;
      if (candidate.kind === 'file') await dependencies.unlinkFile(candidate.path);
      else await dependencies.removeDirectory(candidate.path);
    } catch {
      // An uncertain cleanup intentionally leaves a safe, unreferenced orphan.
    }
  }
}

async function recordedPathStillOwnedV1(
  candidate: OwnedPathV1,
  dependencies: RequiredExtractReleaseArchiveDependencies,
): Promise<boolean> {
  try {
    const current = await lstatBigV1(dependencies, candidate.path);
    return current.dev === candidate.dev
      && current.ino === candidate.ino
      && (candidate.kind === 'file' ? current.isFile() : current.isDirectory());
  } catch {
    return false;
  }
}

async function recordedAncestorChainStillOwnedV1(
  ancestors: readonly OwnedPathV1[],
  dependencies: RequiredExtractReleaseArchiveDependencies,
): Promise<boolean> {
  for (const ancestor of ancestors) {
    if (!await recordedPathStillOwnedV1(ancestor, dependencies)) return false;
  }
  return true;
}

async function cleanupOwnedTreePathsV1(
  owned: readonly OwnedPathV1[],
  dependencies: RequiredExtractReleaseArchiveDependencies,
): Promise<void> {
  const directories = new Map<string, OwnedPathV1>();
  for (const candidate of owned) {
    if (candidate.kind === 'directory') directories.set(candidate.path, candidate);
  }
  const roots = [...directories.values()].filter((candidate) => !directories.has(dirname(candidate.path)));
  if (roots.length !== 1) return;
  const root = roots[0]!;
  const children = new Map<string, OwnedPathV1[]>();
  for (const candidate of owned) {
    if (candidate.path === root.path) continue;
    const parent = dirname(candidate.path);
    if (!directories.has(parent)) continue;
    const siblings = children.get(parent) ?? [];
    siblings.push(candidate);
    children.set(parent, siblings);
  }
  for (const siblings of children.values()) {
    siblings.sort((left, right) => right.path < left.path ? -1 : right.path > left.path ? 1 : 0);
  }

  const cleanupDirectory = async (
    directory: OwnedPathV1,
    ancestors: readonly OwnedPathV1[],
  ): Promise<void> => {
    const chain = [...ancestors, directory];
    if (chain.length > MAX_DEPTH + 1 || !await recordedAncestorChainStillOwnedV1(chain, dependencies)) {
      return;
    }
    for (const child of children.get(directory.path) ?? []) {
      // Recheck the complete root-to-current chain before even inspecting a
      // child. A replacement or uncertainty stops this entire subtree.
      if (!await recordedAncestorChainStillOwnedV1(chain, dependencies)) return;
      if (child.kind === 'directory') {
        await cleanupDirectory(child, chain);
        continue;
      }
      if (!await recordedPathStillOwnedV1(child, dependencies)) continue;
      if (!await recordedAncestorChainStillOwnedV1(chain, dependencies)) return;
      if (!await recordedPathStillOwnedV1(child, dependencies)) continue;
      try {
        await dependencies.unlinkFile(child.path);
      } catch {
        // Leave an identity-uncertain or busy descendant as a safe orphan.
      }
    }
    if (!await recordedAncestorChainStillOwnedV1(chain, dependencies)) return;
    try {
      await dependencies.removeDirectory(directory.path);
    } catch {
      // Nonempty, replaced, or otherwise uncertain directories are preserved.
    }
  };

  await cleanupDirectory(root, []);
}

async function extractUnpublishedTreeV1(
  archive: OwnedArchiveV1,
  options: SnapshotExtractReleaseArchiveOptions,
  dependencies: RequiredExtractReleaseArchiveDependencies,
  effectiveUid: number,
  outputFlags: number,
  readFlags: number,
  directoryReadFlags: number,
  ownedTreePaths: OwnedPathV1[],
): Promise<VerifiedTreeV1> {
  const opened = await openValidatedSafeZipV1FromBorrowedHandle(
    archive.handle,
    options.expectedAssetBytes,
  );
  let releaseRequired = true;
  try {
    const treePath = await createRandomTreeV1(
      options,
      ownedTreePaths,
      dependencies,
      effectiveUid,
      directoryReadFlags,
    );
    const inventoryEntries: MaterializationInventoryEntryV1[] = [];
    const directoryPaths = opened.index.inventory
      .filter((entry) => entry.kind === 'directory')
      .map((entry) => entry.path)
      .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
    for (const relativePath of directoryPaths) {
      const path = join(treePath, ...relativePath.split('/'));
      if (!path.startsWith(`${treePath}/`)) fail('ERR_SAFE_ZIP_TREE');
      try {
        await createPrivateDirectoryV1(
          path,
          ownedTreePaths,
          dependencies,
          effectiveUid,
          directoryReadFlags,
          'ERR_SAFE_ZIP_TREE',
        );
      } catch (error) {
        rethrowStable(error, 'ERR_SAFE_ZIP_TREE');
      }
      inventoryEntries.push({ path: relativePath, kind: 'directory' });
    }

    let remainingTotalBytes = MAX_TOTAL_UNCOMPRESSED_BYTES;
    const fileEntries = opened.index.archiveEntries
      .filter((entry) => entry.kind === 'file')
      .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
    for (const entry of fileEntries) {
      const path = join(treePath, ...entry.path.split('/'));
      if (!path.startsWith(`${treePath}/`)) fail('ERR_SAFE_ZIP_TREE');
      const output = await openExclusiveOutputV1(
        path,
        dependencies,
        effectiveUid,
        outputFlags,
        ownedTreePaths,
        'ERR_SAFE_ZIP_TREE',
      );
      let position = 0;
      let validated: ValidatedSafeZipEntryContentV1;
      try {
        validated = await opened.validateEntryContent(entry, {
          maxTotalUncompressedBytes: remainingTotalBytes,
          onChunk: async (chunk) => {
            position += await writeAllV1(output, chunk, position, 'ERR_SAFE_ZIP_STREAM');
          },
        });
        const metadata = await output.stat({ bigint: true });
        if (
          metadata.size !== BigInt(entry.uncompressedBytes)
          || metadata.nlink !== 1n
          || !ownedByV1(metadata, effectiveUid)
          || !exactModeV1(metadata, FILE_MODE)
        ) fail('ERR_SAFE_ZIP_TREE');
        await output.sync();
      } catch (error) {
        await closeNonOwnerFileHandleBestEffortV1(output);
        rethrowStable(error, 'ERR_SAFE_ZIP_STREAM');
      }
      await closeFileHandleV1(output, 'ERR_SAFE_ZIP_TREE');
      remainingTotalBytes = validated.remainingTotalUncompressedBytes;
      inventoryEntries.push({
        path: entry.path,
        kind: 'file',
        bytes: validated.bytes,
        sha256: validated.sha256,
      });
    }

    await opened.release();
    releaseRequired = false;
    const receipt = buildMaterializationReceiptV1({
      assetSha256: options.expectedAssetSha256,
      assetBytes: options.expectedAssetBytes,
      entries: inventoryEntries,
    });
    if (!receipt.ok) fail('ERR_SAFE_ZIP_RECEIPT');
    const renderedReceipt = renderMaterializationReceiptV1(receipt.value);
    if (!renderedReceipt.ok) fail('ERR_SAFE_ZIP_RECEIPT');
    const receiptPath = join(treePath, MATERIALIZATION_RECEIPT_FILENAME);
    await writeExclusiveSyncedFileV1(
      receiptPath,
      Buffer.from(renderedReceipt.value.text, 'utf8'),
      dependencies,
      effectiveUid,
      outputFlags,
      ownedTreePaths,
      'ERR_SAFE_ZIP_RECEIPT',
    );

    const verifiedBeforeSync = await verifyMaterializedTreeV1(
      treePath,
      options,
      dependencies,
      effectiveUid,
      readFlags,
      directoryReadFlags,
      renderedReceipt.value.sha256,
    );
    for (const relativePath of [...directoryPaths].sort((left, right) => {
      const depth = right.split('/').length - left.split('/').length;
      return depth !== 0 ? depth : right < left ? -1 : right > left ? 1 : 0;
    })) {
      await syncTrustedDirectoryV1(
        join(treePath, ...relativePath.split('/')),
        dependencies,
        effectiveUid,
        directoryReadFlags,
        'ERR_SAFE_ZIP_TREE',
      );
    }
    await syncTrustedDirectoryV1(
      treePath,
      dependencies,
      effectiveUid,
      directoryReadFlags,
      'ERR_SAFE_ZIP_TREE',
    );
    await syncTrustedCacheDirectoryV1(
      options.cacheDirectory,
      dependencies,
      effectiveUid,
      directoryReadFlags,
    );
    const verifiedAfterSync = await verifyMaterializedTreeV1(
      treePath,
      options,
      dependencies,
      effectiveUid,
      readFlags,
      directoryReadFlags,
      renderedReceipt.value.sha256,
    );
    if (!sameVerifiedTreeV1(verifiedBeforeSync, verifiedAfterSync)) fail('ERR_SAFE_ZIP_TREE');
    return verifiedAfterSync;
  } catch (error) {
    rethrowStable(error, 'ERR_SAFE_ZIP_STREAM');
  } finally {
    if (releaseRequired) {
      try { await opened.release(); } catch { /* retain the primary stable failure */ }
    }
  }
  fail('ERR_SAFE_ZIP_STREAM');
}

async function createTemporaryReferenceV1(
  options: SnapshotExtractReleaseArchiveOptions,
  referenceBytes: Buffer,
  dependencies: RequiredExtractReleaseArchiveDependencies,
  effectiveUid: number,
  outputFlags: number,
  ownedTemporaryPaths: OwnedPathV1[],
): Promise<OwnedPathV1> {
  for (let attempt = 0; attempt < TEMP_ATTEMPTS; attempt += 1) {
    const path = join(
      options.cacheDirectory,
      `.v103-ref-${randomHexTokenV1(dependencies, 'ERR_SAFE_ZIP_PUBLICATION')}.tmp`,
    );
    try {
      await writeExclusiveSyncedFileV1(
        path,
        referenceBytes,
        dependencies,
        effectiveUid,
        outputFlags,
        ownedTemporaryPaths,
        'ERR_SAFE_ZIP_PUBLICATION',
      );
      return ownedTemporaryPaths[ownedTemporaryPaths.length - 1]!;
    } catch (error) {
      if (errnoCodeV1(error) === 'EEXIST') continue;
      rethrowStable(error, 'ERR_SAFE_ZIP_PUBLICATION');
    }
  }
  fail('ERR_SAFE_ZIP_PUBLICATION');
}

async function materializeOrReuseV1(
  archive: OwnedArchiveV1,
  options: SnapshotExtractReleaseArchiveOptions,
  dependencies: RequiredExtractReleaseArchiveDependencies,
  effectiveUid: number,
  readFlags: number,
  outputFlags: number,
  directoryReadFlags: number,
): Promise<ExtractReleaseArchiveResult> {
  const referencePath = join(
    options.cacheDirectory,
    `${options.expectedAssetSha256}.safe-zip-v1.ref.json`,
  );
  if (await stableReferenceExistsV1(referencePath, dependencies)) {
    const firstReuse = await verifyPublishedReferenceV1(
      referencePath,
      options,
      dependencies,
      effectiveUid,
      readFlags,
      directoryReadFlags,
      true,
    );
    await verifyArchiveDescriptorV1(archive, options, dependencies, effectiveUid);
    const reused = await verifyPublishedReferenceV1(
      referencePath,
      options,
      dependencies,
      effectiveUid,
      readFlags,
      directoryReadFlags,
    );
    if (!sameVerifiedPublicationV1(firstReuse, reused)) fail('ERR_SAFE_ZIP_PUBLICATION');
    await verifyArchiveDescriptorV1(archive, options, dependencies, effectiveUid);
    return {
      treePath: reused.tree.treePath,
      receipt: reused.tree.receipt,
      cacheStatus: 'reused',
    };
  }

  const ownedTreePaths: OwnedPathV1[] = [];
  const ownedTemporaryPaths: OwnedPathV1[] = [];
  let treePublished = false;
  try {
    const candidate = await extractUnpublishedTreeV1(
      archive,
      options,
      dependencies,
      effectiveUid,
      outputFlags,
      readFlags,
      directoryReadFlags,
      ownedTreePaths,
    );
    await verifyArchiveDescriptorV1(archive, options, dependencies, effectiveUid);
    const reference = buildMaterializationCacheRefV1({
      treeBasename: basename(candidate.treePath),
      receiptSha256: candidate.receiptSha256,
    });
    if (!reference.ok) fail('ERR_SAFE_ZIP_PUBLICATION');
    const renderedReference = renderMaterializationCacheRefV1(reference.value);
    if (!renderedReference.ok) fail('ERR_SAFE_ZIP_PUBLICATION');
    const temporaryReference = await createTemporaryReferenceV1(
      options,
      Buffer.from(renderedReference.value.text, 'utf8'),
      dependencies,
      effectiveUid,
      outputFlags,
      ownedTemporaryPaths,
    );

    await verifyArchiveDescriptorV1(archive, options, dependencies, effectiveUid);
    const candidateImmediatelyBeforeLink = await verifyMaterializedTreeV1(
      candidate.treePath,
      options,
      dependencies,
      effectiveUid,
      readFlags,
      directoryReadFlags,
      candidate.receiptSha256,
    );
    if (!sameVerifiedTreeV1(candidate, candidateImmediatelyBeforeLink)) {
      fail('ERR_SAFE_ZIP_TREE');
    }

    let wonPublication = false;
    let linkReportedFailureAfterPublication = false;
    let authoritativeEexist = false;
    let verifiedEexistWinner: VerifiedPublicationV1 | undefined;
    try {
      await dependencies.linkFile(temporaryReference.path, referencePath);
      wonPublication = true;
      treePublished = true;
    } catch (error) {
      // A thrown hard-link call has an uncertain syscall outcome. Ownership
      // transfers conservatively until an authoritative EEXIST winner is
      // fully verified as both a different reference and a different tree.
      treePublished = true;
      const linkErrorCode = errnoCodeV1(error);
      let stableReference: BigIntStats | undefined;
      try {
        stableReference = await lstatBigV1(dependencies, referencePath);
      } catch (inspectionError) {
        if (errnoCodeV1(inspectionError) !== 'ENOENT') {
          // The hard-link outcome is uncertain. Preserve the candidate tree;
          // cleanup may never delete content that a completed link references.
          treePublished = true;
          fail('ERR_SAFE_ZIP_PUBLICATION');
        }
      }
      let completedLink = false;
      try {
        completedLink = stableReference !== undefined
          && stableReference.isFile()
          && stableReference.dev === temporaryReference.dev
          && stableReference.ino === temporaryReference.ino;
      } catch {
        treePublished = true;
        fail('ERR_SAFE_ZIP_PUBLICATION');
      }
      if (completedLink) {
        // The syscall completed before reporting an error. Ownership transfers
        // at the instant this identity match is observed.
        treePublished = true;
        wonPublication = true;
        linkReportedFailureAfterPublication = true;
      } else if (linkErrorCode === 'EEXIST') {
        authoritativeEexist = true;
      } else {
        fail('ERR_SAFE_ZIP_PUBLICATION');
      }
    }

    if (!wonPublication && authoritativeEexist) {
      verifiedEexistWinner = await verifyPublishedReferenceV1(
        referencePath,
        options,
        dependencies,
        effectiveUid,
        readFlags,
        directoryReadFlags,
        true,
      );
      if (
        verifiedEexistWinner.stableReference.dev === temporaryReference.dev
        && verifiedEexistWinner.stableReference.ino === temporaryReference.ino
      ) {
        wonPublication = true;
        linkReportedFailureAfterPublication = true;
      }
    }

    if (wonPublication) {
      await syncTrustedCacheDirectoryV1(
        options.cacheDirectory,
        dependencies,
        effectiveUid,
        directoryReadFlags,
      );
      if (!await unlinkOwnedFileV1(temporaryReference, dependencies)) {
        fail('ERR_SAFE_ZIP_PUBLICATION');
      }
      await syncTrustedCacheDirectoryV1(
        options.cacheDirectory,
        dependencies,
        effectiveUid,
        directoryReadFlags,
      );
      const firstPublished = await verifyPublishedReferenceV1(
        referencePath,
        options,
        dependencies,
        effectiveUid,
        readFlags,
        directoryReadFlags,
      );
      if (
        firstPublished.stableReference.dev !== temporaryReference.dev
        || firstPublished.stableReference.ino !== temporaryReference.ino
        || firstPublished.stableReference.bytes !== CACHE_REF_BYTES
        || firstPublished.stableReference.sha256 !== renderedReference.value.sha256
        || !sameVerifiedTreeV1(firstPublished.tree, candidateImmediatelyBeforeLink)
      ) fail('ERR_SAFE_ZIP_PUBLICATION');
      await verifyArchiveDescriptorV1(archive, options, dependencies, effectiveUid);
      const published = await verifyPublishedReferenceV1(
        referencePath,
        options,
        dependencies,
        effectiveUid,
        readFlags,
        directoryReadFlags,
      );
      if (!sameVerifiedPublicationV1(firstPublished, published)) fail('ERR_SAFE_ZIP_PUBLICATION');
      await verifyArchiveDescriptorV1(archive, options, dependencies, effectiveUid);
      if (linkReportedFailureAfterPublication) fail('ERR_SAFE_ZIP_PUBLICATION');
      return {
        treePath: published.tree.treePath,
        receipt: published.tree.receipt,
        cacheStatus: 'created',
      };
    }

    if (!authoritativeEexist) fail('ERR_SAFE_ZIP_PUBLICATION');
    const winner = verifiedEexistWinner!;
    const verifiedDifferentWinner = (
      (winner.stableReference.dev !== temporaryReference.dev
        || winner.stableReference.ino !== temporaryReference.ino)
      && !sameVerifiedTreeV1(winner.tree, candidateImmediatelyBeforeLink)
    );
    if (verifiedDifferentWinner) treePublished = false;
    await verifyArchiveDescriptorV1(archive, options, dependencies, effectiveUid);
    await cleanupOwnedPathsV1(ownedTemporaryPaths, dependencies);
    if (verifiedDifferentWinner) await cleanupOwnedTreePathsV1(ownedTreePaths, dependencies);
    await syncTrustedCacheDirectoryV1(
      options.cacheDirectory,
      dependencies,
      effectiveUid,
      directoryReadFlags,
    );
    const finalWinner = await verifyPublishedReferenceV1(
      referencePath,
      options,
      dependencies,
      effectiveUid,
      readFlags,
      directoryReadFlags,
    );
    if (!sameVerifiedPublicationV1(winner, finalWinner)) fail('ERR_SAFE_ZIP_PUBLICATION');
    await verifyArchiveDescriptorV1(archive, options, dependencies, effectiveUid);
    return {
      treePath: finalWinner.tree.treePath,
      receipt: finalWinner.tree.receipt,
      cacheStatus: 'reused',
    };
  } catch (error) {
    rethrowStable(error, 'ERR_SAFE_ZIP_STREAM');
  } finally {
    await cleanupOwnedPathsV1(ownedTemporaryPaths, dependencies);
    if (!treePublished) await cleanupOwnedTreePathsV1(ownedTreePaths, dependencies);
  }
  fail('ERR_SAFE_ZIP_STREAM');
}

/**
 * Materializes one checksum-pinned release ZIP into a private verified tree and
 * publishes only a no-replace local reference. All exposed failures are stable,
 * path-free, and cause-free.
 */
export async function extractReleaseArchive(
  optionsInput: ExtractReleaseArchiveOptions,
  dependenciesInput?: ExtractReleaseArchiveDependencies,
): Promise<ExtractReleaseArchiveResult> {
  const options = snapshotExtractReleaseArchiveOptionsV1(optionsInput);
  const dependencies = snapshotExtractDependenciesV1(dependenciesInput);
  const capabilities = requireTrustedPosixCapabilities(dependencies.filesystemSecurity);
  const directoryFlag = dependencies.filesystemSecurity.directoryFlag;
  if (
    capabilities === undefined
    || !Number.isInteger(directoryFlag)
    || directoryFlag! <= 0
  ) fail('ERR_SAFE_ZIP_PLATFORM');
  try {
    const trustedCache = await inspectTrustedCanonicalCacheDirectory(
      options.cacheDirectory,
      capabilities.effectiveUid,
      dependencies.realpathFile,
      dependencies.lstatFile,
    );
    if (trustedCache.status !== 'trusted' || trustedCache.path !== options.cacheDirectory) {
      fail('ERR_SAFE_ZIP_CACHE_UNTRUSTED');
    }
  } catch (error) {
    rethrowStable(error, 'ERR_SAFE_ZIP_CACHE_UNTRUSTED');
  }
  const readFlags = capabilities.regularFileReadFlags;
  const directoryReadFlags = readFlags | directoryFlag!;
  const outputFlags = constants.O_WRONLY
    | constants.O_CREAT
    | constants.O_EXCL
    | capabilities.noFollowFlag
    | capabilities.nonBlockingFlag;

  const archive = await openOwnedArchiveV1(
    options,
    dependencies,
    capabilities.effectiveUid,
    readFlags,
  );
  let result: ExtractReleaseArchiveResult | undefined;
  let primaryError: SafeZipError | undefined;
  try {
    result = await materializeOrReuseV1(
      archive,
      options,
      dependencies,
      capabilities.effectiveUid,
      readFlags,
      outputFlags,
      directoryReadFlags,
    );
    await verifyArchiveDescriptorV1(
      archive,
      options,
      dependencies,
      capabilities.effectiveUid,
    );
  } catch (error) {
    primaryError = error instanceof SafeZipError
      ? error
      : new SafeZipError('ERR_SAFE_ZIP_STREAM');
  }

  if (!archive.closed) {
    archive.closed = true;
    try {
      await archive.handle.close();
    } catch {
      primaryError ??= new SafeZipError('ERR_SAFE_ZIP_ARCHIVE_MUTATED');
    }
  }
  if (primaryError === undefined) {
    try {
      const pathAfterClose = await lstatBigV1(dependencies, options.archivePath);
      if (
        !pathAfterClose.isFile()
        || pathAfterClose.size !== BigInt(options.expectedAssetBytes)
        || pathAfterClose.nlink !== 1n
        || !ownedByV1(pathAfterClose, capabilities.effectiveUid)
        || !sameIdentityV1(pathAfterClose, archive.pathIdentity)
      ) primaryError = new SafeZipError('ERR_SAFE_ZIP_ARCHIVE_MUTATED');
    } catch {
      primaryError = new SafeZipError('ERR_SAFE_ZIP_ARCHIVE_MUTATED');
    }
  }
  if (primaryError !== undefined) throw primaryError;
  if (result === undefined) fail('ERR_SAFE_ZIP_STREAM');
  return result;
}
