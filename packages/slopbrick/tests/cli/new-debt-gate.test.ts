import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildDebtBaseline,
  evaluateNewDebt,
} from '../../src/cli/report/debt-baseline';
import type { Issue, ProjectReport } from '../../src/types';
import { runScan } from '../../src/cli/scan';
import { hashConfig } from '../../src/engine/cache';
import { saveDebtBaseline } from '../../src/cli/report/debt-baseline';

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
