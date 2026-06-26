// basic example config.
//
// Copy this file to ./slopbrick.config.mjs in your project root,
// then run `npx slopbrick scan`.
//
// This config is the recommended starting point for most projects:
//   * medium-friction thresholds so you don't get flooded on first run
//   * `perf/css-bloat` and `wcag/focus-appearance` softened to 'low' so they
//     report but don't block
//   * test/storybook fixtures excluded so noise doesn't drown signal
//   * node_modules / .next / dist excluded by default

export default {
  // Where to scan. Defaults to common app dirs; override here if your
  // project uses a non-standard layout (e.g. `app/`, `pages/`, `lib/`).
  include: [
    'app/**/*.{ts,tsx,js,jsx,vue,svelte,astro}',
    'src/**/*.{ts,tsx,js,jsx,vue,svelte,astro}',
    'components/**/*.{ts,tsx,js,jsx,vue,svelte,astro}',
    'pages/**/*.{ts,tsx,js,jsx,vue,svelte,astro}',
  ],

  // Where to skip. The defaults exclude build output, deps, and VCS dirs.
  exclude: [
    '**/node_modules/**',
    '**/.next/**',
    '**/dist/**',
    '**/build/**',
    '**/.turbo/**',
    '**/.svelte-kit/**',
    '**/.astro/**',
    '**/coverage/**',
    '**/*.test.{ts,tsx,js,jsx}',
    '**/*.stories.{ts,tsx,js,jsx}',
    '**/__tests__/**',
    '**/__mocks__/**',
  ],

  // Per-rule severity overrides. The defaults are tuned for most projects,
  // but you can soften or harden individual rules here.
  rules: {
    // Soften noisy default-on rules so they report without blocking.
    'perf/css-bloat': 'low',
    'wcag/focus-appearance': 'low',
    'wcag/focus-obscured': 'low',
    // Disable rules that don't apply to most projects.
    'arch/astro-island-leak': 'off', // only fires on Astro projects
  },

  // Slop Index thresholds. Lower = stricter gate.
  //   meanSlop: average slop across all scanned files
  //   p90Slop:  90th-percentile slop (catches one-file disasters)
  //   individualSlopThreshold: per-file ceiling; flags any file over this
  thresholds: {
    meanSlop: 25,
    p90Slop: 45,
    individualSlopThreshold: 70,
  },

  // Repository constitution — declared so the slop_suggest and
  // slop_check_constitution MCP tools (and the slopbrick drift command)
  // can flag PR-introduced code that drifts from your stack.
  // Auto-detected from package.json when unset; explicit values here
  // always win (an empty array means "we deliberately don't use this
  // category"). Add a `forbidden: ['moment', '@types/']` deny-list to
  // fail any PR that introduces a banned package.
  //
  // Example: stateManagement: ['zustand']   — flag any new Redux / Jotai
  // import as a constitution violation.
  //
  // constitution: {
  //   stateManagement: ['zustand'],
  //   dataFetching: ['react-query'],
  //   uiLibrary: ['shadcn', 'radix'],
  //   forms: ['react-hook-form', 'zod'],
  //   styling: ['tailwind'],
  //   routing: ['next'],
  //   forbidden: ['moment', '@types/'],
  // },
};