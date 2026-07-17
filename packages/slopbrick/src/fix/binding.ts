import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import type { FixFindingBinding, FixSuggestion, Issue } from '../types';

export function sha256Text(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function collectFixes(issue: Issue): FixSuggestion[] {
  return [...(issue.fix ? [issue.fix] : []), ...(issue.fixes ?? [])];
}

/**
 * Attach a source snapshot to every fix emitted by a successfully scanned
 * finding. This is done after the worker has assigned the canonical file path
 * and before any fix/report action can consume the Issue.
 */
export function bindIssueFixes(issue: Issue, source: string, sourcePath: string): void {
  const sourceSha256 = sha256Text(source);

  for (const fix of collectFixes(issue)) {
    if (fix.binding) continue;

    let targetSha256: string | undefined;
    if (fix.targetFile && existsSync(fix.targetFile)) {
      try {
        targetSha256 = sha256Text(readFileSync(fix.targetFile, 'utf8'));
      } catch {
        // The application boundary will report a stale/missing target rather
        // than turning scan enrichment into an I/O failure.
      }
    }

    const binding: FixFindingBinding = {
      kind: 'slopbrick-fix-binding-v1',
      ruleId: issue.ruleId,
      filePath: sourcePath,
      line: issue.line,
      column: issue.column,
      sourceSha256,
      ...(targetSha256 ? { targetSha256 } : {}),
    };
    fix.binding = binding;
  }
}
