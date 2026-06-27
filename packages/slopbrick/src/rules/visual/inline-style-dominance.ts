import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import {  STYLE_BLOCK_RE, lineOfSource , matchAll } from '../utils';

/**
 * Rule: visual/inline-style-dominance
 *
 * Phase 2 §10 (Visual Slop). Flags files that use inline styles for
 * 3+ distinct properties (e.g. `padding`, `margin`, `gap`). AI vibe-coded
 * code uses inline styles because they "just work" without thinking
 * about the project's design tokens; real production code prefers
 * className utilities from Tailwind/CSS modules.
 *
 * Threshold: ≥3 distinct (property, value) pairs in the file.
 */
function parseStylePairs(source: string): Array<{ property: string; value: string }> {
  const pairs: Array<{ property: string; value: string }> = [];
  const re = /(\w[\w-]*)\s*:\s*(['"][^'"]*['"]|[\w.#()-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const property = m[1];
    const value = m[2];
    if (!property || !value) continue;
    pairs.push({ property, value });
  }
  return pairs;
}



export const inlineStyleDominanceRule = createRule<RuleContext>({
  id: 'visual/inline-style-dominance',
  category: 'visual',
  severity: 'medium',
  aiSpecific: false,
  description: 'File uses inline styles for 3+ distinct properties — prefer className utilities.',
  create(context) {
    return context;
  },
  analyze(_context, facts: ScanFacts): Issue[] {
    const distinctPairs = new Set<string>();
    let firstLine = 1;
    let firstColumn = 1;

    if (facts.v2) {
      const source = facts.v2._source ?? '';
      let firstSeen = false;
      for (const blockMatch of matchAll(STYLE_BLOCK_RE, source)) {
        const blockSource = blockMatch[1];
        for (const { property, value } of parseStylePairs(blockSource)) {
          distinctPairs.add(`${property}:${value}`);
        }
        if (!firstSeen) {
          firstLine = lineOfSource(source, blockMatch.index);
          firstColumn = 1;
          firstSeen = true;
        }
      }
    }

    if (distinctPairs.size < 3) return [];

    return [
      {
        ruleId: 'visual/inline-style-dominance',
        category: 'visual',
        severity: 'medium',
        aiSpecific: true,
        message: `File uses inline styles for ${distinctPairs.size} distinct (property, value) pairs. AI tends to inline style props instead of using Tailwind/CSS class names.`,
        line: firstLine,
        column: firstColumn,
        advice: 'Replace inline `style={{...}}` with className utilities (e.g. Tailwind `p-4 m-2 gap-3`) or a CSS module class.',
      },
    ];
  },
});

export default inlineStyleDominanceRule satisfies Rule<RuleContext>;