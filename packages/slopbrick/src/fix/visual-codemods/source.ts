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
// the imported module specifier.
//
// v0.39.0: DISABLED. The previous regex (`[^;]+?` across newlines)
// captured multi-line imports as single "lines" spanning multiple
// physical lines. Sorting those by specifier rearranged physical
// lines, leaving orphaned `} from '...';` closing fragments with
// no matching `import {` opening. This corrupted files on every
// `slopbrick scan --fix` run and would ship broken commits via
// the `slopbrick lock` pre-commit hook.
//
// A proper fix requires a real parser (regex can't handle balanced
// braces in destructuring patterns). Tracked for v0.40.0.
export const applySortImportsCodemod: CodemodFn = (content) => {
  // No-op until v0.40.0.
  return { content, changes: [] };
};