import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { loadChunks } from '../../scripts/cal/merge-chunk-results';

describe('calibration chunk merge accounting', () => {
  it('records corrupt chunk output as skipped instead of silently shrinking the denominator', () => {
    const root = mkdtempSync(join(tmpdir(), 'slopbrick-merge-'));
    const pos = join(root, 'pos');
    mkdirSync(pos);
    writeFileSync(join(pos, 'chunk-0000.json'), '{"fileCount": 2,"issues":[]}');
    writeFileSync(join(pos, 'chunk-0001.json'), '{"fileCount":');

    const result = loadChunks(pos, 'positive');

    expect(result.fileCount).toBe(2);
    expect(result.skipped).toEqual([
      { polarity: 'positive', index: 1, firstFile: '', reason: 'error' },
    ]);
  });
});
