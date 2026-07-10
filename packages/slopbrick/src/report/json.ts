import type { ProjectReport } from '../types';
import { SCORE_BRIEFS } from './score-contract.js';
import { isNotApplicableScan, projectNotApplicableScan } from './scan-validity.js';

/**
 * v0.43.0: every JSON report now embeds a `scoreBriefs` object —
 * one line per headline score — so any JSON consumer (CI dashboard,
 * agent prompt, markdown generator, web UI) gets the same plain-language
 * explanation that the website calibration section shows, and that the
 * CLI `--brief` mode renders as the second-line under each score.
 *
 * The brief strings are the user-facing language. We keep them here,
 * not in the engine, because:
 *
 *   1. The engine measures; the report renders. The brief is rendering.
 *   2. The wording is shared with the website (useubrick.dev calibration
 *      cards) — a single source of truth avoids drift.
 *   3. Adding it to ProjectReport would couple the wire format to
 *      marketing copy; an enrichment step at JSON write keeps the
 *      schema clean.
 */
export function formatJson(
  report: ProjectReport,
  options: { includeScoreExplanation?: boolean } = {},
): string {
  if (isNotApplicableScan(report)) {
    const envelope = {
      version: report.version,
      generatedAt: report.generatedAt,
      ...(report.configPath ? { configPath: report.configPath } : {}),
      ...projectNotApplicableScan(report),
    };
    return JSON.stringify(envelope, null, 2);
  }

  const { scoreExplanation, ...withoutScoreExplanation } = report;
  const enriched = {
    ...withoutScoreExplanation,
    scoreBriefs: SCORE_BRIEFS,
    ...(options.includeScoreExplanation && scoreExplanation ? { scoreExplanation } : {}),
  };
  return JSON.stringify(enriched, null, 2);
}
