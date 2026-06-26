import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

function isPositiveDimension(value: string | undefined): boolean {
  if (value === undefined) return false;
  const num = Number(value);
  return Number.isFinite(num) && num > 0;
}

export interface ClsImageContext {
  // No configuration needed.
}

export const clsImageRule = createRule<ClsImageContext>({
  id: 'perf/cls-image',
  category: 'perf',
  severity: 'low',
  aiSpecific: false,
  description: "Image missing explicit dimensions",
  create(_context: RuleContext): ClsImageContext {
    return {};
  },
  analyze(_context: ClsImageContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    if (!facts.v2) return issues;

    const imgs = facts.v2.jsx.elements.filter((e) => e.tag === 'img');
    for (const img of imgs) {
      if (img.attributes.loading !== 'lazy') continue;
      const hasDimensions =
        isPositiveDimension(img.attributes.width) && isPositiveDimension(img.attributes.height);
      if (hasDimensions) continue;
      const hasAspect = img.classNames.some((c) => /^aspect-/.test(c));
      if (hasAspect) continue;
      issues.push({
        ruleId: 'perf/cls-image',
        category: 'perf',
        severity: 'low',
        aiSpecific: false,
        message: 'Lazy-loaded image lacks explicit dimensions or aspect ratio',
        line: img.line,
        column: img.column,
        advice: 'Add width/height attributes or an aspect-ratio utility to prevent layout shift.',
      });
    }

    return issues;
  },
});

export default clsImageRule satisfies Rule<ClsImageContext>;
