import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const PACKAGE_ROOT = join(__dirname, '..', '..');

describe('published consumer contract', () => {
  it('ships self-contained declarations and export targets', () => {
    const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
      exports: { '.': { import: string; require: string; types: string } };
    };
    const declarations = readFileSync(join(PACKAGE_ROOT, pkg.exports['.'].types), 'utf8');

    // @usebrick/* are private workspace packages and cannot be installed by
    // npm consumers. The dts bundle must inline their public types.
    expect(declarations).not.toMatch(/from ['"]@usebrick\/(core|engine)['"]/);
    expect(readFileSync(join(PACKAGE_ROOT, pkg.exports['.'].import))).toBeTruthy();
    expect(readFileSync(join(PACKAGE_ROOT, pkg.exports['.'].require))).toBeTruthy();
  });

  it('npm pack contains every declared export target', () => {
    const result = spawnSync('npm', ['pack', '--dry-run', '--json'], {
      cwd: PACKAGE_ROOT,
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    // npm includes the prepack guard's human-readable output before its JSON.
    const jsonStart = result.stdout.indexOf('[');
    expect(jsonStart).toBeGreaterThanOrEqual(0);
    const metadata = JSON.parse(result.stdout.slice(jsonStart)) as Array<{ files: Array<{ path: string }> }>;
    const files = new Set(metadata[0].files.map(({ path }) => path));
    expect(files.has('dist/index.js')).toBe(true);
    expect(files.has('dist/index.cjs')).toBe(true);
    expect(files.has('dist/index.d.ts')).toBe(true);
    expect(files.has('bin/slopbrick.js')).toBe(true);
  });
});
