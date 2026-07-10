// Output rendering primitives used by the CLI commands.
//
// These helpers are deliberately small and side-effect free where
// possible (the exceptions are renderProgress / clearProgress, which
// write to stdout directly to drive the in-place scan progress bar).

import chalk from 'chalk';
import type { ProjectReport } from '../types';

// v0.17.1: colorEnabled() respects --no-color flag and the NO_COLOR
// env var per https://no-color.org. Defaults to true when stdout
// is a TTY, false when piped. The flag/env always win.
let _noColorOverride: boolean | null = null;
// Chalk resolves its supported level once at module load. Keep that level so a
// prior `--no-color` invocation cannot permanently downgrade later scans in
// the same process.
const detectedChalkLevel = chalk.level;
export function setNoColor(value: boolean): void {
  _noColorOverride = value;
}
/** Clear a previous invocation's explicit color override. */
export function resetNoColor(): void {
  _noColorOverride = null;
}
export function colorEnabled(): boolean {
  if (_noColorOverride !== null) return !_noColorOverride;
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '') {
    return false; // NO_COLOR set (any value, including "0", disables)
  }
  if (process.env.FORCE_COLOR !== undefined) return true;
  return Boolean(process.stdout.isTTY);
}

/**
 * Apply one colour policy to every Chalk-based renderer in this process.
 *
 * Commander parses global options after the program starts, while some
 * subcommands render without calling runScan. Calling this at CLI startup and
 * again at scan entry keeps `--no-color`, NO_COLOR, and FORCE_COLOR truthful
 * for both paths and resets policy between library invocations.
 */
export function configureColorPolicy(noColor = false): void {
  resetNoColor();
  if (noColor) setNoColor(true);
  if (!colorEnabled()) {
    chalk.level = 0;
    return;
  }
  // FORCE_COLOR intentionally enables basic ANSI even when the captured
  // terminal capability was zero (for example, redirected subprocess tests).
  chalk.level = (process.env.FORCE_COLOR !== undefined
    ? Math.max(1, detectedChalkLevel)
    : detectedChalkLevel) as typeof chalk.level;
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

// v0.21.0: aiSlopScore is the RAW amount of slop (0=clean, 100=saturated).
// The badge color uses the legacy v0.14 colorForSlop logic
// (higher = worse → red) which now applies naturally — no
// inversion needed. The badge label switches from
// "repository-health" (v0.15–v0.20.1) back to the v0.14 framing:
// the slop score is the headline, and the repositoryHealth
// composite is the secondary view.
//
// The SLOP_BADGE_* threshold constants retain their v0.14 numeric
// boundaries (76/51/26) for backward compat with any pinned
// thresholds. The semantic meaning of `colorForSlop` is unchanged
// from v0.14: high score → red, low score → green.
export const SLOP_BADGE_RED_THRESHOLD = 76;
export const SLOP_BADGE_ORANGE_THRESHOLD = 51;
export const SLOP_BADGE_YELLOW_THRESHOLD = 26;

// v0.21.0: colorForSlop is now the active function (was deprecated
// in v0.15–v0.20.1). aiSlopScore is the raw amount of slop, so
// the v0.14 color mapping applies directly.
export function colorForSlop(slopIndex: number): string {
  if (slopIndex >= SLOP_BADGE_RED_THRESHOLD) return 'red';
  if (slopIndex >= SLOP_BADGE_ORANGE_THRESHOLD) return 'orange';
  if (slopIndex >= SLOP_BADGE_YELLOW_THRESHOLD) return 'yellow';
  return 'green';
}

/**
 * v0.21.0: colorForQuality is kept for the three "higher = better"
 * scores (engineeringHygiene, security, repositoryHealth). For
 * the AI Slop Score (now raw amount, higher = worse) use
 * `colorForSlop(aiSlopScore)` instead.
 */
export function colorForQuality(score: number): string {
  if (score >= SLOP_BADGE_RED_THRESHOLD) return 'green';
  if (score >= SLOP_BADGE_ORANGE_THRESHOLD) return 'yellow';
  if (score >= SLOP_BADGE_YELLOW_THRESHOLD) return 'orange';
  return 'red';
}

export function formatBadge(report: ProjectReport): string {
  const score = report.aiSlopScore ?? 0;
  const rounded = Math.round(score);
  // v0.21.0: aiSlopScore is raw amount of slop. Use colorForSlop
  // (v0.14 logic) — high score → red, low score → green. The
  // badge label reverts to "ai-slop" matching the v0.14 framing.
  const color = colorForSlop(score);
  return `[![AI Slop](https://img.shields.io/badge/ai--slop-${rounded}-${color})](https://github.com/usebrick/platform)`;
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

/**
 * v0.43.0: pretty-print the built-in rules list, grouped by category,
 * with wrapped descriptions. Shared between `slopbrick rules` and
 * `slopbrick explain` (no ruleId) so the two surfaces stay in sync.
 */
export function formatRulesList(
  rules: ReadonlyArray<{
    id: string;
    category: string;
    severity: string;
    aiSpecific: boolean;
    description?: string;
  }>,
  totalCount?: number,
): string {
  type Rule = (typeof rules)[number];
  const byCategory = new Map<string, Rule[]>();
  for (const r of rules) {
    let bucket = byCategory.get(r.category);
    if (!bucket) {
      bucket = [];
      byCategory.set(r.category, bucket);
    }
    bucket.push(r);
  }
  const lines: string[] = [];
  const shown = rules.length;
  const total = totalCount ?? shown;
  lines.push(`slopbrick rules — ${shown} of ${total} shown\n`);
  for (const [cat, list] of [...byCategory.entries()].sort()) {
    lines.push(`\n## ${cat} (${list.length})`);
    for (const r of list.sort((a, b) => a.id.localeCompare(b.id))) {
      const sev = r.severity.padEnd(8);
      const tag = r.aiSpecific ? '[AI]' : '     ';
      lines.push(`  ${sev} ${tag} ${r.id}`);
      if (r.description) {
        const cols = process.stdout.isTTY ? (process.stdout.columns ?? 100) : 100;
        const indent = '           '; // 11 spaces, matches old layout
        // Keep a useful floor without forcing every description past a narrow
        // terminal's edge. Long individual words may still overflow, but
        // ordinary prose wraps inside a 20-column terminal.
        const maxWidth = Math.max(8, cols - indent.length - 1);
        const words = r.description.split(' ');
        let line = '';
        for (const word of words) {
          if (line === '') {
            line = word;
          } else if ((line + ' ' + word).length > maxWidth) {
            lines.push(indent + line);
            line = word;
          } else {
            line = line + ' ' + word;
          }
        }
        if (line) lines.push(indent + line);
      }
    }
  }
  return lines.join('\n');
}
