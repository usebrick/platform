import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/config';
import {
  aggregateReport,
  resolveFrameworkMultiplier,
  scoreFile,
  SEVERITY_WEIGHTS,
} from '../../src/engine/metrics';
import type { BaselineCache, FileScanResult, Issue, ResolvedConfig } from '../../src/types';

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
    expect(report.slopIndex).toBeCloseTo(expectedSlopIndex, 5);
    expect(report.assemblyHealth).toBeCloseTo(Math.max(0, 100 - report.slopIndex), 5);
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
    expect(report.slopIndex).toBeLessThanOrEqual(100);
  });

  it('returns zero subscores on empty input', () => {
    const report = aggregateReport([], [], DEFAULT_CONFIG);
    expect(report.slopIndex).toBe(0);
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
    expect(report.slopIndex).toBe(0);
    expect(report.assemblyHealth).toBe(100);
    expect(report.peakScore).toBe(0);
    expect(report.p90Score).toBe(0);
    expect(report.componentCount).toBe(0);
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
