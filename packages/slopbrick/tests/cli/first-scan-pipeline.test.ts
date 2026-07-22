import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runScan } from '../../src/cli/scan';
import {
  buildDebtBaseline,
  debtBaselinePath,
  saveDebtBaseline,
} from '../../src/cli/report/debt-baseline';
import { baselinePath, hashConfig } from '../../src/engine/cache';
import { assertDistBuilt, assertDistSourceFresh, run as runPackageCli } from '../helpers/cli';

const workspaces: string[] = [];
const fixture = [
  'export const Fixture = () => (',
  '  <div className="p-[13px] m-[9px] gap-[7px]">',
  '    <input placeholder="TODO" />',
  '  </div>',
  ');',
  '',
].join('\n');

beforeAll(() => {
  assertDistBuilt();
  assertDistSourceFresh();
});

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

function cliBaselinePaths(workspace: string) {
  return {
    score: baselinePath(workspace),
    debt: debtBaselinePath(workspace),
  };
}

function expectCliBaselinesAbsent(workspace: string): void {
  const paths = cliBaselinePaths(workspace);
  expect(existsSync(paths.score)).toBe(false);
  expect(existsSync(paths.debt)).toBe(false);
}

function cliBaselineReceipt(workspace: string) {
  const paths = cliBaselinePaths(workspace);
  return {
    score: {
      bytes: readFileSync(paths.score),
      mtimeMs: statSync(paths.score).mtimeMs,
    },
    debt: {
      bytes: readFileSync(paths.debt),
      mtimeMs: statSync(paths.debt).mtimeMs,
    },
  };
}

function expectCliBaselinesUnchanged(
  workspace: string,
  receipt: ReturnType<typeof cliBaselineReceipt>,
): void {
  const paths = cliBaselinePaths(workspace);
  expect(readFileSync(paths.score)).toEqual(receipt.score.bytes);
  expect(statSync(paths.score).mtimeMs).toBe(receipt.score.mtimeMs);
  expect(readFileSync(paths.debt)).toEqual(receipt.debt.bytes);
  expect(statSync(paths.debt).mtimeMs).toBe(receipt.debt.mtimeMs);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface JsonFirstScanFinding {
  ruleId: string;
  area: string;
  severity: 'high' | 'medium' | 'low';
  location: {
    filePath?: string;
    line: number;
    column: number;
    contextLabel: string;
  };
  evidence: { tier: string; sourceSpan: string };
  change: string;
  action: { kind: string; repairSafety: string };
}

interface JsonFirstScanReport {
  gateDecision: { status: string; evaluated: boolean };
  firstScan: {
    headline: { value: number };
    delta: {
      status: string;
      newCount: number;
      unchangedCount: number;
      resolvedCount: number;
      [key: string]: unknown;
    };
    findings: JsonFirstScanFinding[];
    recommendedActions: Array<{
      rank: number;
      ruleId: string;
      severity: string;
    }>;
  };
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
    expect(firstPretty.stdout).toMatch(/^Repository Health\n/);
    expectCliBaselinesAbsent(workspace);

    const firstJsonResult = await runPackageCli([...scanArgs, '--format', 'json'], workspace);
    expect(firstPretty.exitCode).toBe(firstJsonResult.exitCode);
    expect(firstJsonResult.stderr).toBe('');
    expectCliBaselinesAbsent(workspace);
    expect(firstPretty.stderr).not.toMatch(/saved baseline/i);

    const quiet = await runPackageCli([...scanArgs, '--quiet'], workspace);
    expect(quiet.exitCode).toBe(firstPretty.exitCode);
    expect(quiet.stdout).toBe('');
    expect(quiet.stderr).toBe('');
    expectCliBaselinesAbsent(workspace);

    const firstJson = JSON.parse(firstJsonResult.stdout) as JsonFirstScanReport;
    expect(firstJson.gateDecision).toMatchObject({ evaluated: true });
    expect(firstPretty.exitCode).toBe(firstJson.gateDecision.status === 'passed' ? 0 : 1);
    expect(firstJson.firstScan.findings.some(({ evidence }) => evidence.sourceSpan === 'exact')).toBe(true);
    expect(firstJson.firstScan.findings.some(({ action }) => action.kind === 'manual-review')).toBe(true);
    expect(firstJson.firstScan.recommendedActions.length).toBeLessThanOrEqual(3);

    const headings = [
      'Repository Health',
      'Scan status',
      'Policy gate',
      'Dimensions',
      'Areas',
      'Recommended actions',
      'Rescan comparison',
    ];
    let previousHeading = -1;
    for (const heading of headings) {
      const headingIndex = firstPretty.stdout.indexOf(`${heading}\n`);
      expect(headingIndex).toBeGreaterThan(previousHeading);
      previousHeading = headingIndex;
    }
    const displayedRepositoryHealth = Number(firstJson.firstScan.headline.value.toFixed(2));
    expect(firstPretty.stdout).toContain(
      `Repository Health\n  ${displayedRepositoryHealth} / 100`,
    );
    expect(firstPretty.stdout).toMatch(
      new RegExp(`Policy gate\\n  ${escapeRegExp(firstJson.gateDecision.status)} —`),
    );
    const recommendationRows = firstPretty.stdout
      .split('\n')
      .filter((line) => /^  \d+\. /.test(line));
    expect(recommendationRows).toHaveLength(firstJson.firstScan.recommendedActions.length);
    expect(recommendationRows.length).toBeLessThanOrEqual(3);
    for (const [index, action] of firstJson.firstScan.recommendedActions.entries()) {
      expect(recommendationRows[index]).toMatch(
        new RegExp(
          `^  ${action.rank}\\. .+ — ${escapeRegExp(action.ruleId)} \\[${escapeRegExp(action.severity)}\\]$`,
        ),
      );
    }
    expect(firstPretty.stdout).toMatch(/No safe bounded repair is\s+available\./u);
    expect(firstPretty.stdout).not.toContain('Full report');

    const baselineRun = await runPackageCli([...scanArgs, '--baseline'], workspace);
    expect(baselineRun.exitCode).toBe(firstPretty.exitCode);
    expect(baselineRun.stdout).toMatch(/^Repository Health\n/);
    expect(`${baselineRun.stdout}\n${baselineRun.stderr}`).not.toMatch(/Memory persisted to \.slopbrick\//);
    const paths = cliBaselinePaths(workspace);
    const reportFooter = 'Run again after a change to compare findings. Use --full for every score and finding.';
    const footerIndex = baselineRun.stdout.indexOf(reportFooter);
    const scoreAcknowledgement = `Saved baseline to ${paths.score}`;
    const debtAcknowledgement = `Saved durable debt baseline to ${paths.debt}`;
    expect(footerIndex).toBeGreaterThanOrEqual(0);
    expect(baselineRun.stdout.indexOf(scoreAcknowledgement)).toBeGreaterThan(footerIndex);
    expect(baselineRun.stdout.indexOf(debtAcknowledgement)).toBeGreaterThan(footerIndex);

    const explicitReceipt = cliBaselineReceipt(workspace);
    const sentinel = new Date('2001-01-01T00:00:00.000Z');
    utimesSync(paths.score, sentinel, sentinel);
    utimesSync(paths.debt, sentinel, sentinel);
    const receipt = cliBaselineReceipt(workspace);
    expect(receipt.score.bytes).toEqual(explicitReceipt.score.bytes);
    expect(receipt.debt.bytes).toEqual(explicitReceipt.debt.bytes);
    expect(receipt.score.mtimeMs).not.toBe(explicitReceipt.score.mtimeMs);
    expect(receipt.debt.mtimeMs).not.toBe(explicitReceipt.debt.mtimeMs);

    const unchangedPretty = await runPackageCli(scanArgs, workspace);
    expect(unchangedPretty.exitCode).toBe(firstPretty.exitCode);
    expect(unchangedPretty.stdout).toMatch(/^Repository Health\n/);
    expect(unchangedPretty.stdout).not.toContain('Baseline active since');
    expect(`${firstPretty.stdout}\n${firstPretty.stderr}`).not.toMatch(/Memory persisted to \.slopbrick\//);
    expect(`${unchangedPretty.stdout}\n${unchangedPretty.stderr}`).not.toMatch(/Memory persisted to \.slopbrick\//);
    expectCliBaselinesUnchanged(workspace, receipt);
    expect(readFileSync(sourcePath, 'utf8')).toBe(sourceBefore);

    const jsonResult = await runPackageCli([...scanArgs, '--format', 'json'], workspace);
    const json = JSON.parse(jsonResult.stdout) as JsonFirstScanReport;
    expect(jsonResult.exitCode).toBe(firstPretty.exitCode);
    expect(jsonResult.stderr).toBe('');
    expect(json.firstScan.delta).toMatchObject({
      status: 'compared',
      newCount: 0,
      unchangedCount: json.firstScan.findings.length,
      resolvedCount: 0,
    });
    expect(unchangedPretty.stdout).toContain(
      `${json.firstScan.delta.newCount} new, ${json.firstScan.delta.unchangedCount} unchanged, ${json.firstScan.delta.resolvedCount} resolved`,
    );
    expectCliBaselinesUnchanged(workspace, receipt);

    const full = await runPackageCli([...scanArgs, '--full'], workspace);
    expect(full.exitCode).toBe(firstPretty.exitCode);
    expect(`${full.stdout}\n${full.stderr}`).not.toMatch(/Memory persisted to \.slopbrick\//);
    const fullParts = full.stdout.split('\n\nFull report\n\n');
    expect(fullParts).toHaveLength(2);
    const fullSuffix = fullParts[1]!;
    for (const label of [
      'Visual Slop',
      'Frontend Implementation',
      'Code and Logic',
      'Repository Coherence',
      'Accessibility and Resilience',
    ]) expect(fullSuffix).toMatch(new RegExp(`^${escapeRegExp(label)} \\(\\d+\\)$`, 'm'));
    const fullLines = fullSuffix.split('\n');
    const expectedFullBlocks = new Map<string, { ruleRow: string; locationRow: string; count: number }>();
    for (const finding of json.firstScan.findings) {
      const ruleRow = `[${finding.severity.toUpperCase().padEnd(8, ' ')}] ${finding.ruleId}`;
      const location = finding.location.filePath
        ? `${finding.location.filePath}:${finding.location.line}:${finding.location.column}`
        : `project-wide:${finding.location.line}:${finding.location.column}`;
      const locationRow = `  Location/context: ${finding.location.contextLabel} — ${location}`;
      const key = `${ruleRow}\u0000${locationRow}`;
      const expected = expectedFullBlocks.get(key);
      if (expected) expected.count += 1;
      else expectedFullBlocks.set(key, { ruleRow, locationRow, count: 1 });
    }
    for (const { ruleRow, locationRow, count } of expectedFullBlocks.values()) {
      const exactBlocks = fullLines
        .map((line, index) => ({ line, index }))
        .filter(({ line, index }) =>
          line === ruleRow && fullLines.slice(index + 1, index + 7).includes(locationRow)
        );
      expect(exactBlocks, `${ruleRow} with ${locationRow}`).toHaveLength(count);
    }
    expectCliBaselinesUnchanged(workspace, receipt);

    const sarifResult = await runPackageCli([...scanArgs, '--format', 'sarif'], workspace);
    const sarif = JSON.parse(sarifResult.stdout) as {
      runs: Array<{
        tool: { driver: { properties: { firstScan: { delta: Record<string, unknown> } } } };
        results: Array<{
          ruleId: string;
          locations: Array<{
            physicalLocation: {
              artifactLocation: { uri: string };
              region: { startLine: number; startColumn: number };
            };
          }>;
          properties: {
            severity: string;
            firstScan?: {
              area: string;
              evidenceTier: string;
              change: string;
              actionKind: string;
              repairSafety: string;
            };
          };
        }>;
      }>;
    };
    expect(sarifResult.exitCode).toBe(firstPretty.exitCode);
    expect(sarifResult.stderr).toBe('');
    expect(sarif.runs[0]?.tool.driver.properties.firstScan.delta).toEqual(json.firstScan.delta);
    const activeResults = sarif.runs[0]?.results.filter(({ properties }) => properties.severity !== 'off') ?? [];
    expect(activeResults).toHaveLength(json.firstScan.findings.length);
    const sarifByFinding = new Map<string, typeof activeResults>();
    for (const result of activeResults) {
      const physical = result.locations[0]!.physicalLocation;
      const key = `${result.ruleId}\u0000${physical.artifactLocation.uri}\u0000${physical.region.startLine}\u0000${physical.region.startColumn}`;
      const group = sarifByFinding.get(key);
      if (group) group.push(result);
      else sarifByFinding.set(key, [result]);
    }
    const jsonByFinding = new Map<string, JsonFirstScanFinding[]>();
    for (const finding of json.firstScan.findings) {
      const key = `${finding.ruleId}\u0000${finding.location.filePath ?? '.'}\u0000${finding.location.line}\u0000${finding.location.column}`;
      const group = jsonByFinding.get(key);
      if (group) group.push(finding);
      else jsonByFinding.set(key, [finding]);
    }
    expect(sarifByFinding.size).toBe(jsonByFinding.size);
    for (const [key, findings] of jsonByFinding) {
      const results = sarifByFinding.get(key);
      expect(results, key).toHaveLength(findings.length);
      expect(results?.map(({ properties }) => properties.firstScan)).toEqual(
        findings.map((finding) => ({
          area: finding.area,
          evidenceTier: finding.evidence.tier,
          change: finding.change,
          actionKind: finding.action.kind,
          repairSafety: finding.action.repairSafety,
        })),
      );
    }

    expectCliBaselinesUnchanged(workspace, receipt);
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
