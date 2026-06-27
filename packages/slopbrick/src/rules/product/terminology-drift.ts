import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

/**
 * Rule: product/terminology-drift
 * Phase 9 of ROADMAP.md (Product Consistency, target 0.9.0).
 *
 * Detects when 3+ distinct component names across the codebase look
 * semantically similar but differ in spelling. Catches both axes of the
 * canonical drift pattern from ROADMAP.md:
 *
 *   - Noun drift: `PostList`, `ArticleList`, `NewsList`, `StoryList`
 *     — same suffix, different leading noun. Each AI agent picks a
 *     different word for the same domain entity.
 *
 *   - Suffix drift: `PostList`, `PostDetail`, `PostCard`
 *     — same leading noun, different trailing descriptor.
 *
 * Algorithm:
 *   1. Collect all component names from `facts.v2.components`.
 *   2. For each name, derive two normalized stems:
 *      - prefix stem: the leading PascalCase token (e.g. `Post` from `PostList`)
 *      - suffix stem: the trailing PascalCase token (e.g. `List` from `PostList`)
 *   3. Group names by each stem independently.
 *   4. For any group with 3+ distinct surface forms, emit one issue per
 *      drifter (the canonical variant is the longest name; tiebreak by
 *      frequency, then alphabetical).
 *
 * The 3+ threshold filters out 2-variant coin-flips (e.g. `Header` +
 * `MobileHeader` is intentional; `Post` + `PostList` is one concept).
 */

const MIN_DISTINCT_VARIANTS = 3;
/** Total cap on issues emitted per scan run. Per-file data only — see
 *  ROADMAP.md cross-file drift plan for the project-level version. */
const MAX_ISSUES_TOTAL = 5;

interface StemGroup {
  stem: string;
  variants: Map<string, { name: string; file: string; line: number }>;
}

function firstWord(name: string): string {
  const m = name.match(/^[A-Z][a-z0-9]*/);
  return (m?.[0] ?? name).toLowerCase();
}

function lastWord(name: string): string {
  const m = name.match(/[A-Z][a-z0-9]*$/);
  return (m?.[0] ?? name).toLowerCase();
}

function addVariant(
  groups: Map<string, StemGroup>,
  stem: string,
  name: string,
  filePath: string,
  line: number,
): void {
  const existing = groups.get(stem);
  if (existing) {
    if (!existing.variants.has(name)) {
      existing.variants.set(name, { name, file: filePath, line });
    }
  } else {
    const variants = new Map<string, { name: string; file: string; line: number }>();
    variants.set(name, { name, file: filePath, line });
    groups.set(stem, { stem, variants });
  }
}

export const terminologyDriftRule = createRule<RuleContext>({
  id: 'product/terminology-drift',
  category: 'arch',
  severity: 'medium',
  aiSpecific: false,
  description:
    'Three or more semantically-similar component names differ (e.g. PostList/ArticleList/NewsList on the "List" suffix, or PostList/PostDetail/PostCard on the "Post" prefix). AI agents pick slightly different words each invocation; pick one and standardize.',
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

      const filePath = facts.v2.file.path;
      const line = component.line ?? 1;

      addVariant(groups, firstWord(component.name), component.name, filePath, line);
      if (component.name !== firstWord(component.name)) {
        // Only add suffix group when the name actually has a suffix
        // (skip for single-word names like `Post`).
        addVariant(groups, lastWord(component.name), component.name, filePath, line);
      }
    }

    const issues: Issue[] = [];
    for (const group of groups.values()) {
      if (group.variants.size < MIN_DISTINCT_VARIANTS) continue;
      if (issues.length >= MAX_ISSUES_TOTAL) break;

      // Pick the canonical variant: longest name (most specific),
      // tiebreak by frequency (most-used), then alphabetical.
      const counts = new Map<string, number>();
      for (const v of group.variants.values()) {
        counts.set(v.name, (counts.get(v.name) ?? 0) + 1);
      }
      const sorted = [...group.variants.values()].sort((a, b) => {
        if (b.name.length !== a.name.length) return b.name.length - a.name.length;
        const ca = counts.get(a.name) ?? 0;
        const cb = counts.get(b.name) ?? 0;
        if (cb !== ca) return cb - ca;
        return a.name.localeCompare(b.name);
      });
      const canonical = sorted[0]!;
      const drifters = sorted.slice(1);

      for (const drifter of drifters) {
        if (issues.length >= MAX_ISSUES_TOTAL) break;
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

    return issues.slice(0, MAX_ISSUES_TOTAL);
  },
});

export default terminologyDriftRule satisfies Rule<RuleContext>;
