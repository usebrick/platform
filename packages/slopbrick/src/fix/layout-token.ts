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

function wholeClassPattern(className: string): RegExp {
  const escaped = escapeRegExp(className);
  return new RegExp(`(^|[\\s"'\`])${escaped}(?=$|[\\s"'\`])`, 'g');
}

export function countWholeClassOccurrences(content: string, className: string): number {
  return [...content.matchAll(wholeClassPattern(className))].length;
}

export function replaceWholeClass(content: string, oldClass: string, newClass: string): string {
  return content.replace(wholeClassPattern(oldClass), (_, before) => `${before}${newClass}`);
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
