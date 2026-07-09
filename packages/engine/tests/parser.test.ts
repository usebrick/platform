import { describe, expect, it } from 'vitest';
import { parseSource } from '../src/parser';

describe('parseSource', () => {
  it('parses caller-owned source without reading the filesystem', () => {
    const result = parseSource('export const answer: number = 42;', '/does/not/exist.ts');

    expect(result.source).toBe('export const answer: number = 42;');
    expect(result.ast.type).toBe('Module');
  });

  it('preserves source text for template formats', () => {
    const source = '<script lang="ts">const answer: number = 42;</script>';
    const result = parseSource(source, '/virtual/component.vue');

    expect(result.source).toBe(source);
    expect(result.ast.type).toBe('Module');
  });

  it('routes C# through the source-preserving backend parser path', () => {
    const source = 'async Task Save() { await repository.SaveAsync(); }';
    const result = parseSource(source, '/virtual/Program.cs');

    expect(result.source).toBe(source);
    expect(result.ast.type).toBe('Module');
  });
});
