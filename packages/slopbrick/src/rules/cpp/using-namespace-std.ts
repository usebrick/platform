/**
 * Rule: cpp/using-namespace-std
 *
 * `using namespace std;` in a C++ header file (.h, .hpp, .hh,
 * .hxx, .H). It's harmful in headers because every consumer of
 * that header suddenly sees `vector`, `string`, `cout`, etc. in
 * their global namespace, which collides with anything they (or
 * their dependencies) already named.
 *
 * **Why this matters:**
 * - The C++ Core Guidelines (SF.6: Avoid using using namespace
 *   directives in header files; SF.7: Don't write using namespace
 *   in a header file) call this out by name.
 * - A single `using namespace std;` in a widely-included header
 *   can pull 200+ standard names into every translation unit,
 *   including downstream ones. Compilation-time name-lookup
 *   silently changes for the consumer.
 * - We deliberately restrict to headers. Inside a `.cpp` file,
 *   `using namespace std;` is a stylistic choice (most style
 *   guides still discourage it, but the impact is local to one
 *   translation unit). Inside a header, it's a public-API change.
 * - We also exclude the targeted form `using std::cout;`, which
 *   is the recommended alternative — it brings in exactly one
 *   name rather than the whole `std` namespace.
 * - Severity: medium. Public-API breakage is hard to revert
 *   once a header is shipped.
 * - Default off (DORMANT) until calibrated on v9 C++ corpus.
 *
 * **Scope:** file-local. Header-extension regex on
 *   facts.filePath; body regex for `using namespace std;`.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface CppUsingNamespaceStdContext {
  // No configuration.
}

const USING_NAMESPACE_STD_REGEX = /\busing\s+namespace\s+std\s*;/g;

export const cppUsingNamespaceStdRule = createRule<CppUsingNamespaceStdContext>({
  id: 'cpp/using-namespace-std',
  category: 'logic',
  severity: 'medium',
  aiSpecific: true,
  description:
    '`using namespace std;` in a header — pollutes every consumer. Use `using std::foo;` or qualify names.',
  create(_context: RuleContext): CppUsingNamespaceStdContext {
    return {};
  },
  analyze(_context: CppUsingNamespaceStdContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // v0.24.0: header-only. Cpp gate comes first (any C++ file),
    // but we narrow further to header extensions only.
    if (!/\.(cpp|cc|cxx|h|hpp|hh|hxx|H)$/i.test(facts.filePath)) return issues;
    if (!/\.(h|hpp|hh|hxx|H)$/i.test(facts.filePath)) return issues;

    let m: RegExpExecArray | null;
    USING_NAMESPACE_STD_REGEX.lastIndex = 0;
    while ((m = USING_NAMESPACE_STD_REGEX.exec(source)) !== null) {
      const line = source.slice(0, m.index).split('\n').length;
      issues.push({
        ruleId: 'cpp/using-namespace-std',
        category: 'logic',
        severity: 'medium',
        aiSpecific: true,
        message:
          `using namespace std; at line ${line} — pollutes every consumer of this header`,
        line,
        column: 1,
        advice:
          'Remove the directive and qualify names with `std::`, or ' +
          'use a targeted `using std::cout;` / `using std::string;` ' +
          'for the few names that recur. The C++ Core Guidelines ' +
          '(SF.6 / SF.7) explicitly forbid `using namespace` in ' +
          'header files. A single `using namespace std;` in a widely-' +
          'included header pulls 200+ names into every translation ' +
          'unit — downstream code, name-lookup, and ADL silently change. ' +
          'AI agents default to `using namespace std;` because their ' +
          'training snippets include countless copy-pasteable textbook ' +
          'examples that start with it. ' +
          'Reference: cpp/using-namespace-std v0.24.',
      });
    }
    return issues;
  },
});

export default cppUsingNamespaceStdRule satisfies Rule<CppUsingNamespaceStdContext>;
