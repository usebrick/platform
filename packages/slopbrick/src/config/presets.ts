// Per-framework rule overrides applied on top of `DEFAULT_CONFIG`
// after framework detection.

import type { ResolvedConfig, RuleSeverity } from '../types';
import type { Framework } from './defaults';

export const NATIVE_RULE_OVERRIDES: Record<string, RuleSeverity | 'off'> = {
  'logic/boundary-violation': 'off',
  'perf/css-bloat': 'off',
  'wcag/target-size': 'off',
  'wcag/focus-appearance': 'off',
  'wcag/focus-obscured': 'off',
  'wcag/dragging-movements': 'off',
  'perf/cls-image': 'off',
  'component/giant-component': 'off',
  'arch/astro-island-leak': 'off',
};

const REACT_ONLY_RULES: Record<string, RuleSeverity | 'off'> = {
  'logic/key-prop-missing': 'off',
  'component/giant-component': 'off',
};

export const FRAMEWORK_PRESETS: Record<string, Partial<ResolvedConfig>> = {
  'react-native': {
    rules: {
      'wcag/target-size': 'off',
      'wcag/focus-appearance': 'off',
      'wcag/focus-obscured': 'off',
      'wcag/dragging-movements': 'off',
      'perf/cls-image': 'off',
      'component/giant-component': 'off',
      'arch/astro-island-leak': 'off',
      'logic/boundary-violation': 'off',
      'perf/css-bloat': 'off',
    },
  },
  expo: {
    rules: {
      'wcag/target-size': 'off',
      'wcag/focus-appearance': 'off',
      'wcag/focus-obscured': 'off',
      'wcag/dragging-movements': 'off',
      'perf/cls-image': 'off',
      'component/giant-component': 'off',
      'arch/astro-island-leak': 'off',
      'logic/boundary-violation': 'off',
      'perf/css-bloat': 'off',
    },
  },
  vue: {
    rules: { ...REACT_ONLY_RULES },
  },
  svelte: {
    rules: { ...REACT_ONLY_RULES },
  },
  solid: {
    rules: { ...REACT_ONLY_RULES },
  },
  astro: {
    rules: { ...REACT_ONLY_RULES, 'arch/astro-island-leak': 'low' },
  },
};

export function applyFrameworkPreset(
  config: ResolvedConfig,
  framework: Framework,
): ResolvedConfig {
  const preset = FRAMEWORK_PRESETS[framework];
  if (!preset?.rules) return config;
  return { ...config, rules: { ...config.rules, ...preset.rules } };
}
