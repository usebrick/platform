/**
 * Rule: java/stream-overuse
 *
 * Stream API chains with 3+ operations in a single expression
 * (3+ of `.map(`, `.filter(`, `.flatMap(`, `.collect(`, `.reduce(`,
 * `.sorted(`, `.distinct(`, `.limit(`, `.skip(`). AI agents
 * default to Stream API chains because their training data
 * emphasizes functional-style Java. Human code often finds
 * for-loops clearer for simple transformations.
 *
 * **Why this matters:**
 * - Stream chains allocate intermediate objects; for small
 *   collections, a for-loop is faster and more readable.
 * - The pattern correlates with the v0.18.9 calibration's
 *   `ai/comment-ratio` (P 67.2%) — both AI-fingerprint signals.
 * - Severity: low.
 * - Default off (DORMANT) until calibrated on v9 Java corpus.
 *
 * **Scope:** file-local. Regex on the source text.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface JavaStreamOveruseContext {
  /** Min number of stream operations in a single chain before the rule fires. Default: 3. */
  chainThreshold: number;
}

const STREAM_OPS = [
  '.map(',
  '.filter(',
  '.flatMap(',
  '.collect(',
  '.reduce(',
  '.sorted(',
  '.distinct(',
  '.limit(',
  '.skip(',
  '.anyMatch(',
  '.allMatch(',
  '.noneMatch(',
  '.findFirst(',
  '.findAny(',
];

const DEFAULT_CHAIN_THRESHOLD = 3;

export const javaStreamOveruseRule = createRule<JavaStreamOveruseContext>({
  id: 'java/stream-overuse',
  category: 'typo',
  severity: 'low',
  aiSpecific: true,
  description: 'Stream API chain over-use — for-loop is faster for simple transformations',
  create(_context: RuleContext): JavaStreamOveruseContext {
    return { chainThreshold: DEFAULT_CHAIN_THRESHOLD };
  },
  analyze(context: JavaStreamOveruseContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    if (!/\.java$/i.test(facts.filePath)) return issues;

    // For each line, count how many distinct stream operations appear.
    // If a single line has 3+ operations, the chain is the issue.
    const lines = source.split('\n');
    const streamOpPattern = new RegExp(STREAM_OPS.map((op) => op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
    let firstOffendingLine = 0;
    let firstOffendingCount = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      // Skip comments
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
      const matches = line.match(streamOpPattern);
      if (matches && matches.length >= context.chainThreshold) {
        if (firstOffendingLine === 0) {
          firstOffendingLine = i + 1;
          firstOffendingCount = matches.length;
        }
      }
    }
    if (firstOffendingLine === 0) return issues;

    issues.push({
      ruleId: 'java/stream-overuse',
      category: 'typo',
      severity: 'low',
      aiSpecific: true,
      message: `${firstOffendingCount} stream operations on a single line — for-loop is faster`,
      line: firstOffendingLine,
      column: 1,
      advice:
        'Prefer a for-loop for simple transformations. ' +
        'AI agents default to Stream API chains because their ' +
        'training data emphasizes functional-style Java. ' +
        'Stream chains allocate intermediate objects; for small ' +
        'collections, a for-loop is faster and more readable. ' +
        'Reference: java/stream-overuse v0.26.0.',
    });
    return issues;
  },
});

export default javaStreamOveruseRule satisfies Rule<JavaStreamOveruseContext>;
