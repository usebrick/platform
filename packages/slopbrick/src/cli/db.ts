// Database Health CLI surface (Phase 8 — target 0.8.0).
//
// `slopbrick db` walks the project's SQL / TS files, runs the 6
// db-health rules, and computes the dbHealth score (0-100, higher =
// better) plus a categorical `dbDrift` band.
//
//   runDbScan(cwd, config, options) -> { result, scan }
//   formatDbReport(result, { json?, markdown? }) -> string
//   dbExitCode(result, { strict? }) -> 0 | 1
//
// Exit codes (set by program.ts action):
//   0  — informational (or --strict off, regardless of drift level)
//   1  — --strict set AND dbDrift is 'high' or 'critical'
//   2  — fatal error (config not loadable, IO failure)


import { runScan } from './scan';
import type { CliGlobalOptions, ScanRunResult } from './scan';
import { buildDbHealth, DB_RULE_WEIGHTS } from '../engine/db-health';
import type { BuildDbHealthResult } from '../engine/db-health';
import { setLoggerQuiet } from '../engine/logger';
import type { DbDriftLevel, ResolvedConfig } from '../types';

export interface DbOptions {
  /** Cap on files scanned. Defaults to 500. */
  maxFiles?: number;
  /** When true, exit 1 on high/critical drift (CI gate). */
  strict?: boolean;
}

export interface DbScanResult {
  result: BuildDbHealthResult;
  scan: ScanRunResult;
}

export const DB_NOT_APPLICABLE_REASON = 'no-database-files-analyzed' as const;
export const DB_NOT_APPLICABLE_MESSAGE =
  'NO DATABASE FILES ANALYSED — database health is not applicable for this workspace.' as const;

/**
 * Run the db scan. We re-use `runScan` to load config + cache, then
 * call `buildDbHealth` which does the schema analysis.
 */
export async function runDbScan(
  cwd: string,
  config: ResolvedConfig,
  options: DbOptions = {},
): Promise<DbScanResult> {
  const maxFiles = options.maxFiles ?? 500;
  const cliOptions: CliGlobalOptions = {
    workspace: cwd,
    quiet: true,
    format: 'json',
    telemetry: false,
  };
  const scan = await runScan(cliOptions);
  setLoggerQuiet(false);
  const result = await buildDbHealth(cwd, config, { maxFiles });
  return { result, scan };
}

/**
 * Render the db scan result. Supports pretty, json, and markdown.
 */
export function formatDbReport(
  result: DbScanResult,
  opts: { json?: boolean; markdown?: boolean } = {},
): string {
  if (opts.json) {
    return JSON.stringify(
      {
        version: '0.8.0',
        dbHealth: result.result.dbHealth,
        dbDrift: result.result.dbDrift,
        scannedSqlFiles: result.result.scannedSqlFiles,
        scannedTsFiles: result.result.scannedTsFiles,
        byRule: result.result.byRule,
        findings: result.result.findings,
      },
      null,
      2,
    );
  }
  if (opts.markdown) {
    return formatDbMarkdown(result);
  }
  return formatDbPretty(result);
}

/**
 * Render the domain-specific no-denominator result without exposing the
 * engine's neutral `100/100` placeholder as a measured health score.
 */
export function formatDbNotApplicable(
  result: DbScanResult,
  opts: { json?: boolean; markdown?: boolean } = {},
): string {
  const metadata = {
    version: '0.8.0',
    completionStatus: 'empty' as const,
    scoreValidity: 'not-applicable' as const,
    reason: DB_NOT_APPLICABLE_REASON,
    message: DB_NOT_APPLICABLE_MESSAGE,
    requested: 0,
    analyzed: 0,
    failed: 0,
    skipped: 0,
    scannedSqlFiles: result.result.scannedSqlFiles,
    scannedTsFiles: result.result.scannedTsFiles,
    byRule: result.result.byRule,
    findings: result.result.findings,
  };
  if (opts.json) return JSON.stringify(metadata, null, 2);
  if (opts.markdown) {
    return `## Database Health: not-applicable\n\n${DB_NOT_APPLICABLE_MESSAGE}`;
  }
  return DB_NOT_APPLICABLE_MESSAGE;
}

function formatDbPretty(result: DbScanResult): string {
  const lines: string[] = [];
  const score = result.result.dbHealth;
  const drift = result.result.dbDrift.toUpperCase() as Uppercase<DbDriftLevel>;
  lines.push(`Database Health: ${score}/100  (dbDrift: ${drift.toLowerCase()})`);
  lines.push('');
  lines.push(
    `  Scanned SQL files: ${result.result.scannedSqlFiles}    TS files (sql-concat): ${result.result.scannedTsFiles}`,
  );
  lines.push('');
  lines.push('  Issues by rule:');
  for (const [rule, count] of Object.entries(result.result.byRule)) {
    const weight = DB_RULE_WEIGHTS[rule as keyof typeof DB_RULE_WEIGHTS];
    lines.push(`    ${rule.padEnd(30)} ${String(count).padStart(3)}  (${weight} pts each)`);
  }
  if (result.result.findings.length > 0) {
    lines.push('');
    lines.push(`  Findings (${result.result.findings.length} total):`);
    const byFile = new Map<string, typeof result.result.findings>();
    for (const f of result.result.findings) {
      const arr = byFile.get(f.dbFile) ?? [];
      arr.push(f);
      byFile.set(f.dbFile, arr);
    }
    for (const [file, findings] of byFile) {
      lines.push(`    ${file}`);
      for (const f of findings.slice(0, 10)) {
        const sev = f.severity.padEnd(7);
        const target = f.table ? `${f.table}${f.columnName ? `.${f.columnName}` : ''}` : '';
        lines.push(`      [${sev}] ${f.ruleId}${target ? ` (${target})` : ''}`);
        lines.push(`                ${f.message}`);
      }
      if (findings.length > 10) {
        lines.push(`      …and ${findings.length - 10} more`);
      }
    }
  } else {
    lines.push('');
    lines.push('  No db-health issues found. ✓');
  }
  return lines.join('\n');
}

function formatDbMarkdown(result: DbScanResult): string {
  const lines: string[] = [];
  const drift = result.result.dbDrift;
  lines.push(`## Database Health: ${result.result.dbHealth}/100 (${drift} drift)`);
  lines.push('');
  lines.push('| Rule | Count | Weight |');
  lines.push('|------|-------|--------|');
  for (const [rule, count] of Object.entries(result.result.byRule)) {
    const weight = DB_RULE_WEIGHTS[rule as keyof typeof DB_RULE_WEIGHTS];
    lines.push(`| ${rule} | ${count} | ${weight} |`);
  }
  if (result.result.findings.length > 0) {
    lines.push('');
    lines.push('### Findings');
    lines.push('');
    for (const f of result.result.findings) {
      lines.push(`- \`${f.dbFile}\` — ${f.message}`);
    }
  }
  return lines.join('\n');
}

/**
 * Pure helper: derive a stable exit code from a DbScanResult.
 */
export function dbExitCode(
  result: DbScanResult,
  options: { strict?: boolean } = {},
): 0 | 1 {
  if (!options.strict) return 0;
  return result.result.dbDrift === 'high' || result.result.dbDrift === 'critical' ? 1 : 0;
}
