import { Command } from 'commander';
import { logger } from '../../engine/logger';
import { readReportFile, formatReportFromFile } from '../threshold';
import { formatJson } from '../../report/json';
import { formatMarkdown } from '../../report/markdown';

/**
 * v0.18.x (R-H1): report subcommand extracted from cli/program.ts.
 * Re-render a saved JSON report (from `--json path.json` or the
 * `report` MCP tool's output).
 */
export function registerReport(program: Command): void {
  program
    .command('report <path>')
    .description('Re-render a saved JSON report (from --json path.json)')
    .option('--output-format <kind>', 'output format: pretty | json | markdown', 'pretty')
    .action((reportPath: string, cmdOptions: { outputFormat?: string }) => {
      const result = readReportFile(reportPath);
      if (!result.ok) {
        logger.error(`Error: ${result.error}`);
        process.exit(2);
      }
      const fmt = cmdOptions.outputFormat ?? 'pretty';
      if (fmt === 'json') {
        logger.info(formatJson(result.report));
      } else if (fmt === 'markdown') {
        logger.info(`Re-rendered from ${reportPath}\n\n${formatMarkdown(result.report)}`);
      } else {
        logger.info(formatReportFromFile(result.report, reportPath));
      }
    });
}
