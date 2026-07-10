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
  it('records exact configured AI-bucket and four-axis headline inputs without per-rule attribution', () => {
    const config: ResolvedConfig = {
      ...DEFAULT_CONFIG,
      compositeWeights: { boundary: 0.5, context: 0.3, visual: 0.2 },
    };
    const issues = [
      { ruleId: 'logic/boundary-violation', category: 'logic' as const, severity: 'high' as const, aiSpecific: true },
      { ruleId: 'logic/key-prop-missing', category: 'logic' as const, severity: 'medium' as const, aiSpecific: true },
      { ruleId: 'visual/inline-style-dominance', category: 'visual' as const, severity: 'low' as const, aiSpecific: true },
    ];
    const result = aggregateReport(
      [{ filePath: 'src/a.ts', rawScore: 9, componentScore: 9, adjustedScore: 9, componentCount: 1 }],
      [{ filePath: 'src/a.ts', issues }],
      config,
      undefined,
      1,
    ) as ReturnType<typeof aggregateReport> & { scoreExplanation?: Record<string, unknown> };

    const explanation = result.scoreExplanation as {
      attribution: string;
      aiSlopScore: { buckets: Array<{ bucket: string; rawSlopAmount: number; weight: number; weightedAmount: number }> };
      repositoryHealth: { inputs: Array<{ axis: string; value: number; weight: number; weightedAmount: number }> };
    };
    const bucket = (points: number) => Math.log10(1 + points) / Math.log10(11) * 100;
    const logicWeight = config.categoryWeights!.logic ?? 1;
    const visualWeight = config.categoryWeights!.visual ?? 1;

    expect(explanation.attribution).toContain('No per-rule or Bayesian attribution');
    expect(explanation.aiSlopScore.buckets).toEqual([
      { bucket: 'boundary', rawSlopAmount: bucket(5 * logicWeight), weight: 0.5, weightedAmount: bucket(5 * logicWeight) * 0.5 },
      { bucket: 'context', rawSlopAmount: bucket(3 * logicWeight), weight: 0.3, weightedAmount: bucket(3 * logicWeight) * 0.3 },
      { bucket: 'visual', rawSlopAmount: bucket(visualWeight), weight: 0.2, weightedAmount: bucket(visualWeight) * 0.2 },
    ]);
    expect(explanation.repositoryHealth.inputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ axis: 'aiSlopCleanliness', value: 100 - result.aiSlopScore, weight: 0.4 }),
      expect.objectContaining({ axis: 'engineeringHygiene', value: result.engineeringHygiene, weight: 0.3 }),
      expect.objectContaining({ axis: 'security', value: result.security, weight: 0.2 }),
      expect.objectContaining({ axis: 'testQuality', value: 100, weight: 0.1 }),
    ]));
  });

  it('is invariant to input order for equivalent scan evidence', () => {
    const scores = [
      { filePath: 'alpha.ts', rawScore: 6, componentScore: 6, adjustedScore: 6, componentCount: 1 },
      { filePath: 'beta.ts', rawScore: 6, componentScore: 6, adjustedScore: 6, componentCount: 2 },
      { filePath: 'gamma.ts', rawScore: 9, componentScore: 9, adjustedScore: 9, componentCount: 0 },
    ];
    // Decimal severity/category products deliberately exercise IEEE-754
    // accumulation order. Each group carries both AI-specific and
    // cross-cutting evidence: only the former belongs in the AI bucket,
    // while both must contribute to the visual category score.
    const issueGroups = [
      {
        filePath: 'alpha.ts',
        issues: [
          { ruleId: 'visual/inline-style-dominance', category: 'visual' as const, severity: 'medium' as const, aiSpecific: true },
          { ruleId: 'visual/non-ai-alpha', category: 'visual' as const, severity: 'medium' as const, aiSpecific: false },
        ],
      },
      {
        filePath: 'beta.ts',
        issues: [
          { ruleId: 'visual/inline-style-dominance', category: 'visual' as const, severity: 'low' as const, aiSpecific: true },
          { ruleId: 'visual/non-ai-beta', category: 'visual' as const, severity: 'low' as const, aiSpecific: false },
        ],
      },
      {
        filePath: 'gamma.ts',
        issues: [
          { ruleId: 'visual/inline-style-dominance', category: 'visual' as const, severity: 'high' as const, aiSpecific: true },
          { ruleId: 'visual/non-ai-gamma', category: 'visual' as const, severity: 'medium' as const, aiSpecific: false },
        ],
      },
    ];
    const config: ResolvedConfig = {
      ...DEFAULT_CONFIG,
      categoryWeights: {
        ...DEFAULT_CONFIG.categoryWeights!,
        visual: 0.17,
        logic: 0.2,
        docs: 0.3,
      },
    };
    const compositeScores = [composite(0.2), composite(0.3), composite(0.1)];
    const report = aggregateReport(scores, issueGroups, config, compositeScores, 3);
    const permuted = aggregateReport(
      [scores[2]!, scores[0]!, scores[1]!],
      [issueGroups[2]!, issueGroups[0]!, issueGroups[1]!],
      config,
      [compositeScores[2]!, compositeScores[0]!, compositeScores[1]!],
      3,
    );

    const aggregateFacts = (value: typeof report) => ({
      aiSlopScore: value.aiSlopScore,
      engineeringHygiene: value.engineeringHygiene,
      security: value.security,
      repositoryHealth: value.repositoryHealth,
      slopIndex: value.slopIndex,
      assemblyHealth: value.assemblyHealth,
      categoryScores: value.categoryScores,
      boundaryScore: value.boundaryScore,
      contextScore: value.contextScore,
      visualScore: value.visualScore,
      subscores: value.subscores,
      p90Score: value.p90Score,
      peakScore: value.peakScore,
      componentCount: value.componentCount,
      compositeScore: value.compositeScore,
    });

    expect(aggregateFacts(permuted)).toEqual(aggregateFacts(report));
  });

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
    // v0.21.0: sub-scores are cleanliness (100 - raw), slopIndex is raw
    // amount. So slopIndex = 100 - subscoreSum.
    const subscoreSum =
      0.40 * report.boundaryScore +
      0.35 * report.contextScore +
      0.25 * report.visualScore;
    const expectedSlopIndex = 100 - subscoreSum;

    expect(report.componentCount).toBe(2);
    // v0.15.0 U.4+: slopIndex is optional on ProjectReport (kept for
    // backward compat with historical telemetry). aggregateReport
    // always computes it, but the Pick type widens it to optional.
    expect(report.slopIndex ?? 0).toBeCloseTo(expectedSlopIndex, 5);
    // v0.21.0: assemblyHealth = 100 - slopIndex (slopIndex is raw).
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
    // v0.21.0: sub-scores are cleanliness (100 - raw). boundary issue
    // contributes to boundary (raw slopAmount > 0), so boundaryScore
    // (cleanliness) < 100; context/visual get 0 slop, so their
    // cleanliness is 100.
    expect(report.boundaryScore).toBeLessThan(100);
    expect(report.contextScore).toBe(100);
    expect(report.visualScore).toBe(100);
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
    // v0.21.0: aiSlopScore is the raw amount of slop (0 = no slop).
    // Sub-scores are cleanliness (100 = no slop). On empty input,
    // no slop detected → aiSlopScore = 0, sub-scores = 100.
    const report = aggregateReport([], [], DEFAULT_CONFIG);
    expect(report.slopIndex ?? 0).toBe(0);
    expect(report.assemblyHealth).toBe(100);
    expect(report.boundaryScore).toBe(100);
    expect(report.contextScore).toBe(100);
    expect(report.visualScore).toBe(100);
    expect(report.peakScore).toBe(0);
    expect(report.p90Score).toBe(0);
    expect(report.componentCount).toBe(0);
  });

  it('computes category scores via log-saturation (no componentCount dependency, v0.39.0)', () => {
    // v0.39.0: replaced linear `(points / componentCount) * 100` with
    // log-saturation `log10(1 + points/500) / log10(11) * 100`, capped
    // at 100. This makes category scores:
    //   - independent of componentCount (no divide-by-zero for CLI repos)
    //   - comparable across project sizes (same scale for any size)
    //   - bounded [0, 100] (no 16700-style inflation)
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

    // Log-saturation formula (replicated for test self-documentation):
    //   score = min(100, log10(1 + points/500) / log10(11) * 100)
    // logic has 1 high = 5 raw points; wcag has 1 medium = 3 raw points
    const expectedLogic =
      (Math.log10(1 + SEVERITY_WEIGHTS.high / 500) / Math.log10(11)) * 100;
    const expectedWcag =
      (Math.log10(1 + SEVERITY_WEIGHTS.medium / 500) / Math.log10(11)) * 100;

    expect(report.categoryScores.logic).toBeCloseTo(expectedLogic, 5);
    expect(report.categoryScores.wcag).toBeCloseTo(expectedWcag, 5);
    expect(report.categoryScores.visual).toBe(0);

    // Invariant: all category scores are bounded [0, 100] regardless of
    // how many components exist — the regression guard against the
    // pre-v0.39.0 16700-style inflation.
    for (const score of Object.values(report.categoryScores)) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
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

  it('weights category scores by issue count (preserves ordering under log-saturation)', () => {
    // 10 low visual vs 1 low logic. Under the pre-v0.39.0 linear formula,
    // visual would be exactly 10x logic. Under log-saturation the
    // relationship is monotonic but compressed: more issues still give a
    // higher score, but the ratio is bounded (saturates toward 1 as the
    // larger count grows). The contract: visual > logic, and the ratio
    // stays close to the linear expectation when raw points are small.
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

    // Ordering invariant: more issues → higher score (regression guard).
    expect(report.categoryScores.visual).toBeGreaterThan(report.categoryScores.logic);

    // Approximate ratio: with 10x the raw points, log-saturation
    // compresses the ratio toward but below 10. At these small totals
    // (10 vs 1), the ratio is ~9.9x (well within tolerance of the
    // pre-v0.39.0 exact-10x contract).
    const ratio = report.categoryScores.visual / report.categoryScores.logic;
    expect(ratio).toBeGreaterThan(9.0);
    expect(ratio).toBeLessThanOrEqual(10.0);
  });

  it('handles empty scores gracefully', () => {
    const report = aggregateReport([], [], DEFAULT_CONFIG);
    expect(report.slopIndex ?? 0).toBe(0);
    expect(report.assemblyHealth).toBe(100);
    expect(report.peakScore).toBe(0);
    expect(report.p90Score).toBe(0);
    expect(report.componentCount).toBe(0);
  });

  // v0.14.5h regression (kept under v0.39.0): when componentCount=0
  // (CLI tools, pure backend, libraries with no UI), the pre-v0.14.5h
  // per-component-average normalization `sum / 1 * 100` exploded to
  // 16700 / 7000 / 6840 in self-scans.
  //
  // v0.14.5h fix: when componentCount=0, return raw severity totals
  // (severity × weight) so the user saw 167 / 70 / 68 instead of
  // meaningless 4-digit figures.
  //
  // v0.39.0 fix: replaced the componentCount branch entirely with
  // log-saturation that works the same for both UI and CLI repos.
  // The regression guard that survives: scores MUST stay bounded in
  // [0, 100] even with zero components — no divide-by-zero, no
  // 16700-style inflation, ever.
  it('categoryScores stay bounded in [0, 100] when componentCount=0 (v0.14.5h → v0.39.0)', () => {
    // Simulate a CLI tool that fires 1 high (5pts) + 1 medium (3pts) +
    // 1 low (1pt) AI issue. rawScore=9 points. The pre-v0.39.0 code
    // would return (9/1)*100 = 900 (or 9*100 = 900). The v0.39.0
    // log-saturation returns a small bounded value.
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

    // v0.39.0 contract: log-saturation of 9 raw points lands at a small
    // value (~0.75) — definitely NOT 900. The pre-v0.39.0 regression was
    // the 100× inflation when componentCount=0; v0.39.0 fixes it for
    // ALL componentCount values, not just zero.
    const expectedAi =
      (Math.log10(1 + 9 / 500) / Math.log10(11)) * 100;
    expect(report.categoryScores.ai).toBeCloseTo(expectedAi, 5);

    // Regression guard: the score MUST stay < 100 (no 16700 inflation).
    // Even if a future change reintroduced the linear formula, this
    // bound catches it immediately.
    expect(report.categoryScores.ai).toBeLessThan(100);
    expect(report.categoryScores.ai).toBeGreaterThan(0);
  });

  it('uses analyzed-file count, not UI component count, as slop exposure denominator', () => {
    const issueGroup = {
      filePath: 'service.py',
      issues: [{
        ruleId: 'logic/boundary-violation',
        category: 'logic' as const,
        severity: 'high' as const,
        aiSpecific: true,
      }],
    };
    const files = [
      scoreFile(fileResult({ filePath: 'service.py', componentCount: 0 }), 1, DEFAULT_CONFIG),
      scoreFile(fileResult({ filePath: 'other.py', componentCount: 0 }), 1, DEFAULT_CONFIG),
    ];
    const report = aggregateReport(files, [issueGroup, { filePath: 'other.py', issues: [] }], DEFAULT_CONFIG);
    const expected = Math.log10(1 + SEVERITY_WEIGHTS.high / files.length) / Math.log10(11) * 100;

    expect(report.boundaryScore).toBeCloseTo(100 - expected, 8);
    expect(report.componentCount).toBe(0);
  });

  it('does not let synthetic baseline rows dilute the exposure denominator', () => {
    const issueGroup = {
      filePath: 'changed.py',
      issues: [{
        ruleId: 'logic/boundary-violation',
        category: 'logic' as const,
        severity: 'high' as const,
        aiSpecific: true,
      }],
    };
    const changed = scoreFile(fileResult({ filePath: 'changed.py' }), 1, DEFAULT_CONFIG);
    const syntheticBaseline = scoreFile(fileResult({ filePath: 'unchanged.py' }), 1, DEFAULT_CONFIG);
    const report = aggregateReport(
      [changed, syntheticBaseline],
      [issueGroup, { filePath: 'unchanged.py', issues: [] }],
      DEFAULT_CONFIG,
      undefined,
      1,
    );
    const expected = Math.log10(1 + SEVERITY_WEIGHTS.high) / Math.log10(11) * 100;
    expect(report.boundaryScore).toBeCloseTo(100 - expected, 8);
  });

  it('categoryScores stay bounded under self-scan-sized totals via log-saturation (v0.14.5h → v0.39.0)', () => {
    // Real self-scan numbers (slopbrick's own repo, 0 components):
    //   ai: 167 raw points, visual: 70, logic: 68
    //
    // Pre-v0.14.5h: ai: 16700, visual: 7000, logic: 6840 — looked like
    // total repo failure, caused user pushback.
    // v0.14.5h fix: returned raw severity totals, honest small numbers.
    // v0.39.0 fix: replaced linear normalization with log-saturation
    // that works for BOTH UI repos and CLI/library repos — no
    // componentCount dependency, no division-by-zero.
    //
    // The surviving regression guard: scores MUST stay bounded in
    // [0, 100] even with self-scan-sized totals. If a future change
    // reintroduced the linear (raw / 1) * 100 path, the guard catches
    // it instantly.
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

    // v0.39.0 log-saturation contract: each score is computed as
    // min(100, log10(1 + rawPoints/500) / log10(11) * 100). With the
    // uniform-weight config, rawPoints = sum of severity * weight.
    const rawAi = 35 * SEVERITY_WEIGHTS.high;        // 175
    const rawVisual = 23 * SEVERITY_WEIGHTS.medium;  // 69
    const rawLogic = 68 * SEVERITY_WEIGHTS.low;      // 68

    const expectedAi =
      (Math.log10(1 + rawAi / 500) / Math.log10(11)) * 100;
    const expectedVisual =
      (Math.log10(1 + rawVisual / 500) / Math.log10(11)) * 100;
    const expectedLogic =
      (Math.log10(1 + rawLogic / 500) / Math.log10(11)) * 100;

    expect(report.categoryScores.ai).toBeCloseTo(expectedAi, 5);
    expect(report.categoryScores.visual).toBeCloseTo(expectedVisual, 5);
    expect(report.categoryScores.logic).toBeCloseTo(expectedLogic, 5);

    // Regression guard: scores must stay bounded in [0, 100]. Pre-v0.14.5h
    // these were 17500 / 6900 / 6800 (way over 100). v0.39.0 keeps the
    // bounded guarantee for ALL componentCount values.
    expect(report.categoryScores.ai).toBeLessThan(100);
    expect(report.categoryScores.visual).toBeLessThan(100);
    expect(report.categoryScores.logic).toBeLessThan(100);

    // Monotonicity invariant: ai has 175 raw points, more than visual's 69
    // and logic's 68. Under log-saturation, more raw points → higher
    // score (regression guard against the old 0-component raw path which
    // was correct but didn't generalize).
    expect(report.categoryScores.ai).toBeGreaterThan(report.categoryScores.visual);
    expect(report.categoryScores.visual).toBeGreaterThan(report.categoryScores.logic);
  });

  it('categoryScores use log-saturation regardless of componentCount (v0.39.0)', () => {
    // v0.39.0 replaces the v0.14.5h componentCount branch with a single
    // log-saturation formula that works for both UI repos and CLI/library
    // repos. The contract: scores are bounded in [0, 100] and computed
    // from raw points via the formula, regardless of how many components
    // exist. componentCount is still tracked for other purposes
    // (boundary / context / visual bucket scores) but no longer
    // branches the categoryScores path.
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

    // v0.39.0 contract: log-saturation of 5 raw points (one high issue).
    // Note: NOT (5/2)*100 = 250 — the per-component division is gone.
    // The score is bounded small (~0.42) regardless of componentCount.
    const expectedAi =
      (Math.log10(1 + SEVERITY_WEIGHTS.high / 500) / Math.log10(11)) * 100;
    expect(report.categoryScores.ai).toBeCloseTo(expectedAi, 5);

    // Invariants: bounded, positive, and independent of componentCount.
    expect(report.categoryScores.ai).toBeGreaterThan(0);
    expect(report.categoryScores.ai).toBeLessThan(100);

    // Equivalence guard: a repo with N components and a CLI repo with
    // 0 components should produce the same categoryScores for the same
    // raw points (no componentCount dependency). This is the
    // v0.14.5h branch's removal rationale.
    const cliScores = [
      scoreFile(
        fileResult({ filePath: 'cli.ts', componentCount: 0, issues: aIssues }),
        1.0,
        DEFAULT_CONFIG,
      ),
    ];
    const cliReport = aggregateReport(
      cliScores,
      [{ filePath: 'cli.ts', issues: aIssues }],
      DEFAULT_CONFIG,
    );
    expect(cliReport.categoryScores.ai).toBeCloseTo(expectedAi, 5);
  });
});

describe('aggregateReport — 4-score model (v0.16.0)', () => {
  it('keeps non-AI findings out of aiSlopScore', () => {
    const clean = aggregateReport(
      [scoreFile(fileResult({ filePath: 'clean.ts' }), 1.0, DEFAULT_CONFIG)],
      [{ filePath: 'clean.ts', issues: [] }],
      DEFAULT_CONFIG,
    );
    const hygieneOnly: Issue[] = [{
      ruleId: 'logic/boundary-violation',
      category: 'logic',
      severity: 'high',
      aiSpecific: false,
      message: 'hygiene',
      line: 1,
      column: 1,
    }];
    const withHygiene = aggregateReport(
      [scoreFile(fileResult({ filePath: 'hygiene.ts', issues: hygieneOnly }), 1.0, DEFAULT_CONFIG)],
      [{ filePath: 'hygiene.ts', issues: hygieneOnly }],
      DEFAULT_CONFIG,
    );
    expect(withHygiene.aiSlopScore).toBe(clean.aiSlopScore);
    expect(withHygiene.engineeringHygiene).toBeLessThan(clean.engineeringHygiene);
  });

  it('uses explicitly AI-specific evidence regardless of its category', () => {
    const issue: Issue = {
      ruleId: 'logic/boundary-violation',
      category: 'logic',
      severity: 'high',
      aiSpecific: true,
      message: 'ai signal',
      line: 1,
      column: 1,
    };
    const report = aggregateReport(
      [scoreFile(fileResult({ filePath: 'ai.ts', issues: [issue] }), 1.0, DEFAULT_CONFIG)],
      [{ filePath: 'ai.ts', issues: [issue] }],
      DEFAULT_CONFIG,
    );
    expect(report.aiSlopScore).toBeGreaterThan(0);
  });

  // Regression test for the bug where engineeringHygiene, security,
  // and repositoryHealth all aliased aiSlopScore. The 4-score model
  // promised in v0.15.0 (CHANGELOG) was advertised but never
  // actually computed. v0.16.0 fixes this.
  it('returns 4 distinct scores in a mixed-issue scenario', () => {
    // Mixed scenario: lots of low-severity ai/* issues (no security
    // risk) and a few high-severity security/* issues. The 4 scores
    // should land in different ranges:
    //   - aiSlopScore: high (lots of low issues → low slopIndex → high)
    //   - engineeringHygiene: medium (mixed categories)
    //   - security: graded decay (v0.25.0, hyperbolic 100/(1+N/5))
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
      // 2 high security issues — graded decay: 100/(1+2/5) = 71.43
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
    expect(report.aiSlopScore).toBeGreaterThanOrEqual(0);
    expect(report.engineeringHygiene).toBeGreaterThanOrEqual(0);
    expect(report.security).toBeGreaterThanOrEqual(0);
    expect(report.repositoryHealth).toBeGreaterThanOrEqual(0);
    expect(report.aiSlopScore).toBeLessThanOrEqual(100);
    expect(report.engineeringHygiene).toBeLessThanOrEqual(100);
    expect(report.security).toBeLessThanOrEqual(100);
    expect(report.repositoryHealth).toBeLessThanOrEqual(100);

    // The bug: previously all 4 were identical. With mixed
    // issues, security must differ from aiSlopScore.
    expect(report.security).not.toBe(report.aiSlopScore);

    // v0.25.0: security is graded decay from issue count, not a
    // categorical inversion. 2 high-severity security issues →
    // 100 / (1 + 2/5) = 71.43. aiSlopScore is unrelated.
    expect(report.security).toBeCloseTo(71.43, 1);
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

  it('returns graded security=50 for a 5-issue critical-risk codebase (was security=0 in v0.24)', () => {
    // v0.25.0: the categorical 'critical → 0' cap was replaced with a
    // hyperbolic decay. 5 high-severity security issues now score
    // 100 / (1 + 5/5) = 50, not 0. aiSecurityRisk (the categorical
    // field) is still 'critical'; the numeric `security` field is
    // graded.
    const issues: Issue[] = [
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
    // Numeric security is graded: 5 issues → 100/(1+5/5) = 50
    expect(report.security).toBeCloseTo(50, 1);
  });

  it('returns security=0 only for a truly catastrophic (100+ issues) codebase', () => {
    // Floor at 0 — a repo with 100+ security issues still gets
    // approximately 0, but the curve is continuous, not a cliff.
    const issues: Issue[] = [
      ...Array.from({ length: 100 }, () => ({
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
    // 100 / (1 + 100/5) = 4.76 — close to 0 but not exactly 0
    expect(report.security).toBeCloseTo(4.76, 1);
    expect(report.security).toBeGreaterThan(0);
  });

  it('repositoryHealth is the weighted composite of the 3 other scores', () => {
    // v0.21.0: aiSlopScore is the raw amount (0 = no slop, 100 = saturated).
    // No issues → aiSlopScore=0, security=100, engineeringHygiene=100.
    // The composite inverts at the call site: 0.4*(100 - aiSlopScore) + ...
    // = 0.4*100 + 0.3*100 + 0.2*100 + 0.1*100 = 100.
    const scores: ReturnType<typeof scoreFile>[] = [];
    const issueGroups: Array<{ filePath: string; issues: Issue[] }> = [];
    const report = aggregateReport(scores, issueGroups, DEFAULT_CONFIG);
    // Empty input → 0 slop, 100 hygiene, 100 security.
    expect(report.aiSlopScore).toBe(0);
    expect(report.engineeringHygiene).toBe(100);
    expect(report.security).toBe(100);
    // repositoryHealth = 0.4*(100-0) + 0.3*100 + 0.2*100 + 0.1*100 = 100
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

// ---------------------------------------------------------------------------
// v0.18.2: project-level compositeScore aggregate (PR-1)
// ---------------------------------------------------------------------------
//
// Per-file composite scores (CompositeScore from
// `@usebrick/engine`) are produced at worker.ts:98 and were
// previously dropped on the floor — aggregateReport received
// `issueGroups` but not `results`, so there was no path to the
// per-file scores at all. v0.18.2 PR-1 threads them through and
// emits a single { mean, max, tier, fileCount } on the
// ProjectReport. The aggregate is informational; the 4 headline
// scores (aiSlopScore, engineeringHygiene, security,
// repositoryHealth) remain deterministic.

import type { CompositeScore } from '@usebrick/engine';

/** Build a minimal CompositeScore fixture for testing. We only
 *  set the fields the aggregate actually reads (probability,
 *  confidenceTier). Other fields are zeroed to satisfy the
 *  interface. */
const composite = (
  probability: number,
  tier: CompositeScore['confidenceTier'] = 'INCONCLUSIVE',
): CompositeScore => ({
  logOddsPrior: 0,
  logOddsPosterior: 0,
  probability,
  triggeredRules: [],
  ruleCount: 0,
  confidenceTier: tier,
  priorPrevalence: 0.5,
});

describe('aggregateReport — compositeScore aggregate (v0.18.2 PR-1)', () => {
  it('omits compositeScore when no per-file scores are provided', () => {
    // Backward compat: callers that don't pass the 4th arg
    // (e.g. the existing test corpus) should see no compositeScore
    // on the report. Mirrors the v0.18.1 shape exactly.
    const scores = [scoreFile(fileResult(), 1.0, DEFAULT_CONFIG)];
    const issueGroups = [{ filePath: 'Button.tsx', issues: [] as Issue[] }];
    const report = aggregateReport(scores, issueGroups, DEFAULT_CONFIG);
    expect(report.compositeScore).toBeUndefined();
  });

  it('omits compositeScore when all per-file scores are undefined', () => {
    // Files that fired zero rules have no CompositeScore (worker.ts
    // sets compositeScore to undefined in that case). Those
    // undefineds must not pollute the aggregate — we filter to
    // defined-only.
    const scores = [scoreFile(fileResult(), 1.0, DEFAULT_CONFIG)];
    const issueGroups = [{ filePath: 'Button.tsx', issues: [] as Issue[] }];
    const report = aggregateReport(scores, issueGroups, DEFAULT_CONFIG, [undefined]);
    expect(report.compositeScore).toBeUndefined();
  });

  it('emits mean+max+tier+fileCount for a known-AI scan (>0.5)', () => {
    // Known-AI fixture: every file has a high probability. The
    // mean should be > 0.5 (LIKELY_AI or VERY_LIKELY_AI tier per
    // Jaeschke 1994 thresholds). 0.85 and 0.92 mean = 0.885,
    // tier = LIKELY_AI.
    const scores = [
      scoreFile(fileResult({ filePath: 'A.tsx' }), 1.0, DEFAULT_CONFIG),
      scoreFile(fileResult({ filePath: 'B.tsx' }), 1.0, DEFAULT_CONFIG),
    ];
    const issueGroups = [
      { filePath: 'A.tsx', issues: [] as Issue[] },
      { filePath: 'B.tsx', issues: [] as Issue[] },
    ];
    const perFile = [composite(0.85, 'LIKELY_AI'), composite(0.92, 'LIKELY_AI')];
    const report = aggregateReport(scores, issueGroups, DEFAULT_CONFIG, perFile);

    expect(report.compositeScore).toBeDefined();
    expect(report.compositeScore!.mean).toBeCloseTo(0.885, 5);
    expect(report.compositeScore!.max).toBe(0.92);
    expect(report.compositeScore!.tier).toBe('LIKELY_AI');
    expect(report.compositeScore!.fileCount).toBe(2);
  });

  it('emits mean+max+tier+fileCount for a clean scan (<0.5)', () => {
    // Clean fixture: low probability across the board. Mean = 0.03,
    // tier = LIKELY_HUMAN (Jaeschke: <0.10 → LIKELY_HUMAN).
    const scores = [
      scoreFile(fileResult({ filePath: 'A.tsx' }), 1.0, DEFAULT_CONFIG),
      scoreFile(fileResult({ filePath: 'B.tsx' }), 1.0, DEFAULT_CONFIG),
    ];
    const issueGroups = [
      { filePath: 'A.tsx', issues: [] as Issue[] },
      { filePath: 'B.tsx', issues: [] as Issue[] },
    ];
    const perFile = [composite(0.02), composite(0.04)];
    const report = aggregateReport(scores, issueGroups, DEFAULT_CONFIG, perFile);

    expect(report.compositeScore).toBeDefined();
    expect(report.compositeScore!.mean).toBeCloseTo(0.03, 5);
    expect(report.compositeScore!.max).toBe(0.04);
    expect(report.compositeScore!.tier).toBe('LIKELY_HUMAN');
    expect(report.compositeScore!.fileCount).toBe(2);
  });

  it('uses Jaeschke 1994 thresholds for tier derivation', () => {
    // Boundary checks for the 4 tier cutoffs:
    //   <0.10           LIKELY_HUMAN
    //   <0.50           INCONCLUSIVE
    //   <0.90           LIKELY_AI
    //   else            VERY_LIKELY_AI
    const scores = [scoreFile(fileResult(), 1.0, DEFAULT_CONFIG)];
    const issueGroups = [{ filePath: 'Button.tsx', issues: [] as Issue[] }];

    // Exactly 0.10 → INCONCLUSIVE (strictly less-than boundary)
    let report = aggregateReport(scores, issueGroups, DEFAULT_CONFIG, [composite(0.10)]);
    expect(report.compositeScore!.tier).toBe('INCONCLUSIVE');

    // Exactly 0.50 → LIKELY_AI
    report = aggregateReport(scores, issueGroups, DEFAULT_CONFIG, [composite(0.50)]);
    expect(report.compositeScore!.tier).toBe('LIKELY_AI');

    // Exactly 0.90 → VERY_LIKELY_AI
    report = aggregateReport(scores, issueGroups, DEFAULT_CONFIG, [composite(0.90)]);
    expect(report.compositeScore!.tier).toBe('VERY_LIKELY_AI');

    // 0.99 → VERY_LIKELY_AI
    report = aggregateReport(scores, issueGroups, DEFAULT_CONFIG, [composite(0.99)]);
    expect(report.compositeScore!.tier).toBe('VERY_LIKELY_AI');
  });

  it('mixes defined and undefined per-file scores (undefineds excluded from mean)', () => {
    // 2 defined + 3 undefined: fileCount should be 2, not 5. The
    // mean is over the 2 defined scores only. This matches the
    // "files that fired at least one rule" definition (worker.ts
    // sets compositeScore to undefined for files with zero
    // triggered rules).
    const scores = [
      scoreFile(fileResult({ filePath: 'A.tsx' }), 1.0, DEFAULT_CONFIG),
      scoreFile(fileResult({ filePath: 'B.tsx' }), 1.0, DEFAULT_CONFIG),
    ];
    const issueGroups = [
      { filePath: 'A.tsx', issues: [] as Issue[] },
      { filePath: 'B.tsx', issues: [] as Issue[] },
    ];
    const perFile: Array<CompositeScore | undefined> = [
      composite(0.6),
      composite(0.8),
      undefined,
      undefined,
      undefined,
    ];
    const report = aggregateReport(scores, issueGroups, DEFAULT_CONFIG, perFile);

    expect(report.compositeScore).toBeDefined();
    expect(report.compositeScore!.fileCount).toBe(2);
    expect(report.compositeScore!.mean).toBeCloseTo((0.6 + 0.8) / 2, 5);
    expect(report.compositeScore!.max).toBe(0.8);
    expect(report.compositeScore!.tier).toBe('LIKELY_AI'); // 0.7 < 0.90
  });

  it('does not affect the 4 headline scores (informational only)', () => {
    // The composite aggregate is informational. Passing
    // perFileCompositeScores must not change aiSlopScore,
    // engineeringHygiene, security, or repositoryHealth relative
    // to the v0.18.1 baseline.
    const issues: Issue[] = [issue('high', 'logic'), issue('low', 'visual')];
    const scores = [scoreFile(fileResult({ issues }), 1.0, DEFAULT_CONFIG)];
    const issueGroups = [{ filePath: 'Button.tsx', issues }];
    const baseline = aggregateReport(scores, issueGroups, DEFAULT_CONFIG);
    const withComposite = aggregateReport(
      scores,
      issueGroups,
      DEFAULT_CONFIG,
      [composite(0.99, 'VERY_LIKELY_AI')],
    );
    expect(withComposite.aiSlopScore).toBe(baseline.aiSlopScore);
    expect(withComposite.engineeringHygiene).toBe(baseline.engineeringHygiene);
    expect(withComposite.security).toBe(baseline.security);
    expect(withComposite.repositoryHealth).toBe(baseline.repositoryHealth);
  });
});
