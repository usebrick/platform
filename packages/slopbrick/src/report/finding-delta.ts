import type {
  DebtBaseline,
  DebtBaselineFindingSnapshot,
  FirstScanFindingChange,
  FirstScanFindingDelta,
  ProjectReport,
} from '../types';
import { findingIdentity, legacyFindingIdentity } from './finding-identity';

export interface FindingBaselineComparison extends FirstScanFindingDelta {
  findingChanges: ReadonlyMap<string, FirstScanFindingChange>;
  resolvedSnapshots?: DebtBaselineFindingSnapshot[];
}

function activeFindingIds(
  report: ProjectReport,
  cwd: string,
  identityVersion: 1 | 2,
): string[] {
  const identify = identityVersion === 1 ? legacyFindingIdentity : findingIdentity;
  return [...new Set(
    (report.issues ?? [])
      .filter((issue) => (issue.severity as string) !== 'off')
      .map((issue) => identify(issue, cwd)),
  )].sort();
}

export function compareFindingBaseline(
  current: ProjectReport,
  baseline: DebtBaseline | undefined,
  cwd: string,
  configHash?: string,
): FindingBaselineComparison {
  const identityVersion = baseline?.finding_identity_version ?? (baseline ? 1 : 2);
  const currentIds = activeFindingIds(current, cwd, identityVersion);
  if (!baseline) {
    return {
      kind: 'slopbrick-finding-delta-v1',
      status: 'unavailable',
      reason: 'missing-baseline',
      currentCount: currentIds.length,
      summary: 'Finding delta unavailable: durable debt baseline is missing.',
      findingChanges: new Map(),
    };
  }

  if (configHash !== undefined && baseline.config_hash !== configHash) {
    return {
      kind: 'slopbrick-finding-delta-v1',
      status: 'incompatible',
      reason: 'config-mismatch',
      currentCount: currentIds.length,
      summary: 'Finding delta incompatible: durable debt baseline config identity does not match the current scan.',
      findingChanges: new Map(),
    };
  }

  const baselineIds = new Set(baseline.finding_ids);
  const currentIdSet = new Set(currentIds);
  const findingChanges = new Map<string, FirstScanFindingChange>();
  let newCount = 0;
  let unchangedCount = 0;
  for (const identity of currentIds) {
    const change = baselineIds.has(identity) ? 'unchanged' : 'new';
    findingChanges.set(identity, change);
    if (change === 'new') newCount += 1;
    else unchangedCount += 1;
  }

  const resolvedIds = new Set(
    [...baselineIds].filter((identity) => !currentIdSet.has(identity)),
  );
  const resolvedSnapshots = baseline.finding_snapshots?.filter(({ identity }) =>
    resolvedIds.has(identity)
  );
  const resolvedDetails = baseline.baseline_revision === 2 && baseline.finding_snapshots
    ? 'available' as const
    : 'legacy-unavailable' as const;

  return {
    kind: 'slopbrick-finding-delta-v1',
    status: 'compared',
    baselineRevision: baseline.baseline_revision,
    currentCount: currentIds.length,
    baselineCount: baselineIds.size,
    newCount,
    unchangedCount,
    resolvedCount: resolvedIds.size,
    resolvedDetails,
    summary: `Finding delta compared: ${newCount} new, ${unchangedCount} unchanged, ${resolvedIds.size} resolved.`,
    findingChanges,
    ...(resolvedDetails === 'available' ? { resolvedSnapshots: resolvedSnapshots ?? [] } : {}),
  };
}
