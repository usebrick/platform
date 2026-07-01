/**
 * Rule: rust/unwrap-in-production
 *
 * `.unwrap()` and `.expect()` calls on a `Result` / `Option` value
 * that live outside of a `#[cfg(test)]` / `#[test]` scope.
 *
 * **Why this matters:**
 * - Production `.unwrap()` panics on `Err` / `None`. By convention,
 *   libraries and user-facing binaries never panic — they propagate
 *   errors via `?` / `map_err` / `anyhow`.
 * - AI agents are particularly prone to this signature: the model
 *   often writes the "happy path" with `.unwrap()` while scaffolding
 *   a feature, never replacing it with proper error handling when
 *   the user asks for production-grade code.
 * - Severity: medium. The rule is default-on because false positives
 *   are rare (most production code uses `?`) and the cost of an
 *   accidental panic in a deployed binary is high.
 *
 * **Scope:** file-local. The tree-sitter walker threads
 * `inTestConfig` from enclosing `#[cfg(test)] mod tests` blocks so
 * that test helpers containing `.unwrap()` are correctly excluded.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import {
  parseRust,
  type Tree,
  type TSNode,
} from '../../engine/parser-rust';

export interface RustUnwrapInProductionContext {
  // No configuration needed.
}

const UNWRAP_METHODS = new Set(['unwrap', 'expect', 'unwrap_or_else']);

export const rustUnwrapInProductionRule = createRule<RustUnwrapInProductionContext>({
  id: 'rust/unwrap-in-production',
  category: 'logic',
  severity: 'medium',
  aiSpecific: true,
  description: '.unwrap() / .expect() called outside of #[cfg(test)] / #[test] scope',
  create(_context: RuleContext): RustUnwrapInProductionContext {
    return {};
  },
  analyze(_context: RustUnwrapInProductionContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    if (!facts.v2?.rustFile) return issues;

    const source = facts.v2._source ?? '';
    if (!source) return issues;

    // Re-parse the source here so we can walk nested call_expression
    // nodes and check `#[cfg(test)]` / `#[test]` ancestry. We don't
    // carry the tree through `facts.v2` because the existing
    // `ExtractFacts` pipeline is JS-focused (swc) and adding a
    // tree-shaped blob to the v2 type would push tree-sitter's API
    // surface into the rule layer.
    const tree = parseRust(source);
    if (!tree) return issues;

    // Build a set of function/method names that are decorated with
    // test annotations — any unwrap inside one of them is allowed.
    const testScopes = new Set<string>();
    for (const fn of facts.v2.rustFile.functions) {
      if (fn.inTestConfig && fn.name) testScopes.add(fn.name);
    }

    collectUnwrapIssues(tree.rootNode, testScopes, issues);

    return issues;
  },
});

/**
 * Walk the tree, collecting every `call_expression` whose callee is a
 * `.unwrap()` / `.expect()` / `.unwrap_or_else()` method call, unless
 * it lives inside a function whose name is in `testScopes`.
 *
 * Test-scope detection is conservative: if the immediate enclosing
 * function_item has a `#[cfg(test)]` / `#[test]` attribute (or is
 * enclosed in a `#[cfg(test)] mod tests { ... }`), the unwrap is
 * allowed.
 */
function collectUnwrapIssues(
  node: TSNode,
  testScopes: Set<string>,
  issues: Issue[],
): void {
  if (node.type === 'call_expression') {
    const fn = node.childForFieldName('function');
    if (fn && fn.type === 'field_expression') {
      const field = fn.childForFieldName('field');
      if (field && field.type === 'field_identifier' && UNWRAP_METHODS.has(field.text)) {
        // Check the enclosing function scope.
        if (!isInsideTestFunction(node, testScopes)) {
          issues.push({
            ruleId: 'rust/unwrap-in-production',
            category: 'logic',
            severity: 'medium',
            aiSpecific: true,
            message: `'.${field.text}()' called in production code — panic risk on Err/None`,
            line: node.startPosition.row + 1,
            column: node.startPosition.column,
            advice:
              `Replace with '?' (early-return on Err), '.map_err(...)' for conversion, or ` +
              `an explicit 'match'. '.${field.text}()' is fine in tests — wrap with ` +
              `'#[cfg(test)]' or move into a '#[cfg(test)] mod tests' block to suppress.`,
          });
        }
      }
    }
  }
  // Recurse into children. Use namedChildCount to skip anonymous
  // punctuation.
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child) collectUnwrapIssues(child, testScopes, issues);
  }
}

/**
 * Walk up from `node` and check if any enclosing function_item is
 * either:
 *   1. Its name appears in `testScopes` (registered by the v2 walker
 *      because it has `#[cfg(test)]` or `#[test]` annotation or lives
 *      in a `#[cfg(test)] mod tests { ... }` block), OR
 *   2. Direct textual inspection finds a `#[test]` attribute on
 *      the immediate enclosing function_item.
 */
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

export default rustUnwrapInProductionRule satisfies Rule<RustUnwrapInProductionContext>;
