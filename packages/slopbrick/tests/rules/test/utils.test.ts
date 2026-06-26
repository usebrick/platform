import { describe, expect, it } from 'vitest';
import {
  isTestFile,
  extractAssertions,
  extractSetupBlocks,
  extractPlaceholderCandidates,
} from '../../../src/rules/test/utils';

describe('isTestFile', () => {
  it('matches __tests__ directories', () => {
    expect(isTestFile('/Users/foo/app/__tests__/Button.tsx')).toBe(true);
    expect(isTestFile('src/__tests__/foo/bar.ts')).toBe(true);
  });

  it('matches *.test.{ts,tsx,js,jsx}', () => {
    expect(isTestFile('src/Button.test.ts')).toBe(true);
    expect(isTestFile('src/Button.test.tsx')).toBe(true);
    expect(isTestFile('src/Button.test.jsx')).toBe(true);
  });

  it('matches *.spec.{ts,tsx,js,jsx}', () => {
    expect(isTestFile('src/Button.spec.tsx')).toBe(true);
    expect(isTestFile('src/Button.spec.js')).toBe(true);
  });

  it('matches *.stories.{ts,tsx}', () => {
    expect(isTestFile('src/Button.stories.tsx')).toBe(true);
  });

  it('matches __fixtures__ directories', () => {
    expect(isTestFile('tests/__fixtures__/user.json')).toBe(true);
  });

  it('does NOT match production code', () => {
    expect(isTestFile('src/Button.tsx')).toBe(false);
    expect(isTestFile('app/api/users/route.ts')).toBe(false);
    expect(isTestFile('lib/utils.ts')).toBe(false);
  });

  it('normalizes Windows backslashes', () => {
    expect(isTestFile('src\\__tests__\\foo.ts')).toBe(true);
    expect(isTestFile('src\\Button.test.ts')).toBe(true);
  });
});

describe('extractAssertions', () => {
  it('captures basic toBe assertions', () => {
    const source = `
      it('a', () => {
        expect(x).toBe(1);
      });
    `;
    const hits = extractAssertions(source);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.matcher).toBe('toBe');
    expect(hits[0]?.expectArg).toBe('x');
    expect(hits[0]?.matcherArg).toBe('1');
  });

  it('captures chained matchers', () => {
    const source = `expect(user).resolves.toEqual({ name: 'Alice' });`;
    const hits = extractAssertions(source);
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });

  it('captures toHaveBeenCalledWith (single-line inline string)', () => {
    const source = `expect(fn).toHaveBeenCalledWith('a', 'b');`;
    const hits = extractAssertions(source);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    // toHaveBeenCalledWith should match via the matcher alternation.
    const match = hits.find((h) => h.matcher === 'toHaveBeenCalledWith');
    expect(match).toBeDefined();
  });

  it('returns empty for non-test source', () => {
    const source = `const x = 5; function foo() { return x; }`;
    const hits = extractAssertions(source);
    expect(hits).toHaveLength(0);
  });

  it('reports 1-based line numbers', () => {
    const source = `line 1\nline 2\nexpect(x).toBe(1);\n`;
    const hits = extractAssertions(source);
    expect(hits[0]?.line).toBe(3);
  });
});

describe('extractSetupBlocks', () => {
  it('captures beforeEach blocks', () => {
    const source = `
      beforeEach(() => {
        const utils = setup();
        const view = render(<App />);
        return view;
      });
    `;
    const blocks = extractSetupBlocks(source, 3);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.kind).toBe('beforeEach');
  });

  it('hashes identical bodies identically', () => {
    const a = `beforeEach(() => {
      const utils = setup();
      const view = render(<App />);
      return view;
    });`;
    const b = `beforeEach(() => {
      const utils = setup();
      const view = render(<Other />);
      return view;
    });`;
    const blockA = extractSetupBlocks(a, 3)[0];
    const blockB = extractSetupBlocks(b, 3)[0];
    expect(blockA?.bodyHash).toBeDefined();
    expect(blockA?.bodyHash).toBe(blockB?.bodyHash);
  });

  it('hashes different bodies differently', () => {
    const a = `beforeEach(() => {
      const utils = setup();
      const view = render(<App />);
      return view;
    });`;
    const b = `beforeEach(() => {
      return render(<Other />);
    });`;
    const blockA = extractSetupBlocks(a, 3)[0];
    const blockB = extractSetupBlocks(b, 3)[0];
    expect(blockA?.bodyHash).toBeDefined();
    expect(blockB?.bodyHash).toBeDefined();
    expect(blockA?.bodyHash).not.toBe(blockB?.bodyHash);
  });

  it('skips blocks shorter than minLines', () => {
    const source = `beforeEach(() => { return render(<App />); });`;
    const blocks = extractSetupBlocks(source, 3);
    expect(blocks).toHaveLength(0);
  });

  it('handles nested parens in the body', () => {
    const source = `
      beforeEach(() => {
        const m = new Map([['a', 1], ['b', 2]]);
        const fn = jest.fn(() => ({ ok: true }));
        return render(<App map={m} fn={fn} />);
      });
    `;
    const blocks = extractSetupBlocks(source, 3);
    expect(blocks).toHaveLength(1);
  });
});

describe('extractPlaceholderCandidates', () => {
  it('captures string property assignments', () => {
    const source = `
      const user = {
        name: 'Alice',
        email: 'alice@acme-corp.com',
        role: 'admin',
      };
    `;
    const hits = extractPlaceholderCandidates(source);
    expect(hits.map((h) => h.prop)).toContain('name');
    expect(hits.map((h) => h.prop)).toContain('email');
    expect(hits.map((h) => h.prop)).toContain('role');
  });

  it('captures numeric id-like properties', () => {
    const source = `const order = { userId: 1, orderId: 2 };`;
    const hits = extractPlaceholderCandidates(source);
    const props = hits.map((h) => h.prop);
    expect(props).toContain('userId');
    expect(props).toContain('orderId');
  });

  it('captures date literal properties', () => {
    const source = `const e = { createdAt: new Date('2020-01-01') };`;
    const hits = extractPlaceholderCandidates(source);
    expect(hits.map((h) => h.prop)).toContain('createdAt');
  });
});