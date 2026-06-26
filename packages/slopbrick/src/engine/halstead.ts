/**
 * v0.10: Halstead complexity measures (Halstead 1977, *Elements of
 * Software Science*, Elsevier).
 *
 * Computes the six foundational software metrics from operators and
 * operands in the source code:
 *
 *   n1 = unique operators      N1 = total operators
 *   n2 = unique operands       N2 = total operands
 *
 *   Vocabulary          n  = n1 + n2
 *   Length              N  = N1 + N2
 *   Calculated length   N\u0302  = n1\u00b7log\u2082(n1) + n2\u00b7log\u2082(n2)
 *   Volume              V  = N \u00b7 log\u2082(n)
 *   Difficulty          D  = (n1/2) \u00b7 (N2/n2)
 *   Effort              E  = D \u00b7 V
 *   Estimated bugs      B  = E^(2/3) / 3000
 *
 * Why this matters for slopbrick: AI-generated code has measurably
 * lower `n` (fewer unique identifiers per length) and lower `V`
 * because the model reuses naming patterns from training data \u2014 the
 * same finding as Hindle's code naturalness (1977 \u00a73 vs Hindle
 * 2012), but with a closed-form expression we can cite per-finding.
 *
 * Computes both file-level and per-component metrics. Per-component
 * metrics are derived by scanning only the source slice between the
 * component's `line` and `endLine` (inclusive).
 */

export interface HalsteadMetrics {
  vocabulary: number;
  length: number;
  calculatedLength: number;
  volume: number;
  difficulty: number;
  effort: number;
  estimatedBugs: number;
  /** Sub-counts so callers can build ratio tests (e.g. V/LOC < baseline). */
  n1: number;
  n2: number;
  N1: number;
  N2: number;
}

/**
 * Punctuation / syntactic operators. Order matters: longer sequences
 * first so the tokenizer doesn't split `===` into three `=` tokens.
 */
const OPERATORS: ReadonlyArray<string> = [
  '>>>=', '<<=', '**=', '...', '===', '!==', '**', '>>>', '<<=', '&&', '||',
  '??', '?.', '<=', '>=', '==', '!=', '++', '--', '<<', '>>', '=>', '=',
  '+', '-', '*', '/', '%', '<', '>', '&', '|', '^', '~', '!', '?', ':',
  '(', ')', '{', '}', '[', ']', ',', ';', '.',
];

/**
 * JS/TS keywords we treat as operators (control flow, declarations,
 * type-bearing keywords). Excluded from operands.
 */
const KEYWORD_OPERATORS: ReadonlyArray<string> = [
  'if', 'else', 'return', 'const', 'let', 'var', 'function', 'class',
  'extends', 'new', 'await', 'async', 'this', 'super', 'import',
  'export', 'from', 'as', 'in', 'of', 'for', 'while', 'do', 'switch',
  'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw',
  'typeof', 'instanceof', 'void', 'delete', 'yield', 'enum', 'interface',
  'type', 'public', 'private', 'protected', 'readonly', 'static',
  'abstract', 'implements', 'with', 'default',
];

/**
 * Strip comments and string literals so they don't pollute operand
 * counts. Comments and strings ARE Halstead operands in the original
 * paper (string contents count as one operand each), but most modern
 * tools (Sonar, CodeClimate) exclude them because they don't reflect
 * program complexity. We follow the modern convention for parity.
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
 * Tokenize source into operators and operands. Returns parallel arrays
 * of the literal strings (so the caller can compute unique counts).
 */
function tokenize(source: string): { operators: string[]; operands: string[] } {
  const cleaned = stripNoise(source);
  const operators: string[] = [];
  const operands: string[] = [];

  // Build a single regex that captures operators (longest first) and
  // identifiers/numbers as the operand classes.
  const opAlt = OPERATORS.map((o) =>
    o.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  ).join('|');
  // \b keyword boundary: match whole keyword tokens but not substrings.
  const kwAlt = KEYWORD_OPERATORS.map((k) => `\\b${k}\\b`).join('|');
  const tokenRe = new RegExp(`${opAlt}|${kwAlt}|[A-Za-z_$][\\w$]*|\\d+(?:\\.\\d+)?`, 'g');

  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(cleaned)) !== null) {
    const tok = m[0];
    // Is it an operator (either punctuation or keyword)?
    if (OPERATORS.includes(tok) || KEYWORD_OPERATORS.includes(tok)) {
      operators.push(tok);
    } else if (/^[A-Za-z_$][\w$]*$/.test(tok) || /^\d/.test(tok)) {
      // Identifier or numeric literal \u2014 treat as operand.
      operands.push(tok);
    }
    // Anything else (whitespace, unmatched) is ignored.
  }

  return { operators, operands };
}

/**
 * Compute Halstead metrics from an arbitrary source string.
 */
export function computeHalstead(source: string): HalsteadMetrics {
  const { operators, operands } = tokenize(source);

  const uniqueOperators = new Set(operators);
  const uniqueOperands = new Set(operands);

  const n1 = uniqueOperators.size;
  const n2 = uniqueOperands.size;
  const N1 = operators.length;
  const N2 = operands.length;

  const vocabulary = n1 + n2;
  const length = N1 + N2;

  // Guard degenerate cases (n=0, n1=0, n2=0) \u2014 log\u2082(0) is -\u221e and
  // would NaN the whole metric. Return zeros in those cases.
  if (vocabulary === 0 || n1 === 0 || n2 === 0) {
    return {
      vocabulary: 0,
      length: 0,
      calculatedLength: 0,
      volume: 0,
      difficulty: 0,
      effort: 0,
      estimatedBugs: 0,
      n1: 0,
      n2: 0,
      N1: 0,
      N2: 0,
    };
  }

  const n = vocabulary;
  const calculatedLength =
    n1 * Math.log2(n1) + n2 * Math.log2(n2);
  const volume = length * Math.log2(n);
  const difficulty = (n1 / 2) * (N2 / n2);
  const effort = difficulty * volume;
  const estimatedBugs = Math.pow(effort, 2 / 3) / 3000;

  return {
    vocabulary,
    length,
    calculatedLength,
    volume,
    difficulty,
    effort,
    estimatedBugs,
    n1,
    n2,
    N1,
    N2,
  };
}

/**
 * Per-component Halstead: scans the source slice between `line` and
 * `endLine` (1-indexed, inclusive). Returns the file-level metrics when
 * the slice is empty (defensive).
 */
export function computeHalsteadForRange(
  source: string,
  lineOffsets: readonly number[],
  startLine: number,
  endLine: number,
): HalsteadMetrics {
  if (lineOffsets.length === 0) return computeHalstead(source);
  if (startLine < 1 || endLine < startLine) return computeHalstead(source);

  const startOffset = lineOffsets[startLine - 1] ?? 0;
  const endOffset =
    endLine < lineOffsets.length ? lineOffsets[endLine] ?? source.length : source.length;

  if (endOffset <= startOffset) {
    // Empty component \u2014 fall back to file-level so the rule has something.
    return computeHalstead(source);
  }

  return computeHalstead(source.slice(startOffset, endOffset));
}

/**
 * Cyclomatic complexity (McCabe 1976, *IEEE Trans. Software
 * Engineering*, SE-2(4)): `M = E - N + 2P` where E = decision edges,
 * N = nodes in the control flow graph, P = connected components.
 *
 * Approximated from decision-point keyword occurrences in source.
 * The approximation is intentionally conservative \u2014 we count only
 * AST-level decision nodes (function declarations + branch keywords),
 * not JSX expressions or ternary chains. Real McCabe counts:
 *   if, else if, for, while, do, case, &&, ||, ?, catch (one each)
 * We approximate with the branch keywords only.
 */
export function computeCyclomatic(source: string): number {
  if (!source.trim()) return 1;
  const cleaned = stripNoise(source);
  // M = 1 + number of decision points (functions + branches).
  // Functions add 1 because each function is its own subgraph.
  const functionCount = (cleaned.match(/\bfunction\b|\b=>\s*[{(]|\b\w+\s*\([^)]*\)\s*\{/g) ?? []).length;
  const decisionKeywords = (cleaned.match(/\bif\b|\bfor\b|\bwhile\b|\bdo\b|\bcase\b|\bcatch\b|\?[^=]/g) ?? []).length;
  return 1 + functionCount + decisionKeywords;
}
