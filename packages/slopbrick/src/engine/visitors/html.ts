/**
 * Pure functions that walk HTML source text (not Astro, not React JSX)
 * and produce ElementFact records. Used by the visitor when the file
 * extension is `.html` (handled by `mergeTemplateClassNames`) or when
 * Astro's `<script>`/`<style>` skip range leaves HTML to parse.
 * Extracted from `src/engine/visitor.ts` to keep the per-framework
 * visitor pattern consistent with `templates.ts` and `react.ts`.
 */

import type { ClassNameFact, ElementFact } from '../../types';
import { findHtmlCommentRanges } from './templates';

export interface HtmlAttributeParseResult {
  attributes: Record<string, string | undefined>;
  classNames: ClassNameFact[];
  eventHandlers: string[];
}

/**
 * Parse the attribute list from an HTML tag. Unlike the Astro variant
 * in `templates.ts`, this does NOT handle `{...}` expression values
 * because plain HTML has no embedded JSX-style attributes.
 *
 * `fullTag` must include the leading `<`. `tagStartOffset` is the offset
 * of `<` in `source`.
 */
export function parseHtmlAttributes(
  fullTag: string,
  tagStartOffset: number,
  source: string,
): HtmlAttributeParseResult {
  const attributes: Record<string, string | undefined> = {};
  const classNames: ClassNameFact[] = [];
  const eventHandlers: string[] = [];

  let i = 1; // skip '<'
  while (i < fullTag.length && /[a-zA-Z0-9-]/.test(fullTag[i]!)) i++;

  while (i < fullTag.length) {
    while (i < fullTag.length && /\s/.test(fullTag[i]!)) i++;
    if (i >= fullTag.length || fullTag[i] === '>' || fullTag[i] === '/') break;

    const nameStart = i;
    while (i < fullTag.length && /[a-zA-Z0-9-:]/.test(fullTag[i]!)) i++;
    if (i === nameStart) {
      i++;
      continue;
    }
    const attrName = fullTag.slice(nameStart, i);

    while (i < fullTag.length && /\s/.test(fullTag[i]!)) i++;

    if (i < fullTag.length && fullTag[i] === '=') {
      i++; // skip '='
      while (i < fullTag.length && /\s/.test(fullTag[i]!)) i++;

      if (i >= fullTag.length) {
        attributes[attrName] = undefined;
        break;
      }

      const quote = fullTag[i];
      if (quote === '"' || quote === "'") {
        i++; // skip opening quote
        const valueStart = i;
        let value = '';
        while (i < fullTag.length && fullTag[i] !== quote) {
          value += fullTag[i];
          i++;
        }
        attributes[attrName] = value;
        if (attrName === 'class') {
          const offset = tagStartOffset + valueStart;
          classNames.push({
            value,
            line: lineOfOffset(source, offset),
            column: columnOfOffset(source, offset),
          });
        }
        if (i < fullTag.length) i++; // skip closing quote
      } else {
        // Unquoted attribute value (rare in HTML, but valid).
        const valueStart = i;
        let value = '';
        while (i < fullTag.length && !/\s/.test(fullTag[i]!) && fullTag[i] !== '>') {
          value += fullTag[i];
          i++;
        }
        attributes[attrName] = value;
        if (attrName === 'class') {
          const offset = tagStartOffset + valueStart;
          classNames.push({
            value,
            line: lineOfOffset(source, offset),
            column: columnOfOffset(source, offset),
          });
        }
      }
    } else {
      // Boolean attribute (no value).
      attributes[attrName] = undefined;
    }

    if (attrName.toLowerCase().startsWith('on')) {
      eventHandlers.push(attrName);
    }
  }

  return { attributes, classNames, eventHandlers };
}

/**
 * Walk HTML source and extract `<tag ...>` elements into facts. Skips
 * `<script>`, `<style>`, and HTML comments so their contents don't get
 * mistaken for markup.
 */
export function extractHtmlElementFacts(source: string): ElementFact[] {
  const results: ElementFact[] = [];
  const skipRanges = [
    ...findHtmlBlockRangesPublic(source, 'script'),
    ...findHtmlBlockRangesPublic(source, 'style'),
    ...findHtmlCommentRanges(source),
  ].sort((a, b) => a.start - b.start);

  let i = 0;
  while (i < source.length) {
    const lt = source.indexOf('<', i);
    if (lt === -1) break;

    const containingRange = skipRanges.find(
      (range) => lt >= range.start && lt < range.end,
    );
    if (containingRange) {
      i = containingRange.end;
      continue;
    }

    const nextChar = source[lt + 1];
    if (nextChar === '/' || nextChar === '!' || nextChar === '?') {
      i = lt + 1;
      continue;
    }

    let j = lt + 1;
    if (!/[a-zA-Z]/.test(source[j] ?? '')) {
      i = lt + 1;
      continue;
    }

    let tagName = '';
    while (j < source.length && /[a-zA-Z0-9-]/.test(source[j]!)) {
      tagName += source[j];
      j++;
    }

    // Astro components are handled by extractAstroComponents; skip here.
    if (tagName[0] === tagName[0]!.toUpperCase()) {
      i = skipPastTag(source, j);
      continue;
    }

    let tagEnd = -1;
    let inString: string | null = null;
    let braceDepth = 0;
    for (let k = j; k < source.length; k++) {
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
      if (ch === '{') {
        braceDepth++;
        continue;
      }
      if (ch === '}' && braceDepth > 0) {
        braceDepth--;
        continue;
      }
      if (ch === '>' && braceDepth === 0) {
        tagEnd = k;
        break;
      }
    }

    if (tagEnd === -1) break;

    const fullTag = source.slice(lt, tagEnd + 1);
    const { attributes, classNames, eventHandlers } = parseHtmlAttributes(
      fullTag,
      lt,
      source,
    );
    results.push({
      tag: tagName,
      attributes,
      classNames,
      eventHandlers,
      line: lineOfOffset(source, lt),
      column: columnOfOffset(source, lt),
    });

    i = tagEnd + 1;
  }

  return results;
}

/**
 * Skip past the rest of a tag (used to advance `i` when we don't want
 * to parse the rest of the opening tag).
 */
export function skipPastTag(source: string, start: number): number {
  let inString: string | null = null;
  let braceDepth = 0;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }
    if (ch === '{') {
      braceDepth++;
      continue;
    }
    if (ch === '}' && braceDepth > 0) {
      braceDepth--;
      continue;
    }
    if ((ch === '>' || ch === '/') && braceDepth === 0) {
      return i + 1;
    }
  }
  return source.length;
}

// Lightweight re-export of templates.findHtmlBlockRanges so this
// module can be used without importing from templates directly.
function findHtmlBlockRangesPublic(
  source: string,
  tag: string,
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const openPrefix = `<${tag}`;
  const closeTag = `</${tag}>`;
  let i = 0;

  while (i < source.length) {
    const openStart = source.toLowerCase().indexOf(openPrefix, i);
    if (openStart === -1) break;

    const afterOpen = openStart + openPrefix.length;
    const nextChar = source[afterOpen];
    if (
      nextChar !== ' ' &&
      nextChar !== '\t' &&
      nextChar !== '\n' &&
      nextChar !== '\r' &&
      nextChar !== '>' &&
      nextChar !== '/'
    ) {
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

function lineOfOffset(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

function columnOfOffset(source: string, offset: number): number {
  const lineStart = source.lastIndexOf('\n', offset - 1) + 1;
  return offset - lineStart + 1;
}