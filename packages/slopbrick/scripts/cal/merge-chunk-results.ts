#!/usr/bin/env node
// v0.10.2 (Phase 9): merge per-chunk JSON outputs from
// scan-parallel.sh into the same CalibrationReport that the
// `slopbrick calibrate` subcommand writes.
//
// Reads per-chunk JSON files from <output-dir>/{pos,neg}/chunk-*.json
// and computes per-rule precision/recall/F1 across both polarities.
// Output: a markdown report matching the format produced by
// reportToMarkdown() in src/research/calibrator.ts.
//
// Why this exists: the calibrator's in-process runScan() loop hangs
// after the first chunk when scanning 100k+ files. The parallel
// xargs scan is the workaround; this script is the equivalent of
// the post-scan aggregation that would normally run inside calibrate.

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

interface IssueLite {
  ruleId: string;
  filePath: string;
}

interface ChunkReport {
  fileCount: number;
  issues: IssueLite[];
  _calError?: boolean;
  _calExitCode?: number;
  _firstFile?: string;
}

interface RuleAgg {
  ruleId: string;
  positiveFires: number;
  negativeFires: number;
  positiveFiles: Set<string>;
  negativeFiles: Set<string>;
}

interface CalibOutput {
  generatedAt: string;
  positivePath: string;
  negativePath: string;
  positiveFileCount: number;
  negativeFileCount: number;
  rules: Array<{
    ruleId: string;
    positiveFires: number;
    negativeFires: number;
    positiveFiles: number;
    negativeFiles: number;
    precision: number;
    recall: number;
    f1: number;
    signal: 'strong' | 'weak' | 'inverted' | 'dormant';
  }>;
  skippedChunks: Array<{
    polarity: 'positive' | 'negative';
    index: number;
    firstFile: string;
    reason: 'timeout' | 'error';
  }>;
  chunkTimeoutMs: number;
}

function parseArgs(argv: string[]): { outputDir: string; chunkTimeoutMs: number; posList: string; negList: string; markdownOut: string } {
  let outputDir = '/tmp/cal-chunks';
  let chunkTimeoutMs = 90_000;
  let posList = '';
  let negList = '';
  let markdownOut = '';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--output-dir') outputDir = argv[++i];
    else if (a === '--chunk-timeout-ms') chunkTimeoutMs = parseInt(argv[++i], 10);
    else if (a === '--positive-list') posList = argv[++i];
    else if (a === '--negative-list') negList = argv[++i];
    else if (a === '--markdown-out') markdownOut = argv[++i];
    else if (a === '-h' || a === '--help') {
      process.stderr.write(
        'Usage: merge-chunk-results.ts --output-dir DIR [--positive-list FILE] [--negative-list FILE] [--markdown-out FILE]\n',
      );
      process.exit(0);
    }
  }
  if (!markdownOut) markdownOut = join(outputDir, 'calibration-empirical.md');
  return { outputDir, chunkTimeoutMs, posList, negList, markdownOut };
}

export function loadChunks(dir: string, polarity: 'positive' | 'negative'): { rules: Map<string, RuleAgg>; fileCount: number; skipped: CalibOutput['skippedChunks'] } {
  const rules = new Map<string, RuleAgg>();
  let fileCount = 0;
  const skipped: CalibOutput['skippedChunks'] = [];
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json') && f.startsWith('chunk-')).sort();
  } catch {
    return { rules, fileCount, skipped };
  }
  for (const f of files) {
    const index = parseInt(f.replace(/^chunk-/, '').replace(/\.json$/, ''), 10);
    let report: unknown;
    try {
      report = JSON.parse(readFileSync(join(dir, f), 'utf8')) as unknown;
    } catch {
      // A corrupt or truncated chunk is a failed chunk, not an absent one.
      // Omitting it silently biases the denominator and makes an incomplete
      // calibration look complete in the merged report.
      skipped.push({
        polarity,
        index: Number.isFinite(index) ? index : 0,
        firstFile: '',
        reason: 'error',
      });
      continue;
    }

    const metadata = report !== null && typeof report === 'object' ? report as Record<string, unknown> : {};
    const firstFile = typeof metadata._firstFile === 'string' ? metadata._firstFile : '';
    if (metadata._calError === true) {
      skipped.push({
        polarity,
        index: Number.isFinite(index) ? index : 0,
        firstFile,
        reason: metadata._calExitCode === 124 ? 'timeout' : 'error',
      });
      continue;
    }

    const issues = metadata.issues;
    const validReport = Number.isFinite(metadata.fileCount) &&
      typeof metadata.fileCount === 'number' && metadata.fileCount >= 0 &&
      Array.isArray(issues) && issues.every((issue) => {
        if (issue === null || typeof issue !== 'object') return false;
        const candidate = issue as Record<string, unknown>;
        return typeof candidate.ruleId === 'string' &&
          (candidate.filePath === undefined || typeof candidate.filePath === 'string');
      });
    if (!validReport) {
      skipped.push({
        polarity,
        index: Number.isFinite(index) ? index : 0,
        firstFile,
        reason: 'error',
      });
      continue;
    }
    report = metadata as unknown as ChunkReport;
    fileCount += report.fileCount;
    for (const issue of report.issues) {
      let agg = rules.get(issue.ruleId);
      if (!agg) {
        agg = { ruleId: issue.ruleId, positiveFires: 0, negativeFires: 0, positiveFiles: new Set(), negativeFiles: new Set() };
        rules.set(issue.ruleId, agg);
      }
      if (polarity === 'positive') {
        agg.positiveFires++;
        if (issue.filePath) agg.positiveFiles.add(issue.filePath);
      } else {
        agg.negativeFires++;
        if (issue.filePath) agg.negativeFiles.add(issue.filePath);
      }
    }
  }
  return { rules, fileCount, skipped };
}

function classify(posFiles: number, negFiles: number): 'strong' | 'weak' | 'inverted' | 'dormant' {
  if (posFiles === 0 && negFiles === 0) return 'dormant';
  const total = posFiles + negFiles;
  const precision = total > 0 ? posFiles / total : 0;
  if (precision < 0.5) return 'inverted';
  if (precision < 0.65) return 'weak';
  return 'strong';
}

function toMarkdown(out: CalibOutput): string {
  const lines: string[] = [];
  lines.push('# Empirical Calibration Report');
  lines.push('');
  lines.push('Generated: ' + out.generatedAt);
  lines.push('');
  lines.push('- Positive corpus (AI-generated): **' + out.positiveFileCount + '** files from `' + out.positivePath + '`');
  lines.push('- Negative corpus (real human): **' + out.negativeFileCount + '** files from `' + out.negativePath + '`');
  lines.push('- Per-chunk scan timeout: **' + Math.round(out.chunkTimeoutMs / 1000) + 's**');
  if (out.skippedChunks.length > 0) {
    lines.push('- **Skipped chunks: ' + out.skippedChunks.length + '** (see [Skipped Chunks](#skipped-chunks) below)');
  }
  lines.push('');
  lines.push('`precision` = fires-on-positive / total-fires. Higher = fewer false positives.');
  lines.push('`recall` = fires-on-positive / positive-files. Higher = catches more AI slop.');
  lines.push('`f1` = harmonic mean of precision and recall.');
  lines.push('');
  lines.push('## Rule Ranking');
  lines.push('');
  lines.push('| Signal | Rule | Precision | Recall | F1 | Pos fires | Neg fires |');
  lines.push('|--------|------|-----------|--------|----|-----------|-----------|');
  for (const r of out.rules) {
    const sig = r.signal === 'inverted' ? 'INVERTED' : r.signal;
    lines.push(
      '| ' + sig + ' | `' + r.ruleId + '` | ' +
        (r.precision * 100).toFixed(1) + '% | ' +
        (r.recall * 100).toFixed(1) + '% | ' +
        (r.f1 * 100).toFixed(1) + '% | ' +
        r.positiveFires + ' | ' + r.negativeFires + ' |',
    );
  }
  lines.push('');
  const inverted = out.rules.filter((r) => r.signal === 'inverted');
  const dormant = out.rules.filter((r) => r.signal === 'dormant');
  const weak = out.rules.filter((r) => r.signal === 'weak');
  lines.push('## Recommendations');
  lines.push('');
  if (inverted.length > 0) {
    lines.push('**Inverted (' + inverted.length + '):** fires MORE on human code than AI. Drop, scope-exempt, or tighten:');
    for (const r of inverted) lines.push('- `' + r.ruleId + '` (precision ' + (r.precision * 100).toFixed(0) + ')');
    lines.push('');
  }
  if (dormant.length > 0) {
    lines.push('**Dormant (' + dormant.length + '):** never fires. Consider dropping:');
    for (const r of dormant) lines.push('- `' + r.ruleId + '`');
    lines.push('');
  }
  if (weak.length > 0) {
    lines.push('**Weak (' + weak.length + '):** fires on human code as often as AI. Consider tightening or removing `aiSpecific: true`:');
    for (const r of weak) lines.push('- `' + r.ruleId + '` (precision ' + (r.precision * 100).toFixed(0) + ')');
    lines.push('');
  }
  if (out.skippedChunks.length > 0) {
    lines.push('## Skipped Chunks');
    lines.push('');
    lines.push('These chunks failed to scan within the per-chunk timeout or produced no JSON output. Their files are NOT included in the per-rule counts above.');
    lines.push('');
    lines.push('| Polarity | Chunk # | Reason |');
    lines.push('|----------|---------|--------|');
    for (const s of out.skippedChunks) {
      lines.push('| ' + s.polarity + ' | ' + s.index + ' | ' + s.reason + ' |');
    }
    lines.push('');
  }
  return lines.join('\n');
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const posResult = loadChunks(join(args.outputDir, 'pos'), 'positive');
  const negResult = loadChunks(join(args.outputDir, 'neg'), 'negative');
  const allRuleIds = new Set<string>([...posResult.rules.keys(), ...negResult.rules.keys()]);
  const rules: CalibOutput['rules'] = [];
  for (const ruleId of allRuleIds) {
    const pos = posResult.rules.get(ruleId);
    const neg = negResult.rules.get(ruleId);
    const positiveFires = pos?.positiveFires ?? 0;
    const negativeFires = neg?.negativeFires ?? 0;
    const positiveFiles = pos?.positiveFiles.size ?? 0;
    const negativeFiles = neg?.negativeFiles.size ?? 0;
    const totalFiles = positiveFiles + negativeFiles;
    const precision = totalFiles > 0 ? positiveFiles / totalFiles : 0;
    const recall = posResult.fileCount > 0 ? positiveFiles / posResult.fileCount : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    rules.push({
      ruleId,
      positiveFires,
      negativeFires,
      positiveFiles,
      negativeFiles,
      precision,
      recall,
      f1,
      signal: classify(positiveFiles, negativeFiles),
    });
  }
  rules.sort((a, b) => b.f1 - a.f1 || b.precision - a.precision);
  const out: CalibOutput = {
    generatedAt: new Date().toISOString(),
    positivePath: args.posList || join(args.outputDir, 'pos'),
    negativePath: args.negList || join(args.outputDir, 'neg'),
    positiveFileCount: posResult.fileCount,
    negativeFileCount: negResult.fileCount,
    rules,
    skippedChunks: [...posResult.skipped, ...negResult.skipped],
    chunkTimeoutMs: args.chunkTimeoutMs,
  };
  mkdirSync(resolve(args.markdownOut, '..'), { recursive: true });
  writeFileSync(args.markdownOut, toMarkdown(out), 'utf8');
  process.stdout.write(
    'Wrote ' + args.markdownOut + ' (' + rules.length + ' rules; ' +
      out.skippedChunks.length + ' skipped chunks)\n',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
