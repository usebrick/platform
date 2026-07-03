#!/usr/bin/env node
/**
 * v0.36.0: Convert OSS-forge/HumanVsAICode Java dataset into
 * slopbrick-compatible corpus directories.
 *
 * Each function is split into 4 separate .java files under its
 * own subdir per the 4 authorship sources (human, chatgpt, dsc, qwen).
 * File naming: `<hm_index>__<source>.java` so the slopbrick scan
 * can dedupe by hm_index later.
 */
import { createReadStream, createWriteStream, mkdirSync, writeFileSync, readdirSync, statSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const RAW = new URL('./raw/java_dataset.jsonl', import.meta.url).pathname;
const OUT = new URL('./', import.meta.url).pathname;

const SOURCES = [
  { key: 'human_code', dir: 'human' },
  { key: 'chatgpt_code', dir: 'chatgpt' },
  { key: 'dsc_code', dir: 'dsc' },
  { key: 'qwen_code', dir: 'qwen' },
];

async function main() {
  // 1. Clean target dirs (keep raw/)
  for (const { dir } of SOURCES) {
    const target = join(OUT, dir);
    if (existsSync(target)) {
      for (const f of readdirSync(target)) {
        try { unlinkSync(join(target, f)); } catch {}
      }
    } else {
      mkdirSync(target, { recursive: true });
    }
  }

  // 2. Stream the JSONL line-by-line, write 4 .java files per record
  const rl = createInterface({ input: createReadStream(RAW), crlfDelay: Infinity });
  let n = 0;
  for await (const line of rl) {
    if (!line) continue;
    const rec = JSON.parse(line);
    const idx = rec.hm_index;
    for (const { key, dir } of SOURCES) {
      const code = rec[key];
      if (!code || typeof code !== 'string') continue;
      // Wrap snippets that aren't full classes in a stub class so they
      // parse as a Java file. Many functions are bare methods.
      const wrapped = wrapAsJava(code);
      const file = join(OUT, dir, `${idx}.java`);
      writeFileSync(file, wrapped);
    }
    n++;
    if (n % 10000 === 0) process.stderr.write(`  ${n} records processed\n`);
  }
  process.stderr.write(`Total: ${n} records × 4 sources = ${n * 4} files\n`);
}

/**
 * Wrap bare function bodies in a stub class so the Java parser can
 * handle them. Most records are bare methods; we add a minimal class
 * shell. The class name is "X" to avoid collisions.
 */
function wrapAsJava(code) {
  const trimmed = code.trim();
  // If the snippet already contains "class " or "interface ", use as-is.
  if (/\b(?:class|interface|enum)\b/.test(trimmed)) return code;
  // If it's an import-only or package-only snippet, wrap in an empty class.
  if (/^(?:import|package)\b/.test(trimmed) && !/[;{]\s*(?:public|private|protected|static|final|void|int|long|String|boolean|double|float|byte|short|char|\w+\s+\w+\s*\()/.test(trimmed)) {
    return `${code}\npublic class X {}\n`;
  }
  return `public class X {\n${code}\n}\n`;
}

main().catch((e) => { console.error(e); process.exit(1); });
