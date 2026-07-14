import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', pure: 'src/pure.ts' },
  format: ['esm'],
  dts: true,
  // Keep the private engine artifact auditable by the packaged SlopBrick
  // freshness guard. Without source maps a stale workspace build can satisfy
  // import resolution while silently omitting an engine fix.
  sourcemap: true,
  clean: true,
  target: 'node18',
});
