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
  // v0.21.0: defaultOff until the visitor's `isReferenced` is
  // verified. The v0.21.0 self-scan fires 314 times across 120 files
  // with 102 concentrated in cli/program.ts — most of which are
  // legitimate `import { foo, bar, baz } from '...'` statements that
  // ARE referenced later in the file. The walk-and-collect in
  // dispatch.ts:549 adds identifiers to `referencedNames`, but the
  // 102-fire concentration is a strong signal that the binding
  // name vs. reference-name matching is wrong somewhere. Investigate
  // before re-enabling. Opt in via
  // `rules: { 'dead/unused-import': 'low' }` in slopbrick.config.mjs
  // once the visitor bug is fixed.
  defaultOff: true,
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

    // v0.18.9 — Rust path. The JS visitor's `deadCode.bindings` is
    // unpopulated for `.rs` files (swc can't parse Rust), so a
    // separately-derived "isReferenced" map is constructed from
    // `facts.v2.rustFile.functions` + `_source` (a simple identifier
    // scan over the source) and used to filter. Cross-file
    // references aren't tracked; only in-file usage is.
    if (facts.v2.rustFile) {
      // Strip `use ...;` lines from the source before scanning so an
      // imported identifier doesn't count as its own reference.
      const strippedSource = stripUseDeclarations(facts.v2._source ?? '');
      const referenced = collectRustReferencedNames(strippedSource);
      for (const imp of facts.v2.rustFile.imports) {
        for (const nameEntry of imp.names) {
          if (referenced.has(nameEntry.name)) continue;
          const source = ` from '${imp.path}'`;
          issues.push({
            ruleId: 'dead/unused-import',
            category: 'logic',
            severity: 'low',
            aiSpecific: true,
            message: `Unused import: '${nameEntry.name}'${source}`,
            line: imp.line,
            column: imp.column,
            advice: `Remove the '${imp.path}' import or use '${nameEntry.name}' somewhere in the file. ` +
              `Rust's compiler only flags unused imports per module — the tree-sitter-backed ` +
              `walker here surfaces them for slopbrick's dead-code rules regardless of ` +
              `#[allow(unused_imports)].`,
          });
        }
        // Glob imports have no `names` to flag — they pull everything
        // in, so a missing reference can't be detected per-name.
      }
    }

    return issues;
  },
});

/**
 * v0.18.9 — collect every identifier-like token in the Rust source
 * MINUS the `use ...;` declarations. A binding's name appearing only
 * inside its own `use` line doesn't count as a real reference. The
 * approach is a regex strip + identifier scan; the same conservative
 * trade-off the JS deadCode detector uses (declared names shadow
 * used names, so the rule fires only on names that NEVER appear in
 * non-import code).
 */
function collectRustReferencedNames(source: string): Set<string> {
  const out = new Set<string>();
  for (const m of source.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g)) {
    out.add(m[1]!);
  }
  return out;
}

/**
 * Strip `use ...;` declarations AND comments from a Rust source
 * before scanning for identifier references. The carriage is
 * intentionally rough — anything more precise would require
 * re-parsing, which the v2 builder already did. The point here is
 * to exclude the imported names' own text + their textual mentions
 * in `// ...` doc comments from the reference scan. Doc comments
 * often paraphrase the import ("use std::collections::HashMap for
 * fast lookups"); they don't represent a real reference.
 */
function stripUseDeclarations(source: string): string {
  let out = source;
  // Remove `use foo::bar::{A, B};` declarations (non-greedy match
  // up to first `;`).
  out = out.replace(/^\s*use\s+[\s\S]*?;\s*$/gm, '');
  // Remove line comments (// ...).
  out = out.replace(/\/\/[^\n]*/g, '');
  // Remove block comments (/* ... */, may span lines).
  out = out.replace(/\/\*[\s\S]*?\*\//g, '');
  return out;
}

export default unusedImportRule satisfies Rule<UnusedImportContext>;
