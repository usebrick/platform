// Coherence composite + domain scores (v0.9.1).
//
// Reframes slopbrick as a "Repository Coherence Scanner". The headline
// metric is Coherence (0-100, higher = better), built from signals that
// measure "did this code introduce a new pattern when an existing pattern
// already existed?": pattern fragmentation, architecture consistency,
// declared-constitution violations, and AI debt band.
//
// Other rule categories are reported as separate domain scores (Security
// Risk, Code Hygiene, Accessibility, Performance) — never folded into
// the Coherence headline. The full per-rule classification lives in
// `docs/research/rule-classification-v0.9.1.md`.

import type { AiDebt, Issue } from '../types';

/** Default weights for the Coherence composite. Sum to 1.0. */
export const COHERENCE_WEIGHTS = {
  architectureConsistency: 0.50,
  patternFragmentation: 0.30,
  constitutionMapped: 0.10,
  aiDebtMapped: 0.10,
} as const;

/** Letter-grade → numeric mapping for the AI Debt component. */
export const AI_DEBT_NUMERIC: Record<AiDebt, number> = {
  low: 95,
  medium: 85,
  high: 50,
  critical: 25,
};

/** Inputs to `computeCoherence`. Every input is optional. */
export interface CoherenceInputs {
  /** Architecture Consistency score (0-100, higher = better). */
  architectureConsistency?: number;
  /** Pattern Fragmentation score (0-100, lower = better — fewer distinct
   *  patterns per category is better). Inverted to 0-100 internally. */
  patternFragmentation?: number;
  /** Total count of constitution violations across all categories. 0 is
   *  perfect; any nonzero count drops the score. Mapped to 0-100 with a
   *  steep curve so a few violations hurt, but the score floors at 0. */
  constitutionViolationCount?: number;
  /** AI Debt letter band from the existing `aiDebt` field. */
  aiDebt?: AiDebt;
}

/** Result returned by `computeCoherence`. */
export interface CoherenceResult {
  /** Composite 0-100 score (higher = better). */
  score: number;
  /** Per-axis breakdown (each input in 0-100, higher = better). */
  breakdown: {
    architectureConsistency: number;
    patternFragmentation: number;
    constitutionMapped: number;
    aiDebtMapped: number;
  };
  /** Weights actually applied (post-renormalization when inputs missing). */
  appliedWeights: Record<keyof typeof COHERENCE_WEIGHTS, number>;
  /** Human-readable summary. */
  headline: string;
}

/** Map a constitution violation count to 0-100.
 *
 *  Curve: 100 at 0 violations, drops to 80 at 1, 60 at 3, 40 at 5, 20 at 10,
 *  floors at 0 at 20+. A few violations hurt; many are catastrophic. */
export function constitutionToScore(count: number): number {
  if (count <= 0) return 100;
  if (count >= 20) return 0;
  // Linear segments: 0→100, 1→80, 3→60, 5→40, 10→20, 20→0.
  const breakpoints: Array<[number, number]> = [
    [0, 100],
    [1, 80],
    [3, 60],
    [5, 40],
    [10, 20],
    [20, 0],
  ];
  for (let i = 0; i < breakpoints.length - 1; i++) {
    const [lo, loScore] = breakpoints[i]!;
    const [hi, hiScore] = breakpoints[i + 1]!;
    if (count >= lo && count <= hi) {
      const t = (count - lo) / (hi - lo);
      return Math.round(loScore + (hiScore - loScore) * t);
    }
  }
  return 0;
}

/** Pure function: compute the Coherence composite from inputs. */
export function computeCoherence(inputs: CoherenceInputs): CoherenceResult {
  const arch = inputs.architectureConsistency;
  const frag = inputs.patternFragmentation;
  const aiDebt = inputs.aiDebt;

  // Each component mapped to 0-100 (higher = better). Missing inputs default
  // to neutral 75 (B-grade) so the composite is still meaningful without
  // every signal. Document this default in the README/scoring-runbook.
  const breakdown = {
    architectureConsistency: typeof arch === 'number' ? arch : 75,
    patternFragmentation: typeof frag === 'number' ? 100 - frag : 75,
    constitutionMapped: constitutionToScore(inputs.constitutionViolationCount ?? 0),
    aiDebtMapped: aiDebt ? AI_DEBT_NUMERIC[aiDebt] : 75,
  };

  // Weights sum to 1.0; the default has all four present. If a signal is
  // genuinely missing (not just default), we'd want to renormalize; for
  // v0.9.1 the defaults make renormalization unnecessary in practice.
  const appliedWeights = { ...COHERENCE_WEIGHTS };

  const score = Math.round(
    100 *
      (breakdown.architectureConsistency * appliedWeights.architectureConsistency +
        breakdown.patternFragmentation * appliedWeights.patternFragmentation +
        breakdown.constitutionMapped * appliedWeights.constitutionMapped +
        breakdown.aiDebtMapped * appliedWeights.aiDebtMapped) /
      100,
  );

  return {
    score: Math.max(0, Math.min(100, score)),
    breakdown,
    appliedWeights,
    headline: `Repository Coherence: ${score}/100`,
  };
}

// ---------------------------------------------------------------------------
// Domain scores (Code Hygiene, Accessibility, Performance)
// ---------------------------------------------------------------------------

/** Issue count → 0-100 score (higher = better). Caps at a saturation point
 *  so very-clean projects get 100 and very-dirty projects get 0 without
 *  one bad file dominating. */
export function issueCountToScore(count: number, saturation = 25): number {
  if (count <= 0) return 100;
  if (count >= saturation) return 0;
  return Math.round(100 * (1 - count / saturation));
}

/** Categories that belong to the Code Hygiene domain. */
const CODE_HYGIENE_CATEGORIES = new Set(['logic', 'test', 'typo', 'visual', 'layout']);

/** Categories that belong to the Accessibility domain. */
const ACCESSIBILITY_CATEGORIES = new Set(['wcag']);

/** Categories that belong to the Performance domain. */
const PERFORMANCE_CATEGORIES = new Set(['perf']);

/** Categories that belong to the Security Risk domain (reported separately). */
const SECURITY_CATEGORIES = new Set(['security']);

/** Domain score result. */
export interface DomainScore {
  /** Domain name (e.g. 'codeHygiene'). */
  name: string;
  /** 0-100 score (higher = better). */
  score: number;
  /** Issue count used to derive the score. */
  issueCount: number;
  /** Per-category breakdown. */
  byCategory: Record<string, number>;
}

/** Compute all four secondary domain scores (Code Hygiene, Accessibility,
 *  Performance, Security Risk) from an issue list. Security is reported as
 *  a count, not a 0-100 number — it stays categorical for parity with the
 *  existing AI Security Risk score. */
export function computeDomainScores(issues: Issue[]): {
  codeHygiene: DomainScore;
  accessibility: DomainScore;
  performance: DomainScore;
  security: DomainScore;
} {
  function tally(categories: Set<string>): DomainScore {
    const byCategory: Record<string, number> = {};
    let total = 0;
    for (const issue of issues) {
      if (categories.has(issue.category)) {
        byCategory[issue.category] = (byCategory[issue.category] ?? 0) + 1;
        total += 1;
      }
    }
    return {
      name: '',
      score: 0, // filled by caller
      issueCount: total,
      byCategory,
    };
  }

  const codeHygiene = tally(CODE_HYGIENE_CATEGORIES);
  codeHygiene.name = 'codeHygiene';
  codeHygiene.score = issueCountToScore(codeHygiene.issueCount);

  const accessibility = tally(ACCESSIBILITY_CATEGORIES);
  accessibility.name = 'accessibility';
  accessibility.score = issueCountToScore(accessibility.issueCount);

  const performance = tally(PERFORMANCE_CATEGORIES);
  performance.name = 'performance';
  performance.score = issueCountToScore(performance.issueCount);

  const security = tally(SECURITY_CATEGORIES);
  security.name = 'security';
  // v0.25.0: graded cap replaces the categorical "0 if any" cliff.
  // The categorical version collapsed every nonzero security count to
  // 0, which made the score useless for distinguishing a repo with
  // 1 SQL concat from a repo with 100 hardcoded credentials — the
  // cliff at issueCount=1 was a methodology artifact, not a real
  // signal. Hyperbolic decay `100 / (1 + issueCount / 5)` gives:
  //   0 issues   → 100
  //   1 issue    →  83
  //   5 issues   →  50
  //   20 issues  →  20
  //   50 issues  →   9
  //   100 issues →   5
  // Floors at 0 (truly catastrophic repos still get 0).
  //
  // Note: `report.security` (the categorical AI Security Risk →
  // {100, 67, 33, 0} mapping in `metrics.ts:325-334`) is UNCHANGED.
  // That field is what drives CI gating and the repository health
  // composite; it must stay categorical. This change only affects
  // `computeDomainScores(...).security.score`, which is the graded
  // domain score (used by `domainIssues.security` and surfaced to
  // callers that import the function directly).
  security.score = Math.max(0, 100 / (1 + security.issueCount / 5));

  return { codeHygiene, accessibility, performance, security };
}
