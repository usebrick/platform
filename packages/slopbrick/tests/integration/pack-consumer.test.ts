import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const PACKAGE_ROOT = join(__dirname, '..', '..');

function npmEnvironment(cache: string): NodeJS.ProcessEnv {
  return { ...process.env, npm_config_cache: cache };
}

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
    const cache = mkdtempSync(join(tmpdir(), 'slopbrick-npm-cache-'));
    try {
      const result = spawnSync('npm', ['pack', '--dry-run', '--json'], {
        cwd: PACKAGE_ROOT,
        encoding: 'utf8',
        env: npmEnvironment(cache),
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
    } finally {
      rmSync(cache, { recursive: true, force: true });
    }
  });

  it('runs calibration usage validation from the packed artifact', () => {
    const consumerRoot = mkdtempSync(join(tmpdir(), 'slopbrick-pack-consumer-'));
    try {
      const packed = spawnSync('npm', ['pack', '--pack-destination', consumerRoot], {
        cwd: PACKAGE_ROOT,
        encoding: 'utf8',
        env: npmEnvironment(join(consumerRoot, 'npm-cache')),
      });
      expect(packed.status).toBe(0);

      const tarball = packed.stdout.match(/slopbrick-[^\s]+\.tgz/)?.[0];
      expect(tarball).toBeTruthy();
      const unpacked = join(consumerRoot, 'unpacked');
      mkdirSync(unpacked);
      const extracted = spawnSync('tar', ['-xzf', join(consumerRoot, tarball!), '-C', unpacked], {
        cwd: consumerRoot,
        encoding: 'utf8',
      });
      expect(extracted.status).toBe(0);

      const calibration = spawnSync('npm', ['run', 'cal:select', '--'], {
        cwd: join(unpacked, 'package'),
        encoding: 'utf8',
        env: npmEnvironment(join(consumerRoot, 'npm-cache')),
      });
      expect(calibration.status).toBe(2);
      expect(calibration.stdout).toContain('select requires --manifest, --seed, and --out');
    } finally {
      rmSync(consumerRoot, { recursive: true, force: true });
    }
  });
});
