/**
 * Rule: java/immutable-collection-preference
 *
 * `List.of(...)` / `Map.of(...)` / `Set.of(...)` (immutable factory
 * methods, Java 9+) used 5+ times in a file with < 1 `new ArrayList<>`
 * call. AI agents default to immutable factory methods because their
 * training data emphasizes functional-style Java. Human code often
 * needs mutable collections (e.g., for `.add(...)` later).
 *
 * **Why this matters:**
 * - Immutable factory methods are correct; the rule flags the
 *   PREFERENCE as a stylistic signal of AI or junior code.
 * - The pattern correlates with the v0.18.9 calibration's
 *   `ai/comment-ratio` (P 67.2%) — both AI-fingerprint signals.
 * - Severity: low.
 * - Default off (DORMANT) until calibrated on v9 Java corpus.
 *
 * **Scope:** file-local. Regex on the source text.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface JavaImmutableCollectionPreferenceContext {
  /** Min number of List.of/Map.of/Set.of calls before the rule fires. Default: 5. */
  immutableThreshold: number;
  /** Max number of `new ArrayList<>()` calls to still fire. Default: 1. */
  mutableCap: number;
}

const IMMUTABLE_REGEX = /\b(List|Map|Set)\.of\s*\(/g;
const MUTABLE_REGEX = /new\s+(ArrayList|HashMap|HashSet|LinkedList|TreeMap)\s*[<(]/g;

const DEFAULT_IMMUTABLE_THRESHOLD = 5;
const DEFAULT_MUTABLE_CAP = 1;

export const javaImmutableCollectionPreferenceRule = createRule<JavaImmutableCollectionPreferenceContext>({
  id: 'java/immutable-collection-preference',
  category: 'typo',
  severity: 'low',
  aiSpecific: true,
  description: 'Immutable factory method over-use — prefer mutable when collection will be modified',
  create(_context: RuleContext): JavaImmutableCollectionPreferenceContext {
    return {
      immutableThreshold: DEFAULT_IMMUTABLE_THRESHOLD,
      mutableCap: DEFAULT_MUTABLE_CAP,
    };
  },
  analyze(context: JavaImmutableCollectionPreferenceContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    if (!/\.java$/i.test(facts.filePath)) return issues;

    IMMUTABLE_REGEX.lastIndex = 0;
    let immutableCount = 0;
    let firstIdx = 0;
    let m: RegExpExecArray | null;
    while ((m = IMMUTABLE_REGEX.exec(source)) !== null) {
      immutableCount++;
      if (firstIdx === 0) firstIdx = m.index;
    }
    if (immutableCount < context.immutableThreshold) return issues;

    MUTABLE_REGEX.lastIndex = 0;
    let mutableCount = 0;
    while ((m = MUTABLE_REGEX.exec(source)) !== null) {
      mutableCount++;
    }
    if (mutableCount > context.mutableCap) return issues;

    const line = source.slice(0, firstIdx).split('\n').length;
    issues.push({
      ruleId: 'java/immutable-collection-preference',
      category: 'typo',
      severity: 'low',
      aiSpecific: true,
      message: `${immutableCount} immutable factory calls (List/Map/Set.of) with only ${mutableCount} mutable collection — likely over-preferring immutability`,
      line,
      column: 1,
      advice:
        'Prefer mutable collections (new ArrayList<>()) when the collection will be modified later. ' +
        'AI agents default to List.of/Map.of/Set.of because their training data emphasizes ' +
        'functional-style Java. Reference: java/immutable-collection-preference v0.26.0.',
    });
    return issues;
  },
});

export default javaImmutableCollectionPreferenceRule satisfies Rule<JavaImmutableCollectionPreferenceContext>;
