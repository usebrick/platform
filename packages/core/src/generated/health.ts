// AUTO-GENERATED from health.schema.json. Do not hand-edit.

/**
 * Repository health snapshot from a single slopbrick scan. The 'headline' score that lands on dashboards. Future tools (CI integrations, the website's /projects page) consume this schema.
 */
export interface RepositoryMemoryHealth {
  /**
   * Health schema version. Currently '2'.
   */
  version: "2";
  generatedAt: string;
  workspace: string;
  /**
   * Slop Index (0-100, lower is better). The headline score.
   */
  slopIndex: number;
  /**
   * Per-category scores. Each is 0-100; the exact interpretation depends on the category.
   */
  categoryScores: {
    [k: string]: number;
  };
  /**
   * Number of issues per severity level.
   */
  issueCounts: {
    high: number;
    medium: number;
    low: number;
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
