import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { parseSync } from '@swc/core';
import type { Module } from '@swc/core';

export interface ParseResult {
  ast: Module;
  /** Refactor 3: source string the AST was parsed from. Threading it
   *  through here lets downstream consumers (extractFacts,
   *  buildArchitectureScore) skip the synchronous readFileSync they
   *  used to do. */
  source: string;
}

/**
 * v0.14.5c-fix2: handle every JS/TS dialect a real-world repo throws
 * at us. Real corpora (especially v7 — React Native, older Facebook
 * codebases, mixed TS/JS/Flow) include:
 *   - Flow type annotations in .js / .jsx (e.g. `import type {X}`)
 *   - TypeScript JSX in .tsx
 *   - TypeScript declarations in .d.ts (skipped — not source)
 *   - Mixed CommonJS (.cjs) / ESM (.mjs) / hybrid (.js)
 *   - Extension-less files (AI snippets, scripts, configs)
 *   - .cts / .mts (TypeScript ESM variants)
 *   - Files with "// @flow" / "// @noflow" pragmas
 *
 * Strategy: try the most-likely dialect first (TS > Flow > ES), then
 * fall back to alternatives on parse error. The walker / scan handles
 * backend extensions (.swift/.kt/.dart/.rs/.cpp/.java/.rb/.php) BEFORE
 * reaching this parser — so this function only sees JS-family files.
 */
type SwcConfig = { syntax: 'typescript' | 'ecmascript' | 'flow'; jsx: boolean; tsx?: boolean };

/** Quick path: skip files that aren't source (declarations only, etc.) */
function shouldSkipFile(filePath: string): boolean {
  const base = filePath.split('/').pop() ?? filePath;
  // .d.ts is TypeScript declaration-only (no runtime code); rules
  // never fire on it, and parsing it as .ts is misleading. Skip at
  // the parser layer so the worker returns 0 issues cleanly.
  if (base.endsWith('.d.ts') || base.endsWith('.d.mts') || base.endsWith('.d.cts')) {
    return true;
  }
  return false;
}

/** Detect the `// @flow` pragma in the first 5 lines. Flow files have
 *  an opt-in pragma; without it, default is non-Flow. */
function hasFlowPragma(source: string): boolean {
  const head = source.split('\n', 5).join('\n');
  return /@(?:no)?flow\b/.test(head);
}

/** Build the ordered list of parser configs to try for a given
 *  extension. The first one that parses wins. */
function syntaxCandidates(filePath: string, source: string): SwcConfig[] {
  const base = filePath.split('/').pop() ?? filePath;
  const lastDot = base.lastIndexOf('.');
  const ext = lastDot >= 0 ? base.slice(lastDot + 1).toLowerCase() : '';
  const isFlowPragma = hasFlowPragma(source);

  switch (ext) {
    case 'ts':
    case 'mts':
    case 'cts':
      return [
        { syntax: 'typescript', jsx: false, tsx: false },
        { syntax: 'flow', jsx: false },
      ];
    case 'tsx':
    case 'mtsx':  // rare but exists
      return [
        { syntax: 'typescript', jsx: false, tsx: true },
        // Flow doesn't use .tsx (Flow projects use .js with JSX); skip
      ];
    case 'jsx':
      return [
        { syntax: isFlowPragma ? 'flow' : 'ecmascript', jsx: true },
        // Fall back: if Flow pragma detection was wrong, try plain JSX
        { syntax: 'ecmascript', jsx: true },
      ];
    case 'js':
    case 'cjs':
    case 'mjs':
      // Real-world priority: Flow (React Native) > TS (mixed codebases) > JS.
      // The @flow pragma is the canonical signal.
      if (isFlowPragma) {
        return [
          { syntax: 'flow', jsx: true },   // Flow + JSX (most common)
          { syntax: 'flow', jsx: false },  // Flow without JSX
          { syntax: 'ecmascript', jsx: true },   // pragma was wrong, has JSX
          { syntax: 'ecmascript', jsx: false },  // pragma was wrong, plain JS
        ];
      }
      return [
        // Next.js / Remix / SvelteKit often put JSX in .js — try JSX first.
        { syntax: 'ecmascript', jsx: true },
        { syntax: 'ecmascript', jsx: false },
        // Last resort: maybe it's actually TypeScript inside .js (some
        // monorepos with allowJs). SWC will accept TS syntax in JS mode
        // for many cases.
        { syntax: 'typescript', jsx: true },
        { syntax: 'typescript', jsx: false, tsx: false },
      ];
    case 'mjs':
      return [
        { syntax: 'ecmascript', jsx: true },
        { syntax: 'ecmascript', jsx: false },
      ];
    default:
      // Extension-less or unknown. Try TSX → TS → JSX → JS.
      return [
        { syntax: 'typescript', jsx: false, tsx: true },
        { syntax: 'typescript', jsx: false, tsx: false },
        { syntax: 'ecmascript', jsx: true },
        { syntax: 'ecmascript', jsx: false },
        { syntax: 'flow', jsx: true },
      ];
  }
}

function emptyModule(): Module {
  return parseSync('', { syntax: 'ecmascript', target: 'es2022' });
}

function lineNumberOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    const char = source[i];
    if (char === '\n') {
      line++;
    } else if (char === '\r') {
      if (i + 1 < source.length && source[i + 1] === '\n') {
        i++;
      }
      line++;
    }
  }
  return line;
}

interface ExtractedScript {
  openTag: string;
  content: string;
}

function extractScriptBlock(source: string): ExtractedScript | undefined {
  const match = source.match(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/i);
  if (!match || match.index === undefined) return undefined;

  const attrs = match[1] ?? '';
  const openTag = `<script${attrs}>`;
  const contentStartIndex = match.index + openTag.length;
  const contentStartLine = lineNumberOf(source, contentStartIndex);
  const rawContent = match[2];
  const leadingNewlines = '\n'.repeat(contentStartLine - 1);

  return {
    openTag,
    content: `${leadingNewlines}${rawContent}`,
  };
}

function isTypeScriptScript(openTag: string): boolean {
  return /\blang\s*=\s*["']?ts["']?/i.test(openTag);
}

function parseWithSwc(content: string, filePath: string): ParseResult {
  // v0.14.5c-fix2: try each candidate dialect in order. First success
  // wins. This handles the 4 real-world failure modes:
  //   1. Flow type annotations in .js (React Native, old FB code)
  //   2. JSX in .js (Next.js app router, Remix)
  //   3. TypeScript in .js (allowJs: true in tsconfig)
  //   4. .d.ts (declaration-only, returns empty module)
  if (shouldSkipFile(filePath)) {
    return { ast: emptyModule(), source: content };
  }
  const candidates = syntaxCandidates(filePath, content);
  let lastError: Error | undefined;
  for (const cfg of candidates) {
    try {
      const ast = parseSync(content, { ...cfg, target: 'es2022' });
      return { ast, source: content };
    } catch (err) {
      lastError = err as Error;
      // try next candidate
    }
  }
  // All candidates failed. For .d.ts this is fine (declaration files
  // legitimately have stripped type-only content). For everything
  // else, surface the last error so the worker can count it.
  throw lastError ?? new Error('parse failed: no candidate matched');
}

function parseAstro(source: string): ParseResult {
  // Astro templates are HTML-like, not valid TSX. Replace every non-newline
  // character with whitespace so line/column offsets are preserved, then parse
  // the blank file as a no-op module. The visitor performs Astro-specific
  // extraction from the original source text.
  const replaced = source.replace(/[^\r\n]/g, ' ');
  const ast = parseSync(replaced, {
    syntax: 'typescript',
    tsx: true,
    target: 'es2022',
  });
  return { ast, source };
}

function parseHtml(source: string): ParseResult {
  // HTML isn't valid TSX. Mirror the Astro approach: blank-pad to preserve
  // line offsets, parse as a no-op module. The visitor performs HTML-specific
  // className + element extraction from the original source.
  const replaced = source.replace(/[^\r\n]/g, ' ');
  const ast = parseSync(replaced, {
    syntax: 'typescript',
    tsx: true,
    target: 'es2022',
  });
  return { ast, source };
}

/**
 * v0.14.5l: Parse a backend file (.py, .go) as an empty module
 * with line-preserving whitespace. Same trick as parseAstro/parseHtml.
 *
 * SWC cannot parse Python or Go. Returning an empty module lets
 * regex-only rules (markdown-leakage, comment-ratio, etc.) still
 * run on the raw source, while AST-dependent rules silently
 * produce 0 issues. This means Python/Go files now get measured
 * by the rule engine (with reduced power) instead of being skipped
 * entirely by the BACKEND_EXTENSIONS early-return.
 */
function parseBlankModule(source: string): ParseResult {
  const replaced = source.replace(/[^\r\n]/g, ' ');
  const ast = parseSync(replaced, {
    syntax: 'typescript',
    tsx: false,
    target: 'es2022',
  });
  return { ast, source: replaced };
}

function parseScriptContent(content: string, isTypeScript: boolean): Module {
  if (isTypeScript) {
    return parseSync(content, {
      syntax: 'typescript',
      target: 'es2022',
    });
  }
  return parseSync(content, {
    syntax: 'ecmascript',
    jsx: false,
    target: 'es2022',
  });
}

function parseVue(source: string): ParseResult {
  const script = extractScriptBlock(source);
  if (!script) {
    const ast = emptyModule();
    return { ast, source };
  }

  const ast = parseScriptContent(script.content, isTypeScriptScript(script.openTag));
  return { ast, source };
}

function parseSvelte(source: string): ParseResult {
  const script = extractScriptBlock(source);
  if (!script) {
    const ast = emptyModule();
    return { ast, source };
  }

  const ast = parseScriptContent(script.content, isTypeScriptScript(script.openTag));
  return { ast, source };
}

function cacheEnabled(): boolean {
  return process.env.SLOP_AUDIT_CACHE === '1' || process.env.SLOP_AUDIT_CACHE === 'true';
}

function cacheRoot(): string {
  // Round 25: allow overriding the cache directory via env var so tests
  // don't pollute the user's actual cache. Falls back to <cwd>/.slopbrick/cache/ast.
  const override = process.env.SLOP_AUDIT_CACHE_ROOT;
  if (override) return override;
  return join(process.cwd(), '.slopbrick', 'cache', 'ast');
}

// Both files now share the same digest for the same content, which makes
// it possible to share the cache directory across parser + cache modules
// if we ever consolidate them. md5 is collision-resistant enough at the
// cache filename scale.
function hashContent(content: string): string {
  return createHash('md5').update(content, 'utf-8').digest('hex');
}

function cachePath(content: string): string {
  return join(cacheRoot(), `${hashContent(content)}.json`);
}

async function readCache(filePath: string, content: string): Promise<ParseResult | undefined> {
  const path = cachePath(content);
  try {
    await access(path);
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as ParseResult;
    // nodeCount removed in v0.9.3 (Refactor 4) but cache files written by
    // older versions may still carry it. Tolerate and ignore.
    // Cache files written before Refactor 3 don't carry `source`; for
    // those, re-read the file (still O(1), and only on cache hit).
    if (parsed && parsed.ast) {
      const cachedSource = typeof parsed.source === 'string' ? parsed.source : await readFile(filePath, 'utf-8');
      return { ast: parsed.ast, source: cachedSource };
    }
  } catch {
    // Cache miss or corruption; fall through to parse.
  }
  return undefined;
}

async function writeCache(content: string, result: ParseResult): Promise<void> {
  const path = cachePath(content);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(result), 'utf8');
}

function parseSource(source: string, filePath: string): ParseResult {
  // Use basename to handle extension-less files whose last '.' may not be an
  // extension separator (e.g. file `bkg.foo__bar.tsx` → ext = "tsx").
  const base = filePath.split('/').pop() ?? filePath;
  const lastDot = base.lastIndexOf('.');
  const ext = lastDot >= 0 ? base.slice(lastDot + 1).toLowerCase() : '';

  // v0.14.5c-fix2: .d.ts is a declaration file, not source. Return an
  // empty module so the worker counts it as 0 issues (no rule fires
  // on declaration files) and the scan continues.
  if (shouldSkipFile(filePath)) {
    return { ast: emptyModule(), source };
  }

  switch (ext) {
    case 'astro':
      return parseAstro(source);
    case 'html':
      return parseHtml(source);
    case 'vue':
      return parseVue(source);
    case 'svelte':
      return parseSvelte(source);
    // v0.14.5l: backend languages we have visitors for (.py, .go)
    // but no SWC support. Return a blank-padded empty module so
    // regex-only rules can still fire (markdown-leakage, comment-
    // ratio, etc.) without burning the parseError path.
    case 'py':
    case 'go':
      return parseBlankModule(source);
    default:
      // parseWithSwc now handles all the candidate-dialect fallback
      // internally. If every candidate fails, it throws — the worker
      // counts that as a parseError, which is the right behavior for
      // genuinely broken files.
      return parseWithSwc(source, filePath);
  }
}

export async function parseFile(filePath: string): Promise<ParseResult> {
  const source = await readFile(filePath, 'utf-8');

  if (cacheEnabled()) {
    const cached = await readCache(filePath, source);
    if (cached) return cached;
  }

  const result = parseSource(source, filePath);

  if (cacheEnabled()) {
    await writeCache(source, result);
  }

  return result;
}
