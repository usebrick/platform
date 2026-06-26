import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';

async function extract(fileName: string, source: string) {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-template-class-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    return extractFacts(filePath, ast, parsedSource);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('Vue template static class extraction', () => {
  it('extracts static class attributes and ignores dynamic :class', async () => {
    const source = `<template>
  <div class="flex gap-4">A</div>
  <div :class="dynamicClasses">B</div>
</template>
<script setup>
const dynamicClasses = 'text-red-500';
</script>`;
    const facts = await extract('Component.vue', source);
    const classNames = facts.v2.templateClassNames.map((c) => c.value);
    expect(classNames).toContain('flex gap-4');
    expect(classNames).not.toContain('text-red-500');
  });
});

describe('Svelte template static class extraction', () => {
  it('extracts static class attributes and ignores class: directives', async () => {
    const source = `<script>
  let active = false;
</script>
<div class="flex gap-4">A</div>
<div class:active={active}>B</div>`;
    const facts = await extract('Component.svelte', source);
    const classNames = facts.v2.templateClassNames.map((c) => c.value);
    expect(classNames).toContain('flex gap-4');
  });
});

describe('Astro template static class extraction', () => {
  it('extracts static class attributes outside frontmatter', async () => {
    const source = `---
const dynamic = 'text-red-500';
---
<div class="flex gap-4">A</div>
<div class={dynamic}>B</div>`;
    const facts = await extract('Component.astro', source);
    const classNames = facts.v2.templateClassNames.map((c) => c.value);
    expect(classNames).toContain('flex gap-4');
  });
});

describe('templateClassNames do not pollute jsx.elements', () => {
  it('Vue templates do not inject synthetic <template> elements', async () => {
    const source = `<template>
  <div class="flex gap-4">A</div>
</template>`;
    const facts = await extract('Component.vue', source);
    expect(facts.v2.templateClassNames.length).toBeGreaterThan(0);
    const syntheticTemplates = facts.v2.jsx.elements.filter((e) => e.tag === 'template');
    expect(syntheticTemplates).toHaveLength(0);
  });

  it('Svelte templates do not inject synthetic <template> elements', async () => {
    const source = `<div class="flex gap-4">A</div>`;
    const facts = await extract('Component.svelte', source);
    expect(facts.v2.templateClassNames.length).toBeGreaterThan(0);
    const syntheticTemplates = facts.v2.jsx.elements.filter((e) => e.tag === 'template');
    expect(syntheticTemplates).toHaveLength(0);
  });

  it('Astro templates do not inject synthetic <template> elements', async () => {
    const source = `<div class="flex gap-4">A</div>`;
    const facts = await extract('Component.astro', source);
    expect(facts.v2.templateClassNames.length).toBeGreaterThan(0);
    const syntheticTemplates = facts.v2.jsx.elements.filter((e) => e.tag === 'template');
    expect(syntheticTemplates).toHaveLength(0);
  });
});