// Print the summary of `--fix` mode results.
//
// Extracted from `cli/scan.ts` so the scan pipeline doesn't need to
// know how fix results are surfaced to the user. The function writes
// to the logger (not stdout) and returns aggregate counts the caller
// can use to set the exit code.

import { logger } from '../../engine/logger';
import type { FixResult } from '../../fix';

export interface FixSummary {
  totalApplied: number;
  totalSkipped: number;
  hasErrors: boolean;
}

export function printFixSummary(
  results: FixResult[],
  quiet: boolean,
): FixSummary {
  let totalApplied = 0;
  let totalSkipped = 0;
  let hasErrors = false;

  for (const result of results) {
    totalApplied += result.applied.length;
    totalSkipped += result.skipped.length;
    if (result.errors && result.errors.length > 0) {
      hasErrors = true;
    }

    if (quiet) continue;

    const entries: string[] = [];
    for (const app of result.applied) {
      entries.push(`  [applied] ${app.ruleId}: ${app.description}`);
    }
    for (const app of result.skipped) {
      entries.push(`  [skipped] ${app.ruleId}: ${app.description}`);
    }
    for (const err of result.errors ?? []) {
      entries.push(`  [error] ${err}`);
    }

    if (entries.length > 0) {
      logger.info(result.filePath);
      for (const entry of entries) {
        logger.info(entry);
      }
    }
  }

  if (!quiet) {
    logger.info(
      `Fixes applied: ${totalApplied}, skipped: ${totalSkipped}${hasErrors ? ', errors detected' : ''}`,
    );
  }

  return { totalApplied, totalSkipped, hasErrors };
}
