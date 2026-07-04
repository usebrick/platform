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

// Calibration-run metadata entries (keys starting with `_`) live in the
// same JSON file as rule entries but are NOT rules — they describe the
// calibration run itself (e.g. `_v10_1Meta` carries the corpus paths,
// sample sizes, signal distribution, and method). v0.38.x's calibration
// pipeline writes one of these per run; subsequent runs add new keys
// (e.g. `_v10_2Meta`). The guardrails apply to rule entries only, so
// every test that iterates DATA uses RULE_ENTRIES (the meta-free view).
const RULE_ENTRIES = Object.entries(DATA).filter(([k]) => !k.startsWith('_'));

describe('signal-strength.json guardrails (v0.9.3 contract)', () => {
  it('every INVERTED rule must be defaultOff (ships disabled by default)', () => {
    const offenders: string[] = [];
    for (const [ruleId, entry] of RULE_ENTRIES) {
      if (entry.verdict === 'INVERTED' && !entry.defaultOff) {
        offenders.push(ruleId);
      }
    }
    expect(offenders, `INVERTED rules not defaultOff: ${offenders.join(', ')}`).toEqual([]);
  });

  it('every NOISY rule must be defaultOff', () => {
    const offenders: string[] = [];
    for (const [ruleId, entry] of RULE_ENTRIES) {
      if (entry.verdict === 'NOISY' && !entry.defaultOff) {
        offenders.push(ruleId);
      }
    }
    expect(offenders, `NOISY rules not defaultOff: ${offenders.join(', ')}`).toEqual([]);
  });

  it('every DORMANT rule must be defaultOff', () => {
    const offenders: string[] = [];
    for (const [ruleId, entry] of RULE_ENTRIES) {
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

  it('every rule entry must have a verdict (no MISSING verdicts)', () => {
    // v0.38.x: meta entries like `_v10_1Meta` are calibration-run
    // metadata, not rules — they're filtered out by the leading-`_`
    // convention (see RULE_ENTRIES). Rule entries must still carry a
    // verdict per the v0.9.3 contract.
    const offenders: string[] = [];
    for (const [ruleId, entry] of RULE_ENTRIES) {
      if (!entry.verdict) {
        offenders.push(ruleId);
      }
    }
    expect(offenders, `entries without verdict: ${offenders.join(', ')}`).toEqual([]);
  });

  it('precision must be in [0, 1]', () => {
    const offenders: string[] = [];
    for (const [ruleId, entry] of RULE_ENTRIES) {
      if (entry.precision < 0 || entry.precision > 1) {
        offenders.push(`${ruleId}: precision=${entry.precision}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('recall and fpRate must be in [0, 1]', () => {
    const offenders: string[] = [];
    for (const [ruleId, entry] of RULE_ENTRIES) {
      if (entry.recall < 0 || entry.recall > 1) {
        offenders.push(`${ruleId}: recall=${entry.recall}`);
      }
      if (entry.fpRate < 0 || entry.fpRate > 1) {
        offenders.push(`${ruleId}: fpRate=${entry.fpRate}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('active rules (USEFUL + OK) outnumber dormant ones', () => {
    // v0.18.5b: the dead/* rules are all DORMANT (no v7 calibration).
    // Strict USEFUL > DORMANT no longer holds because adding 5 dormant
    // rules pulls DORMANT up to parity with USEFUL. The real property
    // is "rules that are actually firing (USEFUL + OK) outnumber
    // rules that are off-by-default (DORMANT)". The other categories
    // (HYGIENE, NOISY, INVERTED) are also active but tracked
    // separately for clarity.
    const counts = {
      USEFUL: 0, OK: 0, NOISY: 0, INVERTED: 0, HYGIENE: 0, DORMANT: 0,
    };
    for (const e of RULE_ENTRIES.map(([, e]) => e)) {
      if (e.verdict) counts[e.verdict] = (counts[e.verdict] || 0) + 1;
    }
    const active = counts.USEFUL + counts.OK;
    expect(counts.USEFUL).toBeGreaterThan(20);
    expect(counts.USEFUL).toBeGreaterThan(counts.NOISY);
    expect(active).toBeGreaterThan(counts.DORMANT);
  });

  it('INVERTED count is small (property, not count)', () => {
    // v0.14.5+: at most a handful of INVERTED rules. The exact count
    // depends on the corpus, but the property is "INVERTED is rare".
    const inverted = RULE_ENTRIES.filter(([, e]) => e.verdict === 'INVERTED').length;
    expect(inverted).toBeLessThanOrEqual(5);
    // And: every INVERTED is defaultOff (the v7 invariant).
    for (const [, entry] of RULE_ENTRIES) {
      if (entry.verdict === 'INVERTED') {
        expect(entry.defaultOff).toBe(true);
      }
    }
  });

  it('HYGIENE rules default to ON (v7 contract, with opt-out allowed)', () => {
    // v0.14.5+: HYGIENE rules ship enabled. Individual rules can opt out
    // via defaultOff: true. The invariant is: opt-out count is small.
    let optedOut = 0;
    let total = 0;
    for (const [, entry] of RULE_ENTRIES) {
      if (entry.verdict === 'HYGIENE') {
        total++;
        if (entry.defaultOff === true) optedOut++;
      }
    }
    // v0.18.9: the v8.5 calibration retired the HYGIENE verdict (it was
    // a transitional v0.5-v0.7 thing that got folded into USEFUL + the
    // `aiSpecific` field). There are 0 HYGIENE rules in the v8.5 data.
    // The contract still holds vacuously: if any rule ever carries the
    // HYGIENE verdict, it should default to on. We skip the count
    // assertion when total === 0 rather than assert a non-zero count.
    if (total === 0) return;
    expect(optedOut).toBeLessThanOrEqual(Math.floor(total * 0.1));
  });
});
