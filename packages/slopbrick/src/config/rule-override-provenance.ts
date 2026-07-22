import type { ResolvedConfig, RuleSeverity } from '../types';

export type RuleOverrideMap = Readonly<Record<string, RuleSeverity | 'off'>>;

const EMPTY_RULE_OVERRIDES: RuleOverrideMap = Object.freeze({});
const EXPLICIT_RULE_OVERRIDES = new WeakMap<object, RuleOverrideMap>();
const INVOCATION_RULE_OVERRIDES = new WeakMap<object, RuleOverrideMap>();

/**
 * Preserve which rule entries came from the repository's config file without
 * adding serializable internal metadata to the resolved public config shape.
 */
export function bindExplicitRuleOverrides(
  config: ResolvedConfig,
  rules: RuleOverrideMap | undefined,
): ResolvedConfig {
  EXPLICIT_RULE_OVERRIDES.set(config, Object.freeze({ ...(rules ?? {}) }));
  return config;
}

/** Defaults, detection, presets, and flywheel changes are not owner opt-ins. */
export function getExplicitRuleOverrides(config: object): RuleOverrideMap {
  return EXPLICIT_RULE_OVERRIDES.get(config) ?? EMPTY_RULE_OVERRIDES;
}

/**
 * Preserve rule selectors that explicitly request diagnostic execution for one
 * invocation. They remain separate from repository configuration so they can
 * never make a finding score- or gate-eligible by masquerading as owner policy.
 */
export function bindInvocationRuleOverrides(
  config: ResolvedConfig,
  rules: RuleOverrideMap | undefined,
): ResolvedConfig {
  INVOCATION_RULE_OVERRIDES.set(config, Object.freeze({ ...(rules ?? {}) }));
  return config;
}

export function getInvocationRuleOverrides(config: object): RuleOverrideMap {
  return INVOCATION_RULE_OVERRIDES.get(config) ?? EMPTY_RULE_OVERRIDES;
}

/** Repository `off` wins over a diagnostic selector for runtime execution. */
export function getRunnableRuleOverrides(config: object): RuleOverrideMap {
  const invocation = getInvocationRuleOverrides(config);
  const repository = getExplicitRuleOverrides(config);
  if (invocation === EMPTY_RULE_OVERRIDES) return repository;
  if (repository === EMPTY_RULE_OVERRIDES) return invocation;
  return Object.freeze({ ...invocation, ...repository });
}

/** Preserve provenance when an internal boundary copies a resolved config. */
export function copyExplicitRuleOverrides(
  source: object,
  target: ResolvedConfig,
): ResolvedConfig {
  bindExplicitRuleOverrides(target, getExplicitRuleOverrides(source));
  return bindInvocationRuleOverrides(target, getInvocationRuleOverrides(source));
}
