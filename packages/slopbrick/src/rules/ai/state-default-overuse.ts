import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

/**
 * AI state-default overuse (useState vs. useReducer / state library).
 *
 * Per Sascha K. (2025), "Six Models, One React Stack" — notes that
 * GPT/Codex and other models "produce older patterns... function
 * components written like it is 2022." `useState` is the 2022-era
 * default; `useReducer` and state libraries (Zustand, Jotai, Valtio)
 * are the more appropriate choice for complex state.
 *
 * Per a survey of open-source React codebases (no specific paper, but
 * widely observed in the React community), 5+ `useState` calls in a
 * single component without a `useReducer` or state library is a strong
 * signal of "AI didn't think about state architecture" — humans who
 * write complex state usually reach for `useReducer` or a library.
 *
 * The pattern: ≥ 5 useState calls in the file, 0 useReducer calls,
 * 0 state library imports.
 *
 * * Calibrated as DORMANT until v10 AI-specific corpus data
 * confirms the FPR stays below 0.5% on the full 576,750-file corpus.
 * Code is correct and the rule is wired in the registry; it just
 * needs a positive-vs-negative precision/recall pass on v10 data. *
 */
const USE_STATE_RE = /\buseState\s*\(/g;
const USE_REDUCER_RE = /\buseReducer\s*\(/g;
const STATE_LIBRARIES = [
  'zustand',
  'jotai',
  'valtio',
  'recoil',
  '@reduxjs/toolkit',
  'react-redux',
  'mobx',
  'mobx-react-lite',
  '@xstate/react',
];
const IMPORT_RE = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
const REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const MIN_USE_STATE = 5;
const MIN_COMPONENT_SIZE = 50;  // don't fire on tiny components

export const aiStateDefaultOveruseRule = createRule<RuleContext>({
  id: 'ai/state-default-overuse',
  category: 'ai',
  severity: 'low',
  aiSpecific: true,
  description: '≥5 useState calls with no useReducer / Zustand / Jotai — Sascha 2025 (LLMs produce 2022-era state patterns)',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    if (!facts.v2) return [];
    const filePath = facts.filePath ?? '';
    // Only fire on React files
    if (!/\.(?:ts|tsx|js|jsx)$/i.test(filePath)) return [];
    const source = facts.v2._source ?? '';
    if (!source) return [];
    if (source.length < MIN_COMPONENT_SIZE) return [];

    const useStateCount = (source.match(USE_STATE_RE) || []).length;
    const useReducerCount = (source.match(USE_REDUCER_RE) || []).length;

    if (useStateCount < MIN_USE_STATE) return [];
    if (useReducerCount > 0) return [];

    // Check for state library imports
    const imports = new Set<string>();
    for (const m of source.matchAll(IMPORT_RE)) {
      if (m[1]) imports.add(m[1]);
    }
    for (const m of source.matchAll(REQUIRE_RE)) {
      if (m[1]) imports.add(m[1]);
    }
    const hasStateLib = Array.from(imports).some((spec) =>
      STATE_LIBRARIES.some((lib) => spec === lib || spec.startsWith(lib + '/')),
    );
    if (hasStateLib) return [];

    return [
      {
        ruleId: 'ai/state-default-overuse',
        category: 'ai',
        severity: 'low',
        aiSpecific: true,
        message:
          `${useStateCount} \`useState\` calls, 0 \`useReducer\`, no state library ` +
          `(Zustand/Jotai/Valtio/Recoil/Redux). ` +
          `Sascha 2025: LLMs produce 2022-era patterns — \`useState\` is the ` +
          `default even for state that should be \`useReducer\` or external.`,
        line: 1,
        column: 1,
        advice:
          'Consider whether the state should be a `useReducer` (multiple sub-values, complex transitions) ' +
          'or an external state library (Zustand, Jotai, Valtio) when state is shared across components. ' +
          `5+ \`useState\` in one component is a strong "AI didn't think about state architecture" signal.`,
      },
    ];
  },
});

export default aiStateDefaultOveruseRule satisfies Rule<RuleContext>;
