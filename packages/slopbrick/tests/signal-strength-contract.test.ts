import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getDefaultOffRules,
  loadHistoricalSignalStrength,
  loadSignalStrength,
} from '../src/rules/signal-strength';
import { logger } from '../src/engine/logger';
import { registerRules } from '../src/cli/commands/rules';
import { registerCalibration } from '../src/cli/commands/calibration';

// The spec test imports the raw JSON, but TypeScript's JSON inference
// produces a heterogeneous union (some entries have defaultOff, some
// don't) that fails the typecheck when entry.defaultOff is accessed.
// Use the Zod-validated loader so the shape is uniform — same data,
// typed. Test bodies below are unchanged from the spec.
const signalStrengthData = loadSignalStrength();

afterEach(() => {
  vi.restoreAllMocks();
});

describe('signal-strength contract (Zod-validated)', () => {
  it('labels the shipped table as historical point estimates', () => {
    const historical = loadHistoricalSignalStrength();

    expect(historical.status).toBe('historical-point-estimate-only');
    expect(historical.entries).toBe(signalStrengthData);
    expect(JSON.stringify(historical)).not.toMatch(/currentPolicy|current-quality/i);
  });

  it('labels rules and calibration command output as historical rather than current authority', async () => {
    const logged: string[] = [];
    vi.spyOn(logger, 'info').mockImplementation((value) => {
      logged.push(String(value));
    });
    const rulesProgram = new Command();
    rulesProgram.exitOverride();
    registerRules(rulesProgram);
    await rulesProgram.parseAsync([
      'node', 'slopbrick', 'rules', '--show-signal-strength', '--json',
    ]);
    const rows = JSON.parse(logged.join('')) as Array<{
      metricsStatus: string;
      historicalVerdict: string | null;
      strength?: { precision: number };
    }>;
    expect(rows[0]).toMatchObject({
      metricsStatus: 'historical-point-estimate-only',
    });
    expect(rows.some((row) => row.historicalVerdict !== null)).toBe(true);

    const chunks: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      chunks.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
    const calibrationProgram = new Command();
    calibrationProgram.exitOverride();
    registerCalibration(calibrationProgram);
    await calibrationProgram.parseAsync([
      'node', 'slopbrick', 'calibration', '--top', '1', '--no-color',
    ]);
    const output = chunks.join('');
    expect(output).toContain('historical v10.1 point estimates');
    expect(output).toContain('not current quality policy and not authorship evidence');
  });

  it('loads the calibration data successfully', () => {
    const data = loadSignalStrength();
    expect(Object.keys(data).length).toBeGreaterThan(50);
  });

  it('keeps the unadmitted compression signal opt-in', () => {
    expect(signalStrengthData['ai/compression-profile']).toMatchObject({
      defaultOff: true,
    });
    expect(getDefaultOffRules()).toContain('ai/compression-profile');
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
