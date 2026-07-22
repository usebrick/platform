import { getDefaultOffRules } from '../rules/signal-strength.js';
import { getCurrentEvidencePolicyAccessors } from '../rules/current-evidence-policy-runtime.js';
import { getExplicitRuleOverrides } from '../config/rule-override-provenance.js';
import { filterByDisabledDirectives, filterIssues, type IssueFilterOptions } from './threshold';
import { bindIssueFixes } from '../fix/binding';
import type { FileScanResult, Issue, ResolvedConfig } from '../types';

/**
 * Return the one effective finding set used by every score producer.
 * Suppressed findings remain available to renderers as audit evidence, but
 * cannot affect file or project scores unless config explicitly enables them.
 */
export function effectiveIssuesForScore(
  issues: readonly Issue[],
  config: Pick<ResolvedConfig, 'rules'>,
): Issue[] {
  return issues.filter((issue) => {
    if (issue.severity === ('off' as Issue['severity'])) return false;
    return isRuleIdEffectiveForScore(issue.ruleId, config);
  });
}

/** Return whether one rule ID may contribute to score-derived state. */
export function isRuleIdEffectiveForScore(
  ruleId: string,
  config: Pick<ResolvedConfig, 'rules'>,
): boolean {
  if (config.rules[ruleId] === 'off') return false;
  const currentEligibility = getCurrentEvidencePolicyAccessors()
    ?.isRuleScoreEligible(ruleId);
  if (currentEligibility !== undefined) return currentEligibility;
  const defaultOff = getDefaultOffRules();
  return !(defaultOff.has(ruleId) && !Object.hasOwn(config.rules, ruleId));
}

/**
 * Project historical offense IDs through the current score authority before
 * they can teach the flywheel. Provider-undefined behavior remains dormant.
 */
export function filterHistoricalRunsForScore<
  T extends { topOffenseIds: string[] },
>(
  runs: T[],
  config: Pick<ResolvedConfig, 'rules'>,
): { runs: T[]; changed: boolean } {
  if (getCurrentEvidencePolicyAccessors() === undefined) {
    return { runs, changed: false };
  }
  let changed = false;
  const filteredRuns = runs.map((run) => {
    const topOffenseIds = run.topOffenseIds.filter((ruleId) =>
      isRuleIdEffectiveForScore(ruleId, config));
    if (topOffenseIds.length === run.topOffenseIds.length) return run;
    changed = true;
    return { ...run, topOffenseIds };
  });
  return { runs: changed ? filteredRuns : runs, changed };
}

/**
 * Return the finding set allowed to affect finding-count gates. Current-policy
 * diagnostics may remain visible at their configured severity, but an explicit
 * repository opt-in cannot promote `gateEligible: false` evidence into a gate.
 * Unknown rules retain the legacy severity/config behavior.
 */
export function effectiveIssuesForGate(
  issues: readonly Issue[],
  config: Pick<ResolvedConfig, 'rules'>,
): Issue[] {
  const currentPolicy = getCurrentEvidencePolicyAccessors();
  return issues.filter((issue) => {
    if (issue.severity === ('off' as Issue['severity'])) return false;
    if (config.rules[issue.ruleId] === 'off') return false;
    const currentEligibility = currentPolicy?.getCurrentRulePolicy(issue.ruleId)?.gateEligible;
    return currentEligibility ?? true;
  });
}

/** Independent audit-only classifications exposed by the report contract. */
export interface AuditOnlyMarkingCounts {
  /** Historical signal-strength default-off findings. */
  legacyDefaultOff: number;
  /** Findings severity-demoted because current policy kept the rule default-off. */
  currentPolicyDefaultOff: number;
}

/** Count all current findings excluded from both scores and finding gates. */
export function countCurrentPolicyAuditOnlyIssues(
  issues: readonly Issue[],
): number {
  const currentPolicy = getCurrentEvidencePolicyAccessors();
  if (currentPolicy === undefined) return 0;
  return issues.reduce((count, issue) => {
    const row = currentPolicy.getCurrentRulePolicy(issue.ruleId);
    return row !== undefined && !row.scoreEligible && !row.gateEligible
      ? count + 1
      : count;
  }, 0);
}

/**
 * Mark findings from default-off rules as audit-only unless the user made an
 * explicit per-rule choice. Returns the number newly changed to `off`.
 */
export function markDefaultOffIssuesForAudit(
  issues: readonly Issue[],
  config: Pick<ResolvedConfig, 'rules'>,
  counts?: AuditOnlyMarkingCounts,
): number {
  const currentPolicy = getCurrentEvidencePolicyAccessors();
  const explicitRuleOverrides = getExplicitRuleOverrides(config);
  let defaultOff: ReadonlySet<string> | undefined;
  let applied = 0;
  for (const issue of issues) {
    const currentRow = currentPolicy?.getCurrentRulePolicy(issue.ruleId);
    const classification = currentPolicy !== undefined && currentRow !== undefined
      ? 'currentPolicyDefaultOff' as const
      : 'legacyDefaultOff' as const;
    let shouldRemainAuditOnly: boolean;
    if (currentPolicy !== undefined && currentRow !== undefined) {
      shouldRemainAuditOnly = !currentPolicy.isRuleRunnable(issue.ruleId, explicitRuleOverrides);
    } else {
      defaultOff ??= getDefaultOffRules();
      shouldRemainAuditOnly = defaultOff.has(issue.ruleId)
        && !Object.hasOwn(config.rules, issue.ruleId);
    }
    if (!shouldRemainAuditOnly) continue;
    if (issue.severity === ('off' as Issue['severity'])) continue;
    issue.severity = 'off' as Issue['severity'];
    if (counts) counts[classification] += 1;
    applied += 1;
  }
  return applied;
}

/**
 * Apply the shared scan/watch display normalization before splitting audit
 * findings from the effective scoring set. Inline directives remove findings
 * entirely; default-off findings remain with `severity: off` for audit.
 */
export function normalizeFileResultForDisplayAndScore(
  result: FileScanResult,
  config: Pick<ResolvedConfig, 'rules'>,
  options: IssueFilterOptions,
  counts?: AuditOnlyMarkingCounts,
): number {
  result.issues = filterIssues(result.issues, options);
  filterByDisabledDirectives(result, result.facts?.v2?.disabledRules ?? []);
  for (const issue of result.issues) {
    issue.filePath ??= result.filePath;
    const source = result.facts?.v2?._source;
    if (typeof source === 'string' && issue.filePath) {
      bindIssueFixes(issue, source, issue.filePath);
    }
  }
  return markDefaultOffIssuesForAudit(result.issues, config, counts);
}
