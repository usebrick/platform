import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { isOutlineRemoval } from '../utils';

const FOCUS_VISIBLE_RING_RE = /^focus-visible:ring-.+$/;

export interface FocusAppearanceContext {
  globalCssTarget?: string;
}

export const focusAppearanceRule = createRule<FocusAppearanceContext>({
  id: 'wcag/focus-appearance',
  category: 'wcag',
  severity: 'high',
  aiSpecific: false,
  create(context: RuleContext): FocusAppearanceContext {
    return { globalCssTarget: context.config.globalCssTarget };
  },
  analyze(context: FocusAppearanceContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const elements = facts.v2.jsx.elements.filter((e) => e.interactive);

    for (const element of elements) {
      const classes: string[] = element.classNames;
      const removesOutline = classes.some((className) => isOutlineRemoval(className));
      const hasFocusRing = classes.some((className) => FOCUS_VISIBLE_RING_RE.test(className));

      if (removesOutline && !hasFocusRing) {
        const issue: Issue = {
          ruleId: 'wcag/focus-appearance',
          category: 'wcag',
          severity: 'high',
          aiSpecific: false,
          message: `Interactive '${element.tag}' removes focus outline without adding a focus ring`,
          line: element.line,
          column: element.column,
          advice:
            'Add a focus-visible:ring-* class, or remove outline-none.',
        };
        if (context.globalCssTarget) {
          issue.fix = {
            kind: 'css-anchor',
            description: 'Inject global focus-ring CSS block',
            targetFile: context.globalCssTarget,
            anchor: '@slopbrick:v1.0.0:fix:focus-ring',
          };
        }
        issues.push(issue);
      }
    }

    return issues;
  },
});

export default focusAppearanceRule satisfies Rule<FocusAppearanceContext>;