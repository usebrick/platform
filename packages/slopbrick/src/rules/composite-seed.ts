// v0.42.0 (Sprint 3, §3b.8): hand-curated seed composite that ships
// in composites.json for users who run `slopbrick composite discover`
// before any scan telemetry exists. Tagged with
// `seed: "hand-curated-by-brief"` so it's distinguishable from
// empirically-discovered clusters; auto-discovery eventually
// eclipses this once enough telemetry exists to fire §3b's
// clusterer. Kept until at least 1 empirical cluster is found; the
// `slopbrick composite discover` emitter can then choose to drop the
// hand-curated entry.
//
// Brief-corrected typo: the plan called the composite "{ai/compression-profile,
// ai/comment-ratio, ai/segment-surprisal-cv}" — the actual rule id
// is `ai/segment-surprisal-cv` (hyphen), not `segment_surprisal_cv`
// (underscore). Verified at `src/rules/ai/segment-surprisal-cv.ts`.

import type { CompositeRuleEntry } from '../types';

export const HAND_CURATED_SEED: CompositeRuleEntry[] = [
  {
    id: 'composite/ai-fingerprint-cluster',
    ruleIds: ['ai/compression-profile', 'ai/comment-ratio', 'ai/segment-surprisal-cv'],
    minMatch: 2,
    severity: 'medium',
    defaultOff: true,
    description:
      'Composite rule: at least 2 of {ai/compression-profile+ai/comment-ratio+...} ' +
      'fire on the same file. Hand-curated seed from the v0.42.0 brief; superseded by ' +
      '`slopbrick composite discover` once empirical clusters dominate the ledger.',
    calibration: {
      recall: 0,
      FP: 0,
      precision: 0,
      F1: 0,
      nFiles: 0,
    },
    provenance: {
      seed: 'hand-curated-by-brief',
      discoveredAt: '2026-07-05T00:00:00.000Z',
      nFiles: 0,
      members: 3,
      npmi: 0,
      fisherP: 1,
    },
  },
];

/** If the clusterer can't synthesize any entries (no telemetry
 *  yet), the seed is the user's only composite option. The seed is
 *  appended to the discover emitter's output as a starting point.
 *  Once the clusterer emits ≥ 1 empirical cluster, the seed is
 *  dropped automatically — see `src/cli/commands/composite.ts:discover`. */
export function maybeAppendSeed(entries: CompositeRuleEntry[]): CompositeRuleEntry[] {
  // Spec: hand-curated seed ships until auto-discovery eclipses.
  // Trigger: 0 empirical entries → add seed. ≥ 1 empirical → drop seed.
  if (entries.length === 0) {
    return [...HAND_CURATED_SEED];
  }
  return entries;
}
