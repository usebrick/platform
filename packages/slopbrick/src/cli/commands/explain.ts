/**
 * v0.17.5 (R-H1): `slopbrick explain <ruleId>` — print rationale, pattern,
 * and remediation for a single rule.
 *
 * Module pattern: each `cli/commands/<name>.ts` exports a single
 * `register<X>(program)` function that wires the Command + its
 * options + the action callback. `cli/program.ts` calls all of them.
 */

import { Command } from 'commander';
import { resolve } from 'node:path';

import { explainRule, formatExplain } from '../explain.js';
import { loadConfig } from '../../config/index.js';
import { logger } from '../../engine/logger';
import { builtinRules } from '../../rules/builtins';
import { buildRuleExplanation } from '../../rules/explanation.js';
import { RULE_HINTS } from '../../snippet/data.js';

export function registerExplain(program: Command): void {
  program
    .command('explain [ruleId]')
    .description('Print rationale, pattern, and remediation for a single rule. With no ruleId, lists the rules.')
    .action(async (
      ruleId: string | undefined,
      _commandOptions: Record<string, unknown>,
      command: Command,
    ) => {
      // v0.42.0 (user-review fix): the previous version required a ruleId,
      // so `slopbrick explain` alone produced Commander's unhelpful "missing
      // required argument 'ruleId'". We make the arg optional and, when
      // missing, just point the user at `slopbrick rules` so they know
      // what's available.
      if (!ruleId) {
        // v0.43.0: actually run `slopbrick rules`-style output instead
        // of just warning. The command description already says "With
        // no ruleId, lists the rules" — making the implementation
        // match the description means first-time users who type
        // `slopbrick explain` to discover the CLI get useful output
        // instead of a warning + non-zero exit.
        const { formatRulesList } = await import('../render.js');
        const { builtinRules } = await import('../../rules/builtins.js');
        logger.info(formatRulesList(builtinRules));
        return;
      }
      const fallbackResult = explainRule(ruleId, builtinRules, RULE_HINTS);
      if ('error' in fallbackResult) {
        logger.info(formatExplain(fallbackResult));
        process.exit(2);
      }
      const globals = command.optsWithGlobals() as { workspace?: string };
      const config = await loadConfig(resolve(globals.workspace ?? process.cwd()));
      const rule = builtinRules.find((candidate) => candidate.id === ruleId)!;
      // Use the same config-aware explanation builder as MCP. The public
      // explainRule helper remains the unknown-ID compatibility boundary.
      const result = buildRuleExplanation(rule, config, RULE_HINTS);
      logger.info(formatExplain(result));
    });
}
