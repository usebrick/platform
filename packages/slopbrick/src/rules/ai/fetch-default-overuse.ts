import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

/**
 * AI fetch-default overuse.
 *
 * Per Sascha K. (2025), "Six Models, One React Stack" — TanStack
 * Query is in the default stack of every top LLM, but Claude and
 * GPT will still default to plain `fetch()` when no library is
 * installed. The "LobeChat" code pattern in particular uses raw
 * `fetch()` calls in 30+ files.
 *
 * Per Nam et al. (MSR 2026), "Beyond the Prompt: An Empirical Study
 * of Cursor Rules" — AI directives frequently specify
 * "use TanStack Query for data fetching" but the generated code
 * still uses `fetch()` when the prompt doesn't reinforce it.
 *
 * The pattern: ≥ 3 `fetch(` calls in the file, no TanStack Query /
 * SWR / axios / ky imports.
 *
 * * Calibrated as DORMANT until v10.2 corpus calibration
 * confirms the FPR stays below 0.5% on the full 576,750-file corpus.
 * Code is correct and the rule is wired in the registry; it just
 * needs a positive-vs-negative precision/recall pass on v10 data. *
 */
const FETCH_RE = /\bfetch\s*\(/g;
const CANONICAL_FETCH_LIBS = [
  '@tanstack/react-query',
  'react-query',
  '@tanstack/query-core',
  'swr',
  'axios',
  'ky',
  'got',
  'node-fetch',
  'cross-fetch',
  'whatwg-fetch',
  'urql',
  'apollo-client',
  '@apollo/client',
  'relay-runtime',
];
const IMPORT_RE = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
const REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const MIN_FETCH_CALLS = 3;

export const aiFetchDefaultOveruseRule = createRule<RuleContext>({
  id: 'ai/fetch-default-overuse',
  category: 'ai',
  severity: 'low',
  aiSpecific: true,
  description: '≥3 direct fetch() calls with no TanStack Query / SWR / axios — Sascha 2025 (LLMs default to raw fetch even when libs exist)',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    if (!facts.v2) return [];
    const filePath = facts.filePath ?? '';
    // Only fire on frontend + Node backend files (not Rust/Go)
    if (!/\.(?:ts|tsx|js|jsx|mjs|cjs)$/i.test(filePath)) return [];
    const source = facts.v2._source ?? '';
    if (!source) return [];

    const fetchCount = (source.match(FETCH_RE) || []).length;
    if (fetchCount < MIN_FETCH_CALLS) return [];

    // Check for canonical library imports
    const imports = new Set<string>();
    for (const m of source.matchAll(IMPORT_RE)) {
      if (m[1]) imports.add(m[1]);
    }
    for (const m of source.matchAll(REQUIRE_RE)) {
      if (m[1]) imports.add(m[1]);
    }
    const hasFetchLib = Array.from(imports).some((spec) =>
      CANONICAL_FETCH_LIBS.some((lib) => spec === lib || spec.startsWith(lib + '/')),
    );
    if (hasFetchLib) return [];

    return [
      {
        ruleId: 'ai/fetch-default-overuse',
        category: 'ai',
        severity: 'low',
        aiSpecific: true,
        message:
          `${fetchCount} direct \`fetch()\` calls, no TanStack Query / SWR / axios / ky import. ` +
          `Sascha 2025: every top LLM puts TanStack Query in the default stack, but ` +
          `still defaults to raw \`fetch()\` when no library is in package.json. ` +
          `Nam et al. MSR 2026: 27% of AI directives mention TanStack Query.`,
        line: 1,
        column: 1,
        advice:
          'Consider adopting TanStack Query (or SWR / axios / ky) for client-side data fetching. ' +
          'Benefits: automatic caching, request deduplication, background refetching, error retry, ' +
          'request invalidation, optimistic updates. Direct fetch() requires re-implementing all of these.',
      },
    ];
  },
});

export default aiFetchDefaultOveruseRule satisfies Rule<RuleContext>;
