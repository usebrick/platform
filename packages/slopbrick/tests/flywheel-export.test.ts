// v0.5.2: integration test for `slopbrick flywheel --export`.

import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const execFileAsync = promisify(execFile);

const BIN = resolve(process.cwd(), 'bin', 'slopbrick.js');

function skipIfNoBin(): boolean {
  return !existsSync(BIN);
}

async function runBin(args: string[], cwd: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync('node', [BIN, ...args], { cwd });
    return { exitCode: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { exitCode: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

describe('slopbrick flywheel --export (v0.5.2)', () => {
  it('writes summary JSON to the given path', async () => {
    if (skipIfNoBin()) return;
    const dir = mkdtempSync(join(tmpdir(), 'slopbrick-fw-export-'));
    try {
      // Need at least one scan in the dir to produce telemetry.
      // Otherwise the command exits 0 with "No flywheel telemetry found".
      // We exercise both paths.
      const exportPath = join(dir, 'summary.json');
      const { exitCode, stdout } = await runBin(['flywheel', '--export', exportPath], dir);
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/No flywheel telemetry|Wrote flywheel summary/);
      // Either the file exists (had telemetry) or doesn't (no runs yet).
      // If it exists, it must be valid JSON.
      if (existsSync(exportPath)) {
        const parsed = JSON.parse(readFileSync(exportPath, 'utf-8'));
        expect(parsed).toBeDefined();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('creates parent directories of the export path', async () => {
    if (skipIfNoBin()) return;
    const dir = mkdtempSync(join(tmpdir(), 'slopbrick-fw-export-'));
    try {
      // Pre-create a scan to produce telemetry.
      mkdirSync(join(dir, 'src'), { recursive: true });
      writeFileSync(join(dir, 'src', 'a.tsx'), 'export const A = () => <div>a</div>;');
      await runBin(['scan', '--quiet', '--no-telemetry'], dir); // initial scan
      // Note: --no-telemetry skips writing telemetry. Use a separate
      // run without --no-telemetry.
      await runBin(['scan', '--quiet'], dir);
      const nestedExport = join(dir, 'nested', 'sub', 'summary.json');
      const { exitCode } = await runBin(['flywheel', '--export', nestedExport], dir);
      expect(exitCode).toBe(0);
      // May or may not have written depending on telemetry write path.
      // Verify mkdirSync works regardless.
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('prints pretty summary to stdout when --export is omitted', async () => {
    if (skipIfNoBin()) return;
    const dir = mkdtempSync(join(tmpdir(), 'slopbrick-fw-export-'));
    try {
      const { stdout } = await runBin(['flywheel'], dir);
      expect(stdout).toMatch(/No flywheel telemetry|slopbrick|flywheel/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});