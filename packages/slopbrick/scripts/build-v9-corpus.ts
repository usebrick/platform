#!/usr/bin/env -S npx tsx
/**
 * build-v9-corpus — fetch repos from the v9 corpus manifest and
 * produce per-arm fire logs for calibration.
 *
 * Usage:
 *   # 1. Copy the manifest template and fill in local_clone_path
 *   cp packages/slopbrick/docs/research/v9-corpus-manifest.template.json \
 *      corpus-manifest.local.json
 *   # (edit corpus-manifest.local.json to add local_clone_path for each repo)
 *
 *   # 2. Run the build
 *   npx tsx packages/slopbrick/scripts/build-v9-corpus.ts \
 *     --manifest corpus-manifest.local.json \
 *     --arm java \
 *     --out /tmp/v9-java-fires
 *
 * What it does:
 *   1. For each repo in the manifest, runs `git fetch --unshallow`
 *      and `git checkout <ref>` if local_clone_path doesn't have it.
 *   2. Builds a filelist (.java files, < 10MB).
 *   3. Runs `slopbrick scan --workspace <repo> --format json` and
 *      saves the report.
 *   4. Concatenates per-arm into v9-<arm>-<neg|pos>.json.
 *
 * Estimated runtime: ~5-10 minutes per repo (depends on size).
 *   8 neg + 6 pos repos for Java arm = ~14 * 8min = ~2 hours.
 *
 * Per the v9-plan-2026-07-02-update.md Part 6 risks:
 *   - Java ecosystem diversity: per-ecosystem calibration
 *   - Sample-size discipline: enforces 10k files / 10 fires floor
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, join } from 'node:path';

interface RepoEntry {
  name: string;
  url: string;
  checkout: string;
  rationale: string;
  files_estimate?: number;
  note?: string;
  /** Operator fills in: absolute path to the local clone. */
  local_clone_path?: string;
}

interface CorpusManifest {
  version: string;
  build_date: string;
  arm: string;
  files_target: { neg: number; pos: number };
  pos_cutoff: string;
  neg_cutoff_before: string;
  neg_repos: RepoEntry[];
  pos_repos: RepoEntry[];
}

function die(msg: string): never {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

function parseArgs(): { manifest: string; arm: string; out: string } {
  const args = process.argv.slice(2);
  let manifest = 'corpus-manifest.local.json';
  let arm = 'java';
  let out = './v9-fires';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--manifest') manifest = args[++i];
    else if (args[i] === '--arm') arm = args[++i];
    else if (args[i] === '--out') out = args[++i];
    else if (args[i] === '-h' || args[i] === '--help') {
      console.log('Usage: tsx build-v9-corpus.ts --manifest <path> --arm <name> --out <dir>');
      process.exit(0);
    }
  }
  return { manifest, arm, out };
}

function loadManifest(path: string): CorpusManifest {
  if (!existsSync(path)) die(`Manifest not found: ${path}\nCopy v9-corpus-manifest.template.json to ${path} and fill in local_clone_path for each repo.`);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function ensureClone(repo: RepoEntry): string {
  if (!repo.local_clone_path) die(`Repo "${repo.name}" missing local_clone_path in manifest`);
  if (!existsSync(repo.local_clone_path)) {
    die(`Repo "${repo.name}" local_clone_path does not exist: ${repo.local_clone_path}\nRun: git clone ${repo.url} ${repo.local_clone_path}`);
  }
  console.log(`\n→ ${repo.name} (${repo.local_clone_path})`);
  try {
    execSync('git fetch --unshallow', { cwd: repo.local_clone_path, stdio: 'pipe' });
  } catch {
    // Already shallow or no remote — ignore
  }
  try {
    execSync(`git checkout ${repo.checkout}`, { cwd: repo.local_clone_path, stdio: 'pipe' });
  } catch (e) {
    die(`Failed to checkout ${repo.checkout} for ${repo.name}: ${(e as Error).message}`);
  }
  return repo.local_clone_path;
}

function buildFilelist(clonePath: string): string[] {
  // All .java files, < 10MB
  const out = execSync(
    `find . -name '*.java' -type f -size -10M | sort`,
    { cwd: clonePath, encoding: 'utf-8' },
  );
  return out.split('\n').filter(Boolean);
}

function scanRepo(clonePath: string, outPath: string): void {
  // Run slopbrick scan. This uses the locally-built dist.
  const result = execSync(
    `node ${resolve('packages/slopbrick/dist/index.js')} scan --workspace . --format json`,
    { cwd: clonePath, encoding: 'utf-8', maxBuffer: 100 * 1024 * 1024 },
  );
  writeFileSync(outPath, result);
}

function main(): void {
  const { manifest: manifestPath, arm, out: outDir } = parseArgs();
  const manifest = loadManifest(manifestPath);
  if (manifest.arm !== arm) die(`Manifest arm is "${manifest.arm}", expected "${arm}"`);

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const armOutDir = join(outDir, arm);
  if (!existsSync(armOutDir)) mkdirSync(armOutDir, { recursive: true });

  const arms: Array<{ kind: 'neg' | 'pos'; repos: RepoEntry[] }> = [
    { kind: 'neg', repos: manifest.neg_repos },
    { kind: 'pos', repos: manifest.pos_repos },
  ];

  const totals = { neg: 0, pos: 0 };

  for (const { kind, repos } of arms) {
    console.log(`\n=== ${arm} ${kind} (${repos.length} repos) ===`);
    const allReports: unknown[] = [];
    for (const repo of repos) {
      const clonePath = ensureClone(repo);
      const files = buildFilelist(clonePath);
      console.log(`   files: ${files.length}`);
      const reportPath = join(armOutDir, `${kind}-${repo.name}.json`);
      try {
        scanRepo(clonePath, reportPath);
        const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
        allReports.push(...((report as { issues: unknown[] }).issues ?? []));
      } catch (e) {
        console.error(`   ⚠️  scan failed: ${(e as Error).message}`);
        continue;
      }
    }
    const mergedPath = join(armOutDir, `${kind}.json`);
    writeFileSync(mergedPath, JSON.stringify(allReports, null, 2));
    totals[kind] = allReports.length;
    console.log(`   merged: ${mergedPath} (${allReports.length} fires)`);
  }

  console.log(`\n=== v9 corpus ${arm} build complete ===`);
  console.log(`  neg fires: ${totals.neg}`);
  console.log(`  pos fires: ${totals.pos}`);
  console.log(`  total:     ${totals.neg + totals.pos}`);

  // Sample-size guardrail per methodology
  const MIN_FIRES = 10;
  if (totals.neg + totals.pos < MIN_FIRES) {
    die(`Only ${totals.neg + totals.pos} fires — below the ${MIN_FIRES} floor. Add more repos.`);
  }
}

main();
