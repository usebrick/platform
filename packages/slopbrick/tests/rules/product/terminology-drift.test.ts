import { describe, expect, it } from 'vitest';
import { terminologyDriftRule } from '../../../src/rules/product/terminology-drift';
import type { RuleContext, ScanFacts } from '../../../src/types';
import type { ScanFactsV2 } from '../../../src/engine/types';

function makeFacts(componentNames: string[], filePath = '/repo/src/feed.tsx'): ScanFacts {
  return {
    file: { path: filePath, loc: 200, extension: '.tsx', framework: 'react' },
    components: componentNames.map((name, i) => ({
      name,
      isExported: true,
      loc: 20,
      isClientComponent: true,
      isServerComponent: false,
      props: [],
      hookCalls: [],
      jsxBranches: [],
      imports: [],
      line: i * 25 + 1,
      column: 1,
      filePath,
    })),
    imports: [],
    jsxElements: [],
    jsxTree: [],
    hooks: [],
    stateVariables: [],
    defensiveChecks: [],
    apiCalls: [],
    designTokens: {
      spacing: { used: [], scale: [] },
      radius: { used: [], scale: [] },
      fontFamily: { used: [], scale: [] },
      fontSize: { used: [], scale: [] },
      color: { used: [], scale: [] },
    },
    cssClasses: [],
    cssVars: [],
    cssInline: [],
    htmlAttributes: [],
    mathConstants: [],
    comments: [],
    tailwindClasses: [],
    astroComponents: [],
    svelteComponents: [],
    vueComponents: [],
    qwikComponents: [],
    reactServerComponents: [],
    componentSizes: [],
    typeAnnotations: [],
    boundaryViolations: [],
    stateMutationPatterns: [],
    consoleLogs: [],
    testMocks: [],
    fileMeta: { path: filePath, loc: 200, extension: '.tsx', framework: 'react' },
  } as unknown as ScanFactsV2;
}

describe('product/terminology-drift', () => {
  const context: RuleContext = {
    config: {} as RuleContext['config'],
    filePath: '/repo/src/feed.tsx',
    cwd: '/repo',
  };

  it('does not fire when fewer than 3 distinct variants exist for any stem', () => {
    const ctx = terminologyDriftRule.create(context);
    const issues = terminologyDriftRule.analyze(ctx, { v2: makeFacts(['PostCard', 'PostList']) } as ScanFacts);
    expect(issues).toEqual([]);
  });

  it('does not fire when components share no stem', () => {
    const ctx = terminologyDriftRule.create(context);
    const issues = terminologyDriftRule.analyze(ctx, { v2: makeFacts(['PostCard', 'CommentList', 'UserAvatar']) } as ScanFacts);
    expect(issues).toEqual([]);
  });

  it('fires when 3+ components share a stem (Post / Article / News / Story)', () => {
    const ctx = terminologyDriftRule.create(context);
    // Three different "content entity" suffixes all on the Post* root
    // — the canonical AI-drift pattern.
    const issues = terminologyDriftRule.analyze(ctx, {
      v2: makeFacts(['PostList', 'PostDetail', 'PostCard']),
    } as ScanFacts);
    // MAX_ISSUES_PER_FILE caps at 1 per file.
    expect(issues.length).toBe(1);
    for (const issue of issues) {
      expect(issue.ruleId).toBe('product/terminology-drift');
      expect(issue.category).toBe('arch');
      expect(issue.severity).toBe('medium');
      expect(issue.aiSpecific).toBe(true);
    }
  });

  it('skips lowercase or single-char component names', () => {
    const ctx = terminologyDriftRule.create(context);
    const issues = terminologyDriftRule.analyze(ctx, {
      v2: makeFacts(['postcard', 'articlecard', 'newscard', 'storycard']),
    } as ScanFacts);
    expect(issues).toEqual([]);
  });

  it('skips very short component names (<4 chars)', () => {
    const ctx = terminologyDriftRule.create(context);
    const issues = terminologyDriftRule.analyze(ctx, {
      v2: makeFacts(['Foo', 'Foos', 'Food']),
    } as ScanFacts);
    expect(issues).toEqual([]);
  });

  it('caps issues at 1 per file', () => {
    const ctx = terminologyDriftRule.create(context);
    const issues = terminologyDriftRule.analyze(ctx, {
      v2: makeFacts(['PostCard', 'PostList', 'PostDetail', 'ArticleCard', 'NewsCard']),
    } as ScanFacts);
    expect(issues.length).toBeLessThanOrEqual(1);
  });
});
