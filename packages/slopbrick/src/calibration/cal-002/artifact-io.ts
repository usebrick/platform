import { createHash, randomBytes } from 'node:crypto';
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
import { basename, dirname, isAbsolute, join, relative, resolve, sep, win32 } from 'node:path';

import { canonicalArtifact, validateCAL002ReviewReceipt } from './contracts';
import {
  assertCAL002ReviewState,
  type CAL002ReviewReceipt,
  type CAL002ReviewState,
} from './review-session';

interface ArtifactLocation {
  readonly root: string;
  readonly relativePath: string;
}

interface ReadCanonicalArtifactInput extends ArtifactLocation {
  readonly label: string;
}

const PRIVATE_FILE_MODE = 0o600;

function unsafeRelativePath(path: string): boolean {
  if (path.length === 0 || path.includes('\0') || isAbsolute(path) || win32.isAbsolute(path)) return true;
  const segments = path.split(/[\\/]/u);
  return segments.some((segment) => segment === '' || segment === '.' || segment === '..');
}

async function existingRoot(root: string): Promise<string> {
  const metadata = await lstat(root);
  if (metadata.isSymbolicLink()) throw new Error('CAL-002 artifact root must not be a symbolic link');
  if (!metadata.isDirectory()) throw new Error('CAL-002 artifact root must be a directory');
  return realpath(root);
}

function assertContained(root: string, candidate: string): void {
  const fromRoot = relative(root, candidate);
  if (fromRoot === '' || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error('CAL-002 artifact path must be safely contained beneath the root');
  }
}

async function inspectExistingSegments(root: string, candidate: string, allowMissingLeaf: boolean): Promise<void> {
  const segments = relative(root, candidate).split(sep);
  let current = root;
  for (const [index, segment] of segments.entries()) {
    current = join(current, segment);
    try {
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink()) throw new Error(`CAL-002 artifact path contains a symbolic link: ${segment}`);
      if (index < segments.length - 1 && !metadata.isDirectory()) {
        throw new Error(`CAL-002 artifact path ancestor is not a directory: ${segment}`);
      }
      if (index === segments.length - 1 && !allowMissingLeaf && !metadata.isFile()) {
        throw new Error('CAL-002 artifact input must be a regular file');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      if (!allowMissingLeaf || index !== segments.length - 1) throw error;
    }
  }
}

async function resolveArtifactPath(input: ArtifactLocation, allowMissingLeaf: boolean): Promise<string> {
  if (unsafeRelativePath(input.relativePath)) throw new Error('CAL-002 artifact path must be a safe relative path');
  const root = await existingRoot(input.root);
  const candidate = resolve(root, input.relativePath);
  assertContained(root, candidate);
  await inspectExistingSegments(root, candidate, allowMissingLeaf);
  return candidate;
}

async function ensureSafeParent(root: string, relativePath: string): Promise<string> {
  if (unsafeRelativePath(relativePath)) throw new Error('CAL-002 artifact path must be a safe relative path');
  const canonicalRoot = await existingRoot(root);
  const candidate = resolve(canonicalRoot, relativePath);
  assertContained(canonicalRoot, candidate);
  const parent = dirname(candidate);
  const parentRelative = relative(canonicalRoot, parent);
  let current = canonicalRoot;
  for (const segment of parentRelative === '' ? [] : parentRelative.split(sep)) {
    current = join(current, segment);
    try {
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink()) throw new Error(`CAL-002 artifact path contains a symbolic link: ${segment}`);
      if (!metadata.isDirectory()) throw new Error(`CAL-002 artifact path ancestor is not a directory: ${segment}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await mkdir(current, { mode: 0o700 });
      const created = await lstat(current);
      if (!created.isDirectory() || created.isSymbolicLink()) throw new Error('CAL-002 artifact directory creation was unsafe');
    }
  }
  await inspectExistingSegments(canonicalRoot, candidate, true);
  return candidate;
}

async function syncDirectory(path: string): Promise<void> {
  const directory = await open(path, constants.O_RDONLY);
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

export async function readCanonicalArtifact(input: ReadCanonicalArtifactInput): Promise<unknown> {
  const path = await resolveArtifactPath(input, false);
  const bytes = await readFile(path, 'utf8');
  let value: unknown;
  try {
    value = JSON.parse(bytes) as unknown;
  } catch {
    throw new Error(`${input.label} is not valid JSON`);
  }
  let canonical: string;
  try {
    canonical = canonicalArtifact(value).json;
  } catch (error) {
    throw new Error(`${input.label} is not canonical JSON: ${(error as Error).message}`);
  }
  if (bytes !== canonical) throw new Error(`${input.label} is not exact canonical JSON`);
  return value;
}

export async function readReviewState(input: ArtifactLocation): Promise<CAL002ReviewState> {
  const path = await resolveArtifactPath(input, false);
  const metadata = await lstat(path);
  if ((metadata.mode & 0o777) !== PRIVATE_FILE_MODE) throw new Error('CAL-002 review state must have private mode 0600');
  const value = await readCanonicalArtifact({ ...input, label: 'CAL-002 review state' });
  assertCAL002ReviewState(value);
  return value;
}

export async function writeReviewState(input: ArtifactLocation & { readonly state: CAL002ReviewState }): Promise<void> {
  assertCAL002ReviewState(input.state);
  const path = await ensureSafeParent(input.root, input.relativePath);
  try {
    const existing = await lstat(path);
    if (existing.isSymbolicLink() || !existing.isFile()) throw new Error('CAL-002 review state path must be a regular file');
    if ((existing.mode & 0o777) !== PRIVATE_FILE_MODE) throw new Error('CAL-002 review state must retain private mode 0600');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(12).toString('hex')}.tmp`);
  const handle = await open(temporary, 'wx', PRIVATE_FILE_MODE);
  try {
    await handle.writeFile(canonicalArtifact(input.state).json, 'utf8');
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  await handle.close();
  try {
    await rename(temporary, path);
    await syncDirectory(dirname(path));
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export async function writeImmutableReceipt(input: ArtifactLocation & { readonly receipt: CAL002ReviewReceipt }): Promise<void> {
  const validation = validateCAL002ReviewReceipt(input.receipt);
  if (!validation.ok) throw new TypeError(`CAL-002 review receipt is invalid: ${validation.errors.join('; ')}`);
  const path = await ensureSafeParent(input.root, input.relativePath);
  let handle;
  try {
    handle = await open(path, 'wx', PRIVATE_FILE_MODE);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('CAL-002 review receipt already exists and is immutable');
    throw error;
  }
  try {
    await handle.writeFile(canonicalArtifact(input.receipt).json, 'utf8');
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(path).catch(() => undefined);
    throw error;
  }
  await handle.close();
  await syncDirectory(dirname(path));
}

export async function readVerifiedSource(input: ArtifactLocation & { readonly expectedSha256: string }): Promise<string> {
  const path = await resolveArtifactPath(input, false);
  const bytes = await readFile(path);
  const observedSha256 = createHash('sha256').update(bytes).digest('hex');
  if (observedSha256 !== input.expectedSha256) throw new Error('CAL-002 source content SHA-256 does not match the selected observation');
  return bytes.toString('utf8');
}
