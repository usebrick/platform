import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

/**
 * AI default React stack detection.
 *
 * Per Sascha K. (2025), "Six Models, One React Stack" — 9 LLMs (Claude,
 * GPT/Codex, Gemini, Grok, DeepSeek, Qwen, v0, Lovable, Bolt) all
 * default to: **React + Next.js/Vite + TypeScript + Tailwind CSS +
 * shadcn/ui + TanStack Query + Zustand**.
 *
 * Per Nam et al. (MSR 2026), "Beyond the Prompt: An Empirical Study
 * of Cursor Rules" (arXiv:2512.18925) — survey of 401 open-source
 * repos with Cursor rule files found that 27% of all AI directive
 * rules mention "Tailwind" and 18% mention "shadcn/ui" as canonical
 * libraries. The default stack is a property of the corpus, not of
 * any one company's preferences.
 *
 * The pattern: a single file imports ≥ 3 of [next, tailwindcss,
 * @tanstack/react-query, zustand, @radix-ui/*, shadcn components].
 * Files that use this many default-stack libraries in one place are
 * often auto-generated boilerplate.
 *
 * * Calibrated as DORMANT until v10.2 corpus calibration
 * confirms the FPR stays below 0.5% on the full 576,750-file corpus.
 * Code is correct and the rule is wired in the registry; it just
 * needs a positive-vs-negative precision/recall pass on v10 data. *
 */
const DEFAULT_STACK_PACKAGES = [
  // Next.js (every LLM defaults to it)
  'next',
  'next/router',
  'next/navigation',
  'next/link',
  'next/image',
  // TanStack Query (default data fetching)
  '@tanstack/react-query',
  '@tanstack/react-table',
  '@tanstack/react-router',
  // State (default: Zustand)
  'zustand',
  'jotai',
  'valtio',
  // Radix UI (shadcn/ui base)
  '@radix-ui/react-dialog',
  '@radix-ui/react-dropdown-menu',
  '@radix-ui/react-select',
  '@radix-ui/react-toast',
  '@radix-ui/react-tabs',
  // shadcn/ui imports (look for @/components/ui/ pattern)
  '@/components/ui/button',
  '@/components/ui/input',
  '@/components/ui/dialog',
  '@/components/ui/dropdown-menu',
  '@/components/ui/select',
  '@/components/ui/tabs',
  // Vite (alternative to Next)
  'vite',
  '@vitejs/plugin-react',
] as const;

const IMPORT_LINE_RE = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
const MIN_HITS = 3;

export const aiDefaultReactStackRule = createRule<RuleContext>({
  id: 'ai/default-react-stack',
  category: 'ai',
  severity: 'low',
  aiSpecific: true,
  // v0.20.0 calibration: v8.5 verdict = USEFUL but recall 0.001
  // (fires 1 time per 1,000 files). The "≥3 of default stack"
  // threshold catches almost nothing on real codebases — the
  // default stack is now ubiquitous, so the signal is near-zero.
  // Disable until the threshold is lowered or the rule is split
  // into per-library detectors.
  defaultOff: true,
  description: 'File uses ≥3 of the default React stack (Next.js + TanStack Query + Zustand + shadcn/ui) — Sascha 2025 + Nam et al. MSR 2026',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    if (!facts.v2) return [];
    const filePath = facts.filePath ?? '';
    // Only fire on JS/TS/TSX/JSX (the React stack)
    if (!/\.(?:ts|tsx|js|jsx)$/i.test(filePath)) return [];
    const source = facts.v2._source ?? '';
    if (!source) return [];

    // Collect all imported package names
    const importedPackages = new Set<string>();
    for (const m of source.matchAll(IMPORT_LINE_RE)) {
      const spec = m[1];
      if (!spec) continue;
      // Strip relative paths, scoped package subpaths
      const pkg = spec.startsWith('@/')
        ? spec
        : spec.startsWith('@')
          ? spec.split('/').slice(0, 2).join('/')
          : spec.split('/')[0];
      if (pkg) importedPackages.add(pkg);
    }

    const hits: string[] = [];
    for (const pkg of importedPackages) {
      if (DEFAULT_STACK_PACKAGES.some((p) => p === pkg || p.startsWith(pkg + '/'))) {
        hits.push(pkg);
      }
    }

    if (hits.length < MIN_HITS) return [];

    return [
      {
        ruleId: 'ai/default-react-stack',
        category: 'ai',
        severity: 'low',
        aiSpecific: true,
        message:
          `File imports ${hits.length} packages from the default React stack ` +
          `(${hits.slice(0, 4).join(', ')}${hits.length > 4 ? ', ...' : ''}). ` +
          `Review whether each dependency solves a current product need and whether ` +
          `the choices are documented for this codebase.`,
        line: 1,
        column: 1,
        advice:
          'Confirm each dependency and abstraction solves a product need; remove unused layers or document ' +
          'intentional choices. This is architecture guidance, not authorship proof.',
      },
    ];
  },
});

export default aiDefaultReactStackRule satisfies Rule<RuleContext>;
