import { describe, expect, it } from 'vitest';
import { explainRule, formatExplain } from '../src/cli/explain';
import type { Rule } from '../src/types';

const fakeRule: Rule = {
  id: 'visual/test-rule',
  category: 'visual',
  severity: 'medium',
  aiSpecific: true,
  description: 'test',
  create: () => ({}),
  analyze: () => [],
};

const fakeRules: Rule[] = [fakeRule];
const fakeHints: Record<string, string> = {
  'visual/test-rule': 'Look for the bad pattern.',
};

describe('explainRule (v0.5.2: helpUri)', () => {
  it('returns an error for unknown rule', () => {
    const result = explainRule('does-not-exist', fakeRules, fakeHints);
    expect('error' in result).toBe(true);
  });

  it('returns a result with helpUri for a known rule', () => {
    const result = explainRule('visual/test-rule', fakeRules, fakeHints);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.helpUri).toBe(
      'https://github.com/usebrick/platform/blob/main/packages/slopbrick/src/rules/visual/test-rule.ts',
    );
    expect(result.sourcePath).toBe('src/rules/visual/test-rule.ts');
  });

  it('handles rule id without category prefix', () => {
    const ruleNoPrefix: Rule = { ...fakeRule, id: 'bare-id' };
    const result = explainRule('bare-id', [ruleNoPrefix], { 'bare-id': 'hint' });
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    // Rule id without slash is treated as the filename itself
    expect(result.sourcePath).toBe('src/rules/visual/bare-id.ts');
    expect(result.helpUri).toBe(
      'https://github.com/usebrick/platform/blob/main/packages/slopbrick/src/rules/visual/bare-id.ts',
    );
  });

  it('falls back to generic pattern when hint is missing', () => {
    const result = explainRule('visual/test-rule', fakeRules, {});
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.pattern).toContain('visual/test-rule');
  });
});

describe('formatExplain (v0.5.2: Help: line)', () => {
  it('renders the Help: line with helpUri', () => {
    const result = explainRule('visual/test-rule', fakeRules, fakeHints);
    if ('error' in result) throw new Error('expected success');
    const out = formatExplain(result);
    expect(out).toContain('Help:        https://github.com/usebrick/platform/blob/main/packages/slopbrick/src/rules/visual/test-rule.ts');
    expect(out).toContain('Source:      src/rules/visual/test-rule.ts');
    expect(out).toContain('Pattern:');
    expect(out).toContain('Remediation:');
    expect(out).toContain('Suppress / configure in slopbrick.config.mjs:');
  });

  it('renders an error string when given an error result', () => {
    const out = formatExplain({ error: 'Unknown rule: foo' });
    expect(out).toBe('Unknown rule: foo');
  });
});