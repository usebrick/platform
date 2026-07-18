import { createHash } from 'node:crypto';
import { isAbsolute, relative } from 'node:path';
import type { Issue } from '../types';

export function repositoryRelativeFindingLocation(issue: Issue, cwd: string): string {
  if (!issue.filePath) return '<project>';
  return isAbsolute(issue.filePath) ? relative(cwd, issue.filePath) : issue.filePath;
}

/**
 * Stable identity for one effective finding. The message is included because
 * it carries the rule's matched value, while severity is intentionally not:
 * changing policy severity must not manufacture new debt.
 */
export function findingIdentity(issue: Issue, cwd: string): string {
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
