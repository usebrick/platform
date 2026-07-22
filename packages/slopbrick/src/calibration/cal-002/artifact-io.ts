import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import {
  lstat,
  link,
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  unlink,
} from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep, win32 } from 'node:path';
import { TextDecoder } from 'node:util';

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

export interface ArtifactDestination {
  readonly relativePath: string;
  readonly label: string;
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

export type ImmutableCanonicalWriteResult = 'created' | 'replayed';

export interface CanonicalArtifactWithBytes<T> {
  readonly value: T;
  readonly bytes: Buffer;
}

export type PrivateCanonicalArtifact<T> = CanonicalArtifactWithBytes<T>;

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

interface InspectedArtifactDestination extends ArtifactDestination {
  readonly prospectiveSegments: readonly string[];
  readonly identity?: string;
  readonly reserved: boolean;
}

function buildProspectiveAliasCollator(): Intl.Collator {
  const collator = new Intl.Collator('en-US', {
    localeMatcher: 'lookup',
    usage: 'search',
    sensitivity: 'base',
    ignorePunctuation: false,
    numeric: false,
  });
  const requiredAliases = [
    ['FILE.json', 'file.json'],
    ['proposal-\u00df.json', 'proposal-SS.json'],
    ['proposal-\u03a3.json', 'proposal-\u03c2.json'],
  ] as const;
  const requiredDistinctions = [
    ['a-b.json', 'ab.json'],
    ['file2.json', 'file02.json'],
  ] as const;
  const aliasesSatisfied = requiredAliases.every(([left, right]) => collator.compare(left, right) === 0);
  const distinctionsSatisfied = requiredDistinctions.every(([left, right]) => collator.compare(left, right) !== 0);
  if (!aliasesSatisfied || !distinctionsSatisfied) {
    throw new Error('CAL-002 artifact alias comparison is unavailable on this runtime');
  }
  return collator;
}

const PROSPECTIVE_ALIAS_COLLATOR = buildProspectiveAliasCollator();

function prospectivePathSegments(root: string, candidate: string): readonly string[] {
  return relative(root, candidate)
    .split(sep)
    .map((segment) => segment.normalize('NFKC'));
}

function prospectiveDestinationsAlias(
  left: InspectedArtifactDestination,
  right: InspectedArtifactDestination,
): boolean {
  if (left.prospectiveSegments.length !== right.prospectiveSegments.length) return false;
  return left.prospectiveSegments.every((segment, index) => (
    PROSPECTIVE_ALIAS_COLLATOR.compare(segment, right.prospectiveSegments[index]!) === 0
  ));
}

async function inspectArtifactDestination(
  root: string,
  destination: ArtifactDestination,
  reserved: boolean,
): Promise<InspectedArtifactDestination> {
  if (unsafeRelativePath(destination.relativePath)) {
    throw new Error(`CAL-002 ${destination.label} path must be a safe relative path`);
  }
  const candidate = resolve(root, destination.relativePath);
  assertContained(root, candidate);
  const segments = relative(root, candidate).split(sep);
  let current = root;
  let missing = false;
  let identity: string | undefined;
  for (const [index, segment] of segments.entries()) {
    current = join(current, segment);
    if (missing) continue;
    try {
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink()) {
        throw new Error(`CAL-002 ${destination.label} path contains a symbolic link: ${segment}`);
      }
      if (index < segments.length - 1 && !metadata.isDirectory()) {
        throw new Error(`CAL-002 ${destination.label} path ancestor is not a directory: ${segment}`);
      }
      if (index === segments.length - 1) {
        if (!metadata.isFile()) throw new Error(`CAL-002 ${destination.label} destination must be a regular file`);
        identity = `${metadata.dev}:${metadata.ino}`;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      missing = true;
    }
  }
  return {
    ...destination,
    prospectiveSegments: prospectivePathSegments(root, candidate),
    ...(identity === undefined ? {} : { identity }),
    reserved,
  };
}

function privateLockDestinations(destination: ArtifactDestination): readonly ArtifactDestination[] {
  const directory = dirname(destination.relativePath);
  const leaf = basename(destination.relativePath);
  return [
    { relativePath: join(directory, `.${leaf}.lock`), label: `${destination.label} writer lock` },
    { relativePath: join(directory, `.${leaf}.session.lock`), label: `${destination.label} session lock` },
  ];
}

export async function assertDistinctArtifactDestinations(input: {
  readonly root: string;
  readonly artifacts: readonly ArtifactDestination[];
  readonly reservePrivateLocksFor?: readonly ArtifactDestination[];
}): Promise<void> {
  const root = await existingRoot(input.root);
  const artifacts = await Promise.all(input.artifacts.map((destination) => (
    inspectArtifactDestination(root, destination, false)
  )));
  const reservations = await Promise.all((input.reservePrivateLocksFor ?? [])
    .flatMap(privateLockDestinations)
    .map((destination) => inspectArtifactDestination(root, destination, true)));
  const destinations = [...artifacts, ...reservations];
  for (let leftIndex = 0; leftIndex < destinations.length; leftIndex += 1) {
    const left = destinations[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < destinations.length; rightIndex += 1) {
      const right = destinations[rightIndex]!;
      if (left.reserved && right.reserved) continue;
      const sameProspectiveDestination = prospectiveDestinationsAlias(left, right);
      const sameExistingIdentity = left.identity !== undefined && left.identity === right.identity;
      if (!sameProspectiveDestination && !sameExistingIdentity) continue;
      const reserved = left.reserved || right.reserved ? ' reserved' : '';
      throw new Error(
        `CAL-002 artifact destinations must be distinct: ${left.label} aliases${reserved} ${right.label}`,
      );
    }
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

function decodeExactCanonicalArtifact(bytes: Buffer, label: string): unknown {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} is not valid UTF-8`);
  }
  if (!Buffer.from(text, 'utf8').equals(bytes)) {
    throw new Error(`${label} does not round-trip as exact UTF-8 bytes`);
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  let canonicalBytes: Buffer;
  try {
    canonicalBytes = Buffer.from(canonicalArtifact(value).json, 'utf8');
  } catch (error) {
    throw new Error(`${label} is not canonical JSON: ${(error as Error).message}`);
  }
  if (!bytes.equals(canonicalBytes)) throw new Error(`${label} is not exact canonical JSON`);
  return value;
}

export async function readCanonicalArtifact(input: ReadCanonicalArtifactInput): Promise<unknown> {
  const path = await resolveArtifactPath(input, false);
  return decodeExactCanonicalArtifact(await readFile(path), input.label);
}

export async function readCanonicalArtifactWithBytes<T>(
  input: ValidatedArtifactInput<T>,
): Promise<CanonicalArtifactWithBytes<T>> {
  const path = await resolveArtifactPath(input, false);
  const bytes = await readFile(path);
  const value = decodeExactCanonicalArtifact(bytes, input.label);
  input.assertValue(value);
  return { value, bytes };
}

export async function readPrivateCanonicalArtifactWithBytes<T>(
  input: ValidatedArtifactInput<T>,
): Promise<PrivateCanonicalArtifact<T>> {
  const path = await resolveArtifactPath(input, false);
  const metadata = await lstat(path);
  if ((metadata.mode & 0o777) !== PRIVATE_FILE_MODE) throw new Error(`${input.label} must have private mode 0600`);
  const bytes = await readFile(path);
  const value = decodeExactCanonicalArtifact(bytes, input.label);
  input.assertValue(value);
  return { value, bytes };
}

export async function readPrivateCanonicalArtifact<T>(input: ValidatedArtifactInput<T>): Promise<T> {
  return (await readPrivateCanonicalArtifactWithBytes(input)).value;
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

async function writePrivateValueExclusively<T>(
  input: ValidatedArtifactWriteInput<T>,
): Promise<ImmutableCanonicalWriteResult> {
  const path = await ensureSafeParent(input.root, input.relativePath);
  const directory = dirname(path);
  const expectedJson = canonicalArtifact(input.value).json;
  const temporary = join(directory, `.${basename(path)}.${process.pid}.${randomBytes(12).toString('hex')}.tmp`);
  let handle;
  try {
    handle = await open(temporary, 'wx', PRIVATE_FILE_MODE);
    await handle.writeFile(expectedJson, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    try {
      await link(temporary, path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const existing = await readPrivateCanonicalArtifact(input);
      if (canonicalArtifact(existing).json === expectedJson) return 'replayed';
      throw new Error(`A different ${input.label} already exists and is immutable`);
    }
    await syncDirectory(directory);
    return 'created';
  } finally {
    await handle?.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
    // Cleanup durability must not mask the explicit publication fsync or its visible final artifact.
    await syncDirectory(directory).catch(() => undefined);
  }
}

export async function writePrivateCanonicalState<T>(input: ValidatedArtifactWriteInput<T>): Promise<void> {
  input.assertValue(input.value);
  await writePrivateValueAtomically(input);
}

export async function writeImmutableCanonicalReceiptAlreadyLocked<T>(
  input: ValidatedArtifactWriteInput<T>,
): Promise<ImmutableCanonicalWriteResult> {
  input.assertValue(input.value);
  return writePrivateValueExclusively(input);
}

export async function writeImmutableCanonicalReceipt<T>(
  input: ValidatedArtifactWriteInput<T>,
): Promise<ImmutableCanonicalWriteResult> {
  return withPrivateArtifactSessionLock(input, () => writeImmutableCanonicalReceiptAlreadyLocked(input));
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
    // Lock cleanup cannot change the outcome of the action that completed while this lock was held.
    await syncDirectory(dirname(path)).catch(() => undefined);
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
  await writeImmutableCanonicalReceipt({
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
