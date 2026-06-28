// Post-scan persistence: writes all the side-effect outputs that the
// scan produces.
//
// Extracted from `cli/scan.ts` `runScan`. The scan pipeline produces
// a `ProjectReport`; this module takes care of all the disk + log
// side-effects that come after:
//   - Append the run to the run history (`.slopbrick/runs.json`)
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
import {
  loadCache,
  saveCache,
  computeFileHash,
  emptyCache,
  type ScanCache,
} from '../../engine/cache-incremental.js';
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
import { thresholdExceeded } from '../threshold';
import { fsMemoryIO } from '../memory-io.js';
import { buildPatternInventory } from '../../mcp/patterns.js';
import { formatErrorMessage } from '../format/error';
import { VERSION, type FileScanResult, type ProjectReport, type ResolvedConfig } from '../../types';
import type { RuleRegistry } from '../../rules/registry';
import type { ScanRunOptions } from '../scan';

export interface PersistRunInput {
  cwd: string;
  config: ResolvedConfig;
  options: ScanRunOptions;
  report: ProjectReport;
  results: FileScanResult[];
  startTime: number;
  registry: RuleRegistry;
  incrementalSummary: { skipped: number; rescanned: number } | undefined;
  telemetryEnabled: boolean;
  machineReadableStdout: boolean;
}

export async function persistRun(input: PersistRunInput): Promise<void> {
  const {
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
  } = input;

  // Build a MemoryReport-shaped projection so the engine accepts it
  // regardless of whether the caller has computed all 4 scores.
  // Declared at function scope so both the run-history append and the
  // Repository Memory Platform persistence can reuse the same value.
  // v0.15.0 U.4+: `slopIndex` is kept on the projection for backward
  // compat with historical telemetry (engine's MemoryAuditRun field).
  const memoryReport = {
    generatedAt: report.generatedAt,
    aiQuality: report.aiQuality ?? 0,
    engineeringHygiene: report.engineeringHygiene ?? 0,
    security: report.security ?? 0,
    repositoryHealth: report.repositoryHealth ?? 0,
    slopIndex: report.slopIndex ?? report.aiQuality ?? 0,
    categoryScores: report.categoryScores,
    issues: report.issues ?? [],
  };

  // Append to run history (`.slopbrick/runs.json`). Skip when
  // projectMemory is explicitly disabled in config.
  if (config.projectMemory !== false) {
    await appendRun(
      cwd,
      memoryReport,
      VERSION,
      fsMemoryIO,
      thresholdExceeded(report, config),
    );
  }

  // Incremental file-hash cache. Only written when `--incremental`.
  // Files in the old cache that we skipped are kept as-is (their hash
  // is still valid).
  if (options.incremental) {
    const cachePath = options.cachePath ?? '.slopbrick-cache.json';
    const existing = loadCache(cachePath) ?? emptyCache();
    const next: ScanCache = { ...existing, generatedAt: new Date().toISOString() };
    for (const result of results) {
      try {
        const hash = computeFileHash(result.filePath);
        const issueCount = result.issues.length;
        next.files[result.filePath] = {
          hash,
          issueCount,
          lastScannedAt: new Date().toISOString(),
        };
      } catch {
        // unreadable file — leave the cache entry as-is
      }
    }
    saveCache(cachePath, next);
    if (incrementalSummary && !options.quiet) {
      logger.info(
        `Incremental: re-scanned ${incrementalSummary.rescanned}, skipped ${incrementalSummary.skipped} (unchanged).`,
      );
    }
  }

  // Telemetry + flywheel. Only when telemetry is enabled.
  if (telemetryEnabled) {
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
  }

  recordTelemetry(cwd, report, results, config);

  // Repository Memory Platform — persist pattern inventory, declared
  // constitution, agent-readable markdown summary, and health snapshot.
  // Failure is non-fatal — the scan report is already complete.
  if (config.projectMemory !== false) {
    try {
      const durationMs = Date.now() - startTime;
      const patternInventory = await buildPatternInventory(cwd, config);
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
      const health = buildHealthFromReport(memoryReport, cwd, { scanDurationMs: durationMs });
      saveHealth(cwd, health);
      if (!options.quiet && !machineReadableStdout) {
        logger.info(
          `Memory persisted to .slopbrick/ (${inventory.patterns.length} patterns, ${inventory.components.length} components, ${md.length} bytes of structure.md, health.json: repo=${health.repositoryHealth} aiQ=${health.aiQuality} eng=${health.engineeringHygiene} sec=${health.security}).`,
        );
      }
    } catch (err) {
      if (!options.quiet && !machineReadableStdout) {
        logger.warn(`memory: ${formatErrorMessage(err)}`);
      }
    }
  }
}
