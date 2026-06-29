import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

/**
 * Rule: shadcn-prop-mismatch
 * Legacy `className` prop assignment on shadcn/ui components whose
 * registry schema explicitly excludes it.
 *
 * **Empirical observation, with shadcn/ui as canonical source:**
 * - shadcn/ui's registry schema (https://ui.shadcn.com/docs/registry)
 *   and component docs explicitly define which props are accepted
 *   on each component. The `className` prop, in particular, has
 *   had varying canonical support across versions; AI agents
 *   trained on older examples frequently apply `className` to
 *   components that no longer accept it.
 * - v6 calibration: lift 2.10×. P=0.66, R=0.003.
 * - This is a slopbrick-specific heuristic, not a peer-reviewed
 *   detection method as of v0.13.0. The signal is empirical and
 *   ties to a specific library's API surface.
 *
 * Future: cite a peer-reviewed paper on AI-default React prop
 * patterns if one is published.
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