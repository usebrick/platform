import type { ProjectReport } from '../types';

export type GitSelectionOptions = {
  staged?: boolean;
  changed?: boolean;
  since?: string;
  diffRef?: string;
};

export type ScanValiditySummary = Pick<
  ProjectReport,
  'requested' | 'analyzed' | 'failed' | 'skipped' | 'scanAccounting' | 'selectionAccounting'
> & Partial<Pick<ProjectReport, 'completionStatus' | 'scoreValidity'>>;

export const NOT_APPLICABLE_SCAN_REASON = 'no-files-analyzed' as const;
export const NOT_APPLICABLE_SCAN_MESSAGE =
  'NO FILES ANALYSED — scores are not applicable for gating.' as const;

export interface NotApplicableScanMetadata {
  completionStatus: 'empty';
  scoreValidity: 'not-applicable';
  reason: typeof NOT_APPLICABLE_SCAN_REASON;
  message: typeof NOT_APPLICABLE_SCAN_MESSAGE;
  requested: number;
  analyzed: number;
  failed: number;
  skipped: number;
  scanAccounting?: ProjectReport['scanAccounting'];
  selectionAccounting?: ProjectReport['selectionAccounting'];
  diagnostics?: {
    parseErrors: NonNullable<ProjectReport['parseErrors']>;
  };
}

/** Score-bearing persistence and comparisons require at least one request. */
export function isNotApplicableScan(scan: ScanValiditySummary): boolean {
  return scan.scoreValidity === 'not-applicable' || scan.requested === 0;
}

/**
 * A partial completion marker is itself enough to make a report non-gating.
 * The explicit `scoreValidity` field is preferred, but accepting the
 * completion marker here keeps old/programmatic reports fail-closed when a
 * producer forgot to copy the derived validity field.
 */
export function isIncompleteScan(scan: ScanValiditySummary): boolean {
  return scan.scoreValidity === 'incomplete' || scan.completionStatus === 'partial';
}

/**
 * Every Git-selected subset is observational: it may report on the selected
 * bytes, but it must not teach or overwrite whole-project state.
 */
export function isReadOnlyGitSubset(options: GitSelectionOptions): boolean {
  return options.staged === true ||
    options.changed === true ||
    options.since !== undefined ||
    options.diffRef !== undefined;
}

/**
 * Project a score-bearing internal report into the only metadata that is
 * truthful when no files were analysed. Serializers use this at their wire
 * boundary so placeholder 0/100 values cannot escape as apparent evidence.
 */
export function projectNotApplicableScan(report: ProjectReport): NotApplicableScanMetadata {
  return {
    completionStatus: 'empty',
    scoreValidity: 'not-applicable',
    reason: NOT_APPLICABLE_SCAN_REASON,
    message: NOT_APPLICABLE_SCAN_MESSAGE,
    requested: report.requested ?? 0,
    analyzed: report.analyzed ?? 0,
    failed: report.failed ?? 0,
    skipped: report.skipped ?? 0,
    ...(report.scanAccounting ? { scanAccounting: report.scanAccounting } : {}),
    ...(report.selectionAccounting ? { selectionAccounting: report.selectionAccounting } : {}),
    ...(report.parseErrors?.length
      ? { diagnostics: { parseErrors: report.parseErrors } }
      : {}),
  };
}

/**
 * A Git-scoped scan with no selected files is an intentional successful
 * no-op, not a clean scored scan. Keep this predicate shared by rendering,
 * persistence, and exit handling so those boundaries cannot drift apart.
 */
export function isGitScopedEmptySelection(
  scan: ScanValiditySummary,
  options: GitSelectionOptions,
): boolean {
  return isNotApplicableScan(scan) && isReadOnlyGitSubset(options);
}

export function formatGitScopedEmptySelectionNotice(): string {
  return 'NO FILES SELECTED — scores are not applicable.';
}

/**
 * Render the observable file-accounting contract without inventing counts for
 * direct-file scans. `selectionAccounting` is intentionally optional because
 * a direct path has no discovery population from which exclusions can be
 * derived.
 */
export function formatScanAccountingSummary(report: ScanValiditySummary): string | null {
  const accounting = report.scanAccounting;
  const selection = report.selectionAccounting;
  if (!accounting && !selection && report.requested === undefined) return null;

  const requested = report.requested ?? accounting?.selected ?? 0;
  const analyzed = report.analyzed ?? accounting?.analyzed ?? 0;
  // Selection-only/legacy reports do not expose the detailed outcome buckets;
  // do not turn an unknown zero-finding count into a fabricated fact.
  const zeroFinding = accounting?.zeroFinding;
  // `skipped` is a broader completion counter and is not synonymous with
  // incremental-cache hits. Keep the cache count unknown when the detailed
  // accounting object is absent rather than relabeling skipped files.
  const cached = accounting?.incrementalCached;
  const excluded = selection
    ? Object.values(selection.excluded).reduce((sum, count) => sum + count, 0)
    : undefined;
  const failureSummary = accounting
    ? `parse ${accounting.parseFailed}, timeout ${accounting.timedOut}, crash ${accounting.crashed}, internal ${accounting.internalFailed}`
    : 'n/a';

  return `Accounting: requested ${requested}; analyzed ${analyzed}; zero findings ${zeroFinding === undefined ? 'n/a' : zeroFinding}; ` +
    `excluded ${excluded === undefined ? 'n/a' : excluded}; failures (${failureSummary}); ` +
    `cached ${cached === undefined ? 'n/a' : cached}.`;
}

/**
 * Human-readable gate-safety notice shared by every report renderer.
 * Reports with neither validity nor a partial completion marker intentionally
 * keep their historical presentation; legacy partial markers fail closed.
 */
export function formatScanValidityNotice(report: ScanValiditySummary): string | null {
  if (isIncompleteScan(report)) {
    const notice = `INCOMPLETE SCAN — scores are not valid for gating. requested ${report.requested ?? 0}; analyzed ${report.analyzed ?? 0}; failed ${report.failed ?? 0}; skipped ${report.skipped ?? 0}. See scan accounting.`;
    const accounting = formatScanAccountingSummary(report);
    return accounting ? `${notice}\n${accounting}` : notice;
  }
  if (report.scoreValidity === 'not-applicable') {
    return NOT_APPLICABLE_SCAN_MESSAGE;
  }
  return null;
}
