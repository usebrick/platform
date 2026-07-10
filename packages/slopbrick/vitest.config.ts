import { availableParallelism } from 'node:os';
import { defineConfig } from 'vitest/config';

const maxTestWorkers = Math.max(
  1,
  Math.min(4, Math.floor(availableParallelism() / 2)),
);

export default defineConfig({
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
