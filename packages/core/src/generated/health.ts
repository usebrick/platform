// AUTO-GENERATED from health.schema.json. Do not hand-edit.

/**
 * Repository health snapshot from a single slopbrick scan. v5 (v0.21.0) FLIPS the aiSlopScore semantics: it now stores the raw amount of AI slop (0 = no AI slop, 100 = max AI slop, higher = worse), matching the natural reading of the name. The v0.15–0.20.1 inversion (100 = good) was confusing — users read 'AI Slop Score: 100' as '100% slop'. aiQuality (v0.15–0.20.0 alias) removed because semantics are now MEANINGFULLY DIFFERENT (old aiQuality: 70 = 70 cleaner, new aiSlopScore: 70 = 70% slop). engineeringHygiene, security, repositoryHealth unchanged (still 'higher = better'; the composite inverts aiSlopScore at the call site).
 */
export interface RepositoryStructureHealth {
  /**
   * Health schema version. Currently '5'.
   */
  version: "5";
  generatedAt: string;
  workspace: string;
  /**
   * v0.21.0: AI-slop score (0-100, higher = more slop, lower = cleaner). The raw amount of AI slop signatures detected (0 = no AI slop, 100 = max AI slop). In v0.15–0.20.1 this was inverted (100 = clean); the v0.21.0 flip matches the natural reading of the name (users read 'AI Slop Score: 100' as '100% slop').
   */
  aiSlopScore: number;
  /**
   * v0.15.0: engineering hygiene score (0-100, higher is better). Code organization, naming, dead code, complexity, test coverage, type safety.
   */
  engineeringHygiene: number;
  /**
   * v0.15.0: security posture score (0-100, higher is better). Dependency vulnerabilities, secret leaks, OWASP anti-patterns.
   */
  security: number;
  /**
   * v0.15.0: repository health composite (0-100, higher is better). The v3 replacement for the headline slopIndex. Weighted blend of the three scores above.
   */
  repositoryHealth: number;
  /**
   * Number of issues per severity level.
   */
  issueCounts: {
    high: number;
    medium: number;
    low: number;
  };
  /**
   * DEPRECATED (v0.15.0). Legacy composite (0-100, lower is better). Kept optional for backward compat with v0.14 dashboards; will be removed in v0.16.0. New readers should ignore.
   */
  slopIndex?: number;
  /**
   * DEPRECATED (v0.15.0). Legacy per-category breakdown. Kept optional for backward compat; will be removed in v0.16.0.
   */
  categoryScores?: {
    [k: string]: number;
  };
  /**
   * Number of constitution violations detected in this scan.
   */
  constitutionDrift?: number;
  /**
   * Top 3 most-firing rule IDs in this scan, sorted by issue count desc.
   *
   * @maxItems 3
   */
  topOffenseIds?: [] | [string] | [string, string] | [string, string, string];
  /**
   * How long the scan took in milliseconds.
   */
  scanDurationMs?: number;
  /**
   * v0.18.2: project-level Bayesian aggregate of the per-file composite scores (see worker.ts:98). Informational addition; does not affect the four headline scores. The `mean` is the headline 'is this codebase AI?' signal; `tier` is derived from the mean using Jaeschke 1994 JAMA thresholds. Optional for backward compat with v0.18.1 and earlier readers.
   */
  compositeScore?: {
    /**
     * Mean of per-file probabilities across all files that fired at least one rule. In [0,1].
     */
    mean: number;
    /**
     * Highest per-file probability in the scan. In [0,1].
     */
    max: number;
    /**
     * Confidence tier of the mean, per Jaeschke 1994 JAMA thresholds: <0.10 LIKELY_HUMAN, <0.50 INCONCLUSIVE, <0.90 LIKELY_AI, else VERY_LIKELY_AI.
     */
    tier: "LIKELY_HUMAN" | "INCONCLUSIVE" | "LIKELY_AI" | "VERY_LIKELY_AI";
    /**
     * Number of files that contributed a composite score.
     */
    fileCount: number;
  };
}
