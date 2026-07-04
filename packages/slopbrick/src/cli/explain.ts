// Round 20: Per-rule explanation printer.
//
// `slopbrick explain <ruleId>` prints the rule's rationale, pattern,
// remediation hint, and a config snippet showing how to suppress /
// configure it. Pulled live from the rule registry + the shared
// RULE_HINTS map (also used by snippets).

import type { Rule, RuleSeverity } from '../types';

export interface ExplainResult {
  ruleId: string;
  category: string;
  severity: RuleSeverity;
  aiSpecific: boolean;
  pattern: string;        // one-liner describing the pattern
  remediation: string;    // what to do about it
  sourcePath: string;     // path to the rule source file
  helpUri: string;
  suppressionSnippet: string;
}

// helpUri emitted by `src/report/sarif.ts`.
// The org is `usebrick` (the platform); `slopbrick` is the published CLI
// package inside the usebrick/platform monorepo.
const RULES_BASE_URL = 'https://github.com/usebrick/platform/blob/main/packages/slopbrick/src/rules';

function ruleIdToFilename(ruleId: string): string {
  // e.g. 'logic/boundary-violation' -> 'boundary-violation'
  const slash = ruleId.indexOf('/');
  return slash === -1 ? ruleId : ruleId.slice(slash + 1);
}

export function explainRule(
  ruleId: string,
  rules: Rule[],
  ruleHints: Record<string, string>,
): ExplainResult | { error: string } {
  const rule = rules.find((r) => r.id === ruleId);
  if (!rule) {
    return { error: 'Unknown rule: ' + ruleId + '. Run `slopbrick rules` to see all available rules.' };
  }
  const filename = ruleIdToFilename(rule.id);
  return {
    ruleId: rule.id,
    category: rule.category,
    severity: rule.severity,
    aiSpecific: rule.aiSpecific,
    pattern: ruleHints[rule.id] ?? 'Patterns flagged by ' + rule.id + '.',
    remediation: 'See the rule source for the canonical before/after: src/rules/' + rule.category + '/' + filename + '.ts',
    sourcePath: 'src/rules/' + rule.category + '/' + filename + '.ts',
    helpUri: `${RULES_BASE_URL}/${rule.category}/${filename}.ts`,
    suppressionSnippet: 'rules: { "' + rule.id + '": "off" }  // or set to a lower severity',
  };
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
