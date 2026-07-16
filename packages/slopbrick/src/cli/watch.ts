// --watch mode: re-run the scan on relevant file-system changes.
//
// The watcher deliberately uses full scans. A prior incremental map became
// stale after add/delete/rename events and treated scanner-owned writes (for
// example `.slopbrick/health.json`) as source changes, creating an unbounded
// self-scan loop. Relevant events are now classified before debounce and full
// scans are serialized with at most one queued follow-up.

import { readdirSync, statSync, watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { resolveConfigPath as findConfigPath } from '../config';
import { baselinePath } from '../engine/cache';
import { logger } from '../engine/logger';
import type { FileScanResult, ResolvedConfig } from '../types';
import { normalizeFileResultForDisplayAndScore } from './effective-issues';
import { formatErrorMessage } from './format/error';
import { getGitIndexPath } from './git';
import { WATCH_DEBOUNCE_MS } from './render';
import { outputScanResults } from './report/renderOutput';
import { runScan } from './scan';
import type { CliGlobalOptions } from './scan';
import { baselineStatusMessage } from './threshold';
import {
  isConfigTrigger,
  isPathInside,
  isRelevantSourceEvent,
  isScannerOwnedPath,
  resolveExplicitWatchScope,
} from './watch-event-policy';

type WatchHandle = Pick<FSWatcher, 'close'>;

const POLL_IGNORED_DIRECTORIES = new Set([
  '.git',
  '.slopbrick',
  'node_modules',
  'coverage',
]);

function snapshotWorkspace(root: string, trackedPaths: readonly string[] = []): Map<string, string> {
  const snapshot = new Map<string, string>();

  const visit = (directory: string): void => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory() && POLL_IGNORED_DIRECTORIES.has(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(path);
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        const metadata = statSync(path);
        snapshot.set(path, `${metadata.mtimeMs}:${metadata.size}`);
      } catch {
        // The file may disappear between readdir and stat. The next poll
        // observes the stable state and emits a deletion if needed.
      }
    }
  };

  visit(root);
  for (const path of trackedPaths) {
    snapshot.set(path, fileSignature(path));
  }
  return snapshot;
}

function pollingIntervalMs(): number {
  const requested = Number(process.env.SLOPBRICK_WATCH_POLL_MS ?? 250);
  if (!Number.isFinite(requested)) return 250;
  return Math.min(5_000, Math.max(50, Math.floor(requested)));
}

function createPollingWatcher(
  root: string,
  onChange: (changedPath: string) => void,
  trackedPaths: readonly string[] = [],
): WatchHandle {
  let previous = snapshotWorkspace(root, trackedPaths);
  const timer = setInterval(() => {
    const next = snapshotWorkspace(root, trackedPaths);
    const changed = new Set<string>();
    for (const path of previous.keys()) {
      if (!next.has(path) || next.get(path) !== previous.get(path)) changed.add(path);
    }
    for (const path of next.keys()) {
      if (!previous.has(path)) changed.add(path);
    }
    previous = next;
    for (const path of changed) onChange(path);
  }, pollingIntervalMs());

  return {
    close: () => clearInterval(timer),
  };
}

function fileSignature(path: string): string {
  try {
    const metadata = statSync(path);
    return `${metadata.mtimeMs}:${metadata.size}`;
  } catch {
    return 'missing';
  }
}

function createFilePollingWatcher(
  path: string,
  onChange: () => void,
): WatchHandle {
  let previous = fileSignature(path);
  const timer = setInterval(() => {
    const next = fileSignature(path);
    if (next === previous) return;
    previous = next;
    onChange();
  }, pollingIntervalMs());

  return {
    close: () => clearInterval(timer),
  };
}

/**
 * Normalize an incremental watch result exactly as the full scan pipeline
 * does: directives remove findings and default-off findings remain auditable
 * with runtime severity `off`.
 *
 * Kept as a public compatibility boundary for callers and its focused unit
 * test even though the watch loop now favors correctness-preserving full
 * scans over hand-maintained incremental aggregation.
 */
export function normalizeWatchResult(
  result: FileScanResult,
  config: ResolvedConfig,
  options: CliGlobalOptions,
): void {
  normalizeFileResultForDisplayAndScore(result, config, options);
}

export async function watchProject(
  options: CliGlobalOptions,
  cwd: string,
  paths: string[],
): Promise<void> {
  let baselineMtime: number | undefined;
  let configPath = findConfigPath(cwd);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let debounceConfigChanged = false;
  let closed = false;
  let watcher: WatchHandle | undefined;
  let gitIndexWatcher: WatchHandle | undefined;
  let currentConfig: ResolvedConfig | undefined;
  const currentFiles = new Set<string>();
  const explicitScope = resolveExplicitWatchScope(cwd, paths);

  let fullScanInFlight = false;
  let fullScanQueued = false;
  let queuedConfigChanged = false;
  const gitIndexPath = options.staged || options.changed
    ? await getGitIndexPath(cwd)
    : undefined;

  // The recursive workspace watcher cannot observe a config inherited from
  // an ancestor directory. Be explicit about that UX boundary instead of
  // implying hot reload; source changes still pick it up on the next scan.
  if (configPath && !isPathInside(cwd, configPath) && !options.quiet) {
    logger.warn(
      `Watch limitation: config outside the workspace is not observed (${configPath}); restart watch after editing it.`,
    );
  }
  if (options.incremental && !options.quiet) {
    logger.warn(
      'Watch mode ignores --incremental so each change produces a complete repository report; rapid events are still debounced.',
    );
  }

  function getBaselineMtime(): number | undefined {
    try {
      return statSync(baselinePath(cwd)).mtimeMs;
    } catch {
      return undefined;
    }
  }

  process.once('SIGINT', () => {
    if (closed) return;
    closed = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    if (watcher) watcher.close();
    if (gitIndexWatcher) gitIndexWatcher.close();
    process.exit(0);
  });

  async function doScan(configChanged: boolean): Promise<void> {
    if (closed) return;

    const currentBaselineMtime = getBaselineMtime();
    const baselineChanged = currentBaselineMtime !== baselineMtime;
    baselineMtime = currentBaselineMtime;

    if (configChanged) configPath = findConfigPath(cwd);

    try {
      const { report, results, config } = await runScan(
        {
          ...options,
          // Watch already coalesces changes into correctness-preserving full
          // scans. Disabling the persisted incremental partition here keeps
          // the live source set complete after deletion/config changes.
          incremental: false,
          watch: true,
        },
        paths,
      );
      currentConfig = config;
      currentFiles.clear();
      for (const result of results) currentFiles.add(resolve(result.filePath));

      await outputScanResults(report, options, cwd);

      if (!options.quiet) {
        if (report.baseline) logger.info(baselineStatusMessage(report.baseline));
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

  async function requestFullScan(configChanged: boolean): Promise<void> {
    if (closed) return;
    if (fullScanInFlight) {
      fullScanQueued = true;
      queuedConfigChanged ||= configChanged;
      return;
    }

    fullScanInFlight = true;
    let nextConfigChanged = configChanged;
    try {
      while (!closed) {
        fullScanQueued = false;
        queuedConfigChanged = false;
        await doScan(nextConfigChanged);
        if (!fullScanQueued) break;
        nextConfigChanged = queuedConfigChanged;
      }
    } finally {
      fullScanInFlight = false;
    }
  }

  function isGitTrigger(changedPath: string): boolean {
    return gitIndexPath !== undefined && changedPath === gitIndexPath;
  }

  function scheduleFullScan(configChanged: boolean): void {
    debounceConfigChanged ||= configChanged;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      const nextConfigChanged = debounceConfigChanged;
      debounceConfigChanged = false;
      void requestFullScan(nextConfigChanged);
    }, WATCH_DEBOUNCE_MS);
  }

  function handleWorkspaceEvent(filename: string | Buffer): void {
    if (closed || !filename) return;

    const changedPath = resolve(cwd, filename.toString());
    const configChanged = isConfigTrigger(cwd, changedPath, configPath);
    const baselineChanged = changedPath === baselinePath(cwd);
    const gitChanged = isGitTrigger(changedPath);

    if (configChanged || baselineChanged || gitChanged) {
      scheduleFullScan(configChanged);
      return;
    }

    // Classify generated/noisy events before touching the debounce timer so
    // a scan's own writes cannot postpone or queue another scan.
    if (isScannerOwnedPath(cwd, changedPath, options, currentConfig)) return;
    if (!isRelevantSourceEvent({
      cwd,
      changedPath,
      currentFiles,
      explicitScope,
      config: currentConfig,
    })) return;

    scheduleFullScan(false);
  }

  function installPollingFallback(reason: unknown): void {
    if (closed) return;
    watcher?.close();
    watcher = createPollingWatcher(
      cwd,
      (changedPath) => handleWorkspaceEvent(relative(cwd, changedPath)),
      gitIndexPath ? [gitIndexPath] : [],
    );
    if (!options.quiet) {
      logger.warn(
        `Recursive file watch unavailable (${formatErrorMessage(reason)}); using polling fallback every ${pollingIntervalMs()}ms.`,
      );
    }
  }

  baselineMtime = getBaselineMtime();
  await requestFullScan(false);

  if (closed) return;

  try {
    const nativeWatcher = watch(cwd, { recursive: true }, (_eventType, filename) => {
      handleWorkspaceEvent(filename ?? '');
    });
    watcher = nativeWatcher;
    nativeWatcher.on('error', installPollingFallback);
  } catch (error) {
    installPollingFallback(error);
  }

  // In linked worktrees, submodules, and subdirectory workspaces, Git's index
  // can live outside the recursively watched workspace. Watch its containing
  // directory and filter to the canonical path returned by Git itself.
  if (gitIndexPath && !isPathInside(cwd, gitIndexPath)) {
    const gitIndexDirectory = dirname(gitIndexPath);
    try {
      const nativeGitIndexWatcher = watch(gitIndexDirectory, (_eventType, filename) => {
        if (closed || !filename) return;
        if (resolve(gitIndexDirectory, filename.toString()) === gitIndexPath) {
          scheduleFullScan(false);
        }
      });
      gitIndexWatcher = nativeGitIndexWatcher;
      nativeGitIndexWatcher.on('error', (err) => {
        nativeGitIndexWatcher.close();
        gitIndexWatcher = createFilePollingWatcher(gitIndexPath, () => scheduleFullScan(false));
        if (!options.quiet) {
          logger.warn(`Git index watch unavailable (${formatErrorMessage(err)}); using polling fallback.`);
        }
      });
    } catch (err) {
      gitIndexWatcher = createFilePollingWatcher(gitIndexPath, () => scheduleFullScan(false));
      if (!options.quiet) {
        logger.warn(`Git index watch unavailable (${formatErrorMessage(err)}); using polling fallback.`);
      }
    }
  }
}
