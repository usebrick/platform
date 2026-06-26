/**
 * v2-shape tests: verify that extractFacts populates the canonical
 * ScanFactsV2 shape. The legacy flat-shape dual-write path was removed
 * now; rules and consumers read directly from `facts.v2`.
 * These tests run end-to-end: parseFile → extractFacts → inspect facts.v2.
 */

import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { DEFAULT_CONFIG } from '../../src/config';

async function scanSource(source: string, fileName: string) {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-v2-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    return extractFacts(filePath, ast, parsedSource, true, 'react', DEFAULT_CONFIG);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('extractFacts — canonical v2 shape', () => {
  it('populates facts.v2 with the grouped shape', async () => {
    const source = `
export function Card() {
  return (
    <div className="p-4 m-2">
      <button className="rounded-full bg-indigo-500 text-white px-3">x</button>
    </div>
  );
}
`;
    const facts = await scanSource(source, 'Card.tsx');
    expect(facts.v2.file.path).toContain('Card.tsx');
    expect(facts.v2.file.extension).toBe('.tsx');
    expect(facts.v2.file.framework).toBe('react');
    expect(facts.v2.file.loc).toBeGreaterThan(0);
  });

  it('extracts JSX elements into facts.v2.jsx.elements', async () => {
    const source = `
export function Card() {
  return (
    <div className="p-4">
      <button className="rounded-full px-3">x</button>
    </div>
  );
}
`;
    const facts = await scanSource(source, 'Card.tsx');
    const elements = facts.v2.jsx.elements;
    expect(elements.length).toBeGreaterThanOrEqual(2);
    const button = elements.find((e) => e.tag === 'button');
    expect(button).toBeDefined();
    expect(button!.classNames).toContain('rounded-full');
    expect(button!.interactive).toBe(true);
  });

  it('extracts arbitrary values from className', async () => {
    const source = `export function X() { return <div className="p-[13px] m-[21px] gap-[9px]" />; }
`;
    const facts = await scanSource(source, 'X.tsx');
    const arbitrary = facts.v2.jsx.elements.flatMap((e) => e.arbitraryValues);
    expect(arbitrary).toContain('p-[13px]');
    expect(arbitrary).toContain('m-[21px]');
    expect(arbitrary).toContain('gap-[9px]');
  });

  it('extracts design tokens (spacing, color, radius, font)', async () => {
    const source = `export function X() { return <div className="p-4 m-2 gap-3 bg-indigo-500 text-white rounded-full text-lg" />; }
`;
    const facts = await scanSource(source, 'X.tsx');
    const tokens = facts.v2.designTokens;
    expect(tokens.spacingUsage).toEqual(expect.arrayContaining([4, 2, 3]));
    expect(tokens.colorValues).toContain('indigo-500');
    expect(tokens.colorValues).toContain('white');
    expect(tokens.borderRadius).toContain('full');
    expect(tokens.fontSizes).toContain('lg');
  });

  it('extracts components with location', async () => {
    const source = `
export function Button() { return <button>x</button>; }
export function Card() { return <div>card</div>; }
`;
    const facts = await scanSource(source, 'Multi.tsx');
    const components = facts.v2.components;
    expect(components.length).toBeGreaterThanOrEqual(2);
    expect(components.some((c) => c.name === 'Button')).toBe(true);
    expect(components.some((c) => c.name === 'Card')).toBe(true);
  });

  it('extracts imports and computes isAllowed from allowedImports', async () => {
    const source = `
import { Button } from '@/components/ui/button';
import { Stuff } from '@/wrong/path';
import React from 'react';
export function X() { return <Button />; }
`;
    const facts = await scanSource(source, 'X.tsx');
    const imports = facts.v2.imports;
    expect(imports.length).toBe(3);
    const buttonImport = imports.find((i) => i.source === '@/components/ui/button');
    expect(buttonImport?.isAllowed).toBe(true);
    const wrongImport = imports.find((i) => i.source === '@/wrong/path');
    expect(wrongImport?.isAllowed).toBe(false);
    const reactImport = imports.find((i) => i.source === 'react');
    expect(reactImport?.isAllowed).toBe(false); // non-aliased imports are never "allowed" by brick.config
  });

  it('extracts hooks into facts.v2.logic.hooks', async () => {
    const source = `
import { useState } from 'react';
export function Counter() {
  const [count, setCount] = useState(0);
  return <div>{count}</div>;
}
`;
    const facts = await scanSource(source, 'Counter.tsx');
    const hooks = facts.v2.logic.hooks;
    expect(hooks.some((h) => h.name === 'useState')).toBe(true);
  });

  it('extracts state variables into facts.v2.logic.stateVariables', async () => {
    const source = `
import { useState } from 'react';
export function Counter() {
  const [count, setCount] = useState(0);
  return <div>{count}</div>;
}
`;
    const facts = await scanSource(source, 'Counter.tsx');
    const states = facts.v2.logic.stateVariables;
    expect(states.length).toBeGreaterThanOrEqual(1);
    const count = states.find((s) => s.name === 'count');
    expect(count?.setter).toBe('setCount');
    expect(count?.isUsedInJSX).toBe(true);
    expect(count?.isZombie).toBe(false);
  });

  it('derives framework from file extension', async () => {
    const vueSource = `<template><div>x</div></template>`;
    const facts = await scanSource(vueSource, 'App.vue');
    expect(facts.v2.file.framework).toBe('vue');

    const svelteSource = `<script>let x = 1;</script><div>{x}</div>`;
    const facts2 = await scanSource(svelteSource, 'App.svelte');
    expect(facts2.v2.file.framework).toBe('svelte');
  });
});
