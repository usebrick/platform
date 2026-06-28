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
// Also computes the v0.10.1 PR Slop Score (--diff <ref> alias) since
// it's a pure function of `allIssues` + `diffRef`.

import type {
  Issue,
  ProjectReport,
  ResolvedConfig,
  BaselineMeta,
  FileScanResult,
} from '../../types';
import type { EnrichmentResult } from './enrichReport';
import { VERSION } from '../../types';

export interface AssembleScanReportInput {
  generatedAt: string;
  configPath: string | undefined;
  results: FileScanResult[];
  aggregated: Pick<
    ProjectReport,
    | 'slopIndex'
    | 'assemblyHealth'
    | 'totalScore'
    | 'categoryScores'
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
  allIssues: Issue[],
): number | undefined {
  if (diffRef === undefined) return undefined;
  return allIssues.reduce(
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

  const prSlopScore = computePrSlopScore(diffRef, allIssues);

  return {
    version: VERSION,
    generatedAt,
    configPath,
    slopIndex: aggregated.slopIndex,
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
    repositoryHealth: enrichment.repositoryHealth,
    prSlopScore,
    diffRef,
    v012Stats: enrichment.v012Stats,
    aiDebt: enrichment.aiDebt,
    repositoryHealthBreakdown: enrichment.repositoryHealthBreakdown,
    repositoryHealthWarnings: enrichment.repositoryHealthWarnings,
    defaultOffSuppressedCount: defaultOffApplied,
    defaultOffRuleCount,
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
    topOffenders: topOffenders.length > 0 ? topOffenders : undefined,
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
