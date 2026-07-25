import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { isAbsolute, join, posix, win32 } from 'node:path';
import { compareFindingBaseline } from '../../report/finding-delta';
import {
  findingIdentity,
  repositoryRelativeFindingLocation,
} from '../../report/finding-identity';
import { VERSION } from '../../types';
import type {
  Category,
  DebtBaseline,
  DebtBaselineFindingSnapshot,
  Issue,
  NewDebtDecision,
  ProjectReport,
  Severity,
} from '../../types';

export { findingIdentity } from '../../report/finding-identity';

const DEBT_BASELINE_FILE = 'debt-baseline.json';

export function debtBaselinePath(projectPath: string): string {
  return join(projectPath, '.slopbrick', 'cache', DEBT_BASELINE_FILE);
}

function normalizedSnapshotPath(issue: Issue, cwd: string): string | undefined {
  if (!issue.filePath) return undefined;
  const relativePath = repositoryRelativeFindingLocation(issue, cwd);
  return isPortableRelativeSnapshotPath(relativePath) ? relativePath : undefined;
}

function collectFindingSnapshots(
  report: ProjectReport,
  cwd: string,
): DebtBaselineFindingSnapshot[] {
  const byIdentity = new Map<string, DebtBaselineFindingSnapshot>();
  for (const issue of report.issues ?? []) {
    if ((issue.severity as string) === 'off') continue;
    const identity = findingIdentity(issue, cwd);
    if (byIdentity.has(identity)) continue;
    const filePath = normalizedSnapshotPath(issue, cwd);
    byIdentity.set(identity, {
      identity,
      ruleId: issue.ruleId,
      category: issue.category,
      severity: issue.severity,
      aiSpecific: issue.aiSpecific,
      ...(filePath ? { filePath } : {}),
      line: issue.line,
      column: issue.column,
    });
  }
  return [...byIdentity.values()].sort((left, right) =>
    left.identity.localeCompare(right.identity)
  );
}

export function collectFindingIds(report: ProjectReport, cwd: string): string[] {
  return collectFindingSnapshots(report, cwd).map(({ identity }) => identity);
}

export function buildDebtBaseline(
  report: ProjectReport,
  cwd: string,
  configHash: string,
  gitHead: string,
): DebtBaseline {
  const findingSnapshots = collectFindingSnapshots(report, cwd);
  return {
    kind: 'slopbrick-debt-baseline-v1',
    version: VERSION,
    config_hash: configHash,
    git_head: gitHead,
    baseline_created: new Date().toISOString(),
    baseline_revision: 2,
    finding_identity_version: 2,
    finding_ids: findingSnapshots.map(({ identity }) => identity),
    finding_snapshots: findingSnapshots,
  };
}

const CATEGORIES = new Set<Category>([
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
]);
const SEVERITIES = new Set<Severity>(['low', 'medium', 'high']);
const SNAPSHOT_KEYS = new Set([
  'identity',
  'ruleId',
  'category',
  'severity',
  'aiSpecific',
  'filePath',
  'line',
  'column',
]);
const WINDOWS_DRIVE_PREFIX = /^[A-Za-z]:/;

function isPortableRelativeSnapshotPath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) return false;
  if (
    isAbsolute(value)
    || win32.isAbsolute(value)
    || WINDOWS_DRIVE_PREFIX.test(value)
    || value.includes('\\')
    || value.endsWith('/')
  ) return false;
  const normalized = posix.normalize(value);
  return normalized === value
    && normalized !== '.'
    && normalized !== '..'
    && !normalized.startsWith('../');
}

function isFindingSnapshot(value: unknown): value is DebtBaselineFindingSnapshot {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).every((key) => SNAPSHOT_KEYS.has(key))
    && typeof record.identity === 'string'
    && record.identity.length > 0
    && typeof record.ruleId === 'string'
    && record.ruleId.length > 0
    && typeof record.category === 'string'
    && CATEGORIES.has(record.category as Category)
    && typeof record.severity === 'string'
    && SEVERITIES.has(record.severity as Severity)
    && typeof record.aiSpecific === 'boolean'
    && (record.filePath === undefined || isPortableRelativeSnapshotPath(record.filePath))
    && typeof record.line === 'number'
    && Number.isInteger(record.line)
    && record.line >= 0
    && typeof record.column === 'number'
    && Number.isInteger(record.column)
    && record.column >= 0
  );
}

function isDebtBaseline(value: unknown): value is DebtBaseline {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (!(
    record.kind === 'slopbrick-debt-baseline-v1' &&
    typeof record.version === 'string' &&
    typeof record.config_hash === 'string' &&
    typeof record.git_head === 'string' &&
    typeof record.baseline_created === 'string' &&
    (record.baseline_revision === 1 || record.baseline_revision === 2) &&
    (record.finding_identity_version === undefined
      || record.finding_identity_version === 1
      || record.finding_identity_version === 2) &&
    Array.isArray(record.finding_ids) &&
    record.finding_ids.every((id) => typeof id === 'string')
  )) return false;

  const findingIds = record.finding_ids as string[];
  if (record.finding_snapshots !== undefined) {
    if (!Array.isArray(record.finding_snapshots)) return false;
    if (!record.finding_snapshots.every(isFindingSnapshot)) return false;
  }
  if (record.baseline_revision === 2) {
    if (new Set(findingIds).size !== findingIds.length) return false;
    if (!Array.isArray(record.finding_snapshots)) return false;
    const snapshotIds = record.finding_snapshots.map(({ identity }) => identity);
    if (new Set(snapshotIds).size !== snapshotIds.length) return false;
    if (
      snapshotIds.length !== findingIds.length
      || snapshotIds.some((identity) => !findingIds.includes(identity))
    ) return false;
  }
  return true;
}

export type DebtBaselineLoadState =
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'loaded'; baseline: DebtBaseline };

export function loadDebtBaselineState(projectPath: string): DebtBaselineLoadState {
  const path = debtBaselinePath(projectPath);
  if (!existsSync(path)) return { status: 'missing' };
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return isDebtBaseline(parsed)
      ? { status: 'loaded', baseline: parsed }
      : { status: 'invalid' };
  } catch {
    return { status: 'invalid' };
  }
}

export function loadDebtBaseline(projectPath: string): DebtBaseline | undefined {
  const state = loadDebtBaselineState(projectPath);
  return state.status === 'loaded' ? state.baseline : undefined;
}

function projectFindingSnapshot(
  snapshot: DebtBaselineFindingSnapshot,
): DebtBaselineFindingSnapshot {
  return {
    identity: snapshot.identity,
    ruleId: snapshot.ruleId,
    category: snapshot.category,
    severity: snapshot.severity,
    aiSpecific: snapshot.aiSpecific,
    ...(snapshot.filePath ? { filePath: snapshot.filePath } : {}),
    line: snapshot.line,
    column: snapshot.column,
  };
}

function projectDebtBaseline(baseline: DebtBaseline): DebtBaseline {
  return {
    kind: baseline.kind,
    version: baseline.version,
    config_hash: baseline.config_hash,
    git_head: baseline.git_head,
    baseline_created: baseline.baseline_created,
    baseline_revision: baseline.baseline_revision,
    ...(baseline.finding_identity_version !== undefined
      ? { finding_identity_version: baseline.finding_identity_version }
      : {}),
    finding_ids: [...baseline.finding_ids],
    ...(baseline.finding_snapshots
      ? { finding_snapshots: baseline.finding_snapshots.map(projectFindingSnapshot) }
      : {}),
  };
}

export function saveDebtBaseline(projectPath: string, baseline: DebtBaseline): void {
  if (!isDebtBaseline(baseline)) {
    throw new Error('Cannot save invalid debt baseline.');
  }
  const path = debtBaselinePath(projectPath);
  const temporaryPath = `${path}.${process.pid}-${randomUUID()}.tmp`;
  mkdirSync(join(projectPath, '.slopbrick', 'cache'), { recursive: true });
  try {
    writeFileSync(
      temporaryPath,
      JSON.stringify(projectDebtBaseline(baseline), null, 2),
      { encoding: 'utf8', flag: 'wx', mode: 0o600 },
    );
    renameSync(temporaryPath, path);
  } catch (error) {
    try {
      unlinkSync(temporaryPath);
    } catch {
      // The staged file may not exist when creation itself failed.
    }
    throw error;
  }
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
  const comparison = compareFindingBaseline(report, baseline, cwd, configHash);
  if (comparison.status === 'unavailable') {
    return notEvaluated(
      comparison.currentCount,
      maxNewIssues,
      'New-debt gate not evaluated: durable debt baseline is missing. Run `slopbrick scan --baseline` first.',
    );
  }

  if (comparison.status === 'incompatible') {
    return notEvaluated(
      comparison.currentCount,
      maxNewIssues,
      'New-debt gate not evaluated: durable debt baseline config identity does not match the current scan.',
    );
  }

  const newFindingCount = comparison.newCount ?? 0;
  const failed = newFindingCount > maxNewIssues;
  return {
    kind: 'slopbrick-new-debt-v1',
    status: failed ? 'failed' : 'passed',
    failed,
    baselineAvailable: true,
    baselineRevision: comparison.baselineRevision,
    baselineFindingCount: comparison.baselineCount,
    currentFindingCount: comparison.currentCount,
    newFindingCount,
    maxNewIssues,
    summary: failed
      ? `New-debt gate failed: ${newFindingCount} new finding${newFindingCount === 1 ? '' : 's'} exceed the max-new-issues limit of ${maxNewIssues}.`
      : `New-debt gate passed: ${newFindingCount} new finding${newFindingCount === 1 ? '' : 's'} within the max-new-issues limit of ${maxNewIssues}.`,
  };
}
