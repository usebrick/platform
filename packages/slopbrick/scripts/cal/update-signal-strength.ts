#!/usr/bin/env node
// v0.10.2 (Phase 11): update signal-strength.json with v10.2 calibration
// data and re-evaluate the 35 DORMANT rules.
//
// Reads the markdown report produced by merge-chunk-results.ts
// (or the calibrate subcommand), extracts per-rule precision/recall/F1,
// and writes them as `_v10_2Precision` / `_v10_2Recall` / `_v10_2F1`
// fields in packages/slopbrick/src/rules/signal-strength.json.
//
// Also re-evaluates `defaultOff` and `verdict` per the plan's criteria:
//   - precision ≥ 65% AND lift ≥ 1.5× → enable by default
//     (verdict: USEFUL, defaultOff: false)
//   - precision < 50% AND negative-fires > 100 → keep DORMANT (inverted)
//   - precision 0 or fire count 0 → DORMANT
//
// Static imports only. No dynamic imports.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface RuleCalib {
  ruleId: string;
  positiveFires: number;
  negativeFires: number;
  positiveFiles: number;
  negativeFiles: number;
  precision: number;
  recall: number;
  f1: number;
  signal: 'strong' | 'weak' | 'inverted' | 'dormant';
}

interface SignalStrengthEntry {
  recall?: number;
  fpRate?: number;
  ratio?: number;
  precision?: number;
  lastCalibratedAt?: string;
  verdict?: string;
  aiSpecific?: boolean;
  defaultOff?: boolean;
  [key: string]: unknown;
}

type SignalStrength = Record<string, SignalStrengthEntry>;

function parseArgs(argv: string[]): { report: string; json: string; dryRun: boolean; enableThreshold: number } {
  let report = '/tmp/cal-results/v10.2-empirical.md';
  let json = join(process.cwd(), 'packages/slopbrick/src/rules/signal-strength.json');
  let dryRun = false;
  let enableThreshold = 65;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--report') report = argv[++i];
    else if (a === '--json') json = argv[++i];
    else if (a === '--dry-run') dryRun = true;
    else if (a === '--enable-precision-pct') enableThreshold = parseInt(argv[++i], 10);
    else if (a === '-h' || a === '--help') {
      process.stderr.write(
        'Usage: update-signal-strength.ts [--report MD] [--json SIGNAL_STRENGTH_JSON] [--dry-run] [--enable-precision-pct N]\n',
      );
      process.exit(0);
    }
  }
  return { report, json, dryRun, enableThreshold };
}

// Parse the markdown report. The merge script's output is regex-parseable:
// | Signal | Rule | Precision | Recall | F1 | Pos fires | Neg fires |
// (with or without the Category/Severity columns from the calibrate subcommand).
function parseMarkdownReport(md: string): RuleCalib[] {
  const rules: RuleCalib[] = [];
  for (const line of md.split('\n')) {
    // Match a row like: "| strong | `rule/id` | 75.0% | 12.3% | 21.1% | 100 | 50 |"
    // Or (calibrate subcommand): "| strong | `rule/id` | category | severity | 75.0% | 12.3% | 21.1% | 100 | 50 |"
    // The optional middle columns are `[^|]+` matches (0 to 3 of them).
    const m = line.match(/^\|\s*(\w+)\s*\|\s*`([^`]+)`\s*\|(?:\s*[^|]+\s*\|){0,3}\s*([0-9.]+)%\s*\|\s*([0-9.]+)%\s*\|\s*([0-9.]+)%\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/);
    if (!m) continue;
    const [, signal, ruleId, precStr, recStr, f1Str, posFires, negFires] = m;
    const precision = parseFloat(precStr) / 100;
    const recall = parseFloat(recStr) / 100;
    const f1 = parseFloat(f1Str) / 100;
    rules.push({
      ruleId,
      positiveFires: parseInt(posFires, 10),
      negativeFires: parseInt(negFires, 10),
      positiveFiles: 0,
      negativeFiles: 0,
      precision,
      recall,
      f1,
      signal: signal === 'INVERTED' ? 'inverted' : (signal as 'strong' | 'weak' | 'dormant'),
    });
  }
  return rules;
}

function decideVerdict(r: RuleCalib, enablePrecisionPct: number): { verdict: string; defaultOff: boolean; promoteToEnabled: boolean } {
  const precPct = r.precision * 100;
  // v10.2 plan criteria:
  //   precision ≥ 65% AND lift ≥ 1.5× → enable by default
  //   precision < 50% AND negative-fires > 100 → keep DORMANT (inverted)
  //   precision 0 or fire count 0 → DORMANT
  if (r.positiveFires === 0 && r.negativeFires === 0) {
    return { verdict: 'DORMANT', defaultOff: true, promoteToEnabled: false };
  }
  if (r.negativeFires > 100 && precPct < 50) {
    return { verdict: 'INVERTED', defaultOff: true, promoteToEnabled: false };
  }
  if (precPct >= enablePrecisionPct) {
    return { verdict: 'USEFUL', defaultOff: false, promoteToEnabled: true };
  }
  if (precPct >= 50) {
    return { verdict: 'WEAK', defaultOff: true, promoteToEnabled: false };
  }
  return { verdict: 'INVERTED', defaultOff: true, promoteToEnabled: false };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const report = readFileSync(args.report, 'utf8');
  const rules = parseMarkdownReport(report);
  if (rules.length === 0) {
    process.stderr.write(`No rules parsed from ${args.report}\n`);
    process.exit(2);
  }
  const ss: SignalStrength = JSON.parse(readFileSync(args.json, 'utf8')) as SignalStrength;
  const calTimestamp = new Date().toISOString();
  let promoted = 0;
  let demoted = 0;
  let untouched = 0;
  let missing = 0;
  for (const r of rules) {
    const entry = ss[r.ruleId];
    if (!entry) {
      missing++;
      continue;
    }
    const oldVerdict = entry.verdict;
    const oldDefaultOff = entry.defaultOff;
    const decision = decideVerdict(r, args.enableThreshold);
    entry._v10_2PositiveFires = r.positiveFires;
    entry._v10_2NegativeFires = r.negativeFires;
    entry._v10_2Precision = r.precision;
    entry._v10_2Recall = r.recall;
    entry._v10_2F1 = r.f1;
    entry._v10_2Signal = r.signal;
    entry.lastCalibratedAt = calTimestamp;
    if (decision.promoteToEnabled) {
      entry.defaultOff = false;
      entry.verdict = decision.verdict;
    } else if (decision.defaultOff) {
      entry.defaultOff = true;
      entry.verdict = decision.verdict;
    }
    if (oldVerdict !== entry.verdict || oldDefaultOff !== entry.defaultOff) {
      if (decision.promoteToEnabled && oldDefaultOff) promoted++;
      else if (!decision.promoteToEnabled && !oldDefaultOff) demoted++;
    } else {
      untouched++;
    }
  }
  if (args.dryRun) {
    process.stdout.write(`[dry-run] would update ${rules.length} rules in ${args.json}\n`);
    process.stdout.write(`[dry-run] promoted=${promoted} demoted=${demoted} untouched=${untouched} missing=${missing}\n`);
    return;
  }
  writeFileSync(args.json, JSON.stringify(ss, null, 2) + '\n', 'utf8');
  process.stdout.write(`Updated ${args.json}\n`);
  process.stdout.write(`  parsed: ${rules.length} rules\n`);
  process.stdout.write(`  promoted (DORMANT/defaultOff→USEFUL/enabled): ${promoted}\n`);
  process.stdout.write(`  demoted (USEFUL→INVERTED/DORMANT): ${demoted}\n`);
  process.stdout.write(`  verdict/defaultOff unchanged: ${untouched}\n`);
  process.stdout.write(`  rules in report but missing from signal-strength.json: ${missing}\n`);
}

main();
