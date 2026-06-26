// strict config for production gates.
//
// Use this when slopbrick is part of your CI gate (e.g. blocking PRs).
//   * meanSlop: 12  — anything over this fails the build
//   * noIncrease: true — slopIndex must not grow vs. main branch baseline
//   * trend: true   — emit a delta vs. the persisted baseline
//
// Drop into ./slopbrick.config.mjs and add to your CI:
//   `npx slopbrick scan --strict` (exits 1 on threshold breach)

export default {
  include: [
    'app/**/*.{ts,tsx,js,jsx,vue,svelte,astro}',
    'src/**/*.{ts,tsx,js,jsx,vue,svelte,astro}',
    'components/**/*.{ts,tsx,js,jsx,vue,svelte,astro}',
    'pages/**/*.{ts,tsx,js,jsx,vue,svelte,astro}',
  ],
  exclude: [
    '**/node_modules/**',
    '**/.next/**',
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
  ],

  // All rules at their default severity — no softening.
  // The 42 built-in rules cover visual, typo, wcag, layout, component,
  // logic, arch, perf, and security categories.

  thresholds: {
    meanSlop: 12,
    p90Slop: 25,
    individualSlopThreshold: 40,
  },

  // Block the build if the slop index grows vs. the persisted baseline.
  // The baseline file lives at `.slopbrick-baseline.json` by default;
  // override with `baselinePath` if you store it elsewhere.
  noIncrease: true,
};