#!/usr/bin/env node
/**
 * v0.36.0: Find the intersection of hm_index across all 4 sources
 * (paired functions), sample 10k random pairs, and copy them to
 * a fresh subdir per source. This is the working set for v10
 * calibration — 40k files total, well within FD limits.
 */
import { mkdirSync, copyFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const SOURCES = ['human', 'chatgpt', 'dsc', 'qwen'];
const SAMPLE_SIZE = 10000;

function readBaseNames(dir) {
  return new Set(readdirSync(dir).filter((f) => f.endsWith('.java')).map((f) => f.replace(/\.java$/, '')));
}

function intersect(a, b, c, d) {
  const out = [];
  for (const x of a) if (b.has(x) && c.has(x) && d.has(x)) out.push(x);
  return out;
}

const sets = Object.fromEntries(SOURCES.map((s) => [s, readBaseNames(join(ROOT, s))]));
process.stderr.write(`Per-source file counts: ${SOURCES.map((s) => `${s}=${sets[s].size}`).join(' ')}\n`);
const paired = intersect(sets.human, sets.chatgpt, sets.dsc, sets.qwen);
process.stderr.write(`Paired functions (all 4 sources): ${paired.length}\n`);

// Shuffle deterministically and pick 10k
const sorted = [...paired].sort();
const sample = sorted.slice(0, SAMPLE_SIZE);
process.stderr.write(`Sampled: ${sample.length}\n`);

// Copy into sampled/<source>/
for (const s of SOURCES) {
  const target = join(ROOT, 'sampled', s);
  mkdirSync(target, { recursive: true });
  for (const hm of sample) {
    copyFileSync(join(ROOT, s, `${hm}.java`), join(target, `${hm}.java`));
  }
  process.stderr.write(`[${s}] copied ${sample.length} files\n`);
}

writeFileSync(join(ROOT, 'sample-hm-index.txt'), sample.join('\n') + '\n');
process.stderr.write(`Wrote sample-hm-index.txt\n`);
