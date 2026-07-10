// Legacy Phase-12 management composite + AI Debt.
//
// This optional-axis diagnostic model is retained for compatibility. It is
// not the current `ProjectReport.repositoryHealth` headline, which is the
// four-axis aggregate computed from effective per-file issue groups.
//
// Inputs (every axis is optional):
//   - slopIndex (0-100, lower = better; inverted to 100-x)
//   - architectureConsistency (0-100, higher = better)
//   - aiSecurityRisk (categorical — mapped via AI_SECURITY_NUMERIC)
//   - designTokenViolations: { spacing, radius }
//   - testQuality (0-100, higher = better)
//   - businessLogicCoherence (0-100, higher = better)
//   - docFreshness (0-100, higher = better)
//   - dbHealth (0-100, higher = better)
//
// All axis weights renormalize to 1.0 when axes are missing, so the
// composite works whether or not Phase 5/6/7/8 have shipped.

import type {
  RepositoryHealth,
  RepositoryHealthInputs,
  ProjectReport,
  AiDebt,
} from '../types';
import {
  REPOSITORY_HEALTH_WEIGHTS,
  AI_SECURITY_NUMERIC,
} from '../types';
import { computeMDLikelihood } from '@usebrick/engine';
import { builtinRules } from '../rules/builtins.js';

import { buildDefaultMdlPriors } from '@usebrick/engine';

const DEFAULT_MDL_PRIORS = buildDefaultMdlPriors(builtinRules);

function clamp100(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

/** Map a composite score to the categorical AI Debt band. */
export function aiDebtFromScore(score: number): AiDebt {
  if (score >= 80) return 'low';
  if (score >= 60) return 'medium';
  if (score >= 40) return 'high';
  return 'critical';
}

/**
 * Derive the per-axis 0-100 health for every axis. Returns the
 * subscore AND the weight to use for it (0 when the axis is absent,
 * so the renormalization works correctly).
 */
function perAxis(
  inputs: RepositoryHealthInputs,
): Array<{ axis: string; health: number; weight: number }> {
  const out: Array<{ axis: string; health: number; weight: number }> = [];

  // v0.21.0: prefer the new `aiSlopScore` input (0-100,
  // lower = better; it is the raw amount of detected slop). Fall back to the legacy `slopIndex`
  // field (which is also kept optional on the inputs type for
  // backward compat with v0.14 callers) and apply the v0.14
  // inversion on both paths. The axis name stays
  // "slopIndex" so existing dashboards and per-axis
  // breakdowns don't have to migrate.
  if (inputs.aiSlopScore !== undefined && !Number.isNaN(inputs.aiSlopScore)) {
    out.push({
      axis: 'slopIndex',
      health: clamp100(100 - inputs.aiSlopScore),
      weight: REPOSITORY_HEALTH_WEIGHTS.slopIndex,
    });
  } else if (inputs.slopIndex !== undefined && !Number.isNaN(inputs.slopIndex)) {
    // Legacy v0.14 path: slopIndex is lower = better, so invert.
    out.push({
      axis: 'slopIndex',
      health: clamp100(100 - inputs.slopIndex),
      weight: REPOSITORY_HEALTH_WEIGHTS.slopIndex,
    });
  }

  // architectureConsistency: higher = better.
  if (inputs.architectureConsistency !== undefined && !Number.isNaN(inputs.architectureConsistency)) {
    out.push({
      axis: 'architectureConsistency',
      health: clamp100(inputs.architectureConsistency),
      weight: REPOSITORY_HEALTH_WEIGHTS.architectureConsistency,
    });
  }

  // aiSecurityRisk: categorical → numeric.
  if (inputs.aiSecurityRisk !== undefined) {
    out.push({
      axis: 'aiSecurityRisk',
      health: AI_SECURITY_NUMERIC[inputs.aiSecurityRisk],
      weight: REPOSITORY_HEALTH_WEIGHTS.aiSecurityRisk,
    });
  }

  // Design token violations: weighted count.
  if (inputs.designTokenViolations !== undefined) {
    const total =
      (inputs.designTokenViolations.spacing ?? 0) +
      (inputs.designTokenViolations.radius ?? 0);
    out.push({
      axis: 'designTokenViolations',
      health: clamp100(100 - total * 2),
      weight: REPOSITORY_HEALTH_WEIGHTS.designTokenViolations,
    });
  }

  // Optional axes — only contribute when shipped.
  if (inputs.testQuality !== undefined && !Number.isNaN(inputs.testQuality)) {
    out.push({
      axis: 'testQuality',
      health: clamp100(inputs.testQuality),
      weight: REPOSITORY_HEALTH_WEIGHTS.testQuality,
    });
  }
  if (inputs.businessLogicCoherence !== undefined && !Number.isNaN(inputs.businessLogicCoherence)) {
    out.push({
      axis: 'businessLogicCoherence',
      health: clamp100(inputs.businessLogicCoherence),
      weight: REPOSITORY_HEALTH_WEIGHTS.businessLogicCoherence,
    });
  }
  if (inputs.docFreshness !== undefined && !Number.isNaN(inputs.docFreshness)) {
    out.push({
      axis: 'docFreshness',
      health: clamp100(inputs.docFreshness),
      weight: REPOSITORY_HEALTH_WEIGHTS.docFreshness,
    });
  }
  if (inputs.dbHealth !== undefined && !Number.isNaN(inputs.dbHealth)) {
    out.push({
      axis: 'dbHealth',
      health: clamp100(inputs.dbHealth),
      weight: REPOSITORY_HEALTH_WEIGHTS.dbHealth,
    });
  }

  return out;
}

/**
 * Compute the legacy optional-axis management composite. Pure function — no IO.
 * Graceful degradation: every axis is optional. Missing axes are
 * dropped from the composite; the remaining weights renormalize to 1.0.
 */
/** @deprecated Use only for legacy diagnostic compatibility; it is not the scan headline. */
export function buildRepositoryHealth(
  inputs: RepositoryHealthInputs,
): RepositoryHealth {
  const axes = perAxis(inputs);

  // Renormalize weights so the active sum is 1.0.
  const weightSum = axes.reduce((s, a) => s + a.weight, 0);
  const renormalized =
    weightSum > 0
      ? axes.map((a) => ({ ...a, weight: a.weight / weightSum }))
      : axes;

  const weightedSum = renormalized.reduce((s, a) => s + a.health * a.weight, 0);
  let score = clamp100(weightedSum);

  // Penalties — additive, not part of the weighted formula.
  const warnings: string[] = [];
  let penalty = 0;
  if (inputs.aiSecurityRisk === 'critical') {
    penalty += 10;
    warnings.push(
      'Critical AI security risk detected — single hardcoded API key outranks everything else. Score capped.',
    );
  }
  if (inputs.highSeverityIssueCount !== undefined && inputs.highSeverityIssueCount > 0) {
    // Each high-severity issue subtracts 1 point, capped at 15.
    penalty += Math.min(15, inputs.highSeverityIssueCount);
    if (inputs.highSeverityIssueCount >= 5) {
      warnings.push(
        `${inputs.highSeverityIssueCount} high-severity issues found. Each subtracts 1 point from the composite.`,
      );
    }
  }
  score = clamp100(score - penalty);

  const breakdown: Record<string, number> = {};
  const appliedWeights: Record<string, number> = {};
  for (const a of renormalized) {
    breakdown[a.axis] = Math.round(a.health * 10) / 10;
    appliedWeights[a.axis] = Math.round(a.weight * 1000) / 1000;
  }

  const aiDebt = aiDebtFromScore(score);
  const headline = `Repository Health: ${Math.round(score)}/100  (AI Debt: ${aiDebt})`;
  return {
    score: Math.round(score * 10) / 10,
    aiDebt,
    breakdown,
    appliedWeights,
    warnings,
    headline,
    // v0.10 — surface MDL log-ratio (Phase 3). Kept as a separate
    // optional field, NOT folded into the weighted-average composite
    // here. The MDL axis replaces the heuristic weights in a later
    // phase; for now both signals coexist so the migration is
    // auditable.
    mdlLogRatio: inputs.mdlLogRatio,
  };
}

/**
 * Legacy convenience wrapper: pull diagnostic inputs from a `ProjectReport` (plus
 * an optional design-token count).
 *
 * v0.10 (Phase 3): if `options.mdlLogRatio` is provided, it is
 * threaded through to the result. If absent but the report carries
 * issues, the MDL log-likelihood ratio is auto-computed from the
 * distinct `ruleId` set using `DEFAULT_MDL_PRIORS` (Rissanen 1978).
 * This keeps the MDL axis "live" for downstream reporters without
 * forcing callers to wire it up explicitly.
 */
/** @deprecated Use only for legacy diagnostic compatibility; it is not the scan headline. */
export function buildRepositoryHealthFromReport(
  report: Pick<
    ProjectReport,
    | 'aiSlopScore'
    | 'engineeringHygiene'
    | 'security'
    | 'repositoryHealth'
    | 'architectureConsistency'
    | 'aiSecurityRisk'
    | 'testQuality'
    | 'businessLogicCoherence'
    | 'docFreshness'
    | 'dbHealth'
    | 'issues'
  >,
  options: {
    spacingViolations?: number;
    radiusViolations?: number;
    /** Pre-computed MDL log-ratio. Auto-computed from `report.issues`
     *  when omitted. */
    mdlLogRatio?: number;
  } = {},
): RepositoryHealth {
  const totalDesignTokens =
    (options.spacingViolations ?? 0) + (options.radiusViolations ?? 0);
  const inputs: RepositoryHealthInputs = {
    // v0.21.0+: the v3 headline score. Passed as the
    // `aiSlopScore` input (lower = better). The perAxis handler
    // maps it to the "slopIndex" axis in the breakdown so
    // dashboards don't have to migrate.
    aiSlopScore: report.aiSlopScore,
    architectureConsistency: report.architectureConsistency,
    aiSecurityRisk: report.aiSecurityRisk,
    designTokenViolations:
      totalDesignTokens > 0
        ? {
            spacing: options.spacingViolations ?? 0,
            radius: options.radiusViolations ?? 0,
          }
        : undefined,
    highSeverityIssueCount: (report.issues ?? []).filter((i) => i.severity === 'high').length,
    testQuality: report.testQuality,
    businessLogicCoherence: report.businessLogicCoherence,
    docFreshness: report.docFreshness,
    dbHealth: report.dbHealth,
    mdlLogRatio:
      options.mdlLogRatio ??
      // Auto-compute when the caller did not pre-supply the ratio.
      // Distinct rule ids keep repeated firings from inflating the
      // log-likelihood; the MDL model cares about which rules fired,
      // not how often. Falls through to undefined if the report has
      // no issues (no evidence → no MDL claim).
      (report.issues && report.issues.length > 0
        ? computeMDLikelihood(
            Array.from(new Set(report.issues.map((i) => i.ruleId))),
            DEFAULT_MDL_PRIORS,
          ).logRatio
        : undefined),
  };
  return buildRepositoryHealth(inputs);
}

/** @deprecated Pretty-print legacy diagnostic compatibility data only. */
export function formatRepositoryHealth(health: RepositoryHealth): string {
  const lines: string[] = [];
  lines.push(health.headline);
  lines.push('');
  lines.push('  Per-axis contribution (worst first):');
  const sorted = Object.entries(health.breakdown).sort((a, b) => a[1] - b[1]);
  for (const [axis, healthValue] of sorted) {
    const weight = health.appliedWeights[axis] ?? 0;
    const h = healthValue.toFixed(0).padStart(3);
    const label = axis.padEnd(28);
    const weightPct = (weight * 100).toFixed(1);
    lines.push(`    ${h}/100  ${label} (weight ${weightPct}%)`);
  }
  if (health.warnings.length > 0) {
    lines.push('');
    lines.push('  Warnings:');
    for (const w of health.warnings) {
      lines.push(`    ! ${w}`);
    }
  }
  return lines.join('\n');
}
