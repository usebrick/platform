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

export async function discoverFiles(cwd: string, config: ResolvedConfig): Promise<string[]> {
  const include = config.include.map((pattern) => resolve(cwd, pattern));
  const raw = await globby(include, { absolute: true, onlyFiles: true });

  // Partition: known extensions vs extension-less files
  const known: string[] = [];
  const extensionless: string[] = [];
  for (const file of raw) {
    if (extname(file) === '') {
      extensionless.push(file);
    } else {
      known.push(file);
    }
  }

  // Sniff extension-less files and add them to the known list with synthetic paths
  // so downstream parsers see them as the right type. Skip if a same-basename
  // sibling with a real extension already exists (no double-scan).
  for (const file of extensionless) {
    if (hasExtendedSibling(file)) continue;
    const ext = sniffExtension(file);
    if (ext) known.push(file);
  }

  const filtered = known.filter((file) => {
    // Allow extension-less files (they'll be routed by sniffExtension result)
    const ext = extname(file);
    if (ext === '') return true; // already sniffed and accepted above
    if (!ALL_SOURCE_EXTENSIONS.has(ext)) return false;
    const rel = relative(cwd, file).split(sep).join('/');
    if (config.exclude.some((pattern) => minimatch(rel, pattern))) {
      return false;
    }
    return true;
  });

  return Array.from(new Set(filtered)).sort();
}
