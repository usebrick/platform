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

function formatPolicyBoolean(value: boolean | undefined): string {
  return value === undefined ? 'unavailable' : value ? 'yes' : 'no';
}

function formatPolicyValue(value: string | undefined): string {
  return value ?? 'unavailable';
}

function formatCalibrationStatus(status: ExplainResult['historicalMetrics']['status']): string {
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
  lines.push('Rule status: ' + result.configuration.policyState + ' (configuration and current-policy projection)');
  lines.push('Current policy:');
  lines.push('  Status: ' + result.currentPolicy.status);
  if (result.currentPolicy.status === 'applied') {
    lines.push('  Runtime outcome: ' + formatPolicyValue(result.currentPolicy.runtimeOutcome));
    lines.push('  Enabled by default: ' + formatPolicyBoolean(result.currentPolicy.enabledByDefault));
    lines.push('  Runnable by explicit opt-in: ' + formatPolicyBoolean(result.currentPolicy.runnableByExplicitOptIn));
    lines.push('  Score eligible: ' + formatPolicyBoolean(result.currentPolicy.scoreEligible));
    lines.push('  Gate eligible: ' + formatPolicyBoolean(result.currentPolicy.gateEligible));
    lines.push('  Quality domain: ' + formatPolicyValue(result.currentPolicy.qualityDomain));
    lines.push('  Claim class: ' + formatPolicyValue(result.currentPolicy.claimClass));
    lines.push('  Provenance: ' + formatPolicyValue(result.currentPolicy.provenance));
    if (result.currentPolicy.replacementRuleId !== undefined) {
      lines.push('  Replacement rule ID: ' + result.currentPolicy.replacementRuleId);
    }
    lines.push('  Admitted: ' + formatPolicyBoolean(result.currentPolicy.admitted));
  } else {
    lines.push('  Detail: legacy defaults only');
  }
  lines.push('Evidence:    ' + result.evidence.category);
  lines.push('Historical metrics: ' + formatCalibrationStatus(result.historicalMetrics.status));
  if (result.historicalMetrics.status === 'historical-point-estimate-only') {
    lines.push('  Calibrated: ' + (result.historicalMetrics.lastCalibratedAt ?? 'unavailable'));
    lines.push('  Recall:    ' + formatRate(result.historicalMetrics.recall));
    lines.push('  FPR:       ' + formatRate(result.historicalMetrics.falsePositiveRate));
    lines.push('  Precision: ' + formatRate(result.historicalMetrics.precision));
    lines.push('  Lift:      ' + formatLift(result.historicalMetrics.lift));
  }
  lines.push('Historical source/cohort: unavailable — ' + result.historicalMetrics.provenance.reason);
  lines.push('Historical confidence limits: unavailable — ' + result.historicalMetrics.confidenceLimitsReason);
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
