/**
 * v0.36.1: Full-corpus calibration — extends the existing
 * src/research/calibrator.ts to scan ALL file types in
 * /Users/cheng/corpus-expansion, not just TS/TSX/JSX/JS.
 *
 * Samples 5k positive + 5k negative files (spread across
 * extensions) for statistical power without runtime blowup.
 *
 * Output: tests/fixtures/v10-corpus/full-corpus-calibration.json
 *   { ruleId, category, severity, positiveFires, negativeFires,
 *     positiveFiles, negativeFiles, precision, recall, f1, signal }
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const CORPUS_ROOT = '/Users/cheng/corpus-expansion';
const POSITIVE_DIR = join(CORPUS_ROOT, 'positive');
const NEGATIVE_DIR = join(CORPUS_ROOT, 'negative');
const BIN = join(import.meta.dirname, '..', '..', '..', 'bin', 'slopbrick.js');
const SAMPLE_SIZE = 0; // 0 = ALL files, no sample
const CHUNK = 600; // files per CLI invocation
const OUT_FILE = join(import.meta.dirname, 'full-corpus-calibration.json');

// All extensions we care about (matches the 140 rules across all languages)
const ALL_EXTS = [
  'tsx', 'ts', 'jsx', 'js', 'mjs', 'cjs',
  'java', 'kt', 'kts',
  'swift',
  'cpp', 'cc', 'cxx', 'c', 'h', 'hpp',
  'py', 'go', 'rs', 'cs',
];

function buildFileList(dir: string, exts: string[]): string[] {
  const tmpList = `/tmp/full-corpus-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
  const expr = exts.map((e) => `-name '*.${e}'`).join(' -o ');
  execFileSync('bash', ['-c', `find ${dir} -maxdepth 10 -type f \\( ${expr} \\) -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/build/*' -print0 | xargs -0 realpath > ${tmpList}`]);
  const out = readFileSync(tmpList, 'utf8');
  execFileSync('rm', ['-f', tmpList]);
  return out.trim().split('\n').filter(Boolean);
}

function sampleByExtension(files: string[], n: number): string[] {
  // Spread sample across extensions
  const byExt = new Map<string, string[]>();
  for (const f of files) {
    const m = f.match(/\.([a-z]+)$/);
    if (!m) continue;
    const ext = m[1];
    if (!byExt.has(ext)) byExt.set(ext, []);
    byExt.get(ext)!.push(f);
  }
  const totalFiles = files.length;
  const sample: string[] = [];
  for (const [ext, list] of byExt.entries()) {
    const proportion = list.length / totalFiles;
    const take = Math.max(1, Math.round(n * proportion));
    // Randomize
    const shuffled = [...list].sort(() => Math.random() - 0.5);
    sample.push(...shuffled.slice(0, Math.min(take, shuffled.length)));
  }
  // If we under-sampled, fill up
  while (sample.length < n && sample.length < totalFiles) {
    const remaining = files.filter((f) => !sample.includes(f));
    if (remaining.length === 0) break;
    sample.push(remaining[Math.floor(Math.random() * remaining.length)]);
  }
  return sample.slice(0, n);
}

interface ScanResult {
  fileCount: number;
  ruleFires: Map<string, number>;
  uniqueFilesPerRule: Map<string, Set<string>>;
}

function runScan(files: string[]): Promise<ScanResult> {
  return new Promise((resolve) => {
    const ruleFires = new Map<string, number>();
    const uniqueFilesPerRule = new Map<string, Set<string>>();
    let fileCount = 0;
    let chunksProcessed = 0;
    let chunksFailed = 0;
    const t0 = Date.now();

    const processChunk = async (start: number) => {
      if (start >= files.length) {
        const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
        console.log(`    ${chunksProcessed} chunks processed, ${chunksFailed} failed, ${elapsed}s elapsed`);
        resolve({ fileCount, ruleFires, uniqueFilesPerRule });
        return;
      }
      const chunk = files.slice(start, start + CHUNK);
      const tmpOut = `/tmp/full-corpus-scan-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
      const proc = spawn('node', [
        BIN, 'scan', ...chunk,
        '--json', tmpOut,
        '--no-telemetry', '--quiet',
        '--include', '**/*.{ts,tsx,js,jsx,mjs,cjs,java,kt,kts,swift,cpp,cc,cxx,c,h,hpp,py,go,rs,cs}',
      ], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderrBuf = '';
      proc.stderr.on('data', (d) => { stderrBuf += d.toString(); });
      proc.on('close', (code) => {
        chunksProcessed++;
        if (existsSync(tmpOut)) {
          try {
            const report = JSON.parse(readFileSync(tmpOut, 'utf8'));
            fileCount += report.fileCount ?? 0;
            for (const issue of (report.issues ?? [])) {
              if (!issue.ruleId) continue;
              ruleFires.set(issue.ruleId, (ruleFires.get(issue.ruleId) ?? 0) + 1);
              if (!issue.filePath) continue;
              if (!uniqueFilesPerRule.has(issue.ruleId)) {
                uniqueFilesPerRule.set(issue.ruleId, new Set());
              }
              uniqueFilesPerRule.get(issue.ruleId)!.add(issue.filePath);
            }
          } catch {}
          try { execFileSync('rm', ['-f', tmpOut]); } catch {}
        } else {
          chunksFailed++;
          if (chunksFailed <= 3) {
            console.log(`    chunk ${chunksProcessed} failed (exit ${code}): ${stderrBuf.slice(0, 200)}`);
          }
        }
        if (chunksProcessed % 10 === 0) {
          const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
          console.log(`    ${chunksProcessed}/${Math.ceil(files.length / CHUNK)} chunks, ${fileCount} files, ${elapsed}s`);
        }
        processChunk(start + CHUNK);
      });
    };
    processChunk(0);
  });
}

function classify(posF: number, negF: number): string {
  if (posF === 0 && negF === 0) return 'dormant';
  if (posF < 5 && negF < 5) return 'dormant';
  const total = posF + negF;
  const precision = posF / total;
  if (precision >= 0.7) return 'strong';
  if (precision >= 0.5) return 'weak';
  if (precision <= 0.3) return 'inverted';
  return 'weak';
}

async function main() {
  console.log('Building positive file list...');
  const posFiles = buildFileList(POSITIVE_DIR, ALL_EXTS);
  console.log(`  ${posFiles.length} positive files`);
  console.log('Building negative file list...');
  const negFiles = buildFileList(NEGATIVE_DIR, ALL_EXTS);
  console.log(`  ${negFiles.length} negative files`);

  console.log(`Sampling: ${SAMPLE_SIZE === 0 ? 'ALL FILES' : SAMPLE_SIZE + ' per class'} (spread by extension)...`);
  const posSample = SAMPLE_SIZE === 0 ? posFiles : sampleByExtension(posFiles, SAMPLE_SIZE);
  const negSample = SAMPLE_SIZE === 0 ? negFiles : sampleByExtension(negFiles, SAMPLE_SIZE);
  console.log(`  pos: ${posSample.length}, neg: ${negSample.length}`);

  console.log('Scanning positive sample...');
  const t0 = Date.now();
  const posScan = await runScan(posSample);
  console.log(`  ${posScan.fileCount} files in ${((Date.now() - t0) / 1000).toFixed(0)}s — ${posScan.ruleFires.size} rules fired`);

  console.log('Scanning negative sample...');
  const t1 = Date.now();
  const negScan = await runScan(negSample);
  console.log(`  ${negScan.fileCount} files in ${((Date.now() - t1) / 1000).toFixed(0)}s — ${negScan.ruleFires.size} rules fired`);

  // Load builtins for rule metadata
  const builtins = await import('../../../src/rules/builtins.js');
  const builtinRules = (builtins as any).builtinRules ?? [];
  const metaById = new Map<string, { category: string; severity: string }>();
  for (const r of builtinRules) {
    metaById.set(r.id, { category: r.category, severity: r.severity });
  }

  // Compute per-rule metrics — include ALL 140 builtin rules
  // (even ones that never fire — they're DORMANT, which is a valid finding)
  const allRuleIds = new Set<string>(
    builtinRules.map((r: any) => r.id).filter(Boolean)
  );
  for (const id of posScan.ruleFires.keys()) allRuleIds.add(id);
  for (const id of negScan.ruleFires.keys()) allRuleIds.add(id);
  for (const id of posScan.uniqueFilesPerRule.keys()) allRuleIds.add(id);
  for (const id of negScan.uniqueFilesPerRule.keys()) allRuleIds.add(id);
  const rules: any[] = [];
  for (const ruleId of allRuleIds) {
    const positiveFires = posScan.ruleFires.get(ruleId) ?? 0;
    const negativeFires = negScan.ruleFires.get(ruleId) ?? 0;
    const positiveFiles = posScan.uniqueFilesPerRule.get(ruleId)?.size ?? 0;
    const negativeFiles = negScan.uniqueFilesPerRule.get(ruleId)?.size ?? 0;
    const totalFiles = positiveFiles + negativeFiles;
    const precision = totalFiles > 0 ? positiveFiles / totalFiles : 0;
    const recall = posScan.fileCount > 0 ? positiveFiles / posScan.fileCount : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    const meta = metaById.get(ruleId) ?? { category: '?', severity: '?' };
    rules.push({
      ruleId, category: meta.category, severity: meta.severity,
      positiveFires, negativeFires, positiveFiles, negativeFiles,
      precision: Number(precision.toFixed(5)),
      recall: Number(recall.toFixed(5)),
      f1: Number(f1.toFixed(5)),
      signal: classify(positiveFiles, negativeFiles),
    });
  }
  rules.sort((a, b) => b.f1 - a.f1 || b.precision - a.precision);

  const report = {
    generatedAt: new Date().toISOString(),
    positivePath: POSITIVE_DIR,
    negativePath: NEGATIVE_DIR,
    positiveFileCount: posScan.fileCount,
    negativeFileCount: negScan.fileCount,
    positiveSampleSize: posSample.length,
    negativeSampleSize: negSample.length,
    rules,
  };

  mkdirSync(import.meta.dirname, { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${OUT_FILE}`);
  console.log(`  ${rules.length} rules with data`);

  // Summary
  const sigCounts: Record<string, number> = {};
  for (const r of rules) sigCounts[r.signal] = (sigCounts[r.signal] ?? 0) + 1;
  console.log('\nSignal distribution:');
  for (const [sig, n] of Object.entries(sigCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${sig.padEnd(12)} ${n}`);
  }

  // Top 20
  console.log('\nTop 20 rules by F1:');
  for (const r of rules.slice(0, 20)) {
    console.log(`  ${r.ruleId.padEnd(50)} prec=${(r.precision * 100).toFixed(1).padStart(5)}% rec=${(r.recall * 100).toFixed(1).padStart(5)}% f1=${(r.f1 * 100).toFixed(1).padStart(5)}% signal=${r.signal.padEnd(8)} fires: pos=${r.positiveFires} neg=${r.negativeFires}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
