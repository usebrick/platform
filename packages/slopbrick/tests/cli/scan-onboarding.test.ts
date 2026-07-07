// Refactor 9 — first-time-user onboarding block.
//
// Asserts that `slopbrick scan` prints a friendly multi-line onboarding
// block to stderr when (a) no slopbrick.config.{mjs,cjs,js} exists in the
// workspace or any ancestor directory AND (b) zero source files matched.
//
// The block must be short (≤8 lines of meaningful content) and must
// contain:
//   (1) one-line summary of what slopbrick is,
//   (2) the exact command to generate a config (`slopbrick init`),
//   (3) one-line "what's next" hint.
//
// It must NOT appear when a config exists, when files matched, when
// --quiet is passed, or when stdout is machine-readable (--json/--format
// json/sarif/html).

import { describe, expect, it, beforeAll, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertDistBuilt, cleanupTempDir, createTmpDir, run } from '../helpers/cli';

beforeAll(assertDistBuilt);

// Lines from the onboarding block that contain the three required pieces.
const ONBOARDING_KEYWORDS =
  /Repository Coherence Scanner|slopbrick init|--include|No slopbrick\.config\.mjs found/;

// Onboarding content lines (excludes blank separators).
const ONBOARDING_CONTENT_LINES = 4;

describe('scan — first-time user onboarding (Refactor 9)', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('shows the onboarding block when no config exists and 0 files match', async () => {
    // Empty tmp dir — no config, no source files. findConfigPath walks up
    // to root and returns undefined → onboarding branch fires.
    const { exitCode, stderr } = await run(['--workspace', dir]);

    // Refactor 1 baseline: scan completes cleanly even with 0 files.
    expect(exitCode).toBe(0);

    // Required pieces present on stderr.
    expect(stderr).toContain('Repository Coherence Scanner');
    expect(stderr).toContain('No slopbrick.config.mjs found');
    expect(stderr).toContain('slopbrick init');
    expect(stderr).toContain('slopbrick scan');
    expect(stderr).toContain('--include');

    // Block must be short — ≤8 content lines (separator blanks excluded).
    const contentLines = stderr
      .split('\n')
      .filter((line) => line.length > 0 && ONBOARDING_KEYWORDS.test(line));
    expect(contentLines.length).toBeGreaterThanOrEqual(ONBOARDING_CONTENT_LINES);
    expect(contentLines.length).toBeLessThanOrEqual(8);
  });

  it('does NOT show the onboarding block when a config exists and 0 files match', async () => {
    // Drop a minimal config so findConfigPath returns a path. The 0-files
    // branch still fires but uses the with-config 1-line warning.
    writeFileSync(join(dir, 'slopbrick.config.cjs'), 'module.exports = {};\n');

    const { exitCode, stderr } = await run(['--workspace', dir]);

    expect(exitCode).toBe(0);

    // Original 1-line warning IS present.
    expect(stderr).toContain('No source files matched');

    // Onboarding-specific copy is absent.
    expect(stderr).not.toContain('Repository Coherence Scanner');
    expect(stderr).not.toContain('No slopbrick.config.mjs found');
    expect(stderr).not.toContain('Generate a config');
  });

  it('does NOT show the onboarding block when files match (even with no config)', async () => {
    // Source file present → 0-files branch never triggers.
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(
      join(dir, 'src', 'A.tsx'),
      'export function A() { return <div>hi</div>; }\n',
    );

    const { exitCode, stderr } = await run(['--workspace', dir]);

    expect(exitCode).toBe(0);

    expect(stderr).not.toContain('Repository Coherence Scanner');
    expect(stderr).not.toContain('No source files matched');
    expect(stderr).not.toContain('No slopbrick.config.mjs found');
  });

  it('does NOT show the onboarding block in --json mode (machine-readable stdout)', async () => {
    // --format json flips `machineReadableStdout = true` → onboarding is
    // suppressed so it never leaks into structured-output consumers.
    const { stdout, stderr, exitCode } = await run([
      '--workspace',
      dir,
      '--format',
      'json',
    ]);

    expect(exitCode).toBe(0);
    expect(() => JSON.parse(stdout)).not.toThrow();

    expect(stderr).not.toContain('Repository Coherence Scanner');
    expect(stderr).not.toContain('No source files matched');
    expect(stderr).not.toContain('No slopbrick.config.mjs found');
  });

  it('does NOT show the onboarding block under --quiet', async () => {
    // --quiet flips `!options.quiet` false → onboarding is suppressed.
    const { exitCode, stderr } = await run(['--workspace', dir, '--quiet']);

    expect(exitCode).toBe(0);

    expect(stderr).not.toContain('Repository Coherence Scanner');
    expect(stderr).not.toContain('No source files matched');
  });

  // v0.43.0: --strict used to say "High-severity issues found with --strict."
  // which was accurate but unhelpful — exit code 2 users want to know
  // WHICH rules tripped. Verify the message now lists the top rules.
  it('--strict message names the top high-severity rules (not just "issues found")', async () => {
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src/eval.ts'), `const x: any = eval('1+1');\nexport default x;\n`);
    writeFileSync(join(dir, 'slopbrick.config.mjs'), `export default { include: ['src/**/*'], exclude: [] };`);
    const { exitCode, stderr } = await run(['--workspace', dir, 'scan', '--strict']);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/High-severity issues found with --strict/);
    expect(stderr).toMatch(/security\/eval/);
  });
});