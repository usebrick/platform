/**
 * Tests for `parseRustFile` / tree-sitter integration.
 *
 * Verifies:
 *   - imports/use declarations are extracted correctly
 *   - functions, structs, traits, impls surface in the structure
 *   - `#[cfg(test)]` / `#[test]` annotations mark functions as
 *     `inTestConfig`
 */

import { describe, expect, it } from 'vitest';
import {
  parseRust,
  isRustParserAvailable,
} from '../../src/engine/parser-rust';
import { parseRustFile } from '../../src/engine/visitors/rust';

describe('Rust tree-sitter integration', () => {
  it('parser module loads', () => {
    expect(isRustParserAvailable()).toBe(true);
  });

  it('parseRust returns null for empty source', () => {
    expect(parseRust('')).toBeNull();
    expect(parseRust('   \n   ')).toBeNull();
  });

  it('parseRust returns a tree for a minimal source file', () => {
    const tree = parseRust('fn add(a: i32, b: i32) -> i32 { a + b }');
    expect(tree).not.toBeNull();
    expect(tree!.rootNode.type).toBe('source_file');
  });

  it('parseRustFile extracts imports', () => {
    const source = [
      'use std::collections::HashMap;',
      'use std::sync::Arc;',
      '',
      'fn main() {}',
    ].join('\n');
    const out = parseRustFile('/x.rs', source);
    expect(out.imports).toHaveLength(2);
    expect(out.imports[0]!.path).toContain('std::collections::HashMap');
    expect(out.imports[0]!.names[0]!.name).toBe('HashMap');
  });

  it('parseRustFile extracts a use_list with multiple names', () => {
    const source = [
      'use std::collections::{HashMap, BTreeMap};',
      'fn main() {}',
    ].join('\n');
    const out = parseRustFile('/x.rs', source);
    expect(out.imports).toHaveLength(1);
    expect(out.imports[0]!.names.map((n) => n.name)).toEqual(['HashMap', 'BTreeMap']);
  });

  it('parseRustFile extracts a pub function as public', () => {
    const source = 'pub fn greet() {}';
    const out = parseRustFile('/x.rs', source);
    expect(out.functions).toHaveLength(1);
    expect(out.functions[0]!.name).toBe('greet');
    expect(out.functions[0]!.isPublic).toBe(true);
    expect(out.functions[0]!.isMethod).toBe(false);
  });

  it('parseRustFile extracts a struct with #[derive]', () => {
    const source = [
      '#[derive(Debug, Clone)]',
      'pub struct User { id: u32 }',
    ].join('\n');
    const out = parseRustFile('/x.rs', source);
    expect(out.structs).toHaveLength(1);
    expect(out.structs[0]!.name).toBe('User');
    expect(out.structs[0]!.isPublic).toBe(true);
    expect(out.structs[0]!.derives).toEqual(['Debug', 'Clone']);
  });

  it('parseRustFile extracts a trait declaration', () => {
    const source = [
      'pub trait Speak {',
      '    fn say(&self);',
      '}',
    ].join('\n');
    const out = parseRustFile('/x.rs', source);
    expect(out.traits).toHaveLength(1);
    expect(out.traits[0]!.name).toBe('Speak');
    expect(out.traits[0]!.isPublic).toBe(true);
  });

  it('parseRustFile extracts impl blocks with their methods', () => {
    const source = [
      'pub struct Foo;',
      'impl Foo {',
      '    pub fn a(&self) {}',
      '    pub fn b(&self) {}',
      '}',
    ].join('\n');
    const out = parseRustFile('/x.rs', source);
    expect(out.impls).toHaveLength(1);
    expect(out.impls[0]!.type).toBe('Foo');
    expect(out.impls[0]!.methods).toEqual(['a', 'b']);
  });

  it('parseRustFile detects #[cfg(test)] functions as inTestConfig', () => {
    const source = [
      '#[cfg(test)]',
      'fn helper() {}',
    ].join('\n');
    const out = parseRustFile('/x.rs', source);
    expect(out.functions).toHaveLength(1);
    expect(out.functions[0]!.inTestConfig).toBe(true);
  });

  it('parseRustFile detects #[test] functions as inTestConfig', () => {
    const source = [
      '#[test]',
      'fn it_works() {}',
    ].join('\n');
    const out = parseRustFile('/x.rs', source);
    expect(out.functions).toHaveLength(1);
    expect(out.functions[0]!.inTestConfig).toBe(true);
  });

  it('parseRustFile detects inTestConfig inherited from a #[cfg(test)] mod', () => {
    const source = [
      '#[cfg(test)]',
      'mod tests {',
      '    fn helper() {}',
      '}',
    ].join('\n');
    const out = parseRustFile('/x.rs', source);
    expect(out.functions).toHaveLength(1);
    expect(out.functions[0]!.name).toBe('helper');
    expect(out.functions[0]!.inTestConfig).toBe(true);
  });

  it('parseRustFile marks methods with their receiver', () => {
    const source = [
      'pub struct Foo;',
      'impl Foo {',
      '    pub fn a(&self) {}',
      '    pub fn b(&mut self) {}',
      '    pub fn c(self) {}',
      '}',
    ].join('\n');
    const out = parseRustFile('/x.rs', source);
    expect(out.functions).toHaveLength(3);
    const [a, b, c] = out.functions;
    expect(a.isMethod).toBe(true);
    expect(a.receiver).toContain('&self');
    expect(b.receiver).toContain('&mut self');
    expect(c.receiver).toContain('self');
  });

  it('parseRustFile gracefully returns empty for an invalid source', () => {
    // tree-sitter produces a partial tree for broken syntax; the
    // extractor's type-driven dispatch should yield whatever it
    // can recognise (here: zero named items), not throw.
    const out = parseRustFile('/x.rs', 'fn oops((');
    expect(out.functions).toEqual([]);
    expect(out.imports).toEqual([]);
  });
});
