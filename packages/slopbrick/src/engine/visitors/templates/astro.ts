// Astro-specific extractors + the shared parseAstroAttributes parser.
//
//   parseAstroAttributes            — quoted / expression / unquoted /
//                                     boolean attribute parser. Used by
//                                     extractAstroElementFacts and also
//                                     exposed to other consumers that
//                                     need to walk a `<tag ...>` slice.
//   extractStaticTemplateClassNames — generic HTML-class extractor
//                                     that honours skip ranges. Returns
//                                     one ClassNameFact per tag (not per
//                                     token; the visitor dedupes by
//                                     (line, column, value)).
//   extractAstroComponents          — finds every <CapitalizedTag>
//                                     in an Astro source (i.e. user
//                                     components) outside frontmatter /
//                                     script / style / comment regions,
//                                     and stamps them with hasClientDirective
//                                     + hasEventHandler.
//   extractAstroElementFacts        — finds every <lowercase-tag>
//                                     outside the skip regions and emits
//                                     an ElementFact with parsed attributes,
//                                     class names, and event handlers.
//
// All four are pure source → facts functions. They share
// positionFromCharOffset / lineNumberOf from ./positions.ts.

import type { AstroComponentFact, ClassNameFact, ElementFact } from '../../../types';
import {
  type SourceRange,
  findAstroSkipRanges,
  lineNumberOf,
  positionFromCharOffset,
} from './positions.js';

// Astro attribute parser: handles quoted (`"x"`), expression (`{x}`),
// unquoted (`x`), and boolean (`disabled`) attributes. Mirrors the
// behavior of the original visitor.ts `parseAstroAttributes`.
//
// `fullTag` is the entire `<tag ...>` slice (must start with `<`).
// `tagStartOffset` is the offset of `<` in `source`. Returns the
// parsed attributes, the class tokens with line/column, and the list
// of `on*` event handler names.
export function parseAstroAttributes(
  fullTag: string,
  tagStartOffset: number,
  source: string,
): {
  attributes: Record<string, string | undefined>;
  classNames: ClassNameFact[];
  eventHandlers: string[];
} {
  const attributes: Record<string, string | undefined> = {};
  const classNames: ClassNameFact[] = [];
  const eventHandlers: string[] = [];

  let i = 1; // skip '<'
  while (i < fullTag.length && /[a-zA-Z0-9-:]/.test(fullTag[i]!)) i++;

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
          const { line, column } = positionFromCharOffset(source, offset);
          classNames.push({ value, line, column });
        }
        if (i < fullTag.length) i++; // skip closing quote
      } else if (quote === '{') {
        // Expression value: record as present but with undefined value.
        attributes[attrName] = undefined;
        let depth = 1;
        i++;
        while (i < fullTag.length && depth > 0) {
          const ch = fullTag[i];
          if (ch === '{') depth++;
          else if (ch === '}') depth--;
          else if (ch === '"' || ch === "'") {
            const stringQuote = ch;
            i++;
            while (i < fullTag.length && fullTag[i] !== stringQuote) {
              if (fullTag[i] === '\\') i++;
              i++;
            }
          }
          i++;
        }
      } else {
        // Unquoted value.
        const valueStart = i;
        let value = '';
        while (i < fullTag.length) {
          const ch = fullTag[i];
          if (/\s/.test(ch!) || ch === '>') break;
          if (ch === '/' && i + 1 < fullTag.length && fullTag[i + 1] === '>') break;
          value += ch;
          i++;
        }
        attributes[attrName] = value;
        if (attrName === 'class') {
          const offset = tagStartOffset + valueStart;
          const { line, column } = positionFromCharOffset(source, offset);
          classNames.push({ value, line, column });
        }
      }
    } else {
      // Boolean attribute.
      attributes[attrName] = undefined;
    }

    if (attrName.toLowerCase().startsWith('on')) {
      eventHandlers.push(attrName);
    }
  }

  return { attributes, classNames, eventHandlers };
}

// Astro/Vue/Svelte static template class name extractor. Returns the FULL
// class string as a single ClassNameFact per tag (not split into tokens).
// `mergeTemplateClassNames` in visitor.ts deduplicates by (line, column, value)
// so we never produce two facts for the same class string on the same line.
export function extractStaticTemplateClassNames(
  source: string,
  skipRanges: SourceRange[],
): ClassNameFact[] {
  const facts: ClassNameFact[] = [];
  let i = 0;

  while (i < source.length) {
    const lt = source.indexOf('<', i);
    if (lt === -1) break;

    const nextChar = source[lt + 1];
    if (nextChar === '/' || nextChar === '!' || nextChar === '?') {
      i = lt + 1;
      continue;
    }

    if (!/[a-zA-Z]/.test(source[lt + 1] ?? '')) {
      i = lt + 1;
      continue;
    }

    let tagEnd = -1;
    let inString: string | null = null;
    let braceDepth = 0;
    for (let k = lt + 1; k < source.length; k++) {
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

    const tagStart = lt;
    if (skipRanges.some((range) => tagStart < range.end && tagEnd + 1 > range.start)) {
      i = tagEnd + 1;
      continue;
    }

    const fullTag = source.slice(tagStart, tagEnd + 1);
    const classAttrMatch = /\sclass\s*=\s*(["'])([^]*?)\1/.exec(fullTag);
    if (classAttrMatch) {
      const value = classAttrMatch[2]!;
      if (value.trim()) {
        const valueStartInTag = classAttrMatch.index + classAttrMatch[0].indexOf(value);
        const offset = tagStart + valueStartInTag;
        const { line, column } = positionFromCharOffset(source, offset);
        facts.push({ value, line, column });
      }
    }

    i = tagEnd + 1;
  }

  return facts;
}

export function extractAstroComponents(source: string): AstroComponentFact[] {
  const results: AstroComponentFact[] = [];
  const skipRanges = findAstroSkipRanges(source);
  const tagRegex = /<([A-Z][A-Za-z0-9]*)/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(source)) !== null) {
    const tag = match[1]!;
    const startIndex = match.index;
    if (skipRanges.some((range) => startIndex >= range.start && startIndex < range.end)) {
      continue;
    }
    let i = startIndex + match[0].length;
    let inString = false;
    let stringChar = '';
    let tagEnd = -1;

    let braceDepth = 0;
    for (; i < source.length; i++) {
      const ch = source[i];
      if (inString) {
        if (ch === '\\') {
          i++;
          continue;
        }
        if (ch === stringChar) {
          inString = false;
        }
        continue;
      }
      if (ch === '"' || ch === "'") {
        inString = true;
        stringChar = ch;
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
        tagEnd = i;
        break;
      }
    }

    if (tagEnd === -1) continue;

    const tagSource = source.slice(startIndex, tagEnd + 1);
    const hasClientDirective = /\sclient:[a-z]+(?:\s|>|\/|$)/i.test(tagSource);
    const hasEventHandler = /\son[A-Z][a-zA-Z]*\s*=/i.test(tagSource);
    const line = lineNumberOf(source, startIndex);
    const lineStart = source.lastIndexOf('\n', startIndex) + 1;
    const column = startIndex - lineStart + 1;

    results.push({
      tag,
      hasClientDirective,
      hasEventHandler,
      line,
      column,
    });
  }

  return results;
}

export function extractAstroElementFacts(source: string): ElementFact[] {
  const results: ElementFact[] = [];
  const skipRanges = findAstroSkipRanges(source);

  let i = 0;
  while (i < source.length) {
    const lt = source.indexOf('<', i);
    if (lt === -1) break;

    const containingRange = skipRanges.find((range) => lt >= range.start && lt < range.end);
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

    if (tagName[0] === tagName[0]!.toUpperCase()) {
      i = lt + 1;
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
    const { attributes, classNames, eventHandlers } = parseAstroAttributes(fullTag, lt, source);
    const pos = positionFromCharOffset(source, lt);
    results.push({
      tag: tagName,
      attributes,
      classNames,
      eventHandlers,
      line: pos.line,
      column: pos.column,
    });

    i = tagEnd + 1;
  }

  return results;
}