/**
 * v0.18.4 (Phase B R-M2): types split.
 * Module: project-report
 *
 * Cross-module deps: `Category` from `./primitives`, `Issue` + `ComponentScore`
 * from `./scan`, `TopOffender` + `AiMaintenanceCostResult` + `DocDriftLevel` +
 * `DocFinding` + `DbDriftLevel` + `DbFinding` + `AiDebt` from `./report`,
 * `BaselineMeta` + `ResearchMetrics` from `./baseline`.
 */

import type { Category } from './primitives';
import type { ComponentScore, Issue } from './scan';
import type {
  AiDebt,
  AiMaintenanceCostResult,
  DbDriftLevel,
  DbFinding,
  DocDriftLevel,
  DocFinding,
  TopOffender,
} from './report';
import type { BaselineMeta, ResearchMetrics } from './baseline';

export interface ProjectReport {
  version: string;
  generatedAt: string;
  configPath?: string;
  /**
   * v0.20.0: renamed from `aiSlopScore` to `aiSlopScore` because the
   * old name implied a property of the *code* (quality) when it
   * actually measures a property of the *tool's detection* (how
   * many AI-detection rules fire on this codebase). 0-100, higher
   * is better — but 'better' means 'fewer rule fires', not
   * 'higher quality code'. The name "AI Slop Score" matches the
   * existing description ("measures AI-slop signatures") and the
   * slopbrick brand. See the pre-publish checklist in
   * CONTRIBUTING.md for the full rationale.
   */
  aiSlopScore: number;
  engineeringHygiene: number;
  security: number;
  repositoryHealth: number;
  assemblyHealth: number;
  totalScore: number;
  /** @deprecated v0.20.0: use `aiSlopScore`. Kept as optional for
   *  backward compat with existing test fixtures and historical
   *  telemetry. Will be removed in v0.21. */
  slopIndex?: number;
  categoryScores: Record<Category, number>;
  /** Phase 2 §10: composite subscores. Each is in 0-100 (capped).
   *  slopIndex = 0.40 × boundaryScore + 0.35 × contextScore + 0.25 × visualScore. */
  boundaryScore: number;
  contextScore: number;
  visualScore: number;
  /** Phase 2 §10: ruleId → subscore bucket, used by the composite formula.
   *  Each issue contributes to exactly one bucket. */
  subscores?: Record<string, number>;
  /** v0.18.2: project-level aggregate of the per-file Bayesian
   *  composite scores (worker.ts:98 produces them; previously dropped
   *  on the floor). The mean is the headline "is this codebase AI?"
   *  signal; max catches the single worst file. Informational, does
   *  not affect the 4 headline scores (those are deterministic).
   *
   *  Kept optional for backward compat with existing fixtures. */
  compositeScore?: {
    /** Mean across all files that fired at least one rule. */
    mean: number;
    /** Highest per-file probability in the scan. */
    max: number;
    /** Confidence tier of the mean (per Jaeschke 1994 JAMA). */
    tier: 'LIKELY_HUMAN' | 'INCONCLUSIVE' | 'LIKELY_AI' | 'VERY_LIKELY_AI';
    /** Number of files that contributed a composite score. */
    fileCount: number;
  };
  /** Architecture Consistency Score (0-100). 100 = one modal system, one
   * button variant, one api client, one state lib, one fetch lib, no
   * off-scale values. Optional because it requires a deeper scan and
   * is only computed when the project has source files. */
  architectureConsistency?: number;
  /** Per-category deductions behind the architecture score. */
  architectureDeductions?: import('../engine/architecture-score').CategoryDeduction[];
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
  businessLogicIssues?: import('../engine/business-logic').BusinessLogicIssue[];
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
  /**
   * v0.42.0 (user-review fix): names of thresholds that tripped in this
   * scan. Optional for backward compat with v0.41 and earlier reports.
   * Empty/undefined means all gates passed.
   *
   * Possible values: 'meanSlop', 'p90Slop', 'individualSlopThreshold',
   * 'category:<name>' (per-category thresholds).
   *
   * CI consumers can grep this field directly instead of parsing the
   * stderr message. See threshold.ts#failedThresholds for source.
   */
  failedThresholds?: string[];
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
  /** v0.14.5j — The previous run's Slop Index, if any. Used by
   *  formatPretty to render a "±N from last run" delta so the user
   *  can see the trajectory without grep'ing the run log. */
  previousSlopIndex?: number;
  /** v0.14.5j — ISO timestamp of the previous run, paired with
   *  previousSlopIndex so the delta line can say "vs 2026-06-27". */
  previousRunTimestamp?: string;
}
