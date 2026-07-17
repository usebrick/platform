import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../../src/config';
import { effectiveIssuesForScore } from '../../src/cli/effective-issues';
import { assembleScanReport } from '../../src/cli/report/assembleScanReport';
import { aggregateReport, scoreFile } from '../../src/engine/metrics';
import { formatHtml } from '../../src/report/html';
import { formatJson } from '../../src/report/json';
import { formatMarkdown } from '../../src/report/markdown';
import { formatPretty } from '../../src/report/pretty';
import { formatSarif } from '../../src/report/sarif';
import type { EnrichmentResult } from '../../src/cli/report/enrichReport';
import type { FileScanResult, Issue, ProjectReport } from '../../src/types';

type MatrixKind = 'ai-only' | 'hygiene-only' | 'backend-only' | 'mixed';

const enrichment = {
  repositoryHealth: undefined,
} as unknown as EnrichmentResult;

function issue(
  ruleId: string,
  category: Issue['category'],
  aiSpecific: boolean,
  severity: 'low' | 'medium' | 'high' = 'high',
  filePath = 'src/example.ts',
): Issue {
  return {
    ruleId,
    category,
    aiSpecific,
    severity,
    filePath,
    message: `${ruleId} fixture`,
    line: 1,
    column: 1,
  };
}

function matrixIssues(kind: MatrixKind, includeAudit = false): Issue[] {
  const issues: Issue[] = [];
  if (kind === 'ai-only' || kind === 'mixed') {
    issues.push(issue('ai/compression-profile', 'ai', true));
  }
  if (kind === 'hygiene-only' || kind === 'mixed') {
    issues.push(issue('logic/long-method', 'logic', false));
  }
  if (kind === 'backend-only' || kind === 'mixed') {
    issues.push(issue('db/sql-concat', 'db', false));
  }
  if (includeAudit) {
    issues.push(issue('dup/identical-block', 'logic', true, 'high'));
    issues.at(-1)!.severity = 'off' as Issue['severity'];
  }
  return issues;
}

function matrixConfig(kind: MatrixKind) {
  if (kind === 'ai-only' || kind === 'mixed') {
    // The compression signal is calibration-only in v0.45 and therefore
    // requires an explicit opt-in in synthetic score fixtures.
    return {
      ...DEFAULT_CONFIG,
      rules: { ...DEFAULT_CONFIG.rules, 'ai/compression-profile': 'high' as const },
    };
  }
  return DEFAULT_CONFIG;
}

function assemble(kind: MatrixKind, includeAudit = false): ProjectReport {
  const allIssues = matrixIssues(kind, includeAudit);
  const config = matrixConfig(kind);
  const result: FileScanResult = {
    filePath: 'src/example.ts',
    componentCount: 0,
    issues: allIssues,
  };
  const effectiveIssues = effectiveIssuesForScore(allIssues, config);
  const scores = [
    scoreFile({ ...result, issues: effectiveIssues }, 1, config),
  ];
  const aggregated = aggregateReport(
    scores,
    [{ filePath: result.filePath, issues: effectiveIssues }],
    config,
    undefined,
    1,
  );
  return assembleScanReport({
    generatedAt: '2026-07-14T00:00:00.000Z',
    configPath: undefined,
    results: [result],
    aggregated,
    allIssues,
    effectiveIssues,
    parseErrors: [],
    topOffenders: [],
    config,
    baselineMeta: undefined,
    defaultOffApplied: includeAudit ? 1 : 0,
    defaultOffRuleCount: includeAudit ? 1 : 0,
    previousRun: undefined,
    enrichment,
  });
}

function headline(report: ProjectReport) {
  return {
    aiSlopScore: report.aiSlopScore,
    engineeringHygiene: report.engineeringHygiene,
    security: report.security,
    repositoryHealth: report.repositoryHealth,
  };
}

describe('Gate 1 canonical score matrix', () => {
  it.each([
    ['ai-only', { ai: true, hygiene: false, backend: false, cleanHealth: false }],
    ['hygiene-only', { ai: false, hygiene: true, backend: false, cleanHealth: false }],
    ['backend-only', { ai: false, hygiene: false, backend: true, cleanHealth: true }],
    ['mixed', { ai: true, hygiene: true, backend: true, cleanHealth: false }],
  ] as const)('assembles the %s score axes from one effective issue set', (kind, expected) => {
    const report = assemble(kind);

    expect(report.scoreBasis).toMatchObject({
      denominator: 1,
      analyzedFiles: 1,
      issueSet: 'effective',
      suppressedIssueCount: 0,
      parseErrorCount: 0,
    });
    expect(report.aiSlopScore > 0).toBe(expected.ai);
    expect(report.engineeringHygiene < 100).toBe(expected.hygiene);
    expect(report.categoryScores.db > 0).toBe(expected.backend);
    expect(report.security).toBe(100);
    expect(report.repositoryHealth === 100).toBe(expected.cleanHealth);
    expect(report.repositoryHealth).toBeLessThanOrEqual(100);

    for (const value of Object.values(headline(report))) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it('keeps audit-only findings out of every score while retaining them in the report envelope', () => {
    const active = assemble('mixed');
    const withAudit = assemble('mixed', true);

    expect(headline(withAudit)).toEqual(headline(active));
    expect(withAudit.scoreBasis).toMatchObject({
      denominator: active.scoreBasis?.denominator,
      analyzedFiles: active.scoreBasis?.analyzedFiles,
      suppressedIssueCount: 1,
    });
    expect(withAudit.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'dup/identical-block', severity: 'off' }),
    ]));

    const json = JSON.parse(formatJson(withAudit)) as Record<string, unknown>;
    expect(json.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'dup/identical-block', severity: 'off' }),
    ]));
    expect(JSON.parse(formatSarif(withAudit)).runs[0].results).toEqual(
      expect.arrayContaining([expect.objectContaining({ ruleId: 'dup/identical-block' })]),
    );
    for (const output of [formatPretty(withAudit), formatMarkdown(withAudit), formatHtml(withAudit)]) {
      expect(output).not.toContain('dup/identical-block fixture');
    }
  });

  it('keeps Repository Health monotone and input-order invariant for equivalent effective evidence', () => {
    const base = assemble('ai-only');
    const mixed = assemble('mixed');
    expect(mixed.repositoryHealth).toBeLessThanOrEqual(base.repositoryHealth);

    const reversed = matrixIssues('mixed').reverse();
    const config = matrixConfig('mixed');
    const effective = effectiveIssuesForScore(reversed, config);
    const score = scoreFile(
      { filePath: 'src/example.ts', componentCount: 0, issues: effective },
      1,
      config,
    );
    const aggregate = aggregateReport(
      [score],
      [{ filePath: 'src/example.ts', issues: effective }],
      config,
      undefined,
      1,
    );
    expect({
      aiSlopScore: aggregate.aiSlopScore,
      engineeringHygiene: aggregate.engineeringHygiene,
      security: aggregate.security,
      repositoryHealth: aggregate.repositoryHealth,
    }).toEqual(headline(mixed));
  });
});
