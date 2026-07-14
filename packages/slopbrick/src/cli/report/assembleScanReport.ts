// Pure ProjectReport assembler.
//
// Given all the pieces produced by the scan pipeline (aggregated
// scores, enrichment results, baseline meta, top offenders, etc.),
// build the final `ProjectReport` object that gets persisted and
// rendered.
//
// Pure: takes inputs, returns a fresh `ProjectReport`. No I/O, no
// side effects. The caller decides whether to write the report to
// disk / stdout / memory.
//
// Also computes the v0.10.1 PR Slop Score (--diff <ref> alias) from the
// explicit effective score projection + `diffRef`. `allIssues` remains the
// broad display/audit envelope and may include cached-only evidence.

import type {
  Issue,
  ProjectReport,
  ResolvedConfig,
  BaselineMeta,
  FileScanResult,
} from '../../types';
import type { EnrichmentResult } from './enrichReport';
import { failedThresholds } from '../threshold';
import { countSuccessfullyAnalyzed } from '../scan-accounting';
import { VERSION } from '../../types';

export interface AssembleScanReportInput {
  generatedAt: string;
  configPath: string | undefined;
  results: FileScanResult[];
  aggregated: Pick<
    ProjectReport,
    | 'aiSlopScore'
    | 'engineeringHygiene'
    | 'security'
    | 'repositoryHealth'
    | 'assemblyHealth'
    | 'totalScore'
    | 'categoryScores'
    | 'scoreExplanation'
    | 'boundaryScore'
    | 'contextScore'
    | 'visualScore'
    | 'subscores'
    | 'p90Score'
    | 'peakScore'
    | 'componentCount'
    | 'components'
  >;
  allIssues: Issue[];
  /**
   * Canonical score exposure for this invocation: effective findings from
   * successfully analyzed files plus effective project findings. This is
   * intentionally narrower than `allIssues`, which also retains audit-only
   * and cache-hydrated evidence for display.
   */
  effectiveIssues: readonly Issue[];
  parseErrors: Array<{ filePath: string; error: string }>;
  topOffenders: NonNullable<ProjectReport['topOffenders']>;
  config: ResolvedConfig;
  baselineMeta: BaselineMeta | undefined;
  diffRef?: string;
  defaultOffApplied: number;
  defaultOffRuleCount: number;
  previousRun: { slopIndex: number; timestamp: string } | undefined;
  enrichment: EnrichmentResult;
}

const PR_SLOP_WEIGHTS = { high: 10, medium: 5, low: 1 } as const;

function computePrSlopScore(
  diffRef: string | undefined,
  effectiveIssues: readonly Issue[],
): number | undefined {
  if (diffRef === undefined) return undefined;
  return effectiveIssues.reduce(
    (sum, issue) =>
      sum + (PR_SLOP_WEIGHTS[issue.severity as keyof typeof PR_SLOP_WEIGHTS] ?? 0),
    0,
  );
}

export function assembleScanReport(input: AssembleScanReportInput): ProjectReport {
  const {
    generatedAt,
    configPath,
    results,
    aggregated,
    allIssues,
    effectiveIssues,
    parseErrors,
    topOffenders,
    config,
    baselineMeta,
    diffRef,
    defaultOffApplied,
    defaultOffRuleCount,
    previousRun,
    enrichment,
  } = input;

  const prSlopScore = computePrSlopScore(diffRef, effectiveIssues);
  const analyzedFiles = countSuccessfullyAnalyzed(results);
  const suppressedIssueCount = allIssues.filter(
    (issue) => issue.severity === ('off' as Issue['severity']),
  ).length;

  // v0.42.0 (user-review fix): compute which thresholds tripped so the
  // JSON output exposes them. The full `failedThresholds()` function
  // expects a complete ProjectReport, but we only need the threshold-
  // relevant fields. Inline-equivalent: check each threshold's condition
  // using the aggregated scores already on the report.
  const thresholdReport = {
    // This projection is used only for threshold reporting, but the shared
    // helper deliberately refuses to evaluate missing/invalid score validity.
    // Mark the aggregate projection as valid here; incomplete/empty scans are
    // finalized through the validity-aware report path and never reach this
    // complete-score threshold calculation.
    scoreValidity: 'valid' as const,
    aiSlopScore: aggregated.aiSlopScore,
    p90Score: aggregated.p90Score,
    peakScore: aggregated.peakScore,
    categoryScores: aggregated.categoryScores,
  };
  const failedThresholds_ = failedThresholds(
    thresholdReport as unknown as ProjectReport,
    config,
  );

  return {
    // `denominator` records the successful scan population for coverage and
    // provenance. AI bucket burdens are aggregated per effective file and do
    // not divide by this count.
    scoreBasis: {
      denominator: analyzedFiles,
      analyzedFiles,
      issueSet: 'effective',
      suppressedIssueCount,
      parseErrorCount: parseErrors.length,
    },
    scoreExplanation: aggregated.scoreExplanation
      ? {
          ...aggregated.scoreExplanation,
          scoreBasis: {
            denominator: analyzedFiles,
            analyzedFiles,
            issueSet: 'effective',
            suppressedIssueCount,
            parseErrorCount: parseErrors.length,
          },
        }
      : undefined,
    version: VERSION,
    generatedAt,
    configPath,
    aiSlopScore: aggregated.aiSlopScore,
    engineeringHygiene: aggregated.engineeringHygiene,
    security: aggregated.security,
    // `repositoryHealth` is the canonical four-axis aggregate. Enrichment
    // may add secondary diagnostics and a breakdown, but it must not be able
    // to overwrite the score formula with a competing composite.
    repositoryHealth: aggregated.repositoryHealth,
    assemblyHealth: aggregated.assemblyHealth,
    totalScore: aggregated.totalScore,
    categoryScores: aggregated.categoryScores,
    boundaryScore: aggregated.boundaryScore,
    contextScore: aggregated.contextScore,
    visualScore: aggregated.visualScore,
    subscores: aggregated.subscores,
    architectureConsistency: enrichment.architectureConsistency,
    architectureDeductions: enrichment.architectureDeductions,
    businessLogicCoherence: enrichment.businessLogicCoherence,
    businessLogicIssues: enrichment.businessLogicIssues,
    aiSecurityRisk: enrichment.aiSecurityRisk,
    aiSecurityFindings: enrichment.aiSecurityFindings,
    testQuality: enrichment.testQuality,
    aiMaintenanceCost: enrichment.aiMaintenanceCost,
    docFreshness: enrichment.docFreshness,
    docDrift: enrichment.docDrift,
    docFindings: enrichment.docFindings,
    dbHealth: enrichment.dbHealth,
    dbDrift: enrichment.dbDrift,
    dbFindings: enrichment.dbFindings,
    prSlopScore,
    diffRef,
    v012Stats: enrichment.v012Stats,
    aiDebt: enrichment.aiDebt,
    repositoryHealthBreakdown: enrichment.repositoryHealthBreakdown,
    repositoryHealthWarnings: enrichment.repositoryHealthWarnings,
    defaultOffSuppressedCount: defaultOffApplied,
    defaultOffRuleCount,
    // v0.43.0: visible severity breakdown for tooling. Excludes
    // auto-suppressed default-off issues (which are counted in
    // defaultOffSuppressedCount above). This lets downstream tools
    // see the same numbers the human report shows.
    issueCounts: {
      high: allIssues.filter((i) => i.severity === 'high').length,
      medium: allIssues.filter((i) => i.severity === 'medium').length,
      low: allIssues.filter((i) => i.severity === 'low').length,
    },
    // v0.15.0 U.4+: the previous-run value is stored as
    // `previousSlopIndex` on ProjectReport for backward compat with
    // historical telemetry. The value itself is the previous run's
    // aiSlopScore (lower = better; raw amount of detected slop).
    previousSlopIndex: previousRun?.slopIndex,
    previousRunTimestamp: previousRun?.timestamp,
    p90Score: aggregated.p90Score,
    peakScore: aggregated.peakScore,
    componentCount: aggregated.componentCount,
    fileCount: results.length,
    components: aggregated.components,
    issues: allIssues,
    parseErrors: parseErrors.length > 0 ? parseErrors : undefined,
    baseline: baselineMeta,
    thresholds: config.thresholds,
    // v0.42.0 (user-review fix): expose which gates tripped so CI
    // consumers can read the JSON output instead of grepping stderr.
    // Optional field: absent when no thresholds tripped. Computed from
    // the report's own scores so the JSON is self-describing.
    failedThresholds: failedThresholds_,
    // An explicit empty list means this current scan computed offender data
    // and found no active offenders. `undefined` remains reserved for legacy
    // reports that predate the field and need the renderer's component fallback.
    topOffenders,
    coherence: enrichment.coherence,
    coherenceBreakdown: enrichment.coherenceBreakdown,
    coherenceWeights: enrichment.coherenceWeights,
    codeHygiene: enrichment.codeHygiene,
    accessibility: enrichment.accessibility,
    performance: enrichment.performance,
    domainIssues: enrichment.domainIssues,
    crossFileDrift: enrichment.crossFileDrift,
    crossCategoryDrift: enrichment.crossCategoryDrift,
  };
}
