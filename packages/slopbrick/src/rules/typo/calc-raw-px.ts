import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import {   parseStyleObject , STYLE_BLOCK_RE, lineOfSource , matchAll } from '../utils';

export interface CalcRawPxContext {
  // No per-context state required.
}

const CALC_RAW_PX_RE = /calc\([^)]*\d+px[^)]*\)/i;

const LAYOUT_CSS_PROPS = new Set([
  'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'gap', 'column-gap', 'row-gap', 'inset', 'top', 'right', 'bottom', 'left',
  'flex-basis', 'transform', 'translate',
]);


export const calcRawPxRule = createRule<CalcRawPxContext>({
  id: 'typo/calc-raw-px',
  category: 'typo',
  severity: 'high',
  aiSpecific: false,
  description: "calc() with raw px units in style props",
  create(_context: RuleContext): CalcRawPxContext {
    return {};
  },
  analyze(_context: CalcRawPxContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    let totalViolations = 0;
    type Pending = { line: number; column: number; property: string };
    const pending: Pending[] = [];

    if (facts.v2) {
      const source = facts.v2._source ?? '';
      for (const blockMatch of matchAll(STYLE_BLOCK_RE, source)) {
        const blockSource = blockMatch[1];
        const blockLine = lineOfSource(source, blockMatch.index);
        for (const entry of parseStyleObject('{' + blockSource + '}')) {
          if (!LAYOUT_CSS_PROPS.has(entry.property)) continue;
          if (CALC_RAW_PX_RE.test(entry.value)) {
            totalViolations += 1;
            pending.push({ line: blockLine, column: 1, property: entry.property });
          }
        }
      }
    }

    if (totalViolations < 3) return issues;

    for (const p of pending) {
      issues.push({
        ruleId: 'typo/calc-raw-px',
        category: 'typo',
        severity: 'high',
        aiSpecific: false,
        message: `calc() in ${p.property} uses raw px units; prefer rem/em for scalable layout.`,
        line: p.line,
        column: p.column,
        advice: 'Replace px values in calc() with rem or em units.',
      });
    }

    return issues;
  },
});

export default calcRawPxRule satisfies Rule<CalcRawPxContext>;