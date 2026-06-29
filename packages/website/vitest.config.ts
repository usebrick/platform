// vitest.config.ts — scope vitest to the unit-test directory only.
// Playwright tests live in tests/a11y/ and are run by
// `pnpm test:a11y` (which invokes `playwright test`).
// Without this scope, `pnpm test` picks up the .spec.ts files
// and Playwright chokes when vitest tries to import them.
//
// passWithNoTests: true lets `pnpm test` succeed when the website
// has no unit tests (the case after deleting the WebGL test suite).
// When new unit tests are added, they will run automatically.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.{test,spec}.{ts,tsx,js,jsx}'],
    exclude: ['node_modules', 'dist', '.astro', 'tests/a11y/**'],
    passWithNoTests: true,
  },
});
