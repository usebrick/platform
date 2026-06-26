import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyUseClientFix } from '../../src/fix/use-client';

describe('applyUseClientFix', () => {
  it('prepends "use client" to a file without the directive', () => {
    const dir = mkdtempSync(join(tmpdir(), 'slopbrick-use-client-test-'));
    try {
      const filePath = join(dir, 'Component.tsx');
      writeFileSync(filePath, 'export function Page() { return <div />; }\n');

      const result = applyUseClientFix(filePath);
      expect(result.applied).toBe(true);
      expect(readFileSync(filePath, 'utf-8')).toBe(
        '"use client";\n\nexport function Page() { return <div />; }\n',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns already-present for a single-quoted directive', () => {
    const dir = mkdtempSync(join(tmpdir(), 'slopbrick-use-client-test-'));
    try {
      const filePath = join(dir, 'Component.tsx');
      writeFileSync(filePath, "'use client';\nexport function Page() { return <div />; }\n");

      const result = applyUseClientFix(filePath);
      expect(result.applied).toBe(false);
      expect(result.reason).toBe('already-present');
      expect(readFileSync(filePath, 'utf-8')).toBe(
        "'use client';\nexport function Page() { return <div />; }\n",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns already-present for a double-quoted directive', () => {
    const dir = mkdtempSync(join(tmpdir(), 'slopbrick-use-client-test-'));
    try {
      const filePath = join(dir, 'Component.tsx');
      writeFileSync(filePath, '"use client";\nexport function Page() { return <div />; }\n');

      const result = applyUseClientFix(filePath);
      expect(result.applied).toBe(false);
      expect(result.reason).toBe('already-present');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects the directive even with leading whitespace', () => {
    const dir = mkdtempSync(join(tmpdir(), 'slopbrick-use-client-test-'));
    try {
      const filePath = join(dir, 'Component.tsx');
      writeFileSync(filePath, '\n\n\'use client\';\nexport function Page() { return <div />; }\n');

      const result = applyUseClientFix(filePath);
      expect(result.applied).toBe(false);
      expect(result.reason).toBe('already-present');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
