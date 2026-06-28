/**
 * Integration test for the full .slopbrick/ artifact pipeline.
 *
 * Walks the same write path `scan.ts` does on completion:
 *   1. buildInventoryFromScan → saveInventory → .slopbrick/inventory.json
 *   2. buildConstitutionFromConfig → saveConstitution → .slopbrick/constitution.json
 *   3. buildHealthFromReport → saveHealth → .slopbrick/health.json
 *   4. renderStructureMarkdown → writeStructureMarkdown → .slopbrick/structure.md
 *
 * Then loads each one back and verifies the schema-valid round-trip.
 * No actual file scanning is performed — we synthesize a ProjectReport
 * to drive the pure functions.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildInventoryFromScan,
  buildConstitutionFromConfig,
  buildHealthFromReport,
  saveInventory,
  type MemoryPatternInventory,
} from '@usebrick/engine';
import { computeFileHash } from '../../src/engine/cache-incremental.js';

const emptyPatternInventory: MemoryPatternInventory = {
  scannedFiles: 1,
  patterns: {
    modal: [],
    button: [],
    api: [],
    state: [],
    dataFetching: [],
    service: [],
    route: [],
    ormModel: [],
  },
};
import {
  loadInventory,
  loadConstitution,
  loadHealth,
  saveConstitution,
  saveHealth,
  isInventoryFile,
  isConstitutionFile,
  isHealthFile,
  STRUCTURE_SCHEMA_VERSION,
  type InventoryFile,
  type ConstitutionFile,
  type HealthFile,
} from '@usebrick/core';
import { renderStructureMarkdown, readStructureMarkdown, writeStructureMarkdown } from '../../src/engine/structure-md';
import { DEFAULT_CONFIG } from '../../src/config';
import { VERSION, type FileScanResult, type ProjectReport, type ResolvedConfig } from '../../src/types';

const createTmpDir = () => mkdtempSync(join(tmpdir(), 'slopbrick-memart-'));

function makeReport(overrides: Partial<ProjectReport> = {}): ProjectReport {
  return {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    // v0.15.0 U.4+: 4-score model replaces single slopIndex.
    aiQuality: 12, engineeringHygiene: 12, security: 12, repositoryHealth: 12,
    assemblyHealth: 88,
    categoryScores: {
      visual: 5, typo: 0, wcag: 0, layout: 0, component: 0,
      logic: 0, arch: 0, perf: 0, security: 0, test: 0, docs: 0,
      db: 0, ai: 7, context: 0, product: 0, i18n: 0,
    },
    p90Score: 15,
    peakScore: 20,
    boundaryScore: 0,
    contextScore: 0,
    visualScore: 0,
    componentCount: 1,
    fileCount: 1,
    totalScore: 0, // legacy field, removed in the v0.15.0 cleanup
    thresholds: { meanSlop: 25, p90Slop: 50, individualSlopThreshold: 50 },
    components: [],
    issues: [
      { ruleId: 'ai/comment-ratio', severity: 'high' } as any,
      { ruleId: 'ai/comment-ratio', severity: 'medium' } as any,
      { ruleId: 'visual/duplicate-class', severity: 'low' } as any,
    ],
    ...overrides,
  };
}

const makeConfig = (overrides: Partial<ResolvedConfig> = {}): ResolvedConfig => ({
  ...DEFAULT_CONFIG,
  constitution: undefined,
  ...overrides,
} as ResolvedConfig);

describe('.slopbrick/ artifact pipeline (v0.14.5d)', () => {
  let dir: string;
  beforeEach(() => { dir = createTmpDir(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('writes all 4 artifacts (inventory, constitution, health, structure.md) and round-trips each', async () => {
    // Minimal scan-result shape — engine/memory's buildInventoryFromScan
    // needs `cwd` + `results` (an array of FileScanResult). Empty is fine
    // for the inventory build; the health snapshot comes straight from
    // the synthesized report.
    const scanResult = { cwd: dir, results: [] as readonly FileScanResult[] };
    const config = makeConfig();
    const durationMs = 250;

    // 1. inventory
    const inventory: InventoryFile = buildInventoryFromScan(
      scanResult, emptyPatternInventory, durationMs,
    );
    saveInventory(dir, inventory, computeFileHash);

    // 2. constitution
    const constitution: ConstitutionFile = buildConstitutionFromConfig(config, dir);
    saveConstitution(dir, constitution);

    // 3. health
    const report = makeReport({ generatedAt: inventory.generatedAt });
    const health: HealthFile = {
      version: STRUCTURE_SCHEMA_VERSION,
      generatedAt: inventory.generatedAt,
      workspace: dir,
      // v0.15.0 U.4+: 4-score model replaces single slopIndex.
      aiQuality: 12, engineeringHygiene: 12, security: 12, repositoryHealth: 12,
      categoryScores: { ai: 7, visual: 5 },
      issueCounts: { high: 1, medium: 1, low: 1 },
      topOffenseIds: ['ai/comment-ratio', 'visual/duplicate-class'],
      scanDurationMs: durationMs,
    };
    saveHealth(dir, health);

    // 4. structure.md (agent-readable summary)
    const md = renderStructureMarkdown(inventory, constitution);
    await writeStructureMarkdown(dir, md);

    // ---- Verify all 4 exist on disk ------------------------------------
    expect(existsSync(join(dir, '.slopbrick', 'inventory.json'))).toBe(true);
    expect(existsSync(join(dir, '.slopbrick', 'constitution.json'))).toBe(true);
    expect(existsSync(join(dir, '.slopbrick', 'health.json'))).toBe(true);
    expect(existsSync(join(dir, '.slopbrick', 'structure.md'))).toBe(true);

    // ---- Verify each round-trips through the loader + validator ---------
    const loadedInv = loadInventory(dir);
    expect(loadedInv).not.toBeNull();
    expect(isInventoryFile(loadedInv)).toBe(true);
    expect(loadedInv!.version).toBe('3');
    expect(loadedInv!.workspace).toBe(dir);

    const loadedCon = loadConstitution(dir);
    expect(loadedCon).not.toBeNull();
    expect(isConstitutionFile(loadedCon)).toBe(true);

    const loadedHealth = loadHealth(dir);
    expect(loadedHealth).not.toBeNull();
    expect(isHealthFile(loadedHealth)).toBe(true);
    expect(loadedHealth!.aiQuality).toBe(12);
    expect(loadedHealth!.issueCounts).toEqual({ high: 1, medium: 1, low: 1 });
    expect(loadedHealth!.topOffenseIds).toEqual(['ai/comment-ratio', 'visual/duplicate-class']);

    const loadedMd = await readStructureMarkdown(dir);
    expect(loadedMd).not.toBeNull();
    expect(loadedMd!.length).toBeGreaterThan(100);
    expect(loadedMd).toContain('# slopbrick memory');
    expect(loadedMd).toContain(`Workspace: ${dir}`);
  });

  it('buildHealthFromReport aggregates severities and picks top 3 offense IDs deterministically', () => {
    const r = makeReport({
      issues: [
        { ruleId: 'b/zzz', severity: 'low' } as any,
        { ruleId: 'a/aaa', severity: 'high' } as any,
        { ruleId: 'a/aaa', severity: 'high' } as any,
        { ruleId: 'a/aaa', severity: 'medium' } as any,
        { ruleId: 'b/zzz', severity: 'low' } as any,
        { ruleId: 'c/yyy', severity: 'medium' } as any,
      ],
    });
    const out = buildHealthFromReport(r, '/w', { scanDurationMs: 99 });
    // Severity counts: high=2, medium=2, low=2
    expect(out.issueCounts).toEqual({ high: 2, medium: 2, low: 2 });
    // topOffenseIds sorted by count desc, then name asc → a/aaa(3) > b/zzz(2) > c/yyy(1)
    expect(out.topOffenseIds).toEqual(['a/aaa', 'b/zzz', 'c/yyy']);
  });

  it('loadHealth returns null for missing file (graceful degradation)', () => {
    expect(loadHealth(dir)).toBeNull();
  });
});
