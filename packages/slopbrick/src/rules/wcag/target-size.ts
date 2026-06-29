// Rule: wcag/target-size
//
// Per W3C (2018), Web Content Accessibility Guidelines (WCAG) 2.1, Success Criterion 2.5.5 (Target Size); Fitts, P. M. (1954), ‘The Information Capacity of the Human Motor System in Controlling the Amplitude of Movement’, J. Exp. Psychol. 47(6):381-391.
//
// **Peer-reviewed citation:**
// - W3C WCAG 2.2, Success Criterion 2.5.5 "Target Size (Enhanced)"
//   and SC 2.5.8 "Target Size (Minimum)". The rule implements
//   the 24×24 CSS pixel minimum touch target.
// - v0.12.2 calibration: DORMANT.
import type { Rule, Issue, RuleContext, ScanFacts, ElementFact } from '../../types';
import { createRule } from '../rule';
import { splitClassName } from '../utils';

const SIZE_PREFIX_RE = /^(min-w|min-h|max-w|max-h|h|w|size)-(.+)$/;
const PAD_PREFIX_RE = /^(p|px|py)-(.+)$/;
const ARBITRARY_VALUE_RE = /^\[(-?\d+(?:\.\d+)?)(px|rem)]$/;
const NON_NUMERIC_SIZES = new Set(['full', 'screen', 'fit', 'min', 'max']);

function tailwindUnits(value: string): number | undefined {
  const token = Number(value);
  if (Number.isFinite(token)) return token;
  const match = ARBITRARY_VALUE_RE.exec(value);
  if (!match) return undefined;
  const numeric = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(numeric)) return undefined;
  const rem = unit === 'px' ? numeric / 16 : numeric;
  return rem * 4;
}

function isMinimumSizingToken(className: string): boolean {
  const sizeMatch = SIZE_PREFIX_RE.exec(className);
  if (sizeMatch) {
    const value = sizeMatch[2];
    const units = tailwindUnits(value);
    if (units === undefined) return NON_NUMERIC_SIZES.has(value);
    return units >= 6;
  }
  const padMatch = PAD_PREFIX_RE.exec(className);
  if (padMatch) {
    const units = tailwindUnits(padMatch[2]);
    return units !== undefined && units >= 2;
  }
  return false;
}

function isPositiveSize(value: string | undefined): boolean {
  if (value === undefined || value.length === 0) return false;
  const numeric = parseFloat(value);
  return Number.isFinite(numeric) && numeric > 0;
}

interface ParsedSelector {
  tag?: string;
  id?: string;
  classes: string[];
  attributes: Array<{ name: string; value?: string; operator: string }>;
}

function parseSimpleSelector(selector: string): ParsedSelector | undefined {
  const trimmed = selector.trim();
  if (!trimmed || trimmed === '*') return undefined;

  const result: ParsedSelector = { classes: [], attributes: [] };
  let rest = trimmed;

  const typeMatch = /^([a-zA-Z][a-zA-Z0-9]*)/.exec(rest);
  if (typeMatch) {
    result.tag = typeMatch[1];
    rest = rest.slice(typeMatch[0].length);
  }

  const idClassAttrRe = /^(#[a-zA-Z0-9_-]+|\.[^.#\[\s>+~]+|\[[^\]]+\])/;
  while (rest.length > 0) {
    const match = idClassAttrRe.exec(rest);
    if (!match) break;
    const token = match[1];
    rest = rest.slice(token.length);

    if (token.startsWith('#')) {
      result.id = token.slice(1);
    } else if (token.startsWith('.')) {
      result.classes.push(token.slice(1));
    } else if (token.startsWith('[') && token.endsWith(']')) {
      const content = token.slice(1, -1).trim();
      const attrMatch = /^([a-zA-Z0-9_-]+)(?:(\W?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]]*)))?$/.exec(content);
      if (attrMatch) {
        result.attributes.push({
          name: attrMatch[1],
          operator: attrMatch[2] ?? '',
          value: attrMatch[3] ?? attrMatch[4] ?? attrMatch[5] ?? undefined,
        });
      }
    }
  }

  if (/[\s>+~:]/.test(rest)) return undefined;
  return result;
}

function matchesSelector(
  element: { tag: string; attributes: Record<string, string | undefined>; classNames: string[] } | ElementFact,
  selector: string,
): boolean {
  const bareClassRe = /^[a-zA-Z0-9_-]+$/;
  let parsed: ParsedSelector | undefined;
  if (bareClassRe.test(selector.trim())) {
    parsed = { classes: [selector.trim()], attributes: [] };
  } else {
    parsed = parseSimpleSelector(selector);
  }
  if (!parsed) return false;

  if (parsed.tag && parsed.tag !== element.tag) return false;

  if (parsed.id && parsed.id !== element.attributes.id) return false;

  const elementClasses = new Set(
    'classNames' in element && Array.isArray(element.classNames) && typeof element.classNames[0] === 'string'
      ? (element.classNames as string[])
      : (element as ElementFact).classNames.flatMap((fact) => splitClassName(fact.value)),
  );
  if (parsed.classes.length > 0 && !parsed.classes.every((cls) => elementClasses.has(cls))) {
    return false;
  }

  for (const attr of parsed.attributes) {
    const actual = element.attributes[attr.name];
    if (attr.operator === '') {
      if (actual === undefined) return false;
    } else if (attr.operator === '=') {
      if (actual !== attr.value) return false;
    } else if (attr.operator === '~=') {
      if (actual === undefined) return false;
      const parts = actual.split(/\s+/);
      if (!parts.includes(attr.value ?? '')) return false;
    } else if (attr.operator === '|=') {
      if (actual !== attr.value && !actual?.startsWith(`${attr.value}-`)) return false;
    } else if (attr.operator === '^=') {
      if (attr.value === undefined || !actual?.startsWith(attr.value)) return false;
    } else if (attr.operator === '$=') {
      if (attr.value === undefined || !actual?.endsWith(attr.value)) return false;
    } else if (attr.operator === '*=') {
      if (attr.value === undefined || actual === undefined || !actual.includes(attr.value)) return false;
    } else {
      return false;
    }
  }

  return true;
}

export interface TargetSizeContext {
  exemptSelectors: readonly string[];
  skip: boolean;
}

export const targetSizeRule = createRule<TargetSizeContext>({
  id: 'wcag/target-size',
  category: 'wcag',
  severity: 'high',
  aiSpecific: false,
  description: "Interactive element smaller than 24×24 px",
  create(context: RuleContext): TargetSizeContext {
    const requireTailwind = context.config.wcag.targetSizeRequireTailwind ?? true;
    return {
      exemptSelectors: context.config.wcag.targetSizeExemptSelectors,
      skip: requireTailwind && !context.config.hasTailwind,
    };
  },
  analyze(context: TargetSizeContext, facts: ScanFacts): Issue[] {
    if (context.skip) return [];
    if (!facts.v2) return [];

    const issues: Issue[] = [];

    const elements = facts.v2.jsx.elements.filter(
      (e) => e.tag === 'button' || e.tag === 'a' || e.tag === 'input',
    );
    for (const element of elements) {
      const isExempt = context.exemptSelectors.some((selector) =>
        matchesSelector(element, selector),
      );
      if (isExempt) continue;

      const hasSizing = element.classNames.some((className) => isMinimumSizingToken(className));
      const width = element.attributes.width;
      const height = element.attributes.height;
      const hasExplicitSize = isPositiveSize(width) || isPositiveSize(height);

      if (!hasSizing && !hasExplicitSize) {
        issues.push({
          ruleId: 'wcag/target-size',
          category: 'wcag',
          severity: 'high',
          aiSpecific: false,
          message: `Interactive '${element.tag}' lacks a sufficient target-size token`,
          line: element.line,
          column: element.column,
          advice:
            'Add h-*, w-*, p-*, min-w-*, min-h-*, size-*, or an explicit width/height attribute.',
        });
      }
    }

    return issues;
  },
});

export default targetSizeRule satisfies Rule<TargetSizeContext>;