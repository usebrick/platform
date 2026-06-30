/**
 * v0.18.4 (Phase B R-M2): types split.
 * Module: config
 *
 * Cross-module deps: `Category`, `RuleSeverity`, `Severity` from `./primitives`,
 * `Issue`, `ScanFacts` from `./scan`.
 */

import type { Category, RuleSeverity, Severity } from './primitives';
import type { Issue, ScanFacts } from './scan';

export interface MagicNumberSpacingConfig {
  ignoreProperties?: string[];
  ignoreZero?: boolean;
}



export interface RuleContext {
  config: ResolvedConfig;
  filePath: string;
  cwd: string;
  framework?: string;
  uiLibraries?: string[];
  hasTailwind?: boolean;
  supportsRsc?: boolean;
  hotspotIssues?: Issue[];
}



export interface Rule<Context = unknown> {
  id: string;
  category: Category;
  severity: Severity;
  aiSpecific: boolean;
  /** Round 25: short description shown by `slopbrick rules` and used in docs. */
  description?: string;
  create(context: RuleContext): Context;
  analyze(context: Context, facts: ScanFacts): Issue[];
}



export interface ResolvedConfig {
  framework?: string;
  hasTailwind?: boolean;
  supportsRsc?: boolean;
  uiLibraries?: string[];
  include: string[];
  exclude: string[];
  rules: Record<string, RuleSeverity | 'off'>;
  categoryWeights?: Record<Category, number>;
  /**
   *  Defaults to { boundary: 0.40, context: 0.35, visual: 0.25 } when unset. */
  compositeWeights?: { boundary: number; context: number; visual: number };
  frameworkMultipliers: Record<string, number>;
  ruleConfig: Record<string, unknown>;
  gapTokens?: string[];
  globalCssTarget?: string;
  projectMemory?: boolean;
  telemetry?: boolean;
  thresholds: {
    meanSlop: number;
    p90Slop: number;
    individualSlopThreshold: number;
    /** Round 20: per-category thresholds (security fails, typo warns). Optional. */
    categoryThresholds?: Partial<Record<Category, number>>;
  };
  spacingScale?: number[];
  /**
   * Declared border-radius scale in rem (Tailwind default) plus the
   * string 'full' for the 9999px utility. Numeric values that don't
   * fall on the scale (after px→rem conversion) trigger the
   * `visual/radius-scale-violation` rule.
   */
  radiusScale?: (number | 'full')[];
  typographyScale?: string[];
  arbitraryValueAllowlist: (string | RegExp)[];
  clampAllowlist?: (string | RegExp)[];
  /** Phase 2 §10: allowed import paths from brick.config.json. Imports
   *  from `@/components/*` not matching these patterns are flagged by
   *  `context/import-path-mismatch`. */
  allowedImports?: string[];
  wcag: {
    targetSizeExemptSelectors: string[];
    targetSizeRequireTailwind?: boolean;
  };
  /**
   * Declared repository constitution: "this repo uses Zustand for
   * state, shadcn for UI, react-query for data fetching" plus an
   * explicit deny-list of forbidden packages. Drives the `slop_suggest`
   * and `slop_check_constitution` MCP tools and the
   * `slopbrick drift` reporter. Auto-detected from package.json when
   * unset; user declarations always win (including explicit empty
   * arrays, which mean "we deliberately don't use this category").
   */
  constitution?: import('../config/conventions').Constitution;
  /**
   * PR slop score threshold (Phase 11). `slopbrick pr` exits 1 when
   * the PR introduces more than this many weighted slop points across
   * the changed files. Default: 20. Lower it to fail PRs that add any
   * meaningful slop; raise it to be more permissive. Overridden on
   * the CLI by `--threshold <n>`.
   */
  prScoreThreshold?: number;
  /**
   * Phase 5 — Test Intelligence opt-in toggles. The four `test/*`
   * rules are safe-by-default (each rule short-circuits on non-test
   * files via `isTestFile()`), but `test/missing-edge-case` walks
   * production code to find untested branches. Off by default —
   * opt-in per project.
   */
  testIntelligence?: {
    /** Walk production AST to find branches without test coverage. */
    missingEdgeCase?: boolean;
  };
}
