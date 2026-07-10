import { getDefaultOffRules, getSignalStrength } from './signal-strength.js';
import type { ResolvedConfig, Rule, RuleSeverity } from '../types';

const RULES_BASE_URL = 'https://github.com/usebrick/platform/blob/main/packages/slopbrick/src/rules';

export type EffectiveActivation = 'enabled' | 'suppressed';

export interface RuleActivation {
  configuredSeverity: RuleSeverity | 'off' | null;
  defaultOff: boolean;
  effectiveSeverity: RuleSeverity | 'off';
  effectiveActivation: EffectiveActivation;
}

function ruleIdToFilename(ruleId: string): string {
  const slash = ruleId.indexOf('/');
  return slash === -1 ? ruleId : ruleId.slice(slash + 1);
}

/**
 * Resolve the activation state used in a project report: explicit config wins;
 * otherwise default-off rules are retained only for auditability and excluded
 * from the effective finding set.
 */
export function resolveRuleActivation(rule: Rule, config: ResolvedConfig): RuleActivation {
  const configuredSeverity = config.rules[rule.id] ?? null;
  const defaultOff = rule.defaultOff === true || getDefaultOffRules().has(rule.id);
  if (configuredSeverity === 'off') {
    return { configuredSeverity, defaultOff, effectiveSeverity: 'off', effectiveActivation: 'suppressed' };
  }
  if (configuredSeverity !== null && configuredSeverity !== 'auto') {
    return { configuredSeverity, defaultOff, effectiveSeverity: configuredSeverity, effectiveActivation: 'enabled' };
  }
  if (defaultOff) {
    return { configuredSeverity, defaultOff, effectiveSeverity: 'off', effectiveActivation: 'suppressed' };
  }
  return { configuredSeverity, defaultOff, effectiveSeverity: rule.severity, effectiveActivation: 'enabled' };
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
  configuration: RuleActivation;
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
    configuration: resolveRuleActivation(rule, config),
  };
}
