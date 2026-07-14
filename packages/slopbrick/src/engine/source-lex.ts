/**
 * Small, allocation-conscious lexical helpers for rules that still need to
 * inspect source text. These helpers deliberately do not try to replace a
 * parser; they only keep comments and nested string/regex contents from
 * being mistaken for executable source by a rule-level heuristic.
 */

export interface SourceStringToken {
  /** UTF-16 offset of the opening quote/backtick. */
  start: number;
  /** UTF-16 offset immediately after the closing quote/backtick. */
  end: number;
  quote: "'" | '"' | '`';
  /** Raw contents between the delimiters (escapes are not decoded). */
  content: string;
}

/**
 * Replace JavaScript/CSS-style comments with spaces while preserving line
 * terminators and offsets. String and template literal contents are copied
 * verbatim, so URLs and comment-looking text in a string remain data rather
 * than being removed.
 */
export function maskJsComments(source: string): string {
  const chars = source.split('');
  let state: 'code' | 'single' | 'double' | 'template' | 'line' | 'block' = 'code';
  let escaped = false;

  const blank = (index: number): void => {
    const ch = chars[index];
    if (ch !== '\n' && ch !== '\r') chars[index] = ' ';
  };

  for (let index = 0; index < chars.length; index++) {
    const ch = chars[index] ?? '';
    const next = chars[index + 1] ?? '';

    if (state === 'line') {
      if (ch === '\n' || ch === '\r') state = 'code';
      else blank(index);
      continue;
    }
    if (state === 'block') {
      if (ch === '*' && next === '/') {
        blank(index);
        blank(index + 1);
        index++;
        state = 'code';
      } else {
        blank(index);
      }
      continue;
    }

    if (state === 'single' || state === 'double' || state === 'template') {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (
        (state === 'single' && ch === "'") ||
        (state === 'double' && ch === '"') ||
        (state === 'template' && ch === '`')
      ) {
        state = 'code';
      }
      continue;
    }

    if (ch === '/' && next === '/') {
      blank(index);
      blank(index + 1);
      index++;
      state = 'line';
    } else if (ch === '/' && next === '*') {
      blank(index);
      blank(index + 1);
      index++;
      state = 'block';
    } else if (ch === '/' && isRegexStart(source, index)) {
      // A `//` inside a regex literal is data, not a line comment.
      index = Math.max(index, skipRegex(source, index) - 1);
    } else if (ch === "'") {
      state = 'single';
      escaped = false;
    } else if (ch === '"') {
      state = 'double';
      escaped = false;
    } else if (ch === '`') {
      state = 'template';
      escaped = false;
    }
  }

  return chars.join('');
}

function isRegexStart(source: string, slash: number): boolean {
  let index = slash - 1;
  while (index >= 0 && /\s/u.test(source[index] ?? '')) index--;
  if (index < 0) return true;
  const previous = source[index] ?? '';
  if ('([{=,:;!?&|+-*%^~<>'.includes(previous)) return true;
  // `return /.../`, `throw /.../`, and `case /.../` are common starts.
  let end = index + 1;
  while (index >= 0 && /[A-Za-z_$]/u.test(source[index] ?? '')) index--;
  const word = source.slice(index + 1, end);
  return word === 'return' || word === 'throw' || word === 'case' || word === 'else';
}

function skipRegex(source: string, start: number): number {
  let inClass = false;
  let escaped = false;
  for (let index = start + 1; index < source.length; index++) {
    const ch = source[index] ?? '';
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '[') {
      inClass = true;
      continue;
    }
    if (ch === ']') {
      inClass = false;
      continue;
    }
    if (ch === '/' && !inClass) {
      index++;
      while (/[A-Za-z]/u.test(source[index] ?? '')) index++;
      return index;
    }
    if (ch === '\n' || ch === '\r') return start + 1;
  }
  return source.length;
}

function skipQuoted(source: string, start: number, quote: "'" | '"'): number {
  let escaped = false;
  for (let index = start + 1; index < source.length; index++) {
    const ch = source[index] ?? '';
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === quote) return index + 1;
    if (ch === '\n' || ch === '\r') return index;
  }
  return source.length;
}

/** Skip a `${ ... }` expression inside a template literal. */
function skipTemplateExpression(source: string, start: number): number {
  let depth = 1;
  for (let index = start; index < source.length; index++) {
    const ch = source[index] ?? '';
    const next = source[index + 1] ?? '';
    if (ch === '/' && next === '/') {
      index += 2;
      while (index < source.length && source[index] !== '\n' && source[index] !== '\r') index++;
      index--;
      continue;
    }
    if (ch === '/' && next === '*') {
      const close = source.indexOf('*/', index + 2);
      index = close < 0 ? source.length : close + 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      index = skipQuoted(source, index, ch);
      index--;
      continue;
    }
    if (ch === '`') {
      index = skipTemplate(source, index);
      index--;
      continue;
    }
    if (ch === '/' && isRegexStart(source, index)) {
      index = skipRegex(source, index);
      index--;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return index + 1;
  }
  return source.length;
}

function skipTemplate(source: string, start: number): number {
  let escaped = false;
  for (let index = start + 1; index < source.length; index++) {
    const ch = source[index] ?? '';
    const next = source[index + 1] ?? '';
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '`') return index + 1;
    if (ch === '$' && next === '{') {
      index = skipTemplateExpression(source, index + 2);
      index--;
    }
  }
  return source.length;
}

/**
 * Extract top-level JS string/template literals. Comments and regex literals
 * are skipped. This is intentionally a lexical helper, not a parser; callers
 * should still keep their language/AST gates conservative.
 */
export function scanJsStringTokens(source: string): SourceStringToken[] {
  const tokens: SourceStringToken[] = [];
  let index = 0;
  while (index < source.length) {
    const ch = source[index] ?? '';
    const next = source[index + 1] ?? '';
    if (ch === '/' && next === '/') {
      index += 2;
      while (index < source.length && source[index] !== '\n' && source[index] !== '\r') index++;
      continue;
    }
    if (ch === '/' && next === '*') {
      const close = source.indexOf('*/', index + 2);
      index = close < 0 ? source.length : close + 2;
      continue;
    }
    if (ch === '/' && next !== '/' && next !== '*' && isRegexStart(source, index)) {
      index = skipRegex(source, index);
      continue;
    }
    if (ch === "'" || ch === '"') {
      const end = skipQuoted(source, index, ch);
      if (end > index + 1 && source[end - 1] === ch) {
        tokens.push({ start: index, end, quote: ch, content: source.slice(index + 1, end - 1) });
      }
      index = Math.max(end, index + 1);
      continue;
    }
    if (ch === '`') {
      const end = skipTemplate(source, index);
      if (end > index + 1 && source[end - 1] === '`') {
        tokens.push({ start: index, end, quote: '`', content: source.slice(index + 1, end - 1) });
      }
      index = Math.max(end, index + 1);
      continue;
    }
    index++;
  }
  return tokens;
}
