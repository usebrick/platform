import { statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { minimatch } from 'minimatch';

import { DEFAULT_CONFIG } from '../config';
import { classifyDiscoveryCandidates } from '../engine/discover';
import type { ResolvedConfig } from '../types';
import type { CliGlobalOptions } from './types';

const CONFIG_FILENAMES = new Set([
  'slopbrick.config.mjs',
  'slopbrick.config.cjs',
  'slopbrick.config.js',
]);

export interface ExplicitWatchScope {
  readonly restricted: boolean;
  readonly files: ReadonlySet<string>;
  readonly directories: readonly string[];
}

export function normalizedRelativePath(cwd: string, filePath: string): string {
  return relative(cwd, filePath).split(sep).join('/');
}

export function isPathInside(directoryPath: string, filePath: string): boolean {
  const rel = relative(directoryPath, filePath);
  return rel !== '' && !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`);
}

export function resolveExplicitWatchScope(
  cwd: string,
  paths: readonly string[],
): ExplicitWatchScope {
  const files = new Set<string>();
  const directories: string[] = [];
  for (const filePath of paths) {
    const absolutePath = resolve(cwd, filePath);
    try {
      if (statSync(absolutePath).isDirectory()) {
        directories.push(absolutePath);
      } else {
        files.add(absolutePath);
      }
    } catch {
      // A missing explicit path is treated as a direct file so creating it
      // later remains observable instead of being filtered by include globs.
      files.add(absolutePath);
    }
  }
  return { restricted: paths.length > 0, files, directories };
}

export function isConfigTrigger(
  cwd: string,
  changedPath: string,
  configPath: string | undefined,
): boolean {
  if (changedPath === configPath) return true;
  return CONFIG_FILENAMES.has(normalizedRelativePath(cwd, changedPath));
}

export function isScannerOwnedPath(
  cwd: string,
  changedPath: string,
  options: CliGlobalOptions,
  config: ResolvedConfig | undefined,
): boolean {
  const rel = normalizedRelativePath(cwd, changedPath);
  if (rel === '.slopbrick' || rel.startsWith('.slopbrick/')) return true;
  if (rel === '.git' || rel.startsWith('.git/')) return true;

  const incrementalCache = resolve(options.cachePath ?? '.slopbrick-cache.json');
  if (changedPath === incrementalCache || changedPath === `${incrementalCache}.tmp`) {
    return true;
  }
  const reportOutputs = [options.json, options.html].filter((path): path is string => typeof path === 'string');
  if (reportOutputs.some((path) => {
    const outputPath = resolve(path);
    return changedPath === outputPath || (changedPath.startsWith(`${outputPath}.`) && changedPath.endsWith('.tmp'));
  })) return true;

  const refreshesSnippets = Boolean(options.autoRefreshSnippets) ||
    Boolean((config as { autoRefreshSnippets?: boolean } | undefined)?.autoRefreshSnippets);
  return refreshesSnippets &&
    (changedPath === resolve(cwd, 'AGENTS.md') || changedPath === resolve(cwd, 'CLAUDE.md'));
}

interface RelevantSourceEventInput {
  cwd: string;
  changedPath: string;
  currentFiles: ReadonlySet<string>;
  explicitScope: ExplicitWatchScope;
  config: ResolvedConfig | undefined;
}

export function isRelevantSourceEvent(input: RelevantSourceEventInput): boolean {
  if (input.currentFiles.has(input.changedPath)) return true;
  if (input.explicitScope.files.has(input.changedPath)) return true;

  const config = input.config ?? DEFAULT_CONFIG;
  const classified = classifyDiscoveryCandidates(input.cwd, [input.changedPath], config);
  if (classified.files.length === 0) return false;

  const rel = normalizedRelativePath(input.cwd, input.changedPath);
  if (!config.include.some((pattern) => minimatch(rel, pattern))) return false;
  if (!input.explicitScope.restricted) return true;
  return input.explicitScope.directories.some(
    (directoryPath) => isPathInside(directoryPath, input.changedPath),
  );
}
