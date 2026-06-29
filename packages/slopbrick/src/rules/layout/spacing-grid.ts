
//
// **Peer-reviewed citation:**
// - The 4pt/8pt grid system: Material Design 3
//   (https://m3.material.io/styles/spacing/overview), IBM Carbon
//   Design System, Apple HIG. The rule implements this convention.
// - v0.12.2 calibration: HYGIENE. Both AI and human code use
//   a small grid; the rule is not AI-discriminative.
//
import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import {   splitClassName, parseStyleObject, classNamesFromJsx , STYLE_BLOCK_RE, lineOfSource , matchAll } from '../utils';
import { DEFAULT_SPACING_SCALE } from '../../config';

const SPACING_PREFIX_RE = /^-?(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y)-(.+)$/;
const ARBITRARY_VALUE_RE = /^(-?\d+(?:\.\d+)?)(px|rem)$/;
const SKIP_VALUES = new Set(['auto', 'full', 'screen', 'min', 'max', 'fit', 'none']);
const INLINE_SPACING_PROPS = new Set([
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'gap', 'column-gap', 'row-gap',
]);

function toScaleUnits(numeric: number, unit: 'px' | 'rem'): number {
  return unit === 'px' ? numeric / 4 : numeric / 0.25;
}

function isInScale(value: number, scale: readonly number[]): boolean {
  return scale.some((entry) => Math.abs(entry - value) < 1e-6);
}

function parseSpacingValue(raw: string): { value: number; unit?: 'px' | 'rem' } | undefined {
  if (raw === '0') return { value: 0 };
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return { value: numeric };
  const match = ARBITRARY_VALUE_RE.exec(raw);
  if (match) {
    const value = Number(match[1]);
    const unit = match[2] as 'px' | 'rem';
    if (Number.isFinite(value)) return { value, unit };
  }
  return undefined;
}

function checkClassToken(token: string, scale: readonly number[]): number | undefined {
  const match = SPACING_PREFIX_RE.exec(token);
  if (!match) return undefined;
  let raw = match[2];
  if (raw.startsWith('[') && raw.endsWith(']')) raw = raw.slice(1, -1);
  if (raw === 'px') return undefined;
  if (SKIP_VALUES.has(raw)) return undefined;
  const parsed = parseSpacingValue(raw);
  if (!parsed || parsed.value === 0) return undefined;
  const scaleUnits = parsed.unit ? toScaleUnits(parsed.value, parsed.unit) : parsed.value;
  return isInScale(scaleUnits, scale) ? undefined : scaleUnits;
}

function checkInlineValue(value: string, scale: readonly number[]): number[] {
  const offenders: number[] = [];
  const re = /(-?\d+(?:\.\d+)?)(px|rem)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value)) !== null) {
    const numeric = Number(match[1]);
    const unit = match[2] as 'px' | 'rem';
    if (!Number.isFinite(numeric) || numeric === 0) continue;
    const scaleUnits = toScaleUnits(numeric, unit);
    if (!isInScale(scaleUnits, scale)) offenders.push(scaleUnits);
  }
  return offenders;
}


export interface SpacingGridContext {
  scale: readonly number[];
}

export const spacingGridRule = createRule<SpacingGridContext>({
  id: 'layout/spacing-grid',
  category: 'layout',
  severity: 'medium',
  aiSpecific: false,
  description: "Spacing values outside the project scale",
  create(context: RuleContext): SpacingGridContext {
    return {
      scale: context.config.spacingScale ?? DEFAULT_SPACING_SCALE,
    };
  },
  analyze(context: SpacingGridContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const seen = new Set<string>();
    const pending: Issue[] = [];

    if (facts.v2) {
      for (const fact of classNamesFromJsx(facts.v2)) {
        for (const token of splitClassName(fact.value)) {
          const key = `${fact.line}:${fact.column}:${token}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const offending = checkClassToken(token, context.scale);
          if (offending !== undefined) {
            pending.push({
              ruleId: 'layout/spacing-grid',
              category: 'layout',
              severity: 'medium',
              aiSpecific: false,
              message: `Spacing token "${token}" uses ${offending.toFixed(2)} which is not in the configured spacing scale.`,
              line: fact.line,
              column: fact.column,
              advice: 'Use a value from the configured spacing scale or add the value to the scale in your config.',
            });
          }
        }
      }

      const source = facts.v2._source ?? '';
      for (const blockMatch of matchAll(STYLE_BLOCK_RE, source)) {
        const blockLine = lineOfSource(source, blockMatch.index);
        for (const entry of parseStyleObject('{' + blockMatch[1] + '}')) {
          if (!INLINE_SPACING_PROPS.has(entry.property)) continue;
          const offenders = checkInlineValue(entry.value, context.scale);
          for (const offending of offenders) {
            pending.push({
              ruleId: 'layout/spacing-grid',
              category: 'layout',
              severity: 'medium',
              aiSpecific: false,
              message: `Inline ${entry.property} value ${offending.toFixed(2)} is not in the configured spacing scale.`,
              line: blockLine,
              column: 1,
              advice: 'Use a value from the configured spacing scale or add the value to the scale in your config.',
            });
          }
        }
      }
    }

    if (pending.length < 3) return issues;
    return pending;
  },
});

export default spacingGridRule satisfies Rule<SpacingGridContext>;