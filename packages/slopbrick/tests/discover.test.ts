import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverFiles, discoverFilesWithDiagnostics } from '../src/engine/discover';
import { DEFAULT_CONFIG } from '../src/config';
import type { ResolvedConfig } from '../src/types';

const createTmpDir = () => realpathSync(mkdtempSync(join(tmpdir(), 'slopbrick-discover-test-')));

const makeConfig = (overrides: Partial<ResolvedConfig> = {}): ResolvedConfig => ({
  ...DEFAULT_CONFIG,
  include: ['src/**/*.{ts,tsx,js,jsx}'],
  exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**'],
  ...overrides,
});

describe('discoverFiles', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('finds matching source files', async () => {
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'Button.tsx'), '');
    writeFileSync(join(dir, 'src', 'utils.ts'), '');
    const files = await discoverFiles(dir, makeConfig());
    expect(files).toEqual([
      join(dir, 'src', 'Button.tsx'),
      join(dir, 'src', 'utils.ts'),
    ]);
  });

  it('ignores non-source files', async () => {
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'styles.css'), '');
    writeFileSync(join(dir, 'src', 'data.json'), '');
    const files = await discoverFiles(dir, makeConfig());
    expect(files).toEqual([]);
  });

  it('excludes files matching exclude patterns', async () => {
    mkdirSync(join(dir, 'src', 'node_modules', 'lib'), { recursive: true });
    mkdirSync(join(dir, 'src', 'dist'), { recursive: true });
    writeFileSync(join(dir, 'src', 'node_modules', 'lib', 'index.ts'), '');
    writeFileSync(join(dir, 'src', 'dist', 'index.js'), '');
    writeFileSync(join(dir, 'src', 'App.tsx'), '');
    const files = await discoverFiles(dir, makeConfig());
    expect(files).toEqual([join(dir, 'src', 'App.tsx')]);
  });

  it('returns absolute paths sorted and de-duplicated', async () => {
    mkdirSync(join(dir, 'src', 'a'), { recursive: true });
    mkdirSync(join(dir, 'src', 'b'), { recursive: true });
    writeFileSync(join(dir, 'src', 'a', 'z.ts'), '');
    writeFileSync(join(dir, 'src', 'b', 'a.ts'), '');
    const files = await discoverFiles(dir, makeConfig({ include: ['src/**/*.ts'] }));
    expect(files).toEqual([
      join(dir, 'src', 'a', 'z.ts'),
      join(dir, 'src', 'b', 'a.ts'),
    ]);
  });

  it('respects custom include patterns', async () => {
    mkdirSync(join(dir, 'lib'), { recursive: true });
    writeFileSync(join(dir, 'lib', 'helper.ts'), '');
    const files = await discoverFiles(dir, makeConfig({ include: ['lib/**/*.ts'] }));
    expect(files).toEqual([join(dir, 'lib', 'helper.ts')]);
  });

  it('discovers .vue, .svelte, and .astro source files', async () => {
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'App.vue'), '');
    writeFileSync(join(dir, 'src', 'Card.svelte'), '');
    writeFileSync(join(dir, 'src', 'Page.astro'), '');
    const files = await discoverFiles(dir, makeConfig({ include: ['src/**/*.{ts,tsx,js,jsx,vue,svelte,astro}'] }));
    expect(files.sort()).toEqual([
      join(dir, 'src', 'App.vue'),
      join(dir, 'src', 'Card.svelte'),
      join(dir, 'src', 'Page.astro'),
    ]);
  });

  it('discovers C/C++ sources through the default include policy', async () => {
    writeFileSync(join(dir, 'main.c'), 'int main(void) { return 0; }\n');
    writeFileSync(join(dir, 'widget.hpp'), '#pragma once\n');

    await expect(discoverFiles(dir, DEFAULT_CONFIG)).resolves.toEqual([
      join(dir, 'main.c'),
      join(dir, 'widget.hpp'),
    ]);
  });

  it('does not return files that do not exist', async () => {
    const files = await discoverFiles(dir, makeConfig({ include: ['missing/**/*.ts'] }));
    expect(files).toEqual([]);
  });

  it('sniffs extension-less files by content when a sibling extension is absent', async () => {
    mkdirSync(join(dir, 'src'), { recursive: true });
    // No extension; should be sniffed as TSX
    writeFileSync(
      join(dir, 'src', 'Component'),
      "import React from 'react';\nexport const X = () => <div className='w-[100px]' />;\n",
    );
    const files = await discoverFiles(dir, makeConfig({ include: ['src/*'] }));
    expect(files).toEqual([join(dir, 'src', 'Component')]);
  });

  it('skips extension-less files when a same-basename sibling already has an extension', async () => {
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(
      join(dir, 'src', 'Component.tsx'),
      "export const X = () => null;\n",
    );
    writeFileSync(
      join(dir, 'src', 'Component'),
      "import React from 'react';\nexport const X = () => <div />;\n",
    );
    const files = await discoverFiles(dir, makeConfig({ include: ['src/*'] }));
    expect(files).toEqual([join(dir, 'src', 'Component.tsx')]);
  });

  it('skips extension-less files whose content does not match any source format', async () => {
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'data'), '{"foo": "bar"}\n');
    const files = await discoverFiles(dir, makeConfig({ include: ['src/*'] }));
    expect(files).toEqual([]);
  });

  it('accounts for every observed discovery candidate with one exclusive reason', async () => {
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'accepted.ts'), 'export const accepted = true;');
    writeFileSync(join(dir, 'src', 'excluded'), 'export const excluded = true;');
    writeFileSync(join(dir, 'src', 'styles.css'), 'body {}');
    writeFileSync(join(dir, 'src', 'data'), '{"not": "source"}');
    writeFileSync(join(dir, 'src', 'Duplicate'), 'export const duplicate = true;');
    writeFileSync(join(dir, 'src', 'Duplicate.ts'), 'export const duplicate = true;');

    const discovered = await discoverFilesWithDiagnostics(dir, makeConfig({
      include: ['src/*'],
      exclude: ['src/excluded'],
    }));

    expect(discovered.files).toEqual([
      join(dir, 'src', 'Duplicate.ts'),
      join(dir, 'src', 'accepted.ts'),
    ]);
    expect(discovered.selectionAccounting).toEqual({
      observedCandidates: 6,
      selected: 2,
      excluded: {
        configExclude: 1,
        unsupportedFileType: 2,
        extensionlessDuplicate: 1,
        outsideWorkspace: 0,
        gitScope: 0,
      },
    });
  });
});
