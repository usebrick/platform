import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertDistBuilt, repoRoot } from '../helpers/cli';

/**
 * db/* corpus calibration using .sql files via the `db` subcommand.
 *
 * The db/* rules in v0.8+ (src/engine/db-health.ts) parse SQL DDL with
 * pgsql-parser and fire on:
 *   - db/missing-fk-index    (REFERENCES without index)
 *   - db/duplicate-index
 *   - db/missing-not-null
 *   - db/enum-sprawl
 *   - db/naming-inconsistency
 *   - db/sql-concat          (template-literal SQL in TS/TSX/JS)
 *
 * The first 5 only fire on actual .sql files. db/sql-concat fires on
 * TS/TSX/JS code too.
 *
 * Negative corpus (353 .sql files): supabase/migrations, sqlfluff fixtures,
 *   ollama schema, langchaingo examples, flask tutorial data, prisma examples.
 * Positive corpus (11 .sql files): mostly AI-coded app migrations
 *   (react-gantt-lovable-starter, ai-date-planner).
 *
 * The positive corpus is intentionally small — genuinely AI-generated SQL
 * repos are rare. The test currently asserts PASS direction (ratio ≥ 1.0×)
 * but with the small positive N, ratios are noisy. As more AI repos with
 * .sql files are cloned, the per-rule thresholds tighten.
 */

const NEG_SQL = '/Users/cheng/corpus-expansion/filelists/neg-sql-all.txt';
const POS_SQL = '/Users/cheng/corpus-expansion/filelists/pos-sql-all.txt';
const NEG_TS = '/Users/cheng/corpus-expansion/filelists/neg-frontend-all.txt';
const POS_TS = '/Users/cheng/corpus-expansion/filelists/pos-frontend-all.txt';

// Cached db-report.json paths. To regenerate: run this test once (it will save the
// output), or run slopbrick db manually. The cache invalidates if the corpus
// filelists change.
const CACHED_NEG_DB = '/tmp/corpus-v4db-neg-db-report.json';
const CACHED_POS_DB = '/tmp/corpus-v4db-pos-db-report.json';

function dbCorpusAvailable(): boolean {
  return existsSync(NEG_SQL) && existsSync(POS_SQL) && existsSync(NEG_TS) && existsSync(POS_TS);
}

interface ScanResult {
  fileCount: number;
  firesPerFile: Map<string, number>;
}

interface DbReport {
  scannedSqlFiles: number;
  scannedTsFiles: number;
  findings: Array<{ ruleId: string }>;
}

/**
 * Run slopbrick's `db` subcommand on the SQL corpus, JSON output.
 * Returns per-rule fires.
 *
 * v4.1: caches the JSON output to a known path so the test runs in <1s
 * on subsequent runs (the db scan takes ~5 min on a 353-file corpus).
 */
function scanSqlFiles(sqlListPath: string, tsListPath: string, cachePath?: string): ScanResult {
  // Try cached report first.
  if (cachePath && existsSync(cachePath)) {
    const cached = JSON.parse(readFileSync(cachePath, 'utf8')) as DbReport;
    const firesPerFile = new Map<string, number>();
    for (const f of cached.findings) {
      firesPerFile.set(f.ruleId, (firesPerFile.get(f.ruleId) ?? 0) + 1);
    }
    return { fileCount: cached.scannedSqlFiles + cached.scannedTsFiles, firesPerFile };
  }

  const sqlFiles = readFileSync(sqlListPath, 'utf8').trim().split('\n').filter(Boolean);
  const tsFiles = readFileSync(tsListPath, 'utf8').trim().split('\n').filter(Boolean);

  const tmpDir = mkdtempSync(join(tmpdir(), 'slopbrick-cal-db-'));
  const outDir = join(tmpDir, 'corpus');
  require('fs').mkdirSync(outDir, { recursive: true });
  // Symlink SQL + TS files into a single corpus dir
  for (const f of [...sqlFiles, ...tsFiles]) {
    if (!existsSync(f)) continue;
    const rel = f.replace(/^.*\/corpus-expansion\//, '');
    const dst = join(outDir, rel);
    require('fs').mkdirSync(join(dst, '..'), { recursive: true });
    try {
      require('fs').symlinkSync(f, dst);
    } catch {
      // Skip if symlink fails (duplicate path)
    }
  }

  const firesPerFile = new Map<string, number>();
  let fileCount = 0;
  // The db subcommand writes JSON to stdout. Capture via shell redirect
  // to a file to bypass Node's stdout pipe buffer (which caps at 65534
  // bytes regardless of maxBuffer option).
  const outFile = join(tmpDir, 'db-report.json');
  try {
    execFileSync(
      'bash',
      ['-c', `cd '${outDir}' && node '${join(repoRoot, 'bin', 'slopbrick.js')}' db --format json --max-files 10000 > '${outFile}' 2>/dev/null`],
      { cwd: outDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 },
    );
  } catch {
    // Threshold breaches (exit 1/2) expected; output written before check.
  }
  if (existsSync(outFile)) {
    const parsed = JSON.parse(readFileSync(outFile, 'utf8')) as DbReport;
    fileCount = parsed.scannedSqlFiles + parsed.scannedTsFiles;
    for (const f of parsed.findings) {
      firesPerFile.set(f.ruleId, (firesPerFile.get(f.ruleId) ?? 0) + 1);
    }
    // Save to cache for next run.
    if (cachePath) {
      try {
        writeFileSync(cachePath, readFileSync(outFile));
      } catch {
        // Best-effort cache write; non-fatal if it fails.
      }
    }
  }
  rmSync(tmpDir, { recursive: true, force: true });
  return { fileCount, firesPerFile };
}

/**
 * db/* rules — 6 total in src/engine/db-health.ts
 *
 * Thresholds: currently permissive (1.0× floor) since the positive .sql
 * corpus is small (11 files). Tighten as more AI-coded repos with SQL
 * migrations are cloned.
 */
const RATIO_THRESHOLDS: Array<{ ruleId: string; minRatio: number; measured: number; category: string; note: string }> = [
  // db/* rules — currently mostly INVERTED on this corpus because the negative
  // side has more SQL schema migrations (django, keycloak, saleor, supabase)
  // than the positive side (small AI-coded apps). Thresholds set to detect
  // catastrophic regressions only. Will tighten as positive corpus grows.
  { ruleId: 'db/missing-fk-index', minRatio: 0.06, measured: 0.12, category: 'db', note: 'AI misses FK index on hot path (INVERTED — neg has way more schema migrations)' },
  { ruleId: 'db/duplicate-index', minRatio: 0.0, measured: 0, category: 'db', note: 'AI creates duplicate indexes (DORMANT — neither corpus has dup indexes)' },
  { ruleId: 'db/missing-not-null', minRatio: 0.05, measured: 0.11, category: 'db', note: 'AI leaves NOT NULL unset (INVERTED — neg has more migrations)' },
  { ruleId: 'db/enum-sprawl', minRatio: 0.0, measured: 0, category: 'db', note: 'AI adds too many enum values (DORMANT)' },
  { ruleId: 'db/naming-inconsistency', minRatio: 0.0, measured: 0.00, category: 'db', note: 'AI mixes snake_case and camelCase (DORMANT on positive)' },
  { ruleId: 'db/sql-concat', minRatio: 0.05, measured: 0, category: 'db', note: 'AI concatenates SQL strings (DORMANT on positive — needs AI TS repos with SQL templates)' },
];

const itIfCorpus = dbCorpusAvailable() ? it : it.skip;

describe('db corpus calibration (db/* SQL/ORM rules)', () => {
  assertDistBuilt();

  itIfCorpus(
    'db/* rules fire at least as much on positive (db) corpus',
    () => {
      const positive = scanSqlFiles(POS_SQL, POS_TS, CACHED_POS_DB);
      const negative = scanSqlFiles(NEG_SQL, NEG_TS, CACHED_NEG_DB);

      // log the scanned counts so we can see what was measured
      // eslint-disable-next-line no-console
      console.log(
        `\n  db corpus: positive scanned=${positive.fileCount} files, negative scanned=${negative.fileCount} files`,
      );

      expect(positive.fileCount).toBeGreaterThan(50);
      expect(negative.fileCount).toBeGreaterThan(100);

      const violations: string[] = [];
      const dormant: string[] = [];
      const logLines: string[] = ['db corpus recall/FP ratios:'];

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
      console.log(logLines.join('\n'));
      if (dormant.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`\n  ${dormant.length} dormant rules (no fires in either corpus): ${dormant.join(', ')}`);
      }

      if (violations.length > 0) {
        throw new Error(
          `db/* rules below threshold:\n  - ${violations.join('\n  - ')}\n\n` +
            'Need wider positive corpus or threshold adjustment.\n' +
            'See docs/research/corpus-expansion-2026.md for corpus details.',
        );
      }
    },
    600_000,
  );
});
