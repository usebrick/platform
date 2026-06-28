// Post-scan finalize phase: build the final ProjectReport and persist.
//
// Extracted from `cli/scan.ts` `runScan`. Given the scan results and
// the in-flight `aggregated` report, this module:
//
//   1. Computes parse-error entries + top-offenders + the previous-run
//      reference (used for the trajectory-delta line in the pretty
//      report).
//   2. Runs `enrichReport` to compute secondary scores (architecture,
//      business-logic, security, test quality, maintenance cost, doc
//      freshness, DB health, repository health, coherence, v0.12.0
//      stats).
//   3. Calls `assembleScanReport` to merge everything into the final
//      `ProjectReport` object.
//   4. Evaluates the `--no-increase` check (fails the run if the
//      slopIndex went UP from the previous run).
//   5. Calls `persistRun` to write all the side-effects (run history,
//      incremental cache, flywheel state, telemetry, memory).
//
// Returns the final `ProjectReport` and the `noIncreaseFailure` flag
// so the caller can construct a `ScanRunResult`.

import { readRuns } from '@usebrick/engine';

import { logger } from '../../engine/logger';
import { fsMemoryIO } from '../memory-io.js';
import { resolveConfigPath as findConfigPath } from '../../config';
import { enrichReport } from './enrichReport';
import { assembleScanReport } from './assembleScanReport';
import { persistRun } from './persistRun';
import type { RuleRegistry } from '../../rules/registry';
import type {
  FileScanResult,
  Issue,
  ProjectReport,
  ResolvedConfig,
  BaselineMeta,
  BaselineCache,
} from '../../types';
import type { ScanRunOptions } from '../scan';

export interface FinalizeReportInput {
  cwd: string;
  config: ResolvedConfig;
  options: ScanRunOptions;
  results: FileScanResult[];
  aggregated: Pick<
    ProjectReport,
    | 'aiQuality'
    | 'engineeringHygiene'
    | 'security'
    | 'repositoryHealth'
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
  baseline: BaselineCache | undefined;
  baselineMeta: BaselineMeta | undefined;
  defaultOffApplied: number;
  defaultOffRuleCount: number;
  startTime: number;
  registry: RuleRegistry;
  incrementalSummary: { skipped: number; rescanned: number } | undefined;
  telemetryEnabled: boolean;
  machineReadableStdout: boolean;
}

export interface FinalizeReportResult {
  report: ProjectReport;
  noIncreaseFailure: boolean;
}

export async function finalizeReport(
  input: FinalizeReportInput,
): Promise<FinalizeReportResult> {
  const {
    cwd,
    config,
    options,
    results,
    aggregated,
    allIssues,
    baseline,
    baselineMeta,
    defaultOffApplied,
    defaultOffRuleCount,
    startTime,
    registry,
    incrementalSummary,
    telemetryEnabled,
    machineReadableStdout,
  } = input;

  const parseErrors = results
    .filter((result) => result.parseError)
    .map((result) => ({ filePath: result.filePath, error: result.parseError as string }));

  const configPath = findConfigPath(cwd);

  // v0.14.5j (P9): read the previous run so formatPretty can render
  // a "±N from last run" delta. Capped at 1 read because we only
  // need the most-recent run. If no previous run exists, the field
  // is undefined and the delta line is omitted from the output.
  let previousRun: { slopIndex: number; timestamp: string } | undefined;
  try {
    const runs = await readRuns(cwd, fsMemoryIO);
    const last = runs.at(-1);
    if (last) {
      previousRun = { slopIndex: last.slopIndex, timestamp: last.timestamp };
    }
  } catch {
    // No prior run log — that's fine, just no delta.
  }

  // (which always has filePath) instead of filtered from `allIssues`
  // (project-level rules may emit issues without filePath, leading to
  // undercounts).
  const issueCountByFile = new Map<string, number>();
  for (const result of results) {
    let count = 0;
    for (const issue of result.issues) {
      if (issue.filePath) count += 1;
    }
    if (count > 0) issueCountByFile.set(result.filePath, count);
  }
  const topOffenders = [...aggregated.components]
    .sort((a, b) => b.adjustedScore - a.adjustedScore)
    .slice(0, 5)
    .map((c) => ({
      filePath: c.filePath,
      issueCount: issueCountByFile.get(c.filePath) ?? 0,
      adjustedScore: c.adjustedScore,
    }));

  // Enrichment: compute all the secondary scores (architecture, BL,
  // security, test quality, maintenance cost, doc freshness, DB health,
  // repository health, coherence, v0.12.0 stats). Each phase is
  // failure-isolated; a crash in one doesn't break the others.
  const enrichment = await enrichReport({
    cwd,
    config,
    results,
    aggregated: {
      aiQuality: aggregated.aiQuality,
      engineeringHygiene: aggregated.engineeringHygiene,
      security: aggregated.security,
      repositoryHealth: aggregated.repositoryHealth,
      components: aggregated.components,
      categoryScores: aggregated.categoryScores,
    },
    allIssues,
    baseline,
    options: { quiet: !!options.quiet, machineReadableStdout },
  });

  // Assemble the final ProjectReport. Pure function of inputs above.
  const report = assembleScanReport({
    generatedAt: new Date().toISOString(),
    configPath,
    results,
    aggregated,
    allIssues,
    parseErrors,
    topOffenders,
    config,
    baselineMeta,
    diffRef: options.diffRef,
    defaultOffApplied,
    defaultOffRuleCount,
    previousRun,
    enrichment,
  });

  // --no-increase check: fail the run if the AI Quality went DOWN.
  let noIncreaseFailure = false;
  if (options.noIncrease) {
    const previous = (await readRuns(cwd, fsMemoryIO)).at(-1);
    if (previous) {
      if ((report.aiQuality ?? 0) < previous.slopIndex) {
        noIncreaseFailure = true;
        if (!options.quiet) {
          // v0.15.0 U.4+: aiQuality is the new headline score. The
          // comparison is still against `previous.slopIndex` for
          // backward compat with historical telemetry, but the
          // current-run value is aiQuality (higher is better; a
          // lower number means the code got sloppier).
          logger.error(
            `AI Quality went DOWN from ${previous.slopIndex.toFixed(1)} to ${(report.aiQuality ?? 0).toFixed(1)} — your code got sloppier. See which files changed and fix the new issues.`,
          );
        }
      }
    } else if (!options.quiet) {
      logger.warn('Warning: no previous run found; --no-increase has nothing to compare.');
    }
  }

  // Persistence: append run history, save incremental cache, update
  // flywheel state, record telemetry, persist repository memory.
  await persistRun({
    cwd,
    config,
    options,
    report,
    results,
    startTime,
    registry,
    incrementalSummary,
    telemetryEnabled,
    machineReadableStdout,
  });

  return { report, noIncreaseFailure };
}
