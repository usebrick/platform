import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { VERSION } from '../../types';
import type { DebtBaseline, Issue, NewDebtDecision, ProjectReport } from '../../types';

const DEBT_BASELINE_FILE = 'debt-baseline.json';

export function debtBaselinePath(projectPath: string): string {
  return join(projectPath, '.slopbrick', 'cache', DEBT_BASELINE_FILE);
}

function findingLocation(issue: Issue, cwd: string): string {
  if (!issue.filePath) return '<project>';
  return isAbsolute(issue.filePath) ? relative(cwd, issue.filePath) : issue.filePath;
}

/**
 * Stable identity for one effective finding. The message is included because
 * it carries the rule's matched value, while severity is intentionally not:
 * changing policy severity must not manufacture new debt.
 */
export function findingIdentity(issue: Issue, cwd: string): string {
  const canonical = JSON.stringify({
    ruleId: issue.ruleId,
    category: issue.category,
    filePath: findingLocation(issue, cwd),
    line: issue.line,
    column: issue.column,
    message: issue.message,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function collectFindingIds(report: ProjectReport, cwd: string): string[] {
  return [...new Set(
    (report.issues ?? [])
      .filter((issue) => (issue.severity as string) !== 'off')
      .map((issue) => findingIdentity(issue, cwd)),
  )].sort();
}

export function buildDebtBaseline(
  report: ProjectReport,
  cwd: string,
  configHash: string,
  gitHead: string,
): DebtBaseline {
  return {
    kind: 'slopbrick-debt-baseline-v1',
    version: VERSION,
    config_hash: configHash,
    git_head: gitHead,
    baseline_created: new Date().toISOString(),
    baseline_revision: 1,
    finding_ids: collectFindingIds(report, cwd),
  };
}

function isDebtBaseline(value: unknown): value is DebtBaseline {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    record.kind === 'slopbrick-debt-baseline-v1' &&
    typeof record.version === 'string' &&
    typeof record.config_hash === 'string' &&
    typeof record.git_head === 'string' &&
    typeof record.baseline_created === 'string' &&
    typeof record.baseline_revision === 'number' &&
    Array.isArray(record.finding_ids) &&
    record.finding_ids.every((id) => typeof id === 'string')
  );
}

export function loadDebtBaseline(projectPath: string): DebtBaseline | undefined {
  const path = debtBaselinePath(projectPath);
  if (!existsSync(path)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return isDebtBaseline(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function saveDebtBaseline(projectPath: string, baseline: DebtBaseline): void {
  const path = debtBaselinePath(projectPath);
  mkdirSync(join(projectPath, '.slopbrick', 'cache'), { recursive: true });
  writeFileSync(path, JSON.stringify(baseline, null, 2), 'utf8');
}

function notEvaluated(
  currentFindingCount: number,
  maxNewIssues: number,
  summary: string,
): NewDebtDecision {
  return {
    kind: 'slopbrick-new-debt-v1',
    status: 'not-evaluated',
    failed: true,
    baselineAvailable: false,
    currentFindingCount,
    maxNewIssues,
    summary,
  };
}

export function evaluateNewDebt(
  report: ProjectReport,
  baseline: DebtBaseline | undefined,
  cwd: string,
  maxNewIssues: number,
  configHash?: string,
): NewDebtDecision {
  const currentIds = collectFindingIds(report, cwd);
  if (!baseline) {
    return notEvaluated(
      currentIds.length,
      maxNewIssues,
      'New-debt gate not evaluated: durable debt baseline is missing. Run `slopbrick scan --baseline` first.',
    );
  }

  if (configHash !== undefined && baseline.config_hash !== configHash) {
    return notEvaluated(
      currentIds.length,
      maxNewIssues,
      'New-debt gate not evaluated: durable debt baseline config identity does not match the current scan.',
    );
  }

  const baselineIds = new Set(baseline.finding_ids);
  const newFindingCount = currentIds.filter((id) => !baselineIds.has(id)).length;
  const failed = newFindingCount > maxNewIssues;
  return {
    kind: 'slopbrick-new-debt-v1',
    status: failed ? 'failed' : 'passed',
    failed,
    baselineAvailable: true,
    baselineRevision: baseline.baseline_revision,
    baselineFindingCount: baselineIds.size,
    currentFindingCount: currentIds.length,
    newFindingCount,
    maxNewIssues,
    summary: failed
      ? `New-debt gate failed: ${newFindingCount} new finding${newFindingCount === 1 ? '' : 's'} exceed the max-new-issues limit of ${maxNewIssues}.`
      : `New-debt gate passed: ${newFindingCount} new finding${newFindingCount === 1 ? '' : 's'} within the max-new-issues limit of ${maxNewIssues}.`,
  };
}
