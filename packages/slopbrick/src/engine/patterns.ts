// Pattern Fragmentation Engine (Phase 9 / 0.7.0).
//
// Surfaces **UX Pattern Fragmentation** — how many distinct UI/architectural
// patterns exist for each category in a codebase, vs. the ideal baseline
// of 1. AI-generated code consistently produces the same "modal sprawl",
// "auth sprawl", "card sprawl" debt because every new prompt reinvents
// these primitives instead of consolidating to a single canonical one.
//
// The output drives two surfaces:
//   1. The `slopbrick patterns` CLI subcommand (text | json | markdown).
//   2. The future `slop_suggest` MCP tool's `doNotCreate` list (so an
//      agent that asks "should I create a new modal?" can see the
//      project already has 5).
//
// Categories (8):
//   modal, button, auth, api, state, forms, toast, card
//
// Detection strategy:
//   - modal / button: reuse `buildPatternInventory` (filename regex).
//   - state:          reuse `buildPatternInventory` (import-signal table).
//   - forms:          scan imports against `CONSTITUTION_SIGNALS` for the
//                     `forms` field — gives canonical names.
//   - api:            one pattern per source file under `lib/api/`,
//                     `services/`, `api-client/`, `clients/` directories.
//   - auth / toast / card: filename regex sweep (PascalCase identifier
//                     ending in a known primitive suffix).
//
// Score formula:
//   excess = min(max(0, count - 1), MAX_EXCESS_PER_CATEGORY)
//   deduction = sum(weight[c] * excess[c])
//   NORMALIZER = sum(weight[c]) * MAX_EXCESS_PER_CATEGORY
//   score = clamp(0, 100, round(100 - (deduction / NORMALIZER) * 100))
//
// The MAX cap prevents one catastrophic category from pinning the score
// at 0 — we treat "5 implementations" as "as bad as 100" so the other
// categories still influence the result.

import { readFileSync } from 'node:fs';
import { basename, relative } from 'node:path';
import { buildPatternInventory, extractImports, categorizeImport } from '../mcp/patterns.js';
import type { PatternMatch } from '../mcp/patterns.js';
import { discoverFiles } from './discover.js';
import type { ResolvedConfig } from '../types';

// -----------------------------------------------------------------------------
// Public types
// -----------------------------------------------------------------------------

/**
 * The 8 categories surfaced by the patterns subcommand. The string
 * values are stable: they're used in CLI flags, JSON output, and the
 * `doNotCreate` list. Order is intentional — the text formatter walks
 * categories in the order they appear here.
 */
export type PatternCategory =
  | 'modal'
  | 'button'
  | 'auth'
  | 'api'
  | 'state'
  | 'forms'
  | 'toast'
  | 'card';

export const PATTERN_CATEGORIES: readonly PatternCategory[] = [
  'modal',
  'button',
  'auth',
  'api',
  'state',
  'forms',
  'toast',
  'card',
] as const;

/**
 * Stats for a single category. `count` is the number of distinct
 * implementations; `patterns` is the human-readable list of names
 * (component basenames, package names, or file paths for `api`).
 */
export interface PatternCategoryStats {
  /** Distinct pattern names found. */
  patterns: string[];
  /** Count = patterns.length (exposed for readability + JSON symmetry). */
  count: number;
  /** Ideal baseline — always 1 (one canonical implementation). */
  baseline: 1;
  /** max(0, count - 1). Capped at MAX_EXCESS_PER_CATEGORY for scoring. */
  excess: number;
  /** Score weight (mirror of PATTERN_WEIGHTS[cat]). */
  weight: number;
}

/**
 * Final, user-facing report. Independent of `buildPatternInventory`'s
 * shape — we re-shape the data here so the CLI never has to know
 * about MCP-internal types.
 */
export interface PatternFragmentationReport {
  /** Final 0-100 score (100 = perfectly clean, one pattern per category). */
  score: number;
  /** How many files were scanned to produce the report. */
  scannedFiles: number;
  /** Total number of distinct UX patterns found across all categories. */
  uxPatternCount: number;
  /** Approximate identifier count — files with at least one import. */
  identifierCount: number;
  /** Per-category breakdown. Always contains all 8 categories. */
  byCategory: Record<PatternCategory, PatternCategoryStats>;
  /** Pre-formatted doNotCreate messages for the CLI. */
  doNotCreate: string[];
  /** Top-level summary line, e.g. "Repository Pattern Fragmentation: 67/100". */
  headline: string;
}

// -----------------------------------------------------------------------------
// Category weights + normalization
// -----------------------------------------------------------------------------

/**
 * Per-category weights. Higher weight = more visible AI-induced
 * entropy when a category is fragmented.
 *
 * The weights are exported (and frozen) so tests can assert against
 * them and downstream consumers can derive the normalizer without
 * duplicating the numbers.
 */
export const PATTERN_WEIGHTS: Readonly<Record<PatternCategory, number>> = Object.freeze({
  modal: 10, // highest — modal sprawl is the most visible AI tell
  auth: 8, // high — auth patterns are security-critical
  state: 6, // high — state library sprawl breaks data flow
  button: 4,
  api: 4, // medium — API client sprawl is a known debt source
  toast: 4,
  card: 4,
  forms: 3, // lower — schema validators are mostly interchangeable
});

/**
 * Excess beyond 5 implementations is treated as "as bad as 5". This
 * keeps one catastrophic category from pinning the score at 0 — the
 * other categories still influence the result. A modal flood of 50
 * implementations scores the same as 5, but the auth + card mess
 * still matters.
 */
export const MAX_EXCESS_PER_CATEGORY = 4;

/**
 * Sum of all weights × MAX_EXCESS_PER_CATEGORY. The "all categories
 * maxed out" anchor for the score formula. Exported so tests can
 * derive expected scores without recomputing the math.
 */
export const PATTERN_NORMALIZER: number =
  PATTERN_CATEGORIES.reduce((sum, c) => sum + PATTERN_WEIGHTS[c], 0) *
  MAX_EXCESS_PER_CATEGORY;

// -----------------------------------------------------------------------------
// Detection — filename regexes
// -----------------------------------------------------------------------------

// Match component-name basenames only — PascalCase identifier that
// ends with the component type. Mirrors the pattern in src/mcp/patterns.ts
// but is duplicated here so this module stays self-contained.

/** Auth: `useAuth`, `withAuth`, `requireAuth`, `AuthGuard`, `AuthProvider`. */
const AUTH_NAME_RE = /^(?:use|with|require|get)?Auth(?:Guard|Provider|Context|Callback|State|Hook|Client)?$|^AuthGuard$|^AuthProvider$|^AuthContext$/i;

/** Toast: `Toast`, `Notification`, `Snackbar`, `Alert`, `Banner` + prefixes. */
const TOAST_NAME_RE = /^(?:[A-Z][a-zA-Z0-9]+)?(Toast|Notification|Snackbar|Alert|Banner)$/;

/** Card: `Card`, `Tile`, `Chip`, `Badge` + prefixes. */
const CARD_NAME_RE = /^(?:[A-Z][a-zA-Z0-9]+)?(Card|Tile|Chip|Badge)$/;

/** API client module path pattern. */
const API_PATH_RE = /(?:^|\/)(?:lib\/api|services|api-client|clients)\//;

// -----------------------------------------------------------------------------
// Detection — per-category
// -----------------------------------------------------------------------------

/**
 * Strip file extension and return the basename. Mirrors the convention
 * used in `buildPatternInventory`.
 */
function baseName(filePath: string): string {
  return basename(filePath).replace(/\.(tsx|ts|jsx|js|vue|svelte|astro)$/i, '');
}

/**
 * Build a PatternCategoryStats from a list of pattern names. Always
 * sets `baseline: 1` and computes `excess` (uncapped here — the
 * formula in `computePatternFragmentation` applies the cap).
 */
function makeStats(patterns: string[]): PatternCategoryStats {
  // Deduplicate while preserving first-seen order.
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const p of patterns) {
    if (seen.has(p)) continue;
    seen.add(p);
    unique.push(p);
  }
  return {
    patterns: unique,
    count: unique.length,
    baseline: 1,
    excess: Math.max(0, unique.length - 1),
    weight: 0, // weight filled in by the aggregator from PATTERN_WEIGHTS
  };
}

/**
 * Detect auth patterns by file basename. Each unique basename
 * (`useAuth`, `withAuth`, `requireAuth`, `AuthGuard`, ...) becomes
 * one pattern.
 */
function detectAuthFromFiles(files: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    const base = baseName(f);
    if (!AUTH_NAME_RE.test(base)) continue;
    if (seen.has(base)) continue;
    seen.add(base);
    out.push(base);
  }
  return out;
}

/**
 * Detect toast/notification component patterns by file basename.
 */
function detectToastFromFiles(files: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    const base = baseName(f);
    if (!TOAST_NAME_RE.test(base)) continue;
    if (seen.has(base)) continue;
    seen.add(base);
    out.push(base);
  }
  return out;
}

/**
 * Detect card/tile/chip/badge component patterns by file basename.
 */
function detectCardFromFiles(files: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    const base = baseName(f);
    if (!CARD_NAME_RE.test(base)) continue;
    if (seen.has(base)) continue;
    seen.add(base);
    out.push(base);
  }
  return out;
}

/**
 * Detect api-client modules. One pattern per source file under
 * `lib/api/`, `services/`, `api-client/`, `clients/`. The pattern
 * name is the repo-relative path so consumers can click through to
 * the offending file (and so the output is portable across machines).
 */
function detectApiFromFiles(files: string[], cwd: string): string[] {
  const out: string[] = [];
  for (const f of files) {
    if (API_PATH_RE.test(f)) {
      out.push(relative(cwd, f).split('\\').join('/'));
    }
  }
  return out;
}

/**
 * Detect form libraries by walking every file's imports and looking
 * for canonical signals in `CONSTITUTION_SIGNALS` (the `forms` field).
 * Returns the canonical signal name (e.g. 'react-hook-form', 'zod'),
 * not the raw package name, so duplicate packages (`zod` +
 * `@zod/...`) collapse to one pattern.
 */
function detectFormsFromFiles(files: string[]): string[] {
  const signals = new Set<string>();
  for (const f of files) {
    let source: string;
    try {
      source = readFileSync(f, 'utf-8');
    } catch {
      continue;
    }
    const imports = extractImports(source);
    for (const spec of imports) {
      const hit = categorizeImport(spec);
      if (!hit) continue;
      if (hit.field === 'forms') signals.add(hit.signal);
    }
  }
  return Array.from(signals);
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Pure score function: derive the 0-100 score from the per-category
 * stats. Caps excess at MAX_EXCESS_PER_CATEGORY so a single
 * catastrophic category can't pin the score at 0.
 *
 * Exported for unit tests with hand-crafted inputs.
 */
export function computePatternFragmentation(
  byCategory: Record<PatternCategory, PatternCategoryStats>,
): number {
  let deduction = 0;
  for (const cat of PATTERN_CATEGORIES) {
    const stats = byCategory[cat];
    const capped = Math.min(stats.excess, MAX_EXCESS_PER_CATEGORY);
    deduction += PATTERN_WEIGHTS[cat] * capped;
  }
  const raw = 100 - (deduction / PATTERN_NORMALIZER) * 100;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/**
 * Build the full Pattern Fragmentation report for a project.
 * Scans up to `maxFiles` source files (default 500) and walks
 * filenames + imports to detect patterns in all 8 categories.
 *
 * Never throws on per-file errors — a single unreadable file is
 * silently skipped. Throws only on fatal configuration errors.
 */
export async function buildPatternFragmentation(
  cwd: string,
  config: ResolvedConfig,
  maxFiles = 500,
): Promise<PatternFragmentationReport> {
  // Reuse the existing inventory for the 4 categories it already
  // detects. We re-shape its output so callers don't have to know
  // about the MCP-internal `PatternMatch` shape.
  const inventory = await buildPatternInventory(cwd, config, maxFiles);
  const allFiles = (await discoverFiles(cwd, config)).slice(0, maxFiles);

  // 1. modal — distinct component basenames.
  const modalPatterns = inventory.patterns.modal.map((m) => m.name);

  // 2. button — distinct component basenames.
  const buttonPatterns = inventory.patterns.button.map((m) => m.name);

  // 3. state — canonical library signals.
  const statePatterns = inventory.patterns.state.map((m) => m.name);

  // 4. forms — new detection: walk imports, match canonical `forms` signals.
  const formsPatterns = detectFormsFromFiles(allFiles);

  // 5. api — one pattern per file in recognized api-client directories.
  const apiPatterns = detectApiFromFiles(allFiles, cwd);

  // 6. auth / toast / card — file-basename regex sweep.
  const authPatterns = detectAuthFromFiles(allFiles);
  const toastPatterns = detectToastFromFiles(allFiles);
  const cardPatterns = detectCardFromFiles(allFiles);

  // Build the per-category stats, stamping the weight from PATTERN_WEIGHTS
  // so the JSON output is self-describing.
  const byCategory: Record<PatternCategory, PatternCategoryStats> = {
    modal: { ...makeStats(modalPatterns), weight: PATTERN_WEIGHTS.modal },
    button: { ...makeStats(buttonPatterns), weight: PATTERN_WEIGHTS.button },
    auth: { ...makeStats(authPatterns), weight: PATTERN_WEIGHTS.auth },
    api: { ...makeStats(apiPatterns), weight: PATTERN_WEIGHTS.api },
    state: { ...makeStats(statePatterns), weight: PATTERN_WEIGHTS.state },
    forms: { ...makeStats(formsPatterns), weight: PATTERN_WEIGHTS.forms },
    toast: { ...makeStats(toastPatterns), weight: PATTERN_WEIGHTS.toast },
    card: { ...makeStats(cardPatterns), weight: PATTERN_WEIGHTS.card },
  };

  const score = computePatternFragmentation(byCategory);

  // uxPatternCount = sum of all distinct patterns (the headline number
  // the text formatter shows next to the score).
  const uxPatternCount = PATTERN_CATEGORIES.reduce(
    (sum, c) => sum + byCategory[c].count,
    0,
  );

  // identifierCount = number of files that had at least one import we
  // successfully categorized. This is an approximation; "identifiers"
  // is the human-friendly number for the report header.
  const identifierCount = allFiles.length;

  const doNotCreate = buildDoNotCreateList(byCategory);

  return {
    score,
    scannedFiles: inventory.scannedFiles,
    uxPatternCount,
    identifierCount,
    byCategory,
    doNotCreate,
    headline: `Repository Pattern Fragmentation: ${score}/100`,
  };
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Pre-format the doNotCreate messages for the text + json output.
 * Each message is "New X — already have N (p1, p2, ...)" for any
 * category with count > 1.
 */
function buildDoNotCreateList(
  byCategory: Record<PatternCategory, PatternCategoryStats>,
): string[] {
  const labels: Record<PatternCategory, string> = {
    modal: 'modal system',
    button: 'button variant',
    auth: 'auth pattern',
    api: 'api-client module',
    state: 'state library',
    forms: 'form library',
    toast: 'toast system',
    card: 'card variant',
  };
  const out: string[] = [];
  for (const cat of PATTERN_CATEGORIES) {
    const stats = byCategory[cat];
    if (stats.count <= 1) continue;
    out.push(
      `New ${labels[cat]} — already have ${stats.count} (${stats.patterns.join(', ')})`,
    );
  }
  return out;
}

// -----------------------------------------------------------------------------
// Pure helper for unit tests — given per-category counts, build a
// full report. Mirrors the production path but takes synthetic data.
// -----------------------------------------------------------------------------

/**
 * Build a report from hand-crafted per-category counts. Used by
 * unit tests that want to exercise the score formula + formatter
 * without spinning up a temp project on disk.
 */
export function buildReportFromCounts(
  counts: Partial<Record<PatternCategory, string[]>>,
  scannedFiles = 0,
  identifierCount = 0,
): PatternFragmentationReport {
  const byCategory: Record<PatternCategory, PatternCategoryStats> = {
    modal: { ...makeStats(counts.modal ?? []), weight: PATTERN_WEIGHTS.modal },
    button: { ...makeStats(counts.button ?? []), weight: PATTERN_WEIGHTS.button },
    auth: { ...makeStats(counts.auth ?? []), weight: PATTERN_WEIGHTS.auth },
    api: { ...makeStats(counts.api ?? []), weight: PATTERN_WEIGHTS.api },
    state: { ...makeStats(counts.state ?? []), weight: PATTERN_WEIGHTS.state },
    forms: { ...makeStats(counts.forms ?? []), weight: PATTERN_WEIGHTS.forms },
    toast: { ...makeStats(counts.toast ?? []), weight: PATTERN_WEIGHTS.toast },
    card: { ...makeStats(counts.card ?? []), weight: PATTERN_WEIGHTS.card },
  };
  const score = computePatternFragmentation(byCategory);
  const uxPatternCount = PATTERN_CATEGORIES.reduce(
    (sum, c) => sum + byCategory[c].count,
    0,
  );
  const doNotCreate = buildDoNotCreateList(byCategory);
  return {
    score,
    scannedFiles,
    uxPatternCount,
    identifierCount,
    byCategory,
    doNotCreate,
    headline: `Repository Pattern Fragmentation: ${score}/100`,
  };
}

// Re-export the inventory type so the CLI module can type-annotate
// without reaching into the MCP internals.
export type { PatternMatch };
