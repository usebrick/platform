import { relative } from 'node:path';
import { getFileEditCount, getFileLastModifiedDate } from '../cli/git.js';
import type { ProjectReport } from '../types';

const RECENCY_DAYS = 30;
const MAX_EDITS = 10;

export interface HeatmapEntry {
  filePath: string;
  adjustedScore: number;
  componentScore: number;
  recencyWeight: number;
  churnWeight: number;
  roi: number;
  lastModified?: string;
  edits: number;
}

export interface HeatmapHelpers {
  getFileEditCount: (cwd: string, filePath: string, days: number) => Promise<number>;
  getFileLastModifiedDate: (cwd: string, filePath: string) => Promise<Date | undefined>;
}

function isWithinDays(lastModified: Date, reference: Date, days: number): boolean {
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysAgo = (reference.getTime() - lastModified.getTime()) / msPerDay;
  return daysAgo <= days;
}

function computeRecencyWeight(lastModified: Date, reference: Date): number {
  return isWithinDays(lastModified, reference, RECENCY_DAYS) ? 1.5 : 1.0;
}

function computeChurnWeight(edits: number): number {
  return 1 + Math.min(edits / MAX_EDITS, 1);
}

export async function buildHeatmap(
  report: ProjectReport,
  cwd: string,
  helpers: HeatmapHelpers = { getFileEditCount, getFileLastModifiedDate },
): Promise<HeatmapEntry[]> {
  const reference = new Date(report.generatedAt);
  const entries = await Promise.all(
    report.components.map(async (component): Promise<HeatmapEntry> => {
      const relPath = relative(cwd, component.filePath) || component.filePath;
      const [edits, lastModified] = await Promise.all([
        helpers.getFileEditCount(cwd, relPath, RECENCY_DAYS),
        helpers.getFileLastModifiedDate(cwd, relPath),
      ]);

      const recencyWeight = lastModified
        ? computeRecencyWeight(lastModified, reference)
        : 1.0;
      const churnWeight = computeChurnWeight(edits);
      const roi = component.componentScore * recencyWeight * churnWeight;

      return {
        filePath: component.filePath,
        adjustedScore: component.adjustedScore,
        componentScore: component.componentScore,
        recencyWeight,
        churnWeight,
        roi,
        lastModified: lastModified?.toISOString(),
        edits,
      };
    }),
  );

  entries.sort((a, b) => b.roi - a.roi);
  return entries;
}

export function formatHeatmap(
  entries: HeatmapEntry[],
  options: { json?: boolean } = {},
): string {
  if (options.json) {
    return JSON.stringify(entries, null, 2);
  }

  const header = [
    'ROI'.padStart(6),
    'Score'.padStart(6),
    'Recency'.padStart(8),
    'Churn'.padStart(6),
    'File',
  ].join('  ');

  const rows = entries.map((entry) =>
    [
      entry.roi.toFixed(1).padStart(6),
      entry.adjustedScore.toFixed(1).padStart(6),
      entry.recencyWeight.toFixed(2).padStart(8),
      entry.churnWeight.toFixed(2).padStart(6),
      entry.filePath,
    ].join('  '),
  );

  return [header, ...rows].join('\n');
}
