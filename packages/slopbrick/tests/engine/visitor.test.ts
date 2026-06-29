import { describe, expect, it } from 'vitest';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../src/engine/visitor';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const fixture = (name: string) => join(__dirname, `../fixtures/${name}.tsx`);

describe('extractFacts', () => {
  it('extracts components and class names', async () => {
    const { ast, source } = await parseFile(fixture('sample'));
    const facts = extractFacts(fixture('sample'), ast, source);
    expect(facts.v2.components.length).toBe(2);
    const classNames = facts.v2.jsx.elements.flatMap((e) => e.classNames);
    expect(classNames.join(' ')).toContain('flex items-center justify-center');
  });

  it('detects useState hook usage', async () => {
    const { ast, source } = await parseFile(fixture('sample'));
    const facts = extractFacts(fixture('sample'), ast, source);
    const form = facts.v2.components.find((c) => c.name === 'Form');
    expect(form).toBeDefined();
    expect(form!.hookCalls.some((h) => h.name === 'useState')).toBe(true);
  });

  it('marks files without use client as server components', async () => {
    const { ast, source } = await parseFile(fixture('sample'));
    const facts = extractFacts(fixture('sample'), ast, source);
    expect(facts.v2.components.every((c) => c.isServerComponent)).toBe(true);
  });

  it('flips isServerComponent when use client directive is present', async () => {
    const { ast, source } = await parseFile(fixture('use-client'));
    const facts = extractFacts(fixture('use-client'), ast, source);
    expect(facts.v2.components.length).toBe(1);
    expect(facts.v2.components[0].isServerComponent).toBe(false);
  });

  it('treats all components as client when supportsRsc is false', async () => {
    const { ast, source } = await parseFile(fixture('sample'));
    const facts = extractFacts(fixture('sample'), ast, source, false);
    expect(facts.v2.components.every((c) => !c.isServerComponent)).toBe(true);
  });

  it('populates file framework derived from extension', async () => {
    const { ast, source } = await parseFile(fixture('sample'));
    const facts = extractFacts(fixture('sample'), ast, source);
    expect(facts.v2.file.framework).toBe('react');
  });

  it('collects interactive elements with class names', async () => {
    const { ast, source } = await parseFile(fixture('interactive'));
    const facts = extractFacts(fixture('interactive'), ast, source);
    const tags = facts.v2.jsx.elements.filter((e) => e.interactive).map((e) => e.tag).sort();
    expect(tags).toEqual(['a', 'button', 'input']);
    const button = facts.v2.jsx.elements.find((e) => e.tag === 'button');
    expect(button).toBeDefined();
    expect(button!.classNames).toContain('btn-primary');
  });

  it('collects && chains with depth >= 3', async () => {
    const { ast, source } = await parseFile(fixture('logical-chain'));
    const facts = extractFacts(fixture('logical-chain'), ast, source);
    const expressions = facts.v2.logic.logicalExpressions;
    expect(expressions.length).toBeGreaterThanOrEqual(1);
    expect(expressions.some((l) => l.depth >= 3)).toBe(true);
  });

  it('collects zero-interpolation template literal class names', async () => {
    const { ast, source } = await parseFile(fixture('template-class'));
    const facts = extractFacts(fixture('template-class'), ast, source);
    const classNames = facts.v2.jsx.elements.flatMap((e) => e.classNames);
    expect(classNames).toContain('container');
    expect(classNames).toContain('wrapper');
  });

  it('detects multiple top-level non-exported functions as components', async () => {
    const { ast, source } = await parseFile(fixture('non-exported'));
    const facts = extractFacts(fixture('non-exported'), ast, source);
    const names = facts.v2.components.map((c) => c.name).sort();
    expect(names).toEqual(['First', 'Second', 'Third']);
  });

  it('reports line and column positions greater than 1:0', async () => {
    const { ast, source } = await parseFile(fixture('sample'));
    const facts = extractFacts(fixture('sample'), ast, source);
    const el = facts.v2.jsx.elements[0];
    expect(el).toBeDefined();
    expect(el!.line).toBeGreaterThan(1);
    expect(el!.column).toBeGreaterThan(0);
  });

  it('bubbles hooks inside nested helpers up to the enclosing component', async () => {
    const { ast, source } = await parseFile(fixture('nested-hook'));
    const facts = extractFacts(fixture('nested-hook'), ast, source);
    const wrapper = facts.v2.components.find((c) => c.name === 'Wrapper');
    expect(wrapper).toBeDefined();
    expect(wrapper!.hookCalls.some((h) => h.name === 'useId')).toBe(true);
  });

  it('marks both value and setter as referenced when used', async () => {
    const { ast, source } = await parseFile(fixture('state-both-referenced'));
    const facts = extractFacts(fixture('state-both-referenced'), ast, source);
    expect(facts.v2.components).toHaveLength(1);
    const binding = facts.v2.logic.stateVariables.find((b) => b.name === 'count');
    expect(binding).toBeDefined();
    expect(binding!.setter).toBe('setCount');
    expect(binding!.isUsedInJSX).toBe(true);
    expect(binding!.isZombie).toBe(false);
  });

  it('marks neither value nor setter as referenced when unused', async () => {
    const { ast, source } = await parseFile(fixture('state-none-referenced'));
    const facts = extractFacts(fixture('state-none-referenced'), ast, source);
    const binding = facts.v2.logic.stateVariables[0];
    expect(binding).toBeDefined();
    expect(binding!.isUsedInJSX).toBe(false);
    expect(binding!.isZombie).toBe(true);
  });

  it('marks only setter as referenced when value is unused', async () => {
    const { ast, source } = await parseFile(fixture('state-setter-only'));
    const facts = extractFacts(fixture('state-setter-only'), ast, source);
    const binding = facts.v2.logic.stateVariables[0];
    expect(binding).toBeDefined();
    expect(binding!.isUsedInJSX).toBe(false);
    // Setter is referenced (called from a useEffect), value is not.
    expect(binding!.isZombie).toBe(false);
  });

  it('handles single-element useState pattern', async () => {
    const { ast, source } = await parseFile(fixture('state-single-element'));
    const facts = extractFacts(fixture('state-single-element'), ast, source);
    const binding = facts.v2.logic.stateVariables[0];
    expect(binding).toBeDefined();
    expect(binding!.name).toBe('count');
    expect(binding!.setter).toBe('');
    expect(binding!.isUsedInJSX).toBe(true);
    expect(binding!.isZombie).toBe(false);
  });

  it('ignores useState at module level', async () => {
    const { ast, source } = await parseFile(fixture('state-module-level'));
    const facts = extractFacts(fixture('state-module-level'), ast, source);
    expect(facts.v2.components).toHaveLength(1);
    expect(facts.v2.logic.stateVariables).toHaveLength(0);
  });

  it('marks only value as referenced when setter is unused', async () => {
    const { ast, source } = await parseFile(fixture('state-value-only'));
    const facts = extractFacts(fixture('state-value-only'), ast, source);
    const binding = facts.v2.logic.stateVariables[0];
    expect(binding!.isUsedInJSX).toBe(true);
    expect(binding!.isZombie).toBe(false);
  });

  it('marks outer state as referenced when used in nested component', async () => {
    const { ast, source } = await parseFile(fixture('state-nested-reference'));
    const facts = extractFacts(fixture('state-nested-reference'), ast, source);
    const outer = facts.v2.components.find((c) => c.name === 'Outer');
    expect(outer).toBeDefined();
    const binding = facts.v2.logic.stateVariables[0];
    expect(binding!.isUsedInJSX).toBe(true);
    expect(binding!.isZombie).toBe(false);
  });

  it('does not treat function parameter as state reference', async () => {
    const { ast, source } = await parseFile(fixture('state-param-shadow'));
    const facts = extractFacts(fixture('state-param-shadow'), ast, source);
    const binding = facts.v2.logic.stateVariables[0];
    expect(binding!.isUsedInJSX).toBe(false);
    expect(binding!.isZombie).toBe(true);
  });

  it('tracks multiple useState bindings independently', async () => {
    const { ast, source } = await parseFile(fixture('state-multiple'));
    const facts = extractFacts(fixture('state-multiple'), ast, source);
    const bindings = facts.v2.logic.stateVariables;
    expect(bindings).toHaveLength(2);
    const nameBinding = bindings.find((b) => b.name === 'name');
    const emailBinding = bindings.find((b) => b.name === 'email');
    expect(nameBinding?.isUsedInJSX).toBe(true);
    expect(nameBinding?.isZombie).toBe(false);
    expect(emailBinding?.isUsedInJSX).toBe(false);
    expect(emailBinding?.isZombie).toBe(false);
  });

  it('marks initializer references to outer state before new binding shadows them', async () => {
    const { ast, source } = await parseFile(fixture('state-initializer-reference'));
    const facts = extractFacts(fixture('state-initializer-reference'), ast, source);
    const outer = facts.v2.components.find((c) => c.name === 'Outer');
    expect(outer).toBeDefined();
    const binding = facts.v2.logic.stateVariables[0];
    expect(binding!.isUsedInJSX).toBe(true);
  });

  it('does not treat non-computed member property as state reference', async () => {
    const { ast, source } = await parseFile(fixture('state-member-property'));
    const facts = extractFacts(fixture('state-member-property'), ast, source);
    const binding = facts.v2.logic.stateVariables[0];
    expect(binding!.name).toBe('target');
    expect(binding!.isUsedInJSX).toBe(false);
    expect(binding!.isZombie).toBe(true);
  });

  it('collects key prop facts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slopbrick-visitor-test-'));
    const filePath = join(dir, 'keys.tsx');
    writeFileSync(
      filePath,
      `export function List({ items }) {
        return items.map((item, index) => <div key={index}>{item}</div>);
      }`,
    );
    try {
      const { ast, source } = await parseFile(filePath);
      const facts = extractFacts(filePath, ast, source);
      expect(facts.v2.logic.keyProps.length).toBeGreaterThanOrEqual(1);
      expect(facts.v2.logic.keyProps.some((k) => k.valueType === 'index')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('extracts Astro element facts for WCAG rules', async () => {
    const filePath = join(__dirname, '../fixtures/frameworks/astro/src/pages/index.astro');
    const { ast, source } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, source);

    const tags = facts.v2.jsx.elements.map((e) => e.tag).sort();
    expect(tags).toEqual(['button', 'h1', 'img', 'input']);

    const interactiveTags = facts.v2.jsx.elements
      .filter((e) => e.interactive)
      .map((e) => e.tag)
      .sort();
    expect(interactiveTags).toEqual(['button', 'input']);
  });
});