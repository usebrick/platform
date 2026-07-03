#!/usr/bin/env tsx
/**
 * Calibrate the 5 v0.26.0 positive AI-signal rules against the v9-java
 * corpus. Uses the per-repo JSON files in /tmp/v9-java-fires/java/
 * (which contain the full file lists per repo) and re-scans each
 * file with the new rules.
 *
 * Output: per-rule TP/FP/ratio table for the 5 new rules.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const NEW_RULES = [
  'java/verbose-javadoc',
  'java/optional-overuse',
  'java/immutable-collection-preference',
  'java/builder-overuse',
  'java/stream-overuse',
];

const CLONE_ROOT = '/Users/cheng/corpus-expansion/v9/clones';
const V9_FIRES_DIR = '/tmp/v9-java-fires/java';

interface PerRepo {
  kind: 'pos' | 'neg';
  workspace: string;
  files: number;
  perFileFires: Record<string, string[]>;
}

async function main() {
  const root = resolve(__dirname, '..');
  const { RuleRegistry } = await import(`${root}/src/rules/registry.ts`);
  const { scanFile } = await import(`${root}/src/engine/worker.ts`);

  const registry = new RuleRegistry();
  const config: any = {
    selfScan: { excludePaths: [] },
  };

  // Use the per-arm merged JSON files (v9-java-{pos,neg}.json) for
  // the file list. Their perFileFires is the set of files that fired
  // each of the 6 existing java/* rules — a biased sample (only files
  // with patterns) but the best we have without re-running the 6-min
  // v9 build to regenerate filelists.
  const posData = JSON.parse(readFileSync(`${V9_FIRES_DIR}/v9-java-pos.json`, 'utf-8')) as PerRepo;
  const negData = JSON.parse(readFileSync(`${V9_FIRES_DIR}/v9-java-neg.json`, 'utf-8')) as PerRepo;

  // Union of all java/* file lists per arm
  const posFiles = new Set<string>();
  const negFiles = new Set<string>();
  for (const [ruleId, files] of Object.entries(posData.perFileFires)) {
    if (ruleId.startsWith('java/')) for (const f of files) posFiles.add(f);
  }
  for (const [ruleId, files] of Object.entries(negData.perFileFires)) {
    if (ruleId.startsWith('java/')) for (const f of files) negFiles.add(f);
  }
  console.log(`Sample: pos=${posFiles.size} files (${posData.files} total in pos arm)`);
  console.log(`Sample: neg=${negFiles.size} files (${negData.files} total in neg arm)`);
  console.log(`Note: this is a biased sample (files that fired >=1 of the 6 existing java rules).`);
  console.log(`A full calibration requires re-running build-v9-corpus.ts to regenerate filelists (6 min).`);

  // The file paths in perFileFires are repo-relative (e.g. "./spring-aop/src/...")
  // We need the workspace (repo) for each. Unfortunately, perFileFires
  // doesn't track which workspace each file came from. So we can only
  // scan files whose paths are unique across repos. For the v9
  // corpus, this is most files. Skip the rest.
  const counts: Record<string, { tp: number; fp: number }> = {};
  for (const r of NEW_RULES) counts[r] = { tp: 0, fp: 0 };

  let scanned = 0;
  let posScanned = 0;
  let negScanned = 0;
  let skipped = 0;
  const t0 = Date.now();

  // Heuristic: try every known repo clone path and use the first that exists.
  const repos = readdirSync(CLONE_ROOT);
  function findRepoPath(rel: string): string | null {
    for (const r of repos) {
      const candidate = `${CLONE_ROOT}/${r}/${rel}`;
      if (existsSync(candidate)) return candidate;
    }
    return null;
  }

  for (const arm of ['pos', 'neg'] as const) {
    const files = arm === 'pos' ? posFiles : negFiles;
    for (const rel of files) {
      const fullPath = findRepoPath(rel);
      if (!fullPath) {
        skipped++;
        continue;
      }
      try {
        const result = await scanFile(fullPath, config, registry, root);
        for (const issue of result.issues ?? []) {
          const rid = issue.ruleId;
          if (NEW_RULES.includes(rid)) {
            counts[rid][arm === 'pos' ? 'tp' : 'fp']++;
          }
        }
      } catch {
        // skip
      }
      scanned++;
      if (arm === 'pos') posScanned++;
      else negScanned++;
      if (scanned % 1000 === 0) {
        const elapsed = (Date.now() - t0) / 1000;
        console.log(`  ... ${scanned} files scanned (${(scanned / elapsed).toFixed(0)}/s, ${skipped} skipped)`);
      }
    }
  }
  const elapsed = (Date.now() - t0) / 1000;
  console.log(`\nScanned ${scanned} files in ${elapsed.toFixed(1)}s (${(scanned / elapsed).toFixed(0)}/s)\n`);

  console.log('=== v0.26.0 positive AI-signal rules: v9-java full calibration ===');
  const results: Array<{ rule: string; tp: number; fp: number; recall: number; fpRate: number; ratio: number; precision: number; verdict: string }> = [];
  for (const r of NEW_RULES) {
    const { tp, fp } = counts[r];
    const recall = posScanned > 0 ? tp / posScanned : 0;
    const fpRate = negScanned > 0 ? fp / negScanned : 0;
    const ratio = fpRate > 0 ? recall / fpRate : (recall > 0 ? Infinity : 0);
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const verdict = ratio >= 1.5 ? 'USEFUL' : ratio >= 1.0 ? 'OK' : 'DORMANT';
    results.push({ rule: r, tp, fp, recall, fpRate, ratio, precision, verdict });
    console.log(
      `  ${r.padEnd(40)}  TP=${String(tp).padStart(5)}  FP=${String(fp).padStart(5)}  ` +
      `recall=${(recall * 100).toFixed(3)}%  fpRate=${(fpRate * 100).toFixed(3)}%  ` +
      `ratio=${ratio.toFixed(2)}  precision=${(precision * 100).toFixed(2)}%  verdict=${verdict}`
    );
  }

  // Write JSON output for downstream consumption
  const outPath = '/tmp/v9-java-fires/v26-calibration.json';
  const fs = await import('node:fs/promises');
  await fs.writeFile(outPath, JSON.stringify({
    version: 'v9.0-java-2026-07-29',
    posFiles: posScanned,
    negFiles: negScanned,
    posRepos: 10,
    negRepos: 8,
    elapsedSeconds: elapsed,
    rules: results,
  }, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
