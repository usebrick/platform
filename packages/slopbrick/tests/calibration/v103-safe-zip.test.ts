import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { constants, Dir, type BigIntStats } from 'node:fs';
import {
  chmod,
  type FileHandle,
  link as linkFile,
  lstat,
  mkdir,
  mkdtemp,
  open as openFile,
  opendir as openDirectory,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  rmdir,
  symlink,
  truncate,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, relative } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import {
  BorrowedFileHandleReader,
  Crc32V1,
  MAX_ARCHIVE_BYTES,
  MAX_DEPTH,
  MAX_FILE_BYTES,
  MAX_PATH_BYTES,
  MAX_SEGMENT_BYTES,
  MAX_TOTAL_PATH_BYTES,
  MAX_TOTAL_UNCOMPRESSED_BYTES,
  SafeZipError,
  SafeZipInventoryBudgetV1,
  crc32V1,
  extractReleaseArchive,
  isSafeZipArchiveBytesV1,
  isSafeZipEntryCountV1,
  isSafeZipExtraFieldBytesV1,
  isSafeZipFileBytesV1,
  isSafeZipRatioV1,
  isSafeZipTotalPathBytesV1,
  isSafeZipTotalUncompressedBytesV1,
  openRawSafeZipEntryStreamV1,
  openValidatedSafeZipV1FromBorrowedHandle,
  parseRawSafeZipV1,
  type SafeZipReadableHandle,
  validateSafeZipEntryContentV1,
} from '../../src/calibration/v103/safe-zip';
import {
  MAX_RECEIPT_BYTES,
  MATERIALIZATION_RECEIPT_FILENAME,
  parseCanonicalMaterializationCacheRefV1,
  parseCanonicalMaterializationReceiptV1,
} from '../../src/calibration/v103/materialization-receipt';
import {
  buildRawZipFixture,
  buildYazlZipFixture,
  encodeExtraFields,
  patchRawZipFixture,
  type RawZipFixture,
} from '../helpers/zip-fixtures';

async function readStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function borrowedHandle(
  content: Buffer,
  readSizes: readonly number[] = [],
): {
  readonly handle: SafeZipReadableHandle & { readonly close: ReturnType<typeof vi.fn> };
  readonly read: ReturnType<typeof vi.fn>;
  readonly close: ReturnType<typeof vi.fn>;
} {
  let readIndex = 0;
  const read = vi.fn(async (buffer: Buffer, offset: number, length: number, position: number) => {
    const available = Math.max(0, content.byteLength - position);
    const bytesRead = Math.min(readSizes[readIndex++] ?? length, length, available);
    if (bytesRead > 0) content.copy(buffer, offset, position, position + bytesRead);
    return { buffer, bytesRead };
  });
  const close = vi.fn(async () => undefined);
  return { handle: { read, close }, read, close };
}

async function expectRawFailure(fixture: RawZipFixture, code: string): Promise<void> {
  const owner = borrowedHandle(fixture.bytes);
  await expect(parseRawSafeZipV1(owner.handle, fixture.bytes.byteLength)).rejects.toMatchObject({ code });
  expect(owner.close).not.toHaveBeenCalled();
}

function phaseChangingHandle(
  original: RawZipFixture,
  changed: RawZipFixture,
): { readonly handle: SafeZipReadableHandle; readonly completeReads: () => number } {
  let completeReads = 0;
  let changedPhase = false;
  const read = vi.fn(async (buffer: Buffer, offset: number, length: number, position: number) => {
    if (position === 0 && length === original.bytes.byteLength) {
      completeReads += 1;
      if (completeReads === 2) changedPhase = true;
    }
    const source = changedPhase ? changed.bytes : original.bytes;
    const bytesRead = Math.min(length, Math.max(0, source.byteLength - position));
    if (bytesRead > 0) source.copy(buffer, offset, position, position + bytesRead);
    return { buffer, bytesRead };
  });
  return { handle: { read }, completeReads: () => completeReads };
}

async function releaseArchiveFixture(prefix: string): Promise<{
  readonly canonicalCache: string;
  readonly fixture: RawZipFixture;
  readonly options: {
    readonly archivePath: string;
    readonly expectedAssetSha256: string;
    readonly expectedAssetBytes: number;
    readonly cacheDirectory: string;
    readonly extractionPolicy: 'safe-zip-v1';
  };
}> {
  const fixture = buildRawZipFixture({ entries: [
    { name: 'pkg/' },
    { name: 'pkg/readme.txt', data: Buffer.from('release payload') },
  ] });
  const root = await mkdtemp(join(tmpdir(), prefix));
  const canonicalCache = await realpath(root);
  const expectedAssetSha256 = createHash('sha256').update(fixture.bytes).digest('hex');
  const archivePath = join(canonicalCache, `${expectedAssetSha256}.zip`);
  await writeFile(archivePath, fixture.bytes);
  return {
    canonicalCache,
    fixture,
    options: {
      archivePath,
      expectedAssetSha256,
      expectedAssetBytes: fixture.bytes.byteLength,
      cacheDirectory: canonicalCache,
      extractionPolicy: 'safe-zip-v1',
    },
  };
}

async function nestedReleaseArchiveFixture(prefix: string): Promise<Awaited<ReturnType<typeof releaseArchiveFixture>>> {
  const fixture = buildRawZipFixture({ entries: [
    { name: 'pkg/' },
    { name: 'pkg/src/' },
    { name: 'pkg/src/readme.txt', data: Buffer.from('nested release payload') },
  ] });
  const root = await mkdtemp(join(tmpdir(), prefix));
  const canonicalCache = await realpath(root);
  const expectedAssetSha256 = createHash('sha256').update(fixture.bytes).digest('hex');
  const archivePath = join(canonicalCache, `${expectedAssetSha256}.zip`);
  await writeFile(archivePath, fixture.bytes);
  return {
    canonicalCache,
    fixture,
    options: {
      archivePath,
      expectedAssetSha256,
      expectedAssetBytes: fixture.bytes.byteLength,
      cacheDirectory: canonicalCache,
      extractionPolicy: 'safe-zip-v1',
    },
  };
}

async function twoFileReleaseArchiveFixture(prefix: string): Promise<Awaited<ReturnType<typeof releaseArchiveFixture>>> {
  const fixture = buildRawZipFixture({ entries: [
    { name: 'pkg/' },
    { name: 'pkg/readme.txt', data: Buffer.from('first release payload') },
    { name: 'pkg/license.txt', data: Buffer.from('second release payload') },
  ] });
  const root = await mkdtemp(join(tmpdir(), prefix));
  const canonicalCache = await realpath(root);
  const expectedAssetSha256 = createHash('sha256').update(fixture.bytes).digest('hex');
  const archivePath = join(canonicalCache, `${expectedAssetSha256}.zip`);
  await writeFile(archivePath, fixture.bytes);
  return {
    canonicalCache,
    fixture,
    options: {
      archivePath,
      expectedAssetSha256,
      expectedAssetBytes: fixture.bytes.byteLength,
      cacheDirectory: canonicalCache,
      extractionPolicy: 'safe-zip-v1',
    },
  };
}

async function atomicallyReplaceWithIdenticalBytes(path: string): Promise<{
  readonly bytes: Buffer;
  readonly before: { readonly dev: bigint; readonly ino: bigint; readonly mode: bigint };
  readonly after: { readonly dev: bigint; readonly ino: bigint; readonly mode: bigint };
}> {
  const bytes = await readFile(path);
  const before = await lstat(path, { bigint: true });
  const temporaryPath = `${path}.identical-replacement.tmp`;
  await writeFile(temporaryPath, bytes, { flag: 'wx', mode: 0o600 });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, path);
  const after = await lstat(path, { bigint: true });
  return { bytes, before, after };
}

function deterministicRandomBytes(values: readonly number[]): {
  readonly randomBytes: ReturnType<typeof vi.fn>;
  readonly token: (index: number) => string;
} {
  const tokens = values.map((value) => Buffer.alloc(16, value));
  let index = 0;
  return {
    randomBytes: vi.fn((size: number) => {
      if (size !== 16 || index >= tokens.length) throw new Error('unexpected deterministic token request');
      return tokens[index++]!;
    }),
    token: (tokenIndex: number) => tokens[tokenIndex]!.toString('hex'),
  };
}

type PreservedOccupantKind = 'file' | 'directory' | 'empty-directory' | 'symlink';

interface PreservedOccupant {
  readonly path: string;
  readonly kind: PreservedOccupantKind;
  readonly dev: bigint;
  readonly ino: bigint;
  readonly bytes?: Buffer;
  readonly markerPath?: string;
  readonly linkText?: string;
  readonly targetPath?: string;
}

async function createPreservedOccupant(
  path: string,
  kind: PreservedOccupantKind,
  label: string,
): Promise<PreservedOccupant> {
  const bytes = Buffer.from(`preserved-${label}`);
  let markerPath: string | undefined;
  let linkText: string | undefined;
  let targetPath: string | undefined;
  if (kind === 'file') {
    await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
    await chmod(path, 0o600);
  } else if (kind === 'directory') {
    await mkdir(path, { mode: 0o700 });
    markerPath = join(path, 'marker');
    await writeFile(markerPath, bytes, { mode: 0o600 });
  } else if (kind === 'empty-directory') {
    await mkdir(path, { mode: 0o700 });
  } else {
    targetPath = `${path}.target`;
    await writeFile(targetPath, bytes, { flag: 'wx', mode: 0o600 });
    await symlink(targetPath, path);
    linkText = await readlink(path);
  }
  const metadata = await lstat(path, { bigint: true });
  return { path, kind, dev: metadata.dev, ino: metadata.ino, bytes, markerPath, linkText, targetPath };
}

async function expectPreservedOccupant(occupant: PreservedOccupant): Promise<void> {
  const metadata = await lstat(occupant.path, { bigint: true });
  expect({ dev: metadata.dev, ino: metadata.ino }).toEqual({ dev: occupant.dev, ino: occupant.ino });
  expect(
    occupant.kind === 'file'
      ? metadata.isFile()
      : occupant.kind === 'directory' || occupant.kind === 'empty-directory'
        ? metadata.isDirectory()
        : metadata.isSymbolicLink(),
  ).toBe(true);
  if (occupant.kind === 'file') {
    await expect(readFile(occupant.path)).resolves.toEqual(occupant.bytes);
  } else if (occupant.kind === 'directory') {
    await expect(readFile(occupant.markerPath!)).resolves.toEqual(occupant.bytes);
  } else if (occupant.kind === 'empty-directory') {
    await expect(readdir(occupant.path)).resolves.toEqual([]);
  } else {
    await expect(readlink(occupant.path)).resolves.toBe(occupant.linkText);
    await expect(readFile(occupant.targetPath!)).resolves.toEqual(occupant.bytes);
  }
}

interface PathTamperSnapshot {
  readonly path: string;
  readonly status: 'absent' | 'present';
  readonly kind?: 'file' | 'directory' | 'symlink' | 'other';
  readonly dev?: bigint;
  readonly ino?: bigint;
  readonly size?: bigint;
  readonly uid?: bigint;
  readonly mode?: bigint;
  readonly nlink?: bigint;
  readonly bytes?: Buffer;
  readonly entries?: readonly string[];
  readonly linkText?: string;
}

async function capturePathTamperSnapshot(
  path: string,
  options: { readonly readBytes?: boolean } = {},
): Promise<PathTamperSnapshot> {
  let metadata: BigIntStats;
  try {
    metadata = await lstat(path, { bigint: true });
  } catch (error) {
    if (
      typeof error === 'object'
      && error !== null
      && 'code' in error
      && error.code === 'ENOENT'
    ) return { path, status: 'absent' };
    throw error;
  }
  const kind = metadata.isFile()
    ? 'file'
    : metadata.isDirectory()
      ? 'directory'
      : metadata.isSymbolicLink()
        ? 'symlink'
        : 'other';
  return {
    path,
    status: 'present',
    kind,
    dev: metadata.dev,
    ino: metadata.ino,
    size: metadata.size,
    uid: metadata.uid,
    mode: metadata.mode,
    nlink: metadata.nlink,
    ...(kind === 'file' && options.readBytes !== false ? { bytes: await readFile(path) } : {}),
    ...(kind === 'directory' ? { entries: (await readdir(path)).sort() } : {}),
    ...(kind === 'symlink' ? { linkText: await readlink(path) } : {}),
  };
}

async function expectPathTamperSnapshot(snapshot: PathTamperSnapshot): Promise<void> {
  const current = await capturePathTamperSnapshot(snapshot.path, {
    readBytes: snapshot.bytes !== undefined,
  });
  expect(current).toEqual(snapshot);
}

interface ArchivePreservationSnapshot {
  readonly metadata: {
    readonly dev: bigint;
    readonly ino: bigint;
    readonly size: bigint;
    readonly uid: bigint;
    readonly mode: bigint;
    readonly nlink: bigint;
  };
  readonly bytes: Buffer;
}

async function captureArchivePreservation(path: string): Promise<ArchivePreservationSnapshot> {
  const metadata = await lstat(path, { bigint: true });
  return {
    metadata: {
      dev: metadata.dev,
      ino: metadata.ino,
      size: metadata.size,
      uid: metadata.uid,
      mode: metadata.mode,
      nlink: metadata.nlink,
    },
    bytes: await readFile(path),
  };
}

async function expectArchivePreserved(
  path: string,
  snapshot: ArchivePreservationSnapshot,
): Promise<void> {
  const metadata = await lstat(path, { bigint: true });
  expect({
    dev: metadata.dev,
    ino: metadata.ino,
    size: metadata.size,
    uid: metadata.uid,
    mode: metadata.mode,
    nlink: metadata.nlink,
  }).toEqual(snapshot.metadata);
  await expect(readFile(path)).resolves.toEqual(snapshot.bytes);
}

interface ArchiveOwnerReadObservation {
  readonly receiver: FileHandle;
  readonly offset: unknown;
  readonly length: unknown;
  readonly position: unknown;
  readonly afterLink: boolean;
  readonly linkProbe: boolean;
}

interface ArchiveOwnerLifecycleHarness {
  readonly dependencies: {
    readonly openFile: (...args: any[]) => Promise<any>;
    readonly lstatFile: (...args: any[]) => Promise<any>;
    readonly linkFile: (...args: any[]) => Promise<void>;
  };
  readonly events: string[];
  readonly archiveOpenCalls: readonly {
    readonly path: string;
    readonly flags: unknown;
    readonly mode: number | undefined;
  }[];
  readonly statReceivers: readonly FileHandle[];
  readonly reads: readonly ArchiveOwnerReadObservation[];
  readonly archiveHandle: () => FileHandle | undefined;
  readonly closeAttempts: () => number;
  readonly closeEffects: () => number;
  readonly archiveClosed: () => boolean;
  readonly forceCloseForTest: () => Promise<void>;
}

function createArchiveOwnerLifecycleHarness(input: {
  readonly archivePath: string;
  readonly failFirstArchiveStat?: boolean;
  readonly statFailureSecret?: string;
  readonly closeFailure?: 'before-effect' | 'after-effect';
  readonly closeFailureSecret?: string;
  readonly beforeArchiveClose?: () => Promise<void>;
  readonly afterRealArchiveClose?: () => Promise<void>;
  readonly probeArchiveAtPublicationLink?: boolean;
}): ArchiveOwnerLifecycleHarness {
  const events: string[] = [];
  const archiveOpenCalls: Array<{ path: string; flags: unknown; mode: number | undefined }> = [];
  const statReceivers: FileHandle[] = [];
  const reads: ArchiveOwnerReadObservation[] = [];
  const records: Array<{
    readonly handle: FileHandle;
    readonly originalClose: () => Promise<void>;
    closed: boolean;
  }> = [];
  let archiveStatCalls = 0;
  let closeAttempts = 0;
  let closeEffects = 0;
  let linkEffect = false;
  let linkProbe = false;

  const injectedFailure = (secret: string): Error => Object.assign(
    new Error(secret),
    { code: 'EIO', cause: new Error(`${secret}:cause`) },
  );

  const injectedOpenFile = async (pathValue: unknown, flags: unknown, mode?: number): Promise<any> => {
    const path = String(pathValue);
    const handle = await openFile(path, flags as never, mode);
    if (path !== input.archivePath) return handle;
    archiveOpenCalls.push({ path, flags, mode });

    const originalStat = handle.stat.bind(handle) as (...args: any[]) => Promise<any>;
    const originalRead = handle.read.bind(handle) as (...args: any[]) => Promise<any>;
    const originalClose = handle.close.bind(handle);
    const record = { handle, originalClose, closed: false };
    records.push(record);

    Object.defineProperty(handle, 'stat', {
      configurable: true,
      value: async function archiveOwnerStat(this: FileHandle, ...args: any[]): Promise<any> {
        archiveStatCalls += 1;
        statReceivers.push(this);
        events.push(linkProbe ? 'archive:stat:link-probe' : 'archive:stat');
        if (input.failFirstArchiveStat && archiveStatCalls === 1) {
          events.push('archive:stat:failure');
          throw injectedFailure(input.statFailureSecret ?? `${input.archivePath}:stat-secret`);
        }
        return originalStat(...args);
      },
    });
    Object.defineProperty(handle, 'read', {
      configurable: true,
      value: async function archiveOwnerRead(this: FileHandle, ...args: any[]): Promise<any> {
        reads.push({
          receiver: this,
          offset: args[1],
          length: args[2],
          position: args[3],
          afterLink: linkEffect,
          linkProbe,
        });
        events.push(linkProbe ? 'archive:read:link-probe' : 'archive:read');
        return originalRead(...args);
      },
    });
    Object.defineProperty(handle, 'close', {
      configurable: true,
      value: async function archiveOwnerClose(): Promise<void> {
        closeAttempts += 1;
        events.push('archive:close');
        await input.beforeArchiveClose?.();
        if (input.closeFailure === 'before-effect') {
          throw injectedFailure(input.closeFailureSecret ?? `${input.archivePath}:close-secret`);
        }
        await originalClose();
        if (!record.closed) {
          record.closed = true;
          closeEffects += 1;
        }
        events.push('archive:close:effect');
        if (input.afterRealArchiveClose !== undefined) {
          events.push('archive:after-close:start');
          await input.afterRealArchiveClose();
          events.push('archive:after-close:effect');
        }
        if (input.closeFailure === 'after-effect') {
          throw injectedFailure(input.closeFailureSecret ?? `${input.archivePath}:close-secret`);
        }
      },
    });
    return handle;
  };

  const injectedLstatFile = async (pathValue: unknown, lstatOptions: unknown): Promise<any> => {
    const path = String(pathValue);
    if (path === input.archivePath) {
      const phase = records.length === 0
        ? 'before-open'
        : records.every((record) => record.closed)
          ? 'after-close'
          : 'while-open';
      events.push(`archive:path-lstat:${phase}`);
    }
    return lstat(path, lstatOptions as { bigint: true });
  };

  const injectedLinkFile = async (source: unknown, destination: unknown): Promise<void> => {
    events.push('publication:link');
    await linkFile(source as never, destination as never);
    linkEffect = true;
    events.push('publication:link:effect');
    if (!input.probeArchiveAtPublicationLink) return;
    const record = records[0];
    if (record === undefined) throw new Error('archive owner was not opened before publication');
    linkProbe = true;
    try {
      const metadata = await record.handle.stat({ bigint: true });
      if (!metadata.isFile()) throw new Error('archive owner stopped naming a regular file at publication');
      const byte = Buffer.alloc(1);
      const { bytesRead } = await record.handle.read(byte, 0, 1, 0);
      if (bytesRead !== 1) throw new Error('archive owner stopped supporting positional reads at publication');
      events.push('publication:link-handle-probe:effect');
    } finally {
      linkProbe = false;
    }
  };

  return {
    dependencies: {
      openFile: injectedOpenFile,
      lstatFile: injectedLstatFile,
      linkFile: injectedLinkFile,
    },
    events,
    archiveOpenCalls,
    statReceivers,
    reads,
    archiveHandle: () => records[0]?.handle,
    closeAttempts: () => closeAttempts,
    closeEffects: () => closeEffects,
    archiveClosed: () => records.length > 0 && records.every((record) => record.closed),
    forceCloseForTest: async () => {
      for (const record of records) {
        if (record.closed) continue;
        await record.originalClose();
        record.closed = true;
        events.push('test:force-close:effect');
      }
    },
  };
}

function expectSingleArchiveOwner(
  harness: ArchiveOwnerLifecycleHarness,
  archivePath: string,
  options: { readonly requireReads?: boolean } = {},
): void {
  expect(harness.archiveOpenCalls).toEqual([{
    path: archivePath,
    flags: constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    mode: undefined,
  }]);
  const handle = harness.archiveHandle();
  expect(handle).toBeDefined();
  expect(harness.statReceivers.length).toBeGreaterThan(0);
  expect(harness.statReceivers.every((receiver) => receiver === handle)).toBe(true);
  if (options.requireReads !== false) expect(harness.reads.length).toBeGreaterThan(0);
  for (const read of harness.reads) {
    expect(read.receiver).toBe(handle);
    expect(Number.isInteger(read.offset) && Number(read.offset) >= 0).toBe(true);
    expect(Number.isInteger(read.length) && Number(read.length) > 0).toBe(true);
    expect(Number.isInteger(read.position) && Number(read.position) >= 0).toBe(true);
  }
}

interface AmbiguousNonOwnerCloseHarness {
  readonly dependencies: {
    readonly openFile: (...args: any[]) => Promise<any>;
  };
  readonly closeAttempts: () => number;
  readonly closeEffects: () => number;
  readonly recycledResourceState: () => Promise<'open' | 'closed'>;
  readonly forceCloseTestResources: () => Promise<void>;
}

function createAmbiguousNonOwnerCloseHarness(input: {
  readonly targetPath: string;
  readonly secret: string;
}): AmbiguousNonOwnerCloseHarness {
  let injected = false;
  let activeHandle: FileHandle | undefined;
  let closeAttempts = 0;
  let closeEffects = 0;

  const injectedOpenFile = async (pathValue: unknown, flags: unknown, mode?: number): Promise<any> => {
    const path = String(pathValue);
    const opened = await openFile(path, flags as never, mode);
    if (injected || path !== input.targetPath) return opened;
    injected = true;
    activeHandle = opened;
    const ambiguousFd = opened.fd;
    const ambiguousHandle: Record<string, unknown> = {
      stat: (...args: any[]) => (
        activeHandle!.stat as (this: FileHandle, ...inner: any[]) => Promise<any>
      ).call(activeHandle!, ...args),
      read: (...args: any[]) => (
        activeHandle!.read as (this: FileHandle, ...inner: any[]) => Promise<any>
      ).call(activeHandle!, ...args),
      once: () => ambiguousHandle,
      removeListener: () => ambiguousHandle,
      close: async () => {
        closeAttempts += 1;
        if (closeAttempts === 1) {
          await activeHandle!.close();
          closeEffects += 1;
          activeHandle = await openFile(path, flags as never, mode);
          throw Object.assign(new Error(input.secret), {
            code: 'EIO',
            cause: new Error(`${input.secret}:cause`),
          });
        }
        await activeHandle!.close();
        closeEffects += 1;
        throw Object.assign(new Error(`${input.secret}:unsafe-retry`), { code: 'EIO' });
      },
    };
    Object.defineProperty(ambiguousHandle, 'fd', {
      configurable: true,
      enumerable: true,
      get: () => ambiguousFd,
    });
    return ambiguousHandle as unknown as FileHandle;
  };

  const recycledResourceState = async (): Promise<'open' | 'closed'> => {
    if (activeHandle === undefined) throw new Error('ambiguous close resource was not opened');
    try {
      await activeHandle.stat({ bigint: true });
      return 'open';
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EBADF') return 'closed';
      throw error;
    }
  };

  return {
    dependencies: { openFile: injectedOpenFile },
    closeAttempts: () => closeAttempts,
    closeEffects: () => closeEffects,
    recycledResourceState,
    forceCloseTestResources: async () => {
      if (activeHandle === undefined) return;
      if (await recycledResourceState() === 'open') await activeHandle.close();
    },
  };
}

interface DirectoryCloseFailureHarness {
  readonly dependencies: {
    readonly openDirectory: (...args: any[]) => Promise<any>;
  };
  readonly closeAttempts: () => number;
  readonly wrapperCloseEffects: () => number;
  readonly resourceState: () => Promise<'open' | 'closed'>;
  readonly forceCloseForTest: () => Promise<void>;
}

function createDirectoryCloseFailureHarness(input: {
  readonly timing: 'before-effect' | 'after-effect';
  readonly secret: string;
}): DirectoryCloseFailureHarness {
  const genuineDirClose = Dir.prototype.close;
  let instrumentedDirectory: Dir | undefined;
  let closeAttempts = 0;
  let wrapperCloseEffects = 0;

  const injectedOpenDirectory = async (pathValue: unknown): Promise<any> => {
    const directory = await openDirectory(String(pathValue));
    if (instrumentedDirectory !== undefined) return directory;
    instrumentedDirectory = directory;
    const originalClose = directory.close.bind(directory);
    let failureInjected = false;
    Object.defineProperty(directory, 'close', {
      configurable: true,
      value: async () => {
        closeAttempts += 1;
        if (!failureInjected) {
          failureInjected = true;
          if (input.timing === 'before-effect') {
            throw Object.assign(new Error(input.secret), {
              code: 'EIO',
              cause: new Error(`${input.secret}:cause`),
            });
          }
          await originalClose();
          wrapperCloseEffects += 1;
          throw Object.assign(new Error(input.secret), {
            code: 'EIO',
            cause: new Error(`${input.secret}:cause`),
          });
        }
        await originalClose();
        wrapperCloseEffects += 1;
      },
    });
    return directory;
  };

  const resourceState = async (): Promise<'open' | 'closed'> => {
    if (instrumentedDirectory === undefined) throw new Error('directory close resource was not opened');
    try {
      await instrumentedDirectory.read();
      return 'open';
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ERR_DIR_CLOSED') return 'closed';
      throw error;
    }
  };

  return {
    dependencies: { openDirectory: injectedOpenDirectory },
    closeAttempts: () => closeAttempts,
    wrapperCloseEffects: () => wrapperCloseEffects,
    resourceState,
    forceCloseForTest: async () => {
      if (instrumentedDirectory === undefined) return;
      if (await resourceState() === 'open') {
        await (genuineDirClose as (this: Dir) => Promise<void>).call(instrumentedDirectory);
      }
    },
  };
}

interface StaticReuseTamperContext {
  readonly canonicalCache: string;
  readonly referencePath: string;
  readonly treePath: string;
  readonly receiptPath: string;
  readonly payloadPath: string;
  readonly directoryPath: string;
}

interface StaticReuseTamperMutation {
  readonly snapshots: readonly PathTamperSnapshot[];
  readonly repair: () => Promise<void>;
}

interface StaticReuseTamperCase {
  readonly label: string;
  readonly expectedCode: string;
  readonly mutate: (context: StaticReuseTamperContext) => Promise<StaticReuseTamperMutation>;
}

type DurabilityFailurePoint =
  | 'partial-extracted-write'
  | 'extracted-sync'
  | 'receipt-write'
  | 'receipt-sync'
  | 'deepest-directory-sync'
  | 'parent-directory-sync'
  | 'root-directory-sync'
  | 'prepublication-cache-sync'
  | 'temporary-reference-write'
  | 'temporary-reference-sync'
  | 'extracted-close'
  | 'receipt-close'
  | 'temporary-reference-close'
  | 'prelink-archive-check'
  | 'prelink-receipt-check'
  | 'prelink-tree-check'
  | 'first-postlink-cache-sync'
  | 'temporary-reference-unlink'
  | 'postunlink-cache-sync'
  | 'first-published-reference-check'
  | 'first-published-tree-check'
  | 'first-postlink-archive-check'
  | 'final-published-reference-check'
  | 'final-published-tree-check'
  | 'final-branch-archive-check'
  | 'outer-final-archive-check'
  | 'link-before-hard-link';

interface DurabilityFailureSpec {
  readonly point: DurabilityFailurePoint;
  readonly timing: 'before' | 'after' | 'partial';
}

interface DurabilityHandleRecord {
  readonly id: number;
  readonly source: 'openFile' | 'openDirectory';
  label: string;
  closeAttempts: number;
  closeEffects: number;
  closed: boolean;
  readonly forceClose: () => Promise<void>;
}

interface DurabilityHarness {
  readonly dependencies: {
    readonly openFile: (...args: any[]) => Promise<any>;
    readonly openDirectory: (...args: any[]) => Promise<any>;
    readonly lstatFile: (...args: any[]) => Promise<any>;
    readonly linkFile: (...args: any[]) => Promise<void>;
    readonly unlinkFile: (...args: any[]) => Promise<void>;
    readonly removeDirectory: (...args: any[]) => Promise<void>;
  };
  readonly events: string[];
  readonly cleanupPaths: string[];
  readonly handleRecords: DurabilityHandleRecord[];
  readonly openHandleCount: () => number;
  readonly failureTriggered: () => boolean;
  readonly forceCloseLeakedHandles: () => Promise<void>;
}

function createDurabilityHarness(input: {
  readonly cacheDirectory: string;
  readonly archivePath: string;
  readonly referencePath?: string;
  readonly treePath: string;
  readonly failure?: DurabilityFailureSpec;
  readonly persistentTemporaryUnlinkFailure?: boolean;
  readonly afterLinkEffect?: () => Promise<void>;
}): DurabilityHarness {
  const events: string[] = [];
  const cleanupPaths: string[] = [];
  const handleRecords: DurabilityHandleRecord[] = [];
  const openHandles = new Set<number>();
  let nextHandleId = 0;
  let failureTriggered = false;
  let partialWriterId: number | undefined;
  let partialWriteReturned = false;
  let cacheSyncCount = 0;
  let temporaryReferenceClosed = false;
  let linkAttempted = false;
  let prelinkArchiveSeen = false;
  let prelinkReceiptSeen = false;
  let prelinkTreeSeen = false;
  let linkEffectOccurred = false;
  let postUnlinkCacheSynced = false;
  let firstPublishedStarted = false;
  let firstPublishedReceiptSeen = false;
  let firstPublishedTreeSeen = false;
  let finalPublishedStarted = false;
  let finalPublishedReceiptSeen = false;
  let finalPublishedTreeSeen = false;
  let postlinkArchiveCount = 0;
  const secret = `${input.cacheDirectory}/durability-injected-secret`;

  const failInjected = (): never => {
    failureTriggered = true;
    throw Object.assign(new Error(secret), { code: 'EIO' });
  };
  const writerLabel = (path: string, flags: unknown): string | undefined => {
    if (typeof flags !== 'number' || (flags & constants.O_WRONLY) !== constants.O_WRONLY) return undefined;
    if (/^\.v103-ref-[0-9a-f]{32}\.tmp$/.test(basename(path))) return 'temporary-reference';
    if (!path.startsWith(`${input.treePath}/`)) return undefined;
    const relativePath = relative(input.treePath, path);
    return basename(path) === MATERIALIZATION_RECEIPT_FILENAME
      ? 'receipt'
      : `extracted:${relativePath}`;
  };
  const directoryLabel = (path: string, flags: unknown): string | undefined => {
    if (typeof flags !== 'number' || (flags & constants.O_DIRECTORY) !== constants.O_DIRECTORY) return undefined;
    if (path === input.cacheDirectory) return 'cache';
    if (path === input.treePath) return 'directory:.';
    return path.startsWith(`${input.treePath}/`)
      ? `directory:${relative(input.treePath, path)}`
      : undefined;
  };
  const matches = (point: DurabilityFailurePoint, timing: 'before' | 'after'): boolean => (
    !failureTriggered
    && input.failure?.point === point
    && input.failure.timing === timing
  );

  const closePoint = (label: string): DurabilityFailurePoint | undefined => (
    label.startsWith('extracted:')
      ? 'extracted-close'
      : label === 'receipt'
        ? 'receipt-close'
        : label === 'temporary-reference'
          ? 'temporary-reference-close'
          : undefined
  );

  const registerHandle = (
    source: DurabilityHandleRecord['source'],
    resource: { close: () => Promise<unknown> },
  ): DurabilityHandleRecord => {
    const handleId = nextHandleId++;
    const originalClose = resource.close.bind(resource);
    const record: DurabilityHandleRecord = {
      id: handleId,
      source,
      label: source === 'openFile' ? 'unclassified-file' : 'unclassified-directory',
      closeAttempts: 0,
      closeEffects: 0,
      closed: false,
      forceClose: async () => {
        if (record.closed) return;
        try {
          await originalClose();
          record.closed = true;
          record.closeEffects += 1;
          openHandles.delete(handleId);
          events.push(`effect:force-close:${record.label}`);
        } catch {
          // The test cleanup remains best-effort; the assertion ran first.
        }
      },
    };
    handleRecords.push(record);
    openHandles.add(handleId);
    Object.defineProperty(resource, 'close', {
      configurable: true,
      value: async () => {
        record.closeAttempts += 1;
        events.push(`close:${record.label}`);
        const point = closePoint(record.label);
        if (point !== undefined && matches(point, 'before')) failInjected();
        const result = await originalClose();
        if (!record.closed) {
          record.closed = true;
          record.closeEffects += 1;
          openHandles.delete(handleId);
          events.push(`effect:close:${record.label}`);
          if (record.label === 'temporary-reference') temporaryReferenceClosed = true;
        }
        if (point !== undefined && matches(point, 'after')) failInjected();
        return result;
      },
    });
    return record;
  };

  const injectedOpenFile = async (pathValue: unknown, flags: unknown, mode?: number): Promise<any> => {
    const path = String(pathValue);
    const handle = await openFile(path, flags as never, mode);
    const record = registerHandle('openFile', handle);
    const writer = writerLabel(path, flags);
    const directory = directoryLabel(path, flags);
    const label = writer ?? directory ?? (path === input.archivePath
      ? 'archive'
      : `file:${basename(path)}`);
    record.label = label;
    events.push(`open:${label}`);

    if (writer !== undefined) {
      const originalWrite = handle.write.bind(handle);
      Object.defineProperty(handle, 'write', {
        configurable: true,
        value: async (buffer: Buffer, offset: number, length: number, position: number) => {
          events.push(`write:${writer}`);
          if (
            input.failure?.point === 'partial-extracted-write'
            && writer.startsWith('extracted:')
          ) {
            if (partialWriterId === undefined) partialWriterId = record.id;
            if (partialWriterId === record.id && !partialWriteReturned) {
              partialWriteReturned = true;
              const partialLength = Math.max(1, Math.floor(length / 2));
              events.push(`partial-write:${writer}`);
              const result = await originalWrite(buffer, offset, partialLength, position);
              events.push(`effect:write:${writer}:partial`);
              return result;
            }
            if (partialWriterId === record.id) failInjected();
          }
          const point = writer === 'receipt'
            ? 'receipt-write'
            : writer === 'temporary-reference'
              ? 'temporary-reference-write'
              : undefined;
          if (point !== undefined && matches(point, 'before')) failInjected();
          const result = await originalWrite(buffer, offset, length, position);
          events.push(`effect:write:${writer}`);
          if (point !== undefined && matches(point, 'after')) failInjected();
          return result;
        },
      });
    }

    const originalSync = handle.sync.bind(handle);
    Object.defineProperty(handle, 'sync', {
      configurable: true,
      value: async () => {
        let point: DurabilityFailurePoint | undefined;
        let eventLabel = label;
        if (writer?.startsWith('extracted:')) point = 'extracted-sync';
        else if (writer === 'receipt') point = 'receipt-sync';
        else if (writer === 'temporary-reference') point = 'temporary-reference-sync';
        else if (directory === 'directory:.') point = 'root-directory-sync';
        else if (directory?.startsWith('directory:')) {
          const directoryPath = directory.slice('directory:'.length);
          point = directoryPath.split('/').length >= 2
            ? 'deepest-directory-sync'
            : 'parent-directory-sync';
        }
        else if (directory === 'cache') {
          cacheSyncCount += 1;
          eventLabel = `cache:${cacheSyncCount}`;
          if (cacheSyncCount === 1) point = 'prepublication-cache-sync';
          else if (cacheSyncCount === 2) point = 'first-postlink-cache-sync';
          else if (cacheSyncCount === 3) point = 'postunlink-cache-sync';
        }
        events.push(`sync:${eventLabel}`);
        if (point !== undefined && matches(point, 'before')) failInjected();
        await originalSync();
        events.push(`effect:sync:${eventLabel}`);
        if (directory === 'cache' && cacheSyncCount === 3) postUnlinkCacheSynced = true;
        if (point !== undefined && matches(point, 'after')) failInjected();
      },
    });
    return handle;
  };

  const injectedOpenDirectory = async (pathValue: unknown): Promise<any> => {
    const path = String(pathValue);
    const directory = await openDirectory(path);
    const record = registerHandle('openDirectory', directory);
    record.label = path === input.treePath || path.startsWith(`${input.treePath}/`)
      ? `reader:${relative(input.treePath, path) || '.'}`
      : `reader:${basename(path)}`;
    events.push(`open:${record.label}`);
    return directory;
  };

  const injectedLstatFile = async (pathValue: unknown, lstatOptions: unknown): Promise<any> => {
    const path = String(pathValue);
    let point: DurabilityFailurePoint | undefined;
    let label: string | undefined;
    if (temporaryReferenceClosed && !linkAttempted && !failureTriggered) {
      if (path === input.archivePath && !prelinkArchiveSeen) {
        prelinkArchiveSeen = true;
        point = 'prelink-archive-check';
        label = 'prelink-check:archive';
      } else if (
        path === join(input.treePath, MATERIALIZATION_RECEIPT_FILENAME)
        && !prelinkReceiptSeen
      ) {
        prelinkReceiptSeen = true;
        point = 'prelink-receipt-check';
        label = 'prelink-check:receipt';
      } else if (path === input.treePath && !prelinkTreeSeen) {
        prelinkTreeSeen = true;
        point = 'prelink-tree-check';
        label = 'prelink-check:tree';
      }
    }
    if (
      label === undefined
      && linkEffectOccurred
      && postUnlinkCacheSynced
      && !failureTriggered
    ) {
      const receiptPath = join(input.treePath, MATERIALIZATION_RECEIPT_FILENAME);
      if (
        input.referencePath !== undefined
        && path === input.referencePath
        && postlinkArchiveCount === 0
        && !firstPublishedStarted
      ) {
        firstPublishedStarted = true;
        point = 'first-published-reference-check';
        label = 'postlink:first-reference';
      } else if (
        path === receiptPath
        && postlinkArchiveCount === 0
        && firstPublishedStarted
        && !firstPublishedReceiptSeen
      ) {
        firstPublishedReceiptSeen = true;
        label = 'postlink:first-receipt';
      } else if (
        path === input.treePath
        && postlinkArchiveCount === 0
        && firstPublishedStarted
        && !firstPublishedTreeSeen
      ) {
        firstPublishedTreeSeen = true;
        point = 'first-published-tree-check';
        label = 'postlink:first-tree';
      } else if (path === input.archivePath) {
        postlinkArchiveCount += 1;
        if (postlinkArchiveCount === 1) {
          point = 'first-postlink-archive-check';
          label = 'postlink:first-archive';
        } else if (postlinkArchiveCount === 2) {
          point = 'final-branch-archive-check';
          label = 'postlink:final-branch-archive';
        } else if (postlinkArchiveCount === 3) {
          point = 'outer-final-archive-check';
          label = 'postlink:outer-final-archive';
        }
      } else if (
        input.referencePath !== undefined
        && path === input.referencePath
        && postlinkArchiveCount === 1
        && !finalPublishedStarted
      ) {
        finalPublishedStarted = true;
        point = 'final-published-reference-check';
        label = 'postlink:final-reference';
      } else if (
        path === receiptPath
        && postlinkArchiveCount === 1
        && finalPublishedStarted
        && !finalPublishedReceiptSeen
      ) {
        finalPublishedReceiptSeen = true;
        label = 'postlink:final-receipt';
      } else if (
        path === input.treePath
        && postlinkArchiveCount === 1
        && finalPublishedStarted
        && !finalPublishedTreeSeen
      ) {
        finalPublishedTreeSeen = true;
        point = 'final-published-tree-check';
        label = 'postlink:final-tree';
      }
    }
    if (label !== undefined) events.push(label);
    if (point !== undefined && matches(point, 'before')) failInjected();
    const metadata = await lstat(path, lstatOptions as { bigint: true });
    if (label !== undefined) events.push(`effect:${label}`);
    if (point !== undefined && matches(point, 'after')) failInjected();
    return metadata;
  };

  const injectedLinkFile = async (source: unknown, destination: unknown): Promise<void> => {
    linkAttempted = true;
    events.push('link');
    if (
      !failureTriggered
      && input.failure?.point === 'link-before-hard-link'
    ) failInjected();
    await linkFile(source as never, destination as never);
    events.push('effect:link');
    linkEffectOccurred = true;
    await input.afterLinkEffect?.();
  };
  const injectedUnlinkFile = async (pathValue: unknown): Promise<void> => {
    const path = String(pathValue);
    cleanupPaths.push(path);
    const isTemporaryReference = /^\.v103-ref-[0-9a-f]{32}\.tmp$/.test(basename(path));
    events.push(isTemporaryReference
      ? 'unlink:temporary-reference'
      : `unlink:${path.startsWith(`${input.treePath}/`) ? relative(input.treePath, path) : basename(path)}`);
    if (isTemporaryReference && input.persistentTemporaryUnlinkFailure) {
      failureTriggered = true;
      throw Object.assign(new Error(secret), { code: 'EIO' });
    }
    if (isTemporaryReference && matches('temporary-reference-unlink', 'before')) failInjected();
    await unlink(path);
    if (isTemporaryReference) events.push('effect:unlink:temporary-reference');
    if (isTemporaryReference && matches('temporary-reference-unlink', 'after')) failInjected();
  };
  const injectedRemoveDirectory = async (pathValue: unknown): Promise<void> => {
    const path = String(pathValue);
    cleanupPaths.push(path);
    events.push(`rmdir:${path === input.treePath ? '.' : relative(input.treePath, path)}`);
    await rmdir(path);
  };

  return {
    dependencies: {
      openFile: injectedOpenFile,
      openDirectory: injectedOpenDirectory,
      lstatFile: injectedLstatFile,
      linkFile: injectedLinkFile,
      unlinkFile: injectedUnlinkFile,
      removeDirectory: injectedRemoveDirectory,
    },
    events,
    cleanupPaths,
    handleRecords,
    openHandleCount: () => openHandles.size,
    failureTriggered: () => failureTriggered,
    forceCloseLeakedHandles: async () => {
      for (const record of handleRecords) await record.forceClose();
    },
  };
}

function expectEventSubsequence(events: readonly string[], expected: readonly string[]): void {
  let cursor = -1;
  for (const event of expected) {
    const next = events.indexOf(event, cursor + 1);
    expect(next, `missing ordered event ${event}`).toBeGreaterThan(cursor);
    cursor = next;
  }
}

function expectDurabilityHandlesClosed(
  harness: DurabilityHarness,
  failedBeforeEffectLabel?: string,
): void {
  expect(harness.handleRecords.length).toBeGreaterThan(0);
  for (const record of harness.handleRecords) {
    const remainsOpenForExplicitTestCleanup = record.label === failedBeforeEffectLabel;
    expect(record.closed, `${record.source}:${record.label} closed`)
      .toBe(!remainsOpenForExplicitTestCleanup);
    expect(record.closeEffects, `${record.source}:${record.label} close effects`)
      .toBe(remainsOpenForExplicitTestCleanup ? 0 : 1);
    expect(record.closeAttempts, `${record.source}:${record.label} close attempts`).toBe(1);
  }
  expect(harness.openHandleCount()).toBe(failedBeforeEffectLabel === undefined ? 0 : 1);
}

interface PublishedArtifactSnapshotEntry {
  readonly path: string;
  readonly isReference: boolean;
  readonly dev: bigint;
  readonly ino: bigint;
  readonly size: bigint;
  readonly uid: bigint;
  readonly mode: bigint;
  readonly nlink: bigint;
  readonly bytes?: Buffer;
}

async function capturePublishedArtifactSnapshot(
  referencePath: string,
  treePath: string,
): Promise<readonly PublishedArtifactSnapshotEntry[]> {
  const bytePaths = new Set([
    referencePath,
    join(treePath, MATERIALIZATION_RECEIPT_FILENAME),
    join(treePath, 'pkg/src/readme.txt'),
  ]);
  const paths = [
    referencePath,
    treePath,
    join(treePath, 'pkg'),
    join(treePath, 'pkg/src'),
    join(treePath, MATERIALIZATION_RECEIPT_FILENAME),
    join(treePath, 'pkg/src/readme.txt'),
  ];
  return Promise.all(paths.map(async (path) => {
    const metadata = await lstat(path, { bigint: true });
    return {
      path,
      isReference: path === referencePath,
      dev: metadata.dev,
      ino: metadata.ino,
      size: metadata.size,
      uid: metadata.uid,
      mode: metadata.mode,
      nlink: metadata.nlink,
      ...(bytePaths.has(path) ? { bytes: await readFile(path) } : {}),
    };
  }));
}

async function expectPublishedArtifactSnapshot(
  snapshot: readonly PublishedArtifactSnapshotEntry[],
  expectedReferenceNlink: bigint,
): Promise<void> {
  for (const expected of snapshot) {
    const current = await lstat(expected.path, { bigint: true });
    expect({
      dev: current.dev,
      ino: current.ino,
      size: current.size,
      uid: current.uid,
      mode: current.mode,
      nlink: current.nlink,
    }, expected.path).toEqual({
      dev: expected.dev,
      ino: expected.ino,
      size: expected.size,
      uid: expected.uid,
      mode: expected.mode,
      nlink: expected.isReference ? expectedReferenceNlink : expected.nlink,
    });
    if (expected.bytes !== undefined) {
      await expect(readFile(expected.path), expected.path).resolves.toEqual(expected.bytes);
    }
  }
}

type AbruptCrashPoint =
  | 'extracted-file-write'
  | 'extracted-file-sync'
  | 'receipt-write'
  | 'receipt-sync'
  | 'deepest-directory-sync'
  | 'parent-directory-sync'
  | 'tree-root-sync'
  | 'prepublication-cache-sync'
  | 'temporary-reference-write'
  | 'temporary-reference-sync'
  | 'hard-link'
  | 'first-postlink-cache-sync'
  | 'temporary-reference-unlink'
  | 'postunlink-cache-sync';

type AbruptCrashOutcome = 'prelink' | 'published-nlink-two' | 'published-nlink-one';

interface AbruptCrashCase {
  readonly point: AbruptCrashPoint;
  readonly timing: 'before' | 'after';
  readonly outcome: AbruptCrashOutcome;
}

interface AbruptCrashWorkerResult {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

interface ObservedCrashResidue {
  readonly relativePath: string;
  readonly kind: 'directory' | 'file';
  readonly dev: bigint;
  readonly ino: bigint;
  readonly mode: bigint;
  readonly size: bigint;
  readonly nlink: bigint;
  readonly bytes?: Buffer;
}

const ABRUPT_CRASH_CASES: readonly AbruptCrashCase[] = [
  { point: 'extracted-file-write', timing: 'before', outcome: 'prelink' },
  { point: 'extracted-file-write', timing: 'after', outcome: 'prelink' },
  { point: 'extracted-file-sync', timing: 'before', outcome: 'prelink' },
  { point: 'extracted-file-sync', timing: 'after', outcome: 'prelink' },
  { point: 'receipt-write', timing: 'before', outcome: 'prelink' },
  { point: 'receipt-write', timing: 'after', outcome: 'prelink' },
  { point: 'receipt-sync', timing: 'before', outcome: 'prelink' },
  { point: 'receipt-sync', timing: 'after', outcome: 'prelink' },
  { point: 'deepest-directory-sync', timing: 'before', outcome: 'prelink' },
  { point: 'deepest-directory-sync', timing: 'after', outcome: 'prelink' },
  { point: 'parent-directory-sync', timing: 'before', outcome: 'prelink' },
  { point: 'parent-directory-sync', timing: 'after', outcome: 'prelink' },
  { point: 'tree-root-sync', timing: 'before', outcome: 'prelink' },
  { point: 'tree-root-sync', timing: 'after', outcome: 'prelink' },
  { point: 'prepublication-cache-sync', timing: 'before', outcome: 'prelink' },
  { point: 'prepublication-cache-sync', timing: 'after', outcome: 'prelink' },
  { point: 'temporary-reference-write', timing: 'before', outcome: 'prelink' },
  { point: 'temporary-reference-write', timing: 'after', outcome: 'prelink' },
  { point: 'temporary-reference-sync', timing: 'before', outcome: 'prelink' },
  { point: 'temporary-reference-sync', timing: 'after', outcome: 'prelink' },
  { point: 'hard-link', timing: 'before', outcome: 'prelink' },
  { point: 'hard-link', timing: 'after', outcome: 'published-nlink-two' },
  { point: 'first-postlink-cache-sync', timing: 'before', outcome: 'published-nlink-two' },
  { point: 'first-postlink-cache-sync', timing: 'after', outcome: 'published-nlink-two' },
  { point: 'temporary-reference-unlink', timing: 'before', outcome: 'published-nlink-two' },
  { point: 'temporary-reference-unlink', timing: 'after', outcome: 'published-nlink-one' },
  { point: 'postunlink-cache-sync', timing: 'before', outcome: 'published-nlink-one' },
  { point: 'postunlink-cache-sync', timing: 'after', outcome: 'published-nlink-one' },
];

const ABRUPT_CRASH_TREE_TOKEN = Buffer.alloc(16, 0xa1).toString('hex');
const ABRUPT_CRASH_TEMP_TOKEN = Buffer.alloc(16, 0xa2).toString('hex');
const ABRUPT_CRASH_WORKER = fileURLToPath(
  new URL('../helpers/v103-safe-zip-crash-worker.ts', import.meta.url),
);
const PACKAGE_LOCAL_TSX_RUNNER = fileURLToPath(
  new URL('../helpers/tsx-runner.cjs', import.meta.url),
);
const SLOPBRICK_PACKAGE_DIRECTORY = fileURLToPath(new URL('../../', import.meta.url));
const SUPPORTS_LOCAL_POSIX_ABRUPT_CRASH = (
  (process.platform === 'darwin' || process.platform === 'linux')
  && typeof process.geteuid === 'function'
  && Number.isInteger(constants.O_NOFOLLOW)
  && constants.O_NOFOLLOW > 0
  && Number.isInteger(constants.O_NONBLOCK)
  && constants.O_NONBLOCK > 0
  && Number.isInteger(constants.O_DIRECTORY)
  && constants.O_DIRECTORY > 0
);

async function runAbruptCrashWorker(input: {
  readonly cacheDirectory: string;
  readonly archivePath: string;
  readonly point: AbruptCrashPoint;
  readonly timing: 'before' | 'after';
}): Promise<AbruptCrashWorkerResult> {
  const child = spawn(process.execPath, [
    PACKAGE_LOCAL_TSX_RUNNER,
    ABRUPT_CRASH_WORKER,
    JSON.stringify({
      ...input,
      treeToken: ABRUPT_CRASH_TREE_TOKEN,
      temporaryReferenceToken: ABRUPT_CRASH_TEMP_TOKEN,
    }),
  ], {
    cwd: SLOPBRICK_PACKAGE_DIRECTORY,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  const appendBounded = (current: string, chunk: Buffer): string => (
    current.length >= 8192 ? current : `${current}${chunk.toString('utf8')}`.slice(0, 8192)
  );
  child.stdout.on('data', (chunk: Buffer) => { stdout = appendBounded(stdout, chunk); });
  child.stderr.on('data', (chunk: Buffer) => { stderr = appendBounded(stderr, chunk); });
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, 15_000);
  timeout.unref();
  try {
    const [code, signal] = await once(child, 'close') as [number | null, NodeJS.Signals | null];
    return { code, signal, stdout, stderr, timedOut };
  } finally {
    clearTimeout(timeout);
  }
}

async function captureObservedCrashResidue(
  cacheDirectory: string,
  candidatePaths: readonly string[],
): Promise<readonly ObservedCrashResidue[]> {
  const observed: ObservedCrashResidue[] = [];
  const visit = async (path: string): Promise<void> => {
    let metadata: Awaited<ReturnType<typeof lstat>>;
    try {
      metadata = await lstat(path, { bigint: true }) as Awaited<ReturnType<typeof lstat>>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    if (!metadata.isDirectory() && !metadata.isFile()) {
      throw new Error('crash residue must be a regular file or directory');
    }
    observed.push({
      relativePath: relative(cacheDirectory, path),
      kind: metadata.isDirectory() ? 'directory' : 'file',
      dev: metadata.dev,
      ino: metadata.ino,
      mode: metadata.mode,
      size: metadata.size,
      nlink: metadata.nlink,
      ...(metadata.isFile() ? { bytes: await readFile(path) } : {}),
    });
    if (metadata.isDirectory()) {
      for (const child of (await readdir(path)).sort()) await visit(join(path, child));
    }
  };
  for (const path of candidatePaths) await visit(path);
  return observed.sort((left, right) => (
    left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0
  ));
}

async function expectObservedCrashResidue(
  cacheDirectory: string,
  candidatePaths: readonly string[],
  expected: readonly ObservedCrashResidue[],
): Promise<void> {
  expect(await captureObservedCrashResidue(cacheDirectory, candidatePaths)).toEqual(expected);
}

async function expectCanonicalCrashPublication(input: {
  readonly options: Awaited<ReturnType<typeof nestedReleaseArchiveFixture>>['options'];
  readonly treePath: string;
  readonly referencePath: string;
  readonly expectedReferenceNlink: bigint;
}): Promise<Awaited<ReturnType<typeof capturePublishedArtifactSnapshot>>> {
  const referenceBytes = await readFile(input.referencePath);
  const parsedReference = parseCanonicalMaterializationCacheRefV1(referenceBytes);
  expect(parsedReference.ok).toBe(true);
  if (!parsedReference.ok) throw new Error('expected canonical crash-test reference');
  expect(parsedReference.value.value.treeBasename).toBe(basename(input.treePath));
  expect(parsedReference.value.text).toBe(referenceBytes.toString('utf8'));

  const receiptPath = join(input.treePath, MATERIALIZATION_RECEIPT_FILENAME);
  const receiptBytes = await readFile(receiptPath);
  const parsedReceipt = parseCanonicalMaterializationReceiptV1(receiptBytes);
  expect(parsedReceipt.ok).toBe(true);
  if (!parsedReceipt.ok) throw new Error('expected canonical crash-test receipt');
  expect(parsedReceipt.value.text).toBe(receiptBytes.toString('utf8'));
  expect(parsedReference.value.value.receiptSha256).toBe(parsedReceipt.value.sha256);
  expect(parsedReceipt.value.value).toMatchObject({
    receiptVersion: 'v1',
    extractionPolicy: 'safe-zip-v1',
    assetSha256: input.options.expectedAssetSha256,
    assetBytes: input.options.expectedAssetBytes,
  });
  const payload = Buffer.from('nested release payload');
  expect(parsedReceipt.value.value.entries).toEqual([
    { path: 'pkg', kind: 'directory' },
    { path: 'pkg/src', kind: 'directory' },
    {
      path: 'pkg/src/readme.txt',
      kind: 'file',
      bytes: payload.byteLength,
      sha256: createHash('sha256').update(payload).digest('hex'),
    },
  ]);
  await expect(readFile(join(input.treePath, 'pkg/src/readme.txt'))).resolves.toEqual(payload);

  const effectiveUid = BigInt(process.geteuid!());
  for (const path of [input.treePath, join(input.treePath, 'pkg'), join(input.treePath, 'pkg/src')]) {
    const metadata = await lstat(path, { bigint: true });
    expect(metadata.isDirectory(), path).toBe(true);
    expect(metadata.uid, path).toBe(effectiveUid);
    expect(Number(metadata.mode & 0o7777n), path).toBe(0o700);
  }
  for (const path of [input.referencePath, receiptPath, join(input.treePath, 'pkg/src/readme.txt')]) {
    const metadata = await lstat(path, { bigint: true });
    expect(metadata.isFile(), path).toBe(true);
    expect(metadata.uid, path).toBe(effectiveUid);
    expect(Number(metadata.mode & 0o7777n), path).toBe(0o600);
  }
  expect((await lstat(input.referencePath, { bigint: true })).nlink)
    .toBe(input.expectedReferenceNlink);
  return capturePublishedArtifactSnapshot(input.referencePath, input.treePath);
}

describe('v10.3 safe ZIP metadata validation', () => {
  it('matches the standard CRC-32 check vector', () => {
    expect(crc32V1(Buffer.from('123456789'))).toBe(0xcbf43926);
  });

  it('produces the same CRC across arbitrary chunk boundaries', () => {
    const crc = new Crc32V1();
    crc.update(Buffer.from('1'));
    crc.update(Buffer.from('2345'));
    crc.update(Buffer.from('6789'));
    expect(crc.digest()).toBe(0xcbf43926);
    expect(new Crc32V1().digest()).toBe(0);
  });

  it('reads a borrowed range positionally through positive short reads without closing its owner', async () => {
    const owner = borrowedHandle(Buffer.from('0123456789'), [2, 1, 3]);
    const reader = new BorrowedFileHandleReader(owner.handle, 10);
    const closed = once(reader, 'close');

    await expect(readStream(reader.createReadStream({ start: 2, end: 8 }))).resolves.toEqual(Buffer.from('234567'));
    await closed;

    expect(owner.read.mock.calls.map((call) => [call[2], call[3]])).toEqual([
      [6, 2],
      [4, 4],
      [3, 5],
    ]);
    expect(owner.close).not.toHaveBeenCalled();
  });

  it('fails a borrowed range before reading when its bounds are unsafe', async () => {
    const owner = borrowedHandle(Buffer.from('abc'));
    const reader = new BorrowedFileHandleReader(owner.handle, 3);

    await expect(readStream(reader.createReadStream({ start: -1, end: 2 }))).rejects.toMatchObject({
      code: 'ERR_SAFE_ZIP_STREAM',
    });
    expect(owner.read).not.toHaveBeenCalled();
  });

  it('turns an early zero-byte positional read into a stable cause-free error', async () => {
    const owner = borrowedHandle(Buffer.from('abc'), [0]);
    const reader = new BorrowedFileHandleReader(owner.handle, 3);

    const failure = await readStream(reader.createReadStream({ start: 0, end: 3 })).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SafeZipError);
    expect(failure).toMatchObject({ code: 'ERR_SAFE_ZIP_STREAM' });
    expect(String(failure)).not.toContain('abc');
    expect(owner.close).not.toHaveBeenCalled();
  });

  it('preflights a valid nested archive and registers implicit directories once', async () => {
    const fixture = buildRawZipFixture({
      entries: [
        { name: 'root/' },
        { name: 'root/readme.txt', data: Buffer.from('hello') },
        { name: 'root/src/main.ts', data: Buffer.from('ts'), method: 8 },
      ],
    });
    const owner = borrowedHandle(fixture.bytes);

    const index = await parseRawSafeZipV1(owner.handle, fixture.bytes.byteLength);

    expect(index.archiveEntries.map(({ path, kind }) => [path, kind])).toEqual([
      ['root', 'directory'],
      ['root/readme.txt', 'file'],
      ['root/src/main.ts', 'file'],
    ]);
    expect(index.inventory).toEqual([
      { path: 'root', kind: 'directory', explicit: true },
      { path: 'root/readme.txt', kind: 'file', explicit: true },
      { path: 'root/src', kind: 'directory', explicit: false },
      { path: 'root/src/main.ts', kind: 'file', explicit: true },
    ]);
    expect(index.totalUncompressedBytes).toBe(7);
    expect(index.totalPathBytes).toBe(index.inventory.reduce(
      (total, entry) => total + Buffer.byteLength(entry.path, 'ascii'),
      0,
    ));
    expect(owner.read).toHaveBeenCalled();
    expect(owner.close).not.toHaveBeenCalled();
  });

  it('accepts an independently generated yazl archive', async () => {
    const bytes = await buildYazlZipFixture([
      { path: 'pkg/' , kind: 'directory' },
      { path: 'pkg/a.txt', data: Buffer.from('alpha'), compress: false },
      { path: 'pkg/b.txt', data: Buffer.from('bravo'), compress: true },
    ]);
    const owner = borrowedHandle(bytes, [1, 7, 2, 31]);

    await expect(parseRawSafeZipV1(owner.handle, bytes.byteLength)).resolves.toMatchObject({
      totalUncompressedBytes: 10,
    });
  });

  it('cross-checks yauzl ordinal metadata, validates stored and deflate content, and releases without closing the owner', async () => {
    const fixture = buildRawZipFixture({
      entries: [
        { name: 'a.txt', data: Buffer.from('alpha') },
        { name: 'b.txt', data: Buffer.from('bravo'), method: 8 },
      ],
    });
    const owner = borrowedHandle(fixture.bytes, [3, 1, 17, 2, 31]);
    const opened = await openValidatedSafeZipV1FromBorrowedHandle(owner.handle, fixture.bytes.byteLength);

    const firstChunks: Buffer[] = [];
    const first = await opened.validateEntryContent(opened.index.archiveEntries[0]!, {
      onChunk: (chunk) => { firstChunks.push(Buffer.from(chunk)); },
    });
    const second = await opened.validateEntryContent(opened.index.archiveEntries[1]!);
    await opened.release();
    await opened.release();

    expect(Buffer.concat(firstChunks)).toEqual(Buffer.from('alpha'));
    expect(first).toMatchObject({ bytes: 5, crc32: crc32V1(Buffer.from('alpha')) });
    expect(first.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toMatchObject({ bytes: 5, crc32: crc32V1(Buffer.from('bravo')) });
    const stillOpen = Buffer.alloc(1);
    await expect(owner.handle.read(stillOpen, 0, 1, 0)).resolves.toMatchObject({ bytesRead: 1 });
    expect(stillOpen).toEqual(fixture.bytes.subarray(0, 1));
    expect(owner.close).not.toHaveBeenCalled();
  });

  it('leaves one real owning FileHandle stat-able, positionally readable, and hash-equivalent after release', async () => {
    const fixture = buildRawZipFixture({ entries: [{ name: 'owned.txt', data: Buffer.from('owned') }] });
    const directory = await mkdtemp(join(tmpdir(), 'slopbrick-safe-zip-'));
    const archivePath = join(directory, 'archive.zip');
    await writeFile(archivePath, fixture.bytes);
    const handle = await openFile(archivePath, 'r');
    const readerClose = vi.spyOn(BorrowedFileHandleReader.prototype, 'close');
    try {
      const opened = await openValidatedSafeZipV1FromBorrowedHandle(handle, fixture.bytes.byteLength);
      await expect(opened.validateEntryContent(opened.index.archiveEntries[0]!)).resolves.toMatchObject({ bytes: 5 });
      await opened.release();

      await expect(handle.stat()).resolves.toMatchObject({ size: fixture.bytes.byteLength });
      const reread = Buffer.alloc(fixture.bytes.byteLength);
      let offset = 0;
      while (offset < reread.byteLength) {
        const { bytesRead } = await handle.read(reread, offset, reread.byteLength - offset, offset);
        expect(bytesRead).toBeGreaterThan(0);
        offset += bytesRead;
      }
      expect(createHash('sha256').update(reread).digest('hex'))
        .toBe(createHash('sha256').update(fixture.bytes).digest('hex'));
      expect(readerClose).toHaveBeenCalledTimes(1);
    } finally {
      readerClose.mockRestore();
      await handle.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('uses only the documented low-level callback adapter with exact validated raw-range arguments', async () => {
    const stream = Readable.from([Buffer.from('raw')]);
    const openReadStreamLowLevelPromise = vi.fn();
    const openReadStreamLowLevel = vi.fn((...args: unknown[]) => {
      const callback = args.at(-1) as (error: Error | null, value?: NodeJS.ReadableStream) => void;
      callback(null, stream);
    });
    const entry = {
      dataStart: 41,
      compressedBytes: 3,
    } as Parameters<typeof openRawSafeZipEntryStreamV1>[1];

    await expect(readStream(await openRawSafeZipEntryStreamV1(
      { openReadStreamLowLevel, openReadStreamLowLevelPromise } as never,
      entry,
    ))).resolves.toEqual(Buffer.from('raw'));
    expect(openReadStreamLowLevel).toHaveBeenCalledWith(41, 3, 0, 3, false, null, expect.any(Function));
    expect(openReadStreamLowLevelPromise).not.toHaveBeenCalled();
  });

  it('rejects a wrong actual CRC after raw metadata and yauzl agree', async () => {
    const fixture = buildRawZipFixture({
      entries: [{ name: 'wrong.txt', data: Buffer.from('actual'), centralCrc32: 0x1234_5678 }],
    });
    const owner = borrowedHandle(fixture.bytes);
    const opened = await openValidatedSafeZipV1FromBorrowedHandle(owner.handle, fixture.bytes.byteLength);

    await expect(opened.validateEntryContent(opened.index.archiveEntries[0]!)).rejects.toMatchObject({
      code: 'ERR_SAFE_ZIP_ENTRY_METADATA',
    });
    await opened.release();
  });

  it('aborts an overlong inflated chunk before hashing it or passing it to a sink', async () => {
    const fixture = buildRawZipFixture({
      entries: [{
        name: 'long.txt',
        data: Buffer.alloc(1024, 0x61),
        method: 8,
        centralUncompressedBytes: 1,
        localUncompressedBytes: 1,
      }],
    });
    const owner = borrowedHandle(fixture.bytes);
    const index = await parseRawSafeZipV1(owner.handle, fixture.bytes.byteLength);
    const raw = new BorrowedFileHandleReader(owner.handle, fixture.bytes.byteLength);
    const zip = await import('yauzl').then(({ fromRandomAccessReaderPromise }) => fromRandomAccessReaderPromise(
      raw,
      fixture.bytes.byteLength,
      { autoClose: false, decodeStrings: false, validateEntrySizes: true },
    ));
    const sink = vi.fn();

    await expect(validateSafeZipEntryContentV1(zip, index.archiveEntries[0]!, { onChunk: sink }))
      .rejects.toMatchObject({ code: 'ERR_SAFE_ZIP_ENTRY_LIMIT' });
    expect(sink).not.toHaveBeenCalled();
    const closed = once(zip, 'close');
    zip.close();
    await closed;
  });

  it('rejects a valid deflate stream whose output ends below its declared size', async () => {
    const fixture = buildRawZipFixture({ entries: [{
      name: 'short.txt',
      data: Buffer.from('x'),
      method: 8,
      centralUncompressedBytes: 2,
      localUncompressedBytes: 2,
    }] });
    const owner = borrowedHandle(fixture.bytes);
    const opened = await openValidatedSafeZipV1FromBorrowedHandle(owner.handle, fixture.bytes.byteLength);
    try {
      await expect(opened.validateEntryContent(opened.index.archiveEntries[0]!)).rejects.toMatchObject({
        code: 'ERR_SAFE_ZIP_ENTRY_METADATA',
      });
    } finally {
      await opened.release();
    }
  });

  it('accepts every inclusive path boundary and rejects the hostile raw-name matrix', async () => {
    const maxPath = Array.from({ length: 17 }, () => 'x'.repeat(240)).join('/');
    expect(Buffer.byteLength(maxPath)).toBe(MAX_PATH_BYTES);
    const maxDepth = Array.from({ length: MAX_DEPTH }, () => 'd').join('/');
    const valid = buildRawZipFixture({
      entries: [
        { name: 's'.repeat(MAX_SEGMENT_BYTES), data: Buffer.from('segment') },
        { name: maxPath, data: Buffer.from('path') },
        { name: maxDepth, data: Buffer.from('depth') },
      ],
    });
    await expect(parseRawSafeZipV1(borrowedHandle(valid.bytes).handle, valid.bytes.byteLength))
      .resolves.toMatchObject({ totalUncompressedBytes: 16 });

    const invalidNames: readonly (string | Buffer)[] = [
      '../escape',
      '/absolute',
      'C:/drive',
      'back\\slash',
      Buffer.from([0x61, 0x00, 0x62]),
      Buffer.from([0x61, 0x1f, 0x62]),
      Buffer.alloc(0),
      '.',
      './x',
      'a/../b',
      'a//b',
      'a///',
      Buffer.from([0x80]),
      's'.repeat(MAX_SEGMENT_BYTES + 1),
      Array.from({ length: MAX_DEPTH + 1 }, () => 'd').join('/'),
      `${'x'.repeat(241)}/${Array.from({ length: 16 }, () => 'x'.repeat(240)).join('/')}`,
    ];
    for (const name of invalidNames) {
      await expectRawFailure(
        buildRawZipFixture({ entries: [{ name, data: Buffer.from('x') }] }),
        'ERR_SAFE_ZIP_ENTRY_NAME',
      );
    }
  });

  it('rejects exact, ASCII-fold, parent-prefix, reserved-control, and file-directory collisions', async () => {
    const cases = [
      [{ name: 'same', data: Buffer.from('a') }, { name: 'same', data: Buffer.from('b') }],
      [{ name: 'Readme', data: Buffer.from('a') }, { name: 'README', data: Buffer.from('b') }],
      [{ name: 'A/x', data: Buffer.from('a') }, { name: 'a/y', data: Buffer.from('b') }],
      [{ name: 'parent', data: Buffer.from('a') }, { name: 'parent/child', data: Buffer.from('b') }],
      [{ name: '.SLOPBRICK-MATERIALIZATION-RECEIPT.V1.JSON', data: Buffer.from('x') }],
      [{ name: '.slopbrick-materialization-receipt.v1.json/descendant', data: Buffer.from('x') }],
    ] as const;
    for (const entries of cases) {
      await expectRawFailure(buildRawZipFixture({ entries }), 'ERR_SAFE_ZIP_ENTRY_COLLISION');
    }
  });

  it('freezes Unix, OS X, and DOS entry classification and rejects special or mismatched types', async () => {
    const valid = buildRawZipFixture({ entries: [
      { name: 'unix', data: Buffer.from('u'), versionMadeBy: (3 << 8) | 20, externalAttributes: (0o100600 << 16) >>> 0 },
      { name: 'osx', data: Buffer.from('o'), versionMadeBy: (19 << 8) | 20, externalAttributes: (0o100600 << 16) >>> 0 },
      { name: 'dos', data: Buffer.from('d'), versionMadeBy: 20, externalAttributes: 0x20 },
      { name: 'dos-dir/', versionMadeBy: 20, externalAttributes: 0x10 },
    ] });
    await expect(parseRawSafeZipV1(borrowedHandle(valid.bytes).handle, valid.bytes.byteLength)).resolves.toMatchObject({
      archiveEntries: [
        { kind: 'file' },
        { kind: 'file' },
        { kind: 'file' },
        { kind: 'directory' },
      ],
    });

    const forbidden = [
      { name: 'ntfs', data: Buffer.from('x'), versionMadeBy: (10 << 8) | 20 },
      { name: 'unknown', data: Buffer.from('x'), versionMadeBy: (2 << 8) | 20 },
      { name: 'link', data: Buffer.from('x'), externalAttributes: (0o120700 << 16) >>> 0 },
      { name: 'fifo', data: Buffer.from('x'), externalAttributes: (0o010700 << 16) >>> 0 },
      { name: 'socket', data: Buffer.from('x'), externalAttributes: (0o140700 << 16) >>> 0 },
      { name: 'volume', data: Buffer.from('x'), versionMadeBy: 20, externalAttributes: 0x08 },
      { name: 'device', data: Buffer.from('x'), versionMadeBy: 20, externalAttributes: 0x40 },
      { name: 'reserved', data: Buffer.from('x'), versionMadeBy: 20, externalAttributes: 0x80 },
      { name: 'file/', data: Buffer.from('x'), externalAttributes: (0o100600 << 16) >>> 0 },
      { name: 'directory', externalAttributes: (0o040700 << 16) >>> 0 },
    ] as const;
    for (const entry of forbidden) {
      await expectRawFailure(buildRawZipFixture({ entries: [entry] }), 'ERR_SAFE_ZIP_ENTRY_TYPE');
    }
  });

  it('allows only method-specific safe flags and rejects encrypted, patched, masked, reserved, and unsupported entries', async () => {
    const valid = buildRawZipFixture({ entries: [
      { name: 'stored', data: Buffer.from('s'), flags: 0x0800 },
      { name: 'deflated', data: Buffer.from('d'), method: 8, flags: 0x0806 },
    ] });
    await expect(parseRawSafeZipV1(borrowedHandle(valid.bytes).handle, valid.bytes.byteLength)).resolves.toBeDefined();

    for (const flags of [0x0001, 0x0002, 0x0004, 0x0010, 0x0020, 0x0040, 0x1000, 0x2000, 0x4000, 0x8000]) {
      await expectRawFailure(
        buildRawZipFixture({ entries: [{ name: `flag-${flags}`, data: Buffer.from('x'), flags }] }),
        'ERR_SAFE_ZIP_ENTRY_METADATA',
      );
    }
    await expectRawFailure(
      buildRawZipFixture({ entries: [{ name: 'method', data: Buffer.from('x'), method: 12 }] }),
      'ERR_SAFE_ZIP_ENTRY_METADATA',
    );
    await expectRawFailure(
      buildRawZipFixture({ entries: [{ name: 'dir/', flags: 0x0008, descriptor: 'signed' }] }),
      'ERR_SAFE_ZIP_ENTRY_METADATA',
    );
  });

  it('parses only exact timestamp and UID/GID TLVs independently in central and local headers', async () => {
    const centralTimestamp = encodeExtraFields([{ id: 0x5455, data: Buffer.from([1, 0, 0, 0, 0]) }]);
    const localTimestamp = encodeExtraFields([{ id: 0x5455, data: Buffer.from([7, ...Buffer.alloc(12)]) }]);
    const uidGid = encodeExtraFields([{ id: 0x7875, data: Buffer.from([1, 1, 42, 1, 43]) }]);
    const valid = buildRawZipFixture({ entries: [{
      name: 'extras',
      data: Buffer.from('x'),
      centralExtra: Buffer.concat([centralTimestamp, uidGid]),
      localExtra: Buffer.concat([localTimestamp, uidGid]),
    }] });
    await expect(parseRawSafeZipV1(borrowedHandle(valid.bytes).handle, valid.bytes.byteLength)).resolves.toBeDefined();

    const invalidCentralExtras = [
      Buffer.from([0x55]),
      encodeExtraFields([{ id: 0x0001, data: Buffer.alloc(0) }]),
      encodeExtraFields([{ id: 0x7075, data: Buffer.alloc(0) }]),
      encodeExtraFields([{ id: 0x000d, data: Buffer.alloc(0) }]),
      encodeExtraFields([{ id: 0x5455, data: Buffer.from([0, 0, 0, 0, 0]) }]),
      encodeExtraFields([{ id: 0x5455, data: Buffer.from([9, 0, 0, 0, 0]) }]),
      encodeExtraFields([{ id: 0x5455, data: Buffer.from([1, 0, 0, 0]) }]),
      encodeExtraFields([{ id: 0x7875, data: Buffer.from([2, 1, 1, 1, 1]) }]),
      encodeExtraFields([{ id: 0x7875, data: Buffer.from([1, 0, 1, 1]) }]),
      encodeExtraFields([
        { id: 0x5455, data: Buffer.from([1, 0, 0, 0, 0]) },
        { id: 0x5455, data: Buffer.from([1, 0, 0, 0, 0]) },
      ]),
    ];
    for (const centralExtra of invalidCentralExtras) {
      await expectRawFailure(
        buildRawZipFixture({ entries: [{ name: 'bad-extra', data: Buffer.from('x'), centralExtra }] }),
        'ERR_SAFE_ZIP_ENTRY_METADATA',
      );
    }
    await expectRawFailure(
      buildRawZipFixture({ entries: [{
        name: 'bad-local-extra',
        data: Buffer.from('x'),
        localExtra: encodeExtraFields([{ id: 0x5455, data: Buffer.from([3, 0, 0, 0, 0]) }]),
      }] }),
      'ERR_SAFE_ZIP_ENTRY_METADATA',
    );
  });

  it('rejects every local/central disagreement and accepts only a signed classic descriptor', async () => {
    const signed = buildRawZipFixture({ entries: [{
      name: 'signed', data: Buffer.from('descriptor'), method: 8, descriptor: 'signed',
    }] });
    await expect(parseRawSafeZipV1(borrowedHandle(signed.bytes).handle, signed.bytes.byteLength)).resolves.toBeDefined();

    const invalid = [
      buildRawZipFixture({ entries: [{ name: 'central', localName: 'local', data: Buffer.from('x') }] }),
      buildRawZipFixture({ entries: [{ name: 'crc', data: Buffer.from('x'), localCrc32: 1 }] }),
      buildRawZipFixture({ entries: [{ name: 'compressed', data: Buffer.from('x'), localCompressedBytes: 2 }] }),
      buildRawZipFixture({ entries: [{ name: 'uncompressed', data: Buffer.from('x'), localUncompressedBytes: 2 }] }),
      buildRawZipFixture({ entries: [
        { name: 'unsigned', data: Buffer.from('x'), method: 8, descriptor: 'unsigned' },
        { name: 'after-unsigned', data: Buffer.from('y') },
      ] }),
      buildRawZipFixture({ entries: [{ name: 'zip64-desc', data: Buffer.from('x'), method: 8, descriptor: 'zip64' }] }),
      buildRawZipFixture({ entries: [{ name: 'wrong-desc', data: Buffer.from('x'), method: 8, descriptor: 'signed', descriptorCrc32: 1 }] }),
      buildRawZipFixture({ entries: [{ name: 'nonzero-local', data: Buffer.from('x'), method: 8, descriptor: 'signed', localCrc32: 1 }] }),
    ];
    for (const fixture of invalid) await expectRawFailure(fixture, 'ERR_SAFE_ZIP_ENTRY_METADATA');

    const flagMismatchBase = buildRawZipFixture({ entries: [{ name: 'flags', data: Buffer.from('x') }] });
    await expectRawFailure(patchRawZipFixture(flagMismatchBase, (bytes, layout) => {
      bytes.writeUInt16LE(0x0808, layout.entries[0]!.localHeader + 6);
    }), 'ERR_SAFE_ZIP_ENTRY_METADATA');
    const methodMismatchBase = buildRawZipFixture({ entries: [{ name: 'method-mismatch', data: Buffer.from('x') }] });
    await expectRawFailure(patchRawZipFixture(methodMismatchBase, (bytes, layout) => {
      bytes.writeUInt16LE(8, layout.entries[0]!.localHeader + 8);
    }), 'ERR_SAFE_ZIP_ENTRY_METADATA');
    const versionMismatchBase = buildRawZipFixture({ entries: [{ name: 'version', data: Buffer.from('x') }] });
    await expectRawFailure(patchRawZipFixture(versionMismatchBase, (bytes, layout) => {
      bytes.writeUInt16LE(21, layout.entries[0]!.localHeader + 4);
    }), 'ERR_SAFE_ZIP_ENTRY_METADATA');
  });

  it('enforces a unique comment-free EOCD, exact central range, and frozen ZIP64-v1 ending', async () => {
    const zip64 = buildRawZipFixture({
      forceZip64: true,
      entries: [{ name: 'zip64', data: Buffer.from('ok') }],
    });
    await expect(parseRawSafeZipV1(borrowedHandle(zip64.bytes).handle, zip64.bytes.byteLength)).resolves.toMatchObject({
      zip64: true,
    });

    await expectRawFailure(
      buildRawZipFixture({ entries: [{ name: 'comment', data: Buffer.from('x') }], comment: Buffer.from('x') }),
      'ERR_SAFE_ZIP_ARCHIVE_INVALID',
    );
    await expectRawFailure(
      buildRawZipFixture({ entries: [{ name: 'trailing', data: Buffer.from('x') }], trailingBytes: Buffer.from('polyglot') }),
      'ERR_SAFE_ZIP_ARCHIVE_INVALID',
    );
    await expectRawFailure(
      buildRawZipFixture({ entries: [{ name: 'junk', data: Buffer.from('x') }], centralJunk: Buffer.from('junk') }),
      'ERR_SAFE_ZIP_ARCHIVE_INVALID',
    );

    const mixedSentinel = buildRawZipFixture({ entries: [{ name: 'mixed', data: Buffer.from('x') }] });
    await expectRawFailure(patchRawZipFixture(mixedSentinel, (bytes, layout) => {
      bytes.writeUInt16LE(0xffff, layout.eocd + 10);
    }), 'ERR_SAFE_ZIP_ARCHIVE_INVALID');
    const multiDisk = buildRawZipFixture({ entries: [{ name: 'disk', data: Buffer.from('x') }] });
    await expectRawFailure(patchRawZipFixture(multiDisk, (bytes, layout) => {
      bytes.writeUInt16LE(1, layout.eocd + 4);
    }), 'ERR_SAFE_ZIP_ARCHIVE_INVALID');
    const wrongCount = buildRawZipFixture({ entries: [{ name: 'count', data: Buffer.from('x') }] });
    await expectRawFailure(patchRawZipFixture(wrongCount, (bytes, layout) => {
      bytes.writeUInt16LE(2, layout.eocd + 8);
      bytes.writeUInt16LE(2, layout.eocd + 10);
    }), 'ERR_SAFE_ZIP_ARCHIVE_INVALID');

    for (const mutate of [
      (bytes: Buffer, fixture: RawZipFixture) => bytes.writeBigUInt64LE(45n, fixture.layout.zip64Eocd! + 4),
      (bytes: Buffer, fixture: RawZipFixture) => bytes.writeUInt16LE(44, fixture.layout.zip64Eocd! + 14),
      (bytes: Buffer, fixture: RawZipFixture) => bytes.writeUInt32LE(2, fixture.layout.zip64Locator! + 16),
      (bytes: Buffer, fixture: RawZipFixture) => bytes.writeBigUInt64LE(BigInt(fixture.layout.zip64Eocd! + 1), fixture.layout.zip64Locator! + 8),
    ]) {
      await expectRawFailure(patchRawZipFixture(zip64, (bytes) => mutate(bytes, zip64)), 'ERR_SAFE_ZIP_ARCHIVE_INVALID');
    }

    const ambiguous = buildRawZipFixture({ entries: [{ name: 'ambiguous', data: Buffer.alloc(40) }] });
    await expectRawFailure(patchRawZipFixture(ambiguous, (bytes, layout) => {
      const candidate = layout.entries[0]!.data;
      bytes.writeUInt32LE(0x0605_4b50, candidate);
      bytes.writeUInt16LE(bytes.byteLength - candidate - 22, candidate + 20);
    }), 'ERR_SAFE_ZIP_ARCHIVE_INVALID');
  });

  it('rejects prefixes, gaps, duplicate offsets, overlaps, and ranges crossing the central directory', async () => {
    await expectRawFailure(
      buildRawZipFixture({ leadingBytes: Buffer.from('MZ'), entries: [{ name: 'prefix', data: Buffer.from('x') }] }),
      'ERR_SAFE_ZIP_ARCHIVE_INVALID',
    );
    await expectRawFailure(
      buildRawZipFixture({ entries: [
        { name: 'first', data: Buffer.from('x') },
        { name: 'second', data: Buffer.from('y'), gapBefore: Buffer.from('gap') },
      ] }),
      'ERR_SAFE_ZIP_ARCHIVE_INVALID',
    );
    await expectRawFailure(
      buildRawZipFixture({ entries: [
        { name: 'first', data: Buffer.from('x') },
        { name: 'second', data: Buffer.from('y'), centralLocalOffset: 0 },
      ] }),
      'ERR_SAFE_ZIP_ENTRY_METADATA',
    );
    const crossing = buildRawZipFixture({ entries: [{ name: 'cross', data: Buffer.from('x'), method: 8 }] });
    await expectRawFailure(patchRawZipFixture(crossing, (bytes, layout) => {
      bytes.writeUInt32LE(1000, layout.entries[0]!.centralHeader + 20);
      bytes.writeUInt32LE(1000, layout.entries[0]!.localHeader + 18);
    }), 'ERR_SAFE_ZIP_ARCHIVE_INVALID');

    await expectRawFailure(buildRawZipFixture({ entries: [
      {
        name: 'overlapping-first',
        data: Buffer.from('x'),
        method: 8,
        compressedData: Buffer.from([0]),
        centralCompressedBytes: 6,
        localCompressedBytes: 6,
      },
      { name: 'overlapping-second', data: Buffer.from('y') },
    ] }), 'ERR_SAFE_ZIP_ARCHIVE_INVALID');
  });

  it('enforces archive, entry-size, ratio, and regular-file presence limits before content allocation', async () => {
    const noReads = borrowedHandle(Buffer.alloc(0));
    await expect(parseRawSafeZipV1(noReads.handle, MAX_ARCHIVE_BYTES + 1)).rejects.toMatchObject({
      code: 'ERR_SAFE_ZIP_ARGUMENT',
    });
    expect(noReads.read).not.toHaveBeenCalled();

    await expectRawFailure(
      buildRawZipFixture({ entries: [{ name: 'directory/' }] }),
      'ERR_SAFE_ZIP_ENTRY_LIMIT',
    );
    await expectRawFailure(
      buildRawZipFixture({ entries: [{
        name: 'oversized',
        method: 8,
        data: Buffer.from('x'),
        centralUncompressedBytes: MAX_FILE_BYTES + 1,
        localUncompressedBytes: MAX_FILE_BYTES + 1,
      }] }),
      'ERR_SAFE_ZIP_ENTRY_LIMIT',
    );
    await expectRawFailure(
      buildRawZipFixture({ entries: [{
        name: 'ratio',
        method: 8,
        data: Buffer.alloc(201),
        compressedData: Buffer.from([0]),
        centralCompressedBytes: 1,
        localCompressedBytes: 1,
        centralUncompressedBytes: 201,
        localUncompressedBytes: 201,
      }] }),
      'ERR_SAFE_ZIP_ENTRY_RATIO',
    );

    const tooMany = buildRawZipFixture({ forceZip64: true, entries: [{ name: 'count', data: Buffer.from('x') }] });
    await expectRawFailure(patchRawZipFixture(tooMany, (bytes, layout) => {
      bytes.writeBigUInt64LE(100_001n, layout.zip64Eocd! + 24);
      bytes.writeBigUInt64LE(100_001n, layout.zip64Eocd! + 32);
    }), 'ERR_SAFE_ZIP_ENTRY_LIMIT');

    await expectRawFailure(buildRawZipFixture({ entries: [{
      name: 'extra-cap-plus-one',
      data: Buffer.from('x'),
      centralExtra: Buffer.alloc(1025),
    }] }), 'ERR_SAFE_ZIP_ENTRY_METADATA');
  });

  it('accepts exactly 1 GiB declared total and rejects the same bounded metadata at maximum plus one', async () => {
    const compressedBytes = Math.ceil(MAX_FILE_BYTES / 200);
    const compressedData = Buffer.alloc(compressedBytes);
    const atMaximumEntries = Array.from({ length: 32 }, (_, index) => ({
      name: `max-${index}`,
      data: Buffer.alloc(0),
      method: 8 as const,
      compressedData,
      centralCompressedBytes: compressedBytes,
      localCompressedBytes: compressedBytes,
      centralUncompressedBytes: MAX_FILE_BYTES,
      localUncompressedBytes: MAX_FILE_BYTES,
    }));
    const atMaximum = buildRawZipFixture({ entries: atMaximumEntries });
    await expect(parseRawSafeZipV1(borrowedHandle(atMaximum.bytes).handle, atMaximum.bytes.byteLength))
      .resolves.toMatchObject({ totalUncompressedBytes: MAX_TOTAL_UNCOMPRESSED_BYTES });

    const aboveMaximum = buildRawZipFixture({ entries: [
      ...atMaximumEntries,
      {
        name: 'plus-one',
        data: Buffer.alloc(0),
        method: 8,
        compressedData: Buffer.from([0]),
        centralCompressedBytes: 1,
        localCompressedBytes: 1,
        centralUncompressedBytes: 1,
        localUncompressedBytes: 1,
      },
    ] });
    await expectRawFailure(aboveMaximum, 'ERR_SAFE_ZIP_ENTRY_LIMIT');
  });

  it('uses the parser policy predicates at every exact numeric maximum and maximum plus one', () => {
    expect(isSafeZipArchiveBytesV1(BigInt(MAX_ARCHIVE_BYTES))).toBe(true);
    expect(isSafeZipArchiveBytesV1(BigInt(MAX_ARCHIVE_BYTES) + 1n)).toBe(false);
    expect(isSafeZipEntryCountV1(100_000n)).toBe(true);
    expect(isSafeZipEntryCountV1(100_001n)).toBe(false);
    expect(isSafeZipFileBytesV1(BigInt(MAX_FILE_BYTES))).toBe(true);
    expect(isSafeZipFileBytesV1(BigInt(MAX_FILE_BYTES) + 1n)).toBe(false);
    expect(isSafeZipTotalUncompressedBytesV1(BigInt(MAX_TOTAL_UNCOMPRESSED_BYTES))).toBe(true);
    expect(isSafeZipTotalUncompressedBytesV1(BigInt(MAX_TOTAL_UNCOMPRESSED_BYTES) + 1n)).toBe(false);
    expect(isSafeZipTotalPathBytesV1(BigInt(MAX_TOTAL_PATH_BYTES))).toBe(true);
    expect(isSafeZipTotalPathBytesV1(BigInt(MAX_TOTAL_PATH_BYTES) + 1n)).toBe(false);
    expect(isSafeZipExtraFieldBytesV1(1024n)).toBe(true);
    expect(isSafeZipExtraFieldBytesV1(1025n)).toBe(false);
    expect(isSafeZipRatioV1(0n, 0n)).toBe(true);
    expect(isSafeZipRatioV1(200n, 1n)).toBe(true);
    expect(isSafeZipRatioV1(201n, 1n)).toBe(false);
    expect(isSafeZipRatioV1(1n, 0n)).toBe(false);
  });

  it('enforces exact final-inventory count and path-byte ceilings through the parser budget helper', () => {
    const implicitAndLeaf = ['a', 'a/b', 'a/b/c'] as const;
    const addedPathBytes = implicitAndLeaf.reduce(
      (total, path) => total + BigInt(Buffer.byteLength(path, 'ascii')),
      0n,
    );
    const exact = new SafeZipInventoryBudgetV1(
      100_000n - BigInt(implicitAndLeaf.length),
      BigInt(MAX_TOTAL_PATH_BYTES) - addedPathBytes,
    );
    for (const path of implicitAndLeaf) exact.reservePath(path);
    expect(exact.entryCount).toBe(100_000n);
    expect(exact.totalPathBytes).toBe(BigInt(MAX_TOTAL_PATH_BYTES));
    expect(() => exact.reservePath('z')).toThrowError(expect.objectContaining({
      code: 'ERR_SAFE_ZIP_ENTRY_LIMIT',
    }));

    const countPlusOne = new SafeZipInventoryBudgetV1(100_000n, 0n);
    expect(() => countPlusOne.reservePath('a')).toThrowError(expect.objectContaining({
      code: 'ERR_SAFE_ZIP_ENTRY_LIMIT',
    }));
    const pathPlusOne = new SafeZipInventoryBudgetV1(0n, BigInt(MAX_TOTAL_PATH_BYTES));
    expect(() => pathPlusOne.reservePath('a')).toThrowError(expect.objectContaining({
      code: 'ERR_SAFE_ZIP_ENTRY_LIMIT',
    }));
  });

  it('rejects every retained central field when raw metadata and yauzl disagree across phases', async () => {
    const timestamp = encodeExtraFields([{ id: 0x5455, data: Buffer.from([1, 0, 0, 0, 0]) }]);
    const stored = (): RawZipFixture => buildRawZipFixture({
      entries: [{ name: 'phase', data: Buffer.from('phase') }],
    });
    const deflated = (): RawZipFixture => buildRawZipFixture({
      entries: [{ name: 'phase', data: Buffer.from('phase'), method: 8 }],
    });
    const cases: readonly {
      readonly label: string;
      readonly original: RawZipFixture;
      readonly mutate: (bytes: Buffer, fixture: RawZipFixture) => void;
    }[] = [
      { label: 'raw name', original: stored(), mutate: (bytes, fixture) => { bytes[fixture.layout.entries[0]!.centralName] = 0x50; } },
      {
        label: 'raw extra',
        original: buildRawZipFixture({ entries: [{ name: 'phase', data: Buffer.from('phase'), centralExtra: timestamp }] }),
        mutate: (bytes, fixture) => { bytes[fixture.layout.entries[0]!.centralExtra + 5] = 1; },
      },
      { label: 'version made by / host', original: stored(), mutate: (bytes, fixture) => { bytes.writeUInt16LE((19 << 8) | 20, fixture.layout.entries[0]!.centralHeader + 4); } },
      { label: 'version needed', original: stored(), mutate: (bytes, fixture) => { bytes.writeUInt16LE(19, fixture.layout.entries[0]!.centralHeader + 6); } },
      { label: 'flags', original: stored(), mutate: (bytes, fixture) => { bytes.writeUInt16LE(0, fixture.layout.entries[0]!.centralHeader + 8); } },
      { label: 'method', original: stored(), mutate: (bytes, fixture) => { bytes.writeUInt16LE(8, fixture.layout.entries[0]!.centralHeader + 10); } },
      { label: 'CRC', original: stored(), mutate: (bytes, fixture) => { const offset = fixture.layout.entries[0]!.centralHeader + 16; bytes.writeUInt32LE((bytes.readUInt32LE(offset) ^ 1) >>> 0, offset); } },
      { label: 'compressed size', original: deflated(), mutate: (bytes, fixture) => { const offset = fixture.layout.entries[0]!.centralHeader + 20; bytes.writeUInt32LE(bytes.readUInt32LE(offset) + 1, offset); } },
      { label: 'uncompressed size', original: deflated(), mutate: (bytes, fixture) => { const offset = fixture.layout.entries[0]!.centralHeader + 24; bytes.writeUInt32LE(bytes.readUInt32LE(offset) + 1, offset); } },
      { label: 'file comment', original: stored(), mutate: (bytes, fixture) => { bytes.writeUInt16LE(1, fixture.layout.entries[0]!.centralHeader + 32); } },
      { label: 'internal attributes', original: stored(), mutate: (bytes, fixture) => { bytes.writeUInt16LE(1, fixture.layout.entries[0]!.centralHeader + 36); } },
      { label: 'external attributes', original: stored(), mutate: (bytes, fixture) => { bytes.writeUInt32LE((0o100644 << 16) >>> 0, fixture.layout.entries[0]!.centralHeader + 38); } },
      { label: 'local offset', original: stored(), mutate: (bytes, fixture) => { bytes.writeUInt32LE(1, fixture.layout.entries[0]!.centralHeader + 42); } },
    ];

    for (const { label, original, mutate } of cases) {
      const changed = patchRawZipFixture(original, (bytes) => mutate(bytes, original));
      const phase = phaseChangingHandle(original, changed);
      await expect(
        openValidatedSafeZipV1FromBorrowedHandle(phase.handle, original.bytes.byteLength),
        label,
      ).rejects.toMatchObject({ code: 'ERR_SAFE_ZIP_ENTRY_METADATA' });
      expect(phase.completeReads(), label).toBeGreaterThanOrEqual(2);
    }
  });

  it('translates yauzl initialization rejection without closing or taking ownership of the borrowed handle', async () => {
    const original = buildRawZipFixture({ entries: [{ name: 'init-phase', data: Buffer.from('x') }] });
    const erased = Buffer.alloc(original.bytes.byteLength);
    let completeReads = 0;
    let erasedPhase = false;
    const read = vi.fn(async (buffer: Buffer, offset: number, length: number, position: number) => {
      if (position === 0 && length === original.bytes.byteLength) {
        completeReads += 1;
        if (completeReads === 2) erasedPhase = true;
      }
      const source = erasedPhase ? erased : original.bytes;
      const bytesRead = Math.min(length, Math.max(0, source.byteLength - position));
      if (bytesRead > 0) source.copy(buffer, offset, position, position + bytesRead);
      return { buffer, bytesRead };
    });
    const handle: SafeZipReadableHandle = { read };
    const readerClose = vi.spyOn(BorrowedFileHandleReader.prototype, 'close');

    try {
      await expect(openValidatedSafeZipV1FromBorrowedHandle(handle, original.bytes.byteLength))
        .rejects.toMatchObject({ code: 'ERR_SAFE_ZIP_ARCHIVE_INVALID' });
      expect(readerClose).toHaveBeenCalledTimes(1);
      const proof = Buffer.alloc(1);
      await expect(handle.read(proof, 0, 1, 0)).resolves.toMatchObject({ bytesRead: 1 });
      expect(read).toHaveBeenCalled();
    } finally {
      readerClose.mockRestore();
    }
  });

  it('maps low-level callback, raw stream, inflater, sink, and post-release failures to stable errors', async () => {
    const entry = {
      kind: 'file', compressionMethod: 0, dataStart: 0, compressedBytes: 1,
      uncompressedBytes: 1, crc32: 0, ordinal: 0,
    } as Parameters<typeof validateSafeZipEntryContentV1>[1];
    const callbackFailure = {
      openReadStreamLowLevel: (...args: unknown[]) => {
        const callback = args.at(-1) as (error: Error) => void;
        callback(new Error('raw path must not escape'));
      },
    };
    await expect(openRawSafeZipEntryStreamV1(callbackFailure as never, entry)).rejects.toMatchObject({
      code: 'ERR_SAFE_ZIP_STREAM',
    });
    await expect(openRawSafeZipEntryStreamV1({
      openReadStreamLowLevel: () => { throw new Error('sync secret'); },
    } as never, entry)).rejects.toMatchObject({ code: 'ERR_SAFE_ZIP_STREAM' });
    await expect(openRawSafeZipEntryStreamV1({
      openReadStreamLowLevel: (...args: unknown[]) => {
        const callback = args.at(-1) as (error: Error | null) => void;
        callback(null);
      },
    } as never, entry)).rejects.toMatchObject({ code: 'ERR_SAFE_ZIP_STREAM' });

    const earlyEnd = {
      openReadStreamLowLevel: (...args: unknown[]) => {
        const callback = args.at(-1) as (error: Error | null, stream: Readable) => void;
        callback(null, Readable.from([]));
      },
    };
    await expect(validateSafeZipEntryContentV1(earlyEnd as never, entry)).rejects.toMatchObject({
      code: 'ERR_SAFE_ZIP_ENTRY_METADATA',
    });

    const rawFailure = {
      openReadStreamLowLevel: (...args: unknown[]) => {
        const callback = args.at(-1) as (error: Error | null, stream: Readable) => void;
        callback(null, Readable.from((async function* () { throw new Error('secret'); })()));
      },
    };
    await expect(validateSafeZipEntryContentV1(rawFailure as never, entry)).rejects.toMatchObject({
      code: 'ERR_SAFE_ZIP_STREAM',
    });

    const invalidDeflateFixture = buildRawZipFixture({ entries: [{
      name: 'invalid-deflate', data: Buffer.from('x'), method: 8, compressedData: Buffer.from([0xff]),
    }] });
    const invalidOwner = borrowedHandle(invalidDeflateFixture.bytes);
    const invalidIndex = await parseRawSafeZipV1(invalidOwner.handle, invalidDeflateFixture.bytes.byteLength);
    const invalidReader = new BorrowedFileHandleReader(invalidOwner.handle, invalidDeflateFixture.bytes.byteLength);
    const invalidZip = await import('yauzl').then(({ fromRandomAccessReaderPromise }) => fromRandomAccessReaderPromise(
      invalidReader, invalidDeflateFixture.bytes.byteLength,
      { autoClose: false, decodeStrings: false, validateEntrySizes: true },
    ));
    await expect(validateSafeZipEntryContentV1(invalidZip, invalidIndex.archiveEntries[0]!)).rejects.toMatchObject({
      code: 'ERR_SAFE_ZIP_STREAM',
    });
    const invalidClosed = once(invalidZip, 'close');
    invalidZip.close();
    await invalidClosed;

    const sinkFixture = buildRawZipFixture({ entries: [{ name: 'sink', data: Buffer.from('x') }] });
    const sinkOwner = borrowedHandle(sinkFixture.bytes);
    const opened = await openValidatedSafeZipV1FromBorrowedHandle(sinkOwner.handle, sinkFixture.bytes.byteLength);
    await expect(opened.validateEntryContent(opened.index.archiveEntries[0]!, {
      onChunk: () => { throw new Error('private sink'); },
    })).rejects.toMatchObject({ code: 'ERR_SAFE_ZIP_STREAM' });
    await opened.release();
    await expect(opened.validateEntryContent(opened.index.archiveEntries[0]!)).rejects.toMatchObject({
      code: 'ERR_SAFE_ZIP_ARGUMENT',
    });
  });

  it('rejects deflate trailing junk and concatenated members by exact inflater input consumption', async () => {
    const { deflateRawSync } = await import('node:zlib');
    const payload = Buffer.from('payload');
    const compressed = deflateRawSync(payload);
    const fixtures = [
      buildRawZipFixture({ entries: [{
        name: 'trailing-deflate', data: payload, method: 8,
        compressedData: Buffer.concat([compressed, Buffer.from([0])]),
      }] }),
      buildRawZipFixture({ entries: [{
        name: 'concatenated-deflate', data: payload, method: 8,
        compressedData: Buffer.concat([compressed, deflateRawSync(Buffer.from('second'))]),
      }] }),
    ];
    for (const fixture of fixtures) {
      const owner = borrowedHandle(fixture.bytes);
      const opened = await openValidatedSafeZipV1FromBorrowedHandle(owner.handle, fixture.bytes.byteLength);
      await expect(opened.validateEntryContent(opened.index.archiveEntries[0]!)).rejects.toMatchObject({
        code: 'ERR_SAFE_ZIP_ENTRY_METADATA',
      });
      await opened.release();
    }
  });

  it('keeps exposed metadata immutable and refuses forged entries or aggregate budgets above policy', async () => {
    const fixture = buildRawZipFixture({ entries: [{ name: 'immutable', data: Buffer.from('x') }] });
    const owner = borrowedHandle(fixture.bytes);
    const opened = await openValidatedSafeZipV1FromBorrowedHandle(owner.handle, fixture.bytes.byteLength);
    const entry = opened.index.archiveEntries[0]!;
    expect(Object.isFrozen(opened.index)).toBe(true);
    expect(Object.isFrozen(opened.index.archiveEntries)).toBe(true);
    expect(Object.isFrozen(entry)).toBe(true);
    expect(() => { (entry as { dataStart: number }).dataStart = 0; }).toThrow();
    await expect(opened.validateEntryContent({ ...entry })).rejects.toMatchObject({ code: 'ERR_SAFE_ZIP_ARGUMENT' });
    await expect(opened.validateEntryContent(entry, {
      maxTotalUncompressedBytes: MAX_TOTAL_UNCOMPRESSED_BYTES + 1,
    })).rejects.toMatchObject({ code: 'ERR_SAFE_ZIP_ARGUMENT' });
    await opened.release();
  });
});

describe('v10.3 safe ZIP release materialization', () => {
  const digest = 'a'.repeat(64);
  const cacheDirectory = '/private/slopbrick-v103-cache';
  const validOptions = {
    archivePath: `${cacheDirectory}/${digest}.zip`,
    expectedAssetSha256: digest,
    expectedAssetBytes: 1,
    cacheDirectory,
    extractionPolicy: 'safe-zip-v1' as const,
  };

  it('rejects the invalid-argument table before filesystem I/O with stable path-free errors', async () => {
    const invalidArguments = [
      ['wrong extraction policy', { ...validOptions, extractionPolicy: 'unsafe-zip-v0' }],
      ['uppercase digest', {
        ...validOptions,
        archivePath: `${cacheDirectory}/${digest.toUpperCase()}.zip`,
        expectedAssetSha256: digest.toUpperCase(),
      }],
      ['short lower-case digest', {
        ...validOptions,
        archivePath: `${cacheDirectory}/${'a'.repeat(63)}.zip`,
        expectedAssetSha256: 'a'.repeat(63),
      }],
      ['non-hex lower-case digest', {
        ...validOptions,
        archivePath: `${cacheDirectory}/${`${'a'.repeat(63)}g`}.zip`,
        expectedAssetSha256: `${'a'.repeat(63)}g`,
      }],
      ['negative expected bytes', { ...validOptions, expectedAssetBytes: -1 }],
      ['zero expected bytes', { ...validOptions, expectedAssetBytes: 0 }],
      ['one byte above five GiB', { ...validOptions, expectedAssetBytes: MAX_ARCHIVE_BYTES + 1 }],
      ['unsafe expected bytes', { ...validOptions, expectedAssetBytes: Number.MAX_SAFE_INTEGER + 1 }],
      ['relative cache directory', {
        ...validOptions,
        cacheDirectory: 'relative-cache',
        archivePath: `relative-cache/${digest}.zip`,
      }],
      ['noncanonical cache directory', {
        ...validOptions,
        cacheDirectory: '/private/cache/../slopbrick-v103-cache',
      }],
      ['relative archive path', { ...validOptions, archivePath: `${digest}.zip` }],
      ['archive child with dot segment', {
        ...validOptions,
        archivePath: `${cacheDirectory}/./${digest}.zip`,
      }],
      ['archive child with doubled separator', {
        ...validOptions,
        archivePath: `${cacheDirectory}//${digest}.zip`,
      }],
      ['archive child with trailing dot segment', {
        ...validOptions,
        archivePath: `${cacheDirectory}/${digest}.zip/.`,
      }],
      ['archive outside the digest child', { ...validOptions, archivePath: `${cacheDirectory}/other.zip` }],
    ] as const;

    for (const [label, options] of invalidArguments) {
      const forbiddenIo = () => vi.fn(async (): Promise<never> => {
        throw new Error('filesystem dependency must not run');
      });
      const realpathFile = forbiddenIo();
      const lstatFile = forbiddenIo();
      const injectedOpenFile = forbiddenIo();

      const failure = await extractReleaseArchive(options as never, {
        filesystemSecurity: {
          noFollowFlag: constants.O_NOFOLLOW,
          nonBlockingFlag: constants.O_NONBLOCK,
          effectiveUid: typeof process.geteuid === 'function' ? process.geteuid() : 0,
        },
        realpathFile,
        lstatFile,
        openFile: injectedOpenFile,
      } as never).catch((error: unknown) => error);

      expect(failure, label).toBeInstanceOf(SafeZipError);
      expect(failure, label).toMatchObject({ code: 'ERR_SAFE_ZIP_ARGUMENT' });
      expect([String(failure), JSON.stringify(failure), (failure as Error).stack].join('\n'), label)
        .not.toContain(cacheDirectory);
      expect(Object.prototype.hasOwnProperty.call(failure, 'cause'), label).toBe(false);
      expect(realpathFile, label).not.toHaveBeenCalled();
      expect(lstatFile, label).not.toHaveBeenCalled();
      expect(injectedOpenFile, label).not.toHaveBeenCalled();
    }
  });

  it('creates and then fully reuses one verified nested stored/deflated tree without changing the archive', async () => {
    const stored = Buffer.from('stored payload');
    const deflated = Buffer.from('deflated payload');
    const fixture = buildRawZipFixture({ entries: [
      { name: 'pkg/' },
      { name: 'pkg/readme.txt', data: stored },
      { name: 'pkg/src/main.ts', data: deflated, method: 8 },
    ] });
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-v103-materialize-'));
    const canonicalCache = await realpath(root);
    const assetSha256 = createHash('sha256').update(fixture.bytes).digest('hex');
    const archivePath = join(canonicalCache, `${assetSha256}.zip`);
    await writeFile(archivePath, fixture.bytes);
    const archiveBefore = await lstat(archivePath, { bigint: true });
    const options = {
      archivePath,
      expectedAssetSha256: assetSha256,
      expectedAssetBytes: fixture.bytes.byteLength,
      cacheDirectory: canonicalCache,
      extractionPolicy: 'safe-zip-v1' as const,
    };

    try {
      const created = await extractReleaseArchive(options);
      expect(created.cacheStatus).toBe('created');
      expect(created.treePath).toBe(join(canonicalCache, basename(created.treePath)));
      expect(basename(created.treePath)).toMatch(/^\.v103-tree-[0-9a-f]{32}$/);
      await expect(readFile(join(created.treePath, 'pkg/readme.txt'))).resolves.toEqual(stored);
      await expect(readFile(join(created.treePath, 'pkg/src/main.ts'))).resolves.toEqual(deflated);

      for (const path of [created.treePath, join(created.treePath, 'pkg'), join(created.treePath, 'pkg/src')]) {
        expect((await lstat(path)).mode & 0o777).toBe(0o700);
      }
      for (const path of [join(created.treePath, 'pkg/readme.txt'), join(created.treePath, 'pkg/src/main.ts')]) {
        expect((await lstat(path)).mode & 0o777).toBe(0o600);
      }

      const receiptPath = join(created.treePath, MATERIALIZATION_RECEIPT_FILENAME);
      const receiptBytes = await readFile(receiptPath);
      expect((await lstat(receiptPath)).mode & 0o777).toBe(0o600);
      const parsedReceipt = parseCanonicalMaterializationReceiptV1(receiptBytes);
      expect(parsedReceipt.ok).toBe(true);
      if (!parsedReceipt.ok) throw new Error('expected canonical receipt');
      expect(parsedReceipt.value.value).toEqual(created.receipt);
      expect(created.receipt.entries).toEqual([
        { path: 'pkg', kind: 'directory' },
        {
          path: 'pkg/readme.txt', kind: 'file', bytes: stored.byteLength,
          sha256: createHash('sha256').update(stored).digest('hex'),
        },
        { path: 'pkg/src', kind: 'directory' },
        {
          path: 'pkg/src/main.ts', kind: 'file', bytes: deflated.byteLength,
          sha256: createHash('sha256').update(deflated).digest('hex'),
        },
      ]);

      const referencePath = join(canonicalCache, `${assetSha256}.safe-zip-v1.ref.json`);
      const referenceBytes = await readFile(referencePath);
      expect(referenceBytes.byteLength).toBe(161);
      expect((await lstat(referencePath)).mode & 0o777).toBe(0o600);
      const parsedReference = parseCanonicalMaterializationCacheRefV1(referenceBytes);
      expect(parsedReference.ok).toBe(true);
      if (!parsedReference.ok) throw new Error('expected canonical reference');
      expect(parsedReference.value.value).toEqual({
        version: 'v1',
        treeBasename: basename(created.treePath),
        receiptSha256: parsedReceipt.value.sha256,
      });

      const reused = await extractReleaseArchive(options);
      expect(reused).toEqual({ treePath: created.treePath, receipt: created.receipt, cacheStatus: 'reused' });
      const archiveAfter = await lstat(archivePath, { bigint: true });
      expect(await readFile(archivePath)).toEqual(fixture.bytes);
      expect({ dev: archiveAfter.dev, ino: archiveAfter.ino, size: archiveAfter.size, mode: archiveAfter.mode })
        .toEqual({ dev: archiveBefore.dev, ino: archiveBefore.ino, size: archiveBefore.size, mode: archiveBefore.mode });
    } finally {
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  it('creates and reuses under an owner-private sticky cache leaf without changing its mode', async () => {
    const { canonicalCache, options } = await releaseArchiveFixture('slopbrick-v103-sticky-cache-');

    try {
      await chmod(canonicalCache, 0o1700);
      expect((await lstat(canonicalCache)).mode & 0o7777).toBe(0o1700);

      const created = await extractReleaseArchive(options);
      expect(created.cacheStatus).toBe('created');
      expect((await lstat(canonicalCache)).mode & 0o7777).toBe(0o1700);

      await expect(extractReleaseArchive(options)).resolves.toEqual({
        treePath: created.treePath,
        receipt: created.receipt,
        cacheStatus: 'reused',
      });
      expect((await lstat(canonicalCache)).mode & 0o7777).toBe(0o1700);
    } finally {
      await chmod(canonicalCache, 0o700).catch(() => undefined);
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  it('reverifies a generated tree after directory sync and before publishing its stable reference', async () => {
    const { canonicalCache, options } = await releaseArchiveFixture('slopbrick-v103-prepublish-mutation-');
    const referencePath = join(
      canonicalCache,
      `${options.expectedAssetSha256}.safe-zip-v1.ref.json`,
    );
    let generatedTreePath: string | undefined;
    let mutatedAfterSync = false;
    const publish = vi.fn(async (source: string, destination: string) => {
      await linkFile(source, destination);
    });

    try {
      const failure = await extractReleaseArchive(options, {
        openFile: async (path, flags, mode) => {
          const handle = await openFile(path, flags, mode);
          if (
            typeof path === 'string'
            && /^\.v103-tree-[0-9a-f]{32}$/.test(basename(path))
          ) generatedTreePath = path;
          if (
            !mutatedAfterSync
            && typeof path === 'string'
            && path === canonicalCache
            && generatedTreePath !== undefined
          ) {
            const sync = handle.sync.bind(handle);
            Object.defineProperty(handle, 'sync', {
              configurable: true,
              value: async () => {
                await sync();
                await writeFile(
                  join(generatedTreePath!, 'pkg/readme.txt'),
                  Buffer.from('release payloae'),
                );
                mutatedAfterSync = true;
              },
            });
          }
          return handle;
        },
        linkFile: publish,
      } as never).catch((error: unknown) => error);

      expect(mutatedAfterSync).toBe(true);
      expect(failure).toBeInstanceOf(SafeZipError);
      expect(publish).not.toHaveBeenCalled();
      await expect(lstat(referencePath, { bigint: true })).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  it('preserves child identity continuity across verification passes before publication', async () => {
    const { canonicalCache, options } = await releaseArchiveFixture('slopbrick-v103-child-continuity-');
    const payload = Buffer.from('release payload');
    const referencePath = join(
      canonicalCache,
      `${options.expectedAssetSha256}.safe-zip-v1.ref.json`,
    );
    let generatedTreePath: string | undefined;
    let replacedPath: string | undefined;
    let originalIdentity: { readonly dev: bigint; readonly ino: bigint; readonly mode: bigint } | undefined;
    let replacementIdentity: { readonly dev: bigint; readonly ino: bigint; readonly mode: bigint } | undefined;
    let replacedAfterSync = false;
    const unlinkedPaths: string[] = [];
    const publish = vi.fn(async (source: string, destination: string) => {
      await linkFile(source, destination);
    });

    try {
      const failure = await extractReleaseArchive(options, {
        openFile: async (path, flags, mode) => {
          const handle = await openFile(path, flags, mode);
          if (
            typeof path === 'string'
            && /^\.v103-tree-[0-9a-f]{32}$/.test(basename(path))
          ) generatedTreePath = path;
          if (
            !replacedAfterSync
            && typeof path === 'string'
            && path === canonicalCache
            && generatedTreePath !== undefined
          ) {
            const sync = handle.sync.bind(handle);
            Object.defineProperty(handle, 'sync', {
              configurable: true,
              value: async () => {
                await sync();
                replacedPath = join(generatedTreePath!, 'pkg/readme.txt');
                const replacementPath = join(generatedTreePath!, 'pkg/.identical-replacement.tmp');
                originalIdentity = await lstat(replacedPath, { bigint: true });
                await writeFile(replacementPath, payload, { flag: 'wx', mode: 0o600 });
                await chmod(replacementPath, 0o600);
                await rename(replacementPath, replacedPath);
                replacementIdentity = await lstat(replacedPath, { bigint: true });
                replacedAfterSync = true;
              },
            });
          }
          return handle;
        },
        unlinkFile: async (path) => {
          unlinkedPaths.push(String(path));
          await unlink(path);
        },
        linkFile: publish,
      } as never).catch((error: unknown) => error);

      expect(replacedAfterSync).toBe(true);
      expect(originalIdentity).toBeDefined();
      expect(replacementIdentity).toBeDefined();
      expect({ dev: replacementIdentity!.dev, ino: replacementIdentity!.ino })
        .not.toEqual({ dev: originalIdentity!.dev, ino: originalIdentity!.ino });
      expect(Number(replacementIdentity!.mode & 0o7777n)).toBe(0o600);
      await expect(readFile(replacedPath!)).resolves.toEqual(payload);
      expect(failure).toBeInstanceOf(SafeZipError);
      expect(failure).toMatchObject({ code: 'ERR_SAFE_ZIP_TREE' });
      expect([String(failure), JSON.stringify(failure), (failure as Error).stack].join('\n'))
        .not.toContain(canonicalCache);
      expect(Object.prototype.hasOwnProperty.call(failure, 'cause')).toBe(false);
      expect(publish).not.toHaveBeenCalled();
      await expect(lstat(referencePath, { bigint: true })).rejects.toMatchObject({ code: 'ENOENT' });
      expect(unlinkedPaths).not.toContain(replacedPath);
      await expect(readFile(replacedPath!)).resolves.toEqual(payload);
    } finally {
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  it.each(['reference', 'child'] as const)(
    'preserves %s identity continuity across the existing-reuse verification pair',
    async (replacementTarget) => {
      const { canonicalCache, options } = await releaseArchiveFixture(
        `slopbrick-v103-reuse-${replacementTarget}-continuity-`,
      );
      const referencePath = join(
        canonicalCache,
        `${options.expectedAssetSha256}.safe-zip-v1.ref.json`,
      );
      let replacement: Awaited<ReturnType<typeof atomicallyReplaceWithIdenticalBytes>> | undefined;
      let archivePathLstats = 0;
      const unlinkedPaths: string[] = [];

      try {
        const created = await extractReleaseArchive(options);
        const childPath = join(created.treePath, 'pkg/readme.txt');
        const replacedPath = replacementTarget === 'reference' ? referencePath : childPath;
        const failure = await extractReleaseArchive(options, {
          lstatFile: async (path, lstatOptions) => {
            const metadata = await lstat(path, lstatOptions as { bigint: true });
            if (String(path) === options.archivePath) {
              archivePathLstats += 1;
              if (archivePathLstats === 3 && replacement === undefined) {
                replacement = await atomicallyReplaceWithIdenticalBytes(replacedPath);
              }
            }
            return metadata;
          },
          unlinkFile: async (path) => {
            unlinkedPaths.push(String(path));
            await unlink(path);
          },
        } as never).catch((error: unknown) => error);

        expect(replacement).toBeDefined();
        expect({ dev: replacement!.after.dev, ino: replacement!.after.ino })
          .not.toEqual({ dev: replacement!.before.dev, ino: replacement!.before.ino });
        expect(failure).toBeInstanceOf(SafeZipError);
        expect(failure).toMatchObject({ code: 'ERR_SAFE_ZIP_PUBLICATION' });
        expect(unlinkedPaths).not.toContain(replacedPath);
        expect(await lstat(replacedPath, { bigint: true })).toMatchObject({
          dev: replacement!.after.dev,
          ino: replacement!.after.ino,
        });
        await expect(readFile(replacedPath)).resolves.toEqual(replacement!.bytes);
      } finally {
        await rm(canonicalCache, { recursive: true, force: true });
      }
    },
  );

  it.each(['reference', 'child'] as const)(
    'preserves an irrevocably published %s replacement when post-link continuity fails',
    async (replacementTarget) => {
      const { canonicalCache, options } = await releaseArchiveFixture(
        `slopbrick-v103-won-${replacementTarget}-continuity-`,
      );
      const referencePath = join(
        canonicalCache,
        `${options.expectedAssetSha256}.safe-zip-v1.ref.json`,
      );
      let generatedTreePath: string | undefined;
      let linked = false;
      let replacement: Awaited<ReturnType<typeof atomicallyReplaceWithIdenticalBytes>> | undefined;
      let replacedPath: string | undefined;
      const unlinkedPaths: string[] = [];

      try {
        const failure = await extractReleaseArchive(options, {
          mkdirDirectory: async (path, mkdirOptions) => {
            await mkdir(path, mkdirOptions);
            if (
              typeof path === 'string'
              && /^\.v103-tree-[0-9a-f]{32}$/.test(basename(path))
            ) generatedTreePath = path;
          },
          lstatFile: async (path, lstatOptions) => {
            const metadata = await lstat(path, lstatOptions as { bigint: true });
            if (
              linked
              && replacement === undefined
              && String(path) === options.archivePath
              && generatedTreePath !== undefined
            ) {
              replacedPath = replacementTarget === 'reference'
                ? referencePath
                : join(generatedTreePath, 'pkg/readme.txt');
              replacement = await atomicallyReplaceWithIdenticalBytes(replacedPath);
            }
            return metadata;
          },
          linkFile: async (source, destination) => {
            await linkFile(source, destination);
            linked = true;
          },
          unlinkFile: async (path) => {
            unlinkedPaths.push(String(path));
            await unlink(path);
          },
        } as never).catch((error: unknown) => error);

        expect(linked).toBe(true);
        expect(generatedTreePath).toBeDefined();
        expect(replacedPath).toBeDefined();
        expect(replacement).toBeDefined();
        expect({ dev: replacement!.after.dev, ino: replacement!.after.ino })
          .not.toEqual({ dev: replacement!.before.dev, ino: replacement!.before.ino });
        expect(failure).toBeInstanceOf(SafeZipError);
        expect(failure).toMatchObject({ code: 'ERR_SAFE_ZIP_PUBLICATION' });
        expect(unlinkedPaths).not.toContain(replacedPath);
        expect(await lstat(replacedPath!, { bigint: true })).toMatchObject({
          dev: replacement!.after.dev,
          ino: replacement!.after.ino,
        });
        await expect(readFile(replacedPath!)).resolves.toEqual(replacement!.bytes);
        await expect(lstat(generatedTreePath!, { bigint: true })).resolves.toMatchObject({});
      } finally {
        await rm(canonicalCache, { recursive: true, force: true });
      }
    },
  );

  it.each(['reference', 'child'] as const)(
    'preserves a replaced EEXIST winner %s across first and final winner verification',
    async (replacementTarget) => {
      const { canonicalCache, options } = await releaseArchiveFixture(
        `slopbrick-v103-eexist-${replacementTarget}-continuity-`,
      );
      const referencePath = join(
        canonicalCache,
        `${options.expectedAssetSha256}.safe-zip-v1.ref.json`,
      );
      let stableReferenceHidden = false;
      let loserTreePath: string | undefined;
      let eexistObserved = false;
      let replacement: Awaited<ReturnType<typeof atomicallyReplaceWithIdenticalBytes>> | undefined;
      let replacedPath: string | undefined;
      const unlinkedPaths: string[] = [];

      try {
        const winner = await extractReleaseArchive(options);
        const winnerChildPath = join(winner.treePath, 'pkg/readme.txt');
        const failure = await extractReleaseArchive(options, {
          mkdirDirectory: async (path, mkdirOptions) => {
            await mkdir(path, mkdirOptions);
            if (
              typeof path === 'string'
              && /^\.v103-tree-[0-9a-f]{32}$/.test(basename(path))
              && path !== winner.treePath
            ) loserTreePath = path;
          },
          lstatFile: async (path, lstatOptions) => {
            const stringPath = String(path);
            if (stringPath === referencePath && !stableReferenceHidden) {
              stableReferenceHidden = true;
              throw Object.assign(new Error('synthetic absent stable reference'), { code: 'ENOENT' });
            }
            const metadata = await lstat(path, lstatOptions as { bigint: true });
            if (
              eexistObserved
              && replacement === undefined
              && stringPath === options.archivePath
            ) {
              replacedPath = replacementTarget === 'reference' ? referencePath : winnerChildPath;
              replacement = await atomicallyReplaceWithIdenticalBytes(replacedPath);
            }
            return metadata;
          },
          linkFile: async (source, destination) => {
            try {
              await linkFile(source, destination);
            } catch (error) {
              if (
                typeof error === 'object'
                && error !== null
                && 'code' in error
                && error.code === 'EEXIST'
              ) eexistObserved = true;
              throw error;
            }
          },
          unlinkFile: async (path) => {
            unlinkedPaths.push(String(path));
            await unlink(path);
          },
        } as never).catch((error: unknown) => error);

        expect(stableReferenceHidden).toBe(true);
        expect(loserTreePath).toBeDefined();
        expect(eexistObserved).toBe(true);
        expect(replacedPath).toBeDefined();
        expect(replacement).toBeDefined();
        expect({ dev: replacement!.after.dev, ino: replacement!.after.ino })
          .not.toEqual({ dev: replacement!.before.dev, ino: replacement!.before.ino });
        expect(failure).toBeInstanceOf(SafeZipError);
        expect(failure).toMatchObject({ code: 'ERR_SAFE_ZIP_PUBLICATION' });
        expect(unlinkedPaths).not.toContain(replacedPath);
        expect(await lstat(replacedPath!, { bigint: true })).toMatchObject({
          dev: replacement!.after.dev,
          ino: replacement!.after.ino,
        });
        await expect(readFile(replacedPath!)).resolves.toEqual(replacement!.bytes);
        const parsedWinner = parseCanonicalMaterializationCacheRefV1(await readFile(referencePath));
        expect(parsedWinner.ok).toBe(true);
        if (!parsedWinner.ok) throw new Error('expected preserved canonical winner');
        expect(parsedWinner.value.value.treeBasename).toBe(basename(winner.treePath));
        await expect(lstat(loserTreePath!, { bigint: true })).rejects.toMatchObject({ code: 'ENOENT' });
      } finally {
        await rm(canonicalCache, { recursive: true, force: true });
      }
    },
  );

  it('does not traverse descendants when cleanup finds a replaced generated-tree root', async () => {
    const { canonicalCache, options } = await releaseArchiveFixture('slopbrick-v103-cleanup-ancestor-');
    const marker = Buffer.from('replacement root is outside cleanup ownership');
    let generatedTreePath: string | undefined;
    let displacedTreePath: string | undefined;
    let swapped = false;
    const callsAfterSwap: Array<{ readonly operation: 'lstat' | 'unlink' | 'rmdir'; readonly path: string }> = [];

    try {
      const failure = await extractReleaseArchive(options, {
        mkdirDirectory: async (path, options) => {
          await mkdir(path, options);
          if (
            typeof path === 'string'
            && /^\.v103-tree-[0-9a-f]{32}$/.test(basename(path))
          ) generatedTreePath = path;
        },
        lstatFile: async (path, options) => {
          if (swapped) callsAfterSwap.push({ operation: 'lstat', path: String(path) });
          return lstat(path, options as { bigint: true });
        },
        unlinkFile: async (path) => {
          if (swapped) callsAfterSwap.push({ operation: 'unlink', path: String(path) });
          await unlink(path);
        },
        removeDirectory: async (path) => {
          if (swapped) callsAfterSwap.push({ operation: 'rmdir', path: String(path) });
          await rmdir(path);
        },
        linkFile: async () => {
          if (generatedTreePath === undefined) throw new Error('generated tree was not observed');
          displacedTreePath = `${generatedTreePath}.displaced`;
          await rename(generatedTreePath, displacedTreePath);
          await mkdir(generatedTreePath, { mode: 0o700 });
          await writeFile(join(generatedTreePath, 'replacement-marker'), marker, { mode: 0o600 });
          swapped = true;
          throw Object.assign(new Error('forced publication failure'), { code: 'EIO' });
        },
      } as never).catch((error: unknown) => error);

      expect(swapped).toBe(true);
      expect(failure).toBeInstanceOf(SafeZipError);
      expect(failure).toMatchObject({ code: 'ERR_SAFE_ZIP_PUBLICATION' });
      expect([String(failure), JSON.stringify(failure), (failure as Error).stack].join('\n'))
        .not.toContain(canonicalCache);
      expect(Object.prototype.hasOwnProperty.call(failure, 'cause')).toBe(false);
      expect(generatedTreePath).toBeDefined();
      expect(displacedTreePath).toBeDefined();
      const descendantCalls = callsAfterSwap.filter(
        (call) => call.path.startsWith(`${generatedTreePath!}/`),
      );
      expect(descendantCalls).toEqual([]);
      await expect(readFile(join(generatedTreePath!, 'replacement-marker'))).resolves.toEqual(marker);
      await expect(lstat(displacedTreePath!, { bigint: true })).resolves.toMatchObject({});
    } finally {
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  it('revalidates the full ancestor chain before cleaning a reparented recorded child', async () => {
    const { canonicalCache, options } = await releaseArchiveFixture('slopbrick-v103-cleanup-deep-ancestor-');
    const replacementMarker = Buffer.from('replacement root must survive cleanup');
    const originalPayload = Buffer.from('release payload');
    let generatedTreePath: string | undefined;
    let displacedTreePath: string | undefined;
    let publicationFailed = false;
    let swappedDuringChildCheck = false;
    let recordedChildIdentity: { readonly dev: bigint; readonly ino: bigint } | undefined;
    let reparentedChildIdentity: { readonly dev: bigint; readonly ino: bigint } | undefined;
    let randomCalls = 0;
    const callsAfterSwap: Array<{ readonly operation: 'lstat' | 'unlink' | 'rmdir'; readonly path: string }> = [];

    try {
      const failure = await extractReleaseArchive(options, {
        mkdirDirectory: async (path, mkdirOptions) => {
          await mkdir(path, mkdirOptions);
          if (
            typeof path === 'string'
            && /^\.v103-tree-[0-9a-f]{32}$/.test(basename(path))
          ) generatedTreePath = path;
        },
        lstatFile: async (path, lstatOptions) => {
          const stringPath = String(path);
          if (swappedDuringChildCheck) {
            callsAfterSwap.push({ operation: 'lstat', path: stringPath });
          }
          if (
            publicationFailed
            && !swappedDuringChildCheck
            && generatedTreePath !== undefined
            && stringPath === join(generatedTreePath, 'pkg')
          ) {
            recordedChildIdentity = await lstat(path, lstatOptions as { bigint: true });
            displacedTreePath = `${generatedTreePath}.displaced`;
            await rename(generatedTreePath, displacedTreePath);
            await mkdir(generatedTreePath, { mode: 0o700 });
            await writeFile(
              join(generatedTreePath, 'replacement-marker'),
              replacementMarker,
              { mode: 0o600 },
            );
            await rename(
              join(displacedTreePath, 'pkg'),
              join(generatedTreePath, 'pkg'),
            );
            reparentedChildIdentity = await lstat(
              join(generatedTreePath, 'pkg'),
              { bigint: true },
            );
            swappedDuringChildCheck = true;
            return recordedChildIdentity;
          }
          return lstat(path, lstatOptions as { bigint: true });
        },
        unlinkFile: async (path) => {
          if (swappedDuringChildCheck) {
            callsAfterSwap.push({ operation: 'unlink', path: String(path) });
          }
          await unlink(path);
        },
        removeDirectory: async (path) => {
          if (swappedDuringChildCheck) {
            callsAfterSwap.push({ operation: 'rmdir', path: String(path) });
          }
          await rmdir(path);
        },
        randomBytes: (size) => {
          if (size !== 16) throw new Error('unexpected token size');
          randomCalls += 1;
          if (randomCalls === 1) return Buffer.alloc(16, 0xe1);
          publicationFailed = true;
          throw new Error('forced pre-link token failure');
        },
      } as never).catch((error: unknown) => error);

      expect(publicationFailed).toBe(true);
      expect(randomCalls).toBe(2);
      expect(swappedDuringChildCheck).toBe(true);
      expect(failure).toBeInstanceOf(SafeZipError);
      expect(failure).toMatchObject({ code: 'ERR_SAFE_ZIP_PUBLICATION' });
      expect(generatedTreePath).toBeDefined();
      expect(displacedTreePath).toBeDefined();
      expect(recordedChildIdentity).toBeDefined();
      expect(reparentedChildIdentity).toBeDefined();
      expect({ dev: reparentedChildIdentity!.dev, ino: reparentedChildIdentity!.ino })
        .toEqual({ dev: recordedChildIdentity!.dev, ino: recordedChildIdentity!.ino });
      const descendantCalls = callsAfterSwap.filter(
        (call) => call.path.startsWith(`${generatedTreePath!}/`),
      );
      expect(descendantCalls).toEqual([]);
      await expect(readFile(join(generatedTreePath!, 'replacement-marker')))
        .resolves.toEqual(replacementMarker);
      await expect(readFile(join(generatedTreePath!, 'pkg/readme.txt')))
        .resolves.toEqual(originalPayload);
      await expect(lstat(displacedTreePath!, { bigint: true })).resolves.toMatchObject({});
    } finally {
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  it('revalidates an owned file immediately before cleanup unlinks its pathname', async () => {
    const { canonicalCache, options } = await releaseArchiveFixture('slopbrick-v103-cleanup-file-swap-');
    let generatedTreePath: string | undefined;
    let publicationFailed = false;
    let childValidated = false;
    let replacement: Awaited<ReturnType<typeof atomicallyReplaceWithIdenticalBytes>> | undefined;
    let randomCalls = 0;
    const unlinkedPaths: string[] = [];

    try {
      const failure = await extractReleaseArchive(options, {
        mkdirDirectory: async (path, mkdirOptions) => {
          await mkdir(path, mkdirOptions);
          if (
            typeof path === 'string'
            && /^\.v103-tree-[0-9a-f]{32}$/.test(basename(path))
          ) generatedTreePath = path;
        },
        lstatFile: async (path, lstatOptions) => {
          const metadata = await lstat(path, lstatOptions as { bigint: true });
          if (!publicationFailed || generatedTreePath === undefined) return metadata;
          const stringPath = String(path);
          const childPath = join(generatedTreePath, 'pkg/readme.txt');
          if (!childValidated && stringPath === childPath) {
            childValidated = true;
            return metadata;
          }
          if (childValidated && replacement === undefined && stringPath === generatedTreePath) {
            replacement = await atomicallyReplaceWithIdenticalBytes(childPath);
          }
          return metadata;
        },
        unlinkFile: async (path) => {
          unlinkedPaths.push(String(path));
          await unlink(path);
        },
        randomBytes: (size) => {
          if (size !== 16) throw new Error('unexpected token size');
          randomCalls += 1;
          if (randomCalls === 1) return Buffer.alloc(16, 0xe2);
          publicationFailed = true;
          throw new Error('forced pre-link token failure');
        },
      } as never).catch((error: unknown) => error);

      expect(publicationFailed).toBe(true);
      expect(randomCalls).toBe(2);
      expect(generatedTreePath).toBeDefined();
      expect(childValidated).toBe(true);
      expect(replacement).toBeDefined();
      expect({ dev: replacement!.after.dev, ino: replacement!.after.ino })
        .not.toEqual({ dev: replacement!.before.dev, ino: replacement!.before.ino });
      expect(failure).toBeInstanceOf(SafeZipError);
      expect(failure).toMatchObject({ code: 'ERR_SAFE_ZIP_PUBLICATION' });
      const childPath = join(generatedTreePath!, 'pkg/readme.txt');
      expect(unlinkedPaths).not.toContain(childPath);
      await expect(readFile(childPath)).resolves.toEqual(replacement!.bytes);
      expect(await lstat(childPath, { bigint: true })).toMatchObject({
        dev: replacement!.after.dev,
        ino: replacement!.after.ino,
      });
    } finally {
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  it('rejects a post-open archive pathname whose link count changes before any publication', async () => {
    const { canonicalCache, options } = await releaseArchiveFixture('slopbrick-v103-archive-nlink-');
    let archivePathLstats = 0;
    const publish = vi.fn(async (source: string, destination: string) => {
      await linkFile(source, destination);
    });

    try {
      const failure = await extractReleaseArchive(options, {
        lstatFile: async (path, lstatOptions) => {
          const metadata = await lstat(path, lstatOptions as { bigint: true });
          if (String(path) !== options.archivePath || ++archivePathLstats !== 2) return metadata;
          return new Proxy(metadata, {
            get: (target, property) => {
              if (property === 'nlink') return 2n;
              const value = Reflect.get(target, property, target);
              return typeof value === 'function' ? value.bind(target) : value;
            },
          });
        },
        linkFile: publish,
      } as never).catch((error: unknown) => error);

      expect(archivePathLstats).toBeGreaterThanOrEqual(2);
      expect(failure).toBeInstanceOf(SafeZipError);
      expect(failure).toMatchObject({ code: 'ERR_SAFE_ZIP_ARCHIVE_MUTATED' });
      expect(publish).not.toHaveBeenCalled();
    } finally {
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  it('preserves a published reference and its tree when link succeeds before reporting EIO', async () => {
    const { canonicalCache, options } = await releaseArchiveFixture('slopbrick-v103-link-eio-');
    const referencePath = join(
      canonicalCache,
      `${options.expectedAssetSha256}.safe-zip-v1.ref.json`,
    );
    const secret = `${canonicalCache}/link-operation-secret`;
    let linked = false;

    try {
      const failure = await extractReleaseArchive(options, {
        linkFile: async (source, destination) => {
          await linkFile(source, destination);
          linked = true;
          throw Object.assign(new Error(secret), { code: 'EIO' });
        },
      }).catch((error: unknown) => error);

      expect(linked).toBe(true);
      expect(failure).toBeInstanceOf(SafeZipError);
      expect(failure).toMatchObject({ code: 'ERR_SAFE_ZIP_PUBLICATION' });
      expect([String(failure), JSON.stringify(failure), (failure as Error).stack].join('\n'))
        .not.toContain(secret);
      expect(Object.prototype.hasOwnProperty.call(failure, 'cause')).toBe(false);

      const parsedReference = parseCanonicalMaterializationCacheRefV1(await readFile(referencePath));
      expect(parsedReference.ok).toBe(true);
      if (!parsedReference.ok) throw new Error('expected the completed hard link to remain canonical');
      const treePath = join(canonicalCache, parsedReference.value.value.treeBasename);
      await expect(readFile(join(treePath, 'pkg/readme.txt'))).resolves.toEqual(Buffer.from('release payload'));
      await expect(extractReleaseArchive(options)).resolves.toMatchObject({
        cacheStatus: 'reused',
        treePath,
      });
    } finally {
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  it('does not adopt or clean a generation pathname replacement after the verified handle closes', async () => {
    const { canonicalCache, options } = await releaseArchiveFixture('slopbrick-v103-swap-cleanup-');
    const marker = Buffer.from('replacement must survive byte-for-byte');
    let generatedTreePath: string | undefined;
    let displacedTreePath: string | undefined;
    let replacementIdentity: Awaited<ReturnType<typeof lstat>> | undefined;
    let swapped = false;
    const removedDirectories: string[] = [];

    try {
      const failure = await extractReleaseArchive(options, {
        openFile: async (path, flags, mode) => {
          const handle = await openFile(path, flags, mode);
          if (
            !swapped
            && typeof path === 'string'
            && /^\.v103-tree-[0-9a-f]{32}$/.test(basename(path))
          ) {
            generatedTreePath = path;
            displacedTreePath = `${path}.displaced`;
            const close = handle.close.bind(handle);
            Object.defineProperty(handle, 'close', {
              configurable: true,
              value: async () => {
                await close();
                await rename(path, displacedTreePath!);
                await mkdir(path, { mode: 0o700 });
                await writeFile(join(path, 'replacement-marker'), marker, { mode: 0o600 });
                replacementIdentity = await lstat(path, { bigint: true });
                swapped = true;
              },
            });
          }
          return handle;
        },
        removeDirectory: async (path) => {
          removedDirectories.push(String(path));
          await rmdir(path);
        },
      } as never).catch((error: unknown) => error);

      expect(swapped).toBe(true);
      expect(failure).toBeInstanceOf(SafeZipError);
      expect([String(failure), JSON.stringify(failure), (failure as Error).stack].join('\n'))
        .not.toContain(canonicalCache);
      expect(Object.prototype.hasOwnProperty.call(failure, 'cause')).toBe(false);
      expect(generatedTreePath).toBeDefined();
      expect(displacedTreePath).toBeDefined();
      expect(replacementIdentity).toBeDefined();
      expect(removedDirectories).not.toContain(generatedTreePath);
      const replacementAfter = await lstat(generatedTreePath!, { bigint: true });
      expect({ dev: replacementAfter.dev, ino: replacementAfter.ino })
        .toEqual({ dev: replacementIdentity!.dev, ino: replacementIdentity!.ino });
      await expect(readFile(join(generatedTreePath!, 'replacement-marker'))).resolves.toEqual(marker);
      await expect(lstat(displacedTreePath!, { bigint: true })).resolves.toMatchObject({});
    } finally {
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  it('contains hostile resolved dependency objects behind stable path-free errors', async () => {
    const { canonicalCache, options } = await releaseArchiveFixture('slopbrick-v103-hostile-deps-');
    const cacheMetadata = await lstat(canonicalCache, { bigint: true });
    const cases = [
      {
        label: 'realpath then getter',
        secret: `${canonicalCache}/realpath-then-secret`,
        dependencies: (secret: string) => ({
          realpathFile: () => new Proxy({}, {
            get: (_target, property) => {
              if (property === 'then') throw new Error(secret);
              return undefined;
            },
          }) as Promise<string>,
        }),
      },
      {
        label: 'lstat mode getter',
        secret: `${canonicalCache}/lstat-mode-secret`,
        dependencies: (secret: string) => ({
          realpathFile: async () => canonicalCache,
          lstatFile: async () => new Proxy(cacheMetadata, {
            get: (target, property) => {
              if (property === 'mode') throw new Error(secret);
              const value = Reflect.get(target, property, target);
              return typeof value === 'function' ? value.bind(target) : value;
            },
          }),
        }),
      },
      {
        label: 'lstat type method',
        secret: `${canonicalCache}/lstat-method-secret`,
        dependencies: (secret: string) => ({
          realpathFile: async () => canonicalCache,
          lstatFile: async () => new Proxy(cacheMetadata, {
            get: (target, property) => {
              if (property === 'isDirectory') return () => { throw new Error(secret); };
              const value = Reflect.get(target, property, target);
              return typeof value === 'function' ? value.bind(target) : value;
            },
          }),
        }),
      },
    ] as const;

    try {
      for (const testCase of cases) {
        const failure = await extractReleaseArchive(
          options,
          testCase.dependencies(testCase.secret) as never,
        ).catch((error: unknown) => error);
        expect(failure, testCase.label).toBeInstanceOf(SafeZipError);
        expect([String(failure), JSON.stringify(failure), (failure as Error).stack].join('\n'), testCase.label)
          .not.toContain(testCase.secret);
        expect(Object.prototype.hasOwnProperty.call(failure, 'cause'), testCase.label).toBe(false);
      }
    } finally {
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  it('orders durable writes, directory syncs, cache syncs, and no-replace publication', async () => {
    const fixture = buildRawZipFixture({ entries: [
      { name: 'pkg/' },
      { name: 'pkg/a.txt', data: Buffer.from('first payload') },
      { name: 'pkg/src/' },
      { name: 'pkg/src/b.txt', data: Buffer.from('second payload') },
    ] });
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-v103-durability-order-'));
    const canonicalCache = await realpath(root);
    const expectedAssetSha256 = createHash('sha256').update(fixture.bytes).digest('hex');
    const archivePath = join(canonicalCache, `${expectedAssetSha256}.zip`);
    await writeFile(archivePath, fixture.bytes);
    const options = {
      archivePath,
      expectedAssetSha256,
      expectedAssetBytes: fixture.bytes.byteLength,
      cacheDirectory: canonicalCache,
      extractionPolicy: 'safe-zip-v1' as const,
    };
    const random = deterministicRandomBytes([0x80, 0x81]);
    const treePath = join(canonicalCache, `.v103-tree-${random.token(0)}`);
    const temporaryReferencePath = join(canonicalCache, `.v103-ref-${random.token(1)}.tmp`);
    const referencePath = join(canonicalCache, `${expectedAssetSha256}.safe-zip-v1.ref.json`);
    const harness = createDurabilityHarness({
      cacheDirectory: canonicalCache,
      archivePath,
      referencePath,
      treePath,
    });
    const archiveBefore = await lstat(archivePath, { bigint: true });

    try {
      const created = await extractReleaseArchive(options, {
        ...harness.dependencies,
        randomBytes: random.randomBytes,
      } as never);

      expect(created.cacheStatus).toBe('created');
      expect(created.treePath).toBe(treePath);
      expectEventSubsequence(harness.events, [
        'open:extracted:pkg/a.txt',
        'write:extracted:pkg/a.txt',
        'effect:write:extracted:pkg/a.txt',
        'sync:extracted:pkg/a.txt',
        'effect:sync:extracted:pkg/a.txt',
        'close:extracted:pkg/a.txt',
        'effect:close:extracted:pkg/a.txt',
        'open:extracted:pkg/src/b.txt',
        'write:extracted:pkg/src/b.txt',
        'effect:write:extracted:pkg/src/b.txt',
        'sync:extracted:pkg/src/b.txt',
        'effect:sync:extracted:pkg/src/b.txt',
        'close:extracted:pkg/src/b.txt',
        'effect:close:extracted:pkg/src/b.txt',
        'open:receipt',
        'write:receipt',
        'effect:write:receipt',
        'sync:receipt',
        'effect:sync:receipt',
        'close:receipt',
        'effect:close:receipt',
        'sync:directory:pkg/src',
        'effect:sync:directory:pkg/src',
        'sync:directory:pkg',
        'effect:sync:directory:pkg',
        'sync:directory:.',
        'effect:sync:directory:.',
        'sync:cache:1',
        'effect:sync:cache:1',
        'open:temporary-reference',
        'write:temporary-reference',
        'effect:write:temporary-reference',
        'sync:temporary-reference',
        'effect:sync:temporary-reference',
        'close:temporary-reference',
        'effect:close:temporary-reference',
        'prelink-check:archive',
        'effect:prelink-check:archive',
        'prelink-check:receipt',
        'effect:prelink-check:receipt',
        'prelink-check:tree',
        'effect:prelink-check:tree',
        'link',
        'effect:link',
        'sync:cache:2',
        'effect:sync:cache:2',
        'unlink:temporary-reference',
        'effect:unlink:temporary-reference',
        'sync:cache:3',
        'effect:sync:cache:3',
        'postlink:first-reference',
        'effect:postlink:first-reference',
        'postlink:first-receipt',
        'effect:postlink:first-receipt',
        'postlink:first-tree',
        'effect:postlink:first-tree',
        'postlink:first-archive',
        'effect:postlink:first-archive',
        'postlink:final-reference',
        'effect:postlink:final-reference',
        'postlink:final-receipt',
        'effect:postlink:final-receipt',
        'postlink:final-tree',
        'effect:postlink:final-tree',
        'postlink:final-branch-archive',
        'effect:postlink:final-branch-archive',
        'postlink:outer-final-archive',
        'effect:postlink:outer-final-archive',
      ]);
      for (const event of [
        'sync:extracted:pkg/a.txt',
        'sync:extracted:pkg/src/b.txt',
        'sync:receipt',
        'sync:directory:pkg/src',
        'sync:directory:pkg',
        'sync:directory:.',
        'sync:temporary-reference',
        'link',
        'effect:link',
        'unlink:temporary-reference',
      ]) expect(harness.events.filter((candidate) => candidate === event), event).toHaveLength(1);
      expect(harness.events.filter((event) => event.startsWith('sync:cache:'))).toEqual([
        'sync:cache:1',
        'sync:cache:2',
        'sync:cache:3',
      ]);
      expectDurabilityHandlesClosed(harness);
      expect(harness.failureTriggered()).toBe(false);
      expect(harness.cleanupPaths).toEqual([temporaryReferencePath]);
      const archiveAfter = await lstat(archivePath, { bigint: true });
      expect({
        dev: archiveAfter.dev,
        ino: archiveAfter.ino,
        size: archiveAfter.size,
        uid: archiveAfter.uid,
        mode: archiveAfter.mode,
        nlink: archiveAfter.nlink,
      }).toEqual({
        dev: archiveBefore.dev,
        ino: archiveBefore.ino,
        size: archiveBefore.size,
        uid: archiveBefore.uid,
        mode: archiveBefore.mode,
        nlink: archiveBefore.nlink,
      });
      await expect(readFile(archivePath)).resolves.toEqual(fixture.bytes);
    } finally {
      await harness.forceCloseLeakedHandles();
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  it.each([
    ['partial extracted-file write', 'partial-extracted-write', 'partial', 'ERR_SAFE_ZIP_STREAM', 'effect:write:extracted:pkg/src/readme.txt:partial'],
    ['extracted-file sync before syscall', 'extracted-sync', 'before', 'ERR_SAFE_ZIP_STREAM', 'effect:sync:extracted:pkg/src/readme.txt'],
    ['extracted-file sync after syscall', 'extracted-sync', 'after', 'ERR_SAFE_ZIP_STREAM', 'effect:sync:extracted:pkg/src/readme.txt'],
    ['receipt write before syscall', 'receipt-write', 'before', 'ERR_SAFE_ZIP_RECEIPT', 'effect:write:receipt'],
    ['receipt write after syscall', 'receipt-write', 'after', 'ERR_SAFE_ZIP_RECEIPT', 'effect:write:receipt'],
    ['receipt sync before syscall', 'receipt-sync', 'before', 'ERR_SAFE_ZIP_RECEIPT', 'effect:sync:receipt'],
    ['receipt sync after syscall', 'receipt-sync', 'after', 'ERR_SAFE_ZIP_RECEIPT', 'effect:sync:receipt'],
    ['deepest-child directory sync before syscall', 'deepest-directory-sync', 'before', 'ERR_SAFE_ZIP_TREE', 'effect:sync:directory:pkg/src'],
    ['deepest-child directory sync after syscall', 'deepest-directory-sync', 'after', 'ERR_SAFE_ZIP_TREE', 'effect:sync:directory:pkg/src'],
    ['parent directory sync before syscall', 'parent-directory-sync', 'before', 'ERR_SAFE_ZIP_TREE', 'effect:sync:directory:pkg'],
    ['parent directory sync after syscall', 'parent-directory-sync', 'after', 'ERR_SAFE_ZIP_TREE', 'effect:sync:directory:pkg'],
    ['root-directory sync before syscall', 'root-directory-sync', 'before', 'ERR_SAFE_ZIP_TREE', 'effect:sync:directory:.'],
    ['root-directory sync after syscall', 'root-directory-sync', 'after', 'ERR_SAFE_ZIP_TREE', 'effect:sync:directory:.'],
    ['prepublication cache sync before syscall', 'prepublication-cache-sync', 'before', 'ERR_SAFE_ZIP_PUBLICATION', 'effect:sync:cache:1'],
    ['prepublication cache sync after syscall', 'prepublication-cache-sync', 'after', 'ERR_SAFE_ZIP_PUBLICATION', 'effect:sync:cache:1'],
    ['temporary-reference write before syscall', 'temporary-reference-write', 'before', 'ERR_SAFE_ZIP_PUBLICATION', 'effect:write:temporary-reference'],
    ['temporary-reference write after syscall', 'temporary-reference-write', 'after', 'ERR_SAFE_ZIP_PUBLICATION', 'effect:write:temporary-reference'],
    ['temporary-reference sync before syscall', 'temporary-reference-sync', 'before', 'ERR_SAFE_ZIP_PUBLICATION', 'effect:sync:temporary-reference'],
    ['temporary-reference sync after syscall', 'temporary-reference-sync', 'after', 'ERR_SAFE_ZIP_PUBLICATION', 'effect:sync:temporary-reference'],
    ['extracted-file close before effect', 'extracted-close', 'before', 'ERR_SAFE_ZIP_TREE', 'effect:close:extracted:pkg/src/readme.txt'],
    ['extracted-file close after effect', 'extracted-close', 'after', 'ERR_SAFE_ZIP_TREE', 'effect:close:extracted:pkg/src/readme.txt'],
    ['receipt close before effect', 'receipt-close', 'before', 'ERR_SAFE_ZIP_RECEIPT', 'effect:close:receipt'],
    ['receipt close after effect', 'receipt-close', 'after', 'ERR_SAFE_ZIP_RECEIPT', 'effect:close:receipt'],
    ['temporary-reference close before effect', 'temporary-reference-close', 'before', 'ERR_SAFE_ZIP_PUBLICATION', 'effect:close:temporary-reference'],
    ['temporary-reference close after effect', 'temporary-reference-close', 'after', 'ERR_SAFE_ZIP_PUBLICATION', 'effect:close:temporary-reference'],
    ['prelink archive check before lstat', 'prelink-archive-check', 'before', 'ERR_SAFE_ZIP_ARCHIVE_MUTATED', 'effect:prelink-check:archive'],
    ['prelink archive check after lstat', 'prelink-archive-check', 'after', 'ERR_SAFE_ZIP_ARCHIVE_MUTATED', 'effect:prelink-check:archive'],
    ['prelink receipt check before lstat', 'prelink-receipt-check', 'before', 'ERR_SAFE_ZIP_RECEIPT', 'effect:prelink-check:receipt'],
    ['prelink receipt check after lstat', 'prelink-receipt-check', 'after', 'ERR_SAFE_ZIP_RECEIPT', 'effect:prelink-check:receipt'],
    ['prelink tree check before lstat', 'prelink-tree-check', 'before', 'ERR_SAFE_ZIP_TREE', 'effect:prelink-check:tree'],
    ['prelink tree check after lstat', 'prelink-tree-check', 'after', 'ERR_SAFE_ZIP_TREE', 'effect:prelink-check:tree'],
    ['link before hard-link syscall', 'link-before-hard-link', 'before', 'ERR_SAFE_ZIP_PUBLICATION', 'effect:link'],
  ] as const)(
    'fails safely at pre-link durability point: %s',
    async (label, point, timing, expectedCode, effectEvent) => {
      const prefix = label.replace(/[^a-z]+/g, '-');
      const { canonicalCache, fixture, options } = await nestedReleaseArchiveFixture(
        `slopbrick-v103-durability-${prefix}-`,
      );
      const random = deterministicRandomBytes([0x82, 0x83]);
      const treePath = join(canonicalCache, `.v103-tree-${random.token(0)}`);
      const temporaryReferencePath = join(canonicalCache, `.v103-ref-${random.token(1)}.tmp`);
      const referencePath = join(
        canonicalCache,
        `${options.expectedAssetSha256}.safe-zip-v1.ref.json`,
      );
      const harness = createDurabilityHarness({
        cacheDirectory: canonicalCache,
        archivePath: options.archivePath,
        referencePath,
        treePath,
        failure: { point, timing } as DurabilityFailureSpec,
      });
      const archiveBefore = await lstat(options.archivePath, { bigint: true });

      try {
        const failure = await extractReleaseArchive(options, {
          ...harness.dependencies,
          randomBytes: random.randomBytes,
        } as never).catch((error: unknown) => error);

        expect(harness.failureTriggered(), label).toBe(true);
        expect(failure, label).toBeInstanceOf(SafeZipError);
        expect(failure, label).toMatchObject({ code: expectedCode });
        expect([String(failure), JSON.stringify(failure), (failure as Error).stack].join('\n'), label)
          .not.toContain(canonicalCache);
        expect(Object.prototype.hasOwnProperty.call(failure, 'cause'), label).toBe(false);
        const failedBeforeEffectLabel = timing === 'before'
          ? point === 'extracted-close'
            ? 'extracted:pkg/src/readme.txt'
            : point === 'receipt-close'
              ? 'receipt'
              : point === 'temporary-reference-close'
                ? 'temporary-reference'
                : undefined
          : undefined;
        expectDurabilityHandlesClosed(harness, failedBeforeEffectLabel);
        const expectedEffectCount = timing === 'before' ? 0 : 1;
        expect(harness.events.filter((event) => event === effectEvent), `${label} effect count`)
          .toHaveLength(expectedEffectCount);
        if (point === 'partial-extracted-write') {
          expect(harness.events.filter(
            (event) => event === 'effect:write:extracted:pkg/src/readme.txt',
          ), `${label} full-write effects`).toHaveLength(0);
        }
        if (failedBeforeEffectLabel !== undefined) {
          expect(harness.events.filter((event) => event === `close:${failedBeforeEffectLabel}`), label)
            .toHaveLength(1);
          expect(harness.events, label).not.toContain(`effect:close:${failedBeforeEffectLabel}`);
        }
        if (point.startsWith('prelink-')) {
          expect(harness.events.filter((event) => event === 'link'), label).toHaveLength(0);
          expect(harness.events.filter((event) => event === 'effect:link'), label).toHaveLength(0);
        }
        const preservesSafeOrphan = point === 'link-before-hard-link';
        expect(harness.cleanupPaths.every((path) => preservesSafeOrphan
          ? path === temporaryReferencePath
          : path === temporaryReferencePath || path === treePath || path.startsWith(`${treePath}/`)), label)
          .toBe(true);
        expect(harness.cleanupPaths, label).not.toContain(referencePath);
        if (preservesSafeOrphan) {
          expect(harness.cleanupPaths.some((path) => path === treePath || path.startsWith(`${treePath}/`)), label)
            .toBe(false);
        }
        await expect(lstat(referencePath, { bigint: true }), label)
          .rejects.toMatchObject({ code: 'ENOENT' });
        if (preservesSafeOrphan) {
          await expect(lstat(treePath, { bigint: true }), label).resolves.toMatchObject({});
          await expect(readFile(join(treePath, 'pkg/src/readme.txt')), label)
            .resolves.toEqual(Buffer.from('nested release payload'));
        } else {
          await expect(lstat(treePath, { bigint: true }), label)
            .rejects.toMatchObject({ code: 'ENOENT' });
        }
        await expect(lstat(temporaryReferencePath, { bigint: true }), label)
          .rejects.toMatchObject({ code: 'ENOENT' });
        const archiveAfter = await lstat(options.archivePath, { bigint: true });
        expect({
          dev: archiveAfter.dev,
          ino: archiveAfter.ino,
          size: archiveAfter.size,
          uid: archiveAfter.uid,
          mode: archiveAfter.mode,
          nlink: archiveAfter.nlink,
        }, label).toEqual({
          dev: archiveBefore.dev,
          ino: archiveBefore.ino,
          size: archiveBefore.size,
          uid: archiveBefore.uid,
          mode: archiveBefore.mode,
          nlink: archiveBefore.nlink,
        });
        await expect(readFile(options.archivePath), label).resolves.toEqual(fixture.bytes);
        const cacheEntries = await readdir(canonicalCache);
        expect(cacheEntries.filter((entry) => /^\.v103-tree-[0-9a-f]{32}$/.test(entry)), label)
          .toHaveLength(preservesSafeOrphan ? 1 : 0);
        expect(cacheEntries.filter((entry) => /^\.v103-ref-[0-9a-f]{32}\.tmp$/.test(entry)), label)
          .toHaveLength(0);
      } finally {
        await harness.forceCloseLeakedHandles();
        await rm(canonicalCache, { recursive: true, force: true });
      }
    },
  );

  it.each([
    ['first post-link cache sync before syscall', 'first-postlink-cache-sync', 'before', 'ERR_SAFE_ZIP_PUBLICATION', 'effect:sync:cache:2'],
    ['first post-link cache sync after syscall', 'first-postlink-cache-sync', 'after', 'ERR_SAFE_ZIP_PUBLICATION', 'effect:sync:cache:2'],
    ['temporary-reference unlink before syscall', 'temporary-reference-unlink', 'before', 'ERR_SAFE_ZIP_PUBLICATION', 'effect:unlink:temporary-reference'],
    ['temporary-reference unlink after syscall', 'temporary-reference-unlink', 'after', 'ERR_SAFE_ZIP_PUBLICATION', 'effect:unlink:temporary-reference'],
    ['post-unlink cache sync before syscall', 'postunlink-cache-sync', 'before', 'ERR_SAFE_ZIP_PUBLICATION', 'effect:sync:cache:3'],
    ['post-unlink cache sync after syscall', 'postunlink-cache-sync', 'after', 'ERR_SAFE_ZIP_PUBLICATION', 'effect:sync:cache:3'],
    ['first published reference check before lstat', 'first-published-reference-check', 'before', 'ERR_SAFE_ZIP_PUBLICATION', 'effect:postlink:first-reference'],
    ['first published reference check after lstat', 'first-published-reference-check', 'after', 'ERR_SAFE_ZIP_PUBLICATION', 'effect:postlink:first-reference'],
    ['first published tree check before lstat', 'first-published-tree-check', 'before', 'ERR_SAFE_ZIP_TREE', 'effect:postlink:first-tree'],
    ['first published tree check after lstat', 'first-published-tree-check', 'after', 'ERR_SAFE_ZIP_TREE', 'effect:postlink:first-tree'],
    ['first post-link archive check before lstat', 'first-postlink-archive-check', 'before', 'ERR_SAFE_ZIP_ARCHIVE_MUTATED', 'effect:postlink:first-archive'],
    ['first post-link archive check after lstat', 'first-postlink-archive-check', 'after', 'ERR_SAFE_ZIP_ARCHIVE_MUTATED', 'effect:postlink:first-archive'],
    ['final published reference check before lstat', 'final-published-reference-check', 'before', 'ERR_SAFE_ZIP_PUBLICATION', 'effect:postlink:final-reference'],
    ['final published reference check after lstat', 'final-published-reference-check', 'after', 'ERR_SAFE_ZIP_PUBLICATION', 'effect:postlink:final-reference'],
    ['final published tree check before lstat', 'final-published-tree-check', 'before', 'ERR_SAFE_ZIP_TREE', 'effect:postlink:final-tree'],
    ['final published tree check after lstat', 'final-published-tree-check', 'after', 'ERR_SAFE_ZIP_TREE', 'effect:postlink:final-tree'],
    ['final in-branch archive check before lstat', 'final-branch-archive-check', 'before', 'ERR_SAFE_ZIP_ARCHIVE_MUTATED', 'effect:postlink:final-branch-archive'],
    ['final in-branch archive check after lstat', 'final-branch-archive-check', 'after', 'ERR_SAFE_ZIP_ARCHIVE_MUTATED', 'effect:postlink:final-branch-archive'],
    ['outer final archive check before lstat', 'outer-final-archive-check', 'before', 'ERR_SAFE_ZIP_ARCHIVE_MUTATED', 'effect:postlink:outer-final-archive'],
    ['outer final archive check after lstat', 'outer-final-archive-check', 'after', 'ERR_SAFE_ZIP_ARCHIVE_MUTATED', 'effect:postlink:outer-final-archive'],
  ] as const)(
    'preserves an irrevocable publication at post-link durability point: %s',
    async (label, point, timing, expectedCode, effectEvent) => {
      const prefix = label.replace(/[^a-z]+/g, '-');
      const { canonicalCache, fixture, options } = await nestedReleaseArchiveFixture(
        `slopbrick-v103-postlink-${prefix}-`,
      );
      const random = deterministicRandomBytes([0x84, 0x85]);
      const treePath = join(canonicalCache, `.v103-tree-${random.token(0)}`);
      const temporaryReferencePath = join(canonicalCache, `.v103-ref-${random.token(1)}.tmp`);
      const referencePath = join(
        canonicalCache,
        `${options.expectedAssetSha256}.safe-zip-v1.ref.json`,
      );
      let publishedSnapshot: readonly PublishedArtifactSnapshotEntry[] | undefined;
      const harness = createDurabilityHarness({
        cacheDirectory: canonicalCache,
        archivePath: options.archivePath,
        referencePath,
        treePath,
        failure: { point, timing } as DurabilityFailureSpec,
        afterLinkEffect: async () => {
          publishedSnapshot = await capturePublishedArtifactSnapshot(referencePath, treePath);
        },
      });
      const archiveBefore = await lstat(options.archivePath, { bigint: true });

      try {
        const failure = await extractReleaseArchive(options, {
          ...harness.dependencies,
          randomBytes: random.randomBytes,
        } as never).catch((error: unknown) => error);

        expect(harness.failureTriggered(), label).toBe(true);
        expect(failure, label).toBeInstanceOf(SafeZipError);
        expect(failure, label).toMatchObject({ code: expectedCode });
        expect([String(failure), JSON.stringify(failure), (failure as Error).stack].join('\n'), label)
          .not.toContain(canonicalCache);
        expect(Object.prototype.hasOwnProperty.call(failure, 'cause'), label).toBe(false);
        expect(harness.events.filter((event) => event === 'effect:link'), label).toHaveLength(1);
        expect(publishedSnapshot, label).toBeDefined();
        const expectedEffectCount = timing === 'before' && point !== 'temporary-reference-unlink' ? 0 : 1;
        expect(harness.events.filter((event) => event === effectEvent), `${label} effect count`)
          .toHaveLength(expectedEffectCount);
        if (point === 'temporary-reference-unlink' && timing === 'before') {
          expectEventSubsequence(harness.events, [
            'unlink:temporary-reference',
            'unlink:temporary-reference',
            'effect:unlink:temporary-reference',
          ]);
        }
        expectDurabilityHandlesClosed(harness);
        expect(harness.cleanupPaths.every((path) => path === temporaryReferencePath), label).toBe(true);
        expect(harness.cleanupPaths, label).not.toContain(referencePath);
        expect(harness.cleanupPaths.some((path) => path === treePath || path.startsWith(`${treePath}/`)), label)
          .toBe(false);
        await expect(lstat(temporaryReferencePath, { bigint: true }), label)
          .rejects.toMatchObject({ code: 'ENOENT' });
        expect((await lstat(referencePath, { bigint: true })).nlink, label).toBe(1n);
        await expectPublishedArtifactSnapshot(publishedSnapshot!, 1n);
        const archiveAfter = await lstat(options.archivePath, { bigint: true });
        expect({
          dev: archiveAfter.dev,
          ino: archiveAfter.ino,
          size: archiveAfter.size,
          uid: archiveAfter.uid,
          mode: archiveAfter.mode,
          nlink: archiveAfter.nlink,
        }, label).toEqual({
          dev: archiveBefore.dev,
          ino: archiveBefore.ino,
          size: archiveBefore.size,
          uid: archiveBefore.uid,
          mode: archiveBefore.mode,
          nlink: archiveBefore.nlink,
        });
        await expect(readFile(options.archivePath), label).resolves.toEqual(fixture.bytes);
        const parsedReceipt = parseCanonicalMaterializationReceiptV1(
          await readFile(join(treePath, MATERIALIZATION_RECEIPT_FILENAME)),
        );
        expect(parsedReceipt.ok, label).toBe(true);
        if (!parsedReceipt.ok) throw new Error('expected preserved published receipt');
        await expect(extractReleaseArchive(options), label).resolves.toEqual({
          treePath,
          receipt: parsedReceipt.value.value,
          cacheStatus: 'reused',
        });
      } finally {
        await harness.forceCloseLeakedHandles();
        await rm(canonicalCache, { recursive: true, force: true });
      }
    },
  );

  it('preserves an nlink-two publication when temp unlink persistently fails until explicit repair', async () => {
    const { canonicalCache, fixture, options } = await nestedReleaseArchiveFixture(
      'slopbrick-v103-postlink-persistent-unlink-',
    );
    const random = deterministicRandomBytes([0x86, 0x87]);
    const treePath = join(canonicalCache, `.v103-tree-${random.token(0)}`);
    const temporaryReferencePath = join(canonicalCache, `.v103-ref-${random.token(1)}.tmp`);
    const referencePath = join(
      canonicalCache,
      `${options.expectedAssetSha256}.safe-zip-v1.ref.json`,
    );
    let publishedSnapshot: readonly PublishedArtifactSnapshotEntry[] | undefined;
    const harness = createDurabilityHarness({
      cacheDirectory: canonicalCache,
      archivePath: options.archivePath,
      referencePath,
      treePath,
      persistentTemporaryUnlinkFailure: true,
      afterLinkEffect: async () => {
        publishedSnapshot = await capturePublishedArtifactSnapshot(referencePath, treePath);
      },
    });
    const archiveBefore = await lstat(options.archivePath, { bigint: true });

    try {
      const failure = await extractReleaseArchive(options, {
        ...harness.dependencies,
        randomBytes: random.randomBytes,
      } as never).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(SafeZipError);
      expect(failure).toMatchObject({ code: 'ERR_SAFE_ZIP_PUBLICATION' });
      expect(harness.failureTriggered()).toBe(true);
      expect(harness.events.filter((event) => event === 'effect:link')).toHaveLength(1);
      expect(harness.events.filter((event) => event === 'unlink:temporary-reference')).toHaveLength(2);
      expect(harness.events.filter((event) => event === 'effect:unlink:temporary-reference')).toHaveLength(0);
      expectDurabilityHandlesClosed(harness);
      expect(publishedSnapshot).toBeDefined();
      expect(harness.cleanupPaths.every((path) => path === temporaryReferencePath)).toBe(true);
      expect(harness.cleanupPaths).not.toContain(referencePath);
      expect(harness.cleanupPaths.some((path) => path === treePath || path.startsWith(`${treePath}/`)))
        .toBe(false);
      const stableMetadata = await lstat(referencePath, { bigint: true });
      const temporaryMetadata = await lstat(temporaryReferencePath, { bigint: true });
      expect({ dev: temporaryMetadata.dev, ino: temporaryMetadata.ino, nlink: temporaryMetadata.nlink })
        .toEqual({ dev: stableMetadata.dev, ino: stableMetadata.ino, nlink: 2n });
      await expectPublishedArtifactSnapshot(publishedSnapshot!, 2n);
      const reuseFailure = await extractReleaseArchive(options).catch((error: unknown) => error);
      expect(reuseFailure).toBeInstanceOf(SafeZipError);
      expect(reuseFailure).toMatchObject({ code: 'ERR_SAFE_ZIP_PUBLICATION' });
      expect((await lstat(referencePath, { bigint: true })).nlink).toBe(2n);
      expect((await lstat(temporaryReferencePath, { bigint: true })).nlink).toBe(2n);
      await expectPublishedArtifactSnapshot(publishedSnapshot!, 2n);
      const archiveAfter = await lstat(options.archivePath, { bigint: true });
      expect({
        dev: archiveAfter.dev,
        ino: archiveAfter.ino,
        size: archiveAfter.size,
        uid: archiveAfter.uid,
        mode: archiveAfter.mode,
        nlink: archiveAfter.nlink,
      }).toEqual({
        dev: archiveBefore.dev,
        ino: archiveBefore.ino,
        size: archiveBefore.size,
        uid: archiveBefore.uid,
        mode: archiveBefore.mode,
        nlink: archiveBefore.nlink,
      });
      await expect(readFile(options.archivePath)).resolves.toEqual(fixture.bytes);

      await unlink(temporaryReferencePath);
      expect((await lstat(referencePath, { bigint: true })).nlink).toBe(1n);
      const parsedReceipt = parseCanonicalMaterializationReceiptV1(
        await readFile(join(treePath, MATERIALIZATION_RECEIPT_FILENAME)),
      );
      expect(parsedReceipt.ok).toBe(true);
      if (!parsedReceipt.ok) throw new Error('expected preserved receipt after explicit repair');
      await expect(extractReleaseArchive(options)).resolves.toEqual({
        treePath,
        receipt: parsedReceipt.value.value,
        cacheStatus: 'reused',
      });
    } finally {
      await harness.forceCloseLeakedHandles();
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  it('retries one occupied generated-tree name and preserves the occupant before succeeding', async () => {
    const { canonicalCache, options } = await releaseArchiveFixture('slopbrick-v103-tree-retry-');
    const random = deterministicRandomBytes([0x11, 0x12, 0x13]);
    const occupiedPath = join(canonicalCache, `.v103-tree-${random.token(0)}`);
    const occupant = await createPreservedOccupant(occupiedPath, 'file', 'tree-retry');

    try {
      const created = await extractReleaseArchive(options, { randomBytes: random.randomBytes });

      expect(created.cacheStatus).toBe('created');
      expect(created.treePath).toBe(join(canonicalCache, `.v103-tree-${random.token(1)}`));
      expect(random.randomBytes).toHaveBeenCalledTimes(3);
      await expectPreservedOccupant(occupant);
    } finally {
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  it('stops after exactly eight occupied generated-tree names without changing any occupant', async () => {
    const { canonicalCache, options } = await releaseArchiveFixture('slopbrick-v103-tree-exhaustion-');
    const tokenValues = Array.from({ length: 8 }, (_value, index) => 0x20 + index);
    const random = deterministicRandomBytes(tokenValues);
    const kinds: readonly PreservedOccupantKind[] = ['file', 'directory', 'symlink'];
    const occupants: PreservedOccupant[] = [];
    for (let index = 0; index < tokenValues.length; index += 1) {
      occupants.push(await createPreservedOccupant(
        join(canonicalCache, `.v103-tree-${random.token(index)}`),
        kinds[index % kinds.length]!,
        `tree-exhaustion-${index}`,
      ));
    }
    const referencePath = join(
      canonicalCache,
      `${options.expectedAssetSha256}.safe-zip-v1.ref.json`,
    );

    try {
      const failure = await extractReleaseArchive(options, {
        randomBytes: random.randomBytes,
      }).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(SafeZipError);
      expect(failure).toMatchObject({ code: 'ERR_SAFE_ZIP_TREE' });
      expect(random.randomBytes).toHaveBeenCalledTimes(8);
      expect([String(failure), JSON.stringify(failure), (failure as Error).stack].join('\n'))
        .not.toContain(canonicalCache);
      expect(Object.prototype.hasOwnProperty.call(failure, 'cause')).toBe(false);
      await expect(lstat(referencePath, { bigint: true })).rejects.toMatchObject({ code: 'ENOENT' });
      for (const occupant of occupants) await expectPreservedOccupant(occupant);
    } finally {
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  it('retries occupied file, directory, and symlink temp-reference names before succeeding', async () => {
    const { canonicalCache, options } = await releaseArchiveFixture('slopbrick-v103-ref-retry-');
    const random = deterministicRandomBytes([0x30, 0x31, 0x32, 0x33, 0x34]);
    const kinds: readonly PreservedOccupantKind[] = ['file', 'directory', 'symlink'];
    const occupants: PreservedOccupant[] = [];
    for (let index = 0; index < kinds.length; index += 1) {
      occupants.push(await createPreservedOccupant(
        join(canonicalCache, `.v103-ref-${random.token(index + 1)}.tmp`),
        kinds[index]!,
        `ref-retry-${index}`,
      ));
    }

    try {
      const created = await extractReleaseArchive(options, { randomBytes: random.randomBytes });

      expect(created.cacheStatus).toBe('created');
      expect(created.treePath).toBe(join(canonicalCache, `.v103-tree-${random.token(0)}`));
      expect(random.randomBytes).toHaveBeenCalledTimes(5);
      for (const occupant of occupants) await expectPreservedOccupant(occupant);
      await expect(lstat(
        join(canonicalCache, `.v103-ref-${random.token(4)}.tmp`),
        { bigint: true },
      )).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  it('stops after exactly eight occupied temp-reference names and cleans only its candidate', async () => {
    const { canonicalCache, options } = await releaseArchiveFixture('slopbrick-v103-ref-exhaustion-');
    const tokenValues = Array.from({ length: 9 }, (_value, index) => 0x40 + index);
    const random = deterministicRandomBytes(tokenValues);
    const kinds: readonly PreservedOccupantKind[] = ['file', 'directory', 'symlink'];
    const occupants: PreservedOccupant[] = [];
    for (let index = 1; index < tokenValues.length; index += 1) {
      occupants.push(await createPreservedOccupant(
        join(canonicalCache, `.v103-ref-${random.token(index)}.tmp`),
        kinds[(index - 1) % kinds.length]!,
        `ref-exhaustion-${index}`,
      ));
    }
    const candidateTreePath = join(canonicalCache, `.v103-tree-${random.token(0)}`);
    const referencePath = join(
      canonicalCache,
      `${options.expectedAssetSha256}.safe-zip-v1.ref.json`,
    );

    try {
      const failure = await extractReleaseArchive(options, {
        randomBytes: random.randomBytes,
      }).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(SafeZipError);
      expect(failure).toMatchObject({ code: 'ERR_SAFE_ZIP_PUBLICATION' });
      expect(random.randomBytes).toHaveBeenCalledTimes(9);
      expect([String(failure), JSON.stringify(failure), (failure as Error).stack].join('\n'))
        .not.toContain(canonicalCache);
      expect(Object.prototype.hasOwnProperty.call(failure, 'cause')).toBe(false);
      await expect(lstat(referencePath, { bigint: true })).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(lstat(candidateTreePath, { bigint: true })).rejects.toMatchObject({ code: 'ENOENT' });
      for (const occupant of occupants) await expectPreservedOccupant(occupant);
    } finally {
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  it('publishes exactly one winner from two concurrent extractors held at the same link barrier', async () => {
    const { canonicalCache, options } = await releaseArchiveFixture('slopbrick-v103-concurrent-publish-');
    const firstRandom = deterministicRandomBytes([0x50, 0x51]);
    const secondRandom = deterministicRandomBytes([0x52, 0x53]);
    const referencePath = join(
      canonicalCache,
      `${options.expectedAssetSha256}.safe-zip-v1.ref.json`,
    );
    let linkCalls = 0;
    let eexistObserved = false;
    let transitionalReferenceObserved = false;
    let reportStableLink!: () => void;
    let releaseWinner!: () => void;
    const stableLinkCreated = new Promise<void>((resolve) => { reportStableLink = resolve; });
    const winnerMayReturn = new Promise<void>((resolve) => { releaseWinner = resolve; });
    const linkAtBarrier = async (source: string, destination: string): Promise<void> => {
      linkCalls += 1;
      if (linkCalls === 1) {
        await linkFile(source, destination);
        reportStableLink();
        await winnerMayReturn;
        return;
      }
      await stableLinkCreated;
      try {
        await linkFile(source, destination);
      } catch (error) {
        if (
          typeof error === 'object'
          && error !== null
          && 'code' in error
          && error.code === 'EEXIST'
        ) eexistObserved = true;
        throw error;
      }
    };
    const sharedLstat = async (path: Parameters<typeof lstat>[0], lstatOptions: unknown) => {
      const metadata = await lstat(path, lstatOptions as { bigint: true });
      if (
        String(path) === referencePath
        && eexistObserved
        && !transitionalReferenceObserved
        && metadata.nlink === 2n
      ) {
        transitionalReferenceObserved = true;
        releaseWinner();
        return metadata;
      }
      return metadata;
    };

    try {
      const first = extractReleaseArchive(options, {
        randomBytes: firstRandom.randomBytes,
        linkFile: linkAtBarrier,
        lstatFile: sharedLstat,
      });
      const second = extractReleaseArchive(options, {
        randomBytes: secondRandom.randomBytes,
        linkFile: linkAtBarrier,
        lstatFile: sharedLstat,
      });
      const settled = await Promise.allSettled([first, second]);
      expect(eexistObserved).toBe(true);
      expect(transitionalReferenceObserved).toBe(true);
      expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
      const results = settled.map((result) => {
        if (result.status !== 'fulfilled') throw result.reason;
        return result.value;
      });
      const created = results.find((result) => result.cacheStatus === 'created');
      const reused = results.find((result) => result.cacheStatus === 'reused');

      expect(linkCalls).toBe(2);
      expect(results.filter((result) => result.cacheStatus === 'created')).toHaveLength(1);
      expect(results.filter((result) => result.cacheStatus === 'reused')).toHaveLength(1);
      expect(created).toBeDefined();
      expect(reused).toBeDefined();
      expect(reused!.treePath).toBe(created!.treePath);
      expect(reused!.receipt).toEqual(created!.receipt);
      const candidateTreePaths = [
        join(canonicalCache, `.v103-tree-${firstRandom.token(0)}`),
        join(canonicalCache, `.v103-tree-${secondRandom.token(0)}`),
      ];
      expect(candidateTreePaths).toContain(created!.treePath);
      const losingTreePath = candidateTreePaths.find((path) => path !== created!.treePath)!;
      await expect(lstat(losingTreePath, { bigint: true })).rejects.toMatchObject({ code: 'ENOENT' });
      for (const temporaryPath of [
        join(canonicalCache, `.v103-ref-${firstRandom.token(1)}.tmp`),
        join(canonicalCache, `.v103-ref-${secondRandom.token(1)}.tmp`),
      ]) await expect(lstat(temporaryPath, { bigint: true })).rejects.toMatchObject({ code: 'ENOENT' });
      const parsedReference = parseCanonicalMaterializationCacheRefV1(await readFile(referencePath));
      expect(parsedReference.ok).toBe(true);
      if (!parsedReference.ok) throw new Error('expected one canonical concurrent winner');
      expect(parsedReference.value.value.treeBasename).toBe(basename(created!.treePath));
      const cacheEntries = await readdir(canonicalCache);
      expect(cacheEntries.filter((entry) => entry.endsWith('.safe-zip-v1.ref.json'))).toHaveLength(1);
      expect(cacheEntries.filter((entry) => /^\.v103-tree-[0-9a-f]{32}$/.test(entry))).toHaveLength(1);
      expect(cacheEntries.filter((entry) => /^\.v103-ref-[0-9a-f]{32}\.tmp$/.test(entry))).toHaveLength(0);
      expect(firstRandom.randomBytes).toHaveBeenCalledTimes(2);
      expect(secondRandom.randomBytes).toHaveBeenCalledTimes(2);
    } finally {
      releaseWinner!();
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  it('allows a late reuse first pass at nlink two and requires its final pass at nlink one', async () => {
    const { canonicalCache, options } = await releaseArchiveFixture('slopbrick-v103-late-reuse-nlink2-');
    const random = deterministicRandomBytes([0x54, 0x55]);
    const referencePath = join(
      canonicalCache,
      `${options.expectedAssetSha256}.safe-zip-v1.ref.json`,
    );
    const temporaryReferencePath = join(canonicalCache, `.v103-ref-${random.token(1)}.tmp`);
    let reportStableLink!: () => void;
    let releasePublisher!: () => void;
    let reportTempUnlinked!: () => void;
    const stableLinkCreated = new Promise<void>((resolve) => { reportStableLink = resolve; });
    const publisherMayReturn = new Promise<void>((resolve) => { releasePublisher = resolve; });
    const publisherTempUnlinked = new Promise<void>((resolve) => { reportTempUnlinked = resolve; });
    let referenceLstats = 0;
    let firstPassReferenceNlink: bigint | undefined;
    let firstPassReleasedPublisher = false;
    const reuseUnlinks = vi.fn(async (path: Parameters<typeof unlink>[0]) => unlink(path));

    try {
      const publisher = extractReleaseArchive(options, {
        randomBytes: random.randomBytes,
        linkFile: async (source, destination) => {
          await linkFile(source, destination);
          reportStableLink();
          await publisherMayReturn;
        },
        unlinkFile: async (path) => {
          await unlink(path);
          if (String(path) === temporaryReferencePath) reportTempUnlinked();
        },
      } as never);
      await stableLinkCreated;
      const linkedReference = await lstat(referencePath, { bigint: true });
      const linkedReferenceBytes = await readFile(referencePath);
      expect(linkedReference.nlink).toBe(2n);

      const reused = extractReleaseArchive(options, {
        lstatFile: async (path, lstatOptions) => {
          const metadata = await lstat(path, lstatOptions as { bigint: true });
          if (String(path) === referencePath) {
            referenceLstats += 1;
            if (referenceLstats === 4) {
              firstPassReferenceNlink = metadata.nlink;
              firstPassReleasedPublisher = true;
              releasePublisher();
            }
          } else if (String(path) === options.archivePath && firstPassReleasedPublisher) {
            await publisherTempUnlinked;
          }
          return metadata;
        },
        unlinkFile: reuseUnlinks,
      } as never);
      const [createdResult, reusedResult] = await Promise.all([publisher, reused]);

      expect(createdResult.cacheStatus).toBe('created');
      expect(reusedResult.cacheStatus).toBe('reused');
      expect(reusedResult.treePath).toBe(createdResult.treePath);
      expect(reusedResult.receipt).toEqual(createdResult.receipt);
      expect(firstPassReferenceNlink).toBe(2n);
      expect(referenceLstats).toBeGreaterThanOrEqual(7);
      expect(reuseUnlinks).not.toHaveBeenCalled();
      const finalReference = await lstat(referencePath, { bigint: true });
      expect({ dev: finalReference.dev, ino: finalReference.ino, nlink: finalReference.nlink })
        .toEqual({ dev: linkedReference.dev, ino: linkedReference.ino, nlink: 1n });
      await expect(readFile(referencePath)).resolves.toEqual(linkedReferenceBytes);
      await expect(lstat(temporaryReferencePath, { bigint: true })).rejects.toMatchObject({ code: 'ENOENT' });
      expect(random.randomBytes).toHaveBeenCalledTimes(2);
    } finally {
      releasePublisher!();
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  it('rejects a persistent valid nlink-two crash remnant without repairing or deleting it', async () => {
    const { canonicalCache, options } = await releaseArchiveFixture('slopbrick-v103-persistent-nlink2-');
    const referencePath = join(
      canonicalCache,
      `${options.expectedAssetSha256}.safe-zip-v1.ref.json`,
    );
    const extraLinkPath = join(canonicalCache, 'persistent-reference-extra-link');
    const unlinks = vi.fn(async (path: Parameters<typeof unlink>[0]) => unlink(path));
    const removals = vi.fn(async (path: Parameters<typeof rmdir>[0]) => rmdir(path));

    try {
      const created = await extractReleaseArchive(options);
      const treeFilePath = join(created.treePath, 'pkg/readme.txt');
      const treeBefore = await lstat(created.treePath, { bigint: true });
      const treeFileBefore = await lstat(treeFilePath, { bigint: true });
      const treeFileBytes = await readFile(treeFilePath);
      const referenceBytes = await readFile(referencePath);
      await linkFile(referencePath, extraLinkPath);
      const referenceBefore = await lstat(referencePath, { bigint: true });
      const extraBefore = await lstat(extraLinkPath, { bigint: true });
      expect(referenceBefore.nlink).toBe(2n);
      expect({ dev: extraBefore.dev, ino: extraBefore.ino, nlink: extraBefore.nlink })
        .toEqual({ dev: referenceBefore.dev, ino: referenceBefore.ino, nlink: 2n });

      const failure = await extractReleaseArchive(options, {
        unlinkFile: unlinks,
        removeDirectory: removals,
      }).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(SafeZipError);
      expect(failure).toMatchObject({ code: 'ERR_SAFE_ZIP_PUBLICATION' });
      expect([String(failure), JSON.stringify(failure), (failure as Error).stack].join('\n'))
        .not.toContain(canonicalCache);
      expect(Object.prototype.hasOwnProperty.call(failure, 'cause')).toBe(false);
      expect(unlinks).not.toHaveBeenCalled();
      expect(removals).not.toHaveBeenCalled();
      const referenceAfter = await lstat(referencePath, { bigint: true });
      const extraAfter = await lstat(extraLinkPath, { bigint: true });
      expect({ dev: referenceAfter.dev, ino: referenceAfter.ino, nlink: referenceAfter.nlink })
        .toEqual({ dev: referenceBefore.dev, ino: referenceBefore.ino, nlink: 2n });
      expect({ dev: extraAfter.dev, ino: extraAfter.ino, nlink: extraAfter.nlink })
        .toEqual({ dev: extraBefore.dev, ino: extraBefore.ino, nlink: 2n });
      await expect(readFile(referencePath)).resolves.toEqual(referenceBytes);
      await expect(readFile(extraLinkPath)).resolves.toEqual(referenceBytes);
      expect(await lstat(created.treePath, { bigint: true })).toMatchObject({
        dev: treeBefore.dev,
        ino: treeBefore.ino,
      });
      expect(await lstat(treeFilePath, { bigint: true })).toMatchObject({
        dev: treeFileBefore.dev,
        ino: treeFileBefore.ino,
      });
      await expect(readFile(treeFilePath)).resolves.toEqual(treeFileBytes);

      await unlink(extraLinkPath);
      expect((await lstat(referencePath, { bigint: true })).nlink).toBe(1n);
      await expect(extractReleaseArchive(options)).resolves.toEqual({
        treePath: created.treePath,
        receipt: created.receipt,
        cacheStatus: 'reused',
      });
    } finally {
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  it('rejects nlink three before provisional reuse and preserves every link and the tree', async () => {
    const { canonicalCache, options } = await releaseArchiveFixture('slopbrick-v103-nlink3-');
    const referencePath = join(
      canonicalCache,
      `${options.expectedAssetSha256}.safe-zip-v1.ref.json`,
    );
    const extraLinkPaths = [
      join(canonicalCache, 'reference-extra-link-one'),
      join(canonicalCache, 'reference-extra-link-two'),
    ];
    let referenceLstats = 0;
    const unlinks = vi.fn(async (path: Parameters<typeof unlink>[0]) => unlink(path));
    const removals = vi.fn(async (path: Parameters<typeof rmdir>[0]) => rmdir(path));

    try {
      const created = await extractReleaseArchive(options);
      const treeFilePath = join(created.treePath, 'pkg/readme.txt');
      const treeBefore = await lstat(created.treePath, { bigint: true });
      const treeFileBefore = await lstat(treeFilePath, { bigint: true });
      const treeFileBytes = await readFile(treeFilePath);
      const referenceBytes = await readFile(referencePath);
      for (const path of extraLinkPaths) await linkFile(referencePath, path);
      const referenceBefore = await lstat(referencePath, { bigint: true });
      expect(referenceBefore.nlink).toBe(3n);

      const failure = await extractReleaseArchive(options, {
        lstatFile: async (path, lstatOptions) => {
          const metadata = await lstat(path, lstatOptions as { bigint: true });
          if (String(path) === referencePath) referenceLstats += 1;
          return metadata;
        },
        unlinkFile: unlinks,
        removeDirectory: removals,
      } as never).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(SafeZipError);
      expect(failure).toMatchObject({ code: 'ERR_SAFE_ZIP_PUBLICATION' });
      expect(referenceLstats).toBe(2);
      expect(unlinks).not.toHaveBeenCalled();
      expect(removals).not.toHaveBeenCalled();
      for (const path of [referencePath, ...extraLinkPaths]) {
        const metadata = await lstat(path, { bigint: true });
        expect({ dev: metadata.dev, ino: metadata.ino, nlink: metadata.nlink })
          .toEqual({ dev: referenceBefore.dev, ino: referenceBefore.ino, nlink: 3n });
        await expect(readFile(path)).resolves.toEqual(referenceBytes);
      }
      expect(await lstat(created.treePath, { bigint: true })).toMatchObject({
        dev: treeBefore.dev,
        ino: treeBefore.ino,
      });
      expect(await lstat(treeFilePath, { bigint: true })).toMatchObject({
        dev: treeFileBefore.dev,
        ino: treeFileBefore.ino,
      });
      await expect(readFile(treeFilePath)).resolves.toEqual(treeFileBytes);
    } finally {
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  it.each([
    ['malformed file', 'file'],
    ['nonempty directory', 'directory'],
    ['empty directory', 'empty-directory'],
    ['symlink', 'symlink'],
  ] as const)('never replaces, deletes, or adopts an invalid competing EEXIST %s', async (_label, kind) => {
    const { canonicalCache, options } = await releaseArchiveFixture(`slopbrick-v103-invalid-winner-${kind}-`);
    const referencePath = join(
      canonicalCache,
      `${options.expectedAssetSha256}.safe-zip-v1.ref.json`,
    );
    const occupant = await createPreservedOccupant(referencePath, kind, `invalid-winner-${kind}`);
    const random = deterministicRandomBytes([0x60, 0x61]);
    const candidateTreePath = join(canonicalCache, `.v103-tree-${random.token(0)}`);
    const temporaryReferencePath = join(canonicalCache, `.v103-ref-${random.token(1)}.tmp`);
    let hiddenOnce = false;
    let eexistObserved = false;
    const unlinkedPaths: string[] = [];
    const removedDirectories: string[] = [];

    try {
      const failure = await extractReleaseArchive(options, {
        randomBytes: random.randomBytes,
        lstatFile: async (path, lstatOptions) => {
          if (String(path) === referencePath && !hiddenOnce) {
            hiddenOnce = true;
            throw Object.assign(new Error('synthetic absent competing reference'), { code: 'ENOENT' });
          }
          return lstat(path, lstatOptions as { bigint: true });
        },
        linkFile: async (source, destination) => {
          try {
            await linkFile(source, destination);
          } catch (error) {
            if (
              typeof error === 'object'
              && error !== null
              && 'code' in error
              && error.code === 'EEXIST'
            ) eexistObserved = true;
            throw error;
          }
        },
        unlinkFile: async (path) => {
          unlinkedPaths.push(String(path));
          await unlink(path);
        },
        removeDirectory: async (path) => {
          removedDirectories.push(String(path));
          await rmdir(path);
        },
      } as never).catch((error: unknown) => error);

      expect(hiddenOnce).toBe(true);
      expect(eexistObserved).toBe(true);
      expect(failure).toBeInstanceOf(SafeZipError);
      expect(failure).toMatchObject({ code: 'ERR_SAFE_ZIP_PUBLICATION' });
      expect([String(failure), JSON.stringify(failure), (failure as Error).stack].join('\n'))
        .not.toContain(canonicalCache);
      expect(Object.prototype.hasOwnProperty.call(failure, 'cause')).toBe(false);
      expect(random.randomBytes).toHaveBeenCalledTimes(2);
      expect(unlinkedPaths).not.toContain(referencePath);
      expect(removedDirectories).not.toContain(referencePath);
      await expectPreservedOccupant(occupant);
      expect(unlinkedPaths.some((path) => path.startsWith(`${candidateTreePath}/`))).toBe(false);
      expect(removedDirectories.some((path) => (
        path === candidateTreePath || path.startsWith(`${candidateTreePath}/`)
      ))).toBe(false);
      expect(unlinkedPaths).toEqual([temporaryReferencePath]);
      expect(removedDirectories).toEqual([]);
      const orphanTree = await lstat(candidateTreePath, { bigint: true });
      expect(orphanTree.isDirectory()).toBe(true);
      expect(Number(orphanTree.mode & 0o7777n)).toBe(0o700);
      await expect(readFile(join(candidateTreePath, 'pkg/readme.txt')))
        .resolves.toEqual(Buffer.from('release payload'));
      const orphanReceipt = parseCanonicalMaterializationReceiptV1(
        await readFile(join(candidateTreePath, MATERIALIZATION_RECEIPT_FILENAME)),
      );
      expect(orphanReceipt.ok).toBe(true);
      if (!orphanReceipt.ok) throw new Error('expected a canonical safe-orphan receipt');
      expect(orphanReceipt.value.value).toMatchObject({
        assetSha256: options.expectedAssetSha256,
        assetBytes: options.expectedAssetBytes,
      });
      await expect(lstat(temporaryReferencePath, { bigint: true })).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  it('ignores a fully valid unreferenced prior tree and publishes a distinct tree without changing it', async () => {
    const { canonicalCache, options } = await releaseArchiveFixture('slopbrick-v103-unreferenced-tree-');
    const referencePath = join(
      canonicalCache,
      `${options.expectedAssetSha256}.safe-zip-v1.ref.json`,
    );

    try {
      const prior = await extractReleaseArchive(options);
      const priorPaths = [
        prior.treePath,
        join(prior.treePath, 'pkg'),
        join(prior.treePath, 'pkg/readme.txt'),
        join(prior.treePath, MATERIALIZATION_RECEIPT_FILENAME),
      ];
      const priorStats = await Promise.all(priorPaths.map((path) => lstat(path, { bigint: true })));
      const priorFileBytes = await readFile(join(prior.treePath, 'pkg/readme.txt'));
      const priorReceiptBytes = await readFile(join(prior.treePath, MATERIALIZATION_RECEIPT_FILENAME));
      await unlink(referencePath);
      let treeTokenValue = 0x70;
      while (basename(prior.treePath) === `.v103-tree-${Buffer.alloc(16, treeTokenValue).toString('hex')}`) {
        treeTokenValue += 1;
      }
      const random = deterministicRandomBytes([treeTokenValue, treeTokenValue + 1]);

      const created = await extractReleaseArchive(options, { randomBytes: random.randomBytes });

      expect(created.cacheStatus).toBe('created');
      expect(created.treePath).toBe(join(canonicalCache, `.v103-tree-${random.token(0)}`));
      expect(created.treePath).not.toBe(prior.treePath);
      expect(random.randomBytes).toHaveBeenCalledTimes(2);
      for (let index = 0; index < priorPaths.length; index += 1) {
        const current = await lstat(priorPaths[index]!, { bigint: true });
        expect({ dev: current.dev, ino: current.ino, mode: current.mode, size: current.size })
          .toEqual({
            dev: priorStats[index]!.dev,
            ino: priorStats[index]!.ino,
            mode: priorStats[index]!.mode,
            size: priorStats[index]!.size,
          });
      }
      await expect(readFile(join(prior.treePath, 'pkg/readme.txt'))).resolves.toEqual(priorFileBytes);
      await expect(readFile(join(prior.treePath, MATERIALIZATION_RECEIPT_FILENAME)))
        .resolves.toEqual(priorReceiptBytes);
      const parsedReference = parseCanonicalMaterializationCacheRefV1(await readFile(referencePath));
      expect(parsedReference.ok).toBe(true);
      if (!parsedReference.ok) throw new Error('expected canonical reference to the distinct tree');
      expect(parsedReference.value.value.treeBasename).toBe(basename(created.treePath));
      expect((await readdir(canonicalCache)).filter(
        (entry) => /^\.v103-tree-[0-9a-f]{32}$/.test(entry),
      )).toHaveLength(2);
    } finally {
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  it.runIf(SUPPORTS_LOCAL_POSIX_ABRUPT_CRASH)(
    'survives the complete serial abrupt-process checkpoint matrix without accepting prelink residue',
    async () => {
      for (const testCase of ABRUPT_CRASH_CASES) {
        const label = `${testCase.point}:${testCase.timing}`;
        const prefix = label.replace(/[^a-z]+/g, '-');
        const { canonicalCache, fixture, options } = await nestedReleaseArchiveFixture(
          `slopbrick-v103-process-crash-${prefix}-`,
        );
        const treePath = join(canonicalCache, `.v103-tree-${ABRUPT_CRASH_TREE_TOKEN}`);
        const temporaryReferencePath = join(
          canonicalCache,
          `.v103-ref-${ABRUPT_CRASH_TEMP_TOKEN}.tmp`,
        );
        const referencePath = join(
          canonicalCache,
          `${options.expectedAssetSha256}.safe-zip-v1.ref.json`,
        );
        const residueCandidates = [treePath, temporaryReferencePath] as const;
        const archiveBefore = await lstat(options.archivePath, { bigint: true });

        try {
          const worker = await runAbruptCrashWorker({
            cacheDirectory: canonicalCache,
            archivePath: options.archivePath,
            point: testCase.point,
            timing: testCase.timing,
          });
          expect(worker.timedOut, `${label} bounded worker timeout`).toBe(false);
          expect(worker.signal, `${label} worker signal`).toBeNull();
          expect(worker.code, `${label} worker exit code; stderr=${worker.stderr}`).toBe(86);
          expect(worker.stdout, `${label} synchronous checkpoint marker`).toBe(
            `V103_SAFE_ZIP_CRASH:${testCase.point}:${testCase.timing}\n`,
          );
          expect(worker.stderr, `${label} worker stderr`).toBe('');

          const archiveAfterCrash = await lstat(options.archivePath, { bigint: true });
          expect({
            dev: archiveAfterCrash.dev,
            ino: archiveAfterCrash.ino,
            mode: archiveAfterCrash.mode,
            uid: archiveAfterCrash.uid,
            size: archiveAfterCrash.size,
            nlink: archiveAfterCrash.nlink,
          }, label).toEqual({
            dev: archiveBefore.dev,
            ino: archiveBefore.ino,
            mode: archiveBefore.mode,
            uid: archiveBefore.uid,
            size: archiveBefore.size,
            nlink: archiveBefore.nlink,
          });
          await expect(readFile(options.archivePath), label).resolves.toEqual(fixture.bytes);

          if (testCase.outcome === 'prelink') {
            await expect(lstat(referencePath, { bigint: true }), label)
              .rejects.toMatchObject({ code: 'ENOENT' });
            const allowedEntries = new Set([
              basename(options.archivePath),
              basename(treePath),
              basename(temporaryReferencePath),
            ]);
            const entriesAfterCrash = await readdir(canonicalCache);
            expect(entriesAfterCrash.every((entry) => allowedEntries.has(entry)), label).toBe(true);
            expect(entriesAfterCrash, label).toContain(basename(treePath));

            // Observe the actual process-exit residue before recovery. This is
            // deliberately not a claim that a pre-sync write survives power loss.
            const residueBeforeRecovery = await captureObservedCrashResidue(
              canonicalCache,
              residueCandidates,
            );
            expect(residueBeforeRecovery.length, label).toBeGreaterThan(0);

            const recoveryRandom = deterministicRandomBytes([0xb1, 0xb2]);
            const recovered = await extractReleaseArchive(options, {
              randomBytes: recoveryRandom.randomBytes,
            });
            const recoveredTreePath = join(
              canonicalCache,
              `.v103-tree-${recoveryRandom.token(0)}`,
            );
            expect(recovered, label).toMatchObject({
              treePath: recoveredTreePath,
              cacheStatus: 'created',
            });
            expect(recovered.treePath, label).not.toBe(treePath);
            expect(recoveryRandom.randomBytes, label).toHaveBeenCalledTimes(2);
            await expectObservedCrashResidue(
              canonicalCache,
              residueCandidates,
              residueBeforeRecovery,
            );
            const publishedSnapshot = await expectCanonicalCrashPublication({
              options,
              treePath: recovered.treePath,
              referencePath,
              expectedReferenceNlink: 1n,
            });
            const parsedReceipt = parseCanonicalMaterializationReceiptV1(
              await readFile(join(recovered.treePath, MATERIALIZATION_RECEIPT_FILENAME)),
            );
            expect(parsedReceipt.ok, label).toBe(true);
            if (!parsedReceipt.ok) throw new Error('expected recovered canonical receipt');
            expect(recovered.receipt, label).toEqual(parsedReceipt.value.value);

            const reused = await extractReleaseArchive(options);
            expect(reused, label).toEqual({
              treePath: recovered.treePath,
              receipt: parsedReceipt.value.value,
              cacheStatus: 'reused',
            });
            await expectPublishedArtifactSnapshot(publishedSnapshot, 1n);
            await expectObservedCrashResidue(
              canonicalCache,
              residueCandidates,
              residueBeforeRecovery,
            );
          } else if (testCase.outcome === 'published-nlink-two') {
            const publishedSnapshot = await expectCanonicalCrashPublication({
              options,
              treePath,
              referencePath,
              expectedReferenceNlink: 2n,
            });
            const temporaryBeforeRecovery = await captureObservedCrashResidue(
              canonicalCache,
              [temporaryReferencePath],
            );
            expect(temporaryBeforeRecovery, label).toHaveLength(1);
            const stableMetadata = await lstat(referencePath, { bigint: true });
            const temporaryMetadata = await lstat(temporaryReferencePath, { bigint: true });
            expect({
              dev: temporaryMetadata.dev,
              ino: temporaryMetadata.ino,
              nlink: temporaryMetadata.nlink,
            }, label).toEqual({
              dev: stableMetadata.dev,
              ino: stableMetadata.ino,
              nlink: 2n,
            });
            await expect(readFile(temporaryReferencePath), label)
              .resolves.toEqual(await readFile(referencePath));

            const reuseFailure = await extractReleaseArchive(options).catch((error: unknown) => error);
            expect(reuseFailure, label).toBeInstanceOf(SafeZipError);
            expect(reuseFailure, label).toMatchObject({ code: 'ERR_SAFE_ZIP_PUBLICATION' });
            await expectPublishedArtifactSnapshot(publishedSnapshot, 2n);
            await expectObservedCrashResidue(
              canonicalCache,
              [temporaryReferencePath],
              temporaryBeforeRecovery,
            );

            await unlink(temporaryReferencePath);
            await expect(lstat(temporaryReferencePath, { bigint: true }), label)
              .rejects.toMatchObject({ code: 'ENOENT' });
            expect((await lstat(referencePath, { bigint: true })).nlink, label).toBe(1n);
            const repairedReuse = await extractReleaseArchive(options);
            expect(repairedReuse, label).toMatchObject({ treePath, cacheStatus: 'reused' });
            await expectPublishedArtifactSnapshot(publishedSnapshot, 1n);
            await expectCanonicalCrashPublication({
              options,
              treePath,
              referencePath,
              expectedReferenceNlink: 1n,
            });
          } else {
            await expect(lstat(temporaryReferencePath, { bigint: true }), label)
              .rejects.toMatchObject({ code: 'ENOENT' });
            const publishedSnapshot = await expectCanonicalCrashPublication({
              options,
              treePath,
              referencePath,
              expectedReferenceNlink: 1n,
            });
            const reused = await extractReleaseArchive(options);
            expect(reused, label).toMatchObject({ treePath, cacheStatus: 'reused' });
            await expectPublishedArtifactSnapshot(publishedSnapshot, 1n);
            await expect(lstat(temporaryReferencePath, { bigint: true }), label)
              .rejects.toMatchObject({ code: 'ENOENT' });
            await expectCanonicalCrashPublication({
              options,
              treePath,
              referencePath,
              expectedReferenceNlink: 1n,
            });
          }

          const archiveFinal = await lstat(options.archivePath, { bigint: true });
          expect({
            dev: archiveFinal.dev,
            ino: archiveFinal.ino,
            mode: archiveFinal.mode,
            uid: archiveFinal.uid,
            size: archiveFinal.size,
            nlink: archiveFinal.nlink,
          }, label).toEqual({
            dev: archiveBefore.dev,
            ino: archiveBefore.ino,
            mode: archiveBefore.mode,
            uid: archiveBefore.uid,
            size: archiveBefore.size,
            nlink: archiveBefore.nlink,
          });
          await expect(readFile(options.archivePath), label).resolves.toEqual(fixture.bytes);
        } finally {
          await rm(canonicalCache, { recursive: true, force: true });
        }
      }
    },
    600_000,
  );

  it.each([
    ['malformed file', 'file'],
    ['empty directory', 'empty-directory'],
    ['nonempty directory', 'directory'],
    ['symlink', 'symlink'],
  ] as const)('rejects a pre-existing invalid stable-reference %s without changing it', async (_label, kind) => {
    const { canonicalCache, options } = await releaseArchiveFixture(`slopbrick-v103-reuse-invalid-ref-${kind}-`);
    const referencePath = join(
      canonicalCache,
      `${options.expectedAssetSha256}.safe-zip-v1.ref.json`,
    );
    const occupant = await createPreservedOccupant(referencePath, kind, `reuse-invalid-ref-${kind}`);
    const archiveSnapshot = await captureArchivePreservation(options.archivePath);
    const randomBytes = vi.fn((): Uint8Array => { throw new Error('reuse must not materialize'); });
    const unlinks = vi.fn(async (path: Parameters<typeof unlink>[0]) => unlink(path));
    const removals = vi.fn(async (path: Parameters<typeof rmdir>[0]) => rmdir(path));

    try {
      const failure = await extractReleaseArchive(options, {
        randomBytes,
        unlinkFile: unlinks,
        removeDirectory: removals,
      }).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(SafeZipError);
      expect(failure).toMatchObject({ code: 'ERR_SAFE_ZIP_PUBLICATION' });
      expect([String(failure), JSON.stringify(failure), (failure as Error).stack].join('\n'))
        .not.toContain(canonicalCache);
      expect(Object.prototype.hasOwnProperty.call(failure, 'cause')).toBe(false);
      expect(randomBytes).not.toHaveBeenCalled();
      expect(unlinks).not.toHaveBeenCalled();
      expect(removals).not.toHaveBeenCalled();
      await expectPreservedOccupant(occupant);
      await expectArchivePreserved(options.archivePath, archiveSnapshot);

      await rm(referencePath, { recursive: true, force: true });
      const created = await extractReleaseArchive(options);
      await expect(extractReleaseArchive(options)).resolves.toEqual({
        treePath: created.treePath,
        receipt: created.receipt,
        cacheStatus: 'reused',
      });
    } finally {
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  const staticReuseTamperCases: readonly StaticReuseTamperCase[] = [
    {
      label: 'canonical reference wrong permissions',
      expectedCode: 'ERR_SAFE_ZIP_PUBLICATION',
      mutate: async (context) => {
        await chmod(context.referencePath, 0o640);
        return {
          snapshots: [await capturePathTamperSnapshot(context.referencePath)],
          repair: async () => chmod(context.referencePath, 0o600),
        };
      },
    },
    {
      label: 'receipt same-size byte corruption',
      expectedCode: 'ERR_SAFE_ZIP_RECEIPT',
      mutate: async (context) => {
        const original = await readFile(context.receiptPath);
        const corrupted = Buffer.from(original);
        corrupted[0] = corrupted[0] === 0x7b ? 0x5b : 0x7b;
        await writeFile(context.receiptPath, corrupted);
        return {
          snapshots: [await capturePathTamperSnapshot(context.receiptPath)],
          repair: async () => { await writeFile(context.receiptPath, original); },
        };
      },
    },
    {
      label: 'receipt wrong permissions',
      expectedCode: 'ERR_SAFE_ZIP_RECEIPT',
      mutate: async (context) => {
        await chmod(context.receiptPath, 0o640);
        return {
          snapshots: [await capturePathTamperSnapshot(context.receiptPath)],
          repair: async () => chmod(context.receiptPath, 0o600),
        };
      },
    },
    {
      label: 'receipt extra hard link',
      expectedCode: 'ERR_SAFE_ZIP_RECEIPT',
      mutate: async (context) => {
        const extraPath = join(context.canonicalCache, 'receipt-extra-link');
        await linkFile(context.receiptPath, extraPath);
        return {
          snapshots: await Promise.all([
            capturePathTamperSnapshot(context.receiptPath),
            capturePathTamperSnapshot(extraPath),
          ]),
          repair: async () => { await unlink(extraPath); },
        };
      },
    },
    {
      label: 'receipt sparse maximum plus one',
      expectedCode: 'ERR_SAFE_ZIP_RECEIPT',
      mutate: async (context) => {
        const original = await readFile(context.receiptPath);
        await truncate(context.receiptPath, MAX_RECEIPT_BYTES + 1);
        return {
          snapshots: [await capturePathTamperSnapshot(context.receiptPath, { readBytes: false })],
          repair: async () => { await writeFile(context.receiptPath, original); },
        };
      },
    },
    {
      label: 'payload same-size content change',
      expectedCode: 'ERR_SAFE_ZIP_RECEIPT',
      mutate: async (context) => {
        const original = await readFile(context.payloadPath);
        const changed = Buffer.alloc(original.byteLength, 0x78);
        await writeFile(context.payloadPath, changed);
        return {
          snapshots: [await capturePathTamperSnapshot(context.payloadPath)],
          repair: async () => { await writeFile(context.payloadPath, original); },
        };
      },
    },
    {
      label: 'payload truncation',
      expectedCode: 'ERR_SAFE_ZIP_RECEIPT',
      mutate: async (context) => {
        const original = await readFile(context.payloadPath);
        await truncate(context.payloadPath, Math.max(0, original.byteLength - 1));
        return {
          snapshots: [await capturePathTamperSnapshot(context.payloadPath)],
          repair: async () => { await writeFile(context.payloadPath, original); },
        };
      },
    },
    {
      label: 'payload extra hard link',
      expectedCode: 'ERR_SAFE_ZIP_TREE',
      mutate: async (context) => {
        const extraPath = join(context.canonicalCache, 'payload-extra-link');
        await linkFile(context.payloadPath, extraPath);
        return {
          snapshots: await Promise.all([
            capturePathTamperSnapshot(context.payloadPath),
            capturePathTamperSnapshot(extraPath),
          ]),
          repair: async () => { await unlink(extraPath); },
        };
      },
    },
    {
      label: 'payload symlink replacement',
      expectedCode: 'ERR_SAFE_ZIP_TREE',
      mutate: async (context) => {
        const backupPath = join(context.canonicalCache, 'payload-symlink-backup');
        await rename(context.payloadPath, backupPath);
        await symlink(backupPath, context.payloadPath);
        return {
          snapshots: await Promise.all([
            capturePathTamperSnapshot(context.payloadPath),
            capturePathTamperSnapshot(backupPath),
          ]),
          repair: async () => {
            await unlink(context.payloadPath);
            await rename(backupPath, context.payloadPath);
          },
        };
      },
    },
    {
      label: 'unexpected added file',
      expectedCode: 'ERR_SAFE_ZIP_RECEIPT',
      mutate: async (context) => {
        const addedPath = join(context.directoryPath, 'unexpected.txt');
        await writeFile(addedPath, Buffer.from('unexpected cache edit'), { mode: 0o600 });
        return {
          snapshots: [await capturePathTamperSnapshot(addedPath)],
          repair: async () => { await unlink(addedPath); },
        };
      },
    },
    {
      label: 'last expected payload removed',
      expectedCode: 'ERR_SAFE_ZIP_TREE',
      mutate: async (context) => {
        const backupPath = join(context.canonicalCache, 'removed-payload-backup');
        await rename(context.payloadPath, backupPath);
        return {
          snapshots: await Promise.all([
            capturePathTamperSnapshot(context.payloadPath),
            capturePathTamperSnapshot(backupPath),
          ]),
          repair: async () => { await rename(backupPath, context.payloadPath); },
        };
      },
    },
    {
      label: 'nested directory wrong permissions',
      expectedCode: 'ERR_SAFE_ZIP_TREE',
      mutate: async (context) => {
        await chmod(context.directoryPath, 0o750);
        return {
          snapshots: [await capturePathTamperSnapshot(context.directoryPath)],
          repair: async () => chmod(context.directoryPath, 0o700),
        };
      },
    },
    {
      label: 'nested directory symlink replacement',
      expectedCode: 'ERR_SAFE_ZIP_TREE',
      mutate: async (context) => {
        const backupPath = join(context.canonicalCache, 'directory-symlink-backup');
        await rename(context.directoryPath, backupPath);
        await symlink(backupPath, context.directoryPath);
        return {
          snapshots: await Promise.all([
            capturePathTamperSnapshot(context.directoryPath),
            capturePathTamperSnapshot(backupPath),
          ]),
          repair: async () => {
            await unlink(context.directoryPath);
            await rename(backupPath, context.directoryPath);
          },
        };
      },
    },
    {
      label: 'tree root wrong permissions',
      expectedCode: 'ERR_SAFE_ZIP_TREE',
      mutate: async (context) => {
        await chmod(context.treePath, 0o750);
        return {
          snapshots: [await capturePathTamperSnapshot(context.treePath)],
          repair: async () => chmod(context.treePath, 0o700),
        };
      },
    },
  ];

  it.each(staticReuseTamperCases)(
    'rejects static reuse tampering without automatic cleanup: $label',
    async (testCase) => {
      const prefix = testCase.label.replace(/[^a-z]+/g, '-');
      const { canonicalCache, options } = await releaseArchiveFixture(`slopbrick-v103-tamper-${prefix}-`);
      const created = await extractReleaseArchive(options);
      const context: StaticReuseTamperContext = {
        canonicalCache,
        referencePath: join(canonicalCache, `${options.expectedAssetSha256}.safe-zip-v1.ref.json`),
        treePath: created.treePath,
        receiptPath: join(created.treePath, MATERIALIZATION_RECEIPT_FILENAME),
        payloadPath: join(created.treePath, 'pkg/readme.txt'),
        directoryPath: join(created.treePath, 'pkg'),
      };
      const stableIdentity = await lstat(context.referencePath, { bigint: true });
      const treeIdentity = await lstat(context.treePath, { bigint: true });
      const mutation = await testCase.mutate(context);
      const archiveSnapshot = await captureArchivePreservation(options.archivePath);
      const randomBytes = vi.fn((): Uint8Array => { throw new Error('reuse must not materialize'); });
      const unlinks = vi.fn(async (path: Parameters<typeof unlink>[0]) => unlink(path));
      const removals = vi.fn(async (path: Parameters<typeof rmdir>[0]) => rmdir(path));

      try {
        const failure = await extractReleaseArchive(options, {
          randomBytes,
          unlinkFile: unlinks,
          removeDirectory: removals,
        }).catch((error: unknown) => error);

        expect(failure, testCase.label).toBeInstanceOf(SafeZipError);
        expect(failure, testCase.label).toMatchObject({ code: testCase.expectedCode });
        expect([String(failure), JSON.stringify(failure), (failure as Error).stack].join('\n'), testCase.label)
          .not.toContain(canonicalCache);
        expect(Object.prototype.hasOwnProperty.call(failure, 'cause'), testCase.label).toBe(false);
        expect(randomBytes, testCase.label).not.toHaveBeenCalled();
        expect(unlinks, testCase.label).not.toHaveBeenCalled();
        expect(removals, testCase.label).not.toHaveBeenCalled();
        for (const snapshot of mutation.snapshots) await expectPathTamperSnapshot(snapshot);
        expect(await lstat(context.referencePath, { bigint: true }), testCase.label).toMatchObject({
          dev: stableIdentity.dev,
          ino: stableIdentity.ino,
        });
        expect(await lstat(context.treePath, { bigint: true }), testCase.label).toMatchObject({
          dev: treeIdentity.dev,
          ino: treeIdentity.ino,
        });
        await expectArchivePreserved(options.archivePath, archiveSnapshot);

        await mutation.repair();
        await expect(extractReleaseArchive(options), testCase.label).resolves.toEqual({
          treePath: created.treePath,
          receipt: created.receipt,
          cacheStatus: 'reused',
        });
      } finally {
        await rm(canonicalCache, { recursive: true, force: true });
      }
    },
  );

  it('rejects one missing expected file from a two-file tree as receipt tampering without cleanup or mutation', async () => {
    const { canonicalCache, options } = await twoFileReleaseArchiveFixture('slopbrick-v103-tamper-partial-removal-');
    const created = await extractReleaseArchive(options);
    const referencePath = join(canonicalCache, `${options.expectedAssetSha256}.safe-zip-v1.ref.json`);
    const receiptPath = join(created.treePath, MATERIALIZATION_RECEIPT_FILENAME);
    const removedPath = join(created.treePath, 'pkg/readme.txt');
    const retainedPath = join(created.treePath, 'pkg/license.txt');
    const directoryPath = join(created.treePath, 'pkg');
    const backupPath = join(canonicalCache, 'removed-one-payload-backup');
    const stableIdentity = await lstat(referencePath, { bigint: true });
    const treeIdentity = await lstat(created.treePath, { bigint: true });
    await rename(removedPath, backupPath);
    const tamperSnapshots = await Promise.all([
      capturePathTamperSnapshot(referencePath),
      capturePathTamperSnapshot(receiptPath),
      capturePathTamperSnapshot(removedPath),
      capturePathTamperSnapshot(retainedPath),
      capturePathTamperSnapshot(directoryPath),
      capturePathTamperSnapshot(backupPath),
    ]);
    const archiveSnapshot = await captureArchivePreservation(options.archivePath);
    const randomBytes = vi.fn((): Uint8Array => { throw new Error('reuse must not materialize'); });
    const unlinks = vi.fn(async (path: Parameters<typeof unlink>[0]) => unlink(path));
    const removals = vi.fn(async (path: Parameters<typeof rmdir>[0]) => rmdir(path));

    try {
      const failure = await extractReleaseArchive(options, {
        randomBytes,
        unlinkFile: unlinks,
        removeDirectory: removals,
      }).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(SafeZipError);
      expect(failure).toMatchObject({ code: 'ERR_SAFE_ZIP_RECEIPT' });
      expect([String(failure), JSON.stringify(failure), (failure as Error).stack].join('\n'))
        .not.toContain(canonicalCache);
      expect(Object.prototype.hasOwnProperty.call(failure, 'cause')).toBe(false);
      expect(randomBytes).not.toHaveBeenCalled();
      expect(unlinks).not.toHaveBeenCalled();
      expect(removals).not.toHaveBeenCalled();
      for (const snapshot of tamperSnapshots) await expectPathTamperSnapshot(snapshot);
      expect(await lstat(referencePath, { bigint: true })).toMatchObject({
        dev: stableIdentity.dev,
        ino: stableIdentity.ino,
      });
      expect(await lstat(created.treePath, { bigint: true })).toMatchObject({
        dev: treeIdentity.dev,
        ino: treeIdentity.ino,
      });
      await expectArchivePreserved(options.archivePath, archiveSnapshot);

      await rename(backupPath, removedPath);
      await expect(extractReleaseArchive(options)).resolves.toEqual({
        treePath: created.treePath,
        receipt: created.receipt,
        cacheStatus: 'reused',
      });
    } finally {
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  it.each([
    ['stable reference', 'reference', 'ERR_SAFE_ZIP_PUBLICATION'],
    ['receipt', 'receipt', 'ERR_SAFE_ZIP_RECEIPT'],
    ['payload', 'payload', 'ERR_SAFE_ZIP_TREE'],
    ['nested directory', 'directory', 'ERR_SAFE_ZIP_TREE'],
    ['tree root', 'root', 'ERR_SAFE_ZIP_TREE'],
  ] as const)('rejects simulated wrong-owner metadata for the %s without disk mutation', async (_label, target, code) => {
    const { canonicalCache, options } = await nestedReleaseArchiveFixture(`slopbrick-v103-wrong-owner-${target}-`);
    const created = await extractReleaseArchive(options);
    const referencePath = join(canonicalCache, `${options.expectedAssetSha256}.safe-zip-v1.ref.json`);
    const targetPath = target === 'reference'
      ? referencePath
      : target === 'receipt'
        ? join(created.treePath, MATERIALIZATION_RECEIPT_FILENAME)
        : target === 'payload'
          ? join(created.treePath, 'pkg/src/readme.txt')
          : target === 'directory'
            ? join(created.treePath, 'pkg/src')
            : created.treePath;
    const publishedSnapshot = await capturePublishedArtifactSnapshot(referencePath, created.treePath);
    const archiveSnapshot = await captureArchivePreservation(options.archivePath);
    let wrongOwnerObservations = 0;
    const randomBytes = vi.fn((): Uint8Array => { throw new Error('reuse must not materialize'); });
    const unlinks = vi.fn(async (path: Parameters<typeof unlink>[0]) => unlink(path));
    const removals = vi.fn(async (path: Parameters<typeof rmdir>[0]) => rmdir(path));

    try {
      const failure = await extractReleaseArchive(options, {
        randomBytes,
        lstatFile: async (path, lstatOptions) => {
          const metadata = await lstat(path, lstatOptions as { bigint: true });
          if (String(path) !== targetPath) return metadata;
          wrongOwnerObservations += 1;
          return new Proxy(metadata, {
            get: (actual, property) => {
              if (property === 'uid') return actual.uid + 1n;
              const value = Reflect.get(actual, property, actual);
              return typeof value === 'function' ? value.bind(actual) : value;
            },
          });
        },
        unlinkFile: unlinks,
        removeDirectory: removals,
      } as never).catch((error: unknown) => error);

      expect(wrongOwnerObservations).toBeGreaterThan(0);
      expect(failure).toBeInstanceOf(SafeZipError);
      expect(failure).toMatchObject({ code });
      expect([String(failure), JSON.stringify(failure), (failure as Error).stack].join('\n'))
        .not.toContain(canonicalCache);
      expect(Object.prototype.hasOwnProperty.call(failure, 'cause')).toBe(false);
      expect(randomBytes).not.toHaveBeenCalled();
      expect(unlinks).not.toHaveBeenCalled();
      expect(removals).not.toHaveBeenCalled();
      await expectPublishedArtifactSnapshot(publishedSnapshot, 1n);
      await expectArchivePreserved(options.archivePath, archiveSnapshot);
      await expect(extractReleaseArchive(options)).resolves.toEqual({
        treePath: created.treePath,
        receipt: created.receipt,
        cacheStatus: 'reused',
      });
    } finally {
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  it('rejects a same-size archive-byte edit without changing the existing publication', async () => {
    const { canonicalCache, fixture, options } = await releaseArchiveFixture(
      'slopbrick-v103-reuse-archive-byte-edit-',
    );
    const created = await extractReleaseArchive(options);
    const referencePath = join(
      canonicalCache,
      `${options.expectedAssetSha256}.safe-zip-v1.ref.json`,
    );
    const publishedSnapshots = await Promise.all([
      capturePathTamperSnapshot(referencePath),
      capturePathTamperSnapshot(created.treePath),
      capturePathTamperSnapshot(join(created.treePath, 'pkg')),
      capturePathTamperSnapshot(join(created.treePath, MATERIALIZATION_RECEIPT_FILENAME)),
      capturePathTamperSnapshot(join(created.treePath, 'pkg/readme.txt')),
    ]);
    const archiveBefore = await lstat(options.archivePath, { bigint: true });
    const editedArchive = Buffer.from(fixture.bytes);
    const editIndex = Math.floor(editedArchive.byteLength / 2);
    editedArchive[editIndex] = editedArchive[editIndex]! ^ 0x01;
    await writeFile(options.archivePath, editedArchive);
    const archiveEdited = await lstat(options.archivePath, { bigint: true });
    const randomBytes = vi.fn((): Uint8Array => { throw new Error('reuse must not materialize'); });
    const unlinks = vi.fn(async (path: Parameters<typeof unlink>[0]) => unlink(path));
    const removals = vi.fn(async (path: Parameters<typeof rmdir>[0]) => rmdir(path));

    try {
      expect({
        dev: archiveEdited.dev,
        ino: archiveEdited.ino,
        size: archiveEdited.size,
        uid: archiveEdited.uid,
        mode: archiveEdited.mode,
        nlink: archiveEdited.nlink,
      }).toEqual({
        dev: archiveBefore.dev,
        ino: archiveBefore.ino,
        size: archiveBefore.size,
        uid: archiveBefore.uid,
        mode: archiveBefore.mode,
        nlink: archiveBefore.nlink,
      });
      const failure = await extractReleaseArchive(options, {
        randomBytes,
        unlinkFile: unlinks,
        removeDirectory: removals,
      }).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(SafeZipError);
      expect(failure).toMatchObject({ code: 'ERR_SAFE_ZIP_ARCHIVE_MUTATED' });
      expect([String(failure), JSON.stringify(failure), (failure as Error).stack].join('\n'))
        .not.toContain(canonicalCache);
      expect(Object.prototype.hasOwnProperty.call(failure, 'cause')).toBe(false);
      expect(randomBytes).not.toHaveBeenCalled();
      expect(unlinks).not.toHaveBeenCalled();
      expect(removals).not.toHaveBeenCalled();
      await expect(readFile(options.archivePath)).resolves.toEqual(editedArchive);
      const archiveAfterFailure = await lstat(options.archivePath, { bigint: true });
      expect({
        dev: archiveAfterFailure.dev,
        ino: archiveAfterFailure.ino,
        size: archiveAfterFailure.size,
        uid: archiveAfterFailure.uid,
        mode: archiveAfterFailure.mode,
        nlink: archiveAfterFailure.nlink,
      }).toEqual({
        dev: archiveEdited.dev,
        ino: archiveEdited.ino,
        size: archiveEdited.size,
        uid: archiveEdited.uid,
        mode: archiveEdited.mode,
        nlink: archiveEdited.nlink,
      });
      for (const snapshot of publishedSnapshots) await expectPathTamperSnapshot(snapshot);

      await writeFile(options.archivePath, fixture.bytes);
      await expect(extractReleaseArchive(options)).resolves.toEqual({
        treePath: created.treePath,
        receipt: created.receipt,
        cacheStatus: 'reused',
      });
    } finally {
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  it('owns one archive handle for each complete created and reused lifecycle', async () => {
    const { canonicalCache, options } = await nestedReleaseArchiveFixture(
      'slopbrick-v103-archive-owner-success-',
    );
    let created: Awaited<ReturnType<typeof extractReleaseArchive>> | undefined;

    try {
      for (const expectedStatus of ['created', 'reused'] as const) {
        const harness = createArchiveOwnerLifecycleHarness({
          archivePath: options.archivePath,
          probeArchiveAtPublicationLink: expectedStatus === 'created',
        });
        const result = await extractReleaseArchive(options, harness.dependencies);

        if (expectedStatus === 'created') created = result;
        else {
          expect(result).toEqual({
            treePath: created!.treePath,
            receipt: created!.receipt,
            cacheStatus: 'reused',
          });
        }
        expect(result.cacheStatus).toBe(expectedStatus);
        expectSingleArchiveOwner(harness, options.archivePath);
        expect(harness.closeAttempts()).toBe(1);
        expect(harness.closeEffects()).toBe(1);
        expect(harness.archiveClosed()).toBe(true);
        expect(harness.events.slice(-4)).toEqual([
          'archive:path-lstat:while-open',
          'archive:close',
          'archive:close:effect',
          'archive:path-lstat:after-close',
        ]);
        expect(harness.reads.some((read) => (
          read.offset === 0
          && read.position === 0
          && read.length === options.expectedAssetBytes
        ))).toBe(true);

        if (expectedStatus === 'created') {
          expect(harness.events.filter((event) => event === 'publication:link')).toHaveLength(1);
          expect(harness.events.filter((event) => event === 'publication:link:effect')).toHaveLength(1);
          expectEventSubsequence(harness.events, [
            'archive:read',
            'publication:link',
            'publication:link:effect',
            'archive:stat:link-probe',
            'archive:read:link-probe',
            'publication:link-handle-probe:effect',
            'archive:read',
          ]);
          expect(harness.reads.some((read) => !read.afterLink && !read.linkProbe)).toBe(true);
          expect(harness.reads.some((read) => read.afterLink && !read.linkProbe)).toBe(true);
        } else {
          expect(harness.events).not.toContain('publication:link');
        }
      }
    } finally {
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  it('closes an opened archive owner exactly once when its first descriptor stat fails', async () => {
    const { canonicalCache, options } = await releaseArchiveFixture(
      'slopbrick-v103-archive-owner-early-stat-',
    );
    const secret = `${canonicalCache}/opened-owner-stat-secret`;
    const harness = createArchiveOwnerLifecycleHarness({
      archivePath: options.archivePath,
      failFirstArchiveStat: true,
      statFailureSecret: secret,
    });
    const archiveSnapshot = await captureArchivePreservation(options.archivePath);
    const referencePath = join(
      canonicalCache,
      `${options.expectedAssetSha256}.safe-zip-v1.ref.json`,
    );

    try {
      const failure = await extractReleaseArchive(options, harness.dependencies)
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(SafeZipError);
      expect(failure).toMatchObject({ code: 'ERR_SAFE_ZIP_ARCHIVE_MUTATED' });
      expect([String(failure), JSON.stringify(failure), (failure as Error).stack].join('\n'))
        .not.toContain(secret);
      expect(Object.prototype.hasOwnProperty.call(failure, 'cause')).toBe(false);
      expectSingleArchiveOwner(harness, options.archivePath, { requireReads: false });
      expect(harness.reads).toHaveLength(0);
      expect(harness.closeAttempts()).toBe(1);
      expect(harness.closeEffects()).toBe(1);
      expect(harness.archiveClosed()).toBe(true);
      expectEventSubsequence(harness.events, [
        'archive:stat',
        'archive:stat:failure',
        'archive:close',
        'archive:close:effect',
      ]);
      await expectArchivePreserved(options.archivePath, archiveSnapshot);
      await expect(lstat(referencePath, { bigint: true })).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  it.each([
    ['before effect', 'before-effect', 0xb1, 0xb2],
    ['after effect', 'after-effect', 0xb3, 0xb4],
  ] as const)(
    'contains an archive-owner close failure %s while preserving an already-published tree',
    async (_label, timing, treeToken, referenceToken) => {
      const { canonicalCache, options } = await nestedReleaseArchiveFixture(
        `slopbrick-v103-archive-owner-close-${timing}-`,
      );
      const random = deterministicRandomBytes([treeToken, referenceToken]);
      const treePath = join(canonicalCache, `.v103-tree-${random.token(0)}`);
      const referencePath = join(
        canonicalCache,
        `${options.expectedAssetSha256}.safe-zip-v1.ref.json`,
      );
      const secret = `${canonicalCache}/owner-close-${timing}-secret`;
      const archiveSnapshot = await captureArchivePreservation(options.archivePath);
      let publishedSnapshot: readonly PublishedArtifactSnapshotEntry[] | undefined;
      const harness = createArchiveOwnerLifecycleHarness({
        archivePath: options.archivePath,
        closeFailure: timing,
        closeFailureSecret: secret,
        beforeArchiveClose: async () => {
          publishedSnapshot = await capturePublishedArtifactSnapshot(referencePath, treePath);
        },
      });

      try {
        const failure = await extractReleaseArchive(options, {
          ...harness.dependencies,
          randomBytes: random.randomBytes,
        }).catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(SafeZipError);
        expect(failure).toMatchObject({ code: 'ERR_SAFE_ZIP_ARCHIVE_MUTATED' });
        expect([String(failure), JSON.stringify(failure), (failure as Error).stack].join('\n'))
          .not.toContain(secret);
        expect(Object.prototype.hasOwnProperty.call(failure, 'cause')).toBe(false);
        expect(publishedSnapshot).toBeDefined();
        expectSingleArchiveOwner(harness, options.archivePath);
        expect(harness.closeAttempts()).toBe(1);
        expect(harness.closeEffects()).toBe(timing === 'before-effect' ? 0 : 1);
        expect(harness.archiveClosed()).toBe(timing === 'after-effect');
        await expectPublishedArtifactSnapshot(publishedSnapshot!, 1n);
        await expectArchivePreserved(options.archivePath, archiveSnapshot);
      } finally {
        if (timing === 'before-effect') await harness.forceCloseForTest();
        await rm(canonicalCache, { recursive: true, force: true });
      }
    },
  );

  it('preserves the earlier reuse error when owner close fails after its real effect', async () => {
    const { canonicalCache, options } = await nestedReleaseArchiveFixture(
      'slopbrick-v103-archive-owner-primary-error-',
    );
    const created = await extractReleaseArchive(options);
    const referencePath = join(
      canonicalCache,
      `${options.expectedAssetSha256}.safe-zip-v1.ref.json`,
    );
    const receiptPath = join(created.treePath, MATERIALIZATION_RECEIPT_FILENAME);
    const publishedSnapshot = await capturePublishedArtifactSnapshot(referencePath, created.treePath);
    const archiveSnapshot = await captureArchivePreservation(options.archivePath);
    const secret = `${canonicalCache}/secondary-owner-close-secret`;
    const harness = createArchiveOwnerLifecycleHarness({
      archivePath: options.archivePath,
      closeFailure: 'after-effect',
      closeFailureSecret: secret,
    });
    let invalidReceiptObservations = 0;
    const lstatFile = async (pathValue: unknown, lstatOptions: unknown): Promise<any> => {
      const metadata = await harness.dependencies.lstatFile(pathValue, lstatOptions);
      if (String(pathValue) !== receiptPath) return metadata;
      invalidReceiptObservations += 1;
      return new Proxy(metadata, {
        get: (actual, property) => {
          if (property === 'mode') return (actual.mode & ~0o7777n) | 0o640n;
          const value = Reflect.get(actual, property, actual);
          return typeof value === 'function' ? value.bind(actual) : value;
        },
      });
    };

    try {
      const failure = await extractReleaseArchive(options, {
        ...harness.dependencies,
        lstatFile,
      } as never).catch((error: unknown) => error);

      expect(invalidReceiptObservations).toBeGreaterThan(0);
      expect(failure).toBeInstanceOf(SafeZipError);
      expect(failure).toMatchObject({ code: 'ERR_SAFE_ZIP_RECEIPT' });
      expect([String(failure), JSON.stringify(failure), (failure as Error).stack].join('\n'))
        .not.toContain(secret);
      expect(Object.prototype.hasOwnProperty.call(failure, 'cause')).toBe(false);
      expectSingleArchiveOwner(harness, options.archivePath);
      expect(harness.closeAttempts()).toBe(1);
      expect(harness.closeEffects()).toBe(1);
      expect(harness.archiveClosed()).toBe(true);
      await expectPublishedArtifactSnapshot(publishedSnapshot, 1n);
      await expectArchivePreserved(options.archivePath, archiveSnapshot);
      await expect(extractReleaseArchive(options)).resolves.toEqual({
        treePath: created.treePath,
        receipt: created.receipt,
        cacheStatus: 'reused',
      });
    } finally {
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  it('rejects an identical archive pathname replacement performed after owner close', async () => {
    const { canonicalCache, options } = await nestedReleaseArchiveFixture(
      'slopbrick-v103-archive-owner-postclose-swap-',
    );
    const random = deterministicRandomBytes([0xc1, 0xc2]);
    const treePath = join(canonicalCache, `.v103-tree-${random.token(0)}`);
    const referencePath = join(
      canonicalCache,
      `${options.expectedAssetSha256}.safe-zip-v1.ref.json`,
    );
    let publishedSnapshot: readonly PublishedArtifactSnapshotEntry[] | undefined;
    let replacement: Awaited<ReturnType<typeof atomicallyReplaceWithIdenticalBytes>> | undefined;
    const harness = createArchiveOwnerLifecycleHarness({
      archivePath: options.archivePath,
      beforeArchiveClose: async () => {
        publishedSnapshot = await capturePublishedArtifactSnapshot(referencePath, treePath);
      },
      afterRealArchiveClose: async () => {
        replacement = await atomicallyReplaceWithIdenticalBytes(options.archivePath);
      },
    });

    try {
      const failure = await extractReleaseArchive(options, {
        ...harness.dependencies,
        randomBytes: random.randomBytes,
      }).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(SafeZipError);
      expect(failure).toMatchObject({ code: 'ERR_SAFE_ZIP_ARCHIVE_MUTATED' });
      expect([String(failure), JSON.stringify(failure), (failure as Error).stack].join('\n'))
        .not.toContain(canonicalCache);
      expect(Object.prototype.hasOwnProperty.call(failure, 'cause')).toBe(false);
      expect(publishedSnapshot).toBeDefined();
      expect(replacement).toBeDefined();
      expect({ dev: replacement!.after.dev, ino: replacement!.after.ino })
        .not.toEqual({ dev: replacement!.before.dev, ino: replacement!.before.ino });
      expectSingleArchiveOwner(harness, options.archivePath);
      expect(harness.closeAttempts()).toBe(1);
      expect(harness.closeEffects()).toBe(1);
      expect(harness.archiveClosed()).toBe(true);
      expect(harness.events.slice(-6)).toEqual([
        'archive:path-lstat:while-open',
        'archive:close',
        'archive:close:effect',
        'archive:after-close:start',
        'archive:after-close:effect',
        'archive:path-lstat:after-close',
      ]);
      await expectPublishedArtifactSnapshot(publishedSnapshot!, 1n);
      const replacementSnapshot = await captureArchivePreservation(options.archivePath);
      expect(replacementSnapshot.metadata).toMatchObject({
        dev: replacement!.after.dev,
        ino: replacement!.after.ino,
        mode: replacement!.after.mode,
      });
      expect(replacementSnapshot.bytes).toEqual(replacement!.bytes);

      await expect(extractReleaseArchive(options)).resolves.toMatchObject({
        treePath,
        cacheStatus: 'reused',
      });
      await expectArchivePreserved(options.archivePath, replacementSnapshot);
      await expectPublishedArtifactSnapshot(publishedSnapshot!, 1n);
    } finally {
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  it('Task4C RED lifecycle: never retries an ambiguous non-owner FileHandle close', async () => {
    const { canonicalCache, options } = await nestedReleaseArchiveFixture(
      'slopbrick-v103-ambiguous-non-owner-close-',
    );
    const created = await extractReleaseArchive(options);
    const referencePath = join(
      canonicalCache,
      `${options.expectedAssetSha256}.safe-zip-v1.ref.json`,
    );
    const targetPath = join(created.treePath, 'pkg/src/readme.txt');
    const secret = `${canonicalCache}/ambiguous-recycled-descriptor-secret`;
    const publishedSnapshot = await capturePublishedArtifactSnapshot(referencePath, created.treePath);
    const archiveSnapshot = await captureArchivePreservation(options.archivePath);
    const harness = createAmbiguousNonOwnerCloseHarness({ targetPath, secret });

    try {
      const failure = await extractReleaseArchive(options, harness.dependencies)
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(SafeZipError);
      expect(failure).toMatchObject({ code: 'ERR_SAFE_ZIP_TREE' });
      expect([String(failure), JSON.stringify(failure), (failure as Error).stack].join('\n'))
        .not.toContain(secret);
      expect(Object.prototype.hasOwnProperty.call(failure, 'cause')).toBe(false);
      expect(harness.closeEffects()).toBe(1);
      expect(harness.closeAttempts()).toBe(1);
      await expect(harness.recycledResourceState()).resolves.toBe('open');
      await expectPublishedArtifactSnapshot(publishedSnapshot, 1n);
      await expectArchivePreserved(options.archivePath, archiveSnapshot);
    } finally {
      await harness.forceCloseTestResources();
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  it.each([
    ['one ENOENT observation', 'enoent', 0xd1, 0xd2],
    ['one nonmatching identity observation', 'identity', 0xd3, 0xd4],
  ] as const)(
    'Task4C RED lifecycle: preserves a completed stable link when its first lstat has %s',
    async (_label, lie, treeToken, referenceToken) => {
      const { canonicalCache, options } = await nestedReleaseArchiveFixture(
        `slopbrick-v103-link-effect-lstat-lie-${lie}-`,
      );
      const random = deterministicRandomBytes([treeToken, referenceToken]);
      const treePath = join(canonicalCache, `.v103-tree-${random.token(0)}`);
      const temporaryReferencePath = join(canonicalCache, `.v103-ref-${random.token(1)}.tmp`);
      const referencePath = join(
        canonicalCache,
        `${options.expectedAssetSha256}.safe-zip-v1.ref.json`,
      );
      const secret = `${canonicalCache}/completed-link-${lie}-secret`;
      const cleanupPaths: string[] = [];
      let linkCompleted = false;
      let lieObservations = 0;
      let publishedSnapshot: readonly PublishedArtifactSnapshotEntry[] | undefined;

      try {
        const failure = await extractReleaseArchive(options, {
          randomBytes: random.randomBytes,
          linkFile: async (source, destination) => {
            await linkFile(source, destination);
            linkCompleted = true;
            publishedSnapshot = await capturePublishedArtifactSnapshot(referencePath, treePath);
            throw Object.assign(new Error(secret), {
              code: 'EIO',
              cause: new Error(`${secret}:link-cause`),
            });
          },
          lstatFile: async (pathValue, lstatOptions) => {
            const path = String(pathValue);
            if (linkCompleted && lieObservations === 0 && path === referencePath) {
              lieObservations += 1;
              if (lie === 'enoent') {
                throw Object.assign(new Error(secret), {
                  code: 'ENOENT',
                  cause: new Error(`${secret}:lstat-cause`),
                });
              }
              const metadata = await lstat(path, lstatOptions as { bigint: true });
              return new Proxy(metadata, {
                get: (actual, property) => {
                  if (property === 'ino') return actual.ino + 1n;
                  const value = Reflect.get(actual, property, actual);
                  return typeof value === 'function' ? value.bind(actual) : value;
                },
              });
            }
            return lstat(path, lstatOptions as { bigint: true });
          },
          unlinkFile: async (path) => {
            cleanupPaths.push(String(path));
            await unlink(path);
          },
          removeDirectory: async (path) => {
            cleanupPaths.push(String(path));
            await rmdir(path);
          },
        } as never).catch((error: unknown) => error);

        expect(linkCompleted).toBe(true);
        expect(lieObservations).toBe(1);
        expect(failure).toBeInstanceOf(SafeZipError);
        expect(failure).toMatchObject({ code: 'ERR_SAFE_ZIP_PUBLICATION' });
        expect([String(failure), JSON.stringify(failure), (failure as Error).stack].join('\n'))
          .not.toContain(secret);
        expect(Object.prototype.hasOwnProperty.call(failure, 'cause')).toBe(false);
        expect(publishedSnapshot).toBeDefined();
        expect(cleanupPaths.some((path) => path === treePath || path.startsWith(`${treePath}/`)))
          .toBe(false);
        expect(cleanupPaths.every((path) => path === temporaryReferencePath)).toBe(true);
        await expect(lstat(temporaryReferencePath, { bigint: true })).rejects.toMatchObject({ code: 'ENOENT' });
        await expectPublishedArtifactSnapshot(publishedSnapshot!, 1n);

        const parsedReceipt = parseCanonicalMaterializationReceiptV1(
          await readFile(join(treePath, MATERIALIZATION_RECEIPT_FILENAME)),
        );
        expect(parsedReceipt.ok).toBe(true);
        if (!parsedReceipt.ok) throw new Error('expected preserved completed-link receipt');
        await expect(extractReleaseArchive(options)).resolves.toEqual({
          treePath,
          receipt: parsedReceipt.value.value,
          cacheStatus: 'reused',
        });
        await expectPublishedArtifactSnapshot(publishedSnapshot!, 1n);
      } finally {
        await rm(canonicalCache, { recursive: true, force: true });
      }
    },
  );

  it('Task4C EEXIST transferred edge: treats a fully verified temporary-reference inode as our completed link', async () => {
    const { canonicalCache, options } = await nestedReleaseArchiveFixture(
      'slopbrick-v103-eexist-transferred-after-identity-lie-',
    );
    const random = deterministicRandomBytes([0xd5, 0xd6]);
    const treePath = join(canonicalCache, `.v103-tree-${random.token(0)}`);
    const temporaryReferencePath = join(canonicalCache, `.v103-ref-${random.token(1)}.tmp`);
    const referencePath = join(
      canonicalCache,
      `${options.expectedAssetSha256}.safe-zip-v1.ref.json`,
    );
    const secret = `${canonicalCache}/eexist-transferred-identity-lie-secret`;
    const unlinkedPaths: string[] = [];
    let linkCompleted = false;
    let identityLies = 0;
    let cacheSyncEffects = 0;
    let publishedSnapshot: readonly PublishedArtifactSnapshotEntry[] | undefined;

    try {
      const failure = await extractReleaseArchive(options, {
        randomBytes: random.randomBytes,
        openFile: async (path, flags, mode) => {
          const handle = await openFile(path, flags, mode);
          if (String(path) === canonicalCache) {
            const sync = handle.sync.bind(handle);
            Object.defineProperty(handle, 'sync', {
              configurable: true,
              value: async () => {
                await sync();
                cacheSyncEffects += 1;
              },
            });
          }
          return handle;
        },
        linkFile: async (source, destination) => {
          await linkFile(source, destination);
          linkCompleted = true;
          publishedSnapshot = await capturePublishedArtifactSnapshot(referencePath, treePath);
          throw Object.assign(new Error(secret), {
            code: 'EEXIST',
            cause: new Error(`${secret}:link-cause`),
          });
        },
        lstatFile: async (path, lstatOptions) => {
          const metadata = await lstat(path, lstatOptions as { bigint: true });
          if (linkCompleted && identityLies === 0 && String(path) === referencePath) {
            identityLies += 1;
            return new Proxy(metadata, {
              get: (actual, property) => {
                if (property === 'ino') return actual.ino + 1n;
                const value = Reflect.get(actual, property, actual);
                return typeof value === 'function' ? value.bind(actual) : value;
              },
            });
          }
          return metadata;
        },
        unlinkFile: async (path) => {
          unlinkedPaths.push(String(path));
          await unlink(path);
        },
      } as never).catch((error: unknown) => error);

      expect(linkCompleted).toBe(true);
      expect(identityLies).toBe(1);
      expect(failure).toBeInstanceOf(SafeZipError);
      expect(failure).toMatchObject({ code: 'ERR_SAFE_ZIP_PUBLICATION' });
      expect([String(failure), JSON.stringify(failure), (failure as Error).stack].join('\n'))
        .not.toContain(secret);
      expect(Object.prototype.hasOwnProperty.call(failure, 'cause')).toBe(false);
      expect(cacheSyncEffects).toBe(3);
      expect(unlinkedPaths).toEqual([temporaryReferencePath]);
      await expect(lstat(temporaryReferencePath, { bigint: true })).rejects.toMatchObject({ code: 'ENOENT' });
      expect(publishedSnapshot).toBeDefined();
      await expectPublishedArtifactSnapshot(publishedSnapshot!, 1n);

      const parsedReceipt = parseCanonicalMaterializationReceiptV1(
        await readFile(join(treePath, MATERIALIZATION_RECEIPT_FILENAME)),
      );
      expect(parsedReceipt.ok).toBe(true);
      if (!parsedReceipt.ok) throw new Error('expected transferred EEXIST receipt');
      await expect(extractReleaseArchive(options)).resolves.toEqual({
        treePath,
        receipt: parsedReceipt.value.value,
        cacheStatus: 'reused',
      });
    } finally {
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });

  it.each([
    ['before effect', 'before-effect'],
    ['after effect', 'after-effect'],
  ] as const)(
    'Task4C RED lifecycle: bounds fs.Dir close recovery %s without descriptor identity proof',
    async (_label, timing) => {
      const { canonicalCache, options } = await releaseArchiveFixture(
        `slopbrick-v103-directory-close-${timing}-`,
      );
      const secret = `${canonicalCache}/directory-close-${timing}-secret`;
      const archiveSnapshot = await captureArchivePreservation(options.archivePath);
      const harness = createDirectoryCloseFailureHarness({ timing, secret });

      try {
        const failure = await extractReleaseArchive(options, harness.dependencies)
          .catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(SafeZipError);
        expect(failure).toMatchObject({ code: 'ERR_SAFE_ZIP_TREE' });
        expect([String(failure), JSON.stringify(failure), (failure as Error).stack].join('\n'))
          .not.toContain(secret);
        expect(Object.prototype.hasOwnProperty.call(failure, 'cause')).toBe(false);
        expect(harness.closeAttempts()).toBe(1);
        expect(harness.wrapperCloseEffects()).toBe(timing === 'before-effect' ? 0 : 1);
        await expect(harness.resourceState()).resolves.toBe('closed');
        await expectArchivePreserved(options.archivePath, archiveSnapshot);
      } finally {
        await harness.forceCloseForTest();
        await rm(canonicalCache, { recursive: true, force: true });
      }
    },
  );

  it('rejects setuid/setgid file modes and setgid/sticky directory modes during reuse', async () => {
    const { canonicalCache, options } = await releaseArchiveFixture('slopbrick-v103-special-modes-');

    try {
      const created = await extractReleaseArchive(options);
      const filePath = join(created.treePath, 'pkg/readme.txt');
      const directoryPath = join(created.treePath, 'pkg');
      const cases = [
        { label: 'setuid file', path: filePath, mutatedMode: 0o4600, restoredMode: 0o600, specialBits: 0o4000 },
        { label: 'setgid file', path: filePath, mutatedMode: 0o2600, restoredMode: 0o600, specialBits: 0o2000 },
        { label: 'setgid directory', path: directoryPath, mutatedMode: 0o2700, restoredMode: 0o700, specialBits: 0o2000 },
        { label: 'sticky directory', path: directoryPath, mutatedMode: 0o1700, restoredMode: 0o700, specialBits: 0o1000 },
      ] as const;

      for (const testCase of cases) {
        await chmod(testCase.path, testCase.mutatedMode);
        expect((await lstat(testCase.path)).mode & testCase.specialBits, testCase.label)
          .toBe(testCase.specialBits);
        await expect(extractReleaseArchive(options), testCase.label).rejects.toMatchObject({
          code: 'ERR_SAFE_ZIP_TREE',
        });
        await chmod(testCase.path, testCase.restoredMode);
        await expect(extractReleaseArchive(options), `${testCase.label} restored`).resolves.toMatchObject({
          cacheStatus: 'reused',
        });
      }
    } finally {
      await rm(canonicalCache, { recursive: true, force: true });
    }
  });
});
