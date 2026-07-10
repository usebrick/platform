/**
 * v0.15.0 B.4: slopbrick Memory Platform bridge (moved from
 * `packages/slopbrick/src/engine/structure.ts`).
 *
 * The shared schema contracts live in `@usebrick/core`. This module:
 *
 *  1. Builds a `ConstitutionFile` / `InventoryFile` / `HealthFile` from
 *     scan data (pure, no I/O).
 *  2. Reads and writes the slopbrick historical-telemetry log
 *     (`.slopbrick/structure.json`) via a `MemoryIO` callback so the
 *     engine itself never touches the filesystem.
 *  3. Re-exports the engine-friendly subset of the core loaders.
 *
 * The `MemoryIO` indirection is the v0.15.0 change: callers (the
 * slopbrick CLI, future web IDEs, the MCP server) provide an I/O
 * implementation, and the engine stays pure. The default
 * `fsMemoryIO` lives in `packages/slopbrick/src/cli/memory-io.ts`.
 */

import { join } from 'node:path';
import { createHash } from 'node:crypto';

import {
  type RepositoryStructureInventory as InventoryFile,
  type RepositoryStructureConstitution as ConstitutionFile,
  type Pattern as StructurePattern,
  type Component as ComponentFingerprint,
  type Category as StructureCategory,
  type RepositoryStructureHealth,
  STRUCTURE_SCHEMA_VERSION,
  saveInventory as coreSaveInventory,
  writeCacheFromInventory,
} from '@usebrick/core';

// ---------------------------------------------------------------------------
// I/O abstraction
// ---------------------------------------------------------------------------

/**
 * Minimal filesystem surface the engine needs for read-only inventory
 * access and the historical-telemetry log. Concrete implementations
 * (e.g. `fsMemoryIO` in slopbrick's `cli/memory-io.ts`) wrap `node:fs`
 * in async, error-tolerant helpers.
 *
 * The interface is deliberately tiny — just the three operations the
 * engine needs — so it can be backed by anything (in-memory map, R2
 * blob, IndexedDB, etc.) without dragging the engine into the host's
 * I/O model.
 */
export interface MemoryIO {
  /** Read a file's contents. Returns `null` on missing / unreadable
   *  file (never throws). The engine treats `null` as "not found". */
  read(path: string): Promise<string | null>;
  /** Write a file's contents. Creates parent directories as needed. */
  write(path: string, content: string): Promise<void>;
  /** Cheap existence check. */
  exists(path: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Engine-friendly input types
// ---------------------------------------------------------------------------
//
// These are minimal subsets of the slopbrick types. Structural typing
// means a slopbrick `ProjectReport` / `ResolvedConfig` /
// `FileScanResult` satisfies these interfaces without an explicit
// cast. Keeping the types local to the engine means we never need to
// import from `slopbrick/src/types` (which would create a circular
// dep at the workspace level).

/** A category name — the key of `ProjectReport.categoryScores`. */
export type Category = string;

/** A scan report, minimal fields used by `buildHealthFromReport`. */
export interface MemoryReport {
  generatedAt: string;
  /** v0.15.0 U.4+: replaces the legacy slopIndex. 0-100, higher is better. */
  aiSlopScore: number;
  engineeringHygiene: number;
  security: number;
  repositoryHealth: number;
  categoryScores: Record<string, number>;
  issues: ReadonlyArray<{ ruleId: string; severity: string }>;
  scoreBasis?: {
    denominator: number;
    analyzedFiles: number;
    issueSet: 'effective';
    suppressedIssueCount: number;
    parseErrorCount: number;
  };
  completionStatus?: 'complete' | 'empty' | 'partial';
  scoreValidity?: 'valid' | 'incomplete' | 'not-applicable';
  requested?: number;
  analyzed?: number;
  failed?: number;
  skipped?: number;
  scanAccounting?: {
    selected: number;
    analyzed: number;
    zeroFinding: number;
    incrementalCached: number;
    parseFailed: number;
    timedOut: number;
    crashed: number;
    internalFailed: number;
  };
  selectionAccounting?: {
    observedCandidates: number;
    selected: number;
    excluded: {
      configExclude: number;
      unsupportedFileType: number;
      extensionlessDuplicate: number;
      outsideWorkspace: number;
      gitScope: number;
    };
  };
}

/** Resolved config, minimal fields used by `buildConstitutionFromConfig`. */
export interface MemoryConfig {
  constitution?: {
    stateManagement?: readonly string[];
    dataFetching?: readonly string[];
    uiLibrary?: readonly string[];
    forms?: readonly string[];
    styling?: readonly string[];
    routing?: readonly string[];
    forbidden?: readonly string[];
  } | null;
}

/** Per-file scan result, minimal fields used by
 *  `buildInventoryFromScan` / `buildComponentFingerprints`. */
export interface MemoryScanResult {
  filePath: string;
  facts?: {
    v2?: {
      components: ReadonlyArray<{
        name?: string;
        line: number;
        loc: number;
        hookCalls: ReadonlyArray<{ name: string }>;
        props: ReadonlyArray<{ name: string }>;
      }>;
    };
  };
}

/** A historical scan run record (telemetry). */
export interface MemoryAuditRun {
  timestamp: string;
  version: string;
  slopIndex: number;
  categoryScores: Record<string, number>;
  topOffenseIds: string[];
  thresholdExceeded: boolean;
}

/** Pattern inventory shape returned by `buildPatternInventory` in
 *  slopbrick's mcp module. The engine doesn't import it (to keep the
 *  dep graph acyclic); the caller passes the result in. */
export interface MemoryPatternInventory {
  scannedFiles: number;
  patterns: {
    modal: ReadonlyArray<MemoryPatternMatch>;
    button: ReadonlyArray<MemoryPatternMatch>;
    api: ReadonlyArray<MemoryPatternMatch>;
    state: ReadonlyArray<MemoryPatternMatch>;
    dataFetching: ReadonlyArray<MemoryPatternMatch>;
    service: ReadonlyArray<MemoryPatternMatch>;
    route: ReadonlyArray<MemoryPatternMatch>;
    ormModel: ReadonlyArray<MemoryPatternMatch>;
  };
}

export interface MemoryPatternMatch {
  name: string;
  imports: readonly string[];
  files: readonly string[];
}

// ---------------------------------------------------------------------------
// saveInventory — thin shim that re-uses core's writer + cache refresh
// ---------------------------------------------------------------------------

/**
 * Write an `InventoryFile` to `<workspace>/.slopbrick/inventory.json`
 * and refresh the per-file mtime cache so `isInventoryFresh` (in
 * core) has a baseline.
 *
 * The underlying writers (`saveInventory` + `writeCacheFromInventory`)
 * live in core and own the actual JSON serialization + atomic-rename
 * semantics. This wrapper preserves the historical slopbrick behavior:
 * write the inventory, then refresh the cache.
 *
 * Note: this function does not use the `MemoryIO` callback because
 * core's writers are synchronous `node:fs`-backed functions. The
 * `MemoryIO` abstraction covers the telemetry log (`readRuns` /
 * `appendRun`) which the engine owns end-to-end; the inventory file
 * is owned by core and uses core's I/O model.
 */
export function saveInventory(
  workspaceDir: string,
  inventory: InventoryFile,
  computeHash: (file: string) => string,
): void {
  coreSaveInventory(workspaceDir, inventory);
  writeCacheFromInventory(workspaceDir, inventory, computeHash);
}

// ---------------------------------------------------------------------------
// Historical telemetry (.slopbrick/structure.json)
// ---------------------------------------------------------------------------

const TELEMETRY_FILE = join('.slopbrick', 'structure.json');
const MAX_RUNS = 1000;

function telemetryPath(cwd: string): string {
  return join(cwd, TELEMETRY_FILE);
}

function isMemoryAuditRun(value: unknown): value is MemoryAuditRun {
  if (typeof value !== 'object' || value === null) return false;
  const run = value as Partial<MemoryAuditRun>;
  return (
    typeof run.timestamp === 'string' &&
    typeof run.version === 'string' &&
    typeof run.slopIndex === 'number' &&
    run.categoryScores !== null &&
    typeof run.categoryScores === 'object' &&
    Array.isArray(run.topOffenseIds) &&
    run.topOffenseIds.every((id) => typeof id === 'string') &&
    typeof run.thresholdExceeded === 'boolean'
  );
}

/**
 * Read the historical run log. Returns `[]` on a missing or malformed
 * file. The `MemoryIO.read` callback never throws on missing files, so
 * the function itself is total.
 */
export async function readRuns(
  cwd: string,
  io: MemoryIO,
): Promise<MemoryAuditRun[]> {
  const path = telemetryPath(cwd);
  const raw = await io.read(path);
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isMemoryAuditRun);
  } catch {
    return [];
  }
}

function topOffenseIds(report: MemoryReport): string[] {
  // v0.14.5g: skip 'off' severity issues (rules in signal-strength.json's
  // `defaultOff` set, which were disabled for a reason). Without this,
  // the persisted topOffenseIds is dominated by INVERTED or NOISY
  // rules that we deliberately disabled.
  const counts = new Map<string, number>();
  for (const issue of report.issues) {
    const sev = issue.severity as 'high' | 'medium' | 'low' | 'off' | undefined;
    if (sev === 'off' || sev === undefined) continue;
    counts.set(issue.ruleId, (counts.get(issue.ruleId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([ruleId]) => ruleId);
}

/**
 * Append a run to the historical log. Reads the current log via
 * `io.read`, appends the new run, trims to `MAX_RUNS`, then writes
 * back via `io.write`.
 */
export async function appendRun(
  cwd: string,
  report: MemoryReport,
  version: string,
  io: MemoryIO,
  thresholdExceeded?: boolean,
): Promise<MemoryAuditRun> {
  const runs = await readRuns(cwd, io);
  const run: MemoryAuditRun = {
    timestamp: report.generatedAt,
    version,
    slopIndex: report.aiSlopScore, // MemoryAuditRun keeps slopIndex as a historical legacy field
    categoryScores: { ...report.categoryScores },
    topOffenseIds: topOffenseIds(report),
    thresholdExceeded: thresholdExceeded ?? report.aiSlopScore > 0,
  };
  runs.push(run);
  if (runs.length > MAX_RUNS) {
    runs.splice(0, runs.length - MAX_RUNS);
  }
  await io.write(telemetryPath(cwd), JSON.stringify(runs, null, 2));
  return run;
}

// ---------------------------------------------------------------------------
// Bridge: slopbrick scan results → Repository Memory Platform schemas
// ---------------------------------------------------------------------------

/**
 * Pure: read a pattern inventory (already-computed by the slopbrick
 * MCP layer) + a list of per-file scan results, return an
 * `InventoryFile` ready for `saveInventory`.
 *
 * Why the caller passes the pattern inventory: the engine does not
 * depend on `slopbrick/src/mcp/patterns.js` (would create a circular
 * dep at the workspace level). The slopbrick CLI computes the
 * inventory once and hands it in.
 */
export function buildInventoryFromScan(
  scanResult: { cwd: string; results: readonly MemoryScanResult[] },
  inventory: MemoryPatternInventory,
  durationMs: number,
): InventoryFile {
  const BUCKET_TO_CATEGORY: Record<keyof typeof inventory.patterns, StructureCategory> = {
    modal: 'modal',
    button: 'button',
    api: 'api',
    state: 'stateManagement',
    dataFetching: 'dataFetching',
    service: 'service',
    route: 'route',
    ormModel: 'ormModel',
  };

  const patterns: StructurePattern[] = [];
  for (const [bucket, category] of Object.entries(BUCKET_TO_CATEGORY) as Array<
    [keyof typeof BUCKET_TO_CATEGORY, StructureCategory]
  >) {
    for (const m of inventory.patterns[bucket]) {
      patterns.push({
        category,
        name: m.name,
        imports: [...m.imports],
        fileCount: m.files.length,
      });
    }
  }
  patterns.sort(
    (a, b) => b.fileCount - a.fileCount || a.name.localeCompare(b.name),
  );

  const components = buildComponentFingerprints(scanResult.results);

  return {
    version: STRUCTURE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    workspace: scanResult.cwd,
    scannedFiles: inventory.scannedFiles,
    scanDurationMs: durationMs,
    patterns,
    components,
  };
}

/** Pure: copy the declared/forbidden/forbiddenPrefixes fields from a
 *  `ResolvedConfig.constitution` into a standalone `ConstitutionFile`.
 *
 *  - `declared[category]` takes the first entry of the per-category array
 *    (the canonical choice) — multi-allow-list projects degrade gracefully
 *    to "first declared wins".
 *  - `forbidden` keeps bare specifier entries.
 *  - `forbiddenPrefixes` keeps entries ending with `/` (e.g. `@scope/`).
 */
export function buildConstitutionFromConfig(
  config: MemoryConfig,
  workspace: string,
): ConstitutionFile {
  const c = config.constitution;
  const declared: Partial<Record<StructureCategory, string>> = {};
  if (c) {
    const mapping: Record<string, StructureCategory> = {
      stateManagement: 'stateManagement',
      dataFetching: 'dataFetching',
      uiLibrary: 'uiLibrary',
      forms: 'forms',
      styling: 'styling',
      routing: 'routing',
    };
    for (const [field, category] of Object.entries(mapping)) {
      const values = c[field as keyof typeof c];
      if (Array.isArray(values) && values.length > 0) {
        const first = values[0];
        if (typeof first === 'string') {
          declared[category] = first;
        }
      }
    }
  }
  const forbiddenList = c?.forbidden ?? [];
  const forbidden = forbiddenList.filter((e) => !e.endsWith('/'));
  const forbiddenPrefixes = forbiddenList.filter((e) => e.endsWith('/'));
  return {
    version: STRUCTURE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    workspace,
    declared,
    forbidden,
    forbiddenPrefixes,
  };
}

function fingerprintFor(component: {
  name: string;
  hookCalls: ReadonlyArray<{ name: string }>;
  props: ReadonlyArray<{ name: string }>;
}): string {
  const hooks = component.hookCalls.map((h) => h.name).sort();
  const props = component.props.map((p) => p.name).sort();
  const payload = `${component.name}|${hooks.join(',')}|${props.join(',')}`;
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

function buildComponentFingerprints(
  results: readonly MemoryScanResult[],
): ComponentFingerprint[] {
  const byName = new Map<string, ComponentFingerprint>();
  for (const result of results) {
    const v2 = result.facts?.v2;
    if (!v2) continue;
    for (const component of v2.components) {
      if (!component.name) continue;
      // `component.name` is narrowed to `string` here, but TypeScript
      // doesn't always narrow across interface boundaries, so we
      // re-bind to a local with the narrowed type.
      const name: string = component.name;
      const fp = fingerprintFor({ ...component, name });
      const hooks = [...new Set(component.hookCalls.map((h) => h.name))].sort();
      const props = [...new Set(component.props.map((p) => p.name))].sort();
      const line = component.line;
      const endLine = line + Math.max(0, component.loc - 1);
      const existing = byName.get(component.name);
      if (existing) {
        if (!existing.files.includes(result.filePath)) {
          existing.files.push(result.filePath);
        }
        // First fingerprint wins. If a same-name component diverges
        // across files we surface that via `files.length > 1` + a
        // cross-file drift rule; the fingerprint itself stays stable.
        continue;
      }
      byName.set(component.name, {
        name: component.name,
        files: [result.filePath],
        fingerprint: fp,
        hooks,
        props,
        line,
        endLine,
      });
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Health snapshot — derived from ProjectReport, persisted to .slopbrick/health.json
// ---------------------------------------------------------------------------

/**
 * Pure function: build the headline `HealthFile` snapshot from a
 * completed scan report. The schema (`health.schema.json`) is the
 * contract dashboards and CI integrations consume; the writer is
 * `saveHealth()` in `@usebrick/core`. This function does the
 * transformation only — it does NOT touch the filesystem.
 */
export function buildHealthFromReport(
  report: MemoryReport,
  workspace: string,
  options: {
    constitutionDrift?: number;
    scanDurationMs?: number;
    // v0.18.2: optional Bayesian composite aggregate from the scan
    // pipeline. The deterministic 4-score model is unchanged; this
    // is an informational addition. Optional for backward compat.
    compositeScore?: {
      mean: number;
      max: number;
      tier: 'LIKELY_HUMAN' | 'INCONCLUSIVE' | 'LIKELY_AI' | 'VERY_LIKELY_AI';
      fileCount: number;
    };
  } = {},
): RepositoryStructureHealth {
  // Aggregate issue counts by severity. v0.14.5g: skip issues whose
  // severity has been set to 'off' by the defaultOff auto-disable
  // pass (see `filterIssues` in `src/cli/scan.ts`).
  const issueCounts = { high: 0, medium: 0, low: 0 };
  const offenseCounts = new Map<string, number>();
  for (const issue of report.issues) {
    const sev = issue.severity as 'high' | 'medium' | 'low' | 'off' | undefined;
    if (sev === 'off' || sev === undefined) continue;
    if (sev in issueCounts) issueCounts[sev] += 1;
    offenseCounts.set(issue.ruleId, (offenseCounts.get(issue.ruleId) ?? 0) + 1);
  }
  // The schema (health.schema.json) constrains topOffenseIds to a tuple
  // of 0-3 elements. Runtime is already bounded by `.slice(0, 3)`;
  // the cast makes the contract explicit at the type level.
  const topOffenseIds = [...offenseCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([id]) => id) as RepositoryStructureHealth['topOffenseIds'];

  return {
    version: STRUCTURE_SCHEMA_VERSION,
    generatedAt: report.generatedAt,
    workspace,
    aiSlopScore: Math.round(report.aiSlopScore),
    engineeringHygiene: Math.round(report.engineeringHygiene),
    security: Math.round(report.security),
    repositoryHealth: Math.round(report.repositoryHealth),
    categoryScores: Object.fromEntries(
      Object.entries(report.categoryScores).map(([k, v]) => [k, Math.round(v)]),
    ),
    issueCounts,
    ...(options.constitutionDrift !== undefined && {
      constitutionDrift: options.constitutionDrift,
    }),
    topOffenseIds,
    ...(options.scanDurationMs !== undefined && {
      scanDurationMs: options.scanDurationMs,
    }),
    ...(report.scoreBasis && { scoreBasis: report.scoreBasis }),
    ...(report.completionStatus !== undefined && { completionStatus: report.completionStatus }),
    ...(report.scoreValidity !== undefined && { scoreValidity: report.scoreValidity }),
    ...(report.requested !== undefined && { requested: report.requested }),
    ...(report.analyzed !== undefined && { analyzed: report.analyzed }),
    ...(report.failed !== undefined && { failed: report.failed }),
    ...(report.skipped !== undefined && { skipped: report.skipped }),
    ...(report.scanAccounting !== undefined && { scanAccounting: report.scanAccounting }),
    ...(report.selectionAccounting !== undefined && { selectionAccounting: report.selectionAccounting }),
    ...(options.compositeScore && { compositeScore: options.compositeScore }),
  };
}
