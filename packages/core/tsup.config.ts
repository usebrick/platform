import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  target: 'node18',
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
});
