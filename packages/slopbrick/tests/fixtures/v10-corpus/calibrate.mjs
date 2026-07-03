#!/usr/bin/env node
/**
 * v0.36.0: v10 calibration — read the per-source scan JSONLs,
 * pair issues by hm_index, and compute per-rule signal metrics
 * for ALL rules that fired at least once.
 *
 * Output: v10-corpus/v10-signal-strength.json
 * Schema: same as src/rules/signal-strength.json (RuleSignal)
 * with the addition of _v10* fields:
 *   - _v10Source: "OSS-forge/HumanVsAICode"
 *   - _v10Human: number of human files where rule fired
 *   - _v10ChatGpt, _v10Dsc, _v10Qwen: same for each AI
 *   - _v10Lift: max(ai/human hit rate)
 *   - _v10Verdict: STRONG_POSITIVE | WEAK_POSITIVE | NEUTRAL |
 *                  WEAK_NEGATIVE | DORMANT
 *   - _v10PValue: Wilcoxon signed-rank p-value (paired by hm_index)
 *   - _v10Precision: precision assuming AI class
 *   - _v10Recall: recall assuming AI class
 *
 * v10 statistics: For each rule r, for each paired function f,
 *   h = 1 if r fired on human(f), else 0
 *   a = 1 if r fired on ai(f),   else 0
 * Use Wilcoxon signed-rank on (a - h) across the paired sample.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCAN_DIR = join(__dirname, 'scans');
const SIGNAL_OUT = join(__dirname, 'v10-signal-strength.json');
const SOURCES = ['human', 'chatgpt', 'dsc', 'qwen'];

function loadSource(source) {
  // Map hm_index -> Set<ruleId>
  const map = new Map();
  const file = join(SCAN_DIR, `${source}.jsonl`);
  if (!existsSync(file)) {
    process.stderr.write(`warn: ${file} missing\n`);
    return map;
  }
  const text = readFileSync(file, 'utf8');
  let n = 0;
  for (const line of text.split('\n')) {
    if (!line) continue;
    try {
      const { file: hm, ruleId } = JSON.parse(line);
      if (!hm || !ruleId) continue;
      let set = map.get(hm);
      if (!set) { set = new Set(); map.set(hm, set); }
      set.add(ruleId);
      n++;
    } catch {}
  }
  process.stderr.write(`[${source}] ${map.size} unique files, ${n} hits\n`);
  return map;
}

function wilcoxonSignedRank(diffs) {
  // Strip zeros
  const nz = diffs.filter((d) => d !== 0);
  if (nz.length === 0) return { pValue: 1, n: 0, nZero: diffs.length - nz.length };
  const abs = nz.map((d, i) => ({ d, i, abs: Math.abs(d) }));
  abs.sort((a, b) => a.abs - b.abs);
  // Rank with ties (average rank)
  let i = 0;
  while (i < abs.length) {
    let j = i;
    while (j + 1 < abs.length && abs[j + 1].abs === abs[i].abs) j++;
    const avg = (i + j + 2) / 2; // 1-based avg rank
    for (let k = i; k <= j; k++) abs[k].rank = avg;
    i = j + 1;
  }
  let Wpos = 0, Wneg = 0;
  for (const { d, rank } of abs) {
    if (d > 0) Wpos += rank;
    else Wneg += rank;
  }
  const W = Math.min(Wpos, Wneg);
  const n = nz.length;
  // Normal approximation (no tie correction for simplicity)
  const mu = n * (n + 1) / 4;
  const sigma = Math.sqrt(n * (n + 1) * (2 * n + 1) / 24);
  const z = (W - mu) / sigma;
  // Two-sided p-value via normal CDF
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  return { pValue, n, nZero: diffs.length - n, Wpos, Wneg, z };
}

function normalCdf(x) {
  // Abramowitz & Stegun 7.1.26
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

function verdictFor(lift, pValue, aiFires, humanFires) {
  if (aiFires < 5 && humanFires < 5) return 'DORMANT';
  if (pValue > 0.05) return 'NEUTRAL';
  if (lift > 1.5 && pValue < 0.01) return 'STRONG_POSITIVE';
  if (lift > 1.2) return 'WEAK_POSITIVE';
  if (lift < 0.8) return 'WEAK_NEGATIVE';
  return 'NEUTRAL';
}

function main() {
  const humanMap = loadSource('human');
  const aiMaps = {
    chatgpt: loadSource('chatgpt'),
    dsc: loadSource('dsc'),
    qwen: loadSource('qwen'),
  };

  // Find the paired sample: hm_indices present in ALL 4 sources
  const paired = new Set();
  for (const hm of humanMap.keys()) {
    if (aiMaps.chatgpt.has(hm) && aiMaps.dsc.has(hm) && aiMaps.qwen.has(hm)) {
      paired.add(hm);
    }
  }
  process.stderr.write(`Paired functions (all 4 sources): ${paired.size}\n`);

  // For each rule, gather per-source hit counts
  const ruleStats = new Map(); // ruleId -> {human, chatgpt, dsc, qwen, pairedDiffs: number[]}
  for (const hm of paired) {
    const humanRules = humanMap.get(hm);
    const cgptRules = aiMaps.chatgpt.get(hm);
    const dscRules = aiMaps.dsc.get(hm);
    const qwenRules = aiMaps.qwen.get(hm);
    // Union of all rules that fired anywhere
    const allRules = new Set([...humanRules, ...cgptRules, ...dscRules, ...qwenRules]);
    for (const r of allRules) {
      let stat = ruleStats.get(r);
      if (!stat) {
        stat = {
          human: 0, chatgpt: 0, dsc: 0, qwen: 0,
          pairedDiffs_cgpt: [],
          pairedDiffs_dsc: [],
          pairedDiffs_qwen: [],
        };
        ruleStats.set(r, stat);
      }
      const h = humanRules.has(r) ? 1 : 0;
      const c = cgptRules.has(r) ? 1 : 0;
      const d = dscRules.has(r) ? 1 : 0;
      const q = qwenRules.has(r) ? 1 : 0;
      stat.human += h;
      stat.chatgpt += c;
      stat.dsc += d;
      stat.qwen += q;
      stat.pairedDiffs_cgpt.push(c - h);
      stat.pairedDiffs_dsc.push(d - h);
      stat.pairedDiffs_qwen.push(q - h);
    }
  }

  // Also tally non-paired rules (rules that fired in only one source)
  for (const [hm, rules] of humanMap) {
    if (paired.has(hm)) continue;
    for (const r of rules) {
      if (!ruleStats.has(r)) {
        ruleStats.set(r, { human: 0, chatgpt: 0, dsc: 0, qwen: 0, pairedDiffs_cgpt: [], pairedDiffs_dsc: [], pairedDiffs_qwen: [] });
      }
      ruleStats.get(r).human++;
    }
  }
  for (const [src, map] of Object.entries(aiMaps)) {
    for (const [hm, rules] of map) {
      if (paired.has(hm)) continue;
      for (const r of rules) {
        if (!ruleStats.has(r)) {
          ruleStats.set(r, { human: 0, chatgpt: 0, dsc: 0, qwen: 0, pairedDiffs_cgpt: [], pairedDiffs_dsc: [], pairedDiffs_qwen: [] });
        }
        ruleStats.get(r)[src]++;
      }
    }
  }

  // Build the signal-strength JSON
  const N = paired.size;
  const out = {};
  for (const [ruleId, s] of ruleStats) {
    const totalAi = s.chatgpt + s.dsc + s.qwen;
    const humanRate = s.human / N;
    const aiRate = (s.chatgpt + s.dsc + s.qwen) / (3 * N);
    const lift = humanRate > 0 ? aiRate / humanRate : (aiRate > 0 ? Infinity : 1);

    // Aggregate Wilcoxon across all 3 AI arms (concatenate diffs)
    const allDiffs = [...s.pairedDiffs_cgpt, ...s.pairedDiffs_dsc, ...s.pairedDiffs_qwen];
    const wr = wilcoxonSignedRank(allDiffs);

    // Precision/recall treating AI as positive class
    //   precision = aiFires / (aiFires + humanFires)
    //   recall    = aiFires / totalAi
    const precision = totalAi + s.human > 0 ? totalAi / (totalAi + s.human) : 0;
    const recall = totalAi > 0 ? totalAi / (3 * N) : 0;
    const fpr = N > 0 ? s.human / N : 0;

    const verdict = verdictFor(lift, wr.pValue, totalAi, s.human);

    out[ruleId] = {
      recall: Number(recall.toFixed(5)),
      fpRate: Number(fpr.toFixed(5)),
      ratio: Number(lift === Infinity ? 999 : lift.toFixed(3)),
      precision: Number(precision.toFixed(5)),
      lastCalibratedAt: new Date().toISOString().slice(0, 10) + 'T00:00:00Z',
      verdict: verdict === 'DORMANT' ? 'DORMANT' : (verdict === 'STRONG_POSITIVE' || verdict === 'WEAK_POSITIVE' ? 'OK' : verdict),
      aiSpecific: verdict === 'STRONG_POSITIVE' || verdict === 'WEAK_POSITIVE',
      _v10Source: 'OSS-forge/HumanVsAICode',
      _v10N: N,
      _v10Human: s.human,
      _v10ChatGpt: s.chatgpt,
      _v10Dsc: s.dsc,
      _v10Qwen: s.qwen,
      _v10Lift: Number(lift === Infinity ? 999 : lift.toFixed(3)),
      _v10Verdict: verdict,
      _v10PValue: Number(wr.pValue.toExponential(3)),
      _v10WilcoxonN: wr.n,
      _v10Precision: Number(precision.toFixed(5)),
      _v10Recall: Number(recall.toFixed(5)),
    };
  }

  writeFileSync(SIGNAL_OUT, JSON.stringify(out, null, 2) + '\n');
  process.stderr.write(`Wrote ${SIGNAL_OUT} (${Object.keys(out).length} rules)\n`);

  // Top findings
  const rows = Object.entries(out)
    .map(([id, s]) => ({ id, ...s }))
    .filter((r) => r._v10Verdict !== 'DORMANT' && r._v10Verdict !== 'NEUTRAL')
    .sort((a, b) => b._v10Lift - a._v10Lift);
  process.stderr.write(`\n=== Top signals (lift>1.2, p<0.05) ===\n`);
  for (const r of rows.slice(0, 25)) {
    process.stderr.write(`  ${r.id.padEnd(40)} lift=${r._v10Lift.toFixed(2).padStart(6)}  p=${r._v10PValue.toString().padStart(8)}  human=${String(r._v10Human).padStart(5)}  cgpt=${String(r._v10ChatGpt).padStart(5)}  dsc=${String(r._v10Dsc).padStart(5)}  qwen=${String(r._v10Qwen).padStart(5)}\n`);
  }
  process.stderr.write(`\n=== Bottom signals (lift<0.8) — rules LESS likely on AI ===\n`);
  const bottom = Object.entries(out)
    .map(([id, s]) => ({ id, ...s }))
    .filter((r) => r._v10Lift < 0.8 && r._v10Human + r._v10ChatGpt + r._v10Dsc + r._v10Qwen > 50)
    .sort((a, b) => a._v10Lift - b._v10Lift);
  for (const r of bottom.slice(0, 15)) {
    process.stderr.write(`  ${r.id.padEnd(40)} lift=${r._v10Lift.toFixed(2).padStart(6)}  p=${r._v10PValue.toString().padStart(8)}  human=${String(r._v10Human).padStart(5)}  cgpt=${String(r._v10ChatGpt).padStart(5)}  dsc=${String(r._v10Dsc).padStart(5)}  qwen=${String(r._v10Qwen).padStart(5)}\n`);
  }
  process.stderr.write(`\n=== DORMANT (<5 fires per source) ===\n`);
  const dormant = Object.values(out).filter((r) => r._v10Verdict === 'DORMANT').length;
  process.stderr.write(`  ${dormant} rules\n`);
}

main().catch?.((e) => { console.error(e); process.exit(1); });
