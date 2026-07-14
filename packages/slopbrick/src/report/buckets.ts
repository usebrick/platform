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

/** Default-off findings are retained for audit but never actionable. */
export function isDefaultOffIssue(issue: { severity?: string }): boolean {
  return issue.severity === 'off';
}

/** Count default-off instances and the distinct rules that produced them. */
export function summarizeDefaultOffIssues(
  issues: readonly { ruleId: string; severity?: string }[],
): { instances: number; ruleCount: number } {
  const rules = new Set<string>();
  let instances = 0;
  for (const issue of issues) {
    if (!isDefaultOffIssue(issue)) continue;
    instances++;
    rules.add(issue.ruleId);
  }
  return { instances, ruleCount: rules.size };
}

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

/**
 * Map a calibrated rule verdict to the human-facing bucket while preserving
 * the rule's polarity. Calibration quality (`USEFUL`/`OK`) does not turn a
 * security, performance, or other non-authorship rule into an AI finding.
 * Suppressed verdicts always remain suppressed.
 */
export function bucketForRule(verdict: Verdict, aiSpecific = true): Bucket {
  const bucket = bucketForVerdict(verdict);
  return bucket === 'ai' && !aiSpecific ? 'hygiene' : bucket;
}

/** Convenience: count rules per bucket. */
export function bucketDistribution(verdicts: Verdict[]): Record<Bucket, number> {
  const dist: Record<Bucket, number> = { ai: 0, hygiene: 0, suppressed: 0 };
  for (const v of verdicts) {
    dist[bucketForVerdict(v)]++;
  }
  return dist;
}
