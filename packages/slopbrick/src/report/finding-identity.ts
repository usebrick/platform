import { createHash } from 'node:crypto';
import { isAbsolute, relative } from 'node:path';
import type { Issue } from '../types';

export function repositoryRelativeFindingLocation(issue: Issue, cwd: string): string {
  if (!issue.filePath) return '<project>';
  return isAbsolute(issue.filePath) ? relative(cwd, issue.filePath) : issue.filePath;
}

/** Revision 1 positional identity retained for existing baseline readers. */
export function legacyFindingIdentity(issue: Issue, cwd: string): string {
  const canonical = JSON.stringify({
    ruleId: issue.ruleId,
    category: issue.category,
    filePath: repositoryRelativeFindingLocation(issue, cwd),
    line: issue.line,
    column: issue.column,
    message: issue.message,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Stable identity for one effective finding.
 *
 * Exact rule-authored evidence supplies the semantic match, so line movement
 * and explanatory copy changes do not manufacture debt. Findings without an
 * exact matched value retain the positional revision-1 identity until their
 * rule emits a stronger evidence contract.
 */
export function findingIdentity(issue: Issue, cwd: string): string {
  const evidence = issue.evidence;
  if (
    evidence?.status !== 'exact'
    || !evidence.matched
    || typeof evidence.matched.field !== 'string'
    || typeof evidence.matched.key !== 'string'
    || typeof evidence.matched.value !== 'string'
  ) {
    return legacyFindingIdentity(issue, cwd);
  }

  const canonical = JSON.stringify({
    identityVersion: 'slopbrick-finding-identity-v2',
    ruleId: issue.ruleId,
    category: issue.category,
    filePath: repositoryRelativeFindingLocation(issue, cwd),
    evidence: {
      kind: evidence.kind,
      field: evidence.matched.field,
      key: evidence.matched.key,
      value: evidence.matched.value,
    },
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
