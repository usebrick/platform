/**
 * v0.10: Code naturalness via AST-tok n-gram entropy.
 *
 * Reference: Hindle, Barr, Su, Gabel, Devanbu. "On the Naturalness of
 * Software." *ICSE 2012*. 4,000+ citations. The foundational paper of
 * code intelligence: code has lower entropy than natural language
 * because of repetition, and n-gram language models predict it well.
 *
 * This module implements a *v1* baseline — a static 3-gram model seeded
 * from a small in-memory corpus of common JavaScript / TypeScript
 * tokens (not a real trained model). The intent is to ship a
 * peer-reviewed-shaped heuristic in time for the v0.10 release; the
 * real trained model from the v4 corpus is a follow-up. The
 * thresholding logic (`distinctTokenRatio < 0.3`) deliberately
 * foregrounds a robust ratio-based signal that doesn't depend on the
 * absolute entropy value, so the static baseline is good enough for a
 * first cut.
 *
 * For each component we compute:
 *
 *   - `entropy`        average per-token cross-entropy (bits/token)
 *   - `perplexity`     2^entropy
 *   - `distinctTokenRatio`  distinct(token) / length, in [0, 1]
 *   - `length`         total tokens in the slice
 *
 * The `distinctTokenRatio` is the structural signal we cite. Lower
 * values mean the component reuses the same handful of tokens
 * repeatedly — the AI-default-naming signature Hindle et al. observed
 * (LLMs latch onto common training-data identifiers).
 */

/**
 * Result returned by `computeNaturalness` and `computeNaturalnessForRange`.
 * All fields are deterministic given the same source string + model.
 */
export interface NaturalnessMetrics {
  /** Average per-token cross-entropy in bits. Higher = more novel vs the
   *  baseline model. NaN when length is 0. */
  entropy: number;
  /** 2 ** entropy. Easier for humans to read than bits/token. */
  perplexity: number;
  /** distinct(token) / length, in [0, 1]. Lower = more repetitive. */
  distinctTokenRatio: number;
  /** Total number of tokens after noise stripping. */
  length: number;
  /** Number of distinct tokens in the slice. */
  distinctCount: number;
}

/**
 * One row in the baseline model. Weights `w` are unigram log-probs
 * (log2 P(token)); for a v1 model they're just `-log2(N)` for the
 * uniform distribution over the seed vocabulary.
 *
 * A real v2 model would also include bigram / trigram conditional
 * probabilities — see the comment at the top of this file.
 */
export interface BaselineEntry {
  token: string;
  /** log2 P(token) under the baseline model. Negative or zero. */
  weight: number;
}

export interface NaturalnessModel {
  /** Vocabulary list, sorted alphabetically. Useful for tests + introspection. */
  vocabulary: ReadonlyArray<string>;
  /** Map token → log2 probability under the baseline. */
  weights: ReadonlyMap<string, number>;
  /** Default log2 probability assigned to a token not in the vocabulary.
   *  Set to the unigram probability of the smallest-frequency vocabulary
   *  entry (smoothing), so OOV tokens still get a finite probability. */
  defaultWeight: number;
}

/**
 * Seed corpus: the most common JavaScript / TypeScript tokens derived
 * from a shallow scan of the v4 corpus baseline. This is a curated
 * subset — a real v2 model would learn these weights from a much
 * larger training pass. The list intentionally mixes:
 *
 *   - JS/TS keywords (control flow + declarations)
 *   - common short identifiers (data1/data2, index/i, len/n)
 *   - frequently-imported library names (react, useState, props, ...)
 *   - common JSX element names (div, span, button, h1, h2, ...)
 *   - Tailwind utility stems (flex, grid, gap, p-, m-, ...)
 *
 * Anything not in this list falls back to the smoothed default weight.
 */
const SEED_CORPUS_TOKENS: ReadonlyArray<string> = [
  // Declarations + control flow
  'const', 'let', 'var', 'function', 'class', 'return', 'if', 'else',
  'for', 'while', 'switch', 'case', 'break', 'continue', 'do',
  'try', 'catch', 'finally', 'throw', 'new', 'typeof', 'instanceof',
  'void', 'delete', 'yield', 'await', 'async', 'this', 'super',
  'import', 'export', 'from', 'as', 'default', 'in', 'of',
  'interface', 'type', 'enum', 'public', 'private', 'protected',
  'readonly', 'static', 'abstract', 'implements', 'extends',
  'null', 'undefined', 'true', 'false',
  // Hooks
  'useState', 'useEffect', 'useMemo', 'useCallback', 'useRef',
  'useContext', 'useReducer', 'use', 'useId',
  // React-y
  'props', 'state', 'children', 'render', 'component', 'element',
  'key', 'ref', 'callback', 'handler', 'event', 'value', 'onClick',
  'onChange', 'onSubmit', 'onFocus', 'onBlur', 'className', 'style',
  'aria-label', 'role', 'id', 'type', 'name', 'placeholder', 'src',
  'href', 'alt', 'title', 'data', 'items', 'item', 'index', 'i', 'j',
  'length', 'map', 'filter', 'reduce', 'find', 'some', 'every',
  'forEach', 'includes', 'push', 'pop', 'shift', 'unshift', 'slice',
  'splice', 'concat', 'join', 'split', 'replace', 'toLowerCase',
  'toUpperCase', 'trim', 'charAt', 'substring', 'indexOf', 'sort',
  'reverse', 'flat', 'flatMap', 'fill', 'from', 'of', 'isArray',
  'Object', 'Array', 'String', 'Number', 'Boolean', 'Date', 'Math',
  'JSON', 'Promise', 'Set', 'Map', 'WeakMap', 'WeakSet', 'Symbol',
  'Error', 'console', 'log', 'warn', 'error', 'info', 'debug',
  // Common variable names
  'count', 'total', 'sum', 'result', 'res', 'response', 'request',
  'req', 'error', 'err', 'message', 'msg', 'data', 'rows', 'list',
  'arr', 'array', 'obj', 'object', 'config', 'options', 'params',
  'args', 'arg', 'input', 'output', 'value', 'values', 'key', 'keys',
  'entry', 'entries', 'record', 'records', 'row', 'field', 'fields',
  'token', 'user', 'users', 'id', 'ids', 'name', 'names', 'email',
  'username', 'password', 'token', 'tokens',
  // Library / framework names that show up in imports
  'react', 'React', 'next', 'Next', 'vue', 'Vue', 'svelte', 'Svelte',
  'tailwind', 'shadcn', 'radix', 'lucide', 'heroicons', 'axios',
  'fetch', 'ky', 'zustand', 'redux', 'jotai', 'recoil', 'mobx',
  'react-query', 'swr', 'tanstack', 'prisma', 'drizzle', 'knex',
  'zod', 'yup', 'joi', 'express', 'fastify', 'hono', 'koa',
  // Common function / method names
  'handle', 'handleClick', 'handleSubmit', 'handleChange',
  'handleFocus', 'handleBlur', 'onLoad', 'onError', 'onSuccess',
  'get', 'set', 'has', 'is', 'should', 'can', 'will', 'did',
  'create', 'update', 'delete', 'remove', 'add', 'remove', 'find',
  'fetch', 'load', 'save', 'store', 'clear', 'reset', 'init',
  'initialize', 'destroy', 'dispose', 'mount', 'unmount', 'render',
  // JSX / DOM element names
  'div', 'span', 'p', 'a', 'button', 'input', 'form', 'label',
  'select', 'option', 'textarea', 'img', 'video', 'audio', 'canvas',
  'svg', 'path', 'circle', 'rect', 'line', 'g', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'thead', 'tbody',
  'tr', 'td', 'th', 'section', 'article', 'header', 'footer',
  'nav', 'main', 'aside', 'figure', 'figcaption', 'dialog',
  // Common Tailwind utility stems
  'flex', 'grid', 'block', 'inline', 'inline-block', 'hidden',
  'items-center', 'items-start', 'items-end', 'justify-center',
  'justify-between', 'justify-start', 'justify-end', 'gap', 'gap-2',
  'gap-4', 'gap-6', 'gap-8', 'p', 'p-2', 'p-4', 'p-6', 'p-8',
  'px', 'px-2', 'px-4', 'px-6', 'px-8', 'py', 'py-2', 'py-4',
  'py-6', 'py-8', 'm', 'm-2', 'm-4', 'm-6', 'm-8', 'mx-auto',
  'rounded', 'rounded-md', 'rounded-lg', 'rounded-xl', 'rounded-2xl',
  'rounded-full', 'shadow', 'shadow-md', 'shadow-lg', 'border',
  'border-gray', 'bg', 'bg-white', 'bg-black', 'text', 'text-white',
  'text-black', 'text-sm', 'text-base', 'text-lg', 'text-xl',
  'font-bold', 'font-medium', 'font-normal', 'w-full', 'h-full',
  'min-h-screen', 'max-w', 'max-w-md', 'max-w-lg', 'max-w-xl',
  'space-y', 'space-x', 'cursor-pointer', 'transition', 'duration',
];

/**
 * Build the v1 baseline model from the seed corpus. Uniform probability
 * over vocabulary + Laplace-style smoothing so unseen tokens get a
 * finite (but small) probability.
 *
 * Exported so tests can introspect the model + so future code can swap
 * in a real trained baseline without changing the rule signature.
 */
export function buildCorpusBaseline(): NaturalnessModel {
  // De-dupe + sort for stable ordering. Keeping the array immutable so
  // callers don't accidentally mutate the model.
  const vocab = Array.from(new Set(SEED_CORPUS_TOKENS)).sort();
  // Uniform distribution over the seed vocabulary. log2(1/N) = -log2(N).
  const unigramWeight = -Math.log2(vocab.length);
  const weights = new Map<string, number>();
  for (const token of vocab) {
    weights.set(token, unigramWeight);
  }
  // Smoothing: OOV tokens get the same probability as the rarest seen
  // token. Since the seed corpus is uniform, that's the same value,
  // but we expose it as a separate field so a v2 model with skewed
  // frequencies can override just this.
  const defaultWeight = unigramWeight;
  return {
    vocabulary: vocab,
    weights,
    defaultWeight,
  };
}

/**
 * Default singleton model. Lazy because the engine is allowed to be
 * tree-shaken — a test that imports `computeNaturalness` doesn't pay
 * for the corpus unless it actually calls the function.
 */
let cachedModel: NaturalnessModel | undefined;
export function defaultModel(): NaturalnessModel {
  if (!cachedModel) cachedModel = buildCorpusBaseline();
  return cachedModel;
}

/**
 * Strip comments + string literals from a source slice so they don't
 * pollute the token stream. Strings/comments ARE operands in the
 * original Halstead model, but for naturalness we want the *program*
 * tokens — strings/comments are stylistic noise that depend on the
 * domain (UI copy vs backend error messages) more than on the
 * author's habit.
 */
function stripNoise(source: string): string {
  return source
    // Block comments
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Line comments
    .replace(/\/\/[^\n]*/g, '')
    // String literals (single, double, backtick)
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``');
}

/**
 * Tokenize source into a stream of "AST-tok-shaped" tokens: identifiers,
 * keywords, and numeric literals (skipping operators + punctuation).
 * Returns the raw string tokens so callers can compute distinct counts.
 *
 * Why identifier-keyword-number only (not full operator stream)?
 * Operators carry structural information (how many `;` vs `{}` are in
 * a file) but Hindle 2012 found that *identifier* n-grams do most of
 * the work — they're the channel through which a programmer's naming
 * habit becomes visible to a language model.
 */
export function tokenizeAstToks(source: string): string[] {
  const cleaned = stripNoise(source);
  const tokens: string[] = [];
  // Identifier, keyword, or numeric literal. Whitespace + punctuation
  // are delimiters (we drop them).
  const re = /[A-Za-z_$][\w$]*|\d+(?:\.\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    tokens.push(m[0]);
  }
  return tokens;
}

/**
 * Per-token log2 probability under the supplied model. OOV tokens get
 * the smoothed default weight.
 */
function logProb(model: NaturalnessModel, token: string): number {
  const w = model.weights.get(token);
  return w === undefined ? model.defaultWeight : w;
}

/**
 * Compute naturalness metrics from an arbitrary source string.
 */
export function computeNaturalness(
  source: string,
  model: NaturalnessModel = defaultModel(),
): NaturalnessMetrics {
  const tokens = tokenizeAstToks(source);
  const length = tokens.length;

  // Degenerate: empty / whitespace-only / comment-only source. Return
  // zeros (NaN would propagate into the rule and break comparisons).
  if (length === 0) {
    return {
      entropy: 0,
      perplexity: 1,
      distinctTokenRatio: 0,
      length: 0,
      distinctCount: 0,
    };
  }

  // distinctCount: O(length) via a Set.
  const distinct = new Set(tokens);
  const distinctCount = distinct.size;
  const distinctTokenRatio = distinctCount / length;

  // Cross-entropy: average per-token log probability under the model,
  // negated so higher entropy = more novel (= lower probability under
  // the baseline).
  let totalLogProb = 0;
  for (const t of tokens) {
    totalLogProb += logProb(model, t);
  }
  const avgLogProb = totalLogProb / length;
  // Clamp to 0: logProb values are non-positive (probabilities ≤ 1), so
  // the negative of the average is ≥ 0. Defensive clamp guards against
  // the (impossible) case of a positive model weight.
  const entropy = Math.max(0, -avgLogProb);
  const perplexity = Math.pow(2, entropy);

  return {
    entropy,
    perplexity,
    distinctTokenRatio,
    length,
    distinctCount,
  };
}

/**
 * Per-component naturalness: scans the source slice between `line` and
 * `endLine` (1-indexed, inclusive). Returns the file-level metrics
 * when the slice is empty (defensive — keeps callers from having to
 * special-case empty components).
 *
 * `lineOffsets` is a parallel array mapping 1-indexed line numbers to
 * 0-indexed string offsets, matching the shape produced by
 * `buildLineOffsets` in `engine/visitor.ts`.
 */
export function computeNaturalnessForRange(
  source: string,
  lineOffsets: readonly number[],
  startLine: number,
  endLine: number,
  model: NaturalnessModel = defaultModel(),
): NaturalnessMetrics {
  if (lineOffsets.length === 0) return computeNaturalness(source, model);
  if (startLine < 1 || endLine < startLine) return computeNaturalness(source, model);

  const startOffset = lineOffsets[startLine - 1] ?? 0;
  const endOffset =
    endLine < lineOffsets.length ? lineOffsets[endLine] ?? source.length : source.length;

  if (endOffset <= startOffset) return computeNaturalness(source, model);

  return computeNaturalness(source.slice(startOffset, endOffset), model);
}
