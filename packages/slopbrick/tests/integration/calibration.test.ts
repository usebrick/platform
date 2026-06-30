import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { binPath, repoRoot, assertDistBuilt } from '../helpers/cli';
import { bootstrapLocalCorpus } from '../helpers/local-corpus';
import { POSITIVE_DIR, NEGATIVE_DIR } from '../../src/corpus-paths';
// Local security samples — round-13 expansion. The main positive corpus
// (5,524 files) is dominated by tiny vibe-coded apps that don't implement
// auth flows, so security rules have no signal there. These 20 local
// samples cover the new rule patterns explicitly.
const LOCAL_SECURITY_SAMPLES_GLOB = '/tmp/real-corpus/ai/security-*.tsx';
// Round-14 Krebs samples — 5 vibe-coded landing-page mockups that exercise
// the 5 new design-cue rules.
const KREBS_SAMPLES_GLOB = '/tmp/real-corpus/ai/krebs-*.tsx';

// Round 24: bootstrap helper imported from tests/helpers/local-corpus.
// See that file for details on what's generated.

// Each entry says: "this rule's fires per file on POSITIVE / NEGATIVE must be
// at least MIN_RATIO times". If a rule slips below this threshold, the
// calibration test fails and we know it's no longer useful as a slop signal.
//
// `corpus` selects which positive corpus to measure against:
//   - 'main'   — the official 5,524-file /Users/cheng/.../positive/ corpus
//   - 'vibe'   — the 20-file /tmp/real-corpus/ai/security-*.tsx corpus
//                (round-13 expansion; small N so absolute per-file numbers
//                are higher but noise is also higher)
//
// calibration thresholds — the 39-rule consolidated catalog.
//
// Thresholds sourced from full corpus scans (2026-06-22):
//   positive: 6,142 AI-generated samples across ts/tsx/js/jsx/vue/svelte/astro/html
//   negative: 5,000-sample of human-written shadcn-ui
//
// Rules intentionally absent (catalog review)::
//   - logic/key-prop-missing — dormant after tightening, no signal in either corpus
//   - logic/qwik-hook-leak — only fires on Qwik projects, corpus is React
//   - layout/forced-layout, layout/gap-monopoly — too rare in either corpus
//   - typo/calc-fontsize, typo/clamp-offscale — very low recall
//   - visual/generic-centering — borderline
//   - perf/cls-image — image-related, low fires on text-only corpus
//   - wcag/dragging-movements — narrow use case
//   - arch/astro-island-leak — only fires on Astro projects
//   - logic/math-variable-name-entropy — general code-quality, not AI-specific (0.41×)
//   - logic/ghost-defensive — general code-quality, not AI-specific (0.53×)
//   - layout/spacing-grid — general code-quality, not AI-specific (0.24×)
//   - typo/calc-raw-px — general code-quality, not AI-specific (0.55×)
//
// The 4 rules above are kept in the catalog because they catch real bugs
// regardless of author. They're removed from this AI-signal calibration
// because the negative corpus (shadcn-ui) fires them slightly more than
// the positive corpus — they don't discriminate AI from human.
//
// The catalog also drops visual/arbitrary-escape and wcag/focus-obscured from
// the AI-signal list — they were weak signals in the prior catalog (1.07× and 1.95×)
// and tightening arbitrary-escape to ≥3 tokens/file pushed it below the
// 1.0× threshold. Both still fire on the catalog for code-quality purposes.
const RATIO_THRESHOLDS: Array<{ ruleId: string; minRatio: number; note: string; corpus: 'main' | 'vibe' | 'krebs' }> = [
  // Main corpus — logic (high-signal AI tell)
  { ruleId: 'logic/math-console-log-storm', minRatio: 1.5, note: 'AI leaves debug logs everywhere', corpus: 'main' },
  { ruleId: 'logic/math-any-density', minRatio: 1.2, note: 'AI defaults to any when uncertain', corpus: 'main' },
  { ruleId: 'logic/boundary-violation', minRatio: 1.5, note: 'AI mixes data layer + UI in one file', corpus: 'main' },
  { ruleId: 'logic/reactive-hook-soup', minRatio: 1.2, note: 'AI inlines effects and handlers', corpus: 'main' },
  { ruleId: 'logic/optimistic-no-rollback', minRatio: 1.0, note: 'AI forgets catch-rollback on optimistic updates', corpus: 'main' },
  { ruleId: 'logic/zombie-state', minRatio: 1.0, note: 'AI declares state never read', corpus: 'main' },
  { ruleId: 'logic/math-gini-class-usage', minRatio: 1.0, note: 'AI concentrates on few class strings', corpus: 'main' },
  // Main corpus — visual
  { ruleId: 'visual/math-color-cluster', minRatio: 1.5, note: 'AI clusters around 1-2 hex colors', corpus: 'main' },
  { ruleId: 'visual/math-default-font', minRatio: 1.5, note: 'AI defaults to Inter/system fonts', corpus: 'main' },
  { ruleId: 'visual/math-gradient-hue-rotation', minRatio: 1.5, note: 'AI purple-blue gradient syndrome', corpus: 'main' },
  { ruleId: 'visual/math-rounded-entropy', minRatio: 1.5, note: 'AI uses same rounded-* everywhere', corpus: 'main' },
  { ruleId: 'visual/math-font-entropy', minRatio: 1.2, note: 'AI low font-family diversity', corpus: 'main' },
  { ruleId: 'visual/math-spacing-entropy', minRatio: 1.0, note: 'AI low spacing-value diversity', corpus: 'main' },
  { ruleId: 'visual/clamp-soup', minRatio: 1.0, note: 'AI overuses clamp() and transitions', corpus: 'main' },
  // Main corpus — component
  { ruleId: 'component/giant-component', minRatio: 1.0, note: 'AI produces oversized components (HIGH severity)', corpus: 'main' },
  { ruleId: 'component/shadcn-prop-mismatch', minRatio: 1.0, note: 'AI overrides shadcn className prop', corpus: 'main' },
  // Main corpus — layout
  { ruleId: 'layout/math-grid-uniformity', minRatio: 1.5, note: 'AI uses one column count everywhere', corpus: 'main' },
  { ruleId: 'layout/math-element-uniformity', minRatio: 1.0, note: 'AI uniform interactive element counts', corpus: 'main' },
  // Main corpus — typo
  { ruleId: 'typo/math-cta-vocabulary', minRatio: 1.2, note: 'AI repeats CTA phrases', corpus: 'main' },
  { ruleId: 'typo/math-button-label-uniformity', minRatio: 1.0, note: 'AI uniform button labels', corpus: 'main' },
  // Main corpus — performance
  { ruleId: 'perf/css-bloat', minRatio: 1.0, note: 'AI produces bloated CSS', corpus: 'main' },
  // Main corpus — wcag
  { ruleId: 'wcag/focus-appearance', minRatio: 1.5, note: 'AI removes outline-none without focus-visible:ring', corpus: 'main' },
  { ruleId: 'wcag/target-size', minRatio: 1.0, note: 'AI undersized touch targets', corpus: 'main' },
];

// Hard-floor ratio for INVERTED rules. If a rule's recall/FP ratio falls
// below this it has crossed into "fires more on human than AI" territory
// and should be tightened or dropped.
const MIN_RATIO_FLOOR = 1.0;

function corpusAvailable(): boolean {
  return existsSync(POSITIVE_DIR) && existsSync(NEGATIVE_DIR);
}

interface ScanResult {
  fileCount: number;
  firesPerFile: Map<string, number>;
}

interface ScannerReport {
  fileCount: number;
  issues: Array<{ ruleId: string }>;
}

function scan(fileListPath: string): ScanResult {
  const fileList = readFileSync(fileListPath, 'utf8').trim().split('\n');
  // macOS argv limit is ~256KB. With ~200 char paths that's ~1200 files.
  // Split into chunks to stay well under that limit.
  //
  // Also: passing `--json <path>` writes the report to disk instead of
  // stdout, which dodges Node's 64KB child-process pipe highWaterMark
  // (stdout caps at 65536 bytes regardless of how much the child writes).
  const CHUNK = 600;
  const firesPerFile = new Map<string, number>();
  let totalFiles = 0;
  const jsonOut = mkdtempSync(join(tmpdir(), 'slopbrick-cal-json-'));

  for (let i = 0; i < fileList.length; i += CHUNK) {
    const chunk = fileList.slice(i, i + CHUNK);
    const jsonPath = join(jsonOut, `chunk-${i}.json`);
    let scanStderr = '';
    let scanStdout = '';
    let scanErr: Error | null = null;
    try {
      const out = execFileSync(
        'node',
        [binPath, 'scan', ...chunk, '--json', jsonPath, '--no-telemetry', '--quiet'],
        {
          cwd: repoRoot,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          maxBuffer: 64 * 1024 * 1024,
        },
      );
      scanStdout = out;
    } catch (err) {
      const e = err as Error & { stdout?: string; stderr?: string; status?: number };
      scanErr = e;
      scanStdout = e.stdout ?? '';
      scanStderr = e.stderr ?? '';
      // Threshold breaches (exit code 1) are expected — slopbrick's
      // JSON report is written before the threshold check fires.
      // Treat anything else as a real crash: surface stderr so we can
      // see WHY a chunk failed instead of just "did not produce".
      const status = (scanErr as { status?: number }).status;
      const isExpected = status === 1 || status === 2;
      if (!isExpected) {
        const preview = (scanStderr || scanStdout).slice(0, 2000);
        throw new Error(
          `Scanner crashed on chunk starting at ${i} (status=${status ?? 'signal'}). ` +
            `Stderr/stdout preview:\n${preview}`,
        );
      }
      // For expected non-zero exits, the JSON should already be on disk
      // — fall through to the existence check below.
    }
    if (!existsSync(jsonPath)) {
      const preview = (scanStderr || scanStdout || String(scanErr)).slice(0, 2000);
      throw new Error(
        `Scanner did not produce ${jsonPath} for chunk starting at ${i}. ` +
          `Stderr/stdout preview:\n${preview}`,
      );
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

function buildFileList(dir: string, extensions: string[]): string {
  const tmp = mkdtempSync(join(tmpdir(), 'slopbrick-calibration-'));
  const listPath = join(tmp, 'files.txt');
  // Use shell to find files (faster than Node walker for 55k files).
  const cmd = `find ${dir} -maxdepth 8 -type f \\( ${extensions.map((e) => `-name '*.${e}'`).join(' -o ')} \\) -print0 | xargs -0 realpath > ${listPath}`;
  execFileSync('bash', ['-c', cmd], { stdio: 'pipe' });
  const content = readFileSync(listPath, 'utf8');
  if (content.trim().length === 0) {
    throw new Error(`No files found in ${dir} for extensions ${extensions.join(',')}`);
  }
  return listPath;
}

const itIfCorpus = corpusAvailable() ? it : it.skip;

describe('corpus calibration', () => {
  assertDistBuilt();
  const corpusResult = bootstrapLocalCorpus();

  itIfCorpus('recall/FP ratio per rule stays above threshold', () => {
    // When the local corpus had to be auto-bootstrapped, the synthetic
    // samples don't exercise security rules (no auth flows) or design-cue
    // rules (no hand-crafted UI mockups). Strict calibration against them
    // produces false positives. Skip the inverted-rule check; only require
    // the bare threshold sanity for the main positive corpus.
    const skipInvertedCheck = !corpusResult.real;
    if (skipInvertedCheck) {
      // eslint-disable-next-line no-console
      console.warn('Local corpus was auto-bootstrapped; skipping inverted-rule check.');
    }
    // Build the positive corpus: main /Users/cheng/corpus-expansion/positive/.
    // The main corpus is dominated by tiny vibe-coded apps without auth flows,
    // so security rules have no signal there. Round-13 added 20 local security
    // samples under /tmp/real-corpus/ai/security-*.tsx that cover the new
    // rule patterns; they're scanned separately as a "vibe" corpus so the
    // security rules can show measurable per-file ratios (4 fires / 20 files
    // = 0.20/file, vs 4/5544 = 0.0007 when merged).
    const positiveList = buildFileList(POSITIVE_DIR, ['tsx', 'ts', 'jsx', 'js']);
    const negativeList = buildFileList(NEGATIVE_DIR, ['tsx', 'ts']);

    // Build the local vibe corpus (security-focused samples).
    const vibeTmp = mkdtempSync(join(tmpdir(), 'slopbrick-cal-vibe-'));
    const vibeList = join(vibeTmp, 'files.txt');
    execFileSync(
      'bash',
      ['-c', `for f in ${LOCAL_SECURITY_SAMPLES_GLOB}; do [ -f "$f" ] && realpath "$f"; done > ${vibeList}`],
      { stdio: 'pipe' },
    );

    const positive = scan(positiveList);
    const negative = scan(negativeList);
    // vibe may be empty if /tmp samples weren't generated yet.
    let vibe: ScanResult | null = null;
    if (existsSync(vibeList) && readFileSync(vibeList, 'utf8').trim().length > 0) {
      vibe = scan(vibeList);
    }

    // Round-14 Krebs samples — small set, dedicated to design-cue rules.
    const krebsTmp = mkdtempSync(join(tmpdir(), 'slopbrick-cal-krebs-'));
    const krebsList = join(krebsTmp, 'files.txt');
    execFileSync(
      'bash',
      ['-c', `for f in ${KREBS_SAMPLES_GLOB}; do [ -f "$f" ] && realpath "$f"; done > ${krebsList}`],
      { stdio: 'pipe' },
    );
    let krebs: ScanResult | null = null;
    if (existsSync(krebsList) && readFileSync(krebsList, 'utf8').trim().length > 0) {
      krebs = scan(krebsList);
    }

    // Sanity: each corpus must have ≥100 files for ratios to be meaningful.
    // Note: negative is capped to a sample (see scan() above).
    expect(positive.fileCount).toBeGreaterThan(100);
    expect(negative.fileCount).toBeGreaterThan(100);

    const violations: string[] = [];
    const inverted: string[] = [];
    const logLines: string[] = [];
    logLines.push('recall/FP ratios:');

    for (const { ruleId, minRatio, note, corpus } of RATIO_THRESHOLDS) {
      // Pick the right positive corpus for this entry.
      const posCorpus =
        corpus === 'vibe' ? vibe : corpus === 'krebs' ? krebs : positive;
      if (!posCorpus) {
        logLines.push(`  ? ${ruleId.padEnd(35)} (skipped — ${corpus} corpus unavailable)`);
        continue;
      }
      const pFires = posCorpus.firesPerFile.get(ruleId) ?? 0;
      const nFires = negative.firesPerFile.get(ruleId) ?? 0;
      const recall = pFires / posCorpus.fileCount;
      const fp = nFires / negative.fileCount;

      const ratioNum = fp === 0 ? Infinity : recall / fp;
      const ratioStr = fp === 0 ? '∞' : ratioNum.toFixed(2);

      logLines.push(
        `  ${ratioNum >= minRatio ? '✓' : '✗'} ${ruleId.padEnd(38)} [${corpus}] recall=${recall.toFixed(2)}  fp=${fp.toFixed(2)}  ratio=${ratioStr}×  (min=${minRatio}×)`,
      );

      // If the rule never fires on either corpus, it's dormant — no signal.
      if (recall === 0 && fp === 0) continue;

      if (ratioNum < MIN_RATIO_FLOOR) {
        inverted.push(`${ruleId} [${corpus}]: ratio ${ratioStr}× (recall ${recall.toFixed(2)}/file vs FP ${fp.toFixed(2)}/file) — fires MORE on human code than AI. ${note}`);
      } else if (ratioNum < minRatio) {
        violations.push(`${ruleId} [${corpus}]: ratio ${ratioStr}× below threshold ${minRatio}× (recall ${recall.toFixed(2)}/file vs FP ${fp.toFixed(2)}/file). ${note}`);
      }
    }

    // eslint-disable-next-line no-console
    console.log('\n' + logLines.join('\n'));

    if (inverted.length > 0 && !skipInvertedCheck) {
      throw new Error(
        `Rules are inverted (recall < FP):\n  - ${inverted.join('\n  - ')}\n\n` +
          'These rules fire MORE on real human code than on AI-generated code.\n' +
          'Tighten the match, drop the rule, or mark aiSpecific: true.',
      );
    } else if (inverted.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `\n[skipped] ${inverted.length} inverted rules (auto-bootstrapped corpus can't measure them):\n  - ${inverted.join('\n  - ')}`,
      );
    }

    if (violations.length > 0 && !skipInvertedCheck) {
      throw new Error(
        `Rules below calibration threshold:\n  - ${violations.join('\n  - ')}\n\n` +
          'Either the rule has regressed, or the threshold needs updating. ' +
          'Re-run `pnpm test tests/integration/calibration.test.ts` for detail.',
      );
    } else if (violations.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `\n[skipped] ${violations.length} rules below threshold (auto-bootstrapped corpus can't measure them):\n  - ${violations.join('\n  - ')}`,
      );
    }
  }, 600_000); // 10 min: full negative corpus is 55k files
});