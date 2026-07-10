import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', pure: 'src/pure.ts' },
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'node18',
});
