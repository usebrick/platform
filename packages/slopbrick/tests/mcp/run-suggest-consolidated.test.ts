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
// ---------------------------------------------------------------------------
// v0.41.0 (Sprint 2, task 2b.2): `runSuggest` surfaces the
// project-level compositeScore from .slopbrick/health.json when
// present. The field is OPTIONAL on the response — omitted when
// health.json is missing or pre-v0.18.2 (no composite field). Wire
// format stays backward-compatible for callers that key on the
// legacy four-key payload (hint + doNotCreate + declaredStack +
// existingPatterns).
// ---------------------------------------------------------------------------

import { STRUCTURE_SCHEMA_VERSION } from '@usebrick/core';

describe('runSuggest (consolidated) — 2b.2 compositeScore surface', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'slopbrick-run-suggest-composite-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('omits compositeScore when .slopbrick/health.json is absent', async () => {
    const ctx = makeCtx(cwd);
    const result = await runSuggest({}, ctx);
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed.compositeScore).toBeUndefined();
    // Backward compat: legacy fields still present.
    expect(parsed.hint).toBeDefined();
    expect(parsed.doNotCreate).toBeDefined();
    expect(parsed.declaredStack).toBeDefined();
    expect(parsed.existingPatterns).toBeDefined();
  });

  it('surfaces compositeScore when health.json carries it', async () => {
    const slopbrickDir = join(cwd, '.slopbrick');
    mkdirSync(slopbrickDir, { recursive: true });
    const composite = {
      mean: 0.72,
      max: 0.91,
      tier: 'LIKELY_AI' as const,
      fileCount: 42,
    };
    writeFileSync(
      join(slopbrickDir, 'health.json'),
      JSON.stringify({
        version: STRUCTURE_SCHEMA_VERSION,
        generatedAt: '2026-07-01T00:00:00.000Z',
        workspace: cwd,
        aiSlopScore: 30,
        engineeringHygiene: 80,
        security: 95,
        repositoryHealth: 60,
        issueCounts: { high: 0, medium: 0, low: 0 },
        compositeScore: composite,
      }),
      'utf-8',
    );

    const ctx = makeCtx(cwd);
    const result = await runSuggest({}, ctx);
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed.compositeScore).toEqual(composite);
    // v0.43.0: when compositeScore is present, also surface
    // scoreBriefs so MCP clients (Cursor, Claude Code, Continue)
    // can explain what the score means to the agent without
    // needing the docs.
    expect(parsed.scoreBriefs).toEqual({
      aiSlopScore: 'raw amount of AI slop, 0-100',
      engineeringHygiene: 'cross-category consistency, 0-100',
      security: 'security posture, 0-100 (higher is better)',
      repositoryHealth: 'weighted composite, 0-100',
    });
  });

  it('omits compositeScore when health.json predates v0.18.2 (no composite field)', async () => {
    const slopbrickDir = join(cwd, '.slopbrick');
    mkdirSync(slopbrickDir, { recursive: true });
    // Schema-correct (HealthFile v5) but missing the compositeScore
    // field — simulates a pre-v0.18.2 health.json payload where the
    // Bayesian aggregate didn't exist yet.
    writeFileSync(
      join(slopbrickDir, 'health.json'),
      JSON.stringify({
        version: STRUCTURE_SCHEMA_VERSION,
        generatedAt: '2026-06-01T00:00:00.000Z',
        workspace: cwd,
        aiSlopScore: 30,
        engineeringHygiene: 80,
        security: 95,
        repositoryHealth: 60,
        issueCounts: { high: 0, medium: 0, low: 0 },
      }),
      'utf-8',
    );

    const ctx = makeCtx(cwd);
    const result = await runSuggest({}, ctx);
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed.compositeScore).toBeUndefined();
  });

  it('omits compositeScore when health.json fails schema validation (graceful)', async () => {
    const slopbrickDir = join(cwd, '.slopbrick');
    mkdirSync(slopbrickDir, { recursive: true });
    // Schema-INVALID payload (missing required fields); loadHealth
    // returns null and runSuggest should silently omit compositeScore
    // rather than crash.
    writeFileSync(
      join(slopbrickDir, 'health.json'),
      JSON.stringify({ schemaVersion: '0', broken: true }),
      'utf-8',
    );

    const ctx = makeCtx(cwd);
    const result = await runSuggest({}, ctx);
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed.compositeScore).toBeUndefined();
  });
});
