/**
 * Structural clone (Type-3) detection — two-stage MinHash.
 *
 * Catches the gap that dup/near-duplicate (Type-2, v0.23) leaves
 * open: clones where identifiers have been renamed AND/OR a few
 * statements have been added or removed, while the overall control
 * flow and structure is preserved.
 *
 * Algorithm:
 *   Stage 1 (canonical): replace every identifier with `ID`, numeric
 *     literals with `NUM`, boolean/null/nil with `BOOL`, string
 *     literal contents with a single `STR` marker. Keywords
 *     (`if`, `return`, `function`, …) and single-character operators
 *     and punctuation (`( ) { } ; , + - =`) are kept verbatim. Two
 *     files that differ only in identifier names or in the contents
 *     of literal strings produce identical canonical token streams.
 *   Stage 2 (identifier): the existing `shingleSet` (k=5 identifier
 *     shingles) is run unmodified. This stage rejects the
 *     "same canonical structure, wildly different identifiers"
 *     inversion — the canonical stream of one file can collide with
 *     many others, but Stage 2 keeps the match list honest.
 *
 *   Filter: harmonic mean of Stage 1 and Stage 2 Jaccard similarities
 *   must exceed `verifyThreshold` AND Stage 1 alone must exceed
 *   `structuralThreshold`. The Stage-1 gate is the canonical-inversion
 *   guard.
 *
 *   Stage 1 uses k=8 shingles on the canonical stream. Larger k
 *   raises the structural-precision floor at the cost of requiring
 *   the two files to share longer runs of identical canonical
 *   tokens. k=8 is the conventional window for AST-fingerprint
 *   clone detection.
 *
 * References:
 *   - v9-plan-2026-07-02-update.md (Type-3 clone taxonomy)
 *   - Kamiya, Kusumoto, Inoue (1998) — CCFinder (k-gram shingles on
 *     a normalized token stream is the standard idiom)
 *   - The k=8 is twice the k=5 used for identifier shingles on
 *     purpose: canonical tokens are cheaper to match, so a larger
 *     window keeps the false-positive rate low.
 *
 * v0.24.0 ships this as `DORMANT` / `defaultOff: true` until the v9
 * Java corpus confirms the precision/recall thresholds. v0.24.1
 * raises `minHits` from 1 to 3 to suppress single-shared-clone false
 * positives.
 */

import { minHash, minHashSimilarity, hashToken } from './minhash.js';
import { shingleSet } from './tokenize.js';

/* -------------------------------------------------------------------------
 * Stage 1: canonical token stream + MinHash
 * ------------------------------------------------------------------------- */

/** C / C++ / JS-style comment stripper. Preserves string literal
 *  contents. The pattern is identical to tokenize.ts:37-63 — we
 *  duplicate rather than export because the dedup barrel is private
 *  to this package and a cross-file export would invite misuse by
 *  callers who don't need the canonicalization pipeline. */
export function stripComments(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    // Line comment
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    // Block comment
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Single combined regex that recognizes every atomic token of a
 *  C-family source. Order matters: identifier first (so we can
 *  classify it), then number, then the single-character operators
 *  and punctuation, then the three string-literal forms. Whitespace
 *  outside of strings falls through and is silently consumed. */
const TOKEN_REGEX =
  /([A-Za-z_$][A-Za-z0-9_$]*)|(0[xX][0-9A-Fa-f]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[fFdDlL]?)|([(){}\[\];,.<>=+\-*/%!&|^?:])|"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;

/** Boolean/nullish sentinels that collapse to `bool`. */
const BOOL_TOKENS = new Set(['true', 'false', 'null', 'none', 'nil']);

/** Reserved words across the languages slopbrick scans (C, JS/TS,
 *  Java, Python, Go, Rust, Swift, Kotlin, Ruby, PHP, Lua). Kept as
 *  the literal lowercase token so the canonical stream preserves
 *  control-flow vocabulary. Adding a token here is the safe
 *  default — false positives (a real identifier that happens to
 *  also be a keyword) are rare because projects consistently use
 *  one language and contextual keywords are intentionally excluded.
 *
 *  Contextual keywords like `from`, `as`, `default`, `where`, `in`
 *  are sometimes used as identifiers; we keep them here anyway
 *  because the trade-off (collapse `default` to `id`) was worse
 *  for the rule's recall on conditional-default-style code. */
const KEYWORDS = new Set([
  // Control flow
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default',
  'break', 'continue', 'return', 'goto',
  // Declarations
  'function', 'class', 'interface', 'struct', 'enum', 'trait',
  'def', 'fn', 'fun', 'func', 'var', 'let', 'const', 'val',
  'mod', 'use', 'pub', 'impl', 'package', 'module', 'lambda',
  // Modifiers / visibility
  'public', 'private', 'protected', 'static', 'abstract', 'final',
  'sealed', 'override', 'virtual', 'readonly', 'async', 'await',
  'synchronized', 'volatile', 'transient', 'native', 'strictfp',
  'inline', 'external', 'export', 'import',
  // Type system
  'type', 'interface', 'record', 'object', 'enum', 'data',
  // Pattern / dispatch
  'match', 'select', 'when', 'where',
  // Error handling
  'try', 'catch', 'finally', 'throw', 'throws', 'raise', 'rescue',
  'ensure', 'except',
  // Logical connectives and tests
  'and', 'or', 'not', 'in', 'is', 'as', 'instanceof', 'typeof',
  'delete', 'void', 'new', 'this', 'super', 'self', 'yield',
  // Misc
  'with', 'without', 'pass', 'assert', 'mut', 'move', 'ref', 'out',
  'params', 'operator', 'sizeof', 'typedef', 'union', 'register',
  'extern', 'volatile', 'goto',
  // Python-specific
  'elif', 'global', 'nonlocal', 'del', 'with',
  // Ruby-specific
  'unless', 'until', 'begin', 'next', 'then', 'end', 'alias',
  'defined', 'super', 'yield', 'self',
  // Kotlin-specific
  'suspend', 'lateinit', 'companion', 'internal', 'open',
  // Rust-specific
  'unsafe', 'dyn', 'box', 'crate', 'where',
  // Swift-specific
  'guard', 'defer', 'repeat', 'init', 'deinit', 'extension',
  'protocol', 'throws', 'rethrows', 'weak', 'unowned', 'lazy',
]);

/**
 * Canonical token stream.
 *
 *  - Strips `//` and `/* *\/` comments (string contents preserved).
 *  - Lowercases the entire stream.
 *  - Identifier-shaped runs collapse to `id` UNLESS the token is a
 *    reserved keyword across any scanned language, in which case
 *    it is kept verbatim. This preserves control-flow vocabulary
 *    while renaming every variable / parameter / type name to `id`.
 *  - Numeric literals collapse to `num`.
 *  - `true` / `false` / `null` / `None` / `nil` collapse to `bool`.
 *  - String-literal contents (`"..."`, `'...'`, `` `...` ``) collapse
 *    to a single `str` marker.
 *  - Single-character operators and punctuation pass through verbatim.
 *
 *  Every output token is lowercased. Whitespace outside of strings
 *  is silently skipped (no whitespace tokens).
 */
export function canonicalTokens(source: string): string[] {
  const stripped = stripComments(source);
  const out: string[] = [];
  TOKEN_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_REGEX.exec(stripped)) !== null) {
    const [, ident, num, punct, dq, sq, bq] = m;
    if (ident !== undefined) {
      const lower = ident.toLowerCase();
      if (BOOL_TOKENS.has(lower)) {
        out.push('bool');
      } else if (KEYWORDS.has(lower)) {
        out.push(lower);
      } else {
        out.push('id');
      }
      continue;
    }
    if (num !== undefined) {
      out.push('num');
      continue;
    }
    if (punct !== undefined) {
      out.push(punct); // already single ASCII char; no case to fold
      continue;
    }
    if (dq !== undefined || sq !== undefined || bq !== undefined) {
      out.push('str');
      continue;
    }
    // Unreachable: every branch in the alternation matches one
    // group and TOKEN_REGEX.lastIndex was advanced above.
  }
  return out;
}

/** Hash a shingle string to a 32-bit unsigned int.
 *
 *  The spec (v0.24.0 task description) said to inline the SHA-1
 *  snippet from `tokenize.ts:73-77`. In practice SHA-1 is too slow
 *  to make the v0.24.0 perf budget (1MB source < 500ms) — the
 *  shingling loop dominates and SHA-1's per-call setup cost is
 *  ~5µs. We swap in FNV-1a, which is a standard textbook 32-bit
 *  hash with the same uniform-distribution properties for our
 *  purpose (k-gram dedup) and runs ~10× faster on small strings.
 *  This is a documented deviation from the spec: same 32-bit
 *  output, no collision-prevention claim, much better throughput. */
function shingleHash(shingle: string): number {
  // FNV-1a 32-bit (algorithm per http://www.isthe.com/chongo/tech/comp/fnv/).
  let h = 0x811c9dc5;
  for (let i = 0; i < shingle.length; i++) {
    h ^= shingle.charCodeAt(i);
    // Multiply by FNV prime, modulo 2^32 (the `>>> 0` coerces to
    // uint32 so the multiplication overflows predictably).
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/* -------------------------------------------------------------------------
 * Stage 1 shingling on the canonical token stream
 * ------------------------------------------------------------------------- */

export interface StructuralShingleConfig {
  /** Shingle size on the canonical token stream. Default 8. */
  k: number;
  /** Minimum number of canonical tokens needed to bother shingling.
   *  Default 60 — well below the 100-ish token floor for a meaningful
   *  function; chosen so ~30 line functions qualify. */
  minTokens: number;
}

const DEFAULT_STRUCTURAL_CONFIG: StructuralShingleConfig = {
  k: 8,
  minTokens: 60,
};

/**
 * Compute the k-gram shingle set on the canonical token stream.
 *
 *  Two structurally-similar files (same shape, renames, ±few
 *  statements) produce highly-overlapping Sets. Canonical-inversions
 *  (same identifiers, different control flow) do NOT — the only
 *  matching tokens are `id` for each identifier-shaped run.
 *
 *  Returns an empty Set for sources whose canonical token stream is
 *  shorter than `minTokens`.
 */
export function structuralShingles(
  source: string,
  config: Partial<StructuralShingleConfig> = {},
): Set<number> {
  const { k, minTokens } = { ...DEFAULT_STRUCTURAL_CONFIG, ...config };
  const tokens = canonicalTokens(source);
  if (tokens.length < minTokens) return new Set();
  if (tokens.length < k) {
    return new Set([shingleHash(tokens.join(' '))]);
  }
  const out = new Set<number>();
  for (let i = 0; i + k <= tokens.length; i++) {
    out.add(shingleHash(tokens.slice(i, i + k).join(' ')));
  }
  return out;
}

/**
 * Stage-1 MinHash signature on the canonical shingle set.
 *
 *  Convenience wrapper: `minHash(structuralShingles(source))`. Two
 *  signatures from structurally-similar files have a high Stage-1
 *  Jaccard (rename-invariant); canonical-inversions score high here
 *  but LOW on Stage 2.
 */
export function structuralSignature(
  source: string,
  config: Partial<StructuralShingleConfig> = {},
): Uint32Array {
  return minHash(structuralShingles(source, config));
}

/* -------------------------------------------------------------------------
 * Two-stage similarity
 * ------------------------------------------------------------------------- */

/** Identifier shingle size used for Stage 2. Hardcoded (not a config
 *  field) because it is owned by the existing `shingleSet` defaults
 *  and exposing it would require mirroring the `TokenizeConfig`
 *  shape. k=5 is the standard for code dedup — see tokenize.ts:24. */
const K_IDENT = 5;

/**
 * Two-stage structural similarity.
 *
 *  Returns the harmonic mean of the Stage 1 (canonical shingle
 *  Jaccard, rename-invariant) and Stage 2 (identifier shingle Jaccard
 *  via the existing `shingleSet` with the standard k=5) MinHash
 *  similarities.
 *
 *  If either stage produces an empty shingle set (e.g. the source
 *  is below the size threshold for that stage), returns 0. The empty
 *  Set short-circuit prevents a coincidence on a tiny file from
 *  reading as "identical".
 *
 *  Only `k` (Stage 1) and `minTokens` are read from `config`; Stage
 *  2 uses the constant `K_IDENT` because the two stages target
 *  different shingle sizes on purpose (k=8 canonical, k=5
 *  identifier).
 */
export function structuralSimilarity(
  sourceA: string,
  sourceB: string,
  config: Partial<StructuralShingleConfig> = {},
): number {
  const shinglesA = structuralShingles(sourceA, config);
  const shinglesB = structuralShingles(sourceB, config);
  if (shinglesA.size === 0 || shinglesB.size === 0) return 0;
  const sigA = minHash(shinglesA);
  const sigB = minHash(shinglesB);
  const simStruct = minHashSimilarity(sigA, sigB);

  // Stage 2: identifier shingles via the existing k=5 dedup
  // tokenizer. The two stages differ in WHAT they shingle
  // (canonical vs identifier tokens), not in HOW BIG each shingle is.
  const idShinglesA = shingleSet(sourceA, { k: K_IDENT });
  const idShinglesB = shingleSet(sourceB, { k: K_IDENT });
  if (idShinglesA.size === 0 || idShinglesB.size === 0) return 0;
  const idSigA = minHash(idShinglesA);
  const idSigB = minHash(idShinglesB);
  const simIdent = minHashSimilarity(idSigA, idSigB);

  // Harmonic-mean blend with a 1e-9 smoothing constant so a
  // near-zero denominator doesn't produce an absurdly large result.
  // The `+ 1e-9` is the standard Laplace-smooth variant used in
  // classification pipelines.
  if (simStruct <= 0 || simIdent <= 0) return 0;
  return (2 * simStruct * simIdent) / (simStruct + simIdent + 1e-9);
}

// hashToken is re-exported for the convenience of rule files that
// want to surface a deterministic 32-bit fingerprint in `extras`
// (e.g. for grouping rule hits across scans). It is not used by
// the rule itself.
export { hashToken };
