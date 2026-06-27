#!/usr/bin/env npx tsx
/**
 * Direct corpus scan — bypasses the WorkerPool (which silently drops files
 * for large inputs in v0.11.2). Loops over each file inline using
 * scanFile(), accumulates per-rule fires in a Map, and writes a summary.
 *
 * Usage: tsx scripts/scan-corpus-direct.ts <workspace> <kind> <out-prefix>
 *
 * Output: /tmp/<out-prefix>-fires.json with shape
 *   { files, fires: { [ruleId]: count } }
 */
import { resolve } from 'node:path';
import { writeFileSync, readdirSync, statSync } from 'node:fs';

const [, , workspace, kind, outPrefix] = process.argv;
if (!workspace || !kind || !outPrefix) {
  console.error('Usage: scan-corpus-direct.ts <workspace> <kind> <out-prefix>');
  process.exit(1);
}

const absWorkspace = resolve(workspace);

const { scanFile } = await import('../src/engine/worker.js');
const { loadConfig, DEFAULT_CONFIG } = await import('../src/config/index.js');
const { RuleRegistry } = await import('../src/rules/registry.js');

const config = await loadConfig(absWorkspace);
const registry = new RuleRegistry();
registry.loadBuiltins();

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte', '.astro', '.html', '.py', '.go']);
function isFileOk(p: string): boolean {
  try { return statSync(p).isFile(); } catch { return false; }
}

const files: string[] = [];
function walk(dir: string) {
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (isFileOk(full)) {
      const ext = entry.match(/\.[^.]+$/)?.[0] ?? '';
      if (SOURCE_EXT.has(ext.toLowerCase())) files.push(full);
    } else {
      try { if (statSync(full).isDirectory()) walk(full); } catch {}
    }
  }
}

console.log(`Discovering files in ${absWorkspace}...`);
walk(absWorkspace);
console.log(`Discovered ${files.length} source files. Scanning ${kind} arm...`);

const fires = new Map<string, number>();
/** Per-file fires: ruleId -> Set of file paths that rule fired on. */
const perFileFires = new Map<string, Set<string>>();
let componentCount = 0;
let issueCount = 0;
let parseErrorCount = 0;
const t0 = Date.now();
const progressInterval = Math.max(1000, Math.floor(files.length / 20));

for (let i = 0; i < files.length; i++) {
  try {
    const result = await scanFile(files[i]!, config, registry, absWorkspace);
    componentCount += result.componentCount;
    if (result.parseError) parseErrorCount++;
    // Track which rules fired on THIS file (per-file granularity — v4 method)
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
    console.error(`  scan failed: ${files[i]}: ${(err as Error).message}`);
  }
  if (i > 0 && i % progressInterval === 0) {
    const elapsed = (Date.now() - t0) / 1000;
    const rate = i / elapsed;
    const eta = (files.length - i) / rate;
    console.log(`  ${i}/${files.length} files (${elapsed.toFixed(0)}s, ${rate.toFixed(0)} files/s, ETA ${eta.toFixed(0)}s)`);
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
  uniqueRules: fires.size,
  elapsedSec: Math.round(elapsed),
  fires: Object.fromEntries([...fires.entries()].sort((a, b) => b[1] - a[1])),
  /** Per-file fires: ruleId -> number of unique files that rule fired on. */
  perFileFires: Object.fromEntries(
    [...perFileFires.entries()].map(([rule, fileSet]) => [rule, fileSet.size])
  ),
  /** For tools that want to verify: the actual file paths (warning: large). */
  // perFileFirePaths: Object.fromEntries(
  //   [...perFileFires.entries()].map(([rule, fileSet]) => [rule, [...fileSet]])
  // ),
};

writeFileSync(`/tmp/${outPrefix}-fires.json`, JSON.stringify(out, null, 2));
console.log(`\nDone: ${files.length} files, ${issueCount} issues, ${parseErrorCount} parse errors, ${fires.size} unique rules in ${elapsed.toFixed(0)}s`);
console.log(`→ /tmp/${outPrefix}-fires.json`);

const sorted = [...fires.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
console.log('\nTop 20 rules:');
for (const [rule, count] of sorted) console.log(`  ${rule}: ${count}`);

