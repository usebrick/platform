/**
 * Rule: dead/unused-import
 *
 * ES module imports that are never referenced in the file. The most
 * common signature of AI-iteration rot: the model adds an import when
 * it introduces a feature, then rewrites the function later without
 * removing the import that the new code doesn't need.
 *
 * **Empirical observation:**
 * - The pattern is the textbook "unused import" that tsc's
 *   `noUnusedLocals` flag (when enabled) and ESLint's `no-unused-vars`
 *   flag catch. slopbrick reports it because most real-world
 *   tsconfig.json has these flags off (so the lint never fires), and
 *   because the dead-import is often the canary that hints at the
 *   dead function/class right below it.
 * - v8 calibration (planned for v0.18.8) will measure the AI vs
 *   human lift. The directional signal is clear: human codebases
 *   with `noUnusedLocals: true` simply never carry these; AI
 *   codebases carry them in proportion to how much the model has
 *   rewritten itself.
 * - Severity: low (cosmetic, not a bug). Default-on because false
 *   positives are rare (a binding that is never referenced is
 *   almost always intentional dead code or a typo).
 *
 * Companion rules (v0.18.5b, deferred):
 *   - dead/unused-local     — `let`/`const`/`var` bindings never read
 *   - dead/unused-parameter — function params never read (skip `_` prefix)
 *   - dead/dead-branch      — `if (true)` / `if (false)` literal conditions
 *   - dead/unreachable      — statements after `return`/`throw` at fn top
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface UnusedImportContext {
  // No configuration needed.
}

export const unusedImportRule = createRule<UnusedImportContext>({
  id: 'dead/unused-import',
  category: 'logic',
  severity: 'low',
  aiSpecific: true,
  description: 'ES module import is never referenced in the file',
  create(_context: RuleContext): UnusedImportContext {
    return {};
  },
  analyze(_context: UnusedImportContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    if (!facts.v2) return issues;

    for (const binding of facts.v2.deadCode.bindings) {
      // Only emit for the import-* kinds. Local variable / parameter
      // bindings will get their own rules in v0.18.5b.
      if (
        binding.kind !== 'import-specifier' &&
        binding.kind !== 'import-default' &&
        binding.kind !== 'import-namespace'
      ) {
        continue;
      }
      // Skip `import type { X }` style imports — the AST node is the
      // same, but the type checker already removes these. slopbrick
      // doesn't distinguish type-only from value imports at parse time
      // (the ast-grep grammar lumps them together), but the
      // referenced-name walk still treats a type reference as a
      // reference, so we only see true unused imports here.
      //
      // Skip if the binding is referenced.
      if (binding.isReferenced) continue;
      // Skip side-effect-only imports (`import './foo'`). These
      // intentionally have no specifiers.
      if (!binding.name) continue;
      // Skip type-only and re-export bindings. The visitor doesn't
      // tag `export type { X } from '...'` (those flow through
      // ExportNamedDeclaration, not ImportDeclaration) so the only
      // way we see them here is if they are *also* imported, which
      // would mean they are referenced. In practice the visitor
      // misses the `import type` syntax because the parser treats
      // the whole `import type { X }` as a type-only statement and
      // the binding name still appears as an Identifier later when
      // the file uses X as a type. Since the deadCode builder only
      // reports isReferenced = false, the type-only case is rare.
      // We just emit the issue and let the user ignore it.
      const source = binding.source ? ` from '${binding.source}'` : '';
      issues.push({
        ruleId: 'dead/unused-import',
        category: 'logic',
        severity: 'low',
        aiSpecific: true,
        message: `Unused import: '${binding.name}'${source}`,
        line: binding.line,
        column: binding.column,
        advice: `Remove the import or use '${binding.name}' somewhere in the file. ` +
          `This is the most common AI-iteration rot — the model added the import ` +
          `when it introduced a feature, then rewrote the function without cleaning up.`,
      });
    }

    return issues;
  },
});

export default unusedImportRule satisfies Rule<UnusedImportContext>;
