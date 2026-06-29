// Output rendering primitives used by the CLI commands.
//
// These helpers are deliberately small and side-effect free where
// possible (the exceptions are renderProgress / clearProgress, which
// write to stdout directly to drive the in-place scan spinner).

import type { ProjectReport } from '../types';

// v0.15.0 U.4: colorForQuality is the inverted replacement for the
// v0.14 colorForSlop helper. The legacy v0.14 logic mapped "higher
// slop index" → "worse color" (lower = better). The v0.15 aiQuality
// axis follows the opposite convention: higher = better. The four
// thresholds are kept at the same numeric boundaries (76/51/26) but
// the color associations are flipped: aiQuality < 26 is now red
// (low quality = bad), 26-50 is orange, 51-75 is yellow, 76+ is
// green. The constant names are preserved so the public API
// (SLOP_BADGE_*) stays the same, only the meaning of the input
// axis changed. The v0.14 colorForSlop is kept as a deprecated
// alias for backward compat with any v0.14 callers that haven't
// migrated yet.
export const SLOP_BADGE_RED_THRESHOLD = 76;
export const SLOP_BADGE_ORANGE_THRESHOLD = 51;
export const SLOP_BADGE_YELLOW_THRESHOLD = 26;

export function colorForSlop(slopIndex: number): string {
  // Deprecated v0.14 semantics: higher slop index = worse.
  // Kept as a backward-compat shim — new code should call
  // `colorForQuality(aiQuality)` instead.
  if (slopIndex >= SLOP_BADGE_RED_THRESHOLD) return 'red';
  if (slopIndex >= SLOP_BADGE_ORANGE_THRESHOLD) return 'orange';
  if (slopIndex >= SLOP_BADGE_YELLOW_THRESHOLD) return 'yellow';
  return 'green';
}

/** v0.15.0 U.4: color for a 0-100 aiQuality (or any of the four
 *  v3 scores — all share the "higher = better" convention).
 *  The thresholds are inverted vs the legacy v0.14 colorForSlop. */
export function colorForQuality(score: number): string {
  if (score >= SLOP_BADGE_RED_THRESHOLD) return 'green';
  if (score >= SLOP_BADGE_ORANGE_THRESHOLD) return 'yellow';
  if (score >= SLOP_BADGE_YELLOW_THRESHOLD) return 'orange';
  return 'red';
}

export function formatBadge(report: ProjectReport): string {
  const score = report.aiQuality ?? 0;
  const rounded = Math.round(score);
  // v0.15.0 U.4: badge reflects aiQuality (higher = better), so
  // the color uses the inverted colorForQuality logic. The badge
  // label is "repository-health" since the v0.15.0 composite
  // repositoryHealth is the v3 replacement for the v0.14
  // headline slopIndex.
  const color = colorForQuality(score);
  return `[![Repository Health](https://img.shields.io/badge/repository--health-${rounded}-${color})](https://github.com/usebrick/platform)`;
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