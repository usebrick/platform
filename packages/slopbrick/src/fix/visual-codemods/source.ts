// Source-level codemods. These don't care about framework or template
// syntax — they work on raw source text:
//   - strip-debugger removes `debugger;` statements and `console.log`
//     calls (conservative: leaves console.error/warn/info alone).
//   - merge-consecutive-strings collapses `'a' + 'b'` into `'ab'`.
//   - sort-imports sorts the contiguous import block at the top of the
//     file alphabetically by specifier.

import type { CodemodFn } from '../visual-codemod.js';

// Codemod #7: strip-debugger — removes `debugger;` statements and
// `console.log(...)` calls. Conservative: leaves console.error/warn/info
// alone (those are intentional), and only matches whole statements.
const DEBUGGER_RE = /^[ \t]*debugger\s*;\s*\n/gm;
const CONSOLE_LOG_RE = /^[ \t]*console\.log\([^)]*\)\s*;\s*\n/gm;

export const applyStripDebuggerCodemod: CodemodFn = (content) => {
  const changes: Array<{ description: string; before: string; after: string }> = [];
  let next = content.replace(DEBUGGER_RE, (m) => {
    changes.push({ description: 'strip debugger statement', before: m, after: '' });
    return '';
  });
  next = next.replace(CONSOLE_LOG_RE, (m) => {
    changes.push({ description: 'strip console.log call', before: m, after: '' });
    return '';
  });
  return { content: next, changes };
};

// Codemod #8: merge-consecutive-strings — `'a' + 'b'` → `'ab'`. Catches the
// common AI pattern of building strings via concatenation when they're
// already known at compile time.
export const applyMergeStringsCodemod: CodemodFn = (content) => {
  const changes: Array<{ description: string; before: string; after: string }> = [];
  // String literal + String literal (both single or both double quoted)
  const MERGE_RE = /(['"])((?:(?!\1).)*?)\1\s*\+\s*(['"])((?:(?!\3).)*?)\3/g;
  let next = content.replace(MERGE_RE, (_full, q1: string, a: string, q2: string, b: string) => {
    if (q1 !== q2) return _full; // different quote styles → don't merge
    const merged = a + b;
    const result = `${q1}${merged}${q1}`;
    changes.push({ description: 'merge adjacent string literals', before: _full, after: result });
    return result;
  });
  return { content: next, changes };
};

// Codemod #9: sort-imports — sort import statements alphabetically by
// the imported module specifier. Conservative: doesn't reorder
// default/named/destructured splits.
export const applySortImportsCodemod: CodemodFn = (content) => {
  // Match a contiguous block of import statements at the top of the file.
  const blockMatch = content.match(/^([ \t]*(?:import\s+(?:[^;]+?from\s+)?['"][^'"]+['"]\s*;?\s*\n)+)/m);
  if (!blockMatch) return { content, changes: [] };
  const block = blockMatch[1]!;
  const lines = block.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { content, changes: [] };
  // Extract the specifier from each line; sort by it.
  const specRe = /['"]([^'"]+)['"]/;
  const sorted = [...lines].sort((a, b) => {
    const sa = a.match(specRe)?.[1] ?? '';
    const sb = b.match(specRe)?.[1] ?? '';
    return sa.localeCompare(sb);
  });
  if (sorted.every((l, i) => l === lines[i])) return { content, changes: [] };
  const newBlock = sorted.join('\n') + '\n';
  const next = content.replace(block!, newBlock);
  return {
    content: next,
    changes: [{ description: 'sort imports alphabetically', before: block, after: newBlock }],
  };
};