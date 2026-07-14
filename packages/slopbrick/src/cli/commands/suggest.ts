/**
 * v0.17.5 (R-H1): `slopbrick suggest` — print remediation advice.
 *
 * Module pattern: each `cli/commands/<name>.ts` exports a single
 * `register<X>(program)` function that wires the Command + its
 * options + the action callback. `cli/program.ts` calls all of them.
 */

import { resolve } from 'node:path';
import { Command } from 'commander';

import { formatAdvice } from '../../report/advice';
import { formatUnifiedDiff } from '../../report/unified-diff';
import { logger } from '../../engine/logger';
import { runScan } from '../scan';
import type { CliGlobalOptions } from '../scan';
import {
  formatGitScopedEmptySelectionNotice,
  formatScanValidityNotice,
  isGitScopedEmptySelection,
  isIncompleteScan,
  isNotApplicableScan,
} from '../../report/scan-validity.js';

export function registerSuggest(program: Command): void {
  program
    .command('suggest')
    .description('print remediation advice')
    .action(async (_cmdOptions: Record<string, unknown>, command: Command) => {
      const options = command.optsWithGlobals() as CliGlobalOptions;
      const { report } = await runScan(options);
      const cwd = resolve(options.workspace ?? process.cwd());

      // Keep the standalone subcommand on the same fail-closed boundary as
      // the `--suggest` scan flag. A partial report still contains diagnostic
      // findings, but its category burdens and proposed patches are not
      // trustworthy remediation guidance.
      if (isIncompleteScan(report) || isNotApplicableScan(report)) {
        const gitScopedNoOp = isNotApplicableScan(report) &&
          isGitScopedEmptySelection(report, options);
        logger.info(
          gitScopedNoOp
            ? formatGitScopedEmptySelectionNotice()
            : formatScanValidityNotice(report) ??
              (isIncompleteScan(report)
                ? 'INCOMPLETE SCAN — scores are not valid for gating.'
                : 'NO FILES ANALYSED — scores are not applicable for gating.'),
        );
        process.exit(gitScopedNoOp ? 0 : 1);
        return;
      }

      logger.info(formatAdvice(report));
      const diff = formatUnifiedDiff(report, cwd);
      if (diff) logger.info(diff);
      process.exit(0);
    });
}
