import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  unlink,
} from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep, win32 } from 'node:path';

import { canonicalArtifact } from './contracts';
import {
  assertCAL002ReviewReceipt,
  assertCAL002ReviewState,
  type CAL002ReviewReceipt,
  type CAL002ReviewState,
} from './review-session';

export interface ArtifactLocation {
  readonly root: string;
  readonly relativePath: string;
}

interface ReadCanonicalArtifactInput extends ArtifactLocation {
  readonly label: string;
}

interface ValidatedArtifactInput<T> extends ReadCanonicalArtifactInput {
  readonly assertValue: (value: unknown) => asserts value is T;
}

interface ValidatedArtifactWriteInput<T> extends ValidatedArtifactInput<T> {
  readonly value: T;
}

const PRIVATE_FILE_MODE = 0o600;
const SOURCE_SCAN_SKIP_DIRECTORIES = new Set([
  '.git',
  '.mypy_cache',
  '.pytest_cache',
  '.tox',
  '.venv',
  '__pycache__',
  'env',
  'node_modules',
  'venv',
]);

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

export async function readPrivateCanonicalArtifact<T>(input: ValidatedArtifactInput<T>): Promise<T> {
  const path = await resolveArtifactPath(input, false);
  const metadata = await lstat(path);
  if ((metadata.mode & 0o777) !== PRIVATE_FILE_MODE) throw new Error(`${input.label} must have private mode 0600`);
  const value = await readCanonicalArtifact(input);
  input.assertValue(value);
  return value;
}

async function writePrivateValueAtomically<T>(input: ValidatedArtifactWriteInput<T>): Promise<void> {
  const path = await ensureSafeParent(input.root, input.relativePath);
  const lockPath = join(dirname(path), `.${basename(path)}.lock`);
  let lock;
  try {
    lock = await open(lockPath, 'wx', PRIVATE_FILE_MODE);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`${input.label} is locked by another writer`);
    }
    throw error;
  }
  try {
    try {
      const existing = await lstat(path);
      if (existing.isSymbolicLink() || !existing.isFile()) throw new Error(`${input.label} path must be a regular file`);
      if ((existing.mode & 0o777) !== PRIVATE_FILE_MODE) throw new Error(`${input.label} must retain private mode 0600`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(12).toString('hex')}.tmp`);
    const handle = await open(temporary, 'wx', PRIVATE_FILE_MODE);
    try {
      await handle.writeFile(canonicalArtifact(input.value).json, 'utf8');
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
  } finally {
    await lock.close().catch(() => undefined);
    await unlink(lockPath).catch(() => undefined);
    await syncDirectory(dirname(path));
  }
}

async function writePrivateValueExclusively<T>(input: ValidatedArtifactWriteInput<T>): Promise<void> {
  const path = await ensureSafeParent(input.root, input.relativePath);
  let handle;
  try {
    handle = await open(path, 'wx', PRIVATE_FILE_MODE);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      const existing = await readPrivateCanonicalArtifact(input);
      if (canonicalArtifact(existing).json === canonicalArtifact(input.value).json) return;
      throw new Error(`A different ${input.label} already exists and is immutable`);
    }
    throw error;
  }
  try {
    await handle.writeFile(canonicalArtifact(input.value).json, 'utf8');
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(path).catch(() => undefined);
    throw error;
  }
  await handle.close();
  await syncDirectory(dirname(path));
}

export async function writePrivateCanonicalState<T>(input: ValidatedArtifactWriteInput<T>): Promise<void> {
  input.assertValue(input.value);
  await writePrivateValueAtomically(input);
}

export async function writeImmutableCanonicalReceipt<T>(input: ValidatedArtifactWriteInput<T>): Promise<void> {
  input.assertValue(input.value);
  await writePrivateValueExclusively(input);
}

export async function withPrivateArtifactSessionLock<T>(
  input: ReadCanonicalArtifactInput,
  action: () => Promise<T>,
): Promise<T> {
  const path = await ensureSafeParent(input.root, input.relativePath);
  const lockPath = join(dirname(path), `.${basename(path)}.session.lock`);
  let lock;
  try {
    lock = await open(lockPath, 'wx', PRIVATE_FILE_MODE);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`${input.label} session is locked by another process`);
    }
    throw error;
  }
  try {
    return await action();
  } finally {
    await lock.close().catch(() => undefined);
    await unlink(lockPath).catch(() => undefined);
    await syncDirectory(dirname(path));
  }
}

export async function readReviewState(input: ArtifactLocation): Promise<CAL002ReviewState> {
  return readPrivateCanonicalArtifact({
    ...input,
    label: 'CAL-002 review state',
    assertValue: assertCAL002ReviewState,
  });
}

export async function readReviewReceipt(input: ArtifactLocation): Promise<CAL002ReviewReceipt> {
  return readPrivateCanonicalArtifact({
    ...input,
    label: 'CAL-002 review receipt',
    assertValue: assertCAL002ReviewReceipt,
  });
}

export async function writeReviewState(input: ArtifactLocation & { readonly state: CAL002ReviewState }): Promise<void> {
  return writePrivateCanonicalState({
    ...input,
    label: 'CAL-002 review state',
    value: input.state,
    assertValue: assertCAL002ReviewState,
  });
}

export async function writeImmutableReceipt(input: ArtifactLocation & { readonly receipt: CAL002ReviewReceipt }): Promise<void> {
  return writeImmutableCanonicalReceipt({
    ...input,
    label: 'CAL-002 review receipt',
    value: input.receipt,
    assertValue: assertCAL002ReviewReceipt,
  });
}

export async function readVerifiedSource(input: ArtifactLocation & { readonly expectedSha256: string }): Promise<string> {
  const path = await resolveArtifactPath(input, false);
  const bytes = await readFile(path);
  const observedSha256 = createHash('sha256').update(bytes).digest('hex');
  if (observedSha256 !== input.expectedSha256) throw new Error('CAL-002 source content SHA-256 does not match the selected observation');
  return bytes.toString('utf8');
}

async function regularFilesBeneath(root: string): Promise<readonly string[]> {
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const candidate = join(directory, entry.name);
      const metadata = await lstat(candidate);
      if (metadata.isSymbolicLink()) continue;
      if (metadata.isDirectory()) {
        if (!SOURCE_SCAN_SKIP_DIRECTORIES.has(entry.name)) await visit(candidate);
      } else if (metadata.isFile()) {
        files.push(candidate);
      }
    }
  };
  await visit(root);
  return files;
}

export async function readVerifiedSourcesByHash(input: {
  readonly root: string;
  readonly sources: readonly {
    readonly expectedSha256: string;
    readonly unitId?: string;
  }[];
}): Promise<ReadonlyMap<string, string>> {
  const root = await existingRoot(input.root);
  const expectedHashes = new Set(input.sources.map((source) => source.expectedSha256));
  const files = await regularFilesBeneath(root);
  const matches = new Map<string, { readonly relativePath: string; readonly bytes: Buffer }[]>();
  for (const path of files) {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink() || !metadata.isFile()) continue;
    const bytes = await readFile(path);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (!expectedHashes.has(sha256)) continue;
    const prior = matches.get(sha256) ?? [];
    prior.push({ relativePath: relative(root, path).split(sep).join('/'), bytes });
    matches.set(sha256, prior);
  }
  const resolved = new Map<string, string>();
  for (const source of input.sources) {
    const hashMatches = matches.get(source.expectedSha256) ?? [];
    if (hashMatches.length === 0) {
      throw new Error('CAL-002 source hash could not be resolved beneath --corpus-root; verify the corpus snapshot');
    }
    const unitId = source.unitId?.replaceAll('\\', '/');
    const hintMatches = unitId === undefined
      ? []
      : hashMatches.filter((candidate) => candidate.relativePath === unitId || candidate.relativePath.endsWith(`/${unitId}`));
    const candidates = hintMatches.length > 0 ? hintMatches : hashMatches;
    if (candidates.length !== 1) {
      throw new Error(`CAL-002 source hash is ambiguous beneath --corpus-root (${candidates.length} applicable regular-file matches)`);
    }
    resolved.set(source.expectedSha256, candidates[0]!.bytes.toString('utf8'));
  }
  return resolved;
}
