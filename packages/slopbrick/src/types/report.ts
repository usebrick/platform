/**
 * v0.18.4 (Phase B R-M2): types split.
 * Module: report
 */



// ---------------------------------------------------------------------------
// v0.18.4 (Phase B R-M2) — Table of contents
// ---------------------------------------------------------------------------
//
// This file is 1090 lines and growing. The original rev 3 plan
// was to split it into focused modules under `src/types/`:
//   primitives.ts   — Severity, Category, Framework (no deps)
//   scan.ts         — Issue, FixSuggestion, *Fact, FileScanResult
//   config.ts       — Rule, RuleContext, ResolvedConfig
//   report.ts       — HealthFile, RepositoryHealth, AiMaintenanceCost
//   project-report.ts — ProjectReport (the 250-line scan output)
//   baseline.ts     — BaselineCache, FlywheelState, ResearchMetrics
//
// I attempted the split but had to revert because the engine
// code (repository-health.ts in particular) uses several
// fields that weren't yet in the type definitions and the
// types didn't fully express them. The split needs a careful
// audit of every consumer — too risky for an in-session
// refactor. Tracking as a deferred task.
//
// This commit adds the TOC + section markers below so
// navigation is easier without an actual split.
//
// Section index (line numbers as of this commit):
//   30   HealthFile (memory artifact)
//   67   AI Maintenance Cost (Phase 7)
//  143   Doc Finding types (Phase 6)
//  177   DB Finding types (Phase 8)
//  213   Repository Health composite (v0.15.0 U.4)
//  300   Constitution re-export
//  302   Severity / RuleSeverity / Category / Framework
//  330   Issue + FixSuggestion
//  369   CachedFile / ScanCache (incremental cache)
//  380   Per-file *Fact types (~30 types)
//  635   ScanFacts / ImportFact / FileScanResult
//  674   ComponentScore
//  682   BaselineMeta
//  689   ProjectReport (the 250-line scan output)
//  939   TopOffender
//  947   BaselineCache / SlopAuditRun / AutoTunedRule
//       / RuleSuggestion
//  984   ResearchMetrics / FlywheelState / FlywheelOutput
// 1007   Rule config (MagicNumberSpacingConfig, RuleContext, Rule)
// 1034   ResolvedConfig
//
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// v0.15.0 U.4 — Repository Memory Platform Health snapshot
// ---------------------------------------------------------------------------

/**
 * Runtime shape of `.slopbrick/health.json`. The on-disk JSON
 * matches `packages/core/schemas/v1/health.schema.json` (v3); this
 * interface is the slopbrick-side runtime companion. Schema is the
 * source of truth — keep this in sync with the codegen output in
 * `packages/core/src/generated/health.ts` (RepositoryMemoryHealth).
 *
 * v3 dropped the single `slopIndex` headline in favor of four named
 * scores:
 *   - `aiSlopScore`           — AI-specific findings (USEFUL + OK verdicts)
 *   - `engineeringHygiene`  — HYGIENE + INVERTED rules
 *   - `security`            — security/* rules
 *   - `repositoryHealth`    — composite (0.5*aiQ + 0.3*eng + 0.2*sec)
 *
 * Plus optional verdict + bucket distributions for agent-readable
 * insight.
 */
export interface HealthFile {
  version: typeof import('@usebrick/core').STRUCTURE_SCHEMA_VERSION;
  generatedAt: string;
  workspace: string;
  aiSlopScore: number;
  engineeringHygiene: number;
  security: number;
  repositoryHealth: number;
  verdictDistribution?: Record<import('@usebrick/core').Verdict, number>;
  bucketDistribution?: Record<import('../report/buckets').Bucket, number>;
  categoryScores: Record<string, number>;
  issueCounts: { high: number; medium: number; low: number };
  constitutionDrift?: number;
  topOffenseIds?: string[];
  scanDurationMs?: number;
}



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
  /** v0.15.0 U.4+: 0-100, higher = better. The new headline score
   *  that replaces slopIndex. Tests and callers should pass this
   *  going forward. */
  aiSlopScore?: number;
  /** v0.15.0 U.4+: 0-100, higher = better. */
  engineeringHygiene?: number;
  /** v0.15.0 U.4+: 0-100, higher = better. */
  security?: number;
  /** v0.15.0 U.4+: 0-100, higher = better. */
  repositoryHealth?: number;
  /** 0-100, lower = better. @deprecated v0.15.0: use aiSlopScore. Kept
   *  for backward compat with existing test fixtures and historical
   *  telemetry. The axis inverts it internally. */
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
  /** v0.15.0 U.4+: 0-100, higher = better. The new headline score
   *  that replaces slopIndex. Tests and callers should pass this
   *  going forward. */
  aiSlopScore?: number;
  /** v0.15.0 U.4+: 0-100, higher = better. */
  engineeringHygiene?: number;
  /** v0.15.0 U.4+: 0-100, higher = better. */
  security?: number;
  /** v0.15.0 U.4+: 0-100, higher = better. */
  repositoryHealth?: number;
  /** 0-100, lower = better. Inverted to 100 - x for the composite.
   *  @deprecated v0.15.0: use aiSlopScore. Kept for backward compat. */
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



export type { Constitution } from '../config/conventions';



export interface TopOffender {
  filePath: string;
  /** Count of issues attributed to this file (from per-file results). */
  issueCount: number;
  /** Adjusted score for the file (post-baseline, post-framework-multiplier). */
  adjustedScore: number;
}
