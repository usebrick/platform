import { randomBytes } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, parse, resolve, sep } from 'node:path';

import { OutcomeEventStoreError } from './outcome-store-contract';

export interface FileIdentity {
  readonly device: bigint;
  readonly inode: bigint;
}

export interface StoreLock {
  readonly descriptor: number;
  readonly identity: FileIdentity;
  readonly path: string;
  readonly storagePath: string;
}

function assertFilesystemSupport(): void {
  if (process.platform === 'win32' || constants.O_NOFOLLOW <= 0) {
    throw new OutcomeEventStoreError(
      'Outcome event storage requires POSIX no-follow filesystem semantics',
    );
  }
}

function assertNoSymbolicLinkComponents(path: string, label: string): void {
  const absolutePath = resolve(path);
  const root = parse(absolutePath).root;
  let cursor = root;
  const components = absolutePath.slice(root.length).split(sep);
  for (let index = 0; index < components.length; index += 1) {
    const component = components[index];
    if (component === undefined || component === '') continue;
    cursor = join(cursor, component);
    try {
      if (lstatSync(cursor).isSymbolicLink()) {
        throw new OutcomeEventStoreError(`${label} must use a canonical path without symbolic links`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  }
}

function assertPrivateParent(path: string, label: string): void {
  const parentPath = dirname(path);
  assertNoSymbolicLinkComponents(parentPath, label);
  mkdirSync(parentPath, { recursive: true, mode: 0o700 });
  assertNoSymbolicLinkComponents(parentPath, label);
  const metadata = statSync(parentPath);
  if (!metadata.isDirectory()) throw new OutcomeEventStoreError(`${label} parent must be a directory`);
  if (typeof process.getuid === 'function' && metadata.uid !== process.getuid()) {
    throw new OutcomeEventStoreError(`${label} parent must be owned by the current user`);
  }
  if ((metadata.mode & 0o077) !== 0) {
    throw new OutcomeEventStoreError(`${label} parent permissions must be owner-only`);
  }
}

function assertSingleLinkRegularFile(descriptor: number, label: string): void {
  const metadata = fstatSync(descriptor, { bigint: true });
  if (!metadata.isFile()) throw new OutcomeEventStoreError(`${label} must be a regular file`);
  if (metadata.nlink !== 1n) throw new OutcomeEventStoreError(`${label} must not have hard-link aliases`);
}

function descriptorIdentity(descriptor: number): FileIdentity {
  const metadata = fstatSync(descriptor, { bigint: true });
  return { device: metadata.dev, inode: metadata.ino };
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.device === right.device && left.inode === right.inode;
}

function pathIdentity(path: string, label: string): FileIdentity {
  const metadata = lstatSync(path, { bigint: true });
  if (!metadata.isFile()) throw new OutcomeEventStoreError(`${label} must be a regular file`);
  if (metadata.nlink !== 1n) throw new OutcomeEventStoreError(`${label} must not have hard-link aliases`);
  return { device: metadata.dev, inode: metadata.ino };
}

function openRegularFile(path: string, flags: number, label: string, mode?: number): number {
  assertFilesystemSupport();
  const absolutePath = resolve(path);
  assertNoSymbolicLinkComponents(absolutePath, label);
  let descriptor: number;
  try {
    descriptor = openSync(
      absolutePath,
      flags | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      mode,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
      throw new OutcomeEventStoreError(`${label} must not be a symbolic link`);
    }
    throw error;
  }
  try {
    assertSingleLinkRegularFile(descriptor, label);
    return descriptor;
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}

export function openOutcomeFileForRead(path: string, label: string): number | undefined {
  try {
    return openRegularFile(path, constants.O_RDONLY, label);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export function outcomeFileIdentity(path: string, label: string): FileIdentity | undefined {
  const descriptor = openOutcomeFileForRead(path, label);
  if (descriptor === undefined) return undefined;
  try {
    return descriptorIdentity(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

export function openOutcomeFileForAppend(path: string, label: string): number {
  return openRegularFile(
    path,
    constants.O_RDWR | constants.O_APPEND | constants.O_CREAT,
    label,
    0o600,
  );
}

export function readOutcomeFile(descriptor: number, maxBytes: number): string {
  const metadata = fstatSync(descriptor, { bigint: true });
  if (metadata.size > BigInt(maxBytes)) {
    throw new OutcomeEventStoreError('Outcome event store exceeds its size limit');
  }
  return readFileSync(descriptor, 'utf8');
}

export function appendOutcomeBytes(descriptor: number, bytes: string): void {
  fchmodSync(descriptor, 0o600);
  writeFileSync(descriptor, bytes, 'utf8');
  fsyncSync(descriptor);
}

export function closeOutcomeFile(descriptor: number): void {
  closeSync(descriptor);
}

export function acquireOutcomeStoreLock(storagePath: string): StoreLock {
  assertFilesystemSupport();
  const absoluteStoragePath = resolve(storagePath);
  assertPrivateParent(absoluteStoragePath, 'Outcome event store');
  assertNoSymbolicLinkComponents(absoluteStoragePath, 'Outcome event store');
  const lockPath = `${absoluteStoragePath}.lock`;
  let descriptor: number;
  try {
    descriptor = openSync(
      lockPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new OutcomeEventStoreError('Outcome event store is busy');
    }
    throw error;
  }
  try {
    assertSingleLinkRegularFile(descriptor, 'Outcome event store lock');
    fchmodSync(descriptor, 0o600);
    return {
      descriptor,
      identity: descriptorIdentity(descriptor),
      path: lockPath,
      storagePath: absoluteStoragePath,
    };
  } catch (error) {
    closeSync(descriptor);
    try { unlinkSync(lockPath); } catch { /* preserve the primary error */ }
    throw error;
  }
}

export function releaseOutcomeStoreLock(lock: StoreLock): void {
  try {
    const currentIdentity = pathIdentity(lock.path, 'Outcome event store lock');
    if (!sameIdentity(lock.identity, currentIdentity)) {
      throw new OutcomeEventStoreError('Outcome event store lock identity changed before release');
    }
    unlinkSync(lock.path);
  } finally {
    closeSync(lock.descriptor);
  }
}

function assertReplaceableTarget(
  path: string,
  label: string,
  forbiddenIdentities: readonly FileIdentity[],
): void {
  const identity = outcomeFileIdentity(path, label);
  if (identity === undefined) return;
  for (let index = 0; index < forbiddenIdentities.length; index += 1) {
    const forbidden = forbiddenIdentities[index];
    if (forbidden !== undefined && sameIdentity(identity, forbidden)) {
      throw new OutcomeEventStoreError('Outcome export must not alias protected local storage');
    }
  }
}

export function writePrivateAtomic(
  path: string,
  contents: string,
  forbiddenIdentities: readonly FileIdentity[],
): void {
  assertFilesystemSupport();
  const absolutePath = resolve(path);
  assertPrivateParent(absolutePath, 'Outcome export');
  assertNoSymbolicLinkComponents(absolutePath, 'Outcome export');
  assertReplaceableTarget(absolutePath, 'Outcome export', forbiddenIdentities);

  const temporaryPath = `${absolutePath}.tmp-${randomBytes(12).toString('hex')}`;
  let descriptor: number | undefined;
  try {
    descriptor = openSync(
      temporaryPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    assertSingleLinkRegularFile(descriptor, 'Outcome export temporary file');
    fchmodSync(descriptor, 0o600);
    writeFileSync(descriptor, contents, 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;

    assertNoSymbolicLinkComponents(absolutePath, 'Outcome export');
    assertReplaceableTarget(absolutePath, 'Outcome export', forbiddenIdentities);
    renameSync(temporaryPath, absolutePath);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
}

export function secureOutcomePathExists(path: string): boolean {
  assertFilesystemSupport();
  const absolutePath = resolve(path);
  assertNoSymbolicLinkComponents(absolutePath, 'Outcome event store');
  try {
    lstatSync(absolutePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export function deleteSingleLinkRegularFile(path: string): boolean {
  const absolutePath = resolve(path);
  const descriptor = openOutcomeFileForRead(absolutePath, 'Outcome event store');
  if (descriptor === undefined) return false;
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    const current = lstatSync(absolutePath, { bigint: true });
    if (!current.isFile() || current.nlink !== 1n
      || current.dev !== opened.dev || current.ino !== opened.ino) {
      throw new OutcomeEventStoreError('Outcome event store identity changed before deletion');
    }
    unlinkSync(absolutePath);
    return true;
  } finally {
    closeOutcomeFile(descriptor);
  }
}
