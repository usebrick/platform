// JSX / HTML attribute codemods. All three target attribute-level AI
// tells: rounded <img> without overflow-hidden parent, inline style={{...}}
// instead of className, and double-letter typos in aria-* attributes.

import type { CodemodFn } from '../visual-codemod.js';

// Codemod #3 + #5: ai-circle-icon / ai-rounded-image-no-clip
// Wrap rounded-full <img> in <span class="overflow-hidden inline-block rounded-full">.
const ROUNDED_FULL_IMG_RE = /<img\s+([^>]*?)className=(["'])([^"']*\brounded-full\b[^"']*)\2([^>]*?)\/?\s*>/g;

export const applyRoundedImageClipCodemod: CodemodFn = (content) => {
  const changes: Array<{ description: string; before: string; after: string }> = [];
  const next = content.replace(ROUNDED_FULL_IMG_RE, (full, before: string, q: string, classes: string, after: string) => {
    // Only wrap if not already inside overflow-hidden parent.
    if (classes.includes('overflow-hidden')) return full;
    const wrapped = '<span class="inline-block overflow-hidden rounded-full"><img ' + before + 'className=' + q + classes + q + after + ' /></span>';
    changes.push({ description: 'wrap rounded <img> with overflow-hidden parent', before: full, after: wrapped });
    return wrapped;
  });
  return { content: next, changes };
};

// Codemod #6: inline-style-to-tailwind — converts simple
// `style={{ property: "value" }}` to `className="..."` for the most
// common style properties. Conservative: only handles color,
// backgroundColor, padding, margin, fontSize, fontWeight, borderRadius.
const COLOR_NAME_TO_TW: Record<string, string> = {
  red: 'text-red-500',
  blue: 'text-blue-500',
  green: 'text-green-500',
  yellow: 'text-yellow-500',
  orange: 'text-orange-500',
  pink: 'text-pink-500',
  purple: 'text-purple-500',
  indigo: 'text-indigo-500',
  white: 'text-white',
  black: 'text-black',
  gray: 'text-gray-500',
  slate: 'text-slate-500',
};

export const applyInlineStyleToTailwindCodemod: CodemodFn = (content) => {
  const changes: Array<{ description: string; before: string; after: string }> = [];
  // Match inline style={{ property: "value" }} with single property
  const INLINE_STYLE_RE = /style=\{\{\s*([a-zA-Z]+)\s*:\s*"([^"]+)"\s*\}\}/g;
  let next = content.replace(INLINE_STYLE_RE, (full, prop: string, value: string) => {
    let className: string | undefined;
    if (prop === 'color') {
      className = COLOR_NAME_TO_TW[value.toLowerCase()];
    } else if (prop === 'padding') {
      const num = parseFloat(value);
      if (Number.isFinite(num) && num % 4 === 0) {
        className = `p-${num / 4}`;
      }
    } else if (prop === 'margin') {
      const num = parseFloat(value);
      if (Number.isFinite(num) && num % 4 === 0) {
        className = `m-${num / 4}`;
      }
    } else if (prop === 'fontSize') {
      const num = parseFloat(value);
      if (Number.isFinite(num)) {
        // Tailwind text-* scale: text-xs=12, sm=14, base=16, lg=18, xl=20, 2xl=24
        const table: Record<number, string> = { 12: 'xs', 14: 'sm', 16: 'base', 18: 'lg', 20: 'xl', 24: '2xl', 30: '3xl', 36: '4xl', 48: '5xl', 60: '6xl' };
        if (table[num]) className = `text-${table[num]}`;
      }
    } else if (prop === 'fontWeight') {
      const table: Record<string, string> = { '100': 'thin', '200': 'extralight', '300': 'light', '400': 'normal', '500': 'medium', '600': 'semibold', '700': 'bold', '800': 'extrabold', '900': 'black' };
      if (table[value]) className = `font-${table[value]}`;
    } else if (prop === 'borderRadius') {
      const num = parseFloat(value);
      if (Number.isFinite(num)) {
        className = num >= 9999 ? 'rounded-full' : num === 0 ? 'rounded-none' : `rounded-[${num}px]`;
      }
    }
    if (!className) return full;
    const replacement = `className="${className}"`;
    changes.push({ description: 'inline-style → tailwind class', before: full, after: replacement });
    return replacement;
  });
  return { content: next, changes };
};

// Codemod #10: aria-attr-typo — fix common typos in aria-* attributes
// (aria-labell → aria-label, aria-labelledbyy → aria-labelledby, etc.).
const ARIA_TYPOS: Record<string, string> = {
  'aria-labell': 'aria-label',
  'aria-labelledbyy': 'aria-labelledby',
  'aria-describess': 'aria-describedby',
  'aria-hiddenn': 'aria-hidden',
  'aria-expandedd': 'aria-expanded',
  'aria-checkedd': 'aria-checked',
  'aria-selectedd': 'aria-selected',
  'aria-disabledd': 'aria-disabled',
  'aria-requiredd': 'aria-required',
  'aria-readonlyy': 'aria-readonly',
};

export const applyAriaAttrTypoCodemod: CodemodFn = (content) => {
  const changes: Array<{ description: string; before: string; after: string }> = [];
  let next = content;
  for (const [wrong, right] of Object.entries(ARIA_TYPOS)) {
    const re = new RegExp(wrong, 'g');
    next = next.replace(re, (match) => {
      changes.push({ description: `aria-attr typo ${wrong} → ${right}`, before: match, after: right });
      return right;
    });
  }
  return { content: next, changes };
};