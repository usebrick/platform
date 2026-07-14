import { describe, expect, it } from 'vitest';
import { parseSource } from '@usebrick/engine';
import { extractFacts } from '../../src/engine/visitor';
import { hasFullSourceSwcCommentAst } from '../../src/engine/js-comment-lines';

function extract(filePath: string, source: string) {
  const { ast } = parseSource(source, filePath);
  return extractFacts(filePath, ast, source);
}

describe('parser-backed comment-line facts', () => {
  it.each([
    'fixture.js',
    'fixture.jsx',
    'fixture.ts',
    'fixture.tsx',
    'fixture.mjs',
    'fixture.cjs',
    'fixture.mts',
    'fixture.cts',
  ])('stores the exact SWC-backed count for %s', (filePath) => {
    const facts = extract(filePath, "const marker = '/*';\n// real comment\nconst value = 1;");
    expect(facts.v2.commentLineCount).toBe(1);
  });

  it('gives extensionless SWC input the same result as TypeScript input', () => {
    const source = "const marker = '/*';\n// real comment\nconst value = 1;";
    expect(extract('fixture', source).v2.commentLineCount).toBe(1);
    expect(extract('fixture.ts', source).v2.commentLineCount).toBe(1);
  });

  it.each([
    '<!doctype html><html><body>packages/*</body></html>',
    '<template><div>packages/*</div></template><script setup>const value = 1;</script>',
    '---\nconst value = 1;\n---\n<div>packages/*</div>',
  ])('rejects extensionless framework or HTML source instead of guessing JS', (source) => {
    const placeholderAst = parseSource('const value = 1;', 'fixture.ts').ast;
    expect(hasFullSourceSwcCommentAst('fixture', placeholderAst, source)).toBe(false);
  });

  it.each(['fixture.d.ts', 'fixture.d.mts', 'fixture.d.cts'])(
    'rejects declaration placeholder ASTs from parser-backed metric admission for %s',
    (filePath) => {
      const source = '// apparent comment\nexport interface Value { id: string }';
      const { ast } = parseSource(source, filePath);
      expect(hasFullSourceSwcCommentAst(filePath, ast, source)).toBe(false);
    },
  );

  it.each([
    'fixture.py',
    'fixture.go',
    'fixture.rs',
    'fixture.java',
    'fixture.kt',
    'fixture.swift',
    'fixture.dart',
    'fixture.vue',
    'fixture.svelte',
    'fixture.astro',
    'fixture.html',
    'fixture.d.ts',
    'fixture.d.mts',
    'fixture.d.cts',
  ])('leaves parser-backed comment count undefined for %s', (filePath) => {
    const facts = extract(filePath, '// apparent comment\nconst value = 1;');
    expect(facts.v2.commentLineCount).toBeUndefined();
  });
});
