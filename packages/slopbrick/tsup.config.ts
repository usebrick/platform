import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'engine/worker': 'src/engine/worker.ts',
  },
  format: ['cjs', 'esm'],
  target: 'node18',
  platform: 'node',
  splitting: false,
  sourcemap: true,
  dts: { entry: { index: 'src/index.ts' } },
  clean: true,
  external: [
    '@swc/core',
    'commander',
    'chalk',
    'globby',
    'minimatch',
  ],
  esbuildOptions(options, { format }) {
    if (format === 'cjs') {
      // Provide a working import.meta.url equivalent for the CJS build so
      // createRequire/new URL(...) resolve relative to the emitted file.
      options.define = {
        ...(options.define ?? {}),
        'import.meta.url': '__importMetaUrl',
      };
      options.banner = {
        ...(options.banner ?? {}),
        js: 'const __importMetaUrl = require("url").pathToFileURL(__filename).href;',
      };
    }
  },
});
