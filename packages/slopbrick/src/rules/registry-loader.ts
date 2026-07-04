import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import bundledSnapshot from '../data/shadcn-registry.json';

export interface RegistryComponent {
  forbiddenProps?: string[];
}

export interface RegistrySnapshot {
  version: string;
  updatedAt: string;
  components: Record<string, RegistryComponent>;
}

// v0.39.0: the upstream URL 404s (shadcn moved their registry API).
// Kept exported for backward compatibility but no longer fetched
// at runtime — refreshRegistrySnapshot now uses the bundled snapshot.
export const REGISTRY_URL = 'https://ui.shadcn.com/registry.json';
export const BUNDLED_REGISTRY_VERSION = bundledSnapshot.version;

function cachePath(cwd: string): string {
  return join(cwd, '.slopbrick', 'cache', 'registry-snapshot.json');
}

function ensureCacheDir(cwd: string): void {
  const dir = dirname(cachePath(cwd));
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function isValidSnapshot(value: unknown): value is RegistrySnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Record<string, unknown>;
  if (typeof snapshot.version !== 'string') return false;
  if (typeof snapshot.components !== 'object' || snapshot.components === null) return false;
  return true;
}

export function loadRegistrySnapshot(cwd: string): RegistrySnapshot {
  const cached = cachePath(cwd);
  if (existsSync(cached)) {
    try {
      const parsed = JSON.parse(readFileSync(cached, 'utf8')) as unknown;
      if (isValidSnapshot(parsed)) {
        return parsed;
      }
    } catch {
      // Ignore corrupted cache and fall back to bundled snapshot.
    }
  }
  return bundledSnapshot as RegistrySnapshot;
}

export function isRegistryFresh(cwd: string): boolean {
  const cached = cachePath(cwd);
  if (!existsSync(cached)) return false;
  try {
    const parsed = JSON.parse(readFileSync(cached, 'utf8')) as unknown;
    if (!isValidSnapshot(parsed)) return false;
    return parsed.version === BUNDLED_REGISTRY_VERSION;
  } catch {
    return false;
  }
}

export interface RefreshResult {
  ok: boolean;
  fresh: boolean;
  message: string;
  // v0.39.0: the snapshot is now always returned (the previous
  // version only returned it on success). The bundled snapshot is
  // returned when the upstream URL is dead (404) or the response
  // is invalid.
  snapshot?: RegistrySnapshot;
}

export async function refreshRegistrySnapshot(
  cwd: string,
  _url = REGISTRY_URL,
  _timeoutMs = 5000,
): Promise<RefreshResult> {
  // v0.39.0: the upstream URL (`https://ui.shadcn.com/registry.json`)
  // returns 404 (shadcn moved their registry API). Every `init` was
  // hitting the network for nothing and then falling back to the
  // bundled snapshot. Skip the fetch entirely and return the
  // bundled snapshot — the cache file is still written so external
  // readers see a consistent shape.
  try {
    const cacheFile = cachePath(cwd);
    ensureCacheDir(cwd);
    writeFileSync(cacheFile, JSON.stringify(bundledSnapshot, null, 2), 'utf-8');
  } catch {
    // Ignore — cache write failure is non-fatal; the snapshot
    // is still in memory and returned to the caller.
  }
  return {
    snapshot: bundledSnapshot as RegistrySnapshot,
    ok: true,
    fresh: false,
    message: 'Using bundled snapshot (upstream URL returns 404).',
  };
}

export function copyBundledSnapshotToCache(cwd: string): void {
  ensureCacheDir(cwd);
  writeFileSync(cachePath(cwd), JSON.stringify(bundledSnapshot, null, 2));
}
