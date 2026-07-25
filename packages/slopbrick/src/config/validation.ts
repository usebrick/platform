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
  'test',
  'docs',
  'db',
  'ai',
  'context',
  'product',
  'i18n',
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
  'allowedImports',
  'wcag',
  'constitution',
  'lock',
  'mend',
  'prScoreThreshold',
  'selfScan',
]);

function levenshtein(a: string, b: string): number {
  // v0.17.4 (R-H5): the `!` non-null assertions below are safe under
  // the invariant that `matrix[i]` is populated for all `0 <= i <= a.length`
  // (we initialize `matrix[i][0]` and `matrix[0][j]` in the loops above)
  // and that `matrix[i-1][...]` exists whenever `i >= 1`.
  const matrix: number[][] = Array.from({ length: a.length + 1 }, () => []);
  for (let i = 0; i <= a.length; i++) matrix[i]![0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost,
      );
    }
  }
  return matrix[a.length]![b.length]!;
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

const MEND_IMPORT_SPECIFIER_MAX_CHARS = 256;
const MEND_IMPORT_SPECIFIER_MAX_BYTES = 768;
const PROJECT_ALIAS_RE = /^[@~]\//;

function isCanonicalImportSpecifier(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value === value.trim()
    && !/[\0\r\n]/.test(value)
    && value.length <= MEND_IMPORT_SPECIFIER_MAX_CHARS
    && new TextEncoder().encode(value).byteLength <= MEND_IMPORT_SPECIFIER_MAX_BYTES;
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
  if ('allowedImports' in config && config.allowedImports !== undefined) {
    validateStringArray('allowedImports', config.allowedImports, errors);
  }

  if ('selfScan' in config && config.selfScan !== undefined) {
    if (!isPlainObject(config.selfScan)) {
      errors.push('selfScan: must be an object.');
    } else {
      for (const key of Object.keys(config.selfScan)) {
        if (key !== 'excludePaths') {
          warnings.push(`selfScan: Unknown self-scan key "${key}".`);
        }
      }
      validateStringArray('selfScan.excludePaths', config.selfScan.excludePaths, errors);
    }
  }

  if ('lock' in config && config.lock !== undefined) {
    if (!isPlainObject(config.lock)) {
      errors.push('lock: must be an object.');
    } else {
      for (const key of Object.keys(config.lock)) {
        if (key !== 'waivers') {
          errors.push(`lock: unknown key "${key}".`);
        }
      }
      if ('waivers' in config.lock && config.lock.waivers !== undefined) {
        if (!Array.isArray(config.lock.waivers)) {
          errors.push('lock.waivers: must be an array.');
        } else {
          const identities = new Set<string>();
          config.lock.waivers.forEach((waiver, index) => {
            const section = `lock.waivers[${index}]`;
            if (!isPlainObject(waiver)) {
              errors.push(`${section}: must be an object.`);
              return;
            }
            const knownWaiverKeys = new Set([
              'findingIdentity',
              'owner',
              'reason',
              'expiresAt',
            ]);
            const unknownKeys = Object.keys(waiver).filter((key) => !knownWaiverKeys.has(key));
            if (unknownKeys.length > 0) {
              errors.push(`${section}: unknown key${unknownKeys.length === 1 ? '' : 's'} ${unknownKeys.map((key) => `"${key}"`).join(', ')}.`);
            }
            if (
              typeof waiver.findingIdentity !== 'string'
              || !/^[a-f0-9]{64}$/.test(waiver.findingIdentity)
            ) {
              errors.push(`${section}: findingIdentity must be a 64-character lowercase SHA-256 identity.`);
            } else if (identities.has(waiver.findingIdentity)) {
              errors.push(`${section}: findingIdentity must be unique within lock.waivers.`);
            } else {
              identities.add(waiver.findingIdentity);
            }
            if (
              typeof waiver.owner !== 'string'
              || waiver.owner.trim().length === 0
              || waiver.owner.length > 200
            ) {
              errors.push(`${section}: owner must be a non-empty string no longer than 200 characters.`);
            }
            if (
              typeof waiver.reason !== 'string'
              || waiver.reason.trim().length === 0
              || waiver.reason.length > 1000
            ) {
              errors.push(`${section}: reason must be a non-empty string no longer than 1000 characters.`);
            }
            if (typeof waiver.expiresAt !== 'string') {
              errors.push(`${section}: expiresAt must be a canonical UTC ISO timestamp.`);
            } else {
              const expiry = new Date(waiver.expiresAt);
              if (Number.isNaN(expiry.getTime()) || expiry.toISOString() !== waiver.expiresAt) {
                errors.push(`${section}: expiresAt must be a canonical UTC ISO timestamp.`);
              }
            }
          });
        }
      }
    }
  }

  if ('mend' in config && config.mend !== undefined) {
    if (!isPlainObject(config.mend)) {
      errors.push('mend: must be an object.');
    } else {
      for (const key of Object.keys(config.mend)) {
        if (key !== 'importRewrites') {
          errors.push(`mend: unknown key "${key}".`);
        }
      }

      if ('importRewrites' in config.mend && config.mend.importRewrites !== undefined) {
        if (!isPlainObject(config.mend.importRewrites)) {
          errors.push('mend.importRewrites: must be an object.');
        } else {
          const rewrites = Object.entries(config.mend.importRewrites);
          if (rewrites.length !== 1) {
            errors.push('mend.importRewrites: must contain exactly one mapping.');
          }

          const allowedImports = Array.isArray(config.allowedImports)
            && config.allowedImports.length > 0
            && config.allowedImports.every((value) => typeof value === 'string')
            ? config.allowedImports
            : undefined;
          if (!allowedImports) {
            errors.push('mend.importRewrites: requires a non-empty repository allowedImports array.');
          }

          for (const [source, target] of rewrites) {
            const canonicalSource = isCanonicalImportSpecifier(source);
            const canonicalTarget = isCanonicalImportSpecifier(target);
            if (!canonicalSource) {
              errors.push('mend.importRewrites: source must be a canonical non-empty string.');
            }
            if (!canonicalTarget) {
              errors.push('mend.importRewrites: target must be a canonical non-empty string.');
            }
            if (canonicalSource && !PROJECT_ALIAS_RE.test(source)) {
              errors.push('mend.importRewrites: source must start with "@/" or "~/".');
            }
            if (canonicalSource && canonicalTarget && source === target) {
              errors.push('mend.importRewrites: source and target must differ.');
            }
            if (allowedImports && canonicalSource && allowedImports.some((prefix) => source.startsWith(prefix))) {
              errors.push('mend.importRewrites: source must violate allowedImports.');
            }
            if (allowedImports && canonicalTarget && !allowedImports.some((prefix) => target.startsWith(prefix))) {
              errors.push('mend.importRewrites: target must match allowedImports.');
            }
          }
        }
      }
    }
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
    lines.push(...formatSection(section, errorGroups[section]!));
  }

  if (warnings.length > 0) {
    lines.push('');
    const warningGroups = groupMessagesBySection(warnings);
    for (const section of Object.keys(warningGroups)) {
      lines.push(...formatSection(section, warningGroups[section]!));
    }
  }

  return lines.join('\n');
}

export class ConfigValidationError extends Error {
  public override readonly name = 'ConfigValidationError';

  constructor(
    public readonly configPath: string,
    public readonly errors: string[],
    public readonly warnings: string[],
  ) {
    super(formatConfigValidationErrors(configPath, errors, warnings));
  }
}
