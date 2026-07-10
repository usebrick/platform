import { describe, expect, it } from 'vitest';
import { reportToMarkdown } from '../../src/research/calibrator';
import { sparkline, trendToText, trendToMarkdown, type TrendReport } from '../../src/engine/trend';
import type { CalibrationReport, RuleCalibration } from '../../src/research/calibrator';

function makeReport(rules: RuleCalibration[], opts: { skippedChunks?: CalibrationReport['skippedChunks']; chunkTimeoutMs?: number } = {}): CalibrationReport {
  return {
    generatedAt: '2026-06-21T00:00:00.000Z',
    positivePath: '/p',
    negativePath: '/n',
    positiveFileCount: 100,
    negativeFileCount: 100,
    rules,
    skippedChunks: opts.skippedChunks ?? [],
    chunkTimeoutMs: opts.chunkTimeoutMs ?? 90_000,
  };
}

describe('research/calibrator reportToMarkdown', () => {
  it('emits a header and a sortable rule table', () => {
    const md = reportToMarkdown(
      makeReport([
        {
          ruleId: 'logic/console-log',
          category: 'logic',
          severity: 'low',
          positiveFires: 22,
          negativeFires: 0,
          positiveFiles: 10,
          negativeFiles: 0,
          precision: 1.0,
          recall: 0.1,
          f1: 0.18,
          signal: 'strong',
        },
        {
          ruleId: 'typo/inverted-rule',
          category: 'typo',
          severity: 'medium',
          positiveFires: 1,
          negativeFires: 10,
          positiveFiles: 1,
          negativeFiles: 5,
          precision: 0.1,
          recall: 0.01,
          f1: 0.018,
          signal: 'inverted',
        },
      ]),
    );
    expect(md).toContain('# Empirical Calibration Report');
    expect(md).toContain('| Signal | Rule | Category | Severity | Precision | Recall | F1 | Pos fires | Neg fires |');
    expect(md).toContain('`logic/console-log`');
    expect(md).toContain('strong');
    // Sorted by F1 desc — console-log (0.18) first.
    const idxStrong = md.indexOf('logic/console-log');
    const idxInverted = md.indexOf('typo/inverted-rule');
    expect(idxStrong).toBeLessThan(idxInverted);
  });

  it('groups inverted + dormant + weak into a Recommendations section', () => {
    const md = reportToMarkdown(
      makeReport([
        {
          ruleId: 'r/inverted',
          category: 'logic',
          severity: 'low',
          positiveFires: 1,
          negativeFires: 9,
          positiveFiles: 1,
          negativeFiles: 9,
          precision: 0.1,
          recall: 0.01,
          f1: 0.018,
          signal: 'inverted',
        },
        {
          ruleId: 'r/dormant',
          category: 'logic',
          severity: 'low',
          positiveFires: 0,
          negativeFires: 0,
          positiveFiles: 0,
          negativeFiles: 0,
          precision: 0,
          recall: 0,
          f1: 0,
          signal: 'dormant',
        },
        {
          ruleId: 'r/weak',
          category: 'logic',
          severity: 'low',
          positiveFires: 3,
          negativeFires: 3,
          positiveFiles: 3,
          negativeFiles: 3,
          precision: 0.5,
          recall: 0.03,
          f1: 0.057,
          signal: 'weak',
        },
      ]),
    );
    expect(md).toContain('## Recommendations');
    expect(md).toContain('**Inverted (1):**');
    expect(md).toContain('r/inverted');
    expect(md).toContain('**Dormant (1):**');
    expect(md).toContain('r/dormant');
    expect(md).toContain('r/weak');
  });

  // v0.10.2 (Phase 4): skipped chunks and chunk-timeout reporting.
  describe('chunk-timeout reporting', () => {
    it('shows the per-chunk timeout in the report header', () => {
      const md = reportToMarkdown(makeReport([], { chunkTimeoutMs: 30_000 }));
      expect(md).toContain('Per-chunk scan timeout: **30s**');
    });

    it('omits the Skipped Chunks section when no chunks were skipped', () => {
      const md = reportToMarkdown(makeReport([]));
      expect(md).not.toContain('## Skipped Chunks');
      expect(md).not.toContain('Skipped chunks:');
    });

    it('renders a Skipped Chunks table with polarity, index, first file, and reason', () => {
      const md = reportToMarkdown(
        makeReport([], {
          skippedChunks: [
            { polarity: 'positive', index: 4, firstFile: '/corpus/pos/foo.ts', reason: 'timeout' },
            { polarity: 'negative', index: 1, firstFile: '/corpus/neg/bar.js', reason: 'error' },
          ],
        }),
      );
      expect(md).toContain('Skipped chunks: 2');
      expect(md).toContain('## Skipped Chunks');
      expect(md).toContain('| positive | 4 | `/corpus/pos/foo.ts` | timeout |');
      expect(md).toContain('| negative | 1 | `/corpus/neg/bar.js` | error |');
    });

    it('disables the Skipped Chunks summary line when no skips occurred', () => {
      const md = reportToMarkdown(makeReport([]));
      expect(md).not.toContain('Skipped chunks:');
    });
  });
});

describe('engine/trend', () => {
  describe('sparkline', () => {
    it('returns empty string for empty input', () => {
      expect(sparkline([])).toBe('');
    });
    it('renders a block for each value, with min/max endpoints at the smallest/largest block', () => {
      const s = sparkline([10, 20, 30, 40, 50]);
      expect(s.length).toBe(5);
      // Min value at first index should be the smallest block.
      const firstBlock = s[0];
      const lastBlock = s[4];
      expect(firstBlock.charCodeAt(0)).toBeLessThan(lastBlock.charCodeAt(0));
    });
    it('handles a flat series without dividing by zero', () => {
      const s = sparkline([5, 5, 5]);
      expect(s.length).toBe(3);
    });
  });

  describe('trendToText', () => {
    it('prints a friendly message when there are no points', () => {
      const out = trendToText({
        start: '',
        end: '',
        totalScans: 0,
        first: null,
        latest: null,
        delta: 0,
        points: [],
      });
      expect(out).toContain('No telemetry data');
    });

    it('summarizes delta direction', () => {
      const report: TrendReport = {
        start: '2026-06-21T00:00:00Z',
        end: '2026-06-21T01:00:00Z',
        totalScans: 3,
        first: {
          timestamp: '2026-06-21T00:00:00Z',
          slopIndex: 50,
          assemblyHealth: 50,
          framework: 'react',
          totalIssues: 10,
        },
        latest: {
          timestamp: '2026-06-21T01:00:00Z',
          slopIndex: 30,
          assemblyHealth: 70,
          framework: 'react',
          totalIssues: 6,
        },
        delta: -20,
        points: [
          { timestamp: '2026-06-21T00:00:00Z', slopIndex: 50, assemblyHealth: 50, framework: 'react', totalIssues: 10 },
          { timestamp: '2026-06-21T00:30:00Z', slopIndex: 40, assemblyHealth: 60, framework: 'react', totalIssues: 8 },
          { timestamp: '2026-06-21T01:00:00Z', slopIndex: 30, assemblyHealth: 70, framework: 'react', totalIssues: 6 },
        ],
      };
      const out = trendToText(report);
      expect(out).toContain('improved');
      expect(out).toContain('20.0');
      expect(out).toContain('2026-06-21');
    });
  });

  describe('trendToMarkdown', () => {
    it('renders a markdown table for the report', () => {
      const report: TrendReport = {
        start: '2026-06-21T00:00:00Z',
        end: '2026-06-21T01:00:00Z',
        totalScans: 2,
        first: { timestamp: '2026-06-21T00:00:00Z', slopIndex: 50, assemblyHealth: 50, framework: 'react', totalIssues: 10 },
        latest: { timestamp: '2026-06-21T01:00:00Z', slopIndex: 30, assemblyHealth: 70, framework: 'react', totalIssues: 6 },
        delta: -20,
        points: [
          { timestamp: '2026-06-21T00:00:00Z', slopIndex: 50, assemblyHealth: 50, framework: 'react', totalIssues: 10 },
          { timestamp: '2026-06-21T01:00:00Z', slopIndex: 30, assemblyHealth: 70, framework: 'react', totalIssues: 6 },
        ],
      };
      const md = trendToMarkdown(report);
      // v0.42.0: trend renderer now uses "AI Slop Score" terminology.
      expect(md).toMatch(/^# AI Slop Score Trend/);
      expect(md).toContain('| Timestamp | AI Slop Score (lower = cleaner) | Health | Framework | Issues |');
      expect(md).toContain('improved');
    });
  });
});