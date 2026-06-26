import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';

async function extractAstroFacts(source: string): Promise<ReturnType<typeof extractFacts>> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-astro-test-'));
  try {
    const filePath = join(dir, 'Component.astro');
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    return extractFacts(filePath, ast, parsedSource);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('Astro extraction', () => {
  it('extracts interactive components without client directives', async () => {
    const source = `---
const count = 0;
---
<Counter onClick={() => count++} />`;
    const facts = await extractAstroFacts(source);
    expect(facts.v2.astroComponents).toHaveLength(1);
    expect(facts.v2.astroComponents[0]).toMatchObject({
      tag: 'Counter',
      hasClientDirective: false,
      hasEventHandler: true,
    });
  });

  it('detects client directives', async () => {
    const source = `<>
<Tabs client:load onChange={(v) => console.log(v)} />
<Static />
</>`;
    const facts = await extractAstroFacts(source);
    expect(facts.v2.astroComponents).toHaveLength(2);
    const tabs = facts.v2.astroComponents.find((c) => c.tag === 'Tabs');
    const staticComp = facts.v2.astroComponents.find((c) => c.tag === 'Static');
    expect(tabs?.hasClientDirective).toBe(true);
    expect(staticComp?.hasEventHandler).toBe(false);
  });

  it('ignores tags inside HTML comments', async () => {
    const source = `<!-- <img src="/hidden.jpg" /> -->
<img src="/visible.jpg" />`;
    const facts = await extractAstroFacts(source);
    const imgs = facts.v2.jsx.elements.filter((e) => e.tag === 'img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0]!.attributes.src).toBe('/visible.jpg');
  });

  it('ignores tags inside script blocks and the script tag itself', async () => {
    const source = `<script>
  const div = document.createElement('div');
</script>
<button>Click</button>`;
    const facts = await extractAstroFacts(source);
    const tags = facts.v2.jsx.elements.map((e) => e.tag);
    expect(tags).not.toContain('script');
    expect(tags).not.toContain('div');
    expect(tags).toContain('button');
  });

  it('does not truncate tags with > inside quoted attribute values', async () => {
    const source = `<input placeholder=">" />`;
    const facts = await extractAstroFacts(source);
    const inputs = facts.v2.jsx.elements.filter((e) => e.tag === 'input');
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.attributes.placeholder).toBe('>');
  });

  it('captures unquoted attribute values', async () => {
    const source = `<input type=text />`;
    const facts = await extractAstroFacts(source);
    const inputs = facts.v2.jsx.elements.filter((e) => e.tag === 'input');
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.attributes.type).toBe('text');
  });

  it('captures boolean attributes', async () => {
    const source = `<button disabled>Click</button>`;
    const facts = await extractAstroFacts(source);
    const buttons = facts.v2.jsx.elements.filter((e) => e.tag === 'button');
    expect(buttons[0]!.attributes.disabled).toBeUndefined();
    expect(Object.keys(buttons[0]!.attributes)).toContain('disabled');
  });

  it('records expression attributes without classNames entry', async () => {
    const source = `<div class={cls}></div>`;
    const facts = await extractAstroFacts(source);
    const div = facts.v2.jsx.elements.find((e) => e.tag === 'div');
    expect(div!.attributes.class).toBeUndefined();
    expect(div!.classNames).toHaveLength(0);
  });

  it('does not truncate tags with > inside Astro expression attributes', async () => {
    const source = `<div class={foo > 0 ? 'a' : 'b'} data-x="1"></div>`;
    const facts = await extractAstroFacts(source);
    const div = facts.v2.jsx.elements.find((e) => e.tag === 'div');
    expect(div).toBeDefined();
    expect(div!.attributes['data-x']).toBe('1');
  });

  it('detects event handlers on components with > inside expression attributes', async () => {
    const source = `<Counter value={a > 0} onClick={() => {}} />`;
    const facts = await extractAstroFacts(source);
    expect(facts.v2.astroComponents).toHaveLength(1);
    expect(facts.v2.astroComponents[0]).toMatchObject({
      tag: 'Counter',
      hasEventHandler: true,
    });
  });

  it('extracts multiple expression attributes on elements', async () => {
    const source = `<img src={getSrc()} alt={desc} />`;
    const facts = await extractAstroFacts(source);
    const imgs = facts.v2.jsx.elements.filter((e) => e.tag === 'img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0]!.attributes.src).toBeUndefined();
    expect(imgs[0]!.attributes.alt).toBeUndefined();
    expect(Object.keys(imgs[0]!.attributes)).toContain('src');
    expect(Object.keys(imgs[0]!.attributes)).toContain('alt');
  });

  it('collects static class names when `>` appears inside an expression attribute', async () => {
    const source = `<div data-x={a > 0} class='foo bar'></div>`;
    const facts = await extractAstroFacts(source);
    const div = facts.v2.jsx.elements.find((e) => e.tag === 'div');
    expect(div!.classNames).toContain('foo');
    expect(div!.classNames).toContain('bar');
  });

  it('ignores component tags inside HTML comments', async () => {
    const source = `<!-- <Counter /> -->
<div></div>`;
    const facts = await extractAstroFacts(source);
    expect(facts.v2.astroComponents).toHaveLength(0);
  });

  it('ignores component tags inside script blocks', async () => {
    const source = `<script>
  const el = <Counter />;
</script>
<Button />`;
    const facts = await extractAstroFacts(source);
    expect(facts.v2.astroComponents).toHaveLength(1);
    expect(facts.v2.astroComponents[0].tag).toBe('Button');
  });

  it('ignores component tags inside frontmatter', async () => {
    const source = `---
const el = <Counter />;
---
<Button />`;
    const facts = await extractAstroFacts(source);
    expect(facts.v2.astroComponents).toHaveLength(1);
    expect(facts.v2.astroComponents[0].tag).toBe('Button');
  });

  it('does not collect static class names inside HTML comments', async () => {
    const source = `<!-- <div class="hidden"></div> -->
<div class="visible"></div>`;
    const facts = await extractAstroFacts(source);
    const classNames = facts.v2.jsx.elements.flatMap((e) => e.classNames);
    expect(classNames).toContain('visible');
    expect(classNames).not.toContain('hidden');
  });

  it('does not collect static class names inside script blocks', async () => {
    const source = `<script>
  const html = '<div class="hidden"></div>';
</script>
<div class="visible"></div>`;
    const facts = await extractAstroFacts(source);
    const classNames = facts.v2.jsx.elements.flatMap((e) => e.classNames);
    expect(classNames).toContain('visible');
    expect(classNames).not.toContain('hidden');
  });
});