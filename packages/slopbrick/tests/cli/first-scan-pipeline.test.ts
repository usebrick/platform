import { afterEach, describe, expect, it } from 'vitest';
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

const workspaces: string[] = [];
const fixture = 'export const Fixture = () => <div className="p-[13px] m-[9px] gap-[7px]" />;\n';

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
