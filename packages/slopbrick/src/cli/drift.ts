// Constitution drift detection (CLI surface for `slopbrick drift`).
//
// Wraps the per-file check in src/mcp/patterns.ts and aggregates
// violations across the project so CI / pre-commit / editors
// without an MCP-aware agent can still enforce declared
// constitution.
//
//   runDrift(cwd, options) -> DriftResult
//   formatDrift(result, { json }) -> string
//
// Exit codes (set by the program.ts action, not here):
//   0  — no violations (or no constitution declared)
//   1  — at least one violation
//   2  — fatal error (config not loadable, IO failure)

import { readFileSync } from 'node:fs';
import { basename, relative } from 'node:path';
import { discoverFiles } from '../engine/discover.js';
import { checkFileConstitution } from '../mcp/patterns.js';
import type { Constitution, ResolvedConfig } from '../types.js';

export interface DriftOptions {
  /** Cap on files scanned. Defaults to 1000 — drift is cheap. */
  maxFiles?: number;
}

export interface DriftViolation extends Record<string, unknown> {
  /** Absolute file path. */
  file: string;
  /** Path relative to cwd (for display). */
  relPath: string;
  /** Which constitution field was violated. */
  category: string;
  /** The imported specifier that triggered the violation. */
  import: string;
  /** Values declared in slopbrick.config.mjs for this field. */
  declared: string[];
  /** Human-readable explanation. */
  message: string;
}

export interface DriftResult {
  /** How many files were scanned. */
  scannedFiles: number;
  /** How many files had at least one violation. */
  filesWithViolations: number;
  /** Total violations across all files. */
  totalViolations: number;
  /** Counts grouped by category, useful for dashboards. */
  byCategory: Record<string, number>;
  /** Per-file violation lists, sorted by relPath. */
  byFile: DriftViolation[];
  /** 'declared' if user set constitution, 'detected' if auto-only, 'none' if absent. */
  conventionSource: 'declared' | 'detected' | 'none';
  /** Echo of the resolved constitution (or undefined). */
  constitution: Constitution | undefined;
}

/**
 * Scan the project for files whose imports violate declared constitution.
 * Returns an aggregate report; never throws on per-file errors — a
 * single unreadable file is logged and skipped.
 */
export async function runDrift(
  cwd: string,
  config: ResolvedConfig,
  options: DriftOptions = {},
): Promise<DriftResult> {
  const maxFiles = options.maxFiles ?? 1000;
  const allFiles = await discoverFiles(cwd, config);
  const limited = allFiles.slice(0, maxFiles);

  const byFile: DriftViolation[] = [];
  const byCategory: Record<string, number> = {};
  let filesWithViolations = 0;

  for (const absPath of limited) {
    let source: string;
    try {
      source = readFileSync(absPath, 'utf-8');
    } catch {
      continue;
    }
    const result = checkFileConstitution(source, config.constitution);
    if (result.violations.length === 0) continue;
    filesWithViolations += 1;

    for (const v of result.violations) {
      byCategory[v.category] = (byCategory[v.category] ?? 0) + 1;
      byFile.push({
        file: absPath,
        relPath: relative(cwd, absPath),
        category: v.category,
        import: v.import,
        declared: v.declared,
        message: v.message,
      });
    }
  }

  byFile.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));

  return {
    scannedFiles: limited.length,
    filesWithViolations,
    totalViolations: byFile.length,
    byCategory,
    byFile,
    conventionSource: deriveSource(config.constitution),
    constitution: config.constitution,
  };
}

function deriveSource(c: Constitution | undefined): 'declared' | 'detected' | 'none' {
  if (!c) return 'none';
  // Heuristic: a constitution with exactly the auto-detected defaults is
  // "detected"; anything else (including explicit empty arrays) is
  // "declared". Today we can't distinguish precisely without flagging
  // each field, so we default to "declared" whenever the field is
  // present — explicit empty arrays are intentional declarations.
  return 'declared';
}

/**
 * Render the drift result for terminal / machine consumption.
 */
export function formatDrift(result: DriftResult, opts: { json?: boolean } = {}): string {
  if (opts.json) {
    return JSON.stringify(result, null, 2);
  }

  const lines: string[] = [];
  lines.push('Constitution drift report');
  lines.push('');
  lines.push('  Scanned files:          ' + result.scannedFiles);
  lines.push('  Files with violations:  ' + result.filesWithViolations);
  lines.push('  Total violations:       ' + result.totalViolations);
  lines.push('  Constitution source:      ' + result.conventionSource);
  if (result.constitution) {
    lines.push('');
    lines.push('  Declared constitution:');
    for (const field of [
      'stateManagement',
      'dataFetching',
      'uiLibrary',
      'forms',
      'styling',
      'routing',
    ] as const) {
      const vals = result.constitution[field];
      if (vals && vals.length > 0) {
        lines.push('    ' + field + ': ' + vals.join(', '));
      }
    }
  } else {
    lines.push('');
    lines.push('  No constitution declared. Add a `constitution` block to slopbrick.config.mjs');
    lines.push('  to enable drift detection.');
  }

  if (result.totalViolations === 0) {
    if (result.constitution) {
      lines.push('');
      lines.push('  ✓ No constitution violations.');
    }
    return lines.join('\n');
  }

  // Category breakdown
  const catEntries = Object.entries(result.byCategory).sort((a, b) => b[1] - a[1]);
  if (catEntries.length > 0) {
    lines.push('');
    lines.push('  Violations by category:');
    for (const [cat, count] of catEntries) {
      lines.push('    ' + cat.padEnd(20) + ' ' + count);
    }
  }

  // Per-file detail
  lines.push('');
  lines.push('  Violations:');
  let currentFile = '';
  for (const v of result.byFile) {
    if (v.relPath !== currentFile) {
      currentFile = v.relPath;
      lines.push('');
      lines.push('  ' + currentFile);
    }
    lines.push('    [' + v.category + '] ' + v.message);
  }
  return lines.join('\n');
}

/**
 * Helper used by tests + downstream consumers: derive a stable exit
 * code from a DriftResult without coupling the test to process.exit.
 */
export function driftExitCode(result: DriftResult): 0 | 1 {
  return result.totalViolations > 0 ? 1 : 0;
}

// Re-export for callers that need to display the path basename.
export function displayName(relPath: string): string {
  return basename(relPath);
}