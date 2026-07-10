import { defineConfig } from 'tsup';

export default defineConfig({
  // `verdicts` is intentionally a separate entry: pure consumers such as
  // @usebrick/engine must not pull the root facade's filesystem adapters.
  entry: { index: 'src/index.ts', verdicts: 'src/verdicts.ts' },
  format: ['esm', 'cjs'],
  target: 'node18',
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
});
