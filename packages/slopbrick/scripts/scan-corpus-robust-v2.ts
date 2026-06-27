#!/usr/bin/env npx tsx
/**
 * v0.14.5c-final: parallel child-process corpus scanner with PER-FILE TIMEOUT.
 *
 * Spawns a tsx child for each file via `scripts/scan-file-worker.ts`.
 * Each child:
 *   - Loads the slopbrick worker module (TypeScript via tsx)
 *   - Runs scanFile on one file
 *   - Prints JSON result to stdout
 *   - Exits
 *
 * Per-file timeout is enforced by a 5s wrapper (backend files return
 * in <1s, frontend files in 1-3s; anything >5s is genuinely hung).
 * A hung child is killed via SIGKILL.
 *
 * PARALLEL EXECUTION: spawns PARALLEL children at once, drawing from
 * a shared file queue. At 5s/file and PARALLEL=8, a 184k-file corpus
 * scans in ~32 hours worst case; typically 4-6 hours for the v7
 * corpus (most files are <2s).
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, readdirSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const [, , workspace, kind, outPrefix] = process.argv;
if (!workspace || !kind || !outPrefix) {
  console.error('Usage: scan-corpus-robust-v2.ts <workspace> <kind> <out-prefix>');
  process.exit(1);
}
const absWorkspace = resolve(workspace);

const SOURCE_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx',
  '.vue', '.svelte', '.astro', '.html',
  '.py', '.go',
  '.swift', '.kt', '.kts', '.dart', '.rs',
  '.cpp', '.cc', '.cxx', '.c', '.h', '.hpp', '.hxx',
  '.java', '.rb', '.php',
]);

const PER_FILE_TIMEOUT_MS = 30_000;
const WORKER_SCRIPT = resolve(__dirname, 'scan-file-worker.ts');
// PARALLEL = number of CPU cores minus 1 (leave one for the parent).
// At 8 cores → 7 workers. At 4 cores → 3 workers. Each worker
// processes one file at a time, so this gives linear speedup.
const PARALLEL = Math.max(2, Math.min(16, cpus().length - 1));

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    try {
      const s = statSync(full);
      if (s.isFile()) {
        const ext = entry.match(/\.[^.]+$/)?.[0] ?? '';
        if (SOURCE_EXT.has(ext.toLowerCase())) files.push(full);
      } else if (s.isDirectory()) {
        files.push(...walk(full));
      }
    } catch {
      // Symlink or permission error — skip
    }
  }
  return files;
}

interface ScanResult {
  ok: boolean;
  issues?: Array<{ ruleId: string }>;
  componentCount?: number;
  parseError?: string;
  error?: string;
}

function scanFileInChild(filePath: string): Promise<ScanResult> {
  return new Promise((resolveInner, reject) => {
    // Spawn tsx directly (not `node`) so the .ts shebang + tsx loader
    // resolve correctly. Earlier attempt with `process.execPath` failed
    // because raw node can't import .ts files.
    const child = spawn('npx', ['tsx', WORKER_SCRIPT, filePath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
      reject(new Error(`child timeout after ${PER_FILE_TIMEOUT_MS}ms`));
    }, PER_FILE_TIMEOUT_MS);
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (killed) return; // already rejected
      try {
        const result = JSON.parse(stdout) as ScanResult;
        resolveInner(result);
      } catch (e) {
        reject(new Error(`parse error: ${(e as Error).message}, stdout: ${stdout.slice(0, 200)}, stderr: ${stderr.slice(0, 200)}, exit: ${code}`));
      }
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

console.log(`Discovering files in ${absWorkspace}...`);
const files = walk(absWorkspace);
console.log(`Discovered ${files.length} source files. Scanning ${kind} arm with ${PARALLEL} parallel workers (timeout ${PER_FILE_TIMEOUT_MS}ms per file)...`);

const fires = new Map<string, number>();
const perFileFires = new Map<string, Set<string>>();
let componentCount = 0;
let issueCount = 0;
let parseErrorCount = 0;
let scanErrorCount = 0;
const t0 = Date.now();
const progressInterval = Math.max(500, Math.floor(files.length / 30));

// PARALLEL execution: PARALLEL workers draw from a shared index.
// The index is just `nextFileIndex++` which is atomic in JS event loop.
let nextFileIndex = 0;
let processedCount = 0;

async function workerLoop(): Promise<void> {
  while (true) {
    const i = nextFileIndex++;
    if (i >= files.length) return;
    const file = files[i]!;
    try {
      const result = await scanFileInChild(file);
      if (result.ok) {
        componentCount += result.componentCount ?? 0;
        if (result.parseError) {
          parseErrorCount++;
          if (parseErrorCount <= 5) {
            console.error(`  parse error #${parseErrorCount}: ${file.split('/').pop()}: ${result.parseError}`);
          }
        }
        const firedOnThisFile = new Set<string>();
        for (const issue of result.issues ?? []) {
          issueCount++;
          fires.set(issue.ruleId, (fires.get(issue.ruleId) ?? 0) + 1);
          firedOnThisFile.add(issue.ruleId);
        }
        for (const ruleId of firedOnThisFile) {
          if (!perFileFires.has(ruleId)) perFileFires.set(ruleId, new Set());
          perFileFires.get(ruleId)!.add(file);
        }
      } else {
        scanErrorCount++;
        if (scanErrorCount <= 5) {
          console.error(`  scan error: ${file}: ${result.error}`);
        }
      }
    } catch (err) {
      scanErrorCount++;
      if (scanErrorCount <= 5) {
        console.error(`  scan failed: ${file}: ${(err as Error).message}`);
      }
    }
    processedCount++;
    if (processedCount > 0 && processedCount % progressInterval === 0) {
      const elapsed = (Date.now() - t0) / 1000;
      const rate = processedCount / elapsed;
      const eta = (files.length - processedCount) / rate;
      console.log(`  ${processedCount}/${files.length} files (${elapsed.toFixed(0)}s, ${rate.toFixed(0)} files/s, ETA ${eta.toFixed(0)}s, ${scanErrorCount} errors, ${issueCount} issues)`);
      const partial = {
        kind, workspace: absWorkspace, files: files.length,
        componentCount, issueCount, parseErrorCount, scanErrorCount,
        uniqueRules: fires.size,
        elapsedSec: Math.round((Date.now() - t0) / 1000),
        fires: Object.fromEntries([...fires.entries()].sort((a, b) => b[1] - a[1])),
        perFileFires: Object.fromEntries(
          [...perFileFires.entries()].map(([rule, fileSet]) => [rule, fileSet.size])
        ),
      };
      writeFileSync(`/tmp/${outPrefix}-partial-fires.json`, JSON.stringify(partial, null, 2));
    }
  }
}

// Launch PARALLEL workers
await Promise.all(Array.from({ length: PARALLEL }, () => workerLoop()));

const elapsed = (Date.now() - t0) / 1000;
const out = {
  kind, workspace: absWorkspace, files: files.length,
  componentCount, issueCount, parseErrorCount, scanErrorCount,
  uniqueRules: fires.size,
  elapsedSec: Math.round(elapsed),
  fires: Object.fromEntries([...fires.entries()].sort((a, b) => b[1] - a[1])),
  perFileFires: Object.fromEntries(
    [...perFileFires.entries()].map(([rule, fileSet]) => [rule, fileSet.size])
  ),
};

writeFileSync(`/tmp/${outPrefix}-fires.json`, JSON.stringify(out, null, 2));
console.log(`\nDone: ${files.length} files, ${issueCount} issues, ${parseErrorCount} parse errors, ${scanErrorCount} scan errors, ${fires.size} unique rules in ${elapsed.toFixed(0)}s`);
console.log(`→ /tmp/${outPrefix}-fires.json`);

const sorted = [...fires.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
console.log('\nTop 20 rules:');
for (const [rule, count] of sorted) console.log(`  ${rule}: ${count}`);
