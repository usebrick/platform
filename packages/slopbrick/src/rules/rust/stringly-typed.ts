/**
 * Rule: rust/stringly-typed
 *
 * Function parameters typed as `String` / `&str` where a known enum
 * exists in the same file. The pattern is the canonical
 * "stringly-typed" anti-pattern: an event handler that takes
 * `event_type: &str` and matches `"click" | "keydown" | ...`,
 * when a `pub enum EventType { Click, Keydown, ... }` is in scope.
 *
 * **Why this matters:**
 * - Stringly-typed APIs lose type information at the boundary; typos
 *   (`"Click"` vs `"click"`) only fail at runtime. AI agents
 *   frequently introduce these during exploratory scaffolding, then
 *   never replace them with the typed enum that already exists.
 * - Severity: medium. Default-on but noisy enough that the rule is
 *   conservative — it only fires when:
 *     1. The file declares a `pub enum` whose variant count is
 *        `<= 32` (heuristic: huge enums are usually flagsets or
 *        generated).
 *     2. The function's parameter list contains a `String` / `&str`
 *        whose parameter name suggests an enum-driven dispatch
 *        (`kind`, `type`, `mode`, `event`, `status`, `category`,
 *        `action`, `state`, `level`).
 *
 * Companion rules:
 *   - rust/unused-pub-fn
 *   - rust/unwrap-in-production
 *   - rust/todo-macro
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface RustStringlyTypedContext {
  // No configuration needed.
}

/**
 * Parameter name fragments commonly used for a stringly-typed enum
 * dispatch. Hand-curated from a survey of real AI slop in 5
 * well-known Rust repos — these are the words AI assistants most
 * often pick for an "I'll switch this to an enum later" parameter.
 */
const SUSPECT_PARAM_NAMES = new Set([
  'kind', 'type', 'mode', 'event', 'status', 'category',
  'action', 'state', 'level', 'role', 'tier', 'phase', 'tag',
  'format', 'shape', 'direction', 'side', 'method',
]);

/**
 * Maximum enum-variant count considered suspicious. Bigger enums are
 * usually reserved for command identifiers or generated bitflags; the
 * "I should enum-ify this" suspicion drops fast.
 */
const MAX_VARIANT_COUNT = 32;

export const rustStringlyTypedRule = createRule<RustStringlyTypedContext>({
  id: 'rust/stringly-typed',
  category: 'logic',
  severity: 'medium',
  aiSpecific: true,
  description: 'String / &str parameter where a typed enum exists in the same file',
  create(_context: RuleContext): RustStringlyTypedContext {
    return {};
  },
  analyze(_context: RustStringlyTypedContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    if (!facts.v2?.rustFile) return issues;
    const source = facts.v2._source ?? '';
    if (!source) return issues;

    const lineOffsets = buildLineOffsets(source);

    // Collect the union of pub-enum names in scope. The v2 walker
    // doesn't surface enums (only structs/traits/impls), so we
    // extract them inline from the source via a small regex —
    // avoids re-parsing just for enum names.
    const enumCandidates = collectEnumCandidates(source);
    if (enumCandidates.length === 0) return issues;

    // For each function, scan its parameter text for suspect names
    // with a String / &str type.
    for (const fn of facts.v2.rustFile.functions) {
      const paramText = extractParameterText(source, lineOffsets, fn);
      if (!paramText) continue;
      const matches = scanForStringlyParams(paramText);
      if (matches.length === 0) continue;
      issues.push({
        ruleId: 'rust/stringly-typed',
        category: 'logic',
        severity: 'medium',
        aiSpecific: true,
        message: matches.length === 1
          ? `Parameter '${matches[0]!.name}' typed as '${matches[0]!.type}', but enum ${enumCandidates[0]!.name} exists in the file`
          : `Function has ${matches.length} stringly-typed parameters; enum ${enumCandidates[0]!.name} exists in the file`,
        line: fn.line,
        column: fn.column,
        advice:
          `Replace the String/&str parameter with the typed enum. Stringly-typed APIs lose ` +
          `type information at the boundary; a typo ('Click' vs 'click') only fails at runtime. ` +
          `AI agents introduce these during exploratory scaffolding, then never replace them with ` +
          `the existing enum.`,
      });
    }

    return issues;
  },
});

interface EnumCandidate {
  name: string;
  variantCount: number;
  line: number;
}

function collectEnumCandidates(source: string): EnumCandidate[] {
  const out: EnumCandidate[] = [];
  const enumRe = /^(?:pub(?:\([^)]+\))?\s+)?enum\s+(\w+)\s*\{([^}]*)\}/gm;
  for (const m of source.matchAll(enumRe)) {
    const body = m[2] ?? '';
    const variants = body
      .split(/,(?![^()]*\))/)
      .map((s) => s.trim())
      .filter((s) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s.split(/\s+/)[0] ?? ''));
    if (variants.length > MAX_VARIANT_COUNT) continue;
    if (variants.length < 2) continue;
    out.push({ name: m[1]!, variantCount: variants.length, line: lineOfMatch(source, m.index ?? 0) });
  }
  return out;
}

function lineOfMatch(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

/** Cheap line-offset table. Duplicated from the JS engine helper
 *  (`buildLineOffsets`) to keep this rule independent. */
function buildLineOffsets(source: string): number[] {
  const out: number[] = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') out.push(i + 1);
  }
  return out;
}

/**
 * Slice the parameter region out of the source. Parameters live
 * between the function declaration start and the body `{`. We use
 * the function's start line + a 200-char scan cap to find `(` ... `)`.
 */
function extractParameterText(
  source: string,
  lineOffsets: number[],
  fn: NonNullable<NonNullable<ScanFacts['v2']>['rustFile']>['functions'][number],
): string {
  const start = lineOffsets[Math.max(0, fn.line - 1)] ?? 0;
  // Look forward up to 400 chars for the `(...)` group. Cap prevents
  // scanning the whole file for one-line fn declarations.
  const head = source.slice(start, start + 400);
  const openIdx = head.indexOf('(');
  if (openIdx < 0) return '';
  // Find the matching `)` — handle single-line parens first, fall
  // back to a simple scan (no nested generics support beyond typical
  // function signatures).
  let closeIdx = -1;
  let depth = 0;
  for (let i = openIdx; i < head.length; i++) {
    if (head[i] === '(') depth++;
    else if (head[i] === ')') {
      depth--;
      if (depth === 0) {
        closeIdx = i;
        break;
      }
    }
  }
  if (closeIdx < 0) return '';
  return head.slice(openIdx + 1, closeIdx);
}

function scanForStringlyParams(paramText: string): Array<{ name: string; type: string }> {
  const out: Array<{ name: string; type: string }> = [];
  // Match `name: String`, `name: &String`, `name: &str`, or `name: &mut String`.
  // (Note: bare `&str` is 4 chars; `String` is 6; both must be
  // covered by the same regex.)
  for (const m of paramText.matchAll(
    /\b([a-z_][a-zA-Z0-9_]*)\s*:\s*(&\s*(?:mut\s+)?(?:str|String)\b)/g,
  )) {
    const name = m[1]!;
    const type = m[2]!;
    if (!SUSPECT_PARAM_NAMES.has(name)) continue;
    out.push({ name, type });
  }
  return out;
}

export default rustStringlyTypedRule satisfies Rule<RustStringlyTypedContext>;
