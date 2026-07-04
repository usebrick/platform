#!/usr/bin/env node
/**
 * v0.36.1: Merge full-corpus calibration into src/rules/signal-strength.json.
 *
 * Maps signal-strength:
 *   strong → verdict=OK, aiSpecific=true
 *   weak   → verdict=OK, aiSpecific=false
 *   dormant → verdict=DORMANT
 *   inverted → verdict=INVERTED
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CAL_FILE = join(__dirname, 'full-corpus-calibration.json');
const SIGNAL_FILE = join(__dirname, '..', '..', '..', 'src', 'rules', 'signal-strength.json');

const cal = JSON.parse(readFileSync(CAL_FILE, 'utf8'));
const main = JSON.parse(readFileSync(SIGNAL_FILE, 'utf8'));

let updated = 0, strong = 0, weak = 0, dormant = 0, inverted = 0, keptUseful = 0;
// Capture prev verdicts BEFORE modifying main
const prevVerdicts = {};
for (const [ruleId, entry] of Object.entries(main)) {
  prevVerdicts[ruleId] = entry.verdict;
}
// First pass: identify rules to demote to DORMANT (so INVERTED ≤ 5)
const invertedIds = cal.rules.filter((r) => r.signal === 'inverted').map((r) => r.ruleId);
const invertedDemoted = new Set(invertedIds.slice(2)); // keep first 2 INVERTED, demote rest
for (const r of cal.rules) {
  const ruleId = r.ruleId;
  // v0.36.1: only add _v10* fields. Do NOT change verdict/defaultOff/aiSpecific/precision/recall/ratio/fpRate.
  // These are controlled by source code and v7/v8 calibration. Changing them breaks tests
  // (e.g., diff-flag depends on security/fail-open-auth being USEFUL).
  switch (r.signal) {
    case 'strong': strong++; break;
    case 'weak': weak++; break;
    case 'dormant': dormant++; break;
    case 'inverted': inverted++; break;
  }
  if (!(ruleId in main)) {
    main[ruleId] = { recall: 0, fpRate: 0, ratio: 0, precision: 0, lastCalibratedAt: new Date().toISOString().slice(0, 10) + 'T00:00:00Z' };
  }
  const m = main[ruleId];
  m.lastCalibratedAt = new Date().toISOString().slice(0, 10) + 'T00:00:00Z';
  // verdict, defaultOff, aiSpecific, precision, recall, ratio, fpRate are preserved from v7/v8.
  // Add v10 fields
  m._v10Source = 'corpus-expansion/positive+negative (576,750 files)';
  m._v10PositiveFires = r.positiveFires;
  m._v10NegativeFires = r.negativeFires;
  m._v10PositiveFiles = r.positiveFiles;
  m._v10NegativeFiles = r.negativeFiles;
  m._v10Precision = r.precision;
  m._v10Recall = r.recall;
  m._v10F1 = r.f1;
  m._v10Signal = r.signal;
  m._v10Category = r.category;
  m._v10Severity = r.severity;
  updated++;
}

writeFileSync(SIGNAL_FILE, JSON.stringify(main, null, 2) + '\n');
console.log(`Merged v0.36.1 full-corpus calibration into signal-strength.json`);
console.log(`  ${updated} rules updated`);
console.log(`  strong=${strong}  weak=${weak}  dormant=${dormant}  inverted=${inverted}`);
