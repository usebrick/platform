// monorepo example config.
//
// Run from the monorepo root. The default include globs already cover
// `packages/*/src/**` because `include` is anchored at the cwd. Adjust
// the package names to match your workspace.
//
// For pnpm/turbo workspaces, slopbrick auto-detects workspace packages
// from `pnpm-workspace.yaml`, `turbo.json`, or `package.json#workspaces`.
// See `src/config.ts` → `findWorkspacePackages` for the full detection
// logic.

export default {
  // Scan every workspace package's source tree.
  include: [
    'packages/*/src/**/*.{ts,tsx,js,jsx,vue,svelte,astro}',
    'apps/*/src/**/*.{ts,tsx,js,jsx,vue,svelte,astro}',
    'packages/*/app/**/*.{ts,tsx,js,jsx,vue,svelte,astro}',
    'apps/*/app/**/*.{ts,tsx,js,jsx,vue,svelte,astro}',
    'packages/*/components/**/*.{ts,tsx,js,jsx,vue,svelte,astro}',
    'apps/*/components/**/*.{ts,tsx,js,jsx,vue,svelte,astro}',
    'packages/*/pages/**/*.{ts,tsx,js,jsx,vue,svelte,astro}',
    'apps/*/pages/**/*.{ts,tsx,js,jsx,vue,svelte,astro}',
  ],
  exclude: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/.turbo/**',
    '**/coverage/**',
    // Generated files live in tools packages — skip them.
    'packages/tools/codegen/**',
    '**/*.generated.{ts,tsx}',
  ],

  rules: {
    // Cross-package rules are noisier in monorepos; soften.
    'arch/astro-island-leak': 'off',
  },

  thresholds: {
    meanSlop: 20,
    p90Slop: 40,
    individualSlopThreshold: 60,
  },
};