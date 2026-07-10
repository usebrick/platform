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
    | 'aiSlopScore'
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
      aiSlopScore: aggregated.aiSlopScore,
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

  // --no-increase check: fail the run if the AI Slop Score went UP.
  // v0.21.0: aiSlopScore is now the RAW amount of slop (0=clean,
  // 100=saturated, lower = better). The previous run's `slopIndex`
  // field is also written as the raw amount (see engine/structure.ts
  // `slopIndex: report.aiSlopScore`, restored from the v0.14
  // convention). So a regression looks like today's aiSlopScore
  // EXCEEDING the previous baseline. The check flips from `<` to `>`.
  //
  // v0.18.1 bridge (v0.15.0–v0.20.1 era) compared the inverted
  // aiSlopScore (higher=better) and used `<` to detect regression.
  // That data-flow contract is broken in v0.21.0 — readers handling
  // legacy v0.20.1 persisted runs need to invert the baseline value
  // (100 - x) before comparing. The version-aware migration lives
  // in the engine that writes `previous.slopIndex`; finalizeReport
  // just compares the raw-amount values.
  let noIncreaseFailure = false;
  if (options.noIncrease) {
    const previous = (await readRuns(cwd, fsMemoryIO)).at(-1);
    if (previous) {
      // Data-flow contract: `previous.slopIndex` is the raw amount
      // of slop written by the engine (0=clean, 100=saturated).
      // A regression is when today's aiSlopScore > previous baseline.
      // For readers handling v0.20.1 persisted runs, the baseline
      // value is the INVERTED aiSlopScore (higher=better); the
      // engine that writes the baseline should handle the
      // version-aware migration (currently a no-op until a future
      // change adds it). The current check is correct for v0.21+
      // readers comparing against v0.21+ baselines.
      const previousBaseline = previous.slopIndex;
      if ((report.aiSlopScore ?? 0) > previousBaseline) {
        noIncreaseFailure = true;
        if (!options.quiet) {
          logger.error(
            `AI Slop Score went UP from ${previousBaseline.toFixed(1)} to ${(report.aiSlopScore ?? 0).toFixed(1)} — your code got sloppier. (Both values are 0-100, lower = cleaner; the comparison is against the previous run's raw slop amount.) See which files changed and fix the new issues.`,
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
    autoRefreshSnippets: Boolean(options.autoRefreshSnippets),
  });

  return { report, noIncreaseFailure };
}
