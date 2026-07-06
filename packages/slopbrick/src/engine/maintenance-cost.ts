// AI Maintenance Cost — derived categorical meta-score.
//
// Aggregates signals already produced by shipped phases into one of:
//   low | medium | high | critical
//
// Plus a numeric `health` (0-100, higher = better) and a
// `monthlyUSD` (estimated monthly cost to fix the underlying issues).
//
// Why categorical AND numeric:
//   - Managers want a bucket ("HIGH") they can scan in two seconds.
//   - Agents and trend pipelines need a number.
//   - Same shape as `aiSecurityRisk` (categorical) + per-axis sub-scores.
//
// Calibration anchors (all from 2024-2026 industry data; see
// docs/research/phase-memo4-ai-cost-internet-2026.md):
//   - Sonar 2025: $306,000/yr per 1 MLoC of code-level technical debt
//     → $25.50 per 1000 LoC per month baseline.
//   - CodeClimate: per-grade remediation time (A<1h, B 1-2h, C 2-4h,
//     D 4-8h, F>8h). At $50/hr fully-loaded dev cost:
//       $50/$150/$300/$400/$50 (low→critical by issue severity).
//   - AI multiplier 1.5-2.5x (CodeRabbit 1.7x issue rate, Faros 3x
//     incident rate, GitClear 4x clone growth, Stack Overflow trust
//     collapse 40%→29%). Landed on 1.8 as the default.
//
// No new file scanning. No new AST visitors. Pure meta-score.

import type {
  AiMaintenanceCost,
  AiMaintenanceCostResult,
  MaintenanceAxes,
  MaintenanceAxisHealth,
  ProjectReport,
} from '../types';

// ---------------------------------------------------------------------------
// Constants (calibration anchors)
// ---------------------------------------------------------------------------

/**
 * Default axis weights. Sum to 1.0. Tuned in 0.8.0 RC against the
 * synthetic fixture corpus (see `tests/fixtures/maintenance-cost/`) and
 * the slopbrick repo itself.
 *
 * Security is weighted heaviest (0.30) because a single hardcoded API
 * key or fail-open auth block is the most expensive kind of AI debt to
 * fix in production. Architecture is next (0.25) — a second state lib
 * is a refactor sprint, not a 30-min fix. Constitution drift and design
 * token drift are weighted equally (0.10) because both can be cleaned
 * incrementally.
 */
export const MAINTENANCE_COST_WEIGHTS = {
  slopIndex: 0.20,
  architectureConsistency: 0.25,
  aiSecurityRisk: 0.30,
  constitutionDrift: 0.10,
  designTokenDrift: 0.10,
  highSeverityPenalty: 0.05,
} as const;

/**
 * Map categorical `aiSecurityRisk` to a 0-100 numeric health. Higher
 * is better — `low=100, critical=0`. The default for missing values
 * is 100 (assume clean until proven otherwise).
 */
export const MAINTENANCE_SECURITY_NUMERIC: Record<
  'low' | 'medium' | 'high' | 'critical',
  number
> = {
  low: 100,
  medium: 70,
  high: 30,
  critical: 0,
};

/** Categorical boundaries on the weighted health. Must match the
 *  per-bucket advice strings below. */
export const MAINTENANCE_COST_THRESHOLDS = {
  low: 80,
  medium: 60,
  high: 30,
} as const;

// ---------------------------------------------------------------------------
// Per-axis health derivation
// ---------------------------------------------------------------------------

/** Clamp a value to [0, 100]. */
function clamp100(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

/**
 * Derive a per-axis health number (0-100, higher = better). Each branch
 * returns `{ health, source }` so the pretty reporter can show "how we
 * got there" for every axis.
 */
function axisSlopIndex(slopIndex: number | undefined): MaintenanceAxisHealth {
  // v0.42.0: the field name `slopIndex` is kept (backward compat
  // with fixtures and downstream consumers), but the user-facing label
  // now says "AI Slop Score" to match the brief, the trend command,
  // and the verbiage since the v0.21 re-inversion.
  if (slopIndex === undefined || Number.isNaN(slopIndex)) {
    return {
      axis: 'slopIndex',
      label: 'AI Slop Score (raw)',
      health: 70,
      source: 'default (not measured) — neutral 70',
    };
  }
  return {
    axis: 'slopIndex',
    label: 'AI Slop Score (raw)',
    health: clamp100(100 - slopIndex),
    source: `100 - aiSlopScore (${slopIndex.toFixed(1)}) → inverted to cleanliness`,
  };
}

function axisArchitecture(architectureConsistency: number | undefined): MaintenanceAxisHealth {
  if (architectureConsistency === undefined || Number.isNaN(architectureConsistency)) {
    return {
      axis: 'architectureConsistency',
      label: 'Architecture Consistency',
      health: 70,
      source: 'default (not measured) — neutral 70',
    };
  }
  return {
    axis: 'architectureConsistency',
    label: 'Architecture Consistency',
    health: clamp100(architectureConsistency),
    source: `direct (${architectureConsistency.toFixed(1)})`,
  };
}

function axisSecurity(
  aiSecurityRisk: MaintenanceAxes['aiSecurityRisk'],
): MaintenanceAxisHealth {
  if (aiSecurityRisk === undefined) {
    return {
      axis: 'aiSecurityRisk',
      label: 'AI Security Risk',
      health: 100,
      source: 'default (no findings) — assume clean',
    };
  }
  const numeric = MAINTENANCE_SECURITY_NUMERIC[aiSecurityRisk];
  return {
    axis: 'aiSecurityRisk',
    label: 'AI Security Risk',
    health: numeric,
    source: `categorical ${aiSecurityRisk} → numeric ${numeric}`,
  };
}

function axisConstitutionDrift(
  constitutionViolations: number | undefined,
): MaintenanceAxisHealth {
  if (constitutionViolations === undefined) {
    return {
      axis: 'constitutionDrift',
      label: 'Constitution Drift',
      health: 100,
      source: 'default (constitution not declared) — assume clean',
    };
  }
  return {
    axis: 'constitutionDrift',
    label: 'Constitution Drift',
    health: clamp100(100 - constitutionViolations * 2),
    source: `100 - (${constitutionViolations} violations × 2)`,
  };
}

function axisDesignTokenDrift(
  designTokenDrift: MaintenanceAxes['designTokenDrift'],
): MaintenanceAxisHealth {
  if (designTokenDrift === undefined) {
    return {
      axis: 'designTokenDrift',
      label: 'Design Token Drift',
      health: 100,
      source: 'default (no design tokens declared) — assume clean',
    };
  }
  const total = (designTokenDrift.spacing ?? 0) + (designTokenDrift.radius ?? 0);
  return {
    axis: 'designTokenDrift',
    label: 'Design Token Drift',
    health: clamp100(100 - total * 0.5),
    source: `100 - (${designTokenDrift.spacing} spacing + ${designTokenDrift.radius} radius) × 0.5`,
  };
}

function axisHighSeverityPenalty(
  highSeverityIssueCount: number | undefined,
): MaintenanceAxisHealth {
  if (highSeverityIssueCount === undefined || highSeverityIssueCount === 0) {
    return {
      axis: 'highSeverityPenalty',
      label: 'High-Severity Issues',
      health: 100,
      source: 'no high-severity issues — no penalty',
    };
  }
  return {
    axis: 'highSeverityPenalty',
    label: 'High-Severity Issues',
    health: clamp100(100 - highSeverityIssueCount * 5),
    source: `100 - (${highSeverityIssueCount} high-severity × 5)`,
  };
}

// ---------------------------------------------------------------------------
// Categorical mapping
// ---------------------------------------------------------------------------

/** Map a numeric health (0-100) to a categorical AI Maintenance Cost bucket. */
export function bucketFromHealth(health: number): AiMaintenanceCost {
  if (health >= MAINTENANCE_COST_THRESHOLDS.low) return 'low';
  if (health >= MAINTENANCE_COST_THRESHOLDS.medium) return 'medium';
  if (health >= MAINTENANCE_COST_THRESHOLDS.high) return 'high';
  return 'critical';
}

/** Per-bucket advice for engineering managers. */
export function adviceForBucket(bucket: AiMaintenanceCost): string {
  switch (bucket) {
    case 'low':
      return 'Maintenance cost is low. Continue current practices; revisit quarterly.';
    case 'medium':
      return 'Schedule cleanup work. Address the worst axis before adding new features in that area.';
    case 'high':
      return 'Maintenance cost is high. Block new feature work in the affected subsystems until the worst axis is reduced below 60.';
    case 'critical':
      return 'Maintenance cost is critical. Dedicated refactor sprint required. Do not ship new features until health is above 60.';
  }
}

// ---------------------------------------------------------------------------
// $ cost (Sonar + CodeClimate + AI multiplier)
// ---------------------------------------------------------------------------

/** Per-issue cost in USD, derived from CodeClimate grade→minutes mapping
 *  at a $50/hr fully-loaded dev rate. Numbers from
 *  https://technicaldebtcost.com/code-climate-maintainability */
export const MAINTENANCE_PER_ISSUE_USD = {
  // severity: cost in USD
  high: 400, // F-grade: 8h+ to fix
  medium: 150, // C-grade: 3h
  low: 50, // B-grade: 1h
} as const;

/** Sonar's published baseline: $306,000/yr per 1 MLoC → $25.50/1k LoC/month. */
export const MAINTENANCE_LOC_BASELINE_USD = 25.5;

/** Bucket multiplier (categorical → numeric weight). */
export const MAINTENANCE_BUCKET_MULTIPLIER: Record<AiMaintenanceCost, number> = {
  low: 0.5,
  medium: 1.0,
  high: 2.0,
  critical: 4.0,
};

/** AI multiplier when AI-typical signals are detected.
 *  Calibrated against CodeRabbit 1.7x, Faros 3x, GitClear 4x, SO trust
 *  collapse. 1.8x is the conservative middle. */
export const MAINTENANCE_AI_MULTIPLIER = 1.8;

/**
 * Compute the estimated monthly USD cost to fix the underlying issues.
 * Returns 0 for very small projects (loc=0, no issues) — the floor.
 *
 * @param health the weighted health (0-100, used to derive the bucket)
 * @param highSeverityCount high-severity issue count
 * @param mediumSeverityCount medium-severity issue count
 * @param lowSeverityCount low-severity issue count
 * @param linesOfCode approximate LoC; defaults to 0
 * @param hasAiSignals whether AI-typical signals were detected
 */
export function computeMonthlyUSD(
  health: number,
  highSeverityCount: number,
  mediumSeverityCount: number,
  lowSeverityCount: number,
  linesOfCode: number,
  hasAiSignals: boolean,
): number {
  const issueCost =
    highSeverityCount * MAINTENANCE_PER_ISSUE_USD.high +
    mediumSeverityCount * MAINTENANCE_PER_ISSUE_USD.medium +
    lowSeverityCount * MAINTENANCE_PER_ISSUE_USD.low;
  const locBaseline = (linesOfCode / 1000) * MAINTENANCE_LOC_BASELINE_USD;
  const bucket = bucketFromHealth(health);
  const bucketMultiplier = MAINTENANCE_BUCKET_MULTIPLIER[bucket];
  const aiMultiplier = hasAiSignals ? MAINTENANCE_AI_MULTIPLIER : 1.0;
  const total = locBaseline * bucketMultiplier * aiMultiplier + issueCost * aiMultiplier;
  return Math.max(0, Math.round(total));
}

// ---------------------------------------------------------------------------
// Main entry points
// ---------------------------------------------------------------------------

/**
 * Compute the AI Maintenance Cost from a set of optional axes. Pure
 * function; no file IO, no side effects.
 *
 * Graceful degradation: every axis is optional. Missing axes default to
 * neutral (slopIndex-style defaults) — the function never throws on
 * missing inputs.
 */
export function computeAiMaintenanceCost(
  inputs: MaintenanceAxes,
): AiMaintenanceCostResult {
  const axes: MaintenanceAxisHealth[] = [
    axisSlopIndex(inputs.slopIndex),
    axisArchitecture(inputs.architectureConsistency),
    axisSecurity(inputs.aiSecurityRisk),
    axisConstitutionDrift(inputs.constitutionViolations),
    axisDesignTokenDrift(inputs.designTokenDrift),
    axisHighSeverityPenalty(inputs.highSeverityIssueCount),
  ];

  // Weighted average. Normalize by the weights of axes that were present
  // (i.e. produced a non-default value), so a project that has only
  // measured 2 axes doesn't get a 100 from the 4 missing defaults.
  // For v1, all 6 axes are always "present" (we always compute a
  // number, default or measured), so the denominator is the full sum.
  const weightMap: Record<string, number> = {
    slopIndex: MAINTENANCE_COST_WEIGHTS.slopIndex,
    architectureConsistency: MAINTENANCE_COST_WEIGHTS.architectureConsistency,
    aiSecurityRisk: MAINTENANCE_COST_WEIGHTS.aiSecurityRisk,
    constitutionDrift: MAINTENANCE_COST_WEIGHTS.constitutionDrift,
    designTokenDrift: MAINTENANCE_COST_WEIGHTS.designTokenDrift,
    highSeverityPenalty: MAINTENANCE_COST_WEIGHTS.highSeverityPenalty,
  };
  let weightedSum = 0;
  let weightTotal = 0;
  for (const a of axes) {
    const w = weightMap[a.axis] ?? 0;
    weightedSum += a.health * w;
    weightTotal += w;
  }
  const health = weightTotal > 0 ? clamp100(weightedSum / weightTotal) : 70;

  // Issue counts: derive from highSeverityIssueCount (we don't get the
  // other severities in the v1 inputs). When the caller doesn't supply
  // them, we assume the other buckets are 0.
  const highSeverityCount = inputs.highSeverityIssueCount ?? 0;
  const monthlyUSD = computeMonthlyUSD(
    health,
    highSeverityCount,
    0,
    0,
    inputs.linesOfCode ?? 0,
    inputs.hasAiSignals ?? false,
  );

  const cost = bucketFromHealth(health);
  return {
    cost,
    health,
    monthlyUSD,
    axes: axes.sort((a, b) => a.health - b.health), // worst first
    advice: adviceForBucket(cost),
  };
}

/**
 * Convenience wrapper: pull everything from a `ProjectReport` (plus an
 * optional drift result for `constitutionViolations`).
 */
export function computeAiMaintenanceCostFromReport(
  report: {
    /** v0.15.0 U.4+: replaces the legacy slopIndex. */
    aiSlopScore: number;
    engineeringHygiene?: number;
    security?: number;
    repositoryHealth?: number;
    /** @deprecated use aiSlopScore */
    slopIndex?: number;
    architectureConsistency?: number;
    aiSecurityRisk?: 'low' | 'medium' | 'high' | 'critical';
    highSeverityIssueCount?: number;
    issues?: Array<{ severity: 'low' | 'medium' | 'high' | 'critical' }>;
    fileCount?: number;
  },
  options: {
    constitutionViolations?: number;
    designTokenDrift?: { spacing: number; radius: number };
    linesOfCode?: number;
    hasAiSignals?: boolean;
  } = {},
): AiMaintenanceCostResult {
  // Derive per-severity counts from the report's issues.
  let high = 0;
  let medium = 0;
  let low = 0;
  if (Array.isArray(report.issues)) {
    for (const i of report.issues) {
      if (i.severity === 'high' || i.severity === 'critical') high += 1;
      else if (i.severity === 'medium') medium += 1;
      else if (i.severity === 'low') low += 1;
    }
  }
  // Approximate LoC from file count: ~50 lines per source file on
  // average (small / medium projects). This is a rough proxy — when
  // callers have better data, they pass `linesOfCode` explicitly.
  const approxLoc = options.linesOfCode ?? (report.fileCount ?? 0) * 50;
  // Recompute monthlyUSD with the actual medium/low issue counts.
  const axes: MaintenanceAxes = {
    slopIndex: report.aiSlopScore, // The axis is named slopIndex for historical naming; the value is now aiSlopScore (0-100, higher is better, but axisSlopIndex inverts it)
    architectureConsistency: report.architectureConsistency,
    aiSecurityRisk: report.aiSecurityRisk,
    constitutionViolations: options.constitutionViolations,
    designTokenDrift: options.designTokenDrift,
    highSeverityIssueCount: report.highSeverityIssueCount ?? high,
    linesOfCode: approxLoc,
    hasAiSignals: options.hasAiSignals ?? false,
  };
  const result = computeAiMaintenanceCost(axes);
  // Patch the monthlyUSD with the real medium/low counts.
  const monthlyUSD = computeMonthlyUSD(
    result.health,
    high,
    medium,
    low,
    approxLoc,
    options.hasAiSignals ?? false,
  );
  return { ...result, monthlyUSD };
}
