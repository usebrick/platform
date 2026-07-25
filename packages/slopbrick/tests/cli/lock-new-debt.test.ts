import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDebtBaseline, saveDebtBaseline } from '../../src/cli/report/debt-baseline';
import { evaluateLockNewDebt } from '../../src/cli/report/lock-new-debt';
import { runScan } from '../../src/cli/scan';
import { hashConfig } from '../../src/engine/cache';
import { findingIdentity } from '../../src/report/finding-identity';
import type { Issue, ProjectReport } from '../../src/types';

const cwd = '/workspace';

function importPolicyIssue(fileName: string, importSource: string, line: number): Issue {
  return {
    ruleId: 'context/import-path-mismatch',
    category: 'arch',
    severity: 'medium',
    aiSpecific: false,
    filePath: join(cwd, fileName),
    message: `Import '${importSource}' violates the repository allowedImports policy.`,
    line,
    column: 1,
    evidence: {
      kind: 'matched-source-span',
      status: 'exact',
      snippet: importSource,
      location: {
        start: { line, column: 20 },
        end: { line, column: 19 + importSource.length },
      },
      matched: {
        field: 'import-source',
        key: 'module-specifier',
        value: importSource,
      },
      details: { policyField: 'allowedImports', allowedPrefixCount: 1 },
    },
  };
}

function report(issues: Issue[]): ProjectReport {
  return {
    issues,
    completionStatus: 'complete',
    scoreValidity: 'valid',
  } as ProjectReport;
}

describe('LOCK-001 new-debt decision', () => {
  it('preserves existing debt and blocks only exact new import-policy findings', () => {
    const existing = importPolicyIssue('src/Existing.tsx', '@/legacy/Existing', 4);
    const introduced = importPolicyIssue('src/New.tsx', '@/legacy/New', 8);
    const unrelated = {
      ...importPolicyIssue('src/Visual.tsx', 'p-[13px]', 12),
      ruleId: 'visual/arbitrary-escape',
      category: 'visual' as const,
    };
    const baseline = buildDebtBaseline(report([existing]), cwd, 'config-a', 'commit-a');
    const input = {
      baseline,
      cwd,
      configHash: 'config-a',
      policySource: 'slopbrick.config.mjs#allowedImports',
    } as const;

    expect(evaluateLockNewDebt({ ...input, report: report([existing]) })).toMatchObject({
      kind: 'slopbrick-lock-decision-v1',
      status: 'passed',
      failed: false,
      policy: {
        ruleId: 'context/import-path-mismatch',
        source: 'slopbrick.config.mjs#allowedImports',
      },
      qualifyingFindingCount: 1,
      newFindingCount: 0,
      blockedFindingCount: 0,
    });

    const decision = evaluateLockNewDebt({
      ...input,
      report: report([existing, introduced, unrelated]),
    });
    expect(decision).toMatchObject({
      kind: 'slopbrick-lock-decision-v1',
      status: 'failed',
      failed: true,
      baselineAvailable: true,
      baselineRevision: 2,
      qualifyingFindingCount: 2,
      newFindingCount: 1,
      blockedFindingCount: 1,
      findings: [{
        ruleId: 'context/import-path-mismatch',
        filePath: 'src/New.tsx',
        line: 8,
        disposition: 'blocked',
        evidence: {
          status: 'exact',
          matched: { value: '@/legacy/New' },
        },
      }],
    });
  });

  it('passes an owned active waiver but visibly blocks the same waiver after expiry', () => {
    const introduced = importPolicyIssue('src/New.tsx', '@/legacy/New', 8);
    const baseline = buildDebtBaseline(report([]), cwd, 'config-a', 'commit-a');
    const waiver = {
      findingIdentity: findingIdentity(introduced, cwd),
      owner: 'architecture-owner',
      reason: 'Migration remains open until the shared component lands.',
      expiresAt: '2026-08-01T00:00:00.000Z',
    };
    const input = {
      report: report([introduced]),
      baseline,
      cwd,
      configHash: 'config-a',
      policySource: 'slopbrick.config.mjs#allowedImports',
      waivers: [waiver],
    } as const;

    expect(evaluateLockNewDebt({
      ...input,
      now: new Date('2026-07-25T00:00:00.000Z'),
    })).toMatchObject({
      status: 'passed',
      failed: false,
      newFindingCount: 1,
      blockedFindingCount: 0,
      waivedFindingCount: 1,
      findings: [{
        disposition: 'waived',
        waiver: { ...waiver, status: 'active' },
      }],
    });

    expect(evaluateLockNewDebt({
      ...input,
      now: new Date('2026-08-02T00:00:00.000Z'),
    })).toMatchObject({
      status: 'failed',
      failed: true,
      newFindingCount: 1,
      blockedFindingCount: 1,
      waivedFindingCount: 0,
      findings: [{
        disposition: 'blocked',
        waiver: { ...waiver, status: 'expired' },
      }],
    });
  });

  it('fails closed without evaluating debt when the scan is incomplete', () => {
    const baseline = buildDebtBaseline(report([]), cwd, 'config-a', 'commit-a');
    const incomplete = {
      ...report([]),
      completionStatus: 'partial' as const,
      scoreValidity: 'incomplete' as const,
      requested: 2,
      analyzed: 1,
      failed: 1,
    };

    expect(evaluateLockNewDebt({
      report: incomplete,
      baseline,
      cwd,
      configHash: 'config-a',
      policySource: 'slopbrick.config.mjs#allowedImports',
    })).toMatchObject({
      status: 'not-evaluated',
      failed: true,
      evaluated: false,
      baselineAvailable: true,
      baselineRevision: 2,
      findings: [],
      summary: expect.stringMatching(/incomplete scan/i),
    });
  });

  it('attaches the failed Lock receipt to a real scan with one introduced violation', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'slopbrick-lock-e2e-'));
    try {
      mkdirSync(join(workspace, 'src'), { recursive: true });
      writeFileSync(
        join(workspace, 'slopbrick.config.mjs'),
        `export default { allowedImports: ['@/approved/'] };\n`,
        'utf8',
      );
      writeFileSync(
        join(workspace, 'src', 'Existing.tsx'),
        `import { Existing } from '@/legacy/Existing';\nexport const value = Existing;\n`,
        'utf8',
      );

      const first = await runScan({
        workspace,
        quiet: true,
        telemetry: false,
        threadCount: 1,
      });
      saveDebtBaseline(
        workspace,
        buildDebtBaseline(first.report, workspace, hashConfig(first.config), 'commit-a'),
      );
      writeFileSync(
        join(workspace, 'src', 'New.tsx'),
        `import { NewValue } from '@/legacy/New';\nexport const value = NewValue;\n`,
        'utf8',
      );

      const current = await runScan({
        workspace,
        quiet: true,
        telemetry: false,
        threadCount: 1,
        ciGate: { lockNewDebt: true },
      });

      expect(current.lockFailure).toBe(true);
      expect(current.report.lockDecision).toMatchObject({
        status: 'failed',
        failed: true,
        policy: {
          ruleId: 'context/import-path-mismatch',
          source: 'slopbrick.config.mjs#allowedImports',
        },
        qualifyingFindingCount: 2,
        newFindingCount: 1,
        blockedFindingCount: 1,
        findings: [{
          filePath: 'src/New.tsx',
          disposition: 'blocked',
          evidence: { matched: { value: '@/legacy/New' } },
        }],
      });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 30_000);
});
