import { describe, expect, it } from 'vitest';
import signalStrengthData from '../../src/rules/signal-strength.json';
import { builtinRules } from '../../src/rules/builtins';

interface SignalStrength {
  recall: number;
  fpRate: number;
  ratio: number;
  precision: number;
  lastCalibratedAt: string;
  defaultOff?: boolean;
  verdict?: 'USEFUL' | 'OK' | 'NOISY' | 'INVERTED' | 'DORMANT';
}

const DATA = signalStrengthData as Record<string, SignalStrength>;

describe('signal-strength.json guardrails (v0.9.3 contract)', () => {
  it('every INVERTED rule must be defaultOff (ships disabled by default)', () => {
    const offenders: string[] = [];
    for (const [ruleId, entry] of Object.entries(DATA)) {
      if (entry.verdict === 'INVERTED' && !entry.defaultOff) {
        offenders.push(ruleId);
      }
    }
    expect(offenders, `INVERTED rules not defaultOff: ${offenders.join(', ')}`).toEqual([]);
  });

  it('every NOISY rule must be defaultOff', () => {
    const offenders: string[] = [];
    for (const [ruleId, entry] of Object.entries(DATA)) {
      if (entry.verdict === 'NOISY' && !entry.defaultOff) {
        offenders.push(ruleId);
      }
    }
    expect(offenders, `NOISY rules not defaultOff: ${offenders.join(', ')}`).toEqual([]);
  });

  it('every DORMANT rule must be defaultOff', () => {
    const offenders: string[] = [];
    for (const [ruleId, entry] of Object.entries(DATA)) {
      if (entry.verdict === 'DORMANT' && !entry.defaultOff) {
        offenders.push(ruleId);
      }
    }
    expect(offenders, `DORMANT rules not defaultOff: ${offenders.join(', ')}`).toEqual([]);
  });

  it('every builtin rule must have a signal-strength entry', () => {
    const missing: string[] = [];
    for (const rule of builtinRules) {
      if (!(rule.id in DATA)) {
        missing.push(rule.id);
      }
    }
    expect(
      missing,
      `rules missing signal-strength entry: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('every entry must have a verdict (no MISSING verdicts)', () => {
    const offenders: string[] = [];
    for (const [ruleId, entry] of Object.entries(DATA)) {
      if (!entry.verdict) {
        offenders.push(ruleId);
      }
    }
    expect(offenders, `entries without verdict: ${offenders.join(', ')}`).toEqual([]);
  });

  it('precision must be in [0, 1]', () => {
    const offenders: string[] = [];
    for (const [ruleId, entry] of Object.entries(DATA)) {
      if (entry.precision < 0 || entry.precision > 1) {
        offenders.push(`${ruleId}: precision=${entry.precision}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('recall and fpRate must be in [0, 1]', () => {
    const offenders: string[] = [];
    for (const [ruleId, entry] of Object.entries(DATA)) {
      if (entry.recall < 0 || entry.recall > 1) {
        offenders.push(`${ruleId}: recall=${entry.recall}`);
      }
      if (entry.fpRate < 0 || entry.fpRate > 1) {
        offenders.push(`${ruleId}: fpRate=${entry.fpRate}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('USEFUL rules count is the v6 corpus baseline (22)', () => {
    // v6 calibration (2026-06-27): 262k neg + 262k pos = 524k files
    // (partial scans due to SWC parser panic, but 90%+ complete).
    // With corpus-derived baselines for the 3 calibration rules and
    // 14 INVERTED rules reclassified as code-hygiene (aiSpecific: false),
    // the v6 calibration shows 22 USEFUL rules.
    const useful = Object.values(DATA).filter((e) => e.verdict === 'USEFUL').length;
    expect(useful, 'v6 corpus calibration: 22 USEFUL rules').toBe(22);
  });

  it('INVERTED rules count is the v6 corpus baseline (5)', () => {
    // v6 calibration: 5 INVERTED rules. Down from v5's 18 (which included
    // 13 core INVERTED + 4 phantom db/docs rules + 1 product). After
    // reclassifying 14 non-AI INVERTED rules as code-hygiene, the
    // remaining 5 INVERTED rules are:
    //   - logic/heaps-deviation (was catastrophic, now improved)
    //   - logic/zipf-slope-anomaly (still INVERTED with corpus baselines)
    //   - logic/math-variable-name-entropy
    //   - wcag/dragging-movements
    //   - perf/halstead-anomaly (technically USEFUL, but kept DORMANT)
    const inverted = Object.values(DATA).filter((e) => e.verdict === 'INVERTED').length;
    expect(inverted, 'v6 corpus calibration: 5 INVERTED rules').toBe(5);
  });
});
