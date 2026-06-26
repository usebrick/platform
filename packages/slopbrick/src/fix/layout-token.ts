import { readFileSync, writeFileSync } from 'node:fs';
import type { FixSuggestion } from '../types';

export interface LayoutTokenFixResult {
  applied: number;
  skipped: number;
  reasons: string[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function replaceWholeClass(content: string, oldClass: string, newClass: string): string {
  const escaped = escapeRegExp(oldClass);
  const boundary = '(^|[\\s"\'`])';
  const pattern = new RegExp(`${boundary}${escaped}(${boundary})`, 'g');
  return content.replace(pattern, (_, before, after) => `${before}${newClass}${after}`);
}

export function applyReplaceFixes(
  content: string,
  fixes: FixSuggestion[],
): { content: string; applied: number; skipped: number; reasons: string[] } {
  let applied = 0;
  let skipped = 0;
  const reasons: string[] = [];

  for (const fix of fixes) {
    if (fix.kind !== 'replace' || fix.oldValue === undefined || fix.newValue === undefined) {
      skipped += 1;
      reasons.push(`invalid-fix: ${fix.description}`);
      continue;
    }

    if (!content.includes(fix.oldValue)) {
      skipped += 1;
      reasons.push(`no-occurrence: ${fix.oldValue}`);
      continue;
    }

    const nextContent = replaceWholeClass(content, fix.oldValue, fix.newValue);
    if (nextContent === content) {
      skipped += 1;
      reasons.push(`no-occurrence: ${fix.oldValue}`);
      continue;
    }

    content = nextContent;
    applied += 1;
  }

  return { content, applied, skipped, reasons };
}

export function applyLayoutTokenFix(filePath: string, fixes: FixSuggestion[]): LayoutTokenFixResult {
  let content = readFileSync(filePath, 'utf-8');
  const { content: patched, applied, skipped, reasons } = applyReplaceFixes(content, fixes);

  if (patched !== content) {
    writeFileSync(filePath, patched);
  }

  return { applied, skipped, reasons };
}
