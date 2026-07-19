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

interface ArtifactLocation {
  readonly root: string;
  readonly relativePath: string;
}

interface ReadCanonicalArtifactInput extends ArtifactLocation {
  readonly label: string;
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

export async function readReviewState(input: ArtifactLocation): Promise<CAL002ReviewState> {
  const path = await resolveArtifactPath(input, false);
  const metadata = await lstat(path);
  if ((metadata.mode & 0o777) !== PRIVATE_FILE_MODE) throw new Error('CAL-002 review state must have private mode 0600');
  const value = await readCanonicalArtifact({ ...input, label: 'CAL-002 review state' });
  assertCAL002ReviewState(value);
  return value;
}

export async function readReviewReceipt(input: ArtifactLocation): Promise<CAL002ReviewReceipt> {
  const path = await resolveArtifactPath(input, false);
  const metadata = await lstat(path);
  if ((metadata.mode & 0o777) !== PRIVATE_FILE_MODE) throw new Error('CAL-002 review receipt must have private mode 0600');
  const value = await readCanonicalArtifact({ ...input, label: 'CAL-002 review receipt' });
  assertCAL002ReviewReceipt(value);
  return value;
}

export async function writeReviewState(input: ArtifactLocation & { readonly state: CAL002ReviewState }): Promise<void> {
  assertCAL002ReviewState(input.state);
  const path = await ensureSafeParent(input.root, input.relativePath);
  const lockPath = join(dirname(path), `.${basename(path)}.lock`);
  let lock;
  try {
    lock = await open(lockPath, 'wx', PRIVATE_FILE_MODE);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error('CAL-002 review state is locked by another writer');
    }
    throw error;
  }
  try {
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
  } finally {
    await lock.close().catch(() => undefined);
    await unlink(lockPath).catch(() => undefined);
    await syncDirectory(dirname(path));
  }
}

export async function writeImmutableReceipt(input: ArtifactLocation & { readonly receipt: CAL002ReviewReceipt }): Promise<void> {
  assertCAL002ReviewReceipt(input.receipt);
  const path = await ensureSafeParent(input.root, input.relativePath);
  let handle;
  try {
    handle = await open(path, 'wx', PRIVATE_FILE_MODE);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      const existing = await readReviewReceipt(input);
      if (canonicalArtifact(existing).json === canonicalArtifact(input.receipt).json) return;
      throw new Error('A different CAL-002 review receipt already exists and is immutable');
    }
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
  const sourceHints = input.sources.map((source) => source.unitId?.replaceAll('\\', '/'));
  const expectedHashes = new Set(input.sources.map((source) => source.expectedSha256));
  const files = [...await regularFilesBeneath(root)].sort((left, right) => {
    const leftRelative = relative(root, left).split(sep).join('/');
    const rightRelative = relative(root, right).split(sep).join('/');
    const leftHint = sourceHints.some((hint) => hint !== undefined && (leftRelative === hint || leftRelative.endsWith(`/${hint}`))) ? 0 : 1;
    const rightHint = sourceHints.some((hint) => hint !== undefined && (rightRelative === hint || rightRelative.endsWith(`/${hint}`))) ? 0 : 1;
    return leftHint - rightHint || (leftRelative < rightRelative ? -1 : leftRelative > rightRelative ? 1 : 0);
  });
  const matches = new Map<string, Buffer[]>();
  for (const path of files) {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink() || !metadata.isFile()) continue;
    const bytes = await readFile(path);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (!expectedHashes.has(sha256)) continue;
    const prior = matches.get(sha256) ?? [];
    prior.push(bytes);
    matches.set(sha256, prior);
  }
  const resolved = new Map<string, string>();
  for (const expectedSha256 of expectedHashes) {
    const hashMatches = matches.get(expectedSha256) ?? [];
    if (hashMatches.length === 0) {
      throw new Error('CAL-002 source hash could not be resolved beneath --corpus-root; verify the corpus snapshot');
    }
    if (hashMatches.length !== 1) {
      throw new Error(`CAL-002 source hash is ambiguous beneath --corpus-root (${hashMatches.length} regular-file matches)`);
    }
    resolved.set(expectedSha256, hashMatches[0]!.toString('utf8'));
  }
  return resolved;
}
