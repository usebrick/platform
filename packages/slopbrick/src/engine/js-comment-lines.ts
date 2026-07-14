import type { Module } from '@swc/core';
import { sniffSourceExtension } from './source-sniff.js';

export const JS_COMMENT_LINE_METRIC_ID = 'swc-js-comment-lines-v1';

export function countNonEmptyJsLines(source: string): number {
  return buildSourceLines(Buffer.from(source, 'utf8')).filter((line) => line.nonEmpty).length;
}

interface ByteSpan {
  start: number;
  end: number;
}

interface SourceLine extends ByteSpan {
  nonEmpty: boolean;
}

const PROTECTED_NODE_TYPES = new Set([
  'StringLiteral',
  'RegExpLiteral',
  'JSXText',
  'TemplateElement',
]);

const TRUSTED_JS_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
]);

function collectProtectedSpans(ast: Module, byteLength: number): ByteSpan[] {
  const spans: ByteSpan[] = [];

  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value || typeof value !== 'object') return;

    const node = value as Record<string, unknown>;
    if (typeof node.type === 'string' && PROTECTED_NODE_TYPES.has(node.type)) {
      const span = node.span as { start?: unknown; end?: unknown } | undefined;
      if (typeof span?.start === 'number' && typeof span.end === 'number') {
        const start = Math.max(0, span.start - 1);
        const end = Math.min(byteLength, span.end - 1);
        if (end > start) spans.push({ start, end });
      }
      return;
    }

    for (const [key, child] of Object.entries(node)) {
      if (key !== 'span') visit(child);
    }
  }

  visit(ast);
  return spans;
}

function buildSourceLines(bytes: Buffer): SourceLine[] {
  const lines: SourceLine[] = [];
  let start = 0;
  let index = 0;
  while (index < bytes.length) {
    let terminatorWidth = 0;
    if (bytes[index] === 0x0a) {
      terminatorWidth = 1;
    } else if (bytes[index] === 0x0d) {
      terminatorWidth = bytes[index + 1] === 0x0a ? 2 : 1;
    } else if (
      bytes[index] === 0xe2 &&
      bytes[index + 1] === 0x80 &&
      (bytes[index + 2] === 0xa8 || bytes[index + 2] === 0xa9)
    ) {
      terminatorWidth = 3;
    }
    if (terminatorWidth === 0) {
      index++;
      continue;
    }

    lines.push({
      start,
      end: index,
      nonEmpty: bytes.subarray(start, index).toString('utf8').trim().length > 0,
    });
    index += terminatorWidth;
    start = index;
  }
  lines.push({
    start,
    end: bytes.length,
    nonEmpty: bytes.subarray(start).toString('utf8').trim().length > 0,
  });
  return lines;
}

function lineIndexAt(lines: readonly SourceLine[], offset: number): number {
  let low = 0;
  let high = lines.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >>> 1;
    if (lines[middle]!.start <= offset) low = middle;
    else high = middle - 1;
  }
  return low;
}

function markIntersectingNonEmptyLines(
  lines: readonly SourceLine[],
  markedLines: Set<number>,
  start: number,
  end: number,
): void {
  if (end <= start) return;
  const first = lineIndexAt(lines, start);
  const last = lineIndexAt(lines, end - 1);
  for (let index = first; index <= last; index++) {
    if (lines[index]?.nonEmpty) markedLines.add(index);
  }
}

function linePrefixIsWhitespace(bytes: Buffer, line: SourceLine, commentStart: number): boolean {
  return bytes.subarray(line.start, commentStart).toString('utf8').trim().length === 0;
}

/**
 * True only for identities that `parser-core.ts` routes through full-source
 * SWC parsing rather than framework extraction or blank placeholder modules.
 * SWC module spans end at the last syntax token (not trailing comments), so
 * the span is only validated as a sane range, not against the source length.
 */
export function hasFullSourceSwcCommentAst(filePath: string, ast: Module, source: string): boolean {
  const normalized = filePath.toLowerCase().replace(/[?#].*$/, '');
  const fileName = normalized.slice(normalized.lastIndexOf('/') + 1);
  if (/\.d\.(?:ts|mts|cts)$/.test(fileName)) return false;
  const dot = fileName.lastIndexOf('.');
  const extension = dot === -1 ? '' : fileName.slice(dot);
  if (extension !== '' && !TRUSTED_JS_EXTENSIONS.has(extension)) return false;
  if (extension === '') {
    const sniffed = sniffSourceExtension(source);
    if (sniffed !== '.js' && sniffed !== '.jsx' && sniffed !== '.ts' && sniffed !== '.tsx') {
      return false;
    }
  }
  const sourceEnd = Buffer.byteLength(source, 'utf8') + 1;
  return ast.span.start === 1 && ast.span.end >= 1 && ast.span.end <= sourceEnd;
}

/**
 * Count JS-family comment lines using SWC spans as lexical protection.
 * SWC spans are 1-based UTF-8 byte offsets, so this scanner operates on a
 * Buffer rather than JavaScript string indices.
 */
export function countSwcCommentLines(ast: Module, source: string): number {
  const bytes = Buffer.from(source, 'utf8');
  if (bytes.length === 0) return 0;

  const protectedBytes = new Uint8Array(bytes.length);
  for (const span of collectProtectedSpans(ast, bytes.length)) {
    protectedBytes.fill(1, span.start, span.end);
  }

  const lines = buildSourceLines(bytes);
  const markedLines = new Set<number>();
  let index = 0;

  if (bytes[0] === 0x23 && bytes[1] === 0x21) {
    markedLines.add(0);
    index = lines[0]!.end;
  }

  while (index < bytes.length) {
    if (protectedBytes[index] === 1) {
      index++;
      continue;
    }

    const current = bytes[index];
    const next = bytes[index + 1];
    const nextIsProtected = protectedBytes[index + 1] === 1;
    if (current !== 0x2f || nextIsProtected) {
      index++;
      continue;
    }

    if (next === 0x2f) {
      const lineIndex = lineIndexAt(lines, index);
      const line = lines[lineIndex]!;
      if (linePrefixIsWhitespace(bytes, line, index)) markedLines.add(lineIndex);
      index = line.end;
      continue;
    }

    if (next !== 0x2a) {
      index++;
      continue;
    }

    const commentStart = index;
    let commentEnd = bytes.length;
    let closed = false;
    for (let cursor = index + 2; cursor + 1 < bytes.length; cursor++) {
      if (
        protectedBytes[cursor] !== 1 &&
        protectedBytes[cursor + 1] !== 1 &&
        bytes[cursor] === 0x2a &&
        bytes[cursor + 1] === 0x2f
      ) {
        commentEnd = cursor + 2;
        closed = true;
        break;
      }
    }

    const firstLine = lineIndexAt(lines, commentStart);
    const lastLine = lineIndexAt(lines, Math.max(commentStart, commentEnd - 1));
    if (!closed || firstLine !== lastLine) {
      markIntersectingNonEmptyLines(lines, markedLines, commentStart, commentEnd);
    }
    index = commentEnd;
  }

  return markedLines.size;
}
