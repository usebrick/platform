// Documentation Drift CLI surface (Phase 6 — target 0.8.0).
//
// `slopbrick docs` walks the project's markdown files, cross-references
// against exported names + package.json, and computes the docFreshness
// score (0-100, higher = better) plus a categorical `docDrift` band.
//
//   runDocsScan(cwd, config, options) -> { result, scan }
//   formatDocsReport(result, { json?, markdown? }) -> string
//   docsExitCode(result, { strict? }) -> 0 | 1
//
// Exit codes (set by program.ts action):
//   0  — informational (or --strict off, regardless of drift level)
//   1  — --strict set AND docDrift is 'high' or 'critical'
//   2  — fatal error (config not loadable, IO failure)

import { resolve } from 'node:path';
import { runScan } from './scan';
import type { CliGlobalOptions, ScanRunResult } from './scan';
import { buildDocFreshness, DOC_RULE_WEIGHTS } from '../engine/doc-freshness';
import type { BuildDocFreshnessResult } from '../engine/doc-freshness';
import { logger, setLoggerQuiet } from '../engine/logger';
import type { DocDriftLevel, ResolvedConfig } from '../types';

export interface DocsOptions {
  /** Cap on doc files scanned. Defaults to 500. */
  maxDocFiles?: number;
  /** Cap on source files for export extraction. Defaults to 500. */
  maxSourceFiles?: number;
  /** When true, exit 1 on high/critical drift (CI gate). */
  strict?: boolean;
}

export interface DocsScanResult {
  result: BuildDocFreshnessResult;
  scan: ScanRunResult;
}

/**
 * Run the docs scan. We re-use `runScan` to load config + cache, then
 * call `buildDocFreshness` which does the cross-referencing.
 */
export async function runDocsScan(
  cwd: string,
  config: ResolvedConfig,
  options: DocsOptions = {},
): Promise<DocsScanResult> {
  const maxDocFiles = options.maxDocFiles ?? 500;
  const maxSourceFiles = options.maxSourceFiles ?? 500;
  const cliOptions: CliGlobalOptions = {
    workspace: cwd,
    quiet: true,
    format: 'json',
    telemetry: false,
  };
  const scan = await runScan(cliOptions);
  setLoggerQuiet(false);
  const result = await buildDocFreshness(cwd, config, {
    maxDocFiles,
    maxSourceFiles,
  });
  return { result, scan };
}

/**
 * Render the docs scan result. Supports pretty, json, and markdown.
 */
export function formatDocsReport(
  result: DocsScanResult,
  opts: { json?: boolean; markdown?: boolean } = {},
): string {
  if (opts.json) {
    return JSON.stringify(
      {
        version: '0.8.0',
        docFreshness: result.result.docFreshness,
        docDrift: result.result.docDrift,
        scannedDocFiles: result.result.scannedDocFiles,
        scannedSourceFiles: result.result.scannedSourceFiles,
        byRule: result.result.byRule,
        findings: result.result.findings,
      },
      null,
      2,
    );
  }
  if (opts.markdown) {
    return formatDocsMarkdown(result);
  }
  return formatDocsPretty(result);
}

function formatDocsPretty(result: DocsScanResult): string {
  const lines: string[] = [];
  const score = result.result.docFreshness;
  const drift = result.result.docDrift.toUpperCase() as Uppercase<DocDriftLevel>;
  lines.push(
    `Documentation Freshness: ${score}/100  (docDrift: ${drift.toLowerCase()})`,
  );
  lines.push('');
  lines.push(`  Scanned doc files: ${result.result.scannedDocFiles}`);
  lines.push(
    `  Scanned source files (for cross-reference): ${result.result.scannedSourceFiles}`,
  );
  lines.push('');
  lines.push('  Issues by rule:');
  for (const [rule, count] of Object.entries(result.result.byRule)) {
    const weight = DOC_RULE_WEIGHTS[rule as keyof typeof DOC_RULE_WEIGHTS];
    lines.push(`    ${rule.padEnd(34)} ${String(count).padStart(3)}  (${weight} pts each)`);
  }
  if (result.result.findings.length > 0) {
    lines.push('');
    lines.push(`  Findings (${result.result.findings.length} total):`);
    const byFile = new Map<string, typeof result.result.findings>();
    for (const f of result.result.findings) {
      const arr = byFile.get(f.docFile) ?? [];
      arr.push(f);
      byFile.set(f.docFile, arr);
    }
    for (const [file, findings] of byFile) {
      lines.push(`    ${file}`);
      for (const f of findings.slice(0, 10)) {
        const sev = f.severity.padEnd(7);
        lines.push(`      [${sev}] ${f.ruleId} — line ${f.line}`);
        lines.push(`                ${f.message}`);
      }
      if (findings.length > 10) {
        lines.push(`      …and ${findings.length - 10} more`);
      }
    }
  } else {
    lines.push('');
    lines.push('  No doc-drift issues found. ✓');
  }
  return lines.join('\n');
}

function formatDocsMarkdown(result: DocsScanResult): string {
  const lines: string[] = [];
  const drift = result.result.docDrift;
  lines.push(`## Documentation Freshness: ${result.result.docFreshness}/100 (${drift} drift)`);
  lines.push('');
  lines.push('| Rule | Count | Weight |');
  lines.push('|------|-------|--------|');
  for (const [rule, count] of Object.entries(result.result.byRule)) {
    const weight = DOC_RULE_WEIGHTS[rule as keyof typeof DOC_RULE_WEIGHTS];
    lines.push(`| ${rule} | ${count} | ${weight} |`);
  }
  if (result.result.findings.length > 0) {
    lines.push('');
    lines.push('### Findings');
    lines.push('');
    for (const f of result.result.findings) {
      lines.push(`- \`${f.docFile}:${f.line}\` — ${f.message}`);
    }
  }
  return lines.join('\n');
}

/**
 * Pure helper: derive a stable exit code from a DocsScanResult.
 *
 *   0 — informational (or --strict off)
 *   1 — --strict set AND drift ∈ {high, critical}
 */
export function docsExitCode(
  result: DocsScanResult,
  options: { strict?: boolean } = {},
): 0 | 1 {
  if (!options.strict) return 0;
  return result.result.docDrift === 'high' || result.result.docDrift === 'critical' ? 1 : 0;
}
