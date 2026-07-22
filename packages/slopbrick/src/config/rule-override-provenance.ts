import type { ResolvedConfig, RuleSeverity } from '../types';

export type RuleOverrideMap = Readonly<Record<string, RuleSeverity | 'off'>>;

const EMPTY_RULE_OVERRIDES: RuleOverrideMap = Object.freeze({});
const EXPLICIT_RULE_OVERRIDES = new WeakMap<object, RuleOverrideMap>();

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

/** Preserve provenance when an internal boundary copies a resolved config. */
export function copyExplicitRuleOverrides(
  source: object,
  target: ResolvedConfig,
): ResolvedConfig {
  return bindExplicitRuleOverrides(target, getExplicitRuleOverrides(source));
}
