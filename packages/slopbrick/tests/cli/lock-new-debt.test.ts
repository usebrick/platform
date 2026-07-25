import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { buildDebtBaseline } from '../../src/cli/report/debt-baseline';
import { evaluateLockNewDebt } from '../../src/cli/report/lock-new-debt';
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
});
