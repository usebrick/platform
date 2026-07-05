import type { FixSuggestion, Issue, ProjectReport, ResolvedConfig } from '../types';
import { applyFocusRingFix } from './focus-ring';
import { applyLayoutTokenFix } from './layout-token';
import { applyUseClientFix } from './use-client';
import { applyVisualCodemods } from './visual-codemod';

export interface FixApplication {
  ruleId: string;
  description: string;
  kind: FixSuggestion['kind'];
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
}

function collectAllFixes(issue: Issue): FixSuggestion[] {
  return [...(issue.fix ? [issue.fix] : []), ...(issue.fixes ?? [])];
}

export async function applyFixes(
  report: ProjectReport,
  // v0.42.0: unused parameter preserved for API compat; rename to _ to silence dead/unused-parameter
  _config: ResolvedConfig,
  scannedFiles?: string[],
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
      };
      const app: FixApplication = {
        ruleId: issue.ruleId,
        description: fix.description,
        kind: fix.kind,
      };

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

  // Round 20: visual-codemod pass walks ALL scanned .tsx files (passed in
  // via scannedFiles), regardless of whether rules fired. Codemods are
  // idempotent class-name swaps — safe to apply opportunistically.
  const visualFiles = new Set<string>();
  if (scannedFiles) {
    for (const f of scannedFiles) {
      if (/\.tsx?$/.test(f)) visualFiles.add(f);
    }
  }
  // Fallback: walk report.components for callers that don't pass scannedFiles.
  for (const comp of report.components) {
    if (!comp.filePath) continue;
    if (!/\.tsx?$/.test(comp.filePath)) continue;
    visualFiles.add(comp.filePath);
  }

  const results: FixResult[] = [];

  for (const [filePath, group] of byFile) {
    const applied: FixApplication[] = [];
    const skipped: FixApplication[] = [];
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

    // Round 20: visual-class codemods (arbitrary-escape, ai-vibe-purple,
    // ai-circle-icon, ai-default-palette, ai-rounded-image-no-clip).
    // Operates directly on the source file's class names.
    try {
      const codemodResult = applyVisualCodemods(filePath);
      if (codemodResult.applied > 0) {
        // Synthesize fix applications so they appear in the fix summary.
        for (const change of codemodResult.changes) {
          applied.push({
            ruleId: 'visual-codemod/' + (change.description.split(' ')[0] ?? 'unknown'),
            description: change.description + ': ' + change.before + ' → ' + change.after,
            kind: 'replace',
          });
        }
      }
    } catch (err) {
      errors.push(`visual-codemod failed for ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    }

    results.push({
      filePath,
      applied,
      skipped,
      ...(errors.length > 0 ? { errors } : {}),
    });
  }

  // Round 20: visual codemods on files that have visual issues but no
  // explicit FixSuggestions (the common case — visual rules don't emit
  // fix hints because the fixes are class-name swaps, not line edits).
  for (const visualFile of visualFiles) {
    if (byFile.has(visualFile)) continue; // already processed above
    try {
      const codemodResult = applyVisualCodemods(visualFile);
      if (codemodResult.applied > 0) {
        const applied: FixApplication[] = codemodResult.changes.map((change) => ({
          ruleId: 'visual-codemod',
          description: change.description + ': ' + change.before + ' → ' + change.after,
          kind: 'replace' as const,
        }));
        results.push({
          filePath: visualFile,
          applied,
          skipped: [],
        });
      }
    } catch (err) {
      // best-effort: don't fail the whole fix loop on a single file error
    }
  }

  return results;
}
