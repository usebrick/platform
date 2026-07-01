/**
 * Rule: rust/unused-pub-fn
 *
 * `pub fn` declarations that are never called within the file. The
 * Rust compiler does warn on unused private functions inside the
 * current crate, but for cross-file references (especially in
 * library crates) it stays silent on `pub` items unless the
 * `dead_code` lint is explicitly enabled.
 *
 * **Why this matters:**
 * - Public functions are part of the crate's API. AI agents that
 *   iterate on a file (adding helpers, refactoring) often leave
 *   behind `pub fn` declarations that the new code never calls.
 *   The Rust compiler can't catch these without `--warn(dead_code)`,
 *   which most crates don't set.
 * - Severity: low (cosmetic; the function is exported and might be
 *   re-exported or used by tests). Default-on because false
 *   positives are rare — a `pub fn` that doesn't appear as a
 *   reference anywhere in the file is almost always dead.
 *
 * **Scope:** file-local only. Cross-file references aren't tracked
 * here. A follow-up release (v0.19+) will analyse the workspace's
 * imported-symbol graph to suppress legitimate library exports.
 *
 * Companion rules:
 *   - rust/unwrap-in-production — `unwrap()` outside `#[cfg(test)]`
 *   - rust/todo-macro         — `todo!()` / `unimplemented!()` in prod
 *   - rust/stringly-typed     — `&str` / `String` where an enum exists
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface RustUnusedPubFnContext {
  // No configuration needed.
}

/**
 * Names that should never be flagged even when unused — trait-required
 * constructors / accessors (`new`, `from_*`, `default`, `into_*`,
 * `as_*`) are part of the public-API convention. Strip them from the
 * rule surface.
 */
const API_CONVENTION_NAMES = new Set([
  'new', 'default', 'from', 'from_str', 'from_iter', 'try_from',
  'into', 'into_iter', 'try_into', 'as_ref', 'as_mut',
  'clone', 'fmt', 'eq', 'hash', 'partial_cmp', 'cmp', 'ord', 'partial_eq',
]);

export const rustUnusedPubFnRule = createRule<RustUnusedPubFnContext>({
  id: 'rust/unused-pub-fn',
  category: 'logic',
  severity: 'low',
  aiSpecific: true,
  description: 'Public function in a Rust file that has no in-file references',
  create(_context: RuleContext): RustUnusedPubFnContext {
    return {};
  },
  analyze(_context: RustUnusedPubFnContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    if (!facts.v2?.rustFile) return issues;

    const rust = facts.v2.rustFile;
    const referenced = collectReferencedNames(facts.v2._source ?? '');

    for (const fn of rust.functions) {
      if (!fn.isPublic) continue;
      if (API_CONVENTION_NAMES.has(fn.name)) continue;
      // Test functions are part of the test harness and legitimately
      // unreferenced in the prod path.
      if (fn.inTestConfig) continue;
      // If the function name appears anywhere in the source body,
      // assume it's referenced (call site, type annotation, etc.).
      if (referenced.has(fn.name)) continue;

      issues.push({
        ruleId: 'rust/unused-pub-fn',
        category: 'logic',
        severity: 'low',
        aiSpecific: true,
        message: `Public function '${fn.name}' is not referenced anywhere in the file`,
        line: fn.line,
        column: fn.column,
        advice:
          `Remove the function or call it somewhere. Rust's compiler doesn't warn on ` +
          `pub fns missing consumers unless \`#![warn(dead_code)]\` is set at the crate ` +
          `root. AI agents that iterate on a file often leave these behind — the most ` +
          `common AI-rotation signature for Rust after unused-imports.`,
      });
    }

    return issues;
  },
});

/**
 * Return every identifier that appears in the source. Cheap
 * post-hoc scan; same trade-off as the JS deadCode detector
 * (declared names shadow used names by counting both). The
 * `isReferenced` check is conservative — we report an unused fn
 * only if its name appears nowhere, which is the strongest signal.
 */
function collectReferencedNames(source: string): Set<string> {
  const out = new Set<string>();
  for (const m of source.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g)) {
    out.add(m[1]!);
  }
  return out;
}

export default rustUnusedPubFnRule satisfies Rule<RustUnusedPubFnContext>;
