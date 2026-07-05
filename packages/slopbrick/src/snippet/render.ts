// Shared snippet rendering helpers.
//
//   aiSpecificRules — filter to AI-only rules, sorted alphabetically.
//   categorizeRules — bucket rules by category, each bucket sorted.
//   baseContent     — produce the standard "<title>\n<intro>\n## Category
//                     directives + ## Per-rule directives" body that
//                     every agent snippet except cursor shares.
//
// The 9 per-target generators in ./generators.ts wrap baseContent with
// tool-specific titles, intros, and footers.
//
// v0.42.0 (Sprint 3, §3a.2): safeRewrite — safely replace the
// managed slopbrick block in a directive file (e.g. AGENTS.md).
// Marked by `<!-- slopbrick:begin:v3 -->` /
// `<!-- slopbrick:end:v3 -->`. Three cases:
//   - both markers present  → replace inner block, leave content
//                              before the begin marker and after the
//                              end marker untouched.
//   - neither marker       → fail closed (no-op, return original).
//                              The user wrote this file by hand;
//                              don't clobber.
//   - one marker           → log warning, skip. Either the user
//                              trimmed the markers (intentional) or
//                              a prior rewrite broke. Either way, we
//                              err on the side of not stomping.

import type { Rule } from '../types';
import { CATEGORY_DIRECTIVES, RULE_HINTS } from './data.js';

function aiSpecificRules(rules: Rule[]): Rule[] {
  return rules.filter((r) => r.aiSpecific).sort((a, b) => a.id.localeCompare(b.id));
}

function categorizeRules(rules: Rule[]): Map<string, Rule[]> {
  const byCategory = new Map<string, Rule[]>();
  for (const r of rules) {
    const list = byCategory.get(r.category) ?? [];
    list.push(r);
    byCategory.set(r.category, list);
  }
  for (const list of byCategory.values()) {
    list.sort((a, b) => a.id.localeCompare(b.id));
  }
  return byCategory;
}

function baseContent(rules: Rule[], toolLabel: string, intro: string): string {
  const lines: string[] = [];
  lines.push('# ' + toolLabel);
  lines.push('');
  lines.push(intro);
  lines.push('');
  const ai = aiSpecificRules(rules);
  const byCategory = categorizeRules(ai);
  lines.push('## Category-level directives');
  lines.push('');
  for (const [category, directive] of Object.entries(CATEGORY_DIRECTIVES)) {
    lines.push('- **' + category + '**: ' + directive);
  }
  lines.push('');
  lines.push('## Per-rule directives');
  lines.push('');
  for (const [category, list] of byCategory) {
    lines.push('### ' + category);
    lines.push('');
    for (const rule of list) {
      const hint = RULE_HINTS[rule.id] ?? 'Avoid patterns that fire rule `' + rule.id + '`.';
      lines.push('- `' + rule.id + '` (' + rule.severity + '): ' + hint);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export { aiSpecificRules, categorizeRules, baseContent };

// Markers are imported from `./generators.ts` (where they're defined
// alongside `wrapWithMarkers`) to keep the schema version in one
// place; re-exports keep callers from having to know about the split.
import { MARKER_BEGIN, MARKER_END } from './generators.js';

/** Result of safeRewrite; same shape as the §a.2 plan but
 *  machine-friendly for tests. */
export interface RewriteResult {
  /** The new file content (or original content if no rewrite). */
  content: string;
  /** True iff a managed-block replacement was performed. */
  rewritten: boolean;
  /** True iff both markers were missing (fail-closed). */
  failClosed: boolean;
  /** True iff exactly one marker was found (warn + skip). */
  mismatched: boolean;
}

/** Replace the slopbrick-managed block in `existing` with
 *  `freshBlockBody`. Mutates nothing on fail-closed. */
export function safeRewrite(
  existing: string,
  freshBlockBody: string,
): RewriteResult {
  const beginIdx = existing.indexOf(MARKER_BEGIN);
  const endIdx = existing.indexOf(MARKER_END);

  if (beginIdx === -1 && endIdx === -1) {
    return { content: existing, rewritten: false, failClosed: true, mismatched: false };
  }
  if (beginIdx === -1 || endIdx === -1) {
    return { content: existing, rewritten: false, failClosed: false, mismatched: true };
  }
  if (endIdx <= beginIdx) {
    return { content: existing, rewritten: false, failClosed: false, mismatched: true };
  }

  const before = existing.slice(0, beginIdx + MARKER_BEGIN.length);
  const after = existing.slice(endIdx);
  const next = `${before}\n${freshBlockBody}\n${after}`;
  return { content: next, rewritten: true, failClosed: false, mismatched: false };
}