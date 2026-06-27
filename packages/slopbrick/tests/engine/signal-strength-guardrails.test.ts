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

  it('USEFUL rules count is the v6 corpus baseline (13)', () => {
    // v0.12.2: v6 calibration (2026-06-27, 524k files) + HYGIENE verdict
    // for code-hygiene rules. The USEFUL bucket is now strictly
    // `aiSpecific: true` rules with P >= 0.5 and lift >= 2. Down from
    // 22 in v0.12.1 because 9 code-hygiene rules that v0.12.1 counted
    // as USEFUL (e.g. some style/*, docs/*, i18n/* rules with high
    // lift) are now in the HYGIENE bucket.
    const useful = Object.values(DATA).filter((e) => e.verdict === 'USEFUL').length;
    expect(useful, 'v6 corpus calibration: 13 USEFUL rules').toBe(13);
  });

  it('INVERTED rules count is the v6 corpus baseline (0)', () => {
    // v0.12.2: every INVERTED rule in v0.12.1 has been reclassified
    // as code-hygiene (HYGIENE verdict, aiSpecific: false). The
    // verdict distribution is now clean: 0 INVERTED, all 24
    // code-hygiene rules in HYGIENE, the rest in USEFUL/OK/NOISY/DORMANT.
    const inverted = Object.values(DATA).filter((e) => e.verdict === 'INVERTED').length;
    expect(inverted, 'v6 corpus calibration: 0 INVERTED rules').toBe(0);
  });

  it('HYGIENE rules count is the v6 corpus baseline (24)', () => {
    // v0.12.2: HYGIENE verdict for `aiSpecific: false` rules. 24
    // code-hygiene rules. These are useful checks (security, style,
    // docs, etc.) that fire on patterns common in both human and AI
    // code — they keep firing in reports but don't contribute to
    // slopIndex. They are defaultOff: true so users opt-in.
    const hygiene = Object.values(DATA).filter((e) => e.verdict === 'HYGIENE').length;
    expect(hygiene, 'v6 corpus calibration: 24 HYGIENE rules').toBe(24);
  });

  it('every HYGIENE rule is defaultOff', () => {
    const offenders: string[] = [];
    for (const [ruleId, entry] of Object.entries(DATA)) {
      if (entry.verdict === 'HYGIENE' && !entry.defaultOff) {
        offenders.push(ruleId);
      }
    }
    expect(offenders, `HYGIENE rules not defaultOff: ${offenders.join(', ')}`).toEqual([]);
  });
});
