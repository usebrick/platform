import { existsSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';
import type { FixSuggestion, Issue, ProjectReport } from '../types';
import { applyReplaceFixes } from '../fix/layout-token';

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
