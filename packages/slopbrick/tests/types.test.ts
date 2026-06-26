import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VERSION, type Severity, type Issue, type FileScanResult } from '../src/types';

describe('types', () => {
  it('exports version', () => {
    // Live-sync: VERSION must match packages/slopbrick/package.json
    // (avoids drift when the version is bumped). Reads package.json
    // directly so the test fails fast if the two are out of sync.
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')) as { version: string };
    expect(VERSION).toBe(pkg.version);
  });

  it('allows valid severity values', () => {
    const s: Severity = 'high';
    expect(s).toBe('high');
  });

  it('constructs a FileScanResult', () => {
    const issue: Issue = {
      ruleId: 'logic/boundary-violation',
      category: 'logic',
      severity: 'high',
      aiSpecific: true,
      message: 'Hook used in RSC',
      line: 1,
      column: 1,
    };
    const result: FileScanResult = {
      filePath: 'Button.tsx',
      componentCount: 1,
      issues: [issue],
    };
    expect(result.issues[0].ruleId).toBe('logic/boundary-violation');
  });
});
