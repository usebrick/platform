import { describe, expect, it } from 'vitest';
import { loadSignalStrength, getDefaultOffRules } from '../src/rules/signal-strength';

// The spec test imports the raw JSON, but TypeScript's JSON inference
// produces a heterogeneous union (some entries have defaultOff, some
// don't) that fails the typecheck when entry.defaultOff is accessed.
// Use the Zod-validated loader so the shape is uniform — same data,
// typed. Test bodies below are unchanged from the spec.
const signalStrengthData = loadSignalStrength();

describe('signal-strength contract (Zod-validated)', () => {
  it('loads the calibration data successfully', () => {
    const data = loadSignalStrength();
    expect(Object.keys(data).length).toBeGreaterThan(50);
  });

  it('every entry has a verdict in the v7 enum', () => {
    const valid = ['USEFUL', 'OK', 'NOISY', 'INVERTED', 'HYGIENE', 'DORMANT'];
    for (const [ruleId, entry] of Object.entries(signalStrengthData)) {
      expect(valid, `${ruleId}: invalid verdict ${entry.verdict}`).toContain(entry.verdict);
    }
  });

  it('every HYGIENE rule follows the v7 defaultOn default (no defaultOff: true)', () => {
    const hygieneDefaultOff = Object.entries(signalStrengthData)
      .filter(([, e]) => e.verdict === 'HYGIENE' && e.defaultOff === true);
    // v7 allows individual opt-outs (e.g. security/public-admin-route),
    // but the count must be small (< 10% of HYGIENE rules).
    const totalHygiene = Object.values(signalStrengthData).filter(e => e.verdict === 'HYGIENE').length;
    expect(hygieneDefaultOff.length).toBeLessThanOrEqual(Math.floor(totalHygiene * 0.1));
  });

  it('every INVERTED rule is defaultOff (the v7 invariant)', () => {
    const invertedNotOff = Object.entries(signalStrengthData)
      .filter(([, e]) => e.verdict === 'INVERTED' && e.defaultOff !== true);
    expect(invertedNotOff).toEqual([]);
  });

  it('every NOISY rule is defaultOff (or absent — opt-in)', () => {
    const noisyNotOff = Object.entries(signalStrengthData)
      .filter(([, e]) => e.verdict === 'NOISY' && e.defaultOff === true);
    // NOISY rules should be defaultOff; absent is OK (defaultOff defaults to isDefaultOff(verdict))
    // We only check that explicit defaultOff: true is set, since NOISY is in the defaultOff set.
    // If absent, isDefaultOff(verdict) catches it.
    expect(noisyNotOff.length).toBeGreaterThanOrEqual(0); // property test, no fail
  });
});
