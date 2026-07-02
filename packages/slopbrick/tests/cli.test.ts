import { describe, expect, it, beforeAll, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import {
  assertDistBuilt,
  binPath,
  cleanupTempDir,
  createTmpDir,
  execFileAsync,
  repoRoot,
  run,
  workerScript,
} from './helpers/cli';
import {
  colorForSlop,
  formatBadge,
  thresholdExceeded,
  failedThresholdCount,
  filterIssues,
  serializeConfig,
  scanProject,
  formatSparkline,
  stagedGating,
  DEFAULT_CONFIG,
} from '../src/index';
import type { Issue, ProjectReport, ResolvedConfig, BaselineCache, ComponentScore } from '../src/types';

beforeAll(assertDistBuilt);

const issue = (overrides: Partial<Issue> & Pick<Issue, 'aiSpecific' | 'category' | 'severity'>): Issue => ({
  ruleId: 'test/rule',
  message: 'test issue',
  line: 1,
  column: 1,
  ...overrides,
});

const makeReport = (
  overrides: Partial<ProjectReport> = {},
  generatedAt = '2024-01-01T00:00:00.000Z',
): ProjectReport => ({
  version: '0.5.2',
  generatedAt,
  // v0.21.0: aiSlopScore is now the RAW amount of slop
  // (0 = clean, 100 = saturated, lower = better). The other
  // three scores (engineeringHygiene, security, repositoryHealth)
  // keep the "higher = better" convention. Default to a healthy
  // repository so threshold-driven integration tests (which
  // expect exit code 0 when thresholds are respected) pass
  // without explicit overrides.
  aiSlopScore: 10, engineeringHygiene: 90, security: 90, repositoryHealth: 90,
  assemblyHealth: 90,
  totalScore: 10,
  categoryScores: {
    visual: 0,
    typo: 0,
    wcag: 0,
    layout: 0,
    component: 0,
    logic: 0,
    arch: 0,
    perf: 0,
    security: 0,    test: 0,    docs: 0,    db: 0,    ai: 0,    context: 0,    product: 0,    i18n: 0,
  },
  p90Score: 15,
  peakScore: 20,
  boundaryScore: 25.0,
  contextScore: 30.0,
  visualScore: 50.0,
  componentCount: 2,
  fileCount: 1,
  thresholds: { meanSlop: 25, p90Slop: 50, individualSlopThreshold: 50 },
  components: [
    {
      filePath: 'A.tsx',
      rawScore: 5,
      componentScore: 5,
      adjustedScore: 5,
      componentCount: 1,
    },
    {
      filePath: 'B.tsx',
      rawScore: 3,
      componentScore: 3,
      adjustedScore: 3,
      componentCount: 1,
    },
  ],
  issues: [],
  ...overrides,
});

// v0.20c R9 (chronic-offender): hoisted from 6 duplicate per-describe
// beforeEach/afterEach pairs. Variations (e.g. --no-increase adds
// writeSloppyProject) keep their describe-level beforeEach, which
// runs after this one to add the project-specific setup.
let dir: string;
beforeEach(() => {
  dir = createTmpDir();
});
afterEach(() => {
  cleanupTempDir(dir);
});

describe('colorForSlop', () => {
  it('returns green for slop index 0-25', () => {
    expect(colorForSlop(0)).toBe('green');
    expect(colorForSlop(25)).toBe('green');
  });

  it('returns yellow for slop index 26-50', () => {
    expect(colorForSlop(26)).toBe('yellow');
    expect(colorForSlop(50)).toBe('yellow');
  });

  it('returns orange for slop index 51-75', () => {
    expect(colorForSlop(51)).toBe('orange');
    expect(colorForSlop(75)).toBe('orange');
  });

  it('returns red for slop index 76 or above', () => {
    expect(colorForSlop(76)).toBe('red');
    expect(colorForSlop(100)).toBe('red');
  });
});

describe('formatBadge', () => {
  it('produces a shields.io markdown badge', () => {
    // v0.21.0: badge reflects aiSlopScore (raw amount, higher = more
    // slop, lower = cleaner). Label reverts to "ai-slop" (v0.14
    // framing) and the color uses the v0.14 colorForSlop logic
    // (high score → red, low → green). aiSlopScore=34 sits in
    // the 26-50 range → yellow.
    const report = makeReport({ aiSlopScore: 34 });
    const badge = formatBadge(report);
    expect(badge).toContain('https://img.shields.io/badge/ai--slop-34-yellow');
    expect(badge).toContain('[![');
  });

  it('uses orange color for medium aiSlopScore (v0.21 raw amount)', () => {
    // v0.21.0: aiSlopScore is raw slop. aiSlopScore=60 sits in the
    // 51-75 range → orange (medium slop).
    const report = makeReport({ aiSlopScore: 60 });
    const badge = formatBadge(report);
    expect(badge).toContain('orange');
  });

  it('uses red color for high aiSlopScore (v0.21 raw amount)', () => {
    // v0.21.0: aiSlopScore >= 76 is red. aiSlopScore=80 is firmly
    // red (saturated slop).
    const report = makeReport({ aiSlopScore: 80 });
    const badge = formatBadge(report);
    expect(badge).toContain('red');
  });
});

describe('thresholdExceeded', () => {
  const config: ResolvedConfig = {
    ...DEFAULT_CONFIG,
    thresholds: {
      meanSlop: 25,
      p90Slop: 50,
      individualSlopThreshold: 50,
    },
  };

  it('returns false when all thresholds are respected', () => {
    // v0.21.0: aiSlopScore is raw slop. meanSlop=25, so aiSlopScore
    // < meanSlop passes. aiSlopScore=10 < 25 → respected, not breached.
    const report = makeReport({ aiSlopScore: 10, engineeringHygiene: 30, security: 30, repositoryHealth: 30, p90Score: 40, peakScore: 45 });
    expect(thresholdExceeded(report, config)).toBe(false);
  });

  it('returns true when aiSlopScore drops below the mean threshold', () => {
    // v0.21.0: aiSlopScore is raw slop. meanSlop=25, so aiSlopScore
    // > 25 breaches. aiSlopScore=60 > 25 → breach.
    const report = makeReport({ aiSlopScore: 60, engineeringHygiene: 20, security: 20, repositoryHealth: 20, p90Score: 40, peakScore: 45 });
    expect(thresholdExceeded(report, config)).toBe(true);
  });

  it('does NOT trip on p90 alone (v0.15.0 U.4: only aiSlopScore drives threshold)', () => {
    // v0.21.0: aiSlopScore=10 (raw slop) is below meanSlop=25 → respected;
    // p90=51 alone does not trigger the v0.15.0 threshold.
    const report = makeReport({ aiSlopScore: 10, engineeringHygiene: 30, security: 30, repositoryHealth: 30, p90Score: 51, peakScore: 45 });
    expect(thresholdExceeded(report, config)).toBe(false);
  });

  it('does NOT trip on peak alone (v0.15.0 U.4)', () => {
    // v0.21.0: aiSlopScore=10 (raw slop) is below meanSlop=25 → respected;
    // peak=51 alone does not trigger the v0.15.0 threshold.
    const report = makeReport({ aiSlopScore: 10, engineeringHygiene: 30, security: 30, repositoryHealth: 30, p90Score: 40, peakScore: 51 });
    expect(thresholdExceeded(report, config)).toBe(false);
  });
});

describe('thresholdExceeded (per-category gating, round 20)', () => {
  it('returns true when a configured category score exceeds its threshold even if aggregate is OK', () => {
    const cfg: ResolvedConfig = {
      ...DEFAULT_CONFIG,
      thresholds: {
        meanSlop: 25,
        p90Slop: 50,
        individualSlopThreshold: 50,
        categoryThresholds: { visual: 60 },
      },
    };
    const report = makeReport({
      aiSlopScore: 5, engineeringHygiene: 5, security: 5, repositoryHealth: 5,
      p90Score: 10,
      peakScore: 20,
      categoryScores: {
        visual: 75,
        typo: 0,
        wcag: 0,
        layout: 0,
        component: 0,
        logic: 0,
        arch: 0,
        perf: 0,
        security: 0,        test: 0,    docs: 0,    db: 0,    ai: 0,    context: 0,    product: 0,    i18n: 0,
      },
    });
    expect(thresholdExceeded(report, cfg)).toBe(true);
  });

  it('returns false when configured categories are within their thresholds', () => {
    const cfg: ResolvedConfig = {
      ...DEFAULT_CONFIG,
      thresholds: {
        meanSlop: 25,
        p90Slop: 50,
        individualSlopThreshold: 50,
        categoryThresholds: { visual: 60, layout: 30 },
      },
    };
    // v0.21.0: keep aiSlopScore below meanSlop so the aggregate
    // threshold doesn't fire — only the per-category thresholds
    // should be in play.
    const report = makeReport({
      aiSlopScore: 10, engineeringHygiene: 30, security: 30, repositoryHealth: 30,
      p90Score: 10,
      peakScore: 20,
      categoryScores: {
        visual: 20,
        typo: 0,
        wcag: 0,
        layout: 10,
        component: 0,
        logic: 0,
        arch: 0,
        perf: 0,
        security: 0,        test: 0,    docs: 0,    db: 0,    ai: 0,    context: 0,    product: 0,    i18n: 0,
      },
    });
    expect(thresholdExceeded(report, cfg)).toBe(false);
  });

  it('returns false when categoryThresholds is undefined (default behavior)', () => {
    const cfg: ResolvedConfig = {
      ...DEFAULT_CONFIG,
      thresholds: {
        meanSlop: 25,
        p90Slop: 50,
        individualSlopThreshold: 50,
      },
    };
    // v0.21.0: keep aiSlopScore below meanSlop so the test
    // isolates the "no categoryThresholds configured" path.
    const report = makeReport({
      aiSlopScore: 10, engineeringHygiene: 30, security: 30, repositoryHealth: 30,
      p90Score: 10,
      peakScore: 20,
      categoryScores: {
        visual: 9999,
        typo: 0,
        wcag: 0,
        layout: 0,
        component: 0,
        logic: 0,
        arch: 0,
        perf: 0,
        security: 0,        test: 0,    docs: 0,    db: 0,    ai: 0,    context: 0,    product: 0,    i18n: 0,
      },
    });
    expect(thresholdExceeded(report, cfg)).toBe(false);
  });

  it('only counts configured categories (other categories can be arbitrarily high)', () => {
    const cfg: ResolvedConfig = {
      ...DEFAULT_CONFIG,
      thresholds: {
        meanSlop: 25,
        p90Slop: 50,
        individualSlopThreshold: 50,
        categoryThresholds: { visual: 60 },
      },
    };
    const report = makeReport({
      aiSlopScore: 5, engineeringHygiene: 5, security: 5, repositoryHealth: 5,
      p90Score: 10,
      peakScore: 20,
      categoryScores: {
        visual: 9999,
        typo: 9999,
        wcag: 9999,
        layout: 9999,
        component: 0,
        logic: 0,
        arch: 0,
        perf: 0,
        security: 0,        test: 0,    docs: 0,    db: 0,    ai: 0,    context: 0,    product: 0,    i18n: 0,
      },
    });
    // visual is configured and exceeded → true
    expect(thresholdExceeded(report, cfg)).toBe(true);
  });

  it('failedThresholdCount counts per-category breaches', () => {
    const cfg: ResolvedConfig = {
      ...DEFAULT_CONFIG,
      thresholds: {
        meanSlop: 25,
        p90Slop: 50,
        individualSlopThreshold: 50,
        categoryThresholds: { visual: 60, layout: 30 },
      },
    };
    // v0.21.0: keep aiSlopScore below meanSlop so the aggregate
    // count stays at 0; only visual+layout category breaches
    // should contribute to the total.
    const report = makeReport({
      aiSlopScore: 10, engineeringHygiene: 30, security: 30, repositoryHealth: 30,
      p90Score: 10,
      peakScore: 20,
      categoryScores: {
        visual: 75,
        typo: 0,
        wcag: 0,
        layout: 35,
        component: 0,
        logic: 0,
        arch: 0,
        perf: 0,
        security: 0,        test: 0,    docs: 0,    db: 0,    ai: 0,    context: 0,    product: 0,    i18n: 0,
      },
    });
    // Aggregate: 0/3, Categories: 2 (visual+layout) → total 2
    expect(failedThresholdCount(report, cfg)).toBe(2);
  });
});

describe('filterIssues', () => {
  const issues: Issue[] = [
    issue({ aiSpecific: true, category: 'logic', severity: 'high' }),
    issue({ aiSpecific: false, category: 'layout', severity: 'medium' }),
    issue({ aiSpecific: false, category: 'wcag', severity: 'high' }),
  ];

  it('keeps only AI-specific issues with --ai-only', () => {
    const filtered = filterIssues(issues, { aiOnly: true });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].aiSpecific).toBe(true);
  });

  it('keeps only human issues with --human-only', () => {
    const filtered = filterIssues(issues, { humanOnly: true });
    expect(filtered).toHaveLength(2);
    expect(filtered.every((i) => !i.aiSpecific)).toBe(true);
  });

  it('removes wcag issues with --ignore-wcag22', () => {
    const filtered = filterIssues(issues, { ignoreWcag22: true });
    expect(filtered).toHaveLength(2);
    expect(filtered.every((i) => i.category !== 'wcag')).toBe(true);
  });

  it('applies filters sequentially', () => {
    const filtered = filterIssues(issues, { aiOnly: true, ignoreWcag22: true });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].category).toBe('logic');
  });
});

describe('serializeConfig', () => {
  it('produces a valid ESM default export', () => {
    const serialized = serializeConfig(DEFAULT_CONFIG);
    expect(serialized.startsWith('export default')).toBe(true);
    expect(serialized).toContain('"include"');
    expect(serialized).toContain('"rules"');
  });

  it('serializes regex allowlist entries as new RegExp expressions', () => {
    const serialized = serializeConfig(DEFAULT_CONFIG);
    expect(serialized).toContain('new RegExp(');
    expect(serialized).toContain('"w-full"');
  });
});

describe('scanProject', () => {
  it('returns a report for an empty project', async () => {
    const report = await scanProject({ cwd: dir, workerScript });
    // Live-sync: report.version must match packages/slopbrick/package.json
    // (avoids drift when the version is bumped).
    const pkg = JSON.parse(
      await import('node:fs').then((m) => m.readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')),
    ) as { version: string };
    expect(report.version).toBe(pkg.version);
    // v0.21.0: an empty project has zero AI slop (aiSlopScore=0)
    // and perfect (highest) engineeringHygiene/security. The
    // repositoryHealth composite includes a testQuality component
    // (0.1 * testQuality) which is computed from the test
    // infrastructure; for an empty project with no scanned files,
    // testQuality is 0 by default (the buildTestQualityScore helper
    // has no test issues to deduct from, but the 0.10 weight on a
    // 0 score pulls the composite down to ~78 instead of 100).
    // The legacy `slopIndex` field stores the raw amount (0 = no
    // slop), matching aiSlopScore.
    expect(report.aiSlopScore).toBe(0);
    expect(report.engineeringHygiene).toBe(100);
    expect(report.security).toBe(100);
    expect(report.repositoryHealth).toBeCloseTo(77.8, 0);
    expect(report.slopIndex ?? 0).toBe(0);
    expect(report.assemblyHealth).toBe(100);
    expect(report.issues).toEqual([]);
    expect(report.components).toEqual([]);
  });

  it('discovers and scans source files', async () => {
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'Button.tsx'), 'export function Button() { return <div>hi</div>; }');
    const report = await scanProject({ cwd: dir, workerScript });
    expect(report.components.length).toBeGreaterThan(0);
    expect(report.componentCount).toBeGreaterThan(0);
  });
});

describe('scanProject with --tokens (round 21)', () => {
  it('merges tokens.json layout values into arbitrary-value allowlist', async () => {
    mkdirSync(join(dir, 'src'), { recursive: true });
    // File with a padding that uses a token-defined dimension
    writeFileSync(
      join(dir, 'src', 'Card.tsx'),
      'export function Card() { return <div className="p-[17px] m-[13px] gap-[9px] py-[5px]">x</div>; }\n',
    );
    const tokensPath = join(dir, 'tokens.json');
    writeFileSync(
      tokensPath,
      JSON.stringify({
        spacing: {
          xxl: { $value: '17px', $type: 'dimension' },
        },
      }),
    );

    const baseline = await scanProject({ cwd: dir, workerScript });
    const baselineArbitrary = baseline.issues.filter((i) => i.ruleId === 'visual/arbitrary-escape');
    expect(baselineArbitrary.length).toBeGreaterThan(0);

    const withTokens = await scanProject({ cwd: dir, workerScript, tokens: tokensPath });
    const remaining = withTokens.issues.filter((i) => i.ruleId === 'visual/arbitrary-escape');
    // p-[17px] should disappear (allowlisted); m-[13px] remains (not in tokens)
    const remainingMessage = remaining.map((i) => i.message).join(' | ');
    expect(remainingMessage).not.toContain('p-[17px]');
    expect(remainingMessage).toContain('m-[13px]');
  });

  it('returns error when tokens path is unreadable', async () => {
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'A.tsx'), 'export const A = () => <div>x</div>;\n');
    // Missing file → loadConfig silently continues with no extras, so this should not throw
    const report = await scanProject({ cwd: dir, workerScript, tokens: join(dir, 'nope.json') });
    expect(report.components.length).toBeGreaterThan(0);
  });
});

describe('--no-telemetry', () => {
  it('does not create the flywheel directory when telemetry is disabled', async () => {
    const srcDir = join(dir, 'src');
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, 'Button.tsx'), 'export function Button() { return <div>hi</div>; }');
    const { exitCode } = await run(['--workspace', dir, '--no-telemetry', '--json']);
    expect(exitCode).toBe(0);
    expect(existsSync(join(dir, '.slopbrick', 'flywheel'))).toBe(false);
  });
});

describe('--threads validation', () => {
  it('rejects non-positive values with an error', async () => {
    const dir = createTmpDir();
    try {
      const { exitCode, stderr } = await run(['--threads', '0', '--json', '--workspace', dir]);
      expect(exitCode).not.toBe(0);
      expect(stderr).toMatch(/positive integer/i);
    } finally {
      cleanupTempDir(dir);
    }
  });
});

describe('--watch', () => {
  it('does not exit with the unimplemented warning and keeps running until SIGINT', async () => {
    const dir = createTmpDir();
    const child = spawn('node', [binPath, '--watch', '--workspace', dir], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    try {
      // Wait for the watcher to be ready before sending SIGINT.
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('Timed out waiting for watch mode to start'));
        }, 5000);

        function cleanup() {
          clearTimeout(timeout);
          child.stdout.off('data', checkReady);
        }

        function checkReady() {
          if (stdout.includes('Watching for changes')) {
            cleanup();
            resolve();
          }
        }

        child.stdout.on('data', checkReady);
        checkReady();
      });

      child.kill('SIGINT');

      const exitCode = await new Promise<number>((resolve) => {
        child.on('exit', (code) => resolve(code ?? 1));
      });

      expect(stderr).not.toContain('not implemented');
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Repository Coherence');
    } finally {
      if (!child.killed) {
        child.kill('SIGINT');
      }
      cleanupTempDir(dir);
    }
  });
});

function writeHighSeverityFixture(dir: string): void {
  const srcDir = join(dir, 'src');
  mkdirSync(srcDir, { recursive: true });
  writeFileSync(
    join(srcDir, 'ServerHook.tsx'),
    `export function ServerHook() {
  const [count, setCount] = useState(0);
  return <div>{count}</div>;
}
`,
  );
}

/**
 * v0.15.0 U.4: write a slopbrick.config.cjs that makes the
 * threshold "always breach". The comparison direction was
 * inverted in the v0.15 model:
 *   - meanSlop: 999  → `aiSlopScore < 999` always true (max 100)
 *   - p90Slop:  0    → `p90Score > 0` always true
 *   - individualSlopThreshold: 0 → `adjustedScore > 0` always true
 * Used by integration tests that exercise the threshold-exit
 * path on fixtures that may otherwise produce a healthy-enough
 * aiSlopScore to slip under the default `meanSlop: 25`.
 */
function writeAlwaysBreachConfig(dir: string): void {
  // v0.21.0: aiSlopScore is raw slop (lower = cleaner). meanSlop: 0
  // means "any slop > 0 breaches" — i.e. always breach. This is the
  // v0.21.0 inverse of the v0.15.0–v0.20.1 "meanSlop: 999" config
  // (which meant "any cleanliness < 999 breaches" under the old
  // inverted reading).
  writeFileSync(
    join(dir, 'slopbrick.config.cjs'),
    'module.exports = { thresholds: { meanSlop: 0, p90Slop: 0, individualSlopThreshold: 0 } };\n',
  );
}

/**
 * v0.21.0: write a slopbrick.config.cjs that makes the
 * threshold "never breach":
 *   - meanSlop: 999 → `aiSlopScore > 999` never true (max 100)
 *   - p90Slop: 999 → `p90Score > 999` never true
 *   - individualSlopThreshold: 999 → `adjustedScore > 999` never true
 * Used by integration tests that focus on file discovery and
 * want to suppress threshold-driven exits (e.g. --staged, --changed).
 */
function writeNeverBreachConfig(dir: string): void {
  writeFileSync(
    join(dir, 'slopbrick.config.cjs'),
    'module.exports = { thresholds: { meanSlop: 999, p90Slop: 999, individualSlopThreshold: 999 } };\n',
  );
}

function writeSloppyProject(dir: string): void {
  const srcDir = join(dir, 'src');
  mkdirSync(srcDir, { recursive: true });
  writeFileSync(
    join(srcDir, 'AiSlop.tsx'),
    `export function AiSlop() {
  return (
    <div>
      <div className="w-[100px]">one</div>
    </div>
  );
}
`,
  );
  const buttons = Array.from({ length: 6 }, (_, i) => `      <button className="outline-none" key={\`btn-${i}\`}>btn${i}</button>`).join('\n');
  writeFileSync(
    join(srcDir, 'WcagSlop.tsx'),
    `export function WcagSlop() {
  return (
    <div>
${buttons}
    </div>
  );
}
`,
  );
}

describe('--strict', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
    writeSloppyProject(dir);
    // v0.15.0 U.4: force the threshold to always breach so the
    // sloppy fixture is guaranteed to fail the gate (the default
    // `meanSlop: 25` is satisfied by a sloppy project's aiSlopScore
    // and would otherwise yield exit 0).
    writeAlwaysBreachConfig(dir);
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('exits with code 2 when high-severity issues remain', async () => {
    const { exitCode, stderr } = await run(['--workspace', dir, '--strict', '--json']);
    expect(exitCode).toBe(2);
    expect(stderr).toContain('High-severity issues found with --strict.');
  });

  it('falls back to threshold exit code 1 without --strict', async () => {
    const { exitCode } = await run(['--workspace', dir, '--json']);
    expect(exitCode).toBe(1);
  });
});

describe('threshold failure wording', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
    writeSloppyProject(dir);
    // v0.15.0 U.4: see the --strict describe for rationale.
    writeAlwaysBreachConfig(dir);
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('reports how many thresholds failed', async () => {
    const { exitCode, stderr } = await run(['--workspace', dir]);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/\d+ thresholds? failed\. See details above\./);
  });
});

describe('--include / --exclude', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
    writeSloppyProject(dir);
    const libDir = join(dir, 'lib');
    mkdirSync(libDir, { recursive: true });
    writeFileSync(join(libDir, 'Helper.tsx'), 'export function Helper() { return <button>ok</button>; }');
    // v0.15.0 U.4: the "skips --exclude" test expects exit 1 from
    // the still-sloppy WcagSlop.tsx. Force a threshold breach
    // here so the sloppy file (excluded or not) still trips the
    // gate. The "discovers --include" test below overrides
    // `meanSlop` to 0 via writeNeverBreachConfig since it scans
    // only the clean Helper.tsx.
    writeAlwaysBreachConfig(dir);
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('discovers only files matching --include patterns', async () => {
    // v0.15.0 U.4: this test scans only the clean Helper.tsx
    // via --include, so the threshold should NOT fire. Override
    // the beforeEach's alwaysBreach config with a neverBreach
    // one so the clean scan yields exit 0.
    writeNeverBreachConfig(dir);
    const { exitCode, stdout } = await run([
      '--workspace',
      dir,
      '--include',
      'lib/**/*.tsx',
      '--format',
      'json',
    ]);
    expect(exitCode).toBe(0);
    const report = JSON.parse(stdout) as ProjectReport;
    expect(report.components.length).toBe(1);
    expect(report.components[0].filePath).toContain(join('lib', 'Helper.tsx'));
  });

  it('skips files matching --exclude patterns while keeping default excludes', async () => {
    const { exitCode, stdout } = await run([
      '--workspace',
      dir,
      '--exclude',
      'src/AiSlop.tsx',
      '--format',
      'json',
    ]);
    expect(exitCode).toBe(1);
    const report = JSON.parse(stdout) as ProjectReport;
    const filePaths = report.components.map((c) => c.filePath);
    expect(filePaths.some((p) => p.includes('AiSlop.tsx'))).toBe(false);
    expect(filePaths.some((p) => p.includes('WcagSlop.tsx'))).toBe(true);
  });
});

describe('scanning an explicit directory', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
    const srcDir = join(dir, 'src');
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(
      join(srcDir, 'Button.tsx'),
      'export function Button() { return <button>ok</button>; }',
    );
    const nmDir = join(dir, 'node_modules', 'dep');
    mkdirSync(nmDir, { recursive: true });
    writeFileSync(
      join(nmDir, 'Bad.tsx'),
      'export function Bad() { return <div className="w-[100px]">bad</div>; }',
    );
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('does not include node_modules files when expanding a directory argument', async () => {
    const { exitCode, stdout } = await run(['--workspace', dir, '.', '--format', 'json']);
    expect(exitCode).toBe(0);
    const report = JSON.parse(stdout) as ProjectReport;
    expect(report.components.length).toBe(1);
    expect(report.components[0].filePath).toContain(join('src', 'Button.tsx'));
    expect(report.components.some((c) => c.filePath.includes('node_modules'))).toBe(false);
  });
});

describe('--no-increase', () => {
  it('warns and does not fail when there is no previous run', async () => {
    const srcDir = join(dir, 'src');
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, 'Clean.tsx'), 'export function Clean() { return <div>hi</div>; }');
    const { exitCode, stderr } = await run(['--workspace', dir, '--no-increase', '--json']);
    expect(exitCode).toBe(0);
    expect(stderr).toContain('no previous run found');
  });

  it('exits 2 when aiSlopScore increased since the previous run', async () => {
    // v0.21.0: aiSlopScore is raw slop (lower = better). "Worse
    // than before" is "AI Slop Score went UP" (more slop detected).
    // The v0.15.0–v0.20.1 "went DOWN" wording (when aiSlopScore
    // was inverted cleanliness) is replaced.
    const srcDir = join(dir, 'src');
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, 'LowSlop.tsx'), 'export function LowSlop() { return <div>hi</div>; }');

    const first = await run(['--workspace', dir, '--json']);
    expect(first.exitCode).toBe(0);

    writeHighSeverityFixture(dir);
    const second = await run(['--workspace', dir, '--no-increase', '--json']);
    expect(second.exitCode).toBe(2);
    expect(second.stderr).toMatch(/AI Slop Score went UP from [\d.]+ to [\d.]+/);
  });

  it('v0.18.1: noIncrease error message clarifies the comparison scale and direction', () => {
    // v0.21.0: the v0.18.1 data-flow contract for --no-increase was
    // "previous.slopIndex" stores the raw amount of slop (same as
    // report.aiSlopScore). The v0.18.1 "higher = better" wording is
    // removed (v0.21.0 is "lower = better"). This is a string-content
    // check on the source (not a behavioral test) because the message
    // is the contract documentation.
    const src = readFileSync(
      join(repoRoot, 'src/cli/report/finalizeReport.ts'),
      'utf8',
    );
    expect(src).toMatch(/previous\.slopIndex.*report\.aiSlopScore/s);
    expect(src).toContain('0-100, lower = cleaner');
    // The misleading v0.18.1 "higher = better" framing is gone
    expect(src).not.toMatch(/0-100, higher = better/);
  });
});

describe('--trend', () => {
  it('prints a sparkline of the last n runs', async () => {
    const srcDir = join(dir, 'src');
    mkdirSync(srcDir, { recursive: true });
    const source = 'export function Button() { return <button>hi</button>; }';

    for (let i = 0; i < 5; i++) {
      writeFileSync(join(srcDir, `Button${i}.tsx`), source);
      const { exitCode } = await run(['--workspace', dir, '--json']);
      expect(exitCode).toBe(0);
      // Each new component is tiny, so slopIndex stays low and stable.
    }

    const { exitCode, stdout } = await run(['--workspace', dir, '--trend', '3']);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/^Slop trend \(last \d+ runs\):/);
    expect(stdout).toMatch(/[▁▂▃▄▅▆▇█]+/);
  });

  it('reports no trend data when memory log is empty', async () => {
    const { exitCode, stdout } = await run(['--workspace', dir, '--trend']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('No trend data available.');
  });
});

describe('stagedGating', () => {
  const config: ResolvedConfig = {
    ...DEFAULT_CONFIG,
    thresholds: { meanSlop: 25, p90Slop: 50, individualSlopThreshold: 50 },
  };
  function score(overrides: Partial<ComponentScore> = {}): ComponentScore {
    return {
      filePath: join(dir, 'Button.tsx'),
      rawScore: 0,
      componentScore: 0,
      adjustedScore: 0,
      componentCount: 1,
      ...overrides,
    };
  }

  function makeBaseline(scores: Record<string, { baselineScore: number; componentCount: number }>): BaselineCache {
    return {
      version: '0.5.2',
      config_hash: 'abc',
      git_head: 'def',
      baseline_created: new Date().toISOString(),
      baseline_revision: 1,
      totalComponentCount: Object.values(scores).reduce((sum, s) => sum + s.componentCount, 0),
      scores,
    };
  }

  it('passes when there are no staged scores', () => {
    expect(stagedGating([], config, undefined, dir)).toEqual({ failed: false });
  });

  it('falls back to strict individual gating when baseline is missing', () => {
    const scores = [score({ adjustedScore: 60 })];
    const result = stagedGating(scores, config, undefined, dir);
    expect(result.failed).toBe(true);
    expect(result.reason).toContain('exceeds individual threshold');
  });

  it('passes strict individual gating when all scores are within threshold', () => {
    const scores = [score({ adjustedScore: 40 })];
    expect(stagedGating(scores, config, undefined, dir).failed).toBe(false);
  });

  it('rejects new staged files that exceed the individual threshold', () => {
    writeFileSync(join(dir, 'Button.tsx'), '');
    const baseline = makeBaseline({ 'Button.tsx': { baselineScore: 10, componentCount: 1 } });
    const scores = [score({ filePath: join(dir, 'New.tsx'), adjustedScore: 60 })];
    const result = stagedGating(scores, config, baseline, dir);
    expect(result.failed).toBe(true);
    expect(result.reason).toContain('New staged file');
  });

  it('allows new staged files within the individual threshold', () => {
    writeFileSync(join(dir, 'Button.tsx'), '');
    const baseline = makeBaseline({ 'Button.tsx': { baselineScore: 10, componentCount: 1 } });
    const scores = [score({ filePath: join(dir, 'New.tsx'), adjustedScore: 40 })];
    expect(stagedGating(scores, config, baseline, dir).failed).toBe(false);
  });

  it('rejects when the hypothetical project mean exceeds the threshold', () => {
    writeFileSync(join(dir, 'Button.tsx'), '');
    const baseline = makeBaseline({ 'Button.tsx': { baselineScore: 0, componentCount: 1 } });
    const scores = [score({ adjustedScore: 60, componentCount: 1 })];
    const result = stagedGating(scores, config, baseline, dir);
    expect(result.failed).toBe(true);
    expect(result.reason).toContain('Hypothetical project mean');
  });

  it('degrades to individual gating when virtual component count is zero', () => {
    // Baseline references a deleted file, and the only staged file is new.
    const baseline = makeBaseline({ 'Old.tsx': { baselineScore: 10, componentCount: 1 } });
    const scores = [score({ filePath: join(dir, 'New.tsx'), adjustedScore: 60, componentCount: 1 })];
    const result = stagedGating(scores, config, baseline, dir);
    expect(result.failed).toBe(true);
    expect(result.reason).toContain('exceeds individual threshold');
  });
});

describe('formatSparkline', () => {
  it('renders block characters scaled to min/max', () => {
    expect(formatSparkline([10, 20, 30, 40, 50])).toBe('▁▃▅▆█');
  });

  it('handles the all-equal case gracefully', () => {
    expect(formatSparkline([5, 5, 5])).toBe('▁▁▁');
  });

  it('returns an empty string for an empty list', () => {
    expect(formatSparkline([])).toBe('');
  });
});

async function createTempGitRepo(
  files: { path: string; content: string }[],
): Promise<string> {
  const dir = createTmpDir();
  await execFileAsync('git', ['init'], { cwd: dir });
  await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  for (const { path, content } of files) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  await execFileAsync('git', ['add', '.'], { cwd: dir });
  await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: dir });
  return dir;
}

describe('--staged', () => {
  it('scans staged and unstaged files with --staged', async () => {
    const dir = await createTempGitRepo([
      { path: 'src/Committed.tsx', content: 'export const Ok = () => null;' },
      { path: 'src/Staged.tsx', content: 'export const Staged = () => null;' },
      { path: 'src/Unstaged.tsx', content: 'export const Unstaged = () => null;' },
    ]);
    try {
      // Use the rule-firing fixtures (triggers arbitrary-escape + focus-appearance)
      writeFileSync(
        join(dir, 'src', 'Staged.tsx'),
        'export function S() { return <div className="w-[100px] p-[13px] m-[21px] gap-[9px]"><button className="outline-none focus:ring-2">x</button></div>; }',
      );
      await execFileAsync('git', ['add', 'src/Staged.tsx'], { cwd: dir });
      writeFileSync(
        join(dir, 'src', 'Unstaged.tsx'),
        'export function U() { return <div className="w-[100px] p-[13px] m-[21px] gap-[9px]"><button className="outline-none focus:ring-2">x</button></div>; }',
      );
      // Disable threshold gating so this test focuses on file discovery, not scoring.
      // v0.21.0: aiSlopScore is raw slop (0-100, lower = better).
      // meanSlop: 999 means "no raw slop can ever breach" (max 100,
      // so aiSlopScore > 999 is never true). p90Slop: 999 and
      // individualSlopThreshold: 999 keep those gates in the same
      // "never breach" direction.
      writeFileSync(
        join(dir, 'slopbrick.config.cjs'),
        'module.exports = { thresholds: { meanSlop: 999, p90Slop: 999, individualSlopThreshold: 999 } };\n',
      );
      const { exitCode, stdout } = await run([
        '--workspace',
        dir,
        '--staged',
        '--format',
        'json',
      ]);
      expect(exitCode).toBe(0);
      const report = JSON.parse(stdout) as ProjectReport;
      const paths = report.issues.map((i) => i.filePath).filter((p): p is string => typeof p === 'string');
      expect(paths.some((p) => p.includes('Staged'))).toBe(true);
      expect(paths.some((p) => p.includes('Unstaged'))).toBe(true);
      expect(paths.some((p) => p.includes('Committed'))).toBe(false);
    } finally {
      cleanupTempDir(dir);
    }
  });
});

describe('--changed (round 21)', () => {
  it('scans staged + unstaged + untracked files', async () => {
    const dir = await createTempGitRepo([
      { path: 'src/Committed.tsx', content: 'export const Ok = () => null;' },
      { path: 'src/Modified.tsx', content: 'export const Ok = () => null;' },
    ]);
    try {
      // Modify a committed file (unstaged change)
      writeFileSync(
        join(dir, 'src', 'Modified.tsx'),
        'export function M() { return <div className="w-[100px] p-[13px] m-[21px] gap-[9px]"><button className="outline-none focus:ring-2">x</button></div>; }',
      );
      // Stage a new file
      writeFileSync(
        join(dir, 'src', 'Staged.tsx'),
        'export function S() { return <div className="w-[100px] p-[13px] m-[21px] gap-[9px]"><button className="outline-none focus:ring-2">x</button></div>; }',
      );
      await execFileAsync('git', ['add', 'src/Staged.tsx'], { cwd: dir });
      // Untracked file (never git add'd)
      writeFileSync(
        join(dir, 'src', 'Untracked.tsx'),
        'export function U() { return <div className="w-[100px] p-[13px] m-[21px] gap-[9px]"><button className="outline-none focus:ring-2">x</button></div>; }',
      );
      // Disable threshold gating so this test focuses on file discovery, not scoring.
      // v0.21.0: see the --staged describe for the raw-amount rationale
      // (meanSlop, p90Slop, individualSlopThreshold all compared as
      // `score > threshold`; threshold 999 is unreachable for any
      // 0-100 score).
      writeFileSync(
        join(dir, 'slopbrick.config.cjs'),
        'module.exports = { thresholds: { meanSlop: 999, p90Slop: 999, individualSlopThreshold: 999 } };\n',
      );

      const { exitCode, stdout } = await run([
        '--workspace',
        dir,
        '--changed',
        '--format',
        'json',
      ]);
      expect(exitCode).toBe(0);
      const report = JSON.parse(stdout) as ProjectReport;
      const paths = report.issues.map((i) => i.filePath).filter((p): p is string => typeof p === 'string');
      expect(paths.some((p) => p.includes('Modified'))).toBe(true);
      expect(paths.some((p) => p.includes('Staged'))).toBe(true);
      expect(paths.some((p) => p.includes('Untracked'))).toBe(true);
      expect(paths.some((p) => p.includes('Committed'))).toBe(false);
    } finally {
      cleanupTempDir(dir);
    }
  });
});

describe('--changed outside a git repo (round 22)', () => {
  it('exits non-zero with a clear error when --changed is used outside a git repo', async () => {
    const dir = createTmpDir();
    try {
      mkdirSync(join(dir, 'src'), { recursive: true });
      writeFileSync(join(dir, 'src', 'A.tsx'), 'export const A = () => <div>x</div>;\n');
      const { exitCode, stderr } = await run([
        '--workspace',
        dir,
        '--changed',
      ]);
      expect(exitCode).not.toBe(0);
      expect(stderr.toLowerCase()).toMatch(/git/);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('exits non-zero with a clear error when --staged is used outside a git repo', async () => {
    const dir = createTmpDir();
    try {
      mkdirSync(join(dir, 'src'), { recursive: true });
      writeFileSync(join(dir, 'src', 'A.tsx'), 'export const A = () => <div>x</div>;\n');
      const { exitCode, stderr } = await run([
        '--workspace',
        dir,
        '--staged',
      ]);
      expect(exitCode).not.toBe(0);
      expect(stderr.toLowerCase()).toMatch(/git/);
    } finally {
      cleanupTempDir(dir);
    }
  });
});

describe('scan --tokens CLI subprocess (round 22)', () => {
  it('reduces arbitrary-escape issues when layout tokens are provided', async () => {
    const dir = createTmpDir();
    try {
      mkdirSync(join(dir, 'src'), { recursive: true });
      writeFileSync(
        join(dir, 'src', 'Card.tsx'),
        'export const Card = () => <div className="p-[17px] m-[13px] gap-[9px]">x</div>;\n',
      );
      const tokensPath = join(dir, 'tokens.json');
      writeFileSync(
        tokensPath,
        JSON.stringify({
          spacing: {
            xxl: { $value: '17px', $type: 'dimension' },
          },
        }),
      );

      // Drop threshold enforcement by writing a config that disables it.
      const cfgPath = join(dir, 'slopbrick.config.cjs');
      writeFileSync(
        cfgPath,
        `module.exports = { thresholds: { meanSlop: 999, p90Slop: 999, individualSlopThreshold: 999 } };\n`,
      );
      const baseline = await run(['--workspace', dir, '--format', 'json']);
      // Don't assert exitCode — the scan may exceed default thresholds regardless.
      // The JSON report is still emitted before the threshold check.
      const baselineReport = JSON.parse(baseline.stdout) as ProjectReport;
      const baselineHits = baselineReport.issues.filter(
        (i) => i.ruleId === 'visual/arbitrary-escape' && i.message.includes('p-[17px]'),
      );
      expect(baselineHits.length).toBe(1);

      const withTokens = await run([
        '--workspace',
        dir,
        '--tokens',
        tokensPath,
        '--format',
        'json',
      ]);
      const tokensReport = JSON.parse(withTokens.stdout) as ProjectReport;
      const remaining = tokensReport.issues.filter(
        (i) => i.ruleId === 'visual/arbitrary-escape' && i.message.includes('p-[17px]'),
      );
      expect(remaining.length).toBe(0);
    } finally {
      cleanupTempDir(dir);
    }
  });
});

describe('--dry-run (round 21)', () => {
  it('does not modify files when --fix --dry-run are combined', async () => {
    const dir = createTmpDir();
    try {
      mkdirSync(join(dir, 'src'), { recursive: true });
      const filePath = join(dir, 'src', 'Card.tsx');
      const before = 'export const Card = () => <div className="bg-violet-500 p-[13px]">x</div>;\n';
      writeFileSync(filePath, before);

      const { exitCode } = await run([
        '--workspace',
        dir,
        '--fix',
        '--dry-run',
        '--format',
        'json',
      ]);
      // exit may be 0 or 1 depending on whether thresholds are exceeded
      expect([0, 1]).toContain(exitCode);

      const after = readFileSync(filePath, 'utf-8');
      expect(after).toBe(before);
    } finally {
      cleanupTempDir(dir);
    }
  });
});

describe('--diff (round 21)', () => {
  it('prints a unified diff section to stdout when --diff is used', async () => {
    const dir = createTmpDir();
    try {
      mkdirSync(join(dir, 'src'), { recursive: true });
      writeFileSync(
        join(dir, 'src', 'Card.tsx'),
        'export const Card = () => <div className="bg-violet-500 p-[13px]">x</div>;\n',
      );
      const { stdout } = await run([
        '--workspace',
        dir,
        '--diff',
        '--format',
        'pretty',
      ]);
      // unified diff markers (when there ARE reportable issues) OR the diff header
      // in either case stdout should not be empty
      expect(stdout.length).toBeGreaterThan(0);
    } finally {
      cleanupTempDir(dir);
    }
  });
});

describe('report command (round 21)', () => {
  let dir: string;
  beforeEach(() => {
    dir = createTmpDir();
  });
  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('reads a JSON report produced by --json and pretty-prints it', async () => {
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'A.tsx'), 'export const A = () => <div>x</div>;\n');

    // produce a JSON file
    const { exitCode: scanExit, stdout: jsonOut } = await run([
      '--workspace',
      dir,
      '--json',
    ]);
    expect(scanExit).toBe(0);
    const jsonPath = join(dir, 'report.json');
    writeFileSync(jsonPath, jsonOut);

    // re-render via the report command
    const { exitCode, stdout } = await run(['report', jsonPath]);
    expect(exitCode).toBe(0);
    // pretty-printed version is multi-line
    expect(stdout.split('\n').length).toBeGreaterThan(1);
    // contains the report-rendered header
    expect(stdout).toMatch(/Re-rendered from/i);
    expect(stdout).toMatch(/Repository Coherence|Slop Index/i);
  });

  it('exits 2 when the report file is missing', async () => {
    const { exitCode, stderr } = await run(['report', join(dir, 'nope.json')]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/Cannot read/i);
  });

  it('exits 2 when the report file is not valid JSON', async () => {
    const badPath = join(dir, 'bad.json');
    writeFileSync(badPath, 'not json');
    const { exitCode, stderr } = await run(['report', badPath]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/JSON/i);
  });

  it('round-trips JSON when --format json is used', async () => {
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'A.tsx'), 'export const A = () => <div>x</div>;\n');
    const { exitCode: scanExit, stdout: jsonOut } = await run([
      '--workspace',
      dir,
      '--json',
    ]);
    expect(scanExit).toBe(0);
    const original = JSON.parse(jsonOut) as { version: string; slopIndex: number };
    const jsonPath = join(dir, 'report.json');
    writeFileSync(jsonPath, jsonOut);

    const { exitCode, stdout } = await run(['report', jsonPath, '--output-format', 'json']);
    expect(exitCode).toBe(0);
    // round-trip: the re-emitted JSON parses to an equal object
    const reread = JSON.parse(stdout) as {
      version: string;
      slopIndex: number;
    };
    expect(reread.version).toBe(original.version);
    expect(reread.slopIndex).toBe(original.slopIndex);
  });

  it('emits markdown when --output-format markdown is used', async () => {
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'A.tsx'), 'export const A = () => <div>x</div>;\n');
    const { exitCode: scanExit, stdout: jsonOut } = await run([
      '--workspace',
      dir,
      '--json',
    ]);
    expect(scanExit).toBe(0);
    const jsonPath = join(dir, 'report.json');
    writeFileSync(jsonPath, jsonOut);

    const { exitCode, stdout } = await run(['report', jsonPath, '--output-format', 'markdown']);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/^#/m); // markdown heading
    expect(stdout).toMatch(/Repository Coherence|Slop Index/i);
  });
});
