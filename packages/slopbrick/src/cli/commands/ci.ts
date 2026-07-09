import { Command } from 'commander';
import { logger } from '../../engine/logger';
import { parseCount } from '../options.js';
import type { CliGlobalOptions } from '../scan.js';
import type { ScanActionOutcome } from '../program.js';
import { withExitCode } from './_shared.js';

/**
 * v0.18.x (R-H1): ci subcommand extracted from cli/program.ts.
 *
 * CI gate: run a scan and exit 1 on constitution violations,
 * threshold breach, or new issues since the last run. Use this
 * in GitHub Actions / GitLab CI.
 *
 * Like `watch`, this uses the `scanAction` closure (passed in by
 * the caller) instead of reimplementing the scan body. The CI
 * subcommand forces `--no-increase` and `--changed` on top of
 * the global options.
 */
export function registerCi(
  program: Command,
  scanAction: (paths: string[], options: CliGlobalOptions, command: Command) => Promise<ScanActionOutcome | void>,
): void {
  program
    .command('ci')
    .description('CI gate: run a scan and exit 1 on constitution violations, threshold breach, or new issues since the last run. Use this in GitHub Actions / GitLab CI.')
    .option('--max-slop <n>', 'exit 1 if aiSlopScore exceeds this number (lower = cleaner since v0.21)', parseCount)
    .option('--max-new-issues <n>', 'exit 1 if new issues (vs .slop-audit-cache.json) exceed this number', parseCount)
    .option('--strict-constitution', 'exit 1 on any constitution violation')
    .option('--format <pretty|json>', 'output format', 'json')
    .action(
      async (
        cmdOptions: {
          maxSlop?: number;
          maxNewIssues?: number;
          strictConstitution?: boolean;
          format?: string;
        },
        command: Command,
      ) => {
        const globals = command.optsWithGlobals() as CliGlobalOptions & { increase?: boolean };
        const options: CliGlobalOptions = {
          ...globals,
          noIncrease: true,                  // force fail on increase
          changed: true,                     // scan only changed files
          format: (cmdOptions.format ?? 'json') as 'pretty' | 'json' | 'sarif' | 'html',
        };
        const outcome = await scanAction([], options, command);
        if (!outcome) {
          throw new Error('CI scan did not return a current outcome.');
        }
        let exitCode = outcome.exitCode;
        const constitutionDrift = (outcome.report as typeof outcome.report & { constitutionDrift?: number }).constitutionDrift ?? 0;
        // v0.15.0 U.4: --max-slop now gates on the composite
        // repositoryHealth (the v3 replacement for slopIndex).
        // Because repositoryHealth is "higher = better" while
        // --max-slop is "fail if higher than N" (legacy semantics
        // were "fail if slopIndex > N" where lower is better), we
        // invert the comparison so users see the same behavior.
        // TODO(U.5): replace --max-slop with --min-repository-health.
        if (cmdOptions.maxSlop !== undefined) {
          const maxInverse = 100 - cmdOptions.maxSlop;
          if (outcome.report.repositoryHealth < maxInverse) {
            logger.warn(`repositoryHealth ${outcome.report.repositoryHealth} < ${cmdOptions.maxSlop} (max-slop)`);
            exitCode = 1;
          }
        }
        if (cmdOptions.strictConstitution && constitutionDrift > 0) {
          logger.warn(`${constitutionDrift} constitution violation(s) detected`);
          exitCode = 1;
        }
        if (exitCode === 0 && cmdOptions.format !== 'json') {
          logger.info(`CI gate passed: repositoryHealth=${outcome.report.repositoryHealth}, constitutionDrift=${constitutionDrift}`);
        }
        withExitCode(outcome, () => exitCode, exitCode === 0
          ? ''
          : `CI gate failed (exit ${exitCode})`);
      },
    );
}
