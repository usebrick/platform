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

  it('USEFUL count is non-empty and most rules are USEFUL (property, not count)', () => {
    // v0.14.5+: property test. The exact count will drift as the corpus
    // grows. What we care about: USEFUL is the dominant verdict.
    const counts = {
      USEFUL: 0, OK: 0, NOISY: 0, INVERTED: 0, HYGIENE: 0, DORMANT: 0,
    };
    for (const e of Object.values(DATA)) {
      // Guard: the local interface declares `verdict` as optional. A rule
      // without a verdict cannot contribute to any count, so this is a
      // semantic no-op but keeps strict TypeScript happy.
      if (e.verdict) counts[e.verdict] = (counts[e.verdict] || 0) + 1;
    }
    expect(counts.USEFUL).toBeGreaterThan(20);
    expect(counts.USEFUL).toBeGreaterThan(counts.NOISY);
    expect(counts.USEFUL).toBeGreaterThan(counts.DORMANT);
  });

  it('INVERTED count is small (property, not count)', () => {
    // v0.14.5+: at most a handful of INVERTED rules. The exact count
    // depends on the corpus, but the property is "INVERTED is rare".
    const inverted = Object.values(DATA).filter((e) => e.verdict === 'INVERTED').length;
    expect(inverted).toBeLessThanOrEqual(5);
    // And: every INVERTED is defaultOff (the v7 invariant).
    for (const entry of Object.values(DATA)) {
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
    for (const entry of Object.values(DATA)) {
      if (entry.verdict === 'HYGIENE') {
        total++;
        if (entry.defaultOff === true) optedOut++;
      }
    }
    expect(total).toBeGreaterThan(0);
    expect(optedOut).toBeLessThanOrEqual(Math.floor(total * 0.1));
  });
});
