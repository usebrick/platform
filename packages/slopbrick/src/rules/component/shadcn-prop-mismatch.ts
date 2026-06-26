import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

/**
 * Rule: shadcn-prop-mismatch
 * Legacy `className` prop assignment on shadcn/ui components whose
 * registry schema explicitly excludes it.
 */
const SHADCN_COMPONENT_RE = /\b(?:Button|Card|Dialog|Sheet|Drawer|Popover|Tooltip|Alert|Badge|Input|Textarea|Select)\b/;

export const shadcnPropMismatchRule = createRule<RuleContext>({
  id: 'component/shadcn-prop-mismatch',
  category: 'component',
  severity: 'high',
  aiSpecific: true,
  description: 'Legacy `className` prop assignment on shadcn/ui components whose registry schema explicitly excludes it.',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    const elements = facts.v2.jsx.elements.filter((e) => e.interactive);

    for (const el of elements) {
      const tag = el.tag;
      if (!SHADCN_COMPONENT_RE.test(tag)) continue;
      const cls = el.attributes.className;
      if (!cls) continue;
      if (cls.length < 80) continue;
      if (!/\b(?:bg-|text-|border-|hover:)/.test(cls)) continue;

      issues.push({
        ruleId: 'component/shadcn-prop-mismatch',
        category: 'component',
        severity: 'high',
        aiSpecific: true,
        message:
          `<${tag}> has a long className override (${cls.length} chars) but no \`variant\` prop. ` +
          `shadcn/ui components select variants via the variant prop, not className.`,
        line: el.line,
        column: el.column,
        advice:
          'Use `<Button variant="destructive">` instead of `<Button className="bg-red-500 ...">`. See the shadcn/ui component registry for available variants.',
      });
    }

    return issues;
  },
});

export default shadcnPropMismatchRule satisfies Rule<RuleContext>;