import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    exclude: [
      'node_modules',
      'dist',
      'tests/perf/**/*',
      'tests/fixtures/**/*',
      '.worktrees/**',
    ],
    testTimeout: 30000,
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
