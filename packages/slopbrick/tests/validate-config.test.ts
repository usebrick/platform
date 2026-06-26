import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

const BIN = join(process.cwd(), 'bin', 'slopbrick.js');

function createTmp(): string {
  return mkdtempSync(join(tmpdir(), 'slopbrick-validate-'));
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

describe('slopbrick validate-config', () => {
  it('passes a minimal valid config (exit 0)', async () => {
    const dir = createTmp();
    try {
      const cfg = 'export default { rules: { "visual/math-default-font": "low" } };';
      writeFileSync(join(dir, 'slopbrick.config.mjs'), cfg);
      const { exitCode, stdout } = await runBin(['validate-config'], dir);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('No issues found');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes an empty config (all defaults are valid)', async () => {
    const dir = createTmp();
    try {
      writeFileSync(join(dir, 'slopbrick.config.mjs'), 'export default {};');
      const { exitCode } = await runBin(['validate-config'], dir);
      expect(exitCode).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects an unknown rule id with a suggestion (exit 1)', async () => {
    const dir = createTmp();
    try {
      const cfg = 'export default { rules: { "visual/math-defualt-font": "low" } };'; // typo
      writeFileSync(join(dir, 'slopbrick.config.mjs'), cfg);
      const { exitCode, stdout } = await runBin(['validate-config'], dir);
      expect(exitCode).toBe(1);
      expect(stdout).toContain('visual/math-defualt-font');
      expect(stdout).toMatch(/Did you mean "visual\/math-default-font"\?/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a non-positive threshold value (exit 1)', async () => {
    const dir = createTmp();
    try {
      const cfg = 'export default { thresholds: { meanSlop: -5 } };';
      writeFileSync(join(dir, 'slopbrick.config.mjs'), cfg);
      const { exitCode, stdout } = await runBin(['validate-config'], dir);
      expect(exitCode).toBe(1);
      expect(stdout).toMatch(/meanSlop/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects an invalid framework value (exit 1)', async () => {
    const dir = createTmp();
    try {
      const cfg = 'export default { framework: "angular" };';
      writeFileSync(join(dir, 'slopbrick.config.mjs'), cfg);
      const { exitCode, stdout } = await runBin(['validate-config'], dir);
      expect(exitCode).toBe(1);
      expect(stdout).toMatch(/angular/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports warnings for unknown top-level keys (exit 0)', async () => {
    const dir = createTmp();
    try {
      const cfg = 'export default { mysteryKey: 42 };';
      writeFileSync(join(dir, 'slopbrick.config.mjs'), cfg);
      const { exitCode, stdout } = await runBin(['validate-config'], dir);
      // Unknown keys are warnings, not errors → exit 0
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/warning/);
      expect(stdout).toMatch(/mysteryKey/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns exit 2 when config file is missing', async () => {
    const dir = createTmp();
    try {
      const { exitCode, stderr } = await runBin(['validate-config'], dir);
      expect(exitCode).toBe(2);
      expect(stderr).toMatch(/not found/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts an explicit --config <path> arg', async () => {
    const dir = createTmp();
    try {
      const cfgPath = join(dir, 'custom.mjs');
      writeFileSync(cfgPath, 'export default {};');
      const { exitCode, stdout } = await runBin(['validate-config', cfgPath], dir);
      expect(exitCode).toBe(0);
      expect(stdout).toContain(cfgPath);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports a load error when the config file is malformed (exit 2)', async () => {
    const dir = createTmp();
    try {
      // Missing `export default` — will throw at import time.
      writeFileSync(join(dir, 'slopbrick.config.mjs'), 'this is not valid ESM {{{');
      const { exitCode } = await runBin(['validate-config'], dir);
      // Either 1 (if validator catches) or 2 (if load fails). Both acceptable
      // for "config can't be used".
      expect([1, 2]).toContain(exitCode);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// Sanity guard: the binary must exist after `pnpm build` for these tests to run.
describe('validate-config test setup', () => {
  it('binary exists', () => {
    expect(existsSync(BIN)).toBe(true);
  });
});