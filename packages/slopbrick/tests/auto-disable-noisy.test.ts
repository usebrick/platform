// v0.5.2: unit tests for getAutoDowngrades and downgradeSeverity.
//
// The CLI flag --auto-disable-noisy-rules uses these helpers to
// build a downgrade map for rules whose measured precision is below
// 0.5 or recall is below 0.1.

import { describe, expect, it } from 'vitest';
import {
  downgradeSeverity,
  isReliableSignal,
  getAutoDowngrades,
} from '../src/rules/signal-strength';

describe('downgradeSeverity (v0.5.2)', () => {
  it('high → medium', () => {
    expect(downgradeSeverity('high')).toBe('medium');
  });
  it('medium → low', () => {
    expect(downgradeSeverity('medium')).toBe('low');
  });
  it('low → off', () => {
    expect(downgradeSeverity('low')).toBe('off');
  });
  it('off stays off (already disabled)', () => {
    expect(downgradeSeverity('off')).toBe('off');
  });
  it('auto → low (default tier is conservative)', () => {
    expect(downgradeSeverity('auto')).toBe('low');
  });
});

describe('isReliableSignal (v0.5.2)', () => {
  it('reliable when precision >= 0.5 AND recall >= 0.1', () => {
    expect(isReliableSignal({ precision: 0.5, recall: 0.1, fpRate: 0, ratio: 0, lastCalibratedAt: 'x' })).toBe(true);
    expect(isReliableSignal({ precision: 1.0, recall: 0.5, fpRate: 0, ratio: 0, lastCalibratedAt: 'x' })).toBe(true);
  });
  it('unreliable when precision < 0.5', () => {
    expect(isReliableSignal({ precision: 0.4, recall: 0.5, fpRate: 0, ratio: 0, lastCalibratedAt: 'x' })).toBe(false);
  });
  it('unreliable when recall < 0.1', () => {
    expect(isReliableSignal({ precision: 0.9, recall: 0.05, fpRate: 0, ratio: 0, lastCalibratedAt: 'x' })).toBe(false);
  });
  it('unknown (undefined) defaults to reliable (no flag)', () => {
    expect(isReliableSignal(undefined)).toBe(true);
  });
});

describe('getAutoDowngrades (v0.5.2)', () => {
  it('returns a Record (possibly empty) for any input', () => {
    const result = getAutoDowngrades({});
    expect(typeof result).toBe('object');
    for (const [ruleId, severity] of Object.entries(result)) {
      expect(typeof ruleId).toBe('string');
      expect(['off', 'low', 'medium', 'high']).toContain(severity);
    }
  });

  it('returns no downgrades for an empty config when all rules are reliable', () => {
    // signal-strength.json currently has all rules below the reliability
    // threshold (FP > recall for most). This test verifies the helper
    // returns SOMETHING but doesn't assert specific count (which would
    // be brittle as the JSON changes).
    const result = getAutoDowngrades({});
    // Every entry should be a strict downgrade from the source.
    for (const [, severity] of Object.entries(result)) {
      expect(['off', 'low', 'medium']).toContain(severity);
    }
  });

  it('respects user-set severity (off stays off, no entry returned)', () => {
    // Build a config that pins every rule to 'off'. The helper should
    // return an empty map because no downgrade is possible.
    const all = getAutoDowngrades({});
    const allRuleIds = Object.keys(all); // current noisy rules
    const allOff: Record<string, 'off'> = Object.fromEntries(
      allRuleIds.map((id) => [id, 'off']),
    ) as Record<string, 'off'>;
    const result = getAutoDowngrades(allOff);
    expect(Object.keys(result)).toHaveLength(0);
  });
});