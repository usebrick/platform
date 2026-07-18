import { describe, expect, it } from 'vitest';
import {
  FIRST_SCAN_AREAS,
  FIRST_SCAN_AREA_BY_CATEGORY,
  projectFirstScan,
} from '../../src/report/first-scan';
import { formatFirstScanPretty } from '../../src/report/first-scan-pretty';
import {
  findingIdentity,
  repositoryRelativeFindingLocation,
} from '../../src/report/finding-identity';
import type { FirstScanExperience } from '../../src/types/first-scan';
import type { Category, GateDecision, Issue, ProjectReport } from '../../src/types';
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

const PASSED_GATE: GateDecision = {
  kind: 'slopbrick-gate-decision-v1',
  status: 'passed',
  exitCode: 0,
  evaluated: true,
  reasons: [],
  failedThresholds: [],
  summary: 'Policy gate passed.',
};

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-?]*[ -\/]*[@-~]/g, '');
}

function renderedSection(output: string, heading: string): string {
  const plain = stripAnsi(output);
  const start = plain.indexOf(heading);
  expect(start).toBeGreaterThanOrEqual(0);
  const remainder = plain.slice(start);
  const end = remainder.indexOf('\n\n');
  return end < 0 ? remainder : remainder.slice(0, end);
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

describe('first-scan pretty renderer contract', () => {
  it('renders the complete owner state in semantic order and caps four candidate groups at three actions', () => {
    const unsafe = issue('security', {
      ruleId: 'security/unsafe-input',
      severity: 'high',
      filePath: '/workspace/src/input.ts',
      message: 'Untrusted input reaches a sensitive operation.',
      advice: 'Review input handling before release.',
      evidence: {
        kind: 'matched-source-span',
        status: 'exact',
        snippet: 'execute(userInput)',
        location: { start: { line: 8, column: 3 }, end: { line: 8, column: 21 } },
        matched: { field: 'call', key: 'callee', value: 'execute' },
      },
    });
    const unchanged = issue('logic', {
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
    });
    const heaps = issue('logic', {
      ruleId: 'logic/heaps-deviation',
      severity: 'medium',
      filePath: '/workspace/src/vocabulary.ts',
      message: 'Vocabulary growth differs from the measured baseline.',
      advice: 'Review vocabulary growth in domain context.',
      signalStrength: {
        recall: 0.02,
        fpRate: 0.013,
        ratio: 40,
        precision: 0.58,
        lastCalibratedAt: '2026-07-05T00:00:00Z',
        verdict: 'USEFUL',
      },
    });
    const fourth = issue('docs', {
      ruleId: 'docs/fourth-candidate',
      severity: 'low',
      filePath: '/workspace/docs/guide.md',
      message: 'FOURTH ACTION MUST NOT RENDER.',
    });
    const resolved = issue('visual', {
      ruleId: 'visual/resolved',
      severity: 'medium',
      filePath: '/workspace/src/resolved.tsx',
      message: 'Resolved finding.',
    });
    const baseline = buildDebtBaseline(
      report({ issues: [unchanged, resolved] }),
      '/workspace',
      'config-a',
      'commit-a',
    );
    const firstScan = projectFirstScan(report({ issues: [unsafe, unchanged, heaps, fourth] }), {
      cwd: '/workspace',
      configHash: 'config-a',
      baselineState: 'loaded',
      baseline,
    });
    const fourthAction = project(report({ issues: [fourth] })).recommendedActions[0]!;
    const output = formatFirstScanPretty({
      ...firstScan,
      recommendedActions: [
        ...firstScan.recommendedActions,
        { ...fourthAction, rank: 3 },
      ],
    }, {
      columns: 120,
      gateDecision: PASSED_GATE,
      meanSlop: 30,
      aiSlopScore: 8,
    });
    const plain = stripAnsi(output);

    expect(plain).toMatchInlineSnapshot(`
      "Repository Health
        92.4 / 100 — higher is better

      Scan status
        complete

      Policy gate
        passed — Policy gate passed.

      Dimensions
        AI Slop cleanliness: 92 / 100; 40% weight
        Engineering hygiene: 94 / 100; 30% weight
        Security: 96 / 100; 20% weight
        Test quality: 82 / 100; 10% weight

      Areas
        Visual Slop: 0 findings (high 0, medium 0, low 0)
        Frontend Implementation: 0 findings (high 0, medium 0, low 0)
        Code and Logic: 3 findings (high 0, medium 2, low 1)
        Repository Coherence: 0 findings (high 0, medium 0, low 0)
        Accessibility and Resilience: 1 finding (high 1, medium 0, low 0)

      Recommended actions
        1. Accessibility and Resilience — security/unsafe-input [high]
          Evidence tier: deterministic; exact source span.
          Reach: single-file; 1 finding across 1 file.
          Change: new.
          Why: Untrusted input reaches a sensitive operation.
          Action: manual review — Review input handling before release. No safe bounded repair is available.
        2. Code and Logic — logic/zipf-slope-anomaly [medium]
          Evidence tier: calibrated; precision 63.69%; last calibrated 2026-07-04.
          Reach: single-file; 1 finding across 1 file.
          Change: unchanged.
          Why: Identifier frequency differs from the measured baseline.
          Action: manual review — Review identifier vocabulary in domain context. No safe bounded repair is available.
        3. Code and Logic — logic/heaps-deviation [medium]
          Evidence tier: calibrated; precision 58%; last calibrated 2026-07-05.
          Reach: single-file; 1 finding across 1 file.
          Change: new.
          Why: Vocabulary growth differs from the measured baseline.
          Action: manual review — Review vocabulary growth in domain context. No safe bounded repair is available.

      Rescan comparison
        Finding delta compared: 3 new, 1 unchanged, 1 resolved. Baseline revision 2.
        Resolved: visual/resolved at src/resolved.tsx:1:1.

      Run again after a change to compare findings. Use --full for every score and finding."
    `);
    const headings = [
      'Repository Health',
      'Scan status',
      'Policy gate',
      'Dimensions',
      'Areas',
      'Recommended actions',
      'Rescan comparison',
    ];
    expect(headings.map((heading) => plain.indexOf(heading))).toEqual(
      [...headings.map((heading) => plain.indexOf(heading))].sort((left, right) => left - right),
    );
    expect(plain).toContain('high');
    expect(plain).toContain('calibrated');
    expect(plain).toContain('manual review');
    expect(plain).toContain('unchanged');
    expect(plain.toLowerCase()).toContain('no safe bounded repair');
    expect(plain).not.toContain('FOURTH ACTION MUST NOT RENDER');
  });

  it('renders missing and config-mismatched baselines without invented deltas', () => {
    const current = issue('logic', { ruleId: 'logic/current' });
    const missing = projectFirstScan(report({ issues: [current] }), {
      cwd: '/workspace',
      configHash: 'config-a',
      baselineState: 'missing',
    });
    const baseline = buildDebtBaseline(
      report({ issues: [current] }),
      '/workspace',
      'config-a',
      'commit-a',
    );
    const mismatched = projectFirstScan(report({ issues: [current] }), {
      cwd: '/workspace',
      configHash: 'config-b',
      baselineState: 'loaded',
      baseline,
    });

    expect(renderedSection(formatFirstScanPretty(missing, { columns: 120 }), 'Rescan comparison'))
      .toMatchInlineSnapshot(`
        "Rescan comparison
          Finding delta unavailable: durable debt baseline is missing."
      `);
    expect(renderedSection(formatFirstScanPretty(mismatched, { columns: 120 }), 'Rescan comparison'))
      .toMatchInlineSnapshot(`
        "Rescan comparison
          Finding delta incompatible: durable debt baseline config identity does not match the current scan."
      `);
    for (const output of [formatFirstScanPretty(missing), formatFirstScanPretty(mismatched)]) {
      expect(output).not.toMatch(/\b\d+ new, \d+ unchanged, \d+ resolved\b/);
    }
  });

  it('renders an unchanged rescan without implying new or resolved work', () => {
    const current = issue('logic', { ruleId: 'logic/unchanged' });
    const baseline = buildDebtBaseline(
      report({ issues: [current] }),
      '/workspace',
      'config-a',
      'commit-a',
    );
    const unchanged = projectFirstScan(report({ issues: [current] }), {
      cwd: '/workspace',
      configHash: 'config-a',
      baselineState: 'loaded',
      baseline,
    });

    expect(renderedSection(formatFirstScanPretty(unchanged, { columns: 120 }), 'Rescan comparison'))
      .toMatchInlineSnapshot(`
        "Rescan comparison
          Finding delta compared: 0 new, 1 unchanged, 0 resolved. Baseline revision 2."
      `);
  });

  it('renders every area for a complete zero-finding scan', () => {
    const clean = project(report());

    expect(stripAnsi(formatFirstScanPretty(clean, {
      columns: 120,
      meanSlop: 30,
      aiSlopScore: 8,
    }))).toMatchInlineSnapshot(`
      "Repository Health
        92.4 / 100 — higher is better

      Scan status
        complete

      Policy gate
        passed — AI Slop Score 8 <= 30.

      Dimensions
        AI Slop cleanliness: 92 / 100; 40% weight
        Engineering hygiene: 94 / 100; 30% weight
        Security: 96 / 100; 20% weight
        Test quality: 82 / 100; 10% weight

      Areas
        Visual Slop: 0 findings (high 0, medium 0, low 0)
        Frontend Implementation: 0 findings (high 0, medium 0, low 0)
        Code and Logic: 0 findings (high 0, medium 0, low 0)
        Repository Coherence: 0 findings (high 0, medium 0, low 0)
        Accessibility and Resilience: 0 findings (high 0, medium 0, low 0)

      Recommended actions
        None — no active findings.

      Rescan comparison
        Finding delta has not been evaluated.

      Run again after a change to compare findings. Use --full for every score and finding."
    `);
  });

  it('renders an incomplete scan without a score or action', () => {
    const output = stripAnsi(formatFirstScanPretty(project(report({
      completionStatus: 'partial',
      scoreValidity: 'incomplete',
      issues: [issue('logic')],
    })), { columns: 120 }));

    expect(output).toMatchInlineSnapshot(`
      "Repository Health
        unavailable — incomplete scan has no valid score.

      Scan status
        incomplete

      Policy gate
        not evaluated — scan status is incomplete.

      Dimensions
        unavailable — incomplete scan has no valid dimensions.

      Areas
        Visual Slop: 0 findings (high 0, medium 0, low 0)
        Frontend Implementation: 0 findings (high 0, medium 0, low 0)
        Code and Logic: 1 finding (high 0, medium 0, low 1)
        Repository Coherence: 0 findings (high 0, medium 0, low 0)
        Accessibility and Resilience: 0 findings (high 0, medium 0, low 0)

      Recommended actions
        unavailable — incomplete scans do not recommend actions.

      Rescan comparison
        Finding delta not evaluated: scan status is incomplete.

      Run again after a change to compare findings. Use --full for every score and finding."
    `);
    expect(output).not.toMatch(/\d+(?:\.\d+)? \/ 100/);
    expect(output).not.toContain('Action:');
  });

  it('renders a not-applicable scan without a score or action', () => {
    const output = stripAnsi(formatFirstScanPretty(project(report({
      completionStatus: 'empty',
      scoreValidity: 'not-applicable',
      issues: [issue('logic')],
    })), { columns: 120 }));

    expect(output).toMatchInlineSnapshot(`
      "Repository Health
        unavailable — not-applicable scan has no valid score.

      Scan status
        not-applicable

      Policy gate
        not evaluated — scan status is not-applicable.

      Dimensions
        unavailable — not-applicable scan has no valid dimensions.

      Areas
        Visual Slop: 0 findings (high 0, medium 0, low 0)
        Frontend Implementation: 0 findings (high 0, medium 0, low 0)
        Code and Logic: 1 finding (high 0, medium 0, low 1)
        Repository Coherence: 0 findings (high 0, medium 0, low 0)
        Accessibility and Resilience: 0 findings (high 0, medium 0, low 0)

      Recommended actions
        unavailable — not-applicable scans do not recommend actions.

      Rescan comparison
        Finding delta not evaluated: scan status is not-applicable.

      Run again after a change to compare findings. Use --full for every score and finding."
    `);
    expect(output).not.toMatch(/\d+(?:\.\d+)? \/ 100/);
    expect(output).not.toContain('Action:');
  });

  it('hard-wraps semantic text to a 40-column terminal', () => {
    const longToken = 'x'.repeat(90);
    const narrow = project(report({ issues: [issue('logic', {
      ruleId: `logic/${longToken}`,
      message: `Review ${longToken} before merging this unusually long explanation.`,
      advice: `Inspect ${longToken} manually.`,
    })] }));
    const output = stripAnsi(formatFirstScanPretty(narrow, {
      columns: 40,
      meanSlop: 30,
      aiSlopScore: 8,
    }));

    expect(output.split('\n').filter(Boolean).every((line) => line.length <= 40)).toBe(true);
  });
});
