import { Command } from 'commander';
import { logger } from '../../engine/logger';
import { builtinRules } from '../../rules/builtins';
import {
  loadHistoricalSignalStrength,
  loadSignalStrength,
} from '../../rules/signal-strength.js';
import { formatRulesList } from '../render.js';

/**
 * v0.18.x (R-H1): rules subcommand extracted from cli/program.ts.
 *
 * List all built-in rules with their categories, severities, and
 * descriptions. Supports category filtering, AI-only filtering,
 * JSON output, and a per-rule historical precision/recall table via
 * `--show-signal-strength`. The historical table is not current policy or
 * authorship evidence.
 *
 * The global `--json [path]` flag shadows the local `--json` here
 * (commander limitation when both exist). Use `optsWithGlobals()`
 * to honor either source — same pattern as the original inline
 * action.
 */
export function registerRules(program: Command): void {
  program
    .command('rules')
    .description('list all built-in rules with their categories, severities, and descriptions')
    .option('--category <name>', 'filter to a single category (visual, typo, layout, etc.)')
    .option('--ai-only', 'only show AI-specific rules')
    .option('--json', 'emit JSON instead of a pretty table')
    // Historical v10.1 metrics are a detached projection. The legacy
    // `strength` field remains in JSON only for compatibility and is labeled
    // separately so callers cannot mistake it for the v10.1 projection.
    .option('--show-signal-strength', 'print historical v10.1 precision/recall point estimates')
    .action((
      cmdOptions: { category?: string; aiOnly?: boolean; json?: boolean; showSignalStrength?: boolean },
      command: Command,
    ) => {
      const globals = command.optsWithGlobals() as { json?: string | boolean };
      const wantJson = Boolean(cmdOptions.json || globals.json);
      let rules = [...builtinRules];
      if (cmdOptions.category) {
        rules = rules.filter((r) => r.category === cmdOptions.category);
      }
      if (cmdOptions.aiOnly) {
        rules = rules.filter((r) => r.aiSpecific);
      }
      if (cmdOptions.showSignalStrength) {
        const historical = loadHistoricalSignalStrength();
        const legacyStrengths = loadSignalStrength();
        const rows = rules
          .map((r) => {
            const historicalMetrics = historical.entries[r.id];
            return {
              id: r.id,
              category: r.category,
              severity: r.severity,
              aiSpecific: r.aiSpecific,
              metricsStatus: historicalMetrics?.status ?? 'unavailable',
              historicalDataset: historical.dataset,
              historicalVerdict: legacyStrengths[r.id]?.verdict ?? null,
              historicalMetrics: historicalMetrics ?? {
                status: 'unavailable' as const,
                dataset: historical.dataset,
              },
              strengthStatus: 'legacy-compatibility' as const,
              strength: legacyStrengths[r.id],
            };
          })
          .sort((a, b) => {
            const af1 = a.historicalMetrics.status === 'historical-point-estimate-only'
              ? a.historicalMetrics.f1
              : -1;
            const bf1 = b.historicalMetrics.status === 'historical-point-estimate-only'
              ? b.historicalMetrics.f1
              : -1;
            return bf1 - af1 || a.id.localeCompare(b.id);
          });
        if (wantJson) {
          logger.info(JSON.stringify(rows, null, 2));
          return;
        }
        const lines: string[] = [];
        lines.push(`slopbrick signal-strength — historical v10.1 point estimates — ${rows.length} rules (highest F1 first; unavailable last)\n`);
        lines.push('  rule id                                  signal    precision  recall     F1  pos fires  neg fires  notes');
        lines.push('  ---------------------------------------  --------  ---------  ------  -----  ---------  ---------  -----');
        for (const row of rows) {
          const metrics = row.historicalMetrics;
          if (metrics.status === 'unavailable') {
            lines.push(`  ${row.id.padEnd(39)} ${'n/a'.padEnd(8)}  ${'n/a'.padStart(9)}  ${'n/a'.padStart(6)}  ${'n/a'.padStart(5)}  ${'n/a'.padStart(9)}  ${'n/a'.padStart(9)}  no v10.1 metrics`);
            continue;
          }
          const precision = `${(metrics.precision * 100).toFixed(1)}%`.padStart(9);
          const recall = `${(metrics.recall * 100).toFixed(1)}%`.padStart(6);
          const f1 = metrics.f1.toFixed(3).padStart(5);
          lines.push(`  ${row.id.padEnd(39)} ${metrics.signal.padEnd(8)}  ${precision}  ${recall}  ${f1}  ${String(metrics.positiveFires).padStart(9)}  ${String(metrics.negativeFires).padStart(9)}  historical only`);
        }
        logger.info(lines.join('\n'));
        return;
      }
      if (wantJson) {
        logger.info(
          JSON.stringify(
            rules.map((r) => ({
              id: r.id,
              category: r.category,
              severity: r.severity,
              aiSpecific: r.aiSpecific,
              description: r.description ?? '(no description)',
            })),
            null,
            2,
          ),
        );
        return;
      }
      // v0.43.0: pretty-printing lives in render.ts so `slopbrick explain`
      // (no ruleId) can reuse it. Keep the action small.
      logger.info(formatRulesList(rules, builtinRules.length));
    });
}
