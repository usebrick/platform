/**
 * v0.36.0: v10 calibration scan — in-process scan of the
 * 10k-paired-sample. No CLI per-chunk overhead, no EAGAIN
 * (40k files total is well within FD limits).
 *
 * Emits v10-corpus/scans/<source>.jsonl
 *   { file, ruleId, filePath }
 *
 * The calibrator pairs by `file` (hm_index).
 */
import { mkdirSync, createWriteStream, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanProject } from '../../../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const SCAN_DIR = join(ROOT, 'scans');
const SOURCES = ['human', 'chatgpt', 'dsc', 'qwen'];

mkdirSync(SCAN_DIR, { recursive: true });

async function scanSource(source: string) {
  const dir = join(ROOT, 'sampled', source);
  const outFile = join(SCAN_DIR, `${source}.jsonl`);
  if (existsSync(outFile)) rmSync(outFile);
  const ws = createWriteStream(outFile, { flags: 'a' });

  process.stderr.write(`[${source}] scanning ${dir} ...\n`);
  const t0 = Date.now();
  const report = await scanProject({ cwd: dir, include: ['**/*.java'] });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  process.stderr.write(`[${source}] scanned ${report.fileCount} files in ${elapsed}s — ${report.issues.length} issues\n`);

  for (const issue of report.issues) {
    if (!issue.filePath || !issue.ruleId) continue;
    const base = issue.filePath.split('/').pop() ?? '';
    const hm = base.replace(/\.java$/, '');
    ws.write(JSON.stringify({ file: hm, ruleId: issue.ruleId, filePath: issue.filePath }) + '\n');
  }
  await new Promise<void>((res) => ws.end(() => res()));
}

async function main() {
  for (const s of SOURCES) await scanSource(s);
  process.stderr.write('All sources scanned.\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
