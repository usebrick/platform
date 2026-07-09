import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_CONFIG } from '../../src/config';
import { discoverScanFiles } from '../../src/cli/discovery';
import type { ResolvedConfig } from '../../src/types';

const makeConfig = (include: string[]): ResolvedConfig => ({
  ...DEFAULT_CONFIG,
  include,
  exclude: [],
});

describe('discoverScanFiles', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it('resolves an ancestor config from its own directory and restricts to the requested subtree', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'slopbrick-discovery-')));
    roots.push(root);
    const packageRoot = join(root, 'packages', 'app');
    mkdirSync(join(packageRoot, 'src'), { recursive: true });
    mkdirSync(join(packageRoot, 'tests'), { recursive: true });
    const source = join(packageRoot, 'src', 'index.ts');
    writeFileSync(source, 'export {}');
    writeFileSync(join(packageRoot, 'tests', 'index.ts'), 'export {}');
    const configPath = join(packageRoot, 'slopbrick.config.mjs');
    writeFileSync(configPath, 'export default {}');

    await expect(discoverScanFiles({
      workspace: join(packageRoot, 'src'),
      config: makeConfig(['src/**/*.ts']),
      configPath,
      cliIncludeOverride: false,
    })).resolves.toEqual([source]);
  });

  it('discovers TypeScript source in every declared pnpm workspace package', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'slopbrick-discovery-')));
    roots.push(root);
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
    for (const name of ['one', 'two']) {
      const pkg = join(root, 'packages', name);
      mkdirSync(join(pkg, 'src'), { recursive: true });
      writeFileSync(join(pkg, 'package.json'), '{}');
      writeFileSync(join(pkg, 'src', `${name}.ts`), 'export {}');
    }
    const vendor = join(root, 'vendor');
    mkdirSync(vendor, { recursive: true });
    writeFileSync(join(vendor, 'ignored.ts'), 'export {}');

    await expect(discoverScanFiles({
      workspace: root,
      config: makeConfig(['src/**/*.ts']),
      cliIncludeOverride: false,
    })).resolves.toEqual([
      join(root, 'packages', 'one', 'src', 'one.ts'),
      join(root, 'packages', 'two', 'src', 'two.ts'),
    ]);
  });

  it('does not include undeclared sibling directories', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'slopbrick-discovery-')));
    roots.push(root);
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
    const pkg = join(root, 'packages', 'one');
    mkdirSync(join(pkg, 'src'), { recursive: true });
    writeFileSync(join(pkg, 'package.json'), '{}');
    writeFileSync(join(pkg, 'src', 'one.ts'), 'export {}');
    mkdirSync(join(root, 'vendor', 'src'), { recursive: true });
    writeFileSync(join(root, 'vendor', 'src', 'ignored.ts'), 'export {}');

    const files = await discoverScanFiles({ workspace: root, config: makeConfig(['src/**/*.ts']), cliIncludeOverride: false });
    expect(files).not.toContain(join(root, 'vendor', 'src', 'ignored.ts'));
  });

  it('resolves CLI include overrides from the requested workspace', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'slopbrick-discovery-')));
    roots.push(root);
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'index.ts'), 'export {}');
    writeFileSync(join(root, 'other.ts'), 'export {}');

    await expect(discoverScanFiles({
      workspace: root,
      config: makeConfig(['other.ts']),
      cliIncludeOverride: true,
    })).resolves.toEqual([join(root, 'other.ts')]);
  });
});
