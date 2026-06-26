import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyLayoutTokenFix } from '../../src/fix/layout-token';
import type { FixSuggestion } from '../../src/types';

describe('applyLayoutTokenFix', () => {
  it('replaces arbitrary layout classes with design tokens', () => {
    const dir = mkdtempSync(join(tmpdir(), 'slopbrick-layout-token-test-'));
    try {
      const filePath = join(dir, 'Component.tsx');
      writeFileSync(filePath, 'export function Box() { return <div className="w-[100px] p-[13px]" />; }\n');

      const fixes: FixSuggestion[] = [
        {
          kind: 'replace',
          description: "Replace 'w-[100px]' with 'w-25'",
          targetFile: filePath,
          oldValue: 'w-[100px]',
          newValue: 'w-25',
        },
        {
          kind: 'replace',
          description: "Replace 'p-[13px]' with 'p-3'",
          targetFile: filePath,
          oldValue: 'p-[13px]',
          newValue: 'p-3',
        },
      ];

      const result = applyLayoutTokenFix(filePath, fixes);
      expect(result.applied).toBe(2);
      expect(result.skipped).toBe(0);
      expect(readFileSync(filePath, 'utf-8')).toBe(
        'export function Box() { return <div className="w-25 p-3" />; }\n',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not replace a class that is a substring of another class', () => {
    const dir = mkdtempSync(join(tmpdir(), 'slopbrick-layout-token-test-'));
    try {
      const filePath = join(dir, 'Component.tsx');
      writeFileSync(filePath, 'export function Box() { return <div className="p-[13px]x other" />; }\n');

      const fixes: FixSuggestion[] = [
        {
          kind: 'replace',
          description: "Replace 'p-[13px]' with 'p-3'",
          targetFile: filePath,
          oldValue: 'p-[13px]',
          newValue: 'p-3',
        },
      ];

      const result = applyLayoutTokenFix(filePath, fixes);
      expect(result.applied).toBe(0);
      expect(result.skipped).toBe(1);
      expect(readFileSync(filePath, 'utf-8')).toBe(
        'export function Box() { return <div className="p-[13px]x other" />; }\n',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips fixes whose oldValue is missing from the file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'slopbrick-layout-token-test-'));
    try {
      const filePath = join(dir, 'Component.tsx');
      writeFileSync(filePath, 'export function Box() { return <div className="m-[20px]" />; }\n');

      const fixes: FixSuggestion[] = [
        {
          kind: 'replace',
          description: "Replace 'm-[20px]' with 'm-5'",
          targetFile: filePath,
          oldValue: 'm-[20px]',
          newValue: 'm-5',
        },
        {
          kind: 'replace',
          description: "Replace 'p-[13px]' with 'p-3'",
          targetFile: filePath,
          oldValue: 'p-[13px]',
          newValue: 'p-3',
        },
      ];

      const result = applyLayoutTokenFix(filePath, fixes);
      expect(result.applied).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.reasons).toContain("no-occurrence: p-[13px]");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not write the file when no replacements are applied', () => {
    const dir = mkdtempSync(join(tmpdir(), 'slopbrick-layout-token-test-'));
    try {
      const filePath = join(dir, 'Component.tsx');
      writeFileSync(filePath, 'export function Box() { return <div className="p-3" />; }\n');

      const fixes: FixSuggestion[] = [
        {
          kind: 'replace',
          description: "Replace 'p-[13px]' with 'p-3'",
          targetFile: filePath,
          oldValue: 'p-[13px]',
          newValue: 'p-3',
        },
      ];

      const before = readFileSync(filePath, 'utf-8');
      const result = applyLayoutTokenFix(filePath, fixes);
      expect(result.applied).toBe(0);
      expect(readFileSync(filePath, 'utf-8')).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
