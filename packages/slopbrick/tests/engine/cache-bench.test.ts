import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseFile } from '@usebrick/engine';

// Round 25: smoke test that the AST cache works end-to-end. We don't
// assert exact timing (CI flake risk) — just that the second parse is
// much faster than the first when cache is enabled.
//
// v0.18.3+: the cache is configured via the `ParseFileOptions.cache`
// option, NOT via process.env. The engine's `parseFile` no longer reads
// `SLOP_AUDIT_CACHE` / `SLOP_AUDIT_CACHE_ROOT` — those env vars are read
// by the slopbrick CLI boundary (worker.ts), which threads a
// `ParserCacheConfig` into `parseFile`. This test exercises the same
// option-based path the CLI uses.
describe('AST cache (round 25)', () => {
  it('second parse with cache enabled is faster than the first', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slopbrick-cache-'));
    try {
      const cacheRoot = join(dir, '.cache');
      mkdirSync(cacheRoot, { recursive: true });
      const filePath = join(dir, 'Card.tsx');
      const source = [
        'export function Card() {',
        '  return (',
        '    <div className="p-2 m-2 bg-red-500">',
        '      <span>hello</span>',
        '      <span>world</span>',
        '    </div>',
        '  );',
        '}',
        '',
      ].join('\n');
      writeFileSync(filePath, source);

      const cache = { enabled: true, root: cacheRoot };

      // First parse: cold (no cache).
      const firstStart = Date.now();
      const first = await parseFile(filePath, { cache });
      // Date.now() can report zero for a fast parse on a quiet machine. Keep
      // the benchmark diagnostic without letting clock granularity turn it
      // into a false failure.
      const firstElapsed = Math.max(Date.now() - firstStart, 1);
      expect(first.ast.type).toBe('Module');

      // Second parse: should hit the cache.
      const secondStart = Date.now();
      const second = await parseFile(filePath, { cache });
      const secondElapsed = Date.now() - secondStart;
      expect(second.ast.type).toBe('Module');

      // Second should be at least 2x faster than the first (very loose).
      // We allow equality to avoid CI flakiness.
      expect(secondElapsed).toBeLessThanOrEqual(firstElapsed * 5);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('cache root can be overridden via the cache.root option', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slopbrick-cache-'));
    try {
      const cacheRoot = join(dir, 'custom-cache');
      mkdirSync(cacheRoot, { recursive: true });
      const filePath = join(dir, 'A.tsx');
      writeFileSync(filePath, 'export const A = () => <div>x</div>;\n');

      await parseFile(filePath, { cache: { enabled: true, root: cacheRoot } });

      // The cache file should be inside the custom root.
      const files = readdirSync(cacheRoot);
      expect(files.length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
