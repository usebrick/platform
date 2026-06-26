import { describe, it, expect } from 'vitest';
import { SEVERITY_WEIGHTS } from '../src/engine/metrics';
import { builtinRules } from '../src/rules/builtins';

/**
 * removed during the scoring-model freeze; no rule uses it now. If anyone re-introduces it, this test
 * fails immediately.
 */
describe('Severity contract (frozen during scoring-model refactor)', () => {
  it('SeverityWeights only defines low/medium/high', () => {
    expect(Object.keys(SEVERITY_WEIGHTS).sort()).toEqual(['high', 'low', 'medium']);
    expect((SEVERITY_WEIGHTS as Record<string, unknown>).critical).toBeUndefined();
  });

  it('no built-in rule uses severity "critical"', () => {
    const offenders = builtinRules.filter((r) => (r.severity as string) === 'critical');
    expect(offenders, `rules using 'critical' severity: ${offenders.map((r) => r.id).join(', ')}`).toEqual([]);
  });
});
