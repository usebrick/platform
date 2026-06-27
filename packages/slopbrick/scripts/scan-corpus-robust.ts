#!/usr/bin/env npx tsx
/**
 * v0.12.1: Robust corpus scanner using child_process.
 *
 * The previous scanner (scan-corpus-direct.ts) uses worker_threads, which
 * can crash on a native SWC parser panic (JSX namespace files). The
 * panic kills the whole process. This scanner uses one child process
 * per file with a timeout. If the child dies or times out, the parent
 * skips the file and continues.
 *
 * Usage:
 *   tsx scripts/scan-corpus-robust.ts <workspace> <kind> <out-prefix>
 *
 * Example:
 *   tsx scripts/scan-corpus-robust.ts \
 *     /Users/cheng/corpus-expansion/v5/scan/v6-full-neg neg v6-full-neg
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, readdirSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const [, , workspace, kind, outPrefix] = process.argv;
if (!workspace || !kind || !outPrefix) {
  console.error('Usage: scan-corpus-robust.ts <workspace> <kind> <out-prefix>');
  process.exit(1);
}
const absWorkspace = resolve(workspace);
const PER_FILE_TIMEOUT_MS = 30000;

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte', '.astro', '.html', '.py', '.go']);

function isFileOk(p: string): boolean {
  try { return statSync(p).isFile(); } catch { return false; }
}

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (isFileOk(full)) {
      const ext = entry.match(/\.[^.]+$/)?.[0] ?? '';
      if (SOURCE_EXT.has(ext.toLowerCase())) files.push(full);
    } else {
      try { if (statSync(full).isDirectory()) walk(full); } catch {}
    }
  }
  return files;
}

function scanFileInChild(filePath: string): Promise<{ issues: any[]; components: number; parseError?: string }> {
  return new Promise((resolveInner, reject) => {
    const child = spawn(
      process.execPath,
      [
        '-e',
        `
        import('${resolve(__dirname, '../src/index.ts')}').catch(() => {
          return import('${resolve(__dirname, '../src/engine/worker.ts')}');
        }).then(async (mod) => {
          const { loadConfig } = await import('${resolve(__dirname, '../src/config/index.ts')}');
          const { RuleRegistry } = await import('${resolve(__dirname, '../src/rules/registry.ts')}');
          const config = await loadConfig('${absWorkspace}');
          const registry = new RuleRegistry();
          registry.loadBuiltins();
          try {
            const result = await mod.scanFile('${filePath.replace(/'/g, "\\'")}', config, registry, '${absWorkspace}');
            process.stdout.write(JSON.stringify({
              ok: true,
              issues: result.issues || [],
              componentCount: result.componentCount || 0,
              parseError: result.parseError,
            }));
          } catch (e) {
            process.stdout.write(JSON.stringify({ ok: false, error: String(e?.message ?? e) }));
          }
          process.exit(0);
        });
        `,
      ],
      { cwd: resolve(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let stdout = '';
    let stderr = '';
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        child.kill('SIGKILL');
        reject(new Error(`timeout after ${PER_FILE_TIMEOUT_MS}ms`));
      }
    }, PER_FILE_TIMEOUT_MS);

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code, signal) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      if (signal === 'SIGKILL' || code !== 0) {
        reject(new Error(`exit code ${code} signal ${signal}: ${stderr.slice(0, 200)}`));
        return;
      }
      try {
        const result = JSON.parse(stdout);
        if (result.ok) resolveInner(result);
        else reject(new Error(result.error ?? 'unknown error'));
      } catch (e) {
        reject(new Error(`parse error: ${(e as Error).message}, stdout: ${stdout.slice(0, 200)}`));
      }
    });
  });
}

console.log(`Discovering files in ${absWorkspace}...`);
const files = walk(absWorkspace);
console.log(`Discovered ${files.length} source files. Scanning ${kind} arm...`);

const fires = new Map<string, number>();
const perFileFires = new Map<string, Set<string>>();
let componentCount = 0;
let issueCount = 0;
let parseErrorCount = 0;
let scanErrorCount = 0;
const t0 = Date.now();
const progressInterval = Math.max(500, Math.floor(files.length / 30));

for (let i = 0; i < files.length; i++) {
  try {
    const result = await scanFileInChild(files[i]!);
    componentCount += result.components;
    if (result.parseError) parseErrorCount++;
    const firedOnThisFile = new Set<string>();
    for (const issue of result.issues) {
      issueCount++;
      fires.set(issue.ruleId, (fires.get(issue.ruleId) ?? 0) + 1);
      firedOnThisFile.add(issue.ruleId);
    }
    for (const ruleId of firedOnThisFile) {
      if (!perFileFires.has(ruleId)) perFileFires.set(ruleId, new Set());
      perFileFires.get(ruleId)!.add(files[i]!);
    }
  } catch (err) {
    scanErrorCount++;
    if (scanErrorCount <= 5) {
      console.error(`  scan failed: ${files[i]}: ${(err as Error).message}`);
    }
  }
  if (i > 0 && i % progressInterval === 0) {
    const elapsed = (Date.now() - t0) / 1000;
    const rate = i / elapsed;
    const eta = (files.length - i) / rate;
    console.log(`  ${i}/${files.length} files (${elapsed.toFixed(0)}s, ${rate.toFixed(0)} files/s, ETA ${eta.toFixed(0)}s, ${scanErrorCount} errors)`);
  }
  // Write partial output every 10k files
  if ((i + 1) % 10000 === 0) {
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

const elapsed = (Date.now() - t0) / 1000;
const out = {
  kind,
  workspace: absWorkspace,
  files: files.length,
  componentCount,
  issueCount,
  parseErrorCount,
  scanErrorCount,
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
