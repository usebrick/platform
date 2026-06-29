import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/config';
import {
  aggregateReport,
  resolveFrameworkMultiplier,
  scoreFile,
  SEVERITY_WEIGHTS,
} from '../../src/engine/metrics';
import type { BaselineCache, Category, FileScanResult, Issue, ResolvedConfig } from '../../src/types';

const baselineCache = (
  scores: Record<string, { baselineScore: number; componentCount?: number }>,
): BaselineCache => ({
  version: '0.6.0',
  config_hash: 'hash',
  git_head: 'head',
  baseline_created: new Date().toISOString(),
  baseline_revision: 1,
  totalComponentCount: Object.keys(scores).length,
  scores: Object.fromEntries(
    Object.entries(scores).map(([path, entry]) => [
      path,
      { componentCount: 1, ...entry },
    ]),
  ),
});

const issue = (severity: Issue['severity'], category: Issue['category']): Issue => ({
  ruleId: 'test/rule',
  category,
  severity,
  aiSpecific: true,
  message: 'test issue',
  line: 1,
  column: 1,
});

const fileResult = (overrides: Partial<FileScanResult> = {}): FileScanResult => ({
  filePath: 'Button.tsx',
  componentCount: 1,
  issues: [],
  ...overrides,
});

describe('scoreFile', () => {
  it('scores zero for a clean file', () => {
    const result = scoreFile(fileResult(), 1.0, DEFAULT_CONFIG);
    expect(result.rawScore).toBe(0);
    expect(result.componentScore).toBe(0);
    expect(result.adjustedScore).toBe(0);
  });

  it('weights high-severity issues', () => {
    const result = scoreFile(
      fileResult({ issues: [issue('high', 'logic')] }),
      1.0,
      DEFAULT_CONFIG,
    );
    expect(result.rawScore).toBe(SEVERITY_WEIGHTS.high);
    expect(result.componentScore).toBeGreaterThan(0);
  });

  it('applies framework multiplier', () => {
    const base = scoreFile(
      fileResult({ issues: [issue('medium', 'visual')] }),
      1.0,
      DEFAULT_CONFIG,
    );
    const doubled = scoreFile(
      fileResult({ issues: [issue('medium', 'visual')] }),
      2.0,
      DEFAULT_CONFIG,
    );
    expect(doubled.componentScore).toBeCloseTo(base.componentScore * 2, 5);
  });

  it('caps component score at 100', () => {
    const issues: Issue[] = Array.from({ length: 50 }, () => issue('high', 'logic'));
    const result = scoreFile(fileResult({ issues }), 2.0, DEFAULT_CONFIG);
    expect(result.componentScore).toBe(100);
  });

  it('subtracts baseline score when active', () => {
    const result = scoreFile(
      fileResult({ filePath: 'Button.tsx', issues: [issue('medium', 'visual')] }),
      1.0,
      DEFAULT_CONFIG,
      baselineCache({ 'Button.tsx': { baselineScore: 2 } }),
    );
    expect(result.adjustedScore).toBe(Math.max(0, result.componentScore - 2));
  });

  it('floors adjusted score at zero', () => {
    const result = scoreFile(
      fileResult({ filePath: 'Button.tsx', issues: [issue('low', 'logic')] }),
      1.0,
      DEFAULT_CONFIG,
      baselineCache({ 'Button.tsx': { baselineScore: 10 } }),
    );
    expect(result.adjustedScore).toBe(0);
  });

  it('looks up baseline by relative path when given an absolute file path', () => {
    const cwd = process.cwd();
    const result = scoreFile(
      fileResult({ filePath: `${cwd}/Button.tsx`, issues: [issue('medium', 'visual')] }),
      1.0,
      DEFAULT_CONFIG,
      baselineCache({ 'Button.tsx': { baselineScore: 2 } }),
      cwd,
    );
    expect(result.adjustedScore).toBe(Math.max(0, result.componentScore - 2));
  });

  it('applies category weights', () => {
    const config: ResolvedConfig = {
      ...DEFAULT_CONFIG,
      categoryWeights: { ...DEFAULT_CONFIG.categoryWeights!, visual: 3.0, logic: 1.0 },
    };
    const visual = scoreFile(fileResult({ issues: [issue('low', 'visual')] }), 1.0, config);
    const logic = scoreFile(fileResult({ issues: [issue('low', 'logic')] }), 1.0, config);
    expect(visual.rawScore).toBeGreaterThan(logic.rawScore);
  });

  it('sums repeated rule instances without a density multiplier', () => {
    const issues: Issue[] = Array.from({ length: 10 }, () => issue('low', 'logic'));
    const single = scoreFile(fileResult({ issues: [issue('low', 'logic')] }), 1.0, DEFAULT_CONFIG);
    const repeated = scoreFile(fileResult({ issues }), 1.0, DEFAULT_CONFIG);
    expect(repeated.rawScore).toBeCloseTo(single.rawScore * 10, 10);
  });
});

describe('aggregateReport', () => {
  it('aggregates composite slopIndex from boundary/context/visual subscores (Phase 2 §10)', () => {
    const scores = [
      scoreFile(fileResult({ filePath: 'A.tsx', issues: [issue('high', 'logic')] }), 1.0, DEFAULT_CONFIG),
      scoreFile(fileResult({ filePath: 'B.tsx', issues: [issue('low', 'visual')] }), 1.0, DEFAULT_CONFIG),
    ];
    const issueGroups = scores.map((s) => ({
      filePath: s.filePath,
      issues: s.filePath === 'A.tsx' ? [issue('high', 'logic')] : [issue('low', 'visual')],
    }));

    const report = aggregateReport(scores, issueGroups, DEFAULT_CONFIG);

    // Phase 2 §10: S = 0.40 × S_boundary + 0.35 × S_context + 0.25 × S_visual
    // 'logic/boundary-violation' rule mapping would put logic in boundary,
    // but here we use the test/rule ID which falls through to 'visual'
    // (default bucket). So both issues → visual bucket.
    const expectedSlopIndex =
      0.40 * report.boundaryScore +
      0.35 * report.contextScore +
      0.25 * report.visualScore;

    expect(report.componentCount).toBe(2);
    // v0.15.0 U.4+: slopIndex is optional on ProjectReport (kept for
    // backward compat with historical telemetry). aggregateReport
    // always computes it, but the Pick type widens it to optional.
    expect(report.slopIndex ?? 0).toBeCloseTo(expectedSlopIndex, 5);
    expect(report.assemblyHealth).toBeCloseTo(Math.max(0, 100 - (report.slopIndex ?? 0)), 5);
    expect(report.peakScore).toBe(Math.max(scores[0].adjustedScore, scores[1].adjustedScore));
    expect(report.p90Score).toBeGreaterThanOrEqual(
      Math.min(scores[0].adjustedScore, scores[1].adjustedScore),
    );
    expect(report.p90Score).toBeLessThanOrEqual(report.peakScore);
  });

  it('routes logic/boundary-violation issues into the boundary bucket', () => {
    const boundaryIssue: Issue = {
      ruleId: 'logic/boundary-violation',
      category: 'logic',
      severity: 'high',
      aiSpecific: true,
      message: 'x',
      line: 1,
      column: 1,
    };
    const scores = [scoreFile(fileResult({ issues: [boundaryIssue] }), 1.0, DEFAULT_CONFIG)];
    const report = aggregateReport(
      scores,
      [{ filePath: 'Button.tsx', issues: [boundaryIssue] }],
      DEFAULT_CONFIG,
    );
    // boundary issue contributes only to boundary, not context or visual
    expect(report.boundaryScore).toBeGreaterThan(0);
    expect(report.contextScore).toBe(0);
    expect(report.visualScore).toBe(0);
  });

  it('caps subscores at 100', () => {
    const issues: Issue[] = Array.from({ length: 1000 }, () => ({
      ruleId: 'logic/boundary-violation',
      category: 'logic',
      severity: 'high',
      aiSpecific: true,
      message: 'x',
      line: 1,
      column: 1,
    }));
    const scores = [scoreFile(fileResult({ issues }), 1.0, DEFAULT_CONFIG)];
    const report = aggregateReport(
      scores,
      [{ filePath: 'Button.tsx', issues }],
      DEFAULT_CONFIG,
    );
    expect(report.boundaryScore).toBeLessThanOrEqual(100);
    expect(report.slopIndex ?? 0).toBeLessThanOrEqual(100);
  });

  it('returns zero subscores on empty input', () => {
    const report = aggregateReport([], [], DEFAULT_CONFIG);
    expect(report.slopIndex ?? 0).toBe(0);
    expect(report.assemblyHealth).toBe(100);
    expect(report.boundaryScore).toBe(0);
    expect(report.contextScore).toBe(0);
    expect(report.visualScore).toBe(0);
    expect(report.peakScore).toBe(0);
    expect(report.p90Score).toBe(0);
    expect(report.componentCount).toBe(0);
  });

  it('computes category scores from weighted points normalized by component count', () => {
    const aIssues = [issue('high', 'logic'), issue('medium', 'wcag')];
    const scores = [
      scoreFile(
        fileResult({ filePath: 'A.tsx', issues: aIssues }),
        1.0,
        DEFAULT_CONFIG,
      ),
      scoreFile(fileResult({ filePath: 'B.tsx' }), 1.0, DEFAULT_CONFIG),
    ];
    const issueGroups = [
      {
        filePath: 'A.tsx',
        issues: aIssues,
      },
      { filePath: 'B.tsx', issues: [] },
    ];

    const report = aggregateReport(scores, issueGroups, DEFAULT_CONFIG);
    const totalComponents = scores.reduce((sum, s) => sum + s.componentCount, 0);
    const logicPoints = SEVERITY_WEIGHTS.high;
    const wcagPoints = SEVERITY_WEIGHTS.medium;

    expect(report.categoryScores.logic).toBeCloseTo((logicPoints / totalComponents) * 100, 5);
    expect(report.categoryScores.wcag).toBeCloseTo((wcagPoints / totalComponents) * 100, 5);
    expect(report.categoryScores.visual).toBe(0);
  });

  it('weights category scores by categoryWeights', () => {
    const issues: Issue[] = [
      { ruleId: 'visual-rule', category: 'visual', severity: 'low', aiSpecific: true, message: 'v', line: 1, column: 1 },
      { ruleId: 'logic-rule', category: 'logic', severity: 'low', aiSpecific: true, message: 'l', line: 1, column: 1 },
    ];
    const config: ResolvedConfig = {
      ...DEFAULT_CONFIG,
      categoryWeights: { ...DEFAULT_CONFIG.categoryWeights!, visual: 2, logic: 1 },
    };
    const scores = [scoreFile(fileResult({ issues }), 1.0, config)];
    const report = aggregateReport(scores, [{ filePath: 'Button.tsx', issues }], config);
    expect(report.categoryScores.visual).toBeGreaterThan(report.categoryScores.logic);
  });

  it('weights category scores by issue count', () => {
    const repeated: Issue[] = Array.from({ length: 10 }, () => ({
      ruleId: 'dense',
      category: 'visual',
      severity: 'low',
      aiSpecific: true,
      message: 'd',
      line: 1,
      column: 1,
    }));
    const single: Issue[] = [
      { ruleId: 'sparse', category: 'logic', severity: 'low', aiSpecific: true, message: 's', line: 1, column: 1 },
    ];
    const issues = [...repeated, ...single];
    const config: ResolvedConfig = {
      ...DEFAULT_CONFIG,
      categoryWeights: { ...DEFAULT_CONFIG.categoryWeights!, visual: 1, logic: 1 },
    };
    const scores = [scoreFile(fileResult({ issues }), 1.0, config)];
    const report = aggregateReport(scores, [{ filePath: 'Button.tsx', issues }], config);
    expect(report.categoryScores.visual).toBe(report.categoryScores.logic * 10);
  });

  it('handles empty scores gracefully', () => {
    const report = aggregateReport([], [], DEFAULT_CONFIG);
    expect(report.slopIndex ?? 0).toBe(0);
    expect(report.assemblyHealth).toBe(100);
    expect(report.peakScore).toBe(0);
    expect(report.p90Score).toBe(0);
    expect(report.componentCount).toBe(0);
  });

  // v0.14.5h regression: when componentCount=0 (CLI tools, pure backend,
  // libraries with no UI), the per-component-average normalization
  // `sum / 1 * 100` exploded to 16700 / 7000 / 6840 in self-scans.
  // The fix: return raw totals (severity × weight) when there are no
  // components to average over, so the user sees honest numbers like
  // 167 / 70 / 68 instead of meaningless 4-digit figures.
  it('returns raw severity totals for categoryScores when componentCount=0 (v0.14.5h)', () => {
    // Simulate a CLI tool that fires 1 high (5pts) + 1 medium (3pts) +
    // 1 low (1pt) AI issue. rawScore=9 points. With componentCount=0,
    // the old code returned (9/1)*100 = 900 (or 9*100 = 900). The
    // new code returns 9.
    const aiIssues: Issue[] = [
      { ruleId: 'ai/x', category: 'ai', severity: 'high', aiSpecific: true, message: 'a', line: 1, column: 1 },
      { ruleId: 'ai/y', category: 'ai', severity: 'medium', aiSpecific: true, message: 'b', line: 1, column: 1 },
      { ruleId: 'ai/z', category: 'ai', severity: 'low', aiSpecific: true, message: 'c', line: 1, column: 1 },
    ];
    // scoreFile is called with componentCount: 0 (CLI tool — no components)
    const scores = [scoreFile(fileResult({ filePath: 'cli.ts', componentCount: 0, issues: aiIssues }), 1.0, DEFAULT_CONFIG)];
    const issueGroups = [{ filePath: 'cli.ts', issues: aiIssues }];

    const report = aggregateReport(scores, issueGroups, DEFAULT_CONFIG);
    expect(report.componentCount).toBe(0);
    // 5 + 3 + 1 = 9 raw points. NOT 900.
    expect(report.categoryScores.ai).toBe(9);
    expect(report.categoryScores.ai).toBeLessThan(100);
  });

  it('returns raw category totals mirroring real self-scan numbers (v0.14.5h)', () => {
    // Real self-scan numbers (slopbrick's own repo, 0 components):
    //   ai: 167, visual: 70, logic: 68
    // Pre-fix: ai: 16700, visual: 7000, logic: 6840 (looked like total
    // repo failure — caused user pushback).
    // Post-fix: raw severity totals, honest, small, and clearly tied
    // to the headline slopIndex (which IS 25 / 100).
    //
    // The bug guard: the score must equal the raw total (sum of
    // severity × weight), NOT (raw total / 1) * 100 which would
    // produce a 100×-inflated value.
    //
    // We use a uniform-weight config so the test math is clear.
    // DEFAULT_CONFIG has per-category weights (e.g. visual × 1.2)
    // that would otherwise distort the expected values.
    const flatConfig: ResolvedConfig = {
      ...DEFAULT_CONFIG,
      categoryWeights: {
        visual: 1, typo: 1, wcag: 1, layout: 1, component: 1, logic: 1,
        arch: 1, perf: 1, security: 1, test: 1, docs: 1, db: 1,
        ai: 1, context: 1, product: 1, i18n: 1,
      } satisfies Record<Category, number>,
    };
    const aiIssues: Issue[] = Array.from({ length: 35 }, () => ({
      ruleId: 'ai/compression-profile', category: 'ai' as const, severity: 'high' as const, aiSpecific: true, message: 'a', line: 1, column: 1,
    }));
    // 35 high AI = 35 * 5 = 175 raw points
    const visualIssues: Issue[] = Array.from({ length: 23 }, () => ({
      ruleId: 'visual/naturalness-anomaly', category: 'visual' as const, severity: 'medium' as const, aiSpecific: true, message: 'v', line: 1, column: 1,
    }));
    // 23 medium visual = 23 * 3 = 69 raw points
    const logicIssues: Issue[] = Array.from({ length: 68 }, () => ({
      ruleId: 'logic/boundary-violation', category: 'logic' as const, severity: 'low' as const, aiSpecific: true, message: 'l', line: 1, column: 1,
    }));
    // 68 low logic = 68 * 1 = 68 raw points

    const allIssues = [...aiIssues, ...visualIssues, ...logicIssues];
    const scores = [scoreFile(fileResult({ filePath: 'src/cli.ts', componentCount: 0, issues: allIssues }), 1.0, flatConfig)];
    const issueGroups = [{ filePath: 'src/cli.ts', issues: allIssues }];

    const report = aggregateReport(scores, issueGroups, flatConfig);
    expect(report.componentCount).toBe(0);

    // The bug guard: every score is the raw total, NOT 100× the raw
    // total. Pre-fix these were 17500 / 6900 / 6800.
    const expectedAi = 35 * SEVERITY_WEIGHTS.high;        // 175
    const expectedVisual = 23 * SEVERITY_WEIGHTS.medium;  // 69
    const expectedLogic = 68 * SEVERITY_WEIGHTS.low;      // 68

    // Verify the score equals the raw total (not 100×)
    expect(report.categoryScores.ai).toBe(expectedAi);
    expect(report.categoryScores.visual).toBe(expectedVisual);
    expect(report.categoryScores.logic).toBe(expectedLogic);

    // Regression guard: scores must NOT be 100× larger
    expect(report.categoryScores.ai).toBeLessThan(expectedAi * 2);
  });

  it('preserves per-component normalization when componentCount>0 (v0.14.5h)', () => {
    // The fix only changes the 0-component case. When components
    // exist, categoryScores should still be (sum / componentCount) * 100
    // so scores are comparable across project sizes.
    const aIssues: Issue[] = [
      { ruleId: 'test/rule', category: 'ai', severity: 'high', aiSpecific: true, message: 'a', line: 1, column: 1 },
    ];
    const scores = [
      scoreFile(fileResult({ filePath: 'A.tsx', componentCount: 1, issues: aIssues }), 1.0, DEFAULT_CONFIG),
      scoreFile(fileResult({ filePath: 'B.tsx', componentCount: 1 }), 1.0, DEFAULT_CONFIG),
    ];
    const issueGroups = [
      { filePath: 'A.tsx', issues: aIssues },
      { filePath: 'B.tsx', issues: [] },
    ];

    const report = aggregateReport(scores, issueGroups, DEFAULT_CONFIG);
    expect(report.componentCount).toBe(2);
    // 5 raw points / 2 components * 100 = 250, but with
    // categoryWeights default this should land around 250
    // (which is large but not the 16700-style inflation).
    expect(report.categoryScores.ai).toBeGreaterThan(0);
    // Regression guard: with 2 components, scores follow the
    // per-component formula, NOT the 0-component raw-total path.
    expect(report.categoryScores.ai).toBe(
      (SEVERITY_WEIGHTS.high / 2) * 100,
    );
  });
});

describe('aggregateReport — 4-score model (v0.16.0)', () => {
  // Regression test for the bug where engineeringHygiene, security,
  // and repositoryHealth all aliased aiQuality. The 4-score model
  // promised in v0.15.0 (CHANGELOG) was advertised but never
  // actually computed. v0.16.0 fixes this.
  it('returns 4 distinct scores in a mixed-issue scenario', () => {
    // Mixed scenario: lots of low-severity ai/* issues (no security
    // risk) and a few high-severity security/* issues. The 4 scores
    // should land in different ranges:
    //   - aiQuality: high (lots of low issues → low slopIndex → high)
    //   - engineeringHygiene: medium (mixed categories)
    //   - security: low (high-severity security issues → risk)
    //   - repositoryHealth: weighted composite of the 3
    const issues: Issue[] = [
      // 20 low ai/* issues — bumps ai/* category score up, no
      // security risk
      ...Array.from({ length: 20 }, () => ({
        ruleId: 'ai/comment-ratio',
        category: 'ai' as const,
        severity: 'low' as const,
        aiSpecific: true,
        message: 'a',
        line: 1,
        column: 1,
      })),
      // 2 high security issues — produces 'high' AI security risk
      ...Array.from({ length: 2 }, () => ({
        ruleId: 'security/missing-auth-check',
        category: 'security' as const,
        severity: 'high' as const,
        aiSpecific: false,
        message: 's',
        line: 1,
        column: 1,
      })),
    ];
    const scores = [scoreFile(fileResult({ issues }), 1.0, DEFAULT_CONFIG)];
    const issueGroups = [{ filePath: 'Button.tsx', issues }];
    const report = aggregateReport(scores, issueGroups, DEFAULT_CONFIG);

    // All 4 scores must be defined
    expect(report.aiQuality).toBeGreaterThanOrEqual(0);
    expect(report.engineeringHygiene).toBeGreaterThanOrEqual(0);
    expect(report.security).toBeGreaterThanOrEqual(0);
    expect(report.repositoryHealth).toBeGreaterThanOrEqual(0);
    expect(report.aiQuality).toBeLessThanOrEqual(100);
    expect(report.engineeringHygiene).toBeLessThanOrEqual(100);
    expect(report.security).toBeLessThanOrEqual(100);
    expect(report.repositoryHealth).toBeLessThanOrEqual(100);

    // The bug: previously all 4 were identical. With mixed
    // issues, security must differ from aiQuality.
    expect(report.security).not.toBe(report.aiQuality);

    // security is derived from AI security risk. With 2
    // high-severity security issues, the risk is 'high' →
    // security score is 33. aiQuality is unrelated.
    expect(report.security).toBe(33);
  });

  it('returns security=100 for a clean codebase (no security risk)', () => {
    const issues: Issue[] = [
      // Only low-severity ai/* issues — no security risk
      ...Array.from({ length: 5 }, () => ({
        ruleId: 'ai/comment-ratio',
        category: 'ai' as const,
        severity: 'low' as const,
        aiSpecific: true,
        message: 'a',
        line: 1,
        column: 1,
      })),
    ];
    const scores = [scoreFile(fileResult({ issues }), 1.0, DEFAULT_CONFIG)];
    const issueGroups = [{ filePath: 'Button.tsx', issues }];
    const report = aggregateReport(scores, issueGroups, DEFAULT_CONFIG);
    expect(report.security).toBe(100);
  });

  it('returns security=0 for a critical-risk codebase', () => {
    const issues: Issue[] = [
      // 5 high-severity security issues → risk escalates to 'critical'
      // (per computeAiSecurityRisk: 5+ high-severity security issues
      // is treated as critical risk, not high)
      ...Array.from({ length: 5 }, () => ({
        ruleId: 'security/missing-auth-check',
        category: 'security' as const,
        severity: 'high' as const,
        aiSpecific: false,
        message: 's',
        line: 1,
        column: 1,
      })),
    ];
    const scores = [scoreFile(fileResult({ issues }), 1.0, DEFAULT_CONFIG)];
    const issueGroups = [{ filePath: 'Button.tsx', issues }];
    const report = aggregateReport(scores, issueGroups, DEFAULT_CONFIG);
    // Risk is 'critical' (5+ high-severity security issues) →
    // security score is 0
    expect(report.security).toBe(0);
  });

  it('repositoryHealth is the weighted composite of the 3 other scores', () => {
    // No issues → aiQuality=100, security=100, engineeringHygiene=100.
    // repositoryHealth should also be 100. Confirm the formula.
    const scores: ReturnType<typeof scoreFile>[] = [];
    const issueGroups: Array<{ filePath: string; issues: Issue[] }> = [];
    const report = aggregateReport(scores, issueGroups, DEFAULT_CONFIG);
    // Empty input → all 4 scores at the top of the range
    expect(report.aiQuality).toBe(100);
    expect(report.engineeringHygiene).toBe(100);
    expect(report.security).toBe(100);
    // repositoryHealth = 0.4*100 + 0.3*100 + 0.2*100 + 0.1*100 = 100
    expect(report.repositoryHealth).toBe(100);
  });
});

describe('resolveFrameworkMultiplier', () => {
  it('returns the configured multiplier for the active framework', () => {
    const config = { ...DEFAULT_CONFIG, framework: 'vue', frameworkMultipliers: { ...DEFAULT_CONFIG.frameworkMultipliers, vue: 1.5 } };
    expect(resolveFrameworkMultiplier(config)).toBe(1.5);
  });

  it('defaults to react when no framework is configured', () => {
    const config = { ...DEFAULT_CONFIG, framework: undefined };
    expect(resolveFrameworkMultiplier(config)).toBe(DEFAULT_CONFIG.frameworkMultipliers.react);
  });

  it('falls back to 1.0 for unknown frameworks', () => {
    const config = { ...DEFAULT_CONFIG, framework: 'unknown' };
    expect(resolveFrameworkMultiplier(config)).toBe(1.0);
  });
});
