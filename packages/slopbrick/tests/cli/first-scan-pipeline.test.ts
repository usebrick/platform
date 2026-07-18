import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runScan } from '../../src/cli/scan';
import {
  buildDebtBaseline,
  debtBaselinePath,
  saveDebtBaseline,
} from '../../src/cli/report/debt-baseline';
import { hashConfig } from '../../src/engine/cache';
import { assertDistBuilt, run as runPackageCli } from '../helpers/cli';

const workspaces: string[] = [];
const fixture = [
  'export const Fixture = () => (',
  '  <div className="p-[13px] m-[9px] gap-[7px]">',
  '    <input placeholder="TODO" />',
  '  </div>',
  ');',
  '',
].join('\n');

beforeAll(assertDistBuilt);

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

function createWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), 'slopbrick-first-scan-'));
  workspaces.push(workspace);
  mkdirSync(join(workspace, 'src'), { recursive: true });
  writeFileSync(join(workspace, 'slopbrick.config.mjs'),
    "export default { include: ['src/**/*.tsx'] };\n");
  writeFileSync(join(workspace, 'src', 'A.tsx'), fixture);
  return workspace;
}

function baselineReceipt(workspace: string) {
  const path = debtBaselinePath(workspace);
  return {
    bytes: readFileSync(path),
    mtimeMs: statSync(path).mtimeMs,
  };
}

function expectBaselineUnchanged(workspace: string, receipt: ReturnType<typeof baselineReceipt>) {
  const path = debtBaselinePath(workspace);
  expect(readFileSync(path)).toEqual(receipt.bytes);
  expect(statSync(path).mtimeMs).toBe(receipt.mtimeMs);
}

describe('first-scan projection in the real scan pipeline', () => {
  it('walks the package-local CLI from first scan through an unchanged rescan without mutating source or baseline', async () => {
    const workspace = createWorkspace();
    const sourcePath = join(workspace, 'src', 'A.tsx');
    const sourceBefore = readFileSync(sourcePath, 'utf8');
    const scanArgs = [
      'scan', '--workspace', workspace, '--threads', '1', '--no-telemetry', '--no-color',
    ];

    const firstPretty = await runPackageCli(scanArgs, workspace);
    const firstJsonResult = await runPackageCli([...scanArgs, '--format', 'json'], workspace);
    expect(firstPretty.exitCode).toBe(firstJsonResult.exitCode);
    expect(firstPretty.stdout).toMatch(/^Repository Health\n/);
    expect(firstPretty.stderr).not.toMatch(/saved baseline/i);

    const firstJson = JSON.parse(firstJsonResult.stdout) as {
      gateDecision: { status: string; evaluated: boolean };
      firstScan: {
        findings: Array<{
          evidence: { sourceSpan: string };
          action: { kind: string };
        }>;
        recommendedActions: unknown[];
      };
    };
    expect(firstJson.gateDecision).toMatchObject({ evaluated: true });
    expect(firstPretty.exitCode).toBe(firstJson.gateDecision.status === 'passed' ? 0 : 1);
    expect(firstJson.firstScan.findings.some(({ evidence }) => evidence.sourceSpan === 'exact')).toBe(true);
    expect(firstJson.firstScan.findings.some(({ action }) => action.kind === 'manual-review')).toBe(true);
    expect(firstJson.firstScan.recommendedActions.length).toBeLessThanOrEqual(3);

    const baselineRun = await runPackageCli([...scanArgs, '--baseline'], workspace);
    expect(baselineRun.exitCode).toBe(firstPretty.exitCode);
    const receipt = baselineReceipt(workspace);

    const unchangedPretty = await runPackageCli(scanArgs, workspace);
    expect(unchangedPretty.exitCode).toBe(firstPretty.exitCode);
    expect(unchangedPretty.stdout).toContain('unchanged');
    expect(unchangedPretty.stdout).toContain('0 new');
    expect(unchangedPretty.stdout).toContain('0 resolved');
    expectBaselineUnchanged(workspace, receipt);
    expect(readFileSync(sourcePath, 'utf8')).toBe(sourceBefore);

    const full = await runPackageCli([...scanArgs, '--full'], workspace);
    expect(full.exitCode).toBe(firstPretty.exitCode);
    expect(full.stdout).toContain('Full report');
    for (const label of [
      'Visual Slop',
      'Frontend Implementation',
      'Code and Logic',
      'Repository Coherence',
      'Accessibility and Resilience',
    ]) expect(full.stdout).toContain(label);

    const jsonResult = await runPackageCli([...scanArgs, '--format', 'json'], workspace);
    const json = JSON.parse(jsonResult.stdout) as {
      firstScan: { delta: Record<string, unknown>; findings: Array<{ ruleId: string }> };
    };
    expect(jsonResult.exitCode).toBe(firstPretty.exitCode);
    expect(json.firstScan.delta).toMatchObject({
      status: 'compared', newCount: 0, unchangedCount: json.firstScan.findings.length, resolvedCount: 0,
    });
    for (const { ruleId } of json.firstScan.findings) expect(full.stdout).toContain(ruleId);

    const sarifResult = await runPackageCli([...scanArgs, '--format', 'sarif'], workspace);
    const sarif = JSON.parse(sarifResult.stdout) as {
      runs: Array<{
        tool: { driver: { properties: { firstScan: { delta: Record<string, unknown> } } } };
        results: Array<{ properties: { severity: string; firstScan?: Record<string, unknown> } }>;
      }>;
    };
    expect(sarifResult.exitCode).toBe(firstPretty.exitCode);
    expect(sarif.runs[0]?.tool.driver.properties.firstScan.delta).toMatchObject(json.firstScan.delta);
    const activeResults = sarif.runs[0]?.results.filter(({ properties }) => properties.severity !== 'off') ?? [];
    expect(activeResults).not.toHaveLength(0);
    for (const result of activeResults) {
      expect(result.properties.firstScan).toMatchObject({
        area: expect.any(String),
        evidenceTier: expect.any(String),
        change: 'unchanged',
        actionKind: expect.any(String),
        repairSafety: expect.any(String),
      });
    }

    expectBaselineUnchanged(workspace, receipt);
    expect(readFileSync(sourcePath, 'utf8')).toBe(sourceBefore);
  }, 60_000);

  it('projects complete scans, preserves the reviewed baseline, and suppresses invalid scan deltas', async () => {
    const workspace = createWorkspace();

    const first = await runScan({ workspace, quiet: true, telemetry: false, threadCount: 1 });
    expect(first.report.firstScan).toMatchObject({
      kind: 'slopbrick-first-scan-v1',
      status: 'complete',
      delta: { status: 'unavailable', reason: 'missing-baseline' },
    });
    expect(first.report.firstScan?.areas).toHaveLength(5);

    const firstConfigHash = hashConfig(first.config);
    saveDebtBaseline(
      workspace,
      buildDebtBaseline(first.report, workspace, firstConfigHash, 'unknown'),
    );
    const receipt = baselineReceipt(workspace);

    const identical = await runScan({ workspace, quiet: true, telemetry: false, threadCount: 1 });
    expect(identical.report.firstScan?.delta).toMatchObject({
      status: 'compared',
      newCount: 0,
      unchangedCount: first.report.firstScan?.findings.length,
      resolvedCount: 0,
    });
    expectBaselineUnchanged(workspace, receipt);

    writeFileSync(join(workspace, 'src', 'B.tsx'), fixture.replace('Fixture', 'Replacement'));
    rmSync(join(workspace, 'src', 'A.tsx'));
    const changed = await runScan({ workspace, quiet: true, telemetry: false, threadCount: 1 });
    expect(changed.report.firstScan?.delta).toMatchObject({ status: 'compared' });
    expect(changed.report.firstScan?.delta.newCount).toBeGreaterThan(0);
    expect(changed.report.firstScan?.delta.resolvedCount).toBeGreaterThan(0);
    expectBaselineUnchanged(workspace, receipt);

    const incompatible = await runScan({
      workspace,
      framework: 'react',
      quiet: true,
      telemetry: false,
      threadCount: 1,
    });
    expect(hashConfig(incompatible.config)).not.toBe(firstConfigHash);
    expect(incompatible.report.firstScan?.delta).toMatchObject({
      status: 'incompatible',
      reason: 'config-mismatch',
    });
    expect(incompatible.report.firstScan?.delta).not.toHaveProperty('newCount');
    expect(incompatible.report.firstScan?.delta).not.toHaveProperty('unchangedCount');
    expect(incompatible.report.firstScan?.delta).not.toHaveProperty('resolvedCount');
    expectBaselineUnchanged(workspace, receipt);

    const partialWorkspace = createWorkspace();
    writeFileSync(join(partialWorkspace, 'src', 'A.tsx'), 'export const = ;\n');
    const partial = await runScan({
      workspace: partialWorkspace,
      quiet: true,
      telemetry: false,
      threadCount: 1,
    });
    expect(partial.report.firstScan).toMatchObject({
      status: 'incomplete',
      headline: null,
      recommendedActions: [],
      delta: { status: 'not-evaluated', reason: 'incomplete-scan' },
    });

    const emptyWorkspace = mkdtempSync(join(tmpdir(), 'slopbrick-first-scan-empty-'));
    workspaces.push(emptyWorkspace);
    const empty = await runScan({
      workspace: emptyWorkspace,
      quiet: true,
      telemetry: false,
      threadCount: 1,
    });
    expect(empty.report.firstScan).toMatchObject({
      status: 'not-applicable',
      headline: null,
      recommendedActions: [],
      delta: { status: 'not-evaluated', reason: 'no-files-analyzed' },
    });
  }, 30_000);
});
