// Position / source-range helpers for template parsing.
//
// All of these are pure functions of source text — they don't touch
// any visitor state. They split into two groups:
//
//   1. Range finders — findAstroFrontmatterRange, findHtmlBlockRanges,
//      findScriptAndStyleRanges, findHtmlCommentRanges,
//      findAstroSkipRanges. Used by the Astro extractor to know which
//      regions of an .astro source file to skip (frontmatter, <script>,
//      <style>, comments).
//
//   2. Line / column helpers — lineNumberOf, positionFromCharOffset.
//      Convert a character offset into a 1-based (line, column) pair
//      that gets stamped on every fact we emit.
//
// SourceRange is the shape every range finder returns. It is re-
// exported below so callers don't have to import it from
// ../templates.ts.

export interface SourceRange {
  start: number;
  end: number;
}

export function findAstroFrontmatterRange(source: string): SourceRange | undefined {
  const match = source.match(/^---\r?\n[\s\S]*?\r?\n---/);
  if (!match || match.index === undefined) return undefined;
  return { start: match.index, end: match.index + match[0].length };
}

export function findHtmlBlockRanges(source: string, tag: string): SourceRange[] {
  const ranges: SourceRange[] = [];
  const openPrefix = `<${tag}`;
  const closeTag = `</${tag}>`;
  let i = 0;

  while (i < source.length) {
    const openStart = source.toLowerCase().indexOf(openPrefix, i);
    if (openStart === -1) break;

    const afterOpen = openStart + openPrefix.length;
    const nextChar = source[afterOpen];
    if (nextChar !== ' ' && nextChar !== '\t' && nextChar !== '\n' && nextChar !== '\r' && nextChar !== '>' && nextChar !== '/') {
      i = openStart + 1;
      continue;
    }

    let openEnd = -1;
    let inString: string | null = null;
    for (let k = afterOpen; k < source.length; k++) {
      const ch = source[k];
      if (inString) {
        if (ch === '\\') {
          k++;
          continue;
        }
        if (ch === inString) inString = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inString = ch;
        continue;
      }
      if (ch === '>') {
        openEnd = k + 1;
        break;
      }
    }
    if (openEnd === -1) break;

    const closeStart = source.toLowerCase().indexOf(closeTag, openEnd);
    if (closeStart === -1) break;
    const end = closeStart + closeTag.length;
    ranges.push({ start: openStart, end });
    i = end;
  }

  return ranges;
}

export function findScriptAndStyleRanges(source: string): SourceRange[] {
  return [
    ...findHtmlBlockRanges(source, 'script'),
    ...findHtmlBlockRanges(source, 'style'),
  ].sort((a, b) => a.start - b.start);
}

export function findHtmlCommentRanges(source: string): SourceRange[] {
  const ranges: SourceRange[] = [];
  const commentRegex = /<!--[\s\S]*?-->/g;
  let match: RegExpExecArray | null;
  while ((match = commentRegex.exec(source)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges;
}

export function findAstroSkipRanges(source: string): SourceRange[] {
  const ranges: SourceRange[] = [];

  const frontmatter = findAstroFrontmatterRange(source);
  if (frontmatter) ranges.push(frontmatter);

  ranges.push(...findHtmlCommentRanges(source));
  ranges.push(...findScriptAndStyleRanges(source));

  return ranges.sort((a, b) => a.start - b.start);
}

export function lineNumberOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

export function positionFromCharOffset(source: string, offset: number): { line: number; column: number } {
  const line = lineNumberOf(source, offset);
  const lineStart = source.lastIndexOf('\n', offset) + 1;
  const column = offset - lineStart + 1;
  return { line, column };
}