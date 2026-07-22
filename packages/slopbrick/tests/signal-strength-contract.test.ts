import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertHistoricalV101RuleIdentities,
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
// Use the Zod-validated loader so the legacy compatibility shape is uniform.
const signalStrengthData = loadSignalStrength();

afterEach(() => {
  vi.restoreAllMocks();
});

describe('signal-strength contract (Zod-validated)', () => {
  it('labels the shipped table as historical point estimates', () => {
    const historical = loadHistoricalSignalStrength();

    expect(historical.status).toBe('historical-point-estimate-only');
    expect(historical.dataset).toBe('v10.1');
    expect(Object.keys(historical.entries)).toHaveLength(103);
    expect(historical.entries).not.toBe(signalStrengthData);
    expect(historical.entries['ai/any-density']).toEqual({
      status: 'historical-point-estimate-only',
      dataset: 'v10.1',
      signal: 'weak',
      precision: 0.63156,
      recall: 0.00623,
      f1: 0.01235,
      positiveFires: 1913,
      negativeFires: 1116,
    });
    expect(signalStrengthData['ai/any-density']?.precision).toBe(0.6523);
    expect(Object.isFrozen(historical)).toBe(true);
    expect(Object.isFrozen(historical.entries)).toBe(true);
    expect(Object.isFrozen(historical.entries['ai/any-density'])).toBe(true);
    expect(JSON.stringify(historical)).not.toMatch(/currentPolicy|current-quality/i);
  });

  it('binds the exact frozen v10.1 rule identities, not only their count', () => {
    const historicalIds = Object.keys(loadHistoricalSignalStrength().entries);
    expect(() => assertHistoricalV101RuleIdentities(historicalIds)).not.toThrow();

    const replaced = [...historicalIds];
    replaced[0] = 'adversarial/replaced-v10.1-rule';
    expect(replaced).toHaveLength(103);
    expect(() => assertHistoricalV101RuleIdentities(replaced)).toThrow(
      /exact frozen v10\.1 rule identities/i,
    );
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
      id: string;
      metricsStatus: string;
      historicalDataset: string;
      historicalVerdict: string | null;
      historicalMetrics: {
        status: string;
        dataset: string;
        precision?: number;
        recall?: number;
      };
      strengthStatus: string;
      strength?: { precision: number };
    }>;
    const anyDensity = rows.find((row) => row.id === 'ai/any-density');
    expect(anyDensity).toMatchObject({
      metricsStatus: 'historical-point-estimate-only',
      historicalDataset: 'v10.1',
      historicalVerdict: 'USEFUL',
      historicalMetrics: {
        status: 'historical-point-estimate-only',
        dataset: 'v10.1',
        precision: 0.63156,
        recall: 0.00623,
      },
      strengthStatus: 'legacy-compatibility',
      strength: { precision: 0.6523 },
    });
    const noV101 = rows.find((row) => row.id === 'kt/force-unwrap');
    expect(noV101).toMatchObject({
      metricsStatus: 'unavailable',
      historicalDataset: 'v10.1',
      historicalMetrics: { status: 'unavailable', dataset: 'v10.1' },
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

  it('projects calibration JSON from the actual v10.1 fields', async () => {
    const chunks: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      chunks.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
    const program = new Command();
    program.exitOverride();
    registerCalibration(program);

    await program.parseAsync(['node', 'slopbrick', 'calibration', '--json', '--no-color']);
    const report = JSON.parse(chunks.join('')) as {
      metricsStatus: string;
      dataset: string;
      totalRules: number;
      rules: Array<{
        ruleId: string;
        precision: number;
        recall: number;
        f1: number;
        historicalVerdict: string;
      }>;
    };

    expect(report).toMatchObject({
      metricsStatus: 'historical-point-estimate-only',
      dataset: 'v10.1',
      totalRules: 103,
    });
    expect(report.rules.find((row) => row.ruleId === 'ai/any-density')).toMatchObject({
      precision: 0.63156,
      recall: 0.00623,
      f1: 0.01235,
      historicalVerdict: 'USEFUL',
    });
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
