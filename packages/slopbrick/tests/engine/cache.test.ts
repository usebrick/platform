import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { hashContent, loadCached, saveCached, clearCache, cacheStats } from '../../src/engine/cache';
import type { ScanFacts } from '../../src/types';

const fakeFacts: ScanFacts = {
  filePath: '/foo/bar.tsx',
  v2: {
    file: { path: '/foo/bar.tsx', loc: 1, extension: '.tsx', framework: 'react' },
    imports: [],
    components: [],
    jsx: { elements: [], maxNestingDepth: 0 },
    logic: {
      hooks: [],
      stateVariables: [],
      defensiveChecks: [],
      apiCalls: [],
      logicalExpressions: [],
      keyProps: [],
      optimisticUpdates: [],
    },
    designTokens: { spacingUsage: [], colorValues: [], fontSizes: [], borderRadius: [] },
    componentSizes: [],
    astroComponents: [],
    disabledRules: [],
    templateClassNames: [],
  },
};

describe('engine/cache', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'slopbrick-cache-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('hashes content deterministically', () => {
    expect(hashContent('hello')).toBe('5d41402abc4b2a76b9719d911017c592');
    expect(hashContent('hello')).toBe(hashContent('hello'));
    expect(hashContent('hello')).not.toBe(hashContent('world'));
  });

  it('returns null on cache miss', () => {
    expect(loadCached(dir, 'anything')).toBeNull();
  });

  it('round-trips a ScanFacts entry', () => {
    saveCached(dir, 'const x = 1;', '/tmp/test.tsx', fakeFacts);
    const loaded = loadCached(dir, 'const x = 1;');
    expect(loaded).not.toBeNull();
    expect(loaded?.hash).toBe(hashContent('const x = 1;'));
    expect(loaded?.source).toBe('const x = 1;');
    expect(loaded?.facts.filePath).toBe('/foo/bar.tsx');
  });

  it('cache is keyed by content, not path', () => {
    saveCached(dir, 'same content', '/path/a.tsx', fakeFacts);
    const loaded = loadCached(dir, 'same content');
    expect(loaded).not.toBeNull();
    // Different content → no entry
    expect(loadCached(dir, 'different content')).toBeNull();
  });

  it('creates the cache directory if missing', () => {
    expect(existsSync(join(dir, '.slopbrick', 'cache'))).toBe(false);
    saveCached(dir, 'content', '/x.tsx', fakeFacts);
    expect(existsSync(join(dir, '.slopbrick', 'cache'))).toBe(true);
  });

  it('clearCache removes all entries', () => {
    saveCached(dir, 'a', '/x.tsx', fakeFacts);
    saveCached(dir, 'b', '/y.tsx', fakeFacts);
    saveCached(dir, 'c', '/z.tsx', fakeFacts);
    expect(cacheStats(dir).entries).toBe(3);
    const { removed } = clearCache(dir);
    expect(removed).toBe(3);
    expect(cacheStats(dir).entries).toBe(0);
  });

  it('cacheStats reports size in bytes', () => {
    saveCached(dir, 'a', '/x.tsx', fakeFacts);
    const stats = cacheStats(dir);
    expect(stats.entries).toBe(1);
    expect(stats.bytes).toBeGreaterThan(0);
  });

  it('survives corrupted cache files (returns null instead of throwing)', () => {
    const cacheRoot = join(dir, '.slopbrick', 'cache');
    require('node:fs').mkdirSync(cacheRoot, { recursive: true });
    const corruptedPath = join(cacheRoot, `${hashContent('bad')}.json`);
    writeFileSync(corruptedPath, 'this is not json {{{');
    expect(loadCached(dir, 'bad')).toBeNull();
  });
});
