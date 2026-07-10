import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { loadChunks, mergeCalibrationChunks, toMarkdown } from '../../scripts/cal/merge-chunk-results';

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

  it('preserves the first file from timeout/error markers', () => {
    const root = mkdtempSync(join(tmpdir(), 'slopbrick-merge-'));
    const pos = join(root, 'pos');
    mkdirSync(pos);
    writeFileSync(join(pos, 'chunk-0003.json'), JSON.stringify({
      fileCount: 0,
      issues: [],
      _calError: true,
      _calExitCode: 124,
      _firstFile: '/corpus/positive/slow.ts',
    }));

    const result = loadChunks(pos, 'positive');

    expect(result.skipped).toEqual([
      { polarity: 'positive', index: 3, firstFile: '/corpus/positive/slow.ts', reason: 'timeout' },
    ]);
  });

  it('records valid JSON with an invalid shape as a skipped error', () => {
    const root = mkdtempSync(join(tmpdir(), 'slopbrick-merge-'));
    const pos = join(root, 'pos');
    mkdirSync(pos);
    writeFileSync(join(pos, 'chunk-0002.json'), JSON.stringify({
      fileCount: 'two',
      issues: 'not-an-array',
      _firstFile: '/corpus/positive/bad.json',
    }));

    const result = loadChunks(pos, 'positive');

    expect(result.fileCount).toBe(0);
    expect(result.skipped).toEqual([
      { polarity: 'positive', index: 2, firstFile: '/corpus/positive/bad.json', reason: 'error' },
    ]);
  });

  it('produces deterministic machine data and Markdown from the same chunk evidence', () => {
    const root = mkdtempSync(join(tmpdir(), 'slopbrick-merge-'));
    const pos = join(root, 'pos');
    const neg = join(root, 'neg');
    mkdirSync(pos);
    mkdirSync(neg);
    writeFileSync(join(pos, 'chunk-0000.json'), JSON.stringify({
      fileCount: 2,
      issues: [{ ruleId: 'ai/example', filePath: '/corpus/pos/a.ts' }],
    }));
    writeFileSync(join(neg, 'chunk-0000.json'), JSON.stringify({
      fileCount: 2,
      issues: [{ ruleId: 'ai/example', filePath: '/corpus/neg/a.ts' }],
    }));

    const first = mergeCalibrationChunks({ outputDir: root, chunkTimeoutMs: 30_000, posList: 'pos.txt', negList: 'neg.txt', generatedAt: '2026-07-10T00:00:00.000Z' });
    const second = mergeCalibrationChunks({ outputDir: root, chunkTimeoutMs: 30_000, posList: 'pos.txt', negList: 'neg.txt', generatedAt: '2026-07-10T00:00:00.000Z' });

    expect(second).toEqual(first);
    expect(first).toMatchObject({ positiveFileCount: 2, negativeFileCount: 2, generatedAt: '2026-07-10T00:00:00.000Z' });
    expect(first.rules).toEqual([expect.objectContaining({ ruleId: 'ai/example', positiveFiles: 1, negativeFiles: 1 })]);
    const markdown = toMarkdown(first);
    expect(markdown).toContain('Positive corpus (AI-generated): **2** files from `pos.txt`');
    expect(markdown).toContain('`ai/example`');
  });
});
