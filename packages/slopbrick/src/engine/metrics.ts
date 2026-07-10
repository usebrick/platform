import { isAbsolute, relative } from 'node:path';

import { buildTestQualityScore } from './test-quality';
import type {
  BaselineCache,
  Category,
  ComponentScore,
  FileScanResult,
  Issue,
  ProjectReport,
  ResolvedConfig,
  Severity,
} from '../types';
import type { CompositeScore, ConfidenceTier } from '@usebrick/engine';


// Severity weights aligned with the 3-tier scoring model. Critical tier
// removed for simplicity and to prevent scoring inflation.
export const SEVERITY_WEIGHTS: Record<Severity, number> = {
  low: 1,
  medium: 3,
  high: 5,
};

const CONTEXT_DENSITY_MULTIPLIER = 1.0;

/**
 * Phase 2 §10: composite Slop Index weights. Must sum to 1.0.
 * Boundary = 40%, Context = 35%, Visual = 25%.
 */
export const COMPOSITE_WEIGHTS = {
  boundary: 0.40,
  context: 0.35,
  visual: 0.25,
} as const;

export type SubscoreBucket = keyof typeof COMPOSITE_WEIGHTS;

/**
 * Phase 2 §10: rule → subscore bucket mapping. The composite Slop Index
 * is a weighted average of three subscores; each rule contributes to
 * exactly one bucket.
 */
const RULE_TO_BUCKET: Record<string, SubscoreBucket> = {
  // Boundary (40%): structural integrity
  'logic/boundary-violation': 'boundary',
  'component/giant-component': 'boundary',
  'component/multiple-components-per-file': 'boundary',

  // Context (35%): prop correctness, imports, state mgmt
  'component/shadcn-prop-mismatch': 'context',
  'arch/astro-island-leak': 'context',
  'context/import-path-mismatch': 'context',
  'logic/key-prop-missing': 'context',
  'logic/optimistic-no-rollback': 'context',
  'logic/ghost-defensive': 'context',
  'logic/reactive-hook-soup': 'context',
  'logic/zombie-state': 'context',
  'logic/qwik-hook-leak': 'context',
  'logic/math-any-density': 'context',
  'logic/math-console-log-storm': 'context',
  'logic/math-variable-name-entropy': 'context',
  'logic/math-gini-class-usage': 'context',

  // Visual (25%): CSS, layout, typography, a11y
  'visual/arbitrary-escape': 'visual',
  'visual/inline-style-dominance': 'visual',
  'visual/clamp-soup': 'visual',
  'visual/math-default-font': 'visual',
  'visual/math-gradient-hue-rotation': 'visual',
  'visual/math-rounded-entropy': 'visual',
  'visual/math-spacing-entropy': 'visual',
  'visual/math-font-entropy': 'visual',
  'visual/math-color-cluster': 'visual',
  'visual/generic-centering': 'visual',
  'layout/spacing-grid': 'visual',
  'layout/math-element-uniformity': 'visual',
  'layout/math-grid-uniformity': 'visual',
  'layout/gap-monopoly': 'visual',
  'layout/forced-layout': 'visual',
  'typo/calc-raw-px': 'visual',
  'typo/calc-fontsize': 'visual',
  'typo/clamp-offscale': 'visual',
  'typo/math-cta-vocabulary': 'visual',
  'typo/math-button-label-uniformity': 'visual',
  'wcag/focus-appearance': 'visual',
  'wcag/focus-obscured': 'visual',
  'wcag/target-size': 'visual',
  'wcag/dragging-movements': 'visual',
  'perf/cls-image': 'visual',
  'perf/css-bloat': 'visual',
};

function bucketFor(ruleId: string): SubscoreBucket {
  return RULE_TO_BUCKET[ruleId] ?? 'visual';
}

function p90(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(0.9 * sorted.length) - 1;
  return sorted[Math.max(0, index)]!;
}

export function sizeNormalisation(componentCount: number): number {
  if (componentCount === 0) return 0;
  if (componentCount <= 10) return 1.0;
  return Math.min(1, Math.log10(1 + componentCount) / Math.log10(10001));
}

export function resolveFrameworkMultiplier(config: ResolvedConfig): number {
  const framework = config.framework ?? 'react';
  return config.frameworkMultipliers[framework] ?? 1.0;
}

export function scoreFile(
  result: FileScanResult,
  frameworkMultiplier: number,
  config: ResolvedConfig,
  baseline?: BaselineCache,
  cwd?: string,
): ComponentScore {
  const categoryWeights = config.categoryWeights ?? {} as Record<Category, number>;
  let rawScore = 0;
  for (const issue of result.issues) {
    rawScore += SEVERITY_WEIGHTS[issue.severity] * (categoryWeights[issue.category] ?? 1);
  }

  const componentScore = Math.min(
    100,
    rawScore * frameworkMultiplier * CONTEXT_DENSITY_MULTIPLIER,
  );

  const baselineKey = cwd
    ? isAbsolute(result.filePath)
      ? relative(cwd, result.filePath)
      : result.filePath
    : result.filePath;
  const baselineScore = baseline?.scores[baselineKey]?.baselineScore ?? 0;
  const adjustedScore = baseline ? Math.max(0, componentScore - baselineScore) : componentScore;

  return {
    filePath: result.filePath,
    rawScore,
    componentScore,
    adjustedScore,
    componentCount: result.componentCount,
  };
}

export function aggregateReport(
  scores: ComponentScore[],
  issueGroups: Array<{
    filePath: string;
    issues: Array<{
      category: Category;
      severity: Severity;
      ruleId: string;
      /** Whether this finding is calibrated as AI-specific evidence. */
      aiSpecific?: boolean;
    }>;
  }>,
  config: ResolvedConfig,
  // v0.18.2: per-file Bayesian composite scores from worker.ts:98.
  // Optional for backward compat with existing test fixtures. When
  // provided, emit a project-level aggregate (mean, max, tier,
  // fileCount) into the report. Informational — does not affect the
  // 4 headline scores.
  compositeScores?: ReadonlyArray<CompositeScore | undefined>,
  /**
   * Number of successfully analysed files to use as the exposure
   * denominator.  Callers that add synthetic baseline rows (for example
   * `--since`) must pass the real analysed count so those rows cannot
   * silently dilute the score.
   */
  exposureFiles?: number,
): Pick<
  ProjectReport,
  | 'aiSlopScore'
  | 'engineeringHygiene'
  | 'security'
  | 'repositoryHealth'
  | 'slopIndex'
  | 'assemblyHealth'
  | 'totalScore'
  | 'categoryScores'
  | 'boundaryScore'
  | 'contextScore'
  | 'visualScore'
  | 'subscores'
  | 'p90Score'
  | 'peakScore'
  | 'componentCount'
  | 'components'
  | 'compositeScore'
> {
  const adjustedScores = scores.map((s) => s.adjustedScore);
  const componentCount = scores.reduce((sum, s) => sum + s.componentCount, 0);

  // p90/peak still computed for backward-compat JSON consumers but no
  // longer drive the Slop Index (Phase 2 §10).
  const p90Score = p90(adjustedScores);
  const peakScore = adjustedScores.length === 0 ? 0 : Math.max(...adjustedScores);

  // Phase 2 §10: three subscores per composite formula
  //   S = 0.40 × S_boundary + 0.35 × S_context + 0.25 × S_visual
  // v0.20.0 fix: the original formula `min(100, severityPoints /
  // componentCount * 100)` saturated at 100 the moment severityPoints
  // reached componentCount. The slopbrick self-scan has
  // severityPoints >> componentCount (thousands of severity points
  // across 38 components), so all three sub-scores pinned at 100,
  // slopIndex was always 100, and aiSlopScore was always 0. The
  // sub-score rendering showed 100/100/100 (technically correct)
  // but the cap prevented distinguishing "1 issue/component" from
  // "100 issues/component". Replaced with a log scale that maps
  // severityPoints/componentCount = 1 → ~30, = 10 → 100 (saturates
  // at 10x the per-component threshold). Log base 11: log(1+x) /
  // log(11) maps x=0→0, x=1→0.29, x=10→1.0, x=100→1.83 (capped at 1.0).
  //
  // v0.21.0: the log scale produces the RAW amount of slop (0=clean,
  // 100=saturated). For the headline `aiSlopScore` (now raw amount
  // matching the natural reading of the name) we use these raw
  // values directly. For the sub-score breakdown (which has
  // "cleanliness"-framed labels like "structural integrity"), we
  // invert to cleanliness: 100 - raw. Sub-scores stay "higher = better"
  // consistent with engineeringHygiene, security, repositoryHealth.
  const categoryWeights = config.categoryWeights ?? {} as Record<Category, number>;
  const bucketPoints: Record<SubscoreBucket, number> = { boundary: 0, context: 0, visual: 0 };
  for (const group of issueGroups) {
    for (const issue of group.issues) {
      // The AI Slop Score is an AI-signal score, not a general quality
      // score. Keep non-AI findings out even when their rule happens to be
      // mapped to one of the AI-signal buckets. The optional fallback keeps
      // legacy aggregateReport fixtures compatible with their historical
      // `category: 'ai'` convention while production scan results carry the
      // explicit rule metadata. Legacy callers that omit the field are
      // treated as pre-filtered issue sets and remain included for
      // backwards compatibility; scan/worker callers always provide it.
      const isAiSpecific = issue.aiSpecific ?? true;
      if (!isAiSpecific) continue;
      const bucket = bucketFor(issue.ruleId);
      bucketPoints[bucket] +=
        SEVERITY_WEIGHTS[issue.severity] * (categoryWeights[issue.category] ?? 1);
    }
  }
  // Use analyzed files as the exposure denominator. Component counts are a
  // UI/framework-specific implementation detail and are zero for backend,
  // CLI, and library files; using them here made those scans incomparable
  // (and could amplify a single backend file's score). An empty scan keeps a
  // neutral denominator so all bucket scores remain at their clean baseline.
  const denominator = (exposureFiles ?? scores.length) || 1;
  // Raw slop amount per bucket (0=clean, 100=saturated). Feeds the
  // AI Slop Score headline directly. Higher = more slop detected.
  const slopAmount: Record<SubscoreBucket, number> = {
    boundary: Math.min(100, Math.log10(1 + bucketPoints.boundary / denominator) / Math.log10(11) * 100),
    context:  Math.min(100, Math.log10(1 + bucketPoints.context  / denominator) / Math.log10(11) * 100),
    visual:   Math.min(100, Math.log10(1 + bucketPoints.visual   / denominator) / Math.log10(11) * 100),
  };
  // Sub-score breakdown values (cleanliness, higher = better).
  // Sub-score labels in pretty.ts ("structural integrity",
  // "props / state / imports", "CSS / a11y / layout") are
  // cleanliness-framed; the data must match.
  const subscore: Record<SubscoreBucket, number> = {
    boundary: 100 - slopAmount.boundary,
    context:  100 - slopAmount.context,
    visual:   100 - slopAmount.visual,
  };

  const compositeWeights = config.compositeWeights ?? COMPOSITE_WEIGHTS;
  // v0.21.0: aiSlopScore is the RAW amount of slop (0=clean, 100=saturated).
  // This matches the natural reading of "AI Slop Score: 30/100" =
  // "30% slop detected". The composite (repositoryHealth) inverts at
  // the call site (see below) so it stays "higher = better".
  const aiSlopScoreRaw =
    compositeWeights.boundary * slopAmount.boundary +
    compositeWeights.context * slopAmount.context +
    compositeWeights.visual * slopAmount.visual;
  const aiSlopScore = Math.max(0, Math.min(100, aiSlopScoreRaw));
  // Legacy `slopIndex` field — kept for backward compat with persisted
  // runs and the v0.14 contract. In v0.14 and v0.21+ this was the raw
  // amount (matching aiSlopScore). In v0.15–v0.20.1 it was the
  // INVERTED aiSlopScore (legacy v0.15.0 U.4 bridge). v0.21 reverts
  // to the v0.14 raw semantics.
  const slopIndex = aiSlopScore;
  const assemblyHealth = Math.max(0, 100 - aiSlopScore);

  // Per-category score. v0.14.5h: when the codebase has 0 components
  // (CLI tools, pure backend, no UI), the per-component-average
  // normalization (sum / componentCount) * 100 produces wildly
  // wrong numbers — e.g. 167 severity points × 100 = 16700, which
  // looks like the worst possible score when in reality the
  // headline `slopIndex` is fine. v0.39.0: replaced the linear
  // normalization with log-saturation (same approach as
  // bucketScores at line 224 and aiSlopScore). This works for
  // both UI repos and CLI/library repos — no componentCount
  // dependency, no division-by-zero, scores are comparable across
  // project sizes. The saturation point (500 points = 100%)
  // matches the empirical max we've seen in v0.36+ calibrations.
  const categoryPoints: Record<Category, number> = {
    visual: 0, typo: 0, wcag: 0, layout: 0, component: 0, logic: 0, arch: 0, perf: 0, security: 0, test: 0, docs: 0, db: 0, ai: 0, context: 0, product: 0, i18n: 0,
  };
  for (const group of issueGroups) {
    for (const issue of group.issues) {
      categoryPoints[issue.category] +=
        SEVERITY_WEIGHTS[issue.severity] * (categoryWeights[issue.category] ?? 1);
    }
  }
  const categoryScores: Record<Category, number> = { ...categoryPoints };
  // Log-saturation: score = log10(1 + points/500) / log10(11) * 100,
  // capped at 100. This is the same formula used by aiSlopScore
  // and the boundary/context/visual bucketScores. 500 points = 100%
  // saturation (matches the empirical max from v0.36+ calibrations).
  // No componentCount dependency, no division-by-zero.
  for (const category of Object.keys(categoryScores) as Category[]) {
    categoryScores[category] = Math.min(
      100,
      (Math.log10(1 + categoryScores[category] / 500) / Math.log10(11)) * 100,
    );
  }

  // v0.15.0 U.4+: the 4-score model replaces the single slopIndex.
  // v0.21.0: aiSlopScore is now the RAW amount of AI slop
  // (0 = no AI slop, 100 = max AI slop, higher = worse). This
  // matches the natural reading of the name (users read "AI Slop
  // Score: 100" as "100% slop"). The other 3 scores
  // (engineeringHygiene, security, repositoryHealth) are computed
  // here from the issue stream.
  //
  // v0.20.0: renamed from `aiQuality` to `aiSlopScore` because
  // the old name implied a property of the code ("quality") when
  // it actually measures a property of the tool's detection
  // ("how many rules fire"). The new name matches the existing
  // description ("measures AI-slop signatures") and the slopbrick
  // brand.
  //
  // Note: `aiSlopScore` is declared earlier in this function (see
  // the slopAmount block). The declaration here is removed; the
  // value is computed above to keep the formula self-contained.

  // Flatten issueGroups into a single Issue[] for the score helpers.
  // The Issue type requires message/line/column; aggregateReport
  // receives only ruleId/category/severity from the scan phase, so
  // synthesize placeholders for the fields the helpers don't need.
  const flatIssues: Issue[] = [];
  for (const group of issueGroups) {
    for (const issue of group.issues) {
      flatIssues.push({
        ruleId: issue.ruleId,
        category: issue.category,
        severity: issue.severity,
        aiSpecific: issue.aiSpecific ?? issue.category === 'ai',
        filePath: group.filePath,
        message: '',
        line: 0,
        column: 0,
      });
    }
  }

  // security = graded decay from actual security-issue count.
  // v0.25.0 replaces the v0.24 categorical "critical → 0" cliff with
  // a hyperbolic decay: 100 / (1 + N/5) where N is the count of
  // security-category issues. Same formula as coherence.ts:228.
  // aiSlopScore (the CI gate) is unchanged; security is
  // informational only.
  //
  // Mapping (for reference):
  //   0 issues   → 100
  //   1 issue    →  83
  //   5 issues   →  50
  //   20 issues  →  20
  //   50 issues  →   9
  //   100 issues →   5
  // Floor at 0.
  //
  // computeAiSecurityRisk is still called below for the categorical
  // `aiSecurityRisk` field (low/medium/high/critical) and the
  // `aiSecurityFindings` summary — those stay categorical. Only the
  // numeric `security` field is graded.
  const securityIssueCount = flatIssues.filter(
    (i) => i.category === 'security' || (i.ruleId ?? '').startsWith('security/'),
  ).length;
  const security = Math.max(0, 100 / (1 + securityIssueCount / 5));

  // engineeringHygiene = average of arch + logic + layout + visual
  // category scores (the four "engineering" categories that catch
  // code-quality issues). Each is 0-100. Result is 0-100.
  const engineeringCategoryScores = [
    categoryScores.arch ?? 0,
    categoryScores.logic ?? 0,
    categoryScores.layout ?? 0,
    categoryScores.visual ?? 0,
    categoryScores.component ?? 0,
    categoryScores.test ?? 0,
  ];
  const engineeringRaw =
    engineeringCategoryScores.reduce((sum, s) => sum + s, 0) /
    engineeringCategoryScores.length;
  // Higher categoryScores means more issue points (worse). Invert
  // so engineeringHygiene is "higher is better", matching the
  // other 3 scores.
  const engineeringHygiene = Math.max(0, Math.min(100, 100 - engineeringRaw));

  // testQuality = 100 - (deduction/5 capped at 100). Use the helper.
  // scannedFiles defaults to 0; we pass componentCount to scale.
  const testQualityResult = buildTestQualityScore(flatIssues, componentCount);
  const testQuality = Math.max(0, Math.min(100, testQualityResult.score));

  // repositoryHealth = weighted composite of the 4 scores.
  // 0.40 × (100 - aiSlopScore) + 0.30 × engineeringHygiene
  //   + 0.20 × security + 0.10 × testQuality.
  // v0.21.0: aiSlopScore is now raw amount (higher = more slop).
  // The composite inverts at the call site (`100 - aiSlopScore`)
  // so the composite stays "higher = better" — comparable to
  // engineeringHygiene, security, testQuality. The other 3
  // inputs are already "higher = better".
  const repositoryHealthRaw =
    0.4 * (100 - aiSlopScore) +
    0.3 * engineeringHygiene +
    0.2 * security +
    0.1 * testQuality;
  const repositoryHealth = Math.max(0, Math.min(100, repositoryHealthRaw));

  // v0.18.2: project-level composite aggregate. Per-file composite
  // scores are computed at worker.ts:98 and attached to each
  // FileScanResult. They were previously dropped on the floor here
  // (aggregateReport received only `issueGroups`, not `results`).
  // We now accept them as an optional parameter and emit a single
  // mean + max + tier aggregate. The tier is taken from the
  // mean's confidenceTier (per Jaeschke 1994 JAMA thresholds).
  // Informational: not used to compute the 4 headline scores.
  //
  // PR-3: relationship to repositoryHealth (the deterministic
  // composite). These are TWO different composites serving
  // different questions:
  //
  //   compositeScore (this block)   = "is this codebase AI?"
  //     Bayesian per-file probability averaged with Jaeschke
  //     tiers. Probability in [0, 1], tier in {LIKELY_HUMAN,
  //     INCONCLUSIVE, LIKELY_AI, VERY_LIKELY_AI}. Uses ONLY
  //     AI-specific rules (`aiSpecific: true` in the rule's
  //     meta + matching `aiSpecific: true` in signal-strength.json).
  //
  //   repositoryHealth (v0.15.0)   = "is this codebase healthy?"
  //     Deterministic weighted blend of the 4 headline scores:
  //       0.4 * aiSlopScore
  //     + 0.3 * engineeringHygiene
  //     + 0.2 * security
  //     + 0.1 * testQuality
  //     Integer in [0, 100], higher is better. Uses ALL rules
  //     (ai + cross-cutting), weighted by severity.
  //
  // The two composites are ORTHOGONAL signals, not correlated.
  // A codebase can be:
  //
  //                       | compositeScore   | repositoryHealth
  //   --------------------+------------------+----------------
  //   AI + clean          | HIGH             | HIGH
  //   Human + messy       | LOW              | LOW
  //   AI + messy          | HIGH             | LOW
  //   Human + clean       | LOW              | HIGH
  //
  // Conflating them is a common reader mistake. The 4 headline
  // scores + repositoryHealth are the deterministic, weighted
  // model. compositeScore is the Bayesian "is this AI?" signal.
  // v0.18.2 rev 3 decision: "expose, don't replace" — the
  // compositeScore is informational and does NOT change the
  // 4 headline scores.
  let compositeAggregate: ProjectReport['compositeScore'];
  if (compositeScores && compositeScores.length > 0) {
    const defined = compositeScores.filter(
      (s): s is CompositeScore => s !== undefined,
    );
    if (defined.length > 0) {
      const probs = defined.map((s) => s.probability);
      const mean = probs.reduce((sum, p) => sum + p, 0) / probs.length;
      const max = probs.reduce((m, p) => (p > m ? p : m), 0);
      // Tier from the mean: re-derive rather than averaging tiers.
      // Per the engine's own classification logic (composite-scoring.ts),
      // < 0.10 = LIKELY_HUMAN, 0.10-0.50 = INCONCLUSIVE,
      // 0.50-0.90 = LIKELY_AI, >= 0.90 = VERY_LIKELY_AI.
      const tier: ConfidenceTier =
        mean < 0.10
          ? 'LIKELY_HUMAN'
          : mean < 0.50
            ? 'INCONCLUSIVE'
            : mean < 0.90
              ? 'LIKELY_AI'
              : 'VERY_LIKELY_AI';
      compositeAggregate = {
        mean,
        max,
        tier,
        fileCount: defined.length,
      };
    }
  }

  return {
    aiSlopScore,
    engineeringHygiene,
    security,
    repositoryHealth,
    slopIndex,
    assemblyHealth,
    totalScore: 0, // legacy field, removed in the cleanup
    categoryScores,
    boundaryScore: subscore.boundary,
    contextScore: subscore.context,
    visualScore: subscore.visual,
    subscores: { ...subscore },
    p90Score,
    peakScore,
    componentCount,
    components: [...scores],
    ...(compositeAggregate && { compositeScore: compositeAggregate }),
  };
}
