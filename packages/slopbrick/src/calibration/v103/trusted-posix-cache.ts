import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, type FileHandle } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export interface TrustedPosixFileIdentity {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly size: bigint;
  isFile(): boolean;
}

export interface TrustedPosixFilesystemSecurityCapabilities {
  readonly noFollowFlag: number | undefined;
  readonly nonBlockingFlag: number | undefined;
  readonly effectiveUid: number | undefined;
}

export interface RequiredTrustedPosixCapabilities {
  readonly noFollowFlag: number;
  readonly nonBlockingFlag: number;
  readonly effectiveUid: number;
  readonly regularFileReadFlags: number;
}

export type TrustedPosixOpenFile = (
  path: string,
  flags: string | number,
  mode?: number,
) => Promise<FileHandle>;

export type TrustedPosixRealpath = (path: string) => Promise<string>;
export type TrustedPosixLstat = typeof lstat;

export type TrustedCanonicalCacheDirectoryResult =
  | { readonly status: 'trusted'; readonly path: string }
  | { readonly status: 'untrusted' }
  | { readonly status: 'io'; readonly error: unknown };

export type DescriptorSha256Result =
  | { readonly status: 'hashed'; readonly bytesRead: number; readonly sha256: string }
  | { readonly status: 'io'; readonly error: unknown };

export type TrustedRegularFileVerification = 'missing' | 'valid' | 'invalid';

const DESCRIPTOR_HASH_BUFFER_BYTES = 64 * 1024;

function errnoCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

async function awaitFilesystem<T>(
  operation: () => Promise<T>,
  checkDeadline: () => void,
  isAuthoritativeError: (error: unknown) => boolean = () => false,
): Promise<{ readonly status: 'ok'; readonly value: T } | { readonly status: 'error'; readonly error: unknown }> {
  checkDeadline();
  let value: T;
  try {
    value = await operation();
  } catch (error) {
    if (isAuthoritativeError(error)) throw error;
    checkDeadline();
    return { status: 'error', error };
  }
  checkDeadline();
  return { status: 'ok', value };
}

export function requireTrustedPosixCapabilities(
  capabilities: TrustedPosixFilesystemSecurityCapabilities,
): RequiredTrustedPosixCapabilities | undefined {
  if (
    !Number.isInteger(capabilities.noFollowFlag)
    || capabilities.noFollowFlag! <= 0
    || !Number.isInteger(capabilities.nonBlockingFlag)
    || capabilities.nonBlockingFlag! <= 0
    || !Number.isInteger(capabilities.effectiveUid)
    || capabilities.effectiveUid! < 0
  ) return undefined;

  return {
    noFollowFlag: capabilities.noFollowFlag!,
    nonBlockingFlag: capabilities.nonBlockingFlag!,
    effectiveUid: capabilities.effectiveUid!,
    regularFileReadFlags: constants.O_RDONLY | capabilities.noFollowFlag! | capabilities.nonBlockingFlag!,
  };
}

export async function inspectTrustedCanonicalCacheDirectory(
  cacheDirectory: string,
  effectiveUid: number,
  realpathFile: TrustedPosixRealpath,
  lstatFile: TrustedPosixLstat,
  checkDeadline: () => void = () => undefined,
  isAuthoritativeError: (error: unknown) => boolean = () => false,
): Promise<TrustedCanonicalCacheDirectoryResult> {
  const absolute = resolve(cacheDirectory);
  const resolved = await awaitFilesystem(() => realpathFile(absolute), checkDeadline, isAuthoritativeError);
  if (resolved.status === 'error') {
    return { status: 'io', error: resolved.error };
  }
  const canonical = resolved.value;
  if (canonical !== absolute) return { status: 'untrusted' };

  let current = canonical;
  while (true) {
    const inspected = await awaitFilesystem(() => lstatFile(current), checkDeadline, isAuthoritativeError);
    if (inspected.status === 'error') {
      return { status: 'io', error: inspected.error };
    }
    const metadata = inspected.value;
    const writableByOthers = (metadata.mode & 0o022) !== 0;
    const rootOwnedSticky = metadata.uid === 0 && (metadata.mode & 0o1000) !== 0;
    if (
      !metadata.isDirectory()
      || (metadata.uid !== 0 && metadata.uid !== effectiveUid)
      || (writableByOthers && !rootOwnedSticky)
      || (current === canonical && (metadata.uid !== effectiveUid || (metadata.mode & 0o077) !== 0))
    ) return { status: 'untrusted' };

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return { status: 'trusted', path: canonical };
}

export function sameTrustedPosixFileIdentity(
  left: Pick<TrustedPosixFileIdentity, 'dev' | 'ino'>,
  right: Pick<TrustedPosixFileIdentity, 'dev' | 'ino'>,
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

export async function hashFileHandleSha256(
  handle: FileHandle,
  expectedBytes: number,
  checkDeadline: () => void = () => undefined,
  isAuthoritativeError: (error: unknown) => boolean = () => false,
): Promise<DescriptorSha256Result> {
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(Math.min(DESCRIPTOR_HASH_BUFFER_BYTES, Math.max(1, expectedBytes)));
  let position = 0;
  while (position < expectedBytes) {
    const length = Math.min(buffer.byteLength, expectedBytes - position);
    const read = await awaitFilesystem(
      () => handle.read(buffer, 0, length, position),
      checkDeadline,
      isAuthoritativeError,
    );
    if (read.status === 'error') return { status: 'io', error: read.error };
    const { bytesRead } = read.value;
    if (!Number.isInteger(bytesRead) || bytesRead < 0 || bytesRead > length) {
      return { status: 'io', error: new RangeError('Descriptor returned an invalid byte count') };
    }
    if (bytesRead === 0) break;
    hash.update(buffer.subarray(0, bytesRead));
    position += bytesRead;
  }
  return { status: 'hashed', bytesRead: position, sha256: hash.digest('hex') };
}

/**
 * Verifies one pathname without transferring descriptor ownership. This Task 3
 * wrapper closes its own handle; callers that must retain a verified handle use
 * the exported identity and hash primitives directly.
 */
export async function verifyTrustedRegularFile(
  path: string,
  expectedBytes: number,
  expectedSha256: string,
  openFile: TrustedPosixOpenFile,
  checkDeadline: () => void = () => undefined,
  openFlags: number = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  lstatFile: TrustedPosixLstat = lstat,
  isAuthoritativeError: (error: unknown) => boolean = () => false,
): Promise<TrustedRegularFileVerification> {
  const expectedSize = BigInt(expectedBytes);
  const before = await awaitFilesystem(
    () => lstatFile(path, { bigint: true }),
    checkDeadline,
    isAuthoritativeError,
  );
  if (before.status === 'error') {
    return errnoCode(before.error) === 'ENOENT' ? 'missing' : 'invalid';
  }
  const pathBeforeOpen = before.value;
  if (!pathBeforeOpen.isFile() || pathBeforeOpen.size !== expectedSize) return 'invalid';

  checkDeadline();
  let handle: FileHandle;
  try {
    handle = await openFile(path, openFlags);
  } catch (error) {
    if (isAuthoritativeError(error)) throw error;
    checkDeadline();
    return 'invalid';
  }
  let valid = false;
  let finalHandleIdentity: TrustedPosixFileIdentity | undefined;

  try {
    // Keep the acquired handle in this scope before checking the cooperative
    // deadline so a timeout observed immediately after open still closes it.
    checkDeadline();
    const initial = await awaitFilesystem(
      () => handle.stat({ bigint: true }),
      checkDeadline,
      isAuthoritativeError,
    );
    if (initial.status === 'ok') {
      const metadata = initial.value;
      if (
        metadata.isFile()
        && metadata.size === expectedSize
        && sameTrustedPosixFileIdentity(metadata, pathBeforeOpen)
      ) {
        const hashed = await hashFileHandleSha256(
          handle,
          expectedBytes,
          checkDeadline,
          isAuthoritativeError,
        );
        if (hashed.status === 'hashed') {
          const final = await awaitFilesystem(
            () => handle.stat({ bigint: true }),
            checkDeadline,
            isAuthoritativeError,
          );
          if (final.status === 'ok') {
            finalHandleIdentity = final.value;
            valid = final.value.isFile()
              && final.value.size === expectedSize
              && sameTrustedPosixFileIdentity(final.value, pathBeforeOpen)
              && sameTrustedPosixFileIdentity(final.value, metadata)
              && hashed.bytesRead === expectedBytes
              && hashed.sha256 === expectedSha256;
          }
        }
      }
    }
  } finally {
    try {
      await handle.close();
    } catch {
      valid = false;
    }
  }

  checkDeadline();
  if (!valid || !finalHandleIdentity) return 'invalid';
  const after = await awaitFilesystem(
    () => lstatFile(path, { bigint: true }),
    checkDeadline,
    isAuthoritativeError,
  );
  if (after.status === 'error') {
    return 'invalid';
  }
  return after.value.isFile()
    && after.value.size === expectedSize
    && sameTrustedPosixFileIdentity(after.value, pathBeforeOpen)
    && sameTrustedPosixFileIdentity(after.value, finalHandleIdentity)
    ? 'valid'
    : 'invalid';
}
