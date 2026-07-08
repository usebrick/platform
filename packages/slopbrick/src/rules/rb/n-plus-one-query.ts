/**
 * Rule: rb/n-plus-one-query
 *
 * N+1 query pattern in ActiveRecord: looping over a parent
 * collection and querying a child association for each, causing
 * 1 + N database roundtrips when 1 (with eager loading) would do.
 *
 * **Why this matters:**
 * - In Rails, `.each { |p| p.children.each { ... } }` causes N
 *   queries for the children, one per parent.
 * - The fix is `.includes(:children)` which loads the children in
 *   2 queries total. Or `.preload(:children)` for a separate query.
 * - The Ruby style guide (rubocop/ruby-style-guide) covers this
 *   in `Rails/FindEach` and `BulletMigrations` cops.
 * - Severity: medium. N+1 is a performance issue that scales
 *   linearly with data size.
 * - Default off (DORMANT) until v10.2 Ruby corpus calibration.
 *
 * **Scope:** file-local. Regex on the source text. We look for
 * ActiveRecord association calls inside `.each` blocks, and
 * check the whole block for eager-loading calls.
 *
 * **v0.43.0: initial rule.**
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface RbNPlusOneQueryContext {
  // No configuration.
}

const EACH_BLOCK_REGEX = /\.\s*each\s*(?:\([^)]*\)|\{|\s+do)/;
const ASSOCIATION_CALL_REGEX = /\.\w+\.(?:each|map|select|find_each|find_each_with_index)\b/;
const EAGER_LOADING_REGEX = /\b(?:includes|preload|eager_load)\b/;

export const rbNPlusOneQueryRule = createRule<RbNPlusOneQueryContext>({
  id: 'rb/n-plus-one-query',
  category: 'perf',
  severity: 'medium',
  aiSpecific: false,
  description: 'N+1 query pattern in ActiveRecord — loop calls association without eager loading',
  create(context) {
    return context;
  },
  analyze(_context, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    if (!/\.rb$/i.test(facts.filePath ?? '')) return issues;

    // Walk the source tracking each/do blocks. For each, look at
    // the whole block content for either an association call or an
    // eager loading call. If both exist, it's not N+1.
    const lines = source.split('\n');
    let inEachBlock = false;
    let eachBlockStart = 0;
    let eachBlockEnd = 0;
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i] ?? '';

      if (EACH_BLOCK_REGEX.test(lineText) && /do\s*\|/.test(lineText)) {
        inEachBlock = true;
        eachBlockStart = i;
        braceDepth = 0;
      }

      if (inEachBlock) {
        braceDepth += (lineText.match(/\{/g) || []).length;
        braceDepth -= (lineText.match(/\}/g) || []).length;

        if (braceDepth <= 0 && i > eachBlockStart) {
          // End of block
          eachBlockEnd = i;
          const block = lines.slice(eachBlockStart, eachBlockEnd + 1).join('\n');

          if (ASSOCIATION_CALL_REGEX.test(block) && !(EAGER_LOADING_REGEX.test(block) || EAGER_LOADING_REGEX.test(source))) {
            issues.push({
              ruleId: 'rb/n-plus-one-query',
              category: 'perf',
              severity: 'medium',
              aiSpecific: false,
              filePath: facts.filePath ?? '',
              line: eachBlockStart + 1,
              column: 1,
              message: `N+1 query: .each block calls association without eager loading.`,
              advice: 'Use `.includes(:assoc)` (2 queries total) or `.preload(:assoc)` (1 query). For large datasets, use `.find_each(batch_size: 1000)`.',
            });
          }

          inEachBlock = false;
        }
      }
    }

    return issues;
  },
});
