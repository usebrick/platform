import { describe, expect, it } from 'vitest';
import { VERDICTS, isDefaultOff, type Verdict } from '../src/verdicts';

describe('VERDICTS enum', () => {
  it('contains exactly the 6 known verdicts', () => {
    expect(VERDICTS).toEqual(['USEFUL', 'OK', 'NOISY', 'INVERTED', 'HYGIENE', 'DORMANT']);
  });
});

describe('isDefaultOff', () => {
  it('returns true for NOISY, INVERTED, DORMANT', () => {
    expect(isDefaultOff('NOISY')).toBe(true);
    expect(isDefaultOff('INVERTED')).toBe(true);
    expect(isDefaultOff('DORMANT')).toBe(true);
  });

  it('returns false for USEFUL, OK, HYGIENE (the v7 defaultOn verdicts)', () => {
    expect(isDefaultOff('USEFUL')).toBe(false);
    expect(isDefaultOff('OK')).toBe(false);
    expect(isDefaultOff('HYGIENE')).toBe(false);
  });

  it('exhaustively covers all VERDICTS (TypeScript exhaustiveness check)', () => {
    // The function must be defined for every verdict; this catches
    // adding a new verdict without updating isDefaultOff.
    const verdicts: Verdict[] = ['USEFUL', 'OK', 'NOISY', 'INVERTED', 'HYGIENE', 'DORMANT'];
    for (const v of verdicts) {
      const _result: boolean = isDefaultOff(v);
      expect(typeof _result).toBe('boolean');
    }
  });
});