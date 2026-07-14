import { createHash } from 'node:crypto';
import { lstat, realpath, readFile, stat } from 'node:fs/promises';
import { isCalibrationCheckoutMapV103, type ReleaseArchiveCheckoutBinding } from '@usebrick/core';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export interface SelectedResolution {
  readonly repositoryId: string;
  readonly commitSha: string;
  readonly materialization?: ReleaseArchiveCheckoutBinding;
  readonly normalizedPath: string;
  readonly contentSha256: string;
}

type ResolvedRecord = { readonly normalizedPath: string; readonly localPath: string; readonly bytes: Buffer };

function sameMaterialization(
  left: ReleaseArchiveCheckoutBinding | undefined,
  right: ReleaseArchiveCheckoutBinding | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.kind === right.kind
    && left.assetSha256 === right.assetSha256
    && left.extractionPolicy === right.extractionPolicy;
}

function validMaterialization(value: unknown): value is ReleaseArchiveCheckoutBinding | undefined {
  if (value === undefined) return true;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return Object.keys(candidate).length === 3
    && candidate.kind === 'release_archive'
    && typeof candidate.assetSha256 === 'string'
    && /^[a-f0-9]{64}$/.test(candidate.assetSha256)
    && candidate.extractionPolicy === 'safe-zip-v1';
}

function validNormalizedPath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.startsWith('/') || value.includes('\\')) return false;
  const parts = value.split('/');
  return parts.every((part) => part.length > 0 && part !== '.' && part !== '..');
}

function contained(parent: string, child: string): boolean {
  const childRelative = relative(parent, child);
  return childRelative !== ''
    && !isAbsolute(childRelative)
    && childRelative !== '..'
    && !childRelative.startsWith(`..${sep}`);
}

function fail(): never {
  throw new Error('Unable to resolve selected record');
}

/**
 * Resolve one selection against the exact local checkout binding frozen by
 * the selection record. The returned local path is an execution-only value;
 * callers must keep it out of portable artifacts.
 */
export async function resolveSelectedRecord(record: SelectedResolution, map: unknown): Promise<ResolvedRecord> {
  if (record === null || typeof record !== 'object' || Array.isArray(record) || !isCalibrationCheckoutMapV103(map) || !validNormalizedPath(record.normalizedPath) || !validMaterialization(record.materialization)) fail();

  const candidates = map.entries.filter((entry) =>
    entry.repositoryId === record.repositoryId
    && entry.commitSha === record.commitSha
    && sameMaterialization(entry.materialization, record.materialization));
  if (candidates.length !== 1) fail();
  const entry = candidates[0]!;

  try {
    // Checkout roots are published as canonical directories. Rejecting a
    // symlinked or non-canonical root prevents a map from redirecting the
    // resolver into a tree outside the frozen checkout location.
    const rootInput = resolve(entry.checkoutPath);
    const rootInputStats = await lstat(rootInput);
    if (rootInputStats.isSymbolicLink()) fail();
    const root = await realpath(rootInput);
    const rootStats = await stat(root);
    if (!rootStats.isDirectory()) fail();

    const requested = resolve(root, ...record.normalizedPath.split('/'));
    if (!contained(root, requested)) fail();
    const requestedStats = await lstat(requested);
    if (requestedStats.isSymbolicLink()) fail();
    const file = await realpath(requested);
    if (!contained(root, file)) fail();
    const fileStats = await stat(file);
    if (!fileStats.isFile()) fail();
    const bytes = await readFile(file);
    const contentSha256 = createHash('sha256').update(bytes).digest('hex');
    if (contentSha256 !== record.contentSha256) fail();
    return { normalizedPath: record.normalizedPath, localPath: file, bytes };
  } catch (error) {
    if (error instanceof Error && error.message === 'Unable to resolve selected record') throw error;
    fail();
  }
}
