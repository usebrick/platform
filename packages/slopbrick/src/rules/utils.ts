import type { ScanFactsV2 } from '../engine/types';

const LAYOUT_ARBITRARY_RE = /^(?:w|h|p|m|gap|space-x|space-y|px|py|mx|my|min-w|min-h|max-w|max-h|inset)-\[.*\]$/;
const RADIUS_ARBITRARY_RE = /^(?:rounded|rounded-t|rounded-r|rounded-b|rounded-l|rounded-tl|rounded-tr|rounded-br|rounded-bl|rounded-ss|rounded-se|rounded-es|rounded-ee)-\[.*\]$/;
const COLOR_ARBITRARY_RE = /^(?:bg|text|border|ring|shadow|from|to|via|stroke|fill)-\[.*\]$/;
const SIZING_TOKEN_RE = /^(?:min-w|min-h|h|w|p|px|py|size|aspect)-.+$/;
const FOCUS_RING_RE = /^(?:focus|focus-visible):ring-.+$/;
const OUTLINE_REMOVAL_RE = /^(?:(focus|focus-visible):)?outline-none$/;

/**
 * Refactor 7: shared inline-style scanner helpers. Previously each of 12
 * rules copy-pasted these two definitions verbatim. Hoisting them out
 * cuts ~150 LoC of duplication and ensures they stay in sync.
 *
 * STYLE_BLOCK_RE matches `<tag style={{...}}>...</tag>` blocks.
 * lineOfSource maps a 0-based string offset to a 1-based line number.
 */
export const STYLE_BLOCK_RE = /style\s*=\s*\{\{([^}]*)\}\}/g;

export function lineOfSource(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') line += 1;
  }
  return line;
}

/**
 * Refactor 8: match-all helper. The 16 sites that used to do
 *   `const re = new RegExp(X.source, 'g'); while ((m = re.exec(s)) !== null)`
 * inside per-file hot loops now use this helper, which internally
 * allocates a fresh g-flagged regex on each call — but only once per
 * file, not once per file × per source-string.
 *
 * Callers should pass the module-level regex (which must be g-flagged)
 * directly. The helper exists to (a) document the pattern and (b)
 * centralize the g-flag enforcement so future rules don't accidentally
 * forget it.
 */
export function matchAll(re: RegExp, source: string): RegExpExecArray[] {
  // String.prototype.matchAll requires the regex to have the g flag.
  // If the caller forgot, add it rather than throw — this is the
  // single point where the flag check happens.
  const gRe = re.flags.includes('g') ? re : new RegExp(re.source, re.flags + 'g');
  return Array.from(source.matchAll(gRe));
}

export function splitClassName(value: string): string[] {
  return value.split(/\s+/).filter((part) => part.length > 0);
}

/**
 * helper: iterate every className token across every JSX element
 * in a v2 ScanFacts, yielding the `(value, line, column)` triple that
 * the legacy `facts.staticClassNames[]` shape exposes.
 * Lets math rules migrate without rewriting their iteration body — they
 * just swap `for (const cls of facts.staticClassNames)` for
 * `for (const cls of classNamesFromJsx(facts.v2))`.
 */
export interface FlatClassName {
  value: string;
  line: number;
  column: number;
}

export function* classNamesFromJsx(v2: ScanFactsV2): Generator<FlatClassName> {
  for (const element of v2.jsx.elements) {
    for (const cls of element.classNames) {
      yield { value: cls, line: element.line, column: element.column };
    }
  }
}

/**
 * Collect all className tokens from a v2 file into a flat array. Use when
 * a rule needs random access (`arr[0]`) rather than streaming iteration.
 */
export function flatClassNames(v2: ScanFactsV2): FlatClassName[] {
  const out: FlatClassName[] = [];
  for (const element of v2.jsx.elements) {
    for (const cls of element.classNames) {
      out.push({ value: cls, line: element.line, column: element.column });
    }
  }
  return out;
}

export function isLayoutArbitrary(className: string): boolean {
  return LAYOUT_ARBITRARY_RE.test(className);
}

export function isRadiusArbitrary(className: string): boolean {
  return RADIUS_ARBITRARY_RE.test(className);
}

export function isArbitraryColor(className: string): boolean {
  return COLOR_ARBITRARY_RE.test(className);
}

export function matchesAllowlist(
  className: string,
  allowlist: readonly (string | RegExp)[],
): boolean {
  return allowlist.some((entry) => {
    if (typeof entry === 'string') return entry === className;
    entry.lastIndex = 0;
    return entry.test(className);
  });
}

export function hasAllClasses(
  classNames: readonly string[],
  required: readonly string[],
): boolean {
  return required.every((requiredClass) => classNames.includes(requiredClass));
}

export function hasAnyClass(
  classNames: readonly string[],
  candidates: readonly string[],
): boolean {
  return candidates.some((candidate) => classNames.includes(candidate));
}

export function isSizingToken(className: string): boolean {
  return SIZING_TOKEN_RE.test(className);
}

export function isFocusRingClass(className: string): boolean {
  return FOCUS_RING_RE.test(className);
}

export function isOutlineRemoval(className: string): boolean {
  return OUTLINE_REMOVAL_RE.test(className);
}

const LAYOUT_PREFIX_RE = /^(w|h|p|m|gap|px|py|mx|my|min-w|min-h|max-w|max-h|inset)-\[(.*)\]$/;
const ARBITRARY_VALUE_RE = /^(-?\d+(?:\.\d+)?)(px|rem)$/;
const MAX_SPACING_TOKEN = 96;

export function nearestTailwindSpacingToken(className: string): string | undefined {
  const match = LAYOUT_PREFIX_RE.exec(className);
  if (!match) return undefined;

  const [, prefix, rawValue] = match;
  if (!prefix || rawValue === undefined) return undefined;

  const valueMatch = ARBITRARY_VALUE_RE.exec(rawValue.trim());
  if (!valueMatch) return undefined;

  const numeric = Number(valueMatch[1]);
  if (!Number.isFinite(numeric) || numeric < 0) return undefined;

  const unit = valueMatch[2];
  const remValue = unit === 'px' ? numeric / 16 : numeric;
  const quarters = remValue * 4;
  const rounded = Math.round(quarters);
  const token = Math.min(rounded, MAX_SPACING_TOKEN);

  if (token === 0 && numeric !== 0) return undefined;

  return `${prefix}-${token}`;
}

export interface StylePropEntry {
  property: string;
  value: string;
}

/**
 * Parse the inner content of a Tailwind arbitrary value: `[13px]` ->
 * { value: 13, unit: 'px' }. Returns null if the string is not a
 * numeric px/rem/em/% value.
 */
export function parseArbitraryValue(
  raw: string,
): { value: number; unit: 'px' | 'rem' | 'em' | '%' } | null {
  const m = /^(-?\d+(?:\.\d+)?)(px|rem|em|%)$/.exec(raw.trim());
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  return { value, unit: m[2] as 'px' | 'rem' | 'em' | '%' };
}

/**
 * Convert any px/rem/em value to rem (the canonical scale unit).
 * px: divide by 16 (assumes 1rem=16px browser default)
 * rem/em: pass through
 * %: returns null (not a length-on-scale)
 */
export function toRem(parsed: { value: number; unit: 'px' | 'rem' | 'em' | '%' }): number | null {
  if (parsed.unit === 'px') return parsed.value / 16;
  if (parsed.unit === 'rem' || parsed.unit === 'em') return parsed.value;
  return null;
}

/**
 * Return the closest scale entry to `value`, plus the entry's distance.
 * Distance is 0 when on-scale. Entries are matched by exact equality
 * after rounding to 4 decimal places (the Tailwind scale granularity).
 */
export function nearestScaleEntry<T extends number | 'full'>(
  value: number,
  scale: readonly T[],
): { entry: T; distance: number } | null {
  if (scale.length === 0) return null;
  let best: { entry: T; distance: number } | null = null;
  for (const s of scale) {
    if (typeof s !== 'number') continue; // skip 'full'
    const distance = Math.abs(value - s);
    if (best === null || distance < best.distance) {
      best = { entry: s, distance };
    }
  }
  return best;
}

export function toKebabCase(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

export function parseStyleObject(source: string): StylePropEntry[] {
  const trimmed = source.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return [];

  const body = trimmed.slice(1, -1);
  const entries: StylePropEntry[] = [];
  let current = '';
  let depth = 0;
  let inString: false | '"' | "'" | '`' = false;
  let escaped = false;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === inString) {
        inString = false;
      }
      current += ch;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      current += ch;
      continue;
    }

    if (ch === '{' || ch === '(' || ch === '[') {
      depth++;
      current += ch;
      continue;
    }

    if (ch === '}' || ch === ')' || ch === ']') {
      depth--;
      current += ch;
      continue;
    }

    if (ch === ',' && depth === 0) {
      const segment = current.trim();
      const match = /^([a-zA-Z0-9-]+)\s*:/.exec(segment);
      if (match) {
        const property = toKebabCase(match[1]!);
        const value = segment.slice(match[0].length).trim();
        entries.push({ property, value });
      }
      current = '';
      continue;
    }

    current += ch;
  }

  const segment = current.trim();
  const match = /^([a-zA-Z0-9-]+)\s*:/.exec(segment);
  if (match) {
    const property = toKebabCase(match[1]!);
    const value = segment.slice(match[0].length).trim();
    entries.push({ property, value });
  }

  return entries;
}
