// AI Maintenance Cost CLI surface (Phase Memo #4 — target 0.8.0).
//
// `slopbrick maintenance-cost` computes the derived categorical
// meta-score (low | medium | high | critical) from signals already
// produced by `slopbrick scan` + `slopbrick drift`. No new file
// scanning.
//
//   runMaintenanceCostScan(cwd, config, options) -> { result, scan }
//   formatMaintenanceCostReport(result, { json }) -> string
//   maintenanceCostExitCode(result) -> 0 | 1
//
// Exit codes (set by program.ts):
//   0  — informational (or --strict and bucket ∈ {low, medium})
//   1  — --strict and bucket ∈ {high, critical}
//   2  — fatal error (config not loadable, IO failure)

import { resolve } from 'node:path';
import { runScan } from './scan';
import type { CliGlobalOptions, ScanRunResult } from './scan';
import { runDrift } from './drift';
import {
  computeAiMaintenanceCost,
  computeAiMaintenanceCostFromReport,
} from '../engine/maintenance-cost';
import { logger, setLoggerQuiet } from '../engine/logger';
import type {
  AiMaintenanceCost,
  AiMaintenanceCostResult,
  ResolvedConfig,
} from '../types';

export interface MaintenanceCostOptions {
  /** Cap on files scanned when re-running drift. Defaults to 500. */
  maxFiles?: number;
  /** When true, exit 1 on high/critical bucket (CI gate). */
  strict?: boolean;
}

export interface MaintenanceCostScanResult {
  result: AiMaintenanceCostResult;
  scan: ScanRunResult;
  /** Drift violations, when the constitution is declared and drift succeeded. */
  constitutionViolations?: number;
  /** Spacing + radius scale violation counts. */
  designTokenDrift?: { spacing: number; radius: number };
}

/**
 * Run the maintenance-cost scan. We delegate to `runScan` to get the
 * full report (slopIndex, architectureConsistency, aiSecurityRisk,
 * issues, fileCount), then optionally re-run `runDrift` for the
 * constitution violation count. The cost itself is a pure-function
 * aggregation — fast, no file IO.
 */
export async function runMaintenanceCostScan(
  cwd: string,
  config: ResolvedConfig,
  options: MaintenanceCostOptions = {},
): Promise<MaintenanceCostScanResult> {
  const maxFiles = options.maxFiles ?? 500;
  const cliOptions: CliGlobalOptions = {
    workspace: cwd,
    quiet: true,
    format: 'json',
    telemetry: false,
  };
  const scan = await runScan(cliOptions);
  setLoggerQuiet(false);

  // Re-run drift only when a constitution is declared. Cheap (~200ms
  // on 500 files), but worth the cap.
  let constitutionViolations: number | undefined;
  if (config.constitution) {
    try {
      const drift = await runDrift(cwd, config, { maxFiles });
      constitutionViolations = drift.totalViolations;
    } catch {
      constitutionViolations = undefined;
    }
  }

  // Design-token drift lives on the architecture deductions.
  const spacing = scan.report.architectureDeductions?.find(
    (d) => d.category === 'spacingScaleViolations',
  )?.count ?? 0;
  const radius = scan.report.architectureDeductions?.find(
    (d) => d.category === 'radiusScaleViolations',
  )?.count ?? 0;
  const designTokenDrift = spacing + radius > 0 ? { spacing, radius } : undefined;

  const hasAiSignals = detectAiSignals(scan.report, config);

  // Use the convenience wrapper that pulls everything from the report.
  const result = computeAiMaintenanceCostFromReport(
    {
      aiSlopScore: scan.report.aiSlopScore,
      engineeringHygiene: scan.report.engineeringHygiene,
      security: scan.report.security,
      repositoryHealth: scan.report.repositoryHealth,
      architectureConsistency: scan.report.architectureConsistency,
      aiSecurityRisk: scan.report.aiSecurityRisk,
      highSeverityIssueCount: scan.report.issues.filter(
        (i) => i.severity === 'high',
      ).length,
      issues: scan.report.issues.map((i) => ({ severity: i.severity })),
      fileCount: scan.report.fileCount,
    },
    {
      constitutionViolations,
      designTokenDrift,
      hasAiSignals,
    },
  );

  return { result, scan, constitutionViolations, designTokenDrift };
}

/**
 * Heuristic: did the codebase have AI-typical signals? Used to apply
 * the 1.5–2.5× AI multiplier in the monthly-USD formula. Cheap, fully
 * heuristic — three binary tests on existing scan output.
 */
function detectAiSignals(
  report: ScanRunResult['report'],
  _config: ResolvedConfig,
): boolean {
  // 1. AI-typical rules fired (visual/inline-style, logic/weak-types).
  const aiRuleCount = report.issues.filter(
    (i) => i.aiSpecific === true,
  ).length;
  if (aiRuleCount >= 3) return true;
  // 2. Constitution has any violations (agents drift off the declared
  //    stack faster than humans do).
  // (We don't have violations here — that's done in the caller. Skipped.)
  return false;
}

/**
 * Render the maintenance-cost result for terminal / machine consumption.
 */
export function formatMaintenanceCostReport(
  result: MaintenanceCostScanResult,
  opts: { json?: boolean } = {},
): string {
  if (opts.json) {
    return JSON.stringify(
      {
        cost: result.result.cost,
        health: result.result.health,
        monthlyUSD: result.result.monthlyUSD,
        axes: result.result.axes,
        advice: result.result.advice,
        constitutionViolations: result.constitutionViolations,
        designTokenDrift: result.designTokenDrift,
      },
      null,
      2,
    );
  }

  const lines: string[] = [];
  const bucket = result.result.cost;
  const bucketUpper = bucket.toUpperCase() as Uppercase<AiMaintenanceCost>;
  const health = result.result.health.toFixed(0);
  const monthly = result.result.monthlyUSD.toLocaleString('en-US');
  lines.push(
    `AI Maintenance Cost: ${bucketUpper}  (health ${health}/100, ~$${monthly}/month)`,
  );
  lines.push('');
  lines.push(`  Advice: ${result.result.advice}`);
  lines.push('');
  lines.push('  Per-axis health (worst first):');
  for (const a of result.result.axes) {
    const h = a.health.toFixed(0).padStart(3);
    const label = a.label.padEnd(28);
    lines.push(`    ${h}/100  ${label} — ${a.source}`);
  }
  if (result.constitutionViolations !== undefined) {
    lines.push('');
    lines.push(
      `  Constitution drift: ${result.constitutionViolations} violation(s)`,
    );
  }
  if (result.designTokenDrift) {
    lines.push(
      `  Design-token drift: ${result.designTokenDrift.spacing} spacing, ${result.designTokenDrift.radius} radius`,
    );
  }
  return lines.join('\n');
}

/**
 * Pure helper: derive a stable exit code from a MaintenanceCostScanResult.
 *
 *   0 — informational (or --strict off, regardless of bucket)
 *   1 — --strict set AND bucket ∈ {high, critical}
 */
export function maintenanceCostExitCode(
  result: MaintenanceCostScanResult,
  options: { strict?: boolean } = {},
): 0 | 1 {
  if (!options.strict) return 0;
  return result.result.cost === 'high' || result.result.cost === 'critical' ? 1 : 0;
}
