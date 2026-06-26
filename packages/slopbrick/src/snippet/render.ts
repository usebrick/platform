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

import type { Rule } from '../types.js';
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