import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  cacheStats,
  clearCache,
  hashConfig,
  hashContent,
  loadCached,
  saveCached,
  validateBaseline,
} from '../../src/engine/cache';
import { DEFAULT_CONFIG } from '../../src/config/defaults';
import { VERSION } from '../../src/types';
import type { BaselineCache, ResolvedConfig, ScanFacts } from '../../src/types';

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

function baseline(overrides: Partial<BaselineCache> = {}): BaselineCache {
  return {
    version: VERSION,
    config_hash: 'config-a',
    git_head: 'head-a',
    baseline_created: '2026-07-12T00:00:00.000Z',
    baseline_revision: 1,
    totalComponentCount: 0,
    scores: {},
    ...overrides,
  };
}

const [currentMajor = 0, currentMinor = 0, currentPatch = 0] = VERSION
  .split('.')
  .map((part) => Number.parseInt(part, 10));
const minorMismatchVersion = `${currentMajor}.${currentMinor + 1}.${currentPatch}`;
const patchMismatchVersion = `${currentMajor}.${currentMinor}.${currentPatch + 1}`;
const majorMismatchVersion = `${currentMajor + 1}.${currentMinor}.${currentPatch}`;

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

describe('baseline config identity', () => {
  it('invalidates the legacy unsalted default hash before minor-version migration', () => {
    // Legacy hashConfig omitted selection fields and salted nothing. With all
    // other defaults stripped, its canonical default payload was exactly `{}`.
    const legacyUnsaltedDefaultHash = createHash('sha256')
      .update(JSON.stringify({}))
      .digest('hex');
    const currentDefaultHash = hashConfig(DEFAULT_CONFIG);

    expect(currentDefaultHash).not.toBe(legacyUnsaltedDefaultHash);
    expect(validateBaseline(
      baseline({
        version: minorMismatchVersion,
        config_hash: legacyUnsaltedDefaultHash,
      }),
      currentDefaultHash,
      'head-a',
    )).toEqual({ valid: false, reason: 'config_hash mismatch' });
  });

  it('changes when include, exclude, or selfScan selection policy changes', () => {
    const restricted: ResolvedConfig = {
      ...DEFAULT_CONFIG,
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**'],
      selfScan: { excludePaths: ['src/meta/**'] },
    };
    const restrictedHash = hashConfig(restricted);
    const changedPolicies: ResolvedConfig[] = [
      { ...restricted, include: [...restricted.include, 'tests/**/*.ts'] },
      { ...restricted, exclude: [] },
      { ...restricted, selfScan: { excludePaths: [] } },
    ];

    for (const changed of changedPolicies) {
      expect(hashConfig(changed)).not.toBe(restrictedHash);
    }
  });

  it('keeps default stripping and deterministic hashing intact', () => {
    const explicitDefaults: ResolvedConfig = {
      ...DEFAULT_CONFIG,
      include: [...DEFAULT_CONFIG.include],
      exclude: [...DEFAULT_CONFIG.exclude],
      selfScan: undefined,
    };

    expect(hashConfig(explicitDefaults)).toBe(hashConfig(DEFAULT_CONFIG));
    expect(hashConfig(explicitDefaults)).toBe(hashConfig(explicitDefaults));
  });
});

describe('baseline validation ordering', () => {
  it.each([minorMismatchVersion, patchMismatchVersion])(
    'does not let version migration for %s bypass config identity',
    (version) => {
      expect(validateBaseline(
        baseline({ version }),
        'config-b',
        'head-a',
      )).toEqual({ valid: false, reason: 'config_hash mismatch' });
    },
  );

  it.each([minorMismatchVersion, patchMismatchVersion])(
    'does not let version migration for %s bypass Git identity',
    (version) => {
      expect(validateBaseline(
        baseline({ version }),
        'config-a',
        'head-b',
      )).toEqual({ valid: false, reason: 'git_head mismatch' });
    },
  );

  it.each([minorMismatchVersion, patchMismatchVersion])(
    'accepts matching config and Git identity for %s with a migration warning',
    (version) => {
      expect(validateBaseline(
        baseline({ version }),
        'config-a',
        'head-a',
      )).toEqual({
        valid: true,
        warning: `baseline minor/patch version mismatch (${version} vs ${VERSION}); migrating`,
      });
    },
  );

  it('keeps a major version mismatch invalid', () => {
    expect(validateBaseline(
      baseline({ version: majorMismatchVersion }),
      'config-a',
      'head-a',
    )).toEqual({
      valid: false,
      reason: `baseline major version mismatch (${majorMismatchVersion} vs ${VERSION})`,
    });
  });
});
