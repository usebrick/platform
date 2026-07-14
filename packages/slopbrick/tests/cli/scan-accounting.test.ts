import { describe, expect, it } from 'vitest';
import { countSuccessfullyAnalyzed, isSuccessfullyAnalyzed } from '../../src/cli/scan-accounting';
import type { FileScanResult } from '../../src/types';

const result = (overrides: Partial<FileScanResult> = {}): FileScanResult => ({
  filePath: 'src/example.ts',
  componentCount: 0,
  issues: [],
  ...overrides,
});

describe('scan accounting helpers', () => {
  it('counts only results with no classified or legacy failure', () => {
    const results = [
      result(),
      result({ parseError: 'syntax error', failureKind: 'parse' }),
      result({ parseError: 'worker timed out', failureKind: 'timeout' }),
      result({ failureKind: 'crash' }),
      result({ parseError: 'scanner failed', failureKind: 'internal' }),
    ];

    expect(results.map(isSuccessfullyAnalyzed)).toEqual([true, false, false, false, false]);
    expect(countSuccessfullyAnalyzed(results)).toBe(1);
  });

  it('keeps legacy successful results without failureKind eligible', () => {
    expect(isSuccessfullyAnalyzed(result())).toBe(true);
    expect(isSuccessfullyAnalyzed(result({ parseError: undefined }))).toBe(true);
  });
});
