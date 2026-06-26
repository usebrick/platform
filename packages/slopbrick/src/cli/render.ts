// Output rendering primitives used by the CLI commands.
//
// These helpers are deliberately small and side-effect free where
// possible (the exceptions are renderProgress / clearProgress, which
// write to stdout directly to drive the in-place scan spinner).

import type { ProjectReport } from '../types';

// Slop Index → badge color thresholds.
export const SLOP_BADGE_RED_THRESHOLD = 76;
export const SLOP_BADGE_ORANGE_THRESHOLD = 51;
export const SLOP_BADGE_YELLOW_THRESHOLD = 26;

export function colorForSlop(slopIndex: number): string {
  if (slopIndex >= SLOP_BADGE_RED_THRESHOLD) return 'red';
  if (slopIndex >= SLOP_BADGE_ORANGE_THRESHOLD) return 'orange';
  if (slopIndex >= SLOP_BADGE_YELLOW_THRESHOLD) return 'yellow';
  return 'green';
}

export function formatBadge(report: ProjectReport): string {
  const rounded = Math.round(report.slopIndex);
  const color = colorForSlop(report.slopIndex);
  return `[![Slop Index](https://img.shields.io/badge/slop--index-${rounded}-${color})](https://github.com/brickdotdev/slopbrick)`;
}

/** Render an array of values as a Unicode sparkline (▁▂▃▄▅▆▇█). */
export function formatSparkline(values: number[]): string {
  if (values.length === 0) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const blocks = '▁▂▃▄▅▆▇█';
  if (max === min) {
    return values.map(() => blocks[0]).join('');
  }
  return values
    .map((value) => {
      const ratio = (value - min) / (max - min);
      const index = Math.round(ratio * (blocks.length - 1));
      return blocks[Math.min(blocks.length - 1, index)];
    })
    .join('');
}

export function renderTrend(runs: { slopIndex: number }[], count: number): string {
  const latest = runs.slice(-count);
  const values = latest.map((run) => run.slopIndex);
  const sparkline = formatSparkline(values);
  return `Slop trend (last ${latest.length} runs): ${values.map((v) => Math.round(v)).join(' ')} ${sparkline}`;
}

/** Watch debounce — collapse bursts of file-system events into a single scan. */
export const WATCH_DEBOUNCE_MS = 100;

const SPINNER_FRAMES = ['|', '/', '-', '\\'];

export function renderProgress(completed: number, total: number): void {
  const spinner = SPINNER_FRAMES[completed % SPINNER_FRAMES.length];
  process.stdout.write(`\r${spinner} Scanning... ${completed}/${total} files`);
}

export function clearProgress(): void {
  process.stdout.write(`\r${' '.repeat(80)}\r`);
}