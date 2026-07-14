import { globby } from 'globby';
import { minimatch } from 'minimatch';
import { resolve, extname, relative, sep, basename, dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import type { ResolvedConfig } from '../types';
import {
  backendSourceExtensions,
  frontendSourceExtensions,
  supportedExtensions,
} from './language-support.js';
import { sniffSourceExtension } from './source-sniff.js';

export { sniffSourceExtension } from './source-sniff.js';

export const SOURCE_EXTENSIONS = new Set(frontendSourceExtensions());

/**
 * v0.9.2 — Backend language extensions. Files with these extensions are
 * discovered alongside frontend files but the rule engine skips them
 * (the existing AST visitors target JS/TSX/Vue/Svelte/Astro/HTML only).
 * `buildPatternInventory` lazily imports the per-language visitor when
 * it encounters these files and extracts service/route/ormModel
 * patterns from them — that's where backend drift detection will
 * surface in the cross-file lens.
 *
 * v0.14.0 — added 8 new languages: Swift, Kotlin, Dart, Rust, C++,
 * Java, Ruby, PHP. Each has a corresponding visitor in
 * `src/engine/visitors/{lang}.ts`. The visitor contract is the same
 * one defined for Python + Go: `extractXxxPatterns(filePath, source) →
 * { service, route, ormModel }`.
 */
export const BACKEND_EXTENSIONS = new Set(backendSourceExtensions());

/** Union used by the path-arg expansion in `slopbrick scan <dir>`. */
export const ALL_SOURCE_EXTENSIONS: ReadonlySet<string> = new Set([
  ...supportedExtensions(),
]);

/**
 * Aggregate-only selection evidence for files that an include glob actually
 * observed.  It deliberately says nothing about paths an include glob never
 * returned (including dotfiles and gitignore policy): those populations are
 * not available to the scanner.
 */
export interface SelectionAccounting {
  observedCandidates: number;
  selected: number;
  excluded: {
    configExclude: number;
    unsupportedFileType: number;
    extensionlessDuplicate: number;
    outsideWorkspace: number;
    gitScope: number;
  };
}

export interface DiscoveryResult {
  files: string[];
  selectionAccounting: SelectionAccounting;
}

/**
 * Returns whether an absolute candidate path is excluded by the repository's
 * self-scan policy. Kept at the selection boundary so every scanner can apply
 * the same workspace-relative, dot-aware glob semantics without importing the
 * worker runtime.
 */
export function isExcludedBySelfScan(
  filePath: string,
  cwd: string,
  excludePaths: readonly string[] | undefined,
): boolean {
  if (!excludePaths || excludePaths.length === 0) return false;
  const rel = relative(cwd, filePath).split(sep).join('/');
  return excludePaths.some((pattern) => minimatch(rel, pattern, { dot: true }));
}

/**
 * Sniff the first 512 bytes of a file to guess its source-extension-less type.
 * Returns a synthetic extension (e.g. ".tsx") if the file looks like a known
 * source format, otherwise null. Used to scan files like the slopbrick
 * baseline corpus, where files are stripped of their extensions.
 *
 * Detection order is most-specific to least-specific.
 */
export function sniffExtension(filePath: string): string | null {
  let source: Buffer;
  try {
    source = readFileSync(filePath);
  } catch {
    return null;
  }
  return sniffSourceExtension(source);
}

/**
 * If a sibling file with the same basename + .tsx (or .ts, etc.) exists,
 * treat the current file as already covered. This avoids double-scanning
 * when both an extension-less file and a properly-extended one exist.
 */
function hasExtendedSibling(filePath: string): boolean {
  const dir = dirname(filePath);
  const base = basename(filePath);
  for (const ext of SOURCE_EXTENSIONS) {
    try {
      // Use existsSync-style check via statSync
      const { statSync } = require('node:fs') as typeof import('node:fs');
      statSync(join(dir, base + ext));
      return true;
    } catch {
      // not present, continue
    }
  }
  return false;
}

export function classifyDiscoveryCandidates(
  cwd: string,
  candidates: readonly string[],
  config: ResolvedConfig,
): DiscoveryResult {
  const observed = Array.from(new Set(candidates)).sort();
  const excluded: SelectionAccounting['excluded'] = {
    configExclude: 0,
    unsupportedFileType: 0,
    extensionlessDuplicate: 0,
    outsideWorkspace: 0,
    gitScope: 0,
  };
  const files: string[] = [];

  for (const file of observed) {
    const rel = relative(cwd, file).split(sep).join('/');
    // A configured exclusion is the owner's explicit policy. It wins over
    // type classification so each observed candidate has one reason only.
    if (config.exclude.some((pattern) => minimatch(rel, pattern, { dot: true }))) {
      excluded.configExclude += 1;
      continue;
    }

    const ext = extname(file).toLowerCase();
    if (ext === '') {
      if (hasExtendedSibling(file)) {
        excluded.extensionlessDuplicate += 1;
        continue;
      }
      if (!sniffExtension(file)) {
        excluded.unsupportedFileType += 1;
        continue;
      }
      files.push(file);
      continue;
    }

    if (!ALL_SOURCE_EXTENSIONS.has(ext)) {
      excluded.unsupportedFileType += 1;
      continue;
    }
    files.push(file);
  }

  return {
    files,
    selectionAccounting: {
      observedCandidates: observed.length,
      selected: files.length,
      excluded,
    },
  };
}

export async function discoverFilesWithDiagnostics(cwd: string, config: ResolvedConfig): Promise<DiscoveryResult> {
  const include = config.include.map((pattern) => resolve(cwd, pattern));
  const candidates = await globby(include, { absolute: true, onlyFiles: true });
  return classifyDiscoveryCandidates(cwd, candidates, config);
}

/** Backward-compatible discovery facade for existing callers. */
export async function discoverFiles(cwd: string, config: ResolvedConfig): Promise<string[]> {
  return (await discoverFilesWithDiagnostics(cwd, config)).files;
}
