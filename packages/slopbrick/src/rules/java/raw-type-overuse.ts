/**
 * Rule: java/raw-type-overuse
 *
 * Use of raw types (`List`, `Map`, `Set`) without type parameters.
 * Java 5+ supports generics, and any raw type usage in Java 7+ code
 * is a strong signal of either legacy code or AI scaffolding. AI
 * agents default to raw types when they're unsure of the correct
 * generic parameters.
 *
 * **Why this matters:**
 * - Raw types are a code smell. They disable generic type checking
 *   and require explicit casts at every use site. Effective Java
 *   (Item 23): "Don't use raw types in new code".
 * - The pattern is a strong AI signal. Real Java code on Java 7+
 *   always uses generics.
 * - Severity: low. Raw types still compile, but the rule fires as
 *   a stylistic AI signal.
 * - Default off (DORMANT) until calibrated on v9 Java corpus.
 *
 * **Scope:** file-local. Regex on the source text. The rule flags
 * raw type usage in field declarations, local variable declarations,
 * method return types, and method parameters. It does NOT flag
 * import statements (importing `List` is fine; using `List` without
 * parameters is the issue).
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface JavaRawTypeOveruseContext {
  // No configuration.
}

// Match raw type usage on the LHS of a declaration or in a method signature.
// Look for `List<` or `Map<` or `Set<` (with type param) — these are FINE.
// The issue is `List name = ...` (no type param) or `List<>` (diamond).
// We use negative lookbehind for `>` to avoid matching `List<String>`.
//
// Examples of what we want to flag:
//   List x = new ArrayList();
//   List<String> x = new ArrayList();  // fine
//   Map m = new HashMap();
//   void foo(List x) { ... }
//   List foo() { return null; }
//
// The regex looks for type names followed by an identifier (not <) —
// captures the raw-type usage on the LHS of a declaration.
const RAW_TYPE_REGEX = /\b(List|Map|Set|Collection|Iterable)\s+(?![<A-Z])(\w+)/g;

export const javaRawTypeOveruseRule = createRule<JavaRawTypeOveruseContext>({
  id: 'java/raw-type-overuse',
  category: 'typo',
  severity: 'low',
  aiSpecific: true,
  description: 'Raw type usage (List, Map, Set) — use generics (Effective Java, Item 23)',
  create(_context: RuleContext): JavaRawTypeOveruseContext {
    return {};
  },
  analyze(_context: JavaRawTypeOveruseContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;

    let m: RegExpExecArray | null;
    RAW_TYPE_REGEX.lastIndex = 0;
    while ((m = RAW_TYPE_REGEX.exec(source)) !== null) {
      const typeName = m[1];
      const line = source.slice(0, m.index).split('\n').length;
      issues.push({
        ruleId: 'java/raw-type-overuse',
        category: 'typo',
        severity: 'low',
        aiSpecific: true,
        message:
          `Raw type ${typeName} at line ${line} — add type parameters`,
        line,
        column: 1,
        advice:
          `Replace raw \`${typeName}\` with \`${typeName}<...>\`. Raw types disable ` +
          `generic type checking. Effective Java, Item 23: 'Don't use raw types ` +
          `in new code'. AI agents default to raw types when unsure of the ` +
          `correct generic parameters. Reference: java/raw-type-overuse v0.20.`,
      });
    }
    return issues;
  },
});

export default javaRawTypeOveruseRule satisfies Rule<JavaRawTypeOveruseContext>;
