export const VERSION = '0.14.5d';

// ---------------------------------------------------------------------------
// Phase Memo #4 — AI Maintenance Cost (target 0.8.0)
// ---------------------------------------------------------------------------

/**
 * Categorical bucket for the AI Maintenance Cost score.
 *
 *   low       — ship as-is, revisit quarterly
 *   medium    — schedule cleanup work
 *   high      — block new feature work in the affected subsystem
 *   critical  — dedicated refactor sprint required
 *
 * Deliberately a categorical label (not numeric). Same reasoning as
 * `aiSecurityRisk`: a single bucket is harder to game than a number,
 * and a manager can read "AI Maintenance Cost: HIGH" in two seconds.
 *
 * The numeric `health` (0-100, higher = better) and `monthlyUSD`
 * (estimated monthly cost to fix the underlying issues) are exposed
 * alongside the label for agents and trend pipelines that need them.
 */
export type AiMaintenanceCost = 'low' | 'medium' | 'high' | 'critical';

/** Per-axis contribution to the AI Maintenance Cost score. */
export interface MaintenanceAxisHealth {
  /** Stable axis name (`slopIndex`, `architectureConsistency`, `aiSecurityRisk`, ...). */
  axis: string;
  /** Display label printed by the pretty reporter. */
  label: string;
  /** 0-100, higher = better. Derived from the underlying signal. */
  health: number;
  /** How this was derived, e.g. `100 - slopIndex (inverted)`. */
  source: string;
}

/** Inputs to the pure `computeAiMaintenanceCost` function. Every axis is optional. */
export interface MaintenanceAxes {
  /** 0-100, lower = better. The headline `slopIndex` from `ProjectReport`. */
  slopIndex?: number;
  /** 0-100, higher = better. From `buildArchitectureScore`. */
  architectureConsistency?: number;
  /** Categorical — mapped to numeric via `MAINTENANCE_SECURITY_NUMERIC`. */
  aiSecurityRisk?: 'low' | 'medium' | 'high' | 'critical';
  /** Total constitution violations (sum across categories). */
  constitutionViolations?: number;
  /** Spacing + radius scale violation counts. */
  designTokenDrift?: { spacing: number; radius: number };
  /** Total high-severity issues across the scan. Extra penalty. */
  highSeverityIssueCount?: number;
  /** Approximate LoC; defaults to 0 if unknown (small-project path). */
  linesOfCode?: number;
  /** False when the user has not declared a constitution / design tokens
   * (no drift run). When true, applies the 1.5–2.5× AI multiplier. */
  hasAiSignals?: boolean;
}

/** Result returned by `computeAiMaintenanceCost` + `computeAiMaintenanceCostFromReport`. */
export interface AiMaintenanceCostResult {
  /** Categorical headline. */
  cost: AiMaintenanceCost;
  /** Weighted health in 0-100 (higher = better). Bucket is derived from this. */
  health: number;
  /** Estimated monthly USD cost to fix the underlying issues.
   *  Anchored to Sonar's $306K/yr/MLoC baseline ($25.50/1k LoC/month)
   *  with the CodeClimate grade→minutes mapping for per-issue cost. */
  monthlyUSD: number;
  /** Per-axis breakdown, sorted by health ascending (worst first). */
  axes: MaintenanceAxisHealth[];
  /** Per-bucket advice for managers. */
  advice: string;
}

// ---------------------------------------------------------------------------
// Phase 6 — Documentation Drift (target 0.8.0)
// ---------------------------------------------------------------------------

/**
 * Categorical drift band on the doc-freshness score.
 *   low       — 80-100
 *   medium    — 60-79
 *   high      — 40-59
 *   critical  — 0-39
 *
 * Drives the `--strict` exit code for `slopbrick docs` (high/critical = 1).
 */
export type DocDriftLevel = 'low' | 'medium' | 'high' | 'critical';

/** A single doc-drift finding — one rule firing on one line. */
export interface DocFinding {
  ruleId:
    | 'docs/stale-package-reference'
    | 'docs/stale-function-reference'
    | 'docs/expired-code-example'
    | 'docs/broken-link';
  severity: 'low' | 'medium' | 'high';
  docFile: string;
  line: number;
  column: number;
  message: string;
  advice: string;
  /** For `stale-package-reference`: the package the doc references. */
  package?: string;
  /** For `stale-function-reference`: the identifier. */
  identifier?: string;
  /** For `broken-link`: the unresolved link target. */
  link?: string;
}

// ---------------------------------------------------------------------------
// Phase 8 — Database Health (target 0.8.0)
// ---------------------------------------------------------------------------

/**
 * Categorical drift band on the db-health score.
 *   low       — 80-100
 *   medium    — 60-79
 *   high      — 40-59
 *   critical  — 0-39
 */
export type DbDriftLevel = 'low' | 'medium' | 'high' | 'critical';

/** A single db-health finding — one rule firing on one table/file. */
export interface DbFinding {
  ruleId:
    | 'db/missing-fk-index'
    | 'db/duplicate-index'
    | 'db/missing-not-null'
    | 'db/enum-sprawl'
    | 'db/naming-inconsistency'
    | 'db/sql-concat';
  severity: 'low' | 'medium' | 'high';
  dbFile: string;
  line: number;
  column: number;
  message: string;
  advice: string;
  /** For rules that target a specific table. */
  table?: string;
  /** For column-level rules. */
  columnName?: string;
}

// ---------------------------------------------------------------------------
// Phase 12 — Repository Health + AI Debt (target 0.9.0)
// ---------------------------------------------------------------------------

/**
 * Letter-grade band on the composite Repository Health score.
 * Drives the `aiDebt` field — same categorical shape as `aiSecurityRisk`.
 *
 *   low       — 80-100  (clean; safe to ship)
 *   medium    — 60-79   (manageable; revisit quarterly)
 *   high      — 40-59   (block new feature work in affected subsystems)
 *   critical  — 0-39    (dedicated refactor sprint required)
 */
export type AiDebt = 'low' | 'medium' | 'high' | 'critical';

/** Numeric mapping for categorical `aiSecurityRisk` used in the composite. */
export const AI_SECURITY_NUMERIC: Record<'low' | 'medium' | 'high' | 'critical', number> = {
  low: 100,
  medium: 75,
  high: 40,
  critical: 10,
};

/** Inputs to the pure `buildRepositoryHealth` function. Every input is optional. */
export interface RepositoryHealthInputs {
  /** 0-100, lower = better. Inverted to 100 - x for the composite. */
  slopIndex?: number;
  /** 0-100, higher = better. */
  architectureConsistency?: number;
  /** Categorical — mapped via AI_SECURITY_NUMERIC. */
  aiSecurityRisk?: 'low' | 'medium' | 'high' | 'critical';
  /** Spacing + radius scale violation counts. */
  designTokenViolations?: { spacing: number; radius: number };
  /** Total high-severity issue count (extra penalty). */
  highSeverityIssueCount?: number;
  /** 0-100, higher = better. From `slopbrick test` (Phase 5). */
  testQuality?: number;
  /** 0-100, higher = better. From `slopbrick business-logic` (Phase 7). */
  businessLogicCoherence?: number;
  /** 0-100, higher = better. From `slopbrick docs` (Phase 6). */
  docFreshness?: number;
  /** 0-100, higher = better. From `slopbrick db` (Phase 8). */
  dbHealth?: number;
  /** v0.10 — MDL log-likelihood ratio from `computeMDLikelihood`.
   *  Positive = rule-firing evidence favors m_ai; negative favors
   *  m_human. Surfaced on the result for reporting; NOT folded into
   *  the weighted-average composite (which is heuristic and remains
   *  unchanged in this phase). Caller computes the ratio from the
   *  distinct `ruleId` set across the report's issues. */
  mdlLogRatio?: number;
}

/** Result returned by `buildRepositoryHealth` + `buildRepositoryHealthFromReport`. */
export interface RepositoryHealth {
  /** Composite 0-100 score (higher = better). */
  score: number;
  /** Letter-grade band derived from `score`. */
  aiDebt: AiDebt;
  /** Per-axis contribution breakdown (axis → 0-100, higher = better). */
  breakdown: Record<string, number>;
  /** Per-axis weight actually applied (post-renormalization). */
  appliedWeights: Record<string, number>;
  /** Warnings for managers (e.g. "Critical security risk overrides everything"). */
  warnings: string[];
  /** One-line summary. */
  headline: string;
  /** v0.10 — MDL log-likelihood ratio (positive = m_ai evidence).
   *  Surfaced when the caller passed `mdlLogRatio` to
   *  `buildRepositoryHealth`. Not folded into the weighted-average
   *  composite in this phase (kept separate so the heuristic score
   *  can be audited independently of the MDL axis). */
  mdlLogRatio?: number;
}

/** Default weights — sum to 1.0. Optional axes are skipped, and the
 *  remaining weights renormalize to 1.0. Tuned to give `aiSecurityRisk`
 *  the heaviest weight (it is the catastrophic single-event dimension)
 *  while still letting slopIndex + architecture drive most cases. */
export const REPOSITORY_HEALTH_WEIGHTS = {
  slopIndex: 0.20,
  architectureConsistency: 0.20,
  aiSecurityRisk: 0.20,
  designTokenViolations: 0.10,
  testQuality: 0.10,
  businessLogicCoherence: 0.10,
  docFreshness: 0.05,
  dbHealth: 0.05,
} as const;

export type { Constitution } from './config/conventions';

export type Severity = 'low' | 'medium' | 'high';

export type RuleSeverity = Severity | 'auto';

export type Category =
  | 'visual'
  | 'typo'
  | 'wcag'
  | 'layout'
  | 'component'
  | 'logic'
  | 'arch'
  | 'perf'
  | 'security'
  | 'test'
  | 'docs'
  | 'db'
  | 'ai'
  | 'context'
  | 'product'
  | 'i18n';

/**
 * `react` covers `.tsx`, `.jsx`, `.ts`, `.js`. Other values are detected
 * by file extension. Unknown extensions fall back to `'react'`.
 */
export type Framework = 'react' | 'vue' | 'svelte' | 'astro' | 'html';

export interface FixSuggestion {
  kind: 'insert' | 'replace' | 'css-anchor';
  description: string;
  targetFile?: string;
  anchor?: string;
  oldValue?: string;
  newValue?: string;
}

export interface Issue {
  ruleId: string;
  category: Category;
  severity: Severity;
  aiSpecific: boolean;
  filePath?: string;
  message: string;
  line: number;
  column: number;
  advice?: string;
  fixHint?: string;
  fix?: FixSuggestion;
  fixes?: FixSuggestion[];
  // Set by reporters that consume `getSignalStrength(ruleId)`. Omitted
  // when no metadata is available so JSON stays lean for known rules.
  signalStrength?: import('./rules/signal-strength').SignalStrength;
}

// subsequent runs can skip unchanged files. Cache invalidates on
// VERSION mismatch (defined here alongside the type so a single source
// of truth covers both runtime types and on-disk format).
export interface CachedFile {
  hash: string;
  issueCount: number;
  lastScannedAt: string;
}
export interface ScanCache {
  version: string;
  generatedAt: string;
  files: Record<string, CachedFile>;
}

export interface ClassNameFact {
  value: string;
  line: number;
  column: number;
}

export interface ElementFact {
  tag: string;
  attributes: Record<string, string | undefined>;
  classNames: ClassNameFact[];
  eventHandlers: string[];
  line: number;
  column: number;
}

export interface HookFact {
  name: string;
  line: number;
  column: number;
  hasDependencyArray?: boolean;
  body?: string;
  componentLine?: number;
  dependencies?: string[];
}

export interface HookCallFact {
  name: string;
  callee: string;
  line: number;
  column: number;
  inConditional: boolean;
  inLoop: boolean;
  inNestedFunction: boolean;
}

export interface FetchCallFact {
  line: number;
  column: number;
  hasAbortSignal: boolean;
  checksOk: boolean;
  /**
   * The URL argument to fetch(), if it could be extracted as a string literal.
   * Dynamic expressions (template strings, variables) are left undefined.
   */
  url?: string;
  /**
   * The `credentials` option if explicitly set ('omit' | 'same-origin' | 'include').
   * Undefined when not specified.
   */
  credentials?: 'omit' | 'same-origin' | 'include';
  /** HTTP method (uppercase) when explicitly set as the second argument. */
  method?: string;
}

export interface DisabledLintRuleFact {
  ruleId: string;
  line: number;
  column: number;
  scope: 'line' | 'next-line' | 'block';
}

export interface EvalCallFact {
  kind: 'eval' | 'new-function' | 'function-constructor';
  line: number;
  column: number;
}

export interface PropMutationFact {
  target: string;
  line: number;
  column: number;
}

export interface DangerouslySetInnerHtmlFact {
  line: number;
  column: number;
}

export interface OptimisticUpdateFact {
  setterName: string;
  line: number;
  column: number;
  hasCatchRollback?: boolean;
}

export interface StateBinding {
  valueName?: string;
  setterName?: string;
  line: number;
  column: number;
  valueReferenced: boolean;
  setterReferenced: boolean;
}

export interface PropPassThroughFact {
  propName: string;
  toTag: string;
  line: number;
  column: number;
}

export interface ComponentFacts {
  name?: string;
  line: number;
  column: number;
  endLine: number;
  isServerComponent: boolean;
  // Round 23: true if the component is wrapped in React.memo() or
  // React.forwardRef(). Inline event handlers are only an anti-pattern
  // when the component is memoized; otherwise the perf cost is zero.
  isMemoWrapped?: boolean;
  hookCalls: HookFact[];
  stateBindings: StateBinding[];
  propBindings: string[];
  propPassThroughs: PropPassThroughFact[];
  propUsages: string[];
}

export interface LogicalExpressionFact {
  depth: number;
  line: number;
  column: number;
  text: string;
  isOptionalChainLike: boolean;
}

export interface StylePropFact {
  source: string;
  line: number;
  column: number;
}

export interface AstroComponentFact {
  tag: string;
  hasClientDirective: boolean;
  hasEventHandler: boolean;
  line: number;
  column: number;
}

export interface ConsoleCallFact {
  method: 'log' | 'warn' | 'error' | 'info' | 'debug';
  line: number;
  column: number;
}

export interface DialogCallFact {
  method: 'alert' | 'confirm' | 'prompt';
  line: number;
  column: number;
}

export interface StringLiteralFact {
  value: string;
  line: number;
  column: number;
}

export interface JsxTextLiteralFact {
  value: string;
  line: number;
  column: number;
  parentTag?: string;
}

// Round 23: a code comment (line or block) with its full text and location.
export interface CommentFact {
  kind: 'Line' | 'Block';
  value: string;
  line: number;
  column: number;
}

export interface StateBindingFact {
  valueName: string;
  setterName: string;
  line: number;
  column: number;
}

export interface JsxAttributeStringLiteralFact {
  value: string;
  attribute: string;
  line: number;
  column: number;
}

export interface TamaguiStylePropFact {
  name: string;
  value: string;
  line: number;
  column: number;
}

export interface KeyPropFact {
  tag: string;
  valueType: 'index' | 'missing' | 'stable' | 'unknown';
  line: number;
  column: number;
}

export interface InlineEventHandlerFact {
  tag: string;
  event: string;
  source: string;
  line: number;
  column: number;
  // Round 23: true if the enclosing component is wrapped in React.memo()
  // or React.forwardRef(). The rule is only meaningful in that case because
  // inline handlers defeat memoization. Without memo, the perf cost is zero.
  hasMemoParent?: boolean;
}

export interface UseEffectBodyFact {
  line: number;
  column: number;
  source: string;
}

export interface DomQueryFact {
  method: string;
  line: number;
  column: number;
}

export interface ExplicitAnyFact {
  line: number;
  column: number;
  kind?: 'keyword' | 'missing-annotation';
}

export interface NonNullAssertionFact {
  line: number;
  column: number;
}

export interface ComponentSizeFact {
  name?: string;
  lineCount: number;
  jsxBranchCount: number;
  line: number;
  column: number;
}

export interface HookDependencyArrayFact {
  hookName: string;
  depsSource: string;
  line: number;
  column: number;
}

/**
 * flat-shape fields have been removed; consumers must read from `v2`.
 * See src/engine/types.ts for the grouped shape definition.
 */
export interface ScanFacts {
  /** Absolute file path. */
  filePath: string;
  v2: import('./engine/types').ScanFactsV2;
}

export interface ImportFact {
  source: string;
  line: number;
  column: number;
  importedNames?: string[];
}

export interface FileScanResult {
  filePath: string;
  componentCount: number;
  issues: Issue[];
  parseError?: string;
  gapValues?: string[];
  styleSources?: string[];
  elementTags?: string[];
  unmatchedStringLiterals?: string[];
  /**
   *  `// slopbrick-disable` directive filtering. */
  facts?: ScanFacts;
  /**
   * v0.14.6 — Composite AI-likelihood score for this file.
   *
   * Naive Bayes log-likelihood ratio combination of all triggered
   * rules. `probability` in [0, 1] = P(AI-generated | rules fire);
   * `confidenceTier` is one of LIKELY_HUMAN / INCONCLUSIVE / LIKELY_AI
   * / VERY_LIKELY_AI per Jaeschke 1994 JAMA thresholds.
   *
   * Populated by the scan pipeline after rule execution. Undefined
   * when no rules fired (probability stays at the prior prevalence).
   */
  compositeScore?: import('./engine/composite-scoring.js').CompositeScore;
}

export interface ComponentScore {
  filePath: string;
  rawScore: number;
  componentScore: number;
  adjustedScore: number;
  componentCount: number;
}

export interface BaselineMeta {
  active: boolean;
  version: string;
  baselineRevision: number;
  createdAt: string;
}

export interface ProjectReport {
  version: string;
  generatedAt: string;
  configPath?: string;
  slopIndex: number;
  assemblyHealth: number;
  totalScore: number;
  categoryScores: Record<Category, number>;
  /** Phase 2 §10: composite subscores. Each is in 0-100 (capped).
   *  slopIndex = 0.40 × boundaryScore + 0.35 × contextScore + 0.25 × visualScore. */
  boundaryScore: number;
  contextScore: number;
  visualScore: number;
  /** Phase 2 §10: ruleId → subscore bucket, used by the composite formula.
   *  Each issue contributes to exactly one bucket. */
  subscores?: Record<string, number>;
  /** Architecture Consistency Score (0-100). 100 = one modal system, one
   * button variant, one api client, one state lib, one fetch lib, no
   * off-scale values. Optional because it requires a deeper scan and
   * is only computed when the project has source files. */
  architectureConsistency?: number;
  /** Per-category deductions behind the architecture score. */
  architectureDeductions?: import('./engine/architecture-score').CategoryDeduction[];
  /** AI Security Risk — categorical severity for security findings
   * disproportionately introduced by AI-generated code. Independent
   * from slopIndex (mixing them would let a project hide one with
   * the other). Drives the `slopbrick security` subcommand and the
   * security column in scan reports. */
  aiSecurityRisk?: 'low' | 'medium' | 'high' | 'critical';
  /** Count of security findings broken down by severity. */
  aiSecurityFindings?: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  /** Phase 7: Business Logic Coherence (0-100). 100 = no anti-pattern
   * findings across pricing/validation/formatting. Higher is better.
   * Independent of slopIndex + architectureConsistency. Drives the
   * `slopbrick business-logic` subcommand. */
  businessLogicCoherence?: number;
  /** Phase 7: per-issue list backing the business-logic score. */
  businessLogicIssues?: import('./engine/business-logic').BusinessLogicIssue[];
  /** Phase 5 — Test Quality Score (0-100, lower = more issues). Higher is better.
   * Independent from slopIndex — derived from the four `test/*` rules when
   * `slopbrick test` runs. Surfaced in the JSON report and the dedicated
   * subcommand's pretty output. */
  testQuality?: number;
  /** Phase Memo #4 — AI Maintenance Cost (categorical headline + numeric breakdown).
   *  Derived from the existing signals in this report (no new file scanning).
   *  Present when `slopbrick scan` or `slopbrick maintenance-cost` runs. */
  aiMaintenanceCost?: AiMaintenanceCostResult;
  /** Phase 6 — Documentation Freshness (0-100, higher = better). 100 = no
   *  stale references found in doc files; 0 = every rule fired on every
   *  file. Independent of slopIndex — derived from the four `docs/*`
   *  rules. Surfaced in `slopbrick scan` and the dedicated `slopbrick
   *  docs` subcommand. */
  docFreshness?: number;
  /** Categorical drift band, derived from `docFreshness`. */
  docDrift?: DocDriftLevel;
  /** Per-finding list behind the doc-freshness score. */
  docFindings?: DocFinding[];
  /** Phase 8 — Database Health (0-100, higher = better). Static-only
   *  analysis via `pgsql-parser` (libpg_query port). 100 = no anti-patterns
   *  found in SQL / Prisma / Drizzle schema files. */
  dbHealth?: number;
  /** Categorical drift band, derived from `dbHealth`. */
  dbDrift?: DbDriftLevel;
  /** Per-finding list behind the db-health score. */
  dbFindings?: DbFinding[];
  /** Phase 12 — Repository Health (composite 0-100). The endgame score
   *  that aggregates every prior sub-score into one number a manager
   *  reads in two seconds. Always informational; --strict for CI gating. */
  repositoryHealth?: number;
  /** Categorical AI Debt band, derived from `repositoryHealth`. */
  aiDebt?: AiDebt;
  /** Per-axis breakdown of the composite. */
  repositoryHealthBreakdown?: Record<string, number>;
  /** Warnings emitted during composite computation. */
  repositoryHealthWarnings?: string[];
  /** v0.9.1 — Repository Coherence (0-100, higher = better). The headline
   *  score under the new "Repository Coherence Scanner" framing. Composite
   *  of Architecture Consistency (50%), Pattern Fragmentation (30%),
   *  Constitution Violations (10%), and AI Debt (10%). Distinct from
   *  `repositoryHealth` (the older catch-all composite) and from
   *  `slopIndex` (the per-rule aggregate). */
  coherence?: number;
  /** Per-axis breakdown of the Coherence composite. Each input 0-100. */
  coherenceBreakdown?: {
    /** Architecture Consistency (existing score, fed in unchanged). */
    architectureConsistency: number;
    /** Pattern Fragmentation (inverted to 0-100, higher = better). */
    patternFragmentation: number;
    /** Constitution violations count mapped to 0-100. 100 = none. */
    constitutionMapped: number;
    /** AI Debt letter band mapped to 0-100. A→95, B→85, C→70, D→50, F→25. */
    aiDebtMapped: number;
  };
  /** Weights actually applied to the Coherence composite (post-renormalization). */
  coherenceWeights?: {
    architectureConsistency: number;
    patternFragmentation: number;
    constitutionMapped: number;
    aiDebtMapped: number;
  };
  /** v0.9.1 — Code Hygiene domain score (0-100, higher = better). Aggregates
   *  the 31 "Supporting" rules across logic/test/typo/visual/layout that
   *  don't fit the Coherence lens but are still useful findings. */
  codeHygiene?: number;
  /** Accessibility domain score (0-100, higher = better). Derived from
   *  the four `wcag/*` rules. */
  accessibility?: number;
  /** Performance domain score (0-100, higher = better). Derived from
   *  the `perf/*` rules. */
  performance?: number;
  /** Per-domain issue counts (after the v0.9.1 rule classification). */
  domainIssues?: Record<string, number>;
  /** v0.9.2 — Cross-file pattern drift signals. Each signal is a stem
   *  (concept) realized as 2+ distinct patterns in the same category
   *  across files. The lens answer: "did this code introduce a new
   *  pattern when an existing pattern already existed?" */
  crossFileDrift?: Array<{
    category: 'modal' | 'button' | 'api' | 'state' | 'dataFetching' | 'service' | 'route' | 'ormModel';
    stem: string;
    variants: string[];
    files: string[];
  }>;
  /** v0.9.2 — Cross-category drift: stems that appear in 2+ categories
   *  with 2+ variants each. E.g. service.User + ormModel.User = same
   *  conceptual entity spanning 2 roles. */
  crossCategoryDrift?: Array<{
    stem: string;
    byCategory: Record<string, string[]>;
    files: string[];
  }>;
  p90Score: number;
  peakScore: number;
  componentCount: number;
  fileCount: number;
  components: ComponentScore[];
  issues: Issue[];
  parseErrors?: Array<{ filePath: string; error: string }>;
  baseline?: BaselineMeta;
  thresholds: { meanSlop: number; p90Slop: number; individualSlopThreshold: number };
  /** Research/flywheel snapshot — present when the flywheel directory has artifacts. */
  research?: ResearchMetrics;
  topOffenders?: TopOffender[];
  /**
   * v0.10.1 — PR Slop Score. Aggregate weighted issue count for the
   * `--diff <ref>` mode (the VibeDrift-compatible git-ref filter).
   * Computed as Σ(SEVERITY_WEIGHTS[issue.severity]) for issues in
   * files changed since the ref. SEVERITY_WEIGHTS = { high: 10,
   * medium: 5, low: 1 }. Only present when `diffRef` was supplied.
   * The CI threshold (config.prScoreThreshold) gates on this.
   */
  prSlopScore?: number;
  /** v0.10.1 — the git ref supplied to --diff <ref>. Undefined for full scans. */
  diffRef?: string;
  /**
   * v0.12.0 — Diagnostic stats from the new math engines. Surfaced in
   * HTML/JSON reporters under "v0.12 Calibration Diagnostics". Does
   * NOT affect slopIndex or any headline score; purely informational.
   *
   * bayesianPosterior: P(AI | fired_rules) computed via naive-Bayes
   *   likelihood-ratio combination per Bento et al. 2024 *Neurocomputing*.
   *   Range [0, 1]. > 0.5 = net AI signal; < 0.5 = net human signal.
   * survivingFiresCount: number of fires that survive Benjamini–Hochberg
   *   FDR control at α = 0.05 across the full rule set. The "free rigor"
   *   upgrade that converts the silent multi-testing problem into a
   *   calibrated number.
   */
  v012Stats?: {
    bayesianPosterior: number;
    bayesianMatchedRules: number;
    totalLogLr: number;
    survivingFiresCount: number;
    totalFiresCount: number;
    fdrAlpha: number;
    /**
     * v0.13.0 — Probabilistic AI detection across 3 evidence buckets.
     * Each file gets a P(AI | date, coding fires, general-practice fires)
     * via naive Bayes. Range [0, 1]. Buckets:
     *   - 'likely_ai'     : P >= 0.7
     *   - 'uncertain'     : 0.4 <= P < 0.7
     *   - 'likely_human'  : P < 0.4
     */
    probabilisticAi?: {
      /** Per-file P(AI) averaged across the project, weighted by file size. */
      projectP_ai: number;
      /** Fraction of files in each bucket. */
      bucketDistribution: {
        likely_ai: number;
        uncertain: number;
        likely_human: number;
      };
      /** Date-based prior: P(AI | lastCommitDate), midpoint 2024-01-01. */
      datePrior: number;
      /** Evidence from AI-detector rules (markdown leakage, any density, etc.). */
      codingLogLr: number;
      /** Evidence from general-practice rules (low spacing entropy, etc.). */
      practiceLogLr: number;
    };
    /** v0.13.0 — Per-file P(AI) distribution (top 10 by file size). */
    topP_aiFiles?: Array<{
      filePath: string;
      p_ai: number;
      bucket: 'likely_ai' | 'uncertain' | 'likely_human';
      lastCommitDate: string;
    }>;
  };
  /** v0.14.5i — Count of issues auto-suppressed because their rule was
   *  marked `defaultOff: true` in signal-strength.json (INVERTED or NOISY
   *  rules that would erode trust in the tool if surfaced in CI). Surfaced
   *  in the main scan output as a trust signal so the user can see that
   *  the tool is calibrated, not just noisy. The user can opt back in
   *  via `rules: { 'rule/id': 'medium' }` in slopbrick.config.mjs. */
  defaultOffSuppressedCount?: number;
  /** v0.14.5i — Number of distinct rules marked defaultOff. The ratio
   *  suppressedCount / defaultOffRuleCount is the calibration coverage. */
  defaultOffRuleCount?: number;
}

export interface TopOffender {
  filePath: string;
  /** Count of issues attributed to this file (from per-file results). */
  issueCount: number;
  /** Adjusted score for the file (post-baseline, post-framework-multiplier). */
  adjustedScore: number;
}

export interface BaselineCache {
  version: string;
  config_hash: string;
  git_head: string;
  baseline_created: string;
  baseline_revision: number;
  totalComponentCount: number;
  scores: Record<string, { baselineScore: number; componentCount: number }>;
}

export interface SlopAuditRun {
  timestamp: string;
  version: string;
  slopIndex: number;
  categoryScores: Record<Category, number>;
  topOffenseIds: string[];
  thresholdExceeded: boolean;
}

export interface AutoTunedRule {
  ruleId: string;
  severity: Severity;
  reason: string;
}

export interface RuleSuggestion {
  pattern: string;
  example: string;
  count: number;
  suggestedRuleId: string;
}

/**
 * Optional research/flywheel metrics. Surfaced in the JSON report and the
 * flywheel summary when present. Generated by the
 * `research generate | analyze | candidates` pipeline.
 */
export interface ResearchMetrics {
  generatedSampleCount: number;
  generatedRuleCoverage: number;
  /** Number of fingerprint clusters that turned into candidate rules. */
  candidateYield: number;
  /** When the research artifacts were last refreshed. */
  updatedAt: string;
}

export interface FlywheelState {
  version: string;
  updatedAt: string;
  autoTuned: AutoTunedRule[];
  research?: ResearchMetrics;
}

export interface FlywheelOutput {
  autoTuned: AutoTunedRule[];
  hotspotIssues: Issue[];
  suggestions: RuleSuggestion[];
  research?: ResearchMetrics;
}

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
  constitution?: import('./config/conventions').Constitution;
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
