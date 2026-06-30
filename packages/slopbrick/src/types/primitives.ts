/**
 * v0.18.4 (Phase B R-M2): types split.
 * Module: primitives
 */



export type Severity = 'low' | 'medium' | 'high';



export type RuleSeverity = Severity | 'auto';



export type Category =
  | 'visual'
  | 'typo'
  | 'wcag'
  | 'layout'
  | 'component'
  | 'logic'
  | 'arch'
  | 'perf'
  | 'security'
  | 'test'
  | 'docs'
  | 'db'
  | 'ai'
  | 'context'
  | 'product'
  | 'i18n';



/**
 * `react` covers `.tsx`, `.jsx`, `.ts`, `.js`. Other values are detected
 * by file extension. Unknown extensions fall back to `'react'`.
 */
export type Framework = 'react' | 'vue' | 'svelte' | 'astro' | 'html';
