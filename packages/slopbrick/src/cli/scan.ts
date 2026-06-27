// Scan engine for slopbrick. Owns:
//   - runScan / scanProject — the core scan pipeline (CLI and library)
//   - watchProject — incremental watch mode (re-runs scan on fs change)
//   - renderOutput / outputScanResults — format dispatch (pretty/json/sarif/html)
//   - printFixSummary — `--fix` output formatter
//   - buildBaselineCache — constructs a baseline cache from a scan report
//
// Commander wiring lives in ./program.ts. Init/doctor helpers live in ./init.ts.

import { existsSync, writeFileSync, watch, statSync, mkdirSync, readFileSync, type FSWatcher } from 'node:fs';
import { resolve, join, relative, extname, sep } from 'node:path';

import { renderProgress, clearProgress, WATCH_DEBOUNCE_MS } from './render';
import {
  thresholdExceeded,
  failedThresholdCount,
  baselineStatusMessage,
  stagedGating,
  filterIssues,
  filterByDisabledDirectives,
  intersectFiles,
} from './threshold';

import {
  loadConfig,
  DEFAULT_CONFIG,
  resolveConfigPath as findConfigPath,
} from '../config';
import { discoverFiles, SOURCE_EXTENSIONS, ALL_SOURCE_EXTENSIONS } from '../engine/discover.js';
import {
  getGitHead,
  getGitRoot,
  getChangedFiles,
  getWorkingTreeChanges,
  getFilesSince,
} from './git.js';
import {
  loadCache,
  saveCache,
  partitionByCache,
  computeFileHash,
  emptyCache,
  type ScanCache,
} from '../engine/cache-incremental.js';
import { WorkerPool } from '../engine/pool';
import { scanFile } from '../engine/worker';
import { buildArchitectureScore } from '../engine/architecture-score';
import { analyzeBusinessLogic, buildBusinessLogicReport } from '../engine/business-logic';
import { computeAiSecurityRisk } from '../engine/ai-security-risk';
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
  baselinePath,
} from '../engine/cache';
import { formatJson } from '../report/json';
import { formatPretty, formatWhyFailingReport } from '../report/pretty';
import { formatSarif } from '../report/sarif';
import { formatHtml } from '../report/html';
import { formatAdvice } from '../report/advice';
import { formatUnifiedDiff } from '../report/unified-diff';
import { buildHeatmap, formatHeatmap } from '../report/heatmap';
import { applyFixes, type FixResult } from '../fix';
import {
  readRuns,
  appendRun,
  buildInventoryFromScan,
  buildConstitutionFromConfig,
  buildHealthFromReport,
} from '../engine/memory';
import { renderMemoryMarkdown, writeMemoryMarkdown } from '../engine/memory-md';
import { saveInventory, saveConstitution, saveHealth } from '@usebrick/core';
import { recordTelemetry, readTelemetry } from '../engine/telemetry';
import {
  computeFlywheelOutput,
  hashFile,
  loadFlywheelState,
  loadResearchMetricsFromDisk,
  saveFlywheelState,
} from '../engine/flywheel.js';
import { logger, setLoggerQuiet } from '../engine/logger';
import { runProjectRules } from '../rules/project';
import { RuleRegistry } from '../rules/registry';
import { builtinRules } from '../rules/builtins';
import { getSignalStrength, getDefaultOffRules } from '../rules/signal-strength.js';
import { readDtcgTokensFile, tokensToAllowlist } from './tokens.js';
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

export interface ScanProjectOptions {
  cwd: string;
  framework?: string;
  include?: string[];
  exclude?: string[];
  aiOnly?: boolean;
  humanOnly?: boolean;
  ignoreWcag22?: boolean;
  since?: string;
  staged?: boolean;
  changed?: boolean;
  /** v0.10.1: VibeDrift-compatible git-ref filter. When set, only files
   * changed since this ref are scanned and the report includes a
   * PR Slop Score. Equivalent to --since <ref> + PR Slop Score. */
  diffRef?: string;
  // hash matches the persisted cache at `--cache-path`.
  incremental?: boolean;
  cachePath?: string;
  tokens?: string;
  threadCount?: number;
  tighten?: boolean;
  workerScript?: string;
  strict?: boolean;
  noIncrease?: boolean;
  cache?: boolean;
  telemetry?: boolean;
}

export interface ScanRunOptions extends Omit<ScanProjectOptions, 'cwd'> {
  workspace?: string;
  fix?: boolean;
  dryRun?: boolean;
  // v0.10.1: renamed from --diff (boolean) to --show-fixes-diff (boolean)
  // to free the `--diff <ref>` name for the VibeDrift-compatible
  // git-ref alias of --since.
  showFixesDiff?: boolean;
  doctor?: boolean;
  watch?: boolean;
  quiet?: boolean;
  /** Refactor 1: enable debug logging (file paths, timings, rule-fire counts). */
  verbose?: boolean;
  trend?: number;
  cache?: boolean;
  baseline?: boolean;
  format?: 'pretty' | 'json' | 'sarif' | 'html';
  json?: true | string;
  html?: true | string;
  telemetry?: boolean;
  rule?: string;
}

export interface CliGlobalOptions extends ScanRunOptions {
  // format/json/html are inherited from ScanRunOptions — no need to redeclare.
  suggest?: boolean;
  heatmap?: boolean;
  /** v0.14.5i (P3): render the top 5 rules dragging the score down
   *  without the full report. For quick triage on a slow terminal. */
  whyFailing?: boolean;
}

export interface ScanRunResult {
  report: ProjectReport;
  scores: ComponentScore[];
  results: FileScanResult[];
  config: ResolvedConfig;
  noIncreaseFailure: boolean;
  baseline?: BaselineCache;
  machineReadableStdout: boolean;
}

export function buildBaselineCache(
  report: ProjectReport,
  configHash: string,
  gitHead: string,
  cwd: string,
): BaselineCache {
  const scores: BaselineCache['scores'] = {};
  for (const component of report.components) {
    scores[relative(cwd, component.filePath)] = {
      baselineScore: component.componentScore,
      componentCount: component.componentCount,
    };
  }
  return {
    version: VERSION,
    config_hash: configHash,
    git_head: gitHead,
    baseline_created: new Date().toISOString(),
    baseline_revision: 1,
    totalComponentCount: report.componentCount,
    scores,
  };
}

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
        const found = await globby(join(p, '**/*'), { absolute: true, onlyFiles: true });
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
  // (Cache-hit summary was previously emitted here; the metric that
  // backed it lived in the deleted executor. Removed in Refactor 5.
  // Pool.scan() may still surface a per-run cache summary in the future.)

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

  const aggregated = aggregateReport(scores, issueGroups, config);

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
  // v0.14.5i: the suppression count is now surfaced in the main scan
  // output as a trust signal (see formatPretty in src/report/pretty.ts).
  // The stderr message is kept for backwards compatibility with any
  // scripts that may have grep'd for it, but the canonical home for
  // this number is the pretty report itself.
  if (defaultOffApplied > 0 && !options.quiet && !machineReadableStdout) {
    console.error(
      `[v0.14.5i] auto-suppressed ${defaultOffApplied} INVERTED/NOISY issue(s) ` +
        `from ${defaultOff.size} default-off rule(s). ` +
        `See the main output for the trust-signal summary. ` +
        `Re-enable per-rule via \`rules: { 'rule/id': 'medium' }\` in slopbrick.config.mjs.`,
    );
  }

  allIssues.sort((a, b) => SEVERITY_WEIGHTS[b.severity] - SEVERITY_WEIGHTS[a.severity]);

  // v0.12.0: Bayesian LR combination + Benjamini–Hochberg FDR correction
  // over the full fire set. Surfaces calibrated statistics in the report
  // without changing the existing composite score math (which has its own
  // backward-compatibility contract). Reported under report.v012Stats.
  //
  //   - bayesianPosterior: P(AI | fired_rules) via naive-Bayes log-odds
  //     combination per Bento et al. 2024 *Neurocomputing*.
  //   - survivingFiresCount / totalFiresCount: how many of the fires
  //     survive BH-FDR control at α = 0.05. The "free rigor" upgrade
  //     that converts the silent multi-testing inflation problem into a
  //     calibrated number.
  //
  // Both numbers are read by the HTML reporter (report.html) and the
  // JSON reporter (report.json). They do NOT change any issue's severity
  // or the headline slopIndex — they are diagnostic.
  let v012Stats:
    | {
        bayesianPosterior: number;
        bayesianMatchedRules: number;
        totalLogLr: number;
        survivingFiresCount: number;
        totalFiresCount: number;
        fdrAlpha: number;
      }
    | undefined;
  try {
    const { combineFireSet } = await import('../engine/lr-combiner');
    const { survivingFires } = await import('../engine/multitest');
    // Build the fire set from all active issues (not defaultOff'd).
    const firedRuleIds: string[] = [];
    const fprMap = new Map<string, number>();
    for (const issue of allIssues) {
      // Issue.severity type is 'low' | 'medium' | 'high'; 'off' is set as
      // a runtime-only marker for defaultOff'd rules (see defaultOffApplied
      // loop above). Cast via unknown to access the runtime marker.
      if ((issue.severity as string) === 'off') continue;
      firedRuleIds.push(issue.ruleId);
      const strength = issue.signalStrength ?? getSignalStrength(issue.ruleId);
      if (strength && !fprMap.has(issue.ruleId)) {
        fprMap.set(issue.ruleId, strength.fpRate);
      }
    }
    const uniqueFires = [...new Set(firedRuleIds)];
    const combo = combineFireSet(uniqueFires);
    const survivors = survivingFires(
      new Map(uniqueFires.map((id) => [id, true])),
      fprMap,
      0.05,
    );
    v012Stats = {
      bayesianPosterior: combo.posterior,
      bayesianMatchedRules: combo.matchedRules,
      totalLogLr: combo.totalLogLr,
      survivingFiresCount: survivors.size,
      totalFiresCount: uniqueFires.length,
      fdrAlpha: 0.05,
    };
  } catch (err) {
    if (!options.quiet) {
      logger.warn(`v0.12.0 stats: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const parseErrors = results
    .filter((result) => result.parseError)
    .map((result) => ({ filePath: result.filePath, error: result.parseError as string }));

  const configPath = findConfigPath(cwd);

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

  // v0.10.1: PR Slop Score for --diff <ref>. Aggregate weighted issue
  // count for files changed since the ref. Uses the same per-severity
  // weights as the per-PR threshold (high=10, medium=5, low=1).
  const PR_SLOP_WEIGHTS = { high: 10, medium: 5, low: 1 } as const;
  const prSlopScore =
    options.diffRef !== undefined
      ? allIssues.reduce(
          (sum, issue) =>
            sum + (PR_SLOP_WEIGHTS[issue.severity as keyof typeof PR_SLOP_WEIGHTS] ?? 0),
          0,
        )
      : undefined;

  // Compute the architecture consistency score in the background while
  // the rest of the report is assembled. Failure here must not break
  // the main scan — wrap in try/catch and fall back to "no score".
  //
  // v0.9.2: buildArchitectureScore also runs cross-file drift detection
  // internally and returns the signals. We reuse them below for the
  // "Architecture Drift" pretty-report section — saves a duplicate
  // buildPatternInventory call.
  let architectureConsistency: number | undefined;
  let architectureDeductions: ProjectReport['architectureDeductions'];
  let crossFileDrift: ProjectReport['crossFileDrift'];
  let crossCategoryDrift: ProjectReport['crossCategoryDrift'];
  try {
    // Refactor 2: pass `results` so the scale-violation sweep reuses the
    // pre-extracted facts from the main scan instead of re-parsing every
    // file. On a 500-file repo this saves ~1500 file reads + 500 SWC parses.
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
    if (!options.quiet) {
      logger.warn(
        `architecture-score: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Phase 7: Business Logic Coherence. Re-reads each source file
  // (cheap — same files the engine already touched) and runs the
  // anti-pattern regex detectors. Failure here is non-fatal — the
  // main scan continues without the score.
  let businessLogicCoherence: number | undefined;
  let businessLogicIssues: ProjectReport['businessLogicIssues'];
  try {
    const blIssues = collectBusinessLogicIssues(cwd, results.map((r) => r.filePath));
    const blReport = buildBusinessLogicReport(blIssues, results.length);
    businessLogicCoherence = blReport.score;
    businessLogicIssues = blIssues;
  } catch (err) {
    if (!options.quiet) {
      logger.warn(
        `business-logic: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Compute the AI Security Risk categorical score from security
  // findings. Independent of slopIndex — security failures don't
  // get diluted into "the project has good slop score" territory.
  const securityIssues = allIssues.filter((issue) => issue.category === 'security');
  const { risk: aiSecurityRisk, findings: aiSecurityFindings } =
    computeAiSecurityRisk(securityIssues);

  // Phase 5 — Test Quality score. Always present in the report (so
  // JSON consumers can rely on the field), but only meaningful when
  // test files were included. Default behavior excludes test files,
  // so a default scan reports 100 (no test issues found — because
  // no test files were inspected). Run `slopbrick test` for the real
  // value.
  const { buildTestQualityScore } = await import('../engine/test-quality');
  const testQuality = buildTestQualityScore(allIssues, results.length).score;

  // Phase Memo #4 — AI Maintenance Cost (categorical meta-score).
  // Pure aggregation over signals we already have. We re-run drift
  // internally only if a constitution is declared (cheap, ~200ms
  // on 500 files). Failure is non-fatal — the main scan continues
  // without the score.
  let aiMaintenanceCost: ProjectReport['aiMaintenanceCost'];
  try {
    const { computeAiMaintenanceCostFromReport } = await import(
      '../engine/maintenance-cost'
    );
    const spacing = architectureDeductions?.find(
      (d) => d.category === 'spacingScaleViolations',
    )?.count ?? 0;
    const radius = architectureDeductions?.find(
      (d) => d.category === 'radiusScaleViolations',
    )?.count ?? 0;
    const designTokenDrift = spacing + radius > 0 ? { spacing, radius } : undefined;
    // Cheap AI-signal heuristic: >= 3 aiSpecific rules fired.
    const aiSignalCount = allIssues.filter((i) => i.aiSpecific === true).length;
    aiMaintenanceCost = computeAiMaintenanceCostFromReport(
      {
        slopIndex: aggregated.slopIndex,
        architectureConsistency,
        aiSecurityRisk,
        highSeverityIssueCount: allIssues.filter(
          (i) => i.severity === 'high',
        ).length,
        issues: allIssues.map((i) => ({ severity: i.severity })),
        fileCount: results.length,
      },
      {
        designTokenDrift,
        hasAiSignals: aiSignalCount >= 3,
      },
    );
  } catch (err) {
    if (!options.quiet) {
      logger.warn(
        `maintenance-cost: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Phase 6 — Documentation Freshness. Walks the project's markdown
  // files and cross-references against exported names + package.json.
  // Failure is non-fatal — the main scan continues without the score.
  let docFreshness: ProjectReport['docFreshness'];
  let docDrift: ProjectReport['docDrift'];
  let docFindings: ProjectReport['docFindings'];
  try {
    const { buildDocFreshness } = await import('../engine/doc-freshness');
    const docs = await buildDocFreshness(cwd, config, {});
    docFreshness = docs.docFreshness;
    docDrift = docs.docDrift;
    docFindings = docs.findings;
  } catch (err) {
    if (!options.quiet) {
      logger.warn(
        `doc-freshness: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Phase 8 — Database Health (Postgres-static, via pgsql-parser).
  // Static-only analysis of SQL + Prisma + Drizzle schema files.
  // Failure is non-fatal.
  let dbHealth: ProjectReport['dbHealth'];
  let dbDrift: ProjectReport['dbDrift'];
  let dbFindings: ProjectReport['dbFindings'];
  try {
    const { buildDbHealth } = await import('../engine/db-health');
    const db = await buildDbHealth(cwd, config, {});
    dbHealth = db.dbHealth;
    dbDrift = db.dbDrift;
    dbFindings = db.findings;
  } catch (err) {
    if (!options.quiet) {
      logger.warn(
        `db-health: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Phase 12 — Repository Health composite + AI Debt band.
  // Pure aggregation over all subscores. Failure is non-fatal.
  let repositoryHealth: ProjectReport['repositoryHealth'];
  let aiDebt: ProjectReport['aiDebt'];
  let repositoryHealthBreakdown: ProjectReport['repositoryHealthBreakdown'];
  let repositoryHealthWarnings: ProjectReport['repositoryHealthWarnings'];
  try {
    const { buildRepositoryHealthFromReport } = await import(
      '../engine/repository-health'
    );
    const spacingCount = architectureDeductions?.find(
      (d) => d.category === 'spacingScaleViolations',
    )?.count ?? 0;
    const radiusCount = architectureDeductions?.find(
      (d) => d.category === 'radiusScaleViolations',
    )?.count ?? 0;
    const composite = buildRepositoryHealthFromReport(
      {
        slopIndex: aggregated.slopIndex,
        architectureConsistency,
        aiSecurityRisk,
        testQuality,
        businessLogicCoherence,
        docFreshness,
        dbHealth,
        issues: allIssues,
      },
      {
        spacingViolations: spacingCount,
        radiusViolations: radiusCount,
      },
    );
    repositoryHealth = composite.score;
    aiDebt = composite.aiDebt;
    repositoryHealthBreakdown = composite.breakdown;
    repositoryHealthWarnings = composite.warnings;
  } catch (err) {
    if (!options.quiet) {
      logger.warn(
        `repository-health: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // v0.9.1 — Repository Coherence composite + 3 secondary domain scores.
  // Reframes the headline under the "Repository Coherence Scanner" lens.
  // The Coherence score is built from architecture + pattern + constitution +
  // aiDebt signals; the 3 domain scores (Code Hygiene, Accessibility,
  // Performance) roll up the supporting rules into standalone numbers.
  let coherence: ProjectReport['coherence'];
  let coherenceBreakdown: ProjectReport['coherenceBreakdown'];
  let coherenceWeights: ProjectReport['coherenceWeights'];
  let codeHygiene: ProjectReport['codeHygiene'];
  let accessibility: ProjectReport['accessibility'];
  let performance: ProjectReport['performance'];
  let domainIssues: ProjectReport['domainIssues'];
  try {
    const { computeCoherence, computeDomainScores } = await import(
      '../engine/coherence'
    );

    // Constitution violations: count entries where the constitution check
    // surfaced a problem in the codebase. The architecture-consistency scan
    // already feeds a "constitution" category into its deductions; we
    // pull that count here as the source of truth.
    const constitutionViolationCount =
      architectureDeductions?.find((d) => d.category === 'constitution')?.count ?? 0;

    // Pattern Fragmentation (derived from architecture deductions):
    // sum of deductions across modal/button/api/state/fetch categories,
    // normalized to a 0-100 scale (lower = better → we invert in the
    // composite). Each deduction contributes up to 100 in its own right,
    // so we cap the sum at 100 to keep the scale consistent.
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

    const domains = computeDomainScores(allIssues);
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
    if (!options.quiet) {
      logger.warn(`coherence: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // v0.9.2 — Cross-file drift detection is run inside
  // buildArchitectureScore (which already builds the PatternInventory).
  // The signals are reused here via `crossFileDrift` /
  // `crossCategoryDrift` from the architecture-score result. No
  // duplicate `buildPatternInventory` call needed.

  const report: ProjectReport = {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    configPath,
    slopIndex: aggregated.slopIndex,
    assemblyHealth: aggregated.assemblyHealth,
    totalScore: aggregated.totalScore,
    categoryScores: aggregated.categoryScores,
    boundaryScore: aggregated.boundaryScore,
    contextScore: aggregated.contextScore,
    visualScore: aggregated.visualScore,
    subscores: aggregated.subscores,
    architectureConsistency,
    architectureDeductions,
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
    prSlopScore,
    diffRef: options.diffRef,
    v012Stats,
    aiDebt,
    repositoryHealthBreakdown,
    repositoryHealthWarnings,
    // v0.14.5i: surface in the report so formatPretty can render
    // the trust-signal line. See src/report/pretty.ts.
    defaultOffSuppressedCount: defaultOffApplied,
    defaultOffRuleCount: defaultOff.size,
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
    coherence,
    coherenceBreakdown,
    coherenceWeights,
    codeHygiene,
    accessibility,
    performance,
    domainIssues,
    crossFileDrift,
    crossCategoryDrift,
  };


  let noIncreaseFailure = false;
  if (options.noIncrease) {
    const previous = readRuns(cwd).at(-1);
    if (previous) {
      if (report.slopIndex > previous.slopIndex) {
        noIncreaseFailure = true;
        if (!options.quiet) {
          logger.error(
            `Slop Index went UP from ${previous.slopIndex.toFixed(1)} to ${report.slopIndex.toFixed(1)} — your code got sloppier. See which files changed and fix the new issues.`,
          );
        }
      }
    } else if (!options.quiet) {
      logger.warn('Warning: no previous run found; --no-increase has nothing to compare.');
    }
  }

  if (config.projectMemory !== false) {
    appendRun(cwd, report, thresholdExceeded(report, config));
  }

  // for files that were actually scanned this run. Files in the old
  // cache that we skipped are kept as-is (their hash is still valid).
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

  if (telemetryEnabled) {
    const runs = readRuns(cwd);
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

  // v0.10.7 — Repository Memory Platform. Persist the pattern inventory
  // and declared constitution so the next MCP `slop_suggest` /
  // `slop_check_constitution` call reads from disk instead of
  // re-parsing the AST (100–1000× latency win). Failure here is
  // non-fatal — the scan report is already complete and should not
  // fail the run because a side-effect write threw.
  if (config.projectMemory !== false) {
    try {
      const durationMs = Date.now() - startTime;
      const inventory = await buildInventoryFromScan(
        { cwd, results },
        config,
        durationMs,
      );
      await saveInventory(cwd, inventory);
      const constitution = buildConstitutionFromConfig(config, cwd);
      await saveConstitution(cwd, constitution);
      // v0.14.5d: also render the agent-readable markdown summary so
      // MCP `slop_suggest_with_memory` and external agent integrations
      // can read `.slopbrick/memory.md` without re-parsing AST.
      const md = renderMemoryMarkdown(inventory, constitution);
      await writeMemoryMarkdown(cwd, md);
      // v0.14.5d: also persist the headline health snapshot. Dashboards,
      // CI status checks, and the website project page consume this —
      // the format is the contract (`health.schema.json` in core).
      const health = buildHealthFromReport(report, cwd, { scanDurationMs: durationMs });
      saveHealth(cwd, health);
      if (!options.quiet && !machineReadableStdout) {
        logger.info(`Memory persisted to .slopbrick/ (${inventory.patterns.length} patterns, ${inventory.components.length} components, ${md.length} bytes of memory.md, health.json: slopIndex=${health.slopIndex}).`);
      }
    } catch (err) {
      if (!options.quiet && !machineReadableStdout) {
        logger.warn(
          `memory: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

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

/**
 * Phase 7: run the business-logic detectors over each file the scan
 * actually visited. Per-file errors are silently swallowed so a single
 * unreadable source doesn't break the main scan; only catastrophic
 * I/O failures bubble up. Exposed for tests + the `business-logic`
 * subcommand indirectly via the shared engine module.
 */
function collectBusinessLogicIssues(
  cwd: string,
  filePaths: string[],
): import('../engine/business-logic.js').BusinessLogicIssue[] {
  const issues: import('../engine/business-logic.js').BusinessLogicIssue[] = [];
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

export function printFixSummary(
  results: FixResult[],
  quiet: boolean,
): { totalApplied: number; totalSkipped: number; hasErrors: boolean } {
  let totalApplied = 0;
  let totalSkipped = 0;
  let hasErrors = false;

  for (const result of results) {
    totalApplied += result.applied.length;
    totalSkipped += result.skipped.length;
    if (result.errors && result.errors.length > 0) {
      hasErrors = true;
    }

    if (quiet) continue;

    const entries: string[] = [];
    for (const app of result.applied) {
      entries.push(`  [applied] ${app.ruleId}: ${app.description}`);
    }
    for (const app of result.skipped) {
      entries.push(`  [skipped] ${app.ruleId}: ${app.description}`);
    }
    for (const err of result.errors ?? []) {
      entries.push(`  [error] ${err}`);
    }

    if (entries.length > 0) {
      logger.info(result.filePath);
      for (const entry of entries) {
        logger.info(entry);
      }
    }
  }

  if (!quiet) {
    logger.info(`Fixes applied: ${totalApplied}, skipped: ${totalSkipped}${hasErrors ? ', errors detected' : ''}`);
  }

  return { totalApplied, totalSkipped, hasErrors };
}

export function renderOutput(report: ProjectReport, options: CliGlobalOptions, cwd: string): void {
  // Validate --format up front (Refactor 1). Previously an unknown
  // --format value silently fell through to pretty — users with CI scripts
  // that depended on JSON output got HTML or pretty and never noticed.
  const VALID_FORMATS = new Set(['pretty', 'json', 'sarif', 'html']);
  if (options.format && !VALID_FORMATS.has(options.format)) {
    process.stderr.write(
      `Unknown --format value: ${options.format}. Valid: pretty, json, sarif, html.\n`,
    );
    process.exit(2);
  }

  // v0.14.5i (P3): --why-failing is a quick triage view. Renders just
  // the top 5 rules dragging the score down, without the full
  // report. Takes precedence over --suggest / --format because
  // it's a different output entirely.
  if (options.whyFailing) {
    if (!options.quiet) {
      logger.info(formatWhyFailingReport(report));
    }
    return;
  }

  if (options.suggest) {
    if (!options.quiet) {
      logger.info(formatAdvice(report));
      const diff = formatUnifiedDiff(report, cwd);
      if (diff) {
        logger.info(diff);
      }
    }
    return;
  }

  if (options.html) {
    const html = formatHtml(report);
    if (typeof options.html === 'string') {
      writeFileSync(resolve(options.html), html);
      if (!options.quiet) {
        logger.info(`Wrote HTML report to ${options.html}`);
      }
    } else {
      logger.info(html);
    }
    return;
  }

  if (options.json) {
    const json = formatJson(report);
    if (typeof options.json === 'string') {
      writeFileSync(resolve(options.json), json);
      if (!options.quiet) {
        logger.info(`Wrote JSON report to ${options.json}`);
      }
    } else {
      logger.info(json);
    }
    return;
  }

  if (options.format === 'json') {
    logger.info(formatJson(report));
    return;
  }

  if (options.format === 'sarif') {
    const cwd = resolve(options.workspace ?? process.cwd());
    logger.info(formatSarif(report, { cwd }));
    return;
  }

  if (options.format === 'html') {
    logger.info(formatHtml(report));
    return;
  }

  if (!options.quiet) {
    logger.info(formatPretty(report));
  }
}

export async function outputScanResults(report: ProjectReport, options: CliGlobalOptions, cwd: string): Promise<void> {
  if (options.heatmap) {
    const entries = await buildHeatmap(report, cwd);
    logger.info(formatHeatmap(entries, { json: options.format === 'json' }));
    return;
  }
  renderOutput(report, options, cwd);
}

export async function watchProject(options: CliGlobalOptions, cwd: string, paths: string[]): Promise<void> {
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
    const score = scoreFile(result, multiplier, currentConfig ?? DEFAULT_CONFIG, currentBaseline, cwd);
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
      logger.error(`Scan failed: ${err instanceof Error ? err.message : String(err)}`);
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
              logger.info(`Rescanned ${changedPath}. Watching for changes... (press Ctrl+C to stop)`);
            }
          } catch (err) {
            logger.error(`Incremental scan failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        })();
      }, WATCH_DEBOUNCE_MS);
    },
  );
}