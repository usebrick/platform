// Business Logic Intelligence (CLI surface for `slopbrick business-logic`).
//
// Phase 7 of the 0.7.0 roadmap. Surfaces naming and structural
// anti-patterns in three categories — pricing, validation, formatting —
// where AI-generated code consistently makes the same mistakes. Wraps
// the per-file analysis in src/engine/business-logic.ts and aggregates
// the issues into a project-wide 0-100 score.
//
//   runBusinessLogicScan(cwd, config, options) -> BusinessLogicScanResult
//   formatBusinessLogicScan(result, { json?, markdown? }) -> string
//   businessLogicExitCode(result) -> 0
//
// Exit codes (set by the program.ts action, not here):
//   0 — always (informational; matches `architecture` behavior)
//   2 — fatal error (config / IO)
//
// Score formula:
//   issueWeight = pricing*3 + validation*2 + formatting*1
//   score       = clamp(0, 100, 100 - (issueWeight / scannedFiles) * 100)
// Edge cases:
//   scannedFiles == 0 → score = 100 (no files = no issues)
//   issueWeight >= scannedFiles → score = 0 (capped; project is drowning)

import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { discoverFiles } from '../engine/discover.js';
import { analyzeBusinessLogic, buildBusinessLogicReport } from '../engine/business-logic.js';
import type { BusinessLogicIssue, BusinessLogicReport } from '../engine/business-logic.js';
import type { ResolvedConfig } from '../types';

export interface BusinessLogicScanOptions {
  /** Cap on files scanned. Defaults to 500 — matches `architecture`. */
  maxFiles?: number;
}

export interface BusinessLogicScanResult {
  /** Re-export of the typed report so callers can render it. */
  report: BusinessLogicReport;
  /** Per-issue list (same as `report.issues`, but exposed at the top
   *  level for callers that don't want to traverse `report`). */
  issues: BusinessLogicIssue[];
  /** The files actually scanned, absolute paths. */
  scannedFilePaths: string[];
}

export type BusinessLogicFormat = 'text' | 'json' | 'markdown';

/**
 * Scan the project for business-logic anti-patterns and return an
 * aggregate score + per-issue list. Never throws on per-file errors —
 * a single unreadable file is silently skipped. Throws only on fatal
 * configuration errors.
 */
export async function runBusinessLogicScan(
  cwd: string,
  config: ResolvedConfig,
  options: BusinessLogicScanOptions = {},
): Promise<BusinessLogicScanResult> {
  const maxFiles = options.maxFiles ?? 500;
  const allFiles = await discoverFiles(cwd, config);
  const limited = allFiles.slice(0, maxFiles);

  const issues: BusinessLogicIssue[] = [];
  const scannedFilePaths: string[] = [];

  for (const absPath of limited) {
    let source: string;
    try {
      source = readFileSync(absPath, 'utf-8');
    } catch {
      continue;
    }
    scannedFilePaths.push(absPath);
    const fileIssues = analyzeBusinessLogic(source, absPath);
    for (const issue of fileIssues) {
      // Re-stamp each issue with the rel path so JSON output is portable.
      issues.push({
        ...issue,
        filePath: relative(cwd, absPath) || absPath,
      });
    }
  }

  const report = buildBusinessLogicReport(issues, scannedFilePaths.length);
  return { report, issues, scannedFilePaths };
}

/**
 * Render the scan result for terminal / machine consumption. The
 * `format` switch is the source of truth — `json` and `markdown` are
 * selected via the `format` flag, not by passing per-format options.
 */
export function formatBusinessLogicScan(
  result: BusinessLogicScanResult,
  opts: { format?: BusinessLogicFormat } = {},
): string {
  const format: BusinessLogicFormat = opts.format ?? 'text';
  if (format === 'json') return JSON.stringify(result.report, null, 2);
  if (format === 'markdown') return formatMarkdown(result);
  return formatText(result);
}

function formatText(result: BusinessLogicScanResult): string {
  const { report } = result;
  const lines: string[] = [];
  lines.push(report.headline);
  lines.push('');
  lines.push(`  Scanned files: ${report.scannedFiles}`);

  if (report.issues.length === 0) {
    lines.push('  No business-logic anti-patterns detected. ✓');
    return lines.join('\n');
  }

  const categories: Array<keyof typeof report.byCategory> = [
    'pricing',
    'validation',
    'formatting',
  ];
  for (const cat of categories) {
    const list = report.issues.filter((i) => i.category === cat);
    if (list.length === 0) continue;
    const weight = report.byCategory[cat] * weightFor(cat);
    lines.push('');
    lines.push(`  ${capitalize(cat)} (${list.length} issue${list.length === 1 ? '' : 's'}, weight ${weight}):`);
    for (const issue of list) {
      const location = `${issue.filePath}:${issue.line}`;
      lines.push(`    ${location.padEnd(50)}  ${issue.ruleId}`);
      lines.push(`        ${issue.message}`);
    }
  }

  if (report.scannedFiles > 0) {
    const pct = ((report.weight / report.scannedFiles) * 100).toFixed(1);
    lines.push('');
    lines.push(`  Total weight: ${report.weight} / ${report.scannedFiles} files = ${pct}% → score ${report.score}`);
  }

  return lines.join('\n');
}

function formatMarkdown(result: BusinessLogicScanResult): string {
  const { report } = result;
  const lines: string[] = [];
  lines.push(`## Business Logic Coherence: ${report.score}/100`);
  lines.push('');
  lines.push('| Category | Issues | Weight |');
  lines.push('|----------|--------|--------|');
  lines.push(`| Pricing | ${report.byCategory.pricing} | ${report.byCategory.pricing * 3} |`);
  lines.push(`| Validation | ${report.byCategory.validation} | ${report.byCategory.validation * 2} |`);
  lines.push(`| Formatting | ${report.byCategory.formatting} | ${report.byCategory.formatting * 1} |`);
  lines.push(`| **Total** | **${report.issues.length}** | **${report.weight}** |`);
  lines.push('');

  const categories: Array<keyof typeof report.byCategory> = [
    'pricing',
    'validation',
    'formatting',
  ];
  for (const cat of categories) {
    const list = report.issues.filter((i) => i.category === cat);
    if (list.length === 0) continue;
    lines.push(`### ${capitalize(cat)}`);
    lines.push('');
    for (const issue of list) {
      lines.push(`- \`${issue.filePath}:${issue.line}\` — ${issue.message}`);
    }
    lines.push('');
  }

  if (report.scannedFiles > 0) {
    const pct = ((report.weight / report.scannedFiles) * 100).toFixed(1);
    lines.push(`---`);
    lines.push(`*Scanned ${report.scannedFiles} files. Total weight: ${report.weight} (${pct}%) → score ${report.score}.*`);
  }

  return lines.join('\n');
}

/**
 * Pure helper: derive a stable exit code from a scan result.
 * Always 0 in v1 — informational; mirrors `architecture`.
 */
export function businessLogicExitCode(result: BusinessLogicScanResult): 0 {
  return 0;
}

// Re-export the report type so consumers can type-annotate without
// reaching into engine/business-logic.
export type { BusinessLogicReport } from '../engine/business-logic.js';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function weightFor(cat: 'pricing' | 'validation' | 'formatting'): number {
  if (cat === 'pricing') return 3;
  if (cat === 'validation') return 2;
  return 1;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}