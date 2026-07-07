/**
 * v0.17.5 (R-H1): `slopbrick explain <ruleId>` — print rationale, pattern,
 * and remediation for a single rule.
 *
 * Module pattern: each `cli/commands/<name>.ts` exports a single
 * `register<X>(program)` function that wires the Command + its
 * options + the action callback. `cli/program.ts` calls all of them.
 */

import { Command } from 'commander';

import { explainRule, formatExplain } from '../explain.js';
import { logger } from '../../engine/logger';
import { builtinRules } from '../../rules/builtins';
import { RULE_HINTS } from '../../snippet/data.js';

export function registerExplain(program: Command): void {
  program
    .command('explain [ruleId]')
    .description('Print rationale, pattern, and remediation for a single rule. With no ruleId, lists the rules.')
    .action(async (ruleId?: string) => {
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
      const result = explainRule(ruleId, builtinRules, RULE_HINTS);
      logger.info(formatExplain(result));
      if ('error' in result) process.exit(2);
    });
}
