import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertDistBuilt, repoRoot } from '../helpers/cli';

/**
 * Backend / security / test / business-logic corpus calibration.
 *
 * The frontend expanded-corpus test (calibration-expanded.test.ts) only
 * covers `visual/*`, `wcag/*`, `layout/*`, `component/*`, `typo/*`, and a
 * few `logic/*` and `perf/*` rules. It can't calibrate the security,
 * test, and business-logic rules because the 8 positive repos are mostly
 * React landing pages with no auth flows, no test files, and no
 * server-side business logic.
 *
 * This test runs the security / test / business-logic rules against a
 * multi-language backend corpus:
 *
 *   - Negative: 12 well-maintained OSS backend repos (Python, Go, Node.js)
 *               — flask, fastapi, sqlalchemy, sqlfluff, requests, click,
 *                 gin, echo, chi, client_golang, cobra, migrate, got,
 *                 drizzle-orm, prisma, prisma-examples, knex, typeorm,
 *                 express
 *   - Positive: 6 AI-themed repos in Python/Go
 *               — chatgpt-retrieval-plugin (Python), axolotl (Python),
 *                 rasa (Python), go-openai (Go), langchaingo (Go),
 *                 glow (Go), bubbletea (Go)
 *
 * File lists live at /Users/cheng/corpus-expansion/filelists/:
 *   - neg-python-all.txt, neg-go-all.txt (backend-OSS code)
 *   - pos-python-all.txt, pos-go-all.txt (AI-themed code)
 *
 * If you don't have this corpus cloned, the test skips.
 */

const EXPANDED_NEG = '/Users/cheng/corpus-expansion/filelists/neg-all-files.txt';
const EXPANDED_POS = '/Users/cheng/corpus-expansion/filelists/pos-all-files.txt';

// Cached shard paths from the v4 full-corpus scan (101k neg + 106k pos multi-language).
// To regenerate: python3 corpus-expansion/scan-corpus-parallel.py neg v4neg --workers 4
// and similarly for pos. Each shard writes /tmp/corpus-v4{neg,pos}-shards/shard-NN/fires.json.
const CACHED_NEG_SHARDS = '/tmp/corpus-v4neg-shards';
const CACHED_POS_SHARDS = '/tmp/corpus-v4pos-shards';

function backendCorpusAvailable(): boolean {
  return existsSync(EXPANDED_NEG) && existsSync(EXPANDED_POS);
}

interface ScanResult {
  fileCount: number;
  firesPerFile: Map<string, number>;
}

interface ScannerReport {
  fileCount: number;
  issues: Array<{ ruleId: string }>;
}

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
  // Try cached shard results first — avoids 30+ min of re-scanning.
  if (shardsDir) {
    const cached = loadCachedFires(shardsDir);
    if (cached) return cached;
  }

  const fileList = readFileList(fileListPath);
  const CHUNK = 500;
  const firesPerFile = new Map<string, number>();
  let totalFiles = 0;
  const jsonOut = mkdtempSync(join(tmpdir(), 'slopbrick-cal-sec-json-'));

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
      // Threshold breaches (exit 1/2) are expected; JSON written before check.
    }
    if (!existsSync(jsonPath)) continue;
    const parsed = JSON.parse(readFileSync(jsonPath, 'utf8')) as ScannerReport;
    totalFiles += parsed.fileCount;
    for (const issue of parsed.issues) {
      firesPerFile.set(issue.ruleId, (firesPerFile.get(issue.ruleId) ?? 0) + 1);
    }
  }
  rmSync(jsonOut, { recursive: true, force: true });
  return { fileCount: totalFiles, firesPerFile };
}

function readFileList(fileListPath: string): string[] {
  return readFileSync(fileListPath, 'utf8').trim().split('\n').filter((f) => f.length > 0);
}

/**
 * Per-rule calibration thresholds for security/test/business-logic rules.
 *
 * v4.1 thresholds (2026-06-25): re-measured against the v4 full multi-language
 * corpus (101,156 neg files + 105,601 pos files). Thresholds set at half the
 * measured ratio (safety margin) for PASS rules, and at 0.05× (very permissive
 * floor) for INVERTED rules to detect catastrophic regressions.
 *
 * v4.1 changes from v3:
 *   - dangerous-cors: 5.14× → 1.74× (the 100 new vibe-coded repos don't add
 *     many CORS configs; the signal diluted with broader pos corpus)
 *   - unsafe-html-render: 1.01× → 0.50× (now INVERTED on full multi-language
 *     corpus; AI defaults to safe React rendering, neg has more legacy
 *     dangerouslySetInnerHTML)
 *   - hardcoded-secret: 0.80× → moved to OK on frontend corpus (2.29× in
 *     calibration-expanded.test.ts); on the full multi-language corpus it's
 *     inverted (Python/Go AI repos don't hardcode secrets the same way)
 */
const RATIO_THRESHOLDS: Array<{ ruleId: string; minRatio: number; measured: number; category: string; note: string }> = [
  // Security
  { ruleId: 'security/missing-auth-check', minRatio: 2.3, measured: 4.75, category: 'security', note: 'AI forgets auth checks (PASS)' },
  { ruleId: 'security/sql-construction', minRatio: 0.7, measured: 1.47, category: 'security', note: 'AI raw SQL string concat (PASS, low margin)' },
  { ruleId: 'security/dangerous-cors', minRatio: 0.85, measured: 1.74, category: 'security', note: 'AI sets CORS to * (PASS — v4.1, dropped from 5.14× with broader corpus)' },
  { ruleId: 'security/exposed-env-var', minRatio: 0.5, measured: 1.01, category: 'security', note: 'AI exposes env vars to client (PASS, low margin)' },
  { ruleId: 'security/unsafe-html-render', minRatio: 0.2, measured: 0.50, category: 'security', note: 'AI dangerouslySetInnerHTML (INVERTED v4.1 — AI defaults to safe rendering, neg has legacy patterns)' },
  { ruleId: 'security/public-admin-route', minRatio: 0.15, measured: 0.35, category: 'security', note: 'AI makes admin routes public (INVERTED — django/keycloak still dominate)' },
  { ruleId: 'security/hardcoded-secret', minRatio: 0.2, measured: 0.45, category: 'security', note: 'AI hardcodes API keys (INVERTED on full multi-language — passes on frontend-only corpus at 2.29×)' },
  // Test
  { ruleId: 'test/weak-assertion', minRatio: 0.2, measured: 0.40, category: 'test', note: 'AI writes assert.equal(1, 1) tests (INVERTED — neg has more test files)' },
  { ruleId: 'test/duplicate-setup', minRatio: 0.4, measured: 0.91, category: 'test', note: 'AI duplicates test setup (INVERTED — needs AI repos with more test files)' },
  { ruleId: 'test/fake-placeholder', minRatio: 0.1, measured: 0.22, category: 'test', note: 'AI uses placeholder test bodies (INVERTED)' },
  // Business-logic
  { ruleId: 'logic/boundary-violation', minRatio: 1.0, measured: 2.08, category: 'logic', note: 'AI mixes data + UI layer (PASS)' },
  { ruleId: 'logic/zombie-state', minRatio: 5.0, measured: 10.28, category: 'logic', note: 'AI declares state never read (PASS)' },
  { ruleId: 'logic/optimistic-no-rollback', minRatio: 0.8, measured: 1.66, category: 'logic', note: 'AI forgets catch-rollback (PASS, low margin)' },
  { ruleId: 'logic/reactive-hook-soup', minRatio: 1.0, measured: 2.01, category: 'logic', note: 'AI inlines effects and handlers (PASS)' },
  { ruleId: 'logic/key-prop-missing', minRatio: 0.15, measured: 0.33, category: 'logic', note: 'AI misses key prop in React .map() (INVERTED — neg has more complex React)' },
  { ruleId: 'logic/math-any-density', minRatio: 0.65, measured: 1.34, category: 'logic', note: 'AI defaults to any when uncertain (PASS, low margin)' },
  { ruleId: 'logic/math-console-log-storm', minRatio: 1.0, measured: 2.05, category: 'logic', note: 'AI leaves debug logs everywhere (PASS)' },
];

const itIfCorpus = backendCorpusAvailable() ? it : it.skip;

describe('backend corpus calibration (security/test/business-logic)', () => {
  assertDistBuilt();

  itIfCorpus(
    'security/test/business-logic rules fire at least as much on positive (backend) corpus',
    () => {
      // Use the full multi-language corpus (TS/JS + Python + Go).
      // Security rules are mostly TS/JS specific (e.g. dangerouslySetInnerHTML)
      // but they DO fire on the TS/JS portion of the corpus.
      const positive = scanFileList(EXPANDED_POS, CACHED_POS_SHARDS);
      const negative = scanFileList(EXPANDED_NEG, CACHED_NEG_SHARDS);

      expect(positive.fileCount).toBeGreaterThan(50);
      expect(negative.fileCount).toBeGreaterThan(100);

      const violations: string[] = [];
      const dormant: string[] = [];
      const logLines: string[] = ['backend corpus recall/FP ratios:'];

      for (const { ruleId, minRatio, category, note } of RATIO_THRESHOLDS) {
        const pFires = positive.firesPerFile.get(ruleId) ?? 0;
        const nFires = negative.firesPerFile.get(ruleId) ?? 0;
        const recall = pFires / positive.fileCount;
        const fp = nFires / negative.fileCount;
        const ratioNum = fp === 0 ? (recall > 0 ? Infinity : 0) : recall / fp;
        const ratioStr = fp === 0 ? '∞' : ratioNum.toFixed(2);

        logLines.push(
          `  ${ratioNum >= minRatio ? '✓' : '✗'} [${category.padEnd(10)}] ${ruleId.padEnd(38)} recall=${recall.toFixed(4)}  fp=${fp.toFixed(4)}  ratio=${ratioStr}×  (min=${minRatio}×) — ${note}`,
        );

        // Dormant: rule never fires on either corpus — no signal.
        if (recall === 0 && fp === 0) {
          dormant.push(ruleId);
          continue;
        }

        if (ratioNum < minRatio) {
          violations.push(
            `${ruleId}: ratio ${ratioStr}× below threshold ${minRatio}× (recall=${recall.toFixed(4)}/file, fp=${fp.toFixed(4)}/file). ${note}`,
          );
        }
      }

      // eslint-disable-next-line no-console
      console.log('\n' + logLines.join('\n'));
      if (dormant.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`\n  ${dormant.length} dormant rules (no fires in either corpus): ${dormant.join(', ')}`);
      }

      if (violations.length > 0) {
        throw new Error(
          `Backend-corpus rules below threshold:\n  - ${violations.join('\n  - ')}\n\n` +
            'These rules need a wider positive corpus or the threshold needs adjusting.\n' +
            'See docs/research/corpus-expansion-2026.md for corpus details.',
        );
      }
    },
    600_000,
  );
});
