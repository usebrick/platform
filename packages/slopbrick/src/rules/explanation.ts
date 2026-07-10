import { getDefaultOffRules, getSignalStrength } from './signal-strength.js';
import type { ResolvedConfig, Rule, RuleSeverity } from '../types';

const RULES_BASE_URL = 'https://github.com/usebrick/platform/blob/main/packages/slopbrick/src/rules';

export type RulePolicyState = 'configured-off' | 'configured-severity' | 'default-off' | 'rule-default';

/**
 * Static policy derived from rule metadata and supplied configuration.
 * It intentionally does not claim how any particular scan invocation
 * (including MCP's direct-file scan) applied that policy at runtime.
 */
export interface RulePolicy {
  configuredSeverity: RuleSeverity | 'off' | null;
  defaultOff: boolean;
  policyState: RulePolicyState;
}

function ruleIdToFilename(ruleId: string): string {
  const slash = ruleId.indexOf('/');
  return slash === -1 ? ruleId : ruleId.slice(slash + 1);
}

/**
 * Describe configuration policy only. The caller must not use this as evidence
 * of whether a particular scan runner executed or suppressed a rule.
 */
export function describeRulePolicy(rule: Rule, config: ResolvedConfig): RulePolicy {
  const configuredSeverity = config.rules[rule.id] ?? null;
  const defaultOff = rule.defaultOff === true || getDefaultOffRules().has(rule.id);
  if (configuredSeverity === 'off') {
    return { configuredSeverity, defaultOff, policyState: 'configured-off' };
  }
  if (configuredSeverity !== null && configuredSeverity !== 'auto') {
    return { configuredSeverity, defaultOff, policyState: 'configured-severity' };
  }
  if (defaultOff) {
    return { configuredSeverity, defaultOff, policyState: 'default-off' };
  }
  return { configuredSeverity, defaultOff, policyState: 'rule-default' };
}

export interface RuleExplanation {
  ruleId: string;
  category: string;
  severity: RuleSeverity;
  aiSpecific: boolean;
  pattern: string;
  remediation: string;
  sourcePath: string;
  helpUri: string;
  suppressionSnippet: string;
  evidence: {
    category: 'ai-signal' | 'quality';
    calibration: {
      status: 'historical-point-estimate-only' | 'unavailable';
      recall?: number;
      falsePositiveRate?: number;
      precision?: number;
      lift?: number;
      confidenceLimits: null;
      confidenceLimitsReason: string;
    };
  };
  configuration: RulePolicy;
}

export function buildRuleExplanation(
  rule: Rule,
  config: ResolvedConfig,
  ruleHints: Record<string, string>,
): RuleExplanation {
  const filename = ruleIdToFilename(rule.id);
  const sourcePath = `src/rules/${rule.category}/${filename}.ts`;
  const strength = getSignalStrength(rule.id);
  return {
    ruleId: rule.id,
    category: rule.category,
    severity: rule.severity,
    aiSpecific: rule.aiSpecific,
    pattern: ruleHints[rule.id] ?? `Patterns flagged by ${rule.id}.`,
    remediation: `See the rule source for the canonical before/after: ${sourcePath}`,
    sourcePath,
    helpUri: `${RULES_BASE_URL}/${rule.category}/${filename}.ts`,
    suppressionSnippet: `rules: { "${rule.id}": "off" }  // or set to a lower severity`,
    evidence: {
      category: rule.aiSpecific ? 'ai-signal' : 'quality',
      calibration: strength
        ? {
            status: 'historical-point-estimate-only',
            recall: strength.recall,
            falsePositiveRate: strength.fpRate,
            precision: strength.precision,
            lift: strength.ratio,
            confidenceLimits: null,
            confidenceLimitsReason: 'No validated confidence interval is available in the shipped calibration contract.',
          }
        : {
            status: 'unavailable',
            confidenceLimits: null,
            confidenceLimitsReason: 'No validated confidence interval is available in the shipped calibration contract.',
          },
    },
    configuration: describeRulePolicy(rule, config),
  };
}
