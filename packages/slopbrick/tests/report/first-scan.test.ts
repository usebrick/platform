import { describe, expect, it } from 'vitest';
import {
  FIRST_SCAN_AREAS,
  FIRST_SCAN_AREA_BY_CATEGORY,
  projectFirstScan,
} from '../../src/report/first-scan';
import {
  findingIdentity,
  repositoryRelativeFindingLocation,
} from '../../src/report/finding-identity';
import type { FirstScanExperience } from '../../src/types/first-scan';
import type { Category, Issue, ProjectReport } from '../../src/types';
import { buildDebtBaseline } from '../../src/cli/report/debt-baseline';

const CATEGORIES: Category[] = [
  'visual',
  'typo',
  'layout',
  'component',
  'context',
  'perf',
  'logic',
  'test',
  'db',
  'docs',
  'i18n',
  'arch',
  'ai',
  'product',
  'wcag',
  'security',
];

const CATEGORY_SCORES = Object.fromEntries(
  CATEGORIES.map((category) => [category, 0]),
) as Record<Category, number>;

function issue(
  category: Category,
  overrides: Partial<Issue> = {},
): Issue {
  return {
    ruleId: `${category}/fixture`,
    category,
    severity: 'low',
    aiSpecific: false,
    filePath: `/workspace/src/${category}.ts`,
    message: `Review the ${category} finding.`,
    line: 1,
    column: 1,
    ...overrides,
  };
}

function report(overrides: Partial<ProjectReport> = {}): ProjectReport {
  return {
    version: '0.45.0',
    generatedAt: '2026-07-18T00:00:00.000Z',
    completionStatus: 'complete',
    scoreValidity: 'valid',
    aiSlopScore: 8,
    engineeringHygiene: 94,
    security: 96,
    repositoryHealth: 92.4,
    testQuality: 88,
    assemblyHealth: 92,
    totalScore: 8,
    categoryScores: CATEGORY_SCORES,
    boundaryScore: 0,
    contextScore: 0,
    visualScore: 0,
    p90Score: 0,
    peakScore: 0,
    componentCount: 0,
    fileCount: 16,
    components: [],
    issues: [],
    thresholds: {
      meanSlop: 30,
      p90Slop: 30,
      individualSlopThreshold: 60,
    },
    scoreExplanation: {
      kind: 'deterministic-headline-score-explanation-v1',
      attribution: 'No per-rule or Bayesian attribution is claimed; this explains deterministic aggregate inputs only.',
      directions: {
        aiSlopScore: 'lower-is-better',
        engineeringHygiene: 'higher-is-better',
        security: 'higher-is-better',
        repositoryHealth: 'higher-is-better',
      },
      categoryBurden: {
        direction: 'higher-is-worse',
        note: 'Fixture category burden.',
      },
      aiSlopScore: { value: 8, buckets: [] },
      engineeringHygiene: { value: 94, categories: [] },
      security: { value: 96, findingCount: 0, formula: 'fixture' },
      repositoryHealth: {
        value: 92.4,
        inputs: [
          { axis: 'aiSlopCleanliness', value: 92, weight: 0.4, weightedAmount: 36.8 },
          { axis: 'engineeringHygiene', value: 94, weight: 0.3, weightedAmount: 28.2 },
          { axis: 'security', value: 96, weight: 0.2, weightedAmount: 19.2 },
          { axis: 'testQuality', value: 82, weight: 0.1, weightedAmount: 8.2 },
        ],
      },
    },
    ...overrides,
  };
}

function project(input: ProjectReport): FirstScanExperience {
  return projectFirstScan(input, { cwd: '/workspace', configHash: 'config-a' });
}

describe('first-scan public contract', () => {
  it('maps every category into the locked five-area order', () => {
    expect(FIRST_SCAN_AREA_BY_CATEGORY).toEqual({
      visual: 'visual-slop', typo: 'visual-slop', layout: 'visual-slop',
      component: 'frontend-implementation', context: 'frontend-implementation', perf: 'frontend-implementation',
      logic: 'code-and-logic', test: 'code-and-logic', db: 'code-and-logic', docs: 'code-and-logic', i18n: 'code-and-logic',
      arch: 'repository-coherence', ai: 'repository-coherence', product: 'repository-coherence',
      wcag: 'accessibility-and-resilience', security: 'accessibility-and-resilience',
    });

    const result = project(report({ issues: CATEGORIES.map((category) => issue(category)) }));
    expect(result.areas.map(({ id }) => id)).toEqual(FIRST_SCAN_AREAS.map(({ id }) => id));
    expect(result.areas.reduce((sum, area) => sum + area.findingCount, 0)).toBe(16);
  });

  it('preserves the canonical finding identity bytes after extraction', () => {
    const frozen = issue('visual', {
      ruleId: 'visual/arbitrary-escape',
      severity: 'medium',
      aiSpecific: true,
      filePath: '/workspace/src/A.tsx',
      message: "Layout arbitrary value 'p-[13px]'",
      line: 4,
      column: 1,
    });

    expect(repositoryRelativeFindingLocation(frozen, '/workspace')).toBe('src/A.tsx');
    expect(findingIdentity(frozen, '/workspace')).toBe(
      'd3d60674df286693c4022f5443e67841b487ed8bd3c5ebd857c4373e9ca63f17',
    );
  });

  it('projects evidence and repair boundaries without mutating the report', () => {
    const exact = issue('typo', {
      ruleId: 'typo/placeholder-text',
      severity: 'high',
      filePath: '/workspace/src/Form.tsx',
      message: 'Placeholder text "TODO" is unfinished.',
      advice: 'Replace with specific, user-facing copy.',
      evidence: {
        kind: 'matched-source-span',
        status: 'exact',
        snippet: 'placeholder="TODO"',
        location: { start: { line: 4, column: 8 }, end: { line: 4, column: 25 } },
        matched: { field: 'placeholder', key: 'placeholder', value: 'TODO' },
      },
    });
    const measured = issue('logic', {
      ruleId: 'logic/zipf-slope-anomaly',
      severity: 'medium',
      filePath: '/workspace/src/domain.ts',
      message: 'Identifier frequency differs from the measured baseline.',
      advice: 'Review identifier vocabulary in domain context.',
      signalStrength: {
        recall: 0.0168,
        fpRate: 0.0111,
        ratio: 57.13,
        precision: 0.6369,
        lastCalibratedAt: '2026-07-04T00:00:00Z',
        verdict: 'USEFUL',
      },
      fix: {
        kind: 'replace',
        description: 'Unbound statistical rewrite',
        targetFile: '/workspace/src/domain.ts',
        oldValue: 'before',
        newValue: 'after',
      },
    });
    const advisory = issue('test', {
      ruleId: 'custom/review-only',
      severity: 'low',
      filePath: '/workspace/tests/fixture.test.ts',
      message: 'Review this custom finding.',
    });
    const bound = issue('visual', {
      ruleId: 'visual/arbitrary-escape',
      severity: 'medium',
      aiSpecific: true,
      filePath: '/workspace/src/A.tsx',
      message: "Layout arbitrary value 'p-[13px]'",
      line: 4,
      column: 1,
      fix: {
        kind: 'replace',
        description: "Replace 'p-[13px]' with 'p-3'",
        targetFile: '/workspace/src/A.tsx',
        oldValue: 'p-[13px]',
        newValue: 'p-3',
        binding: {
          kind: 'slopbrick-fix-binding-v1',
          ruleId: 'visual/arbitrary-escape',
          filePath: '/workspace/src/A.tsx',
          line: 4,
          column: 1,
          sourceSha256: 'a'.repeat(64),
        },
      },
    });
    const suppressed = {
      ...issue('security', { ruleId: 'security/suppressed' }),
      severity: 'off',
    } as unknown as Issue;
    const input = report({ issues: [measured, suppressed, exact, advisory, bound] });
    const before = structuredClone(input);

    const result = project(input);
    const byRule = new Map(result.findings.map((finding) => [finding.ruleId, finding]));

    expect(byRule.get('typo/placeholder-text')?.evidence.tier).toBe('deterministic');
    expect(byRule.get('logic/zipf-slope-anomaly')?.evidence).toMatchObject({
      tier: 'calibrated',
      claim: 'Measured rule behavior; not proof of authorship.',
      calibration: {
        verdict: 'USEFUL',
        precision: 0.6369,
        lastCalibratedAt: '2026-07-04T00:00:00Z',
      },
    });
    expect(byRule.get('custom/review-only')?.evidence.tier).toBe('advisory');
    expect(byRule.get('logic/zipf-slope-anomaly')?.action).toMatchObject({
      kind: 'manual-review',
      repairSafety: 'no-safe-repair',
    });
    expect(byRule.get('logic/zipf-slope-anomaly')?.action.label).toMatch(
      /No safe bounded repair is available\.$/,
    );
    expect(byRule.get('visual/arbitrary-escape')?.action).toMatchObject({
      kind: 'apply-finding-bound-fix',
      repairSafety: 'finding-bound',
    });
    expect(result.findings.map(({ ruleId }) => ruleId)).toEqual([
      'logic/zipf-slope-anomaly',
      'typo/placeholder-text',
      'custom/review-only',
      'visual/arbitrary-escape',
    ]);
    expect(result.findings.every(({ ruleId }) => ruleId !== 'security/suppressed')).toBe(true);
    expect(result.recommendedActions).toHaveLength(3);
    expect(result.headline).toEqual({
      label: 'Repository Health',
      value: 92.4,
      direction: 'higher-is-better',
      dimensions: [
        { axis: 'aiSlopCleanliness', label: 'AI Slop cleanliness', value: 92, weight: 0.4, weightedAmount: 36.8 },
        { axis: 'engineeringHygiene', label: 'Engineering hygiene', value: 94, weight: 0.3, weightedAmount: 28.2 },
        { axis: 'security', label: 'Security', value: 96, weight: 0.2, weightedAmount: 19.2 },
        { axis: 'testQuality', label: 'Test quality', value: 82, weight: 0.1, weightedAmount: 8.2 },
      ],
    });
    expect(input).toEqual(before);
  });

  it('uses ruleId ascending as the final recommendation tie-breaker', () => {
    const ties = ['logic/z-last', 'logic/a-first', 'logic/m-middle', 'logic/b-second']
      .map((ruleId) => issue('logic', { ruleId, severity: 'medium' }));

    expect(project(report({ issues: ties })).recommendedActions.map(({ ruleId }) => ruleId)).toEqual([
      'logic/a-first',
      'logic/b-second',
      'logic/m-middle',
    ]);
  });

  it('returns all five zero-count areas and no recommendations for a complete clean scan', () => {
    const result = project(report());

    expect(result.status).toBe('complete');
    expect(result.areas).toEqual(FIRST_SCAN_AREAS.map(({ id, label }) => ({
      id,
      label,
      findingCount: 0,
      severity: { high: 0, medium: 0, low: 0 },
    })));
    expect(result.findings).toEqual([]);
    expect(result.recommendedActions).toEqual([]);
  });

  it.each([
    ['missing', 'missing-baseline'],
    ['invalid', 'invalid-baseline'],
  ] as const)('maps a %s durable baseline to an unavailable delta', (baselineState, reason) => {
    const result = projectFirstScan(report({ issues: [issue('logic')] }), {
      cwd: '/workspace',
      configHash: 'config-a',
      baselineState,
    });

    expect(result.delta).toMatchObject({
      status: 'unavailable',
      reason,
      currentCount: 1,
    });
    expect(result.findings[0]?.change).toBe('current');
  });

  it('projects new, unchanged, and resolved findings from a compatible baseline', () => {
    const unchanged = issue('logic', {
      ruleId: 'logic/unchanged',
      filePath: '/workspace/src/unchanged.ts',
      message: 'Unchanged finding.',
    });
    const resolved = issue('visual', {
      ruleId: 'visual/resolved',
      severity: 'medium',
      aiSpecific: true,
      filePath: '/workspace/src/resolved.tsx',
      message: 'Resolved finding.',
    });
    const introduced = issue('security', {
      ruleId: 'security/new',
      severity: 'high',
      filePath: '/workspace/src/new.ts',
      message: 'New finding.',
    });
    const baseline = buildDebtBaseline(
      report({ issues: [unchanged, resolved] }),
      '/workspace',
      'config-a',
      'commit-a',
    );

    const result = projectFirstScan(report({ issues: [unchanged, introduced] }), {
      cwd: '/workspace',
      configHash: 'config-a',
      baselineState: 'loaded',
      baseline,
    });
    const changes = Object.fromEntries(
      result.findings.map(({ ruleId, change }) => [ruleId, change]),
    );

    expect(changes).toEqual({
      'logic/unchanged': 'unchanged',
      'security/new': 'new',
    });
    expect(result.delta).toMatchObject({
      status: 'compared',
      baselineRevision: 2,
      currentCount: 2,
      baselineCount: 2,
      newCount: 1,
      unchangedCount: 1,
      resolvedCount: 1,
      resolvedDetails: 'available',
      resolved: [{
        identity: findingIdentity(resolved, '/workspace'),
        ruleId: 'visual/resolved',
        area: 'visual-slop',
        severity: 'medium',
        aiSpecific: true,
        filePath: 'src/resolved.tsx',
        line: 1,
        column: 1,
      }],
    });
    expect(result.recommendedActions.map(({ change }) => change)).toContain('new');
  });

  it('leaves findings current when the loaded baseline config is incompatible', () => {
    const current = issue('logic', { ruleId: 'logic/current' });
    const baseline = buildDebtBaseline(
      report({ issues: [current] }),
      '/workspace',
      'config-a',
      'commit-a',
    );
    const result = projectFirstScan(report({ issues: [current] }), {
      cwd: '/workspace',
      configHash: 'config-b',
      baselineState: 'loaded',
      baseline,
    });

    expect(result.delta).toMatchObject({
      status: 'incompatible',
      reason: 'config-mismatch',
      currentCount: 1,
    });
    expect(result.findings[0]?.change).toBe('current');
  });

  it.each([
    ['incomplete', { completionStatus: 'partial', scoreValidity: 'incomplete' }],
    ['not-applicable', { completionStatus: 'empty', scoreValidity: 'not-applicable' }],
  ] as const)('keeps %s scans score-free and action-free', (status, validity) => {
    const result = project(report({ ...validity, issues: [issue('logic')] }));

    expect(result).toMatchObject({
      status,
      headline: null,
      recommendedActions: [],
      delta: { status: 'not-evaluated' },
    });
  });
});
