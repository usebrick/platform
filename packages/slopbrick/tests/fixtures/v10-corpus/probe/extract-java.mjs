#!/usr/bin/env node
/**
 * v0.36.1: Extract Java files from PROBE dataset.
 *
 * Inputs:
 *   - raw/dataset.jsonl: 1,651 problems with reference solutions
 *   - raw/generated_code.zip: 6 LLMs × 5 solutions × 5 languages
 *
 * Output corpus structure:
 *   probe/
 *     human/<problem_id>__<ref_id>.java
 *     gpt-4.1-mini/<problem_id>__<idx>.java
 *     gemini-2.0-flash/<problem_id>__<idx>.java
 *     deepseek-coder-v2/<problem_id>__<idx>.java
 *     qwen2.5-coder-14b/<problem_id>__<idx>.java
 *     qwen2.5-coder-7b/<problem_id>__<idx>.java
 *
 * Paired by problem_id.
 */
import { createReadStream, createWriteStream, mkdirSync, writeFileSync, readdirSync, existsSync, statSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW = join(__dirname, 'raw');
const OUT = __dirname;
const MODELS = ['gpt-4.1-mini', 'gemini-2.0-flash', 'deepseek-coder-v2', 'qwen2.5-coder-14b', 'qwen2.5-coder-7b'];

// Clean target dirs
for (const d of ['human', ...MODELS]) {
  const target = join(OUT, d);
  if (existsSync(target)) {
    for (const f of readdirSync(target)) {
      try { rmSync(join(target, f)); } catch {}
    }
  } else {
    mkdirSync(target, { recursive: true });
  }
}

// 1. Extract Java from dataset.jsonl (human references)
async function extractHuman() {
  const file = join(RAW, 'dataset.jsonl');
  if (!existsSync(file)) {
    process.stderr.write(`warn: ${file} not found\n`);
    return 0;
  }
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let n = 0;
  for await (const line of rl) {
    if (!line) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    const problemId = rec.problem_id;
    for (const ref of (rec.references ?? [])) {
      if (ref.language !== 'java') continue;
      const code = ref.code;
      if (!code || typeof code !== 'string' || code.length < 10) continue;
      const refId = ref.id ?? `ref${n}`;
      const file2 = join(OUT, 'human', `${problemId}__${refId}.java`);
      writeFileSync(file2, code);
      n++;
    }
  }
  return n;
}

// 2. Extract Java from generated_code.zip
function extractGenerated() {
  return new Promise((resolve) => {
    const zip = join(RAW, 'generated_code.zip');
    if (!existsSync(zip)) {
      process.stderr.write(`warn: ${zip} not found\n`);
      resolve(0);
      return;
    }
    // Use unzip -l to list contents first
    const proc = spawn('unzip', ['-o', zip, '-d', join(RAW, 'generated_extracted')], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderrBuf = '';
    proc.stderr.on('data', (d) => { stderrBuf += d.toString(); });
    proc.on('close', (code) => {
      process.stderr.write(`unzip exit ${code}\n`);
      if (code !== 0) { resolve(0); return; }
      // Walk extracted dir, find .java files, copy to model dirs
      const ext = join(RAW, 'generated_extracted');
      let count = 0;
      for (const model of MODELS) {
        // Model dirs in zip might be named differently — we'll find them
        const modelDir = join(ext, model);
        if (!existsSync(modelDir)) continue;
        for (const problemDir of readdirSync(modelDir)) {
          const javaDir = join(modelDir, problemDir);
          if (!statSync(javaDir, { throwIfNoEntry: false })?.isDirectory()) continue;
          let idx = 0;
          for (const f of readdirSync(javaDir)) {
            if (!f.endsWith('.java')) continue;
            const src = join(javaDir, f);
            const dst = join(OUT, model, `${problemDir}__${idx}.java`);
            // Read + write (copy)
            const code = require('node:fs').readFileSync(src);
            writeFileSync(dst, code);
            idx++;
            count++;
          }
        }
      }
      resolve(count);
    });
  });
}

async function main() {
  const humanCount = await extractHuman();
  process.stderr.write(`Extracted ${humanCount} human Java files\n`);
  const aiCount = await extractGenerated();
  process.stderr.write(`Extracted ${aiCount} AI Java files\n`);
  // Summary
  for (const d of ['human', ...MODELS]) {
    const files = readdirSync(join(OUT, d));
    process.stderr.write(`  ${d}: ${files.length} files\n`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
