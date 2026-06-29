#!/usr/bin/env -S npx tsx
/**
 * Imports per-rule P/R/FPR data from docs/research/v4-per-rule-pr-fpr.md
 * into src/rules/signal-strength.json.
 *
 * Run: pnpm tsx scripts/import-v4-calibration.ts
 *
 * The v4 calibration produced the per-rule table in markdown form, but it
 * was never ingested into signal-strength.json. The result: rules that
 * SHOULD be default-off (INVERTED/NOISY/DORMANT) ship enabled by default,
 * and the v0.10 credibility moat is purely cosmetic — the engine has no
 * data to apply the verdicts.
 *
 * This script closes that gap. It parses the markdown table, computes the
 * verdict for each rule (using the same logic as the v4 doc), and merges
 * the entries into the existing signal-strength.json (preserving any v5
 * pilot data for db/* + docs/* + product/* that we already added).
 *
 * Idempotent: rerunning produces the same JSON.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const V4_DOC = join(REPO, 'docs/research/v4-per-rule-pr-fpr.md');
const SIGNAL_FILE = join(REPO, 'src/rules/signal-strength.json');

interface V4Row {
  ruleId: string;
  tp: number;
  fp: number;
  precision: number;
  recall: number;
  fpr: number;
  specificity: number;
  lift: number;
  verdict: 'USEFUL' | 'OK' | 'NOISY' | 'INVERTED' | 'DORMANT';
}

/** Parse the per-rule table from a markdown section. */
function parseSection(content: string, header: string): V4Row[] {
  const sectionRe = new RegExp(`## ${header}[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`);
  const m = content.match(sectionRe);
  if (!m) return [];

  const lines = m[1].trim().split('\n').filter((l) => l.startsWith('|'));
  // Drop the table header row (`| Rule | TP | ...`) — keep everything else.
  // The alignment row (`|---|---|`) was already filtered out above by
  // stripping lines without `|`, so by this point only the header and
  // data rows remain.
  const dataLines = lines.slice(1);
  const rows: V4Row[] = [];
  for (const line of dataLines) {
    // Skip the alignment row if it slipped through (defensive).
    if (/^\|\s*-+\s*\|/.test(line)) continue;
    const cols = line.split('|').map((s) => s.trim()).filter(Boolean);
    if (cols.length < 9) continue;
    const ruleId = cols[0].replace(/`/g, '');
    const tp = parseInt(cols[1].replace(/,/g, ''), 10);
    const fp = parseInt(cols[2].replace(/,/g, ''), 10);
    const precision = parsePct(cols[3]);
    const recall = parsePct(cols[4]);
    const fpr = parsePct(cols[5]);
    const specificity = parsePct(cols[6]);
    const lift = cols[8] === 'inf' ? Infinity : parseFloat(cols[8]);
    if (!Number.isFinite(tp) || !Number.isFinite(fp)) continue;
    rows.push({ ruleId, tp, fp, precision, recall, fpr, specificity, lift, verdict: header as V4Row['verdict'] });
  }
  return rows;
}

function parsePct(s: string): number {
  // "89.84%" -> 0.8984
  const m = s.match(/([\d.]+)\s*%/);
  return m ? parseFloat(m[1]) / 100 : parseFloat(s);
}

/** Compute verdict from P/R/FPR using the v4 logic (independent of the
 *  markdown label, so re-running after a corpus update produces the right
 *  verdict even if the doc label is stale). */
function computeVerdict(p: number, lift: number, tp: number, fp: number): V4Row['verdict'] {
  if (tp === 0 && fp === 0) return 'DORMANT';
  if (lift < 1.0) return 'INVERTED';
  if (p >= 0.5 && lift >= 2) return 'USEFUL';
  if (p >= 0.3 && lift >= 1.5) return 'OK';
  return 'NOISY';
}

function main() {
  const content = readFileSync(V4_DOC, 'utf8');
  const sections: V4Row['verdict'][] = ['USEFUL', 'OK', 'NOISY', 'INVERTED', 'DORMANT'];
  const allRows: V4Row[] = [];
  for (const sec of sections) {
    const rows = parseSection(content, sec);
    console.log(`  ${sec}: parsed ${rows.length} rules`);
    for (const r of rows) console.log(`    ${r.ruleId}`);
    allRows.push(...rows);
  }
  console.log(`Parsed ${allRows.length} rules from ${V4_DOC}`);

  // Load existing signal-strength.json (preserve v5 pilot data).
  const existing = JSON.parse(readFileSync(SIGNAL_FILE, 'utf8'));
  const now = '2026-06-26T22:30:00Z';

  // For each registered builtin rule that has NO calibration data
  // anywhere (neither in the v4 doc nor in a v5 pilot), mark it DORMANT
  // + defaultOff. This is the "rule shipped uncalibrated" safety net.
  // Without it, rules added between calibration rounds ship enabled by
  // default — exactly the v0.10.1 leak that motivated this script.
  const BUILTIN_RULE_IDS = process.env.SLOPBRICK_RULE_IDS?.split(',') ?? null;
  if (BUILTIN_RULE_IDS) {
    const calibrated = new Set(allRows.map((r) => r.ruleId));
    calibrated.add('db/duplicate-index'); // v5 SQL pilot
    calibrated.add('db/missing-fk-index'); // v5 SQL pilot
    calibrated.add('db/missing-not-null'); // v5 SQL pilot
    calibrated.add('db/naming-inconsistency'); // v5 SQL pilot
    calibrated.add('db/enum-sprawl'); // v5 SQL pilot
    calibrated.add('db/sql-concat'); // v5 SQL pilot
    calibrated.add('docs/broken-link'); // v5 markdown pilot
    calibrated.add('docs/expired-code-example');
    calibrated.add('docs/stale-function-reference');
    calibrated.add('docs/stale-package-reference');
    calibrated.add('product/terminology-drift');
    calibrated.add('product/ux-pattern-fragmentation');
    let backfilled = 0;
    for (const ruleId of BUILTIN_RULE_IDS) {
      if (!calibrated.has(ruleId) && !(ruleId in existing)) {
        existing[ruleId] = {
          recall: 0,
          fpRate: 0,
          ratio: 0,
          precision: 0,
          lastCalibratedAt: now,
          verdict: 'DORMANT',
          defaultOff: true,
          _calibrationNote: 'No calibration data in v4 (45 rules) + v5 SQL/markdown pilots. Default-off until the rule ships with a calibration note.',
        };
        backfilled++;
      }
    }
    if (backfilled > 0) console.log(`Backfilled ${backfilled} uncalibrated rules as DORMANT/defaultOff`);
  }

  let updated = 0;
  let created = 0;
  for (const row of allRows) {
    // Trust the doc section as the source of truth — the v4 calibration
    // author manually classified some rules at the OK/NOISY boundary that
    // a recomputed verdict would flip. The doc label is canonical.
    const verdict = row.verdict;
    const ratio = row.lift === Infinity ? 99.99 : Math.min(99.99, row.lift);

    const entry: Record<string, unknown> = {
      recall: Number(row.recall.toFixed(4)),
      fpRate: Number(row.fpr.toFixed(4)),
      ratio: Number(ratio.toFixed(2)),
      precision: Number(row.precision.toFixed(4)),
      lastCalibratedAt: now,
      verdict,
      _calibrationNote: `v4 corpus (2026-06-25): 95,599 neg + 76,550 pos (frontend, TS/TSX/JS/JSX). ${verdict} — TP=${row.tp}, FP=${row.fp}, P=${(row.precision*100).toFixed(1)}%, FPR=${(row.fpr*100).toFixed(2)}%, lift=${row.lift === Infinity ? 'inf' : row.lift.toFixed(1)}.`,
    };

    // Per the v0.9.3 contract: INVERTED + NOISY + DORMANT default-off;
    // USEFUL + OK ship enabled.
    if (verdict === 'INVERTED' || verdict === 'NOISY' || verdict === 'DORMANT') {
      entry.defaultOff = true;
    }

    const wasExisting = row.ruleId in existing;
    existing[row.ruleId] = entry;
    if (wasExisting) updated++; else created++;
  }

  writeFileSync(SIGNAL_FILE, JSON.stringify(existing, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${SIGNAL_FILE}: ${created} new + ${updated} updated entries`);

  // Print a summary by verdict.
  const counts: Record<string, number> = {};
  for (const row of allRows) {
    counts[row.verdict] = (counts[row.verdict] ?? 0) + 1;
  }
  console.log('\nImported verdicts:');
  for (const v of sections) {
    console.log(`  ${v}: ${counts[v] ?? 0}`);
  }

  // Sanity check: every INVERTED rule should be defaultOff.
  let bad = 0;
  for (const row of allRows) {
    if ((row.verdict === 'INVERTED' || row.verdict === 'NOISY' || row.verdict === 'DORMANT')
        && !existing[row.ruleId].defaultOff) {
      console.error(`\n❌ ${row.ruleId} is ${row.verdict} but missing defaultOff=true!`);
      bad++;
    }
  }
  if (bad > 0) {
    process.exit(1);
  }
  console.log('\n✓ All INVERTED/NOISY/DORMANT rules are defaultOff=true.');
}

main();
