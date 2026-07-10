import { getDefaultOffRules } from '../rules/signal-strength.js';
import { filterByDisabledDirectives, filterIssues, type IssueFilterOptions } from './threshold';
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
  const defaultOff = getDefaultOffRules();
  const userOverrides = new Set(Object.keys(config.rules));
  return issues.filter((issue) =>
    issue.severity !== ('off' as Issue['severity']) &&
    !(defaultOff.has(issue.ruleId) && !userOverrides.has(issue.ruleId)),
  );
}

/**
 * Mark findings from default-off rules as audit-only unless the user made an
 * explicit per-rule choice. Returns the number newly changed to `off`.
 */
export function markDefaultOffIssuesForAudit(
  issues: readonly Issue[],
  config: Pick<ResolvedConfig, 'rules'>,
): number {
  const defaultOff = getDefaultOffRules();
  const userOverrides = new Set(Object.keys(config.rules));
  let applied = 0;
  for (const issue of issues) {
    if (!defaultOff.has(issue.ruleId) || userOverrides.has(issue.ruleId)) continue;
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
  }
  return markDefaultOffIssuesForAudit(result.issues, config);
}
