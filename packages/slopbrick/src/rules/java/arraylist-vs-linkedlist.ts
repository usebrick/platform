/**
 * Rule: java/arraylist-vs-linkedlist
 *
 * `new LinkedList<>()` used when ArrayList would be correct. AI
 * agents default to LinkedList because their training data has many
 * textbook examples that use it. Real Java code uses ArrayList for
 * almost all cases — LinkedList has worse cache locality and higher
 * per-element memory overhead.
 *
 * **Why this matters:**
 * - LinkedList is rarely the right choice. It uses ~5x more memory
 *   per element than ArrayList, has O(n) indexed access vs O(1),
 *   and its only advantage (O(1) insertion at known position) is
 *   almost never the bottleneck.
 * - The pattern is a strong AI signal. Real Java engineers who
 *   know the data structures pick ArrayList.
 * - Joshua Bloch (Effective Java, Item 28): "LinkedList is a
 *   legacy class — use ArrayList unless you need a Deque".
 * - Severity: low. Performance impact is small for most use cases;
 *   the rule fires as a stylistic AI signal.
 * - Default off (DORMANT) until calibrated on v9 Java corpus.
 *
 * **Scope:** file-local. Regex on the source text.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface JavaArraylistVsLinkedlistContext {
  // No configuration.
}

const NEW_LINKED_LIST_REGEX = /new\s+LinkedList\s*</g;

export const javaArraylistVsLinkedlistRule = createRule<JavaArraylistVsLinkedlistContext>({
  id: 'java/arraylist-vs-linkedlist',
  category: 'typo',
  severity: 'low',
  aiSpecific: true,
  description: 'new LinkedList<>() — use ArrayList (Effective Java, Item 28)',
  create(_context: RuleContext): JavaArraylistVsLinkedlistContext {
    return {};
  },
  analyze(_context: JavaArraylistVsLinkedlistContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // v0.21.2: Java-only rule. The `new LinkedList<>` regex would
    // also match TypeScript / JavaScript / generic identifier names
    // that contain "LinkedList" as a substring. Gating by extension
    // keeps the rule a clean Java signal.
    if (!/\.java$/i.test(facts.filePath)) return issues;

    let m: RegExpExecArray | null;
    NEW_LINKED_LIST_REGEX.lastIndex = 0;
    while ((m = NEW_LINKED_LIST_REGEX.exec(source)) !== null) {
      const line = source.slice(0, m.index).split('\n').length;
      issues.push({
        ruleId: 'java/arraylist-vs-linkedlist',
        category: 'typo',
        severity: 'low',
        aiSpecific: true,
        message:
          `new LinkedList at line ${line} — use ArrayList instead`,
        line,
        column: 1,
        advice:
          'Replace `new LinkedList<>()` with `new ArrayList<>()`. LinkedList is ' +
          'rarely the right choice (worse cache locality, 5x more memory per ' +
          'element, O(n) indexed access). Joshua Bloch (Effective Java, Item 28) ' +
          'recommends ArrayList unless you specifically need a Deque. ' +
          'AI agents default to LinkedList because of textbook examples. ' +
          'Reference: java/arraylist-vs-linkedlist v0.20.',
      });
    }
    return issues;
  },
});

export default javaArraylistVsLinkedlistRule satisfies Rule<JavaArraylistVsLinkedlistContext>;
