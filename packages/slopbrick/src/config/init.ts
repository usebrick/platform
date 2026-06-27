// `slopbrick init` wizard config builder.
//
// Used by `slopbrick init` to assemble the user's `slopbrick.config.mjs`
// from their wizard answers (framework, styling, UI libraries, strictness).
// Separate from `defaults.ts` because it consumes the defaults rather than
// defining them.

import type { Category, ResolvedConfig, RuleSeverity } from '../types';
import { DEFAULT_CONFIG, type WizardAnswers } from './defaults';
import { applyFrameworkPreset } from './presets';

const STRICTNESS_PRESETS: Record<
  'strict' | 'balanced' | 'permissive',
  {
    thresholds: ResolvedConfig['thresholds'];
    categoryWeights: Record<Category, number>;
  }
> = {
  strict: {
    thresholds: { meanSlop: 15, p90Slop: 30, individualSlopThreshold: 40 },
    categoryWeights: {
      visual: 1.2,
      logic: 1.3,
      security: 1.3,
      perf: 1.0,
      wcag: 1.0,
      typo: 0.5,
      layout: 1.0,
      component: 1.0,
      arch: 1.0,
      test: 1.0,
      docs: 1.0,
      db: 1.0,
      ai: 1.0,
      context: 1.0,
      product: 1.0,
      i18n: 1.0,
    },
  },
  balanced: {
    thresholds: DEFAULT_CONFIG.thresholds,
    categoryWeights: DEFAULT_CONFIG.categoryWeights!,
  },
  permissive: {
    thresholds: { meanSlop: 50, p90Slop: 75, individualSlopThreshold: 90 },
    categoryWeights: {
      visual: 1.0,
      logic: 0.9,
      security: 0.9,
      perf: 0.7,
      wcag: 0.8,
      typo: 0.3,
      layout: 0.8,
      component: 0.8,
      arch: 0.8,
      test: 0.8,
      docs: 0.8,
      db: 0.8,
      ai: 0.8,
      context: 0.8,
      product: 0.8,
      i18n: 0.8,
    },
  },
};

const PERMISSIVE_OFF_RULES: string[] = [
  'visual/hardcoded-color',
  'visual/ai-default-color',
  'typo/ai-generic-cta',
  'typo/ai-marketing-fluff',
  'logic/console-log',
];

export function buildInitConfig(
  detected: Partial<ResolvedConfig>,
  answers: WizardAnswers,
): ResolvedConfig {
  let config: ResolvedConfig = {
    ...DEFAULT_CONFIG,
    hasTailwind: answers.styling === 'tailwind',
    supportsRsc: detected.supportsRsc ?? false,
    framework: answers.framework,
    uiLibraries: answers.uiLibraries,
  };

  // Apply the selected framework's built-in preset before strictness/UI overrides.
  config = applyFrameworkPreset(config, answers.framework);

  // Apply strictness preset.
  const strictnessPreset = STRICTNESS_PRESETS[answers.strictness];
  config = {
    ...config,
    thresholds: { ...strictnessPreset.thresholds },
    categoryWeights: { ...strictnessPreset.categoryWeights },
  };
  if (answers.strictness === 'permissive') {
    config.rules = { ...config.rules };
    for (const ruleId of PERMISSIVE_OFF_RULES) {
      config.rules[ruleId] = 'off';
    }
  }

  // Apply styling solution overrides.
  if (answers.styling === 'styled-components' || answers.styling === 'emotion') {
    config.rules = { ...config.rules, 'visual/ai-default-palette': 'low' };
  }

  // Apply UI library overrides.
  const uiSet = new Set(answers.uiLibraries);
  const turnsOffShadcnRule = uiSet.has('mui') || uiSet.has('chakra') || uiSet.has('radix');
  if (turnsOffShadcnRule && !uiSet.has('shadcn/ui')) {
    config.rules = { ...config.rules, 'component/giant-component': 'off' };
  }
  if (uiSet.has('tamagui')) {
    config.rules = {
      ...config.rules,
      'visual/ai-default-palette': 'low',
      'visual/raw-style-values': 'low',
    };
  }
  if (uiSet.has('nativewind')) {
    config.rules = { ...config.rules, 'logic/boundary-violation': 'off' };
  }

  return config;
}
