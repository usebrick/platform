import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    fs: {
      // pure-api.test.ts imports a freshly-built ESM artifact from the OS
      // temp directory; allow that deliberate test fixture through Vite's
      // SSR filesystem boundary.
      allow: [realpathSync(tmpdir())],
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
