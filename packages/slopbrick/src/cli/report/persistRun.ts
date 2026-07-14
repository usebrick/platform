// Post-scan persistence: writes all the side-effect outputs that the
// scan produces.
//
// Extracted from `cli/scan.ts` `runScan`. The scan pipeline produces
// a `ProjectReport`; this module takes care of all the disk + log
// side-effects that come after:
//   - Append the run to the historical memory log (`.slopbrick/structure.json`)
//   - Save the incremental file hash cache (when `--incremental`)
//   - Update the flywheel state + rule suggestions (when telemetry on)
//   - Record telemetry payload
//   - Persist the Repository Memory Platform inventory + constitution
//     + markdown summary + health snapshot
//
// Each persistence phase is gated on its corresponding option and is
// independently failure-isolated so a write error in one phase
// doesn't undo the others.

import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { logger } from '../../engine/logger';
import { computeFileHash } from '../../engine/cache-incremental.js';
import {
  computeFlywheelOutput,
  hashFile,
  loadFlywheelState,
  loadResearchMetricsFromDisk,
  saveFlywheelState,
} from '../../engine/flywheel.js';
import { recordTelemetry, readTelemetry } from '../../engine/telemetry';
import {
  readRuns,
  appendRun,
  buildInventoryFromScan,
  buildConstitutionFromConfig,
  buildHealthFromReport,
  saveInventory as engineSaveInventory,
} from '@usebrick/engine';
import { saveConstitution, saveHealth } from '@usebrick/core';
import {
  renderStructureMarkdown,
  writeStructureMarkdown,
} from '../../engine/structure-md';
import { evaluateThresholdGate } from '../threshold';
import { fsMemoryIO } from '../memory-io.js';
import { buildPatternInventory } from '../../mcp/patterns.js';
import { formatErrorMessage } from '../format/error';
import {
  isNotApplicableScan,
  isReadOnlyGitSubset,
} from '../../report/scan-validity.js';
import { VERSION } from '../../types';
import type { FileScanResult, ProjectReport, ResolvedConfig } from '../../types';
import type { RuleRegistry } from '../../rules/registry';
import type { ScanRunOptions } from '../scan';

export interface PersistRunInput {
  cwd: string;
  config: ResolvedConfig;
  options: ScanRunOptions;
  report: ProjectReport;
  results: FileScanResult[];
  /** Exact post-filter scan selection, before incremental cache partitioning. */
  selectedFilePaths?: readonly string[];
  startTime: number;
  registry: RuleRegistry;
  incrementalSummary: { skipped: number; rescanned: number } | undefined;
  telemetryEnabled: boolean;
  machineReadableStdout: boolean;
  /** v0.42.0 (§3a.4): when true, refreshSnippets() rewrites the
   *  managed slopbrick block in AGENTS.md / CLAUDE.md after a
   *  successful scan. Default false. */
  autoRefreshSnippets?: boolean;
}

export async function persistRun(input: PersistRunInput): Promise<void> {
  const {
    cwd,
    config,
    options,
    report,
    results,
    selectedFilePaths,
    startTime,
    registry,
    incrementalSummary,
    telemetryEnabled,
    machineReadableStdout,
  } = input;

  // A not-applicable zero-file report is not score-bearing evidence.
  // Persisting it would overwrite valid memory with fake clean scores, update
  // run history, or trigger refresh/flywheel side effects. Non-empty Git-
  // scoped verification is also read-only: it represents only the changed
  // subset, so it must not replace whole-project memory or teach a flywheel
  // that would change the next pre-commit result for identical bytes.
  const incrementalSkipped = report.scanAccounting?.incrementalCached ??
    report.skipped ??
    incrementalSummary?.skipped ??
    0;
  const hasUnhydratedIncrementalEvidence =
    options.incremental === true && incrementalSkipped > 0;
  if (
    hasUnhydratedIncrementalEvidence &&
    incrementalSummary &&
    !options.quiet &&
    !machineReadableStdout
  ) {
    logger.info(
      `Incremental: re-scanned ${incrementalSummary.rescanned}, skipped ${incrementalSummary.skipped} (unchanged).`,
    );
  }
  if (
    isNotApplicableScan(report) ||
    isReadOnlyGitSubset(options) ||
    hasUnhydratedIncrementalEvidence
  ) return;
  const validScan = report.scoreValidity === 'valid';

  // Build a MemoryReport-shaped projection so the engine accepts it
  // regardless of whether the caller has computed all 4 scores.
  // Declared at function scope so both the run-history append and the
  // Repository Memory Platform persistence can reuse the same value.
  // v0.15.0 U.4+: `slopIndex` is kept on the projection for backward
  // compat with historical telemetry (engine's MemoryAuditRun field).
  const memoryReport = {
    generatedAt: report.generatedAt,
    aiSlopScore: report.aiSlopScore ?? 0,
    engineeringHygiene: report.engineeringHygiene ?? 0,
    security: report.security ?? 0,
    repositoryHealth: report.repositoryHealth ?? 0,
    slopIndex: report.slopIndex ?? report.aiSlopScore ?? 0,
    categoryScores: report.categoryScores,
    issues: report.issues ?? [],
    scoreBasis: report.scoreBasis,
    completionStatus: report.completionStatus,
    scoreValidity: report.scoreValidity,
    requested: report.requested,
    analyzed: report.analyzed,
    failed: report.failed,
    skipped: report.skipped,
    scanAccounting: report.scanAccounting,
    selectionAccounting: report.selectionAccounting,
  };

  // Append to the historical memory log (`.slopbrick/structure.json`). Skip when
  // projectMemory is explicitly disabled in config.
  // A diagnostic partial/empty score is neither a pass nor a failure. Do not
  // append it as numeric threshold evidence to historical trend data.
  const thresholdGate = evaluateThresholdGate(report, config);
  if (config.projectMemory !== false && thresholdGate.status !== 'invalid') {
    try {
      await appendRun(
        cwd,
        memoryReport,
        VERSION,
        fsMemoryIO,
        thresholdGate.status === 'failed',
      );
    } catch (error) {
      // Historical run storage is a side effect, not a reason to turn a
      // completed scan into an internal failure. The later inventory/health
      // phase has the same failure-isolation boundary.
      if (!options.quiet && !machineReadableStdout) {
        logger.warn(`memory history not saved: ${formatErrorMessage(error)}`);
      }
    }
  }

  // Telemetry + flywheel. Only when telemetry is enabled.
  if (telemetryEnabled && validScan) {
    try {
      const runs = await readRuns(cwd, fsMemoryIO);
      const telemetryPayloads = readTelemetry(cwd);
      const recentTopHashes = telemetryPayloads.map((payload) =>
        [...payload.files]
          .sort((a, b) => b.score - a.score)
          .slice(0, 10)
          .map((file) => file.hash),
      );
      const currentTopFiles = [...report.components]
        .sort((a, b) => b.adjustedScore - a.adjustedScore)
        .slice(0, 10)
        .map((c) => ({ filePath: c.filePath, hash: hashFile(relative(cwd, c.filePath)) }));
      const unmatchedStringLiterals = results.flatMap((r) => r.unmatchedStringLiterals ?? []);
      const flywheelOutput = computeFlywheelOutput(
        runs,
        currentTopFiles,
        recentTopHashes,
        unmatchedStringLiterals,
        config,
        registry.getRules(),
      );

      const state = loadFlywheelState(cwd);
      state.autoTuned = flywheelOutput.autoTuned;
      // v0.40.0 (Sprint 2.1): persist the relaxation half. Mirrors
      // the autoTuned assignment above; both lists are written
      // together so the on-disk state always reflects the
      // producer's latest observations. The next scan reads both.
      state.autoRelaxed = flywheelOutput.autoRelaxed;
      state.research = loadResearchMetricsFromDisk(cwd);
      state.updatedAt = new Date().toISOString();
      saveFlywheelState(cwd, state);
      if (state.research) {
        report.research = state.research;
      }

      if (flywheelOutput.suggestions.length > 0) {
        const suggestionsDir = join(cwd, '.slopbrick', 'flywheel');
        if (!existsSync(suggestionsDir)) mkdirSync(suggestionsDir, { recursive: true });
        writeFileSync(
          join(suggestionsDir, 'rule-suggestions.json'),
          JSON.stringify(flywheelOutput.suggestions, null, 2),
        );
      }

      report.issues.push(...flywheelOutput.hotspotIssues);
    } catch (error) {
      if (!options.quiet && !machineReadableStdout) {
        logger.warn(`telemetry/flywheel not saved: ${formatErrorMessage(error)}`);
      }
    }
  }

  // Repository Memory Platform — persist pattern inventory, declared
  // constitution, agent-readable markdown summary, and health snapshot.
  // Failure is non-fatal — the scan report is already complete.
  // v0.41.0 (Sprint 2, task 2a.1): build the pattern inventory
  // BEFORE recordTelemetry so each `scans.jsonl` entry carries the
  // per-category pattern summary (additive on TelemetryPayload —
  // see telemetry.ts:TelemetryInventorySummary). This makes
  // `slopbrick drift --since <date>` self-sufficient: the JSONL
  // stream answers "which patterns were introduced or removed
  // since the baseline" without re-running a scan.
  let patternInventory: Awaited<ReturnType<typeof buildPatternInventory>> | undefined;
  if (config.projectMemory !== false) {
    try {
      const durationMs = Date.now() - startTime;
      const inventoryCandidates = selectedFilePaths ?? results.map((result) => result.filePath);
      patternInventory = await buildPatternInventory(
        cwd,
        config,
        undefined,
        inventoryCandidates,
      );
      const inventory = buildInventoryFromScan(
        { cwd, results },
        patternInventory,
        durationMs,
      );
      engineSaveInventory(cwd, inventory, computeFileHash);
      const constitution = buildConstitutionFromConfig(config, cwd);
      await saveConstitution(cwd, constitution);
      const md = renderStructureMarkdown(inventory, constitution);
      await writeStructureMarkdown(cwd, md);
      const health = buildHealthFromReport(memoryReport, cwd, {
        scanDurationMs: durationMs,
        // v0.18.2: thread the Bayesian composite aggregate from
        // `aggregateReport` (scan.ts:374) into health.json. Optional
        // for backward compat with v0.18.1 readers. The
        // `buildHealthFromReport` writer itself does the
        // `...(options.compositeScore && { compositeScore: ... })`
        // spread so that `undefined` doesn't pollute the JSON.
        ...(report.compositeScore ? { compositeScore: report.compositeScore } : {}),
      });
      // `buildHealthFromReport` may be supplied by an already-built engine
      // artifact during package-consumer tests. Keep this additive report
      // provenance at the CLI persistence boundary as well, so health.json
      // always mirrors the run's machine report.
      if (report.selectionAccounting) health.selectionAccounting = report.selectionAccounting;
      saveHealth(cwd, health);
      if (!options.quiet && !machineReadableStdout) {
        if (report.scoreValidity !== 'incomplete') {
          // v0.18.2: include the Bayesian composite aggregate in the
          // log line so users can see the per-scan probability without
          // having to crack open health.json. Off by default — only
          // present when the scan produced a non-empty aggregate.
          const compositeSuffix = health.compositeScore
            ? ` composite=${health.compositeScore.tier}@${health.compositeScore.mean.toFixed(2)}`
            : '';
          logger.info(
            `Memory persisted to .slopbrick/ (${inventory.patterns.length} patterns, ${inventory.components.length} components, ${md.length} bytes of structure.md, health.json: repo=${health.repositoryHealth} aiQ=${health.aiSlopScore} eng=${health.engineeringHygiene} sec=${health.security}${compositeSuffix}).`,
          );
        } else {
          logger.info(
            `Diagnostic memory persisted to .slopbrick/ (scoreValidity=${report.scoreValidity}; numeric scores are not valid for gating).`,
          );
        }
      }
    } catch (err) {
      if (!options.quiet && !machineReadableStdout) {
        logger.warn(`memory: ${formatErrorMessage(err)}`);
      }
    }
  }

  // v0.41.0 (Sprint 2, task 2a.1): record telemetry AFTER the
  // inventory is built so we can include the per-category pattern
  // summary in `scans.jsonl`. When `config.projectMemory === false`
  // the inventory build above is skipped, `patternInventory` stays
  // undefined, and `recordTelemetry` falls back to the legacy
  // payload shape (`inventory` omitted). Either way the JSONL line
  // is well-formed and downstream `--since` queries degrade
  // gracefully: legacy payloads return `undefined` for `inventory`
  // and the diff math treats that as "no data".
  if (validScan) {
    try {
      recordTelemetry(cwd, report, results, config, patternInventory);
    } catch (error) {
      if (!options.quiet && !machineReadableStdout) {
        logger.warn(`telemetry not saved: ${formatErrorMessage(error)}`);
      }
    }
  }

  // v0.42.0 (Sprint 3, §3a.3): post-scan snippet refresh. Opt-in via
  // the `--refresh-snippets` flag or
  // `slopbrick.config.mjs#autoRefreshSnippets: true`. Runs LAST so
  // a partial failure earlier in this function doesn't surface
  // stale data in AGENTS.md. Wrapped in try/catch because the
  // snippet rewrite is a side-channel — a failure here is not a
  // scan failure.
  if (input.autoRefreshSnippets && validScan) {
    try {
      const { refreshSnippets } = await import('../../snippet/refresh.js');
      const outcome = refreshSnippets(cwd, registry.getRules());
      if (outcome.rewritten.length > 0 && !options.quiet && !machineReadableStdout) {
        logger.info(
          `Snippet refresh: rewrote ${outcome.rewritten.length} file(s) (${outcome.rewritten.join(', ')}).`,
        );
      }
    } catch (err) {
      if (options.quiet !== true && !machineReadableStdout) {
        logger.warn(`snippet refresh failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}
