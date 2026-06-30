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
    .command('explain <ruleId>')
    .description('Print rationale, pattern, and remediation for a single rule')
    .action((ruleId: string) => {
      const result = explainRule(ruleId, builtinRules, RULE_HINTS);
      logger.info(formatExplain(result));
      if ('error' in result) process.exit(2);
    });
}
