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

function syntaxFor(filePath: string): { syntax: 'typescript' | 'ecmascript'; jsx: boolean; tsx?: boolean } {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (ext === 'ts' || ext === 'tsx') {
    return { syntax: 'typescript', jsx: false, tsx: ext === 'tsx' };
  }
  return { syntax: 'ecmascript', jsx: ext === 'jsx' };
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
  const { syntax, jsx, tsx } = syntaxFor(filePath);
  const ast = parseSync(content, {
    syntax,
    jsx,
    tsx,
    target: 'es2022',
  });
  return { ast, source: content };
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

  switch (ext) {
    case 'astro':
      return parseAstro(source);
    case 'html':
      return parseHtml(source);
    case 'vue':
      return parseVue(source);
    case 'svelte':
      return parseSvelte(source);
    default:
      try {
        return parseWithSwc(source, filePath);
      } catch (error) {
        // Many projects put JSX inside .js files (e.g. Next.js app router).
        // Retry once with JSX enabled before giving up.
        if (ext === 'js') {
          const ast = parseSync(source, {
            syntax: 'ecmascript',
            jsx: true,
            target: 'es2022',
          });
          return { ast, source };
        }
        // Extension-less file: try TSX → TS → JSX → JS in order. Most
        // AI snippets are React/TSX so this is the best first guess.
        if (ext === '') {
          for (const cfg of [
            { syntax: 'typescript' as const, jsx: true, tsx: true },
            { syntax: 'typescript' as const, jsx: false, tsx: false },
            { syntax: 'ecmascript' as const, jsx: true, tsx: false },
            { syntax: 'ecmascript' as const, jsx: false, tsx: false },
          ]) {
            try {
              const ast = parseSync(source, { ...cfg, target: 'es2022' });
              return { ast, source };
            } catch {
              // try next
            }
          }
        }
        throw error;
      }
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
