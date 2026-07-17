import { existsSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';
import type { FixSuggestion, Issue, ProjectReport } from '../types';
import { sha256Text } from '../fix/binding';
import { applyReplaceFixes, countWholeClassOccurrences } from '../fix/layout-token';

function collectAllFixes(issue: Issue): FixSuggestion[] {
  return [...(issue.fix ? [issue.fix] : []), ...(issue.fixes ?? [])];
}

function applyFixesToString(original: string, fixes: FixSuggestion[]): string {
  const replaceFixes = fixes.filter((f) => f.kind === 'replace');
  const insertFixes = fixes.filter((f) => f.kind === 'insert');

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

  return content;
}

/**
 * Keep the preview surface aligned with the gated apply path. Legacy callers
 * may still construct unbound synthetic reports, so only fixes carrying a
 * binding are subject to this runtime proof check.
 */
function isCurrentBoundFix(issue: Issue, fix: FixSuggestion): boolean {
  const binding = fix.binding;
  if (!binding) return true;
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

export function formatUnifiedDiff(report: ProjectReport, cwd: string): string {
  const byFile = new Map<string, FixSuggestion[]>();

  for (const issue of report.issues) {
    for (const fix of collectAllFixes(issue)) {
      if (!fix.targetFile) continue;
      if (fix.kind !== 'replace' && fix.kind !== 'insert') continue;
      if (!isCurrentBoundFix(issue, fix)) continue;
      const list = byFile.get(fix.targetFile) ?? [];
      list.push(fix);
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
    const patched = applyFixesToString(original, fixes);
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
