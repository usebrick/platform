// Post-scan enrichment: compute the secondary scores that decorate
// the main `ProjectReport`.
//
// Extracted from `cli/scan.ts` `runScan`. Each sub-computation is
// wrapped in try/catch so a failure in one phase (e.g. DB health
// can't parse the schema) doesn't break the whole scan — the main
// `ProjectReport` is still produced.
//
// All dynamic imports are preserved as-is to keep bundle-splitting
// and graceful-degradation behavior identical to the inlined version.

import { readFileSync } from 'node:fs';
import { relative } from 'node:path';

import { logger } from '../../engine/logger';
import { formatErrorMessage } from '../format/error';
import {
  buildArchitectureScore,
} from '../../engine/architecture-score';
import { analyzeBusinessLogic, buildBusinessLogicReport } from '../../engine/business-logic';
import type { BusinessLogicIssue } from '../../engine/business-logic';
import { computeAiSecurityRisk } from '../../engine/ai-security-risk';
import { SEVERITY_WEIGHTS } from '../../engine/metrics';
import { aiDebtFromScore } from '../../engine/repository-health';
import { effectiveIssuesForScore } from '../effective-issues';
import {
  getSignalStrength,
  loadSignalStrength,
} from '../../rules/signal-strength.js';

import type {
  FileScanResult,
  Issue,
  ComponentScore,
  ProjectReport,
  ResolvedConfig,
  BaselineCache,
} from '../../types';

export interface EnrichmentInput {
  cwd: string;
  config: ResolvedConfig;
  results: FileScanResult[];
  aggregated: {
    /** v0.15.0 U.4+: replaces the legacy slopIndex. */
    aiSlopScore: number;
    engineeringHygiene: number;
    security: number;
    repositoryHealth: number;
    /** @deprecated use aiSlopScore */
    slopIndex?: number;
    components: ComponentScore[];
    categoryScores: ProjectReport['categoryScores'];
  };
  allIssues: Issue[];
  baseline?: BaselineCache;
  options: {
    quiet: boolean;
    machineReadableStdout: boolean;
  };
}

export interface EnrichmentResult {
  v012Stats: ProjectReport['v012Stats'];
  architectureConsistency: number | undefined;
  architectureDeductions: ProjectReport['architectureDeductions'];
  crossFileDrift: ProjectReport['crossFileDrift'];
  crossCategoryDrift: ProjectReport['crossCategoryDrift'];
  businessLogicCoherence: number | undefined;
  businessLogicIssues: ProjectReport['businessLogicIssues'];
  aiSecurityRisk: ProjectReport['aiSecurityRisk'];
  aiSecurityFindings: ProjectReport['aiSecurityFindings'];
  testQuality: number;
  aiMaintenanceCost: ProjectReport['aiMaintenanceCost'];
  docFreshness: ProjectReport['docFreshness'];
  docDrift: ProjectReport['docDrift'];
  docFindings: ProjectReport['docFindings'];
  dbHealth: ProjectReport['dbHealth'];
  dbDrift: ProjectReport['dbDrift'];
  dbFindings: ProjectReport['dbFindings'];
  repositoryHealth: ProjectReport['repositoryHealth'];
  aiDebt: ProjectReport['aiDebt'];
  repositoryHealthBreakdown: ProjectReport['repositoryHealthBreakdown'];
  repositoryHealthWarnings: ProjectReport['repositoryHealthWarnings'];
  coherence: ProjectReport['coherence'];
  coherenceBreakdown: ProjectReport['coherenceBreakdown'];
  coherenceWeights: ProjectReport['coherenceWeights'];
  codeHygiene: ProjectReport['codeHygiene'];
  accessibility: ProjectReport['accessibility'];
  performance: ProjectReport['performance'];
  domainIssues: ProjectReport['domainIssues'];
}

/**
 * Phase 7: run the business-logic detectors over each file the scan
 * actually visited. Per-file errors are silently swallowed so a single
 * unreadable source doesn't break the main scan; only catastrophic
 * I/O failures bubble up.
 */
function collectBusinessLogicIssues(
  cwd: string,
  filePaths: string[],
): BusinessLogicIssue[] {
  const issues: BusinessLogicIssue[] = [];
  for (const absPath of filePaths) {
    let source: string;
    try {
      source = readFileSync(absPath, 'utf-8');
    } catch {
      continue;
    }
    const fileIssues = analyzeBusinessLogic(source, absPath);
    for (const issue of fileIssues) {
      // Re-stamp filePath with the rel path so the report stays portable.
      issues.push({
        ...issue,
        filePath: relative(cwd, absPath) || absPath,
      });
    }
  }
  return issues;
}

/**
 * Compute the v0.12.0 Bayesian LR combination + Benjamini–Hochberg
 * FDR stats. Best-effort — if the engine module or calibration data
 * is unavailable, returns undefined and the report skips the stats.
 */
async function computeV012Stats(
  allIssues: Issue[],
  quiet: boolean,
): Promise<EnrichmentResult['v012Stats']> {
  try {
    const { combineFireSet, survivingFires } = await import('@usebrick/engine');
    const firedRuleIds: string[] = [];
    const fprMap = new Map<string, number>();
    for (const issue of allIssues) {
      // Issue.severity type is 'low' | 'medium' | 'high'; 'off' is set as
      // a runtime-only marker for defaultOff'd rules. Cast via unknown to
      // access the runtime marker.
      if ((issue.severity as string) === 'off') continue;
      firedRuleIds.push(issue.ruleId);
      const strength = issue.signalStrength ?? getSignalStrength(issue.ruleId);
      if (strength && !fprMap.has(issue.ruleId)) {
        fprMap.set(issue.ruleId, strength.fpRate);
      }
    }
    const uniqueFires = [...new Set(firedRuleIds)];
    const combo = combineFireSet(uniqueFires, loadSignalStrength());
    const survivors = survivingFires(
      new Map(uniqueFires.map((id) => [id, true])),
      fprMap,
      0.05,
    );
    return {
      bayesianPosterior: combo.posterior,
      bayesianMatchedRules: combo.matchedRules,
      totalLogLr: combo.totalLogLr,
      survivingFiresCount: survivors.size,
      totalFiresCount: uniqueFires.length,
      fdrAlpha: 0.05,
    };
  } catch (err) {
    if (!quiet) {
      logger.warn(`v0.12.0 stats: ${formatErrorMessage(err)}`);
    }
    return undefined;
  }
}

export async function enrichReport(input: EnrichmentInput): Promise<EnrichmentResult> {
  const { cwd, config, results, aggregated, allIssues, options } = input;
  const { quiet, machineReadableStdout } = options;

  // Secondary diagnostics that mirror a headline aggregate must read the
  // exact same per-file effective finding groups. `allIssues` is deliberately
  // broader audit evidence (including project findings and default-off
  // findings), so it is not a valid score input.
  const effectiveAggregateIssues = results.flatMap((result) =>
    effectiveIssuesForScore(result.issues, config),
  );

  // v0.12.0 Bayesian stats — independent of the side computations,
  // computed first so it's available for the report builder below.
  const v012Stats = await computeV012Stats(allIssues, quiet);

  // Sort defensively in case the caller didn't already sort. Enrichment
  // result is read by the report builder which doesn't sort.
  const sortedIssues = [...allIssues].sort(
    (a, b) => SEVERITY_WEIGHTS[b.severity] - SEVERITY_WEIGHTS[a.severity],
  );

  // Architecture score + cross-file drift. Failure here must not break
  // the main scan — wrap in try/catch and fall back to "no score".
  let architectureConsistency: number | undefined;
  let architectureDeductions: ProjectReport['architectureDeductions'];
  let crossFileDrift: ProjectReport['crossFileDrift'];
  let crossCategoryDrift: ProjectReport['crossCategoryDrift'];
  try {
    // Pass `results` so the scale-violation sweep reuses the pre-extracted
    // facts from the main scan instead of re-parsing every file.
    const arch = await buildArchitectureScore(cwd, config, undefined, results);
    architectureConsistency = arch.score;
    architectureDeductions = arch.deductions;
    crossFileDrift = arch.driftSignals;
    crossCategoryDrift = arch.crossCategoryDrift.map((d) => ({
      stem: d.stem,
      byCategory: Object.fromEntries(d.byCategory) as Record<string, string[]>,
      files: d.files,
    }));
  } catch (err) {
    if (!quiet) {
      logger.warn(`architecture-score: ${formatErrorMessage(err)}`);
    }
  }

  // Business Logic Coherence. Re-reads each source file (cheap — same
  // files the engine already touched) and runs the anti-pattern regex
  // detectors. Failure here is non-fatal.
  let businessLogicCoherence: number | undefined;
  let businessLogicIssues: ProjectReport['businessLogicIssues'];
  try {
    const blIssues = collectBusinessLogicIssues(cwd, results.map((r) => r.filePath));
    const blReport = buildBusinessLogicReport(blIssues, results.length);
    businessLogicCoherence = blReport.score;
    businessLogicIssues = blIssues;
  } catch (err) {
    if (!quiet) {
      logger.warn(`business-logic: ${formatErrorMessage(err)}`);
    }
  }

  // AI Security Risk — categorical score independent of slopIndex.
  const securityIssues = sortedIssues.filter((issue) => issue.category === 'security');
  const { risk: aiSecurityRisk, findings: aiSecurityFindings } =
    computeAiSecurityRisk(securityIssues);

  // Test Quality — always present (so JSON consumers can rely on the
  // field), but only meaningful when test files were included.
  let testQuality: number;
  try {
    const { buildTestQualityScore } = await import('../../engine/test-quality');
    testQuality = buildTestQualityScore(effectiveAggregateIssues, results.length).score;
  } catch (err) {
    if (!quiet) {
      logger.warn(`test-quality: ${formatErrorMessage(err)}`);
    }
    testQuality = 100;
  }

  // AI Maintenance Cost — categorical meta-score. Pure aggregation over
  // signals we already have. Failure is non-fatal.
  let aiMaintenanceCost: ProjectReport['aiMaintenanceCost'];
  try {
    const { computeAiMaintenanceCostFromReport } = await import(
      '../../engine/maintenance-cost'
    );
    const spacing = architectureDeductions?.find(
      (d) => d.category === 'spacingScaleViolations',
    )?.count ?? 0;
    const radius = architectureDeductions?.find(
      (d) => d.category === 'radiusScaleViolations',
    )?.count ?? 0;
    const designTokenDrift = spacing + radius > 0 ? { spacing, radius } : undefined;
    const aiSignalCount = sortedIssues.filter((i) => i.aiSpecific === true).length;
    aiMaintenanceCost = computeAiMaintenanceCostFromReport(
      {
        aiSlopScore: aggregated.aiSlopScore ?? 0,
        architectureConsistency,
        aiSecurityRisk,
        highSeverityIssueCount: sortedIssues.filter((i) => i.severity === 'high').length,
        issues: sortedIssues.map((i) => ({ severity: i.severity })),
        fileCount: results.length,
      },
      {
        designTokenDrift,
        hasAiSignals: aiSignalCount >= 3,
      },
    );
  } catch (err) {
    if (!quiet) {
      logger.warn(`maintenance-cost: ${formatErrorMessage(err)}`);
    }
  }

  // Doc Freshness — walks markdown files and cross-references against
  // exported names + package.json. Failure is non-fatal.
  let docFreshness: ProjectReport['docFreshness'];
  let docDrift: ProjectReport['docDrift'];
  let docFindings: ProjectReport['docFindings'];
  try {
    const { buildDocFreshness } = await import('../../engine/doc-freshness');
    const docs = await buildDocFreshness(cwd, config, {});
    docFreshness = docs.docFreshness;
    docDrift = docs.docDrift;
    docFindings = docs.findings;
  } catch (err) {
    if (!quiet) {
      logger.warn(`doc-freshness: ${formatErrorMessage(err)}`);
    }
  }

  // DB Health (Postgres-static, via pgsql-parser). Failure is non-fatal.
  let dbHealth: ProjectReport['dbHealth'];
  let dbDrift: ProjectReport['dbDrift'];
  let dbFindings: ProjectReport['dbFindings'];
  try {
    const { buildDbHealth } = await import('../../engine/db-health');
    const db = await buildDbHealth(cwd, config, {});
    dbHealth = db.dbHealth;
    dbDrift = db.dbDrift;
    dbFindings = db.findings;
  } catch (err) {
    if (!quiet) {
      logger.warn(`db-health: ${formatErrorMessage(err)}`);
    }
  }

  // Repository Health is the documented four-axis headline computed by
  // aggregateReport. Enrichment may decorate a scan, but must never replace
  // that headline with the old Phase-12 management composite: doing so made
  // scan and watch disagree and contradicted every public renderer.
  const repositoryHealth: ProjectReport['repositoryHealth'] = aggregated.repositoryHealth;
  const aiDebt = aiDebtFromScore(repositoryHealth);
  const repositoryHealthBreakdown: ProjectReport['repositoryHealthBreakdown'] = {
    aiSlopCleanliness: Math.max(0, Math.min(100, 100 - aggregated.aiSlopScore)),
    engineeringHygiene: aggregated.engineeringHygiene,
    security: aggregated.security,
    testQuality,
  };
  const repositoryHealthWarnings: ProjectReport['repositoryHealthWarnings'] = [];

  // Repository Coherence composite + 3 secondary domain scores.
  let coherence: ProjectReport['coherence'];
  let coherenceBreakdown: ProjectReport['coherenceBreakdown'];
  let coherenceWeights: ProjectReport['coherenceWeights'];
  let codeHygiene: ProjectReport['codeHygiene'];
  let accessibility: ProjectReport['accessibility'];
  let performance: ProjectReport['performance'];
  let domainIssues: ProjectReport['domainIssues'];
  try {
    const { computeCoherence, computeDomainScores } = await import(
      '../../engine/coherence'
    );

    const constitutionViolationCount =
      architectureDeductions?.find((d) => d.category === 'constitution')?.count ?? 0;

    const PATTERN_FRAGMENTATION_CATEGORIES = new Set([
      'modalSystems',
      'buttonVariants',
      'apiClientModules',
      'stateLibraries',
      'dataFetchLibraries',
    ]);
    const patternFragmentationSum = (architectureDeductions ?? [])
      .filter((d) => PATTERN_FRAGMENTATION_CATEGORIES.has(d.category))
      .reduce((sum, d) => sum + d.deduction, 0);
    const patternFragmentation = Math.min(100, patternFragmentationSum);

    const coherenceResult = computeCoherence({
      architectureConsistency,
      patternFragmentation,
      constitutionViolationCount,
      aiDebt,
    });
    coherence = coherenceResult.score;
    coherenceBreakdown = coherenceResult.breakdown;
    coherenceWeights = coherenceResult.appliedWeights;

    const domains = computeDomainScores(sortedIssues);
    codeHygiene = domains.codeHygiene.score;
    accessibility = domains.accessibility.score;
    performance = domains.performance.score;
    domainIssues = {
      codeHygiene: domains.codeHygiene.issueCount,
      accessibility: domains.accessibility.issueCount,
      performance: domains.performance.issueCount,
      security: domains.security.issueCount,
    };
  } catch (err) {
    if (!quiet) {
      logger.warn(`coherence: ${formatErrorMessage(err)}`);
    }
  }

  // Suppress unused-var warning when caller doesn't surface machineReadableStdout.
  void machineReadableStdout;

  return {
    v012Stats,
    architectureConsistency,
    architectureDeductions,
    crossFileDrift,
    crossCategoryDrift,
    businessLogicCoherence,
    businessLogicIssues,
    aiSecurityRisk,
    aiSecurityFindings,
    testQuality,
    aiMaintenanceCost,
    docFreshness,
    docDrift,
    docFindings,
    dbHealth,
    dbDrift,
    dbFindings,
    repositoryHealth,
    aiDebt,
    repositoryHealthBreakdown,
    repositoryHealthWarnings,
    coherence,
    coherenceBreakdown,
    coherenceWeights,
    codeHygiene,
    accessibility,
    performance,
    domainIssues,
  };
}
