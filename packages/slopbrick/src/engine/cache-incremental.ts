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

export function loadCache(cachePath: string): ScanCache | undefined {
  const abs = isAbsolute(cachePath) ? cachePath : resolve(process.cwd(), cachePath);
  if (!existsSync(abs)) return undefined;
  try {
    const raw = readFileSync(abs, 'utf-8');
    const parsed = JSON.parse(raw) as ScanCache;
    if (parsed.version !== VERSION) return undefined; // version mismatch → invalid
    return parsed;
  } catch {
    return undefined;
  }
}

export function saveCache(cachePath: string, cache: ScanCache): void {
  const abs = isAbsolute(cachePath) ? cachePath : resolve(process.cwd(), cachePath);
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
  // Atomic write: write to .tmp, then rename.
  writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf-8');
  renameSync(tmp, abs);
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
