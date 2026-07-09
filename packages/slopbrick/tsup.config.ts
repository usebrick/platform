import { defineConfig } from 'tsup';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'engine/worker': 'src/engine/worker.ts',
  },
  format: ['cjs', 'esm'],
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' };
  },
  target: 'node18',
  platform: 'node',
  splitting: false,
  sourcemap: true,
  dts: { entry: { index: 'src/index.ts' }, resolve: /^@usebrick\// },
  clean: true,
  external: [
    '@swc/core',
    'commander',
    'chalk',
    'globby',
    'minimatch',
  ],
  // Workspace packages are symlinked into node_modules/@usebrick/* by pnpm,
  // which makes esbuild treat them as external by default. Force them to be
  // bundled into dist/ so the published tarball has no runtime dep on
  // `@usebrick/core` (which is private and cannot be installed by npm).
  noExternal: [/^@usebrick\//],
  esbuildOptions(options, { format }) {
    // Inject the package version at build time so `process.env.SLOPBRICK_VERSION`
    // in src/types/_header.ts becomes the literal version string. Avoids the
    // runtime `require('../package.json')` trick that breaks after bundling.
    options.define = {
      ...(options.define ?? {}),
      'process.env.SLOPBRICK_VERSION': JSON.stringify(pkg.version),
    };
    if (format === 'cjs') {
      // Provide a working import.meta.url equivalent for the CJS build so
      // createRequire/new URL(...) resolve relative to the emitted file.
      options.define = {
        ...options.define,
        'import.meta.url': '__importMetaUrl',
      };
      options.banner = {
        ...(options.banner ?? {}),
        js: 'const __importMetaUrl = require("url").pathToFileURL(__filename).href;',
      };
    }
  },
});
