import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readRuns,
  appendRun,
  buildInventoryFromScan,
  buildConstitutionFromConfig,
  buildHealthFromReport,
  saveInventory,
  type MemoryIO,
  type MemoryPatternInventory,
  type MemoryPatternMatch,
} from '@usebrick/engine';
import { fsMemoryIO } from '../../src/cli/memory-io.js';
import {
  loadInventory,
  loadConstitution,
  saveConstitution,
  loadHealth,
  saveHealth,
  isHealthFile,
  isInventoryFresh,
  invalidateFile,
  STRUCTURE_SCHEMA_VERSION,
  healthPath,
  type InventoryFile,
  type ConstitutionFile,
  type HealthFile,
  type StructurePattern,
  type ComponentFingerprint,
} from '@usebrick/core';
import { DEFAULT_CONFIG } from '../../src/config';
import { VERSION, type FileScanResult, type ProjectReport, type ResolvedConfig } from '../../src/types';
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

const createTmpDir = () => mkdtempSync(join(tmpdir(), 'slopbrick-memory-test-'));

function makeReport(slopIndex = 10, overrides: Partial<ProjectReport> = {}): ProjectReport {
  return {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    slopIndex,
    assemblyHealth: 90,
    totalScore: slopIndex,
    categoryScores: {
      visual: 0,
      typo: 0,
      wcag: 0,
      layout: 0,
      component: 0,
      logic: 0,
      arch: 0,
      perf: 0,
      security: 0,      test: 0,    docs: 0,    db: 0,    ai: 0,    context: 0,    product: 0,    i18n: 0,},
    p90Score: 15,
    peakScore: 20,
    boundaryScore: 0,
    contextScore: 0,
    visualScore: 0,
    componentCount: 2,
    fileCount: 1,
    thresholds: { meanSlop: 25, p90Slop: 50, individualSlopThreshold: 50 },
    components: [],
    issues: [],
    ...overrides,
  };
}

describe('readRuns', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty array when no memory file exists', async () => {
    expect(await readRuns(dir, fsMemoryIO)).toEqual([]);
  });

  it('reads runs appended by appendRun', async () => {
    await appendRun(dir, makeReport(10), VERSION, fsMemoryIO, false);
    await appendRun(dir, makeReport(20), VERSION, fsMemoryIO, true);

    const runs = await readRuns(dir, fsMemoryIO);
    expect(runs).toHaveLength(2);
    expect(runs[0].slopIndex).toBe(10);
    expect(runs[0].thresholdExceeded).toBe(false);
    expect(runs[1].slopIndex).toBe(20);
    expect(runs[1].thresholdExceeded).toBe(true);
  });

  it('filters out malformed entries', async () => {
    await appendRun(dir, makeReport(5), VERSION, fsMemoryIO, false);
    const memoryPath = join(dir, '.slopbrick', 'structure.json');
    const existing = await readRuns(dir, fsMemoryIO);
    // Intentionally writing invalid data to test filtering.
    writeFileSync(memoryPath, JSON.stringify([...existing, { invalid: true }]));

    const runs = await readRuns(dir, fsMemoryIO);
    expect(runs).toHaveLength(1);
    expect(runs[0].slopIndex).toBe(5);
  });

  it('caps the log at 1000 runs, dropping oldest entries', async () => {
    for (let i = 0; i < 1002; i++) {
      await appendRun(dir, makeReport(i), VERSION, fsMemoryIO, false);
    }
    const runs = await readRuns(dir, fsMemoryIO);
    expect(runs).toHaveLength(1000);
    expect(runs[0].slopIndex).toBe(2);
    expect(runs[runs.length - 1].slopIndex).toBe(1001);
  });
});

describe('appendRun', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('stores timestamp, version, category scores, and top offense ids', async () => {
    const report = makeReport(42, {
      issues: [
        {
          ruleId: 'logic/boundary-violation',
          category: 'logic',
          severity: 'high',
          aiSpecific: true,
          message: 'client hook in server component',
          line: 1,
          column: 1,
        },
        {
          ruleId: 'wcag/target-size',
          category: 'wcag',
          severity: 'high',
          aiSpecific: false,
          message: 'target size',
          line: 2,
          column: 2,
        },
      ],
    });

    await appendRun(dir, report, VERSION, fsMemoryIO, true);

    const [run] = await readRuns(dir, fsMemoryIO);
    expect(run.timestamp).toBe(report.generatedAt);
    expect(run.version).toBe(report.version);
    expect(run.slopIndex).toBe(42);
    expect(run.categoryScores).toEqual(report.categoryScores);
    expect(run.topOffenseIds).toContain('logic/boundary-violation');
    expect(run.topOffenseIds).toContain('wcag/target-size');
    expect(run.thresholdExceeded).toBe(true);
  });
});

// ===========================================================================
// v0.10.7 — Repository Memory Platform
// ===========================================================================

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return { ...DEFAULT_CONFIG, ...overrides } as ResolvedConfig;
}

function makeInventoryFixture(dir: string): InventoryFile {
  const fileA = join(dir, 'src', 'Button.tsx');
  const fileB = join(dir, 'src', 'ConfirmModal.tsx');
  const patterns: StructurePattern[] = [
    { category: 'button', name: 'Button', imports: ['react'], fileCount: 1 },
    { category: 'modal', name: 'ConfirmModal', imports: ['react'], fileCount: 1 },
  ];
  const components: ComponentFingerprint[] = [
    {
      name: 'Button',
      files: [fileA],
      fingerprint: 'fp_button_00000000',
      hooks: ['useState'],
      props: ['onClick', 'children'],
      line: 1,
      endLine: 12,
    },
    {
      name: 'ConfirmModal',
      files: [fileB],
      fingerprint: 'fp_modal_00000000',
      hooks: [],
      props: ['open', 'onClose'],
      line: 1,
      endLine: 30,
    },
  ];
  return {
    version: STRUCTURE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    workspace: dir,
    scannedFiles: 2,
    scanDurationMs: 123,
    patterns,
    components,
  };
}

function writeFile(dir: string, rel: string, content: string): string {
  const full = join(dir, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf-8');
  return full;
}

describe('loadInventory + saveInventory', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null when the inventory file is missing', async () => {
    expect(await loadInventory(dir)).toBeNull();
  });

  it('round-trips every field on InventoryFile', async () => {
    // Need real files so saveInventory can populate the mtime cache.
    const fileA = writeFile(dir, 'src/Button.tsx', 'export const Button = () => null;\n');
    const fileB = writeFile(dir, 'src/ConfirmModal.tsx', 'export const ConfirmModal = () => null;\n');
    const fixture = makeInventoryFixture(dir);
    fixture.components[0].files = [fileA];
    fixture.components[1].files = [fileB];

    saveInventory(dir, fixture, computeFileHash);
    const loaded = await loadInventory(dir);

    expect(loaded).not.toBeNull();
    expect(loaded?.version).toBe(STRUCTURE_SCHEMA_VERSION);
    expect(loaded?.workspace).toBe(dir);
    expect(loaded?.scannedFiles).toBe(2);
    expect(loaded?.scanDurationMs).toBe(123);
    expect(loaded?.patterns).toHaveLength(2);
    expect(loaded?.components).toHaveLength(2);
    expect(loaded?.components.map((c) => c.name).sort()).toEqual(['Button', 'ConfirmModal']);
  });

  it('returns null when the inventory version does not match STRUCTURE_SCHEMA_VERSION', async () => {
    const inventoryPath = join(dir, '.slopbrick', 'inventory.json');
    mkdirSync(join(dir, '.slopbrick'), { recursive: true });
    const stale = {
      ...makeInventoryFixture(dir),
      version: '0' as typeof STRUCTURE_SCHEMA_VERSION,
    };
    writeFileSync(inventoryPath, JSON.stringify(stale, null, 2));

    expect(await loadInventory(dir)).toBeNull();
  });

  it('atomic write: stale .tmp is overwritten and renamed away', async () => {
    // Pre-stage a garbage .tmp file to simulate an interrupted prior run.
    const slopDir = join(dir, '.slopbrick');
    mkdirSync(slopDir, { recursive: true });
    writeFileSync(join(slopDir, 'inventory.json.tmp'), '{ this is not valid JSON');

    const fileA = writeFile(dir, 'src/Button.tsx', 'export const Button = () => null;\n');
    const fixture = makeInventoryFixture(dir);
    fixture.components[0].files = [fileA];

    saveInventory(dir, fixture, computeFileHash);

    // .tmp must be gone (renamed to canonical path).
    expect(existsSync(join(slopDir, 'inventory.json.tmp'))).toBe(false);
    // Canonical file exists and parses cleanly.
    expect(existsSync(join(slopDir, 'inventory.json'))).toBe(true);
    const loaded = await loadInventory(dir);
    expect(loaded?.patterns).toHaveLength(2);
  });
});

describe('loadConstitution + saveConstitution', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null when the constitution file is missing', async () => {
    expect(await loadConstitution(dir)).toBeNull();
  });

  it('round-trips every field on ConstitutionFile', async () => {
    const fixture: ConstitutionFile = {
      version: STRUCTURE_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      workspace: dir,
      declared: {
        stateManagement: 'zustand',
        dataFetching: 'react-query',
      },
      forbidden: ['moment'],
      forbiddenPrefixes: ['@types/'],
    };

    await saveConstitution(dir, fixture);
    const loaded = await loadConstitution(dir);

    expect(loaded).toEqual(fixture);
  });

  it('returns null on version mismatch', async () => {
    const path = join(dir, '.slopbrick', 'constitution.json');
    mkdirSync(join(dir, '.slopbrick'), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify({
        version: '0',
        generatedAt: new Date().toISOString(),
        workspace: dir,
        declared: {},
        forbidden: [],
        forbiddenPrefixes: [],
      }),
    );

    expect(await loadConstitution(dir)).toBeNull();
  });
});

describe('buildInventoryFromScan', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function makeComponentResult(filePath: string, componentName: string): FileScanResult {
    return {
      filePath,
      componentCount: 1,
      issues: [],
      facts: {
        filePath,
        v2: {
          file: { path: filePath, loc: 20, extension: '.tsx', framework: 'react' },
          imports: [],
          components: [
            {
              name: componentName,
              isExported: true,
              loc: 20,
              isClientComponent: true,
              isServerComponent: false,
              props: [
                { name: 'onClick', type: '() => void', isRequired: false },
                { name: 'children', type: 'ReactNode', isRequired: false },
              ],
              hookCalls: [{ name: 'useState', line: 2, column: 10 }],
              line: 1,
              column: 0,
            },
          ],
          jsx: { elements: [], maxNestingDepth: 0 },
          logic: {
            hooks: [],
            stateVariables: [],
            defensiveChecks: [],
            apiCalls: [],
            logicalExpressions: [],
            keyProps: [],
            optimisticUpdates: [],
          },
          designTokens: { spacingUsage: [], colorValues: [], fontSizes: [], borderRadius: [] },
          templateClassNames: [],
          componentSizes: [],
          astroComponents: [],
          disabledRules: [],
        },
      },
    };
  }

  it('produces a valid InventoryFile with the right version + workspace', async () => {
    const fileA = writeFile(dir, 'src/Button.tsx', "import { useState } from 'react';\nexport const Button = () => null;\n");
    const config = makeConfig();
    const results = [makeComponentResult(fileA, 'Button')];

    const inv = buildInventoryFromScan({ cwd: dir, results }, emptyPatternInventory, 250);

    expect(inv.version).toBe(STRUCTURE_SCHEMA_VERSION);
    expect(inv.workspace).toBe(dir);
    expect(inv.scanDurationMs).toBe(250);
    expect(typeof inv.generatedAt).toBe('string');
    expect(inv.scannedFiles).toBeGreaterThanOrEqual(1);
  });

  it('extracts component fingerprints from scan results', async () => {
    const fileA = writeFile(dir, 'src/Button.tsx', 'export const Button = () => null;\n');
    const fileB = writeFile(dir, 'src/Card.tsx', 'export const Card = () => null;\n');
    const config = makeConfig();
    const results = [makeComponentResult(fileA, 'Button'), makeComponentResult(fileB, 'Card')];

    const inv = buildInventoryFromScan({ cwd: dir, results }, emptyPatternInventory, 100);

    const names = inv.components.map((c) => c.name).sort();
    expect(names).toEqual(['Button', 'Card']);
    for (const c of inv.components) {
      expect(c.fingerprint).toMatch(/^[0-9a-f]{16}$/);
      expect(c.files).toHaveLength(1);
      expect(c.line).toBe(1);
      expect(c.endLine).toBeGreaterThanOrEqual(c.line);
    }
  });

  it('produces stable fingerprints for components with the same hooks + props', async () => {
    const fileA = writeFile(dir, 'src/A.tsx', 'export const A = () => null;\n');
    const config = makeConfig();
    const r1 = buildInventoryFromScan(
      { cwd: dir, results: [makeComponentResult(fileA, 'Same')] },
      emptyPatternInventory,
      10,
    );
    const r2 = buildInventoryFromScan(
      { cwd: dir, results: [makeComponentResult(fileA, 'Same')] },
      emptyPatternInventory,
      20,
    );

    expect(r1.components[0].fingerprint).toBe(r2.components[0].fingerprint);
  });

  it('groups multiple files exporting the same component under one entry', async () => {
    const fileA = writeFile(dir, 'src/A.tsx', 'export const Shared = () => null;\n');
    const fileB = writeFile(dir, 'src/B.tsx', 'export const Shared = () => null;\n');
    const config = makeConfig();
    const results = [makeComponentResult(fileA, 'Shared'), makeComponentResult(fileB, 'Shared')];

    const inv = buildInventoryFromScan({ cwd: dir, results }, emptyPatternInventory, 10);

    expect(inv.components).toHaveLength(1);
    expect(inv.components[0].name).toBe('Shared');
    expect(inv.components[0].files.sort()).toEqual([fileA, fileB].sort());
  });

  it('handles empty results without throwing', async () => {
    const config = makeConfig();
    const inv = buildInventoryFromScan({ cwd: dir, results: [] }, emptyPatternInventory, 0);

    expect(inv.components).toEqual([]);
    expect(Array.isArray(inv.patterns)).toBe(true);
  });
});

describe('buildConstitutionFromConfig', () => {
  it('copies declared, forbidden, forbiddenPrefixes from a ResolvedConfig', async () => {
    const config = makeConfig({
      constitution: {
        stateManagement: ['zustand', 'jotai'],
        dataFetching: ['react-query'],
        uiLibrary: ['shadcn'],
        forms: [],
        styling: ['tailwind'],
        routing: ['react-router'],
        forbidden: ['moment', '@types/'],
      },
    });

    const out = buildConstitutionFromConfig(config, '/workspace');

    expect(out.version).toBe(STRUCTURE_SCHEMA_VERSION);
    expect(out.workspace).toBe('/workspace');
    expect(out.declared).toEqual({
      stateManagement: 'zustand',
      dataFetching: 'react-query',
      uiLibrary: 'shadcn',
      forms: undefined,
      styling: 'tailwind',
      routing: 'react-router',
    });
    expect(out.forbidden).toEqual(['moment']);
    expect(out.forbiddenPrefixes).toEqual(['@types/']);
  });

  it('returns an empty declared object when config has no constitution', () => {
    const config = makeConfig({ constitution: undefined });
    const out = buildConstitutionFromConfig(config, '/w');

    expect(out.declared).toEqual({});
    expect(out.forbidden).toEqual([]);
    expect(out.forbiddenPrefixes).toEqual([]);
  });

  it('splits forbidden entries by trailing slash', () => {
    const config = makeConfig({
      constitution: {
        forbidden: ['moment', 'lodash', '@scope/', '@types/'],
      },
    });
    const out = buildConstitutionFromConfig(config, '/w');

    expect(out.forbidden).toEqual(['moment', 'lodash']);
    expect(out.forbiddenPrefixes).toEqual(['@scope/', '@types/']);
  });

  it('omits declared entries for empty-array categories', () => {
    const config = makeConfig({
      constitution: {
        forms: [], // explicit empty = "we deliberately don't use this"
      },
    });
    const out = buildConstitutionFromConfig(config, '/w');
    expect(out.declared.forms).toBeUndefined();
  });
});

describe('buildHealthFromReport', () => {
  it('derives slopIndex, categoryScores, issueCounts, and topOffenseIds from a report', () => {
    const report = makeReport(42, {
      issues: [
        { ruleId: 'ai/comment-ratio', severity: 'high' } as any,
        { ruleId: 'ai/comment-ratio', severity: 'high' } as any,
        { ruleId: 'ai/comment-ratio', severity: 'medium' } as any,
        { ruleId: 'logic/long-method', severity: 'medium' } as any,
        { ruleId: 'logic/long-method', severity: 'low' } as any,
        { ruleId: 'visual/duplicate-class', severity: 'low' } as any,
      ],
    });
    const out = buildHealthFromReport(report, '/work', { scanDurationMs: 1234 });
    expect(out.version).toBe('3');
    expect(out.workspace).toBe('/work');
    expect(out.slopIndex).toBe(42);
    expect(out.issueCounts).toEqual({ high: 2, medium: 2, low: 2 });
    // topOffenseIds is sorted by count desc, then name asc, capped at 3
    expect(out.topOffenseIds).toEqual([
      'ai/comment-ratio',
      'logic/long-method',
      'visual/duplicate-class',
    ]);
    expect(out.scanDurationMs).toBe(1234);
  });

  it('rounds slopIndex and category scores to integers', () => {
    const report = makeReport(42.7, {
      categoryScores: {
        visual: 12.4, typo: 0, wcag: 0, layout: 0, component: 0,
        logic: 0, arch: 0, perf: 0, security: 0, test: 0, docs: 0,
        db: 0, ai: 0, context: 0, product: 0, i18n: 0,
      },
      issues: [],
    });
    const out = buildHealthFromReport(report, '/w');
    expect(out.slopIndex).toBe(43);
    expect(out.categoryScores.visual).toBe(12);
  });

  it('omits optional fields when not provided', () => {
    const report = makeReport(0, { issues: [] });
    const out = buildHealthFromReport(report, '/w');
    expect(out.constitutionDrift).toBeUndefined();
    expect(out.scanDurationMs).toBeUndefined();
    expect(out.topOffenseIds).toEqual([]);
  });

  it('excludes issues with severity=off from issueCounts and topOffenseIds (defaultOff rules)', () => {
    // The scan pipeline sets issue.severity = 'off' for any ruleId in
    // signal-strength.json's `defaultOff` set (INVERTED, NOISY, or
    // rules with ratio<1.0). The health snapshot must not surface
    // those — they were deliberately disabled for a reason.
    const report = makeReport(100, {
      issues: [
        { ruleId: 'logic/healthy-rule', severity: 'high' } as any,
        { ruleId: 'logic/healthy-rule', severity: 'high' } as any,
        { ruleId: 'logic/healthy-rule', severity: 'high' } as any,
        // defaultOff: true in signal-strength.json — this is the
        // noisy rule that should NOT show up in topOffenseIds.
        { ruleId: 'logic/ks-distribution-shift', severity: 'off' } as any,
        { ruleId: 'logic/ks-distribution-shift', severity: 'off' } as any,
        { ruleId: 'logic/ks-distribution-shift', severity: 'off' } as any,
        { ruleId: 'logic/ks-distribution-shift', severity: 'off' } as any,
        { ruleId: 'logic/ks-distribution-shift', severity: 'off' } as any,
        { ruleId: 'logic/ks-distribution-shift', severity: 'off' } as any,
        { ruleId: 'logic/ks-distribution-shift', severity: 'off' } as any,
        { ruleId: 'logic/ks-distribution-shift', severity: 'off' } as any,
      ],
    });
    const out = buildHealthFromReport(report, '/w');
    // Only the 3 high-severity healthy-rule issues should count.
    expect(out.issueCounts).toEqual({ high: 3, medium: 0, low: 0 });
    // ks-distribution-shift fired 9 times but is 'off' — must NOT
    // appear in top offenses, even though it has more hits than
    // healthy-rule.
    expect(out.topOffenseIds).toEqual(['logic/healthy-rule']);
  });

  it('appendRun topOffenseIds also filters out severity=off issues', async () => {
    // Same regression as above but for the report-level
    // topOffenseIds (used by .slop-audit/memory.json history). The
    // persisted run record must not surface disabled rules in its
    // headline metric either.
    const tmpDir = createTmpDir();
    try {
      // Wipe any existing runs
      try { rmSync(join(tmpDir, '.slop-audit', 'memory.json')); } catch { /* ok */ }
      const report = makeReport(50, {
        issues: [
          { ruleId: 'logic/healthy-rule', severity: 'medium' } as any,
          { ruleId: 'logic/ks-distribution-shift', severity: 'off' } as any,
          { ruleId: 'logic/ks-distribution-shift', severity: 'off' } as any,
        ],
      });
      const run = await appendRun(tmpDir, report, VERSION, fsMemoryIO);
      expect(run.topOffenseIds).toEqual(['logic/healthy-rule']);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('saveHealth / loadHealth', () => {
  it('round-trips a HealthFile through disk', () => {
    const dir = createTmpDir();
    try {
      const report = makeReport(15, {
        issues: [
          { ruleId: 'ai/keyword-stuffing', severity: 'high' } as any,
        ],
      });
      const health = buildHealthFromReport(report, dir, { scanDurationMs: 500 });
      saveHealth(dir, health);
      expect(existsSync(healthPath(dir))).toBe(true);
      const loaded = loadHealth(dir);
      expect(loaded).not.toBeNull();
      expect(loaded!.slopIndex).toBe(15);
      expect(loaded!.topOffenseIds).toEqual(['ai/keyword-stuffing']);
      expect(loaded!.scanDurationMs).toBe(500);
      // Round-trip must be valid per the schema validator
      expect(isHealthFile(loaded)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns null for missing file or corrupted JSON', () => {
    const dir = createTmpDir();
    try {
      // Missing file → null
      expect(loadHealth(dir)).toBeNull();
      // Create the parent dir, then write garbage
      mkdirSync(join(dir, '.slopbrick'), { recursive: true });
      writeFileSync(healthPath(dir), 'not json');
      expect(loadHealth(dir)).toBeNull();
      writeFileSync(healthPath(dir), JSON.stringify({ version: '99' }));
      // wrong version → null
      expect(loadHealth(dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('isInventoryFresh', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns true when no files have changed since the inventory was saved', async () => {
    const fileA = writeFile(dir, 'src/Button.tsx', 'export const Button = () => null;\n');
    const fixture = makeInventoryFixture(dir);
    fixture.components[0].files = [fileA];
    fixture.components[1].files = [fileA];
    saveInventory(dir, fixture, computeFileHash);

    const loaded = await loadInventory(dir);
    expect(loaded).not.toBeNull();
    expect(await isInventoryFresh(loaded as InventoryFile, dir)).toBe(true);
  });

  it('returns false when one tracked file mtime changes', async () => {
    const fileA = writeFile(dir, 'src/Button.tsx', 'export const Button = () => null;\n');
    const fixture = makeInventoryFixture(dir);
    fixture.components[0].files = [fileA];
    fixture.components[1].files = [fileA];
    saveInventory(dir, fixture, computeFileHash);

    // Bump mtimeMs to a later value — file content is irrelevant.
    const future = (Date.now() + 60_000) / 1000;
    utimesSync(fileA, future, future);

    const loaded = await loadInventory(dir);
    expect(await isInventoryFresh(loaded as InventoryFile, dir)).toBe(false);
  });

  it('returns false when the cache file is missing', async () => {
    const fileA = writeFile(dir, 'src/Button.tsx', 'export const Button = () => null;\n');
    const fixture = makeInventoryFixture(dir);
    fixture.components[0].files = [fileA];
    fixture.components[1].files = [fileA];
    saveInventory(dir, fixture, computeFileHash);

    // Wipe the cache to simulate the first call after a fresh clone.
    // v0.11.0+: cache file moved to top-level (`.slopbrick-cache.json`)
    // because the on-disk convention stays a sibling of `.slopbrick/`.
    rmSync(join(dir, '.slopbrick-cache.json'));

    const loaded = await loadInventory(dir);
    expect(await isInventoryFresh(loaded as InventoryFile, dir)).toBe(false);
  });

  it('returns false when a tracked file is deleted', async () => {
    const fileA = writeFile(dir, 'src/Button.tsx', 'export const Button = () => null;\n');
    const fixture = makeInventoryFixture(dir);
    fixture.components[0].files = [fileA];
    fixture.components[1].files = [fileA];
    saveInventory(dir, fixture, computeFileHash);

    rmSync(fileA);

    const loaded = await loadInventory(dir);
    expect(await isInventoryFresh(loaded as InventoryFile, dir)).toBe(false);
  });
});

describe('invalidateFile', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('removes the matching entry from cache.json', async () => {
    const fileA = writeFile(dir, 'src/A.tsx', 'export const A = () => null;\n');
    const fileB = writeFile(dir, 'src/B.tsx', 'export const B = () => null;\n');
    const fixture = makeInventoryFixture(dir);
    fixture.components[0].files = [fileA];
    fixture.components[1].files = [fileB];
    saveInventory(dir, fixture, computeFileHash);

    await invalidateFile(dir, fileA);

    const cachePath = join(dir, '.slopbrick-cache.json');
    const cache = JSON.parse(readFileSync(cachePath, 'utf-8')) as Array<{ file: string }>;
    const remaining = cache.map((e) => e.file);
    expect(remaining).toContain(fileB);
    expect(remaining).not.toContain(fileA);
  });

  it('is a no-op when the file is not in the cache', async () => {
    const fileA = writeFile(dir, 'src/A.tsx', 'export const A = () => null;\n');
    const fixture = makeInventoryFixture(dir);
    fixture.components[0].files = [fileA];
    fixture.components[1].files = [fileA];
    saveInventory(dir, fixture, computeFileHash);

    expect(invalidateFile(dir, join(dir, 'src', 'nope.tsx'))).toBeUndefined();
  });

  it('causes the next isInventoryFresh call to return false', async () => {
    const fileA = writeFile(dir, 'src/A.tsx', 'export const A = () => null;\n');
    const fixture = makeInventoryFixture(dir);
    fixture.components[0].files = [fileA];
    fixture.components[1].files = [fileA];
    saveInventory(dir, fixture, computeFileHash);

    const loaded = await loadInventory(dir);
    expect(await isInventoryFresh(loaded as InventoryFile, dir)).toBe(true);

    await invalidateFile(dir, fileA);

    expect(await isInventoryFresh(loaded as InventoryFile, dir)).toBe(false);
  });
});
