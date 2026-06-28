/**
 * v0.14.5+: Single source of truth for the verdict taxonomy.
 * Adding a new verdict is a breaking change — bump STRUCTURE_SCHEMA_VERSION
 * (or a new VERDICT_SCHEMA_VERSION constant) and update the Zod schema.
 *
 * Verdicts in v7:
 *   USEFUL   — high precision + high lift, defaultOn
 *   OK       — moderate signal, defaultOn
 *   NOISY    — fires on both classes, defaultOff
 *   INVERTED — fires MORE on negative class, defaultOff
 *   HYGIENE  — non-AI quality check, defaultOn (v7 changed from defaultOff)
 *   DORMANT  — never fires, defaultOff
 */
export const VERDICTS = [
  'USEFUL',
  'OK',
  'NOISY',
  'INVERTED',
  'HYGIENE',
  'DORMANT',
] as const;

export type Verdict = typeof VERDICTS[number];

/** Property test: is this verdict opt-out by default? */
export function isDefaultOff(verdict: Verdict): boolean {
  return verdict === 'NOISY' || verdict === 'INVERTED' || verdict === 'DORMANT';
}