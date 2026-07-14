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

function formatRate(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : 'unavailable';
}

function formatLift(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)}×` : 'unavailable';
}

function formatCalibrationStatus(status: ExplainResult['evidence']['calibration']['status']): string {
  return status === 'historical-point-estimate-only'
    ? 'historical point estimates only'
    : 'unavailable';
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
  return buildRuleExplanation(rule, DEFAULT_CONFIG, ruleHints);
}

export function formatExplain(result: ExplainResult | { error: string }): string {
  if ('error' in result) return result.error;
  const lines: string[] = [];
  lines.push('Rule:        ' + result.ruleId);
  lines.push('Category:    ' + result.category);
  lines.push('Severity:    ' + result.severity);
  lines.push('AI-specific: ' + (result.aiSpecific ? 'yes (designed to fire on AI tells)' : 'no (cross-cutting quality rule)'));
  lines.push('Rule status: ' + result.configuration.policyState + ' (built-in static policy)');
  lines.push('Evidence:    ' + result.evidence.category);
  lines.push('Calibration: ' + formatCalibrationStatus(result.evidence.calibration.status));
  if (result.evidence.calibration.status === 'historical-point-estimate-only') {
    lines.push('  Calibrated: ' + (result.evidence.calibration.lastCalibratedAt ?? 'unavailable'));
    lines.push('  Recall:    ' + formatRate(result.evidence.calibration.recall));
    lines.push('  FPR:       ' + formatRate(result.evidence.calibration.falsePositiveRate));
    lines.push('  Precision: ' + formatRate(result.evidence.calibration.precision));
    lines.push('  Lift:      ' + formatLift(result.evidence.calibration.lift));
  }
  lines.push('Calibration source/cohort: unavailable — ' + result.evidence.calibration.provenance.reason);
  lines.push('Confidence limits: unavailable — ' + result.evidence.calibration.confidenceLimitsReason);
  lines.push('Matched fact/snippet: unavailable in a rule-level explanation; run `slopbrick scan` for file/line evidence.');
  lines.push('Note: This output does not claim runtime suppression or authorship proof.');
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
