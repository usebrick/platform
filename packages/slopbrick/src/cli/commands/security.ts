import { resolve } from 'node:path';
import { Command } from 'commander';
import { logger } from '../../engine/logger';
import { runScan } from '../scan.js';
import type { CliGlobalOptions } from '../scan.js';
import { computeAiSecurityRisk, formatAiSecurityRiskLine } from '../../engine/ai-security-risk';

/**
 * v0.18.x (R-H1): security subcommand extracted from cli/program.ts.
 *
 * AI Security Risk — categorical severity for security findings
 * disproportionately introduced by AI-generated code. Runs a scan,
 * filters issues to category === 'security', computes the AI
 * risk tier, and prints a summary.
 *
 * --strict exits 1 on high or critical risk (CI gate).
 */
export function registerSecurity(program: Command): void {
  program
    .command('security')
    .description(
      'AI Security Risk — categorical severity for security findings disproportionately introduced by AI-generated code',
    )
    .option('--format <pretty|json>', 'output format', 'pretty')
    .option('--strict', 'exit 1 on any high or critical finding (CI gate)', false)
    .action(
      async (cmdOptions: { format?: 'pretty' | 'json'; strict?: boolean }, command: Command) => {
        try {
          const options = command.optsWithGlobals() as CliGlobalOptions & {
            format?: string;
          };
          const rawFormat = options.format ?? cmdOptions.format ?? 'pretty';
          const format: 'pretty' | 'json' =
            rawFormat === 'json' || rawFormat === 'pretty' ? rawFormat : 'pretty';

          const cwd = resolve(options.workspace ?? process.cwd());
          const { report } = await runScan({ ...options, workspace: cwd });
          const securityIssues = report.issues.filter((i) => i.category === 'security');
          const { risk, findings } = computeAiSecurityRisk(securityIssues);

          if (format === 'json') {
            logger.info(
              JSON.stringify(
                {
                  aiSecurityRisk: risk,
                  findings,
                  totalFindings: securityIssues.length,
                  issues: securityIssues,
                },
                null,
                2,
              ),
            );
          } else {
            logger.info(formatAiSecurityRiskLine(risk, findings));
            if (securityIssues.length > 0) {
              logger.info('');
              logger.info('  Findings:');
              for (const issue of securityIssues.slice(0, 20)) {
                logger.info(
                  `    [${issue.severity.padEnd(7)}] ${issue.filePath ?? ''}:${issue.line}  ${issue.ruleId}`,
                );
                logger.info(`        ${issue.message}`);
              }
              if (securityIssues.length > 20) {
                logger.info(`    …and ${securityIssues.length - 20} more`);
              }
            }
          }

          if (cmdOptions.strict && (risk === 'high' || risk === 'critical')) {
            process.exit(1);
          }
          process.exit(0);
        } catch (err) {
          logger.error(err instanceof Error ? err.message : String(err));
          process.exit(2);
        }
      },
    );
}
