/**
 * slopbrick — Memory Platform bridge.
 *
 * The shared contract lives in `@usebrick/core`. This module:
 *
 *  1. Re-exports the core loaders/savers/validators so existing
 *     `from '../engine/memory'` and `from './memory'` imports keep working.
 *  2. Implements the slopbrick-specific pieces:
 *     - `readRuns` / `appendRun` — historical telemetry in
 *       `.slopbrick/memory.json` (not part of the Repository Memory
 *       Platform; only slopbrick reads it)
 *     - `buildInventoryFromScan` / `buildConstitutionFromConfig` —
 *       bridge from slopbrick's scan results to the core schemas
 *     - `buildComponentFingerprints` — derives `ComponentFingerprint`s
 *       from `facts.v2` (slopbrick's per-file AST facts)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

import {
  type Category,
  type ProjectReport,
  type ResolvedConfig,
  type FileScanResult,
  type SlopAuditRun,
  VERSION,
} from '../types';
import { buildPatternInventory } from '../mcp/patterns.js';
import { computeFileHash } from './cache-incremental.js';
import {
  type InventoryFile,
  type ConstitutionFile,
  type StructurePattern,
  type ComponentFingerprint,
  type FileMtimeEntry,
  type StructureCategory,
  STRUCTURE_SCHEMA_VERSION,
  isStructurePattern,
  isComponentFingerprint,
  isInventoryFile,
  isConstitutionFile,
  isFileMtimeEntry,
  inventoryPath,
  constitutionPath,
  cachePath,
  loadInventory,
  loadConstitution,
  saveConstitution,
  saveInventory as coreSaveInventory,
  readCache,
  writeCacheFromInventory,
  isInventoryFresh,
  invalidateFile,
} from '@usebrick/core';

// NOTE: No re-exports from `@usebrick/core` here. The internal
// `import { ... }` block above is for slopbrick-internal use only.
// Re-exporting types from `@usebrick/core` would force every TypeScript
// consumer of slopbrick to depend on a package that is private and not
// on npm. The runtime values are BUNDLED into dist/index.cjs (see
// tsup.config.ts `noExternal`), so end users never need to know about
// @usebrick/core.

/** Back-compat shim: `saveInventory` historically ALSO refreshed the
 *  per-file mtime cache so `isInventoryFresh` had a baseline. The
 *  underlying writer now lives in core's `writeCacheFromInventory`,
 *  which takes a `computeHash` callback. This wrapper preserves the
 *  old slopbrick behavior: write the inventory, then refresh the cache. */
export async function saveInventory(
  workspaceDir: string,
  inventory: InventoryFile,
  computeHash: (file: string) => string = computeFileHash,
): Promise<void> {
  coreSaveInventory(workspaceDir, inventory);
  writeCacheFromInventory(workspaceDir, inventory, computeHash);
}

// ---------------------------------------------------------------------------
// slopbrick historical telemetry (.slopbrick/memory.json)
// ---------------------------------------------------------------------------

const TELEMETRY_FILE = join('.slopbrick', 'structure.json');
const MAX_RUNS = 1000;

function telemetryPath(cwd: string): string {
  return join(cwd, TELEMETRY_FILE);
}

function isSlopAuditRun(value: unknown): value is SlopAuditRun {
  if (typeof value !== 'object' || value === null) return false;
  const run = value as Partial<SlopAuditRun>;
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

export function readRuns(cwd: string): SlopAuditRun[] {
  const path = telemetryPath(cwd);
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSlopAuditRun);
  } catch {
    return [];
  }
}

function topOffenseIds(report: ProjectReport): string[] {
  // v0.14.5g: same fix as buildHealthFromReport — skip 'off' severity
  // issues (rules in signal-strength.json's `defaultOff` set, which
  // were disabled for a reason). Without this, the persisted
  // .slop-audit/memory.json topOffenseIds is dominated by INVERTED
  // or NOISY rules that we deliberately disabled.
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

export function appendRun(
  cwd: string,
  report: ProjectReport,
  thresholdExceeded?: boolean,
): SlopAuditRun {
  const runs = readRuns(cwd);
  const run: SlopAuditRun = {
    timestamp: report.generatedAt,
    version: VERSION,
    slopIndex: report.slopIndex,
    categoryScores: { ...report.categoryScores } as Record<Category, number>,
    topOffenseIds: topOffenseIds(report),
    thresholdExceeded: thresholdExceeded ?? report.slopIndex > 0,
  };
  runs.push(run);
  if (runs.length > MAX_RUNS) {
    runs.splice(0, runs.length - MAX_RUNS);
  }
  const path = telemetryPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(runs, null, 2));
  return run;
}

// ---------------------------------------------------------------------------
// Bridge: slopbrick scan results → Repository Memory Platform schemas
// ---------------------------------------------------------------------------

/**
 * Pure-ish: read a scan result + config, return an `InventoryFile` ready
 * for `saveInventory`. The `buildPatternInventory` call inside reads files
 * (cheap, ~200ms on 500 files), so the function is async.
 *
 * Component fingerprints are derived from `facts.v2.components` — the same
 * grouped shape the engine already extracts during the scan. The
 * fingerprint is a 16-char hex prefix of sha256 over the canonical name +
 * sorted hooks + sorted props, so two components with the same signature
 * dedupe to one `ComponentFingerprint` (with both files listed).
 */
export async function buildInventoryFromScan(
  scanResult: { cwd: string; results: readonly FileScanResult[] },
  config: ResolvedConfig,
  durationMs: number,
): Promise<InventoryFile> {
  const inventory = await buildPatternInventory(scanResult.cwd, config);

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

/** Pure function: copy the declared/forbidden/forbiddenPrefixes fields from
 *  a `ResolvedConfig.constitution` into a standalone `ConstitutionFile`.
 *
 *  - `declared[category]` takes the first entry of the per-category array
 *    (the canonical choice) — multi-allow-list projects degrade gracefully
 *    to "first declared wins".
 *  - `forbidden` keeps bare specifier entries.
 *  - `forbiddenPrefixes` keeps entries ending with `/` (e.g. `@scope/`).
 */
export function buildConstitutionFromConfig(
  config: ResolvedConfig,
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
  results: readonly FileScanResult[],
): ComponentFingerprint[] {
  const byName = new Map<string, ComponentFingerprint>();
  for (const result of results) {
    const v2 = result.facts?.v2;
    if (!v2) continue;
    for (const component of v2.components) {
      if (!component.name) continue;
      const fp = fingerprintFor(component);
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
 * completed `ProjectReport`. The schema (`health.schema.json`) is the
 * contract dashboards and CI integrations consume; the writer is
 * `saveHealth()` in `@usebrick/core`. This function does the
 * transformation only — it does NOT touch the filesystem.
 *
 * Why derived (not stored) in the engine: the `ProjectReport` is the
 * single source of truth. The health file is a normalized view; if the
 * two ever diverge, the report wins.
 */
export function buildHealthFromReport(
  report: ProjectReport,
  workspace: string,
  options: { constitutionDrift?: number; scanDurationMs?: number } = {},
): {
  version: typeof STRUCTURE_SCHEMA_VERSION;
  generatedAt: string;
  workspace: string;
  slopIndex: number;
  categoryScores: Record<string, number>;
  issueCounts: { high: number; medium: number; low: number };
  constitutionDrift?: number;
  topOffenseIds: string[];
  scanDurationMs?: number;
} {
  // Aggregate issue counts by severity. v0.14.5g: skip issues whose
  // severity has been set to 'off' by the defaultOff auto-disable
  // pass (see `filterIssues` in `src/cli/scan.ts`). Without this
  // filter, defaultOff rules — which signal-strength.json marks
  // as INVERTED or NOISY — show up as top offenses in the health
  // snapshot, eroding trust in the headline metric.
  const issueCounts = { high: 0, medium: 0, low: 0 };
  const offenseCounts = new Map<string, number>();
  for (const issue of report.issues) {
    const sev = issue.severity as 'high' | 'medium' | 'low' | 'off' | undefined;
    if (sev === 'off' || sev === undefined) continue;
    if (sev in issueCounts) issueCounts[sev] += 1;
    offenseCounts.set(issue.ruleId, (offenseCounts.get(issue.ruleId) ?? 0) + 1);
  }
  const topOffenseIds = [...offenseCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([id]) => id);

  return {
    version: STRUCTURE_SCHEMA_VERSION,
    generatedAt: report.generatedAt,
    workspace,
    slopIndex: Math.round(report.slopIndex),
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
  };
}
