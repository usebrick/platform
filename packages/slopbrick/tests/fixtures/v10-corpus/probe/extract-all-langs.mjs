#!/usr/bin/env node
/**
 * v0.36.1: Extract ALL 5 languages from PROBE dataset.
 *
 * PROBE has Python, C++, Java, C, Rust — both human references
 * and AI-generated solutions from 6 LLMs.
 *
 * Output corpus structure (per language):
 *   probe/<lang>/
 *     human/<problem_id>__<ref_id>.<ext>
 *     gpt-4.1-mini/<problem_id>__<idx>.<ext>
 *     gemini-2.0-flash/<problem_id>__<idx>.<ext>
 *     deepseek-coder-v2/<problem_id>__<idx>.<ext>
 *     qwen2.5-coder-14b/<problem_id>__<idx>.<ext>
 *     qwen2.5-coder-7b/<problem_id>__<idx>.<ext>
 *
 * Paired by problem_id within each language.
 */
import { createReadStream, createWriteStream, mkdirSync, writeFileSync, readdirSync, existsSync, statSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW = join(__dirname, 'raw');
const OUT = process.env.PROBE_OUT_DIR || join('/Users/cheng/corpus-expansion', 'probe');

const LANGUAGES = {
  python: { ext: 'py' },
  cpp: { ext: 'cpp' },
  java: { ext: 'java' },
  c: { ext: 'c' },
  rust: { ext: 'rs' },
};
const MODELS = ['gpt-4.1-mini', 'gemini-2.0-flash', 'deepseek-coder-v2', 'qwen2.5-coder-14b', 'qwen2.5-coder-7b'];

// Clean all target dirs
for (const lang of Object.keys(LANGUAGES)) {
  for (const d of ['human', ...MODELS]) {
    const target = join(OUT, lang, d);
    if (existsSync(target)) {
      for (const f of readdirSync(target)) {
        try { rmSync(join(target, f)); } catch {}
      }
    } else {
      mkdirSync(target, { recursive: true });
    }
  }
}

// 1. Extract from dataset.jsonl (human references, all languages)
async function extractHuman() {
  const file = join(RAW, 'dataset.jsonl');
  if (!existsSync(file)) {
    process.stderr.write(`warn: ${file} not found\n`);
    return;
  }
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  const counts = {};
  for (const lang of Object.keys(LANGUAGES)) counts[lang] = 0;
  let lineNo = 0;
  for await (const line of rl) {
    if (!line) continue;
    lineNo++;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    const problemId = rec.problem_id;
    for (const ref of (rec.references ?? [])) {
      const langName = ref.language;
      const langCfg = LANGUAGES[langName];
      if (!langCfg) continue;
      const code = ref.code;
      if (!code || typeof code !== 'string' || code.length < 10) continue;
      const refId = ref.id ?? `ref${lineNo}`;
      const file2 = join(OUT, langName, 'human', `${problemId}__${refId}.${langCfg.ext}`);
      writeFileSync(file2, code);
      counts[langName]++;
    }
  }
  for (const [lang, n] of Object.entries(counts)) {
    process.stderr.write(`  human/${lang}: ${n} files\n`);
  }
}

// 2. Extract from generated_code.zip (AI solutions, all languages)
function extractGenerated() {
  return new Promise((resolve) => {
    const zip = join(RAW, 'generated_code.zip');
    if (!existsSync(zip)) {
      process.stderr.write(`warn: ${zip} not found\n`);
      resolve();
      return;
    }
    const proc = spawn('unzip', ['-o', zip, '-d', join(RAW, 'generated_extracted')], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderrBuf = '';
    proc.stderr.on('data', (d) => { stderrBuf += d.toString(); });
    proc.on('close', (code) => {
      process.stderr.write(`unzip exit ${code}\n`);
      if (code !== 0) { resolve(); return; }
      // Walk extracted dir. Structure: <model>/<problem_id>/solution*.{py,cpp,java,c,rs}
      const ext = join(RAW, 'generated_extracted');
      const counts = {};
      for (const lang of Object.keys(LANGUAGES)) {
        for (const m of MODELS) counts[`${lang}/${m}`] = 0;
      }
      if (!existsSync(ext)) { resolve(); return; }
      for (const model of readdirSync(ext)) {
        if (!MODELS.includes(model)) continue;
        const modelDir = join(ext, model);
        const stat = statSync(modelDir, { throwIfNoEntry: false });
        if (!stat?.isDirectory()) continue;
        for (const problemId of readdirSync(modelDir)) {
          const problemDir = join(modelDir, problemId);
          const stat2 = statSync(problemDir, { throwIfNoEntry: false });
          if (!stat2?.isDirectory()) continue;
          // Find all .py, .cpp, .java, .c, .rs files
          for (const f of readdirSync(problemDir)) {
            for (const [langName, langCfg] of Object.entries(LANGUAGES)) {
              if (!f.endsWith('.' + langCfg.ext)) continue;
              const src = join(problemDir, f);
              // Find idx from filename (solution_0.py → 0, solution.py → 0)
              const base = f.replace('.' + langCfg.ext, '');
              const idxMatch = base.match(/(\d+)$/);
              const idx = idxMatch ? idxMatch[1] : '0';
              const dst = join(OUT, langName, model, `${problemId}__${idx}.${langCfg.ext}`);
              const code = readFileSync(src);
              writeFileSync(dst, code);
              counts[`${langName}/${model}`]++;
            }
          }
        }
      }
      for (const [k, n] of Object.entries(counts)) {
        if (n > 0) process.stderr.write(`  ${k}: ${n} files\n`);
      }
      resolve();
    });
  });
}

async function main() {
  process.stderr.write('Extracting human references...\n');
  await extractHuman();
  process.stderr.write('\nExtracting AI solutions...\n');
  await extractGenerated();
  process.stderr.write('\nDone.\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
