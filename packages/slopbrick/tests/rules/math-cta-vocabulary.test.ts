// v0.5.2: unit tests for typo/math-cta-vocabulary after vocab tightening.
//
// The previous vocab list included universal form terms (save, edit,
// close, cancel, next, back, ok, yes, no, done, confirm, apply,
// reset, etc.) that fired on virtually any UI with buttons — FP > TP
// in the labeled corpus. The vocab was tightened to marketing/CTA
// copy only.

import { describe, expect, it } from 'vitest';
import { mathCtaVocabularyRule } from '../../src/rules/typo/math-cta-vocabulary';
import type { RuleContext, ScanFacts } from '../../src/types';

function makeFacts(buttonLabels: string[]): ScanFacts {
  const elements = buttonLabels.map((label, i) => ({
    tag: 'button',
    line: i + 1,
    column: 1,
    attributes: { value: label },
  }));
  return {
    filePath: '/x.tsx',
    v2: {
      file: { path: '/x.tsx', loc: 10, extension: '.tsx', framework: 'react' },
      imports: [],
      components: [],
      jsx: { elements, maxNestingDepth: 1 },
      designTokens: undefined,
      componentSizes: [],
      disabledRules: [],
    } as unknown as ScanFacts['v2'],
  };
}

function makeContext(): RuleContext {
  return {
    config: { rules: {} } as unknown as RuleContext['config'],
    filePath: '/x.tsx',
    cwd: '/',
  };
}

describe('typo/math-cta-vocabulary (v0.5.2: tightened vocab)', () => {
  it('does NOT fire on universal form buttons (save / cancel / ok)', () => {
    const facts = makeFacts(['Save', 'Cancel', 'OK', 'Apply']);
    const issues = mathCtaVocabularyRule.analyze(makeContext(), facts);
    expect(issues).toEqual([]);
  });

  it('does NOT fire on a mix of AI-vocab and universal buttons', () => {
    // 4 buttons: 1 AI-vocab, 3 universal. Ratio = 0.25, below 0.80.
    const facts = makeFacts(['Get started', 'Save', 'Cancel', 'Apply']);
    const issues = mathCtaVocabularyRule.analyze(makeContext(), facts);
    expect(issues).toEqual([]);
  });

  it('still fires when ≥80% of buttons are AI marketing copy', () => {
    // 5 buttons: 4 AI-vocab, 1 universal. Ratio = 0.80 → fire.
    const facts = makeFacts(['Get started', 'Sign up', 'Learn more', 'Try free', 'Save']);
    const issues = mathCtaVocabularyRule.analyze(makeContext(), facts);
    expect(issues.length).toBe(1);
    expect(issues[0].message).toMatch(/4\/5/);
  });

  it('does NOT fire when fewer than 4 buttons exist', () => {
    // 3 AI-vocab buttons — below threshold.
    const facts = makeFacts(['Get started', 'Sign up', 'Learn more']);
    const issues = mathCtaVocabularyRule.analyze(makeContext(), facts);
    expect(issues).toEqual([]);
  });

  it('skips empty / whitespace-only button labels', () => {
    const facts = makeFacts(['Get started', '', '  ', 'Sign up']);
    // Total non-empty = 2 (below threshold), so no fire.
    const issues = mathCtaVocabularyRule.analyze(makeContext(), facts);
    expect(issues).toEqual([]);
  });

  it('normalizes case and strips punctuation before comparing', () => {
    // "GET STARTED!" should normalize to "get started"
    const facts = makeFacts(['GET STARTED!', 'Sign up.', 'Learn more?', 'Try free,']);
    const issues = mathCtaVocabularyRule.analyze(makeContext(), facts);
    expect(issues.length).toBe(1);
  });

  it('does NOT fire on domain-specific CTA copy', () => {
    const facts = makeFacts(['Reserve', 'Confirm ride', 'Activate card', 'View statement']);
    const issues = mathCtaVocabularyRule.analyze(makeContext(), facts);
    expect(issues).toEqual([]);
  });
});