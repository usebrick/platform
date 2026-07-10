import { globby } from 'globby';
import { minimatch } from 'minimatch';
import { resolve, extname, relative, sep, basename, dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import type { ResolvedConfig } from '../types';

export const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte', '.astro', '.html']);

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
export const BACKEND_EXTENSIONS = new Set([
  '.py',
  '.go',
  // v0.14.0
  '.swift',
  '.kt',
  '.kts',
  '.dart',
  '.rs',
  '.cpp',
  '.cc',
  '.cxx',
  '.c',
  '.h',
  '.hpp',
  '.hxx',
  '.java',
  '.rb',
  '.php',
  // C# is supported by the cs/* regex rules. Keep it discoverable so
  // workspace/path scans do not silently omit files that the registry can
  // analyze.
  '.cs',
]);

/** Union used by the path-arg expansion in `slopbrick scan <dir>`. */
export const ALL_SOURCE_EXTENSIONS: ReadonlySet<string> = new Set([
  ...SOURCE_EXTENSIONS,
  ...BACKEND_EXTENSIONS,
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
 * Sniff the first 512 bytes of a file to guess its source-extension-less type.
 * Returns a synthetic extension (e.g. ".tsx") if the file looks like a known
 * source format, otherwise null. Used to scan files like the slopbrick
 * baseline corpus, where files are stripped of their extensions.
 *
 * Detection order is most-specific to least-specific.
 */
export function sniffExtension(filePath: string): string | null {
  let head: string;
  try {
    const buf = readFileSync(filePath);
    head = buf.subarray(0, 512).toString('utf8').replace(/^\uFEFF/, '');
  } catch {
    return null;
  }

  // Vue SFC: <template> or <script setup>
  if (/<template[\s>]/i.test(head) && /<script[\s>]/i.test(head)) return '.vue';
  if (/^<script\s+setup/i.test(head)) return '.vue';

  // Svelte: <script> ... </script> at top with svelte-specific syntax
  if (/<script[\s>]/i.test(head) && /let\s+\w+\s*:\s*\w+/i.test(head)) return '.svelte';

  // Astro: ---
  if (/^---\s*$/m.test(head) && /<[A-Z][\w]*[\s>]/m.test(head)) return '.astro';

  // HTML: starts with <!DOCTYPE or <html
  if (/^<!doctype\s+html/i.test(head) || /^<html[\s>]/i.test(head)) return '.html';

  // JSX/TSX: contains <Component or <Component.Props>
  if (/<[A-Z][\w.]*[\s/>]/.test(head) && /\bimport\s+/.test(head)) return '.tsx';

  // TS: type annotations like `: string`, `interface Foo`, `type Bar =`
  if (/\b(interface\s+\w+|type\s+\w+\s*=)\b/.test(head)) return '.ts';

  // JS: import or export statements
  if (/^(import|export)\s+/m.test(head) || /\b(const|let|var)\s+\w+\s*=/.test(head)) return '.js';

  return null;
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
