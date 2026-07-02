import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readTelemetry } from './telemetry';
import type { TelemetryPayload } from './telemetry';

// Round-16: Slop Index trend over time, read from telemetry JSONL.
//
// Output: an ASCII sparkline + a markdown table of (timestamp, slopIndex,
// assemblyHealth, top categories). Designed for `slopbrick trend` to give
// teams a single-number "did we get better?" answer.

export interface TrendPoint {
  timestamp: string;
  slopIndex: number;
  assemblyHealth: number;
  framework: string;
  totalIssues: number;
}

export interface TrendReport {
  start: string;
  end: string;
  totalScans: number;
  first: TrendPoint | null;
  latest: TrendPoint | null;
  delta: number;
  points: TrendPoint[];
}

const TELEMETRY_DIR = '.slopbrick/flywheel';

export function buildTrend(cwd: string, maxPoints = 30): TrendReport {
  const payloads = readTelemetry(cwd);
  // Sort by timestamp ascending and pick the last N.
  payloads.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
  const recent = payloads.slice(-maxPoints);
  const points: TrendPoint[] = recent.map((p) => ({
    timestamp: p.timestamp,
    slopIndex: p.project.slopIndex,
    assemblyHealth: p.project.assemblyHealth,
    framework: p.project.framework ?? 'unknown',
    totalIssues: p.violations.reduce((sum, v) => sum + v.count, 0),
  }));

  const first = points[0] ?? null;
  const latest = points[points.length - 1] ?? null;
  const delta = first && latest ? latest.slopIndex - first.slopIndex : 0;

  return {
    start: first?.timestamp ?? '',
    end: latest?.timestamp ?? '',
    totalScans: payloads.length,
    first,
    latest,
    delta,
    points,
  };
}

const SPARK_BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

export function sparkline(values: number[]): string {
  if (values.length === 0) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((v) => {
      const idx = Math.min(SPARK_BLOCKS.length - 1, Math.floor(((v - min) / range) * SPARK_BLOCKS.length));
      return SPARK_BLOCKS[idx];
    })
    .join('');
}

export function trendToText(report: TrendReport): string {
  const lines: string[] = [];
  if (report.points.length === 0) {
    lines.push('No telemetry data found in ' + TELEMETRY_DIR + '.');
    lines.push('Run a scan (which writes to .slopbrick/flywheel/scans.jsonl) to start tracking.');
    return lines.join('\n');
  }
  const slopValues = report.points.map((p) => p.slopIndex);
  const spark = sparkline(slopValues);
  lines.push('Slop Index trend (last ' + report.points.length + ' scans, ' + report.totalScans + ' total):');
  lines.push('');
  lines.push('  ' + spark + '  ' + slopValues[0]!.toFixed(1) + ' -> ' + slopValues[slopValues.length - 1]!.toFixed(1));
  lines.push('');
  if (report.first && report.latest) {
    const direction = report.delta < 0 ? 'improved' : report.delta > 0 ? 'regressed' : 'unchanged';
    const arrow = report.delta < 0 ? 'v' : report.delta > 0 ? '^' : '=';
    lines.push('  ' + arrow + ' Slop Index ' + direction + ' by ' + Math.abs(report.delta).toFixed(1) + ' points');
    lines.push('    ' + report.first.timestamp + '  ->  ' + report.latest.timestamp);
  }
  lines.push('');
  lines.push('Recent scans:');
  lines.push('  Timestamp                  Slop    Health  Framework  Issues');
  lines.push('  ────────────────────────   ────   ──────  ─────────  ──────');
  for (const p of report.points.slice(-10)) {
    const ts = p.timestamp.slice(0, 19).replace('T', ' ');
    lines.push(
      '  ' +
        ts.padEnd(24) +
        '  ' +
        p.slopIndex.toFixed(1).padStart(5) +
        '  ' +
        p.assemblyHealth.toFixed(1).padStart(6) +
        '   ' +
        p.framework.padEnd(10) +
        ' ' +
        p.totalIssues.toString().padStart(5),
    );
  }
  return lines.join('\n');
}

export function trendToMarkdown(report: TrendReport): string {
  const lines: string[] = [];
  lines.push('# Slop Index Trend');
  lines.push('');
  if (report.points.length === 0) {
    lines.push('No telemetry data yet. Run `slopbrick scan` to start tracking.');
    return lines.join('\n');
  }
  const slopValues = report.points.map((p) => p.slopIndex);
  lines.push('Slop Index sparkline (last ' + report.points.length + ' scans):');
  lines.push('');
  lines.push('```');
  lines.push(sparkline(slopValues));
  lines.push('```');
  lines.push('');
  if (report.first && report.latest) {
    const direction = report.delta < 0 ? 'improved' : report.delta > 0 ? 'regressed' : 'unchanged';
    lines.push('Slop Index ' + direction + ' by **' + Math.abs(report.delta).toFixed(1) + ' points** between first and latest scan.');
  }
  lines.push('');
  lines.push('| Timestamp | Slop Index | Health | Framework | Issues |');
  lines.push('|-----------|-----------:|-------:|-----------|-------:|');
  for (const p of report.points) {
    lines.push('| ' + p.timestamp + ' | ' + p.slopIndex.toFixed(1) + ' | ' + p.assemblyHealth.toFixed(1) + ' | ' + p.framework + ' | ' + p.totalIssues + ' |');
  }
  return lines.join('\n');
}