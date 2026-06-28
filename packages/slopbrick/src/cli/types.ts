// Public CLI types for the scan command.
//
// Extracted from `cli/scan.ts` so the scan orchestrator can focus on
// the pipeline. The types are re-exported from `scan.ts` for
// backwards compatibility — callers should prefer importing them
// from `./types` directly when possible.

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
  tighten?: boolean;
  workerScript?: string;
  strict?: boolean;
  noIncrease?: boolean;
  cache?: boolean;
  telemetry?: boolean;
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

export interface ScanRunResult {
  report: import('../types').ProjectReport;
  scores: import('../types').ComponentScore[];
  results: import('../types').FileScanResult[];
  config: import('../types').ResolvedConfig;
  noIncreaseFailure: boolean;
  baseline?: import('../types').BaselineCache;
  machineReadableStdout: boolean;
}
