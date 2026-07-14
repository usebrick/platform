import { afterEach, describe, expect, it } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runScan } from '../../src/cli/scan';
import { persistRun } from '../../src/cli/report/persistRun';
import { RuleRegistry } from '../../src/rules/registry';
import { evaluateThresholdGate } from '../../src/cli/threshold';

const dirs: string[] = [];

function createWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-canonical-selection-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'src', 'components'), { recursive: true });
  mkdirSync(join(dir, 'src', 'excluded'), { recursive: true });
  writeFileSync(
    join(dir, 'slopbrick.config.mjs'),
    [
      'export default {',
      "  include: ['src/**/*.tsx'],",
      "  selfScan: { excludePaths: ['src/excluded/**'] },",
      '  telemetry: true,',
      '};',
    ].join('\n'),
  );
  writeFileSync(
    join(dir, 'src', 'components', 'Button.tsx'),
    'export function Button() { return <button>Save</button>; }\n',
  );
  writeFileSync(
    join(dir, 'src', 'components', 'IconButton.tsx'),
    'export function IconButton() { return <button aria-label="Save" />; }\n',
  );
  writeFileSync(join(dir, 'src', 'excluded', 'Modal.tsx'), 'export const Modal = () => null;\n');
  writeFileSync(join(dir, 'src', 'excluded', 'Dialog.tsx'), 'export const Dialog = () => null;\n');
  return dir;
}

function snapshotTree(root: string): Map<string, string> {
  const snapshot = new Map<string, string>();
  const visit = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) visit(path);
      else snapshot.set(path.slice(root.length + 1), readFileSync(path, 'utf8'));
    }
  };
  visit(root);
  return snapshot;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('canonical scan selection', () => {
  it('keeps self-scan exclusions out of architecture and persisted inventory across cache hits', async () => {
    const dir = createWorkspace();
    const cachePath = join(dir, '.incremental-cache.json');
    const options = {
      workspace: dir,
      quiet: true,
      incremental: true,
      cachePath,
      cache: true,
      autoRefreshSnippets: true,
      threadCount: 1,
    } as const;

    const first = await runScan(options);
    expect(first.results).toHaveLength(2);
    expect(first.report).toMatchObject({ completionStatus: 'complete', scoreValidity: 'valid' });
    expect(first.report.architectureConsistency).toBe(92);
    expect(first.report.architectureDeductions?.map((deduction) => deduction.category))
      .toEqual(['buttonVariants']);

    const inventory = JSON.parse(
      readFileSync(join(dir, '.slopbrick', 'inventory.json'), 'utf8'),
    ) as {
      scannedFiles: number;
      patterns: Array<{ category: string; name: string }>;
      components: Array<{ name: string }>;
    };
    expect(inventory.scannedFiles).toBe(2);
    expect(inventory.patterns).toEqual([
      { category: 'button', name: 'Button', imports: [], fileCount: 1 },
      { category: 'button', name: 'IconButton', imports: [], fileCount: 1 },
    ]);
    expect(inventory.components.map(({ name }) => name).sort()).toEqual(['Button', 'IconButton']);

    const memoryBefore = snapshotTree(join(dir, '.slopbrick'));
    const cacheBefore = readFileSync(cachePath, 'utf8');
    const cacheMtimeBefore = statSync(cachePath).mtimeMs;

    const second = await runScan(options);
    expect(second.results).toEqual([]);
    expect(second.scanStats).toMatchObject({
      status: 'partial',
      requested: 2,
      analyzed: 0,
      skipped: 2,
    });
    expect(second.report).toMatchObject({
      completionStatus: 'partial',
      scoreValidity: 'incomplete',
    });
    expect(evaluateThresholdGate(second.report, second.config)).toMatchObject({
      status: 'invalid',
      scoreValidity: 'incomplete',
    });
    expect(snapshotTree(join(dir, '.slopbrick'))).toEqual(memoryBefore);
    expect(readFileSync(cachePath, 'utf8')).toBe(cacheBefore);
    expect(statSync(cachePath).mtimeMs).toBe(cacheMtimeBefore);
  });

  it('falls back to result paths when persistence callers omit the exact selection', async () => {
    const dir = createWorkspace();
    const scan = await runScan({
      workspace: dir,
      quiet: true,
      telemetry: false,
      threadCount: 1,
    });
    rmSync(join(dir, '.slopbrick'), { recursive: true, force: true });

    const registry = new RuleRegistry();
    registry.loadBuiltins();
    await persistRun({
      cwd: dir,
      config: scan.config,
      options: { workspace: dir, quiet: true, telemetry: false },
      report: scan.report,
      results: scan.results,
      startTime: Date.now(),
      registry,
      incrementalSummary: undefined,
      telemetryEnabled: false,
      machineReadableStdout: true,
    });

    const inventory = JSON.parse(
      readFileSync(join(dir, '.slopbrick', 'inventory.json'), 'utf8'),
    ) as {
      scannedFiles: number;
      patterns: Array<{ category: string; name: string }>;
    };
    expect(inventory.scannedFiles).toBe(2);
    expect(inventory.patterns.map(({ category, name }) => ({ category, name }))).toEqual([
      { category: 'button', name: 'Button' },
      { category: 'button', name: 'IconButton' },
    ]);
  });
});
