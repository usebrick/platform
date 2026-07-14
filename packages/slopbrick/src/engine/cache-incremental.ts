//
// Persists per-file content hashes so subsequent scans can skip
// unchanged files. Cache is plain JSON; not security-sensitive.
//
// The cache is invalidated on VERSION mismatch. Bumping VERSION
// forces a full rescan, which is the correct behavior for schema
// changes that affect issue counts (e.g. new rule categories).

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { VERSION } from '../types';

export interface CachedFile {
  /** md5 of file content at scan time. */
  hash: string;
  /** Number of issues found last scan. */
  issueCount: number;
  /** ISO timestamp of last successful scan. */
  lastScannedAt: string;
}

export interface ScanCache {
  /** Slop-audit version that wrote this cache. Invalidates on mismatch. */
  version: string;
  /** ISO timestamp of cache write. */
  generatedAt: string;
  files: Record<string, CachedFile>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCachedFile(value: unknown): value is CachedFile {
  if (!isRecord(value)) return false;
  return typeof value.hash === 'string' && /^[a-f0-9]{32}$/u.test(value.hash)
    && Number.isInteger(value.issueCount) && (value.issueCount as number) >= 0
    && typeof value.lastScannedAt === 'string' && value.lastScannedAt.length > 0;
}

function isScanCache(value: unknown): value is ScanCache {
  if (!isRecord(value)) return false;
  if (typeof value.version !== 'string' || value.version.length === 0) return false;
  if (typeof value.generatedAt !== 'string' || value.generatedAt.length === 0) return false;
  if (!isRecord(value.files)) return false;
  return Object.values(value.files).every(isCachedFile);
}

/** Resolve a relative cache path against the scan workspace, never the caller's cwd. */
export function resolveCachePath(cachePath: string, baseDir = process.cwd()): string {
  return isAbsolute(cachePath) ? cachePath : resolve(baseDir, cachePath);
}

export function loadCache(cachePath: string, baseDir = process.cwd()): ScanCache | undefined {
  const abs = resolveCachePath(cachePath, baseDir);
  if (!existsSync(abs)) return undefined;
  try {
    const raw = readFileSync(abs, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (!isScanCache(parsed) || parsed.version !== VERSION) return undefined; // mismatch/corruption → rescan
    return parsed;
  } catch {
    return undefined;
  }
}

export function saveCache(cachePath: string, cache: ScanCache, baseDir = process.cwd()): void {
  const abs = resolveCachePath(cachePath, baseDir);
  mkdirSync(dirname(abs), { recursive: true });
  // saveCache call before writing our own. The .tmp is purely
  // diagnostic — loadCache ignores it — but lingering files are noise.
  const tmp = abs + '.tmp';
  if (existsSync(tmp)) {
    try {
      unlinkSync(tmp);
    } catch {
      // Best-effort: if we can't unlink, the next writeFileSync below
      // will overwrite it anyway.
    }
  }
  // Atomic write: write to .tmp, then rename. Remove a failed temporary
  // artifact before rethrowing so callers can report the write failure without
  // leaving a misleading cache fragment behind.
  writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf-8');
  try {
    renameSync(tmp, abs);
  } catch (error) {
    try {
      unlinkSync(tmp);
    } catch {
      // Preserve the original write/rename error.
    }
    throw error;
  }
}

export function computeFileHash(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash('md5').update(content).digest('hex');
}

/**
 * Partition a file list into (toScan, unchanged) given a cache.
 * Files with matching content hashes go to `unchanged`. Files not
 * in the cache, or with stale hashes, go to `toScan`. Files in the
 * cache but not in `files` are dropped (caller can preserve them
 * separately if needed).
 */
export function partitionByCache(
  files: string[],
  cache: ScanCache | undefined,
): { toScan: string[]; unchanged: string[] } {
  const toScan: string[] = [];
  const unchanged: string[] = [];
  if (!cache) {
    return { toScan: [...files], unchanged: [] };
  }
  for (const file of files) {
    const cached = cache.files[file];
    if (!cached) {
      toScan.push(file);
      continue;
    }
    try {
      const currentHash = computeFileHash(file);
      if (currentHash === cached.hash) {
        unchanged.push(file);
      } else {
        toScan.push(file);
      }
    } catch {
      // unreadable file → re-scan to surface the error
      toScan.push(file);
    }
  }
  return { toScan, unchanged };
}

export function emptyCache(): ScanCache {
  return {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    files: {},
  };
}
