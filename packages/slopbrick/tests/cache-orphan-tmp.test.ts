// v0.5.2: tests for atomic-cache orphan .tmp cleanup.
//
// saveCache() writes to `<path>.tmp` then renames. If the process
// is killed between the write and the rename, the .tmp is left on
// disk. saveCache now unlinks any existing .tmp before writing its
// own, so the cache directory stays clean across crashes.

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { existsSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { saveCache, loadCache, type ScanCache } from '../src/engine/cache-incremental';
import { VERSION } from '../src/types';

function emptyCache(): ScanCache {
  return {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    files: {},
  };
}

describe('cache: atomic .tmp orphan cleanup (atomic save)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'slopbrick-orphan-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('removes an orphan .tmp from a previous interrupted save', () => {
    const cachePath = join(dir, 'cache.json');
    const tmpPath = cachePath + '.tmp';
    // Simulate a crash: write a corrupt .tmp that was never renamed.
    writeFileSync(tmpPath, '{"version":"OLD","generatedAt":"x","files":');

    expect(existsSync(tmpPath)).toBe(true);
    saveCache(cachePath, emptyCache());
    expect(existsSync(tmpPath)).toBe(false);
    expect(existsSync(cachePath)).toBe(true);
    // The saved cache is the new one, not the old .tmp content.
    const cache = loadCache(cachePath);
    expect(cache?.version).toBe(VERSION);
  });

  it('does not fail when no orphan .tmp exists', () => {
    const cachePath = join(dir, 'cache.json');
    saveCache(cachePath, emptyCache());
    expect(existsSync(cachePath)).toBe(true);
    expect(existsSync(cachePath + '.tmp')).toBe(false);
  });

  it('creates the cache directory if missing', () => {
    const nested = join(dir, 'a', 'b', 'cache.json');
    expect(existsSync(dirname(nested))).toBe(false);
    saveCache(nested, emptyCache());
    expect(existsSync(nested)).toBe(true);
    expect(existsSync(nested + '.tmp')).toBe(false);
  });

  it('survives multiple consecutive saves (no leftover .tmp)', () => {
    const cachePath = join(dir, 'cache.json');
    for (let i = 0; i < 5; i++) {
      saveCache(cachePath, {
        ...emptyCache(),
        generatedAt: `2026-06-15T${10 + i}:00:00Z`,
      });
    }
    expect(existsSync(cachePath + '.tmp')).toBe(false);
    const cache = loadCache(cachePath);
    expect(cache?.generatedAt).toBe('2026-06-15T14:00:00Z');
  });
});