/**
 * Collect raw drift signals from a curated set of Python + Go repos for
 * the v0.9.2 phase-6 calibration. The output is then hand-labeled
 * (see docs/research/drift-calibration-v0.9.2.md) and fed back into
 * scripts/compute-drift-calibration.ts to produce precision/recall/FPR.
 *
 * Run with:
 *   node --import tsx scripts/collect-drift-signals.ts
 *
 * Output: /tmp/drift-calibration/raw.json
 *
 * Why a script (not a test)? The scan output is multi-MB per repo;
 * keeping it out of the vitest run makes the calibration iterative —
 * re-run after tweaking SUFFIXES_TO_STRIP without re-running 1,200
 * tests. The hand-labeling step happens in a sibling JSON file edited
 * by the calibrator (a human), and the metrics are produced by the
 * sibling compute script.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

interface RepoTarget {
  /** Human-readable label used in the report. */
  label: string;
  /** Corpus partition: 'positive' (AI-authored) or 'negative' (human). */
  partition: 'positive' | 'negative';
  /** Language family for per-lang aggregation. */
  language: 'python' | 'go';
  /** Absolute path on disk. */
  path: string;
  /**
   * Globs passed as `--exclude` to slopbrick scan so we measure
   * precision on PRODUCTION code only, not on tutorial/docs/tests
   * directories where duplicate routes / patterns are intentional.
   * Phase-6 finding: tutorial folders are the dominant FP source for
   * the `route` category. Excluding them gives the user-side
   * workaround numbers.
   */
  productionOnlyExclude?: string[];
}

const PRODUCTION_EXCLUDES = [
  // The Phase-6 calibration found that these directories are the dominant
  // source of route-category FPs: tutorial / docs / tests files intentionally
  // repeat route paths for pedagogy. Excluding them gives the user-side
  // precision a real production codebase would see.
  'docs/**',
  'docs_src/**',
  'docs-src/**',
  'documentation/**',
  'examples/**',
  'tutorials/**',
  'demos/**',
  'playground/**',
  'benchmarks/**',
  'bench/**',
  'fixtures/**',
  'testdata/**',
  'tests/**',
  '__tests__/**',
  '**/test/**',
  '**/test_*.py',
  '**/*_test.go',
  '**/*_test.py',
  '**/*.test.ts',
  '**/*.test.tsx',
  'pending_tests/**',
  'test_modules_same_name_body/**',
  '.github/**',
] as const;

const REPOS: RepoTarget[] = [
  // Python positive (AI-authored) — expect more drift if drift is an AI tell.
  {
    label: 'chatgpt-retrieval-plugin',
    partition: 'positive',
    language: 'python',
    path: '/Users/cheng/corpus-expansion/positive/python-ai/chatgpt-retrieval-plugin',
    productionOnlyExclude: [...PRODUCTION_EXCLUDES],
  },
  {
    label: 'fastapi (ai-fork)',
    partition: 'positive',
    language: 'python',
    path: '/Users/cheng/corpus-expansion/positive/python-ai/fastapi',
    productionOnlyExclude: [...PRODUCTION_EXCLUDES],
  },
  {
    label: 'axolotl',
    partition: 'positive',
    language: 'python',
    path: '/Users/cheng/corpus-expansion/positive/python-ai/axolotl',
    productionOnlyExclude: [...PRODUCTION_EXCLUDES],
  },
  // Python negative (human-written, popular OSS) — expect less drift.
  {
    label: 'click',
    partition: 'negative',
    language: 'python',
    path: '/Users/cheng/corpus-expansion/negative/python/click',
    productionOnlyExclude: [...PRODUCTION_EXCLUDES],
  },
  {
    label: 'pyjwt',
    partition: 'negative',
    language: 'python',
    path: '/Users/cheng/corpus-expansion/negative/python/pyjwt',
    productionOnlyExclude: [...PRODUCTION_EXCLUDES],
  },
  {
    label: 'sqlalchemy',
    partition: 'negative',
    language: 'python',
    path: '/Users/cheng/corpus-expansion/negative/python/sqlalchemy',
    productionOnlyExclude: [...PRODUCTION_EXCLUDES],
  },
  // Go positive (AI-authored).
  {
    label: 'langchaingo',
    partition: 'positive',
    language: 'go',
    path: '/Users/cheng/corpus-expansion/positive/go-ai/langchaingo',
    productionOnlyExclude: [...PRODUCTION_EXCLUDES],
  },
  {
    label: 'go-gin-clean-starter',
    partition: 'positive',
    language: 'go',
    path: '/Users/cheng/corpus-expansion/positive/go-ai/go-gin-clean-starter',
    productionOnlyExclude: [...PRODUCTION_EXCLUDES],
  },
  // Go negative (human-written, popular OSS).
  {
    label: 'cobra',
    partition: 'negative',
    language: 'go',
    path: '/Users/cheng/corpus-expansion/negative/go/cobra',
    productionOnlyExclude: [...PRODUCTION_EXCLUDES],
  },
  {
    label: 'client_golang',
    partition: 'negative',
    language: 'go',
    path: '/Users/cheng/corpus-expansion/negative/go/client_golang',
    productionOnlyExclude: [...PRODUCTION_EXCLUDES],
  },
];

interface ScanJson {
  architectureConsistency?: number;
  architectureDeductions?: Array<{
    category: string;
    count: number;
    weight: number;
    deduction: number;
    summary: string;
  }>;
  crossFileDrift?: Array<{
    category: string;
    stem: string;
    variants: string[];
    files: string[];
  }>;
  crossCategoryDrift?: Array<{
    stem: string;
    byCategory: Record<string, string[]>;
    files: string[];
  }>;
  fileCount?: number;
}

interface CollectedSignal {
  repo: string;
  partition: 'positive' | 'negative';
  language: 'python' | 'go';
  category: string;
  stem: string;
  variants: string[];
  files: string[];
  /** Whether this signal crosses 2+ categories (cross-category). */
  crossCategory: boolean;
}

interface CollectedRepo {
  label: string;
  partition: 'positive' | 'negative';
  language: 'python' | 'go';
  path: string;
  scannedFiles: number;
  architectureConsistency: number | null;
  crossFileDriftDeduction: number;
  crossCategoryDriftDeduction: number;
  signals: CollectedSignal[];
  error?: string;
}

function scanRepo(repo: RepoTarget): CollectedRepo {
  const result: CollectedRepo = {
    label: repo.label,
    partition: repo.partition,
    language: repo.language,
    path: repo.path,
    scannedFiles: 0,
    architectureConsistency: null,
    crossFileDriftDeduction: 0,
    crossCategoryDriftDeduction: 0,
    signals: [],
  };
  if (!existsSync(repo.path)) {
    result.error = 'path not found';
    return result;
  }
  const jsonPath = `/tmp/drift-calibration/scan-${repo.label.replace(/[^a-z0-9]/gi, '_')}.json`;
  // Each scan runs twice when productionOnlyExclude is set: once on
  // the full repo (the "raw" measurement, what users see today) and
  // once with tutorial/docs/tests excluded (the "production-only"
  // measurement, what users would see after configuring excludes).
  // The first scan keeps the existing `result` shape; the second
  // scan replaces the counts if it succeeds. We keep both because
  // the user wants to see how the exclude config changes precision.
  const runs: Array<{ suffix: string; excludes?: string[] }> = [{ suffix: 'raw' }];
  if (repo.productionOnlyExclude && repo.productionOnlyExclude.length > 0) {
    runs.push({ suffix: 'prod', excludes: repo.productionOnlyExclude });
  }
  for (const run of runs) {
    const args: string[] = [
      '/Users/cheng/slopbrick/bin/slopbrick.js',
      'scan',
      '--workspace',
      repo.path,
      '--json',
      jsonPath,
      '--no-telemetry',
      '--quiet',
    ];
    if (run.excludes) {
      for (const ex of run.excludes) {
        args.push('--exclude', ex);
      }
    }
    try {
      execFileSync('node', args, { stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 });
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; status?: number };
      const status = e.status ?? 1;
      if (status !== 1 && status !== 2) {
        if (run.suffix === 'raw') {
          result.error = `scan crashed (status ${status}): ${(e.stderr ?? '').slice(0, 500)}`;
          return result;
        }
        // For the prod run we tolerate failure — the raw measurement
        // is the fallback.
        continue;
      }
      if (!existsSync(jsonPath)) {
        if (run.suffix === 'raw') {
          result.error = `no JSON output: ${(e.stderr ?? e.stdout ?? '').slice(0, 500)}`;
          return result;
        }
        continue;
      }
    }
    let parsed: ScanJson;
    try {
      parsed = JSON.parse(readFileSync(jsonPath, 'utf8')) as ScanJson;
    } catch (err) {
      if (run.suffix === 'raw') {
        result.error = `JSON parse failed: ${(err as Error).message}`;
        return result;
      }
      continue;
    }
    if (run.suffix === 'raw') {
      result.scannedFiles = parsed.fileCount ?? 0;
      result.architectureConsistency = parsed.architectureConsistency ?? null;
      const cfDed = parsed.architectureDeductions?.find((d) => d.category === 'crossFileDrift');
      result.crossFileDriftDeduction = cfDed?.deduction ?? 0;
      const ccDed = parsed.architectureDeductions?.find((d) => d.category === 'crossCategoryDrift');
      result.crossCategoryDriftDeduction = ccDed?.deduction ?? 0;
      const crossCategoryStems = new Set(
        (parsed.crossCategoryDrift ?? []).map((d) => d.stem),
      );
      for (const sig of parsed.crossFileDrift ?? []) {
        result.signals.push({
          repo: repo.label,
          partition: repo.partition,
          language: repo.language,
          category: sig.category,
          stem: sig.stem,
          variants: sig.variants,
          files: sig.files,
          crossCategory: crossCategoryStems.has(sig.stem),
        });
      }
    } else {
      // prod run: store under separate field on the result.
      (result as CollectedRepo & { prodRun?: CollectedRepo }).prodRun = {
        label: `${repo.label} (prod-only)`,
        partition: repo.partition,
        language: repo.language,
        path: repo.path,
        scannedFiles: parsed.fileCount ?? 0,
        architectureConsistency: parsed.architectureConsistency ?? null,
        crossFileDriftDeduction:
          parsed.architectureDeductions?.find((d) => d.category === 'crossFileDrift')?.deduction ?? 0,
        crossCategoryDriftDeduction:
          parsed.architectureDeductions?.find((d) => d.category === 'crossCategoryDrift')
            ?.deduction ?? 0,
        signals: (parsed.crossFileDrift ?? []).map((sig) => ({
          repo: repo.label,
          partition: repo.partition,
          language: repo.language,
          category: sig.category,
          stem: sig.stem,
          variants: sig.variants,
          files: sig.files,
          crossCategory: (parsed.crossCategoryDrift ?? []).some((d) => d.stem === sig.stem),
        })),
      };
    }
  }
  return result;
}

function main(): void {
  const outDir = '/tmp/drift-calibration';
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  // Clear only the auto-generated scan outputs and the raw.json we own.
  // Preserve labels.json (hand-maintained by the calibrator).
  for (const f of ['raw.json']) {
    const p = join(outDir, f);
    if (existsSync(p)) rmSync(p);
  }
  const repos: CollectedRepo[] = [];
  for (const repo of REPOS) {
    process.stdout.write(`scanning ${repo.label}... `);
    const r = scanRepo(repo);
    if (r.error) {
      console.log(`ERROR: ${r.error}`);
    } else {
      const prod = (r as CollectedRepo & { prodRun?: CollectedRepo }).prodRun;
      const prodSummary = prod
        ? `; prod-only=${prod.signals.length}/${prod.scannedFiles}`
        : '';
      console.log(
        `${r.signals.length} signals (${r.scannedFiles} files), arch=${r.architectureConsistency}, drift=-${r.crossFileDriftDeduction}${prodSummary}`,
      );
    }
    repos.push(r);
  }
  const flatSignals: CollectedSignal[] = [];
  const flatProdSignals: CollectedSignal[] = [];
  for (const r of repos) {
    flatSignals.push(...r.signals);
    const prod = (r as CollectedRepo & { prodRun?: CollectedRepo }).prodRun;
    if (prod) flatProdSignals.push(...prod.signals);
  }
  const output = {
    collectedAt: new Date().toISOString(),
    repos,
    signals: flatSignals,
    prodSignals: flatProdSignals,
  };
  writeFileSync(join(outDir, 'raw.json'), JSON.stringify(output, null, 2));
  // eslint-disable-next-line no-console
  console.log(
    `\nWrote ${outDir}/raw.json (${flatSignals.length} raw signals, ${flatProdSignals.length} prod-only signals across ${repos.length} repos)`,
  );
  // Print a summary table for the calibrator to triage.
  console.log('\n=== Summary ===');
  for (const r of repos) {
    const status = r.error ? `ERROR: ${r.error}` : `arch=${r.architectureConsistency} signals=${r.signals.length}`;
    console.log(`  ${r.label.padEnd(28)} [${r.partition}/${r.language}] ${status}`);
  }
}

main();
