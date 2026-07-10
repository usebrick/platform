import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { parseSource, type ParseResult } from './parser-core';

export { parseSource, type ParseResult } from './parser-core';

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

/**
 * The parser's AST cache is configured via a passed option, not via
 * env vars read inside the engine. The slopbrick CLI (worker.ts) is
 * the boundary that reads `SLOP_AUDIT_CACHE` / `SLOP_AUDIT_CACHE_ROOT`
 * and threads a `ParserCacheConfig` into `parseFile`.
 *
 * Note: `parseFile` still reads the source file from disk (it has to —
 * the AST is derived from source text). The cache *wrapper* is what's
 * env-var-free; if no `cache` option is passed, caching is simply off.
 * A future refactor could accept source text as an argument to make
 * the parser fully I/O-free, but that's a larger API change.
 */
export interface ParserCacheConfig {
  /** Read/write the AST cache. */
  enabled: boolean;
  /** Root directory for the cache. */
  root: string;
}

export interface ParseFileOptions {
  cache?: ParserCacheConfig;
}

// Both files now share the same digest for the same content, which makes
// it possible to share the cache directory across parser + cache modules
// if we ever consolidate them. md5 is collision-resistant enough at the
// cache filename scale.
function hashContent(content: string): string {
  return createHash('md5').update(content, 'utf-8').digest('hex');
}

function cachePathWithRoot(content: string, root: string): string {
  return join(root, `${hashContent(content)}.json`);
}

async function readCacheWithRoot(
  filePath: string,
  content: string,
  root: string,
): Promise<ParseResult | undefined> {
  const path = cachePathWithRoot(content, root);
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

async function writeCacheWithRoot(
  content: string,
  result: ParseResult,
  root: string,
): Promise<void> {
  const path = cachePathWithRoot(content, root);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(result), 'utf8');
}

export async function parseFile(
  filePath: string,
  opts?: ParseFileOptions,
): Promise<ParseResult> {
  const source = await readFile(filePath, 'utf-8');

  // Cache is purely opt-in via `opts.cache`. No env-var fallback —
  // the slopbrick CLI boundary reads env vars and threads a
  // ParserCacheConfig; tests do the same. If no cache option is
  // passed, caching is off (source is parsed and returned).
  const cache = opts?.cache;
  const useCache = cache?.enabled === true && typeof cache.root === 'string';

  if (useCache) {
    const cached = await readCacheWithRoot(filePath, source, cache.root);
    if (cached) return cached;
  }

  const result = parseSource(source, filePath);

  if (useCache) {
    await writeCacheWithRoot(source, result, cache.root);
  }

  return result;
}
