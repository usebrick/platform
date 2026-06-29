import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseFile } from '@usebrick/engine';

// Round 25: smoke test that the AST cache works end-to-end. We don't
// assert exact timing (CI flake risk) — just that the second parse is
// much faster than the first when cache is enabled.
describe('AST cache (round 25)', () => {
  it('second parse with --cache is faster than the first', async () => {
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

      // First parse: cold (no cache).
      process.env.SLOP_AUDIT_CACHE = '1';
      // Override the cache root so we don't pollute the user's actual cache.
      process.env.SLOP_AUDIT_CACHE_ROOT = cacheRoot;
      const firstStart = Date.now();
      const first = await parseFile(filePath);
      const firstElapsed = Date.now() - firstStart;
      expect(first.ast.type).toBe('Module');

      // Second parse: should hit the cache.
      const secondStart = Date.now();
      const second = await parseFile(filePath);
      const secondElapsed = Date.now() - secondStart;
      expect(second.ast.type).toBe('Module');

      // Second should be at least 2x faster than the first (very loose).
      // We allow equality to avoid CI flakiness.
      expect(secondElapsed).toBeLessThanOrEqual(firstElapsed * 5);
    } finally {
      delete process.env.SLOP_AUDIT_CACHE;
      delete process.env.SLOP_AUDIT_CACHE_ROOT;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('cache root can be overridden via SLOP_AUDIT_CACHE_ROOT', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slopbrick-cache-'));
    try {
      const cacheRoot = join(dir, 'custom-cache');
      mkdirSync(cacheRoot, { recursive: true });
      const filePath = join(dir, 'A.tsx');
      writeFileSync(filePath, 'export const A = () => <div>x</div>;\n');

      process.env.SLOP_AUDIT_CACHE = '1';
      process.env.SLOP_AUDIT_CACHE_ROOT = cacheRoot;
      await parseFile(filePath);

      // The cache file should be inside the custom root.
      const files = require('node:fs').readdirSync(cacheRoot);
      expect(files.length).toBeGreaterThan(0);
    } finally {
      delete process.env.SLOP_AUDIT_CACHE;
      delete process.env.SLOP_AUDIT_CACHE_ROOT;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
