import { realpathSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { defineConfig } from 'vitest/config';

const automaticWorkerBudget = (available: number): number => Math.max(
  1,
  Math.min(4, Math.floor(available / 2)),
);

/** Resolve the bounded worker count used by the subprocess-heavy suite. */
export function resolveTestWorkers(
  available: number,
  requested = process.env.SLOPBRICK_VITEST_WORKERS,
): number {
  const automatic = automaticWorkerBudget(available);
  if (requested === undefined || requested.trim() === '') return automatic;
  const parsed = Number(requested);
  if (!Number.isInteger(parsed) || parsed < 1) return automatic;
  return Math.min(automatic, parsed);
}

const maxTestWorkers = resolveTestWorkers(availableParallelism());

export default defineConfig({
  server: {
    fs: {
      // CLI contract tests create real user configs in the OS temp directory.
      // Vitest 3/Vite 6 otherwise rejects those deliberate files at the SSR
      // filesystem boundary even though the production loader is valid.
      allow: [realpathSync(tmpdir())],
    },
  },
  test: {
    globals: false,
    environment: 'node',
    // Several suites launch real CLI subprocesses and scan worker threads.
    // Leave CPU capacity for those nested workers so wall-clock correctness
    // and performance assertions measure SlopBrick instead of host starvation.
    maxWorkers: maxTestWorkers,
    minWorkers: 1,
    // Set SLOPBRICK_VERSION from package.json before any test runs so
    // src/types/_header.ts's VERSION constant matches the real version.
    // tsup's `define` only applies at build time; in vitest we set the
    // env var explicitly so the test in tests/types.test.ts passes.
    setupFiles: ['./tests/_setup.ts'],
    exclude: [
      'node_modules',
      'dist',
      // This is a Node built-in test contract, not a Vitest suite. It is
      // invoked explicitly by CI and the release hook before the full run.
      'scripts/test-capabilities.test.mjs',
      'tests/perf/**/*',
      'tests/fixtures/**/*',
      '.worktrees/**',
    ],
    // 30s for most tests, 120s for heavy engine tests (structure.test.ts
    // can take >30s when the full suite runs under CI resource contention).
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/index.ts',
        'src/rules/builtins.ts',
        'src/scripts/**',
        'dist/**',
      ],
      thresholds: {
        // Round 24: gate CI on a baseline coverage floor. The first
        // sweep measured these values; we'll raise them as we add tests.
        lines: 0,
        functions: 0,
        statements: 0,
        branches: 0,
      },
    },
  },
});
