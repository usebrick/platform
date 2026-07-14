// AUTO-GENERATED from health.schema.json. Do not hand-edit.

/**
 * Repository health snapshot from a completed or partial slopbrick scan. The canonical four fields are aiSlopScore (0–100, lower is better), engineeringHygiene (0–100, higher is better), security (0–100, higher is better), and repositoryHealth (0–100, higher is better). Repository Health is 0.4 × (100 − aiSlopScore) + 0.3 × engineeringHygiene + 0.2 × security + 0.1 × testQuality. Scores are rounded to nearest integer in this health snapshot; JSON/SARIF retain full precision and human renderers show one decimal. An empty or not-applicable scan is represented by the score-free scan-report envelope, not by this health artifact.
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
   * Canonical engineering hygiene score (0-100, higher is better): 100 minus the mean bounded burden across effective arch, logic, layout, visual, component, and test categories.
   */
  engineeringHygiene: number;
  /**
   * v0.15.0: security posture score (0-100, higher is better). Dependency vulnerabilities, secret leaks, OWASP anti-patterns.
   */
  security: number;
  /**
   * Canonical repository health composite (0-100, higher is better): 0.4 × (100 − aiSlopScore) + 0.3 × engineeringHygiene + 0.2 × security + 0.1 × testQuality. The score is rounded to nearest integer in health.json.
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
   * Provenance for headline scores: the analysed-file denominator and effective issue set used by the scanner.
   */
  scoreBasis?: {
    denominator: number;
    analyzedFiles: number;
    issueSet: "effective";
    suppressedIssueCount: number;
    parseErrorCount: number;
  };
  /**
   * Outcome of the source scan. Optional so historical health snapshots remain valid.
   */
  completionStatus?: "complete" | "empty" | "partial";
  /**
   * Whether headline numeric scores are safe to use for gating. `incomplete` means only a subset of requested files was analysed; `not-applicable` means no files were selected.
   */
  scoreValidity?: "valid" | "incomplete" | "not-applicable";
  requested?: number;
  analyzed?: number;
  failed?: number;
  skipped?: number;
  /**
   * Additive outcome accounting for every selected file. Optional for compatibility with historical snapshots.
   */
  scanAccounting?: {
    selected: number;
    analyzed: number;
    zeroFinding: number;
    incrementalCached: number;
    parseFailed: number;
    timedOut: number;
    crashed: number;
    internalFailed: number;
  };
  /**
   * Aggregate-only accounting for candidates observed by discovery or explicit directory expansion. It does not claim counts for paths outside that observable population.
   */
  selectionAccounting?: {
    observedCandidates: number;
    selected: number;
    excluded: {
      configExclude: number;
      unsupportedFileType: number;
      extensionlessDuplicate: number;
      outsideWorkspace: number;
      gitScope: number;
    };
  };
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
