// Tailwind-class codemods. All three rewrite common AI-tell class strings
// (arbitrary values, vibe-purple, low-contrast defaults) into design-
// system-friendly equivalents.

import type { CodemodFn } from '../visual-codemod.js';

// Codemod #1: arbitrary-escape → nearest spacing token.
// p-[13px] → p-4, mt-[7px] → mt-2, etc.
const ARBITRARY_ESCAPE_RE = /\b(p|m|px|py|pt|pb|pl|pr|mx|my|mt|mb|ml|mr|gap|space-[xy]|w|h|min-w|max-w|min-h|max-h|text-\w+|leading-\w+|rounded|border)-?\[(-?\d+(?:\.\d+)?)(px|rem|em|%|vh|vw)?\]/g;

export const applyArbitraryEscapeCodemod: CodemodFn = (content) => {
  const changes: Array<{ description: string; before: string; after: string }> = [];
  let next = content.replace(ARBITRARY_ESCAPE_RE, (full, prefix: string, value: string, unit: string | undefined) => {
    const num = parseFloat(value);
    let token: string;
    if (unit === 'rem' || unit === 'em' || unit === undefined || unit === 'px') {
      // Map to Tailwind's 4px scale.
      const mapped = Math.max(0, Math.round(num / 4));
      token = String(mapped);
    } else if (unit === '%') {
      token = '1/2';
    } else if (unit === 'vh' || unit === 'vw') {
      token = 'screen';
    } else {
      token = String(Math.round(num));
    }
    const replacement = prefix + '-' + token;
    if (replacement === full) return full;
    changes.push({ description: 'arbitrary-value to design token', before: full, after: replacement });
    return replacement;
  });
  return { content: next, changes };
};

// Codemod #2: ai-vibe-purple — substitute the worst violators with
// less-saturated alternates.
const VIBE_PURPLE_SWAPS: Record<string, string> = {
  'bg-violet-500': 'bg-emerald-500',
  'bg-violet-600': 'bg-emerald-600',
  'bg-violet-700': 'bg-emerald-700',
  'bg-purple-500': 'bg-emerald-500',
  'bg-purple-600': 'bg-emerald-600',
  'bg-indigo-500': 'bg-emerald-500',
  'bg-indigo-600': 'bg-emerald-600',
  'text-violet-600': 'text-emerald-600',
  'text-purple-600': 'text-emerald-600',
  'text-indigo-600': 'text-emerald-600',
};

export const applyVibePurpleCodemod: CodemodFn = (content) => {
  const changes: Array<{ description: string; before: string; after: string }> = [];
  let next = content;
  for (const [from, to] of Object.entries(VIBE_PURPLE_SWAPS)) {
    const re = new RegExp('\\b' + from.replace(/\//g, '\\/') + '\\b', 'g');
    next = next.replace(re, (m) => {
      changes.push({ description: 'vibe-purple → emerald', before: m, after: to });
      return to;
    });
  }
  return { content: next, changes };
};

// Codemod #4: ai-default-palette — swap slate/zinc/stone/neutral as
// body-text defaults for something with stronger contrast.
const DEFAULT_PALETTE_SWAPS: Record<string, string> = {
  'text-slate-300': 'text-slate-700',
  'text-slate-400': 'text-slate-800',
  'text-zinc-300': 'text-zinc-800',
  'text-zinc-400': 'text-zinc-800',
  'text-stone-400': 'text-stone-800',
  'text-stone-500': 'text-stone-900',
  'text-neutral-400': 'text-neutral-800',
  'text-neutral-500': 'text-neutral-900',
  'text-gray-300': 'text-gray-800',
  'text-gray-400': 'text-gray-800',
};

export const applyDefaultPaletteCodemod: CodemodFn = (content) => {
  const changes: Array<{ description: string; before: string; after: string }> = [];
  let next = content;
  for (const [from, to] of Object.entries(DEFAULT_PALETTE_SWAPS)) {
    const re = new RegExp('\\b' + from.replace(/\//g, '\\/') + '\\b', 'g');
    next = next.replace(re, (m) => {
      changes.push({ description: 'default-palette → stronger contrast', before: m, after: to });
      return to;
    });
  }
  return { content: next, changes };
};