// Rule: wcag/missing-alt
//
// Per W3C (2018), Web Content Accessibility Guidelines (WCAG) 2.1,
// Success Criterion 1.1.1 "Non-text Content" (Level A): all <img>
// elements must have an `alt` attribute. Empty alt (`alt=""`) is
// valid for purely decorative images. `role="presentation"` is
// also valid for decorative images (the element is removed from
// the accessibility tree).
//
// Catches `<img src="..." />` and `<img src="...">` without `alt`.
// Skips `<img alt="">` and `<img role="presentation">`.
//
// Severity: medium (Level A violation).

import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { isUIFile, lineOfSource } from '../utils';

const IMG_OPEN_RE = /<img\b[^>]*>/gi;
const HAS_ALT_RE = /\balt\s*=\s*("[^"]*"|'[^']*')/i;
const HAS_PRESENTATION_ROLE_RE = /\brole\s*=\s*["'](?:presentation|none)["']/i;

function scanForMissingAlt(source: string): Array<{ message: string; line: number; column: number }> {
  const hits: Array<{ message: string; line: number; column: number }> = [];
  IMG_OPEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = IMG_OPEN_RE.exec(source)) !== null) {
    const tagText = m[0];
    if (HAS_ALT_RE.test(tagText)) continue;
    if (HAS_PRESENTATION_ROLE_RE.test(tagText)) continue;
    hits.push({
      message:
        '<img> element is missing an `alt` attribute. WCAG 2.1 SC 1.1.1 ' +
        'requires alt text for non-text content. Use alt="" for purely ' +
        'decorative images, or role="presentation" to remove it from the ' +
        'accessibility tree.',
      line: lineOfSource(source, m.index),
      column: m.index - source.lastIndexOf('\n', m.index - 1),
    });
  }
  return hits;
}

export const missingAltRule = createRule<RuleContext>({
  id: 'wcag/missing-alt',
  // v0.20.0 calibration: lift 1.0, recall 0.000. Lift of 1.0
  // means the rule has zero discriminative power — it fires
  // equally on positive and negative examples. Dead rule.
  // Disable until rewritten.
  defaultOff: true,
  category: 'wcag',
  severity: 'medium',
  aiSpecific: false,
  description:
    '<img> element is missing an `alt` attribute (WCAG 2.1 SC 1.1.1, Level A).',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    // v0.39.0: file-type guard. WCAG rules should not fire on
    // .ts library files (codemod fixtures, type definitions) that
    // mention <img> as a string — only on actual UI source.
    if (!isUIFile(facts.filePath)) return issues;
    const source = facts.v2?._source;
    if (!source) return issues;
    for (const hit of scanForMissingAlt(source)) {
      issues.push({
        ruleId: 'wcag/missing-alt',
        category: 'wcag',
        severity: 'medium',
        aiSpecific: false,
        message: hit.message,
        line: hit.line,
        column: hit.column,
        advice:
          'Add `alt="..."` describing the image, or `alt=""` (or role="presentation") ' +
          'for purely decorative images.',
      });
    }
    return issues;
  },
});

export default missingAltRule satisfies Rule<RuleContext>;
