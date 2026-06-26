/**
 * Canonicalize a CSS / style source string so semantically equivalent
 * declarations compare equal.
 *
 * - Strips CSS/JS line and block comments.
 * - Collapses whitespace.
 * - Sorts whitespace-delimited class-like tokens (preserving bracket groups).
 * - Normalizes `calc()` whitespace around `+`, `-`, `*`, `/`.
 */

function tokenizeClassLike(source: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let depth = 0;

  for (const ch of source) {
    if (ch === '[') depth++;
    if (ch === ']') depth--;

    if (ch === ' ' && depth === 0) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }

  if (current.length > 0) tokens.push(current);
  return tokens;
}

function stripComments(source: string): string {
  let out = source.replace(/\/\*[\s\S]*?\*\//g, ' ');
  out = out.replace(/(^|\s)\/\/[^\n]*/g, ' ');
  return out;
}

function normalizeCalc(source: string): string {
  return source.replace(/calc\(([^()]*)\)/gi, (_match: string, body: string) => {
    const compacted = body
      .replace(/\s*([+\-*/])\s*/g, ' $1 ')
      .replace(/\s+/g, ' ')
      .trim();
    return `calc(${compacted})`;
  });
}

export function canonicalizeStyleSource(source: string): string {
  let normalized = stripComments(source);
  normalized = normalizeCalc(normalized);
  normalized = normalized.replace(/\s+/g, ' ').trim();

  // Only sort tokens for class-like strings, not style object literals.
  if (normalized.includes(' ') && !/[{};]/.test(normalized)) {
    const tokens = tokenizeClassLike(normalized);
    normalized = tokens.sort().join(' ');
  }

  return normalized;
}
