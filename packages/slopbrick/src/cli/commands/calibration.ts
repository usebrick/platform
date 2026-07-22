/**
 * v0.37.0: `slopbrick calibration` — show historical v10.1 point estimates.
 *
 * Reads `src/rules/signal-strength.json` and prints a per-rule
 * summary of the historical v10.1 calibration: legacy verdict, precision,
 * recall, F1, and per-source fire counts.
 *
 * Filters:
 *   --top N          show only the top N rules by F1
 *   --signal STRONG  show only rules with a given v10.1 signal
 *   --min-precision  minimum precision to include (0-1)
 *   --no-color       disable ANSI colors
 *   --json           output as JSON
 *
 * Historical source: src/rules/signal-strength.json (each rule
 * entry has `_v10_1*` metrics plus frozen `_v10*` source metadata).
 */

import { Command } from 'commander';

import signalStrength from '../../rules/signal-strength.json';
import { colorEnabled } from '../render.js';

interface V101Stats {
  precision: number;
  recall: number;
  f1: number;
  posFires: number;
  negFires: number;
  posFiles: number;
  negFiles: number;
  signal: string;
  category: string;
  severity: string;
  source: string;
}

interface RuleEntry {
  verdict?: string;
  aiSpecific?: boolean;
  recall?: number;
  precision?: number;
  ratio?: number;
  fpRate?: number;
  _v10_1Precision?: number;
  _v10_1Recall?: number;
  _v10_1F1?: number;
  _v10_1Signal?: string;
  _v10_1PositiveFires?: number;
  _v10_1NegativeFires?: number;
  _v10PositiveFiles?: number;
  _v10NegativeFiles?: number;
  _v10Category?: string;
  _v10Severity?: string;
  _v10Source?: string;
}

// signal-strength.json is bundled by tsup into dist/index.cjs, so we
// import it directly. Works in both source (tsx) and built modes.

function loadData(): Record<string, RuleEntry> {
  return signalStrength as unknown as Record<string, RuleEntry>;
}

function hasV101(entry: RuleEntry): boolean {
  return entry._v10_1Signal !== undefined;
}

function color(s: string, code: string, enabled: boolean): string {
  if (!enabled) return s;
  return `\x1b[${code}m${s}\x1b[0m`;
}

function fmtPct(n: number): string {
  return (n * 100).toFixed(1) + '%';
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

function v101StatsOf(entry: RuleEntry): V101Stats {
  return {
    precision: entry._v10_1Precision ?? 0,
    recall: entry._v10_1Recall ?? 0,
    f1: entry._v10_1F1 ?? 0,
    posFires: entry._v10_1PositiveFires ?? 0,
    negFires: entry._v10_1NegativeFires ?? 0,
    posFiles: entry._v10PositiveFiles ?? 0,
    negFiles: entry._v10NegativeFiles ?? 0,
    signal: entry._v10_1Signal ?? 'dormant',
    category: entry._v10Category ?? '?',
    severity: entry._v10Severity ?? '?',
    source: entry._v10Source ?? '?',
  };
}

const SIGNAL_COLOR: Record<string, string> = {
  strong: '32',     // green
  weak: '33',       // yellow
  dormant: '90',    // gray
  inverted: '31',   // red
};

export function registerCalibration(program: Command): void {
  program
    .command('calibration')
    .description('Show historical v10.1 point estimates per rule (not current policy or authorship proof)')
    .option('--top <N>', 'show only the top N rules by F1', (v) => parseInt(v, 10))
    .option('--signal <signal>', 'filter by v10.1 signal (strong|weak|dormant|inverted)')
    .option('--min-precision <p>', 'minimum precision 0-1', (v) => parseFloat(v))
    .option('--no-color', 'disable ANSI colors')
    .option('--json', 'output as JSON')
    .action((opts: {
      top?: number;
      signal?: string;
      minPrecision?: number;
      color?: boolean;
      json?: boolean;
    }) => {
      const data = loadData();
      const entries = Object.entries(data).filter(([, e]) => hasV101(e));

      // Build rows
      const rows = entries.map(([ruleId, e]) => ({
        ruleId,
        ...v101StatsOf(e),
        verdict: e.verdict ?? '?',
        historicalVerdict: e.verdict ?? '?',
        aiSpecific: e.aiSpecific ?? false,
      }));

      // Filter
      let filtered = rows;
      if (opts.signal) filtered = filtered.filter((r) => r.signal === opts.signal);
      if (opts.minPrecision !== undefined) {
        filtered = filtered.filter((r) => r.precision >= (opts.minPrecision as number));
      }

      // Sort by F1 desc
      filtered.sort((a, b) => b.f1 - a.f1);

      // Cap
      if (opts.top) filtered = filtered.slice(0, opts.top);

      if (opts.json) {
        process.stdout.write(JSON.stringify({
          metricsStatus: 'historical-point-estimate-only',
          dataset: 'v10.1',
          source: filtered[0]?.source ?? '?',
          totalRules: rows.length,
          filteredRules: filtered.length,
          rules: filtered,
        }, null, 2) + '\n');
        return;
      }

      const useColor = colorEnabled();
      const green = (s: string) => color(s, '32', useColor);
      const yellow = (s: string) => color(s, '33', useColor);
      const cyan = (s: string) => color(s, '36', useColor);
      const bold = (s: string) => color(s, '1', useColor);

      // Header
      const sourceLine = filtered[0]?.source ?? '?';
      process.stdout.write('\n' + bold('slopbrick calibration report — historical v10.1 point estimates') + '\n');
      process.stdout.write('historical source: ' + cyan(sourceLine) + '\n');
      process.stdout.write(`rules: ${rows.length} with historical metrics, ${filtered.length} shown\n`);
      process.stdout.write('authority: not current quality policy and not authorship evidence\n\n');

      // Distribution
      const dist: Record<string, number> = {};
      for (const r of rows) dist[r.signal] = (dist[r.signal] ?? 0) + 1;
      process.stdout.write(bold('signal distribution:') + '\n');
      for (const sig of ['strong', 'weak', 'dormant', 'inverted']) {
        const n = dist[sig] ?? 0;
        const code = SIGNAL_COLOR[sig] ?? '0';
        const label = sig.padEnd(8);
        process.stdout.write(`  ${color(label, code, useColor)} ${n}\n`);
      }
      process.stdout.write('\n');

      // Table
      const header = [
        'rule'.padEnd(46),
        'signal'.padEnd(9),
        'prec'.padStart(7),
        'rec'.padStart(7),
        'F1'.padStart(7),
        'pos fires'.padStart(10),
        'neg fires'.padStart(10),
      ].join('  ');
      process.stdout.write(bold(header) + '\n');
      process.stdout.write('-'.repeat(header.length) + '\n');

      for (const r of filtered) {
        const code = SIGNAL_COLOR[r.signal] ?? '0';
        const sigCell = color(r.signal.padEnd(9), code, useColor);
        const precCell = r.precision >= 0.7 ? green(fmtPct(r.precision).padStart(7))
          : r.precision >= 0.5 ? yellow(fmtPct(r.precision).padStart(7))
          : fmtPct(r.precision).padStart(7);
        const line = [
          r.ruleId.padEnd(46),
          sigCell,
          precCell,
          fmtPct(r.recall).padStart(7),
          (r.f1 * 100).toFixed(1).padStart(7),
          fmtNum(r.posFires).padStart(10),
          fmtNum(r.negFires).padStart(10),
        ].join('  ');
        process.stdout.write(line + '\n');
      }
      process.stdout.write('\n');
    });
}
