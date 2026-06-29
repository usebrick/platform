// slopbrick config for the slopbrick repo itself.
// v0.14.5g: hand-written because the auto-generated version
// (from `slopbrick init`) had two syntax bugs that the parser
// rejected. The auto-gen logic is tracked in a separate fix.

export default {
  include: [
    "src/**/*.{ts,tsx,js,jsx}",
    "tests/**/*.{ts,tsx,js,jsx}",
  ],
  exclude: [
    "**/node_modules/**",
    "**/dist/**",
    "**/.slopbrick/**",
    "**/cache/**",
  ],
  projectMemory: true,
  telemetry: true,
  categoryWeights: {
    visual: 1.0,
    logic: 1.2,    // CLI tool — logic bugs matter more than visual polish
    perf: 1.0,
    typo: 0.5,
    wcag: 0.3,     // CLI is not user-facing
    layout: 0.5,
    component: 1.0,
    arch: 1.2,     // CLI structure matters
    security: 1.0,
    test: 1.0,
    docs: 1.0,
    db: 0.5,       // no DB in this repo
    ai: 1.0,       // we ship AI rules
    context: 0.8,
    product: 0.5,
    i18n: 0.3,     // CLI is English-only
  },
  frameworkMultipliers: {
    "react": 1,
    "vue": 1,
    "svelte": 1,
    "solid": 1,
    "qwik": 1,
    "astro": 1,
    "react-native": 1,
    "expo": 1,
  },
  spacingScale: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96],
  ruleConfig: {
    "typo/placeholder-text": {
      allowlist: ["OK", "Save", "Cancel", "Close"],
      minLength: 3,
    },
    "visual/magic-number-spacing": {
      ignoreProperties: [],
      ignoreZero: true,
    },
    genericCenteringMaxInstances: 1,
  },
  thresholds: {
    meanSlop: 15,
    p90Slop: 30,
    individualSlopThreshold: 60,
  },
  arbitraryValueAllowlist: [
    "w-full",
    new RegExp("^w-\\[calc\\(.*\\)\\]$", ""),
    "top-[var(--header-height)]",
  ],
  clampAllowlist: [],
  wcag: {
    targetSizeExemptSelectors: [],
    targetSizeRequireTailwind: true,
  },
  prScoreThreshold: 20,
};
