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

  it('USEFUL rules count is the v5 full-corpus baseline plus v5 pilot additions (18)', () => {
    // v5 full-corpus re-calibration (2026-06-26): 86,983 neg + 81,787
    // pos files, 47 rules fired. The re-calibration produced 17 USEFUL
    // rules. v5 SQL pilot + DORMANT-backfill entries add `db/duplicate-index`
    // (USEFUL, P=91.7%, lift=4.0× on SQL arm) and `security/fail-open-auth`
    // / `perf/halstead-anomaly` (kept USEFUL on v4 numbers) — total 18.
    const useful = Object.values(DATA).filter((e) => e.verdict === 'USEFUL').length;
    expect(useful, 'v5 full corpus = 17 + v5 SQL = 1 = 18 USEFUL').toBe(18);
  });

  it('INVERTED rules count is the v5 full-corpus baseline plus v5 pilot additions (19)', () => {
    // v5 full-corpus re-calibration: 14 INVERTED rules. v5 SQL pilot
    // adds db/missing-not-null; v5 markdown pilot adds 3 docs/* rules;
    // the product/terminology-drift entry was re-categorized from DORMANT
    // to INVERTED (1654 pos vs 6566 neg fires = lift 0.3×) — total 19.
    const inverted = Object.values(DATA).filter((e) => e.verdict === 'INVERTED').length;
    expect(inverted, 'v5 full corpus = 14 + v5 (1 db + 3 docs + 1 product) = 19 INVERTED').toBe(19);
  });
});
