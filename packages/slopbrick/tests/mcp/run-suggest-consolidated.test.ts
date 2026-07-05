// v0.41.0 (Sprint 2, task 2b.0): tests for the consolidated
// `runSuggest(args, ctx, { includeStructure })` in
// `src/mcp/tools.ts`. The architecture review (F4) found that the
// previous design had two near-duplicate functions:
//   - `runSuggest(args, ctx)` — slow path, re-scans + returns JSON
//   - `runSuggestWithStructure(args, ctx)` — fast path, reads cached
//     `.slopbrick/structure.md` or annotates a slow-path fallback
//
// They've been consolidated into `runSuggest(args, ctx, options)`
// where `options.includeStructure: true` opts into the fast path.
// These tests pin the new contract: (a) the legacy `slop_suggest`
// behavior is unchanged, (b) `includeStructure: true` returns the
// cached markdown when present, (c) it falls back to JSON with
// `structureHint` when absent, (d) the backward-compat re-export
// `runSuggestWithStructure` still works.

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  runSuggest,
  STRUCTURE_NOT_FOUND_HINT,
} from '../../src/mcp/tools';
import { runSuggestWithStructure } from '../../src/mcp/slop-suggest-structure';
import { DEFAULT_CONFIG } from '../../src/config';
import type { ToolContext } from '../../src/mcp/tools';
import type { ResolvedConfig } from '../../src/types';

function makeCtx(cwd: string, overrides: Partial<ResolvedConfig> = {}): ToolContext {
  return {
    cwd,
    rules: [],
    config: { ...DEFAULT_CONFIG, ...overrides } as ResolvedConfig,
  };
}

describe('runSuggest (consolidated, v0.41.0 task 2b.0)', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'slopbrick-run-suggest-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('legacy behavior (no includeStructure): returns JSON payload without structureHint', async () => {
    const ctx = makeCtx(cwd);
    const result = await runSuggest({}, ctx);

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    // Legacy wire shape: hint + doNotCreate + declaredStack + existingPatterns
    expect(parsed.hint).toBeDefined();
    expect(parsed.doNotCreate).toBeDefined();
    expect(parsed.declaredStack).toBeDefined();
    expect(parsed.existingPatterns).toBeDefined();
    // No structureHint in the legacy wire format.
    expect(parsed.structureHint).toBeUndefined();
  });

  it('legacy behavior (includeStructure: false): also returns JSON without structureHint', async () => {
    const ctx = makeCtx(cwd);
    const result = await runSuggest({}, ctx, { includeStructure: false });
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed.structureHint).toBeUndefined();
  });

  it('includeStructure: true with no cached structure.md: returns JSON + structureHint', async () => {
    const ctx = makeCtx(cwd);
    const result = await runSuggest({}, ctx, { includeStructure: true });

    expect(result.isError).toBeFalsy();
    const text = result.content[0]!.text;
    // The slow-path response is JSON, not markdown.
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(parsed.hint).toBeDefined();
    expect(parsed.existingPatterns).toBeDefined();
    expect(parsed.structureHint).toBe(STRUCTURE_NOT_FOUND_HINT);
  });

  it('includeStructure: true with cached structure.md: returns markdown fast-path', async () => {
    // Plant a cached structure.md so the fast-path fires.
    const slopbrickDir = join(cwd, '.slopbrick');
    mkdirSync(slopbrickDir, { recursive: true });
    const cached = '# Cached structure\n\nModals: Modal.tsx\n';
    writeFileSync(join(slopbrickDir, 'structure.md'), cached, 'utf-8');

    const ctx = makeCtx(cwd);
    const result = await runSuggest({}, ctx, { includeStructure: true });

    expect(result.isError).toBeFalsy();
    // Fast path returns the markdown verbatim — no JSON wrapping.
    expect(result.content[0]!.text).toBe(cached);
  });

  it('STRUCTURE_NOT_FOUND_HINT is the same constant that the legacy function used', () => {
    // Wire-format compat: any caller that grepped for the previous
    // string still finds it.
    expect(STRUCTURE_NOT_FOUND_HINT).toBe(
      'No .slopbrick/structure.md found. Run `slopbrick scan` to persist the pattern inventory, then call this tool again for the O(read file) fast path.',
    );
  });
});

describe('runSuggestWithStructure (backward-compat re-export)', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'slopbrick-run-suggest-with-structure-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('delegates to runSuggest with includeStructure: true', async () => {
    const ctx = makeCtx(cwd);
    const result = await runSuggestWithStructure({}, ctx);
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    // Same wire format as the consolidated function in slow-path mode.
    expect(parsed.structureHint).toBe(STRUCTURE_NOT_FOUND_HINT);
    expect(parsed.hint).toBeDefined();
    expect(parsed.existingPatterns).toBeDefined();
  });

  it('returns cached markdown when structure.md exists (fast path)', async () => {
    const slopbrickDir = join(cwd, '.slopbrick');
    mkdirSync(slopbrickDir, { recursive: true });
    const cached = '# Fast path\n';
    writeFileSync(join(slopbrickDir, 'structure.md'), cached, 'utf-8');

    const ctx = makeCtx(cwd);
    const result = await runSuggestWithStructure({}, ctx);
    expect(result.content[0]!.text).toBe(cached);
  });
});