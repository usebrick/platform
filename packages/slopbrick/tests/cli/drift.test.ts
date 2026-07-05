import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runDrift, formatDrift, driftExitCode } from '../../src/cli/drift';
import { DEFAULT_CONFIG } from '../../src/config';
import type { ResolvedConfig } from '../../src/types';

const execFileAsync = promisify(execFile);
const BIN = join(process.cwd(), 'bin', 'slopbrick.js');

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'slopbrick-drift-'));
}

function writeFile(dir: string, rel: string, content: string): string {
  const full = join(dir, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf-8');
  return full;
}

function configWith(include: string[], constitution?: ResolvedConfig['constitution']): ResolvedConfig {
  return {
    ...DEFAULT_CONFIG,
    include,
    exclude: [],
    ...(constitution ? { constitution } : {}),
  };
}

async function runBin(
  args: string[],
  cwd: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync('node', [BIN, ...args], { cwd });
    return { exitCode: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { exitCode: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

describe('runDrift', () => {
  it('reports no violations when constitution is absent', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', `import { create } from 'redux';`);
      const result = await runDrift(dir, configWith(['src/**/*.ts']));
      expect(result.totalViolations).toBe(0);
      expect(result.conventionSource).toBe('none');
      expect(result.scannedFiles).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports no violations when imports are conformant', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', `import { create } from 'zustand';`);
      const result = await runDrift(dir, configWith(['src/**/*.ts'], { stateManagement: ['zustand'] }));
      expect(result.totalViolations).toBe(0);
      expect(result.conventionSource).toBe('declared');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags a state-management violation', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', `import { createStore } from 'redux';`);
      const result = await runDrift(dir, configWith(['src/**/*.ts'], { stateManagement: ['zustand'] }));
      expect(result.totalViolations).toBe(1);
      expect(result.filesWithViolations).toBe(1);
      expect(result.byCategory['stateManagement']).toBe(1);
      expect(result.byFile[0].import).toBe('redux');
      expect(result.byFile[0].declared).toEqual(['zustand']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('aggregates violations across multiple files and categories', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', `import { createStore } from 'redux';`);
      writeFile(dir, 'src/b.ts', `import { useQuery } from 'swr';`);
      const result = await runDrift(dir, configWith(['src/**/*.ts'], {
        stateManagement: ['zustand'],
        dataFetching: ['react-query'],
      }));
      expect(result.totalViolations).toBe(2);
      expect(result.filesWithViolations).toBe(2);
      expect(result.byCategory['stateManagement']).toBe(1);
      expect(result.byCategory['dataFetching']).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('respects the maxFiles cap', async () => {
    const dir = freshDir();
    try {
      for (let i = 0; i < 5; i++) {
        writeFile(dir, `src/file${i}.ts`, `import x from 'redux';`);
      }
      const result = await runDrift(dir, configWith(['src/**/*.ts'], { stateManagement: ['zustand'] }), {
        maxFiles: 2,
      });
      expect(result.scannedFiles).toBe(2);
      expect(result.totalViolations).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips files that cannot be read', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', `import { createStore } from 'redux';`);
      const result = await runDrift(dir, configWith(['src/**/*.ts', 'src/missing/**/*.ts'], {
        stateManagement: ['zustand'],
      }));
      // missing dir is discovered as zero matches; the existing file still scanned
      expect(result.scannedFiles).toBeGreaterThanOrEqual(1);
      expect(result.totalViolations).toBeGreaterThanOrEqual(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('formatDrift', () => {
  it('renders a clean report when no violations exist', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', `import x from 'zustand';`);
      const result = await runDrift(dir, configWith(['src/**/*.ts'], { stateManagement: ['zustand'] }));
      const out = formatDrift(result);
      expect(out).toContain('Constitution drift report');
      expect(out).toContain('No constitution violations');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('renders a violation report grouped by file and category', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', `import x from 'redux';`);
      writeFile(dir, 'src/b.ts', `import y from 'swr';`);
      const result = await runDrift(dir, configWith(['src/**/*.ts'], {
        stateManagement: ['zustand'],
        dataFetching: ['react-query'],
      }));
      const out = formatDrift(result);
      expect(out).toContain('src/a.ts');
      expect(out).toContain('src/b.ts');
      expect(out).toContain('stateManagement');
      expect(out).toContain('dataFetching');
      expect(out).toContain('Constitution violation');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('suggests adding constitution when none are declared', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', `import x from 'redux';`);
      const result = await runDrift(dir, configWith(['src/**/*.ts']));
      const out = formatDrift(result);
      expect(out).toContain('No constitution declared');
      expect(out).toContain('constitution');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('emits valid JSON when --format json is requested', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', `import x from 'redux';`);
      const result = await runDrift(dir, configWith(['src/**/*.ts'], { stateManagement: ['zustand'] }));
      const out = formatDrift(result, { json: true });
      const parsed = JSON.parse(out) as {
        totalViolations: number;
        byCategory: Record<string, number>;
        conventionSource: string;
      };
      expect(parsed.totalViolations).toBe(1);
      expect(parsed.byCategory['stateManagement']).toBe(1);
      expect(parsed.conventionSource).toBe('declared');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('driftExitCode', () => {
  it('returns 1 when violations exist', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', `import x from 'redux';`);
      const result = await runDrift(dir, configWith(['src/**/*.ts'], { stateManagement: ['zustand'] }));
      expect(driftExitCode(result)).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns 0 when no violations exist', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', `import x from 'zustand';`);
      const result = await runDrift(dir, configWith(['src/**/*.ts'], { stateManagement: ['zustand'] }));
      expect(driftExitCode(result)).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('slopbrick drift (CLI)', () => {
  it('exits 0 and prints clean report when no violations', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', `import x from 'zustand';`);
      writeFile(dir, 'slopbrick.config.mjs', `export default { include: ['src/**/*.ts'], exclude: [], constitution: { stateManagement: ['zustand'] } };`);
      const { exitCode, stdout } = await runBin(['drift'], dir);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('No constitution violations');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exits 1 when violations are found', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/bad.ts', `import x from 'redux';`);
      writeFile(dir, 'slopbrick.config.mjs', `export default { include: ['src/**/*.ts'], exclude: [], constitution: { stateManagement: ['zustand'] } };`);
      const { exitCode, stdout } = await runBin(['drift'], dir);
      expect(exitCode).toBe(1);
      expect(stdout).toContain('Constitution violation');
      expect(stdout).toContain('redux');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('emits JSON output with --format json', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/bad.ts', `import x from 'redux';`);
      writeFile(dir, 'slopbrick.config.mjs', `export default { include: ['src/**/*.ts'], exclude: [], constitution: { stateManagement: ['zustand'] } };`);
      const { exitCode, stdout } = await runBin(['drift', '--format', 'json'], dir);
      expect(exitCode).toBe(1);
      const parsed = JSON.parse(stdout) as { totalViolations: number; conventionSource: string };
      expect(parsed.totalViolations).toBe(1);
      expect(parsed.conventionSource).toBe('declared');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('shows "no constitution declared" when config omits the field', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', `import x from 'redux';`);
      writeFile(dir, 'slopbrick.config.mjs', `export default { include: ['src/**/*.ts'], exclude: [] };`);
      const { exitCode, stdout } = await runBin(['drift'], dir);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('No constitution declared');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// v0.41.0 (Sprint 2, tasks 2a.2 / 2a.6): temporal drift over
// `.slopbrick/flywheel/scans.jsonl`. Pure-function tests below;
// the CLI integration tests (using `slopbrick drift --temporal-since <date>`)
// land once the dispatcher / formatter land.
// ---------------------------------------------------------------------------

import { appendFileSync, mkdirSync } from 'node:fs';
import {
  runDriftOverTime,
  formatDriftOverTime,
  flattenPatternNames,
  collectDeclaredNames,
} from '../../src/cli/drift';
import type { ProjectReport, ResolvedConfig } from '../../src/types';
import { DEFAULT_CONFIG } from '../../src/config';

const TELEMETRY_DIR = '.slopbrick/flywheel';
const TELEMETRY_FILE = 'scans.jsonl';

/** Build a minimal ProjectReport carrying enough telemetry for
 *  `recordTelemetry` to produce a line. The actual `issues` array
 *  doesn't matter for the temporal drift math — only the inventory
 *  summary (computed by `buildPatternInventory`) ends up in
 *  `scans.jsonl`. */
function makeReport(
  scannedFiles: number,
  generatedAt: string,
): ProjectReport {
  const empty: Partial<ProjectReport> = {
    version: '0.41.0-test',
    generatedAt,
    aiSlopScore: 0,
    engineeringHygiene: 0,
    security: 0,
    repositoryHealth: 0,
    assemblyHealth: 100,
    totalScore: 0,
    categoryScores: { visual: 0, typo: 0, wcag: 0, layout: 0, component: 0, logic: 0, arch: 0, perf: 0, security: 0, test: 0, docs: 0, db: 0, ai: 0, context: 0, product: 0, i18n: 0 },
    boundaryScore: 0,
    contextScore: 0,
    visualScore: 0,
    subscores: {},
    p90Score: 0,
    peakScore: 0,
    componentCount: scannedFiles,
    fileCount: scannedFiles,
    components: [],
    issues: [],
    thresholds: { meanSlop: 15, p90Slop: 30, individualSlopThreshold: 60 },
  };
  return empty as ProjectReport;
}

const configWithTemporal = (
  overrides: Partial<ResolvedConfig> = {},
): ResolvedConfig => ({ ...DEFAULT_CONFIG, include: ['src/**/*.ts'], exclude: [], ...overrides });

/** Write a single telemetry payload directly to `.slopbrick/flywheel/scans.jsonl`.
 *  Used to construct multi-scan histories without running the full scan pipeline. */
function writeScan(
  cwd: string,
  payload: {
    timestamp: string;
    patternNames: Record<string, string[]>;
    patternCounts?: Record<string, number>;
    scannedFiles?: number;
  },
): void {
  mkdirSync(join(cwd, TELEMETRY_DIR), { recursive: true });
  const line = JSON.stringify({
    timestamp: payload.timestamp,
    version: '0.41.0-test',
    project: {
      componentCount: 1,
      slopIndex: 0,
      assemblyHealth: 100,
      categoryScores: { visual: 0, typo: 0, wcag: 0, layout: 0, component: 0, logic: 0, arch: 0, perf: 0, security: 0, test: 0, docs: 0, db: 0, ai: 0, context: 0, product: 0, i18n: 0 },
      p90Score: 0,
      peakScore: 0,
    },
    violations: [],
    files: [],
    inventory: {
      scannedFiles: payload.scannedFiles ?? 1,
      patternCounts: payload.patternCounts ?? Object.fromEntries(
        Object.entries(payload.patternNames).map(([k, v]) => [k, v.length]),
      ),
      patternNames: payload.patternNames,
    },
  });
  appendFileSync(join(cwd, TELEMETRY_DIR, TELEMETRY_FILE), line + '\n', 'utf-8');
}

describe('runDriftOverTime', () => {
  it('returns an empty result when scans.jsonl is missing', async () => {
    const dir = freshDir();
    try {
      const result = await runDriftOverTime(dir, configWithTemporal(), { since: 'baseline' });
      expect(result.introduced).toEqual([]);
      expect(result.removed).toEqual([]);
      expect(result.driftScore).toBe(0);
      expect(result.snapshotsConsidered).toBe(0);
      expect(result.baselineAt).toBe('');
      expect(result.currentAt).toBe('');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns an empty result when no payloads carry inventory (v0.40.x compat)', async () => {
    const dir = freshDir();
    try {
      mkdirSync(join(dir, TELEMETRY_DIR), { recursive: true });
      // Pre-2a.1 payload: no `inventory` field.
      appendFileSync(
        join(dir, TELEMETRY_DIR, TELEMETRY_FILE),
        JSON.stringify({
          timestamp: '2026-06-01T00:00:00.000Z',
          version: '0.40.0',
          project: { componentCount: 1, slopIndex: 0, assemblyHealth: 100, categoryScores: {}, p90Score: 0, peakScore: 0 },
          violations: [],
          files: [],
        }) + '\n',
        'utf-8',
      );
      const result = await runDriftOverTime(dir, configWithTemporal(), { since: 'baseline' });
      expect(result.introduced).toEqual([]);
      expect(result.removed).toEqual([]);
      expect(result.snapshotsConsidered).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('introduced + removed are computed correctly across a two-snapshot window', async () => {
    const dir = freshDir();
    try {
      writeScan(dir, {
        timestamp: '2026-06-01T00:00:00.000Z',
        patternNames: { state: ['redux'], button: ['Button', 'IconButton'] },
      });
      writeScan(dir, {
        timestamp: '2026-07-01T00:00:00.000Z',
        patternNames: { state: ['redux', 'zustand'], button: ['Button'] },
      });
      const result = await runDriftOverTime(dir, configWithTemporal(), { since: '2026-06-01' });
      // introduced: state/zustand (new). removed: button/IconButton (gone).
      expect(result.introduced.map((p) => `${p.category}/${p.name}`).sort()).toEqual([
        'state/zustand',
      ]);
      expect(result.removed.map((p) => `${p.category}/${p.name}`).sort()).toEqual([
        'button/IconButton',
      ]);
      expect(result.baselineAt).toBe('2026-06-01T00:00:00.000Z');
      expect(result.currentAt).toBe('2026-07-01T00:00:00.000Z');
      expect(result.snapshotsConsidered).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('"baseline" string picks the oldest scan regardless of date', async () => {
    const dir = freshDir();
    try {
      writeScan(dir, {
        timestamp: '2026-05-01T00:00:00.000Z',
        patternNames: { state: ['redux'] },
      });
      writeScan(dir, {
        timestamp: '2026-07-01T00:00:00.000Z',
        patternNames: { state: ['redux', 'zustand'] },
      });
      const result = await runDriftOverTime(dir, configWithTemporal(), { since: 'baseline' });
      expect(result.baselineAt).toBe('2026-05-01T00:00:00.000Z');
      expect(result.currentAt).toBe('2026-07-01T00:00:00.000Z');
      expect(result.introduced.map((p) => `${p.category}/${p.name}`)).toEqual(['state/zustand']);
      expect(result.baselineSource).toBe('baseline');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('cross-checks introduced patterns against declared constitution (case-insensitive)', async () => {
    const dir = freshDir();
    try {
      writeScan(dir, {
        timestamp: '2026-06-01T00:00:00.000Z',
        patternNames: { state: ['redux'] },
      });
      writeScan(dir, {
        timestamp: '2026-07-01T00:00:00.000Z',
        patternNames: { state: ['redux', 'zustand', 'jotai'] },
      });
      const config = configWithTemporal({
        constitution: { stateManagement: ['Zustand', 'Redux'] },
      });
      const result = await runDriftOverTime(dir, config, { since: '2026-06-01' });
      // introduced: zustand, jotai. declared (case-insensitive): redux, zustand.
      // Undeclared subset: jotai.
      expect(result.introduced.map((p) => p.name).sort()).toEqual(['jotai', 'zustand']);
      expect(result.introducedUndeclared.map((p) => p.name)).toEqual(['jotai']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('driftScore is bounded to [0, 100]', async () => {
    const dir = freshDir();
    try {
      // 1-pattern baseline, 100-pattern current → drift is capped at 100.
      writeScan(dir, {
        timestamp: '2026-06-01T00:00:00.000Z',
        patternNames: { button: ['Button'] },
      });
      const many: Record<string, string[]> = {};
      for (let i = 0; i < 100; i++) many['button'] = [...(many.button ?? []), `Btn${i}`];
      writeScan(dir, { timestamp: '2026-07-01T00:00:00.000Z', patternNames: many });
      const result = await runDriftOverTime(dir, configWithTemporal(), { since: '2026-06-01' });
      expect(result.driftScore).toBeLessThanOrEqual(100);
      expect(result.driftScore).toBeGreaterThanOrEqual(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips payloads with no inventory (v0.40.x backward compat) while keeping older v0.41.0 snapshots', async () => {
    const dir = freshDir();
    try {
      // Old payload without inventory.
      mkdirSync(join(dir, TELEMETRY_DIR), { recursive: true });
      appendFileSync(
        join(dir, TELEMETRY_DIR, TELEMETRY_FILE),
        JSON.stringify({
          timestamp: '2026-04-01T00:00:00.000Z',
          version: '0.40.0',
          project: { componentCount: 1, slopIndex: 0, assemblyHealth: 100, categoryScores: {}, p90Score: 0, peakScore: 0 },
          violations: [],
          files: [],
        }) + '\n',
        'utf-8',
      );
      // Newer payloads WITH inventory.
      writeScan(dir, {
        timestamp: '2026-06-01T00:00:00.000Z',
        patternNames: { state: ['redux'] },
        scannedFiles: 5,
      });
      writeScan(dir, {
        timestamp: '2026-07-01T00:00:00.000Z',
        patternNames: { state: ['redux', 'zustand'] },
        scannedFiles: 7,
      });
      // `since` falls after the legacy payload — baseline is the v0.41 scan.
      const result = await runDriftOverTime(dir, configWithTemporal(), { since: '2026-05-01' });
      expect(result.snapshotsConsidered).toBe(2);
      expect(result.introduced.map((p) => p.name)).toEqual(['zustand']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('flattenPatternNames', () => {
  it('flattens a per-category name map and sorts lexicographically', () => {
    const out = flattenPatternNames({
      state: ['zustand', 'redux'],
      button: ['Button'],
    });
    expect(out).toEqual([
      { category: 'button', name: 'Button' },
      { category: 'state', name: 'redux' },
      { category: 'state', name: 'zustand' },
    ]);
  });
});

describe('collectDeclaredNames', () => {
  it('returns an empty set when constitution is undefined', () => {
    expect(collectDeclaredNames(undefined).size).toBe(0);
  });
  it('unions all standard fields + custom + forbidden, lowercased', () => {
    const out = collectDeclaredNames({
      stateManagement: ['Zustand', 'Redux'],
      dataFetching: ['react-query'],
      uiLibrary: ['MUI'],
      forms: [],
      styling: ['Tailwind'],
      routing: undefined,
      custom: { orm: ['Prisma'] },
      forbidden: ['moment'],
    });
    expect([...out].sort()).toEqual(
      ['mui', 'moment', 'prisma', 'react-query', 'redux', 'tailwind', 'zustand'].sort(),
    );
  });
});

describe('formatDriftOverTime', () => {
  it('renders an empty history with a clear "no telemetry" message', () => {
    const out = formatDriftOverTime({
      scannedFiles: 0,
      filesWithViolations: 0,
      totalViolations: 0,
      byCategory: {},
      byFile: [],
      conventionSource: 'none',
      constitution: undefined,
      introduced: [],
      removed: [],
      introducedUndeclared: [],
      snapshotsConsidered: 0,
      driftScore: 0,
      baselineAt: '',
      currentAt: '',
      baselineSource: 'baseline',
    });
    expect(out).toContain('No historical telemetry');
  });

  it('renders counts and deltas for a non-empty history', () => {
    const out = formatDriftOverTime({
      scannedFiles: 7,
      filesWithViolations: 0,
      totalViolations: 0,
      byCategory: {},
      byFile: [],
      conventionSource: 'declared',
      constitution: { stateManagement: ['zustand'] },
      introduced: [{ category: 'state', name: 'zustand' }],
      removed: [],
      introducedUndeclared: [],
      snapshotsConsidered: 2,
      driftScore: 33,
      baselineAt: '2026-06-01T00:00:00.000Z',
      currentAt: '2026-07-01T00:00:00.000Z',
      baselineSource: 'since',
    });
    expect(out).toContain('Patterns introduced: 1');
    expect(out).toContain('state/zustand');
    expect(out).toContain('Drift score: 33');
    expect(out).toContain('2026-06-01');
  });
});

describe('slopbrick drift --temporal-since (CLI)', () => {
  it('prints "no historical telemetry" when scans.jsonl is absent', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', `import x from 'zustand';`);
      writeFile(
        dir,
        'slopbrick.config.mjs',
        `export default { include: ['src/**/*.ts'], exclude: [], constitution: { stateManagement: ['zustand'] } };`,
      );
      const { exitCode, stdout } = await runBin(['drift', '--temporal-since', '2026-06-01'], dir);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('No historical telemetry');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports patterns introduced across a two-snapshot window', async () => {
    const dir = freshDir();
    try {
      writeScan(dir, {
        timestamp: '2026-06-01T00:00:00.000Z',
        patternNames: { state: ['redux'] },
      });
      writeScan(dir, {
        timestamp: '2026-07-01T00:00:00.000Z',
        patternNames: { state: ['redux', 'zustand'] },
      });
      const { exitCode, stdout } = await runBin(['drift', '--temporal-since', '2026-06-01'], dir);
      // 1 introduced (zustand) which is NOT in default declared set
      // (no config written), so the undeclared subset picks it up
      // and the exit code is 1.
      expect(exitCode).toBe(1);
      expect(stdout).toContain('Patterns introduced: 1');
      expect(stdout).toContain('state/zustand');
      expect(stdout).toContain('not in declared constitution');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exits 0 when introduced patterns are all in the declared constitution', async () => {
    const dir = freshDir();
    try {
      writeFile(
        dir,
        'slopbrick.config.mjs',
        `export default { include: ['src/**/*.ts'], exclude: [], constitution: { stateManagement: ['zustand'] } };`,
      );
      writeScan(dir, {
        timestamp: '2026-06-01T00:00:00.000Z',
        patternNames: { state: ['redux'] },
      });
      writeScan(dir, {
        timestamp: '2026-07-01T00:00:00.000Z',
        patternNames: { state: ['redux', 'zustand'] },
      });
      const { exitCode, stdout } = await runBin(['drift', '--temporal-since', '2026-06-01'], dir);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Patterns introduced: 1');
      expect(stdout).toContain('state/zustand');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('treats --since baseline as the oldest scan in the JSONL', async () => {
    const dir = freshDir();
    try {
      writeScan(dir, {
        timestamp: '2026-05-01T00:00:00.000Z',
        patternNames: { state: ['redux'] },
      });
      writeScan(dir, {
        timestamp: '2026-07-01T00:00:00.000Z',
        patternNames: { state: ['redux', 'zustand'] },
      });
      const { exitCode, stdout } = await runBin(['drift', '--temporal-since', 'baseline'], dir);
      expect(exitCode).toBe(1);
      expect(stdout).toContain('baseline (oldest scan)');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('slopbrick drift (CLI) — F3 regression guard', () => {
  it('the action callback does not call process.exit directly (verified by AST scan)', async () => {
    // Belt-and-braces guard for architecture-finding F3. The
    // refactored `commands/drift.ts` calls `withExitCode` from
    // `./_shared` and lets the runCli-level `dispatch` catch the
    // resulting CommanderError. A re-introduction of an inline
    // `process.exit(N)` in the action body would re-introduce the
    // test-friction problem the refactor fixed; this guard fails
    // loud if anyone does so.
    //
    // We scan the executable code (stripping line and block
    // comments first) so legitimate prose mention of
    // `process.exit(` in the doc comments doesn't false-positive.
    const { readFileSync } = await import('node:fs');
    const path = require('node:path') as typeof import('node:path');
    const commandsDir = path.resolve(__dirname, '../../src/cli/commands');
    const raw = readFileSync(path.join(commandsDir, 'drift.ts'), 'utf-8');
    // Strip /* block */ and // line comments — crude regex keeps
    // string literals intact (the file has no `process.exit(` in
    // any string), good enough for this guard.
    const stripped = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(stripped).not.toMatch(/process\.exit\s*\(/);
  });
});
