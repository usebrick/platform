// Threshold logic, issue filters, and config/report serializers shared
// between the CLI commands. Pure functions where possible.

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { formatPretty } from '../report/pretty';
import type {
  BaselineMeta,
  BaselineCache,
  ComponentScore,
  FileScanResult,
  Issue,
  ProjectReport,
  ResolvedConfig,
} from '../types';

// ─── Threshold logic ──────────────────────────────────────────────────────

export function thresholdExceeded(report: ProjectReport, config: ResolvedConfig): boolean {
  // v0.21.0: aiSlopScore is now the RAW amount of slop (0=clean, 100=saturated).
  // The CI gate keeps the `meanSlop` config name (no breaking rename of the
  // user's config file) but flips the comparison: aiSlopScore > meanSlop fails.
  // In v0.15–v0.20.1 the check was `aiSlopScore < meanSlop` (the v0.15.0
  // inversion, where aiSlopScore was cleanliness).
  if ((report.aiSlopScore ?? 0) > config.thresholds.meanSlop) {
    return true;
  }
  return categoryThresholdBreached(report, config.thresholds.categoryThresholds);
}

export function failedThresholdCount(report: ProjectReport, config: ResolvedConfig): number {
  // v0.42.0: now wraps failedThresholds() so adding new threshold types
  // is a one-line change.
  return failedThresholds(report, config).length;
}

/**
 * v0.42.0 (user-review fix): failedThresholdCount() returned just the
 * count. The CLI then printed "{n} threshold(s) failed. See details
 * above." — but in --brief the user sees only the headline CI gate
 * ("AI Slop Score <= 15 -> fail"), not the per-threshold list.
 *
 * This function returns the actual list of failed threshold names so
 * the caller can name them in the final error message.
 */
export function failedThresholds(report: ProjectReport, config: ResolvedConfig): string[] {
  const failed: string[] = [];
  // v0.21.0: aiSlopScore is raw amount of slop (0=clean, 100=saturated).
  // The `meanSlop` config field keeps its name (no breaking rename) but
  // the comparison flips: aiSlopScore > meanSlop fails (was `<` in v0.20.1
  // when aiSlopScore was the inverted cleanliness).
  if (report.aiSlopScore > config.thresholds.meanSlop) failed.push('meanSlop');
  if (report.p90Score > config.thresholds.p90Slop) failed.push('p90Slop');
  if (report.peakScore > config.thresholds.individualSlopThreshold) failed.push('individualSlopThreshold');
  const cat = config.thresholds.categoryThresholds;
  if (cat) {
    for (const [category, limit] of Object.entries(cat)) {
      if (limit === undefined) continue;
      const score = report.categoryScores[category as keyof typeof report.categoryScores];
      if (score !== undefined && score > limit) failed.push(`category:${category}`);
    }
  }
  return failed;
}

export function categoryThresholdBreached(
  report: ProjectReport,
  categoryThresholds?: Partial<Record<string, number>>,
): boolean {
  if (!categoryThresholds) return false;
  for (const [category, limit] of Object.entries(categoryThresholds)) {
    if (limit === undefined) continue;
    const score = report.categoryScores[category as keyof typeof report.categoryScores];
    if (score !== undefined && score > limit) return true;
  }
  return false;
}

export function baselineStatusMessage(baseline: BaselineMeta): string {
  const date = new Date(baseline.createdAt).toLocaleString();
  return `Baseline active since ${date} (Revision ${baseline.baselineRevision}). Run \`slopbrick --tighten\` to reduce baseline forgiveness by 10%.`;
}

// ─── Staged-file gating (used by --staged / --changed) ────────────────────

export interface StagedGatingResult {
  failed: boolean;
  reason?: string;
}

function checkIndividualThreshold(scores: ComponentScore[], threshold: number): StagedGatingResult {
  for (const score of scores) {
    if (score.adjustedScore > threshold) {
      return {
        failed: true,
        reason: `Staged file ${score.filePath} exceeds individual threshold (${score.adjustedScore.toFixed(1)} > ${threshold}).`,
      };
    }
  }
  return { failed: false };
}

/**
 * Decide whether a staged set of changed files should block the commit.
 *
 * Without a baseline, falls back to per-file threshold checks. With a
 * baseline, simulates the post-change project state (new + modified -
 * deleted components) and compares the hypothetical mean to the
 * configured `meanSlop`.
 */
export function stagedGating(
  scores: ComponentScore[],
  config: ResolvedConfig,
  baseline: BaselineCache | undefined,
  cwd: string,
): StagedGatingResult {
  if (scores.length === 0) return { failed: false };

  const individualThreshold = config.thresholds.individualSlopThreshold;

  if (!baseline) {
    return checkIndividualThreshold(scores, individualThreshold);
  }

  for (const score of scores) {
    const relPath = relative(cwd, score.filePath);
    const isNewFile = !baseline.scores[relPath];
    if (isNewFile && score.adjustedScore > individualThreshold) {
      return {
        failed: true,
        reason: `New staged file ${relPath} exceeds individual threshold (${score.adjustedScore.toFixed(1)} > ${individualThreshold}).`,
      };
    }
  }

  const stagedPaths = new Set(scores.map((s) => relative(cwd, s.filePath)));
  const cachedTotal = baseline.totalComponentCount;
  let newStagedComponentCount = 0;
  let deletedStagedComponentCount = 0;
  let modifiedDiff = 0;

  for (const score of scores) {
    const cached = baseline.scores[relative(cwd, score.filePath)];
    if (cached) {
      modifiedDiff += score.componentCount - cached.componentCount;
    } else {
      newStagedComponentCount += score.componentCount;
    }
  }

  for (const [filePath, cached] of Object.entries(baseline.scores)) {
    if (stagedPaths.has(filePath)) continue;
    if (!existsSync(filePath) && !existsSync(resolve(cwd, filePath))) {
      deletedStagedComponentCount += cached.componentCount;
    }
  }

  const virtualN = cachedTotal + newStagedComponentCount - deletedStagedComponentCount + modifiedDiff;
  if (virtualN <= 0) {
    return checkIndividualThreshold(scores, individualThreshold);
  }

  let sumAllCachedAdjustedScores = 0;
  for (const cached of Object.values(baseline.scores)) {
    sumAllCachedAdjustedScores += cached.baselineScore;
  }

  let sumCachedStagedScores = 0;
  let sumNewStagedScores = 0;
  for (const score of scores) {
    const cached = baseline.scores[relative(cwd, score.filePath)];
    if (cached) {
      sumCachedStagedScores += cached.baselineScore;
    }
    sumNewStagedScores += score.adjustedScore;
  }

  const hypotheticalMean =
    (sumAllCachedAdjustedScores - sumCachedStagedScores + sumNewStagedScores) / virtualN;

  // v0.21.0: hypotheticalMean is the raw amount of slop (0=clean, 100=saturated).
  // Comparison: > meanSlop fails (same direction as v0.14, restored from
  // v0.15–v0.20.1 inversion).
  if (hypotheticalMean > config.thresholds.meanSlop) {
    return {
      failed: true,
      reason: `Hypothetical project mean (${hypotheticalMean.toFixed(1)}) exceeds threshold (${config.thresholds.meanSlop}).`,
    };
  }

  return { failed: false };
}

// ─── Issue filters ────────────────────────────────────────────────────────

export interface IssueFilterOptions {
  aiOnly?: boolean;
  humanOnly?: boolean;
  ignoreWcag22?: boolean;
  rule?: string;
  securityOnly?: boolean;
}

export function filterIssues(issues: Issue[], options: IssueFilterOptions): Issue[] {
  let result = issues;
  if (options.aiOnly) {
    result = result.filter((issue) => issue.aiSpecific);
  }
  if (options.humanOnly) {
    result = result.filter((issue) => !issue.aiSpecific);
  }
  if (options.ignoreWcag22) {
    result = result.filter((issue) => issue.category !== 'wcag');
  }
  if (options.rule) {
    const targetRule = options.rule;
    result = result.filter((issue) => issue.ruleId === targetRule);
  }
  if (options.securityOnly) {
    result = result.filter((issue) => issue.category === 'security' || issue.ruleId.startsWith('security/'));
  }
  return result;
}

/**
 * Drop issues suppressed by inline `// slopbrick-disable[-next-line]`
 * or block directives at or above the issue's line. Project-level rules
 * (no filePath) are never suppressed.
 */
export function filterByDisabledDirectives(
  result: FileScanResult,
  disabledRules: readonly { ruleId: string; scope: 'line' | 'next-line' | 'block'; line: number }[],
): void {
  if (disabledRules.length === 0) return;
  const suppressed = new Set(disabledRules.map((d) => d.ruleId));
  result.issues = result.issues.filter((issue) => {
    if (!suppressed.has(issue.ruleId)) return true;
    const line = issue.line;
    return !disabledRules.some((d) => {
      if (d.ruleId !== issue.ruleId) return false;
      if (d.scope === 'line') return d.line === line;
      if (d.scope === 'next-line') return d.line === line;
      if (d.scope === 'block') return line >= d.line;
      return false;
    });
  });
}

// ─── File intersection + gitignore helpers ───────────────────────────────

export function intersectFiles(discovered: string[], gitPaths: string[], cwd: string): string[] {
  if (gitPaths.length === 0) return [];
  const gitAbs = new Set(gitPaths.map((p) => resolve(cwd, p)));
  return discovered.filter((file) => gitAbs.has(file));
}

export function appendGitignore(cwd: string): void {
  const gitignorePath = join(cwd, '.gitignore');
  const entry = '.slopbrick/';
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf8');
    if (content.includes(entry)) return;
    const normalized = content.endsWith('\n') ? content : `${content}\n`;
    writeFileSync(gitignorePath, `${normalized}${entry}\n`);
  } else {
    writeFileSync(gitignorePath, `${entry}\n`);
  }
}

// ─── Config / report serializers ─────────────────────────────────────────

function serializeValue(value: unknown, indent = 0): string {
  const currentIndent = ' '.repeat(indent);
  const nextIndent = ' '.repeat(indent + 2);

  if (value instanceof RegExp) {
    return `new RegExp(${JSON.stringify(value.source)}, ${JSON.stringify(value.flags)})`;
  }
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map((item) => serializeValue(item, indent + 2)).join(`,\n${nextIndent}`);
    return `[\n${nextIndent}${items},\n${currentIndent}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    const items = entries
      .map(([key, val]) => `${JSON.stringify(key)}: ${serializeValue(val, indent + 2)}`)
      .join(`,\n${nextIndent}`);
    return `{\n${nextIndent}${items},\n${currentIndent}}`;
  }
  return JSON.stringify(value);
}

export function serializeConfig(config: ResolvedConfig): string {
  return `export default ${serializeValue(config, 0)};\n`;
}

export type ReportReadResult =
  | { ok: true; report: ProjectReport }
  | { ok: false; error: string };

export function readReportFile(path: string): ReportReadResult {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (error) {
    return { ok: false, error: `Cannot read ${path}: ${(error as Error).message}` };
  }
  try {
    const parsed = JSON.parse(raw) as ProjectReport;
    return { ok: true, report: parsed };
  } catch (error) {
    return { ok: false, error: `Invalid JSON in ${path}: ${(error as Error).message}` };
  }
}

export function formatReportFromFile(report: ProjectReport, sourcePath: string): string {
  return `Re-rendered from ${sourcePath}\n\n${formatPretty(report)}`;
}
