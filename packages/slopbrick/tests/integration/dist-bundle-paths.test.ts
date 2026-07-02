/**
 * Regression test for the dist-bundle path bug.
 *
 * v0.14.5d discovered that the bundled CJS distribution failed to
 * locate `src/rules/signal-strength.json` because composite-scoring.ts
 * used `readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),
 * '..', 'rules', 'signal-strength.json'))` — and the bundled file lives
 * at `dist/index.cjs`, so `../rules/signal-strength.json` resolves to
 * `<package-root>/rules/signal-strength.json` (a path that doesn't
 * exist in the published tarball).
 *
 * Fix: composite-scoring now uses `loadSignalStrength()` from
 * `src/rules/signal-strength.ts`, which uses a static JSON import
 * (`import ... with { type: 'json' }`) that esbuild inlines into the
 * bundle. Works in both ESM and bundled CJS.
 *
 * This test runs the actual BUILT `bin/slopbrick.js` against a
 * trivial fixture. Before the fix it would fail with:
 *   `ENOENT: no such file or directory, open
 *    '/Users/cheng/platform/packages/slopbrick/rules/signal-strength.json'`
 * After the fix it succeeds and reports `slopIndex=0` for a clean file.
 *
 * If you're tempted to remove this test because "the unit tests cover
 * loadSignalStrength": they don't. The unit tests run via tsx, which
 * resolves `import.meta.url` to the .ts source file — so they would
 * pass even with the broken readFileSync path. Only this integration
 * test, which spawns the bundled CJS subprocess, catches the real bug.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, statSync } from 'node:fs';

const BIN_PATH = join(__dirname, '..', '..', 'bin', 'slopbrick.js');
const DIST_INDEX = join(__dirname, '..', '..', 'dist', 'index.cjs');

let tmpDir: string;
let proc: ReturnType<typeof spawn>;

function runScan(workspace: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    proc = spawn('node', [BIN_PATH, 'scan', '--workspace', workspace, '--format', 'json'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.stdout?.on('data', (d) => { stdout += d.toString(); });
    proc.stderr?.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => resolve({ stdout, stderr, exitCode: code ?? -1 }));
    proc.on('error', reject);
  });
}

describe('bundled dist artifact paths (v0.14.5d regression)', () => {
  beforeAll(() => {
    if (!existsSync(BIN_PATH) || !existsSync(DIST_INDEX)) {
      throw new Error(
        `Bundled dist not found. Run \`pnpm build\` first. ` +
        `Missing: ${existsSync(BIN_PATH) ? '' : 'bin/slopbrick.js'} ` +
        `${existsSync(DIST_INDEX) ? '' : 'dist/index.cjs'}`,
      );
    }
    // Sanity check: the dist is actually a bundle, not the source.
    const distSize = statSync(DIST_INDEX).size;
    expect(distSize).toBeGreaterThan(100_000); // bundles are > 100KB

    tmpDir = mkdtempSync(join(tmpdir(), 'slopbrick-dist-bug-'));
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(
      join(tmpDir, 'src', 'clean.tsx'),
      'export function Clean() { return <div>hello</div>; }\n',
    );
  });

  afterAll(() => {
    if (proc && !proc.killed) proc.kill();
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('the bundled CJS binary finds src/rules/signal-strength.json (no ENOENT)', async () => {
    const { stdout, stderr, exitCode } = await runScan(tmpDir);
    // Before the fix: stderr contained
    //   `ENOENT: no such file or directory, open
    //    '.../slopbrick/rules/signal-strength.json'`
    expect(stderr).not.toContain('ENOENT');
    expect(stderr).not.toContain('signal-strength.json');
    // The scan should succeed (exit 0) on a clean fixture.
    expect(exitCode).toBe(0);
    // The output must be valid JSON with `aiSlopScore: 0` (no
    // AI slop detected, the v0.21.0 raw-amount reading). The
    // legacy `slopIndex` field is also kept for backward compat
    // and should be 0 (no slop detected, same as the new
    // aiSlopScore reading).
    const data = JSON.parse(stdout);
    expect(data.aiSlopScore).toBe(0);
    expect(data.slopIndex ?? 0).toBe(0);
    expect(data.issues).toEqual([]);
  });

  it('the bundled CJS binary applies defaultOff from signal-strength.json (proves it loaded)', async () => {
    // Use a fixture that triggers a default-off rule. The `w-[100px]`
    // arbitrary value triggers the `tailwind-arbitrary-value` rule,
    // which is DORMANT in signal-strength.json. Before the fix, the
    // readFileSync path threw and the rule fired normally (visible
    // issue). After the fix, the rule is properly auto-disabled.
    writeFileSync(
      join(tmpDir, 'src', 'arbitrary.tsx'),
      'export function A() { return <div className="w-[100px]">x</div>; }\n',
    );
    const { stdout } = await runScan(tmpDir);
    const data = JSON.parse(stdout);
    // The tailwind-arbitrary-value rule should NOT fire in the issues
    // list because signal-strength.json marks it defaultOff:true.
    const ruleIds = data.issues.map((i: { ruleId: string }) => i.ruleId);
    expect(ruleIds).not.toContain('visual/tailwind-arbitrary-value');
  });
});
