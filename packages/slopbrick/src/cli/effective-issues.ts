import { getDefaultOffRules } from '../rules/signal-strength.js';
import type { Issue, ResolvedConfig } from '../types';

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
