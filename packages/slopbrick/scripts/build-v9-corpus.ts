#!/usr/bin/env -S npx tsx
/**
 * build-v9-corpus — fetch repos from a v9 corpus manifest and emit
 * per-arm fire logs for the v8.5 calibration script.
 *
 * Usage (one example per arm; copy the matching template to a
 * corpus-manifest-<arm>.local.json first, then fill in
 * local_clone_path per repo):
 *
 *   tsx scripts/build-v9-corpus.ts --manifest corpus-manifest-java.local.json --arm java
 *   tsx scripts/build-v9-corpus.ts --manifest corpus-manifest-kotlin.local.json --arm kotlin
 *   tsx scripts/build-v9-corpus.ts --manifest corpus-manifest-swift.local.json --arm swift
 *   tsx scripts/build-v9-corpus.ts --manifest corpus-manifest-cpp.local.json --arm cpp
 *
 * Optional flags: --ext <a,b,c>, --skip-dirs <d,e,f>, --out <dir>.
 *
 * Outputs (fires.json shape — same as scripts/compute-v85-calibration.py expects):
 *   <out>/<arm>/<kind>-<repo>.json       per-repo debug
 *   <out>/<arm>/v9-<arm>-<neg|pos>.json  merged per arm
 *   /tmp/v9-<arm>-<neg|pos>-fires.json   calibration mirror
 *
 * Sample-size guardrails enforced (per methodology-minimum-sample-size.md):
 *   - ≥10,000 files per arm, ≥10 fires per DORMANT rule, parse-failure rate <5%.
 *
 * Blocker: Kotlin/Swift/C++ corpus runs need the UNSUPPORTED_LANGS
 * guard in src/engine/worker.ts lifted (and visitor implementations)
 * so scanFile() actually parses those extensions. The script refactor
 * itself is language-agnostic.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config/index.js';
import { RuleRegistry } from '../src/rules/registry.js';
import { scanFile } from '../src/engine/worker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO = join(__dirname, '..');

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
  /** v0.24.0: extensions to scan (no leading dot). Falls back to defaultExtensionsForArm(). */
  language_extensions?: string[];
  /** v0.24.0: per-file size cap in MB. Default 1.0. */
  file_size_cap_mb?: number;
  neg_repos: RepoEntry[];
  pos_repos: RepoEntry[];
}

interface FiresJson {
  kind: 'neg' | 'pos';
  workspace: string;
  files: number;
  issueCount: number;
  uniqueRules: number;
  fires: Record<string, number>;
  perFileFires: Record<string, string[]>;
  /** v0.24.0: parse-failure count. */
  parseFailed?: number;
}

interface ScanAccum {
  kind: 'neg' | 'pos';
  workspace: string;
  files: number;
  issueCount: number;
  fires: Record<string, number>;
  perFileFires: Record<string, Set<string>>;
  parseFailed: number;
}

const DEFAULT_SKIP_DIRS = [
  'node_modules', 'dist', 'build', '.git', 'target', '.gradle',
  '.idea', '.swiftpm', 'DerivedData', 'vendor', '.vs', 'out',
];

/** Fallback extensions when the manifest omits language_extensions (pre-v0.24.0). */
function defaultExtensionsForArm(arm: string): string[] {
  switch (arm) {
    case 'java': return ['java'];
    case 'kotlin': return ['kt', 'kts'];
    case 'swift': return ['swift'];
    case 'cpp': return ['cpp', 'cc', 'cxx', 'c++', 'h', 'hpp', 'hh', 'hxx', 'H'];
    default: return [];
  }
}

function die(msg: string): never {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

function parseArgs(): {
  manifest: string;
  arm: string;
  out: string;
  extOverride?: string[];
  skipDirs?: string[];
  dryRun?: boolean;
  /** Rule-ID prefixes to keep in the registry (e.g. ['java/']). Default: ['arm/']. */
  rulePrefixes?: string[];
  /** Pass-through false to keep ALL rules (default keeps only arm-scoped rules). */
  keepAllRules?: boolean;
} {
  const args = process.argv.slice(2);
  let manifest = 'corpus-manifest.local.json';
  let arm = 'java';
  let out = './v9-fires';
  let extOverride: string[] | undefined;
  let skipDirs: string[] | undefined;
  let dryRun = false;
  let keepAllRules = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--manifest') manifest = args[++i];
    else if (a === '--arm') arm = args[++i];
    else if (a === '--out') out = args[++i];
    else if (a === '--ext') extOverride = args[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--skip-dirs') skipDirs = args[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--dry-run') dryRun = true;
    else if (a === '--keep-all-rules') keepAllRules = true;
    else if (a === '-h' || a === '--help') {
      console.log(
        [
          'Usage: tsx build-v9-corpus.ts [options]',
          '',
          'Options:',
          '  --manifest <path>     Path to corpus-manifest-<arm>.local.json (default: corpus-manifest.local.json)',
          '  --arm <name>          java | kotlin | swift | cpp (default: java)',
          '  --out <dir>           Output directory (default: ./v9-fires)',
          '  --ext <a,b,c>         Override manifest language_extensions',
          '  --skip-dirs <d,e,f>   Override default skip-dirs list',
          '  --dry-run             Build filelists only, skip the actual scan (verification aid)',
          '  --keep-all-rules      Disable the per-arm rule filter (run all 134 rules; ~10x slower)',
          '',
          'Outputs:',
          '  <out>/<arm>/<kind>-<repo>.json       per-repo debug (fires.json shape)',
          '  <out>/<arm>/v9-<arm>-<neg|pos>.json  merged per arm (fires.json shape)',
          '  /tmp/v9-<arm>-<neg|pos>-fires.json   calibration-script mirror',
          '',
          'Guardrails: ≥10k files per arm, ≥10 fires per DORMANT rule, <5% parse-failure rate.',
          '',
          'Default registry filter: keep only rules whose ID starts with `<arm>/`',
          '(e.g. `java/*` for --arm java). The other 128 rules are TS/Go/Py/Rust/etc. and',
          'produce noise on `.java` files. Pass --keep-all-rules to disable the filter.',
          '',
          'Examples:',
          '  tsx build-v9-corpus.ts --manifest corpus-manifest-java.local.json --arm java',
          '  tsx build-v9-corpus.ts --manifest corpus-manifest-cpp.local.json --arm cpp',
          '  tsx build-v9-corpus.ts --manifest corpus-manifest-java.local.json --arm java --dry-run',
          '  tsx build-v9-corpus.ts --manifest corpus-manifest-java.local.json --arm java --keep-all-rules',
        ].join('\n'),
      );
      process.exit(0);
    }
  }
  return { manifest, arm, out, extOverride, skipDirs, dryRun, keepAllRules };
}

function loadManifest(path: string): CorpusManifest {
  if (!existsSync(path)) {
    die(`Manifest not found: ${path}\nCopy v9-corpus-manifest-<arm>.template.json to ${path} and fill in local_clone_path.`);
  }
  return JSON.parse(readFileSync(path, 'utf-8')) as CorpusManifest;
}

function ensureClone(repo: RepoEntry): string {
  if (!repo.local_clone_path) die(`Repo "${repo.name}" missing local_clone_path`);
  if (!existsSync(repo.local_clone_path)) {
    die(`Repo "${repo.name}" local_clone_path does not exist: ${repo.local_clone_path}\nRun: git clone ${repo.url} ${repo.local_clone_path}`);
  }
  console.log(`\n→ ${repo.name} (${repo.local_clone_path})`);
  try {
    execSync('git fetch --unshallow', { cwd: repo.local_clone_path, stdio: 'pipe' });
  } catch { /* already shallow or no remote — ignore */ }
  try {
    execSync(`git checkout ${repo.checkout}`, { cwd: repo.local_clone_path, stdio: 'pipe' });
  } catch (e) {
    die(`Failed to checkout ${repo.checkout} for ${repo.name}: ${(e as Error).message}`);
  }
  return repo.local_clone_path;
}

/**
 * v0.24.0: build a sorted filelist with `find`, honoring
 * language_extensions, file_size_cap_mb, and skip-dirs. For multi-
 * extension arms (C++ has 9) the OR'd -name tests are wrapped in
 * parentheses so the size cap applies to the union, not just the
 * last -name clause.
 */
function buildFilelist(
  clonePath: string,
  extensions: string[],
  sizeCapMb: number,
  skipDirs: string[],
): string[] {
  if (extensions.length === 0) {
    die(`No extensions for ${clonePath}. Check manifest language_extensions or --ext flag.`);
  }
  const nameClauses = extensions.map((ext) => `-name '*.${ext}'`).join(' -o ');
  const dirClauses = skipDirs.map((d) => `-not -path '*/${d}/*' -not -path '*/${d}'`).join(' ');
  const cmd = `find . \\( ${nameClauses} \\) -type f -size -${sizeCapMb}M ${dirClauses} | sort`;
  let out: string;
  try {
    // v0.24.5: bump stdio buffer to 64 MB. The JDK-11 corpus (41k+ paths)
    // produced ~2.5 MB of stdout which exceeded Node's default 1 MB
    // execSync buffer and triggered ENOBUFS. The previous failure mode
    // was a hard `die()` mid-build; this keeps the build going on
    // large repos like openjdk/jdk.
    out = execSync(cmd, { cwd: clonePath, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    die(`find failed for ${clonePath}: ${(e as Error).message}`);
  }
  return out.split('\n').filter(Boolean);
}

/**
 * v0.24.0: list DORMANT rules for an arm by reading signal-strength.json.
 * Returns full rule IDs ("arm/name"). Empty when no signal-strength
 * file or no DORMANT entries for the arm — guardrail becomes vacuous.
 */
function listDormantRules(arm: string): string[] {
  const signalPath = join(REPO, 'src', 'rules', 'signal-strength.json');
  if (!existsSync(signalPath)) return [];
  const data = JSON.parse(readFileSync(signalPath, 'utf-8')) as Record<string, { verdict?: string }>;
  const prefix = `${arm}/`;
  const out: string[] = [];
  for (const [ruleId, entry] of Object.entries(data)) {
    if (ruleId.startsWith(prefix) && entry.verdict === 'DORMANT') out.push(ruleId);
  }
  return out;
}

function makeAccum(kind: 'neg' | 'pos', workspace: string): ScanAccum {
  return { kind, workspace, files: 0, issueCount: 0, fires: {}, perFileFires: {}, parseFailed: 0 };
}

function addFires(accum: ScanAccum, file: string, issues: { ruleId: string }[]): void {
  for (const issue of issues) {
    accum.fires[issue.ruleId] = (accum.fires[issue.ruleId] ?? 0) + 1;
    let bucket = accum.perFileFires[issue.ruleId];
    if (!bucket) {
      bucket = new Set<string>();
      accum.perFileFires[issue.ruleId] = bucket;
    }
    bucket.add(file);
  }
}

function accumToJson(accum: ScanAccum): FiresJson {
  return {
    kind: accum.kind,
    workspace: accum.workspace,
    files: accum.files,
    issueCount: accum.issueCount,
    uniqueRules: Object.keys(accum.fires).length,
    fires: accum.fires,
    perFileFires: Object.fromEntries(
      Object.entries(accum.perFileFires).map(([k, v]) => [k, Array.from(v)]),
    ),
    parseFailed: accum.parseFailed,
  };
}

/**
 * v0.24.0: scan one repo's filelist via the Node-callable
 * scanFile() API, mirroring scan-corpus-with-filelist.ts:105-129.
 * A file that throws or returns `parseError` increments parseFailed
 * and is skipped.
 */
async function scanRepo(
  clonePath: string,
  files: string[],
  config: Awaited<ReturnType<typeof loadConfig>>,
  registry: RuleRegistry,
  accum: ScanAccum,
): Promise<void> {
  let i = 0;
  const t0 = Date.now();
  for (const rel of files) {
    i++;
    const abs = join(clonePath, rel);
    try {
      const result = await scanFile(abs, config, registry, dirname(abs));
      if (result.parseError) {
        accum.parseFailed += 1;
        if (i % 500 === 0 || i === files.length) {
          console.error(`  parse-fail [${i}/${files.length}]: ${rel.slice(0, 80)}`);
        }
        continue;
      }
      accum.files += 1;
      accum.issueCount += result.issues.length;
      addFires(accum, rel, result.issues);
      if (i % 500 === 0) {
        const elapsed = (Date.now() - t0) / 1000;
        const rate = i / elapsed;
        const eta = (files.length - i) / rate;
        console.error(`  [${i}/${files.length}] ${rate.toFixed(1)} files/s, ETA ${eta.toFixed(0)}s, ${accum.issueCount} issues, ${accum.parseFailed} parse-failures`);
      }
    } catch (e) {
      accum.parseFailed += 1;
      console.error(`  FAILED [${i}/${files.length}]: ${rel} (${(e as Error).message})`);
    }
  }
}

function mergeAccums(into: ScanAccum, from: ScanAccum): void {
  into.files += from.files;
  into.issueCount += from.issueCount;
  into.parseFailed += from.parseFailed;
  for (const [ruleId, count] of Object.entries(from.fires)) {
    into.fires[ruleId] = (into.fires[ruleId] ?? 0) + count;
  }
  for (const [ruleId, files] of Object.entries(from.perFileFires)) {
    let bucket = into.perFileFires[ruleId];
    if (!bucket) {
      bucket = new Set<string>();
      into.perFileFires[ruleId] = bucket;
    }
    for (const f of files) bucket.add(f);
  }
}

async function main(): Promise<void> {
  const { manifest: manifestPath, arm, out: outDir, extOverride, skipDirs, dryRun } = parseArgs();
  const { manifest: manifestPath, arm, out: outDir, extOverride, skipDirs, dryRun, keepAllRules } = parseArgs();
  const manifest = loadManifest(manifestPath);
  if (manifest.arm !== arm) die(`Manifest arm is "${manifest.arm}", expected "${arm}"`);

  const extensions = extOverride ?? manifest.language_extensions ?? defaultExtensionsForArm(arm);
  if (extensions.length === 0) {
    die(`No language_extensions for arm="${arm}". Pass --ext or add language_extensions[] to the manifest.`);
  }
  const sizeCapMb = manifest.file_size_cap_mb ?? 1.0;
  const skipDirsFinal = skipDirs ?? DEFAULT_SKIP_DIRS;
  const dormantRules = listDormantRules(arm);

  console.log(`[build-v9-corpus] arm=${arm}, extensions=[${extensions.join(',')}], cap=${sizeCapMb}MB`);
  console.log(`[build-v9-corpus] DORMANT rules for arm=${arm}: ${dormantRules.length > 0 ? dormantRules.join(', ') : '(none — guardrail vacuous)'}`);
  if (dryRun) console.log('[build-v9-corpus] DRY-RUN: building filelists only, skipping the scan');

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const armOutDir = join(outDir, arm);
  if (!existsSync(armOutDir)) mkdirSync(armOutDir, { recursive: true });

  const config = await loadConfig(REPO);
  const registry = new RuleRegistry();
  registry.loadBuiltins();
  // v0.24.5: per-arm rule filter. Running all 134 rules on every Java file
  // produces noise (TS/Go/Py/Rust rules produce spurious fires on Java source
  // — e.g. ai/whitespace-regularity triggering on Java import blocks) and
  // slows the corpus build ~10x (5 files/sec vs 50). Default: keep only
  // rules whose ID starts with `<arm>/`. The user can override with
  // --keep-all-rules if they want full cross-rule visibility into Java.
  if (!keepAllRules) {
    const before = registry.all().length;
    registry.removeWhere((rule) => !rule.id.startsWith(`${arm}/`));
    console.log(`[build-v9-corpus] registry: ${registry.all().length} rules loaded (filtered from ${before} to ${arm}/* only; pass --keep-all-rules to disable)`);
  } else {
    console.log(`[build-v9-corpus] registry: ${registry.all().length} rules loaded (no filter — --keep-all-rules)`);
  }

  const armAccums: Record<'neg' | 'pos', ScanAccum> = {
    neg: makeAccum('neg', manifestPath),
    pos: makeAccum('pos', manifestPath),
  };

  for (const { kind, repos } of [
    { kind: 'neg' as const, repos: manifest.neg_repos },
    { kind: 'pos' as const, repos: manifest.pos_repos },
  ]) {
    console.log(`\n=== ${arm} ${kind} (${repos.length} repos) ===`);
    for (const repo of repos) {
      const clonePath = ensureClone(repo);
      const files = buildFilelist(clonePath, extensions, sizeCapMb, skipDirsFinal);
      console.log(`   ${repo.name}: ${files.length} files in filelist`);
      if (dryRun) continue;
      const repoAccum = makeAccum(kind, repo.name);
      await scanRepo(clonePath, files, config, registry, repoAccum);

      writeFileSync(
        join(armOutDir, `${kind}-${repo.name}.json`),
        JSON.stringify(accumToJson(repoAccum), null, 2),
      );
      mergeAccums(armAccums[kind], repoAccum);
    }
    console.log(`   ${kind} merged: ${armAccums[kind].files} files, ${armAccums[kind].issueCount} issues, ${armAccums[kind].parseFailed} parse-failures, ${Object.keys(armAccums[kind].fires).length} unique rules`);
  }

  if (dryRun) {
    console.log('\n[build-v9-corpus] DRY-RUN complete — no scan was performed, no fires.json written.');
    return;
  }

  // Write per-arm merged output: user-facing filename + calibration mirror.
  for (const kind of ['neg', 'pos'] as const) {
    const payload = JSON.stringify(accumToJson(armAccums[kind]), null, 2);
    const userFacing = join(armOutDir, `v9-${arm}-${kind}.json`);
    const calibrationMirror = `/tmp/v9-${arm}-${kind}-fires.json`;
    writeFileSync(userFacing, payload);
    writeFileSync(calibrationMirror, payload);
    console.log(`[build-v9-corpus] ${arm} ${kind}: ${userFacing} + ${calibrationMirror}`);
  }

  // Summary.
  const totalFiles = armAccums.neg.files + armAccums.pos.files;
  const totalIssues = armAccums.neg.issueCount + armAccums.pos.issueCount;
  const totalParseFailed = armAccums.neg.parseFailed + armAccums.pos.parseFailed;
  const parseFailRate = totalFiles + totalParseFailed === 0 ? 0 : totalParseFailed / (totalFiles + totalParseFailed);

  console.log(`\n=== v9 corpus ${arm} build complete ===`);
  console.log(`  files:        ${totalFiles} (neg=${armAccums.neg.files}, pos=${armAccums.pos.files})`);
  console.log(`  issues:       ${totalIssues} (neg=${armAccums.neg.issueCount}, pos=${armAccums.pos.issueCount})`);
  console.log(`  parse-fail:   ${totalParseFailed} (${(parseFailRate * 100).toFixed(2)}%)`);

  // Sample-size guardrails per methodology-minimum-sample-size.md.
  const MIN_FILES_PER_ARM = 10_000;
  const MIN_FIRES_PER_RULE = 10;
  const MAX_PARSE_FAIL_RATE = 0.05;
  let anyGuardrailFailed = false;

  // (a) ≥10,000 files per arm.
  for (const kind of ['neg', 'pos'] as const) {
    if (armAccums[kind].files < MIN_FILES_PER_ARM) {
      console.warn(`⚠️  INSUFFICIENT_DATA: ${arm} ${kind} has ${armAccums[kind].files} files, below the ${MIN_FILES_PER_ARM} floor.`);
      anyGuardrailFailed = true;
    }
  }

  // (b) ≥10 total fires for each DORMANT rule.
  if (dormantRules.length > 0) {
    const mergedFires: Record<string, number> = { ...armAccums.neg.fires };
    for (const [r, c] of Object.entries(armAccums.pos.fires)) mergedFires[r] = (mergedFires[r] ?? 0) + c;
    for (const ruleId of dormantRules) {
      const count = mergedFires[ruleId] ?? 0;
      if (count < MIN_FIRES_PER_RULE) {
        console.warn(`⚠️  INSUFFICIENT_DATA: DORMANT rule ${ruleId} has ${count} fires (below the ${MIN_FIRES_PER_RULE} floor).`);
        anyGuardrailFailed = true;
      }
    }
  }

  // (c) parse-failure rate <5%. Hard error per v9-plan Part 6.
  if (parseFailRate >= MAX_PARSE_FAIL_RATE) {
    die(`Parse-failure rate ${(parseFailRate * 100).toFixed(2)}% exceeds the ${(MAX_PARSE_FAIL_RATE * 100).toFixed(0)}% floor. Arm=${arm}. Try smaller cap, exclude broken repos, or lite parser mode.`);
  }

  console.log(anyGuardrailFailed
    ? `\n[build-v9-corpus] One or more guardrails failed. Run calibration anyway for INSUFFICIENT_DATA verdicts, or expand the corpus and re-run.`
    : `\n[build-v9-corpus] All sample-size guardrails passed.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});