import { describe, it, expect } from 'vitest';
import { filterIssues } from '../../src/index';
import type { Issue } from '../../src/types';

function makeIssue(ruleId: string, filePath = 'src/x.tsx'): Issue {
  return {
    ruleId,
    category: 'visual',
    severity: 'medium',
    aiSpecific: true,
    filePath,
    message: 'm',
    line: 1,
    column: 1,
  };
}

describe('filterIssues --rule filter', () => {
  const issues = [
    makeIssue('visual/math-default-font'),
    makeIssue('visual/clamp-soup'),
    makeIssue('logic/math-any-density'),
  ];

  it('returns all issues when rule is undefined', () => {
    expect(filterIssues(issues, {}).map((i) => i.ruleId)).toEqual([
      'visual/math-default-font',
      'visual/clamp-soup',
      'logic/math-any-density',
    ]);
  });

  it('returns only the matching rule when --rule is set', () => {
    const filtered = filterIssues(issues, { rule: 'visual/clamp-soup' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].ruleId).toBe('visual/clamp-soup');
  });

  it('returns empty when --rule matches nothing', () => {
    expect(filterIssues(issues, { rule: 'nonexistent/rule' })).toEqual([]);
  });

  it('combines with --ai-only correctly', () => {
    const humanIssue: Issue = { ...makeIssue('visual/clamp-soup'), aiSpecific: false };
    const all = [makeIssue('visual/math-default-font'), humanIssue, makeIssue('visual/clamp-soup')];
    const filtered = filterIssues(all, { aiOnly: true, rule: 'visual/clamp-soup' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].aiSpecific).toBe(true);
    expect(filtered[0].ruleId).toBe('visual/clamp-soup');
  });
});