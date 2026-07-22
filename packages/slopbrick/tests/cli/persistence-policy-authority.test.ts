import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const getCurrentEvidencePolicyAccessorsMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/rules/current-evidence-policy-runtime', () => ({
  getCurrentEvidencePolicyAccessors: getCurrentEvidencePolicyAccessorsMock,
}));

import { runScan } from '../../src/cli/scan';
import { loadFlywheelState } from '../../src/engine/flywheel';
import { approvedCurrentPolicyFixture } from '../helpers/current-evidence-policy-v2';
import { assertDistBuilt, cleanupTempDir, createTmpDir } from '../helpers/cli';

const dirs: string[] = [];

function giantComponentSource(): string {
  return `
export function Dashboard() {
  const a = true;
  const b = true;
  const c = true;
  const d = true;
  const e = true;
  const f = true;
  const g = true;
  const h = true;
  return (
    <>
      {a && <span>A</span>}
      {b && <span>B</span>}
      {c && <span>C</span>}
      {d && <span>D</span>}
      {e && <span>E</span>}
      {f && <span>F</span>}
      {g && <span>G</span>}
      {h && <span>H</span>}
    </>
  );
}
`;
}

function createWorkspace(config: string): string {
  const dir = createTmpDir();
  dirs.push(dir);
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'Dashboard.tsx'), giantComponentSource());
  writeFileSync(join(dir, 'slopbrick.config.mjs'), config);
  return dir;
}

function seedLegacyHistory(dir: string, runCount = 3): void {
  mkdirSync(join(dir, '.slopbrick'), { recursive: true });
  writeFileSync(
    join(dir, '.slopbrick', 'structure.json'),
    JSON.stringify(
      Array.from({ length: runCount }, (_, index) => ({
        timestamp: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
        version: '0.43.0',
        slopIndex: 80,
        categoryScores: { component: 80 },
        topOffenseIds: ['component/giant-component'],
        thresholdExceeded: false,
      })),
      null,
      2,
    ),
  );
}

beforeAll(assertDistBuilt);
beforeEach(() => {
  getCurrentEvidencePolicyAccessorsMock.mockReset();
  getCurrentEvidencePolicyAccessorsMock.mockReturnValue(approvedCurrentPolicyFixture());
});
afterEach(() => {
  while (dirs.length > 0) cleanupTempDir(dirs.pop()!);
});

describe('current evidence policy persistence authority', () => {
  it('keeps score-ineligible diagnostics out of history and flywheel auto-tuning', async () => {
    const dir = createWorkspace(`
export default {
  projectMemory: true,
  telemetry: true,
  rules: { 'component/giant-component': 'high' },
};
`);

    for (let run = 0; run < 3; run += 1) {
      const result = await runScan({
        workspace: dir,
        quiet: true,
        telemetry: true,
        rule: 'component/giant-component',
        threadCount: 1,
      });
      expect(result.report.issues).toContainEqual(expect.objectContaining({
        ruleId: 'component/giant-component',
        severity: 'high',
      }));
      expect(result.report.currentPolicyAuditOnlyCount).toBe(1);
    }

    const history = JSON.parse(
      readFileSync(join(dir, '.slopbrick', 'structure.json'), 'utf8'),
    ) as Array<{ topOffenseIds: string[] }>;
    expect(history).toHaveLength(3);
    expect(history.every((run) => !run.topOffenseIds.includes('component/giant-component'))).toBe(true);
    expect(loadFlywheelState(dir).autoTuned).not.toContainEqual(expect.objectContaining({
      ruleId: 'component/giant-component',
    }));
  });

  it('keeps pre-policy history inert when project memory is read-only', async () => {
    const dir = createWorkspace(`
export default {
  projectMemory: false,
  telemetry: true,
};
`);
    seedLegacyHistory(dir);

    await runScan({
      workspace: dir,
      quiet: true,
      telemetry: true,
      threadCount: 1,
    });

    expect(loadFlywheelState(dir).autoTuned).not.toContainEqual(expect.objectContaining({
      ruleId: 'component/giant-component',
    }));
  });

  it('migrates writable pre-policy history to the current score authority', async () => {
    const dir = createWorkspace(`
export default {
  projectMemory: true,
  telemetry: true,
};
`);
    seedLegacyHistory(dir);

    await runScan({
      workspace: dir,
      quiet: true,
      telemetry: true,
      threadCount: 1,
    });

    const history = JSON.parse(
      readFileSync(join(dir, '.slopbrick', 'structure.json'), 'utf8'),
    ) as Array<{ topOffenseIds: string[] }>;
    expect(history.every((run) => !run.topOffenseIds.includes('component/giant-component'))).toBe(true);
  });

  it('does not reinterpret historical rows before current policy activation', async () => {
    getCurrentEvidencePolicyAccessorsMock.mockReturnValue(undefined);
    const dir = createWorkspace(`
export default {
  projectMemory: false,
  telemetry: true,
};
`);
    seedLegacyHistory(dir);

    await runScan({
      workspace: dir,
      quiet: true,
      telemetry: true,
      threadCount: 1,
    });

    expect(loadFlywheelState(dir).autoTuned).toContainEqual(expect.objectContaining({
      ruleId: 'component/giant-component',
    }));
    const history = JSON.parse(
      readFileSync(join(dir, '.slopbrick', 'structure.json'), 'utf8'),
    ) as Array<{ topOffenseIds: string[] }>;
    expect(history.every((run) => run.topOffenseIds.includes('component/giant-component'))).toBe(true);
  });

  it('reports invocation-only current-policy diagnostics separately from legacy suppression', async () => {
    const dir = createWorkspace(`
export default {
  projectMemory: false,
  telemetry: false,
};
`);

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let result!: Awaited<ReturnType<typeof runScan>>;
    let stderr = '';
    try {
      result = await runScan({
        workspace: dir,
        quiet: false,
        telemetry: false,
        rule: 'component/giant-component',
        threadCount: 1,
      });
      stderr = consoleError.mock.calls.flat().join('\n');
    } finally {
      consoleError.mockRestore();
    }

    expect(result.report.issues).toContainEqual(expect.objectContaining({
      ruleId: 'component/giant-component',
      severity: 'off',
    }));
    expect(result.report.defaultOffSuppressedCount).toBe(0);
    expect(result.report.currentPolicyAuditOnlyCount).toBe(1);
    expect(result.report.currentPolicyDefaultOffRuleCount).toBeGreaterThan(0);
    expect(stderr).toMatch(/current evidence policy kept 1 finding\(s\) audit-only/i);
    expect(stderr).not.toMatch(/INVERTED\/NOISY/i);
  });
});
