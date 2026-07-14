#!/usr/bin/env npx tsx
/**
 * v0.12.1: Compute corpus baselines for the 3 calibration rules
 * (heaps-deviation, zipf-slope-anomaly, ks-distribution-shift).
 *
 * Walks the negative arm of the corpus, samples N files, computes per-file
 * features, aggregates per-feature distributions, and writes
 * `src/engine/corpus-baselines.json`.
 *
 * Why this exists: the 3 calibration rules shipped with hardcoded baselines
 * (λ=0.5, s=1.0, fixed reference vectors). On the v6 full-corpus
 * calibration, all 3 turned out to be INVERTED — they fired more on
 * human code than on AI code, because the baselines didn't match the
 * actual corpus. This script fixes that by computing baselines from the
 * corpus itself.
 *
 * Usage:
 *   tsx scripts/compute-corpus-baselines.ts <workspace> [sample-size]
 *
 * Example:
 *   tsx scripts/compute-corpus-baselines.ts \
 *     /Users/cheng/corpus-expansion/v5/scan/v6-full-neg 10000
 */
import { writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  computeHeapsExponent,
  computeZipfExponent,
  parseSource,
  tokenizeIdentifiers,
} from '@usebrick/engine';
import {
  countNonEmptyJsLines,
  countSwcCommentLines,
  hasFullSourceSwcCommentAst,
  JS_COMMENT_LINE_METRIC_ID,
} from '../src/engine/js-comment-lines.js';

const [, , workspace, sampleArg] = process.argv;
if (!workspace) {
  console.error('Usage: compute-corpus-baselines.ts <workspace> [sample-size]');
  process.exit(1);
}
const SAMPLE_SIZE = sampleArg ? parseInt(sampleArg, 10) : 10000;
const absWorkspace = resolve(workspace);

const JS_COMMENT_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']);
const SOURCE_EXT = new Set([
  ...JS_COMMENT_EXT,
  '.vue',
  '.svelte',
  '.astro',
  '.html',
  '.py',
  '.go',
]);

function listFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    try {
      const s = statSync(full);
      if (s.isFile()) {
        const ext = entry.match(/\.[^.]+$/)?.[0] ?? '';
        if (SOURCE_EXT.has(ext.toLowerCase())) files.push(full);
      } else if (s.isDirectory()) {
        files.push(...listFiles(full));
      }
    } catch {}
  }
  return files;
}

function pickSample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  // Deterministic shuffle: every Nth element starting from random offset
  const offset = Math.floor(Math.random() * arr.length);
  const out: T[] = [];
  for (let i = 0; i < n; i++) {
    out.push(arr[(offset + i * 7) % arr.length]);
  }
  return out;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.floor(q * (sorted.length - 1));
  return sorted[idx];
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  const v = arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
  return Math.sqrt(v);
}

console.log(`Listing files in ${absWorkspace}...`);
const allFiles = listFiles(absWorkspace);
console.log(`Found ${allFiles.length} files. Sampling ${SAMPLE_SIZE}...`);
const sample = pickSample(allFiles, SAMPLE_SIZE);

// Accumulators
const lineLengthsAll: number[] = [];
const identifierLengthsAll: number[] = [];
const commentDensitiesAll: number[] = [];
const lambdaAll: number[] = [];
const zipfSAll: number[] = [];

let processed = 0;
let t0 = Date.now();
for (const file of sample) {
  try {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(file, 'utf8');

    // Per-file features
    const lines = source.split('\n');
    for (const line of lines) lineLengthsAll.push(line.length);

    const tokens = tokenizeIdentifiers(source);
    for (const t of tokens) identifierLengthsAll.push(t.length);

    // Comment density is meaningful only for the exact parser-backed
    // JS-family extractor used by ai/comment-ratio.
    const extension = file.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? '';
    if (JS_COMMENT_EXT.has(extension)) {
      try {
        const { ast } = parseSource(source, file);
        // Use the same admission guard as runtime fact extraction. This
        // excludes declaration placeholders (.d.ts/.d.mts/.d.cts) and any
        // other identity that parser-core did not parse as complete JS source.
        if (hasFullSourceSwcCommentAst(file, ast, source)) {
          const nonEmptyCount = countNonEmptyJsLines(source);
          const commentCount = countSwcCommentLines(ast, source);
          commentDensitiesAll.push(nonEmptyCount > 0 ? commentCount / nonEmptyCount : 0);
        }
      } catch {
        // The baseline must abstain when SWC cannot prove lexical structure.
      }
    }

    if (tokens.length >= 50) {
      const heaps = computeHeapsExponent(tokens);
      if (heaps.exponent > 0) lambdaAll.push(heaps.exponent);

      const freq = new Map<string, number>();
      for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
      if (freq.size >= 10) {
        const zipf = computeZipfExponent(freq);
        if (zipf.rSquared >= 0.5) zipfSAll.push(zipf.exponent);
      }
    }

    processed++;
    if (processed % 500 === 0) {
      const elapsed = (Date.now() - t0) / 1000;
      const rate = processed / elapsed;
      const eta = (SAMPLE_SIZE - processed) / rate;
      console.log(`  ${processed}/${SAMPLE_SIZE} (${elapsed.toFixed(0)}s, ${rate.toFixed(0)} files/s, ETA ${eta.toFixed(0)}s)`);
    }
  } catch (err) {
    // Skip files that fail to read
  }
}

console.log(`\nProcessed ${processed} files. Computing statistics...`);

// Downsample per-feature arrays for the KS baseline (10,000 points each)
function downsample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const out: T[] = [];
  const step = arr.length / n;
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
  return out;
}

const lineLengthsSorted = [...lineLengthsAll].sort((a, b) => a - b);
const identifierLengthsSorted = [...identifierLengthsAll].sort((a, b) => a - b);
const commentDensitiesSorted = [...commentDensitiesAll].sort((a, b) => a - b);
const lambdaSorted = [...lambdaAll].sort((a, b) => a - b);
const zipfSSorted = [...zipfSAll].sort((a, b) => a - b);

const baselines = {
  version: 1,
  generatedAt: new Date().toISOString(),
  corpusWorkspace: absWorkspace,
  sampleSize: SAMPLE_SIZE,
  extractors: {
    commentDensity: JS_COMMENT_LINE_METRIC_ID,
  },
  features: {
    lineLengths: {
      n: lineLengthsAll.length,
      mean: mean(lineLengthsAll),
      std: std(lineLengthsAll),
      p5: quantile(lineLengthsSorted, 0.05),
      p25: quantile(lineLengthsSorted, 0.25),
      p50: quantile(lineLengthsSorted, 0.5),
      p75: quantile(lineLengthsSorted, 0.75),
      p95: quantile(lineLengthsSorted, 0.95),
      p99: quantile(lineLengthsSorted, 0.99),
      // Down-sampled reference distribution for KS (10k points)
      sample: downsample(lineLengthsAll, 10000),
    },
    identifierLengths: {
      n: identifierLengthsAll.length,
      mean: mean(identifierLengthsAll),
      std: std(identifierLengthsAll),
      p5: quantile(identifierLengthsSorted, 0.05),
      p25: quantile(identifierLengthsSorted, 0.25),
      p50: quantile(identifierLengthsSorted, 0.5),
      p75: quantile(identifierLengthsSorted, 0.75),
      p95: quantile(identifierLengthsSorted, 0.95),
      p99: quantile(identifierLengthsSorted, 0.99),
      sample: downsample(identifierLengthsAll, 10000),
    },
    commentDensity: {
      n: commentDensitiesAll.length,
      mean: mean(commentDensitiesAll),
      std: std(commentDensitiesAll),
      p5: quantile(commentDensitiesSorted, 0.05),
      p50: quantile(commentDensitiesSorted, 0.5),
      p95: quantile(commentDensitiesSorted, 0.95),
      sample: downsample(commentDensitiesAll, 10000),
    },
    heaps: {
      n: lambdaAll.length,
      mean: mean(lambdaAll),
      std: std(lambdaAll),
      p5: quantile(lambdaSorted, 0.05),
      p50: quantile(lambdaSorted, 0.5),
      p95: quantile(lambdaSorted, 0.95),
    },
    zipf: {
      n: zipfSAll.length,
      mean: mean(zipfSAll),
      std: std(zipfSAll),
      p5: quantile(zipfSSorted, 0.05),
      p50: quantile(zipfSSorted, 0.5),
      p95: quantile(zipfSSorted, 0.95),
    },
  },
};

const outPath = resolve(import.meta.dirname ?? __dirname, '../src/engine/corpus-baselines.json');
writeFileSync(outPath, JSON.stringify(baselines, null, 2));
console.log(`\nWrote ${outPath}`);
console.log(`  Heaps λ: mean=${baselines.features.heaps.mean.toFixed(3)} std=${baselines.features.heaps.std.toFixed(3)} (n=${baselines.features.heaps.n})`);
console.log(`  Zipf s:  mean=${baselines.features.zipf.mean.toFixed(3)} std=${baselines.features.zipf.std.toFixed(3)} (n=${baselines.features.zipf.n})`);
console.log(`  Line length: mean=${baselines.features.lineLengths.mean.toFixed(1)} std=${baselines.features.lineLengths.std.toFixed(1)} (n=${baselines.features.lineLengths.n})`);
console.log(`  Identifier length: mean=${baselines.features.identifierLengths.mean.toFixed(2)} std=${baselines.features.identifierLengths.std.toFixed(2)} (n=${baselines.features.identifierLengths.n})`);
console.log(`  Comment density: mean=${baselines.features.commentDensity.mean.toFixed(3)} (n=${baselines.features.commentDensity.n})`);
