import type { FileScanResult, Issue, ResolvedConfig, Severity } from '../types';
import { canonicalizeStyleSource } from '../engine/normalize';

function isRuleEnabled(config: ResolvedConfig, id: string): boolean {
  const severity = config.rules[id];
  return severity !== undefined && severity !== 'off';
}

function resolveProjectSeverity(
  config: ResolvedConfig,
  id: string,
  defaultSeverity: Severity,
): Severity {
  const override = config.rules[id];
  if (override === 'auto' || override === undefined || override === 'off') {
    return defaultSeverity;
  }
  return override;
}

function createProjectIssue(
  id: string,
  category: Issue['category'],
  severity: Issue['severity'],
  aiSpecific: boolean,
  message: string,
  advice?: string,
  filePath?: string,
): Issue {
  const issue: Issue = {
    ruleId: id,
    category,
    severity,
    aiSpecific,
    message,
    line: 1,
    column: 1,
    advice,
  };
  if (filePath) {
    issue.filePath = filePath;
  }
  return issue;
}

export function analyzeGapMonopoly(results: FileScanResult[], config: ResolvedConfig): Issue[] {
  const id = 'layout/gap-monopoly';
  if (!isRuleEnabled(config, id)) return [];

  const gapValues: string[] = [];
  for (const result of results) {
    const values = result.gapValues ?? [];
    gapValues.push(...values);
  }
  // containerCount = number of distinct files that contributed gap tokens.
  const containerCount = new Set(
    results.filter((r) => (r.gapValues?.length ?? 0) > 0).map((r) => r.filePath),
  ).size;

  if (containerCount === 0) return [];

  const freq = new Map<string, number>();
  let maxFreq = 0;
  let dominantValue = '';
  for (const val of gapValues) {
    const next = (freq.get(val) ?? 0) + 1;
    freq.set(val, next);
    if (next > maxFreq) {
      maxFreq = next;
      dominantValue = val;
    }
  }

  const ratio = maxFreq / containerCount;
  const designSystemRestricted =
    Array.isArray(config.gapTokens) && config.gapTokens.length >= 1 && config.gapTokens.length <= 3;
  const tolerance = designSystemRestricted ? 0.95 : containerCount < 20 ? 0.85 : 0.7;

  if (ratio <= tolerance) return [];

  const score = (ratio - tolerance) / (1 - tolerance);
  if (score <= 0.5) return [];

  return [
    createProjectIssue(
      id,
      'layout',
      resolveProjectSeverity(config, id, 'medium'),
      true,
      `Gap value "${dominantValue}" dominates ${Math.round(ratio * 100)}% of ${containerCount} gap-declaring containers (score ${score.toFixed(2)}).`,
      'Introduce more spacing variety or document the intentional uniform spacing system in config.gapTokens.',
    ),
  ];
}

function truncateSnippet(source: string, maxLength = 80): string {
  const trimmed = source.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1)}…`;
}

export function analyzeCssBloat(results: FileScanResult[], config: ResolvedConfig): Issue[] {
  const id = 'perf/css-bloat';
  if (!isRuleEnabled(config, id)) return [];

  const occurrences = new Map<string, { count: number; files: Set<string>; snippet: string }>();

  for (const result of results) {
    for (const source of result.styleSources ?? []) {
      const normalized = canonicalizeStyleSource(source);
      if (!normalized) continue;
      const entry = occurrences.get(normalized);
      if (entry) {
        entry.count++;
        entry.files.add(result.filePath);
      } else {
        occurrences.set(normalized, {
          count: 1,
          files: new Set([result.filePath]),
          snippet: truncateSnippet(source),
        });
      }
    }
  }

  const issues: Issue[] = [];
  for (const [normalized, { count, files, snippet }] of occurrences) {
    if (count > 5 && files.size > 1) {
      const representativeFile = files.values().next().value as string;
      issues.push(
        createProjectIssue(
          id,
          'perf',
          resolveProjectSeverity(config, id, 'low'),
          false,
          `Repeated style block (${count} times across ${files.size} files): "${snippet}"`,
          'Extract the duplicated styles into a shared utility, component, or CSS class.',
          representativeFile,
        ),
      );
    }
  }

  return issues;
}

const SCREEN_PATH_RE = /[\\/]app[\\/]|[\\/]screens[\\/]/;
const FINGERPRINT_TAG_LIMIT = 15;

function analyzeDuplications(
  results: FileScanResult[],
  config: ResolvedConfig,
  id: string,
  category: Issue['category'],
  defaultSeverity: Severity,
  label: string,
  pathFilter?: (filePath: string) => boolean,
): Issue[] {
  if (!isRuleEnabled(config, id)) return [];

  const groups = new Map<string, string[]>();

  for (const result of results) {
    if (pathFilter && !pathFilter(result.filePath)) continue;
    const tags = (result.elementTags ?? []).slice(0, FINGERPRINT_TAG_LIMIT);
    if (tags.length === 0) continue;
    const fingerprint = JSON.stringify(tags);
    const list = groups.get(fingerprint) ?? [];
    list.push(result.filePath);
    groups.set(fingerprint, list);
  }

  const issues: Issue[] = [];
  for (const [fingerprint, files] of groups) {
    if (files.length < 2) continue;
    const tags = JSON.parse(fingerprint) as string[];
    issues.push(
      createProjectIssue(
        id,
        category,
        resolveProjectSeverity(config, id, defaultSeverity),
        true,
        `${files.length} ${label} files share the same top-level structure: [${tags.join(', ')}]`,
        'Extract the common boilerplate into a reusable component.',
        files[0],
      ),
    );
  }

  return issues;
}

export function analyzeDuplicatedScreens(results: FileScanResult[], config: ResolvedConfig): Issue[] {
  return analyzeDuplications(
    results,
    config,
    'layout/duplicated-screen',
    'layout',
    'medium',
    'screen',
    (filePath) => SCREEN_PATH_RE.test(filePath),
  );
}

export const PROJECT_RULE_IDS: string[] = [
  'layout/gap-monopoly',
  'perf/css-bloat',
  'layout/duplicated-screen',
];

export function runProjectRules(results: FileScanResult[], config: ResolvedConfig): Issue[] {
  return [
    ...analyzeGapMonopoly(results, config),
    ...analyzeCssBloat(results, config),
    ...analyzeDuplicatedScreens(results, config),
  ];
}
