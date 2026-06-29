import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  renderStructureMarkdown,
  writeStructureMarkdown,
  readStructureMarkdown,
} from '../../src/engine/structure-md';
import {
  STRUCTURE_SCHEMA_VERSION,
  type ComponentFingerprint,
  type ConstitutionFile,
  type InventoryFile,
  type StructurePattern,
} from '@usebrick/core';

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'slopbrick-memory-md-'));
}

function makeInventory(overrides: Partial<InventoryFile> = {}): InventoryFile {
  return {
    version: STRUCTURE_SCHEMA_VERSION,
    generatedAt: '2026-06-25T12:00:00.000Z',
    workspace: '/repo',
    scannedFiles: 10,
    scanDurationMs: 14200,
    patterns: [],
    components: [],
    ...overrides,
  };
}

function makeConstitution(
  overrides: Partial<ConstitutionFile> = {},
): ConstitutionFile {
  return {
    version: STRUCTURE_SCHEMA_VERSION,
    generatedAt: '2026-06-25T12:00:00.000Z',
    workspace: '/repo',
    declared: {},
    forbidden: [],
    forbiddenPrefixes: [],
    ...overrides,
  };
}

function makePattern(overrides: Partial<StructurePattern>): StructurePattern {
  return {
    category: 'stateManagement',
    name: 'zustand',
    imports: ['zustand'],
    fileCount: 1,
    ...overrides,
  };
}

function makeComponent(
  overrides: Partial<ComponentFingerprint>,
): ComponentFingerprint {
  return {
    name: 'Button',
    files: ['src/components/Button.tsx'],
    fingerprint: 'fp-button-1',
    hooks: [],
    props: [],
    line: 1,
    endLine: 20,
    ...overrides,
  };
}

describe('renderStructureMarkdown', () => {
  it('produces all sections in the documented order', () => {
    const md = renderStructureMarkdown(makeInventory(), makeConstitution());
    const sections = [
      '# slopbrick memory',
      '## Detected patterns (canonical, use these)',
      '## Canonical components',
      '## Declared constitution',
      '## DO NOT CREATE',
      '## Top issues (most impactful)',
    ];
    let prev = -1;
    for (const heading of sections) {
      const idx = md.indexOf(heading);
      expect(idx, `expected heading "${heading}" in output`).toBeGreaterThan(prev);
      prev = idx;
    }
  });

  it('produces a valid empty markdown for an empty inventory + constitution', () => {
    const md = renderStructureMarkdown(makeInventory(), makeConstitution());
    expect(md).toContain('# slopbrick memory');
    expect(md).toContain('_No patterns detected._');
    expect(md).toContain('_No components detected._');
    expect(md).toContain('_No constitution declared._');
    expect(md).toContain('_No deny-list declared._');
    expect(md).toContain('## Top issues (most impactful)');
  });

  it('emits the correct header metadata (Generated, Workspace, Scanned files, Scan duration)', () => {
    const md = renderStructureMarkdown(
      makeInventory({
        generatedAt: '2026-06-25T12:00:00.000Z',
        workspace: '/path/to/repo',
        scannedFiles: 312,
        scanDurationMs: 14200,
      }),
      makeConstitution(),
    );
    expect(md).toContain('Generated: 2026-06-25T12:00:00.000Z');
    expect(md).toContain('Workspace: /path/to/repo');
    expect(md).toContain('Scanned files: 312');
    expect(md).toContain('Scan duration: 14.2s');
  });

  it('formats scan duration as ms, seconds, or minutes+seconds', () => {
    const ms = renderStructureMarkdown(makeInventory({ scanDurationMs: 250 }), makeConstitution());
    expect(ms).toContain('Scan duration: 250ms');
    const sec = renderStructureMarkdown(makeInventory({ scanDurationMs: 14200 }), makeConstitution());
    expect(sec).toContain('Scan duration: 14.2s');
    const min = renderStructureMarkdown(makeInventory({ scanDurationMs: 83_000 }), makeConstitution());
    expect(min).toContain('Scan duration: 1m 23s');
  });

  it('sorts patterns within a category by fileCount desc, name asc tiebreak', () => {
    const patterns: StructurePattern[] = [
      makePattern({ category: 'dataFetching', name: 'swr', fileCount: 3, imports: ['swr'] }),
      makePattern({ category: 'dataFetching', name: 'react-query', fileCount: 15, imports: ['@tanstack/react-query'] }),
      makePattern({ category: 'dataFetching', name: 'apollo', fileCount: 15, imports: ['@apollo/client'] }),
    ];
    const md = renderStructureMarkdown(
      makeInventory({ patterns }),
      makeConstitution(),
    );
    // Find the Data fetching section.
    const dataSection = md.slice(
      md.indexOf('### Data fetching'),
      md.indexOf('### ', md.indexOf('### Data fetching') + 1),
    );
    const apolloPos = dataSection.indexOf('**apollo**');
    const rqPos = dataSection.indexOf('**react-query**');
    const swrPos = dataSection.indexOf('**swr**');
    // fileCount=15 entries come first, in name asc tiebreak ('apollo' <
    // 'react-query'); fileCount=3 entry last.
    expect(apolloPos).toBeGreaterThan(-1);
    expect(rqPos).toBeGreaterThan(-1);
    expect(swrPos).toBeGreaterThan(-1);
    expect(apolloPos).toBeLessThan(rqPos);
    expect(rqPos).toBeLessThan(swrPos);
  });

  it("lists the constitution's forbidden entries under DO NOT CREATE", () => {
    const md = renderStructureMarkdown(
      makeInventory(),
      makeConstitution({ forbidden: ['redux', 'mobx'] }),
    );
    expect(md).toContain('- redux (forbidden)');
    expect(md).toContain('- mobx (forbidden)');
  });

  it("lists the constitution's forbiddenPrefixes with the documented scope format", () => {
    const md = renderStructureMarkdown(
      makeInventory(),
      makeConstitution({ forbiddenPrefixes: ['@scope/', '@internal/'] }),
    );
    expect(md).toContain('- @scope/ (any package under this scope)');
    expect(md).toContain('- @internal/ (any package under this scope)');
  });

  it('merges component fingerprints that share the same name across multiple files', () => {
    const components: ComponentFingerprint[] = [
      makeComponent({
        name: 'Button',
        files: ['src/components/Button.tsx'],
        hooks: ['useState'],
        props: ['variant', 'children'],
        fingerprint: 'fp-A',
      }),
      makeComponent({
        name: 'Button',
        files: ['src/components/IconButton.tsx', 'src/components/Button.tsx'],
        hooks: [],
        props: [],
        fingerprint: 'fp-B',
      }),
      makeComponent({
        name: 'Button',
        files: ['src/components/LinkButton.tsx'],
        hooks: [],
        props: [],
        fingerprint: 'fp-C',
      }),
    ];
    const md = renderStructureMarkdown(makeInventory({ components }), makeConstitution());
    // Only one Button bullet. Use a non-word-boundary anchor: `**Button**`
    // is followed by a space, not a word character, so `\b` would not match.
    const buttonMatches = md.match(/^- \*\*Button\*\* \(/gm);
    expect(buttonMatches).not.toBeNull();
    expect(buttonMatches?.length).toBe(1);
    // The merged entry shows 3 distinct files (deduped across fingerprints).
    expect(md).toMatch(/\*\*Button\*\* \(defined in 3 files/);
    // First non-empty hooks/props win.
    expect(md).toContain('hooks: useState');
    expect(md).toContain('props: variant, children');
  });

  it('renders the documented component format: defined in N files; props: ...; hooks: ...', () => {
    const components: ComponentFingerprint[] = [
      makeComponent({
        name: 'Modal',
        files: ['src/components/Modal.tsx'],
        hooks: ['useState', 'useEffect'],
        props: ['open', 'onClose'],
      }),
    ];
    const md = renderStructureMarkdown(makeInventory({ components }), makeConstitution());
    expect(md).toContain(
      '- **Modal** (defined in 1 file; props: open, onClose; hooks: useState, useEffect)',
    );
  });

  it('omits empty props/hooks segments from the component line', () => {
    const components: ComponentFingerprint[] = [
      makeComponent({ name: 'Plain', files: ['src/Plain.tsx'] }),
    ];
    const md = renderStructureMarkdown(makeInventory({ components }), makeConstitution());
    expect(md).toContain('- **Plain** (defined in 1 file)');
    expect(md).not.toContain('props:');
    expect(md).not.toContain('hooks:');
  });

  it('escapes markdown-significant characters in component names, props, hooks, declared values, and forbidden entries', () => {
    const patterns: StructurePattern[] = [
      makePattern({
        category: 'stateManagement',
        name: 'weird`name',
        imports: ['x'],
        fileCount: 1,
      }),
    ];
    const components: ComponentFingerprint[] = [
      makeComponent({
        name: 'Comp|with|pipes',
        files: ['src/Comp.tsx'],
        hooks: ['use{Effect}'],
        props: ['a`b', 'c|d'],
      }),
    ];
    const md = renderStructureMarkdown(
      makeInventory({ patterns, components }),
      makeConstitution({
        declared: { stateManagement: 'cool`state' },
        forbidden: ['pkg|bad', 'weird{thing}'],
        forbiddenPrefixes: [],
      }),
    );
    // Backticks, pipes, curly braces escaped in all rendered fields.
    expect(md).toContain('weird\\`name');
    expect(md).toContain('Comp\\|with\\|pipes');
    expect(md).toContain('use\\{Effect\\}');
    expect(md).toContain('a\\`b');
    expect(md).toContain('c\\|d');
    expect(md).toContain('cool\\`state');
    expect(md).toContain('pkg\\|bad');
    expect(md).toContain('weird\\{thing\\}');
    // Raw unescaped forms must NOT appear (would break inline code / tables).
    expect(md).not.toContain('weird`name');
    expect(md).not.toContain('Comp|with|pipes');
    expect(md).not.toContain('use{Effect}');
  });

  it('uses singular "file"/"import" and plural forms based on counts', () => {
    const patterns: StructurePattern[] = [
      makePattern({ category: 'stateManagement', name: 'one', fileCount: 1, imports: ['x'] }),
      makePattern({ category: 'stateManagement', name: 'many', fileCount: 7, imports: ['x', 'y'] }),
    ];
    const md = renderStructureMarkdown(makeInventory({ patterns }), makeConstitution());
    expect(md).toContain('(1 file, 1 import)');
    expect(md).toContain('(7 files, 2 imports)');
  });
});

describe('writeStructureMarkdown + readStructureMarkdown', () => {
  let dir: string;

  beforeEach(() => {
    dir = freshDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips the rendered markdown content', async () => {
    const md = renderStructureMarkdown(makeInventory(), makeConstitution());
    await writeStructureMarkdown(dir, md);
    const read = await readStructureMarkdown(dir);
    expect(read).toBe(md);
  });

  it('creates the .slopbrick directory if it does not exist', async () => {
    await writeStructureMarkdown(dir, '# hello\n');
    // The file should be readable.
    const read = await readStructureMarkdown(dir);
    expect(read).toBe('# hello\n');
    // And the directory should exist on disk.
    const fs = await import('node:fs');
    expect(fs.existsSync(join(dir, '.slopbrick'))).toBe(true);
  });

  it('overwrites an existing structure.md without losing data', async () => {
    await writeStructureMarkdown(dir, 'first version\n');
    await writeStructureMarkdown(dir, 'second version\n');
    const read = await readStructureMarkdown(dir);
    expect(read).toBe('second version\n');
  });

  it('returns null when .slopbrick/structure.md does not exist', async () => {
    const read = await readStructureMarkdown(dir);
    expect(read).toBeNull();
  });

  it('readStructureMarkdown does not throw on a malformed file', async () => {
    // writeFileSync at a path that's actually a directory would throw on read;
    // we just ensure the helper catches any error and returns null instead.
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(dir, '.slopbrick'), { recursive: true });
    // Make structure.md point at a directory — readFileSync will throw ENOTDIR/EISDIR.
    mkdirSync(join(dir, '.slopbrick', 'structure.md'), { recursive: true });
    const read = await readStructureMarkdown(dir);
    expect(read).toBeNull();
  });
});

describe('readStructureMarkdown (additional)', () => {
  it('returns null for a workspace that has no .slopbrick directory', async () => {
    const dir = freshDir();
    try {
      const read = await readStructureMarkdown(dir);
      expect(read).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});