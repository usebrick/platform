import { describe, it, expect } from 'vitest';
import {
  findAstroFrontmatterRange,
  findHtmlBlockRanges,
  findScriptAndStyleRanges,
  findHtmlCommentRanges,
  findAstroSkipRanges,
  parseAstroAttributes,
  extractAstroComponents,
  extractStaticTemplateClassNames,
} from '../../src/engine/visitors/templates';

/**
 * function of source text, testable in isolation from the 2400-line
 * extractFacts() monolith.
 */
describe('visitors/templates', () => {
  describe('findAstroFrontmatterRange', () => {
    it('finds frontmatter at start of file', () => {
      const src = '---\nfoo: 1\n---\n<div />';
      const r = findAstroFrontmatterRange(src);
      expect(r).toBeDefined();
      expect(r!.start).toBe(0);
      expect(src.slice(r!.start, r!.end)).toBe('---\nfoo: 1\n---');
    });

    it('returns undefined when no frontmatter', () => {
      expect(findAstroFrontmatterRange('export const X = 1;')).toBeUndefined();
    });
  });

  describe('findHtmlBlockRanges', () => {
    it('finds matching <script>...</script> blocks', () => {
      const src = 'a <script>const x = 1;</script> b';
      const ranges = findHtmlBlockRanges(src, 'script');
      expect(ranges).toHaveLength(1);
      expect(src.slice(ranges[0].start, ranges[0].end)).toBe('<script>const x = 1;</script>');
    });

    it('handles nested strings inside attributes', () => {
      const src = '<script attr="a > b">x</script>';
      const ranges = findHtmlBlockRanges(src, 'script');
      expect(ranges).toHaveLength(1);
    });
  });

  describe('findScriptAndStyleRanges', () => {
    it('combines script + style blocks', () => {
      const src = 'a <script>x</script> b <style>y</style>';
      const ranges = findScriptAndStyleRanges(src);
      expect(ranges).toHaveLength(2);
    });
  });

  describe('findHtmlCommentRanges', () => {
    it('finds HTML comments', () => {
      const src = 'a <!-- c1 --> b <!-- c2 --> c';
      expect(findHtmlCommentRanges(src)).toHaveLength(2);
    });
  });

  describe('findAstroSkipRanges', () => {
    it('merges frontmatter + comments + script + style', () => {
      const src = '---\nfoo: 1\n---\n<!-- c --><script>x</script><div />';
      const ranges = findAstroSkipRanges(src);
      expect(ranges.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('parseAstroAttributes', () => {
    it('extracts string-valued attributes', () => {
      const src = '<a foo="bar" class="x y" onClick="x" />';
      const { attributes, classNames, eventHandlers } = parseAstroAttributes(src, 0, src);
      expect(attributes.foo).toBe('bar');
      expect(attributes.class).toBe('x y');
      // classNames is one entry per class attribute (full string), not split.
      expect(classNames.map((c) => c.value)).toEqual(['x y']);
      expect(eventHandlers).toEqual(['onClick']);
    });

    it('preserves boolean attributes (key present, value may be undefined)', () => {
      const src = '<input disabled />';
      const { attributes } = parseAstroAttributes(src, 0, src);
      expect('disabled' in attributes).toBe(true);
      expect(attributes.disabled).toBeUndefined();
    });
  });

  describe('extractAstroComponents', () => {
    it('detects Astro components with client directives', () => {
      const src = '<Button client:load>Click</Button>';
      const components = extractAstroComponents(src);
      expect(components).toHaveLength(1);
      expect(components[0].tag).toBe('Button');
      expect(components[0].hasClientDirective).toBe(true);
    });

    it('flags interactive components without client directive', () => {
      const src = '<Modal onClick={...}>x</Modal>';
      const components = extractAstroComponents(src);
      expect(components[0].hasEventHandler).toBe(true);
      expect(components[0].hasClientDirective).toBe(false);
    });
  });

  describe('extractStaticTemplateClassNames', () => {
    it('extracts static class names from a Vue template', () => {
      const src = '<template><div class="flex gap-4">A</div></template>';
      const facts = extractStaticTemplateClassNames(src, []);
      const values = facts.map((f) => f.value);
      expect(values).toContain('flex gap-4');
    });

    it('skips over <script> ranges', () => {
      const src = '<script>const x = "flex";</script><div class="grid" />';
      const facts = extractStaticTemplateClassNames(src, [
        { start: 0, end: src.indexOf('</script>') + '</script>'.length },
      ]);
      const values = facts.map((f) => f.value);
      expect(values).toEqual(['grid']);
      expect(values).not.toContain('flex');
    });
  });
});