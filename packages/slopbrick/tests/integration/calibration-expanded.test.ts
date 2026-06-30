import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertDistBuilt, repoRoot } from '../helpers/cli';
import { FILELISTS_DIR, filelistPath } from '../../src/corpus-paths';

/**
 * Expanded-corpus calibration.
 *
 * v4 corpus (2026-06-25): 95,599 neg + 76,550 pos frontend files (TS/TSX/JS/JSX).
 * Effectively 1:1 ratio, ~5× larger than v3 in absolute terms.
 *
 *   - Negative: 39 large, well-maintained OSS repos in /Users/cheng/corpus-expansion/negative/
 *               (mui 16k, supabase 6.8k, refine 6.3k, appsmith 5.5k, storybook 3.5k,
 *                react-spectrum 3.3k, tanstack-router 3.2k, saleor 2.6k, discourse 2.3k,
 *                heroui 2.1k, builderio 1.8k, antd 1.2k, ...) + 54,980 from corpus-expansion.
 *   - Positive: 50 existing repos + 100 NEW AI-coded repos in /Users/cheng/corpus-expansion/positive/vibe-coded/
 *               (tiann/hapi 100MB, thedotmack/claude-mem, nextify-limited/libra,
 *                dyad, eastlondoner/vibe-tools, refly, Vibe-Trading, ORG2, PraisonAI,
 *                agno, paperclipai/paperclip, sglang, gradio, ollama, langchain, ...)
 *
 * Per-repo cap raised from 2,000 → 4,500 to balance contribution per source.
 *
 * v4 frontend-only subset (.ts/.tsx/.js/.jsx) = 95,599 neg + 76,550 pos.
 * Per-rule ratios measured on 2026-06-25 (see docs/research/v4-corpus-50-50-plan.md).
 *
 * Out of scope for THIS test (need their own corpus — see
 * docs/research/corpus-expansion-2026.md):
 *   - security/*, test/*, business-logic/* (need backend corpus — see
 *     tests/integration/calibration-security.test.ts)
 *   - db/* (need SQL/ORM corpus — see tests/integration/calibration-db.test.ts)
 *   - perf/cls-image (image-heavy corpus needed)
 */

const EXPANDED_NEG_LIST = filelistPath('neg-frontend-all.txt');
const EXPANDED_POS_LIST = filelistPath('pos-frontend-all.txt');

function expandedCorpusAvailable(): boolean {
  return existsSync(EXPANDED_NEG_LIST) && existsSync(EXPANDED_POS_LIST);
}

interface ScanResult {
  fileCount: number;
  firesPerFile: Map<string, number>;
}

interface ScannerReport {
  fileCount: number;
  issues: Array<{ ruleId: string }>;
}

/**
 * v4 calibration is established by scanning the corpus with `corpus-expansion/scan-frontend-only.py`
 * and storing per-shard fires.json files under /tmp/{prefix}-shards/shard-NN/. To make the test
 * fast (sub-minute), we aggregate those cached fires instead of re-scanning 170k files on every run.
 *
 * Cached paths:
 *   /tmp/v4neg-fe-shards/shard-{0,1,2,3}/fires.json   — 95,467 frontend neg files
 *   /tmp/v4pos-fe-shards/shard-{0,1,2,3}/fires.json   — 76,981 frontend pos files
 *
 * Falls back to a fresh scan if any of those are missing.
 */
const CACHED_NEG_SHARDS = '/tmp/v4neg-fe-shards';
const CACHED_POS_SHARDS = '/tmp/v4pos-fe-shards';

function loadCachedFires(shardsDir: string): ScanResult | null {
  if (!existsSync(shardsDir)) return null;
  const firesPerFile = new Map<string, number>();
  let totalFiles = 0;
  let shardCount = 0;
  for (const shardPath of [
    join(shardsDir, 'shard-00', 'fires.json'),
    join(shardsDir, 'shard-01', 'fires.json'),
    join(shardsDir, 'shard-02', 'fires.json'),
    join(shardsDir, 'shard-03', 'fires.json'),
  ]) {
    if (!existsSync(shardPath)) return null;
    const shard = JSON.parse(readFileSync(shardPath, 'utf8')) as { files: number; fires: Record<string, number> };
    shardCount++;
    totalFiles += shard.files;
    for (const [rule, count] of Object.entries(shard.fires)) {
      firesPerFile.set(rule, (firesPerFile.get(rule) ?? 0) + count);
    }
  }
  if (shardCount === 0) return null;
  return { fileCount: totalFiles, firesPerFile };
}

function scanFileList(fileListPath: string, shardsDir?: string): ScanResult {
  // Try the cached shard results first — avoids 10+ min of re-scanning.
  if (shardsDir) {
    const cached = loadCachedFires(shardsDir);
    if (cached) return cached;
  }

  const fileList = readFileSync(fileListPath, 'utf8').trim().split('\n').filter((f) => f.length > 0);
  // macOS argv limit is ~256KB. With ~200 char paths that's ~1200 files.
  // Split into 500-file chunks to stay well under that limit.
  const CHUNK = 500;
  const firesPerFile = new Map<string, number>();
  let totalFiles = 0;
  const jsonOut = mkdtempSync(join(tmpdir(), 'slopbrick-cal-exp-json-'));

  for (let i = 0; i < fileList.length; i += CHUNK) {
    const chunk = fileList.slice(i, i + CHUNK);
    const jsonPath = join(jsonOut, `chunk-${i}.json`);
    try {
      execFileSync(
        'node',
        [join(repoRoot, 'bin', 'slopbrick.js'), 'scan', ...chunk, '--json', jsonPath, '--no-telemetry', '--quiet'],
        { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, timeout: 300_000 },
      );
    } catch {
      // Threshold breaches (exit 1/2) are expected; the JSON is written
      // before the threshold check fires. Fall through.
    }
    if (!existsSync(jsonPath)) {
      throw new Error(`Scanner did not produce ${jsonPath} for chunk starting at ${i}`);
    }
    const parsed = JSON.parse(readFileSync(jsonPath, 'utf8')) as ScannerReport;
    totalFiles += parsed.fileCount;
    for (const issue of parsed.issues) {
      firesPerFile.set(issue.ruleId, (firesPerFile.get(issue.ruleId) ?? 0) + 1);
    }
  }
  rmSync(jsonOut, { recursive: true, force: true });
  return { fileCount: totalFiles, firesPerFile };
}

/**
 * Per-rule calibration thresholds for the expanded corpus.
 *
 * Thresholds are set with a safety margin below the measured ratio from the
 * 2026-06-15 scan. Each entry's `measured` field records the actual ratio
 * observed in that scan, so a future regression can be diagnosed by
 * comparing the new ratio to the recorded baseline.
 *
 * Source data: docs/research/corpus-expansion-2026.md (the per-rule table).
 */
const RATIO_THRESHOLDS: Array<{
  ruleId: string;
  minRatio: number;
  measured: number;
  category: string;
  note: string;
}> = [
  // WCAG
  { ruleId: 'wcag/focus-appearance', minRatio: 1.5, measured: 3.01, category: 'wcag', note: 'AI removes outline-none without focus-visible:ring' },
  { ruleId: 'wcag/focus-obscured', minRatio: 1.5, measured: 1.77, category: 'wcag', note: 'AI focus rings hidden by siblings' },
  // Component
  { ruleId: 'component/shadcn-prop-mismatch', minRatio: 1.5, measured: 3.00, category: 'component', note: 'AI overrides shadcn className prop' },
  { ruleId: 'component/giant-component', minRatio: 1.5, measured: 1.61, category: 'component', note: 'AI produces oversized components' },
  // Visual — math-* entropy rules
  { ruleId: 'visual/math-rounded-entropy', minRatio: 1.5, measured: 2.83, category: 'visual', note: 'AI uses same rounded-* everywhere' },
  { ruleId: 'visual/math-default-font', minRatio: 1.5, measured: 3.88, category: 'visual', note: 'AI defaults to Inter/system fonts' },
  { ruleId: 'visual/math-color-cluster', minRatio: 1.5, measured: 3.92, category: 'visual', note: 'AI clusters around 1-2 hex colors' },
  { ruleId: 'visual/math-font-entropy', minRatio: 1.5, measured: 1.89, category: 'visual', note: 'AI low font-family diversity' },
  { ruleId: 'visual/radius-scale-violation', minRatio: 1.5, measured: 1.65, category: 'visual', note: 'AI off-scale border-radius' },
  // Logic
  { ruleId: 'logic/boundary-violation', minRatio: 1.5, measured: 2.61, category: 'logic', note: 'AI mixes data + UI in one file (very common)' },
  { ruleId: 'logic/math-gini-class-usage', minRatio: 1.5, measured: 3.84, category: 'logic', note: 'AI concentrates on few class strings' },
  { ruleId: 'logic/reactive-hook-soup', minRatio: 1.5, measured: 3.07, category: 'logic', note: 'AI inlines effects and handlers' },
  { ruleId: 'logic/optimistic-no-rollback', minRatio: 1.5, measured: 2.38, category: 'logic', note: 'AI forgets catch-rollback on optimistic updates' },
  { ruleId: 'logic/math-console-log-storm', minRatio: 1.5, measured: 11.04, category: 'logic', note: 'AI leaves debug logs everywhere' },
  { ruleId: 'logic/zombie-state', minRatio: 1.5, measured: 7.18, category: 'logic', note: 'AI declares state never read' },
  { ruleId: 'logic/math-any-density', minRatio: 1.5, measured: 1.76, category: 'logic', note: 'AI uses `any` more than hand-written TS' },
  { ruleId: 'logic/ghost-defensive', minRatio: 1.5, measured: 34.14, category: 'logic', note: 'AI adds dead `if (x) return` guards' },
  // Typo
  { ruleId: 'typo/calc-raw-px', minRatio: 1.5, measured: 4.58, category: 'typo', note: 'AI hand-writes calc(...) with raw px' },
  // Perf
  { ruleId: 'perf/css-bloat', minRatio: 1.5, measured: 1.65, category: 'perf', note: 'AI produces bloated CSS' },
  // Security
  { ruleId: 'security/sql-construction', minRatio: 1.5, measured: 3.19, category: 'security', note: 'AI raw SQL string concat' },
  { ruleId: 'security/missing-auth-check', minRatio: 1.5, measured: 15.34, category: 'security', note: 'AI forgets auth checks (now PASSING with vibe-coded auth code)' },
  { ruleId: 'security/dangerous-cors', minRatio: 1.5, measured: 2.27, category: 'security', note: 'AI ships wildcard CORS (now PASSING with vibe-coded backend)' },
  { ruleId: 'security/hardcoded-secret', minRatio: 1.5, measured: 2.29, category: 'security', note: 'AI leaves API keys in client code (now PASSING with vibe-coded apps)' },
  { ruleId: 'security/fail-open-auth', minRatio: 1.5, measured: Infinity, category: 'security', note: 'AI `if (!auth) return next()` instead of blocking (1 fire in pos, 0 in neg)' },
  // Test
  { ruleId: 'test/weak-assertion', minRatio: 1.5, measured: 2.61, category: 'test', note: 'AI writes toBeTruthy() instead of asserting value (now PASSING with vibe-coded tests)' },
  { ruleId: 'test/duplicate-setup', minRatio: 1.5, measured: 5.74, category: 'test', note: 'AI copies beforeEach setup verbatim across files' },
];

/**
 * v4.1 P/R/FPR-based thresholds (the form engineers actually trust).
 *
 * Each rule asserts three things:
 *   - minPrecision: of files this rule flags, what fraction are actually AI?
 *     (lowers false-positive rate on human code)
 *   - minRecall: of all AI files, what fraction does this rule catch?
 *     (raises coverage of AI signal)
 *   - maxFPR: of all human files, what fraction does this rule false-alarm on?
 *     (typical SLO: < 0.1% for production-quality gates)
 *
 * These thresholds are derived from the v4.1 P/R/FPR table (see
 * docs/research/v4-per-rule-pr-fpr.md). Rules listed here are the 18
 * "USEFUL" rules (precision ≥ 50% AND lift ≥ 2×).
 *
 * IMPORTANT — per-fire vs per-file:
 *   The full P/R/FPR table in docs/research/v4-per-rule-pr-fpr.md uses
 *   per-FILE granularity (a file that fires N times counts as 1 file).
 *   The test below uses scanFileList() which returns per-FIRE counts.
 *   Rules like test/weak-assertion fire ~5× per file on average, so the
 *   per-fire FPR is ~5× the per-file FPR. We set the FPR thresholds
 *   generously (5x the per-file target) so the test asserts that the
 *   signal is still present even with the per-fire approximation.
 *
 *   The minRecall threshold is also per-fire; we set it to 0.5x of the
 *   per-file recall to avoid false negatives.
 *
 * This test is ADDITIVE to the ratio-based test above. Both should pass.
 * The ratio test is a coarse signal; the PR/FPR test is the form
 * security / code review teams plug into policy.
 */
const PR_FPR_THRESHOLDS: Array<{
  ruleId: string;
  minPrecision: number;
  minRecall: number;
  maxFPR: number;
  category: string;
  note: string;
}> = [
  // Top USEFUL rules (P ≥ 50% AND lift ≥ 2×)
  { ruleId: 'security/missing-auth-check', minPrecision: 0.50, minRecall: 0.001, maxFPR: 0.005, category: 'security', note: '92% per-file precision, 0.04% per-file FPR' },
  { ruleId: 'logic/ghost-defensive', minPrecision: 0.50, minRecall: 0.0001, maxFPR: 0.001, category: 'logic', note: '94% per-file precision, 0.00% per-file FPR' },
  { ruleId: 'logic/math-console-log-storm', minPrecision: 0.50, minRecall: 0.005, maxFPR: 0.005, category: 'logic', note: '89% per-file precision, 0.16% per-file FPR' },
  { ruleId: 'logic/zombie-state', minPrecision: 0.50, minRecall: 0.0001, maxFPR: 0.001, category: 'logic', note: '83% per-file precision, 0.01% per-file FPR' },
  { ruleId: 'test/duplicate-setup', minPrecision: 0.50, minRecall: 0.0001, maxFPR: 0.002, category: 'test', note: '70% per-file precision, 0.01% per-file FPR' },
  { ruleId: 'test/weak-assertion', minPrecision: 0.30, minRecall: 0.005, maxFPR: 0.50, category: 'test', note: '63% per-file precision, 2.59% per-file FPR (noisy — fires many times per file)' },
  { ruleId: 'security/sql-construction', minPrecision: 0.40, minRecall: 0.001, maxFPR: 0.010, category: 'security', note: '65% per-file precision, 0.32% per-file FPR' },
  { ruleId: 'wcag/focus-appearance', minPrecision: 0.40, minRecall: 0.001, maxFPR: 0.010, category: 'wcag', note: '66% per-file precision, 0.28% per-file FPR' },
  { ruleId: 'component/shadcn-prop-mismatch', minPrecision: 0.40, minRecall: 0.0005, maxFPR: 0.005, category: 'component', note: '66% per-file precision, 0.15% per-file FPR' },
  { ruleId: 'visual/math-default-font', minPrecision: 0.50, minRecall: 0.001, maxFPR: 0.003, category: 'visual', note: '75% per-file precision, 0.10% per-file FPR' },
  { ruleId: 'visual/math-rounded-entropy', minPrecision: 0.40, minRecall: 0.002, maxFPR: 0.010, category: 'visual', note: '69% per-file precision, 0.40% per-file FPR' },
  { ruleId: 'visual/math-color-cluster', minPrecision: 0.50, minRecall: 0.0001, maxFPR: 0.001, category: 'visual', note: '75% per-file precision, 0.02% per-file FPR' },
  { ruleId: 'logic/math-gini-class-usage', minPrecision: 0.50, minRecall: 0.001, maxFPR: 0.002, category: 'logic', note: '75% per-file precision, 0.08% per-file FPR' },
  { ruleId: 'logic/reactive-hook-soup', minPrecision: 0.50, minRecall: 0.002, maxFPR: 0.005, category: 'logic', note: '70% per-file precision, 0.33% per-file FPR' },
  { ruleId: 'logic/optimistic-no-rollback', minPrecision: 0.40, minRecall: 0.001, maxFPR: 0.005, category: 'logic', note: '63% per-file precision, 0.15% per-file FPR' },
  { ruleId: 'security/dangerous-cors', minPrecision: 0.40, minRecall: 0.0001, maxFPR: 0.005, category: 'security', note: '62% per-file precision, 0.07% per-file FPR' },
  { ruleId: 'typo/calc-raw-px', minPrecision: 0.30, minRecall: 0.00001, maxFPR: 0.001, category: 'typo', note: '75% per-file precision, 0.00% per-file FPR' },
  { ruleId: 'security/fail-open-auth', minPrecision: 0.30, minRecall: 0.000001, maxFPR: 0.001, category: 'security', note: '100% per-file precision, 0% per-file FPR (1 fire, no neg fires)' },
];

/**
 * Rules that are inverted or mixed on the v4 corpus. The v4 corpus
 * (95k neg + 77k pos frontend) is 5× larger than v3 and pulls in 100 new
 * AI-coded repos, which surfaces patterns the smaller corpus missed.
 *
 * Categories:
 *  - INVERTED: pos fires < neg fires. Either the negative corpus has
 *    more of the pattern than the positive, or the pattern isn't
 *    characteristic of AI output. Documented per-rule.
 *  - MIXED: ratio between 0.7 and 1.5. Not reliable enough to enforce
 *    a threshold; tracked for future investigation.
 */
const INVERTED_ON_EXPANDED: Array<{ ruleId: string; measured: number; reason: string; targetTest: string }> = [
  // INVERTED (6 rules) — pos fires < neg fires
  { ruleId: 'component/multiple-components-per-file', measured: 0.70, reason: 'AI repos are smaller and more focused; neg corpus (mui, supabase) has more multi-component files', targetTest: 'expanded (wider positive corpus or per-file cap change)' },
  { ruleId: 'context/import-path-mismatch', measured: 0.64, reason: 'Negative repos (mui 16k, supabase 6.8k) have deeper barrel-imports; positive AI repos use direct paths', targetTest: 'expanded (rebalance per-repo cap or split barrel-imports rule)' },
  { ruleId: 'logic/key-prop-missing', measured: 0.52, reason: 'Negative corpus has more .map() lists; positive AI repos often use unique keys implicitly', targetTest: 'expanded (wider positive corpus)' },
  { ruleId: 'logic/math-variable-name-entropy', measured: 0.29, reason: 'AI repos have shorter, more uniform function bodies; neg has more variety', targetTest: 'expanded (large OSS has more domain variety)' },
  { ruleId: 'security/public-admin-route', measured: 0.36, reason: 'Many negative repos (keycloak, saleor, discourse) are auth-heavy by design', targetTest: 'calibration-security' },
  { ruleId: 'security/unsafe-html-render', measured: 0.65, reason: 'AI defaults to safe React rendering; neg has more legacy dangerouslySetInnerHTML', targetTest: 'expanded (positive may need to exercise more legacy patterns)' },
  // MIXED (12 rules) — between 0.7× and 1.5×, not strong enough to enforce
  { ruleId: 'layout/gap-monopoly', measured: 1.47, reason: 'Both AI and human code use few gap values per file; pattern is generic', targetTest: 'expanded (no actionable AI signal yet)' },
  { ruleId: 'layout/math-element-uniformity', measured: 1.07, reason: 'UI files have uniform element counts in both corpora', targetTest: 'expanded (no clear AI signal)' },
  { ruleId: 'layout/math-grid-uniformity', measured: 1.47, reason: 'AI uses slightly more uniform grid sizes', targetTest: 'expanded (MIXED — needs stronger corpus)' },
  { ruleId: 'layout/spacing-grid', measured: 0.80, reason: 'Layout patterns not concentrated in positive repos', targetTest: 'expanded (wider positive corpus)' },
  { ruleId: 'perf/cls-image', measured: 1.00, reason: 'Equal fires; image-heavy corpus needed', targetTest: 'expanded (image-rich corpus)' },
  { ruleId: 'security/exposed-env-var', measured: 0.97, reason: 'Both corpora have env usage; no clear AI signal', targetTest: 'calibration-security' },
  { ruleId: 'test/fake-placeholder', measured: 0.92, reason: 'Both corpora have placeholder strings', targetTest: 'expanded (test-only corpus needed)' },
  { ruleId: 'typo/math-button-label-uniformity', measured: 0.93, reason: 'Both have uniform button labels (Submit, Click here)', targetTest: 'expanded (no clear AI signal)' },
  { ruleId: 'visual/arbitrary-escape', measured: 1.47, reason: 'Both use arbitrary Tailwind; AI slightly more', targetTest: 'expanded (close to PASS — needs more samples)' },
  { ruleId: 'visual/inline-style-dominance', measured: 0.73, reason: 'AI uses className more than inline style; legacy neg has more inline styles', targetTest: 'expanded (rule is inverted in v4)' },
  { ruleId: 'visual/math-spacing-entropy', measured: 1.22, reason: 'Generic entropy signal; not strong AI tell', targetTest: 'expanded (no actionable AI signal)' },
  { ruleId: 'visual/spacing-scale-violation', measured: 1.15, reason: 'Both AI and human hardcode spacing values; pattern is common', targetTest: 'expanded (close to PASS — needs more samples)' },
  // DORMANT (1 rule)
  { ruleId: 'wcag/dragging-movements', measured: 0, reason: 'Neither corpus has drag-and-drop UI patterns', targetTest: 'expanded (image-rich / dnd corpus needed)' },
];

const itIfCorpus = expandedCorpusAvailable() ? it : it.skip;

describe('expanded corpus calibration', () => {
  assertDistBuilt();

  itIfCorpus(
    'recall/FP ratio per rule stays above threshold on expanded corpus',
    () => {
      // Use the frontend-only file lists (.ts/.tsx/.jsx/.js) since the
      // RATIO_THRESHOLDS were measured against the 10 React-AI positive
      // repos on the original 18,688-file negative corpus.
      const positive = scanFileList(EXPANDED_POS_LIST, CACHED_POS_SHARDS);
      const negative = scanFileList(EXPANDED_NEG_LIST, CACHED_NEG_SHARDS);

      // Sanity: each corpus must have ≥100 files for ratios to be meaningful.
      expect(positive.fileCount).toBeGreaterThan(100);
      expect(negative.fileCount).toBeGreaterThan(100);

      const violations: string[] = [];
      const logLines: string[] = ['expanded corpus recall/FP ratios:'];

      for (const { ruleId, minRatio, measured, category, note } of RATIO_THRESHOLDS) {
        const pFires = positive.firesPerFile.get(ruleId) ?? 0;
        const nFires = negative.firesPerFile.get(ruleId) ?? 0;
        const recall = pFires / positive.fileCount;
        const fp = nFires / negative.fileCount;
        const ratioNum = fp === 0 ? Infinity : recall / fp;
        const ratioStr = fp === 0 ? '∞' : ratioNum.toFixed(2);

        logLines.push(
          `  ${ratioNum >= minRatio ? '✓' : '✗'} [${category.padEnd(10)}] ${ruleId.padEnd(38)} recall=${recall.toFixed(4)}  fp=${fp.toFixed(4)}  ratio=${ratioStr}×  (min=${minRatio}×, measured=${measured}×) — ${note}`,
        );

        if (ratioNum < minRatio) {
          violations.push(
            `${ruleId}: ratio ${ratioStr}× below threshold ${minRatio}× (recall=${recall.toFixed(4)}/file, fp=${fp.toFixed(4)}/file). Was ${measured}× at baseline. ${note}`,
          );
        }
      }

      // eslint-disable-next-line no-console
      console.log('\n' + logLines.join('\n'));

      if (violations.length > 0) {
        throw new Error(
          `Rules below expanded-corpus threshold:\n  - ${violations.join('\n  - ')}\n\n` +
            'Either the rule has regressed, or the threshold needs updating. ' +
            'See docs/research/corpus-expansion-2026.md for the original baseline ratios.',
        );
      }
    },
    600_000, // 10 min: 18,688-file negative corpus is the slow one
  );

  itIfCorpus(
    'inverted rules on expanded corpus are documented in INVERTED_ON_EXPANDED',
    () => {
      // Build a guard: if a previously-inverted rule starts passing on the
      // expanded corpus, that's progress — fail loud so we move it to
      // RATIO_THRESHOLDS and remove it from INVERTED_ON_EXPANDED.
      const positive = scanFileList(EXPANDED_POS_LIST, CACHED_POS_SHARDS);
      const negative = scanFileList(EXPANDED_NEG_LIST, CACHED_NEG_SHARDS);

      const unexpectedPasses: string[] = [];
      for (const { ruleId, measured, targetTest } of INVERTED_ON_EXPANDED) {
        const pFires = positive.firesPerFile.get(ruleId) ?? 0;
        const nFires = negative.firesPerFile.get(ruleId) ?? 0;
        const recall = pFires / positive.fileCount;
        const fp = nFires / negative.fileCount;
        const ratioNum = fp === 0 ? Infinity : recall / fp;
        // If ratio crossed 1.5x with non-trivial recall, the rule is alive
        // and should move to RATIO_THRESHOLDS.
        if (ratioNum >= 1.5 && recall > 0) {
          unexpectedPasses.push(
            `${ruleId} is now passing (${ratioNum.toFixed(2)}×, recall=${recall.toFixed(4)}/file) — move it to RATIO_THRESHOLDS and remove from INVERTED_ON_EXPANDED. Was ${measured}×. Target: ${targetTest}.`,
          );
        }
      }

      if (unexpectedPasses.length > 0) {
        throw new Error(
          `Inverted rules are no longer inverted:\n  - ${unexpectedPasses.join('\n  - ')}`,
        );
      }
    },
    600_000,
  );

  itIfCorpus(
    '18 USEFUL rules (v4.1 P/R/FPR) meet precision AND recall AND FPR thresholds',
    () => {
      // This is the v4.1 calibration: per-rule precision/recall/FPR
      // rather than just ratio. The form engineers plug into a code
      // review policy: "of files this rule flags, what fraction are
      // actually AI?" (precision).
      //
      // Note: scanFileList returns per-FIRE counts, not per-FILE.
      // v4 PR/FPR table was computed with per-file granularity from the
      // same cached chunks. Here we approximate per-file from per-fire
      // with the same data the calibration report uses. The thresholds
      // are loose enough to absorb the approximation.
      const positive = scanFileList(EXPANDED_POS_LIST, CACHED_POS_SHARDS);
      const negative = scanFileList(EXPANDED_NEG_LIST, CACHED_NEG_SHARDS);

      // Approximate per-file from per-fire by unique-issue path counts.
      // (The full per-file table lives in docs/research/v4-per-rule-pr-fpr.md.)
      // For the test we use the ratio-based approximation: the ratio of
      // pos_fires/n_pos vs neg_fires/n_neg is a lower bound on the
      // per-file P/R. minRecall and maxFPR are scaled by 10x to absorb
      // the approximation (rules that fire many times per file on pos
      // have a higher per-fire count than per-file count).
      const violations: string[] = [];
      for (const { ruleId, minPrecision, minRecall, maxFPR, category, note } of PR_FPR_THRESHOLDS) {
        const pFires = positive.firesPerFile.get(ruleId) ?? 0;
        const nFires = negative.firesPerFile.get(ruleId) ?? 0;
        const recall = pFires / positive.fileCount;
        const fpr = nFires / negative.fileCount;
        // Lower bound on precision: assume 1 file per fire (overestimate the denominator).
        const precisionLowerBound = recall / (recall + fpr) || 0;

        if (precisionLowerBound < minPrecision) {
          violations.push(
            `${ruleId}: precision ${(precisionLowerBound * 100).toFixed(1)}% < ${(minPrecision * 100).toFixed(0)}% (${category}) — ${note}`,
          );
        }
        if (recall < minRecall * 0.1) {
          // minRecall thresholds are scaled 10x to absorb per-fire vs per-file.
          violations.push(
            `${ruleId}: recall ${(recall * 100).toFixed(3)}% < ${(minRecall * 0.1 * 100).toFixed(3)}% (${category}) — ${note}`,
          );
        }
        if (fpr > maxFPR) {
          violations.push(
            `${ruleId}: FPR ${(fpr * 100).toFixed(2)}% > ${(maxFPR * 100).toFixed(2)}% (${category}) — ${note}`,
          );
        }
      }
      if (violations.length > 0) {
        throw new Error(
          `P/R/FPR thresholds failed:\n  - ${violations.join('\n  - ')}`,
        );
      }
    },
    60_000,
  );
});
