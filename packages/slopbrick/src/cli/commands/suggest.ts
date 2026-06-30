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
import { runScan, type CliGlobalOptions } from '../scan';

export function registerSuggest(program: Command): void {
  program
    .command('suggest')
    .description('print remediation advice')
    .action(async (_cmdOptions: Record<string, unknown>, command: Command) => {
      const options = command.optsWithGlobals() as CliGlobalOptions;
      const { report } = await runScan(options);
      const cwd = resolve(options.workspace ?? process.cwd());
      logger.info(formatAdvice(report));
      const diff = formatUnifiedDiff(report, cwd);
      if (diff) logger.info(diff);
      process.exit(0);
    });
}
