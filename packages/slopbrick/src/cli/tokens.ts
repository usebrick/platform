import { readFileSync } from 'node:fs';
import type { Category } from '../types';

export type DtcgLeaf = {
  $value?: unknown;
  $type?: string;
  $description?: string;
  [k: string]: unknown;
};

export type DtcgTree = { [key: string]: DtcgLeaf | DtcgTree | unknown };

export type FlatToken = {
  path: string;
  value: string;
  type?: string;
};

export type TokenSummary = {
  total: number;
  byCategory: Partial<Record<Category, string[]>>;
  unmatched: string[];
};

export type ParseResult =
  | { ok: true; tree: DtcgTree }
  | { ok: false; error: string };

export function parseDtcgTokens(raw: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { ok: false, error: `Invalid JSON: ${(error as Error).message}` };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Root must be a JSON object' };
  }
  return { ok: true, tree: parsed as DtcgTree };
}

export function readDtcgTokensFile(path: string): ParseResult {
  try {
    const raw = readFileSync(path, 'utf-8');
    return parseDtcgTokens(raw);
  } catch (error) {
    return { ok: false, error: `Cannot read ${path}: ${(error as Error).message}` };
  }
}

export function flattenDtcgTokens(tree: DtcgTree, prefix = ''): FlatToken[] {
  const out: FlatToken[] = [];
  for (const [key, val] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const obj = val as DtcgLeaf;
      if ('$value' in obj) {
        out.push({
          path,
          value: String(obj.$value ?? ''),
          type: typeof obj.$type === 'string' ? obj.$type : undefined,
        });
        continue;
      }
      out.push(...flattenDtcgTokens(obj as DtcgTree, path));
    }
  }
  return out;
}

const VISUAL_TYPES = new Set(['color', 'cubicBezier', 'shadow', 'gradient', 'typography']);
const LAYOUT_TYPES = new Set(['dimension', 'spacing', 'radius', 'borderRadius', 'sizing', 'breakpoint']);
const TYPO_TYPES = new Set(['fontFamily', 'fontWeight', 'fontSize', 'lineHeight', 'letterSpacing', 'typography']);
const VISUAL_PATHS = /(^|\.)(color|colour|palette|brand|theme\.|bg|text-color|fill|stroke)/i;
const LAYOUT_PATHS = /(^|\.)(spacing|gap|radius|padding|margin|width|height|size|inset)/i;
const TYPO_PATHS = /(^|\.)(font|typography|text-|line-height|letter-spacing)/i;

export function inferCategory(token: FlatToken): Category | undefined {
  const type = token.type?.toLowerCase();
  if (type && VISUAL_TYPES.has(type)) return 'visual';
  if (type && LAYOUT_TYPES.has(type)) return 'layout';
  if (type && TYPO_TYPES.has(type)) return 'typo';
  const path = token.path.toLowerCase();
  if (VISUAL_PATHS.test(path)) return 'visual';
  if (LAYOUT_PATHS.test(path)) return 'layout';
  if (TYPO_PATHS.test(path)) return 'typo';
  return undefined;
}

export function summarizeTokens(tree: DtcgTree): TokenSummary {
  const flat = flattenDtcgTokens(tree);
  const byCategory: Partial<Record<Category, string[]>> = {};
  const unmatched: string[] = [];
  for (const token of flat) {
    const cat = inferCategory(token);
    if (cat) {
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat]!.push(token.path);
    } else {
      unmatched.push(token.path);
    }
  }
  return { total: flat.length, byCategory, unmatched };
}

export function formatSummary(summary: TokenSummary): string {
  const lines: string[] = [];
  lines.push(`Total tokens: ${summary.total}`);
  const cats: Category[] = ['visual', 'typo', 'layout', 'component', 'logic', 'arch', 'perf', 'security', 'wcag'];
  for (const cat of cats) {
    const list = summary.byCategory[cat];
    if (list && list.length > 0) {
      lines.push(`  ${cat.padEnd(10)} (${list.length}): ${list.slice(0, 5).join(', ')}${list.length > 5 ? ', ...' : ''}`);
    }
  }
  if (summary.unmatched.length > 0) {
    lines.push(`  unmatched (${summary.unmatched.length}): ${summary.unmatched.slice(0, 5).join(', ')}${summary.unmatched.length > 5 ? ', ...' : ''}`);
  }
  return lines.join('\n');
}

const DIMENSION_RE = /^[0-9]*\.?[0-9]+(px|rem|em|%|vh|vw)$/;
// Round 22: expanded prefix coverage — space-x/y, positioning, translate, scale.
const LAYOUT_PREFIXES =
  '(?:w|h|p|m|gap|px|py|mx|my|min-w|min-h|max-w|max-h|inset|space-x|space-y|top|right|bottom|left|translate-x|translate-y|scale-x|scale-y)';

export function tokensToAllowlist(tree: DtcgTree): (string | RegExp)[] {
  const out: (string | RegExp)[] = [];
  const flat = flattenDtcgTokens(tree);
  for (const tok of flat) {
    const cat = inferCategory(tok);
    if (cat !== 'layout') continue;
    if (!DIMENSION_RE.test(tok.value)) continue;
    const escaped = tok.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out.push(new RegExp(`^${LAYOUT_PREFIXES}-\\[${escaped}\\]$`));
  }
  return out;
}