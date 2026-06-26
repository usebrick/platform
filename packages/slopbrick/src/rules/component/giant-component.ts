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