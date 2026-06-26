// Business Logic Intelligence (Phase 7).
//
// Surfaces naming and structural anti-patterns in three categories where
// AI-generated code consistently makes the same mistakes:
//
//   1. Pricing    (weight 3) — wrong currency math, magic tax rates, raw
//                             currency-symbol string-concat instead of
//                             Intl.NumberFormat.
//   2. Validation (weight 2) — `z.string()` without `.min()` / `.email()`,
//                             missing error messages on zod schemas.
//   3. Formatting (weight 1) — hardcoded ISO date strings, `toLocaleString()`
//                             with no options, raw numbers inside template
//                             literals instead of Intl.NumberFormat.
//
// These are *anti-pattern detectors*, not first-class Rule objects. They
// live in this module (not in `src/rules/<category>/`) because they're
// computed project-wide, not per-component, and they don't plug into the
// rule registry. They are called by `runBusinessLogicScan` (the CLI
// subcommand) and by the scan pipeline.
//
// The score formula is per-file-density: `clamp(0, 100, 100 - (issueWeight
// / scannedFiles) * 100)`. That means a single pricing issue in a 10-file
// project scores 70; the same issue in a 1000-file project scores 97.
// Project size normalizes so the headline score is comparable across
// monorepos and small SaaS starters.
//
// Implementation note: detection is regex-first. AST confirmation is only
// used for `business-logic/magic-rate-decimal` (the high-risk, high-FP
// rule) — for every candidate line we walk the enclosing
// BinaryExpression to confirm the right-hand operand is a NumericLiteral
// (not a `obj.rate` MemberExpression). Other rules are pure regex; AST
// confirmation would add cost without changing the answer materially.

import { parseSync } from '@swc/core';
import type { Module, BinaryExpression, Expression, Node } from '@swc/core';

// -----------------------------------------------------------------------------
// Public types
// -----------------------------------------------------------------------------

export type BusinessLogicCategory = 'pricing' | 'validation' | 'formatting';

export interface BusinessLogicIssue {
  category: BusinessLogicCategory;
  filePath: string;
  line: number;
  column: number;
  ruleId: string;
  message: string;
  advice?: string;
}

export interface BusinessLogicReport {
  /** Final 0-100 score (100 = perfectly clean). */
  score: number;
  /** How many files were scanned to produce the score. */
  scannedFiles: number;
  /** All detected issues, in detection order. */
  issues: BusinessLogicIssue[];
  /** Counts grouped by category. */
  byCategory: Record<BusinessLogicCategory, number>;
  /** Total weighted issue points (sum of categoryWeight × count). */
  weight: number;
  /** Top-level summary line for terminal output. */
  headline: string;
}

// -----------------------------------------------------------------------------
// Category weights (the only knob that controls the score formula).
// -----------------------------------------------------------------------------

export const BUSINESS_LOGIC_WEIGHTS = {
  pricing: 3,
  validation: 2,
  formatting: 1,
} as const;

// Currency-adjacent identifier names. Matched case-insensitively on whole
// words. Drives `hardcoded-currency-symbol` and `raw-currency-in-template`.
const CURRENCY_IDENTIFIERS =
  /\b(price|amount|total|subtotal|cost|fee|sum|grandtotal|net|gross)\b/i;

// Common "round" rates we don't want to flag. `0.5`, `0.25`, `0.1`, etc.
// are used legitimately in many contexts; flagging them would be high-
// volume noise. Anything not on this list and not 0/1 fires.
const COMMON_RATE_LITERALS = new Set([
  '0.5',
  '0.25',
  '0.1',
  '0.05',
  '0.01',
  '1.0',
  '1',
  '0',
]);

// Regex families — one per rule. Anchored to scan a single line at a time
// (we split source on `\n` upstream) so we can compute `column` cheaply.

// 1. pricing/math-round-cents — `Math.round(price * 100) / 100` and the
// missing-divide variant `Math.round(price * 100)`. Either form breaks
// floating-point currency math; the right pattern is to multiply then
// divide by 100 only when rounding to cents is intentional, with an
// explicit Number.EPSILON adjustment to dodge 0.1 + 0.2 = 0.30000000000000004.
const MATH_ROUND_CENTS = /Math\.round\s*\(\s*[A-Za-z_$][\w$.]*\s*\*\s*100\s*\)/;

// 2. pricing/magic-rate-decimal — `* 0.0825` style. AST confirmation
// lives in `confirmMagicRateLiteral`; the regex here just finds
// candidate lines so the AST walk has a small input set.
const MAGIC_RATE_DECIMAL = /\*\s*\d+\.\d{2,}/g;

// 3. pricing/hardcoded-currency-symbol — `$`/`€`/`£`/`¥` adjacent to a
// currency-adjacent identifier. We allow the symbol to appear on either
// side of the identifier; the heuristic is "raw string concat of currency".
const HARDCODED_CURRENCY_SYMBOL =
  /(['"`])[^'"`\n]*[€£¥][^'"`\n]*\1|\$\s*[A-Za-z_$][\w$]*|[A-Za-z_$][\w$]*\s*\$/;

// 4. validation/unconstrained-zod-string — `z.string()` (and friends)
// not followed by `.min` / `.max` / `.email` / etc. within 80 chars.
// The "not followed within 80 chars" check lives in
// `findUnconstrainedZodSchemas` because regex lookahead with character
// limits is awkward to express inline.
const ZOD_STRING = /z\.string\s*\(\s*\)/;

// 5. validation/missing-error-message — file-level proxy: if a file has
// ≥ 3 `z.string(...)` calls and zero `required_error:`/`invalid_type_error:`
// strings, the schema is missing top-level error messages. We pick the
// first `z.string(` line as the report line.
const ZOD_STRING_CALL = /z\.string\s*\(/g;
const REQUIRED_ERROR = /required_error\s*:/;
const INVALID_TYPE_ERROR = /invalid_type_error\s*:/;

// 6. formatting/hardcoded-iso-date — `new Date('2020-01-01')`. Skips
// inside `// TODO` / `// FIXME` comments; the assumption is the dev
// knows it's a placeholder.
const HARDCODED_ISO_DATE = /new\s+Date\s*\(\s*['"]\d{4}-\d{2}-\d{2}['"]\s*\)/;

// 7. formatting/locale-string-no-options — `toLocaleString()` with no
// second argument. Pure regex; nothing to AST-confirm.
const LOCALE_STRING_NO_OPTIONS = /\.toLocaleString\s*\(\s*\)/;

// 8. formatting/raw-currency-in-template — `${price} USD` etc.
// Excludes files that already use Intl.NumberFormat anywhere.
const RAW_CURRENCY_IN_TEMPLATE = /\$\{[^}]*\b[A-Za-z_$][\w$]*\b[^}]*\}\s*(?:USD|EUR|GBP|JPY|CAD|AUD)|(?:USD|EUR|GBP|JPY|CAD|AUD)\s*\$\{/;

// -----------------------------------------------------------------------------
// AST confirmation for magic-rate-decimal
// -----------------------------------------------------------------------------

/**
 * For each `* 0.XXXX` candidate line, walk the enclosing AST node and
 * confirm the literal is a NumericLiteral (not a `obj.rate`
 * MemberExpression). We parse the single line with @swc/core and inspect
 * the resulting expression. If parse fails (rare — JS is forgiving),
 * we fall back to "regex-only match", which matches the
 * `pragmatic/fire-on-candidate` philosophy from the plan.
 */
function confirmMagicRateLiteral(line: string): boolean {
  // Wrap the line in a no-op statement so swc treats it as an expression
  // statement (matches how it would appear inside a real source file).
  const probe = `let __probe = (${line});`;
  let ast: Module;
  try {
    ast = parseSync(probe, { syntax: 'ecmascript', target: 'es2022' });
  } catch {
    // Parse failed — fall back to regex-only match.
    return true;
  }

  // Find the first BinaryExpression whose operator is '*' and whose right
  // operand is a NumericLiteral.
  const found = findMultiplicationWithNumericRhs(ast);
  return Boolean(found);
}

function findMultiplicationWithNumericRhs(node: Node | undefined): boolean {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) {
    for (const child of node) {
      if (findMultiplicationWithNumericRhs(child as Node)) return true;
    }
    return false;
  }
  const obj = node as unknown as Record<string, unknown>;
  if (obj.type === 'BinaryExpression') {
    const bin = obj as unknown as BinaryExpression;
    if (bin.operator === '*' && isNumericLiteral(bin.right)) {
      return true;
    }
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') {
      if (findMultiplicationWithNumericRhs(value as Node)) return true;
    }
  }
  return false;
}

function isNumericLiteral(expr: Expression | undefined): boolean {
  if (!expr) return false;
  const obj = expr as unknown as Record<string, unknown>;
  return obj.type === 'NumericLiteral';
}

// -----------------------------------------------------------------------------
// Detectors — one per rule, each returns 0..N issues for the given source.
// -----------------------------------------------------------------------------

interface DetectorContext {
  filePath: string;
  source: string;
}

function detectMathRoundCents(ctx: DetectorContext): BusinessLogicIssue[] {
  const issues: BusinessLogicIssue[] = [];
  const lines = ctx.source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (MATH_ROUND_CENTS.test(line)) {
      const column = (line.match(MATH_ROUND_CENTS)?.index ?? 0) + 1;
      issues.push({
        category: 'pricing',
        filePath: ctx.filePath,
        line: i + 1,
        column,
        ruleId: 'business-logic/math-round-cents',
        message: `Math.round(${extractIdentifier(line)} * 100) is the AI default for cents rounding — use Intl.NumberFormat or an explicit Number.EPSILON adjustment`,
        advice: 'Replace with `(Math.round((price + Number.EPSILON) * 100) / 100).toFixed(2)` or `new Intl.NumberFormat(locale, { style: "currency", currency }).format(price)`.',
      });
    }
  }
  return issues;
}

function detectMagicRateDecimal(ctx: DetectorContext): BusinessLogicIssue[] {
  const issues: BusinessLogicIssue[] = [];
  const lines = ctx.source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.trim().startsWith('//')) continue; // skip comment lines
    MAGIC_RATE_DECIMAL.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MAGIC_RATE_DECIMAL.exec(line)) !== null) {
      const literal = m[0].replace(/^\*\s*/, '');
      if (COMMON_RATE_LITERALS.has(literal)) continue;
      // AST confirmation: only fire if the right-hand operand is a literal.
      if (!confirmMagicRateLiteral(line)) continue;
      issues.push({
        category: 'pricing',
        filePath: ctx.filePath,
        line: i + 1,
        column: m.index + 1,
        ruleId: 'business-logic/magic-rate-decimal',
        message: `magic rate literal ${literal} — no source-of-truth constant`,
        advice: 'Extract to a named constant (e.g. `const TAX_RATE = 0.0825`) or pull from config so the value is auditable.',
      });
    }
  }
  return issues;
}

function detectHardcodedCurrencySymbol(ctx: DetectorContext): BusinessLogicIssue[] {
  const issues: BusinessLogicIssue[] = [];
  const lines = ctx.source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.trim().startsWith('//')) continue;
    if (line.trim().startsWith('*')) continue; // JSDoc / block-comment
    if (!HARDCODED_CURRENCY_SYMBOL.test(line)) continue;
    if (!CURRENCY_IDENTIFIERS.test(line)) continue;
    const column = (line.match(HARDCODED_CURRENCY_SYMBOL)?.index ?? 0) + 1;
    issues.push({
      category: 'pricing',
      filePath: ctx.filePath,
      line: i + 1,
      column,
      ruleId: 'business-logic/hardcoded-currency-symbol',
      message: 'hardcoded currency symbol adjacent to a price/amount identifier — use Intl.NumberFormat',
      advice: 'Replace `${total}$` with `new Intl.NumberFormat(locale, { style: "currency", currency }).format(total)`.',
    });
  }
  return issues;
}

function detectUnconstrainedZodString(ctx: DetectorContext): BusinessLogicIssue[] {
  const issues: BusinessLogicIssue[] = [];
  const lines = ctx.source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!ZOD_STRING.test(line)) continue;
    // Look at the next 80 chars (across continuation lines if needed) for
    // any "constraining" method call. If none, fire.
    const window = collectWindow(lines, i, 80);
    if (/\.(min|max|email|url|regex|length|uuid|minLength|maxLength|trim|toLowerCase|toUpperCase)\s*\(/.test(window)) {
      continue;
    }
    const column = (line.match(ZOD_STRING)?.index ?? 0) + 1;
    issues.push({
      category: 'validation',
      filePath: ctx.filePath,
      line: i + 1,
      column,
      ruleId: 'business-logic/unconstrained-zod-string',
      message: 'z.string() with no .min() / .email() / .url() constraint — accepts arbitrary input',
      advice: 'Add a constraint: `z.string().min(1)`, `z.string().email()`, or `z.string().url()`.',
    });
  }
  return issues;
}

function detectMissingErrorMessage(ctx: DetectorContext): BusinessLogicIssue[] {
  // File-level proxy: if ≥3 z.string() calls and 0 required_error / invalid_type_error, fire once.
  ZOD_STRING_CALL.lastIndex = 0;
  const matches = [...ctx.source.matchAll(ZOD_STRING_CALL)];
  if (matches.length < 3) return [];
  if (REQUIRED_ERROR.test(ctx.source) || INVALID_TYPE_ERROR.test(ctx.source)) {
    return [];
  }
  const first = matches[0];
  if (!first || first.index === undefined) return [];
  const { line, column } = offsetToLineColumn(ctx.source, first.index);
  return [
    {
      category: 'validation',
      filePath: ctx.filePath,
      line,
      column,
      ruleId: 'business-logic/missing-error-message',
      message: `file has ${matches.length} z.string() schemas but no required_error / invalid_type_error — error UX is undefined`,
      advice: 'Add `required_error: "..."` (or `invalid_type_error`) to your top-level z.object({ ... }) so users get actionable feedback.',
    },
  ];
}

function detectHardcodedIsoDate(ctx: DetectorContext): BusinessLogicIssue[] {
  const issues: BusinessLogicIssue[] = [];
  const lines = ctx.source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (/TODO|FIXME/.test(line) && line.trim().startsWith('//')) continue;
    const m = HARDCODED_ISO_DATE.exec(line);
    if (!m) continue;
    issues.push({
      category: 'formatting',
      filePath: ctx.filePath,
      line: i + 1,
      column: m.index + 1,
      ruleId: 'business-logic/hardcoded-iso-date',
      message: `new Date('${m[0].match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? 'YYYY-MM-DD'}') hardcoded in business logic`,
      advice: 'Hoist the date to a named constant or read it from config / env so it can change without code edits.',
    });
  }
  return issues;
}

function detectLocaleStringNoOptions(ctx: DetectorContext): BusinessLogicIssue[] {
  const issues: BusinessLogicIssue[] = [];
  const lines = ctx.source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const m = LOCALE_STRING_NO_OPTIONS.exec(line);
    if (!m) continue;
    issues.push({
      category: 'formatting',
      filePath: ctx.filePath,
      line: i + 1,
      column: m.index + 1,
      ruleId: 'business-logic/locale-string-no-options',
      message: 'toLocaleString() with no options — locale defaults to the runtime, not the user',
      advice: 'Pass `(locale, options)`: `date.toLocaleString("en-US", { dateStyle: "medium" })`.',
    });
  }
  return issues;
}

function detectRawCurrencyInTemplate(ctx: DetectorContext): BusinessLogicIssue[] {
  if (/Intl\.NumberFormat/.test(ctx.source)) return []; // the file already does it right
  const issues: BusinessLogicIssue[] = [];
  const lines = ctx.source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const m = RAW_CURRENCY_IN_TEMPLATE.exec(line);
    if (!m) continue;
    issues.push({
      category: 'formatting',
      filePath: ctx.filePath,
      line: i + 1,
      column: m.index + 1,
      ruleId: 'business-logic/raw-currency-in-template',
      message: 'raw number in template literal adjacent to a currency code — use Intl.NumberFormat',
      advice: 'Replace `${total} USD` with `new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(total)`.',
    });
  }
  return issues;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Analyze a single source string and return all detected business-logic
 * anti-pattern issues. Order: pricing → validation → formatting (matches
 * the report output ordering).
 */
export function analyzeBusinessLogic(source: string, filePath: string): BusinessLogicIssue[] {
  const ctx: DetectorContext = { filePath, source };
  const issues: BusinessLogicIssue[] = [
    ...detectMathRoundCents(ctx),
    ...detectMagicRateDecimal(ctx),
    ...detectHardcodedCurrencySymbol(ctx),
    ...detectUnconstrainedZodString(ctx),
    ...detectMissingErrorMessage(ctx),
    ...detectHardcodedIsoDate(ctx),
    ...detectLocaleStringNoOptions(ctx),
    ...detectRawCurrencyInTemplate(ctx),
  ];
  // Deterministic order: by line, then column.
  issues.sort((a, b) => (a.line - b.line) || (a.column - b.column));
  return issues;
}

/**
 * Build a `BusinessLogicReport` from a flat list of issues. Pure —
 * callers compose this with `discoverFiles` + `analyzeBusinessLogic`
 * for the file-scan path, or feed synthetic issues for unit tests.
 */
export function buildBusinessLogicReport(
  issues: BusinessLogicIssue[],
  scannedFiles: number,
): BusinessLogicReport {
  return buildBusinessLogicReportFromIssues(issues, scannedFiles);
}

/**
 * Pure variant of `buildBusinessLogicReport`. Exported so unit tests can
 * assert on the score formula with synthetic issues + file counts.
 */
export function buildBusinessLogicReportFromIssues(
  issues: BusinessLogicIssue[],
  scannedFiles: number,
): BusinessLogicReport {
  const byCategory: Record<BusinessLogicCategory, number> = {
    pricing: 0,
    validation: 0,
    formatting: 0,
  };
  let weight = 0;
  for (const issue of issues) {
    byCategory[issue.category] += 1;
    weight += BUSINESS_LOGIC_WEIGHTS[issue.category];
  }
  const files = Math.max(0, Math.floor(scannedFiles));
  // Edge cases: 0 files → score 100 (no files, no issues); weight ≥ files → 0.
  let score: number;
  if (files === 0) {
    score = 100;
  } else {
    score = 100 - (weight / files) * 100;
    score = Math.max(0, Math.min(100, score));
  }
  const headline = `Business Logic Coherence: ${Math.round(score)}/100`;
  return {
    score: Math.round(score),
    scannedFiles: files,
    issues,
    byCategory,
    weight,
    headline,
  };
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function collectWindow(lines: string[], startLine: number, maxChars: number): string {
  let buf = '';
  for (let i = startLine; i < lines.length && buf.length < maxChars; i++) {
    buf += (lines[i] ?? '') + ' ';
  }
  return buf.slice(0, maxChars);
}

function offsetToLineColumn(source: string, offset: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

function extractIdentifier(line: string): string {
  const m = line.match(/Math\.round\s*\(\s*([A-Za-z_$][\w$.]*)/);
  return m ? (m[1] ?? '') : '<expr>';
}