//
// Each rule has a `recall`, `fpRate`, `ratio`, and `precision` measured
// against the labeled AI + human corpus. The numbers are checked in
// (see `signal-strength.json`) and refreshed whenever the calibration
// test (`tests/integration/calibration.test.ts`) materially shifts.
//
// Why expose this:
//   * Users can see which rules fire reliably vs. noisily
//   * Reports (JSON / HTML / list-rules) can highlight unreliable rules
//   * Future "auto-disable low-precision rules" mode can read from here
//
// To refresh: run `pnpm vitest run tests/integration/calibration.test.ts
// --reporter=verbose` and copy the new numbers into the JSON file. The
// shape MUST stay stable; reporters depend on the `precision` and
// `recall` keys.

import signalStrengthData from './signal-strength.json' with { type: 'json' };

export interface SignalStrength {
  /** TP per AI file. Higher = catches more AI tells. */
  recall: number;
  /** FP per human file. Higher = false alarms. */
  fpRate: number;
  /** recall / fpRate (capped at 99 if no FPs observed). Higher = cleaner signal. */
  ratio: number;
  /** recall / (recall + fpRate). 0..1. Higher = more reliable. */
  precision: number;
  /** ISO timestamp of last calibration that produced these numbers. */
  lastCalibratedAt: string;
  /**
   * v0.9.3: when `true`, the scan engine applies `'off'` to this rule by
   * default — user must explicitly opt back in via
   * `slopbrick.config.mjs`'s `rules:` block. Set for:
   *   - INVERTED rules (lift < 1.0 — fires MORE on human code than AI;
   *     actively misleading when surfaced as AI detectors)
   *   - NOISY rules (recall < 0.1 — fires too rarely on AI code to be
   *     a useful default; engineers will dismiss after the 3rd false
   *     sense of "it doesn't matter")
   * User `rules: { 'rule/id': 'medium' }` overrides the default-off.
   * Omitted (= undefined) means the rule keeps its factory default.
   */
  defaultOff?: boolean;
}

const DATA = signalStrengthData as Record<string, SignalStrength>;

export function loadSignalStrength(): Record<string, SignalStrength> {
  return DATA;
}

export function getSignalStrength(ruleId: string): SignalStrength | undefined {
  return DATA[ruleId];
}

/**
 * v0.9.3: returns the set of rule IDs that the scan engine should treat
 * as `'off'` by default, sourced from the calibration data
 * (`defaultOff: true` in `signal-strength.json`). The set covers:
 *
 *   - 6 INVERTED rules on the expanded corpus — fires MORE on human code
 *     than AI; the rule's signal is opposite of its name. Surfacing
 *     these in a CI gate erodes trust in the tool faster than any other
 *     failure mode.
 *   - 20 NOISY rules (recall < 0.1 in the v4 corpus) — fires so rarely on
 *     AI code that engineers ignore them after the third scan, which
 *     means they stop checking the report. Better to opt them back in
 *     explicitly when a project actually wants them.
 *
 * The set is `undefined` for rules without calibration data — unknown
 * is not the same as noisy. User `rules: { 'rule/id': 'medium' }` always
 * overrides the default-off.
 */
export function getDefaultOffRules(): Set<string> {
  const out = new Set<string>();
  for (const [ruleId, strength] of Object.entries(DATA)) {
    if (strength.defaultOff === true) out.add(ruleId);
  }
  return out;
}

/**
 * Returns true if a rule is a reliable signal — precision above 0.5 AND
 * recall above 0.1. Used by the HTML reporter to color-code badges.
 */
export function isReliableSignal(strength: SignalStrength | undefined): boolean {
  if (!strength) return true; // unknown → don't flag
  return strength.precision >= 0.5 && strength.recall >= 0.1;
}

/**
 * is below 0.5 OR whose recall is below 0.1. Each entry is the rule's
 * current severity (or `'auto'`) downgraded by one step. Used by
 * `--auto-disable-noisy-rules` to soft-disable unreliable rules
 * without forcing an `'off'` override.
 * Severity ladder (each step drops one tier):
 *   high → medium → low → off
 * Rules already at `'off'` are skipped. Rules with no measurement
 * (precision undefined) are skipped — unknown is not the same as
 * noisy.
 */
export function getAutoDowngrades(
  currentRules: Record<string, 'off' | 'auto' | 'low' | 'medium' | 'high'>,
): Record<string, 'off' | 'low' | 'medium' | 'high'> {
  const downgrades: Record<string, 'off' | 'low' | 'medium' | 'high'> = {};
  for (const [ruleId, strength] of Object.entries(DATA)) {
    if (!isReliableSignal(strength)) {
      const current = currentRules[ruleId];
      const currentSeverity = current ?? 'auto';
      const downgraded = downgradeSeverity(currentSeverity);
      if (downgraded !== currentSeverity) {
        downgrades[ruleId] = downgraded;
      }
    }
  }
  return downgrades;
}

/**
 * Step down one tier. `'off'` stays `'off'` (already disabled).
 * Exported for unit testing.
 */
export function downgradeSeverity(s: 'off' | 'auto' | 'low' | 'medium' | 'high'): 'off' | 'low' | 'medium' | 'high' {
  switch (s) {
    case 'high': return 'medium';
    case 'medium': return 'low';
    case 'low': return 'off';
    case 'off': return 'off';
    case 'auto': return 'low';
  }
}
