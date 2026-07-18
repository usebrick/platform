import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildDebtBaseline,
  debtBaselinePath,
  evaluateNewDebt,
  findingIdentity,
  loadDebtBaseline,
  loadDebtBaselineState,
  saveDebtBaseline,
} from '../../src/cli/report/debt-baseline';
import { compareFindingBaseline } from '../../src/report/finding-delta';
import type { DebtBaseline, Issue, ProjectReport } from '../../src/types';
import { runScan } from '../../src/cli/scan';
import { hashConfig } from '../../src/engine/cache';

const cwd = '/workspace';

function issue(fileName: string, message: string, line: number): Issue {
  return {
    ruleId: 'visual/arbitrary-escape',
    category: 'visual',
    severity: 'medium',
    aiSpecific: true,
    filePath: join(cwd, fileName),
    message,
    line,
    column: 1,
  };
}

function report(issues: Issue[]): ProjectReport {
  return { issues } as ProjectReport;
}

describe('durable new-debt baseline', () => {
  it('preserves the pre-extraction finding identity bytes', () => {
    expect(findingIdentity(
      issue('src/A.tsx', "Layout arbitrary value 'p-[13px]'", 4),
      cwd,
    )).toBe('d3d60674df286693c4022f5443e67841b487ed8bd3c5ebd857c4373e9ca63f17');
  });

  it('builds a bounded revision-2 snapshot set from active unique findings', () => {
    const active = issue('src/A.tsx', "Layout arbitrary value 'p-[13px]'", 4);
    const outside = {
      ...issue('src/B.tsx', 'Outside-workspace finding', 8),
      filePath: '/outside/B.tsx',
    };
    const baseline = buildDebtBaseline(report([
      active,
      { ...active, severity: 'high' },
      outside,
      { ...issue('src/C.tsx', 'Suppressed finding', 12), severity: 'off' as Issue['severity'] },
    ]), cwd, 'config-a', 'commit-a');

    expect(baseline.baseline_revision).toBe(2);
    expect(baseline.finding_snapshots).toHaveLength(2);
    expect(baseline.finding_snapshots?.map(({ identity }) => identity)).toEqual(
      [...baseline.finding_ids].sort(),
    );
    expect(baseline.finding_snapshots?.find(({ identity }) =>
      identity === findingIdentity(active, cwd)
    )).toMatchObject({
      ruleId: active.ruleId,
      category: active.category,
      severity: active.severity,
      aiSpecific: active.aiSpecific,
      filePath: 'src/A.tsx',
      line: 4,
      column: 1,
    });
    expect(baseline.finding_snapshots?.find(({ identity }) =>
      identity === findingIdentity(outside, cwd)
    )).not.toHaveProperty('filePath');
  });

  it('compares revision-2 findings as new, unchanged, and resolved', () => {
    const unchanged = issue('src/A.tsx', 'Unchanged finding', 4);
    const resolved = issue('src/B.tsx', 'Resolved finding', 8);
    const introduced = issue('src/C.tsx', 'New finding', 12);
    const baseline = buildDebtBaseline(
      report([unchanged, resolved]),
      cwd,
      'config-a',
      'commit-a',
    );
    const current = report([unchanged, introduced]);

    const comparison = compareFindingBaseline(current, baseline, cwd, 'config-a');
    expect(comparison).toMatchObject({
      status: 'compared',
      newCount: 1,
      unchangedCount: 1,
      resolvedCount: 1,
      resolvedDetails: 'available',
    });
    expect(comparison.findingChanges.get(findingIdentity(unchanged, cwd))).toBe('unchanged');
    expect(comparison.findingChanges.get(findingIdentity(introduced, cwd))).toBe('new');
    expect(comparison.resolvedSnapshots).toEqual([
      expect.objectContaining({
        identity: findingIdentity(resolved, cwd),
        filePath: 'src/B.tsx',
      }),
    ]);

    expect(compareFindingBaseline(current, baseline, cwd, 'config-b')).toMatchObject({
      status: 'incompatible',
      reason: 'config-mismatch',
    });
  });

  it('loads a literal revision-1 baseline and reports resolved counts without details', () => {
    const workspace = mkdtempSync(join('/tmp', 'slopbrick-debt-v1-'));
    try {
      const unchanged = issue('src/A.tsx', 'Unchanged finding', 4);
      const resolved = issue('src/B.tsx', 'Resolved finding', 8);
      const introduced = issue('src/C.tsx', 'New finding', 12);
      const legacy: DebtBaseline = {
        kind: 'slopbrick-debt-baseline-v1',
        version: '0.43.0',
        config_hash: 'config-a',
        git_head: 'commit-a',
        baseline_created: '2026-07-18T00:00:00.000Z',
        baseline_revision: 1,
        finding_ids: [
          findingIdentity(unchanged, cwd),
          findingIdentity(resolved, cwd),
        ].sort(),
      };
      mkdirSync(join(workspace, '.slopbrick', 'cache'), { recursive: true });
      writeFileSync(debtBaselinePath(workspace), JSON.stringify(legacy));

      expect(loadDebtBaselineState(workspace)).toEqual({ status: 'loaded', baseline: legacy });
      expect(loadDebtBaseline(workspace)).toEqual(legacy);
      expect(compareFindingBaseline(
        report([unchanged, introduced]),
        legacy,
        cwd,
        'config-a',
      )).toMatchObject({
        status: 'compared',
        currentCount: 2,
        baselineCount: 2,
        newCount: 1,
        unchangedCount: 1,
        resolvedCount: 1,
        resolvedDetails: 'legacy-unavailable',
      });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('preserves revision-1 loading for legacy string identities', () => {
    const workspace = mkdtempSync(join('/tmp', 'slopbrick-debt-v1-identity-'));
    try {
      const legacy: DebtBaseline = {
        kind: 'slopbrick-debt-baseline-v1',
        version: '0.43.0',
        config_hash: 'config-a',
        git_head: 'commit-a',
        baseline_created: '2026-07-18T00:00:00.000Z',
        baseline_revision: 1,
        finding_ids: ['legacy-compatible-id'],
      };
      mkdirSync(join(workspace, '.slopbrick', 'cache'), { recursive: true });
      writeFileSync(debtBaselinePath(workspace), JSON.stringify(legacy));

      expect(loadDebtBaselineState(workspace)).toEqual({ status: 'loaded', baseline: legacy });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('distinguishes missing baselines from invalid snapshot baselines', () => {
    const workspace = mkdtempSync(join('/tmp', 'slopbrick-debt-state-'));
    try {
      expect(loadDebtBaselineState(workspace)).toEqual({ status: 'missing' });

      const baseline = buildDebtBaseline(
        report([issue('src/A.tsx', 'Baseline finding', 4)]),
        cwd,
        'config-a',
        'commit-a',
      );
      mkdirSync(join(workspace, '.slopbrick', 'cache'), { recursive: true });
      writeFileSync(debtBaselinePath(workspace), JSON.stringify({
        ...baseline,
        finding_snapshots: baseline.finding_snapshots?.map((snapshot) => ({
          ...snapshot,
          filePath: '/workspace/src/A.tsx',
        })),
      }));

      expect(loadDebtBaselineState(workspace)).toEqual({ status: 'invalid' });
      expect(loadDebtBaseline(workspace)).toBeUndefined();
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it.each([
    ['escaping path', (baseline: DebtBaseline) => ({
      ...baseline,
      finding_snapshots: baseline.finding_snapshots?.map((snapshot) => ({
        ...snapshot,
        filePath: '../outside.ts',
      })),
    })],
    ['malformed path', (baseline: DebtBaseline) => ({
      ...baseline,
      finding_snapshots: baseline.finding_snapshots?.map((snapshot) => ({
        ...snapshot,
        filePath: '',
      })),
    })],
    ['malformed snapshot field', (baseline: DebtBaseline) => ({
      ...baseline,
      finding_snapshots: baseline.finding_snapshots?.map((snapshot) => ({
        ...snapshot,
        aiSpecific: 'yes',
      })),
    })],
    ['snapshot identity mismatch', (baseline: DebtBaseline) => ({
      ...baseline,
      finding_snapshots: baseline.finding_snapshots?.map((snapshot) => ({
        ...snapshot,
        identity: 'f'.repeat(64),
      })),
    })],
    ['missing revision-2 snapshots', (baseline: DebtBaseline) => {
      const { finding_snapshots: _snapshots, ...withoutSnapshots } = baseline;
      return withoutSnapshots;
    }],
  ])('rejects revision-2 baselines with %s', (_name, mutate) => {
    const workspace = mkdtempSync(join('/tmp', 'slopbrick-debt-invalid-'));
    try {
      const baseline = buildDebtBaseline(
        report([issue('src/A.tsx', 'Baseline finding', 4)]),
        cwd,
        'config-a',
        'commit-a',
      );
      mkdirSync(join(workspace, '.slopbrick', 'cache'), { recursive: true });
      writeFileSync(debtBaselinePath(workspace), JSON.stringify(mutate(baseline)));

      expect(loadDebtBaselineState(workspace)).toEqual({ status: 'invalid' });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('computes a deterministic finding-identity delta', () => {
    const baselineReport = report([
      issue('src/A.tsx', "Layout arbitrary value 'p-[13px]'", 4),
      issue('src/B.tsx', "Layout arbitrary value 'm-[9px]'", 8),
    ]);
    const baseline = buildDebtBaseline(baselineReport, cwd, 'config-a', 'commit-a');
    const currentReport = report([
      issue('src/A.tsx', "Layout arbitrary value 'p-[13px]'", 4),
      issue('src/B.tsx', "Layout arbitrary value 'm-[9px]'", 8),
      issue('src/C.tsx', "Layout arbitrary value 'gap-[7px]'", 12),
    ]);

    expect(evaluateNewDebt(currentReport, baseline, cwd, 1)).toMatchObject({
      status: 'passed',
      baselineAvailable: true,
      baselineFindingCount: 2,
      currentFindingCount: 3,
      newFindingCount: 1,
      maxNewIssues: 1,
      failed: false,
    });
    expect(evaluateNewDebt(currentReport, baseline, cwd, 0)).toMatchObject({
      status: 'failed',
      newFindingCount: 1,
      maxNewIssues: 0,
      failed: true,
    });
  });

  it('fails closed when a max-new-issues gate has no durable baseline', () => {
    expect(evaluateNewDebt(report([issue('src/A.tsx', 'new finding', 1)]), undefined, cwd, 0)).toMatchObject({
      status: 'not-evaluated',
      baselineAvailable: false,
      failed: true,
      maxNewIssues: 0,
    });
  });

  it('does not count suppressed findings as new debt', () => {
    const baseline = buildDebtBaseline(
      report([issue('src/A.tsx', 'active finding', 1)]),
      cwd,
      'config-a',
      'commit-a',
    );
    const current = report([
      issue('src/A.tsx', 'active finding', 1),
      { ...issue('src/B.tsx', 'suppressed finding', 2), severity: 'off' as Issue['severity'] },
    ]);

    expect(evaluateNewDebt(current, baseline, cwd, 0)).toMatchObject({
      status: 'passed',
      currentFindingCount: 1,
      newFindingCount: 0,
      failed: false,
    });
  });

  it('wires the durable delta through the real scan pipeline', async () => {
      const workspace = mkdtempSync(join('/tmp', 'slopbrick-new-debt-e2e-'));
    try {
      const source = 'export const A = () => <div className="p-[13px] m-[9px] gap-[7px]" />;\n';
      mkdirSync(join(workspace, 'src'), { recursive: true });
      writeFileSync(join(workspace, 'src', 'A.tsx'), source);

      const first = await runScan({ workspace, quiet: true, telemetry: false, threadCount: 1 });
      saveDebtBaseline(
        workspace,
        buildDebtBaseline(first.report, workspace, hashConfig(first.config), 'unknown'),
      );

      writeFileSync(join(workspace, 'src', 'B.tsx'), source.replace('A', 'B'));
      const current = await runScan({
        workspace,
        quiet: true,
        telemetry: false,
        threadCount: 1,
        ciGate: { maxNewIssues: 0 },
      });

      expect(current.newDebtFailure).toBe(true);
      expect(current.report.newDebt).toMatchObject({
        status: 'failed',
        baselineAvailable: true,
        maxNewIssues: 0,
      });
      expect(current.report.newDebt?.newFindingCount).toBeGreaterThan(0);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 30_000);
});
