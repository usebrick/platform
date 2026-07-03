/**
 * v0.36.0: CLI-chunked scan driver. Spawns the slopbrick CLI
 * per chunk to avoid the OOM that the in-process scan hits
 * at 10k files (the report array grows too large for the
 * default 2 GB Node heap). Each CLI invocation is a fresh
 * process with its own memory space.
 *
 * Emits v10-corpus/scans/<source>.jsonl
 *   { file, ruleId, filePath }
 */
import { spawn } from 'node:child_process';
import { mkdirSync, createWriteStream, readdirSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const SCAN_DIR = join(ROOT, 'scans');
const BIN = join(ROOT, '..', '..', '..', 'bin', 'slopbrick.js');
const SOURCES = ['human', 'chatgpt', 'dsc', 'qwen'];
const CHUNK = 800; // files per CLI invocation

mkdirSync(SCAN_DIR, { recursive: true });

function runChunk(paths: string[], ws: NodeJS.WritableStream): Promise<void> {
  return new Promise((resolve) => {
    const tmpOut = `/tmp/v10-chunk-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
    const proc = spawn(
      'node',
      [BIN, 'scan', ...paths, '--json', tmpOut, '--no-telemetry', '--quiet',
       '--include', '**/*.java'],
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
        const report = JSON.parse(readFileSync(tmpOut, 'utf8'));
        for (const issue of (report.issues ?? [])) {
          if (!issue.filePath || !issue.ruleId) continue;
          const base = issue.filePath.split('/').pop() ?? '';
          const hm = base.replace(/\.java$/, '');
          ws.write(JSON.stringify({ file: hm, ruleId: issue.ruleId, filePath: issue.filePath }) + '\n');
        }
        rmSync(tmpOut);
      } catch (e) {
        process.stderr.write(`  parse error: ${e}\n`);
      }
      resolve();
    });
  });
}

async function scanSource(source: string) {
  const dir = join(ROOT, 'sampled', source);
  const outFile = join(SCAN_DIR, `${source}.jsonl`);
  if (existsSync(outFile)) rmSync(outFile);
  const ws = createWriteStream(outFile, { flags: 'a' });

  const all = readdirSync(dir).filter((f) => f.endsWith('.java')).sort();
  process.stderr.write(`[${source}] ${all.length} files in chunks of ${CHUNK}\n`);

  let total = 0;
  const t0 = Date.now();
  for (let i = 0; i < all.length; i += CHUNK) {
    const chunk = all.slice(i, i + CHUNK);
    const paths = chunk.map((f) => join(dir, f));
    await runChunk(paths, ws);
    total += chunk.length;
    if (total % 2000 === 0 || total === all.length) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
      const eta = total > 0
        ? Math.round(((all.length - total) / total) * (Date.now() - t0) / 1000)
        : 0;
      process.stderr.write(`[${source}] ${total}/${all.length} (${elapsed}s, ETA ${eta}s)\n`);
    }
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
  process.stderr.write(`[${source}] done in ${elapsed}s\n`);
  await new Promise<void>((res) => ws.end(() => res()));
}

async function main() {
  for (const s of SOURCES) await scanSource(s);
  process.stderr.write('All sources scanned.\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
