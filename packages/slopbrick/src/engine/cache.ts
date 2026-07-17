/**
 * src/engine/cache.ts cache module (combined).
 * Two distinct caches live here:
 *   1. Baseline cache — config-hashed, persistent across runs. Used by
 *      `--baseline` and `--no-increase` to compare current scores
 *      against a stored snapshot. Path: <cwd>/.slopbrick/cache/baseline.json
 *   2. AST cache — content-hashed, per-file. Caches the `ScanFacts`
 *      built by `extractFacts` so repeated scans skip SWC parsing
 *      entirely on warm cache. Path: <cwd>/.slopbrick/cache/<md5>.json
 * The two caches share the same parent directory but use distinct
 * file extensions (`.json` for the baseline, `<md5>.json` for AST
 * entries — md5 is 32 hex chars so no name collision).
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VERSION } from '../types';
import { DEFAULT_CONFIG } from '../config';
import type { BaselineCache, ResolvedConfig, ScanFacts } from '../types';

// ===========================================================================
// PART 1: Baseline cache (preserved from the original cache module)
// ===========================================================================

const BASELINE_VERSION = VERSION;
const BASELINE_CONFIG_HASH_DOMAIN = 'slopbrick:baseline-config:v2\0';

function parseVersion(version: string): [number, number, number] {
  const parts = version.split('.').map((part) => parseInt(part, 10));
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function sanitizeForHash(value: unknown): unknown {
  if (value instanceof RegExp) {
    return { __type: 'RegExp', source: value.source, flags: value.flags };
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeForHash);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, sanitizeForHash(v)]),
    );
  }
  return value;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source && a.flags === b.flags;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => valuesEqual(item, b[index]));
  }
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    const aRecord = a as Record<string, unknown>;
    const bRecord = b as Record<string, unknown>;
    return aKeys.every((key) => valuesEqual(aRecord[key], bRecord[key]));
  }
  return false;
}

const BASELINE_HASH_KEYS = new Set<keyof ResolvedConfig>([
  'framework',
  'hasTailwind',
  'supportsRsc',
  'rules',
  'categoryWeights',
  'frameworkMultipliers',
  'ruleConfig',
  'gapTokens',
  'spacingScale',
  'typographyScale',
  'arbitraryValueAllowlist',
  'clampAllowlist',
  'wcag',
  'include',
  'exclude',
  'selfScan',
]);

function stripDefaults(value: unknown, defaultValue: unknown): unknown {
  if (valuesEqual(value, defaultValue)) return undefined;

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForHash(item));
  }

  if (value !== null && typeof value === 'object') {
    const defaultRecord = (defaultValue ?? {}) as Record<string, unknown>;
    const valueRecord = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(valueRecord)) {
      const stripped = stripDefaults(val, defaultRecord[key]);
      if (stripped !== undefined) {
        result[key] = stripped;
      }
    }
    return result;
  }

  return sanitizeForHash(value);
}

function pickBaselineConfig(config: ResolvedConfig): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  const defaultRecord = DEFAULT_CONFIG as unknown as Record<string, unknown>;
  const configRecord = config as unknown as Record<string, unknown>;
  for (const key of BASELINE_HASH_KEYS) {
    const value = configRecord[key];
    if (value === undefined) continue;
    const stripped = stripDefaults(value, defaultRecord[key]);
    if (stripped !== undefined) {
      picked[key] = stripped;
    }
  }
  return picked;
}

export function hashConfig(config: ResolvedConfig): string {
  return createHash('sha256')
    .update(BASELINE_CONFIG_HASH_DOMAIN)
    .update(JSON.stringify(sanitizeForHash(pickBaselineConfig(config))))
    .digest('hex');
}

export function baselinePath(projectPath: string): string {
  return join(projectPath, '.slopbrick', 'cache', 'baseline.json');
}

function isBaselineCache(value: unknown): value is BaselineCache {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.version !== 'string') return false;
  if (typeof obj.config_hash !== 'string') return false;
  if (typeof obj.git_head !== 'string') return false;
  if (typeof obj.baseline_created !== 'string') return false;
  if (typeof obj.baseline_revision !== 'number') return false;
  if (typeof obj.totalComponentCount !== 'number') return false;
  if (!obj.scores || typeof obj.scores !== 'object') return false;
  for (const entry of Object.values(obj.scores)) {
    if (!entry || typeof entry !== 'object') return false;
    const score = entry as Record<string, unknown>;
    if (typeof score.baselineScore !== 'number') return false;
    if (typeof score.componentCount !== 'number') return false;
  }
  return true;
}

export function loadBaseline(projectPath: string): BaselineCache | undefined {
  const path = baselinePath(projectPath);
  if (!existsSync(path)) return undefined;
  try {
    const content = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(content);
    if (!isBaselineCache(parsed)) {
      console.error(
        `Invalid baseline cache at ${path}; ignoring. Review the current score before running \`slopbrick scan --baseline\` to create a new baseline.`,
      );
      return undefined;
    }
    return parsed;
  } catch (err) {
    console.error(
      `Failed to load baseline cache at ${path}; ignoring. Review the current score before running \`slopbrick scan --baseline\` to create a new baseline.`,
      err,
    );
    return undefined;
  }
}

export function saveBaseline(projectPath: string, cache: BaselineCache): void {
  const path = baselinePath(projectPath);
  mkdirSync(join(projectPath, '.slopbrick', 'cache'), { recursive: true });
  writeFileSync(path, JSON.stringify(cache, null, 2));
}

export function tightenBaseline(cache: BaselineCache): BaselineCache {
  const next = { ...cache };
  next.baseline_revision = cache.baseline_revision + 1;
  next.scores = {};
  for (const [file, score] of Object.entries(cache.scores)) {
    next.scores[file] = {
      ...score,
      baselineScore: Math.round(score.baselineScore * 0.9 * 100) / 100,
    };
  }
  return next;
}

export function validateBaseline(
  cache: BaselineCache,
  configHash: string,
  gitHead: string,
): { valid: boolean; reason?: string; warning?: string } {
  const current = parseVersion(BASELINE_VERSION);
  const cached = parseVersion(cache.version);

  if (current[0] !== cached[0]) {
    return {
      valid: false,
      reason: `baseline major version mismatch (${cache.version} vs ${BASELINE_VERSION})`,
    };
  }

  if (cache.config_hash !== configHash) return { valid: false, reason: 'config_hash mismatch' };
  if (cache.git_head !== gitHead) return { valid: false, reason: 'git_head mismatch' };

  if (current[1] !== cached[1] || current[2] !== cached[2]) {
    return {
      valid: true,
      warning: `baseline minor/patch version mismatch (${cache.version} vs ${BASELINE_VERSION}); migrating`,
    };
  }

  return { valid: true };
}

// ===========================================================================
// PART 2: content-hash AST cache
// ===========================================================================

export interface CachedScanFacts {
  /** md5 of the file content at cache time. */
  hash: string;
  /** Absolute file path. Stored so callers can detect path collisions. */
  filePath: string;
  /** The full source text. Cached because some rules use it for advice. */
  source: string;
  /** Pre-built ScanFacts. Includes the v2 grouped shape. */
  facts: ScanFacts;
}

const AST_CACHE_DIR = '.slopbrick/cache';

function cacheRoot(cwd: string): string {
  return join(cwd, AST_CACHE_DIR);
}

function cachePath(cwd: string, hash: string): string {
  return join(cacheRoot(cwd), `${hash}.json`);
}

function ensureCacheDir(cwd: string): void {
  if (!existsSync(cacheRoot(cwd))) {
    mkdirSync(cacheRoot(cwd), { recursive: true });
  }
}

/** Hash file content with md5. Stable across runs. */
export function hashContent(content: string): string {
  return createHash('md5').update(content, 'utf-8').digest('hex');
}

/** Try to load a cached AST entry. Returns null on miss or parse error. */
export function loadCached(cwd: string, content: string): CachedScanFacts | null {
  const hash = hashContent(content);
  const path = cachePath(cwd, hash);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as Omit<CachedScanFacts, 'hash'>;
    return { hash, ...parsed };
  } catch {
    return null;
  }
}

/** Persist a ScanFacts entry to disk. Overwrites on conflict (same hash). */
export function saveCached(
  cwd: string,
  content: string,
  filePath: string,
  facts: ScanFacts,
): void {
  ensureCacheDir(cwd);
  const hash = hashContent(content);
  const path = cachePath(cwd, hash);
  const entry: Omit<CachedScanFacts, 'hash'> = {
    filePath,
    source: content,
    facts,
  };
  writeFileSync(path, JSON.stringify(entry), 'utf-8');
}

/** Clear all AST cached entries under <cwd>/.slopbrick/cache/.
 *  Leaves the baseline.json intact. */
export function clearCache(cwd: string): { removed: number } {
  const root = cacheRoot(cwd);
  if (!existsSync(root)) return { removed: 0 };
  const fs = require('node:fs') as typeof import('node:fs');
  const files = fs.readdirSync(root).filter((f) => f.endsWith('.json') && f !== 'baseline.json');
  for (const f of files) fs.unlinkSync(join(root, f));
  return { removed: files.length };
}

/** Stats for `slopbrick doctor` and `--cache-stats` output. */
export function cacheStats(cwd: string): { entries: number; bytes: number } {
  const root = cacheRoot(cwd);
  if (!existsSync(root)) return { entries: 0, bytes: 0 };
  const fs = require('node:fs') as typeof import('node:fs');
  const files = fs.readdirSync(root).filter((f) => f.endsWith('.json') && f !== 'baseline.json');
  let bytes = 0;
  for (const f of files) {
    try {
      bytes += fs.statSync(join(root, f)).size;
    } catch {
      // ignore
    }
  }
  return { entries: files.length, bytes };
}
