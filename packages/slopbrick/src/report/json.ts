import type { ProjectReport } from '../types';

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
const SCORE_BRIEFS: { aiSlopScore: string; engineeringHygiene: string; security: string; repositoryHealth: string } = {
  aiSlopScore: 'raw amount of AI slop, 0-100',
  engineeringHygiene: 'cross-category consistency, 0-100',
  security: 'security posture, 0-100 (higher is better)',
  repositoryHealth: 'weighted composite, 0-100',
};

export function formatJson(report: ProjectReport): string {
  const enriched = {
    ...report,
    scoreBriefs: SCORE_BRIEFS,
  };
  return JSON.stringify(enriched, null, 2);
}
