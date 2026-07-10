import type { ProjectReport } from '../types';

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
