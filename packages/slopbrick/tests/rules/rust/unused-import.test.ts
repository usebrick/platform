/**
 * Tests the Rust path of `dead/unused-import` end-to-end:
 * the fixture file at tests/fixtures/dead-code/rust/unused-import.rs
 * is parsed by the tree-sitter visitor, the rule fires on the
 * unused imports, and the unused-but-used bindings stay quiet.
 *
 * The test does not invoke the full `scanFile` worker (Rust
 * short-circuits there in v0.18.8 and is wired through in
 * v0.18.10 — this fixture lives in between and exercises the
 * per-rule Rust path independently).
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unusedImportRule } from '../../../src/rules/dead/unused-import';
import { parseRustFile } from '../../../src/engine/visitors/rust';
import { isRustParserAvailable } from '../../../src/engine/parser-rust';
import type { Issue, RuleContext, ScanFacts } from '../../../src/types';

const FIXTURE = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../fixtures/dead-code/rust/unused-import.rs',
);

describe('dead/unused-import (Rust path)', () => {
  it('tree-sitter native binding loads', () => {
    expect(isRustParserAvailable()).toBe(true);
  });

  it('fires on unused Rust imports in the fixture', () => {
    const source = readFileSync(FIXTURE, 'utf8');
    const filePath = FIXTURE;
    const structure = parseRustFile(filePath, source);

    // The fixture imports 5 names (HashMap, VecDeque, BTreeMap,
    // Arc, helper_one, helper_two). The parser should surface all
    // six — including the `use crate::utils::{...}` items.
    const totalImported = structure.imports.flatMap((i) => i.names).length;
    expect(totalImported).toBeGreaterThanOrEqual(5);

    // Build a synthetic ScanFacts using the Rust path of the rule.
    // The rule reads facts.v2.rustFile + facts.v2._source and
    // identifies which imports are unreferenced by scanning the
    // source for identifier tokens.
    const facts: ScanFacts = {
      filePath,
      v2: {
        file: { path: filePath, loc: source.split('\n').length, extension: '.rs', framework: 'react' },
        imports: [],
        components: [],
        jsx: { elements: [], maxNestingDepth: 0 },
        logic: {
          hooks: [],
          stateVariables: [],
          defensiveChecks: [],
          apiCalls: [],
          logicalExpressions: [],
          keyProps: [],
          optimisticUpdates: [],
        },
        designTokens: { spacingUsage: [], colorValues: [], fontSizes: [], borderRadius: [] },
        deadCode: { bindings: [], constantConditions: [], unreachableStatements: [] },
        templateClassNames: [],
        componentSizes: [],
        astroComponents: [],
        disabledRules: [],
        rustFile: {
          imports: structure.imports,
          functions: structure.functions,
          structs: structure.structs,
          traits: structure.traits,
          impls: structure.impls,
        },
        _source: source,
      },
    };

    const ruleCtx: RuleContext = {
      config: {
        include: [],
        exclude: [],
        rules: {},
        frameworkMultipliers: {},
        ruleConfig: {},
        arbitraryValueAllowlist: [],
        wcag: { targetSizeExemptSelectors: [] },
        thresholds: { meanSlop: 0, p90Slop: 0, individualSlopThreshold: 0 },
      },
      filePath,
      cwd: process.cwd(),
    };

    const innerCtx = unusedImportRule.create(ruleCtx);
    const issues: Issue[] = unusedImportRule.analyze(innerCtx, facts);

    const messages = issues.map((i) => i.message);

    // Helper: extract the binding name from the issue message.
    // Message format: `Unused import: 'NAME' from 'PATH'`.
    const flagNames = (str: string): string | null => {
      const m = str.match(/^Unused import: '([^']+)'/);
      return m ? m[1]! : null;
    };
    const flagged = new Set(messages.map(flagNames).filter((n): n is string => Boolean(n)));

    // All three unused imports must surface.
    expect(flagged.has('VecDeque')).toBe(true);
    expect(flagged.has('BTreeMap')).toBe(true);
    expect(flagged.has('Arc')).toBe(true);
    // `HashMap` IS used — must not be flagged.
    expect(flagged.has('HashMap')).toBe(false);
    // `helper_one` IS defined as a pub fn below — must not be flagged.
    expect(flagged.has('helper_one')).toBe(false);
  });

  it('handles an empty Rust file without crashing', () => {
    const facts: ScanFacts = {
      filePath: 'empty.rs',
      v2: {
        file: { path: 'empty.rs', loc: 0, extension: '.rs', framework: 'react' },
        imports: [],
        components: [],
        jsx: { elements: [], maxNestingDepth: 0 },
        logic: {
          hooks: [], stateVariables: [], defensiveChecks: [],
          apiCalls: [], logicalExpressions: [], keyProps: [], optimisticUpdates: [],
        },
        designTokens: { spacingUsage: [], colorValues: [], fontSizes: [], borderRadius: [] },
        deadCode: { bindings: [], constantConditions: [], unreachableStatements: [] },
        templateClassNames: [],
        componentSizes: [],
        astroComponents: [],
        disabledRules: [],
        rustFile: { imports: [], functions: [], structs: [], traits: [], impls: [] },
        _source: '',
      },
    };
    const ruleCtx: RuleContext = {
      config: {
        include: [], exclude: [], rules: {}, frameworkMultipliers: {},
        ruleConfig: {}, arbitraryValueAllowlist: [],
        wcag: { targetSizeExemptSelectors: [] },
        thresholds: { meanSlop: 0, p90Slop: 0, individualSlopThreshold: 0 },
      },
      filePath: 'empty.rs',
      cwd: process.cwd(),
    };
    const innerCtx = unusedImportRule.create(ruleCtx);
    const issues = unusedImportRule.analyze(innerCtx, facts);
    expect(issues).toEqual([]);
  });
});
