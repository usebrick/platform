/**
 * @usebrick-dev/core — Repository Memory Platform loaders/savers.
 *
 * Read/write the three artifacts in the `.slopbrick/` directory:
 *   inventory.json     — pattern + component inventory
 *   constitution.json  — declared project constitution
 *   cache.json         — per-file mtime + hash (NOT part of public schema)
 *
 * The freshness check (`isInventoryFresh`, `invalidateFile`) uses the
 * cache file to detect when files mentioned by the inventory have
 * changed since the inventory was written. Callers (slopbrick's scan,
 * future usebrick.dev tools) can use this to skip a full re-scan when
 * nothing has changed.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  type InventoryFile,
  type ConstitutionFile,
  type FileMtimeEntry,
  type HealthFile,
  isInventoryFile,
  isConstitutionFile,
  isFileMtimeEntry,
  isHealthFile,
} from './structure-types';

export const INVENTORY_FILENAME = 'inventory.json';
export const CONSTITUTION_FILENAME = 'constitution.json';
export const CACHE_FILENAME = 'cache.json';
export const HEALTH_FILENAME = 'health.json';

// Re-export the path helpers — useful for tools that want to inspect
// the .slopbrick/ directory without going through the loaders.
export function inventoryPath(workspaceDir: string): string {
  return join(workspaceDir, '.slopbrick', INVENTORY_FILENAME);
}
export function constitutionPath(workspaceDir: string): string {
  return join(workspaceDir, '.slopbrick', CONSTITUTION_FILENAME);
}
export function cachePath(workspaceDir: string): string {
  return join(workspaceDir, '.slopbrick-cache.json');
}
export function healthPath(workspaceDir: string): string {
  return join(workspaceDir, '.slopbrick', HEALTH_FILENAME);
}

/** Ensure the `.slopbrick/` directory exists. */
function ensureSlopbrickDir(workspaceDir: string): void {
  mkdirSync(join(workspaceDir, '.slopbrick'), { recursive: true });
}

/**
 * Atomic JSON write: serialize, write to `<path>.tmp`, then rename.
 * On most filesystems `renameSync` is atomic, so a process crash mid-write
 * leaves either the previous version OR the new version — never a partial
 * mix. Stale `.tmp` files from a previous interrupted run are overwritten
 * by the same call.
 */
export function writeJsonAtomic(filePath: string, payload: unknown): void {
  ensureSlopbrickDir(dirname(filePath));
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf-8');
  renameSync(tmp, filePath);
}

/**
 * Load `.slopbrick/inventory.json`. Returns `null` when:
 *  - the file is missing,
 *  - JSON parsing fails,
 *  - the schema version doesn't match `STRUCTURE_SCHEMA_VERSION`.
 *
 * The version guard lets future format bumps migrate without crashing
 * older binaries on mismatched files.
 */
export function loadInventory(workspaceDir: string): InventoryFile | null {
  const path = inventoryPath(workspaceDir);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isInventoryFile(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Persist the inventory to `.slopbrick/inventory.json` atomically. */
export function saveInventory(workspaceDir: string, inventory: InventoryFile): void {
  writeJsonAtomic(inventoryPath(workspaceDir), inventory);
}

/** Load `.slopbrick/constitution.json`. Same null-on-mismatch contract
 *  as `loadInventory`. */
export function loadConstitution(workspaceDir: string): ConstitutionFile | null {
  const path = constitutionPath(workspaceDir);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isConstitutionFile(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Persist the constitution to `.slopbrick/constitution.json` atomically. */
export function saveConstitution(workspaceDir: string, constitution: ConstitutionFile): void {
  writeJsonAtomic(constitutionPath(workspaceDir), constitution);
}

/** Load `.slopbrick/health.json`. Returns `null` when the file is
 *  missing, malformed, or the schema version doesn't match. */
export function loadHealth(workspaceDir: string): HealthFile | null {
  const path = healthPath(workspaceDir);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isHealthFile(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Persist the health snapshot to `.slopbrick/health.json` atomically. */
export function saveHealth(workspaceDir: string, health: HealthFile): void {
  writeJsonAtomic(healthPath(workspaceDir), health);
}

/** Read the per-file mtime + hash cache. Returns `[]` when missing. */
export function readCache(workspaceDir: string): FileMtimeEntry[] {
  const path = cachePath(workspaceDir);
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isFileMtimeEntry);
  } catch {
    return [];
  }
}

/**
 * Write the cache file from an inventory + a hash function.
 *
 * The caller provides `computeHash` so this package stays free of
 * crypto imports beyond `node:crypto` re-exported by slopbrick.
 * In practice the hash function is `computeFileHash` from
 * slopbrick's incremental cache module.
 */
export function writeCacheFromInventory(
  workspaceDir: string,
  inventory: InventoryFile,
  computeHash: (file: string) => string,
): void {
  const files = inventoryFiles(inventory);
  const entries: FileMtimeEntry[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    if (seen.has(file)) continue;
    seen.add(file);
    try {
      const stat = statSync(file);
      entries.push({ file, mtimeMs: stat.mtimeMs, hash: computeHash(file) });
    } catch {
      // File gone or unreadable — drop the entry. `isInventoryFresh`
      // will then treat the inventory as stale, which is the safe
      // default (forces a rebuild rather than silently serving a
      // cache that may no longer reflect on-disk reality).
    }
  }
  writeJsonAtomic(cachePath(workspaceDir), entries);
}

/**
 * True iff every file mentioned by `inventory` still has the same
 * `mtimeMs` as recorded in `.slopbrick/cache.json` at `saveInventory`
 * time. A missing cache entry, a missing file, or a different mtime all
 * return false.
 */
export function isInventoryFresh(inventory: InventoryFile, workspaceDir: string): boolean {
  const cache = readCache(workspaceDir);
  const cacheByFile = new Map(cache.map((e) => [e.file, e] as const));
  const files = inventoryFiles(inventory);
  if (files.length === 0) return cache.length === 0;
  for (const file of files) {
    const cached = cacheByFile.get(file);
    if (!cached) return false;
    try {
      const current = statSync(file).mtimeMs;
      if (current !== cached.mtimeMs) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/** Remove a file's entry from the mtime cache so the next freshness
 *  check returns false (forcing a rebuild on next scan). */
export function invalidateFile(workspaceDir: string, file: string): void {
  const cache = readCache(workspaceDir);
  const next = cache.filter((e) => e.file !== file);
  writeJsonAtomic(cachePath(workspaceDir), next);
}

/**
 * File list used for the freshness check. Limited to `ComponentFingerprint.files`
 * because `StructurePattern` deliberately keeps only `fileCount` — the file
 * list is reconstructed from per-component occurrences. Projects whose
 * scan finds patterns but zero components (e.g. import-only files) end
 * up with an empty freshness baseline; that's an acceptable trade-off
 * given the schema constraint.
 */
function inventoryFiles(inventory: InventoryFile): string[] {
  const set = new Set<string>();
  for (const c of inventory.components) {
    for (const f of c.files) set.add(f);
  }
  return [...set];
}
