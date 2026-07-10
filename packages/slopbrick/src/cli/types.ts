// Public CLI types for the scan command.
//
// Extracted from `cli/scan.ts` so the scan orchestrator can focus on
// the pipeline. The types are re-exported from `scan.ts` for
// backwards compatibility — callers should prefer importing them
// from `./types` directly when possible.

import type { ScanAccounting } from '../types';

export interface ScanProjectOptions {
  cwd: string;
  framework?: string;
  include?: string[];
  exclude?: string[];
  aiOnly?: boolean;
  humanOnly?: boolean;
  ignoreWcag22?: boolean;
  since?: string;
  staged?: boolean;
  changed?: boolean;
  /** v0.10.1: VibeDrift-compatible git-ref filter. When set, only files
   * changed since this ref are scanned and the report includes a
   * PR Slop Score. Equivalent to --since <ref> + PR Slop Score. */
  diffRef?: string;
  // hash matches the persisted cache at `--cache-path`.
  incremental?: boolean;
  cachePath?: string;
  tokens?: string;
  threadCount?: number;
  /** Restrict the scan to rules in the security/* namespace. */
  securityOnly?: boolean;
  /** Force the complete report view when paired with --brief. */
  full?: boolean;
  /** Disable ANSI color output for this invocation. */
  noColor?: boolean;
  tighten?: boolean;
  workerScript?: string;
  strict?: boolean;
  noIncrease?: boolean;
  cache?: boolean;
  telemetry?: boolean;
  /** v0.42.0 (§3a.4): opt-in flag for the AGENTS.md auto-refresh hook.
   *  When true, `slopbrick scan` writes the freshly-built snippet body
   *  inside the `<!-- slopbrick:begin:v3 --> ... -->` block in
   *  AGENTS.md / CLAUDE.md, replacing only that block (user-edited
   *  content outside the markers is preserved). Default false so
   *  first-time users aren't surprised. */
  autoRefreshSnippets?: boolean;
}

export interface ScanRunOptions extends Omit<ScanProjectOptions, 'cwd'> {
  workspace?: string;
  fix?: boolean;
  dryRun?: boolean;
  // v0.10.1: renamed from --diff (boolean) to --show-fixes-diff (boolean)
  // to free the `--diff <ref>` name for the VibeDrift-compatible
  // git-ref alias of --since.
  showFixesDiff?: boolean;
  doctor?: boolean;
  watch?: boolean;
  quiet?: boolean;
  /** Refactor 1: enable debug logging (file paths, timings, rule-fire counts). */
  verbose?: boolean;
  trend?: number;
  cache?: boolean;
  baseline?: boolean;
  format?: 'pretty' | 'json' | 'sarif' | 'html';
  json?: true | string;
  html?: true | string;
  telemetry?: boolean;
  rule?: string;
  // v0.10.2 (Phase 10): multi-value rule filters for the calibrator.
  // `--include-rule` and `--exclude-rule` may be specified multiple
  // times; `loadBuiltins` applies them after parsing.
  includeRules?: string[];
  excludeRules?: string[];
  /** v0.24.0 (Workstream C): opt-in network beacon. Distinct from
   *  `telemetry` (which gates the local flywheel). When true AND
   *  `SLOPBRICK_TELEMETRY_ENDPOINT` is set, a single 8-field POST
   *  fires at scan end (fire-and-forget, 5s timeout). Default OFF. */
  reportUsage?: boolean;
}

export interface CliGlobalOptions extends ScanRunOptions {
  // format/json/html are inherited from ScanRunOptions — no need to redeclare.
  suggest?: boolean;
  heatmap?: boolean;
  /** v0.14.5i (P3): render the top 5 rules dragging the score down
   *  without the full report. For quick triage on a slow terminal. */
  whyFailing?: boolean;
  /** v0.14.5j (P10): terse output for CI / scripts. Just the headline,
   *  the verdict, the threshold, and the delta. No category breakdown,
   *  no top offenders, no issues dump. */
  brief?: boolean;
}

/**
 * v0.24.0 (Workstream C): stats emitted to the opt-in network
 * beacon. Computed in `runScan` from the in-flight scan context
 * (no extra I/O, no extra work) and surfaced on the return value
 * so the CLI layer can hand them to `BeaconEmitter` after the
 * report is rendered.
 */
export interface ScanStats {
  /** Outcome of the file scan before threshold evaluation. */
  status: ScanCompletionStatus;
  /** Files selected after discovery and all filters. */
  requested: number;
  /** Files successfully analyzed by a worker. */
  analyzed: number;
  /** Files whose worker result contained a parse error. */
  failed: number;
  /** Files omitted because the incremental cache was unchanged. */
  skipped: number;
  /** Detailed file-outcome accounting mirrored in the JSON report. */
  scanAccounting?: ScanAccounting;
  /** UUID v4 generated at the top of `runScan`. */
  scanId: string;
  /** `results.length` — files that ran through the worker pool
   *  (excludes files skipped by the incremental cache). */
  fileCount: number;
  /** `builtinRules.length` (or 1 when `--rule <id>` is in effect). */
  ruleCount: number;
  /** Wall-clock scan duration in milliseconds (entry → return). */
  durationMs: number;
}

export type ScanCompletionStatus = 'complete' | 'empty' | 'partial';

export interface ScanRunResult {
  report: import('../types').ProjectReport;
  scores: import('../types').ComponentScore[];
  results: import('../types').FileScanResult[];
  config: import('../types').ResolvedConfig;
  noIncreaseFailure: boolean;
  baseline?: import('../types').BaselineCache;
  machineReadableStdout: boolean;
  /** v0.24.0: always present; consumed by `BeaconEmitter` when
   *  `--report-usage` + `SLOPBRICK_TELEMETRY_ENDPOINT` are set. */
  scanStats: ScanStats;
}
