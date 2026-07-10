import type { ProjectReport } from '../types';

type GitSelectionOptions = {
  staged?: boolean;
  changed?: boolean;
};

/**
 * A Git-scoped scan with no selected files is an intentional successful
 * no-op, not a clean scored scan. Keep this predicate shared by rendering,
 * persistence, and exit handling so those boundaries cannot drift apart.
 */
export function isGitScopedEmptySelection(
  scan: Pick<ProjectReport, 'requested'> | { requested: number },
  options: GitSelectionOptions,
): boolean {
  return scan.requested === 0 && (options.staged === true || options.changed === true);
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
    return 'NO FILES ANALYSED — scores are not applicable for gating.';
  }
  return null;
}
