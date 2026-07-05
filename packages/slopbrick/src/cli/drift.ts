// Constitution drift detection (CLI surface for `slopbrick drift`).
//
// Wraps the per-file check in src/mcp/patterns.ts and aggregates
// violations across the project so CI / pre-commit / editors
// without an MCP-aware agent can still enforce declared
// constitution.
//
//   runDrift(cwd, config, options) -> DriftResult
//   formatDrift(result, { json }) -> string
//
// Temporal variant (v0.41.0, Sprint 2 task §2a.2):
//
//   runDriftOverTime(cwd, config, { since }) -> DriftOverTimeResult
//   formatDriftOverTime(result) -> string
//
// `runDriftOverTime` reads `.slopbrick/flywheel/scans.jsonl` (the
// per-scan telemetry payloads persisted by `recordTelemetry`) and
// computes the set-difference between pattern inventories at two
// points in time: the baseline (oldest scan at-or-after `since`,
// or the very first scan if `since === 'baseline'`) and the most
// recent scan. The cross-check against declared constitution is a
// conservative name-match — patterns whose lowercase name appears
// in any declared array (stateManagement, dataFetching, uiLibrary,
// forms, styling, routing, custom.*, forbidden) are flagged as
// declared; the rest are surfaced as `introducedUndeclared`.
//
// Exit codes (set by the program.ts action, not here):
//   0  — no violations (or no constitution declared)
//   1  — at least one violation
//   2  — fatal error (config not loadable, IO failure)

import { readFileSync } from 'node:fs';
import { basename, relative } from 'node:path';
import { discoverFiles } from '../engine/discover.js';
import { checkFileConstitution } from '../mcp/patterns.js';
import { readTelemetry, type TelemetryPayload } from '../engine/telemetry';
import type { Constitution, ResolvedConfig } from '../types';

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

// ---------------------------------------------------------------------------
// v0.41.0 (Sprint 2, tasks 2a.2 / 2a.3): temporal drift over the
// `.slopbrick/flywheel/scans.jsonl` telemetry log. Pure functions —
// no `process.exit`, no I/O outside reading the JSONL file.
// ---------------------------------------------------------------------------

/**
 * One element of the pattern set-difference computed by
 * `runDriftOverTime`. The `category` is one of the eight fixed
 * keys in `MemoryPatternInventory.patterns` (modal, button, api,
 * state, dataFetching, service, route, ormModel). The `name` is
 * the pattern's identifier inside that category (e.g. 'modal',
 * 'zustand', 'tanstack-query').
 */
export interface PatternDelta {
  /** Pattern identifier inside its category. */
  name: string;
  /** Which MemoryPatternInventory bucket it came from. */
  category: string;
}

/**
 * Temporal drift result.
 *
 * Extends `DriftResult` so callers can treat the two modes
 * polymorphically when convenient (e.g. dashboard renderers that
 * want a single "drift" view), but most of the new fields are
 * specific to the temporal mode. `runDrift`'s per-file violations
 * are NOT carried over — `byFile` from `DriftResult` is always
 * `[]` here (per-file violations are a per-scan concept, not a
 * temporal one) so consumers iterating `result.byFile` get a
 * consistent (but no-op) shape.
 */
export interface DriftOverTimeResult extends DriftResult {
  /** Patterns present in the current scan but not in the baseline. */
  introduced: PatternDelta[];
  /** Patterns present in the baseline but no longer in the current scan. */
  removed: PatternDelta[];
  /**
   * Subset of `introduced` whose lowercased `name` does not match
   * any value declared in `config.constitution`. Conservative
   * interpretation: exact, case-insensitive match against the
   * union of all declared-array values (stateManagement,
   * dataFetching, uiLibrary, forms, styling, routing, custom.*,
   * forbidden). Patterns with no match are surfaced as
   * `introducedUndeclared` so the user can decide whether to add
   * them to `slopbrick.config.mjs`.
   */
  introducedUndeclared: PatternDelta[];
  /** How many telemetry payloads were read from `scans.jsonl`. */
  snapshotsConsidered: number;
  /**
   * Normalized churn metric, 0–100. Computed as
   * `(introduced.length + removed.length) / max(baselineTotal, 1) * 100`,
   * capped at 100. Pure metric, informational only — does not
   * gate CI. Use as a dashboard signal, not as a threshold.
   */
  driftScore: number;
  /** ISO timestamp of the baseline scan. */
  baselineAt: string;
  /** ISO timestamp of the most-recent scan. */
  currentAt: string;
  /**
   * Source of the baseline window. `'baseline'` means the
   * baseline is the oldest scan in the JSONL; an ISO date means
   * the baseline is the oldest scan whose `timestamp ≥ since`.
   */
  baselineSource: 'baseline' | 'since';
}

export interface DriftOverTimeOptions {
  /**
   * Either an ISO-8601 timestamp (e.g. `'2026-07-01'` or
   * `'2026-07-01T00:00:00Z'`) — baseline = oldest scan whose
   * timestamp ≥ this value — or the literal string `'baseline'`,
   * which means the baseline is the oldest scan in the JSONL.
   */
  since: string;
}

/**
 * Read `scans.jsonl`, find the baseline scan and the most-recent
 * scan, compute the pattern set-difference, and cross-check the
 * introduced set against the declared constitution.
 *
 * Pure function — no `process.exit`, no logging, no console
 * output. The CLI action (`commands/drift.ts`) wraps this with
 * `formatDriftOverTime` + `withExitCode` from the §2.0 dispatcher.
 *
 * Backward compatibility: payloads written by v0.40.x (which
 * pre-date task 2a.1's `inventory` field) lack the `inventory`
 * property. Those payloads are skipped silently — they
 * contribute to `snapshotsConsidered` but nothing to the set
 * math. A warning log is emitted by the CLI wrapper, not here.
 *
 * Empty-history behavior: if the JSONL file is missing, or no
 * payload carries `inventory`, returns an empty result with
 * `snapshotsConsidered: 0`, `baselineAt: ''`, `currentAt: ''`,
 * and all-empty deltas. The CLI surfaces this as a clean
 * "no historical telemetry" message rather than an error.
 */
export async function runDriftOverTime(
  cwd: string,
  config: ResolvedConfig,
  options: DriftOverTimeOptions,
): Promise<DriftOverTimeResult> {
  const payloads = readTelemetry(cwd);
  const sortedAsc = [...payloads].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  // Filter out payloads without inventory (v0.40.x backward compat).
  const withInventory = sortedAsc.filter((p): p is TelemetryPayload & {
    inventory: NonNullable<TelemetryPayload['inventory']>;
  } => p.inventory !== undefined);

  const baselineSource: 'baseline' | 'since' = options.since === 'baseline' ? 'baseline' : 'since';
  let baseline: typeof withInventory[number] | undefined;
  if (baselineSource === 'baseline') {
    baseline = withInventory[0];
  } else {
    baseline = withInventory.find((p) => p.timestamp >= options.since);
  }
  const current = withInventory.at(-1);

  // Empty-history: no payloads with inventory, or no current/baseline pair.
  if (!baseline || !current) {
    return {
      scannedFiles: 0,
      filesWithViolations: 0,
      totalViolations: 0,
      byCategory: {},
      byFile: [],
      conventionSource: deriveSource(config.constitution),
      constitution: config.constitution,
      introduced: [],
      removed: [],
      introducedUndeclared: [],
      snapshotsConsidered: withInventory.length,
      driftScore: 0,
      baselineAt: baseline?.timestamp ?? '',
      currentAt: current?.timestamp ?? '',
      baselineSource,
    };
  }

  const baselineNames = flattenPatternNames(baseline.inventory.patternNames);
  const currentNames = flattenPatternNames(current.inventory.patternNames);

  const baselineSet = new Set(baselineNames.map((p) => `${p.category}\u0000${p.name}`));
  const currentSet = new Set(currentNames.map((p) => `${p.category}\u0000${p.name}`));

  const introduced: PatternDelta[] = [];
  const removed: PatternDelta[] = [];
  for (const p of currentNames) {
    const key = `${p.category}\u0000${p.name}`;
    if (!baselineSet.has(key)) introduced.push(p);
  }
  for (const p of baselineNames) {
    const key = `${p.category}\u0000${p.name}`;
    if (!currentSet.has(key)) removed.push(p);
  }
  introduced.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  removed.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  const declared = collectDeclaredNames(config.constitution);
  const introducedUndeclared = introduced.filter((p) => !declared.has(p.name.toLowerCase()));

  const baselineTotal = Math.max(baselineSet.size, 1);
  const driftScore = Math.min(
    100,
    Math.round(((introduced.length + removed.length) / baselineTotal) * 100),
  );

  return {
    scannedFiles: current.inventory.scannedFiles,
    filesWithViolations: 0,
    totalViolations: 0,
    byCategory: {},
    byFile: [],
    conventionSource: deriveSource(config.constitution),
    constitution: config.constitution,
    introduced,
    removed,
    introducedUndeclared,
    snapshotsConsidered: withInventory.length,
    driftScore,
    baselineAt: baseline.timestamp,
    currentAt: current.timestamp,
    baselineSource,
  };
}

/**
 * Flatten `TelemetryInventorySummary.patternNames` (a per-category
 * `Record<string, string[]>`) into a sorted, deduplicated
 * `PatternDelta[]`. Internal helper, exported for tests.
 */
export function flattenPatternNames(patternNames: Record<string, string[]>): PatternDelta[] {
  const out: PatternDelta[] = [];
  for (const [category, names] of Object.entries(patternNames)) {
    for (const name of names) {
      out.push({ category, name });
    }
  }
  out.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  return out;
}

/**
 * Union of all declared-constitution values, lowercased. Internal
 * helper, exported for tests. Conservative match surface —
 * exact, case-insensitive comparison only. Patterns whose
 * lowercase name appears here are considered "declared".
 */
export function collectDeclaredNames(constitution: Constitution | undefined): Set<string> {
  const out = new Set<string>();
  if (!constitution) return out;
  const fields: Array<keyof Pick<
    Constitution,
    'stateManagement' | 'dataFetching' | 'uiLibrary' | 'forms' | 'styling' | 'routing'
  >> = ['stateManagement', 'dataFetching', 'uiLibrary', 'forms', 'styling', 'routing'];
  for (const f of fields) {
    for (const v of constitution[f] ?? []) {
      out.add(v.toLowerCase());
    }
  }
  for (const list of Object.values(constitution.custom ?? {})) {
    for (const v of list) {
      out.add(v.toLowerCase());
    }
  }
  for (const v of constitution.forbidden ?? []) {
    out.add(v.toLowerCase());
  }
  return out;
}

/**
 * Pretty formatter for `DriftOverTimeResult`.
 *
 * Layout matches the example in the §2a.4 plan:
 *   "5 patterns introduced since 2026-07-01, 2 not in declared constitution."
 *
 * The cluster-emerged callout (`{ ai/compression-profile ×
 * ai/segment-surprisal-cv } nPMI=0.62`) is a Sprint-3b feature and
 * is intentionally omitted here — it lands with the empirical
 * composites engine in v0.42.0. A slot is reserved in the output
 * layout (a blank line where it would render) so adding it later
 * doesn't shift user-visible line numbers in dashboards.
 */
export function formatDriftOverTime(result: DriftOverTimeResult): string {
  const lines: string[] = [];
  lines.push('Temporal drift report');
  lines.push('');

  if (result.snapshotsConsidered === 0 || !result.baselineAt || !result.currentAt) {
    lines.push('  No historical telemetry found at .slopbrick/flywheel/scans.jsonl.');
    lines.push('  Run a few scans with `slopbrick scan` first; the temporal drift');
    lines.push('  detector needs ≥ 2 scan payloads to compute a baseline window.');
    return lines.join('\n');
  }

  const sinceLabel =
    result.baselineSource === 'baseline'
      ? `baseline (oldest scan)`
      : `since ${result.baselineAt}`;
  lines.push(`  Window: ${sinceLabel} → ${result.currentAt}`);
  lines.push(`  Snapshots considered: ${result.snapshotsConsidered}`);
  lines.push(`  Drift score: ${result.driftScore} / 100  (informational)`);
  lines.push('');
  lines.push(`  Patterns introduced: ${result.introduced.length}`);
  for (const p of result.introduced) {
    lines.push(`    + ${p.category}/${p.name}`);
  }
  if (result.introducedUndeclared.length > 0) {
    lines.push('');
    lines.push(
      `  Patterns introduced but not in declared constitution: ${result.introducedUndeclared.length}`,
    );
    for (const p of result.introducedUndeclared) {
      lines.push(`    ! ${p.category}/${p.name}`);
    }
  }
  lines.push('');
  lines.push(`  Patterns removed: ${result.removed.length}`);
  for (const p of result.removed) {
    lines.push(`    - ${p.category}/${p.name}`);
  }
  // Reserved slot for the empirical-cluster callout from Sprint 3b.
  // Keeping a blank line here means a future clusterer can fill
  // this slot without shifting downstream line numbers.
  lines.push('');

  if (result.introducedUndeclared.length > 0) {
    lines.push(
      '  Tip: add undeclared patterns to slopbrick.config.mjs#constitution to',
    );
    lines.push('  promote them into the declared set on the next scan.');
  } else if (result.introduced.length === 0 && result.removed.length === 0) {
    lines.push('  ✓ No pattern churn since the baseline window.');
  }

  return lines.join('\n');
}

/**
 * Helper for the CLI dispatcher (task 2a.5): derive the exit
 * code from a `DriftOverTimeResult` without coupling to
 * `process.exit`. The current convention is exit 0 if no
 * undeclared patterns are introduced (informational drift), exit
 * 1 otherwise — so users can wire the temporal mode into CI as a
 * non-blocking signal by setting their CI threshold to a count
 * gate, not the drift score.
 */
export function driftOverTimeExitCode(result: DriftOverTimeResult): 0 | 1 {
  return result.introducedUndeclared.length > 0 ? 1 : 0;
}