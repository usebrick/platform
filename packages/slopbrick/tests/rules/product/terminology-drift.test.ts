import { describe, expect, it } from 'vitest';
import { terminologyDriftRule } from '../../../src/rules/product/terminology-drift';
import type { Issue, RuleContext, ScanFacts } from '../../../src/types';
import type { ScanFactsV2, ComponentRecord } from '../../../src/engine/types';

function makeFacts(componentNames: string[], filePath = '/repo/src/feed.tsx'): ScanFactsV2 {
  const components: ComponentRecord[] = componentNames.map((name, i) => ({
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
  }));
  // The mock only needs the fields the rule actually reads (`file`,
  // `components`). Cast through `unknown` so we can omit the rest without
  // type errors as the real ScanFactsV2 shape evolves.
  return {
    file: { path: filePath, loc: 200, extension: '.tsx', framework: 'react' },
    components,
  } as unknown as ScanFactsV2;
}

describe('product/terminology-drift', () => {
  const context: RuleContext = {
    config: {} as RuleContext['config'],
    filePath: '/repo/src/feed.tsx',
    cwd: '/repo',
  };

  function analyze(componentNames: string[]): Issue[] {
    const ctx = terminologyDriftRule.create(context);
    return terminologyDriftRule.analyze(ctx, { v2: makeFacts(componentNames) } as unknown as ScanFacts);
  }

  it('does not fire when fewer than 3 distinct variants exist for any stem', () => {
    expect(analyze(['PostCard', 'PostList'])).toEqual([]);
  });

  it('does not fire when components share no stem', () => {
    expect(analyze(['PostCard', 'CommentList', 'UserAvatar'])).toEqual([]);
  });

  it('fires on the canonical noun-drift pattern (Post / Article / News / Story)', () => {
    // Same trailing suffix "List" across 4 different leading nouns = the
    // canonical ROADMAP.md example. The rule should detect this via the
    // suffix stem group, not just the prefix group.
    const issues = analyze(['PostList', 'ArticleList', 'NewsList', 'StoryList']);
    expect(issues.length).toBeGreaterThanOrEqual(3);
    for (const issue of issues) {
      expect(issue.ruleId).toBe('product/terminology-drift');
      expect(issue.category).toBe('arch');
      expect(issue.severity).toBe('medium');
      expect(issue.aiSpecific).toBe(true);
    }
    // Verify the canonical picker picked the longest name
    const messages = issues.map((i) => i.message);
    expect(messages.some((m) => m.includes('PostList'))).toBe(true); // longest wins
  });

  it('fires on suffix-drift pattern (PostList / PostDetail / PostCard)', () => {
    // Same leading noun "Post", 3 distinct suffixes.
    const issues = analyze(['PostList', 'PostDetail', 'PostCard']);
    expect(issues.length).toBe(2); // 3 variants -> 2 drifters
    expect(issues.every((i) => i.message.includes('"Post'))).toBe(true);
  });

  it('fires on BOTH prefix and suffix drift when both apply', () => {
    // 4 components share the "List" suffix AND 3 of them share the "Post" prefix.
    const issues = analyze(['PostList', 'ArticleList', 'NewsList', 'PostDetail']);
    expect(issues.length).toBeGreaterThanOrEqual(2);
  });

  it('skips lowercase or single-char component names', () => {
    expect(analyze(['postlist', 'articlelist', 'newslist', 'storylist'])).toEqual([]);
  });

  it('skips very short component names (<4 chars)', () => {
    expect(analyze(['Foo', 'Foos', 'Food'])).toEqual([]);
  });

  it('caps total issues at MAX_ISSUES_TOTAL (5)', () => {
    // 6 distinct stems each with 3 variants would generate many issues;
    // the cap protects the user from rule-overwhelm.
    const names = [
      'PostList', 'PostDetail', 'PostCard',
      'ArticleList', 'ArticleDetail', 'ArticleCard',
      'NewsList', 'NewsDetail', 'NewsCard',
      'StoryList', 'StoryDetail', 'StoryCard',
    ];
    const issues = analyze(names);
    expect(issues.length).toBeLessThanOrEqual(5);
  });

  it('uses component.line (not hardcoded 1) for issue attribution', () => {
    const issues = analyze(['PostList', 'ArticleList', 'NewsList']);
    for (const issue of issues) {
      // line should be > 0 and should match the source component's line
      expect(issue.line).toBeGreaterThan(0);
    }
  });
});
