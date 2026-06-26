import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyVisualCodemods } from '../../src/fix/visual-codemod';

describe('applyVisualCodemods — inline-style-to-tailwind (round 21)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'slopbrick-vcm-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('converts inline style={{ color: "red" }} to className="text-red-500"', () => {
    const file = join(dir, 'A.tsx');
    writeFileSync(file, 'export const X = () => <div style={{ color: "red" }}>hi</div>;\n');
    const result = applyVisualCodemods(file);
    expect(result.applied).toBeGreaterThan(0);
    const after = readFileSync(file, 'utf-8');
    expect(after).toContain('text-red-500');
    expect(after).not.toContain('style={{ color: "red" }}');
  });

  it('converts padding: "16px" inline style to className="p-4"', () => {
    const file = join(dir, 'B.tsx');
    writeFileSync(file, 'export const X = () => <div style={{ padding: "16px" }}>hi</div>;\n');
    const result = applyVisualCodemods(file);
    expect(result.applied).toBeGreaterThan(0);
    const after = readFileSync(file, 'utf-8');
    expect(after).toContain('p-4');
    expect(after).not.toContain('padding');
  });

  it('does not modify files without inline styles', () => {
    const file = join(dir, 'C.tsx');
    const before = 'export const X = () => <div className="text-red-500">hi</div>;\n';
    writeFileSync(file, before);
    const result = applyVisualCodemods(file);
    const after = readFileSync(file, 'utf-8');
    expect(after).toBe(before);
    // may still pick up other codemods, but should not break this one
    expect(after).toContain('text-red-500');
    // record the codemod didn't add anything to this file
    void result;
  });
});

describe('applyVisualCodemods — strip-debugger (round 21)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'slopbrick-vcm-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('removes debugger; statements', () => {
    const file = join(dir, 'D.tsx');
    writeFileSync(
      file,
      'export function f() {\n  debugger;\n  return 1;\n}\n',
    );
    const result = applyVisualCodemods(file);
    expect(result.applied).toBeGreaterThan(0);
    const after = readFileSync(file, 'utf-8');
    expect(after).not.toMatch(/\bdebugger\b/);
    expect(after).toContain('return 1');
  });

  it('removes console.log calls', () => {
    const file = join(dir, 'E.tsx');
    writeFileSync(
      file,
      'export function f() {\n  console.log("debug");\n  return 1;\n}\n',
    );
    const result = applyVisualCodemods(file);
    expect(result.applied).toBeGreaterThan(0);
    const after = readFileSync(file, 'utf-8');
    expect(after).not.toMatch(/console\.log/);
    expect(after).toContain('return 1');
  });

  it('does not touch console.error or console.warn', () => {
    const file = join(dir, 'F.tsx');
    writeFileSync(
      file,
      'export function f() {\n  console.error("oops");\n  console.warn("careful");\n}\n',
    );
    const result = applyVisualCodemods(file);
    const after = readFileSync(file, 'utf-8');
    expect(after).toContain('console.error');
    expect(after).toContain('console.warn');
    void result;
  });

  it('does not touch console.log inside a string literal', () => {
    const file = join(dir, 'G.tsx');
    writeFileSync(
      file,
      'export const msg = "console.log(\\"hi\\")";\nexport function f() { return msg; }\n',
    );
    const result = applyVisualCodemods(file);
    const after = readFileSync(file, 'utf-8');
    expect(after).toContain('"console.log(\\"hi\\")"');
    void result;
  });
});

describe('applyVisualCodemods — round 25 additions', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'slopbrick-vcm-r25-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('merge-consecutive-strings merges `"a" + "b"` into `"ab"`', () => {
    const file = join(dir, 'A.tsx');
    writeFileSync(file, 'export const X = "hello " + "world";\n');
    const result = applyVisualCodemods(file);
    const after = readFileSync(file, 'utf-8');
    expect(after).toContain('"hello world"');
    expect(after).not.toContain('+ "world"');
    void result;
  });

  it('sort-imports sorts import statements alphabetically', () => {
    const file = join(dir, 'B.tsx');
    writeFileSync(
      file,
      `import { z } from './z';\nimport { a } from './a';\nimport { m } from './m';\nexport const X = 1;\n`,
    );
    const result = applyVisualCodemods(file);
    const after = readFileSync(file, 'utf-8');
    expect(after).toContain(`import { a } from './a';\nimport { m } from './m';\nimport { z } from './z';`);
    void result;
  });

  it('aria-attr-typo fixes aria-labell → aria-label', () => {
    const file = join(dir, 'C.tsx');
    writeFileSync(file, 'export const X = () => <button aria-labell="hi">x</button>;\n');
    const result = applyVisualCodemods(file);
    const after = readFileSync(file, 'utf-8');
    expect(after).toContain('aria-label="hi"');
    expect(after).not.toContain('aria-labell');
    void result;
  });
});