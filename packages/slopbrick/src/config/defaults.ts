// Public types and default values for slopbrick's user config.
//
// `DEFAULT_CONFIG` is what `slopbrick.config.mjs` users start from
// when they run `slopbrick init`. Framework presets, monorepo
// detection, and per-project overrides are layered on top via the
// load + detect + presets modules.

import type { ResolvedConfig } from '../types';

export type Framework =
  | 'react'
  | 'vue'
  | 'svelte'
  | 'solid'
  | 'qwik'
  | 'astro'
  | 'react-native'
  | 'expo';

export type StylingSolution =
  | 'tailwind'
  | 'css-modules'
  | 'styled-components'
  | 'emotion'
  | 'panda'
  | 'other';

export type UiLibrary = 'shadcn/ui' | 'mui' | 'chakra' | 'radix' | 'tamagui' | 'nativewind';

export type Strictness = 'strict' | 'balanced' | 'permissive';

export interface WizardAnswers {
  framework: Framework;
  styling: StylingSolution;
  uiLibraries: UiLibrary[];
  strictness: Strictness;
  // v0.14.5d: extended wizard covers the full PickBrick taxonomy
  // (Framework / UI / Styling / State / Auth / Forms / Testing / Structure).
  // The first four are pre-existing; the latter four were added so
  // `slopbrick init` is a complete PickBrick-equivalent. Each is an
  // optional free-text value (library name) so the wizard doesn't fail
  // when none of the canonical options match.
  stateManagement?: string;
  auth?: string;
  forms?: string;
  testing?: string;
  structure?: 'feature-based' | 'layer-based' | 'flat' | 'monorepo' | 'other';
}

export const DEFAULT_SPACING_SCALE = [
  0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96,
];

export const DEFAULT_RADIUS_SCALE: (number | 'full')[] = [
  0, 0.125, 0.25, 0.375, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 'full',
];

export const DEFAULT_TYPOGRAPHY_SCALE = [
  '0.75rem', '0.875rem', '1rem', '1.125rem', '1.25rem',
  '1.5rem', '1.875rem', '2.25rem', '3rem', '3.75rem', '4.5rem',
];

export const DEFAULT_RULE_CONFIG: Record<string, unknown> = {
  'typo/placeholder-text': {
    allowlist: ['OK', 'Save', 'Cancel', 'Close'],
    minLength: 3,
  },
  'visual/magic-number-spacing': {
    ignoreProperties: [],
    ignoreZero: true,
  },
  genericCenteringMaxInstances: 1,
};

export const DEFAULT_CONFIG: ResolvedConfig = {
  include: [
    // v0.9.2 — Repository Coherence is language-agnostic. Default include
    // covers frontend (TS/JS/Vue/Svelte/Astro) AND backend (Python/Go).
    // Projects that only have one of these can opt out via config.
    'app/**/*.{ts,tsx,js,jsx,vue,svelte,astro,py,go}',
    'src/**/*.{ts,tsx,js,jsx,vue,svelte,astro,py,go}',
    'components/**/*.{ts,tsx,js,jsx,vue,svelte,astro,py,go}',
    'pages/**/*.{ts,tsx,js,jsx,vue,svelte,astro,py,go}',
    // Backend-only fallbacks: Python and Go repos often have files at
    // the root or under a single package directory, not under src/.
    '**/*.py',
    '**/*.go',
  ],
  exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**'],
  projectMemory: true,
  telemetry: true,
  categoryWeights: {
    visual: 1.2,
    logic: 1.0,
    perf: 0.8,
    typo: 0.5,
    wcag: 1.0,
    layout: 1.0,
    component: 1.0,
    arch: 1.0,
    security: 1.0,
    test: 1.0,
    docs: 1.0,
    db: 1.0,
    ai: 1.0,
    context: 1.0,
    product: 1.0,
    i18n: 1.0,
  },
  rules: {
    'arch/astro-island-leak': 'low',
    'component/giant-component': 'high',
    'component/shadcn-prop-mismatch': 'high',
    'layout/forced-layout': 'medium',
    'layout/gap-monopoly': 'medium',
    'layout/math-element-uniformity': 'medium',
    'layout/math-grid-uniformity': 'high',
    'layout/spacing-grid': 'medium',
    'logic/boundary-violation': 'high',
    'logic/ghost-defensive': 'medium',
    'logic/key-prop-missing': 'high',
    'logic/math-any-density': 'high',
    'logic/math-console-log-storm': 'high',
    'logic/math-gini-class-usage': 'high',
    'logic/math-variable-name-entropy': 'high',
    'logic/optimistic-no-rollback': 'high',
    'logic/qwik-hook-leak': 'high',
    'logic/reactive-hook-soup': 'medium',
    'logic/zombie-state': 'medium',
    'perf/cls-image': 'low',
    'perf/css-bloat': 'low',
    'typo/calc-fontsize': 'medium',
    'typo/calc-raw-px': 'high',
    'typo/clamp-offscale': 'medium',
    'typo/math-button-label-uniformity': 'medium',
    'typo/math-cta-vocabulary': 'medium',
    'visual/arbitrary-escape': 'medium',
    'visual/clamp-soup': 'high',
    'visual/generic-centering': 'low',
    'visual/math-color-cluster': 'high',
    'visual/math-default-font': 'high',
    'visual/math-font-entropy': 'high',
    'visual/math-gradient-hue-rotation': 'high',
    'visual/math-rounded-entropy': 'high',
    'visual/math-spacing-entropy': 'high',
    'wcag/dragging-movements': 'medium',
    'wcag/focus-appearance': 'high',
    'wcag/focus-obscured': 'low',
    'wcag/target-size': 'high',
    'test/weak-assertion': 'medium',
    'test/duplicate-setup': 'medium',
    'test/missing-edge-case': 'high',
    'test/fake-placeholder': 'high',
  },
  frameworkMultipliers: {
    react: 1.0,
    vue: 1.0,
    svelte: 1.0,
    solid: 1.0,
    qwik: 1.0,
    astro: 1.0,
    'react-native': 1.0,
    expo: 1.0,
  },
  spacingScale: DEFAULT_SPACING_SCALE,
  radiusScale: DEFAULT_RADIUS_SCALE,
  ruleConfig: DEFAULT_RULE_CONFIG,
  thresholds: {
    meanSlop: 15,
    p90Slop: 30,
    individualSlopThreshold: 60,
  },
  arbitraryValueAllowlist: [
    'w-full',
    /^w-\[calc\(.*\)\]$/,
    'top-[var(--header-height)]',
  ],
  clampAllowlist: [],
  /** Phase 2 §10: brick.config.json import paths. Defaults to common
   *  shadcn-style paths. Override via `allowedImports` in slopbrick.config.cjs. */
  allowedImports: [
    '@/components/ui/',
    '@/components/',
    '@/lib/',
    '@/hooks/',
  ],
  wcag: {
    targetSizeExemptSelectors: [],
    targetSizeRequireTailwind: true,
  },
  /**
   * PR slop score threshold (Phase 11). `slopbrick pr` exits 1 when
   * the PR introduces more than this many weighted slop points across
   * the changed files. Override per-repo with `prScoreThreshold: 10`
   * in slopbrick.config.mjs, or per-invocation with `--threshold 10`.
   */
  prScoreThreshold: 20,
  /**
   * Phase 5 — Test Intelligence opt-in toggles. The four `test/*`
   * rules are safe-by-default (each rule short-circuits on non-test
   * files via `isTestFile()`), but `test/missing-edge-case` walks
   * production code to find untested branches. Off by default —
   * opt-in per project.
   *
   * ```js
   * // slopbrick.config.mjs
   * export default {
   *   testIntelligence: {
   *     missingEdgeCase: true, // also turn on branch-coverage check
   *   },
   * };
   * ```
   */
  testIntelligence: {
    missingEdgeCase: false,
  },
};
