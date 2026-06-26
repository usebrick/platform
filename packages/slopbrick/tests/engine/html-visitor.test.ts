import { describe, it, expect } from 'vitest';
import { parseHtmlAttributes, extractHtmlElementFacts, skipPastTag } from '../../src/engine/visitors/html';

/**
 * Tests run in isolation from the visitor.ts walker.
 */
describe('visitors/html', () => {
  describe('parseHtmlAttributes', () => {
    it('extracts string-valued attributes', () => {
      const src = '<div class="flex gap-4" id="main" />';
      const { attributes, classNames, eventHandlers } = parseHtmlAttributes(src, 0, src);
      expect(attributes.class).toBe('flex gap-4');
      expect(attributes.id).toBe('main');
      expect(classNames.map((c) => c.value)).toEqual(['flex gap-4']);
      expect(eventHandlers).toEqual([]);
    });

    it('detects boolean attributes as undefined values', () => {
      const src = '<input disabled required />';
      const { attributes } = parseHtmlAttributes(src, 0, src);
      expect('disabled' in attributes).toBe(true);
      expect('required' in attributes).toBe(true);
      expect(attributes.disabled).toBeUndefined();
    });

    it('collects on* event handler names', () => {
      const src = '<button onClick="x" onMouseEnter="y" type="button" />';
      const { attributes, eventHandlers } = parseHtmlAttributes(src, 0, src);
      expect(attributes.type).toBe('button');
      expect(eventHandlers).toContain('onClick');
      expect(eventHandlers).toContain('onMouseEnter');
    });

    it('handles unquoted attribute values', () => {
      const src = '<input type=text />';
      const { attributes } = parseHtmlAttributes(src, 0, src);
      expect(attributes.type).toBe('text');
    });
  });

  describe('extractHtmlElementFacts', () => {
    it('extracts elements from a basic HTML snippet', () => {
      const source = `<div class="flex gap-4"><button>OK</button></div>`;
      const facts = extractHtmlElementFacts(source);
      expect(facts).toHaveLength(2);
      expect(facts[0].tag).toBe('div');
      expect(facts[0].attributes.class).toBe('flex gap-4');
      expect(facts[1].tag).toBe('button');
    });

    it('skips <script> contents', () => {
      const source = `<div><script>const fake = '<button></button>';</script></div>`;
      const facts = extractHtmlElementFacts(source);
      expect(facts.map((f) => f.tag)).toEqual(['div']);
    });

    it('skips <style> contents', () => {
      const source = `<style>.foo { color: red; }</style><div />`;
      const facts = extractHtmlElementFacts(source);
      expect(facts.map((f) => f.tag)).toEqual(['div']);
    });

    it('skips HTML comments', () => {
      const source = `<!-- <button /> --><div />`;
      const facts = extractHtmlElementFacts(source);
      expect(facts.map((f) => f.tag)).toEqual(['div']);
    });

    it('handles void elements like <input>', () => {
      const source = `<input type="text" class="border" />`;
      const facts = extractHtmlElementFacts(source);
      expect(facts).toHaveLength(1);
      expect(facts[0].tag).toBe('input');
      expect(facts[0].attributes.type).toBe('text');
    });
  });

  describe('skipPastTag', () => {
    it('returns position after the closing >', () => {
      const source = '<div class="a">rest';
      const closeIdx = source.indexOf('>');
      expect(skipPastTag(source, 4)).toBe(closeIdx + 1);
    });

    it('returns source.length when no closing tag found', () => {
      expect(skipPastTag('no tag here', 0)).toBe('no tag here'.length);
    });
  });
});