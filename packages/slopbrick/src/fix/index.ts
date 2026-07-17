import { existsSync, readFileSync } from 'node:fs';
import type { FixSuggestion, Issue, ProjectReport, ResolvedConfig } from '../types';
import { applyFocusRingFix } from './focus-ring';
import { applyLayoutTokenFix, countWholeClassOccurrences } from './layout-token';
import { applyUseClientFix } from './use-client';
import { sha256Text } from './binding';

export interface FixApplication {
  ruleId: string;
  description: string;
  kind: FixSuggestion['kind'];
  reason?: string;
}

export interface FixResult {
  filePath: string;
  applied: FixApplication[];
  skipped: FixApplication[];
  errors?: string[];
}

interface GroupedFixes {
  inserts: FixApplication[];
  replaces: FixSuggestion[];
  replaceApps: FixApplication[];
  cssAnchors: FixApplication[];
  preSkipped: FixApplication[];
}

function collectAllFixes(issue: Issue): FixSuggestion[] {
  return [...(issue.fix ? [issue.fix] : []), ...(issue.fixes ?? [])];
}

function validateFixBinding(
  issue: Issue,
  fix: FixSuggestion,
  config: ResolvedConfig,
): string | undefined {
  const binding = fix.binding;
  if (
    !issue.filePath ||
    !binding ||
    binding.kind !== 'slopbrick-fix-binding-v1' ||
    binding.ruleId !== issue.ruleId ||
    binding.filePath !== issue.filePath ||
    binding.line !== issue.line ||
    binding.column !== issue.column
  ) {
    return 'unbound-finding';
  }

  if (!fix.targetFile) return 'unbound-finding';

  const isGlobalCssFix = fix.kind === 'css-anchor';
  if (isGlobalCssFix) {
    if (config.globalCssTarget !== fix.targetFile) return 'unbound-finding';
  } else if (fix.targetFile !== issue.filePath) {
    return 'unbound-finding';
  }

  if (!existsSync(issue.filePath)) return 'stale-finding';
  try {
    const findingSource = readFileSync(issue.filePath, 'utf8');
    if (sha256Text(findingSource) !== binding.sourceSha256) return 'stale-finding';
  } catch {
    return 'stale-finding';
  }

  if (binding.targetSha256 !== undefined) {
    if (!existsSync(fix.targetFile)) return 'stale-finding';
    try {
      if (sha256Text(readFileSync(fix.targetFile, 'utf8')) !== binding.targetSha256) {
        return 'stale-finding';
      }
    } catch {
      return 'stale-finding';
    }
  }

  if (fix.kind === 'replace') {
    if (fix.oldValue === undefined || fix.newValue === undefined) return 'invalid-fix';
    try {
      const targetSource = readFileSync(fix.targetFile, 'utf8');
      const occurrences = countWholeClassOccurrences(targetSource, fix.oldValue);
      if (occurrences === 0) return 'stale-finding';
      if (occurrences > 1) return 'ambiguous-finding';
    } catch {
      return 'stale-finding';
    }
  }

  return undefined;
}

export async function applyFixes(
  report: ProjectReport,
  config: ResolvedConfig,
  // v0.42.0: preserved for API compatibility. Fixes are now driven only by
  // finding-bound suggestions; opportunistic file-wide codemods are not safe
  // at this release gate.
  _scannedFiles?: string[],
): Promise<FixResult[]> {
  const byFile = new Map<string, GroupedFixes>();

  for (const issue of report.issues) {
    const fixes = collectAllFixes(issue);
    for (const fix of fixes) {
      if (!fix.targetFile) continue;

      const group: GroupedFixes = byFile.get(fix.targetFile) ?? {
        inserts: [],
        replaces: [],
        replaceApps: [],
        cssAnchors: [],
        preSkipped: [],
      };
      const app: FixApplication = {
        ruleId: issue.ruleId,
        description: fix.description,
        kind: fix.kind,
      };

      const safetyReason = validateFixBinding(issue, fix, config);
      if (safetyReason) {
        group.preSkipped.push({ ...app, reason: safetyReason });
        byFile.set(fix.targetFile, group);
        continue;
      }

      if (fix.kind === 'insert') {
        group.inserts.push(app);
      } else if (fix.kind === 'replace') {
        group.replaces.push(fix);
        group.replaceApps.push(app);
      } else if (fix.kind === 'css-anchor') {
        group.cssAnchors.push(app);
      }

      byFile.set(fix.targetFile, group);
    }
  }

  const results: FixResult[] = [];

  for (const [filePath, group] of byFile) {
    const applied: FixApplication[] = [];
    const skipped: FixApplication[] = [...group.preSkipped];
    const errors: string[] = [];

    if (group.inserts.length > 0) {
      try {
        const result = applyUseClientFix(filePath);
        if (result.applied) {
          applied.push(...group.inserts);
        } else {
          skipped.push(...group.inserts);
        }
      } catch (err) {
        errors.push(`use-client fix failed for ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (group.replaces.length > 0) {
      try {
        const result = applyLayoutTokenFix(filePath, group.replaces);
        const total = group.replaceApps.length;
        const appliedCount = Math.min(result.applied, total);
        // v0.42.0: removed unused `skippedCount = total - appliedCount`.
        // The slice call below uses `appliedCount` directly as the
        // skip boundary — no separate count variable is needed.
        applied.push(...group.replaceApps.slice(0, appliedCount));
        skipped.push(...group.replaceApps.slice(appliedCount));
      } catch (err) {
        errors.push(`layout-token fix failed for ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (group.cssAnchors.length > 0) {
      try {
        const result = applyFocusRingFix(filePath);
        if (result.applied) {
          applied.push(...group.cssAnchors);
        } else {
          skipped.push(...group.cssAnchors);
        }
      } catch (err) {
        errors.push(`focus-ring fix failed for ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    results.push({
      filePath,
      applied,
      skipped,
      ...(errors.length > 0 ? { errors } : {}),
    });
  }

  return results;
}
