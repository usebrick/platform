// Tests for the v0.10.1 find_similar_function engine.
//
// Coverage:
//   - extractSignatures: pure function extraction from a source string
//   - signatureSimilarity: Jaccard similarity math (no I/O)
//   - fingerprintSignature: stable hash output
//   - findSimilarFunctions: end-to-end on a small tmp repo (uses globby)

import { describe, it, expect } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  extractSignatures,
  signatureSimilarity,
  fingerprintSignature,
  findSimilarFunctions,
} from '../../src/engine/find-similar';

describe('extractSignatures', () => {
  it('extracts named function declarations', () => {
    const src = 'export function Button({ variant }: { variant: string }) { return variant; }';
    const sigs = extractSignatures(src, '/a.tsx', '/');
    expect(sigs).toHaveLength(1);
    expect(sigs[0].name).toBe('Button');
    expect(sigs[0].line).toBe(1);
  });

  it('extracts arrow const components', () => {
    const src = 'const Card = ({ title, children }: Props) => <div>{title}{children}</div>;';
    const sigs = extractSignatures(src, '/b.tsx', '/');
    expect(sigs).toHaveLength(1);
    expect(sigs[0].name).toBe('Card');
  });

  it('extracts React hooks from the function body', () => {
    const src = `function Counter() {
      const [count, setCount] = useState(0);
      useEffect(() => { setCount(c => c + 1); }, []);
      return <div>{count}</div>;
    }`;
    const sigs = extractSignatures(src, '/c.tsx', '/');
    expect(sigs).toHaveLength(1);
    expect(sigs[0].hooks.sort()).toEqual(['useEffect', 'useState']);
  });

  it('returns fileRel relative to workspaceDir', () => {
    const src = 'function A() { return 1; }';
    const sigs = extractSignatures(src, '/workspace/src/components/A.tsx', '/workspace');
    expect(sigs[0].fileRel).toBe('src/components/A.tsx');
  });

  it('does not duplicate when a function is declared twice', () => {
    const src = 'function Foo() {}\nfunction Foo() {}\n';
    const sigs = extractSignatures(src, '/d.ts', '/');
    expect(sigs).toHaveLength(1);
  });
});

describe('signatureSimilarity', () => {
  it('returns 1 for identical feature sets', () => {
    expect(signatureSimilarity(
      { hooks: ['useState'], props: ['variant'], params: ['size'] },
      { hooks: ['useState'], props: ['variant'], params: ['size'] },
    )).toBe(1);
  });

  it('returns 0 for disjoint feature sets', () => {
    expect(signatureSimilarity(
      { hooks: ['useState'], props: [], params: [] },
      { hooks: [], props: ['variant'], params: [] },
    )).toBe(0);
  });

  it('returns intermediate Jaccard value for partial overlap', () => {
    // intersection = {useState} = 1, union = {useState, useEffect, variant} = 3
    // → 1/3 ≈ 0.333
    expect(signatureSimilarity(
      { hooks: ['useState'], props: [], params: [] },
      { hooks: ['useState', 'useEffect'], props: ['variant'], params: [] },
    )).toBeCloseTo(1 / 3, 3);
  });

  it('returns 0 when both sides are empty', () => {
    expect(signatureSimilarity(
      { hooks: [], props: [], params: [] },
      { hooks: [], props: [], params: [] },
    )).toBe(0);
  });
});

describe('fingerprintSignature', () => {
  it('is deterministic for identical input', () => {
    const sig = { hooks: ['useState'], props: ['variant'], params: ['size'] };
    expect(fingerprintSignature(sig)).toBe(fingerprintSignature(sig));
  });

  it('differs when features differ', () => {
    const a = fingerprintSignature({ hooks: ['useState'], props: [], params: [] });
    const b = fingerprintSignature({ hooks: ['useEffect'], props: [], params: [] });
    expect(a).not.toBe(b);
  });

  it('is order-independent (sorts internally)', () => {
    const a = fingerprintSignature({ hooks: ['useState', 'useEffect'], props: [], params: [] });
    const b = fingerprintSignature({ hooks: ['useEffect', 'useState'], props: [], params: [] });
    expect(a).toBe(b);
  });

  it('produces 16 hex chars (sha256 truncated)', () => {
    expect(fingerprintSignature({ hooks: [], props: [], params: [] })).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('findSimilarFunctions (end-to-end on tmp repo)', () => {
  it('returns top matches ranked by similarity', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/components/Button.tsx',
        `import { useState } from 'react';\n` +
        `export function Button({ variant, size, children }: ButtonProps) {\n` +
        `  const [active, setActive] = useState(false);\n` +
        `  return <button className={variant} onClick={() => setActive(!active)}>{children}</button>;\n` +
        `}\n`);
      writeFile(dir, 'src/components/Card.tsx',
        `import { useState } from 'react';\n` +
        `export function Card({ variant, title, children }: CardProps) {\n` +
        `  const [open, setOpen] = useState(true);\n` +
        `  return <div className={variant}><h1>{title}</h1>{children}</div>;\n` +
        `}\n`);
      writeFile(dir, 'src/utils/logger.ts',
        `export function log(message: string, level: number) { console.log(level, message); }\n`);

      const matches = await findSimilarFunctions({
        hooks: ['useState'],
        props: ['variant', 'children'],
        workspaceDir: dir,
      });

      // Button and Card both use useState + variant + children, log doesn't.
      expect(matches.length).toBeGreaterThanOrEqual(2);
      // Top match similarity is high (≥ 2/3 since hooks match exactly and
      // props overlap by at least 2/3 — Button has [variant, size, children]
      // and Card has [variant, title, children]; query is [variant, children]).
      expect(matches[0].similarity).toBeGreaterThanOrEqual(2 / 3);
      // Verify the unrelated logger doesn't appear.
      expect(matches.some((m) => m.signature.name === 'log')).toBe(false);
      // Verify both Button and Card are in the matches (in either order).
      const names = matches.map((m) => m.signature.name);
      expect(names).toContain('Button');
      expect(names).toContain('Card');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('respects the name filter (exact match)', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/A.tsx', 'export function A({ x }: P) { return x; }\n');
      writeFile(dir, 'src/B.tsx', 'export function B({ x }: P) { return x; }\n');

      const matches = await findSimilarFunctions({
        name: 'A',
        props: ['x'],
        workspaceDir: dir,
      });
      expect(matches).toHaveLength(1);
      expect(matches[0].signature.name).toBe('A');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns empty array when no signatures match', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/A.tsx', 'export function A() { return 1; }\n');
      const matches = await findSimilarFunctions({
        hooks: ['useState', 'useReducer', 'useContext'], // unlikely to match
        workspaceDir: dir,
      });
      expect(matches).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('respects the limit parameter (caps results)', async () => {
    const dir = freshDir();
    try {
      // Generate 5 highly similar functions.
      for (let i = 0; i < 5; i++) {
        writeFile(dir, `src/Comp${i}.tsx`,
          `export function Comp${i}({ variant, children }: P) {\n` +
          `  const [x, setX] = useState(0);\n` +
          `  return <div className={variant}>{children}{x}</div>;\n` +
          `}\n`);
      }
      const matches = await findSimilarFunctions({
        hooks: ['useState'],
        props: ['variant', 'children'],
        workspaceDir: dir,
        limit: 2,
      });
      expect(matches).toHaveLength(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('produces stable fingerprints across runs', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/Button.tsx',
        `export function Button({ variant }: P) { const [x, setX] = useState(0); return null; }\n`);
      const a = await findSimilarFunctions({
        hooks: ['useState'],
        props: ['variant'],
        workspaceDir: dir,
      });
      const b = await findSimilarFunctions({
        hooks: ['useState'],
        props: ['variant'],
        workspaceDir: dir,
      });
      expect(a[0].fingerprint).toBe(b[0].fingerprint);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// --- helpers ---------------------------------------------------------------

function freshDir(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'slopbrick-fs-')));
}

function writeFile(dir: string, rel: string, content: string): void {
  const full = join(dir, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf-8');
}
