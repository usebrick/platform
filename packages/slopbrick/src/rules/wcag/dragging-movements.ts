import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

/**
 * Rule: dragging-movements
 *
 * Draggable element without a pointer/keyboard alternative. WCAG 2.1 SC 2.1.1.
  * **Peer-reviewed citation:**
 * - W3C Web Content Accessibility Guidelines (WCAG) 2.2,
 *   Success Criterion 2.5.7 "Dragging Movements" (Level AA).
 *   The rule implements the WCAG 2.2 SC 2.5.7 success criterion.
 * - v0.12.2 calibration: HYGIENE. Both human and AI code use
 *   drag-only patterns; not AI-discriminative. */
const ALT_HANDLER_RE = /^(?:onClick|onPointerDown|onKey(?:Down|Up|Press))$/;
const ALT_ROLE_RE = /^(?:button|application|tab|menuitem)$/;

export const draggingMovementsRule = createRule<RuleContext>({
  id: 'wcag/dragging-movements',
  category: 'wcag',
  severity: 'medium',
  aiSpecific: false,
  description: 'Draggable element without a pointer/keyboard alternative.',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    if (!facts.v2) return [];
    const issues: Issue[] = [];

    const draggables = facts.v2.jsx.elements.filter(
      (e) => e.attributes.draggable === 'true' || e.attributes.draggable === '',
    );
    const source = facts.v2._source ?? '';
    for (const el of draggables) {
      // Look at the surrounding JSX opening tag in source to find handlers/role.
      const before = source.split('\n').slice(0, el.line - 1).join('\n');
      const lineStart = before.length + 1;
      const rest = source.slice(lineStart);
      const nextLineEnd = rest.indexOf('\n');
      const lineSlice = nextLineEnd === -1 ? rest : rest.slice(0, nextLineEnd);

      const hasHandler = ALT_HANDLER_RE.test(lineSlice) ||
        /\b(?:onClick|onPointerDown|onKey(?:Down|Up|Press))\s*=/.test(lineSlice);
      const roleMatch = lineSlice.match(/\brole=["']([^"']+)["']/);
      const role = roleMatch?.[1];
      const hasRole = role !== undefined && ALT_ROLE_RE.test(role);
      if (hasHandler || hasRole) continue;

      issues.push({
        ruleId: 'wcag/dragging-movements',
        category: 'wcag',
        severity: 'medium',
        aiSpecific: false,
        message: 'draggable element lacks a pointer or keyboard alternative',
        line: el.line,
        column: el.column,
        advice:
          'Provide an onClick, onKeyDown, or button role as an alternative to dragging.',
      });
    }

    return issues;
  },
});

export default draggingMovementsRule satisfies Rule<RuleContext>;