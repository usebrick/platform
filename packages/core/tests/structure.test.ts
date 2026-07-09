import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  inventoryPath,
  constitutionPath,
  cachePath,
  loadInventory,
  saveInventory,
  loadConstitution,
  saveConstitution,
  readCache,
  writeCacheFromInventory,
  isInventoryFresh,
  invalidateFile,
  writeJsonAtomic,
} from '../src/structure';
import type { RepositoryStructureInventory as InventoryFile, RepositoryStructureConstitution as ConstitutionFile } from '../src';

describe('memory — loaders/savers', () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'usebrick-core-mem-'));
    await mkdir(join(workspace, '.slopbrick'), { recursive: true });
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  function buildInventory(): InventoryFile {
    return {
      version: '5',
      generatedAt: '2026-06-25T00:00:00.000Z',
      workspace,
      scannedFiles: 5,
      scanDurationMs: 100,
      patterns: [
        { category: 'stateManagement', name: 'zustand', imports: ['zustand'], fileCount: 3 },
      ],
      components: [
        {
          name: 'Button',
          files: [join(workspace, 'Button.tsx')],
          fingerprint: 'abc',
          hooks: ['useState'],
          props: ['onClick'],
          line: 1,
          endLine: 10,
        },
      ],
    };
  }

  it('path helpers return the canonical locations', () => {
    expect(inventoryPath(workspace)).toBe(join(workspace, '.slopbrick', 'inventory.json'));
    expect(constitutionPath(workspace)).toBe(join(workspace, '.slopbrick', 'constitution.json'));
    expect(cachePath(workspace)).toBe(join(workspace, '.slopbrick-cache.json'));
  });

  it('loadInventory returns null when file is missing', () => {
    expect(loadInventory(workspace)).toBeNull();
  });

  it('saveInventory + loadInventory round-trip', () => {
    const inv = buildInventory();
    saveInventory(workspace, inv);
    const loaded = loadInventory(workspace);
    expect(loaded).toEqual(inv);
  });

  it('loadInventory returns null when JSON is malformed', async () => {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(inventoryPath(workspace), 'not json');
    expect(loadInventory(workspace)).toBeNull();
  });

  it('loadInventory returns null when version mismatches', async () => {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(
      inventoryPath(workspace),
      JSON.stringify({ version: '0', generatedAt: 'x', workspace: '/', scannedFiles: 1, scanDurationMs: 1, patterns: [], components: [] }),
    );
    expect(loadInventory(workspace)).toBeNull();
  });

  it('loadConstitution + saveConstitution round-trip', () => {
    const c: ConstitutionFile = {
      version: '5',
      generatedAt: '2026-06-25T00:00:00.000Z',
      workspace,
      declared: { stateManagement: 'zustand' },
      forbidden: ['redux'],
      forbiddenPrefixes: ['@scope/'],
    };
    saveConstitution(workspace, c);
    expect(loadConstitution(workspace)).toEqual(c);
  });

  it('writeJsonAtomic creates exactly the requested parent directory', async () => {
    const { existsSync } = await import('node:fs');
    await rm(join(workspace, '.slopbrick'), { recursive: true, force: true });
    writeJsonAtomic(join(workspace, '.slopbrick', 'x.json'), { ok: true });
    expect(existsSync(join(workspace, '.slopbrick', 'x.json'))).toBe(true);
    expect(existsSync(join(workspace, '.slopbrick', '.slopbrick'))).toBe(false);
  });
});

describe('memory — freshness check', () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'usebrick-core-fresh-'));
    await mkdir(join(workspace, '.slopbrick'), { recursive: true });
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it('isInventoryFresh returns false when no cache exists', () => {
    const inv: InventoryFile = {
      version: '5',
      generatedAt: '2026-06-25T00:00:00.000Z',
      workspace,
      scannedFiles: 0,
      scanDurationMs: 0,
      patterns: [],
      components: [
        { name: 'B', files: [join(workspace, 'B.tsx')], fingerprint: 'x', hooks: [], props: [], line: 1, endLine: 1 },
      ],
    };
    expect(isInventoryFresh(inv, workspace)).toBe(false);
  });

  it('writeCacheFromInventory + isInventoryFresh returns true on unchanged files', async () => {
    const file = join(workspace, 'B.tsx');
    await writeFile(file, 'export function B() {}');
    const inv: InventoryFile = {
      version: '5',
      generatedAt: '2026-06-25T00:00:00.000Z',
      workspace,
      scannedFiles: 1,
      scanDurationMs: 1,
      patterns: [],
      components: [
        { name: 'B', files: [file], fingerprint: 'x', hooks: [], props: [], line: 1, endLine: 1 },
      ],
    };
    writeCacheFromInventory(workspace, inv, (f) => `hash-of-${f}`);
    expect(isInventoryFresh(inv, workspace)).toBe(true);
  });

  it('isInventoryFresh returns false after a file mtime change', async () => {
    const file = join(workspace, 'B.tsx');
    await writeFile(file, 'export function B() {}');
    const inv: InventoryFile = {
      version: '5',
      generatedAt: '2026-06-25T00:00:00.000Z',
      workspace,
      scannedFiles: 1,
      scanDurationMs: 1,
      patterns: [],
      components: [
        { name: 'B', files: [file], fingerprint: 'x', hooks: [], props: [], line: 1, endLine: 1 },
      ],
    };
    writeCacheFromInventory(workspace, inv, (f) => `hash-of-${f}`);
    expect(isInventoryFresh(inv, workspace)).toBe(true);

    // Bump mtime into the future so the freshness check sees drift.
    const future = new Date(Date.now() + 60_000);
    await utimes(file, future, future);

    expect(isInventoryFresh(inv, workspace)).toBe(false);
  });

  it('invalidateFile removes the file from the cache', async () => {
    const file = join(workspace, 'B.tsx');
    await writeFile(file, 'x');
    const inv: InventoryFile = {
      version: '5',
      generatedAt: '2026-06-25T00:00:00.000Z',
      workspace,
      scannedFiles: 1,
      scanDurationMs: 1,
      patterns: [],
      components: [
        { name: 'B', files: [file], fingerprint: 'x', hooks: [], props: [], line: 1, endLine: 1 },
      ],
    };
    writeCacheFromInventory(workspace, inv, () => 'h');
    expect(readCache(workspace)).toHaveLength(1);

    invalidateFile(workspace, file);
    expect(readCache(workspace)).toEqual([]);
  });
});
