// AUTO-GENERATED from health.schema.json. Do not hand-edit.

/**
 * Repository health snapshot from a single slopbrick scan. v3 (v0.15.0) replaces the legacy slopIndex/categoryScores pair with four orthogonal scores: aiQuality, engineeringHygiene, security, repositoryHealth. Legacy fields kept optional for backward compat; will be removed in v0.16.0.
 */
export interface RepositoryMemoryHealth {
  /**
   * Health schema version. Currently '3'.
   */
  version: "3";
  generatedAt: string;
  workspace: string;
  /**
   * v0.15.0: AI/agent-friendliness score (0-100, higher is better). How easily an LLM can navigate, refactor, and extend this codebase.
   */
  aiQuality: number;
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
}
