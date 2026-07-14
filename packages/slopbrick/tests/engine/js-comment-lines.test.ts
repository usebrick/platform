import { describe, expect, it } from 'vitest';
import { parseSource } from '@usebrick/engine';
import {
  countNonEmptyJsLines,
  countSwcCommentLines,
  JS_COMMENT_LINE_METRIC_ID,
} from '../../src/engine/js-comment-lines';

function count(source: string, filePath = 'fixture.tsx'): number {
  return countSwcCommentLines(parseSource(source, filePath).ast, source);
}

describe('countSwcCommentLines', () => {
  it('exposes a stable parser-backed metric identity', () => {
    expect(JS_COMMENT_LINE_METRIC_ID).toBe('swc-js-comment-lines-v1');
  });

  it('ignores comment delimiters in whole-line comments, strings, and regex literals', () => {
    const source = [
      '// The CLI glob cli/* is intentional.',
      "const pattern = '/*';",
      'const matcher = /`/;',
      'const quotes = /[\'\"]/;',
      'const value = 1;',
    ].join('\n');

    expect(count(source, 'fixture.ts')).toBe(1);
  });

  it('ignores markers and lone quotes inside multiline JSX prose', () => {
    const source = [
      'export const View = () => (',
      '  <section>',
      '    packages/* is prose.',
      "    Press ` once; don't treat either mark as code.",
      '  </section>',
      ');',
      '// A real comment.',
    ].join('\n');

    expect(count(source, 'fixture.tsx')).toBe(1);
  });

  it('masks template quasis but counts comments inside interpolation expressions', () => {
    const source = [
      'const rendered = `packages/* ${',
      '  // Explain the interpolated value.',
      '  value /* opening block',
      '   * continued',
      '   */',
      '}`;',
    ].join('\n');

    expect(count(source, 'fixture.ts')).toBe(4);
  });

  it('uses SWC byte spans correctly when Unicode precedes protected literals and comments', () => {
    const source = [
      'const café = "é/*";',
      'const matcher = /é`/;',
      '// comentário real',
      'const π = 1;',
      '/* bloco real',
      ' * fim',
      ' */',
    ].join('\n');

    expect(count(source, 'fixture.ts')).toBe(4);
  });

  it('counts a leading hashbang and whole-line comments but excludes inline comments', () => {
    const source = [
      '#!/usr/bin/env node',
      'const value = 1; // inline comment',
      '  // whole-line comment',
    ].join('\n');

    expect(count(source, 'fixture.js')).toBe(2);
  });

  it('counts non-empty lines in multiline blocks and excludes closed same-line blocks', () => {
    const source = [
      '/* closed on one line */',
      'const value = 1; /* also closed */',
      '/* opening line',
      '   ',
      ' * body line',
      ' */',
    ].join('\n');

    expect(count(source, 'fixture.ts')).toBe(3);
  });

  it.each([
    ['LF', '\n'],
    ['CRLF', '\r\n'],
    ['CR', '\r'],
    ['LINE SEPARATOR', '\u2028'],
    ['PARAGRAPH SEPARATOR', '\u2029'],
  ])('treats %s as a whole-line // boundary', (_name, separator) => {
    const source = ['// first', '// second', 'const value = 1;'].join(separator);
    expect(count(source, 'fixture.js')).toBe(2);
    expect(countNonEmptyJsLines(source)).toBe(3);
  });

  it.each([
    ['LF', '\n'],
    ['CRLF', '\r\n'],
    ['CR', '\r'],
    ['LINE SEPARATOR', '\u2028'],
    ['PARAGRAPH SEPARATOR', '\u2029'],
  ])('counts multiline blocks across %s', (_name, separator) => {
    const source = ['/* first', ' */', '/* second', ' */'].join(separator);
    expect(count(source, 'fixture.js')).toBe(4);
  });

  it('protects adjacent comment-like markers inside valid regex character classes', () => {
    const source = [
      'const blockLike = /[/*]/;',
      'const lineLike = /[//]/;',
      '// A real comment.',
    ].join('\n');
    expect(count(source, 'fixture.js')).toBe(1);
  });
});
