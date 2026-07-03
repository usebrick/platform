/**
 * v0.36.0: v10 corpus scan driver — uses the slopbrick library
 * API (scanProject) directly. Chunks files in groups of N to
 * avoid EAGAIN (file descriptor exhaustion on 200k+ files in a
 * single scanProject call).
 *
 * Emits v10-corpus/scans/<source>.jsonl with one row per rule hit:
 *   { file, ruleId, filePath }
 *
 * `file` is the bare hm_index (basename without .java) so the
 * downstream calibrator can pair human ↔ chatgpt ↔ dsc ↔ qwen.
 */
import { mkdirSync, createWriteStream, readdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanProject } from '../../../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const SCAN_DIR = join(ROOT, 'scans');
const SOURCES = ['human', 'chatgpt', 'dsc', 'qwen'];
const CHUNK = 1500; // files per scanProject call

mkdirSync(SCAN_DIR, { recursive: true });

async function scanSource(source: string) {
  const dir = join(ROOT, source);
  const outFile = join(SCAN_DIR, `${source}.jsonl`);
  if (existsSync(outFile)) rmSync(outFile);
  const ws = createWriteStream(outFile, { flags: 'a' });

  // Build a flat list of relative paths inside the dir
  const all = readdirSync(dir).filter((f) => f.endsWith('.java')).sort();
  process.stderr.write(`[${source}] ${all.length} files, scanning in chunks of ${CHUNK}\n`);

  let totalScanned = 0;
  let totalHits = 0;
  const t0 = Date.now();
  for (let i = 0; i < all.length; i += CHUNK) {
    const chunk = all.slice(i, i + CHUNK);
    // Pass absolute paths via --include override AND a filter through
    // a temp subdir trick: easiest path is to use a thin wrapper that
    // calls scanProject with a *cwd* that is a fresh symlinked subset.
    // Simpler: just call scanProject on the full dir but with
    // ScanProjectOptions.since/staged that pre-filters — not available.
    //
    // Cleanest: we instead shell out to the CLI for this chunk, with
    // explicit file args. This still reuses the project config.
    const paths = chunk.map((f) => join(dir, f));
    await runChunk(paths, ws);
    totalScanned += chunk.length;
    if (totalScanned % 15000 === 0 || totalScanned === all.length) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
      const eta = totalScanned > 0
        ? Math.round(((all.length - totalScanned) / totalScanned) * (Date.now() - t0) / 1000)
        : 0;
      process.stderr.write(`[${source}] ${totalScanned}/${all.length} (${elapsed}s, ETA ${eta}s)\n`);
    }
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
  process.stderr.write(`[${source}] done in ${elapsed}s — ${totalHits} hits\n`);
  await new Promise<void>((res) => ws.end(() => res()));
}

// Use the CLI for chunks so config-driven include applies to all
// files passed explicitly. (scanProject with cwd=dir would re-glob
// the whole 200k dir on every call, defeating the chunking.)
import { spawn } from 'node:child_process';

function runChunk(paths: string[], ws: NodeJS.WritableStream): Promise<void> {
  return new Promise((resolve) => {
    const tmpOut = `/tmp/v10-scan-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
    const BIN = join(__dirname, '..', '..', '..', 'bin', 'slopbrick.js');
    const proc = spawn(
      'node',
      [BIN, 'scan', ...paths, '--json', tmpOut, '--no-telemetry', '--quiet'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stderrBuf = '';
    proc.stderr.on('data', (d) => { stderrBuf += d.toString(); });
    proc.on('close', (code) => {
      if (!existsSync(tmpOut)) {
        process.stderr.write(`  no output for chunk of ${paths.length} (exit ${code}): ${stderrBuf.slice(0, 200)}\n`);
        resolve();
        return;
      }
      try {
        const { readFileSync, rmSync } = require('node:fs');
        const report = JSON.parse(readFileSync(tmpOut, 'utf8'));
        for (const issue of (report.issues ?? [])) {
          if (!issue.filePath || !issue.ruleId) continue;
          const base = issue.filePath.split('/').pop() ?? '';
          const hm = base.replace(/\.java$/, '');
          ws.write(JSON.stringify({ file: hm, ruleId: issue.ruleId, filePath: issue.filePath }) + '\n');
        }
        try { rmSync(tmpOut); } catch {}
      } catch (e) {
        process.stderr.write(`  parse error: ${e}\n`);
      }
      resolve();
    });
  });
}

async function main() {
  for (const s of SOURCES) await scanSource(s);
  process.stderr.write('All sources scanned.\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
