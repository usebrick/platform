import { Command } from 'commander';
import { logger } from '../../engine/logger';
import { parseCount, parseNonNegativeCount } from '../options.js';
import type { CliGlobalOptions } from '../scan.js';
import type { ScanActionOutcome } from '../program.js';
import { withExitCode } from './_shared.js';

/**
 * v0.18.x (R-H1): ci subcommand extracted from cli/program.ts.
 *
 * CI gate: run a scan and exit 1 on constitution violations,
 * threshold breach, no-increase regression, or a configured new-debt limit. Use this
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
    .description('CI gate: run a scan and exit 1 on constitution violations, threshold breach, no-increase regression, or configured new debt. Use this in GitHub Actions / GitLab CI.')
    .option('--max-slop <n>', 'exit 1 if aiSlopScore exceeds this number (lower = cleaner since v0.21)', parseCount)
    .option('--max-new-issues <n>', 'exit 1 if stable finding identities exceed this new-debt limit (requires a durable baseline)', parseNonNegativeCount)
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
          ciGate: {
            maxSlop: cmdOptions.maxSlop,
            maxNewIssues: cmdOptions.maxNewIssues,
            strictConstitution: cmdOptions.strictConstitution,
          },
          format: (cmdOptions.format ?? 'json') as 'pretty' | 'json' | 'sarif' | 'html',
        };
        const outcome = await scanAction([], options, command);
        if (!outcome) {
          throw new Error('CI scan did not return a current outcome.');
        }
        // Incomplete/empty scans have no valid numeric gate result. The
        // shared scan action already rendered their truthful status; do not
        // reinterpret synthetic numbers as max-slop or "CI gate passed".
        if (outcome.report.scoreValidity !== 'valid') {
          withExitCode(
            outcome,
            () => outcome.exitCode,
            outcome.exitCode === 0 ? '' : `CI gate failed (exit ${outcome.exitCode})`,
          );
          return;
        }
        const exitCode = outcome.gateDecision?.exitCode ?? outcome.exitCode;
        const constitutionDrift = (outcome.report as typeof outcome.report & { constitutionDrift?: number }).constitutionDrift ?? 0;
        if (exitCode === 0 && cmdOptions.format !== 'json') {
          logger.info(`CI gate passed: repositoryHealth=${outcome.report.repositoryHealth}, constitutionDrift=${constitutionDrift}`);
        }
        withExitCode(outcome, () => exitCode, exitCode === 0
          ? ''
          : `CI gate failed (exit ${exitCode})`);
      },
    );
}
