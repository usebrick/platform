import { existsSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';
import type { FixSuggestion, Issue, ProjectReport, ResolvedConfig } from '../types';
import { sha256Text } from '../fix/binding';
import {
  exactImportRewriteInputFromFinding,
  planExactImportRewrites,
} from '../fix/import-rewrite';
import { applyReplaceFixes, countWholeClassOccurrences } from '../fix/layout-token';

interface BoundFix {
  issue: Issue;
  fix: FixSuggestion;
}

function collectAllFixes(issue: Issue): FixSuggestion[] {
  return [...(issue.fix ? [issue.fix] : []), ...(issue.fixes ?? [])];
}

function applyFixesToString(
  original: string,
  entries: BoundFix[],
  config?: ResolvedConfig,
): string {
  const fixes = entries.map(({ fix }) => fix);
  const replaceFixes = fixes.filter((fix) => fix.kind === 'replace');
  const insertFixes = fixes.filter((fix) => fix.kind === 'insert');
  const moduleEntries = entries.filter(({ fix }) => fix.kind === 'module-specifier');
  const hasConflictingFixKind = fixes.some((fix) => fix.kind !== 'module-specifier');

  let content = original;

  if (replaceFixes.length > 0) {
    const result = applyReplaceFixes(content, replaceFixes);
    content = result.content;
  }

  for (const fix of insertFixes) {
    if (fix.newValue && !content.includes(fix.newValue)) {
      content = `${fix.newValue}\n${content}`;
    }
  }

  if (moduleEntries.length > 0 && !hasConflictingFixKind && config) {
    const inputs = moduleEntries.map(({ issue, fix }) => (
      exactImportRewriteInputFromFinding(issue, fix, config)
    ));
    if (inputs.every((result) => result.status === 'accepted')) {
      const planned = planExactImportRewrites(
        original,
        inputs.map((result) => result.status === 'accepted' ? result.input : neverImportRewriteInput()),
      );
      if (planned.status === 'planned') content = planned.plan.after;
    }
  }

  return content;
}

function neverImportRewriteInput(): never {
  throw new Error('unreachable rejected import rewrite');
}

/**
 * Keep the preview surface aligned with the gated apply path. Legacy callers
 * may still construct unbound synthetic reports, so only fixes carrying a
 * binding are subject to this runtime proof check.
 */
function isCurrentBoundFix(
  issue: Issue,
  fix: FixSuggestion,
  config?: ResolvedConfig,
): boolean {
  const binding = fix.binding;
  if (!binding) return fix.kind !== 'module-specifier';
  if (
    !issue.filePath ||
    !fix.targetFile ||
    binding.kind !== 'slopbrick-fix-binding-v1' ||
    binding.ruleId !== issue.ruleId ||
    binding.filePath !== issue.filePath ||
    binding.line !== issue.line ||
    binding.column !== issue.column ||
    fix.kind !== 'css-anchor' && fix.targetFile !== issue.filePath
  ) {
    return false;
  }

  if (!existsSync(issue.filePath) || !existsSync(fix.targetFile)) return false;

  try {
    const source = readFileSync(issue.filePath, 'utf-8');
    const target = readFileSync(fix.targetFile, 'utf-8');
    if (sha256Text(source) !== binding.sourceSha256) return false;
    if (binding.targetSha256 !== undefined && sha256Text(target) !== binding.targetSha256) return false;
    if (fix.kind === 'replace') {
      if (fix.oldValue === undefined || fix.newValue === undefined) return false;
      return countWholeClassOccurrences(target, fix.oldValue) === 1;
    }
    if (fix.kind === 'module-specifier') {
      return config !== undefined
        && exactImportRewriteInputFromFinding(issue, fix, config).status === 'accepted';
    }
    return true;
  } catch {
    return false;
  }
}

function formatHunk(original: string, patched: string): string[] {
  const oldLines = original.split('\n');
  const newLines = patched.split('\n');

  let start = 0;
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) {
    start += 1;
  }

  if (start === oldLines.length && start === newLines.length) {
    return [];
  }

  let end = 0;
  while (
    end < oldLines.length - start &&
    end < newLines.length - start &&
    oldLines[oldLines.length - 1 - end] === newLines[newLines.length - 1 - end]
  ) {
    end += 1;
  }

  const context = 3;
  const contextStart = Math.max(0, start - context);
  const contextEndOld = Math.max(start, oldLines.length - Math.max(0, end - context));
  const contextEndNew = Math.max(start, newLines.length - Math.max(0, end - context));

  const oldRangeStart = contextStart + 1;
  const oldRangeCount = contextEndOld - contextStart;
  const newRangeStart = contextStart + 1;
  const newRangeCount = contextEndNew - contextStart;

  const lines: string[] = [];
  lines.push(`@@ -${oldRangeStart},${oldRangeCount} +${newRangeStart},${newRangeCount} @@`);

  for (let i = contextStart; i < contextEndOld; i += 1) {
    if (i < start || i >= oldLines.length - end) {
      lines.push(` ${oldLines[i] ?? ''}`);
    } else {
      lines.push(`-${oldLines[i] ?? ''}`);
    }
  }

  for (let i = contextStart; i < contextEndNew; i += 1) {
    if (i < start || i >= newLines.length - end) {
      // Already emitted as common context.
      continue;
    }
    lines.push(`+${newLines[i] ?? ''}`);
  }

  return lines;
}

export function formatUnifiedDiff(
  report: ProjectReport,
  cwd: string,
  config?: ResolvedConfig,
): string {
  const byFile = new Map<string, BoundFix[]>();

  for (const issue of report.issues) {
    for (const fix of collectAllFixes(issue)) {
      if (!fix.targetFile) continue;
      if (
        fix.kind !== 'replace'
        && fix.kind !== 'insert'
        && fix.kind !== 'css-anchor'
        && fix.kind !== 'module-specifier'
      ) continue;
      if (!isCurrentBoundFix(issue, fix, config)) continue;
      const list = byFile.get(fix.targetFile) ?? [];
      list.push({ issue, fix });
      byFile.set(fix.targetFile, list);
    }
  }

  if (byFile.size === 0) {
    return '';
  }

  const parts: string[] = [];
  let hasHunk = false;

  for (const [filePath, fixes] of byFile) {
    if (!existsSync(filePath)) continue;

    const original = readFileSync(filePath, 'utf-8');
    const patched = applyFixesToString(original, fixes, config);
    if (patched === original) continue;

    if (!hasHunk) {
      parts.push('');
      parts.push('Suggested patches');
      parts.push('');
      hasHunk = true;
    }

    const rel = relative(cwd, filePath);
    parts.push(`--- a/${rel}`);
    parts.push(`+++ b/${rel}`);
    parts.push(...formatHunk(original, patched));
    parts.push('');
  }

  if (!hasHunk) {
    return '';
  }

  return parts.join('\n');
}
