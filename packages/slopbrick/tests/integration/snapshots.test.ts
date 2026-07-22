import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getCurrentEvidencePolicyAccessors } from '../../src/rules/current-evidence-policy-runtime';

const execFileAsync = promisify(execFile);

const BIN = join(process.cwd(), 'bin', 'slopbrick.js');

const SNAPSHOT_DIR = join(process.cwd(), 'tests', 'snapshots');

const MATH_DEFAULT_FONT_RULE_ID = 'visual/math-default-font';
const INACTIVE_MATH_DEFAULT_FONT_POLICY_BLOCK = [
  'Rule status: configured-severity (configuration and current-policy projection)',
  'Current policy:',
  '  Status: unavailable',
  '  Detail: legacy defaults only',
].join('\n');
const ACTIVE_MATH_DEFAULT_FONT_POLICY_BLOCK = [
  'Rule status: current-default-off (configuration and current-policy projection)',
  'Current policy:',
  '  Status: applied',
  '  Runtime outcome: default-off',
  '  Enabled by default: no',
  '  Runnable by explicit opt-in: yes',
  '  Score eligible: no',
  '  Gate eligible: no',
  '  Quality domain: none',
  '  Claim class: no-valid-quality-claim',
  '  Readiness: research-only',
  '  Repair safety: not-applicable',
  '  Provenance: internal-origin-association',
  '  Admitted: no',
].join('\n');

function createTmp(): string {
  return mkdtempSync(join(tmpdir(), 'slopbrick-snap-'));
}

async function runBin(args: string[], cwd: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync('node', [BIN, ...args], { cwd });
    return { exitCode: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { exitCode: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

function snapshotPath(name: string): string {
  return join(SNAPSHOT_DIR, `${name}.txt`);
}

function assertSnapshot(name: string, actual: string): void {
  const path = snapshotPath(name);
  let existing: string | null = null;
  try {
    existing = readFileSync(path, 'utf-8');
  } catch {
    // first run: write the snapshot
  }
  if (existing === null) {
    writeFileSync(path, actual, 'utf-8');
    return;
  }
  // Allow drift: timestamp lines (e.g. "Generated:") are filtered.
  const norm = (s: string) => s.replace(/^\s*Generated:.*$/gm, '<generated>').trim();
  if (norm(existing) !== norm(actual)) {
    // First-write the diff to help debugging.
    throw new Error(
      `Snapshot mismatch for ${name}.\n` +
      `If this is intentional, delete ${path}.\n` +
      `--- existing (first 200 chars) ---\n${norm(existing).slice(0, 200)}\n` +
      `--- actual (first 200 chars) ---\n${norm(actual).slice(0, 200)}`,
    );
  }
}

function normalizeMathDefaultFontPolicyState(actual: string): string {
  const currentPolicy = getCurrentEvidencePolicyAccessors();
  if (currentPolicy === undefined) {
    expect(actual).toContain(INACTIVE_MATH_DEFAULT_FONT_POLICY_BLOCK);
    return actual;
  }

  expect(currentPolicy.policy).toMatchObject({ applied: true, admitted: false });
  expect(currentPolicy.getCurrentRulePolicy(MATH_DEFAULT_FONT_RULE_ID)).toMatchObject({
    runtimeOutcome: 'default-off',
    enabledByDefault: false,
    runnableByExplicitOptIn: true,
    scoreEligible: false,
    gateEligible: false,
    qualityDomain: 'none',
    claimClass: 'no-valid-quality-claim',
    readiness: 'research-only',
    repairSafety: 'not-applicable',
    provenance: 'internal-origin-association',
  });
  expect(actual.split(ACTIVE_MATH_DEFAULT_FONT_POLICY_BLOCK)).toHaveLength(2);
  return actual.replace(
    ACTIVE_MATH_DEFAULT_FONT_POLICY_BLOCK,
    INACTIVE_MATH_DEFAULT_FONT_POLICY_BLOCK,
  );
}

describe('CLI snapshot tests (round 24)', () => {
  describe('slopbrick explain', () => {
    it('produces stable inactive and active-policy output for a known rule (round 24)', async () => {
      const dir = createTmp();
      try {
        const { stdout, exitCode } = await runBin(['explain', MATH_DEFAULT_FONT_RULE_ID], dir);
        expect(exitCode).toBe(0);
        assertSnapshot('explain-math-default-font', normalizeMathDefaultFontPolicyState(stdout));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('returns a friendly error for an unknown rule (round 24)', async () => {
      const dir = createTmp();
      try {
        const { stdout, exitCode } = await runBin(['explain', 'does/not-exist'], dir);
        expect(exitCode).toBe(2);
        assertSnapshot('explain-unknown-rule', stdout);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('slopbrick tokens', () => {
    it('summarizes a DTCG tokens file (round 24)', async () => {
      const dir = createTmp();
      try {
        const tokensPath = join(dir, 'tokens.json');
        writeFileSync(
          tokensPath,
          JSON.stringify({
            color: { primary: { $value: '#ff0000', $type: 'color' } },
            spacing: { md: { $value: '8px', $type: 'dimension' } },
          }),
        );
        const { stdout, exitCode } = await runBin(['tokens', tokensPath], dir);
        expect(exitCode).toBe(0);
        assertSnapshot('tokens-summary', stdout);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
