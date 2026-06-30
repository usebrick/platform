// Output rendering primitives used by the CLI commands.
//
// These helpers are deliberately small and side-effect free where
// possible (the exceptions are renderProgress / clearProgress, which
// write to stdout directly to drive the in-place scan progress bar).

import type { ProjectReport } from '../types';
import chalk from 'chalk';

// v0.17.1: colorEnabled() respects --no-color flag and the NO_COLOR
// env var per https://no-color.org. Defaults to true when stdout
// is a TTY, false when piped. The flag/env always win.
let _noColorOverride: boolean | null = null;
export function setNoColor(value: boolean): void {
  _noColorOverride = value;
}
export function colorEnabled(): boolean {
  if (_noColorOverride !== null) return !_noColorOverride;
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '') {
    return false; // NO_COLOR set (any value, including "0", disables)
  }
  if (process.env.FORCE_COLOR !== undefined) return true;
  return Boolean(process.stdout.isTTY);
}

// v0.17.1: redactSecrets() masks anything that looks like a secret
// in user-facing output. Covers the common cases the security/secret-leak
// rule family already detects. Used by pretty.ts when rendering
// issue messages / advice that may contain inline credentials.
const SECRET_PATTERNS: RegExp[] = [
  // AWS
  /\b(AKIA[0-9A-Z]{16})\b/g,
  // GitHub PAT
  /\b(ghp_[A-Za-z0-9]{36,})\b/g,
  /\b(github_pat_[A-Za-z0-9_]{82})\b/g,
  // Slack
  /\b(xox[abpr]-[A-Za-z0-9-]{10,})\b/g,
  // Stripe
  /\b(sk_live_[A-Za-z0-9]{24,})\b/g,
  /\b(pk_live_[A-Za-z0-9]{24,})\b/g,
  // Google API key
  /\b(AIza[0-9A-Za-z_-]{35})\b/g,
  // Generic JWT
  /\b(eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g,
  // PEM private key
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
];
const REDACTED = '[REDACTED]';
export function redactSecrets(text: string): string {
  if (!text) return text;
  let out = text;
  for (const pat of SECRET_PATTERNS) {
    out = out.replace(pat, REDACTED);
  }
  return out;
}

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

// v0.17.1: renderProgress now draws a real progress bar (not just
// a spinner). Format:
//   [████████████░░░░░░░░░░] 1234/8358 files (14.7%) | 8.3s | ETA 48s
// Skips the bar (prints plain text) when stdout is not a TTY
// (e.g. CI / pipes) or when --no-color is set and we want to avoid
// carriage returns.
export function renderProgress(
  completed: number,
  total: number,
  startMs: number = Date.now(),
): void {
  const safeTotal = total > 0 ? total : 1;
  const ratio = Math.min(1, completed / safeTotal);
  const pct = (ratio * 100).toFixed(1);
  const barWidth = 20;
  const filled = Math.round(barWidth * ratio);
  const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
  let eta = '';
  if (completed > 0 && ratio < 1) {
    const totalMs = Date.now() - startMs;
    const etaMs = (totalMs / completed) * (total - completed);
    eta = ` | ETA ${(etaMs / 1000).toFixed(0)}s`;
  }
  const line = `\r[${bar}] ${completed}/${total} files (${pct}%) | ${elapsedSec}s${eta}   `;
  if (process.stdout.isTTY) {
    process.stdout.write(line);
  } else {
    // Non-TTY: print one line per update (no carriage return). Skip
    // updates that come faster than every 2% to avoid spam.
    const lastPct = (renderProgress as { _lastPct?: number })._lastPct ?? -1;
    if (Math.abs(parseFloat(pct) - lastPct) >= 2) {
      process.stdout.write(`[${bar}] ${completed}/${total} files (${pct}%) | ${elapsedSec}s${eta}\n`);
      (renderProgress as { _lastPct?: number })._lastPct = parseFloat(pct);
    }
  }
}

export function clearProgress(): void {
  if (process.stdout.isTTY) {
    process.stdout.write(`\r${' '.repeat(80)}\r`);
  }
}