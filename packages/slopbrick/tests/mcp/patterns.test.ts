import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, symlinkSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  extractImports,
  categorizeImport,
  buildPatternInventory,
  checkFileConstitution,
} from '../../src/mcp/patterns';
import { handleToolCall, TOOL_DEFINITIONS } from '../../src/mcp/tools';
import { DEFAULT_CONFIG } from '../../src/config';
import type { ResolvedConfig, Constitution } from '../../src/types';

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'slopbrick-patterns-'));
}

function writeFile(dir: string, rel: string, content: string): string {
  const full = join(dir, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf-8');
  return full;
}

const TEST_CONFIG: ResolvedConfig = {
  ...DEFAULT_CONFIG,
  include: ['src/**/*.{ts,tsx}'],
  exclude: [],
};

describe('extractImports', () => {
  it('extracts ESM imports', () => {
    const src = `import React from 'react';\nimport { foo } from 'zustand';\n`;
    expect(extractImports(src)).toEqual(['react', 'zustand']);
  });

  it('extracts type-only imports', () => {
    const src = `import type { Foo } from '@types/node';\nimport { Bar } from 'lodash';\n`;
    expect(extractImports(src)).toEqual(['@types/node', 'lodash']);
  });

  it('extracts side-effect imports', () => {
    const src = `import './styles.css';\nimport 'core-js/stable';\n`;
    expect(extractImports(src)).toEqual(['core-js/stable']);
  });

  it('extracts dynamic imports', () => {
    const src = `const m = await import('@tanstack/react-query');`;
    expect(extractImports(src)).toEqual(['@tanstack/react-query']);
  });

  it('extracts CommonJS requires', () => {
    const src = `const redux = require('redux');`;
    expect(extractImports(src)).toEqual(['redux']);
  });

  it('skips relative imports', () => {
    const src = `import x from '../foo';\nimport y from './bar';\nimport z from '/abs';\nimport a from 'zustand';\n`;
    expect(extractImports(src)).toEqual(['zustand']);
  });

  it('deduplicates while preserving first-seen order', () => {
    const src = `import 'react';\nimport 'zustand';\nimport 'react';\n`;
    expect(extractImports(src)).toEqual(['react', 'zustand']);
  });

  it('handles scoped packages with subpath correctly', () => {
    const src = `import { foo } from '@tanstack/react-query/devtools';`;
    expect(extractImports(src)).toEqual(['@tanstack/react-query/devtools']);
  });
});

describe('categorizeImport', () => {
  it('matches bare zustand to stateManagement', () => {
    expect(categorizeImport('zustand')).toEqual({
      field: 'stateManagement',
      signal: 'zustand',
      matchedPackage: 'zustand',
    });
  });

  it('matches @reduxjs/toolkit to redux signal', () => {
    const hit = categorizeImport('@reduxjs/toolkit');
    expect(hit?.signal).toBe('redux');
    expect(hit?.field).toBe('stateManagement');
  });

  it('strips subpath when looking up a scoped package', () => {
    expect(categorizeImport('@tanstack/react-query/devtools')?.signal).toBe('react-query');
  });

  it('returns null for unknown imports', () => {
    expect(categorizeImport('some-random-package')).toBeNull();
  });
});

describe('checkFileConstitution', () => {
  const constitution: Constitution = {
    stateManagement: ['zustand'],
    dataFetching: ['react-query'],
    uiLibrary: ['shadcn'],
  };

  it('returns empty violations when file imports conformant packages', () => {
    const src = `import { create } from 'zustand';\nimport { useQuery } from '@tanstack/react-query';\n`;
    const result = checkFileConstitution(src, constitution);
    expect(result.violations).toHaveLength(0);
    expect(result.imports).toEqual(['zustand', '@tanstack/react-query']);
  });

  it('flags a state-management violation', () => {
    const src = `import { createStore } from 'redux';\n`;
    const result = checkFileConstitution(src, constitution);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].category).toBe('stateManagement');
    expect(result.violations[0].declared).toEqual(['zustand']);
    expect(result.violations[0].message).toContain("'zustand'");
    expect(result.violations[0].message).toContain("'redux'");
  });

  it('flags a data-fetching violation via scoped subpath', () => {
    const src = `import { useSWRConfig } from 'swr';\n`;
    const result = checkFileConstitution(src, constitution);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].category).toBe('dataFetching');
  });

  it('reports no violations when constitution is undefined', () => {
    const src = `import x from 'redux';\n`;
    const result = checkFileConstitution(src, undefined);
    expect(result.violations).toHaveLength(0);
    expect(result.imports).toEqual(['redux']);
  });

  it('skips categories not declared in constitution', () => {
    const src = `import { css } from '@emotion/react';\n`;
    const result = checkFileConstitution(src, { stateManagement: ['zustand'] });
    // styling is not declared, so no violation even though emotion is imported
    expect(result.violations).toHaveLength(0);
  });

  it('explicit empty array declaration means "no constraint"', () => {
    const src = `import { create } from 'zustand';\n`;
    const result = checkFileConstitution(src, { stateManagement: [] });
    expect(result.violations).toHaveLength(0);
  });

  it('flags an import on the forbidden deny-list', () => {
    const src = `import moment from 'moment';\n`;
    const result = checkFileConstitution(src, { stateManagement: ['zustand'], forbidden: ['moment'] });
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].category).toBe('forbidden');
    expect(result.violations[0].import).toBe('moment');
    expect(result.violations[0].declared).toEqual(['moment']);
    expect(result.violations[0].message).toContain('deny-list');
  });

  it('reports both forbidden and canonical violations when an import hits the deny-list AND a category mismatch', () => {
    // `moment` is not on the canonical stateManagement signal table at
    // all (it's a date library), but importing it should still produce
    // a forbidden violation. The state-management violation is also
    // raised because the import's canonical category (none → no
    // mismatch) does NOT add a violation. Use a different example:
    // `redux` IS a canonical stateManagement import; declaring it as
    // forbidden yields BOTH violations.
    const src = `import { createStore } from 'redux';\n`;
    const result = checkFileConstitution(src, {
      stateManagement: ['zustand'],
      forbidden: ['redux'],
    });
    expect(result.violations).toHaveLength(2);
    const categories = result.violations.map((v) => v.category);
    expect(categories).toContain('forbidden');
    expect(categories).toContain('stateManagement');
  });

  it('empty forbidden list produces no forbidden violations', () => {
    const src = `import moment from 'moment';\nimport { create } from 'zustand';\n`;
    const result = checkFileConstitution(src, { stateManagement: ['zustand'], forbidden: [] });
    expect(result.violations.some((v) => v.category === 'forbidden')).toBe(false);
  });
});

describe('buildPatternInventory', () => {
  it('finds modal/dialog files by basename', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/components/Dialog.tsx', 'export const Dialog = () => null;');
      writeFile(dir, 'src/components/Modal.tsx', 'export const Modal = () => null;');
      const inv = await buildPatternInventory(dir, TEST_CONFIG);
      const names = inv.patterns.modal.map((p) => p.name);
      expect(names).toContain('Dialog');
      expect(names).toContain('Modal');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('finds button variants by basename', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/components/Button.tsx', '');
      writeFile(dir, 'src/components/IconButton.tsx', '');
      const inv = await buildPatternInventory(dir, TEST_CONFIG);
      const names = inv.patterns.button.map((p) => p.name);
      expect(names).toContain('Button');
      expect(names).toContain('IconButton');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not false-positive on rule files whose name contains component words', async () => {
    const dir = freshDir();
    try {
      // Rule-file basenames that happen to contain "button" or "modal"
      // should NOT be classified as components.
      writeFile(dir, 'src/rules/visual/math-button-label-uniformity.ts', '');
      writeFile(dir, 'src/rules/visual/dialog-spacing.ts', '');
      const inv = await buildPatternInventory(dir, TEST_CONFIG);
      expect(inv.patterns.button).toHaveLength(0);
      expect(inv.patterns.modal).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('finds api-client files by directory pattern', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/lib/api/users.ts', '');
      writeFile(dir, 'src/services/orders.ts', '');
      const inv = await buildPatternInventory(dir, TEST_CONFIG);
      expect(inv.patterns.api.length).toBeGreaterThan(0);
      const apiFiles = inv.patterns.api.flatMap((p) => p.files);
      expect(apiFiles.some((f) => f.endsWith('users.ts'))).toBe(true);
      expect(apiFiles.some((f) => f.endsWith('orders.ts'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects state-management library from imports', async () => {
    const dir = freshDir();
    try {
      writeFile(
        dir,
        'src/store/userStore.ts',
        `import { create } from 'zustand';\nexport const useUser = create(() => ({}));`,
      );
      const inv = await buildPatternInventory(dir, TEST_CONFIG);
      const stateNames = inv.patterns.state.map((p) => p.name);
      expect(stateNames).toContain('zustand');
      expect(inv.patterns.state[0].imports).toContain('zustand');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects data-fetching library from imports', async () => {
    const dir = freshDir();
    try {
      writeFile(
        dir,
        'src/api/users.ts',
        `import { useQuery } from '@tanstack/react-query';\nexport const useUsers = () => useQuery({});`,
      );
      const inv = await buildPatternInventory(dir, TEST_CONFIG);
      const fetchNames = inv.patterns.dataFetching.map((p) => p.name);
      expect(fetchNames).toContain('react-query');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('respects maxFiles cap', async () => {
    const dir = freshDir();
    try {
      for (let i = 0; i < 5; i++) {
        writeFile(dir, `src/components/Button${i}.tsx`, '');
      }
      const inv = await buildPatternInventory(dir, TEST_CONFIG, 2);
      expect(inv.scannedFiles).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('MCP file tools workspace boundary', () => {
  it('scans a workspace-relative file and rejects traversal outside the workspace', async () => {
    const dir = freshDir();
    const outside = freshDir();
    try {
      writeFile(dir, 'src/example.ts', 'export const value = 1;');
      writeFile(outside, 'secret.ts', 'export const secret = true;');
      const ctx = { cwd: dir, rules: [], config: TEST_CONFIG };

      const inside = await handleToolCall('slop_scan_file', { path: 'src/example.ts' }, ctx);
      expect(inside.isError).toBeFalsy();
      const payload = JSON.parse(inside.content[0]!.text);
      expect(payload.filePath).toBe(realpathSync(join(dir, 'src/example.ts')));
      // The tool definition promises the per-file Bayesian score. Keep the
      // probability and confidence tier on the wire so MCP clients can use
      // the advertised AI-likelihood signal instead of inferring it from
      // issue counts.
      expect(payload.compositeScore).toMatchObject({
        probability: expect.any(Number),
        confidenceTier: expect.any(String),
      });

      const traversal = await handleToolCall('slop_scan_file', { path: '../' + outside.split('/').pop() + '/secret.ts' }, ctx);
      expect(traversal.isError).toBe(true);
      expect(traversal.content[0]!.text).toContain('inside the MCP workspace');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('rejects symlinks that resolve outside the workspace for constitution checks', async () => {
    const dir = freshDir();
    const outside = freshDir();
    try {
      const secret = writeFile(outside, 'secret.ts', `import 'moment';`);
      symlinkSync(secret, join(dir, 'linked.ts'));
      const ctx = { cwd: dir, rules: [], config: TEST_CONFIG };
      const result = await handleToolCall('slop_check_constitution', { path: 'linked.ts' }, ctx);
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain('inside the MCP workspace');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe('MCP tool handlers', () => {
  it('exposes the new tools in TOOL_DEFINITIONS', () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toContain('slop_suggest');
    expect(names).toContain('slop_check_constitution');
  });

  it('routes slop_suggest through handleToolCall', async () => {
    const dir = freshDir();
    try {
      // A real React component declaration so the modal regex fires.
      writeFile(
        dir,
        'src/components/Dialog.tsx',
        `import React from 'react';\nexport function Dialog({ open, onClose, children }) {\n  return open ? <div role="dialog">{children}</div> : null;\n}\n`,
      );
      const result = await handleToolCall(
        'slop_suggest',
        {},
        { cwd: dir, rules: [], config: TEST_CONFIG },
      );
      expect(result.isError).toBeFalsy();
      const text = result.content[0].text;
      const parsed = JSON.parse(text) as {
        hint: string;
        doNotCreate: string[];
        declaredStack: string[];
        existingPatterns: {
          scannedFiles: number;
          patterns: { modal: { name: string }[] };
        };
      };
      expect(parsed.hint).toContain('instead of creating new ones');
      expect(parsed.doNotCreate).toBeDefined();
      expect(parsed.declaredStack).toBeDefined();
      expect(parsed.existingPatterns.patterns.modal.map((p) => p.name)).toContain('Dialog');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('routes slop_check_constitution and reports violations', async () => {
    const dir = freshDir();
    try {
      const file = writeFile(dir, 'src/store.ts', `import { createStore } from 'redux';\n`);
      const config: ResolvedConfig = {
        ...TEST_CONFIG,
        constitution: { stateManagement: ['zustand'] },
      };
      const result = await handleToolCall(
        'slop_check_constitution',
        { path: file },
        { cwd: dir, rules: [], config },
      );
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text) as {
        violationCount: number;
        violations: { category: string; import: string }[];
      };
      expect(parsed.violationCount).toBe(1);
      expect(parsed.violations[0].category).toBe('stateManagement');
      expect(parsed.violations[0].import).toBe('redux');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns toolError when slop_check_constitution path is missing', async () => {
    const result = await handleToolCall(
      'slop_check_constitution',
      {},
      { cwd: '/tmp', rules: [], config: TEST_CONFIG },
    );
    expect(result.isError).toBe(true);
  });

  it('returns toolError when slop_check_constitution path is unreadable', async () => {
    const dir = freshDir();
    try {
      const result = await handleToolCall(
        'slop_check_constitution',
        { path: join(dir, 'does-not-exist.ts') },
        { cwd: dir, rules: [], config: TEST_CONFIG },
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Cannot read file');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns toolError for unknown tool', async () => {
    const result = await handleToolCall(
      'slop_nonexistent',
      {},
      { cwd: '/tmp', rules: [], config: TEST_CONFIG },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown tool');
  });

  // v0.41.0 (Sprint 2, task 2b.0): the previously-split
  // runSuggest / runSuggestWithStructure pair is now a single
  // handler behind `runSuggest(args, ctx, { includeStructure })`.
  // The dispatch contract is:
  //
  //   - `slop_suggest` → runSuggest(args, ctx) — slow path,
  //     always JSON.
  //   - `slop_suggest_with_structure` → runSuggest(args, ctx,
  //     { includeStructure: true }) — fast path when
  //     `.slopbrick/structure.md` exists, slow-path-with-hint
  //     otherwise.

  it('routes slop_suggest_with_structure through the consolidated runSuggest (slow path → annotated)', async () => {
    // No .slopbrick/structure.md on disk: the fast path is
    // unreachable, so the handler falls back to the slow path
    // and attaches a `structureHint` so the agent learns to
    // run `slopbrick scan` next time.
    const dir = freshDir();
    try {
      writeFile(
        dir,
        'src/components/Dialog.tsx',
        `import React from 'react'; export function Dialog() { return <div role="dialog" />; }`,
      );
      const result = await handleToolCall(
        'slop_suggest_with_structure',
        {},
        { cwd: dir, rules: [], config: TEST_CONFIG },
      );
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text) as Record<string, unknown>;
      // Slow-path shape preserved: hint, doNotCreate, declaredStack,
      // existingPatterns all present.
      expect(parsed.hint).toContain('instead of creating new ones');
      expect(parsed.doNotCreate).toBeDefined();
      expect(parsed.declaredStack).toBeDefined();
      expect(parsed.existingPatterns).toBeDefined();
      // Plus the upgrade hint.
      expect(parsed.structureHint).toContain('structure.md');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('routes slop_suggest_with_structure through the fast path when structure.md exists', async () => {
    // Seed `.slopbrick/structure.md` so the fast path wins. The
    // handler should return the markdown verbatim (single text
    // block, no JSON parsing).
    const dir = freshDir();
    try {
      const memoryDir = join(dir, '.slopbrick');
      mkdirSync(memoryDir, { recursive: true });
      // Write a sentinel string the handler will return verbatim.
      // The fast-path code reads `readStructureMarkdown(ctx.cwd)`
      // and passes the result through unchanged, so any non-empty
      // markdown trips the fast-path branch.
      const marker = '# Fast-path marker\n\n(ignore the contents — the handler returns this verbatim)\n';
      writeFileSync(join(memoryDir, 'structure.md'), marker, 'utf-8');
      const result = await handleToolCall(
        'slop_suggest_with_structure',
        {},
        { cwd: dir, rules: [], config: TEST_CONFIG },
      );
      expect(result.isError).toBeFalsy();
      // The marker round-trips intact — that's the contract.
      expect(result.content[0].text).toContain('Fast-path marker');
      // The fast-path response is raw markdown, NOT a JSON object
      // with `hint` / `doNotCreate` / `existingPatterns`. Trying to
      // JSON.parse it must throw — that proves we didn't accidentally
      // take the slow path.
      expect(() => JSON.parse(result.content[0].text)).toThrow();
      // Also: the response must NOT contain any of the slow-path
      // keys (defensive — guards against a future refactor that
      // accidentally wraps the markdown in an envelope).
      expect(result.content[0].text).not.toContain('"hint"');
      expect(result.content[0].text).not.toContain('"doNotCreate"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('routes slop_suggest through the consolidated runSuggest (slow path, no hint)', async () => {
    // The slow-path variant (`slop_suggest`) must NOT attach the
    // structureHint — that's a contract preservation: agents that
    // explicitly asked for the JSON form don't want the upgrade
    // hint polluting the response.
    const dir = freshDir();
    try {
      writeFile(
        dir,
        'src/components/Card.tsx',
        `export function Card() { return <div />; }`,
      );
      const result = await handleToolCall(
        'slop_suggest',
        {},
        { cwd: dir, rules: [], config: TEST_CONFIG },
      );
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text) as Record<string, unknown>;
      expect(parsed.hint).toContain('instead of creating new ones');
      expect(parsed.structureHint).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
