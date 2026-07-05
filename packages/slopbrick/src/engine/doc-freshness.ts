// Documentation Drift / Doc Freshness — Phase 6 (target 0.8.0).
//
// Compares the documentation surface (markdown files) against the
// actual code surface (exported names, package dependencies, code-block
// imports) and surfaces drift — places where the docs still describe a
// system that no longer exists.
//
// v1 ships 4 rules (research-backed scope per docs/research/phase-6-doc-drift-internet-2026.md):
//   - docs/stale-package-reference      (weight 5)
//   - docs/stale-function-reference     (weight 3)
//   - docs/broken-link                  (weight 2)
//
// Two rules deferred to 0.8.x (high FP risk per IEEE 2025 survey):
//   - docs/stale-env-var-reference
//   - docs/stale-url-reference (route paths)
//
// Score formula (unchanged from the plan):
//   issueWeight = 5*p + 3*f + 4*e + 2*b
//   docFreshness = clamp(0, 100, 100 - issueWeight)
//
// Categorical bands:
//   80-100 low, 60-79 medium, 40-59 high, 0-39 critical

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { globby } from 'globby';
import type { DocFinding, DocDriftLevel, ResolvedConfig, Issue, Rule } from '../types';

import { brokenLinkRule } from '../rules/docs/broken-link';
import { staleFunctionReferenceRule } from '../rules/docs/stale-function-reference';
import { stalePackageReferenceRule } from '../rules/docs/stale-package-reference';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Per-rule weights (sum is not 1.0 — these are absolute points to
 *  subtract from the docFreshness score). */
export const DOC_RULE_WEIGHTS: Record<DocFinding['ruleId'], number> = {
  'docs/stale-package-reference': 5,
  'docs/stale-function-reference': 3,
  'docs/broken-link': 2,
};

/** Categorical boundaries on the docFreshness score. */
export const DOC_FRESHNESS_THRESHOLDS = {
  low: 80,
  medium: 60,
  high: 40,
} as const;

/** 100 most common English / JS keywords — used to filter
 *  inline-code spans before they're considered function references. */
const JS_RESERVED_AND_COMMON = new Set([
  'true', 'false', 'null', 'undefined', 'this', 'self',
  'get', 'set', 'init', 'destroy', 'value', 'key', 'id', 'name', 'data',
  'error', 'info', 'debug', 'log', 'warn', 'success', 'failure',
  'type', 'class', 'function', 'const', 'let', 'var', 'return', 'if',
  'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break',
  'continue', 'new', 'delete', 'in', 'of', 'instanceof', 'typeof',
  'void', 'throw', 'try', 'catch', 'finally', 'async', 'await',
  'import', 'export', 'from', 'as', 'default',
  'string', 'number', 'boolean', 'object', 'array', 'date', 'regexp',
  'then', 'catch', 'resolve', 'reject', 'next', 'prev', 'current',
  'index', 'count', 'length', 'size', 'width', 'height', 'top', 'left',
  'right', 'bottom', 'x', 'y', 'z', 'a', 'b', 'c', 'd', 'e', 'f', 'n',
  'i', 'j', 'k', 'item', 'items', 'result', 'response', 'request',
  'user', 'users', 'message', 'code', 'status', 'state', 'props', 'ctx',
  'context', 'config', 'options', 'params', 'args', 'event', 'target',
  'input', 'output', 'src', 'dest', 'path', 'file', 'dir', 'url',
  'header', 'body', 'token', 'auth', 'session',
  'foo', 'bar', 'baz', 'qux', 'quux',
  'react', 'node', 'next', 'vue', 'angular', 'svelte',
]);

/** Common English words that look like package names but aren't. */
const ENGLISH_WORD_DENYLIST = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'have', 'has',
  'was', 'were', 'are', 'but', 'not', 'you', 'all', 'any', 'can',
  'her', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'our',
  'out', 'own', 'say', 'she', 'too', 'use', 'via', 'who', 'why',
  'yet', 'npm', 'npx', 'pnpm', 'yarn', 'node', 'git', 'cli', 'api',
  'sdk', 'src', 'dist', 'lib', 'bin', 'doc', 'docs', 'test', 'spec',
  'todo', 'fix', 'bug', 'feat', 'refactor', 'chore', 'wip',
  'http', 'https', 'url', 'uri', 'urn', 'uuid', 'json', 'xml', 'yaml',
  'sql', 'orm', 'css', 'html', 'svg', 'png', 'jpg', 'jpeg', 'gif',
  'webp', 'pdf', 'csv', 'md', 'mdx', 'ts', 'tsx', 'js', 'jsx',
  'ok', 'no', 'yes', 'on', 'off', 'up', 'down', 'left', 'right',
]);

// ---------------------------------------------------------------------------
// Markdown parsing (minimal — no remark/micromark dep)
// ---------------------------------------------------------------------------

/**
 * Extract inline code spans from markdown. Returns the literal text +
 * 1-based line + column + the index in the source + an `inBlockComment`
 * flag set when the span falls inside a `/* ... *​/` block (the most
 * common source of false-positive identifier-references in JSDoc
 * comments).
 *
 * v0.42.0: added the inBlockComment annotation. Same path as
 * `extractMarkdownLinks` — single source pre-scan of block-comment
 * ranges (declared later in this file), binary-searched for each span.
 */
export function extractInlineCodeSpans(
  source: string,
): Array<{ text: string; line: number; column: number; index: number; inBlockComment: boolean; inComment: boolean }> {
  const hits: Array<{ text: string; line: number; column: number; index: number; inBlockComment: boolean; inComment: boolean }> = [];
  // Match a single backtick + non-newline chars + backtick.
  // We don't handle ``code with ` inside`` because that's rare in
  // the failure mode we're flagging (stale package / function name).
  const re = /`([^`\n]+?)`/g;
  // v0.42.0: scan for /* ... */ block-comment and // line-comment
  // ranges once. The helpers live in the same file (declared after
  // this function); lazy compute keeps the export order
  // human-readable.
  const blockRanges = findBlockCommentRanges(source);
  const commentLines = findCommentLineRanges(source);
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const text = m[1] ?? '';
    const upTo = source.slice(0, m.index);
    const line = upTo.split('\n').length;
    const lastNl = upTo.lastIndexOf('\n');
    const column = lastNl === -1 ? m.index + 1 : m.index - lastNl;
    hits.push({
      text,
      line,
      column,
      index: m.index,
      inBlockComment: isInBlockComment(blockRanges, m.index),
      inComment: commentLines.has(line),
    });
  }
  return hits;
}

/**
 * Extract fenced code blocks. Returns the language, the body, and the
 * 1-based line of the opening fence.
 */
export function extractFencedCodeBlocks(
  source: string,
): Array<{ lang: string; body: string; line: number; column: number }> {
  const blocks: Array<{
    lang: string;
    body: string;
    line: number;
    column: number;
  }> = [];
  const lines = source.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const fenceMatch = /^```(\w*)\s*$/.exec(line);
    if (!fenceMatch) {
      i++;
      continue;
    }
    const lang = fenceMatch[1] ?? '';
    const startLine = i + 1;
    const bodyLines: string[] = [];
    i++;
    while (i < lines.length) {
      if (/^```\s*$/.test(lines[i] ?? '')) {
        i++;
        break;
      }
      bodyLines.push(lines[i] ?? '');
      i++;
    }
    blocks.push({
      lang,
      body: bodyLines.join('\n'),
      line: startLine,
      column: 1,
    });
  }
  return blocks;
}

/**
 * Extract markdown links `[text](target)`. Returns the target + 1-based
 * line + column, plus the byte offset of the match and a flag for
 * whether the match falls inside a `/* ... *​/` block comment. Skips
 * images (those start with `!`).
 *
 * v0.42.0: the `inBlockComment` annotation lets `docs/broken-link`
 * and `docs/stale-function-reference` distinguish real prose from
 * JSDoc-regex examples like `` `[text]([^'"]+)` ``. Without this
 * signal, every regex inside a comment produces a false positive.
 */
export function extractMarkdownLinks(
  source: string,
): Array<{ target: string; line: number; column: number; index: number; inBlockComment: boolean }> {
  const hits: Array<{ target: string; line: number; column: number; index: number; inBlockComment: boolean }> = [];
  const re = /(?<!\!)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  // v0.42.0: scan the source for `/* ... */` block-comment ranges
  // once, up front. Each link's byte offset is then checked against
  // the sorted range list. Cheaper than walking character-by-character
  // inside the match loop.
  const blockRanges = findBlockCommentRanges(source);
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const target = m[2] ?? '';
    const upTo = source.slice(0, m.index);
    const line = upTo.split('\n').length;
    const lastNl = upTo.lastIndexOf('\n');
    const column = lastNl === -1 ? m.index + 1 : m.index - lastNl;
    hits.push({
      target,
      line,
      column,
      index: m.index,
      inBlockComment: isInBlockComment(blockRanges, m.index),
    });
  }
  return hits;
}

/**
 * v0.42.0: returns the sorted `[start, end)` ranges of every `/* ... *​/`
 * block comment in `source`. Handles nested block comments (a JSDoc block
 * inside an outer block) and string contents are NOT skipped here — this
 * helper intentionally tracks only comment delimiters because markdown-link
 * examples in regex-shaped JSDoc are the dominant FP source, and a regex
 * inside a string is a real per-rule concern handled elsewhere.
 */
function findBlockCommentRanges(source: string): Array<readonly [number, number]> {
  const ranges: Array<readonly [number, number]> = [];
  const stack: number[] = [];
  // v0.18.6-style scan: walk the source matching /* and */. Nested
  // block comments are uncommon but allowed in TS — the stack
  // tracks depth so the matching `*/` closes the innermost open.
  let i = 0;
  while (i < source.length) {
    // Line comment: skip to end of line. Doesn't affect block state.
    if (source[i] === '/' && source[i + 1] === '/') {
      const eol = source.indexOf('\n', i);
      i = eol === -1 ? source.length : eol + 1;
      continue;
    }
    if (source[i] === '/' && source[i + 1] === '*') {
      stack.push(i);
      i += 2;
      continue;
    }
    if (source[i] === '*' && source[i + 1] === '/' && stack.length > 0) {
      const start = stack.pop()!;
      ranges.push([start, i + 2]);
      i += 2;
      continue;
    }
    i += 1;
  }
  // Any unclosed block ranges (e.g. truncated source) don't
  // produce false negatives because we only treat ranges that have
  // a paired `*/` as "in comment" zones. Open blocks are ignored.
  ranges.sort((a, b) => a[0] - b[0]);
  return ranges;
}

function isInBlockComment(ranges: ReadonlyArray<readonly [number, number]>, pos: number): boolean {
  // Binary search over sorted ranges.
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const [start, end] = ranges[mid]!;
    if (pos < start) hi = mid - 1;
    else if (pos >= end) lo = mid + 1;
    else return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Code surface extraction
// ---------------------------------------------------------------------------

/** Extract package names from a project's `package.json`. */
export function declaredPackages(cwd: string): Set<string> {
  const out = new Set<string>();
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) return out;
  try {
    const raw = readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    for (const k of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const v = pkg[k];
      if (v && typeof v === 'object') {
        for (const name of Object.keys(v as Record<string, unknown>)) {
          out.add(name);
        }
      }
    }
  } catch {
    // Ignore — package.json is malformed, treat as no declared deps.
  }
  return out;
}

/** Recursively walk a directory's source files and extract all
 *  `export function NAME`, `export const NAME`, `export class NAME`,
 *  `export interface NAME`, `export type NAME`, and `export default NAME`. */
export async function extractExports(
  cwd: string,
  config: ResolvedConfig,
  maxFiles = 500,
): Promise<Set<string>> {
  const out = new Set<string>();
  const sourceExts = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
  const exclude = [
    '**/node_modules/**',
    '**/.next/**',
    '**/dist/**',
    '**/.git/**',
    '**/coverage/**',
  ];
  const include = config.include ?? ['src/**/*', 'app/**/*', 'lib/**/*', 'components/**/*'];
  // Build a glob that matches our include patterns + the source extensions.
  const patterns: string[] = [];
  for (const inc of include) {
    // inc might be "src/**/*" — append .ts/.tsx/.js/.jsx variants.
    for (const ext of sourceExts) {
      patterns.push(inc.replace(/\*\*?\/\*$/, `**/*${ext}`));
    }
  }
  const files = await globby(patterns, { cwd, ignore: exclude, absolute: true });
  const limited = files.slice(0, maxFiles);
  for (const abs of limited) {
    let source: string;
    try {
      source = readFileSync(abs, 'utf-8');
    } catch {
      continue;
    }
    for (const re of [
      /\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
      /\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
      /\bexport\s+class\s+([A-Za-z_$][\w$]*)/g,
      /\bexport\s+interface\s+([A-Za-z_$][\w$]*)/g,
      /\bexport\s+type\s+([A-Za-z_$][\w$]*)/g,
      /\bexport\s+default\s+(?:function\s+|class\s+)?([A-Za-z_$][\w$]*)/g,
    ]) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(source)) !== null) {
        const name = m[1] ?? '';
        if (name) out.add(name);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-rule detection
// ---------------------------------------------------------------------------

/**
 * `docs/stale-package-reference` — markdown inline code references
 * a package that isn't in `package.json` AND looks like a
 * npm-install context (`npm install X`, `import { } from 'X'`,
 * `pnpm add X`, etc.).
 *
 * Strategy: find the line containing the inline code span. Parse the
 * line for an install/import command. The token IMMEDIATELY after
 * the command keyword (`install`, `add`, `from`, `require`) is the
 * candidate package name.
 */
function detectStalePackages(
  source: string,
  relPath: string,
  packages: Set<string>,
): DocFinding[] {
  const findings: DocFinding[] = [];
  const spans = extractInlineCodeSpans(source);
  for (const span of spans) {
    const lineStart = source.lastIndexOf('\n', span.index) + 1;
    const lineEnd = source.indexOf('\n', span.index);
    const line = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd);

    // Try to extract the candidate package from the line. We support:
    //   npm install <pkg>   /  pnpm add <pkg>  /  yarn add <pkg>
    //   import ... from '<pkg>'  /  import ... from "<pkg>"
    //   require('<pkg>')  /  require("<pkg>")
    let candidate: string | undefined;
    const installMatch = /(npm\s+install|pnpm\s+add|yarn\s+add)\s+([A-Za-z0-9_./@-]+)/i.exec(line);
    if (installMatch) {
      candidate = installMatch[2];
    }
    if (!candidate) {
      const fromMatch = /from\s+['"]([^'"]+)['"]/i.exec(line);
      if (fromMatch) candidate = fromMatch[1];
    }
    if (!candidate) {
      const requireMatch = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/i.exec(line);
      if (requireMatch) candidate = requireMatch[1];
    }
    if (!candidate) continue;
    // Strip subpath: `@scope/name/sub` → `@scope/name`
    let pkgName = candidate;
    if (pkgName.startsWith('@')) {
      pkgName = pkgName.split('/').slice(0, 2).join('/');
    } else {
      pkgName = pkgName.split('/')[0] ?? pkgName;
    }
    // Must look like a package name
    if (!/^@?[a-z][a-z0-9._/-]*$/.test(pkgName)) continue;
    if (pkgName.length < 2) continue;
    if (ENGLISH_WORD_DENYLIST.has(pkgName)) continue;
    if (packages.has(pkgName)) continue;
    findings.push({
      ruleId: 'docs/stale-package-reference',
      severity: 'medium',
      docFile: relPath,
      line: span.line,
      column: span.column,
      message: `Documents \`${pkgName}\` but it is not in package.json.`,
      advice: `Add \`${pkgName}\` to package.json or update the doc to reference an installed package.`,
      package: pkgName,
    });
  }
  return findings;
}

/**
 * `docs/stale-function-reference` — markdown inline code references
 * a camelCase / PascalCase identifier that is not in the project's
 * exported names. Heuristic: the identifier must be 3+ chars, not a
 * reserved/common word, and appear in a "calling" context (preceded
 * by `(` or `(...)`).
 */
function detectStaleFunctions(
  source: string,
  relPath: string,
  exports: Set<string>,
): DocFinding[] {
  const findings: DocFinding[] = [];
  const spans = extractInlineCodeSpans(source);
  for (const span of spans) {
    const text = span.text;
    // Identifier-like: starts with letter or _, contains letters/digits/_/$
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(text)) continue;
    if (text.length < 3) continue;
    if (JS_RESERVED_AND_COMMON.has(text.toLowerCase())) continue;
    if (exports.has(text)) continue;
    // Calling context: look 50 chars after the span for `(`.
    const contextEnd = Math.min(source.length, span.column + 50);
    const contextSlice = source.slice(span.column, contextEnd);
    if (!/\(/.test(contextSlice)) continue;
    findings.push({
      ruleId: 'docs/stale-function-reference',
      severity: 'medium',
      docFile: relPath,
      line: span.line,
      column: span.column,
      message: `Documents \`${text}()\` but no such export exists.`,
      advice: `Rename the doc reference, or add a \`${text}\` wrapper export.`,
      identifier: text,
    });
  }
  return findings;
}

/**
 * `docs/broken-link` — relative link target doesn't exist. v1 skips
 * remote URLs (off by default) and `#anchor` links.
 */
function detectBrokenLinks(
  source: string,
  relPath: string,
  cwd: string,
): DocFinding[] {
  const findings: DocFinding[] = [];
  const links = extractMarkdownLinks(source);
  const docDir = dirname(join(cwd, relPath));
  for (const link of links) {
    const target = link.target;
    if (target.startsWith('http://') || target.startsWith('https://')) continue; // remote, opt-in
    if (target.startsWith('mailto:') || target.startsWith('tel:')) continue;
    if (target.startsWith('#')) continue; // anchor, can't validate easily
    if (target.startsWith('//')) continue; // protocol-relative
    if (target.startsWith('/')) continue; // absolute path, project-relative (no fs check)
    // Relative: resolve from the doc file's directory.
    const resolved = join(docDir, target);
    if (!existsSync(resolved)) {
      findings.push({
        ruleId: 'docs/broken-link',
        severity: 'low',
        docFile: relPath,
        line: link.line,
        column: link.column,
        message: `Relative link \`${target}\` does not exist.`,
        advice: `Create the file or fix the link target.`,
        link: target,
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Top-level entry points
// ---------------------------------------------------------------------------

export interface BuildDocFreshnessOptions {
  maxDocFiles?: number;
  maxSourceFiles?: number;
}

export interface BuildDocFreshnessResult {
  docFreshness: number;
  docDrift: DocDriftLevel;
  scannedDocFiles: number;
  scannedSourceFiles: number;
  findings: DocFinding[];
  byRule: Record<DocFinding['ruleId'], number>;
}

/**
 * Walk the project, detect stale references in docs, and compute the
 * docFreshness score. Pure IO — does not mutate state.
 */
export async function buildDocFreshness(
  cwd: string,
  config: ResolvedConfig,
  options: BuildDocFreshnessOptions = {},
): Promise<BuildDocFreshnessResult> {
  const maxDocFiles = options.maxDocFiles ?? 500;
  const maxSourceFiles = options.maxSourceFiles ?? 500;
  const docInclude = ['**/*.md', '**/*.mdx'];
  // CHANGELOG and LICENSE contain a lot of inline-code that looks like
  // package names (rule IDs, version numbers) — not real package
  // references. Skip them by default; users can re-enable via
  // `config.docs.include` if they want.
  const docExclude = [
    '**/node_modules/**',
    '**/.next/**',
    '**/dist/**',
    '**/CHANGELOG.md',
    '**/LICENSE.md',
    '**/CHANGES.md',
    '**/HISTORY.md',
  ];
  const docFiles = await globby(docInclude, { cwd, ignore: docExclude, absolute: true });
  const docLimited = docFiles.slice(0, maxDocFiles);

  const packages = declaredPackages(cwd);
  const exports = await extractExports(cwd, config, maxSourceFiles);

  const findings: DocFinding[] = [];
  let scanned = 0;
  for (const abs of docLimited) {
    let source: string;
    try {
      source = readFileSync(abs, 'utf-8');
    } catch {
      continue;
    }
    const relPath = relative(cwd, abs);
    // v0.17.0: call first-class Rule objects instead of internal detect* fns.
    // v0.18.7: include the package's own `name` from package.json in
    // the context so doc rules that check self-imports (e.g.
    // stale-function-reference) can resolve it without each rule
    // re-reading package.json. The engine has the authoritative
    // `packages` set; the rule's create() may add it but the
    // engine's context.plumbing is the canonical path.
    let packageName: string | undefined;
    try {
      const pkg = JSON.parse(
        readFileSync(join(cwd, 'package.json'), 'utf-8'),
      ) as { name?: string };
      packageName = pkg.name;
    } catch {
      // Ignore — package.json is malformed or missing.
    }
    const context = { config, filePath: relPath, cwd, packageName };
    const facts = { filePath: relPath, v2: { _source: source } as any };
    const ruleConfigs: Array<{ rule: Rule; ruleId: DocFinding['ruleId'] }> = [
      { rule: stalePackageReferenceRule, ruleId: 'docs/stale-package-reference' },
      { rule: staleFunctionReferenceRule, ruleId: 'docs/stale-function-reference' },
      { rule: brokenLinkRule, ruleId: 'docs/broken-link' },
    ];
    for (const { rule, ruleId } of ruleConfigs) {
      const ruleContext = rule.create(context as any);
      const issues: Issue[] = rule.analyze(ruleContext, facts as any);
      for (const issue of issues) {
        findings.push({
          ruleId: ruleId,
          severity: issue.severity,
          docFile: relPath,
          line: issue.line,
          column: issue.column,
          message: issue.message,
          advice: issue.advice ?? '',
          package: issue.extras?.package as string | undefined,
          identifier: issue.extras?.identifier as string | undefined,
          link: issue.extras?.link as string | undefined,
        });
      }
    }
    scanned++;
  }

  // Score
  const byRule: Record<DocFinding['ruleId'], number> = {
    'docs/stale-package-reference': 0,
    'docs/stale-function-reference': 0,
    'docs/broken-link': 0,
  };
  let weight = 0;
  for (const f of findings) {
    byRule[f.ruleId] = (byRule[f.ruleId] ?? 0) + 1;
    weight += DOC_RULE_WEIGHTS[f.ruleId];
  }
  const docFreshness = Math.max(0, Math.min(100, 100 - weight));
  let docDrift: DocDriftLevel = 'low';
  if (docFreshness < DOC_FRESHNESS_THRESHOLDS.high) docDrift = 'critical';
  else if (docFreshness < DOC_FRESHNESS_THRESHOLDS.medium) docDrift = 'high';
  else if (docFreshness < DOC_FRESHNESS_THRESHOLDS.low) docDrift = 'medium';

  return {
    docFreshness,
    docDrift,
    scannedDocFiles: scanned,
    scannedSourceFiles: exports.size,
    findings,
    byRule,
  };
}

/** Map a docFreshness score to the categorical drift band. */
export function docDriftFromFreshness(score: number): DocDriftLevel {
  if (score >= DOC_FRESHNESS_THRESHOLDS.low) return 'low';
  if (score >= DOC_FRESHNESS_THRESHOLDS.medium) return 'medium';
  if (score >= DOC_FRESHNESS_THRESHOLDS.high) return 'high';
  return 'critical';
}

/**
 * v0.42.0: returns a Set of 1-indexed line numbers that are inside
 * either a /* ... *​/ block comment OR a `//` line comment. Used by
 * the docs/stale-function-reference rule to skip inline-code spans
 * that are documentation examples rather than real call references.
 *
 * Performance: O(n) single pass over the source (same code path
 * as findBlockCommentRanges; share the scanning work).
 */
export function findCommentLineRanges(source: string): Set<number> {
  const out = new Set<number>();
  const stack: number[] = []; // line numbers where /* opens
  let inLineComment = false;
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNo = i + 1; // 1-indexed
    let j = 0;
    if (inLineComment) {
      out.add(lineNo);
      inLineComment = false; // line comments terminate at end-of-line
    }
    while (j < line.length) {
      const c = line[j]!;
      const next = line[j + 1];
      // Line comment: // not inside a string (rough heuristic — the
      // docs rules operate on JSDoc-style comments where strings are
      // rare; a more precise tokenization is overkill for the false-
      // positive class we're avoiding).
      if (!stack.length && c === '/' && next === '/') {
        inLineComment = true;
        out.add(lineNo);
        break;
      }
      // Block comment open.
      if (c === '/' && next === '*') {
        stack.push(lineNo);
        out.add(lineNo);
        j += 2;
        continue;
      }
      // Block comment close.
      if (c === '*' && next === '/' && stack.length > 0) {
        stack.pop();
        j += 2;
        continue;
      }
      // String literal — skip the contents so we don't miscount.
      // The docs rules don't actually fire inside string literals; this
      // avoids false negatives when a JSDoc comment happens to contain
      // // or /* in a string body.
      if (c === '"' || c === "'" || c === '`') {
        const quote = c;
        j += 1;
        while (j < line.length) {
          if (line[j] === '\\') { j += 2; continue; }
          if (line[j] === quote) { j += 1; break; }
          j += 1;
        }
        continue;
      }
      j += 1;
    }
    // If still inside an unclosed block comment, the rest of the file
    // is in comment.
    if (stack.length > 0) {
      out.add(lineNo);
    }
  }
  return out;
}
