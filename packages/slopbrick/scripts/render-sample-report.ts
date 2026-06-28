#!/usr/bin/env tsx
/**
 * v0.14.5j — Render a sample scan output so we can SEE what the user
 * sees. Bypasses the scan engine (which the v7 corpus is hogging) and
 * feeds a realistic ProjectReport directly into formatPretty.
 *
 * Usage:  pnpm exec tsx scripts/render-sample-report.ts
 */
import { formatPretty, formatWhyFailingReport, formatBriefReport } from '../src/report/pretty';
import type { ProjectReport, Issue } from '../src/types';

// Realistic sample — matches what slopbrick's own self-scan would produce
// post-v0.14.5i (slopIndex 25, 0 components, ai:167 / visual:70 / logic:68).
const sample: ProjectReport = {
  version: '0.14.5j',
  generatedAt: '2026-06-28T01:00:00.000Z',
  slopIndex: 25,
  assemblyHealth: 75,
  totalScore: 0,
  categoryScores: {
    visual: 70, typo: 0, wcag: 0, layout: 0, component: 0, logic: 68, arch: 0,
    perf: 0, security: 0, test: 0, docs: 0, db: 0, ai: 167, context: 0,
    product: 0, i18n: 0,
  },
  boundaryScore: 10,
  contextScore: 50,
  visualScore: 5,
  subscores: { boundary: 10, context: 50, visual: 5 },
  p90Score: 12,
  peakScore: 18,
  componentCount: 0,
  fileCount: 95,
  components: [],
  issues: [
    { ruleId: 'ai/compression-profile', category: 'ai', severity: 'high', aiSpecific: true, message: 'repetitive token pattern', line: 12, column: 1, filePath: 'src/cli/scan.ts' },
    { ruleId: 'ai/compression-profile', category: 'ai', severity: 'high', aiSpecific: true, message: 'repetitive token pattern', line: 45, column: 1, filePath: 'src/cli/scan.ts' },
    { ruleId: 'ai/compression-profile', category: 'ai', severity: 'high', aiSpecific: true, message: 'repetitive token pattern', line: 12, column: 1, filePath: 'src/cli/init.ts' },
    { ruleId: 'ai/segment-surprisal-cv', category: 'ai', severity: 'high', aiSpecific: true, message: 'low register-switch entropy', line: 88, column: 1, filePath: 'src/cli/scan.ts' },
    { ruleId: 'visual/naturalness-anomaly', category: 'visual', severity: 'medium', aiSpecific: true, message: 'artificial repetition in tokens', line: 1, column: 1, filePath: 'src/report/pretty.ts' },
    { ruleId: 'logic/boundary-violation', category: 'logic', severity: 'low', aiSpecific: false, message: 'switch on stringly-typed value', line: 50, column: 1, filePath: 'src/cli/scan.ts' },
  ] as Issue[],
  thresholds: { meanSlop: 15, p90Slop: 30, individualSlopThreshold: 60 },
  topOffenders: [
    { filePath: 'src/cli/scan.ts', adjustedScore: 87.5, issueCount: 4 },
    { filePath: 'src/report/pretty.ts', adjustedScore: 41.0, issueCount: 1 },
    { filePath: 'src/cli/init.ts', adjustedScore: 22.0, issueCount: 1 },
  ],
  coherence: 60,
  coherenceBreakdown: { architectureConsistency: 0, patternFragmentation: 0, constitutionMapped: 100, aiDebtMapped: 50 },
  coherenceWeights: { architectureConsistency: 0.50, patternFragmentation: 0.30, constitutionMapped: 0.10, aiDebtMapped: 0.10 },
  codeHygiene: 75,
  accessibility: 100,
  performance: 100,
  businessLogicCoherence: 0,
  aiSecurityRisk: 'low',
  defaultOffSuppressedCount: 99,
  defaultOffRuleCount: 24,
  // v0.14.5j (P9): simulate a previous run so the delta is shown
  previousSlopIndex: 30,
  previousRunTimestamp: '2026-06-27T23:00:00.000Z',
};

console.log('===== PRETTY OUTPUT =====\n');
console.log(formatPretty(sample));
console.log('\n===== WHY-FAILING OUTPUT =====\n');
console.log(formatWhyFailingReport(sample));
console.log('\n===== BRIEF OUTPUT (--brief) =====\n');
console.log(formatBriefReport(sample));
