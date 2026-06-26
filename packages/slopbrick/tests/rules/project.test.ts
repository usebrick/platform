import { describe, it, expect } from 'vitest';
import { analyzeGapMonopoly, analyzeCssBloat, analyzeDuplicatedScreens, runProjectRules } from '../../src/rules/project';
import { filterIssues } from '../../src/index';
import type { FileScanResult, ResolvedConfig } from '../../src/types';

function makeResult(
  filePath: string,
  gapValues: string[] = [],
  styleSources: string[] = [],
  elementTags: string[] = [],
): FileScanResult {
  return {
    filePath,
    componentCount: 1,
    issues: [],
    gapValues,
    styleSources,
    elementTags,
  };
}

const baseConfig: ResolvedConfig = {
  include: [],
  exclude: [],
  rules: {
    'layout/gap-monopoly': 'medium',
    'perf/css-bloat': 'low',
    'layout/duplicated-screen': 'medium',
    'component/giant-component': 'medium',
  },
  frameworkMultipliers: {},
  ruleConfig: {},
  thresholds: { meanSlop: 25, p90Slop: 50, individualSlopThreshold: 50 },
  arbitraryValueAllowlist: [],
  wcag: { targetSizeExemptSelectors: [] },
};

describe('layout/gap-monopoly', () => {
  it('does not trigger when gap values are varied', () => {
    const results = [
      makeResult('/a.tsx', ['gap-4']),
      makeResult('/b.tsx', ['gap-8']),
      makeResult('/c.tsx', ['gap-6']),
    ];
    const issues = analyzeGapMonopoly(results, baseConfig);
    expect(issues).toHaveLength(0);
  });

  it('triggers when a single gap value dominates', () => {
    const results = [
      makeResult('/a.tsx', ['gap-4']),
      makeResult('/b.tsx', ['gap-4']),
      makeResult('/c.tsx', ['gap-4']),
    ];
    const issues = analyzeGapMonopoly(results, baseConfig);
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('layout/gap-monopoly');
    expect(issues[0].message).toContain('gap-4');
    expect(issues[0].message).toContain('100%');
  });

  it('respects configured gapTokens and raises tolerance', () => {
    const results = [
      ...Array.from({ length: 9 }, (_, i) => makeResult(`/a${i}.tsx`, ['gap-4'])),
      makeResult('/b.tsx', ['gap-8']),
    ];
    const config: ResolvedConfig = { ...baseConfig, gapTokens: ['gap-4'] };
    const issues = analyzeGapMonopoly(results, config);
    expect(issues).toHaveLength(0);
  });

  it('is disabled when rule is off', () => {
    const results = [makeResult('/a.tsx', ['gap-4'])];
    const config: ResolvedConfig = { ...baseConfig, rules: { ...baseConfig.rules, 'layout/gap-monopoly': 'off' } };
    expect(analyzeGapMonopoly(results, config)).toHaveLength(0);
  });

  it('allows severity override to high', () => {
    const results = [
      makeResult('/a.tsx', ['gap-4']),
      makeResult('/b.tsx', ['gap-4']),
      makeResult('/c.tsx', ['gap-4']),
    ];
    const config: ResolvedConfig = {
      ...baseConfig,
      rules: { ...baseConfig.rules, 'layout/gap-monopoly': 'high' },
    };
    const issues = analyzeGapMonopoly(results, config);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('high');
  });
});

describe('perf/css-bloat', () => {
  it('does not trigger for unique style strings', () => {
    const results = [
      makeResult('/a.tsx', [], ['p-4 m-2']),
      makeResult('/b.tsx', [], ['p-6 m-4']),
    ];
    expect(analyzeCssBloat(results, baseConfig)).toHaveLength(0);
  });

  it('triggers when a style string repeats across files', () => {
    const duplicated = 'flex items-center justify-center';
    const results = [
      makeResult('/a.tsx', [], [duplicated, duplicated]),
      makeResult('/b.tsx', [], [duplicated, duplicated]),
      makeResult('/c.tsx', [], [duplicated, duplicated]),
    ];
    const issues = analyzeCssBloat(results, baseConfig);
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('perf/css-bloat');
    expect(['/a.tsx', '/b.tsx', '/c.tsx']).toContain(issues[0].filePath);
  });

  it('ignores duplicates within a single file', () => {
    const duplicated = 'p-4';
    const results = [makeResult('/a.tsx', [], Array(10).fill(duplicated))];
    expect(analyzeCssBloat(results, baseConfig)).toHaveLength(0);
  });

  it('normalizes whitespace before comparing', () => {
    const results = [
      makeResult('/a.tsx', [], ['flex  items-center']),
      makeResult('/b.tsx', [], ['flex items-center']),
      makeResult('/c.tsx', [], ['flex items-center']),
      makeResult('/d.tsx', [], ['flex items-center']),
      makeResult('/e.tsx', [], ['flex items-center']),
      makeResult('/f.tsx', [], ['flex items-center']),
    ];
    const issues = analyzeCssBloat(results, baseConfig);
    expect(issues).toHaveLength(1);
  });

  it('canonicalizes token order before comparing', () => {
    const results = [
      makeResult('/a.tsx', [], ['items-center flex']),
      makeResult('/b.tsx', [], ['flex items-center']),
      makeResult('/c.tsx', [], ['flex  items-center']),
      makeResult('/d.tsx', [], ['items-center flex']),
      makeResult('/e.tsx', [], ['flex items-center']),
      makeResult('/f.tsx', [], ['items-center flex']),
    ];
    const issues = analyzeCssBloat(results, baseConfig);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('6 times');
  });

  it('includes a snippet of the repeated style block in the message', () => {
    const duplicated = 'flex items-center justify-center';
    const results = [
      makeResult('/a.tsx', [], [duplicated]),
      makeResult('/b.tsx', [], [duplicated]),
      makeResult('/c.tsx', [], [duplicated]),
      makeResult('/d.tsx', [], [duplicated]),
      makeResult('/e.tsx', [], [duplicated]),
      makeResult('/f.tsx', [], [duplicated]),
    ];
    const issues = analyzeCssBloat(results, baseConfig);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('flex items-center justify-center');
  });
});

describe('runProjectRules', () => {
  it('returns issues from all enabled project rules', () => {
    const duplicated = 'centered';
    const results = [
      makeResult('/a.tsx', ['gap-4', 'gap-4'], [duplicated]),
      makeResult('/b.tsx', ['gap-4'], [duplicated]),
      makeResult('/c.tsx', ['gap-4'], [duplicated]),
      makeResult('/d.tsx', ['gap-4'], [duplicated]),
      makeResult('/e.tsx', ['gap-4'], [duplicated]),
      makeResult('/f.tsx', ['gap-4'], [duplicated]),
    ];
    const issues = runProjectRules(results, baseConfig);
    expect(issues.length).toBeGreaterThanOrEqual(2);
  });

  it('gap-monopoly issue is AI-specific and css-bloat is human-general', () => {
    const duplicated = 'centered';
    const results = [
      makeResult('/a.tsx', ['gap-4', 'gap-4'], [duplicated]),
      makeResult('/b.tsx', ['gap-4'], [duplicated]),
      makeResult('/c.tsx', ['gap-4'], [duplicated]),
      makeResult('/d.tsx', ['gap-4'], [duplicated]),
      makeResult('/e.tsx', ['gap-4'], [duplicated]),
      makeResult('/f.tsx', ['gap-4'], [duplicated]),
    ];
    const issues = runProjectRules(results, baseConfig);
    const gap = issues.find((i) => i.ruleId === 'layout/gap-monopoly');
    const bloat = issues.find((i) => i.ruleId === 'perf/css-bloat');
    expect(gap?.aiSpecific).toBe(true);
    expect(bloat?.aiSpecific).toBe(false);
  });

  it('project issues can be filtered by ai-only/human-only flags', () => {
    const duplicated = 'centered';
    const results = [
      makeResult('/a.tsx', ['gap-4', 'gap-4'], [duplicated]),
      makeResult('/b.tsx', ['gap-4'], [duplicated]),
      makeResult('/c.tsx', ['gap-4'], [duplicated]),
      makeResult('/d.tsx', ['gap-4'], [duplicated]),
      makeResult('/e.tsx', ['gap-4'], [duplicated]),
      makeResult('/f.tsx', ['gap-4'], [duplicated]),
    ];
    const issues = runProjectRules(results, baseConfig);
    const aiOnly = filterIssues(issues, { aiOnly: true });
    const humanOnly = filterIssues(issues, { humanOnly: true });
    expect(aiOnly.every((i) => i.aiSpecific)).toBe(true);
    expect(humanOnly.every((i) => !i.aiSpecific)).toBe(true);
    expect(aiOnly.some((i) => i.ruleId === 'layout/gap-monopoly')).toBe(true);
    expect(humanOnly.some((i) => i.ruleId === 'perf/css-bloat')).toBe(true);
  });
});

describe('layout/duplicated-screen', () => {
  it('flags screen files with identical top-level tag sequences', () => {
    const results = [
      makeResult('/project/src/app/screen-a.tsx', [], [], ['View', 'ScrollView', 'View', 'Text']),
      makeResult('/project/src/app/screen-b.tsx', [], [], ['View', 'ScrollView', 'View', 'Text']),
    ];
    const issues = analyzeDuplicatedScreens(results, baseConfig);
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('layout/duplicated-screen');
    expect(issues[0].message).toContain('2 screen files');
  });

  it('ignores non-screen files', () => {
    const results = [
      makeResult('/project/src/components/button.tsx', [], [], ['View', 'Text']),
      makeResult('/project/src/components/badge.tsx', [], [], ['View', 'Text']),
    ];
    expect(analyzeDuplicatedScreens(results, baseConfig)).toHaveLength(0);
  });

  it('does not flag unique screen structures', () => {
    const results = [
      makeResult('/project/src/app/a.tsx', [], [], ['View', 'Text']),
      makeResult('/project/src/app/b.tsx', [], [], ['View', 'Button']),
    ];
    expect(analyzeDuplicatedScreens(results, baseConfig)).toHaveLength(0);
  });

  it('is disabled when rule is off', () => {
    const results = [
      makeResult('/project/src/app/screen-a.tsx', [], [], ['View', 'Text']),
      makeResult('/project/src/app/screen-b.tsx', [], [], ['View', 'Text']),
    ];
    const config: ResolvedConfig = {
      ...baseConfig,
      rules: { ...baseConfig.rules, 'layout/duplicated-screen': 'off' },
    };
    expect(analyzeDuplicatedScreens(results, config)).toHaveLength(0);
  });

  it('uses default severity when set to auto', () => {
    const results = [
      makeResult('/project/src/app/screen-a.tsx', [], [], ['View', 'ScrollView', 'View', 'Text']),
      makeResult('/project/src/app/screen-b.tsx', [], [], ['View', 'ScrollView', 'View', 'Text']),
    ];
    const config: ResolvedConfig = {
      ...baseConfig,
      rules: { ...baseConfig.rules, 'layout/duplicated-screen': 'auto' },
    };
    const issues = analyzeDuplicatedScreens(results, config);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('medium');
  });

});


