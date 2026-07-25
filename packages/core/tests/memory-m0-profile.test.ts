import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as publicApi from '../src/index';
import { STRUCTURE_SCHEMA_VERSION } from '../src/structure-types';
import { MEMORY_M0_PROFILE, MEMORY_M0_REGISTRY } from '../src/memory-m0';

function expectRecursivelyFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectRecursivelyFrozen(child);
}

describe('MemoryBrick M0 private profile', () => {
  it('pins the module-owned registry to the accepted registry-v2 fixture', () => {
    const fixtureUrl = new URL(
      '../../../docs/decisions/memorybrick-m0-registry-v2.json',
      import.meta.url,
    );
    const fixture = JSON.parse(readFileSync(fixtureUrl, 'utf8')) as unknown;

    expect(MEMORY_M0_PROFILE).toBe('memory-m0-v2');
    expect(MEMORY_M0_REGISTRY).toEqual(fixture);
  });

  it('recursively freezes the exact module-owned registry', () => {
    expectRecursivelyFrozen(MEMORY_M0_REGISTRY);
  });

  it('leaves Structure v5 and the public Core export map unchanged', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { exports: unknown };

    expect(STRUCTURE_SCHEMA_VERSION).toBe('5');
    expect(packageJson.exports).toEqual({
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.js',
        require: './dist/index.cjs',
      },
      './verdicts': {
        types: './dist/verdicts.d.ts',
        import: './dist/verdicts.js',
        require: './dist/verdicts.cjs',
      },
    });
    expect(Object.keys(publicApi).filter((name) => /memory/i.test(name))).toEqual([]);
  });
});
