import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyFocusRingFix } from '../../src/fix/focus-ring';

describe('applyFocusRingFix', () => {
  it('appends the focus-ring CSS block to a target file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'slopbrick-focus-ring-test-'));
    try {
      const targetFile = join(dir, 'globals.css');
      writeFileSync(targetFile, 'body { margin: 0; }\n');

      const result = applyFocusRingFix(targetFile);
      expect(result.applied).toBe(true);
      const content = readFileSync(targetFile, 'utf-8');
      expect(content).toContain('@slopbrick:v1.0.0:fix:focus-ring');
      expect(content).toContain('outline: 2px solid currentColor');
      expect(content).toContain('@slopbrick:v1.0.0:fix:focus-ring-end');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('adds a leading newline when the file does not end with one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'slopbrick-focus-ring-test-'));
    try {
      const targetFile = join(dir, 'globals.css');
      writeFileSync(targetFile, 'body { margin: 0; }');

      applyFocusRingFix(targetFile);
      const content = readFileSync(targetFile, 'utf-8');
      expect(content).toMatch(/body \{ margin: 0; \}\n\/\* @slopbrick:v1\.0\.0:fix:focus-ring \*\//);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns already-present when the anchor exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'slopbrick-focus-ring-test-'));
    try {
      const targetFile = join(dir, 'globals.css');
      writeFileSync(
        targetFile,
        '/* @slopbrick:v1.0.0:fix:focus-ring */\n:focus-visible { outline: 2px solid currentColor; }\n',
      );

      const result = applyFocusRingFix(targetFile);
      expect(result.applied).toBe(false);
      expect(result.reason).toBe('already-present');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns missing-global-css-target when the file does not exist', () => {
    const result = applyFocusRingFix('/nonexistent/path/globals.css');
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('missing-global-css-target');
  });
});
