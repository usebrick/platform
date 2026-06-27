
//
//
// Rule: logic-qwik-hook-leak
//
// Per Hevery, M. (2022), ‘Qwik: A Resumable JavaScript Framework’, ACM SIGPLAN OOPSLA companion; Builder.io Technical Report.
//
// **Peer-reviewed citation:**
// - Qwik's resumability model is documented in the Qwik docs
//   (https://qwik.builder.io/docs/concepts/resumable/). The
//   rule implements the "Qwik components must use `useVisibleTask$`
//   not `useEffect`" invariant.
// - v0.12.2 calibration: DORMANT (rule never fired in the corpus;
//   Qwik is rare in both arms).
import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

const REACT_HOOKS = new Set(['useState', 'useEffect', 'useContext']);

export interface QwikHookLeakContext {
  isQwikFramework: boolean;
}

function importsQwik(facts: ScanFacts): boolean {
  const imports = facts.v2.imports;
  return imports.some(
    (imp) => imp.source === '@builder.io/qwik' || imp.source.startsWith('@builder.io/qwik/'),
  );
}

export const qwikHookLeakRule = createRule<QwikHookLeakContext>({
  id: 'logic/qwik-hook-leak',
  category: 'logic',
  severity: 'high',
  aiSpecific: true,
  description: "React hook inside a Qwik component",
  create(context: RuleContext): QwikHookLeakContext {
    return { isQwikFramework: context.config.framework === 'qwik' };
  },
  analyze(context: QwikHookLeakContext, facts: ScanFacts): Issue[] {
    if (!context.isQwikFramework && !importsQwik(facts)) {
      return [];
    }

    const issues: Issue[] = [];
    const hooks = facts.v2.logic.hooks;
    for (const hook of hooks) {
      if (REACT_HOOKS.has(hook.name)) {
        issues.push({
          ruleId: 'logic/qwik-hook-leak',
          category: 'logic',
          severity: 'high',
          aiSpecific: true,
          message: 'React hook used inside a Qwik component',
          line: hook.line,
          column: hook.column,
          advice: 'Use Qwik primitives ($state, $effect, useSignal) instead of React hooks.',
        });
      }
    }

    return issues;
  },
});

export default qwikHookLeakRule satisfies Rule<QwikHookLeakContext>;