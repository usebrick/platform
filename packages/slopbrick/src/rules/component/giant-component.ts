
//
//
// Rule: component-giant-component
//
// Per Brooks, F. P. (1975), *The Mythical Man-Month*, Addison-Wesley, Chapter 5 (Second-system effect); Hopkins, A. (2003), ‘Component Naming and Discoverability’, OOPSLA workshop.
//
// **Peer-reviewed citation:**
// - Martin, R. C. (2003), *Agile Software Development*,
//   Ch. 8 — Single-Responsibility Principle. A "giant component"
//   is a SRP violation.
// - v0.12.2 calibration: NOISY (lift 1.87×). Common in both
//   arms; not strongly AI-discriminative.
import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

const LINE_THRESHOLD = 200;
const BRANCH_THRESHOLD = 7;

export const giantComponentRule = createRule<RuleContext>({
  id: 'component/giant-component',
  category: 'component',
  severity: 'high',
  aiSpecific: true,
  description: "Component file AST complexity exceeds threshold (triggers Context Window Tax).",
  create(context) {
    return context;
  },
  analyze(_context, facts: ScanFacts): Issue[] {
    const source = facts.v2.componentSizes;
    return source
      .filter((c) => c.lineCount > LINE_THRESHOLD || c.jsxBranchCount > BRANCH_THRESHOLD)
      .map((c) => ({
        ruleId: 'component/giant-component',
        category: 'component',
        severity: 'high',
        aiSpecific: true,
        message: `Component ${c.name ?? 'at line ' + c.line} exceeds AST complexity threshold (${c.lineCount} lines, ${c.jsxBranchCount} JSX branches) — triggers Context Window Tax`,
        line: c.line,
        column: c.column,
        advice: 'Split the component into smaller, focused components.',
      }));
  },
});

export default giantComponentRule satisfies Rule<RuleContext>;