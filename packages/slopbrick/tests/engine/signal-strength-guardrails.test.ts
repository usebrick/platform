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
  verdict?: 'USEFUL' | 'OK' | 'NOISY' | 'INVERTED' | 'DORMANT' | 'HYGIENE';
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

  it('USEFUL rules count is the v7 corpus baseline (32)', () => {
    // v0.14.5: v7 calibration (2026-06-27, 420,542 files: 184,488 neg +
    // 239,054 pos). USEFUL bucket is now strictly `aiSpecific: true`
    // rules with P >= 0.5 and lift >= 2. UP from 13 in v6 because v7's
    // larger corpus (420k vs 168k) tightened the CIs enough for 19 more
    // ai-specific rules to clear the lift >= 2 threshold.
    const useful = Object.values(DATA).filter((e) => e.verdict === 'USEFUL').length;
    expect(useful, 'v7 corpus calibration: 32 USEFUL rules').toBe(32);
  });

  it('INVERTED rules count is the v7 corpus baseline (1)', () => {
    // v0.14.5: v7 found 1 INVERTED rule (`ai/renyi-profile`, ratio=0.26).
    // The previous v6 INVERTED rules (heaps-deviation, zipf-slope-anomaly,
    // math-variable-name-entropy) have all been reclassified as HYGIENE
    // with their low ratios preserved — the verdict taxonomy changed but
    // the LR math is the same, so consumers should look at `ratio` not
    // `verdict === 'INVERTED'`. The 1 remaining INVERTED is defaultOff.
    const inverted = Object.values(DATA).filter((e) => e.verdict === 'INVERTED').length;
    expect(inverted, 'v7 corpus calibration: 1 INVERTED rule').toBe(1);
  });

  it('HYGIENE rules count is the v7 corpus baseline (24)', () => {
    // v0.14.5: HYGIENE verdict for `aiSpecific: false` rules. Still 24
    // code-hygiene rules. These are useful checks (security, style,
    // docs, etc.) that fire on patterns common in both human and AI
    // code — they keep firing in reports but don't contribute to
    // slopIndex. v7 flipped them from `defaultOff: true` to `defaultOn`
    // (the `defaultOff` key is absent, the field is implicit), so users
    // get hygiene feedback by default and can opt out per-rule.
    const hygiene = Object.values(DATA).filter((e) => e.verdict === 'HYGIENE').length;
    expect(hygiene, 'v7 corpus calibration: 24 HYGIENE rules').toBe(24);
  });

  it('HYGIENE rules default to ON in v7 (individual opt-out allowed)', () => {
    // v0.14.5: HYGIENE rules are now defaultOn by policy (the `defaultOff`
    // key is absent = the rule ships enabled). v6 had them as defaultOff;
    // v7 flipped the default so hygiene checks appear in reports out of
    // the box. Individual rules can still opt out via `defaultOff: true`
    // (e.g. `security/public-admin-route` is a noisy low-ratio rule that
    // ops has marked defaultOff). The invariant is: at least 90% of
    // HYGIENE rules must be defaultOn — a small opt-out fraction is fine.
    let optedOut = 0;
    const total = Object.values(DATA).filter((e) => e.verdict === 'HYGIENE').length;
    for (const entry of Object.values(DATA)) {
      if (entry.verdict === 'HYGIENE' && entry.defaultOff) optedOut++;
    }
    expect(optedOut, `HYGIENE opt-out count: ${optedOut}/${total}`).toBeLessThanOrEqual(Math.floor(total * 0.1));
  });
});
