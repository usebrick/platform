// Test Quality CLI surface (Phase 5 — Test Intelligence).
//
// `slopbrick test` runs the full scan pipeline with test files
// included, then filters results to the four `test/*` rules and
// computes a Test Quality score (0-100, lower = more issues).
//
//   runTestScan(cwd, options) -> TestScanResult
//   formatTestReport(result, { json }) -> string
//   testExitCode(result) -> 0 | 1
//
// Exit codes (set by program.ts):
//   0  — clean or informational
//   1  — `--strict` and any test issue was found
//   2  — fatal error (config not loadable, IO failure)

import { resolve } from 'node:path';
import { runScan } from './scan';
import type { CliGlobalOptions, ScanRunResult } from './scan';
import { buildTestQualityScore, formatTestQualityScore } from '../engine/test-quality';
import type { TestQualityScore } from '../engine/test-quality';
import { logger, setLoggerQuiet } from '../engine/logger';
import type { Issue, ResolvedConfig } from '../types';

export interface TestScanOptions {
  /** Cap on files scanned. Default: 1000. */
  maxFiles?: number;
  /** When true, exit 1 on any test issue (CI gate). */
  strict?: boolean;
}

export interface TestScanResult {
  /** 0-100 Test Quality score. */
  testQuality: TestQualityScore;
  /** Filtered issues (only `category === 'test'`). */
  testIssues: Issue[];
  /** How many files matched the test-file include glob. */
  scannedFiles: number;
  /** The effective include globs used. */
  include: string[];
  /** True when --strict was passed AND issues were found. */
  passed: boolean;
}

const TEST_INCLUDE_GLOBS = [
  '**/*.test.{ts,tsx,js,jsx}',
  '**/*.spec.{ts,tsx,js,jsx}',
  '**/*.stories.{ts,tsx,js,jsx}',
  '**/__tests__/**/*.{ts,tsx,js,jsx}',
  '**/__fixtures__/**/*.{ts,tsx,js,jsx,json}',
];

/**
 * Run the test scan. We override the include globs to match test
 * files only, run the full engine (so all 56 rules get a chance to
 * fire — though most will short-circuit on non-relevant files), then
 * filter to `category === 'test'`. We keep the rest of the pipeline
 * untouched so JSON / HTML reporters still receive the full report.
 */
export async function runTestScan(
  cwd: string,
  config: ResolvedConfig,
  options: TestScanOptions = {},
): Promise<{ result: TestScanResult; scan: ScanRunResult }> {
  const include = TEST_INCLUDE_GLOBS;
  const cliOptions: CliGlobalOptions = {
    include,
    workspace: cwd,
    quiet: true,
    format: 'json',
    // Suppress the architecture/security sub-scores in the JSON — we
    // don't want them crowding the test-only output. (They still
    // compute silently in the background for users who pipe the JSON.)
    telemetry: false,
  };

  const scan = await runScan(cliOptions);
  // Restore logger to non-quiet so our own logger.info() below is audible.
  // runScan() flips the module-level logger to quiet mode internally; we
  // intentionally suppress runScan's cache/scan progress while still
  // emitting the test report. Without this restore, the formatTestReport
  // output gets swallowed and the test command prints nothing.
  setLoggerQuiet(false);
  const testIssues = scan.report.issues.filter((issue) => issue.category === 'test');
  const testQuality = buildTestQualityScore(
    testIssues,
    scan.report.fileCount,
  );
  const result: TestScanResult = {
    testQuality,
    testIssues,
    scannedFiles: scan.report.fileCount,
    include,
    passed: !options.strict || testIssues.length === 0,
  };
  return { result, scan };
}

/**
 * Render the test scan result for terminal / machine consumption.
 */
export function formatTestReport(
  result: TestScanResult,
  opts: { json?: boolean } = {},
): string {
  if (opts.json) {
    return JSON.stringify(
      {
        testQuality: result.testQuality.score,
        scannedFiles: result.scannedFiles,
        totalIssues: result.testIssues.length,
        bySeverity: result.testQuality.bySeverity,
        byRule: result.testQuality.byRule,
        issues: result.testIssues,
        include: result.include,
        passed: result.passed,
      },
      null,
      2,
    );
  }

  const lines: string[] = [];
  lines.push(formatTestQualityScore(result.testQuality));
  if (result.testIssues.length > 0) {
    lines.push('');
    lines.push('  Issues:');
    // Group by file so the output mirrors how `pr` and `security` work.
    const byFile = new Map<string, Issue[]>();
    for (const issue of result.testIssues) {
      const file = issue.filePath ?? '<unknown>';
      const list = byFile.get(file) ?? [];
      list.push(issue);
      byFile.set(file, list);
    }
    const sortedFiles = [...byFile.keys()].sort();
    for (const file of sortedFiles) {
      const issues = byFile.get(file) ?? [];
      const rel = file.startsWith(resolve(process.cwd())) ? file : file;
      lines.push('');
      lines.push(`  ${rel}`);
      for (const issue of issues.slice(0, 20)) {
        const sev = issue.severity.padEnd(7);
        lines.push(`    [${sev}] ${issue.ruleId} — line ${issue.line}`);
        lines.push(`              ${issue.message}`);
      }
      if (issues.length > 20) {
        lines.push(`    …and ${issues.length - 20} more`);
      }
    }
  }
  return lines.join('\n');
}

/**
 * Pure helper: derive a stable exit code from a TestScanResult.
 * Used by program.ts action and tests.
 *
 *   0 — informational (clean repo OR no strict flag)
 *   1 — strict mode AND at least one test issue
 */
export function testExitCode(result: TestScanResult): 0 | 1 {
  return result.passed ? 0 : 1;
}