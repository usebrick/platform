// Scan orchestrator for slopbrick. Owns the core scan pipeline
// (runScan / scanProject) plus the CLI-side re-exports. Heavier
// helpers live in dedicated files:
//
//   - report/baseline-cache.ts        — buildBaselineCache
//   - report/printFixSummary.ts       — printFixSummary
//   - report/renderOutput.ts          — renderOutput, outputScanResults
//   - report/enrichReport.ts          — post-scan enrichment
//   - report/assembleScanReport.ts    — pure ProjectReport builder
//   - report/finalizeReport.ts        — post-scan finalize phase
//   - report/persistRun.ts            — post-scan side-effects
//   - watch.ts                        — watchProject (--watch mode)
//   - format/error.ts                 — error formatting helpers
//   - types.ts                        — CLI option interfaces
//
// Commander wiring lives in ./program.ts. Init/doctor helpers live
// in ./init.ts.

import { existsSync, statSync } from 'node:fs';
import { resolve, relative, extname, sep } from 'node:path';

import { renderProgress, clearProgress } from './render';
import {
  filterIssues,
  filterByDisabledDirectives,
  intersectFiles,
} from './threshold';

import {
  loadConfig,
  resolveConfigPath as findConfigPath,
} from '../config';
import { discoverFiles, ALL_SOURCE_EXTENSIONS } from '../engine/discover.js';
import {
  getGitHead,
  getGitRoot,
  getChangedFiles,
  getWorkingTreeChanges,
  getFilesSince,
} from './git.js';
import {
  loadCache,
  partitionByCache,
} from '../engine/cache-incremental.js';
import { WorkerPool } from '../engine/pool';
import { scanFile } from '../engine/worker';
import { loadFlywheelState } from '../engine/flywheel.js';
import {
  scoreFile,
  aggregateReport,
  resolveFrameworkMultiplier,
  SEVERITY_WEIGHTS,
} from '../engine/metrics';
import {
  loadBaseline,
  tightenBaseline,
  validateBaseline,
  hashConfig,
} from '../engine/cache';
import { logger, setLoggerQuiet } from '../engine/logger';
import { runProjectRules } from '../rules/project';
import { RuleRegistry } from '../rules/registry';
import { builtinRules } from '../rules/builtins';
import { getSignalStrength, getDefaultOffRules } from '../rules/signal-strength.js';
import { readDtcgTokensFile, tokensToAllowlist } from './tokens.js';
import { finalizeReport } from './report/finalizeReport';
import {
  VERSION,
  type FileScanResult,
  type Issue,
  type ProjectReport,
  type ResolvedConfig,
  type BaselineMeta,
  type BaselineCache,
  type ComponentScore,
} from '../types';
import type {
  ScanProjectOptions,
  ScanRunOptions,
  CliGlobalOptions,
  ScanRunResult,
} from './types';

// Re-export the CLI-side helpers + types so callers (program.ts,
// tests) can still import them from `./scan`. Implementations live
// in the extracted files under `report/`, `format/`, and `watch.ts`.
export type {
  ScanProjectOptions,
  ScanRunOptions,
  CliGlobalOptions,
  ScanRunResult,
} from './types';
export { buildBaselineCache } from './report/baseline-cache';
export { printFixSummary, type FixSummary } from './report/printFixSummary';
export { renderOutput, outputScanResults } from './report/renderOutput';
export { watchProject } from './watch';

export async function runScan(
  options: ScanRunOptions,
  explicitPaths?: string[],
): Promise<ScanRunResult> {
  setLoggerQuiet(!!options.quiet);
  // v0.10.7 — Repository Memory Platform. Captured here so the inventory
  // persisted at the end of runScan reflects the wall-clock scan time
  // (same metric surfaced in `ProjectReport.scanDurationMs`).
  const startTime = Date.now();
  const cwd = resolve(options.workspace ?? process.cwd());
  // Workspace existence check (Refactor 1). Silent fallback to "0 files
  // scanned" was misleading users into thinking their scan succeeded on a
  // real project. Surface the failure clearly.
  if (!existsSync(cwd)) {
    throw new Error(`Workspace not found: ${cwd}`);
  }
  const cwdStat = statSync(cwd);
  if (!cwdStat.isDirectory()) {
    throw new Error(`Workspace is not a directory: ${cwd}`);
  }
  const loadedConfig = await loadConfig(cwd);
  const config: ResolvedConfig = { ...loadedConfig };

  if (options.framework) {
    config.framework = options.framework;
  }
  if (options.include && options.include.length > 0) {
    config.include = options.include;
  }
  if (options.exclude && options.exclude.length > 0) {
    config.exclude = [...config.exclude, ...options.exclude];
  }

  // Round 22: guard --changed/--staged/--since against running outside a git repo.
  if (options.staged || options.changed || options.since) {
    if (!getGitRoot(cwd)) {
      const flag = options.changed ? '--changed' : options.staged ? '--staged' : '--since';
      throw new Error(`${flag} requires a git repository (no .git found in ${cwd})`);
    }
  }

  const telemetryEnabled = options.telemetry !== false && config.telemetry !== false;
  config.telemetry = telemetryEnabled;

  if (options.cache) {
    // v0.18.3 (R-MED env-var fix): the parser cache is now
    // a passed option, not an env-var read inside the engine.
    // The slopbrick CLI is the boundary that reads env vars.
    // We set this here so the worker child thread inherits it
    // via the Node.js process env-var contract; the worker
    // (slopbrick/src/engine/worker.ts:20) reads the var,
    // builds a ParserCacheConfig, and passes it as opts to
    // parseFile. The engine itself no longer reads process.env.
    process.env.SLOP_AUDIT_CACHE = '1';
  }

  if (options.tokens) {
    const tokenResult = readDtcgTokensFile(resolve(cwd, options.tokens));
    if (tokenResult.ok) {
      const extra = tokensToAllowlist(tokenResult.tree);
      config.arbitraryValueAllowlist = [...config.arbitraryValueAllowlist, ...extra];
    } else if (!options.quiet) {
      logger.warn(`tokens: ${tokenResult.error}`);
    }
  }

  let files: string[];
  if (explicitPaths && explicitPaths.length > 0) {
    const { globby } = await import('globby');
    const { minimatch } = await import('minimatch');
    const resolved = explicitPaths.map((p) => resolve(cwd, p));
    const expanded: string[] = [];
    for (const p of resolved) {
      if (existsSync(p) && statSync(p).isDirectory()) {
        const found = await globby(`${p}/**/*`, { absolute: true, onlyFiles: true });
        for (const f of found) {
          if (!ALL_SOURCE_EXTENSIONS.has(extname(f).toLowerCase())) continue;
          const rel = relative(cwd, f).split(sep).join('/');
          if (config.include.length > 0 && !config.include.some((pattern) => minimatch(rel, pattern))) {
            continue;
          }
          if (config.exclude.some((pattern) => minimatch(rel, pattern, { dot: true }))) {
            continue;
          }
          expanded.push(f);
        }
      } else {
        expanded.push(p);
      }
    }
    files = expanded;
  } else {
    files = await discoverFiles(cwd, config);
  }

  if (options.staged) {
    const changed = await getChangedFiles(cwd);
    files = intersectFiles(files, changed, cwd);
  }
  if (options.changed) {
    const changed = await getWorkingTreeChanges(cwd);
    files = intersectFiles(files, changed, cwd);
  }
  if (options.since) {
    const since = await getFilesSince(cwd, options.since);
    files = intersectFiles(files, since, cwd);
  }
  // v0.10.1: --diff <ref> is the VibeDrift-compatible alias for --since.
  if (options.diffRef) {
    const since = await getFilesSince(cwd, options.diffRef);
    files = intersectFiles(files, since, cwd);
  }

  // the persisted cache. Cache invalidates on VERSION mismatch.
  let incrementalSummary: { skipped: number; rescanned: number } | undefined;
  if (options.incremental) {
    const cachePath = options.cachePath ?? '.slopbrick-cache.json';
    const existing = loadCache(cachePath);
    const { toScan, unchanged } = partitionByCache(files, existing);
    files = toScan;
    incrementalSummary = { skipped: unchanged.length, rescanned: toScan.length };
  }

  // 0 files warning (Refactor 1): previously the scan would report "0 files,
  // 0 components, 0 issues" with exit 0 and the user had no way to tell
  // whether the scan was on a real project vs an empty / wrong directory.
  // Surface it loudly when stdout is human-readable.
  const machineReadableStdout =
    !!options.json ||
    !!options.html ||
    options.format === 'json' ||
    options.format === 'sarif' ||
    options.format === 'html';
  if (files.length === 0 && !options.quiet && !machineReadableStdout) {
    const projectRoot = await findConfigPath(cwd);
    if (!projectRoot) {
      // Refactor 9: first-time-user onboarding. When no config exists
      // anywhere on the walk-up AND 0 files matched, the original 1-line
      // warning left new users stranded — no explanation of what the
      // tool is, what `init` does, or that a config is required at all.
      // Print a short block (≤8 lines) with: (1) what slopbrick is,
      // (2) the exact init command, (3) what to do next. Keep it terse.
      logger.warn(
        [
          'slopbrick: Repository Coherence Scanner for frontend + security code.',
          '',
          `No slopbrick.config.mjs found and no source files matched in ${cwd}.`,
          '',
          '→ Generate a config with `slopbrick init`, then re-run `slopbrick scan`.',
          '→ Or pass --include \'<glob>\' (e.g. \'src/**/*.{ts,tsx,vue,svelte}\') to scan a path right now.',
        ].join('\n'),
      );
    } else {
      logger.warn(
        `No source files matched in ${cwd}. Adjust --include or check your config at ${projectRoot}.`,
      );
    }
  }

  const configHash = hashConfig(config);
  const gitHead = (await getGitHead(cwd)) ?? 'unknown';
  let baseline: BaselineCache | undefined;
  let baselineMeta: BaselineMeta | undefined;
  const baselineCache = loadBaseline(cwd);

  if (baselineCache) {
    const validation = validateBaseline(baselineCache, configHash, gitHead);
    if (validation.valid) {
      baseline = options.tighten ? tightenBaseline(baselineCache) : baselineCache;
      baselineMeta = {
        active: true,
        version: baseline.version,
        baselineRevision: baseline.baseline_revision,
        createdAt: baseline.baseline_created,
      };
      if (validation.warning && !options.quiet) {
        logger.warn(`Warning: ${validation.warning}.`);
      }
    } else if (!options.quiet) {
      logger.warn(
        `Baseline invalid: ${validation.reason}; ignoring. Run \`slopbrick scan --baseline\` to recalibrate.`,
      );
    }
  }

  const registry = new RuleRegistry();
  if (options.rule) {
    const known = builtinRules.some((r) => r.id === options.rule);
    if (!known) {
      logger.error(`Unknown rule: ${options.rule}. Run \`slopbrick rules\` to see available rules.`);
      process.exit(2);
    }
  }
  registry.loadBuiltins(options.rule);
  if (telemetryEnabled) {
    const flywheelState = loadFlywheelState(cwd);
    // v0.14.5g: skip autotune entries for rules marked defaultOff in
    // signal-strength.json. The flywheel is a learning loop that can
    // promote a rule's severity to 'high' over 3 consecutive scans;
    // but if a rule is INVERTED or NOISY (calibration-failed), it
    // must stay off regardless of how many scans observed it. Without
    // this guard, the flywheel undoes the auto-disable pass below.
    const defaultOffRules = getDefaultOffRules();
    for (const tuned of flywheelState.autoTuned) {
      if (config.rules[tuned.ruleId] === 'off') continue;
      if (defaultOffRules.has(tuned.ruleId)) continue;
      config.rules[tuned.ruleId] = tuned.severity;
    }
  }

  const pool = new WorkerPool({
    config,
    threadCount: options.threadCount,
    quiet: options.quiet,
    ...(options.workerScript ? { workerScript: options.workerScript } : {}),
  });

  // machineReadableStdout was computed earlier (above the 0-files warning)
  // so the warning could gate on it; reuse it here.
  const showProgress = process.stdout.isTTY && !options.quiet && !machineReadableStdout;

  // typical of --staged / --changed pre-commit runs), skip the worker
  // spin-up overhead and scan inline. Larger scans keep the
  // production-proven WorkerPool which has retry + timeout handling.
  // Refactor 5: deleted src/engine/executor.ts (dead code with a broken
  // cache-hit metric — see audits/executor.md). Inline the small-N path
  // directly here using `scanFile`; the large-N path keeps the
  // production-proven WorkerPool.
  /** Files at or below this count scan inline on the main thread.
   *  Larger scans go through the worker pool for parallelism. */
  const INLINE_THRESHOLD = 3;
  let results: FileScanResult[];
  if (files.length > 0 && files.length <= INLINE_THRESHOLD) {
    results = [];
    for (const filePath of files) {
      results.push(await scanFile(filePath, config, undefined, cwd));
    }
  } else {
    results = await pool.scan(files, showProgress ? renderProgress : undefined);
  }
  if (showProgress) {
    clearProgress();
  }

  for (const result of results) {
    result.issues = filterIssues(result.issues, options);
    // directives at or above the issue's line.
    filterByDisabledDirectives(result, result.facts?.v2?.disabledRules ?? []);
    for (const issue of result.issues) {
      if (issue.filePath === undefined) {
        issue.filePath = result.filePath;
      }
    }
  }

  const multiplier = resolveFrameworkMultiplier(config);
  const scorableResults = results.filter((result) => !result.parseError);
  const scores = scorableResults.map((result) => scoreFile(result, multiplier, config, baseline, cwd));
  const issueGroups = scorableResults.map((result) => ({
    filePath: result.filePath,
    issues: result.issues,
  }));

  if (options.since && baseline) {
    const scannedPaths = new Set(results.map((result) => result.filePath));
    for (const [filePath, cached] of Object.entries(baseline.scores)) {
      if (scannedPaths.has(filePath)) continue;
      if (!existsSync(filePath)) continue;
      scores.push({
        filePath,
        rawScore: 0,
        componentScore: 0,
        adjustedScore: 0,
        componentCount: cached.componentCount,
      });
      issueGroups.push({ filePath, issues: [] });
    }
  }

  // v0.18.2: thread per-file composite scores (worker.ts:98) into
  // aggregateReport. The deterministic `scores` + `issueGroups`
  // still drive the 4 headline scores; the composite aggregate is
  // an informational addition (does not affect aiSlopScore/etc).
  const perFileCompositeScores = scorableResults.map((r) => r.compositeScore);
  const aggregated = aggregateReport(scores, issueGroups, config, perFileCompositeScores);

  const projectIssues = filterIssues(runProjectRules(results, config), options);
  const allIssues = [...results.flatMap((result) => result.issues), ...projectIssues];
  // Reporters (JSON, HTML, markdown) read this field to color-code or
  // annotate. The loader is cheap — single JSON read at module load.
  // Look up happens once per issue; cache the lookup table.
  for (const issue of allIssues) {
    if (!issue.signalStrength) {
      const strength = getSignalStrength(issue.ruleId);
      if (strength) issue.signalStrength = strength;
    }
  }

  // v0.9.3: rules marked `defaultOff: true` in signal-strength.json are
  // off by default. These are:
  //   - INVERTED rules (lift < 1.0 — fires MORE on human code than AI;
  //     the rule's signal is opposite of its name; surfacing it in CI
  //     erodes trust in the tool faster than any other failure mode)
  //   - NOISY rules (recall < 0.1 in the v4 corpus — fires too rarely on
  //     AI code to be a useful default; engineers dismiss after the 3rd
  //     false sense of "doesn't matter" and stop reading the report)
  // User `rules: { 'rule/id': 'medium' }` (or any non-off) overrides.
  // Applied to all issues BEFORE the filterIssues pass so the severity
  // filter (which skips 'off' issues) removes them from the report.
  const defaultOff = getDefaultOffRules();
  // Compute user-overrides ONCE: any rule explicitly set in config.rules
  // (to anything, even 'off') is considered a user choice and we don't
  // override it.
  const userOverrides = new Set(Object.keys(config.rules));
  let defaultOffApplied = 0;
  for (const issue of allIssues) {
    if (!defaultOff.has(issue.ruleId)) continue;
    if (userOverrides.has(issue.ruleId)) continue;
    issue.severity = 'off' as Issue['severity'];
    defaultOffApplied += 1;
  }
  if (defaultOffApplied > 0 && !options.quiet && !machineReadableStdout) {
    console.error(
      `[v${VERSION}] auto-suppressed ${defaultOffApplied} INVERTED/NOISY issue(s) ` +
        `from ${defaultOff.size} default-off rule(s). ` +
        `See the main output for the trust-signal summary. ` +
        `Re-enable per-rule via \`rules: { 'rule/id': 'medium' }\` in slopbrick.config.mjs.`,
    );
  }

  allIssues.sort((a, b) => SEVERITY_WEIGHTS[b.severity] - SEVERITY_WEIGHTS[a.severity]);

  // Finalize: build the ProjectReport and persist all side-effects.
  // The finalize phase handles parseErrors, topOffenders, previousRun,
  // enrichment, assembly, --no-increase check, and persistence.
  const { report, noIncreaseFailure } = await finalizeReport({
    cwd,
    config,
    options,
    results,
    aggregated,
    allIssues,
    baseline,
    baselineMeta,
    defaultOffApplied,
    defaultOffRuleCount: defaultOff.size,
    startTime,
    registry,
    incrementalSummary,
    telemetryEnabled,
    machineReadableStdout,
  });

  return {
    report,
    scores,
    results,
    config,
    noIncreaseFailure,
    baseline,
    machineReadableStdout,
  };
}

export async function scanProject(options: ScanProjectOptions): Promise<ProjectReport> {
  const { report } = await runScan({ ...options, workspace: options.cwd });
  return report;
}
