import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // Existing tests/unit/ contains vitest unit tests; only run a11y tests here.
  testIgnore: ['tests/unit/**'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Astro 7 detects the Codex/agent environment and daemonizes `astro dev`.
    // Playwright needs the server process attached for startup/teardown.
    command: 'ASTRO_DEV_BACKGROUND=false pnpm dev',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
