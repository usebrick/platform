import { describe, expect, it } from 'vitest';
import { canonicalizeStyleSource } from '../../src/engine/normalize';

describe('canonicalizeStyleSource', () => {
  it('sorts whitespace-delimited class tokens', () => {
    const a = canonicalizeStyleSource('z-10 flex gap-4 p-2');
    const b = canonicalizeStyleSource('p-2 gap-4 flex z-10');
    expect(a).toBe(b);
  });

  it('normalizes calc() whitespace', () => {
    expect(canonicalizeStyleSource('w-[calc(100%-2rem)]')).toBe('w-[calc(100% - 2rem)]');
    expect(canonicalizeStyleSource('w-[calc(100%   -   2rem)]')).toBe('w-[calc(100% - 2rem)]');
  });

  it('strips JS comments', () => {
    const source = `{ color: 'red' } // line comment\n/* block */ { margin: 0 }`;
    expect(canonicalizeStyleSource(source)).toBe("{ color: 'red' } { margin: 0 }");
  });

  it('collapses whitespace', () => {
    expect(canonicalizeStyleSource('  a   b    c  ')).toBe('a b c');
  });

  it('returns identical strings for semantically equivalent sources', () => {
    const a = canonicalizeStyleSource(' p-4  m-4 /* pad */ text-red-500 ');
    const b = canonicalizeStyleSource('text-red-500 m-4 p-4');
    expect(a).toBe(b);
  });
});
