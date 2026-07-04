import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { isUIFile } from '../utils';

/**
 * AI Tailwind color over-representation.
 *
 * Per Sascha K. (2025), "Six Models, One React Stack" —
 *   "For a token-predicting model, Tailwind is the path of least
 *    resistance... High training frequency. Tailwind class strings
 *    appear millions of times in GitHub repos, blog posts, and
 *    tutorials."
 *
 * And Douglas (2025), "AI 生成网站正在 Tailwind 化" — random sampling
 * of 4 "Show HN" vibe-coded products found all 4 used identical
 * Tailwind front-end templates with the same color palette.
 *
 * The pattern: AI-generated Tailwind class strings over-represent the
 * default palette (blue-500, red-500, slate-50, gray-200) and the
 * default radius (rounded-lg, rounded-md) + default shadow (shadow-md,
 * shadow-lg) + default padding (p-4, p-6, p-8). Human designs more
 * often deviate — brand colors, custom radii, custom shadows.
 *
 * This rule fires when the file has ≥ 3 of these "default Tailwind"
 * classes. Calibrated as DORMANT until v7 corpus data lands.
 *
 * Only fires on .ts/.tsx/.js/.jsx/.vue/.svelte/.astro/.html files.
 */
const TAILWIND_DEFAULT_CLASSES = [
  // Color: blue (over-represented in AI)
  'bg-blue-500', 'bg-blue-600', 'bg-blue-700',
  'text-blue-500', 'text-blue-600', 'text-blue-700',
  'border-blue-500', 'ring-blue-500',
  // Color: slate/gray (default neutrals)
  'bg-slate-50', 'bg-slate-100', 'bg-slate-900',
  'text-slate-50', 'text-slate-500', 'text-slate-900',
  'bg-gray-50', 'bg-gray-100', 'bg-gray-900',
  'text-gray-500', 'text-gray-600', 'text-gray-900',
  'border-gray-200', 'border-gray-300',
  // Color: red (default error/danger)
  'bg-red-500', 'text-red-500', 'border-red-500',
  // Color: green (default success)
  'bg-green-500', 'text-green-500',
  // Default radii
  'rounded-md', 'rounded-lg', 'rounded-xl',
  // Default shadows
  'shadow-md', 'shadow-lg', 'shadow-xl',
  // Default padding
  'p-4', 'p-6', 'p-8',
  'px-4', 'px-6', 'py-4', 'py-6',
  // Default text size
  'text-sm', 'text-base', 'text-lg',
] as const;

const CLASS_BOUNDARY = '(?:^|[\\s"\'`])';  // word boundary or string boundary
const CLASS_PATTERN = new RegExp(
  CLASS_BOUNDARY + '(' + TAILWIND_DEFAULT_CLASSES.join('|') + ')\\b',
  'g',
);

const MIN_HITS = 3;

export const aiTailwindColorOveruseRule = createRule<RuleContext>({
  id: 'ai/tailwind-color-overuse',
  category: 'ai',
  severity: 'low',
  aiSpecific: true,
  description: 'Tailwind class strings over-represent the default palette (blue-500, slate-50, rounded-lg) — Sascha 2025 + Douglas 2025',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    if (!facts.v2) return [];
    // v0.39.0: file-type guard. Use the shared isUIFile() so
    // .ts/.js library files that mention Tailwind classes as
    // data don't fire (the previous guard was too permissive
    // and matched .ts files — 3 misfires on the platform's own
    // codemod fixtures).
    if (!isUIFile(facts.filePath)) return [];
    const source = facts.v2._source ?? '';
    if (!source) return [];

    const matches = new Set<string>();
    for (const m of source.matchAll(CLASS_PATTERN)) {
      matches.add(m[1]!);
    }

    if (matches.size < MIN_HITS) return [];

    return [
      {
        ruleId: 'ai/tailwind-color-overuse',
        category: 'ai',
        severity: 'low',
        aiSpecific: true,
        message:
          `Tailwind class strings show ${matches.size} distinct defaults ` +
          `(${Array.from(matches).slice(0, 5).join(', ')}${matches.size > 5 ? ', ...' : ''}). ` +
          `Sascha 2025: every LLM defaults to Tailwind's standard palette; ` +
          `Douglas 2025: 4/4 random "vibe coded" products used identical Tailwind templates.`,
        line: 1,
        column: 1,
        advice:
          'Consider whether the design actually needs these defaults. AI tends to reach for `bg-blue-500`, `rounded-lg`, `shadow-md` ' +
          'as path-of-least-resistance. Brand-specific colors and custom radii often look more intentional.',
      },
    ];
  },
});

export default aiTailwindColorOveruseRule satisfies Rule<RuleContext>;
