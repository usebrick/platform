/**
 * Rule: go/struct-tag-inconsistency
 *
 * A Go struct whose fields mix `json:"foo"` and `json:"foo,omitempty"`
 * (or any other tag inconsistency). Real Go code uses one
 * convention per struct (or per package). AI agents mix styles
 * when generating struct definitions.
 *
 * **Why this matters:**
 * - Tag inconsistency is a real source of bugs: if a struct has
 *   `json:"name"` on one field and `json:"name,omitempty"` on
 *   another, the encoding/json behavior differs (empty string
 *   vs omitted).
 * - AI agents sometimes generate structs with mixed styles when
 *   the training data has both.
 * - Severity: low. Tag inconsistency isn't a bug per se, but it's
 *   a style signal.
 * - Default off (DORMANT) until v10.2 corpus calibration.
 * The v10 corpus (576,750 files) is the source data; the rule is
 * DORMANT until a v10-specific precision/recall pass confirms
 * FPR stays below 0.5%.
 *
 * **Scope:** file-local. Regex on the source text + brace-walk to
 * scope to a single struct. Heuristic.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface GoStructTagInconsistencyContext {
  // No configuration.
}

// Matches: `json:"foo"` or `json:"foo,omitempty"` (and similar tags),
// inside the backtick-wrapped Go struct tag syntax: `\`json:"..."\``.
// Capture group 1 is the tag name (no commas); group 2 is the options.
const JSON_TAG_REGEX = /`json:"([^",]+)(?:,([^"]+))?"`/g;

export const goStructTagInconsistencyRule = createRule<GoStructTagInconsistencyContext>({
  id: 'go/struct-tag-inconsistency',
  category: 'typo',
  severity: 'low',
  aiSpecific: true,
  description: 'Struct fields mix json:"foo" and json:"foo,omitempty" — pick one convention per struct',
  create(_context: RuleContext): GoStructTagInconsistencyContext {
    return {};
  },
  analyze(_context: GoStructTagInconsistencyContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;

    // Walk structs (text-based, brace-balanced). For each struct,
    // collect all `json:"..."` tag values. Flag the first field
    // whose tag style differs from the most common style.
    const structRegex = /type\s+[A-Z][A-Za-z0-9_]*\s+struct\s*\{/g;
    let structMatch: RegExpExecArray | null;
    while ((structMatch = structRegex.exec(source)) !== null) {
      const startIdx = structMatch.index;
      const openBrace = source.indexOf('{', startIdx);
      if (openBrace < 0) continue;
      let depth = 1;
      let i = openBrace + 1;
      while (i < source.length && depth > 0) {
        const ch = source[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        i++;
      }
      const structBody = source.slice(openBrace, i);
      const structLine = source.slice(0, startIdx).split('\n').length;

      // Collect tag styles in the struct body.
      const styleCount: Record<string, number> = {};
      const tagMatches: Array<{ tag: string; style: string; idx: number }> = [];
      let m: RegExpExecArray | null;
      JSON_TAG_REGEX.lastIndex = 0;
      while ((m = JSON_TAG_REGEX.exec(structBody)) !== null) {
        const tag = m[1] as string;
        const options = m[2] ?? '';
        // Style key: "name" (no options) or "name,options" (with options)
        const style = options ? 'with-options' : 'no-options';
        styleCount[style] = (styleCount[style] ?? 0) + 1;
        tagMatches.push({ tag, style, idx: openBrace + m.index });
      }

      // Need >= 2 tags in >= 2 different styles to flag.
      const styles = Object.keys(styleCount);
      if (styles.length < 2 || tagMatches.length < 2) continue;

      // The dominant style is the most common one. Flag the fields
      // whose style doesn't match.
      const dominant = styles.reduce((a, b) =>
        (styleCount[a] ?? 0) >= (styleCount[b] ?? 0) ? a : b,
      );
      const minority = tagMatches.filter((t) => t.style !== dominant);
      if (minority.length === 0) continue;

      for (const m of minority) {
        const line = source.slice(0, m.idx).split('\n').length;
        issues.push({
          ruleId: 'go/struct-tag-inconsistency',
          category: 'typo',
          severity: 'low',
          aiSpecific: true,
          message:
            `Struct mixes json tag styles — this field uses ` +
            `"json:\"${m.tag}${m.style === 'with-options' ? ',...' : ''}\"" ` +
            `but the dominant style is ${dominant === 'with-options' ? 'with options (e.g. omitempty)' : 'no options'}`,
          line,
          column: 1,
          advice:
            'Pick one tag style per struct. If most fields are ' +
            '`json:"foo"`, this field should be too. Real Go code ' +
            'maintains consistency within a struct (or within a ' +
            'package). Reference: go/struct-tag-inconsistency v0.19.',
        });
      }
      // Avoid duplicate struct-level flagging.
      if (issues.length > 0) break;
    }
    return issues;
  },
});

export default goStructTagInconsistencyRule satisfies Rule<GoStructTagInconsistencyContext>;
