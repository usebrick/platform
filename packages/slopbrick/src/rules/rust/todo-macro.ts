/**
 * Rule: rust/todo-macro
 *
 * `todo!()` / `unimplemented!()` invocations in production code.
 * Both expand to `panic!()`, so a hit at runtime crashes the
 * program. By convention they're only valid during scaffolding or
 * inside test helpers.
 *
 * **Why this matters:**
 * - AI agents frequently leave `todo!()` behind during iterative
 *   refactors: the model introduces a placeholder branch, returns
 *   elsewhere, and never fills it in. The user sees a panic in
 *   production rather than a useful "not yet implemented" stub.
 * - Severity: medium. Default-on because both macros are explicit
 *   panic-risks in any non-test context, and a missed hit at
 *   runtime is high-cost (process termination).
 *
 * **Scope:** any `macro_invocation` whose macro name is `todo!` or
 * `unimplemented!`. Test functions (those decorated with `#[test]`
 * or enclosed in `#[cfg(test)] mod tests`) are excluded via the
 * same `inTestConfig` flag the unwrap rule uses.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { parseRust } from '../../engine/parser-rust';
import type { Tree, TSNode } from '../../engine/parser-rust';

export interface RustTodoMacroContext {
  // No configuration needed.
}

const TODO_MACROS = new Set(['todo', 'unimplemented', 'todo_unimplemented']);

export const rustTodoMacroRule = createRule<RustTodoMacroContext>({
  id: 'rust/todo-macro',
  category: 'logic',
  severity: 'medium',
  aiSpecific: true,
  description: 'todo!() / unimplemented!() macro invocation in production code',
  create(_context: RuleContext): RustTodoMacroContext {
    return {};
  },
  analyze(_context: RustTodoMacroContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    if (!facts.v2?.rustFile) return issues;

    const source = facts.v2._source ?? '';
    if (!source) return issues;

    const tree = parseRust(source);
    if (!tree) return issues;

    const testScopes = new Set<string>();
    for (const fn of facts.v2.rustFile.functions) {
      if (fn.inTestConfig && fn.name) testScopes.add(fn.name);
    }

    collectMacroIssues(tree.rootNode, testScopes, issues);
    return issues;
  },
});

function collectMacroIssues(
  node: TSNode,
  testScopes: Set<string>,
  issues: Issue[],
): void {
  if (node.type === 'macro_invocation') {
    const text = node.text;
    // Node text is e.g. `todo!()` or `unimplemented!()`. Match
    // conservatively by leading macro name.
    const m = text.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
    const macroName = m?.[1] ?? '';
    if (TODO_MACROS.has(macroName)) {
      // The macro may live inside a `macro_rules!` definition body —
      // those are themselves macros and shouldn't trigger. Filter
      // by checking whether the macro is a `macro_definition`'s body.
      if (!isInsideMacroDefinition(node) && !isInsideTestFunction(node, testScopes)) {
        issues.push({
          ruleId: 'rust/todo-macro',
          category: 'logic',
          severity: 'medium',
          aiSpecific: true,
          message: `'${macroName}!()' in production code — both expand to panic!()`,
          line: node.startPosition.row + 1,
          column: node.startPosition.column,
          advice:
            `Implement the function body or remove the stub. '${macroName}!()' is fine in ` +
            `test scaffolding (#[cfg(test)]); here it is a panic risk. AI agents commonly ` +
            `leave these behind after iterative refactors when the placeholder branch is ` +
            `never filled in.`,
        });
      }
    }
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child) collectMacroIssues(child, testScopes, issues);
  }
}

function isInsideMacroDefinition(node: TSNode): boolean {
  for (let p: TSNode | null = node.parent; p; p = p.parent) {
    if (p.type === 'macro_definition') return true;
    if (p.type === 'source_file') return false;
  }
  return false;
}

function isInsideTestFunction(node: TSNode, testScopes: Set<string>): boolean {
  for (let p: TSNode | null = node.parent; p; p = p.parent) {
    if (p.type === 'function_item') {
      const nameField = p.childForFieldName('name');
      const name = nameField?.text;
      if (name && testScopes.has(name)) return true;
      if (p.text.startsWith('#[test]') || p.text.startsWith('#[cfg(test)]')) return true;
      return false;
    }
    if (p.type === 'source_file') return false;
  }
  return false;
}

export default rustTodoMacroRule satisfies Rule<RustTodoMacroContext>;
