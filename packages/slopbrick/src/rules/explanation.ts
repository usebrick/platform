import { getDefaultOffRules, getSignalStrength } from './signal-strength.js';
import type { SignalStrengthEntry } from './signal-strength.js';
import { getCurrentEvidencePolicyAccessors } from './current-evidence-policy-runtime.js';
import type { CurrentEvidencePolicyAccessors } from './current-evidence-policy.js';
import type {
  CAL002ClaimClass,
  CAL002QualityDomain,
  CAL002RuntimeOutcomeV2,
} from '../calibration/cal-002/contracts-v2.js';
import type { CAL002PolicyProvenanceV2 } from '../calibration/cal-002/matrix-v2.js';
import { getExplicitRuleOverrides } from '../config/rule-override-provenance.js';
import type { ResolvedConfig, Rule, RuleSeverity } from '../types';

const RULES_BASE_URL = 'https://github.com/usebrick/platform/blob/main/packages/slopbrick/src/rules';

export type RulePolicyState =
  | 'configured-off'
  | 'configured-severity'
  | 'current-default-on'
  | 'current-explicit-diagnostic'
  | 'current-default-off'
  | 'current-non-runnable'
  | 'legacy-default-off'
  | 'rule-default';

/**
 * Configuration policy resolved from validated current authority when it is
 * active, with rule metadata and immutable legacy defaults as the fallback.
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
export function describeRulePolicy(
  rule: Rule,
  config: ResolvedConfig,
  currentPolicy: CurrentEvidencePolicyAccessors | undefined = getCurrentEvidencePolicyAccessors(),
): RulePolicy {
  const configuredSeverity = config.rules[rule.id] ?? null;
  const explicitRuleOverrides = getExplicitRuleOverrides(config);
  const currentRow = currentPolicy?.getCurrentRulePolicy(rule.id);
  const defaultOff = currentRow === undefined
    ? rule.defaultOff === true || getDefaultOffRules().has(rule.id)
    : !currentRow.enabledByDefault;
  if (configuredSeverity === 'off') {
    return { configuredSeverity, defaultOff, policyState: 'configured-off' };
  }
  if (currentRow !== undefined) {
    if (!currentRow.enabledByDefault && !currentRow.runnableByExplicitOptIn) {
      return { configuredSeverity, defaultOff, policyState: 'current-non-runnable' };
    }
    if (!currentRow.enabledByDefault
      && currentRow.runnableByExplicitOptIn
      && Object.hasOwn(explicitRuleOverrides, rule.id)) {
      return { configuredSeverity, defaultOff, policyState: 'current-explicit-diagnostic' };
    }
    if (configuredSeverity !== null && configuredSeverity !== 'auto') {
      return { configuredSeverity, defaultOff, policyState: 'configured-severity' };
    }
    return {
      configuredSeverity,
      defaultOff,
      policyState: currentRow.enabledByDefault ? 'current-default-on' : 'current-default-off',
    };
  }
  if (configuredSeverity !== null && configuredSeverity !== 'auto') {
    return { configuredSeverity, defaultOff, policyState: 'configured-severity' };
  }
  if (defaultOff) {
    return { configuredSeverity, defaultOff, policyState: 'legacy-default-off' };
  }
  return { configuredSeverity, defaultOff, policyState: 'rule-default' };
}

export interface CurrentRulePolicyExplanation {
  status: 'applied' | 'unavailable';
  runtimeOutcome?: CAL002RuntimeOutcomeV2;
  enabledByDefault?: boolean;
  runnableByExplicitOptIn?: boolean;
  scoreEligible?: boolean;
  gateEligible?: boolean;
  qualityDomain?: CAL002QualityDomain;
  claimClass?: CAL002ClaimClass;
  provenance?: CAL002PolicyProvenanceV2;
  replacementRuleId?: string;
  admitted?: false;
}

export function buildCurrentRulePolicyExplanation(
  ruleId: string,
  currentPolicy: CurrentEvidencePolicyAccessors | undefined = getCurrentEvidencePolicyAccessors(),
): CurrentRulePolicyExplanation {
  if (currentPolicy === undefined) return { status: 'unavailable' };
  const row = currentPolicy.getCurrentRulePolicy(ruleId);
  if (row === undefined) return { status: 'unavailable' };
  return {
    status: 'applied',
    runtimeOutcome: row.runtimeOutcome,
    enabledByDefault: row.enabledByDefault,
    runnableByExplicitOptIn: row.runnableByExplicitOptIn,
    scoreEligible: row.scoreEligible,
    gateEligible: row.gateEligible,
    qualityDomain: row.qualityDomain,
    claimClass: row.claimClass,
    provenance: row.provenance,
    ...(row.replacementRuleId === undefined ? {} : { replacementRuleId: row.replacementRuleId }),
    admitted: currentPolicy.policy.admitted,
  };
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
    /** @deprecated Use `historicalMetrics`; retained as a compatibility alias. */
    calibration: {
      status: 'historical-point-estimate-only' | 'unavailable';
      /** The per-rule date is validated by the shared signal-strength schema. */
      lastCalibratedAt?: string;
      /**
       * The current checkout has no admitted v10.3 cohort. Keep that absence
       * explicit instead of turning legacy underscore metadata into a claimed
       * source/cohort contract.
       */
      provenance: {
        status: 'historical-only' | 'unavailable';
        source: null;
        cohort: null;
        reason: string;
      };
      recall?: number;
      falsePositiveRate?: number;
      precision?: number;
      lift?: number;
      confidenceLimits: null;
      confidenceLimitsReason: string;
    };
  };
  currentPolicy: CurrentRulePolicyExplanation;
  historicalMetrics: RuleCalibrationEvidence;
  configuration: RulePolicy;
}

/**
 * Build the bounded calibration/provenance projection shared by rule
 * explanations and per-finding machine surfaces.  The shipped signal table
 * contains historical point estimates only; its legacy underscore metadata
 * is deliberately not a validated v10.3 source/cohort contract.  Keep that
 * absence explicit on every consumer rather than letting one renderer imply
 * stronger provenance than another.
 */
export type RuleCalibrationEvidence = RuleExplanation['evidence']['calibration'];

export function buildRuleCalibrationEvidence(
  strength: SignalStrengthEntry | undefined,
): RuleCalibrationEvidence {
  if (!strength) {
    return {
      status: 'unavailable',
      provenance: {
        status: 'unavailable',
        source: null,
        cohort: null,
        reason: 'No validated calibration entry is available for this rule.',
      },
      confidenceLimits: null,
      confidenceLimitsReason: 'No validated confidence interval is available in the shipped calibration contract.',
    };
  }

  return {
    status: 'historical-point-estimate-only',
    lastCalibratedAt: strength.lastCalibratedAt,
    provenance: {
      status: 'historical-only',
      source: null,
      cohort: null,
      reason: 'The shipped estimate predates v10.3 admission; no validated cohort/source is available.',
    },
    recall: strength.recall,
    falsePositiveRate: strength.fpRate,
    precision: strength.precision,
    lift: strength.ratio,
    confidenceLimits: null,
    confidenceLimitsReason: 'No validated confidence interval is available in the shipped calibration contract.',
  };
}

export function buildRuleExplanation(
  rule: Rule,
  config: ResolvedConfig,
  ruleHints: Record<string, string>,
): RuleExplanation {
  const filename = ruleIdToFilename(rule.id);
  const sourcePath = `src/rules/${rule.category}/${filename}.ts`;
  const strength = getSignalStrength(rule.id);
  const currentPolicy = getCurrentEvidencePolicyAccessors();
  const historicalMetrics = buildRuleCalibrationEvidence(strength);
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
      calibration: historicalMetrics,
    },
    currentPolicy: buildCurrentRulePolicyExplanation(rule.id, currentPolicy),
    historicalMetrics,
    configuration: describeRulePolicy(rule, config, currentPolicy),
  };
}
