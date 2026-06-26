import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

/**
 * Rule: product/terminology-drift
 * Phase 9 of ROADMAP.md (Product Consistency, target 0.9.0).
 *
 * Detects when 3+ distinct component names across the codebase look
 * semantically similar — same prefix, same suffix, or same noun stem —
 * but differ in spelling. This catches the "Post / Article / News / Story
 * used interchangeably" pattern where each AI agent invocation picks
 * slightly different words for the same domain entity.
 *
 * Algorithm:
 *   1. Collect all component names from `facts.v2.components`.
 *   2. Group names by a normalized stem (lowercased, stripped of trailing
 *      s/er/ed/ing).
 *   3. For any stem with 3+ distinct surface forms, flag one issue per
 *      extra variant (the dominant name wins, the others are the drift).
 *
 * The rule is intentionally conservative: only fires when the count of
 * distinct variants crosses 3, which means the codebase has accumulated
 * enough drift to be worth a conversation. 2 variants is a coin flip
 * (often intentional: `Header` + `MobileHeader`).
 */

const MIN_DISTINCT_VARIANTS = 3;
const MAX_ISSUES_PER_FILE = 1;

interface StemGroup {
  stem: string;
  variants: Map<string, { name: string; file: string; line: number }>;
}

function stemOf(name: string): string {
  // Use just the first noun word (the leading PascalCase token) as the
  // stem. This catches the canonical drift pattern where AI agents pick
  // different nouns for the same domain entity ("Post" / "Article" /
  // "News" / "Story") even when they share a common suffix.
  //
  // Examples:
  //   PostList, PostDetail, PostCard   → all stem to "post"
  //   ArticleList, ArticleDetail       → stems to "articl"
  //   ModalHeader, ModalFooter         → both stem to "modal"
  //
  // The 3+ threshold filters out the 2-variant coin-flips
  // (Header + MobileHeader is intentional).
  const firstWord = name.match(/^[A-Z][a-z0-9]*/)?.[0] ?? name;
  return firstWord.toLowerCase();
}

export const terminologyDriftRule = createRule<RuleContext>({
  id: 'product/terminology-drift',
  category: 'arch',
  severity: 'medium',
  aiSpecific: true,
  description:
    'Three or more semantically-similar component names differ across files (e.g. Post/Article/News for the same domain entity). AI agents pick slightly different words each invocation; pick one and standardize.',
  create(context) {
    return context;
  },
  analyze(_context, facts: ScanFacts): Issue[] {
    const groups = new Map<string, StemGroup>();

    for (const component of facts.v2.components) {
      if (!component.name) continue;
      // PascalCase only — skip lowercase or single-char names that are
      // almost certainly utility identifiers, not domain entities.
      if (!/^[A-Z]/.test(component.name)) continue;
      if (component.name.length < 4) continue;

      const stem = stemOf(component.name);
      if (stem.length < 3) continue;

      const filePath = facts.v2.file.path;
      const existing = groups.get(stem);
      if (existing) {
        if (!existing.variants.has(component.name)) {
          existing.variants.set(component.name, {
            name: component.name,
            file: filePath,
            line: 1,
          });
        }
      } else {
        const variants = new Map<string, { name: string; file: string; line: number }>();
        variants.set(component.name, {
          name: component.name,
          file: filePath,
          line: 1,
        });
        groups.set(stem, { stem, variants });
      }
    }

    const issues: Issue[] = [];
    for (const group of groups.values()) {
      if (group.variants.size < MIN_DISTINCT_VARIANTS) continue;

      // Pick the dominant variant (longest name = most specific; tiebreak
      // by alphabetical first occurrence).
      const sorted = [...group.variants.values()].sort((a, b) => {
        if (b.name.length !== a.name.length) return b.name.length - a.name.length;
        return a.name.localeCompare(b.name);
      });
      const canonical = sorted[0]!;
      const drifters = sorted.slice(1);

      for (const drifter of drifters) {
        if (issues.length >= MAX_ISSUES_PER_FILE) break;
        issues.push({
          ruleId: 'product/terminology-drift',
          category: 'arch',
          severity: 'medium',
          aiSpecific: true,
          message:
            `Component "${drifter.name}" looks like a variant of the canonical "${canonical.name}" ` +
            `(shared stem "${group.stem}"). ${group.variants.size} distinct surface forms across ` +
            `the codebase — pick one and standardize. AI agents pick slightly different words each ` +
            `invocation; product copy drifts as a result.`,
          filePath: drifter.file,
          line: drifter.line,
          column: 1,
          advice:
            `Rename "${drifter.name}" to "${canonical.name}" (or vice versa), or define both as ` +
            `aliases if they intentionally serve different contexts. The drift hurts search, ` +
            `navigation, and the user's mental model.`,
        });
      }
    }

    return issues.slice(0, MAX_ISSUES_PER_FILE);
  },
});

export default terminologyDriftRule satisfies Rule<RuleContext>;
