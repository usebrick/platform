#!/usr/bin/env npx tsx
/**
 * v0.18.9: filelist-based scan for the 50/50 balanced v8 corpus.
 *
 * Unlike `scan-corpus-robust-v2.ts` which walks a directory tree, this
 * script reads a pre-built filelist (one file path per line) and scans
 * only those files. Used for the v0.18.9 v8.5 calibration where:
 *   - v8 positive has 146,181 source files (overshot 50k target)
 *   - v8 negative has 50,665 source files (slightly over 50k target)
 *   - We need 50/50 balance → sample 50k of each
 *
 * Usage:
 *   pnpm exec tsx scripts/scan-corpus-with-filelist.ts \
 *     <filelist.txt> <pos|neg> <out-prefix>
 *
 *   pnpm exec tsx scripts/scan-corpus-with-filelist.ts \
 *     /Users/cheng/corpus-expansion/v8/filelists/v8-pos-50k.txt \
 *     pos v8-pos
 *
 * Output: /tmp/<out-prefix>-fires.json + /tmp/<out-prefix>-partial-fires.json
 * (same format as scan-corpus-robust-v2.ts — the v8.5 calibration
 * script reads both v7 + v8 fires.json in this format).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config/index.js';
import { RuleRegistry } from '../src/rules/registry.js';
import { scanFile } from '../src/engine/worker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO = join(__dirname, '..');

const [, , filelistPath, kind, outPrefix] = process.argv;
if (!filelistPath || !kind || !outPrefix) {
  console.error(
    'Usage: scan-corpus-with-filelist.ts <filelist.txt> <pos|neg> <out-prefix>',
  );
  process.exit(1);
}
if (kind !== 'pos' && kind !== 'neg') {
  console.error(`kind must be pos or neg (got ${kind})`);
  process.exit(1);
}

const partialPath = `/tmp/${outPrefix}-partial-fires.json`;
const finalPath = `/tmp/${outPrefix}-fires.json`;

interface Accum {
  kind: 'pos' | 'neg';
  workspace: string;
  files: number;
  issueCount: number;
  uniqueRules: number;
  fires: Record<string, number>;
  perFileFires: Record<string, Set<string>>;
}

const accum: Accum = {
  kind,
  workspace: filelistPath,
  files: 0,
  issueCount: 0,
  uniqueRules: 0,
  fires: {},
  perFileFires: {},
};

const seenRules = new Set<string>();

function addFires(file: string, issues: { ruleId: string }[]): void {
  for (const issue of issues) {
    seenRules.add(issue.ruleId);
    accum.fires[issue.ruleId] = (accum.fires[issue.ruleId] ?? 0) + 1;
    if (!accum.perFileFires[issue.ruleId]) {
      accum.perFileFires[issue.ruleId] = new Set();
    }
    accum.perFileFires[issue.ruleId]!.add(file);
  }
}

function flushPartial(): void {
  // Sets don't JSON-serialize. Convert to lists.
  const out = {
    ...accum,
    uniqueRules: seenRules.size,
    perFileFires: Object.fromEntries(
      Object.entries(accum.perFileFires).map(([k, v]) => [k, Array.from(v as Set<string>)]),
    ),
  };
  writeFileSync(partialPath, JSON.stringify(out));
}

async function main(): Promise<void> {
  const files = readFileSync(filelistPath, 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  console.error(
    `[scan-with-filelist] ${kind}: ${files.length} files, prefix=${outPrefix}`,
  );

  const config = await loadConfig(REPO);
  const registry = new RuleRegistry();
  registry.loadBuiltins();
  console.error(`[scan-with-filelist] registry: ${registry.all().length} rules`);

  let i = 0;
  const t0 = Date.now();
  for (const file of files) {
    i++;
    try {
      // Skip files > 1MB (likely auto-generated minified JS / d.ts).
      // TypeScript's lib/ has 6-9MB minified files that take minutes
      // to parse and don't produce meaningful rule signal.
      const { statSync } = await import('node:fs');
      const stat = statSync(file, { throwIfNoEntry: false });
      if (stat && stat.size > 1_048_576) {
        if (i % 500 === 0) {
          console.error(`  [${i}/${files.length}] skipped (${(stat.size / 1024 / 1024).toFixed(1)}MB): ${file}`);
        }
        continue;
      }
      const result = await scanFile(file, config, registry, dirname(file));
      accum.files += 1;
      accum.issueCount += result.issues.length;
      addFires(file, result.issues);
      if (i % 500 === 0) {
        flushPartial();
        const elapsed = (Date.now() - t0) / 1000;
        const rate = i / elapsed;
        const eta = (files.length - i) / rate;
        console.error(
          `  [${i}/${files.length}] ${(rate).toFixed(1)} files/s, ETA ${eta.toFixed(0)}s, ${accum.issueCount} issues, ${seenRules.size} rules`,
        );
      }
    } catch (e) {
      console.error(`  [${i}/${files.length}] FAILED: ${file} (${(e as Error).message})`);
    }
  }
  flushPartial();
  // Also write the final file (same content as partial at this point)
  writeFileSync(finalPath, JSON.stringify({
    ...accum,
    uniqueRules: seenRules.size,
    perFileFires: Object.fromEntries(
      Object.entries(accum.perFileFires).map(([k, v]) => [k, Array.from(v as Set<string>)]),
    ),
  }));
  console.error(
    `\n[scan-with-filelist] done: ${accum.files} files, ${accum.issueCount} issues, ${seenRules.size} rules`,
  );
  console.error(`Output: ${finalPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
