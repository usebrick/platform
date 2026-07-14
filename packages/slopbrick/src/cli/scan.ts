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

import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { randomUUID } from 'node:crypto';

import { renderProgress, clearProgress, configureColorPolicy } from './render';
import { CliUsageError } from './exit-codes';
import {
  filterIssues,
  intersectFiles,
} from './threshold';

import {
  loadConfig,
  resolveConfigPath as findConfigPath,
} from '../config';
import {
  classifyDiscoveryCandidates,
  isExcludedBySelfScan,
  type SelectionAccounting,
} from '../engine/discover.js';
import { discoverScanFilesWithDiagnostics } from './discovery.js';
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
  saveCache,
  computeFileHash,
  resolveCachePath,
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
import { formatErrorMessage } from './format/error';
import { runProjectRules } from '../rules/project';
import { RuleRegistry } from '../rules/registry';
import { resetDuplicationRuleState } from '../rules/dup/index.js';
import {
  collectIdenticalBlockIssues,
  type IdenticalBlockIssueMap,
} from '../rules/dup/identical-block.js';

import type { CompositeRule } from '../types';
import { builtinRules } from '../rules/builtins';
import { getSignalStrength, getDefaultOffRules } from '../rules/signal-strength.js';
import {
  effectiveIssuesForScore,
  markDefaultOffIssuesForAudit,
  normalizeFileResultForDisplayAndScore,
} from './effective-issues';
import { countSuccessfullyAnalyzed, isSuccessfullyAnalyzed } from './scan-accounting';
import { readDtcgTokensFile, tokensToAllowlist } from './tokens.js';
import { finalizeReport } from './report/finalizeReport';
import {
  isGitScopedEmptySelection,
  isNotApplicableScan,
  isReadOnlyGitSubset,
} from '../report/scan-validity.js';
import { VERSION } from '../types';
import type { FileScanResult, Issue, ProjectReport, ResolvedConfig, BaselineMeta, BaselineCache, ComponentScore } from '../types';
import type {
  ScanProjectOptions,
  ScanRunOptions,
  CliGlobalOptions,
  ScanRunResult,
  ScanStats,
  ScanCompletionStatus,
} from './types';

// Re-export the CLI-side helpers + types so callers (program.ts,
// tests) can still import them from `./scan`. Implementations live
// in the extracted files under `report/`, `format/`, and `watch.ts`.
export type {
  ScanProjectOptions,
  ScanRunOptions,
  CliGlobalOptions,
  ScanRunResult,
  ScanStats,
  ScanCompletionStatus,
} from './types';
export { buildBaselineCache } from './report/baseline-cache';
export { printFixSummary, type FixSummary } from './report/printFixSummary';
export { renderOutput, outputScanResults } from './report/renderOutput';
export { watchProject } from './watch';

// Cross-file duplicate detection and the parser-cache adapter currently use
// process-scoped state. Serialize public runScan() calls until those internals
// become run-owned so concurrent library callers cannot contaminate each
// other's findings or environment.
let scanRunTail: Promise<void> = Promise.resolve();

export async function runScan(
  options: ScanRunOptions,
  explicitPaths?: string[],
): Promise<ScanRunResult> {
  const previousRun = scanRunTail;
  let releaseRun!: () => void;
  scanRunTail = new Promise<void>((resolveRun) => {
    releaseRun = resolveRun;
  });
  await previousRun;

  const previousParserCacheSetting = process.env.SLOP_AUDIT_CACHE;
  const readOnlyGitScope = isReadOnlyGitSubset(options);
  if (readOnlyGitScope) {
    process.env.SLOP_AUDIT_CACHE = '0';
  } else if (options.cache) {
    process.env.SLOP_AUDIT_CACHE = '1';
  }

  // Cross-file duplication rules keep per-process caches while files in one
  // scan are analyzed. The public/library API can execute multiple scans in
  // the same process, so each run needs a fresh project-scoped cache.
  try {
    resetDuplicationRuleState();
    return await runScanWithScopedState(options, explicitPaths);
  } finally {
    if (previousParserCacheSetting === undefined) {
      delete process.env.SLOP_AUDIT_CACHE;
    } else {
      process.env.SLOP_AUDIT_CACHE = previousParserCacheSetting;
    }
    releaseRun();
  }
}

async function runScanWithScopedState(
  options: ScanRunOptions,
  explicitPaths?: string[],
): Promise<ScanRunResult> {
  setLoggerQuiet(!!options.quiet);
  // `--no-color` is a process-local renderer override. Reset it before
  // every run so a prior library/CLI invocation cannot leak color policy
  // into the next scan.
  configureColorPolicy(!!options.noColor);
  // v0.10.7 — Repository Memory Platform. Captured here so the inventory
  // persisted at the end of runScan reflects the wall-clock scan time
  // (same metric surfaced in `ProjectReport.scanDurationMs`).
  const startTime = Date.now();
  // v0.24.0 (Workstream C): opt-in network beacon scan-id. Generated
  // here so the CLI layer can hand it to `BeaconEmitter` after the
  // report renders. UUID v4 is sufficient — the scan-id is for
  // receiver-side dedup, not for crypto.
  const scanId = randomUUID();
  const cwd = resolve(options.workspace ?? process.cwd());
  // Workspace existence check (Refactor 1). Silent fallback to "0 files
  // scanned" was misleading users into thinking their scan succeeded on a
  // real project. Surface the failure clearly.
  if (!existsSync(cwd)) {
    throw new CliUsageError(`Workspace not found: ${cwd}`);
  }
  const cwdStat = statSync(cwd);
  if (!cwdStat.isDirectory()) {
    throw new CliUsageError(`Workspace is not a directory: ${cwd}`);
  }
  const configPath = findConfigPath(cwd);
  const loadedConfig = await loadConfig(cwd);
  const config: ResolvedConfig = {
    ...loadedConfig,
    rules: { ...loadedConfig.rules },
  };

  if (options.framework) {
    config.framework = options.framework;
  }
  if (options.include && options.include.length > 0) {
    config.include = options.include;
  }
  if (options.exclude && options.exclude.length > 0) {
    config.exclude = [...config.exclude, ...options.exclude];
  }

  // Git-selected scans require a repository for every supported selector.
  if (isReadOnlyGitSubset(options)) {
    if (!getGitRoot(cwd)) {
      const flag = options.changed
        ? '--changed'
        : options.staged
          ? '--staged'
          : options.diffRef !== undefined
            ? '--diff'
            : '--since';
      throw new CliUsageError(`${flag} requires a git repository (no .git found in ${cwd})`);
    }
  }

  // Git-scoped verification is used by pre-commit hooks. It must be a pure
  // observation of the repository/config bytes under review: teaching the
  // flywheel from a staged run makes an immediate repeat score differently,
  // and persisting a partial-project snapshot corrupts whole-project memory.
  const readOnlyGitScope = isReadOnlyGitSubset(options);
  const configuredTelemetryEnabled = options.telemetry !== false && config.telemetry !== false;
  const telemetryEnabled = configuredTelemetryEnabled && !readOnlyGitScope;
  config.telemetry = configuredTelemetryEnabled;

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
  let selectionAccounting: SelectionAccounting | undefined;
  if (explicitPaths && explicitPaths.length > 0) {
    const { globby } = await import('globby');
    const { minimatch } = await import('minimatch');
    const resolved = explicitPaths.map((p) => resolve(cwd, p));
    const directoryCandidates: string[] = [];
    const explicitFiles: string[] = [];
    for (const p of resolved) {
      if (existsSync(p) && statSync(p).isDirectory()) {
        const found = await globby(`${p}/**/*`, { absolute: true, onlyFiles: true });
        for (const f of found) {
          const rel = relative(cwd, f).split(sep).join('/');
          if (config.include.length > 0 && !config.include.some((pattern) => minimatch(rel, pattern))) {
            continue;
          }
          directoryCandidates.push(f);
        }
      } else {
        // A direct file argument bypasses discovery/type/general-exclude
        // classification, so it does not belong to the observed-candidate
        // population. The repository selfScan policy is applied uniformly
        // below before requested-file accounting.
        explicitFiles.push(p);
      }
    }
    const classifiedDirectories = classifyDiscoveryCandidates(cwd, directoryCandidates, config);
    files = [...classifiedDirectories.files, ...explicitFiles];
    // Only directory expansion has a truthful observed-candidate population.
    // Mixed direct-file invocations retain their long-standing semantics and
    // intentionally omit selection accounting altogether.
    if (explicitFiles.length === 0) selectionAccounting = classifiedDirectories.selectionAccounting;
  } else {
    const discovered = await discoverScanFilesWithDiagnostics({
      workspace: cwd,
      config,
      configPath,
      cliIncludeOverride: !!(options.include && options.include.length > 0),
    });
    files = discovered.files;
    selectionAccounting = discovered.selectionAccounting;
  }

  const selfScanExcludePaths = config.selfScan?.excludePaths;
  if (selfScanExcludePaths && selfScanExcludePaths.length > 0) {
    const beforeSelfScanSelection = files.length;
    files = files.filter((filePath) =>
      !isExcludedBySelfScan(filePath, cwd, selfScanExcludePaths),
    );
    const removed = beforeSelfScanSelection - files.length;
    if (selectionAccounting && removed > 0) {
      selectionAccounting = {
        ...selectionAccounting,
        selected: selectionAccounting.selected - removed,
        excluded: {
          ...selectionAccounting.excluded,
          configExclude: selectionAccounting.excluded.configExclude + removed,
        },
      };
    }
  }

  const applyGitScope = (nextFiles: string[]) => {
    if (selectionAccounting) {
      const removed = files.length - nextFiles.length;
      selectionAccounting = {
        ...selectionAccounting,
        selected: selectionAccounting.selected - removed,
        excluded: {
          ...selectionAccounting.excluded,
          gitScope: selectionAccounting.excluded.gitScope + removed,
        },
      };
    }
    files = nextFiles;
  };

  if (options.staged) {
    const changed = await getChangedFiles(cwd);
    applyGitScope(intersectFiles(files, changed, cwd));
  }
  if (options.changed) {
    const changed = await getWorkingTreeChanges(cwd);
    applyGitScope(intersectFiles(files, changed, cwd));
  }
  if (options.since) {
    const since = await getFilesSince(cwd, options.since);
    applyGitScope(intersectFiles(files, since, cwd));
  }
  // v0.10.1: --diff <ref> is the VibeDrift-compatible alias for --since.
  if (options.diffRef) {
    const since = await getFilesSince(cwd, options.diffRef);
    applyGitScope(intersectFiles(files, since, cwd));
  }

  // Preserve the exact post-filter project selection before incremental
  // partitioning removes cache hits from the files analyzed in this run.
  // Secondary analysis and persisted memory must never rediscover paths that
  // config, self-scan, or Git scope excluded.
  const selectedFilePaths = [...files];

  // Count the complete requested set before incremental partitioning. Cache
  // skips remain distinct from files analyzed in this invocation.
  const requestedFiles = files.length;
  const emptySelection = isNotApplicableScan({ requested: requestedFiles });
  const gitScopedEmptySelection = isGitScopedEmptySelection(
    { requested: requestedFiles },
    options,
  );

  // the persisted cache. Cache invalidates on VERSION mismatch.
  // v0.42.0 (post-cleanup follow-up): the unchanged list is also needed
  // for the saveCache call at the end of runScan. We want the cache to
  // include BOTH the freshly-scanned files AND the files that
  // partitionByCache marked as unchanged, so the next run can skip
  // either. The unchanged files' issueCount + hash come from the
  // existing cache; the freshly-scanned ones from this run's results.
  let incrementalSummary: { skipped: number; rescanned: number } | undefined;
  let cachePath: string | undefined;
  let existingCache: ReturnType<typeof loadCache> | undefined;
  let unchanged: string[] = [];
  if (options.incremental) {
    cachePath = resolveCachePath(options.cachePath ?? '.slopbrick-cache.json', cwd);
    existingCache = loadCache(cachePath);
    const partition = partitionByCache(files, existingCache);
    files = partition.toScan;
    unchanged = partition.unchanged;
    incrementalSummary = { skipped: unchanged.length, rescanned: partition.toScan.length };
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
  if (
    requestedFiles === 0 &&
    !gitScopedEmptySelection &&
    !options.watch &&
    !options.quiet &&
    !machineReadableStdout
  ) {
    const projectRoot = configPath;
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
      // v0.42.0 (user-review fix): the original 1-line warning left
      // monorepo users stranded. The most common cause is running
      // from the root when the project lives under packages/* — same
      // hint as `slopbrick doctor` now prints.
      logger.warn(
        'Tip: run from a directory with source files, or pass --workspace <path> ' +
          '(monorepos usually want `--workspace packages/<name>`).',
      );
    }
  }

  const configHash = hashConfig(config);
  const gitHead = (await getGitHead(cwd)) ?? 'unknown';
  let baseline: BaselineCache | undefined;
  let baselineMeta: BaselineMeta | undefined;
  const baselineCache = emptySelection ? undefined : loadBaseline(cwd);

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
      throw new CliUsageError(
        `Unknown rule: ${options.rule}. Run \`slopbrick rules\` to see available rules.`,
      );
    }
  }
  // v0.10.2 (Phase 10): validate --include-rule values so the user
  // gets a clear error rather than an empty rule registry.
  // `--security-only` is a rule-set selector, not merely an output filter:
  // keep it identical across inline and worker paths by deriving the same
  // effective include set once at the scan boundary.
  const securityRuleIds = options.securityOnly
    ? builtinRules.filter((rule) => rule.id.startsWith('security/')).map((rule) => rule.id)
    : undefined;
  const effectiveIncludeRules = securityRuleIds
    ? (options.includeRules && options.includeRules.length > 0
      ? options.includeRules.filter((id) => securityRuleIds.includes(id))
      : securityRuleIds)
    : options.includeRules;
  if (options.includeRules && options.includeRules.length > 0) {
    const unknown = options.includeRules.filter((id) => !builtinRules.some((r) => r.id === id));
    if (unknown.length > 0) {
      throw new CliUsageError(
        `Unknown --include-rule value(s): ${unknown.join(', ')}. Run \`slopbrick rules\` to see available rules.`,
      );
    }
  }
  registry.loadBuiltins(options.rule, { includeRules: effectiveIncludeRules, excludeRules: options.excludeRules });
  if (telemetryEnabled) {
    const flywheelState = loadFlywheelState(cwd);
    // v0.14.5g: skip autotune entries for rules marked defaultOff in
    // signal-strength.json. The flywheel is a learning loop that can
    // promote a rule's severity to 'high' over 3 consecutive scans;
    // but if a rule is INVERTED or NOISY (calibration-failed), it
    // must stay off regardless of how many scans observed it. Without
    // this guard, the flywheel undoes the auto-disable pass below.
    // v0.40.0 (Sprint 2.1): the same guard now also applies to the
    // relaxation half — we never re-enable a rule the calibration
    // marked defaultOff, even if the relaxer decided to flip it
    // off-then-on (the read-side applies the relaxed severity, but
    // the skipped-defaultOff check wins).
    const defaultOffRules = getDefaultOffRules();
    for (const tuned of flywheelState.autoTuned) {
      if (config.rules[tuned.ruleId] === 'off') continue;
      if (defaultOffRules.has(tuned.ruleId)) continue;
      config.rules[tuned.ruleId] = tuned.severity;
    }
    // Apply the relaxation half. Two independent writes to the
    // same `config.rules` map; later entries win on duplicate keys.
    // Order matters here: `autoTuned` is processed first, so a
    // rule that BOTH bumped AND relaxed in the persisted state
    // gets the relaxation applied second (the relaxer wins for
    // the next scan). The persisted state preserves both so the
    // user can audit the ratchet history.
    for (const relaxed of flywheelState.autoRelaxed) {
      if (config.rules[relaxed.ruleId] === 'off') {
        // If the user has explicitly turned the rule off, leave
        // it off — their explicit choice beats the relaxer's
        // observation.
        continue;
      }
      if (defaultOffRules.has(relaxed.ruleId)) continue;
      // `relaxed.severity` is `Severity | 'off'`. `config.rules[id]`
      // accepts `RuleSeverity = Severity | 'auto' | 'off'`, so the
      // assignment is type-safe.
      config.rules[relaxed.ruleId] = relaxed.severity;
    }
  }

  // machineReadableStdout was computed earlier (above the 0-files warning)
  // so the warning could gate on it; reuse it here.
  const showProgress = process.stdout.isTTY && !options.quiet && !machineReadableStdout;
  if (options.verbose && !options.quiet && !machineReadableStdout) {
    console.error(
      `[verbose] selected ${requestedFiles} file${requestedFiles === 1 ? '' : 's'} ` +
      `(${files.length} to analyze${options.incremental ? `, ${unchanged.length} cached` : ''}); ` +
      `${registry.all().length} rule${registry.all().length === 1 ? '' : 's'} enabled.`,
    );
  }

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
  if (files.length <= INLINE_THRESHOLD) {
    results = [];
    for (const filePath of files) {
      // v0.10.2 (Phase 10): pass the registry so --include-rule /
      // --exclude-rule actually take effect in the inline path too.
      // Without this, single-file scans ignore the include filter.
      results.push(await scanFile(filePath, config, registry, cwd));
    }
  } else {
    const pool = new WorkerPool({
      config,
      cwd,
      threadCount: options.threadCount,
      quiet: options.quiet,
      rule: options.rule,
      includeRules: effectiveIncludeRules,
      excludeRules: options.excludeRules,
      ...(options.workerScript ? { workerScript: options.workerScript } : {}),
    });
    results = await pool.scan(files, showProgress ? renderProgress : undefined);
  }
  if (showProgress) {
    clearProgress();
  }
  if (options.verbose && !options.quiet && !machineReadableStdout) {
    const analyzed = countSuccessfullyAnalyzed(results);
    const failed = results.length - analyzed;
    console.error(`[verbose] analyzed ${analyzed} file${analyzed === 1 ? '' : 's'}; ${failed} scan failure${failed === 1 ? '' : 's'}.`);
  }

  // Cross-file Type-1 clone detection is a project-level post-pass.  It is
  // explicitly opt-in while its signal entry is default-off: do not spend
  // parser/candidate memory on ordinary scans.  A severity override (low,
  // medium, or high) is the user opt-in; `auto` preserves the default-off
  // policy and `off` always disables the post-pass.
  const duplicateRuleId = 'dup/identical-block';
  const duplicateConfiguredSeverity = config.rules[duplicateRuleId];
  const duplicateExplicitlyEnabled =
    (duplicateConfiguredSeverity !== undefined &&
      duplicateConfiguredSeverity !== 'auto' &&
      duplicateConfiguredSeverity !== 'off') ||
    options.rule === duplicateRuleId ||
    options.includeRules?.includes(duplicateRuleId) === true;
  const duplicateCoordinatorEnabled =
    registry.has(duplicateRuleId) &&
    (!getDefaultOffRules().has(duplicateRuleId) || duplicateExplicitlyEnabled);
  let duplicateIssues: IdenticalBlockIssueMap | undefined;
  let duplicateCachedIssues: Issue[] = [];
  let duplicateSourceReadFailures = 0;
  if (duplicateCoordinatorEnabled) {
    const duplicateSources = results
      .filter((result) => isSuccessfullyAnalyzed(result) && typeof result.facts?.v2?._source === 'string')
      .map((result) => ({
        filePath: result.filePath,
        source: result.facts!.v2._source!,
      }));
    const analyzedPaths = new Set(results.map((result) => result.filePath));
    // Incremental cache entries contain hashes/counts, not source text. Read
    // unchanged paths from the exact post-filter selection so a clone spanning
    // one cached and one rescanned file has the same evidence as a full scan.
    if (options.incremental && unchanged.length > 0) {
      const selectedPathSet = new Set(selectedFilePaths);
      for (const filePath of unchanged) {
        if (!selectedPathSet.has(filePath) || analyzedPaths.has(filePath)) continue;
        try {
          duplicateSources.push({ filePath, source: readFileSync(filePath, 'utf8') });
        } catch {
          duplicateSourceReadFailures += 1;
        }
      }
    }
    duplicateIssues = collectIdenticalBlockIssues(duplicateSources);
    for (const result of results) {
      const issues = duplicateIssues.get(result.filePath);
      if (issues) result.issues.push(...issues);
    }
    // Cached files have no FileScanResult to attach to, but their verified
    // findings still belong in the project report (the scan is already marked
    // partial/incomplete because cached files were skipped).
    for (const [filePath, issues] of duplicateIssues) {
      if (analyzedPaths.has(filePath)) continue;
      for (const issue of issues) {
        issue.filePath ??= filePath;
      }
      duplicateCachedIssues.push(...filterIssues(issues, options));
    }
    if (
      duplicateIssues.truncated &&
      !options.quiet &&
      !machineReadableStdout
    ) {
      logger.warn(
        `dup/identical-block post-pass capped at ${duplicateIssues.maxCandidateWindows.toLocaleString()} ` +
        `candidate windows; clone findings may be incomplete. ` +
        `${duplicateIssues.skippedInputs + duplicateSourceReadFailures} input(s) were skipped.`,
      );
    }
  }

  let defaultOffApplied = 0;
  for (const result of results) {
    defaultOffApplied += normalizeFileResultForDisplayAndScore(result, config, options);
  }

  // Keep the score's effective issue set identical to the user-visible
  // contract.  Default-off findings remain attached to the report as
  // `severity: off` for auditability, but must not contribute to scoreFile
  // or aggregateReport.  Previously suppression happened after scoring,
  // so an INVERTED/NOISY finding could lower the score while disappearing
  // from issue counts and SARIF results.
  const defaultOff = getDefaultOffRules();
  const multiplier = resolveFrameworkMultiplier(config);
  const scorableResults = results.filter(isSuccessfullyAnalyzed);
  // Project rules run after the per-file pipeline, but their active findings
  // are part of the same effective score contract.  Build this set before
  // aggregateReport so project-level AI/hygiene evidence cannot appear in the
  // report while silently disappearing from the four headline scores.
  const projectIssues = options.securityOnly
    ? []
    : filterIssues(runProjectRules(scorableResults, config), options);
  const effectiveProjectIssues = effectiveIssuesForScore(projectIssues, config);
  const scores = scorableResults.map((result) => scoreFile(
    { ...result, issues: effectiveIssuesForScore(result.issues, config) },
    multiplier,
    config,
    baseline,
    cwd,
  ));
  const issueGroups = scorableResults.map((result) => ({
    filePath: result.filePath,
    issues: effectiveIssuesForScore(result.issues, config),
  }));
  if (effectiveProjectIssues.length > 0) {
    issueGroups.push({ filePath: '<project>', issues: effectiveProjectIssues });
  }
  // Keep one explicit effective projection for every downstream report
  // consumer. It contains only findings exposed to this invocation's score:
  // successful per-file findings plus active project findings. In particular,
  // duplicate findings hydrated from incremental-cache source reads remain in
  // the broad audit envelope below but cannot inflate --diff PR scoring.
  const effectiveIssues = [
    ...scorableResults.flatMap((result) => effectiveIssuesForScore(result.issues, config)),
    ...effectiveProjectIssues,
  ];

  const subsetRef = options.since ?? options.diffRef;
  if (subsetRef && baseline) {
    const baselineIdentity = (filePath: string) =>
      relative(cwd, resolve(cwd, filePath)).split(sep).join('/');
    const includedPaths = new Set(
      results.map((result) => baselineIdentity(result.filePath)),
    );
    for (const [filePath, cached] of Object.entries(baseline.scores)) {
      const absoluteFilePath = resolve(cwd, filePath);
      const identity = baselineIdentity(absoluteFilePath);
      if (includedPaths.has(identity)) continue;
      if (isExcludedBySelfScan(absoluteFilePath, cwd, selfScanExcludePaths)) continue;
      if (!existsSync(absoluteFilePath)) continue;
      includedPaths.add(identity);
      scores.push({
        filePath: absoluteFilePath,
        rawScore: 0,
        componentScore: 0,
        adjustedScore: 0,
        componentCount: cached.componentCount,
      });
      issueGroups.push({ filePath: absoluteFilePath, issues: [] });
    }
  }

  // v0.18.2: thread per-file composite scores (worker.ts:98) into
  // aggregateReport. The deterministic `scores` + `issueGroups`
  // still drive the 4 headline scores; the composite aggregate is
  // an informational addition (does not affect aiSlopScore/etc).
  const perFileCompositeScores = scorableResults.map((r) => r.compositeScore);
  const aggregated = aggregateReport(
    scores,
    issueGroups,
    config,
    perFileCompositeScores,
    scorableResults.length,
  );

  const allIssues = [
    ...results.flatMap((result) => result.issues),
    ...duplicateCachedIssues,
    ...projectIssues,
  ];
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
  // User `rules: { 'rule/id': 'medium' }` (or any explicit setting)
  // overrides. File findings were normalized before scoring; this pass only
  // handles project-level findings added after the per-file pipeline.
  defaultOffApplied += markDefaultOffIssuesForAudit(allIssues, config);
  if (defaultOffApplied > 0 && !options.quiet && !machineReadableStdout) {
    console.error(
      `[v${VERSION}] auto-suppressed ${defaultOffApplied} INVERTED/NOISY issue(s) ` +
        `from ${defaultOff.size} default-off rule(s). ` +
        `See the main output for the trust-signal summary. ` +
        `Re-enable per-rule via \`rules: { 'rule/id': 'medium' }\` in slopbrick.config.mjs.`,
    );
  }

  allIssues.sort((a, b) => SEVERITY_WEIGHTS[b.severity] - SEVERITY_WEIGHTS[a.severity]);

  // Resolve scan outcome before finalisation: finalisation persists
  // `.slopbrick/health.json`, so every persisted consumer must receive the
  // same validity truth as the CLI report.
  const analyzedFiles = countSuccessfullyAnalyzed(results);
  const failedFiles = results.length - analyzedFiles;
  const skippedFiles = unchanged.length;
  const completionStatus = requestedFiles === 0
    ? 'empty' as const
    : failedFiles > 0 || skippedFiles > 0 || analyzedFiles + skippedFiles < requestedFiles
      ? 'partial' as const
      : 'complete' as const;
  const scoreValidity = completionStatus === 'complete'
    ? 'valid' as const
    : completionStatus === 'partial'
      ? 'incomplete' as const
      : 'not-applicable' as const;
  const scanAccounting = {
    selected: requestedFiles,
    analyzed: analyzedFiles,
    zeroFinding: results.filter((result) => isSuccessfullyAnalyzed(result) && result.issues.length === 0).length,
    incrementalCached: skippedFiles,
    parseFailed: results.filter((result) => result.failureKind === 'parse').length,
    timedOut: results.filter((result) => result.failureKind === 'timeout').length,
    crashed: results.filter((result) => result.failureKind === 'crash').length,
    internalFailed: results.filter(
      (result) => result.failureKind === 'internal' || (!result.failureKind && Boolean(result.parseError)),
    ).length,
    ...(duplicateIssues
      ? {
          identicalBlockCandidateWindows: duplicateIssues.candidateWindows,
          identicalBlockCandidateWindowLimit: duplicateIssues.maxCandidateWindows,
          identicalBlockInputSkips: duplicateIssues.skippedInputs + duplicateSourceReadFailures,
          identicalBlockTruncated: duplicateIssues.truncated,
        }
      : {}),
  };
  const scanMetadata = {
    completionStatus,
    scoreValidity,
    requested: requestedFiles,
    analyzed: analyzedFiles,
    failed: failedFiles,
    skipped: skippedFiles,
    scanAccounting,
    ...(selectionAccounting ? { selectionAccounting } : {}),
  };

  // Finalize: build the ProjectReport and persist all side-effects.
  // The finalize phase handles parseErrors, topOffenders, previousRun,
  // enrichment, assembly, --no-increase check, and persistence.
  const { report, noIncreaseFailure } = await finalizeReport({
    cwd,
    config,
    options: {
      ...options,
      // v0.42.0 (§3a.4): forward the opt-in flag through to
      // `persistRun`, which calls `refreshSnippets` post-scan.
      autoRefreshSnippets:
        Boolean(options.autoRefreshSnippets) ||
        Boolean((config as { autoRefreshSnippets?: boolean }).autoRefreshSnippets),
    },
    results,
    selectedFilePaths,
    aggregated,
    allIssues,
    projectIssues,
    effectiveIssues,
    baseline,
    baselineMeta,
    defaultOffApplied,
    defaultOffRuleCount: defaultOff.size,
    startTime,
    registry,
    incrementalSummary,
    telemetryEnabled,
    machineReadableStdout,
    scanMetadata,
  });

  // v0.42.0 (post-cleanup follow-up): the --incremental cache
  // was loaded but never written. The bug: a user runs --incremental
  // once, gets 0 files skipped, runs it again, gets 0 skipped again.
  // Save the cache here so the second run can actually skip unchanged
  // files. Merge the freshly-scanned files (this run's results) with
  // the unchanged files (from partitionByCache, re-using their prior
  // hash + issueCount so the next run can skip them too).
  if (
    !readOnlyGitScope &&
    options.incremental &&
    cachePath !== undefined &&
    report.scoreValidity === 'valid'
  ) {
    const cachedFiles: Record<string, { hash: string; issueCount: number; lastScannedAt: string }> = {};
    
    for (const r of results) {
      try {
        cachedFiles[r.filePath] = {
          hash: computeFileHash(r.filePath),
          issueCount: r.issues.length,
          lastScannedAt: new Date().toISOString(),
        };
      } catch {
        // File may have been deleted between scan and write. Skip.
      }
    }
    for (const f of unchanged) {
      const cached = existingCache?.files[f];
      if (cached) {
        // Carry the prior hash + issueCount forward; the file was not
        // re-scanned this run, so its data is still authoritative.
        cachedFiles[f] = {
          hash: cached.hash,
          issueCount: cached.issueCount,
          lastScannedAt: cached.lastScannedAt,
        };
      } else {
        // unchanged but no cache entry (rare - happens when
        // partitionByCache falls through to a hash mismatch). The
        // safest thing is to drop the entry so the next run scans
        // this file fresh.
      }
    }
    try {
      saveCache(cachePath, {
        version: VERSION,
        generatedAt: new Date().toISOString(),
        files: cachedFiles,
      });
    } catch (error) {
      // Best-effort write. If saveCache fails (e.g. permission denied),
      // we still return the scan result. The next --incremental run
      // will simply not have a cache to consult.
      if (!options.quiet && !machineReadableStdout) {
        logger.warn(`Incremental cache not saved: ${formatErrorMessage(error)}`);
      }
    }
    if (incrementalSummary && !options.quiet && !machineReadableStdout) {
      logger.info(
        `Incremental: re-scanned ${incrementalSummary.rescanned}, skipped ${incrementalSummary.skipped} (unchanged).`,
      );
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
    // v0.24.0 (Workstream C): stats for the opt-in network beacon.
    // `fileCount` = files that ran through the worker pool (excludes
    // incremental-cache skips). `ruleCount` = builtin rules, or 1
    // when `--rule <id>` narrows the run. `durationMs` = wall-clock
    // since `runScan` entry (matches `report.scanDurationMs`).
    scanStats: {
      status: completionStatus,
      requested: requestedFiles,
      analyzed: analyzedFiles,
      failed: failedFiles,
      skipped: skippedFiles,
      scanAccounting,
      scanId,
      fileCount: results.length,
      ruleCount: options.rule ? 1 : builtinRules.length,
      durationMs: Date.now() - startTime,
    },
  };
}

export async function scanProject(options: ScanProjectOptions): Promise<ProjectReport> {
  const { report } = await runScan({ ...options, workspace: options.cwd });
  return report;
}
