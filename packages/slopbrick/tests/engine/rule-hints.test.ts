import { describe, it, expect } from 'vitest';
import { RULE_HINTS } from '../../src/snippet/data';
import { builtinRules } from '../../src/rules/builtins';

/**
 * agents know the rule's intent BEFORE they write code that triggers it.
 */
describe('RULE_HINTS coverage', () => {
  it('every builtin rule has a hint', () => {
    const ruleIds = builtinRules.map((r) => r.id).sort();
    const hintKeys = Object.keys(RULE_HINTS).sort();
    const missing = ruleIds.filter((id) => !hintKeys.includes(id));
    expect(missing, `rules without hints: ${missing.join(', ')}`).toEqual([]);
  });

  it('every hint is non-empty and ≤ 240 chars', () => {
    for (const [id, hint] of Object.entries(RULE_HINTS)) {
      expect(hint.length, `hint for ${id} is too long (${hint.length} chars)`).toBeLessThanOrEqual(240);
      expect(hint.length, `hint for ${id} is empty`).toBeGreaterThan(0);
    }
  });

  it('hints are idempotent (no duplicate keys)', () => {
    const keys = Object.keys(RULE_HINTS);
    expect(new Set(keys).size).toBe(keys.length);
  });
});