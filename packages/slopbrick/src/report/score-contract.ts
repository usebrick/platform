/** User-facing contract for the four headline scores. */
export const REPOSITORY_HEALTH_FORMULA =
  '0.4 × (100 − AI Slop Score) + 0.3 × Engineering Hygiene + 0.2 × Security + 0.1 × Test Quality';

export const SCORE_BRIEFS = {
  aiSlopScore: 'raw amount of AI slop, 0-100 (lower is better)',
  engineeringHygiene: 'cleanliness across arch, logic, layout, visual, component, and test categories, 0-100 (higher is better)',
  security: 'security posture, 0-100 (higher is better)',
  repositoryHealth: `weighted composite (${REPOSITORY_HEALTH_FORMULA}), 0-100 (higher is better)`,
} as const;

export const HEADLINE_SCORES = [
  { field: 'aiSlopScore', label: 'AI Slop Score' },
  { field: 'engineeringHygiene', label: 'Engineering Hygiene' },
  { field: 'security', label: 'Security' },
  { field: 'repositoryHealth', label: 'Repository Health' },
] as const;

/**
 * Versioned public score decision shared by report serializers and their
 * consumers.  Keep this metadata descriptive: the numeric implementation
 * lives in `engine/metrics.ts`, while this object records the wire-level
 * semantics a consumer is allowed to rely on.
 */
export const SCORE_CONTRACT = {
  // v2: the AI bucket arithmetic is now per-file log burden followed by a
  // fixed-scale additive cumulative transform. Consumers must not recreate
  // the retired global weighted-points/file-count average.
  version: 'v2',
  canonicalFields: ['aiSlopScore', 'engineeringHygiene', 'security', 'repositoryHealth'],
  /**
   * `engineeringHygiene` is the only public hygiene score and there is no
   * separate backend score.  Backend findings remain part of the effective
   * category/rule diagnostics rather than creating a fifth headline axis.
   */
  canonicalNameDecisions: {
    hygieneScore: 'not exposed; use engineeringHygiene as the canonical hygiene field',
    backendScore: 'not exposed; backend findings remain diagnostics, not a separate headline score',
  },
  bounds: { min: 0, max: 100 },
  directions: {
    aiSlopScore: 'lower-is-better',
    engineeringHygiene: 'higher-is-better',
    security: 'higher-is-better',
    repositoryHealth: 'higher-is-better',
  },
  denominator: {
    unit: 'analysed-files',
    definition: 'successfully analysed files selected for the scan; carried as coverage/provenance in scoreBasis',
    arithmetic: 'not used as a dilution denominator for AI bucket burdens',
    excludes: 'parse failures, other failed outcomes, and synthetic baseline rows',
  },
  aiBucketAggregation: {
    definition: 'for each effective file/group, weighted AI severity points are log-scaled and then additively summed per bucket',
    cumulativeTransform: 'the canonical sum is log-scaled with a fixed cumulative scale of 1000, then capped at 100',
    bound: 'each bucket is capped at 100 after the cumulative transform',
    cleanFiles: 'contribute zero burden and do not dilute existing evidence',
  },
  effectiveIssueSet: {
    name: 'effective',
    definition: 'findings remaining after rule-severity, configuration, rule-selection, path, and directive filtering',
    suppression: 'off and default-off findings are excluded unless explicitly enabled; constitution drift is a separate diagnostic and never silently enters headline scoring',
    audit: 'suppressed findings remain available to audit renderers and scoreBasis but never affect scores',
  },
  outcomes: {
    complete: 'scoreValidity=valid; numeric scores may be used for gating',
    incomplete: 'scoreValidity=incomplete; canonical and project-level aggregate score fields are omitted; compatibility/diagnostic numerics may remain for inspection but findings/accounting must not gate; inspect them or run a complete scan',
    empty: 'scoreValidity=not-applicable; serialized score fields are omitted and no score is persisted',
  },
  rounding: {
    json: 'preserve full numeric precision',
    sarif: 'preserve full numeric precision',
    human: 'one decimal place',
    health: 'nearest integer',
  },
  deprecatedFields: {
    assemblyHealth: 'Legacy inverse of aiSlopScore retained for complete-report JSON/telemetry compatibility; not a canonical headline and never a gating score.',
    totalScore: 'Legacy zero-valued field omitted from current JSON output; use canonicalFields.',
  },
} as const;

/** Preserve displayed score precision across human-readable renderers. */
export function formatHeadlineScore(value: number): string {
  return value.toFixed(1);
}
