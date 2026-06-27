import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

/**
 * AI TypeScript `any` density (Lee, Hassan, Hindle, MSR 2026).
 *
 * Per Lee, Hassan, Hindle, "Mining Type Constructs Using Patterns
 * in AI-Generated Code" (MSR 2026, arXiv:2602.17955):
 *
 *   "Across 545 agentic vs. 269 human TS PRs, AI agents introduce
 *    `any` at mean 2.16 per PR vs humans at 0.24 per PR — a 9x
 *    ratio with Mann-Whitney p=2.33e-7, Cohen's d=0.32. Agents
 *    use advanced type features (non-null assertions, type
 *    assertions) at 2-2.5x human rates."
 *
 * The signal: ratio of `any` keyword usages to total type-bearing
 * declarations. AI code prioritizes compilation success over
 * type soundness, so it reaches for `any` as an escape hatch.
 *
 * Threshold: 2.16 / 0.24 = 9x ratio. We use 5x as a conservative
 * default to avoid FPs on legitimate `any` usage in old code.
 *
 * Per-file detection (not per-PR): ratio of `: any` plus
 * `as any` plus `<any>` to total TS declarations in the file.
 *
 * Note: only fires on .ts / .tsx files.
 */
const ANY_DENSITY_THRESHOLD = 0.30;  // 30% of declarations are `any`
const MIN_DECLARATIONS = 5;

const ANY_TYPE_ANNOTATION_RE = /:\s*any\b/g;
const ANY_ASSERTION_RE = /\bas\s+any\b/g;
const ANY_GENERIC_RE = /<any>/g;
const DECLARATION_RE = /(?:\b(?:const|let|var|function|class|interface|type)\b|:\s*[A-Z][\w<>[\],\s|]*)/g;

export const aiAnyDensityRule = createRule<RuleContext>({
  id: 'ai/any-density',
  category: 'ai',
  severity: 'medium',
  aiSpecific: true,
  description: 'TypeScript `any` density deviates from human baseline — AI agents use `any` as a type-safety escape hatch (Lee, Hassan, Hindle, MSR 2026)',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    if (!facts.v2) return [];
    const filePath = facts.filePath ?? '';
    // Only fire on TypeScript files
    if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) return [];
    const source = facts.v2._source ?? '';
    if (!source) return [];

    const anyCount =
      (source.match(ANY_TYPE_ANNOTATION_RE) || []).length +
      (source.match(ANY_ASSERTION_RE) || []).length +
      (source.match(ANY_GENERIC_RE) || []).length;

    // Approximate declaration count: lines containing `const`/`let`/`var`/
    // `function`/`class`/`interface`/`type` or having a type annotation.
    const declMatches = source.match(DECLARATION_RE) || [];
    const declCount = Math.max(declMatches.length, 1);

    if (declCount < MIN_DECLARATIONS) return [];
    const ratio = anyCount / declCount;
    if (ratio < ANY_DENSITY_THRESHOLD) return [];

    return [
      {
        ruleId: 'ai/any-density',
        category: 'ai',
        severity: 'medium',
        aiSpecific: true,
        message:
          `\`any\` density is ${(ratio * 100).toFixed(0)}% of declarations ` +
          `(${anyCount} \`any\` / ${declCount} declarations). ` +
          `Lee, Hassan, Hindle (MSR 2026): AI agents introduce \`any\` at 9× ` +
          `human rate as a type-safety escape hatch.`,
        line: 1,
        column: 1,
        advice:
          'Replace `any` with a precise type (`unknown`, `Record<string, unknown>`, or a domain-specific type). The `: any` annotation propagates type-errors and defeats TypeScript\'s safety guarantees.',
      },
    ];
  },
});

export default aiAnyDensityRule satisfies Rule<RuleContext>;
