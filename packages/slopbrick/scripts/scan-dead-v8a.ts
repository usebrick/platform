#!/usr/bin/env npx tsx
/**
 * v0.18.8: dead/* first measurement scan.
 *
 * Scans the v8a sample (500 pos + 500 neg TS/TSX files from the v7
 * corpus) with ONLY the 5 dead/* rules. Output goes to
 * /Users/cheng/corpus-expansion/v8/scan/ in the v7 calibration format
 * so the existing `compute-v7-calibration.py` script can process it.
 *
 * Why focused: a full v7 re-scan takes 4-6 hours. A dead/*-only
 * scan on 1000 files takes minutes. The first measurement question
 * is: do the dead/* rules have ANY signal? We don't need full v7
 * accuracy to answer that.
 *
 * Usage: pnpm exec tsx scripts/scan-dead-v8a.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config/index.js';
import { RuleRegistry } from '../src/rules/registry.js';
import { scanFile } from '../src/engine/worker.js';
import { deadRuleIds, isDeadRuleId } from '../src/rules/dead/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO = join(__dirname, '..');

const CORPUS_ROOT = process.env['SLOPBRICK_CORPUS_DIR']
  ?? '/Users/cheng/corpus-expansion';
const FILELISTS_DIR = join(CORPUS_ROOT, 'v8/filelists');
const SCAN_OUT_DIR = join(CORPUS_ROOT, 'v8/scan');

interface FileResult {
  file: string;
  pos: boolean;
  ok: boolean;
  parseError: string | null;
  deadCounts: Record<string, number>;
  parseTimeMs: number;
}

async function scanOne(
  file: string,
  isPos: boolean,
  registry: RuleRegistry,
): Promise<FileResult> {
  const slug = file
    .replace(/^\/Users\/cheng\/corpus-expansion\/(v7\/negative|positive)\//, '')
    .replace(/[/\\]/g, '__');
  const outPath = join(SCAN_OUT_DIR, isPos ? 'v8a-pos' : 'v8a-neg', `${slug}.json`);
  if (existsSync(outPath)) {
    // Cache hit; load and return
    const existing = JSON.parse(readFileSync(outPath, 'utf-8')) as FileResult;
    return existing;
  }
  const t0 = Date.now();
  try {
    const config = await loadConfig(file);
    const result = await scanFile(file, config, registry, dirname(file));
    const deadCounts: Record<string, number> = {};
    for (const issue of result.issues) {
      if (isDeadRuleId(issue.ruleId)) {
        deadCounts[issue.ruleId] = (deadCounts[issue.ruleId] ?? 0) + 1;
      }
    }
    const out: FileResult = {
      file,
      pos: isPos,
      ok: true,
      parseError: result.parseError ?? null,
      deadCounts,
      parseTimeMs: Date.now() - t0,
    };
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(out));
    return out;
  } catch (e) {
    const out: FileResult = {
      file,
      pos: isPos,
      ok: false,
      parseError: String((e as Error)?.message ?? e),
      deadCounts: {},
      parseTimeMs: Date.now() - t0,
    };
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(out));
    return out;
  }
}

async function readFilelist(path: string): Promise<string[]> {
  const text = readFileSync(path, 'utf-8');
  return text.split('\n').map((l) => l.trim()).filter(Boolean);
}

async function main() {
  const posFiles = await readFilelist(join(FILELISTS_DIR, 'v8a-pos-files.txt'));
  const negFiles = await readFilelist(join(FILELISTS_DIR, 'v8a-neg-files.txt'));
  console.error(`v8a sample: ${posFiles.length} pos + ${negFiles.length} neg = ${posFiles.length + negFiles.length} files`);
  console.error(`dead/* rules: ${deadRuleIds.join(', ')}`);

  const config = await loadConfig(REPO);
  const registry = new RuleRegistry();
  registry.loadBuiltins();
  // Strip all non-dead rules to speed up the scan
  const beforeCount = registry.all().length;
  registry.removeWhere((r) => !isDeadRuleId(r.id));
  const afterCount = registry.all().length;
  console.error(`Registry: ${beforeCount} -> ${afterCount} rules (dead/* only)`);

  const results: FileResult[] = [];
  const all = [
    ...posFiles.map((f) => ({ file: f, pos: true })),
    ...negFiles.map((f) => ({ file: f, pos: false })),
  ];
  let i = 0;
  for (const { file, pos } of all) {
    i++;
    if (i % 50 === 0) console.error(`  [${i}/${all.length}] scanned`);
    const result = await scanOne(file, pos, registry);
    results.push(result);
  }

  // Compute arm-fires metrics
  const summary: Record<string, {
    posFiles: number; posFires: number;
    negFiles: number; negFires: number;
    posFireRate: number; negFireRate: number;
    ratio: number; verdict: string;
  }> = {};

  for (const ruleId of deadRuleIds) {
    const posScanned = results.filter((r) => r.pos && r.ok);
    const negScanned = results.filter((r) => !r.pos && r.ok);
    const posFires = posScanned.filter((r) => (r.deadCounts[ruleId] ?? 0) > 0).length;
    const negFires = negScanned.filter((r) => (r.deadCounts[ruleId] ?? 0) > 0).length;
    const posFireRate = posScanned.length > 0 ? posFires / posScanned.length : 0;
    const negFireRate = negScanned.length > 0 ? negFires / negScanned.length : 0;
    // ratio = pos_fire_rate / neg_fire_rate (the "lift")
    const ratio = negFireRate > 0
      ? posFireRate / negFireRate
      : (posFireRate > 0 ? Infinity : 1);
    let verdict: string;
    if (posFires === 0 && negFires === 0) verdict = 'DORMANT';
    else if (ratio < 1) verdict = 'INVERTED';
    else if (ratio < 1.5) verdict = 'NOISY';
    else if (ratio < 2) verdict = 'OK';
    else verdict = 'USEFUL';
    summary[ruleId] = {
      posFiles: posScanned.length, posFires,
      negFiles: negScanned.length, negFires,
      posFireRate, negFireRate, ratio, verdict,
    };
  }

  const summaryPath = join(SCAN_OUT_DIR, 'v8a-summary.json');
  mkdirSync(dirname(summaryPath), { recursive: true });
  writeFileSync(summaryPath, JSON.stringify({
    scannedAt: new Date().toISOString(),
    posFiles: posFiles.length,
    negFiles: negFiles.length,
    deadRules: deadRuleIds,
    summary,
  }, null, 2));

  console.error(`\nSummary written to ${summaryPath}`);
  console.error('\n=== v8a dead/* arm-fires summary ===');
  console.error('rule                          | pos fires | neg fires | pos rate | neg rate | ratio   | verdict');
  console.error('------------------------------|-----------|-----------|----------|----------|---------|--------');
  for (const ruleId of deadRuleIds) {
    const s = summary[ruleId];
    const ratioStr = s.ratio === Infinity ? '  Inf  ' : s.ratio.toFixed(2).padStart(6) + 'x';
    console.error(
      `${ruleId.padEnd(30)} | ${String(s.posFires).padStart(9)} | ${String(s.negFires).padStart(9)} | ${(s.posFireRate*100).toFixed(2).padStart(7)}% | ${(s.negFireRate*100).toFixed(2).padStart(7)}% | ${ratioStr} | ${s.verdict}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
