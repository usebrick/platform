import { builtinRules } from '../rules/builtins';
import { PROJECT_RULE_IDS } from '../rules/project';
import type { Category, RuleSeverity } from '../types';

export const VALID_SEVERITIES: Array<RuleSeverity | 'off'> = [
  'off',
  'auto',
  'low',
  'medium',
  'high',
  'high',
];

export const VALID_CATEGORIES: Category[] = [
  'visual',
  'typo',
  'wcag',
  'layout',
  'component',
  'logic',
  'arch',
  'perf',
  'security',
];

export const VALID_FRAMEWORKS: string[] = [
  'react',
  'vue',
  'svelte',
  'solid',
  'qwik',
  'astro',
  'react-native',
  'expo',
];

const KNOWN_TOP_LEVEL_KEYS = new Set([
  'framework',
  'hasTailwind',
  'supportsRsc',
  'uiLibraries',
  'include',
  'exclude',
  'mode',
  'rules',
  'categoryWeights',
  'frameworkMultipliers',
  'ruleConfig',
  'gapTokens',
  'globalCssTarget',
  'projectMemory',
  'telemetry',
  'thresholds',
  'spacingScale',
  'typographyScale',
  'arbitraryValueAllowlist',
  'clampAllowlist',
  'wcag',
  'constitution',
  'prScoreThreshold',
]);

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = Array.from({ length: a.length + 1 }, () => []);
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
}

function suggestRuleId(input: string, validRuleIds: string[]): string | undefined {
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const id of validRuleIds) {
    // Fast prefix/substring matches feel helpful for typos like conditonal-hook.
    if (id.includes(input) || input.includes(id)) {
      return id;
    }
    const distance = levenshtein(input, id);
    if (distance < bestDistance && distance <= Math.max(2, Math.floor(id.length / 4))) {
      bestDistance = distance;
      best = id;
    }
  }
  return best;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateStringArray(
  section: string,
  value: unknown,
  errors: string[],
): void {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    errors.push(`${section}: must be an array of strings.`);
  }
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateConfig(config: unknown): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isPlainObject(config)) {
    errors.push('config: Config must be an object.');
    return { valid: false, errors, warnings };
  }

  for (const key of Object.keys(config)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      warnings.push(`config: Unknown top-level key "${key}".`);
    }
  }

  const validRuleIds = [...builtinRules.map((rule) => rule.id), ...PROJECT_RULE_IDS];

  if ('rules' in config && config.rules !== undefined) {
    if (!isPlainObject(config.rules)) {
      errors.push('rules: must be an object mapping rule IDs to severities.');
    } else {
      for (const [ruleId, severity] of Object.entries(config.rules)) {
        if (!validRuleIds.includes(ruleId)) {
          const suggestion = suggestRuleId(ruleId, validRuleIds);
          errors.push(
            `rules: "${ruleId}" is not a valid rule ID.${
              suggestion ? ` Did you mean "${suggestion}"?` : ''
            }`,
          );
        }
        if (!VALID_SEVERITIES.includes(severity as RuleSeverity | 'off')) {
          errors.push(
            `rules: "${ruleId}" must be 'off', 'auto', 'low', 'medium', or 'high'.`,
          );
        }
      }
    }
  }

  if ('thresholds' in config && config.thresholds !== undefined) {
    if (!isPlainObject(config.thresholds)) {
      errors.push('thresholds: must be an object.');
    } else {
      const knownThresholds = new Set(['meanSlop', 'p90Slop', 'individualSlopThreshold']);
      for (const [key, value] of Object.entries(config.thresholds)) {
        if (!knownThresholds.has(key)) {
          warnings.push(`thresholds: Unknown threshold key "${key}".`);
          continue;
        }
        if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
          errors.push(`thresholds: "${key}" must be a non-negative number.`);
        }
      }
    }
  }

  if ('categoryWeights' in config && config.categoryWeights !== undefined) {
    if (!isPlainObject(config.categoryWeights)) {
      errors.push('categoryWeights: must be an object.');
    } else {
      for (const [category, weight] of Object.entries(config.categoryWeights)) {
        if (!VALID_CATEGORIES.includes(category as Category)) {
          errors.push(`categoryWeights: "${category}" is not a valid category.`);
        }
        if (typeof weight !== 'number' || Number.isNaN(weight) || weight < 0) {
          errors.push(`categoryWeights: "${category}" must be a non-negative number.`);
        }
      }
    }
  }

  if ('framework' in config && config.framework !== undefined) {
    if (typeof config.framework !== 'string' || !VALID_FRAMEWORKS.includes(config.framework as string)) {
      errors.push(`framework: "${config.framework}" is not a supported framework.`);
    }
  }

  if ('include' in config && config.include !== undefined) {
    validateStringArray('include', config.include, errors);
  }
  if ('exclude' in config && config.exclude !== undefined) {
    validateStringArray('exclude', config.exclude, errors);
  }

  if ('prScoreThreshold' in config && config.prScoreThreshold !== undefined) {
    const value = config.prScoreThreshold;
    if (typeof value !== 'number' || Number.isNaN(value) || value < 0 || !Number.isInteger(value)) {
      errors.push('prScoreThreshold: must be a non-negative integer.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function groupMessagesBySection(messages: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const message of messages) {
    const colonIndex = message.indexOf(':');
    const section = colonIndex >= 0 ? message.slice(0, colonIndex) : 'general';
    const rest = colonIndex >= 0 ? message.slice(colonIndex + 1).trim() : message;
    (groups[section] ??= []).push(rest);
  }
  return groups;
}

function formatSection(name: string, messages: string[], indent = 2): string[] {
  const pad = ' '.repeat(indent);
  const lines: string[] = [`${pad}${name}:`];
  for (const message of messages) {
    lines.push(`${pad}  ${message}`);
  }
  return lines;
}

export function formatConfigValidationErrors(
  configPath: string,
  errors: string[],
  warnings: string[],
): string {
  const lines: string[] = [`Error: invalid ${configPath}`, ''];

  const errorGroups = groupMessagesBySection(errors);
  for (const section of Object.keys(errorGroups)) {
    lines.push(...formatSection(section, errorGroups[section]));
  }

  if (warnings.length > 0) {
    lines.push('');
    const warningGroups = groupMessagesBySection(warnings);
    for (const section of Object.keys(warningGroups)) {
      lines.push(...formatSection(section, warningGroups[section]));
    }
  }

  return lines.join('\n');
}

export class ConfigValidationError extends Error {
  public readonly name = 'ConfigValidationError';

  constructor(
    public readonly configPath: string,
    public readonly errors: string[],
    public readonly warnings: string[],
  ) {
    super(formatConfigValidationErrors(configPath, errors, warnings));
  }
}
