import { describe, expect, it } from 'vitest';
import {
  parseDtcgTokens,
  flattenDtcgTokens,
  inferCategory,
  summarizeTokens,
  tokensToAllowlist,
} from '../src/cli/tokens';

describe('parseDtcgTokens', () => {
  it('parses a flat DTCG tokens.json with $value leaves', () => {
    const raw = JSON.stringify({
      color: {
        primary: { $value: '#ff0000', $type: 'color' },
        muted: { $value: '#888888', $type: 'color' },
      },
    });
    const result = parseDtcgTokens(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tree).toEqual({
        color: {
          primary: { $value: '#ff0000', $type: 'color' },
          muted: { $value: '#888888', $type: 'color' },
        },
      });
    }
  });

  it('returns error for invalid JSON', () => {
    const result = parseDtcgTokens('not json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/JSON/i);
  });

  it('returns error for non-object root', () => {
    const result = parseDtcgTokens('null');
    expect(result.ok).toBe(false);
  });
});

describe('flattenDtcgTokens', () => {
  it('flattens nested tokens into {path → value} pairs', () => {
    const tree = {
      color: {
        primary: { $value: '#ff0000', $type: 'color' },
        nested: {
          deep: { $value: '4px', $type: 'dimension' },
        },
      },
    };
    const flat = flattenDtcgTokens(tree);
    expect(flat).toEqual([
      { path: 'color.primary', value: '#ff0000', type: 'color' },
      { path: 'color.nested.deep', value: '4px', type: 'dimension' },
    ]);
  });

  it('handles $value at root', () => {
    const tree = { root: { $value: '1px' } };
    const flat = flattenDtcgTokens(tree);
    expect(flat).toEqual([{ path: 'root', value: '1px', type: undefined }]);
  });

  it('skips branches that are pure objects (no $value at any level)', () => {
    const tree = {
      color: {
        brand: { $value: '#fff', $type: 'color' },
      },
      meta: {
        // meta itself is a branch with no $value leaf at any depth
        info: { author: 'team' },
      },
    };
    const flat = flattenDtcgTokens(tree);
    expect(flat.length).toBe(1);
    expect(flat[0].path).toBe('color.brand');
  });
});

describe('inferCategory', () => {
  it('infers visual category from color tokens', () => {
    expect(inferCategory({ path: 'color.primary', value: '#fff', type: 'color' })).toBe('visual');
  });

  it('infers layout category from dimension tokens', () => {
    expect(inferCategory({ path: 'spacing.sm', value: '4px', type: 'dimension' })).toBe('layout');
  });

  it('infers typo category from fontFamily / fontWeight tokens', () => {
    expect(inferCategory({ path: 'font.body', value: 'Inter', type: 'fontFamily' })).toBe('typo');
    expect(inferCategory({ path: 'font.weight', value: '400', type: 'fontWeight' })).toBe('typo');
  });

  it('returns undefined for tokens without a recognizable category', () => {
    expect(inferCategory({ path: 'breakpoint.md', value: '768px', type: 'unknown' })).toBeUndefined();
  });

  it('uses path heuristics when $type is missing', () => {
    expect(inferCategory({ path: 'color.brand', value: '#000' })).toBe('visual');
    expect(inferCategory({ path: 'radius.md', value: '8px' })).toBe('layout');
  });
});

describe('summarizeTokens', () => {
  it('groups tokens by category and counts unmatched', () => {
    const tree = {
      color: {
        primary: { $value: '#ff0000', $type: 'color' },
        accent: { $value: '#00ff00', $type: 'color' },
      },
      spacing: {
        sm: { $value: '4px', $type: 'dimension' },
      },
      breakpoint: {
        md: { $value: '768px' },
      },
    };
    const summary = summarizeTokens(tree);
    expect(summary.byCategory.visual).toEqual(['color.primary', 'color.accent']);
    expect(summary.byCategory.layout).toEqual(['spacing.sm']);
    expect(summary.unmatched).toEqual(['breakpoint.md']);
    expect(summary.total).toBe(4);
  });
});

describe('tokensToAllowlist (round 21)', () => {
  it('returns regexes matching layout classNames like p-[17px] for spacing tokens', () => {
    const tree = {
      spacing: {
        xxl: { $value: '17px', $type: 'dimension' },
      },
    };
    const allowlist = tokensToAllowlist(tree);
    const regexes = allowlist.filter((e): e is RegExp => e instanceof RegExp);
    expect(regexes.some((r) => r.test('p-[17px]'))).toBe(true);
    expect(regexes.some((r) => r.test('m-[17px]'))).toBe(true);
    expect(regexes.some((r) => r.test('gap-[17px]'))).toBe(true);
  });

  it('does not match classNames with a different value', () => {
    const tree = {
      spacing: {
        xxl: { $value: '17px', $type: 'dimension' },
      },
    };
    const allowlist = tokensToAllowlist(tree);
    const regexes = allowlist.filter((e): e is RegExp => e instanceof RegExp);
    expect(regexes.some((r) => r.test('p-[99px]'))).toBe(false);
  });

  it('skips non-layout tokens (visual colors are not in arbitrary-value allowlist)', () => {
    const tree = {
      color: {
        primary: { $value: '#ff0000', $type: 'color' },
      },
    };
    const allowlist = tokensToAllowlist(tree);
    expect(allowlist).toEqual([]);
  });

  it('skips tokens with non-numeric values (typography fontFamily etc.)', () => {
    const tree = {
      font: {
        body: { $value: 'Inter', $type: 'fontFamily' },
      },
    };
    const allowlist = tokensToAllowlist(tree);
    expect(allowlist).toEqual([]);
  });

  it('handles rem values', () => {
    const tree = {
      spacing: {
        md: { $value: '1rem', $type: 'dimension' },
      },
    };
    const allowlist = tokensToAllowlist(tree);
    const regexes = allowlist.filter((e): e is RegExp => e instanceof RegExp);
    expect(regexes.some((r) => r.test('p-[1rem]'))).toBe(true);
  });

  it('escapes regex metacharacters in token values', () => {
    const tree = {
      spacing: {
        x: { $value: '1.5rem', $type: 'dimension' },
      },
    };
    const allowlist = tokensToAllowlist(tree);
    const regexes = allowlist.filter((e): e is RegExp => e instanceof RegExp);
    expect(regexes.some((r) => r.test('p-[1.5rem]'))).toBe(true);
    // The literal "." must not act as a wildcard
    expect(regexes.some((r) => r.test('p-[1X5rem]'))).toBe(false);
  });

  it('returns an empty array for empty tree', () => {
    expect(tokensToAllowlist({})).toEqual([]);
  });
});

describe('tokensToAllowlist — round 22 prefix coverage', () => {
  it('covers space-x and space-y prefixes', () => {
    const tree = {
      spacing: { sm: { $value: '4px', $type: 'dimension' } },
    };
    const allowlist = tokensToAllowlist(tree);
    const regexes = allowlist.filter((e): e is RegExp => e instanceof RegExp);
    expect(regexes.some((r) => r.test('space-x-[4px]'))).toBe(true);
    expect(regexes.some((r) => r.test('space-y-[4px]'))).toBe(true);
  });

  it('covers positioning prefixes (top/right/bottom/left)', () => {
    const tree = {
      inset: { md: { $value: '8px', $type: 'dimension' } },
    };
    const allowlist = tokensToAllowlist(tree);
    const regexes = allowlist.filter((e): e is RegExp => e instanceof RegExp);
    expect(regexes.some((r) => r.test('top-[8px]'))).toBe(true);
    expect(regexes.some((r) => r.test('right-[8px]'))).toBe(true);
    expect(regexes.some((r) => r.test('bottom-[8px]'))).toBe(true);
    expect(regexes.some((r) => r.test('left-[8px]'))).toBe(true);
  });

  it('covers translate and scale prefixes', () => {
    const tree = {
      motion: { x: { $value: '16px', $type: 'dimension' } },
    };
    const allowlist = tokensToAllowlist(tree);
    const regexes = allowlist.filter((e): e is RegExp => e instanceof RegExp);
    expect(regexes.some((r) => r.test('translate-x-[16px]'))).toBe(true);
    expect(regexes.some((r) => r.test('translate-y-[16px]'))).toBe(true);
    expect(regexes.some((r) => r.test('scale-x-[16px]'))).toBe(true);
  });

  it('does NOT match unrelated prefixes (color, opacity)', () => {
    const tree = {
      spacing: { md: { $value: '8px', $type: 'dimension' } },
    };
    const allowlist = tokensToAllowlist(tree);
    const regexes = allowlist.filter((e): e is RegExp => e instanceof RegExp);
    // color-arbitrary is NOT in our layout prefix list
    expect(regexes.some((r) => r.test('bg-[#fff]'))).toBe(false);
    expect(regexes.some((r) => r.test('opacity-[8px]'))).toBe(false);
  });
});