import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { POSITIVE_DIR, NEGATIVE_DIR } from '../corpus-paths';

// Round 16: Empirical precision/recall calibration.
//
// Scans the positive (AI-generated) and negative (real human) corpora and
// computes per-rule precision/recall/F1 against the ground-truth labels
// implied by the directory split.

export interface RuleCalibration {
  ruleId: string;
  category: string;
  severity: string;
  positiveFires: number;
  negativeFires: number;
  positiveFiles: number;
  negativeFiles: number;
  precision: number;
  recall: number;
  f1: number;
  signal: 'strong' | 'weak' | 'inverted' | 'dormant';
}

// (pct helper removed — duplicated the inline (r.precision * 100).toFixed pattern)

export interface CalibrationReport {
  generatedAt: string;
  positivePath: string;
  negativePath: string;
  positiveFileCount: number;
  negativeFileCount: number;
  rules: RuleCalibration[];
}

// v0.18.2 PR-1k: imported from src/corpus-paths.ts (single source
// of truth, env-overridable via SLOPBRICK_CORPUS_DIR).
const DEFAULT_POSITIVE = POSITIVE_DIR;
const DEFAULT_NEGATIVE = NEGATIVE_DIR;

function buildFileList(dir: string, extensions: string[]): string[] {
  // Round-16: write the file list directly to /tmp via find to avoid
  // overflowing the bash argv limit when there are thousands of paths.
  const tmpList = join('/tmp', `cal-build-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
  const expr = extensions.map((e) => `-name '*.${e}'`).join(' -o ');
  execFileSync('bash', ['-c', `find ${dir} -maxdepth 8 -type f \\( ${expr} \\) -print0 | xargs -0 realpath > ${tmpList}`]);
  const out = readFileSync(tmpList, 'utf8');
  execFileSync('rm', ['-f', tmpList]);
  return out.trim().split('\n').filter(Boolean);
}

function runScan(fileListPath: string): {
  fileCount: number;
  ruleFires: Map<string, number>;
  uniqueFilesPerRule: Map<string, number>;
} {
  const files = readFileSync(fileListPath, 'utf8').trim().split('\n').filter(Boolean);
  const CHUNK = 600;
  const ruleFires = new Map<string, number>();
  const uniqueFilesPerRule = new Map<string, Set<string>>();
  let fileCount = 0;
  const tmpOut = join('/tmp', `calibrate-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  for (let i = 0; i < files.length; i += CHUNK) {
    const chunk = files.slice(i, i + CHUNK);
    try {
      execFileSync(
        'node',
        [join(process.cwd(), 'bin', 'slopbrick.js'), 'scan', ...chunk, '--json', tmpOut, '--no-telemetry', '--quiet'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
    } catch {
      // non-zero exit is fine (threshold violation); JSON is still written
    }
    if (!existsSync(tmpOut)) continue;
    const report = JSON.parse(readFileSync(tmpOut, 'utf8')) as {
      fileCount: number;
      issues: Array<{ ruleId: string; filePath: string }>;
    };
    fileCount += report.fileCount;
    // Derive unique files per rule from the issues (each issue carries its
    // filePath). This gives us a per-rule file set, deduped.
    for (const issue of report.issues) {
      ruleFires.set(issue.ruleId, (ruleFires.get(issue.ruleId) ?? 0) + 1);
      if (!issue.filePath) continue;
      if (!uniqueFilesPerRule.has(issue.ruleId)) uniqueFilesPerRule.set(issue.ruleId, new Set());
      uniqueFilesPerRule.get(issue.ruleId)!.add(issue.filePath);
    }
    execFileSync('rm', ['-f', tmpOut]);
  }
  execFileSync('rm', ['-f', tmpOut]);
  const uniqueFilesMap = new Map<string, number>();
  for (const [ruleId, set] of uniqueFilesPerRule) {
    uniqueFilesMap.set(ruleId, set.size);
  }
  return { fileCount, ruleFires, uniqueFilesPerRule: uniqueFilesMap };
}

function classify(posFiles: number, negFiles: number): RuleCalibration['signal'] {
  if (posFiles === 0 && negFiles === 0) return 'dormant';
  const total = posFiles + negFiles;
  const precision = total > 0 ? posFiles / total : 0;
  if (precision < 0.5) return 'inverted';
  if (precision < 0.65) return 'weak';
  return 'strong';
}

export async function calibrate(
  cwd: string,
  options: {
    positiveDir?: string;
    negativeDir?: string;
    positiveList?: string;
    negativeList?: string;
    positiveLimit?: number;
    negativeLimit?: number;
  } = {},
): Promise<CalibrationReport> {
  const positiveDir = options.positiveDir ?? DEFAULT_POSITIVE;
  const negativeDir = options.negativeDir ?? DEFAULT_NEGATIVE;
  if (!options.positiveList && !existsSync(positiveDir)) {
    throw new Error(`Positive corpus not found: ${positiveDir}`);
  }
  if (!options.negativeList && !existsSync(negativeDir)) {
    throw new Error(`Negative corpus not found: ${negativeDir}`);
  }

  // v0.10.2 (Phase 3): pre-built filelist support. If --positive-list
  // is given, read paths from that file (one per line). Otherwise fall
  // back to the slow find via buildFileList. Comments (#) are stripped.
  const readList = (path: string): string[] =>
    readFileSync(path, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));

  const positiveFiles = options.positiveList
    ? readList(options.positiveList)
    : buildFileList(positiveDir, ['tsx','ts','jsx','js','kt','cs','rb','php','java','cpp','go','swift','rs','py']);
  const negativeFiles = options.negativeList
    ? readList(options.negativeList)
    : buildFileList(negativeDir, ['tsx','ts','jsx','js','kt','cs','rb','php','java','cpp','go','swift','rs','py']);
  const posSample = options.positiveLimit ? positiveFiles.slice(0, options.positiveLimit) : positiveFiles;
  const negSample = options.negativeLimit ? negativeFiles.slice(0, options.negativeLimit) : negativeFiles;

  const posListPath = join('/tmp', `cal-pos-${Date.now()}.txt`);
  const negListPath = join('/tmp', `cal-neg-${Date.now()}.txt`);
  writeFileSync(posListPath, posSample.join('\n'));
  writeFileSync(negListPath, negSample.join('\n'));

  // Load builtins to get severity/category for each rule.
  const builtins = (await import('../rules/builtins.js'));
  const builtinRules = (builtins as { builtinRules?: Array<{ id: string; category: string; severity: string }> }).builtinRules ?? [];
  const metaById = new Map<string, { category: string; severity: string }>();
  for (const r of builtinRules) {
    metaById.set(r.id, { category: r.category, severity: r.severity });
  }

  const posScan = runScan(posListPath);
  const negScan = runScan(negListPath);

  execFileSync('rm', ['-f', posListPath, negListPath]);

  const allRuleIds = new Set<string>([
    ...posScan.ruleFires.keys(),
    ...negScan.ruleFires.keys(),
    ...posScan.uniqueFilesPerRule.keys(),
    ...negScan.uniqueFilesPerRule.keys(),
  ]);
  const rules: RuleCalibration[] = [];
  for (const ruleId of allRuleIds) {
    const positiveFires = posScan.ruleFires.get(ruleId) ?? 0;
    const negativeFires = negScan.ruleFires.get(ruleId) ?? 0;
    const positiveFiles = posScan.uniqueFilesPerRule.get(ruleId) ?? 0;
    const negativeFiles = negScan.uniqueFilesPerRule.get(ruleId) ?? 0;
    const totalFiles = positiveFiles + negativeFiles;
    const precision = totalFiles > 0 ? positiveFiles / totalFiles : 0;
    const recall = posScan.fileCount > 0 ? positiveFiles / posScan.fileCount : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    const meta = metaById.get(ruleId) ?? { category: '?', severity: '?' };
    rules.push({
      ruleId,
      category: meta.category,
      severity: meta.severity,
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

  return {
    generatedAt: new Date().toISOString(),
    positivePath: positiveDir,
    negativePath: negativeDir,
    positiveFileCount: posScan.fileCount,
    negativeFileCount: negScan.fileCount,
    rules,
  };
}

export function reportToMarkdown(report: CalibrationReport): string {
  const lines: string[] = [];
  lines.push('# Empirical Calibration Report');
  lines.push('');
  lines.push('Generated: ' + report.generatedAt);
  lines.push('');
  lines.push('- Positive corpus (AI-generated): **' + report.positiveFileCount + '** files from `' + report.positivePath + '`');
  lines.push('- Negative corpus (real human): **' + report.negativeFileCount + '** files from `' + report.negativePath + '`');
  lines.push('');
  lines.push('`precision` = fires-on-positive / total-fires. Higher = fewer false positives.');
  lines.push('`recall` = fires-on-positive / positive-files. Higher = catches more AI slop.');
  lines.push('`f1` = harmonic mean of precision and recall.');
  lines.push('');
  lines.push('## Rule Ranking');
  lines.push('');
  lines.push('| Signal | Rule | Category | Severity | Precision | Recall | F1 | Pos fires | Neg fires |');
  lines.push('|--------|------|----------|----------|-----------|--------|----|-----------|-----------|');
  for (const r of report.rules) {
    const signalBadge: Record<RuleCalibration['signal'], string> = {
      strong: 'strong',
      weak: 'weak',
      inverted: 'INVERTED',
      dormant: 'dormant',
    };
    lines.push(
      '| ' + signalBadge[r.signal] + ' | `' + r.ruleId + '` | ' + r.category + ' | ' + r.severity +
      ' | ' + (r.precision * 100).toFixed(1) + '% | ' + (r.recall * 100).toFixed(1) + '% | ' +
      (r.f1 * 100).toFixed(1) + '% | ' + r.positiveFires + ' | ' + r.negativeFires + ' |',
    );
  }
  lines.push('');
  lines.push('## Recommendations');
  lines.push('');
  const inverted = report.rules.filter((r) => r.signal === 'inverted');
  const dormant = report.rules.filter((r) => r.signal === 'dormant');
  const weak = report.rules.filter((r) => r.signal === 'weak');
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
  return lines.join('\n');
}

export function writeCalibrationReport(report: CalibrationReport, cwd: string): string {
  const out = resolve(cwd, 'corpus', 'calibration-empirical.md');
  mkdirSync(resolve(cwd, 'corpus'), { recursive: true });
  writeFileSync(out, reportToMarkdown(report), 'utf8');
  return out;
}