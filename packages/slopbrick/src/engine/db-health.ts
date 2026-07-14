// Database Health — Phase 8 (target 0.8.0).
//
// v0.38.0: Five of the original six db-health rules were deleted as
// v10-DORMANT (`db/missing-fk-index`, `db/duplicate-index`,
// `db/missing-not-null`, `db/enum-sprawl`, `db/naming-inconsistency`).
// Only `db/sql-concat` remains — it scans TS files for template-literal
// SQL queries (regex-based, no pgsql-parser AST needed).
//
// The score formula is unchanged: clamp(0, 100, 100 - (issueWeight / scannedFiles) * 5)
// Categorical bands:
//   80-100 low, 60-79 medium, 40-59 high, 0-39 critical
//
// The pgsql-parser dep is retained in package.json — future schema rules
// can re-use it without adding a new dep.

import { readFileSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import type { ResolvedConfig, DbFinding, Issue } from '../types';
import { discoverFiles, isExcludedBySelfScan } from './discover.js';
import { sqlConcatRule } from '../rules/db/sql-concat';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DB_RULE_WEIGHTS: Record<DbFinding['ruleId'], number> = {
  'db/sql-concat': 5,
} as const;

export const DB_FRESHNESS_THRESHOLDS = {
  low: 80,
  medium: 60,
  high: 40,
} as const;

const DB_TS_EXTENSIONS = new Set(['.ts', '.tsx']);

// ---------------------------------------------------------------------------
// Top-level entry point
// ---------------------------------------------------------------------------

export interface BuildDbHealthOptions {
  maxFiles?: number;
  /** Exact main-scan selection. When present, DB health must not rediscover files. */
  selectedFilePaths?: readonly string[];
}

export interface BuildDbHealthResult {
  dbHealth: number;
  dbDrift: 'low' | 'medium' | 'high' | 'critical';
  scannedSqlFiles: number;
  scannedTsFiles: number;
  findings: DbFinding[];
  byRule: Record<DbFinding['ruleId'], number>;
}

/**
 * Walk the project's TS files, run the remaining db-health rule
 * (`db/sql-concat`), and compute the dbHealth score. Static-only —
 * no live DB connection.
 */
export async function buildDbHealth(
  cwd: string,
  config: ResolvedConfig,
  options: BuildDbHealthOptions = {},
): Promise<BuildDbHealthResult> {
  const maxFiles = options.maxFiles ?? 500;
  const discovered = options.selectedFilePaths === undefined
    ? (await discoverFiles(cwd, config)).filter((filePath) =>
      !isExcludedBySelfScan(filePath, cwd, config.selfScan?.excludePaths),
    )
    : options.selectedFilePaths.map((filePath) => resolve(cwd, filePath));
  const tsFiles = [...new Set(discovered)]
    .filter((filePath) => DB_TS_EXTENSIONS.has(extname(filePath).toLowerCase()))
    .sort()
    .slice(0, maxFiles);

  const findings: DbFinding[] = [];
  let scannedTsFiles = 0;
  for (const abs of tsFiles) {
    let source: string;
    try {
      source = readFileSync(abs, 'utf-8');
    } catch {
      continue;
    }
    scannedTsFiles += 1;
    const relPath = relative(cwd, abs);
    const context = { config, filePath: relPath, cwd };
    const facts = { filePath: relPath, v2: { _source: source } as any };
    const ruleContext = sqlConcatRule.create(context);
    const issues: Issue[] = sqlConcatRule.analyze(ruleContext, facts);
    for (const issue of issues) {
      findings.push({
        ruleId: 'db/sql-concat',
        severity: issue.severity,
        dbFile: relPath,
        line: issue.line,
        column: issue.column,
        message: issue.message,
        advice: issue.advice ?? '',
      });
    }
  }

  // Score
  const byRule: Record<DbFinding['ruleId'], number> = {
    'db/sql-concat': 0,
  };
  let weight = 0;
  for (const f of findings) {
    byRule[f.ruleId] = (byRule[f.ruleId] ?? 0) + 1;
    weight += DB_RULE_WEIGHTS[f.ruleId];
  }
  const totalScanned = scannedTsFiles;
  // Normalize: ~5 points deducted per finding per 100 scanned files.
  const penalty = totalScanned > 0 ? (weight / totalScanned) * 5 : 0;
  const dbHealth = Math.max(0, Math.min(100, Math.round(100 - penalty)));
  let dbDrift: 'low' | 'medium' | 'high' | 'critical' = 'low';
  if (dbHealth < DB_FRESHNESS_THRESHOLDS.high) dbDrift = 'critical';
  else if (dbHealth < DB_FRESHNESS_THRESHOLDS.medium) dbDrift = 'high';
  else if (dbHealth < DB_FRESHNESS_THRESHOLDS.low) dbDrift = 'medium';

  return {
    dbHealth,
    dbDrift,
    scannedSqlFiles: 0,
    scannedTsFiles,
    findings,
    byRule,
  };
}
