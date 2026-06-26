import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const BIN = join(process.cwd(), 'bin', 'slopbrick.js');

const SNAPSHOT_DIR = join(process.cwd(), 'tests', 'snapshots');

function createTmp(): string {
  return mkdtempSync(join(tmpdir(), 'slopbrick-snap-'));
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

function snapshotPath(name: string): string {
  return join(SNAPSHOT_DIR, `${name}.txt`);
}

function assertSnapshot(name: string, actual: string): void {
  const path = snapshotPath(name);
  let existing: string | null = null;
  try {
    existing = readFileSync(path, 'utf-8');
  } catch {
    // first run: write the snapshot
  }
  if (existing === null) {
    writeFileSync(path, actual, 'utf-8');
    return;
  }
  // Allow drift: timestamp lines (e.g. "Generated:") are filtered.
  const norm = (s: string) => s.replace(/^\s*Generated:.*$/gm, '<generated>').trim();
  if (norm(existing) !== norm(actual)) {
    // First-write the diff to help debugging.
    throw new Error(
      `Snapshot mismatch for ${name}.\n` +
      `If this is intentional, delete ${path}.\n` +
      `--- existing (first 200 chars) ---\n${norm(existing).slice(0, 200)}\n` +
      `--- actual (first 200 chars) ---\n${norm(actual).slice(0, 200)}`,
    );
  }
}

describe('CLI snapshot tests (round 24)', () => {
  describe('slopbrick explain', () => {
    it('produces a stable output for a known rule (round 24)', async () => {
      const dir = createTmp();
      try {
        const { stdout, exitCode } = await runBin(['explain', 'visual/math-default-font'], dir);
        expect(exitCode).toBe(0);
        assertSnapshot('explain-math-default-font', stdout);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('returns a friendly error for an unknown rule (round 24)', async () => {
      const dir = createTmp();
      try {
        const { stdout, exitCode } = await runBin(['explain', 'does/not-exist'], dir);
        expect(exitCode).toBe(2);
        assertSnapshot('explain-unknown-rule', stdout);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('slopbrick tokens', () => {
    it('summarizes a DTCG tokens file (round 24)', async () => {
      const dir = createTmp();
      try {
        const tokensPath = join(dir, 'tokens.json');
        writeFileSync(
          tokensPath,
          JSON.stringify({
            color: { primary: { $value: '#ff0000', $type: 'color' } },
            spacing: { md: { $value: '8px', $type: 'dimension' } },
          }),
        );
        const { stdout, exitCode } = await runBin(['tokens', tokensPath], dir);
        expect(exitCode).toBe(0);
        assertSnapshot('tokens-summary', stdout);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
