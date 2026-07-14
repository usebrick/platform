import type { ProjectReport } from '../types';
import { SCORE_BRIEFS, SCORE_CONTRACT } from './score-contract.js';
import { isIncompleteScan, isNotApplicableScan, projectNotApplicableScan } from './scan-validity.js';

const INCOMPLETE_SCORE_AGGREGATE_FIELDS = [
  'aiSlopScore',
  'engineeringHygiene',
  'security',
  'repositoryHealth',
  'compositeScore',
] as const;

/**
 * Keep an incomplete machine report useful for diagnostics without exposing
 * partial headline values as if they were a completed project measurement.
 */
function withoutIncompleteScoreAggregates(report: ProjectReport): Record<string, unknown> {
  const projection: Record<string, unknown> = { ...report };
  for (const field of INCOMPLETE_SCORE_AGGREGATE_FIELDS) delete projection[field];
  return projection;
}

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

  // Keep assemblyHealth in complete-report JSON for historical wire/telemetry
  // consumers, but mark it compatibility-only in scoreContract. The legacy
  // totalScore field is still stripped from the current JSON projection.
  // Incomplete scans additionally omit the four canonical headline values and
  // the project-level Bayesian aggregate. `scoreValidity=incomplete` is the
  // only machine-readable score contract that downstream gates may rely on
  // for that run; compatibility numerics remain diagnostic only.
  const incomplete = isIncompleteScan(report);
  const source = incomplete ? withoutIncompleteScoreAggregates(report) : report;
  const { scoreExplanation, totalScore: _legacyTotalScore, ...withoutLegacyScore } = source;
  const enriched = {
    ...withoutLegacyScore,
    scoreContract: SCORE_CONTRACT,
    scoreBriefs: SCORE_BRIEFS,
    // The opt-in explanation embeds canonical score values. Do not let a
    // diagnostic opt-in reintroduce score aggregates for an incomplete scan.
    ...(options.includeScoreExplanation && !incomplete && scoreExplanation ? { scoreExplanation } : {}),
  };
  return JSON.stringify(enriched, null, 2);
}
