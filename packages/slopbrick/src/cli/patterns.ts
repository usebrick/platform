// Pattern Fragmentation CLI surface (Phase 9 / 0.7.0).
//
// `slopbrick patterns [--max-files <n>] [--format text|json|markdown]`.
//
// Aggregates cross-file pattern detection into a 0-100 score that
// surfaces AI-induced pattern entropy (modal sprawl, auth sprawl,
// card sprawl, etc.) plus a "doNotCreate" list that future MCP
// `slop_suggest` calls will consume to refuse new variants of an
// already-canonical pattern.
//
//   runPatternsScan(cwd, config, options) -> PatternScanResult
//   formatPatternsReport(result, { format }) -> string
//   patternsExitCode(result) -> 0
//
// Exit codes (set by the program.ts action, not here):
//   0 — always (informational; matches `architecture` + `business-logic` v1)
//   2 — fatal error (config / IO)

import { buildPatternFragmentation, PATTERN_CATEGORIES, PATTERN_WEIGHTS } from '../engine/patterns.js';
import type {
  PatternCategory,
  PatternCategoryStats,
  PatternFragmentationReport,
} from '../engine/patterns.js';
import type { ResolvedConfig } from '../types';

export type PatternsFormat = 'text' | 'json' | 'markdown';

export interface PatternsScanOptions {
  /** Cap on files scanned. Defaults to 500. */
  maxFiles?: number;
  /** Output format. Defaults to 'text'. */
  format?: PatternsFormat;
}

/**
 * Thin wrapper around `PatternFragmentationReport` so the CLI can
 * surface the format choice alongside the data. The underlying
 * `report` field is the canonical payload (what the MCP will read).
 */
export interface PatternScanResult {
  report: PatternFragmentationReport;
  /** When the scan ran. */
  generatedAt: string;
  /** The format the user requested. */
  format: PatternsFormat;
}

/**
 * Human-readable category labels for the text + markdown output.
 * Order matches PATTERN_CATEGORIES so the formatter can iterate
 * in lockstep.
 */
const CATEGORY_LABELS: Record<PatternCategory, string> = {
  modal: 'Modal systems',
  button: 'Button variants',
  auth: 'Auth patterns',
  api: 'API clients',
  state: 'State libraries',
  forms: 'Form libraries',
  toast: 'Toast systems',
  card: 'Card variants',
};

/**
 * Singular label for the doNotCreate message (matches the convention
 * used in the JSON output).
 */
const CATEGORY_DO_NOT_CREATE: Record<PatternCategory, string> = {
  modal: 'modal',
  button: 'button variant',
  auth: 'auth pattern',
  api: 'api-client module',
  state: 'state library',
  forms: 'form library',
  toast: 'toast system',
  card: 'card variant',
};

/**
 * Run the pattern fragmentation scan. Returns a fully populated
 * `PatternScanResult`. Never throws on per-file errors — a single
 * unreadable file is silently skipped by the underlying engine.
 */
export async function runPatternsScan(
  cwd: string,
  config: ResolvedConfig,
  options: PatternsScanOptions = {},
): Promise<PatternScanResult> {
  const maxFiles = options.maxFiles ?? 500;
  const format: PatternsFormat = options.format ?? 'text';

  const report = await buildPatternFragmentation(cwd, config, maxFiles);
  return {
    report,
    format,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Render the scan result for the terminal (text), machine consumption
 * (json), or documentation (markdown). The `format` switch on the
 * result is the source of truth — callers don't need to pass an
 * options object.
 */
export function formatPatternsReport(result: PatternScanResult): string {
  switch (result.format) {
    case 'json':
      return formatJson(result.report);
    case 'markdown':
      return formatMarkdown(result.report);
    default:
      return formatText(result.report);
  }
}

function formatText(report: PatternFragmentationReport): string {
  const lines: string[] = [];
  lines.push(report.headline);
  lines.push('');
  lines.push(
    `  Scanned: ${report.scannedFiles} files · ${report.identifierCount} identifiers · ${report.uxPatternCount} UX patterns found`,
  );
  lines.push('');

  // Per-category table. Always shows all 8 categories so the user
  // sees "we checked all 8 — here's the breakdown" even on a clean
  // project.
  for (const cat of PATTERN_CATEGORIES) {
    const stats = report.byCategory[cat];
    const label = CATEGORY_LABELS[cat].padEnd(20);
    const count = String(stats.count).padStart(2);
    const baseline = String(stats.baseline).padStart(1);
    // v0.42.0 (user-review fix): '✓ clean' is misleading when the
    // count is 0 (no implementations to be over baseline). Distinguish
    // 3 cases: count=0 (no implementations), 0<count<=baseline (within
    // baseline), count>baseline (excess).
    const excess: string = stats.excess > 0
      ? `⚠ +${stats.excess} over`
      : stats.count === 0
        ? '✓ none'
        : '✓ within baseline';
    lines.push(`  ${label} ${count} implementations  (baseline ${baseline})  ${excess}`);
  }

  // Recommendations (doNotCreate) — only show when there's at least one.
  if (report.doNotCreate.length > 0) {
    lines.push('');
    lines.push('  Recommendations (doNotCreate):');
    for (const msg of report.doNotCreate) {
      lines.push(`    ✗ ${msg}`);
    }
  }

  // Top duplicated patterns sorted by file count (descending). The
  // sort uses `count` so the most-fragmented category surfaces first.
  const ranked = PATTERN_CATEGORIES.map((cat) => report.byCategory[cat])
    .filter((s) => s.count > 1)
    .sort((a, b) => b.count - a.count);

  if (ranked.length > 0) {
    lines.push('');
    lines.push('  Top duplicated patterns (sorted by file count):');
    for (const stats of ranked) {
      // Find the category key for this stats object so the
      // output shows the canonical name.
      const cat = PATTERN_CATEGORIES.find((c) => report.byCategory[c] === stats);
      const tag = cat ? `[${cat.padEnd(5)}]` : '[     ]';
      lines.push(`    ${tag} ${stats.patterns.join(', ')}`);
    }
  }

  return lines.join('\n');
}

function formatJson(report: PatternFragmentationReport): string {
  // The JSON output uses `Record<PatternCategory, ...>` directly.
  // We strip the `weight` field from the JSON so the surface is
  // identical to the spec example (and so MCP consumers don't have
  // to know about PATTERN_WEIGHTS).
  const byCategory: Record<string, unknown> = {};
  for (const cat of PATTERN_CATEGORIES) {
    const stats = report.byCategory[cat];
    byCategory[cat] = {
      count: stats.count,
      baseline: stats.baseline,
      excess: stats.excess,
      weight: stats.weight,
      patterns: stats.patterns,
    };
  }
  return JSON.stringify(
    {
      patternFragmentation: report.score,
      scannedFiles: report.scannedFiles,
      identifierCount: report.identifierCount,
      uxPatternCount: report.uxPatternCount,
      byCategory,
      doNotCreate: report.doNotCreate,
    },
    null,
    2,
  );
}

function formatMarkdown(report: PatternFragmentationReport): string {
  const lines: string[] = [];
  lines.push(`## Pattern Fragmentation: ${report.score}/100`);
  lines.push('');
  lines.push(`*Scanned ${report.scannedFiles} files · ${report.uxPatternCount} UX patterns found across 8 categories.*`);
  lines.push('');
  lines.push('| Category | Count | Baseline | Excess |');
  lines.push('|----------|-------|----------|--------|');
  for (const cat of PATTERN_CATEGORIES) {
    const stats = report.byCategory[cat];
    const label = CATEGORY_LABELS[cat];
    // Same 3-case handling as the text formatter above.
    const excess: string = stats.excess > 0
      ? `+${stats.excess}`
      : stats.count === 0
        ? '—'
        : '·';
    lines.push(`| ${label} | ${stats.count} | ${stats.baseline} | ${excess} |`);
  }

  if (report.doNotCreate.length > 0) {
    lines.push('');
    lines.push('### Recommendations');
    for (const msg of report.doNotCreate) {
      // Re-shape the message: "New X — already have N (p1, p2, ...)"
      // becomes "Don't create new X — consolidate to one canonical
      // implementation."
      lines.push(`- ✗ ${msg}`);
    }
  }

  const ranked = PATTERN_CATEGORIES.map((cat) => report.byCategory[cat])
    .filter((s) => s.count > 1)
    .sort((a, b) => b.count - a.count);

  if (ranked.length > 0) {
    lines.push('');
    lines.push('### Top Duplicates');
    for (const stats of ranked) {
      const cat = PATTERN_CATEGORIES.find((c) => report.byCategory[c] === stats);
      const tag = cat ?? '?';
      lines.push(`- **${tag}**: ${stats.patterns.join(', ')}`);
    }
  }

  return lines.join('\n');
}

/**
 * Pure helper: derive a stable exit code from the scan result.
 * Always 0 in v1 — informational; mirrors `architecture` and
 * `business-logic` v1 behavior.
 */
export function patternsExitCode(_result: PatternScanResult): 0 {
  return 0;
}

// -----------------------------------------------------------------------------
// Re-exports so consumers can type-annotate without reaching into
// the engine internals.
// -----------------------------------------------------------------------------

export type { PatternCategory, PatternCategoryStats, PatternFragmentationReport };
export { PATTERN_WEIGHTS };
