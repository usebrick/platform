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
}

export async function refreshRegistrySnapshot(
  cwd: string,
  url = REGISTRY_URL,
  timeoutMs = 5000,
): Promise<RefreshResult> {
  let fetched: unknown;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    fetched = (await response.json()) as unknown;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      fresh: false,
      message: `Registry refresh failed (${message}); using bundled snapshot.`,
    };
  }

  if (!isValidSnapshot(fetched)) {
    return {
      ok: false,
      fresh: false,
      message: 'Registry response did not match expected schema; using bundled snapshot.',
    };
  }

  ensureCacheDir(cwd);
  writeFileSync(cachePath(cwd), JSON.stringify(fetched, null, 2));

  const fresh = fetched.version === BUNDLED_REGISTRY_VERSION;
  return {
    ok: true,
    fresh,
    message: fresh
      ? 'Registry snapshot refreshed and is up-to-date.'
      : `Registry snapshot refreshed but version (${fetched.version}) differs from bundled (${BUNDLED_REGISTRY_VERSION}).`,
  };
}

export function copyBundledSnapshotToCache(cwd: string): void {
  ensureCacheDir(cwd);
  writeFileSync(cachePath(cwd), JSON.stringify(bundledSnapshot, null, 2));
}
