import type { ProjectReport } from '../types';

type GitSelectionOptions = {
  staged?: boolean;
  changed?: boolean;
};

type ScanValiditySummary = Pick<ProjectReport, 'requested' | 'scoreValidity'>;

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
  return isNotApplicableScan(scan) && (options.staged === true || options.changed === true);
}

export function formatGitScopedEmptySelectionNotice(): string {
  return 'NO FILES SELECTED — scores are not applicable.';
}

/**
 * Human-readable gate-safety notice shared by every report renderer.
 * Historical/programmatic reports omit scoreValidity and intentionally keep
 * their existing presentation.
 */
export function formatScanValidityNotice(report: ProjectReport): string | null {
  if (report.scoreValidity === 'incomplete') {
    return `INCOMPLETE SCAN — scores are not valid for gating. requested ${report.requested ?? 0}; analyzed ${report.analyzed ?? 0}; failed ${report.failed ?? 0}; skipped ${report.skipped ?? 0}. See scan accounting.`;
  }
  if (report.scoreValidity === 'not-applicable') {
    return NOT_APPLICABLE_SCAN_MESSAGE;
  }
  return null;
}
