import type { Verdict } from '@usebrick/core';

/**
 * v0.15.0+: The user-facing 3-bucket taxonomy. Maps engine verdicts
 * (6 values, used for LR math and calibration) to UI buckets (3 values,
 * used in the report and JSON output).
 *
 * Per the user's design intent ("INVERTED is basically HYGIENE"), INVERTED
 * rules are in the same UI bucket as HYGIENE rules. The engine still
 * distinguishes them (INVERTED has LR < 1, HYGIENE has LR ≈ 1).
 */
export type Bucket = 'ai' | 'hygiene' | 'suppressed';

export function bucketForVerdict(verdict: Verdict): Bucket {
  switch (verdict) {
    case 'USEFUL':
    case 'OK':
      return 'ai';
    case 'HYGIENE':
    case 'INVERTED':
      return 'hygiene';
    case 'NOISY':
    case 'DORMANT':
      return 'suppressed';
  }
}

/** Convenience: count rules per bucket. */
export function bucketDistribution(verdicts: Verdict[]): Record<Bucket, number> {
  const dist: Record<Bucket, number> = { ai: 0, hygiene: 0, suppressed: 0 };
  for (const v of verdicts) {
    dist[bucketForVerdict(v)]++;
  }
  return dist;
}
