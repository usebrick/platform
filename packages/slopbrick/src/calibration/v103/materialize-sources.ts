import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import {
  link,
  lstat,
  open,
  realpath,
  unlink,
  type FileHandle,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  isCalibrationCheckoutMapV103,
  isCalibrationCorpusManifestV103,
  type CalibrationCorpusRepository,
  type SlopBrickV103CalibrationCheckoutMapLocalOnly,
  type SlopbrickCalibrationCorpusManifestV103,
} from '@usebrick/core';

import {
  acquireArtifact,
  ArtifactAcquisitionError,
} from './artifact-download';
import {
  extractReleaseArchive,
  SafeZipError,
} from './safe-zip';

const IDENTIFIER = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const MAX_HASH_BYTES = 1024 * 1024 * 1024;
const HASH_CHUNK_BYTES = 64 * 1024;
const TEMP_ATTEMPTS = 8;
const SAFE_DIRECTORY_MODE = 0o700;
const SAFE_FILE_MODE = 0o600;

export type MaterializeSourcesErrorCode =
  | 'ERR_MATERIALIZE_ARGUMENT'
  | 'ERR_MATERIALIZE_MANIFEST'
  | 'ERR_MATERIALIZE_BASE_MAP'
  | 'ERR_MATERIALIZE_SOURCE'
  | 'ERR_MATERIALIZE_FILES'
  | 'ERR_MATERIALIZE_OUTPUT';

const ERROR_MESSAGES: Readonly<Record<MaterializeSourcesErrorCode, string>> = {
  ERR_MATERIALIZE_ARGUMENT: 'Calibration materialization failed: argument is invalid',
  ERR_MATERIALIZE_MANIFEST: 'Calibration materialization failed: manifest is invalid',
  ERR_MATERIALIZE_BASE_MAP: 'Calibration materialization failed: base checkout map is invalid',
  ERR_MATERIALIZE_SOURCE: 'Calibration materialization failed: release source could not be acquired',
  ERR_MATERIALIZE_FILES: 'Calibration materialization failed: release files are not the declared bytes',
  ERR_MATERIALIZE_OUTPUT: 'Calibration materialization failed: checkout map could not be created',
};

/** A stable, path-free error for the manifest-to-checkout boundary. */
export class MaterializeSourcesError extends Error {
  readonly code: MaterializeSourcesErrorCode;

  constructor(code: MaterializeSourcesErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'MaterializeSourcesError';
    this.code = code;
    this.stack = `${this.name} [${this.code}]: ${this.message}`;
  }

  toJSON(): { readonly name: string; readonly code: MaterializeSourcesErrorCode; readonly message: string } {
    return { name: this.name, code: this.code, message: this.message };
  }
}

export interface MaterializeSourcesOptions {
  readonly manifest: unknown;
  readonly runId: string;
  readonly cacheDirectory: string;
  readonly outputPath: string;
  readonly baseCheckoutMap?: unknown;
  readonly network?: 'deny' | 'allow';
  readonly allowedHosts?: readonly string[];
}

export interface MaterializeSourcesResult {
  readonly ok: true;
  readonly stage: 'materialize';
  readonly runId: string;
  readonly repositories: number;
  readonly releaseArchives: number;
  readonly files: number;
}

/** Injectable boundaries keep orchestration tests deterministic without
 * replacing the archive downloader or safe ZIP implementation in production. */
export interface MaterializeSourcesDependencies {
  readonly acquireArtifact?: typeof acquireArtifact;
  readonly extractReleaseArchive?: typeof extractReleaseArchive;
  readonly beforeFinalVerification?: () => void | Promise<void>;
}

interface VerifiedReleaseRepository {
  readonly repository: CalibrationCorpusRepository;
  readonly checkoutPath: string;
  readonly files: readonly SlopbrickCalibrationCorpusManifestV103['files'][number][];
}

function fail(code: MaterializeSourcesErrorCode): never {
  throw new MaterializeSourcesError(code);
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  try {
    return 'code' in error && typeof error.code === 'string' ? error.code : undefined;
  } catch {
    return undefined;
  }
}

function isContained(parent: string, child: string, allowSame = false): boolean {
  const childRelative = relative(parent, child);
  const escapesParent = childRelative === '..' || childRelative.startsWith(`..${sep}`);
  return (allowSame && childRelative === '')
    || (childRelative !== '' && !escapesParent && !isAbsolute(childRelative));
}

function isOwnedByCurrentUser(metadata: { readonly uid: bigint }): boolean {
  if (typeof process.geteuid !== 'function') return true;
  return metadata.uid === BigInt(process.geteuid());
}

function isExactMode(metadata: { readonly mode: bigint }, mode: number): boolean {
  return Number(metadata.mode & 0o7777n) === mode;
}

function sameIdentity(left: { readonly dev: bigint; readonly ino: bigint }, right: { readonly dev: bigint; readonly ino: bigint }): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function validateAbsoluteDirectory(path: string): void {
  if (!isAbsolute(path) || resolve(path) !== path) fail('ERR_MATERIALIZE_ARGUMENT');
}

async function ensureOutputAbsent(path: string): Promise<void> {
  try {
    await lstat(path);
    fail('ERR_MATERIALIZE_OUTPUT');
  } catch (error) {
    if (error instanceof MaterializeSourcesError) throw error;
    if (errorCode(error) !== 'ENOENT') fail('ERR_MATERIALIZE_OUTPUT');
  }
}

function asReleaseRepositories(
  manifest: SlopbrickCalibrationCorpusManifestV103,
): readonly CalibrationCorpusRepository[] {
  return manifest.repositories.filter((repository) => repository.materialization !== undefined);
}

function validateBaseCheckoutMap(
  manifest: SlopbrickCalibrationCorpusManifestV103,
  baseCheckoutMap: unknown,
): readonly SlopBrickV103CalibrationCheckoutMapLocalOnly['entries'][number][] {
  if (!isCalibrationCheckoutMapV103(baseCheckoutMap)) fail('ERR_MATERIALIZE_BASE_MAP');
  const map = baseCheckoutMap as SlopBrickV103CalibrationCheckoutMapLocalOnly;
  const gitRepositories = manifest.repositories.filter((repository) => repository.materialization === undefined);
  const expectedIds = new Set(gitRepositories.map((repository) => repository.repositoryId));
  const seenIds = new Set<string>();
  for (const entry of map.entries) {
    // This input is deliberately a Git-only base map. A release binding in it
    // would be an unused/extra source and could collide with generated output.
    if (entry.materialization !== undefined || seenIds.has(entry.repositoryId) || !expectedIds.has(entry.repositoryId)) {
      fail('ERR_MATERIALIZE_BASE_MAP');
    }
    const repository = gitRepositories.find((candidate) => candidate.repositoryId === entry.repositoryId);
    if (!repository || repository.commitSha !== entry.commitSha) fail('ERR_MATERIALIZE_BASE_MAP');
    seenIds.add(entry.repositoryId);
  }
  if (seenIds.size !== expectedIds.size) fail('ERR_MATERIALIZE_BASE_MAP');
  return map.entries;
}

function validateBaseInput(
  manifest: SlopbrickCalibrationCorpusManifestV103,
  baseCheckoutMap: unknown,
): readonly SlopBrickV103CalibrationCheckoutMapLocalOnly['entries'][number][] {
  const hasGitRepositories = manifest.repositories.some((repository) => repository.materialization === undefined);
  if (baseCheckoutMap === undefined) {
    if (hasGitRepositories) fail('ERR_MATERIALIZE_BASE_MAP');
    return [];
  }
  return validateBaseCheckoutMap(manifest, baseCheckoutMap);
}

function validateOptions(options: MaterializeSourcesOptions): {
  readonly manifest: SlopbrickCalibrationCorpusManifestV103;
  readonly network: 'deny' | 'allow';
  readonly allowedHosts: readonly string[];
  readonly cacheDirectory: string;
  readonly outputPath: string;
} {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) fail('ERR_MATERIALIZE_ARGUMENT');
  if (!isCalibrationCorpusManifestV103(options.manifest)) fail('ERR_MATERIALIZE_MANIFEST');
  if (typeof options.runId !== 'string' || !IDENTIFIER.test(options.runId)) fail('ERR_MATERIALIZE_ARGUMENT');
  if (typeof options.cacheDirectory !== 'string' || typeof options.outputPath !== 'string' || options.outputPath.length === 0) {
    fail('ERR_MATERIALIZE_ARGUMENT');
  }
  validateAbsoluteDirectory(options.cacheDirectory);
  const network = options.network ?? 'deny';
  if (network !== 'deny' && network !== 'allow') fail('ERR_MATERIALIZE_ARGUMENT');
  const allowedHosts = options.allowedHosts ?? [];
  if (!Array.isArray(allowedHosts) || allowedHosts.some((host) => typeof host !== 'string')) fail('ERR_MATERIALIZE_ARGUMENT');
  if (network === 'allow' && allowedHosts.length === 0) fail('ERR_MATERIALIZE_ARGUMENT');
  return {
    manifest: options.manifest,
    network,
    allowedHosts,
    cacheDirectory: options.cacheDirectory,
    outputPath: resolve(options.outputPath),
  };
}

function groupReleaseRepositories(
  manifest: SlopbrickCalibrationCorpusManifestV103,
): readonly {
  readonly key: string;
  readonly materialization: NonNullable<CalibrationCorpusRepository['materialization']>;
  readonly repositories: readonly CalibrationCorpusRepository[];
  readonly files: readonly SlopbrickCalibrationCorpusManifestV103['files'][number][];
}[] {
  const filesByRepository = new Map<string, SlopbrickCalibrationCorpusManifestV103['files'][number][]>();
  for (const file of manifest.files) {
    const files = filesByRepository.get(file.repositoryId) ?? [];
    files.push(file);
    filesByRepository.set(file.repositoryId, files);
  }
  const groups = new Map<string, {
    readonly materialization: NonNullable<CalibrationCorpusRepository['materialization']>;
    readonly repositories: CalibrationCorpusRepository[];
    readonly files: SlopbrickCalibrationCorpusManifestV103['files'][number][];
  }>();
  for (const repository of asReleaseRepositories(manifest)) {
    const materialization = repository.materialization!;
    const key = `${materialization.assetSha256}:${materialization.assetBytes}`;
    const prior = groups.get(key);
    if (prior !== undefined) {
      // The archive digest and byte count are the acquisition identity. A
      // differing URL is merely a locator; extraction remains one operation.
      prior.repositories.push(repository);
      prior.files.push(...(filesByRepository.get(repository.repositoryId) ?? []));
      continue;
    }
    groups.set(key, {
      materialization,
      repositories: [repository],
      files: [...(filesByRepository.get(repository.repositoryId) ?? [])],
    });
  }
  return [...groups.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

async function assertPrivateTreeRoot(treePathInput: string, rootPrefix: string): Promise<string> {
  const treePath = resolve(treePathInput);
  const canonicalTreePath = await realpath(treePath).catch(() => undefined);
  if (canonicalTreePath === undefined || canonicalTreePath !== treePath) fail('ERR_MATERIALIZE_FILES');
  const checkoutPath = resolve(treePath, ...rootPrefix.split('/'));
  if (!isContained(treePath, checkoutPath) || dirname(checkoutPath) === checkoutPath) fail('ERR_MATERIALIZE_FILES');
  const rootMetadata = await lstat(checkoutPath, { bigint: true }).catch(() => undefined);
  if (
    rootMetadata === undefined
    || !rootMetadata.isDirectory()
    || !isOwnedByCurrentUser(rootMetadata)
    || !isExactMode(rootMetadata, SAFE_DIRECTORY_MODE)
  ) fail('ERR_MATERIALIZE_FILES');
  const canonicalRoot = await realpath(checkoutPath).catch(() => undefined);
  if (canonicalRoot !== checkoutPath || !isContained(treePath, canonicalRoot)) fail('ERR_MATERIALIZE_FILES');
  return checkoutPath;
}

async function assertPathComponentsAreDirectories(root: string, path: string): Promise<void> {
  const pathRelative = relative(root, path);
  if (!isContained(root, path) || pathRelative === '') fail('ERR_MATERIALIZE_FILES');
  const segments = pathRelative.split('/');
  let current = root;
  for (let index = 0; index < segments.length - 1; index += 1) {
    current = join(current, segments[index]!);
    const metadata = await lstat(current, { bigint: true }).catch(() => undefined);
    if (
      metadata === undefined
      || !metadata.isDirectory()
      || !isOwnedByCurrentUser(metadata)
      || !isExactMode(metadata, SAFE_DIRECTORY_MODE)
    ) fail('ERR_MATERIALIZE_FILES');
  }
}

async function hashStableRegularFile(path: string, expectedSha256: string, root: string): Promise<void> {
  let closeError = false;
  let handle: FileHandle | undefined;
  try {
    await assertPathComponentsAreDirectories(root, path);
    const pathBefore = await lstat(path, { bigint: true }).catch(() => undefined);
    if (
      pathBefore === undefined
      || !pathBefore.isFile()
      || !isOwnedByCurrentUser(pathBefore)
      || pathBefore.nlink !== 1n
      || !isExactMode(pathBefore, SAFE_FILE_MODE)
      || pathBefore.size < 0n
      || pathBefore.size > BigInt(MAX_HASH_BYTES)
    ) fail('ERR_MATERIALIZE_FILES');

    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch(() => undefined);
    if (handle === undefined) fail('ERR_MATERIALIZE_FILES');
    const opened = await handle.stat({ bigint: true });
    if (
      !opened.isFile()
      || !isOwnedByCurrentUser(opened)
      || opened.nlink !== 1n
      || !isExactMode(opened, SAFE_FILE_MODE)
      || !sameIdentity(opened, pathBefore)
      || opened.size !== pathBefore.size
    ) fail('ERR_MATERIALIZE_FILES');
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(HASH_CHUNK_BYTES);
    let position = 0n;
    while (position < opened.size) {
      const requested = Number((opened.size - position) > BigInt(buffer.byteLength) ? BigInt(buffer.byteLength) : opened.size - position);
      const read = await handle.read(buffer, 0, requested, Number(position));
      if (!Number.isInteger(read.bytesRead) || read.bytesRead <= 0 || read.bytesRead > requested) fail('ERR_MATERIALIZE_FILES');
      hash.update(buffer.subarray(0, read.bytesRead));
      position += BigInt(read.bytesRead);
    }
    const closed = await handle.stat({ bigint: true });
    const pathAfter = await lstat(path, { bigint: true });
    if (
      !closed.isFile()
      || !isOwnedByCurrentUser(closed)
      || closed.nlink !== 1n
      || !isExactMode(closed, SAFE_FILE_MODE)
      || !sameIdentity(closed, opened)
      || closed.size !== opened.size
      || !pathAfter.isFile()
      || !sameIdentity(pathAfter, opened)
      || hash.digest('hex') !== expectedSha256
    ) fail('ERR_MATERIALIZE_FILES');
    const canonicalRoot = await realpath(root);
    const canonicalFile = await realpath(path);
    if (canonicalFile !== path || !isContained(canonicalRoot, canonicalFile)) fail('ERR_MATERIALIZE_FILES');
  } catch (error) {
    if (error instanceof MaterializeSourcesError) throw error;
    fail('ERR_MATERIALIZE_FILES');
  } finally {
    if (handle !== undefined) {
      try {
        await handle.close();
      } catch {
        closeError = true;
      }
    }
  }
  if (closeError) fail('ERR_MATERIALIZE_FILES');
}

async function verifyReleaseFiles(
  checkoutPath: string,
  files: readonly SlopbrickCalibrationCorpusManifestV103['files'][number][],
): Promise<void> {
  const sorted = [...files].sort((left, right) => left.normalizedPath.localeCompare(right.normalizedPath));
  for (const file of sorted) {
    if (file.normalizedPath.startsWith('/') || file.normalizedPath.split('/').some((segment) => segment === '..' || segment === '.')) {
      fail('ERR_MATERIALIZE_FILES');
    }
    const absolute = resolve(checkoutPath, ...file.normalizedPath.split('/'));
    if (!isContained(checkoutPath, absolute)) fail('ERR_MATERIALIZE_FILES');
    await hashStableRegularFile(absolute, file.contentSha256, checkoutPath);
  }
}

async function writeExclusiveAtomic(path: string, contents: string): Promise<void> {
  await ensureOutputAbsent(path);
  const parent = dirname(path);
  for (let attempt = 0; attempt < TEMP_ATTEMPTS; attempt += 1) {
    const temporary = join(parent, `.${path.split('/').pop()!}.${randomBytes(16).toString('hex')}.tmp`);
    let handle: FileHandle | undefined;
    try {
      handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(contents, 'utf8');
      await handle.sync();
      await handle.close();
      handle = undefined;
      try {
        await link(temporary, path);
      } catch (error) {
        if (errorCode(error) === 'EEXIST') fail('ERR_MATERIALIZE_OUTPUT');
        fail('ERR_MATERIALIZE_OUTPUT');
      }
      await unlink(temporary).catch(() => undefined);
      return;
    } catch (error) {
      if (handle !== undefined) await handle.close().catch(() => undefined);
      await unlink(temporary).catch(() => undefined);
      if (error instanceof MaterializeSourcesError) throw error;
      if (errorCode(error) === 'EEXIST') continue;
      fail('ERR_MATERIALIZE_OUTPUT');
    }
  }
  fail('ERR_MATERIALIZE_OUTPUT');
}

function lowerHostFromUrl(assetUrl: string): string {
  try {
    return new URL(assetUrl).hostname;
  } catch {
    fail('ERR_MATERIALIZE_SOURCE');
  }
}

/**
 * Validate a corpus manifest, acquire/extract each distinct release archive,
 * prove every declared release file against its contained root, and publish a
 * local-only checkout map without replacing an existing output.
 */
export async function materializeSources(
  options: MaterializeSourcesOptions,
  dependencies: MaterializeSourcesDependencies = {},
): Promise<MaterializeSourcesResult> {
  const validated = validateOptions(options);
  const manifest = validated.manifest;
  const baseEntries = validateBaseInput(manifest, options.baseCheckoutMap);
  await ensureOutputAbsent(validated.outputPath);

  const releaseGroups = groupReleaseRepositories(manifest);
  if (releaseGroups.length === 0) {
    const checkoutMap = {
      version: 'v10.3' as const,
      runId: options.runId,
      entries: [...baseEntries].sort((left, right) => left.repositoryId.localeCompare(right.repositoryId)),
    };
    if (!isCalibrationCheckoutMapV103(checkoutMap)) fail('ERR_MATERIALIZE_OUTPUT');
    await writeExclusiveAtomic(validated.outputPath, `${JSON.stringify(checkoutMap, null, 2)}\n`);
    return {
      ok: true,
      stage: 'materialize',
      runId: options.runId,
      repositories: checkoutMap.entries.length,
      releaseArchives: 0,
      files: manifest.files.length,
    };
  }

  const canonicalCache = await realpath(validated.cacheDirectory).catch(() => undefined);
  if (canonicalCache === undefined) fail('ERR_MATERIALIZE_SOURCE');

  const verifiedReleases: VerifiedReleaseRepository[] = [];
  for (const group of releaseGroups) {
    const materialization = group.materialization;
    try {
      const hosts = validated.network === 'allow'
        ? validated.allowedHosts
        : [lowerHostFromUrl(materialization.assetUrl)];
      const acquire = dependencies.acquireArtifact ?? acquireArtifact;
      const extract = dependencies.extractReleaseArchive ?? extractReleaseArchive;
      const archivePath = await acquire({
        assetUrl: materialization.assetUrl,
        expectedSha256: materialization.assetSha256,
        expectedBytes: materialization.assetBytes,
        cacheDirectory: canonicalCache,
        network: validated.network,
        allowedHosts: hosts,
      });
      const extracted = await extract({
        archivePath,
        expectedAssetSha256: materialization.assetSha256,
        expectedAssetBytes: materialization.assetBytes,
        cacheDirectory: canonicalCache,
        extractionPolicy: materialization.extractionPolicy,
      });
      for (const repository of group.repositories) {
        const checkoutPath = await assertPrivateTreeRoot(extracted.treePath, repository.materialization!.rootPrefix);
        const files = manifest.files.filter((file) => file.repositoryId === repository.repositoryId);
        await verifyReleaseFiles(checkoutPath, files);
        verifiedReleases.push({ repository, checkoutPath, files });
      }
    } catch (error) {
      if (error instanceof MaterializeSourcesError) throw error;
      if (error instanceof ArtifactAcquisitionError || error instanceof SafeZipError) throw error;
      fail('ERR_MATERIALIZE_SOURCE');
    }
  }

  // Repeat the file/identity check immediately before constructing the map so
  // a replacement or symlink introduced after extraction cannot be published.
  try {
    await dependencies.beforeFinalVerification?.();
    for (const release of verifiedReleases) await verifyReleaseFiles(release.checkoutPath, release.files);
  } catch (error) {
    if (error instanceof MaterializeSourcesError) throw error;
    fail('ERR_MATERIALIZE_FILES');
  }

  const entries: SlopBrickV103CalibrationCheckoutMapLocalOnly['entries'][number][] = [
    ...baseEntries,
    ...verifiedReleases.map(({ repository, checkoutPath }) => ({
      repositoryId: repository.repositoryId,
      commitSha: repository.commitSha,
      checkoutPath,
      materialization: {
        kind: 'release_archive' as const,
        assetSha256: repository.materialization!.assetSha256,
        extractionPolicy: repository.materialization!.extractionPolicy,
      },
    })),
  ].sort((left, right) => left.repositoryId.localeCompare(right.repositoryId));
  const checkoutMap = {
    version: 'v10.3' as const,
    runId: options.runId,
    entries,
  };
  if (!isCalibrationCheckoutMapV103(checkoutMap)) fail('ERR_MATERIALIZE_OUTPUT');
  await writeExclusiveAtomic(validated.outputPath, `${JSON.stringify(checkoutMap, null, 2)}\n`);
  return {
    ok: true,
    stage: 'materialize',
    runId: options.runId,
    repositories: entries.length,
    releaseArchives: releaseGroups.length,
    files: manifest.files.length,
  };
}
