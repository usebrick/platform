import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadFlywheelState,
  loadResearchMetricsFromDisk,
  migrateFlywheelState,
} from '../src/engine/flywheel';

describe('loadResearchMetricsFromDisk', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'slopbrick-research-flywheel-'));
    mkdirSync(join(cwd, '.slopbrick', 'flywheel'), { recursive: true });
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('returns undefined when no research artifacts exist', () => {
    expect(loadResearchMetricsFromDisk(cwd)).toBeUndefined();
  });

  it('parses analysis summary fields', () => {
    writeFileSync(
      join(cwd, '.slopbrick', 'flywheel', 'analysis.json'),
      JSON.stringify({
        summary: { total: 10, covered: 8, coverage: 80 },
        samples: [],
      }),
    );
    const metrics = loadResearchMetricsFromDisk(cwd);
    expect(metrics?.generatedSampleCount).toBe(10);
    expect(metrics?.generatedRuleCoverage).toBe(80);
  });

  it('parses candidate yield', () => {
    writeFileSync(
      join(cwd, '.slopbrick', 'flywheel', 'rule-candidates.json'),
      JSON.stringify({ candidates: [{}, {}, {}] }),
    );
    const metrics = loadResearchMetricsFromDisk(cwd);
    expect(metrics?.candidateYield).toBe(3);
  });

  it('tolerates corrupt JSON without throwing', () => {
    writeFileSync(join(cwd, '.slopbrick', 'flywheel', 'analysis.json'), '{ not json');
    writeFileSync(
      join(cwd, '.slopbrick', 'flywheel', 'rule-candidates.json'),
      JSON.stringify({ candidates: [{}, {}] }),
    );
    const metrics = loadResearchMetricsFromDisk(cwd);
    // analysis.json failed to parse → its fields stay zero, candidates still load.
    expect(metrics?.candidateYield).toBe(2);
    expect(metrics?.generatedSampleCount).toBe(0);
  });
});

describe('FlywheelState research field', () => {
  it('round-trips research through migrate', () => {
    const migrated = migrateFlywheelState({
      autoTuned: [],
      research: {
        generatedSampleCount: 5,
        generatedRuleCoverage: 40,
        candidateYield: 1,
        updatedAt: '2026-06-21T00:00:00.000Z',
      },
    });
    expect(migrated.research?.candidateYield).toBe(1);
  });

  it('returns a default state when the on-disk file is missing', () => {
    const state = loadFlywheelState(mkdtempSync(join(tmpdir(), 'slopbrick-empty-')));
    expect(state.research).toBeUndefined();
  });
});

describe('loadResearchMetricsFromDisk — v0.42.0 safeReadJson edges', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'slopbrick-research-flywheel-'));
    mkdirSync(join(cwd, '.slopbrick', 'flywheel'), { recursive: true });
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('returns all-zero metrics when both files are corrupt JSON', () => {
    writeFileSync(join(cwd, '.slopbrick', 'flywheel', 'analysis.json'), '{ malformed');
    writeFileSync(join(cwd, '.slopbrick', 'flywheel', 'rule-candidates.json'), 'also bad');
    const metrics = loadResearchMetricsFromDisk(cwd);
    // Pre-refactor: this would have crashed on the second file.
    // Post-refactor (v0.42.0): silent fallback to 0/0/0 across the board.
    expect(metrics).toBeDefined();
    expect(metrics?.generatedSampleCount).toBe(0);
    expect(metrics?.generatedRuleCoverage).toBe(0);
    expect(metrics?.candidateYield).toBe(0);
  });

  it('returns 0 metrics for an analysis.json with a null summary field', () => {
    // Edge case: file parses, but the shape doesn't match what we expect.
    // safeReadJson returns the fallback (0) without throwing.
    writeFileSync(
      join(cwd, '.slopbrick', 'flywheel', 'analysis.json'),
      JSON.stringify({ summary: null }),
    );
    const metrics = loadResearchMetricsFromDisk(cwd);
    expect(metrics?.generatedSampleCount).toBe(0);
    expect(metrics?.generatedRuleCoverage).toBe(0);
  });


});
