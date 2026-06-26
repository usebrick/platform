// Public entry point for the round-20 visual codemods.
//
// Operates directly on source text — does not require rules to emit
// FixSuggestion. Runs in addition to the existing focus-ring /
// layout-token / use-client codemods.
//
// The 9 individual codemod functions live under ./visual-codemods/:
//   - tailwind.ts — arbitrary-escape, ai-vibe-purple, ai-default-palette
//   - jsx.ts     — ai-circle-icon / ai-rounded-image-no-clip,
//                  inline-style-to-tailwind, aria-attr-typo
//   - source.ts  — strip-debugger, merge-consecutive-strings, sort-imports
//
// This module owns:
//   - CodemodFn / CodemodChange / CodemodResult types
//   - ALL_CODEMODS registry (the canonical list of codemods to run)
//   - applyVisualCodemods(filePath) entry point that loads the file,
//     runs every codemod, dedupes overlapping changes by (before, after),
//     and writes the result back if anything changed.

import { readFileSync, writeFileSync } from 'node:fs';
import {
  applyArbitraryEscapeCodemod,
  applyVibePurpleCodemod,
  applyDefaultPaletteCodemod,
} from './visual-codemods/tailwind.js';
import {
  applyRoundedImageClipCodemod,
  applyInlineStyleToTailwindCodemod,
  applyAriaAttrTypoCodemod,
} from './visual-codemods/jsx.js';
import {
  applyStripDebuggerCodemod,
  applyMergeStringsCodemod,
  applySortImportsCodemod,
} from './visual-codemods/source.js';

export interface CodemodResult {
  filePath: string;
  applied: number;
  skipped: number;
  reasons: string[];
  changes: Array<{ description: string; before: string; after: string }>;
}

export interface CodemodChange {
  description: string;
  before: string;
  after: string;
}

export type CodemodFn = (content: string) => { content: string; changes: CodemodChange[] };

// Round-20 fix: dedupe changes so the same source-text edit isn't
// reported twice when two codemod names map to the same function.
// (ai-circle-icon and ai-rounded-image-no-clip share applyRoundedImageClipCodemod.)
const ALL_CODEMODS: Array<{ name: string; fn: CodemodFn }> = [
  { name: 'arbitrary-escape', fn: applyArbitraryEscapeCodemod },
  { name: 'ai-vibe-purple', fn: applyVibePurpleCodemod },
  { name: 'ai-circle-icon', fn: applyRoundedImageClipCodemod },
  { name: 'ai-default-palette', fn: applyDefaultPaletteCodemod },
  { name: 'inline-style-to-tailwind', fn: applyInlineStyleToTailwindCodemod },
  { name: 'strip-debugger', fn: applyStripDebuggerCodemod },
  { name: 'merge-consecutive-strings', fn: applyMergeStringsCodemod },
  { name: 'sort-imports', fn: applySortImportsCodemod },
  { name: 'aria-attr-typo', fn: applyAriaAttrTypoCodemod },
];

export function applyVisualCodemods(filePath: string): CodemodResult {
  const original = readFileSync(filePath, 'utf-8');
  let content = original;
  const reasons: string[] = [];
  const seen = new Set<string>();
  const changes: CodemodChange[] = [];
  for (const codemod of ALL_CODEMODS) {
    const result = codemod.fn(content);
    for (const change of result.changes) {
      const key = change.before + '|' + change.after;
      if (seen.has(key)) continue;
      seen.add(key);
      changes.push(change);
      content = content.replace(change.before, change.after);
    }
  }
  if (content !== original) {
    writeFileSync(filePath, content);
  }
  return {
    filePath,
    applied: changes.length,
    skipped: 0,
    reasons,
    changes,
  };
}