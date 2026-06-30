import { Command } from 'commander';
import { logger } from '../../engine/logger';
import { builtinRules } from '../../rules/builtins';
import { loadSignalStrength, isReliableSignal } from '../../rules/signal-strength.js';

/**
 * v0.18.x (R-H1): rules subcommand extracted from cli/program.ts.
 *
 * List all built-in rules with their categories, severities, and
 * descriptions. Supports category filtering, AI-only filtering,
 * JSON output, and a per-rule precision/recall table via
 * `--show-signal-strength`.
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
    // category-grouped listing. Sorted by ratio descending (worst signal
    // first) so noisy rules surface to the top.
    .option('--show-signal-strength', 'print per-rule precision/recall table')
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
        const strengths = loadSignalStrength();
        const rows = rules
          .map((r) => ({
            id: r.id,
            category: r.category,
            severity: r.severity,
            aiSpecific: r.aiSpecific,
            strength: strengths[r.id],
          }))
          .sort((a, b) => {
            // Sort by ratio descending (nulls last). Worst signals first.
            const ra = a.strength?.ratio ?? -1;
            const rb = b.strength?.ratio ?? -1;
            return rb - ra;
          });
        if (wantJson) {
          logger.info(JSON.stringify(rows, null, 2));
          return;
        }
        const lines: string[] = [];
        lines.push(`slopbrick signal-strength — ${rows.length} rules (worst signal first)\n`);
        lines.push('  rule id                                  precision  recall  fpRate  ratio   notes');
        lines.push('  ---------------------------------------  ---------  ------  ------  ------  -----');
        for (const row of rows) {
          const s = row.strength;
          const precision = s ? (s.precision * 100).toFixed(0).padStart(7) + '%' : '    n/a ';
          const recall = s ? s.recall.toFixed(2).padStart(6) : '   n/a';
          const fpRate = s ? s.fpRate.toFixed(2).padStart(6) : '   n/a';
          const ratio = s ? (s.ratio >= 99 ? '   ∞×  ' : s.ratio.toFixed(2).padStart(5) + '×') : '  n/a ';
          const tag = !s ? 'no calibration data' : !isReliableSignal(s) ? '⚠ low signal' : 'ok';
          lines.push(`  ${row.id.padEnd(39)} ${precision}  ${recall}  ${fpRate}  ${ratio}  ${tag}`);
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
      // Pretty table grouped by category.
      const byCategory = new Map<string, typeof rules>();
      for (const r of rules) {
        if (!byCategory.has(r.category)) byCategory.set(r.category, []);
        byCategory.get(r.category)!.push(r);
      }
      const lines: string[] = [];
      lines.push(`slopbrick rules — ${rules.length} of ${builtinRules.length} shown\n`);
      for (const [cat, list] of [...byCategory.entries()].sort()) {
        lines.push(`\n## ${cat} (${list.length})`);
        for (const r of list.sort((a, b) => a.id.localeCompare(b.id))) {
          const sev = r.severity.padEnd(8);
          const tag = r.aiSpecific ? '[AI]' : '     ';
          lines.push(`  ${sev} ${tag} ${r.id}`);
          if (r.description) lines.push(`           ${r.description}`);
        }
      }
      logger.info(lines.join('\n'));
    });
}
