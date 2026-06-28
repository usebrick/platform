import { describe, expect, it } from 'vitest';
import { buildHeatmap, formatHeatmap } from '../../src/report/heatmap.js';
import type { HeatmapHelpers, HeatmapEntry } from '../../src/report/heatmap.js';
import type { ComponentScore, ProjectReport } from '../../src/types.js';

const GENERATED_AT = '2026-06-15T00:00:00.000Z';

function makeReport(components: ComponentScore[]): ProjectReport {
  return {
    version: '0.6.0',
    generatedAt: GENERATED_AT,
    aiQuality: 50, engineeringHygiene: 50, security: 50, repositoryHealth: 50,
    assemblyHealth: 50,
    totalScore: 50,
    categoryScores: {
      visual: 0,
      typo: 0,
      wcag: 0,
      layout: 0,
      component: 0,
      logic: 0,
      arch: 0,
      perf: 0,
      security: 0,      test: 0,    docs: 0,    db: 0,    ai: 0,    context: 0,    product: 0,    i18n: 0,},
    boundaryScore: 0,
    contextScore: 0,
    visualScore: 0,
    p90Score: 0,
    peakScore: 0,
    componentCount: components.length,
    fileCount: components.length,
    thresholds: { meanSlop: 25, p90Slop: 50, individualSlopThreshold: 50 },
    components,
    issues: [],
  };
}

function dateDaysAgo(days: number): Date {
  const date = new Date(GENERATED_AT);
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

function makeHelpers(
  editsByFile: Record<string, number>,
  datesByFile: Record<string, Date | undefined>,
): HeatmapHelpers {
  return {
    getFileEditCount: async (_cwd, filePath) => editsByFile[filePath] ?? 0,
    getFileLastModifiedDate: async (_cwd, filePath) => datesByFile[filePath],
  };
}

describe('buildHeatmap', () => {
  it('computes ROI and sorts entries by ROI descending', async () => {
    const components: ComponentScore[] = [
      { filePath: '/project/src/A.tsx', rawScore: 80, componentScore: 80, adjustedScore: 80, componentCount: 1 },
      { filePath: '/project/src/B.tsx', rawScore: 90, componentScore: 90, adjustedScore: 90, componentCount: 1 },
      { filePath: '/project/src/C.tsx', rawScore: 50, componentScore: 50, adjustedScore: 50, componentCount: 1 },
    ];
    const helpers = makeHelpers(
      { 'src/A.tsx': 10, 'src/B.tsx': 0, 'src/C.tsx': 5 },
      {
        'src/A.tsx': dateDaysAgo(5),
        'src/B.tsx': dateDaysAgo(100),
        'src/C.tsx': undefined,
      },
    );

    const entries = await buildHeatmap(makeReport(components), '/project', helpers);

    expect(entries.map((e) => e.filePath)).toEqual([
      '/project/src/A.tsx',
      '/project/src/B.tsx',
      '/project/src/C.tsx',
    ]);

    const [a, b, c] = entries;
    expect(a.adjustedScore).toBe(80);
    expect(a.edits).toBe(10);
    expect(a.recencyWeight).toBe(1.5);
    expect(a.churnWeight).toBe(2.0);
    expect(a.roi).toBe(240);
    expect(a.lastModified).toBe(dateDaysAgo(5).toISOString());

    expect(b.adjustedScore).toBe(90);
    expect(b.edits).toBe(0);
    expect(b.recencyWeight).toBe(1.0);
    expect(b.churnWeight).toBe(1.0);
    expect(b.roi).toBe(90);
    expect(b.lastModified).toBe(dateDaysAgo(100).toISOString());

    expect(c.adjustedScore).toBe(50);
    expect(c.edits).toBe(5);
    expect(c.recencyWeight).toBe(1.0);
    expect(c.churnWeight).toBe(1.5);
    expect(c.roi).toBe(75);
    expect(c.lastModified).toBeUndefined();
  });

  it('uses default helpers when none are provided', async () => {
    const components: ComponentScore[] = [
      { filePath: '/project/src/A.tsx', rawScore: 10, componentScore: 10, adjustedScore: 10, componentCount: 1 },
    ];
    const entries = await buildHeatmap(makeReport(components), '/project');

    expect(entries).toHaveLength(1);
    expect(entries[0].filePath).toBe('/project/src/A.tsx');
    expect(typeof entries[0].edits).toBe('number');
    expect(typeof entries[0].roi).toBe('number');
  });
});

describe('buildHeatmap recency weights', () => {
  it('assigns 1.5 to files modified today', async () => {
    const components: ComponentScore[] = [
      { filePath: '/project/src/Today.tsx', rawScore: 10, componentScore: 10, adjustedScore: 10, componentCount: 1 },
    ];
    const helpers = makeHelpers(
      { 'src/Today.tsx': 0 },
      { 'src/Today.tsx': dateDaysAgo(0) },
    );
    const entries = await buildHeatmap(makeReport(components), '/project', helpers);

    expect(entries[0].recencyWeight).toBe(1.5);
    expect(entries[0].churnWeight).toBe(1.0);
    expect(entries[0].roi).toBe(15);
  });

  it('assigns 1.5 to files modified within the last 30 days', async () => {
    const components: ComponentScore[] = [
      { filePath: '/project/src/Recent.tsx', rawScore: 10, componentScore: 10, adjustedScore: 10, componentCount: 1 },
    ];
    const helpers = makeHelpers(
      { 'src/Recent.tsx': 0 },
      { 'src/Recent.tsx': dateDaysAgo(30) },
    );
    const entries = await buildHeatmap(makeReport(components), '/project', helpers);

    expect(entries[0].recencyWeight).toBe(1.5);
  });

  it('assigns 1.0 to files modified more than 30 days ago', async () => {
    const components: ComponentScore[] = [
      { filePath: '/project/src/Old.tsx', rawScore: 10, componentScore: 10, adjustedScore: 10, componentCount: 1 },
    ];
    const helpers = makeHelpers(
      { 'src/Old.tsx': 0 },
      { 'src/Old.tsx': dateDaysAgo(31) },
    );
    const entries = await buildHeatmap(makeReport(components), '/project', helpers);

    expect(entries[0].recencyWeight).toBe(1.0);
    expect(entries[0].churnWeight).toBe(1.0);
    expect(entries[0].roi).toBe(10);
  });

  it('defaults to 1.0 when no last modified date is available', async () => {
    const components: ComponentScore[] = [
      { filePath: '/project/src/Unknown.tsx', rawScore: 10, componentScore: 10, adjustedScore: 10, componentCount: 1 },
    ];
    const helpers = makeHelpers({ 'src/Unknown.tsx': 0 }, { 'src/Unknown.tsx': undefined });
    const entries = await buildHeatmap(makeReport(components), '/project', helpers);

    expect(entries[0].recencyWeight).toBe(1.0);
  });
});

describe('buildHeatmap churn weights', () => {
  it('assigns 1.5 for 5 edits in the last 30 days', async () => {
    const components: ComponentScore[] = [
      { filePath: '/project/src/FiveEdits.tsx', rawScore: 10, componentScore: 10, adjustedScore: 10, componentCount: 1 },
    ];
    const helpers = makeHelpers(
      { 'src/FiveEdits.tsx': 5 },
      { 'src/FiveEdits.tsx': undefined },
    );
    const entries = await buildHeatmap(makeReport(components), '/project', helpers);

    expect(entries[0].churnWeight).toBe(1.5);
    expect(entries[0].roi).toBe(15);
  });

  it('assigns 2.0 for 20 edits in the last 30 days (capped)', async () => {
    const components: ComponentScore[] = [
      { filePath: '/project/src/ManyEdits.tsx', rawScore: 10, componentScore: 10, adjustedScore: 10, componentCount: 1 },
    ];
    const helpers = makeHelpers(
      { 'src/ManyEdits.tsx': 20 },
      { 'src/ManyEdits.tsx': undefined },
    );
    const entries = await buildHeatmap(makeReport(components), '/project', helpers);

    expect(entries[0].churnWeight).toBe(2.0);
    expect(entries[0].roi).toBe(20);
  });

  it('assigns 1.0 for zero edits', async () => {
    const components: ComponentScore[] = [
      { filePath: '/project/src/NoEdits.tsx', rawScore: 10, componentScore: 10, adjustedScore: 10, componentCount: 1 },
    ];
    const helpers = makeHelpers(
      { 'src/NoEdits.tsx': 0 },
      { 'src/NoEdits.tsx': undefined },
    );
    const entries = await buildHeatmap(makeReport(components), '/project', helpers);

    expect(entries[0].churnWeight).toBe(1.0);
  });
});

describe('formatHeatmap', () => {
  it('renders a sorted text table with numeric columns', () => {
    const entries: HeatmapEntry[] = [
      { filePath: 'src/B.tsx', adjustedScore: 90, componentScore: 90, recencyWeight: 1.0, churnWeight: 1.0, roi: 90, edits: 0 },
      { filePath: 'src/A.tsx', adjustedScore: 80, componentScore: 80, recencyWeight: 1.5, churnWeight: 2.0, roi: 240, edits: 10 },
    ];
    const output = formatHeatmap(entries);

    expect(output).toContain('ROI');
    expect(output).toContain('Score');
    expect(output).toContain('Recency');
    expect(output).toContain('Churn');
    expect(output).toContain('File');
    expect(output).toContain('src/A.tsx');
    expect(output).toContain('src/B.tsx');
    expect(output).toContain('240.0');
    expect(output).toContain('90.0');
  });

  it('returns an empty table when there are no entries', () => {
    const output = formatHeatmap([]);
    expect(output).toContain('ROI');
    expect(output).not.toContain('src/');
  });

  it('returns pretty-printed JSON when json option is true', () => {
    const entries: HeatmapEntry[] = [
      { filePath: 'src/A.tsx', adjustedScore: 80, componentScore: 80, recencyWeight: 1.5, churnWeight: 2.0, roi: 240, edits: 10 },
    ];
    const output = formatHeatmap(entries, { json: true });
    const parsed = JSON.parse(output) as HeatmapEntry[];

    expect(parsed).toHaveLength(1);
    expect(parsed[0].filePath).toBe('src/A.tsx');
    expect(parsed[0].roi).toBe(240);
    expect(output).toMatch(/^\[\n  \{/);
  });
});
