// Test Quality score (Phase 5 — Test Intelligence).
//
// Aggregates the four `test/*` rules into a single 0–100 score.
// Lower = more issues (mirrors `slopIndex`'s shape, where 0 is cleanest).
// 100 = no test-code issues found.
//
// Formula (simple subtractive from 100, clamped to [0, 100]):
//   testQuality = 100 - Σ(weighted issue points)
//   weight = 5 (high) / 3 (medium) / 1 (low)
//
// Per-category buckets aren't used here — the score is intentionally
// one-dimensional, just like the headline `slopIndex`. A future
// per-rule breakdown could mirror the `architectureDeductions` shape.
//
// This module reuses the same issue list the scan already collected.
// It does NOT re-run the engine — caller is responsible for invoking
// `slopbrick test` (which uses a test-file-aware include glob and the
// full scan pipeline).

import type { Issue, Severity } from '../types';

export interface TestQualityScore {
  /** Final 0-100 score (100 = no test issues). */
  score: number;
  /** How many test-rule issues contributed. */
  totalIssues: number;
  /** Counts grouped by severity, useful for dashboards. */
  bySeverity: Record<Severity, number>;
  /** Counts grouped by rule ID. */
  byRule: Record<string, number>;
  /** Highest-level summary line, e.g. "Test quality: 78/100". */
  headline: string;
}

/**
 * Same severity weights as `src/engine/metrics.ts`. Kept inlined so
 * this module stays import-cheap (no engine dependency).
 */
const WEIGHTS: Record<Severity, number> = {
  low: 1,
  medium: 3,
  high: 5,
};

/**
 * Build the Test Quality score from a list of test-rule issues.
 * Always returns a populated `TestQualityScore` — never throws.
 *
 * Penalties are clamped so a single 1000-issue repo can't go below 0.
 * The deduction is the sum of weighted issue points divided by 5 so
 * the score lands at a human-recognizable range (a repo with 5 high-
 * severity issues drops 25 points; 20 mediums drops 12 points).
 */
export function buildTestQualityScore(
  issues: readonly Issue[],
  scannedFiles = 0,
): TestQualityScore {
  const bySeverity: Record<Severity, number> = { low: 0, medium: 0, high: 0 };
  const byRule: Record<string, number> = {};
  let deduction = 0;
  for (const issue of issues) {
    if (issue.category !== 'test') continue;
    const weight = WEIGHTS[issue.severity] ?? 0;
    bySeverity[issue.severity] = (bySeverity[issue.severity] ?? 0) + 1;
    byRule[issue.ruleId] = (byRule[issue.ruleId] ?? 0) + 1;
    deduction += weight;
  }

  // Scale: every 5 weighted points = 1 score deduction. So a repo with
  // 5 high-severity issues (5×5 = 25 weighted) loses 5 points; 20
  // medium-severity issues (20×3 = 60) loses 12. Tuned so small repos
  // don't drop to 0 from one fixture, and large noisy repos still
  // bottom out near 30-50 instead of 0.
  const units = Math.ceil(deduction / 5);
  const score = Math.max(0, Math.min(100, 100 - units));

  const headline =
    scannedFiles > 0
      ? `Test quality: ${score}/100 (${scannedFiles} test file${scannedFiles === 1 ? '' : 's'} scanned)`
      : `Test quality: ${score}/100`;

  return {
    score,
    totalIssues: issues.length,
    bySeverity,
    byRule,
    headline,
  };
}

/**
 * Render the score as a human-readable text block for the
 * `slopbrick test` subcommand.
 */
export function formatTestQualityScore(score: TestQualityScore): string {
  const lines: string[] = [];
  lines.push(score.headline);
  lines.push('');
  lines.push(`  Total test issues: ${score.totalIssues}`);
  if (score.totalIssues === 0) {
    lines.push('');
    lines.push('  No test-code issues found. ✓');
    return lines.join('\n');
  }
  const sevParts: string[] = [];
  if (score.bySeverity.high > 0) sevParts.push(`high=${score.bySeverity.high}`);
  if (score.bySeverity.medium > 0) sevParts.push(`medium=${score.bySeverity.medium}`);
  if (score.bySeverity.low > 0) sevParts.push(`low=${score.bySeverity.low}`);
  if (sevParts.length > 0) {
    lines.push(`  By severity: ${sevParts.join(', ')}`);
  }
  const ruleEntries = Object.entries(score.byRule).sort((a, b) => b[1] - a[1]);
  if (ruleEntries.length > 0) {
    lines.push('');
    lines.push('  By rule:');
    for (const [rule, count] of ruleEntries) {
      lines.push(`    ${rule.padEnd(34)} ${count}`);
    }
  }
  return lines.join('\n');
}