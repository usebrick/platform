import { parseSync } from '@swc/core';
import type { Module } from '@swc/core';

/** Result of parsing source text supplied by the host. */
export interface ParseResult {
  ast: Module;
  source: string;
}

type SwcConfig = { syntax: 'typescript' | 'ecmascript' | 'flow'; jsx: boolean; tsx?: boolean };

function shouldSkipFile(filePath: string): boolean {
  const base = filePath.split('/').pop() ?? filePath;
  return base.endsWith('.d.ts') || base.endsWith('.d.mts') || base.endsWith('.d.cts');
}

function hasFlowPragma(source: string): boolean {
  return /@(?:no)?flow\b/.test(source.split('\n', 5).join('\n'));
}

function syntaxCandidates(filePath: string, source: string): SwcConfig[] {
  const base = filePath.split('/').pop() ?? filePath;
  const lastDot = base.lastIndexOf('.');
  const ext = lastDot >= 0 ? base.slice(lastDot + 1).toLowerCase() : '';
  const isFlowPragma = hasFlowPragma(source);

  switch (ext) {
    case 'ts': case 'mts': case 'cts':
      return [{ syntax: 'typescript', jsx: false, tsx: false }, { syntax: 'flow', jsx: false }];
    case 'tsx': case 'mtsx':
      return [{ syntax: 'typescript', jsx: false, tsx: true }];
    case 'jsx':
      return [{ syntax: isFlowPragma ? 'flow' : 'ecmascript', jsx: true }, { syntax: 'ecmascript', jsx: true }];
    case 'js': case 'cjs': case 'mjs':
      return isFlowPragma
        ? [
            { syntax: 'flow', jsx: true }, { syntax: 'flow', jsx: false },
            { syntax: 'ecmascript', jsx: true }, { syntax: 'ecmascript', jsx: false },
          ]
        : [
            { syntax: 'ecmascript', jsx: true }, { syntax: 'ecmascript', jsx: false },
            { syntax: 'typescript', jsx: true }, { syntax: 'typescript', jsx: false, tsx: false },
          ];
    default:
      return [
        { syntax: 'typescript', jsx: false, tsx: true }, { syntax: 'typescript', jsx: false, tsx: false },
        { syntax: 'ecmascript', jsx: true }, { syntax: 'ecmascript', jsx: false }, { syntax: 'flow', jsx: true },
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
    if (char === '\n') line++;
    else if (char === '\r') {
      if (i + 1 < source.length && source[i + 1] === '\n') i++;
      line++;
    }
  }
  return line;
}

function extractScriptBlock(source: string): { openTag: string; content: string } | undefined {
  const match = source.match(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/i);
  if (!match || match.index === undefined) return undefined;
  const openTag = `<script${match[1] ?? ''}>`;
  const line = lineNumberOf(source, match.index + openTag.length);
  return { openTag, content: `${'\n'.repeat(line - 1)}${match[2]}` };
}

function isTypeScriptScript(openTag: string): boolean {
  return /\blang\s*=\s*["']?ts["']?/i.test(openTag);
}

function parseWithSwc(source: string, filePath: string): ParseResult {
  if (shouldSkipFile(filePath)) return { ast: emptyModule(), source };
  let lastError: Error | undefined;
  for (const cfg of syntaxCandidates(filePath, source)) {
    try {
      return { ast: parseSync(source, { ...cfg, target: 'es2022' }), source };
    } catch (error) {
      lastError = error as Error;
    }
  }
  throw lastError ?? new Error('parse failed: no candidate matched');
}

function parseBlankModule(source: string, tsx = false): ParseResult {
  const ast = parseSync(source.replace(/[^\r\n]/g, ' '), {
    syntax: 'typescript', tsx, target: 'es2022',
  });
  return { ast, source };
}

function parseScriptContent(content: string, isTypeScript: boolean): Module {
  return parseSync(content, isTypeScript
    ? { syntax: 'typescript', target: 'es2022' }
    : { syntax: 'ecmascript', jsx: false, target: 'es2022' });
}

function parseScriptTemplate(source: string): ParseResult {
  const script = extractScriptBlock(source);
  if (!script) return { ast: emptyModule(), source };
  return { ast: parseScriptContent(script.content, isTypeScriptScript(script.openTag)), source };
}

/**
 * Parse host-provided source without filesystem, discovery, process, or
 * console side effects. Filesystem callers use the root `parseFile` adapter.
 */
export function parseSource(source: string, filePath: string): ParseResult {
  const base = filePath.split('/').pop() ?? filePath;
  const lastDot = base.lastIndexOf('.');
  const ext = lastDot >= 0 ? base.slice(lastDot + 1).toLowerCase() : '';
  if (shouldSkipFile(filePath)) return { ast: emptyModule(), source };

  switch (ext) {
    case 'astro': case 'html': return parseBlankModule(source, true);
    case 'vue': case 'svelte': return parseScriptTemplate(source);
    case 'py': case 'go': case 'rs': case 'java': case 'kt': case 'kts':
    case 'swift': case 'cpp': case 'cc': case 'cxx': case 'c': case 'h':
    case 'hpp': case 'hxx': case 'cs': case 'dart': case 'rb': case 'php':
      return parseBlankModule(source);
    default: return parseWithSwc(source, filePath);
  }
}
