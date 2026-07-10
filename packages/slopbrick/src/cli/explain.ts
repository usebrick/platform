// Round 20: Per-rule explanation printer.
//
// `slopbrick explain <ruleId>` prints the rule's rationale, pattern,
// remediation hint, and a config snippet showing how to suppress /
// configure it. Pulled live from the rule registry + the shared
// RULE_HINTS map (also used by snippets).

import { buildRuleExplanation } from '../rules/explanation.js';
import { DEFAULT_CONFIG } from '../config/defaults.js';
import type { Rule } from '../types';

export type ExplainResult = ReturnType<typeof buildRuleExplanation>;

export function explainRule(
  ruleId: string,
  rules: Rule[],
  ruleHints: Record<string, string>,
): ExplainResult | { error: string } {
  const rule = rules.find((r) => r.id === ruleId);
  if (!rule) {
    return { error: 'Unknown rule: ' + ruleId + '. Run `slopbrick rules` to see all available rules.' };
  }
  return buildRuleExplanation(rule, DEFAULT_CONFIG, ruleHints);
}

export function formatExplain(result: ExplainResult | { error: string }): string {
  if ('error' in result) return result.error;
  const lines: string[] = [];
  lines.push('Rule:        ' + result.ruleId);
  lines.push('Category:    ' + result.category);
  lines.push('Severity:    ' + result.severity);
  lines.push('AI-specific: ' + (result.aiSpecific ? 'yes (designed to fire on AI tells)' : 'no (cross-cutting quality rule)'));
  lines.push('Source:      ' + result.sourcePath);
  lines.push('Help:        ' + result.helpUri);
  lines.push('');
  lines.push('Pattern:');
  lines.push('  ' + result.pattern);
  lines.push('');
  lines.push('Remediation:');
  lines.push('  ' + result.remediation);
  lines.push('');
  lines.push('Suppress / configure in slopbrick.config.mjs:');
  lines.push('  ' + result.suppressionSnippet);
  lines.push('');
  return lines.join('\n');
}
