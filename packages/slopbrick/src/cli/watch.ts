// --watch mode: re-run the scan on file-system changes.
//
// Extracted from `cli/scan.ts` so the scan pipeline doesn't need to
// know about the watcher loop. Keeps the SIGINT handler, debounce
// timer, and incremental per-file scan logic in one place.

import { watch, statSync } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { resolve } from 'node:path';

import {
  aggregateReport,
  resolveFrameworkMultiplier,
  scoreFile,
  SEVERITY_WEIGHTS,
} from '../engine/metrics';
import { scanFile } from '../engine/worker';
import { baselineStatusMessage, filterIssues } from './threshold';
import { baselinePath } from '../engine/cache';
import {
  DEFAULT_CONFIG,
  resolveConfigPath as findConfigPath,
} from '../config';
import { WATCH_DEBOUNCE_MS } from './render';
import { logger } from '../engine/logger';
import { formatErrorMessage } from './format/error';
import { runScan } from './scan';
import { outputScanResults } from './report/renderOutput';
import type { CliGlobalOptions } from './scan';
import { VERSION } from '../types';
import type { BaselineCache, ComponentScore, FileScanResult, Issue, ProjectReport, ResolvedConfig } from '../types';

export async function watchProject(
  options: CliGlobalOptions,
  cwd: string,
  paths: string[],
): Promise<void> {
  let baselineMtime: number | undefined;
  let configPath = findConfigPath(cwd);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let watcher: FSWatcher | undefined;

  const scoresMap = new Map<string, ComponentScore>();
  const issueGroupsMap = new Map<string, Issue[]>();
  let currentConfig: ResolvedConfig | undefined;
  let currentBaseline: BaselineCache | undefined;

  function getBaselineMtime(): number | undefined {
    try {
      return statSync(baselinePath(cwd)).mtimeMs;
    } catch {
      return undefined;
    }
  }

  function buildReport(): ProjectReport {
    const scores = Array.from(scoresMap.values());
    const issueGroups = Array.from(issueGroupsMap.entries()).map(([filePath, issues]) => ({
      filePath,
      issues,
    }));
    const aggregated = aggregateReport(scores, issueGroups, currentConfig ?? DEFAULT_CONFIG);
    const allIssues = Array.from(issueGroupsMap.values()).flat();
    allIssues.sort((a, b) => SEVERITY_WEIGHTS[b.severity] - SEVERITY_WEIGHTS[a.severity]);

    return {
      version: VERSION,
      generatedAt: new Date().toISOString(),
      configPath,
      // v0.15.0 U.4+: the 4-score model replaces the single slopIndex.
      aiSlopScore: aggregated.aiSlopScore,
      engineeringHygiene: aggregated.engineeringHygiene,
      security: aggregated.security,
      repositoryHealth: aggregated.repositoryHealth,
      slopIndex: aggregated.slopIndex,
      assemblyHealth: aggregated.assemblyHealth,
      totalScore: aggregated.totalScore,
      categoryScores: aggregated.categoryScores,
      boundaryScore: aggregated.boundaryScore,
      contextScore: aggregated.contextScore,
      visualScore: aggregated.visualScore,
      subscores: aggregated.subscores,
      p90Score: aggregated.p90Score,
      peakScore: aggregated.peakScore,
      componentCount: aggregated.componentCount,
      fileCount: issueGroupsMap.size,
      components: aggregated.components,
      issues: allIssues,
      thresholds: (currentConfig ?? DEFAULT_CONFIG).thresholds,
    };
  }

  async function applyResult(result: FileScanResult): Promise<void> {
    result.issues = filterIssues(result.issues, options);
    for (const issue of result.issues) {
      if (issue.filePath === undefined) {
        issue.filePath = result.filePath;
      }
    }

    const multiplier = resolveFrameworkMultiplier(currentConfig ?? DEFAULT_CONFIG);
    const score = scoreFile(
      result,
      multiplier,
      currentConfig ?? DEFAULT_CONFIG,
      currentBaseline,
      cwd,
    );
    scoresMap.set(result.filePath, score);
    issueGroupsMap.set(result.filePath, result.issues);
  }

  async function scanSingleFile(filePath: string): Promise<void> {
    const cfg = currentConfig ?? DEFAULT_CONFIG;
    const result = await scanFile(filePath, cfg, undefined, cwd);
    await applyResult(result);
  }

  process.once('SIGINT', () => {
    if (closed) return;
    closed = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    if (watcher) watcher.close();
    process.exit(0);
  });

  async function doScan(configChanged: boolean): Promise<void> {
    if (closed) return;

    const currentBaselineMtime = getBaselineMtime();
    const baselineChanged = currentBaselineMtime !== baselineMtime;
    baselineMtime = currentBaselineMtime;

    if (configChanged) {
      configPath = findConfigPath(cwd);
    }

    try {
      const { report, results, config, baseline } = await runScan(options, paths);
      currentConfig = config;
      currentBaseline = baseline;
      scoresMap.clear();
      issueGroupsMap.clear();
      for (const result of results) {
        await applyResult(result);
      }
      await outputScanResults(report, options, cwd);

      if (!options.quiet) {
        if (report.baseline) {
          logger.info(baselineStatusMessage(report.baseline));
        }
        if (configChanged) {
          logger.info('Config changed; reloaded.');
        } else if (baselineChanged) {
          logger.info('Baseline changed; reloaded.');
        }
        logger.info('Watching for changes... (press Ctrl+C to stop)');
      }
    } catch (err) {
      logger.error(`Scan failed: ${formatErrorMessage(err)}`);
      logger.error('Run `slopbrick doctor` to check your setup.');
    }
  }

  baselineMtime = getBaselineMtime();
  await doScan(false);

  if (closed) return;

  const currentFiles = new Set(issueGroupsMap.keys());

  watcher = watch(
    cwd,
    { recursive: true },
    (_eventType, filename) => {
      if (closed || !filename) return;

      const changedPath = resolve(cwd, filename.toString());
      // Debounce: collapse bursts of file-system events into a single scan.

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = undefined;
        const configChanged = configPath !== undefined && changedPath === configPath;
        const currentBaselineMtime = getBaselineMtime();
        const baselineChanged = currentBaselineMtime !== baselineMtime;

        if (configChanged || baselineChanged) {
          void doScan(configChanged);
          return;
        }

        if (!currentFiles.has(changedPath)) {
          void doScan(false);
          return;
        }

        void (async () => {
          try {
            await scanSingleFile(changedPath);
            const report = buildReport();
            await outputScanResults(report, options, cwd);
            if (!options.quiet) {
              logger.info(
                `Rescanned ${changedPath}. Watching for changes... (press Ctrl+C to stop)`,
              );
            }
          } catch (err) {
            logger.error(
              `Incremental scan failed: ${formatErrorMessage(err)}`,
            );
          }
        })();
      }, WATCH_DEBOUNCE_MS);
    },
  );
}
