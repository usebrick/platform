// vitest.config.ts — scope vitest to the unit-test directory only.
// Playwright tests live in tests/a11y/ and are run by
// `pnpm test:a11y` (which invokes `playwright test`).
// Without this scope, `pnpm test` picks up the .spec.ts files
// and Playwright chokes when vitest tries to import them.
//
// Tests use the jsdom environment so DOM globals (document,
// window, IntersectionObserver mocks, etc.) are available —
// these are pure browser scripts, not Node code.
//
// passWithNoTests: true lets `pnpm test` succeed when a checkout has no
// website unit tests; browser/a11y tests remain a separate Playwright gate.
// When new unit tests are added, they will run automatically.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.{test,spec}.{ts,tsx,js,jsx}'],
    exclude: ['node_modules', 'dist', '.astro', 'tests/a11y/**'],
    passWithNoTests: true,
    environment: 'jsdom',
  },
});
