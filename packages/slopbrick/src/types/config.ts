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

/**
 * Repository-owned self-scan exclusions. `runScan` removes matching files
 * before scan accounting and scoring, including explicit file arguments.
 * `scanFile` retains the same match as a low-level defensive guard. Unset or
 * empty means no exclusions.
 */
export interface ScanSelfScanConfig {
  /** Glob patterns (minimatch) to exclude from the scan. Matched against
   *  the workspace-relative POSIX-style path. Dot files are matched
   *  (`{ dot: true }` semantics). */
  excludePaths: string[];
}



export interface Rule<Context = unknown> {
  id: string;
  category: Category;
  severity: Severity;
  aiSpecific: boolean;
  /** Round 25: short description shown by `slopbrick rules` and used in docs. */
  description?: string;
  /**
   * v0.20.0: when true, the rule is shipped disabled (off) by default.
   * Users can opt in via `slopbrick.config.mjs` ruleConfig. The
   * defaultOff flag means "this rule is too noisy / uncalibrated to
   * run unconditionally — a user has to explicitly turn it on".
   * See `src/snippet/data.ts` for the canonical list.
   */
  defaultOff?: boolean;
  create(context: RuleContext): Context;
  analyze(context: Context, facts: ScanFacts): Issue[];
}

/**
 * v0.42.0 (Sprint 3, task 3b.1): composite rule type. A composite
 * fires when *at least `minMatch`* of its member `ruleIds` fire on the
 * same file. Members are referenced by their existing `Rule.id`.
 *
 * Structurally parallel to `Rule<Context>` so the `RuleRegistry`
 * treats it uniformly: same `create` + `analyze` lifecycle, same
 * `defaultOff` opt-in semantics, same `severity` for reporter
 * weighting. The engine wires composites after per-file `RuleRegistry`
 * (see `engine/worker.ts` + task 3b.5).
 *
 * Design choice: `CompositeRule<Context>` is its own interface rather
 * than a `Rule<Context>` variant because (a) it carries member-rule
 * metadata (`ruleIds`, `minMatch`) that vanilla rules do not, and
 * (b) the union of the two types would force every consumer to
 * narrow, defeating the structural-parallelism goal.
 */
export interface CompositeRule<Context = unknown> {
  id: string;
  category: Category;
  severity: Severity;
  aiSpecific: boolean;
  /** Short description shown by `slopbrick rules`. */
  description?: string;
  /** v0.42.0: composite rules are opt-in by default. */
  defaultOff?: boolean;
  /** Member rule IDs (sorted, unique). The composite fires when
   *  at least `minMatch` of these fire on the same file. */
  ruleIds: string[];
  /** Minimum number of `ruleIds` that must fire together. */
  minMatch: number;
  create(context: RuleContext): Context;
  analyze(context: Context, facts: ScanFacts): Issue[];
}

/**
 * v0.42.0 (Sprint 3, task 3b.3): clusterer-emitted composite rule
 * entry. The shape that `engine/cluster.ts` produces and that the
 * `RuleRegistry` loader materializes into `CompositeRule<Context>`
 * instances. Lives next to `CompositeRule<Context>` so the public
 * type surface for empirical composites is in one place.
 *
 * Fields mirror the spec in `docs/superpowers/sprint-0.41-0.42.md`
 * §3b STEP 5: id, ruleIds, minMatch, severity, defaultOff,
 * description, calibration, provenance.
 */
export interface CompositeRuleEntry {
  id: string;
  ruleIds: string[];
  minMatch: number;
  severity: Severity;
  defaultOff: true;
  description: string;
  calibration: {
    recall: number;
    /** False-positive rate, FP / neg_count. */
    FP: number;
    precision: number;
    F1: number;
    nFiles: number;
  };
  provenance: {
    seed: 'auto-cluster' | 'hand-curated-by-brief';
    discoveredAt: string;
    nFiles: number;
    members: number;
    /** Strongest NPMI edge among cluster members (0 if singleton). */
    npmi: number;
    /** Strongest-edge Fisher's p (1 if singleton). */
    fisherP: number;
  };
}

/**
 * v0.42.0 (Sprint 3, task 3b.2): input to the empirical composite
 * clusterer. `fireMatrix` is the per-file fired-rule-set map; the
 * other fields are optional inputs to STEP 4 calibration.
 */
export interface ClusterInput {
  /** Per-file fired-rule-set map (file id → set of rule IDs that fired). */
  fireMatrix: ReadonlyMap<string, ReadonlySet<string>>;
  /** Positive (gold-standard) file IDs for recall/precision. */
  positiveFiles?: ReadonlySet<string>;
  /** Severity of each member rule; used to pick `severity = worst`. */
  memberSeverities?: ReadonlyMap<string, Severity>;
  /** Algorithm parameter overrides (all optional). */
  params?: ClusterParamOverrides;
  /** ISO timestamp embedded in `provenance.discoveredAt` for tests. */
  now?: string;
}

export type ClusterParams = {
  minSupport: number;
  minNPMI: number;
  fisherAlpha: number;
  minClusterSize: number;
};

export type ClusterParamOverrides = Partial<ClusterParams>;



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
   * Phase 5 — Test Intelligence opt-in toggles. The three remaining
   * `test/*` rules (`test/weak-assertion`, `test/duplicate-setup`,
   * `test/fake-placeholder`) are safe-by-default (each rule
   * short-circuits on non-test files via `isTestFile()`). v0.38.0
   * removed `test/missing-edge-case` as v10-DORMANT.
   */
  testIntelligence?: {
    /** Reserved for future test opt-ins. */
    [key: string]: boolean | undefined;
  };
  /**
   * Repository-specific self-scan exclusion paths. All runScan candidates are
   * matched relative to the selected workspace and removed before git scope,
   * incremental partitioning, and requested-file accounting. `scanFile`
   * retains the match as a low-level defensive guard. Empty or unset means
   * every selected file is scanned.
   */
  selfScan?: ScanSelfScanConfig;
}
