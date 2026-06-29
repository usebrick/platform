// Rule: test/missing-edge-case (opt-in)
//
// Per Myers, G. J. (1979), *The Art of Software Testing*, Wiley-Interscience (canonical boundary value analysis reference); Beizer, B. (1990), *Software Testing Techniques*, 2nd ed., Van Nostrand Reinhold.
//
// Catches production-code branches (if/else, try/catch, ternary, ??)
// whose function has no test coverage for the alternate path. AI test
// generation favors the happy path and forgets else-branches, catch
// blocks, and nullish-coalescing fallbacks.
//
// v1 ships an in-file version: walks the production file's SWC AST,
// extracts every branch location + kind + function name, then searches
// the test file inventory for any test name that mentions the
// function. If no test file mentions the function, every branch
// fires. Cross-file correlation reuses the project-wide file list
// passed in via RuleContext (the engine already collects it).
//
// This rule is OPT-IN via `config.testIntelligence.missingEdgeCase = true`
// (default: false). Reason: walking production AST and correlating
// with tests is noisier than the other three rules. A user who has
// already trimmed their branch coverage wants this signal; a user
// running an exploratory scan does not.
//
// Severity: high. aiSpecific: true.

import { parseSync } from '@swc/core';
import type { Module } from '@swc/core';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

// SWC node types are not exported by a first-party types package in
// this project, so we rely on duck-typed local interfaces. Each
// interface describes only the fields the visitor actually reads.
interface SwcSpan {
  start: number;
  end: number;
  ctxt?: number;
}
interface SwcBase {
  type: string;
  span?: SwcSpan;
}
interface SwcIfStatement extends SwcBase {
  type: 'IfStatement';
  test: unknown;
  consequent: unknown;
  alternate?: unknown;
}
interface SwcTryStatement extends SwcBase {
  type: 'TryStatement';
  block: unknown;
  handler?: unknown;
  finalizer?: unknown;
}
interface SwcConditionalExpression extends SwcBase {
  type: 'ConditionalExpression';
  test: unknown;
  consequent: unknown;
  alternate: unknown;
}
interface SwcBinaryExpression extends SwcBase {
  type: 'BinaryExpression';
  operator: string;
  left: unknown;
  right: unknown;
}
interface SwcSwitchCase extends SwcBase {
  type: 'SwitchCase';
  test?: unknown;
  consequent: unknown[];
}
interface SwcSwitchStatement extends SwcBase {
  type: 'SwitchStatement';
  discriminant: unknown;
  cases: SwcSwitchCase[];
}
interface SwcFunctionDeclaration extends SwcBase {
  type: 'FunctionDeclaration';
  identifier: { value?: string } | null;
  params: unknown[];
  body: unknown;
}
interface SwcFunctionExpression extends SwcBase {
  type: 'FunctionExpression';
  params: unknown[];
  body: unknown;
}
interface SwcArrowFunctionExpression extends SwcBase {
  type: 'ArrowFunctionExpression';
  params: unknown[];
  body: unknown;
}
interface SwcMethodDefinition extends SwcBase {
  type: 'MethodDefinition';
  key: unknown;
  value: unknown;
}
interface SwcClassDeclaration extends SwcBase {
  type: 'ClassDeclaration';
  identifier: { value?: string } | null;
  body: unknown[];
}
interface SwcClassExpression extends SwcBase {
  type: 'ClassExpression';
  body: unknown[];
}
interface SwcVariableDeclarator extends SwcBase {
  type: 'VariableDeclarator';
  id: unknown;
  init: unknown;
}

export interface MissingEdgeCaseContext {
  /** File path of the production file under scan. */
  filePath: string;
  /** cwd, used to resolve absolute paths. */
  cwd: string;
  /** Whether the rule is opt-in enabled. */
  enabled: boolean;
  /**
   * Pre-read test file contents (absolute path → source text), captured
   * in `create()` once per file. Empty when the opt-in flag is off.
   *
   * The rule contract requires `analyze(context, facts)` to be pure —
   * no filesystem I/O. We do the test-file walk + read in `create()`,
   * which the engine invokes once per scanned file, and consume the
   * preloaded sources in `analyze()`.
   */
  testFileSources: Map<string, string>;
}

interface BranchDescriptor {
  /** Kind of branch: if-else, try-catch, ternary, switch, ??-coalesce. */
  kind: 'if' | 'else' | 'catch' | 'ternary' | 'switch-case' | 'nullish-coalesce';
  /** 1-based line number of the branch start. */
  line: number;
  /** 1-based column number. */
  column: number;
  /** The enclosing function / class name (best-effort). */
  enclosingName: string;
  /** Short text preview (≤ 40 chars) of the branch. */
  preview: string;
}

const MAX_PER_FILE = 20;

export const missingEdgeCaseRule = createRule<MissingEdgeCaseContext>({
  id: 'test/missing-edge-case',
  category: 'test',
  severity: 'high',
  aiSpecific: true,
  description:
    'Production branch (if/else, try/catch, ternary, ?? fallback) has no corresponding test. Opt-in via testIntelligence.missingEdgeCase.',
  create(context): MissingEdgeCaseContext {
    const cwd = context.cwd || process.cwd();
    // The `enabled` flag is captured from config but the analyzer also
    // checks `facts.v2.file.path` so test files short-circuit cheaply.
    const enabled = Boolean(context.config.testIntelligence?.missingEdgeCase);
    if (!enabled) {
      return {
        filePath: context.filePath,
        cwd,
        enabled,
        testFileSources: new Map(),
      };
    }
    // Discover + read test files ONCE per file so `analyze()` stays
    // pure (no I/O). The rule contract requires `analyze(context, facts)`
    // to derive issues from pre-extracted facts only; cross-file test
    // correlation is captured here, in `create()`.
    const testFileSources = new Map<string, string>();
    for (const testFile of discoverTestFiles(cwd)) {
      try {
        testFileSources.set(testFile, readFileSync(testFile, 'utf-8'));
      } catch {
        // Unreadable test file — skip silently. Cross-file correlation
        // is best-effort; missing one file just means one fewer signal.
      }
    }
    return {
      filePath: context.filePath,
      cwd,
      enabled,
      testFileSources,
    };
  },
  analyze(context, facts: ScanFacts): Issue[] {
    if (!context.enabled) return [];
    const issues: Issue[] = [];
    const filePath = facts.v2.file.path;
    // Production files only — this rule walks the production AST.
    if (/\.(test|spec)\.[jt]sx?$/.test(filePath)) return issues;
    if (/(^|\/)__tests__\//.test(filePath)) return issues;

    // The engine already read the file once (in `scanFile`) and caches
    // the source on `facts.v2._source`. Reusing that keeps `analyze()`
    // pure (no I/O). `parseSync` on the in-memory source is pure
    // computation — no filesystem access.
    const source = facts.v2._source;
    if (!source) return issues;

    let ast: Module;
    try {
      ast = parseSync(source, {
        syntax: 'typescript',
        tsx: filePath.endsWith('tsx') || filePath.endsWith('jsx'),
        target: 'es2022',
      });
    } catch {
      return issues;
    }

    const branches = collectBranches(ast, source);
    if (branches.length === 0) return issues;

    // Test names that mention ANY of the enclosing function names — if
    // any matches, the file as a whole is "covered" and we don't fire
    // for its branches. This is intentionally coarse: a fully-tested
    // function suppresses the rule; a function with no test at all
    // fires for every branch. The preloaded sources come from `create()`.
    const exportedNames = new Set(
      branches.map((b) => b.enclosingName).filter((n) => n.length > 0),
    );
    const coveredNames = coveredFunctionNames(
      exportedNames,
      context.testFileSources,
      context.cwd,
    );

    let fired = 0;
    for (const branch of branches) {
      if (fired >= MAX_PER_FILE) break;
      if (coveredNames.has(branch.enclosingName)) continue;
      issues.push({
        ruleId: 'test/missing-edge-case',
        category: 'test',
        severity: 'high',
        aiSpecific: true,
        message:
          `Branch at line ${branch.line} (${branch.kind}: '${branch.preview}') ` +
          `in '${branch.enclosingName || '<anonymous>'}' has no corresponding test. ` +
          `Add a test for the alternate path.`,
        line: branch.line,
        column: branch.column,
        advice:
          `Add a test case for '${branch.enclosingName || 'this function'}' ` +
          `that exercises the ${branch.kind} path.`,
      });
      fired++;
    }
    return issues;
  },
});

// ---------------------------------------------------------------------------
// Branch extraction (SWC AST walk)
// ---------------------------------------------------------------------------

/**
 * Walk a parsed SWC AST and emit a BranchDescriptor for every control-
 * flow branch we care about. Best-effort enclosing-name tracking uses
 * a stack; we resolve names from VariableDeclarator / FunctionDeclaration
 * / ClassDeclaration / MethodDefinition and stick them on the AST
 * stack so child nodes know their context.
 */
function collectBranches(ast: Module, source: string): BranchDescriptor[] {
  const branches: BranchDescriptor[] = [];
  const nameStack: string[] = [];
  const FILE_SPAN = ast.span ?? { start: 0, end: 0, ctxt: 0 };

  function pushName(name: string, body: () => void) {
    nameStack.push(name);
    try {
      body();
    } finally {
      nameStack.pop();
    }
  }

  function spanOf(node: unknown): SwcSpan | undefined {
    return (node as { span?: SwcSpan } | undefined)?.span;
  }

  function lineCol(idx: number): { line: number; column: number } {
    let line = 1;
    let lastNl = -1;
    for (let i = 0; i < idx && i < source.length; i++) {
      if (source.charCodeAt(i) === 10) {
        line++;
        lastNl = i;
      }
    }
    return { line, column: idx - lastNl };
  }

  function emit(kind: BranchDescriptor['kind'], node: unknown, preview: string) {
    const span = spanOf(node);
    if (!span) return;
    const { line, column } = lineCol(span.start);
    branches.push({
      kind,
      line,
      column,
      enclosingName: nameStack[nameStack.length - 1] ?? '',
      preview,
    });
  }

  function previewOf(start: number, end: number): string {
    const raw = source.slice(start, Math.min(end, start + 60));
    return raw.replace(/\s+/g, ' ').slice(0, 60).trim();
  }

  /**
   * Helper: extract start/end from any node's optional span, or
   * return undefined when the node has no span (SWC emits
   * synthesized nodes without one). Callers short-circuit cleanly.
   */
  function emitBranch(
    kind: BranchDescriptor['kind'],
    node: { span?: SwcSpan } | undefined | null,
  ): boolean {
    if (!node || !node.span) return false;
    emit(kind, node, previewOf(node.span.start, node.span.end));
    return true;
  }

  function visit(node: unknown): void {
    if (!node || typeof node !== 'object') return;
    const n = node as SwcBase & Record<string, unknown>;

    switch (n.type) {
      case 'IfStatement': {
        const ifNode = n as unknown as SwcIfStatement;
        emitBranch('if', ifNode);
        visit(ifNode.test);
        visit(ifNode.consequent);
        if (ifNode.alternate) {
          emitBranch('else', ifNode.alternate as { span?: SwcSpan });
          visit(ifNode.alternate);
        }
        return;
      }
      case 'TryStatement': {
        const tryNode = n as unknown as SwcTryStatement;
        emitBranch('if', tryNode);
        visit(tryNode.block);
        if (tryNode.handler) {
          emitBranch('catch', tryNode.handler as { span?: SwcSpan });
          visit(tryNode.handler);
        }
        if (tryNode.finalizer) {
          visit(tryNode.finalizer);
        }
        return;
      }
      case 'ConditionalExpression': {
        const c = n as unknown as SwcConditionalExpression;
        emitBranch('ternary', c);
        visit(c.test);
        visit(c.consequent);
        visit(c.alternate);
        return;
      }
      case 'BinaryExpression': {
        const b = n as unknown as SwcBinaryExpression;
        if (b.operator === '??') {
          emitBranch('nullish-coalesce', b);
        }
        visit(b.left);
        visit(b.right);
        return;
      }
      case 'SwitchStatement': {
        const s = n as unknown as SwcSwitchStatement;
        for (const c of s.cases ?? []) {
          visitCase(c);
        }
        visit(s.discriminant);
        return;
      }
      case 'FunctionDeclaration': {
        const f = n as unknown as SwcFunctionDeclaration;
        const name = (f.identifier && f.identifier.value) || '';
        pushName(name, () => {
          for (const arg of f.params ?? []) visit(arg);
          visit(f.body);
        });
        return;
      }
      case 'FunctionExpression': {
        const f = n as unknown as SwcFunctionExpression;
        pushName('', () => {
          for (const arg of f.params ?? []) visit(arg);
          visit(f.body);
        });
        return;
      }
      case 'ArrowFunctionExpression': {
        const f = n as unknown as SwcArrowFunctionExpression;
        pushName('', () => {
          for (const arg of f.params ?? []) visit(arg);
          visit(f.body);
        });
        return;
      }
      case 'MethodDefinition': {
        const m = n as unknown as SwcMethodDefinition;
        const key = keyName(m.key);
        const klass = nameStack[nameStack.length - 1];
        const name = key ? (klass ? `${klass}.${key}` : key) : '';
        pushName(name, () => {
          visit(m.value);
        });
        return;
      }
      case 'ClassDeclaration': {
        const c = n as unknown as SwcClassDeclaration;
        const name = (c.identifier && c.identifier.value) || '';
        pushName(name, () => {
          if (Array.isArray(c.body)) {
            for (const member of c.body) visit(member);
          }
        });
        return;
      }
      case 'ClassExpression': {
        const c = n as unknown as SwcClassExpression;
        pushName('', () => {
          if (Array.isArray(c.body)) {
            for (const member of c.body) visit(member);
          }
        });
        return;
      }
      case 'VariableDeclarator': {
        const d = n as unknown as SwcVariableDeclarator;
        const name = keyName(d.id);
        pushName(name, () => {
          visit(d.init);
        });
        return;
      }
      default:
        for (const value of Object.values(n)) {
          if (Array.isArray(value)) {
            for (const item of value) visit(item);
          } else if (value && typeof value === 'object') {
            visit(value);
          }
        }
    }
  }

  function visitCase(c: SwcSwitchCase): void {
    if (!c) return;
    if (c.test) {
      emitBranch('switch-case', c);
    }
    for (const stmt of c.consequent ?? []) visit(stmt);
  }

  for (const stmt of ast.body ?? []) visit(stmt);
  void FILE_SPAN;
  return branches;
}

function keyName(key: unknown): string {
  if (!key || typeof key !== 'object') return '';
  const k = key as { type?: string; value?: string; name?: string };
  if (typeof k.value === 'string') return k.value;
  if (typeof k.name === 'string') return k.name;
  return '';
}

// ---------------------------------------------------------------------------
// Test-file discovery + name-coverage correlation
// ---------------------------------------------------------------------------

/**
 * Lightweight discovery: walk the cwd looking for any test file under
 * reasonable source roots. Returns absolute paths. We're not running the
 * full engine — we only need the names + content of test files.
 */
function discoverTestFiles(cwd: string): string[] {
  if (!cwd) return [];
  // Constrain to the same roots the engine's default include globs use.
  // We deliberately keep this small — the rule only needs a few test
  // files to decide whether ANY test exists for a function.
  const roots = ['src', 'app', 'components', 'pages', 'lib', 'tests', 'test', '__tests__'];
  const found: string[] = [];
  for (const root of roots) {
    const abs = `${cwd}/${root}`;
    if (!existsSync(abs)) continue;
    walk(abs, found, readdirSync, statSync);
    if (found.length > 200) break; // cap — we only need a sample
  }
  return found;
}

function walk(
  dir: string,
  out: string[],
  readdirSync: typeof import('node:fs').readdirSync,
  statSync: typeof import('node:fs').statSync,
): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = `${dir}/${entry}`;
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walk(full, out, readdirSync, statSync);
    } else if (stat.isFile()) {
      if (/\.(test|spec)\.[jt]sx?$/.test(entry) || /\.stories\.[jt]sx?$/.test(entry)) {
        out.push(full);
      }
    }
  }
}

/**
 * For each production-function name, return whether ANY test file
 * references it (in describe / test / it labels or via imports).
 *
 * Pure: takes a preloaded map of test-file paths to their source text
 * (captured by `create()`); does not perform filesystem I/O.
 */
function coveredFunctionNames(
  names: Set<string>,
  testFileSources: Map<string, string>,
  cwd: string,
): Set<string> {
  const covered = new Set<string>();
  if (names.size === 0 || testFileSources.size === 0) return covered;
  for (const [testFile, source] of testFileSources) {
    const testRel = testFile.startsWith(cwd) ? testFile.slice(cwd.length) : testFile;
    for (const name of names) {
      if (!name) continue;
      if (
        source.includes(name) ||
        source.includes(name.replace(/^X\./, '')) ||
        // Same-basename reference: test file like `foo.test.ts` likely
        // tests the sibling `foo.ts`.
        testRel.includes(`/${name}.`)
      ) {
        covered.add(name);
      }
    }
  }
  return covered;
}

// Re-export so consumers can import the SWC node types if they need
// them. Keeps the file self-contained without leaking utility code.
export type { SwcBase };
export default missingEdgeCaseRule satisfies Rule<MissingEdgeCaseContext>;