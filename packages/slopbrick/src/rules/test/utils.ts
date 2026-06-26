// Shared utilities for the `test/*` rules (Phase 5 — Test Intelligence).
//
// Each rule short-circuits on non-test files via `isTestFile()` so the
// rules are safe-by-default — even if test files leak into the normal
// `slopbrick scan` pipeline (e.g. user removes the default exclude),
// the rules won't double-fire or distort the Slop Index.

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Test-file detection
// ---------------------------------------------------------------------------

/**
 * True when the path matches a recognized test file pattern.
 *
 * Patterns (all platform-agnostic — backslashes are normalized first):
 *   - `__tests__/` directory anywhere in the path
 *   - `*.test.{ts,tsx,js,jsx}` in the basename
 *   - `*.spec.{ts,tsx,js,jsx}` in the basename
 *   - `*.stories.{ts,tsx,js,jsx}` in the basename (Storybook; same
 *     placeholder-data problem)
 *   - `__fixtures__/` directory (also placeholder-heavy)
 *
 * Kept conservative — we only flag files that are unambiguously test-
 * adjacent. Production code is never matched.
 */
export function isTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  if (/(^|\/)__tests__\//.test(normalized)) return true;
  if (/(^|\/)__fixtures__\//.test(normalized)) return true;
  if (/\.(test|spec)\.[jt]sx?$/.test(normalized)) return true;
  if (/\.stories\.[jt]sx?$/.test(normalized)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Assertion extraction (test/weak-assertion)
// ---------------------------------------------------------------------------

export interface AssertionHit {
  /** Full matched expression: `expect(x).toBe(y)`. */
  full: string;
  /** The argument to expect(): `x`. */
  expectArg: string;
  /** The matcher name: `toBe`, `toEqual`, etc. */
  matcher: string;
  /** The argument(s) to the matcher, joined: `y`. May be empty for nullary matchers. */
  matcherArg: string;
  /** 1-based source line. */
  line: number;
  /** 1-based column of the `expect` call. */
  column: number;
}

/**
 * Locate every `expect(...).<matcher>(...)` invocation in source.
 *
 * Regex strategy: match `expect(...)` (allowing nested parens like
 * `expect(lookup('x'))`) followed by a chain of property accesses
 * ending in a matcher call. We capture the expect-argument textually
 * (between the outer parens of `expect`) and the matcher argument
 * textually between the next pair of parens. The matches are loose —
 * the rule layer decides which are weak.
 *
 * Implementation: walk the source linearly with a small state machine
 * to find `expect(`, then track paren depth to find the matching close.
 * That's more reliable than a single regex for nested parens.
 */
const ASSERTION_MATCHERS = new Set([
  'toBe',
  'toEqual',
  'toStrictEqual',
  'toBeNull',
  'toBeUndefined',
  'toBeDefined',
  'toBeTruthy',
  'toBeFalsy',
  'toContain',
  'toMatch',
  'toHaveLength',
  'toHaveProperty',
  'toBeGreaterThan',
  'toBeLessThan',
  'toThrow',
  'toBeCalled',
  'toBeCalledWith',
  'toHaveBeenCalled',
  'toHaveBeenCalledWith',
  'resolves',
  'rejects',
]);

function lineColumnOf(source: string, index: number): { line: number; column: number } {
  const slice = source.slice(0, index);
  const line = slice.split('\n').length;
  const lastNl = slice.lastIndexOf('\n');
  const column = lastNl === -1 ? index + 1 : index - lastNl;
  return { line, column };
}

export function extractAssertions(source: string): AssertionHit[] {
  const hits: AssertionHit[] = [];
  let i = 0;
  while (i < source.length) {
    const idx = source.indexOf('expect', i);
    if (idx < 0) break;
    // Word boundary — don't match `myexpect(`.
    const prev = idx > 0 ? source[idx - 1] : '';
    if (/[A-Za-z0-9_$]/.test(prev)) {
      i = idx + 6;
      continue;
    }
    // Find the opening paren after `expect`.
    let p = idx + 6;
    while (p < source.length && /\s/.test(source[p] ?? '')) p++;
    if (source[p] !== '(') {
      i = idx + 6;
      continue;
    }
    // Track paren depth to find the close of `expect(...)`.
    const expectOpenIdx = p + 1;
    const expectCloseIdx = findMatchingParen(source, expectOpenIdx);
    if (expectCloseIdx < 0) {
      i = idx + 6;
      continue;
    }
    const expectArg = source.slice(expectOpenIdx, expectCloseIdx).trim();

    // After the close paren, look for `.matcher(` — possibly with
    // intermediate property accesses.
    let q = expectCloseIdx + 1;
    let lastDot = -1;
    while (q < source.length) {
      const ch = source[q];
      if (ch === '.') {
        lastDot = q;
        q++;
        continue;
      }
      if (/[A-Za-z_$]/.test(ch)) {
        // Walk identifier.
        let end = q;
        while (end < source.length && /[A-Za-z0-9_$]/.test(source[end] ?? '')) end++;
        const ident = source.slice(q, end);
        q = end;
        // If we just hit a known matcher AND the next non-ws char
        // is `(` — we have a hit.
        if (ASSERTION_MATCHERS.has(ident)) {
          while (q < source.length && /\s/.test(source[q] ?? '')) q++;
          if (source[q] === '(') {
            const argOpen = q + 1;
            const argClose = findMatchingParen(source, argOpen);
            if (argClose > 0) {
              const matcherArg = source.slice(argOpen, argClose).trim();
              const full = source.slice(idx, argClose + 1);
              const { line, column } = lineColumnOf(source, idx);
              hits.push({
                full,
                expectArg,
                matcher: ident,
                matcherArg,
                line,
                column,
              });
              q = argClose + 1;
              continue;
            }
          }
        }
        continue;
      }
      if (/\s/.test(ch ?? '')) {
        q++;
        continue;
      }
      // Any other char ends the chain.
      break;
    }
    i = lastDot > 0 ? lastDot + 1 : idx + 6;
  }
  return hits;
}

/**
 * Starting at index `start` (which should point at the FIRST char
 * INSIDE the opening paren), return the index of the matching
 * close-paren. Honors nested parens, square brackets, braces, and
 * quote characters.
 *
 * Depth starts at 1 because we're already inside the opening paren
 * that `start` follows.
 */
function findMatchingParen(source: string, start: number): number {
  let depth = 1;
  let inString: false | '"' | "'" | '`' = false;
  let escaped = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === inString) {
        inString = false;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Setup-block extraction (test/duplicate-setup)
// ---------------------------------------------------------------------------

export interface SetupBlockHit {
  /** Kind of setup. */
  kind: 'beforeEach' | 'beforeAll' | 'afterEach' | 'afterAll' | 'setupServer';
  /** 1-based source line of the keyword. */
  line: number;
  /** 1-based column. */
  column: number;
  /** The full body of the block, normalized (whitespace + identifiers collapsed). */
  normalizedBody: string;
  /** SHA-1 hash of `normalizedBody` — equality groups duplicates. */
  bodyHash: string;
  /** Raw body text (unnormalized, used for messages). */
  rawBody: string;
}

const SETUP_KEYWORDS = ['beforeEach', 'beforeAll', 'afterEach', 'afterAll', 'setupServer'] as const;

const SETUP_RE = /\b(beforeEach|beforeAll|afterEach|afterAll|setupServer)\s*\(/g;

/**
 * Walk source linearly, locating every setup-block opener, then
 * consume the body up to its matching closing `)`. The body is
 * anything between the open `(` and the matching close `)` — same
 * algorithm as `parseStyleObject`, just for parens.
 *
 * Bodies shorter than `minLines` are filtered upstream (they can't be
 * meaningful setups). Body hash uses SHA-1 of whitespace-collapsed
 * text — cheap and deterministic.
 */
export function extractSetupBlocks(source: string, minLines = 3): SetupBlockHit[] {
  const hits: SetupBlockHit[] = [];
  SETUP_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SETUP_RE.exec(source)) !== null) {
    const kind = m[1] as (typeof SETUP_KEYWORDS)[number];
    const openIdx = m.index + m[0].length; // points at the char AFTER `(`
    const closeIdx = findMatchingParen(source, openIdx);
    if (closeIdx < 0) continue;
    const rawBody = source.slice(openIdx, closeIdx);
    const normalizedBody = rawBody
      .replace(/\s+/g, ' ')
      .replace(/\b([A-Za-z_$][\w$]*)\b/g, (match) => {
        // Preserve JS keywords + primitives so `(true)` / `(null)` differ from `(false)`.
        if (
          /^(true|false|null|undefined|NaN|Infinity)$/.test(match) ||
          /^(if|else|return|const|let|var|new|await|async|function|class|import|from|export|expect|jest|vi|describe|it|test|render|fireEvent|setupServer|beforeEach|beforeAll|afterEach|afterAll)$/.test(
            match,
          )
        ) {
          return match;
        }
        return 'X';
      })
      .trim();

    const lineCount = rawBody.split('\n').length;
    if (lineCount < minLines) continue;
    const bodyHash = createHash('sha1').update(normalizedBody).digest('hex');

    const { line, column } = lineColumnOf(source, m.index);

    hits.push({
      kind,
      line,
      column,
      normalizedBody,
      bodyHash,
      rawBody,
    });
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Fake-placeholder property extraction (test/fake-placeholder)
// ---------------------------------------------------------------------------

export interface PlaceholderHit {
  /** Property name: `name`, `email`, `id`, `password`, etc. */
  prop: string;
  /** Literal value as written: `'John Doe'`, `1`, `'2020-01-01'`. */
  value: string;
  /** 1-based source line. */
  line: number;
  /** 1-based column. */
  column: number;
}

/**
 * Object-literal property assignments in test fixtures.
 *
 * Captures `prop: 'literal'` and `prop: 123` / `prop: true` patterns.
 * Numeric and boolean literals are restricted to specific property
 * names (id/userId/orderId) to avoid false positives on real values.
 */
const STRING_PROP_RE = /\b([a-zA-Z_$][\w$]*)\s*:\s*(['"])([^'"\n]{1,80})\2/g;
const NUMERIC_PROP_RE = /\b(id|userId|orderId|productId|tenantId|customerId)\s*:\s*(\d{1,6})\b/g;
const DATE_PROP_RE =
  /\b(createdAt|updatedAt|deletedAt|timestamp|expiresAt)\s*:\s*(?:new\s+Date\(\s*['"]([^'"\n]+)['"]\s*\)|['"]([^'"\n]+)['"])/g;

export function extractPlaceholderCandidates(source: string): PlaceholderHit[] {
  const hits: PlaceholderHit[] = [];
  STRING_PROP_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = STRING_PROP_RE.exec(source)) !== null) {
    const prop = m[1] ?? '';
    const value = m[3] ?? '';
    const { line, column } = lineColumnOf(source, m.index);
    hits.push({ prop, value, line, column });
  }
  NUMERIC_PROP_RE.lastIndex = 0;
  while ((m = NUMERIC_PROP_RE.exec(source)) !== null) {
    const { line, column } = lineColumnOf(source, m.index);
    hits.push({
      prop: m[1] ?? '',
      value: m[2] ?? '',
      line,
      column,
    });
  }
  DATE_PROP_RE.lastIndex = 0;
  while ((m = DATE_PROP_RE.exec(source)) !== null) {
    const { line, column } = lineColumnOf(source, m.index);
    // m[2] = new Date('value'), m[3] = bare 'value'. Prefer the new-Date
    // variant when both could match.
    const value = (m[2] ?? m[3] ?? '').trim();
    hits.push({
      prop: m[1] ?? '',
      value,
      line,
      column,
    });
  }
  return hits;
}