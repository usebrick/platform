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
  const currentPolicy = getCurrentEvidencePolicyAccessors();
  let defaultOff: ReadonlySet<string> | undefined;
  return issues.filter((issue) => {
    if (issue.severity === ('off' as Issue['severity'])) return false;
    if (config.rules[issue.ruleId] === 'off') return false;
    const currentEligibility = currentPolicy?.isRuleScoreEligible(issue.ruleId);
    if (currentEligibility !== undefined) return currentEligibility;
    defaultOff ??= getDefaultOffRules();
    return !(defaultOff.has(issue.ruleId) && !Object.hasOwn(config.rules, issue.ruleId));
  });
}

/**
 * Mark findings from default-off rules as audit-only unless the user made an
 * explicit per-rule choice. Returns the number newly changed to `off`.
 */
export function markDefaultOffIssuesForAudit(
  issues: readonly Issue[],
  config: Pick<ResolvedConfig, 'rules'>,
): number {
  const currentPolicy = getCurrentEvidencePolicyAccessors();
  const explicitRuleOverrides = getExplicitRuleOverrides(config);
  let defaultOff: ReadonlySet<string> | undefined;
  let applied = 0;
  for (const issue of issues) {
    const currentRow = currentPolicy?.getCurrentRulePolicy(issue.ruleId);
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
  return markDefaultOffIssuesForAudit(result.issues, config);
}
