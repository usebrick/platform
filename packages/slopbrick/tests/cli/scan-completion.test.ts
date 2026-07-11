import { describe, expect, it, beforeAll, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { assertDistBuilt, cleanupTempDir, createTmpDir, run } from '../helpers/cli';
import { runScan } from '../../src/cli/scan';
import { filterByDisabledDirectives, filterIssues } from '../../src/cli/threshold';
import { scanFile } from '../../src/engine/worker';
import { aggregateReport, resolveFrameworkMultiplier, scoreFile } from '../../src/engine/metrics';
import { RuleRegistry } from '../../src/rules/registry';
import { getDefaultOffRules } from '../../src/rules/signal-strength';
import { runProjectRules } from '../../src/rules/project';
import { enrichReport } from '../../src/cli/report/enrichReport';
import { assembleScanReport } from '../../src/cli/report/assembleScanReport';
import { aiDebtFromScore } from '../../src/engine/repository-health';
import { AI_DEBT_NUMERIC } from '../../src/engine/coherence';
import { formatJson } from '../../src/report/json';
import { DEFAULT_CONFIG } from '../../src/config';
import { effectiveIssuesForScore } from '../../src/cli/effective-issues';
import type { FileScanResult } from '../../src/types';

beforeAll(assertDistBuilt);

const NOT_APPLICABLE_JSON_KEYS = new Set([
  'version',
  'generatedAt',
  'configPath',
  'completionStatus',
  'scoreValidity',
  'reason',
  'message',
  'requested',
  'analyzed',
  'failed',
  'skipped',
  'scanAccounting',
  'selectionAccounting',
  'diagnostics',
]);

function expectNotApplicableJsonEnvelope(value: unknown): asserts value is Record<string, unknown> {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  const envelope = value as Record<string, unknown>;
  expect(envelope).toMatchObject({
    completionStatus: 'empty',
    scoreValidity: 'not-applicable',
    reason: 'no-files-analyzed',
    message: 'NO FILES ANALYSED — scores are not applicable for gating.',
    requested: 0,
    analyzed: 0,
    failed: 0,
    skipped: 0,
    scanAccounting: {
      selected: 0,
      analyzed: 0,
      zeroFinding: 0,
      incrementalCached: 0,
      parseFailed: 0,
      timedOut: 0,
      crashed: 0,
      internalFailed: 0,
    },
  });
  expect(envelope.version).toBeTypeOf('string');
  expect(envelope.generatedAt).toBeTypeOf('string');
  expect(Object.keys(envelope).filter((key) => !NOT_APPLICABLE_JSON_KEYS.has(key))).toEqual([]);
}

function expectNotApplicableSarifEnvelope(value: unknown): void {
  expect(value).toBeTypeOf('object');
  const sarif = value as {
    $schema?: unknown;
    version?: unknown;
    runs?: Array<{
      tool?: { driver?: { version?: unknown; properties?: Record<string, unknown> } };
      results?: unknown[];
    }>;
  };
  expect(sarif.$schema).toBe('https://json.schemastore.org/sarif-2.1.0.json');
  expect(sarif.version).toBe('2.1.0');
  expect(sarif.runs?.[0]?.tool?.driver?.version).toBeTypeOf('string');
  expect(sarif.runs?.[0]?.results).toEqual([]);
  const properties = sarif.runs?.[0]?.tool?.driver?.properties;
  expect(properties).toMatchObject({
    completionStatus: 'empty',
    scoreValidity: 'not-applicable',
    reason: 'no-files-analyzed',
    message: 'NO FILES ANALYSED — scores are not applicable for gating.',
    requested: 0,
    analyzed: 0,
    failed: 0,
    skipped: 0,
    scanAccounting: {
      selected: 0,
      analyzed: 0,
      zeroFinding: 0,
      incrementalCached: 0,
      parseFailed: 0,
      timedOut: 0,
      crashed: 0,
      internalFailed: 0,
    },
  });
  expect(properties?.selectionAccounting).toBeTypeOf('object');
  expect(Object.keys(properties ?? {}).sort()).toEqual([
    'analyzed',
    'completionStatus',
    'failed',
    'message',
    'reason',
    'requested',
    'scanAccounting',
    'scoreValidity',
    'selectionAccounting',
    'skipped',
  ]);
}

describe('scan completion status', () => {
  const dirs: string[] = [];
  afterEach(() => { while (dirs.length) cleanupTempDir(dirs.pop()!); });

  function createCleanGitWorkspace(): string {
    const dir = createTmpDir();
    dirs.push(dir);
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'clean.ts'), 'export const answer = 42;\n');
    execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'ignore' });
    execFileSync(
      'git',
      ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'initial'],
      { cwd: dir, stdio: 'ignore' },
    );
    return dir;
  }

  function compressionProfileFixture(): string {
    return [
      'export const repeatedValues = [',
      ...Array.from({ length: 200 }, () => "  'repeated-value',"),
      '] as const;',
      '',
    ].join('\n');
  }

  function createPartialWorkspace(): string {
    const dir = createTmpDir();
    dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'valid.ts'), 'export const valid = 1;\n');
    writeFileSync(join(dir, 'src', 'broken.ts'), 'export const = ;\n');
    return dir;
  }

  function createFixablePartialWorkspace(): { dir: string; sourcePath: string; source: string } {
    const dir = createTmpDir();
    dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    const sourcePath = join(dir, 'src', 'Card.tsx');
    const source = 'export const Card = () => <div style={{ color: "red" }}>x</div>;\n';
    writeFileSync(sourcePath, source);
    writeFileSync(join(dir, 'src', 'broken.ts'), 'export const = ;\n');
    return { dir, sourcePath, source };
  }

  function expectOnlyInvalidFormatUsage(result: Awaited<ReturnType<typeof run>>, dir: string): void {
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr.trim()).toBe(
      'Unknown --format value: bogus. Valid: pretty, json, sarif, html.',
    );
    expect(existsSync(join(dir, '.slopbrick'))).toBe(false);
  }

  it('uses the same default-off effective set for every score producer', () => {
    const defaultOffRule = [...getDefaultOffRules()][0]!;
    const issues = [
      {
        ruleId: defaultOffRule,
        category: 'logic' as const,
        severity: 'medium' as const,
        aiSpecific: true,
        message: 'default-off evidence',
        filePath: 'src/a.ts',
        line: 1,
        column: 1,
      },
      {
        ruleId: 'logic/active-evidence',
        category: 'logic' as const,
        severity: 'medium' as const,
        aiSpecific: true,
        message: 'active evidence',
        filePath: 'src/a.ts',
        line: 2,
        column: 1,
      },
    ];

    expect(effectiveIssuesForScore(issues, DEFAULT_CONFIG).map((issue) => issue.ruleId))
      .toEqual(['logic/active-evidence']);
    expect(effectiveIssuesForScore(issues, {
      ...DEFAULT_CONFIG,
      rules: { ...DEFAULT_CONFIG.rules, [defaultOffRule]: 'medium' },
    }).map((issue) => issue.ruleId)).toEqual([defaultOffRule, 'logic/active-evidence']);
  });

  it('derives test quality from the canonical effective issue groups', async () => {
    const defaultOffRule = [...getDefaultOffRules()][0]!;
    const issues = [
      {
        ruleId: defaultOffRule,
        // Deliberately model a default-off rule misclassified as `test`:
        // the test proves the aggregate input, not a particular builtin.
        category: 'test' as const,
        severity: 'medium' as const,
        aiSpecific: true,
        message: 'suppressed test-shaped evidence',
        filePath: 'src/a.test.ts',
        line: 1,
        column: 1,
      },
      {
        ruleId: 'test/weak-assertion',
        category: 'test' as const,
        severity: 'high' as const,
        aiSpecific: false,
        message: 'effective test finding',
        filePath: 'src/a.test.ts',
        line: 2,
        column: 1,
      },
    ];
    const results = [{ filePath: 'src/a.test.ts', issues }] as unknown as FileScanResult[];

    const enriched = await enrichReport({
      cwd: process.cwd(),
      config: DEFAULT_CONFIG,
      results,
      aggregated: {
        aiSlopScore: 0,
        engineeringHygiene: 100,
        security: 100,
        repositoryHealth: 100,
        components: [],
        categoryScores: {},
      },
      allIssues: issues,
      options: { quiet: true, machineReadableStdout: true },
    });

    // Independent reconstruction: only the high effective finding remains,
    // so ceil(5 / 5) is one deduction from 100. The suppressed medium
    // finding must not create a second deduction.
    expect(enriched.testQuality).toBe(99);
  });

  it('keeps suppressed test evidence out of the final four-axis health breakdown', async () => {
    const issues = [
      {
        ruleId: 'test/audit-only',
        category: 'test' as const,
        severity: 'off' as const,
        aiSpecific: false,
        message: 'suppressed test-shaped evidence',
        filePath: 'src/a.test.ts',
        line: 1,
        column: 1,
      },
      {
        ruleId: 'test/weak-assertion',
        category: 'test' as const,
        severity: 'high' as const,
        aiSpecific: false,
        message: 'effective test finding',
        filePath: 'src/a.test.ts',
        line: 2,
        column: 1,
      },
    ];
    const results = [{
      filePath: 'src/a.test.ts',
      componentCount: 1,
      issues,
    }] as unknown as FileScanResult[];
    const effectiveIssues = effectiveIssuesForScore(issues, DEFAULT_CONFIG);
    const aggregated = aggregateReport(
      [scoreFile({ ...results[0]!, issues: effectiveIssues }, 1, DEFAULT_CONFIG)],
      [{ filePath: 'src/a.test.ts', issues: effectiveIssues }],
      DEFAULT_CONFIG,
      undefined,
      1,
    );
    const enrichment = await enrichReport({
      cwd: process.cwd(),
      config: DEFAULT_CONFIG,
      results,
      aggregated,
      allIssues: issues,
      options: { quiet: true, machineReadableStdout: true },
    });
    const report = assembleScanReport({
      generatedAt: '2026-07-10T00:00:00.000Z',
      configPath: undefined,
      results,
      aggregated,
      allIssues: issues,
      parseErrors: [],
      topOffenders: [],
      config: DEFAULT_CONFIG,
      baselineMeta: undefined,
      defaultOffApplied: 1,
      defaultOffRuleCount: 1,
      previousRun: undefined,
      enrichment,
    });

    // One active high test issue costs one point. The off-severity audit
    // finding must not become a second test-quality deduction.
    expect(report.testQuality).toBe(99);
    expect(report.repositoryHealthBreakdown).toEqual({
      aiSlopCleanliness: 100 - report.aiSlopScore,
      engineeringHygiene: report.engineeringHygiene,
      security: report.security,
      testQuality: 99,
    });

    // Rebuild the public formula from final-report axes rather than trusting
    // either aggregateReport or the enrichment implementation.
    const independentlyReconstructed =
      0.4 * (100 - report.aiSlopScore) +
      0.3 * report.engineeringHygiene +
      0.2 * report.security +
      0.1 * report.testQuality!;
    expect(report.repositoryHealth).toBeCloseTo(independentlyReconstructed, 8);
  });

  it('reports a normal scan as complete with requested/analyzed counts', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 1;\n');
    const result = await runScan({ workspace: dir, quiet: true });
    expect(result.scanStats).toMatchObject({ status: 'complete', requested: 1, analyzed: 1, failed: 0 });
    expect(result.report.scoreBasis).toMatchObject({
      denominator: 1,
      analyzedFiles: 1,
      issueSet: 'effective',
      parseErrorCount: 0,
    });
  });

  it('persists aggregate discovery exclusions without changing selected-file outcomes', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'accepted.ts'), 'export const accepted = true;\n');
    writeFileSync(join(dir, 'src', 'excluded.ts'), 'export const excluded = true;\n');
    writeFileSync(join(dir, 'src', 'styles.css'), 'body {}\n');
    writeFileSync(join(dir, 'slopbrick.config.mjs'), [
      'export default {',
      "  include: ['src/*'],",
      "  exclude: ['src/excluded.ts'],",
      '};',
    ].join('\n'));

    const result = await runScan({ workspace: dir, quiet: true });

    expect(result.report.selectionAccounting).toEqual({
      observedCandidates: 3,
      selected: 1,
      excluded: {
        configExclude: 1,
        unsupportedFileType: 1,
        extensionlessDuplicate: 0,
        outsideWorkspace: 0,
        gitScope: 0,
      },
    });
    expect(result.scanStats).toMatchObject({ requested: 1, analyzed: 1, skipped: 0 });
    const health = JSON.parse(readFileSync(join(dir, '.slopbrick', 'health.json'), 'utf8')) as Record<string, unknown>;
    expect(health.selectionAccounting).toEqual(result.report.selectionAccounting);
  });

  it('attributes normal-discovery files removed by --changed to git scope', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'tests@example.invalid'], { cwd: dir });
    execFileSync('git', ['config', 'user.name', 'SlopBrick Tests'], { cwd: dir });
    mkdirSync(join(dir, 'src'));
    const changed = join(dir, 'src', 'changed.ts');
    writeFileSync(changed, 'export const changed = 1;\n');
    writeFileSync(join(dir, 'src', 'unchanged.ts'), 'export const unchanged = 1;\n');
    execFileSync('git', ['add', '.'], { cwd: dir });
    execFileSync('git', ['commit', '-m', 'fixture'], { cwd: dir, stdio: 'ignore' });
    writeFileSync(changed, 'export const changed = 2;\n');

    const result = await runScan({ workspace: dir, quiet: true, changed: true });

    expect(result.report.selectionAccounting).toMatchObject({
      observedCandidates: 2,
      selected: 1,
      excluded: { gitScope: 1 },
    });
    expect(result.scanStats).toMatchObject({ requested: 1, analyzed: 1 });
  });

  it('accounts explicit directory expansion but leaves direct-file scans unclassified', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    const accepted = join(dir, 'src', 'accepted.ts');
    writeFileSync(accepted, 'export const accepted = true;\n');
    writeFileSync(join(dir, 'src', 'ignored.css'), 'body {}\n');
    writeFileSync(join(dir, 'slopbrick.config.mjs'), "export default { include: ['src/*'] };\n");

    const directory = await runScan({ workspace: dir, quiet: true }, ['src']);
    expect(directory.report.selectionAccounting).toMatchObject({
      observedCandidates: 2,
      selected: 1,
      excluded: { unsupportedFileType: 1 },
    });

    const direct = await runScan({ workspace: dir, quiet: true }, [accepted]);
    expect(direct.report.selectionAccounting).toBeUndefined();
  });

  it('forwards rule filters to worker scans (not only inline scans)', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    const noisy = Array.from({ length: 5 }, (_, i) => `console.log(${i});`).join('\n');
    for (let i = 0; i < 4; i++) {
      writeFileSync(join(dir, 'src', `noisy-${i}.ts`), `${noisy}\nexport const value${i} = ${i};\n`);
    }

    const result = await runScan({
      workspace: dir,
      quiet: true,
      includeRules: ['logic/math-console-log-storm'],
      threadCount: 2,
      workerScript: resolve(process.cwd(), 'dist/engine/worker.cjs'),
    });

    expect(result.scanStats).toMatchObject({ status: 'complete', requested: 4, analyzed: 4 });
    expect(result.report.issues.length).toBeGreaterThanOrEqual(4);
    expect(new Set(result.results.flatMap((file) => file.issues.map((issue) => issue.ruleId)))).toEqual(
      new Set(['logic/math-console-log-storm']),
    );
  });

  it('keeps default-off findings out of effective run-level scores while retaining them for audit', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'mixed.ts'), [
      "enum Color { Red = 'red', Blue = 'blue' }",
      ...Array.from({ length: 5 }, (_, i) => `console.log(${i});`),
      '',
    ].join('\n'));

    const baseline = await runScan({
      workspace: dir,
      quiet: true,
      includeRules: ['logic/math-console-log-storm'],
    });
    const withDefaultOff = await runScan({
      workspace: dir,
      quiet: true,
      includeRules: ['logic/math-console-log-storm', 'ts/enum-vs-as-const'],
    });

    const headline = (report: typeof baseline.report) => ({
      aiSlopScore: report.aiSlopScore,
      engineeringHygiene: report.engineeringHygiene,
      security: report.security,
      repositoryHealth: report.repositoryHealth,
    });
    expect(headline(withDefaultOff.report)).toEqual(headline(baseline.report));
    expect(withDefaultOff.report.scoreBasis?.denominator).toBe(baseline.report.scoreBasis?.denominator);
    expect(withDefaultOff.report.scoreBasis?.analyzedFiles).toBe(baseline.report.scoreBasis?.analyzedFiles);
    expect(withDefaultOff.report.scoreBasis?.suppressedIssueCount).toBe(
      (baseline.report.scoreBasis?.suppressedIssueCount ?? 0) + 1,
    );
    expect(withDefaultOff.report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'ts/enum-vs-as-const', severity: 'off' }),
    ]));
    expect(withDefaultOff.report.defaultOffSuppressedCount).toBeGreaterThanOrEqual(1);
  });

  it('keeps inline-disabled findings out of effective run-level scores while retaining the directive audit fact', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    const target = join(dir, 'src', 'storm.ts');
    writeFileSync(target, [
      '// slopbrick-disable-next-line logic/math-console-log-storm',
      ...Array.from({ length: 5 }, (_, i) => `console.log(${i});`),
      '',
    ].join('\n'));

    const baseline = await runScan({
      workspace: dir,
      quiet: true,
      includeRules: ['security/hardcoded-secret'],
    });
    const withDisabledRule = await runScan({
      workspace: dir,
      quiet: true,
      includeRules: ['logic/math-console-log-storm'],
    });

    const headline = (report: typeof baseline.report) => ({
      aiSlopScore: report.aiSlopScore,
      engineeringHygiene: report.engineeringHygiene,
      security: report.security,
      repositoryHealth: report.repositoryHealth,
    });
    expect(headline(withDisabledRule.report)).toEqual(headline(baseline.report));
    expect(withDisabledRule.report.scoreBasis).toMatchObject({
      denominator: baseline.report.scoreBasis?.denominator,
      analyzedFiles: baseline.report.scoreBasis?.analyzedFiles,
      suppressedIssueCount: baseline.report.scoreBasis?.suppressedIssueCount,
    });
    expect(withDisabledRule.report.issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'logic/math-console-log-storm' }),
    ]));
    expect(withDisabledRule.results[0]?.facts?.v2.disabledRules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: 'logic/math-console-log-storm',
        scope: 'next-line',
      }),
    ]));
  });

  it('keeps --security-only scoped to security rules on worker scans', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    const source = [
      'const API_KEY = "AKIA1234567890ABCDEF";',
      'localStorage.setItem("access_token", API_KEY);',
      ...Array.from({ length: 5 }, (_, i) => `console.log(${i});`),
    ].join('\n');
    for (let i = 0; i < 4; i++) {
      writeFileSync(join(dir, 'src', `mixed-${i}.ts`), `${source}\nexport const value${i} = ${i};\n`);
    }

    const result = await runScan({
      workspace: dir,
      quiet: true,
      securityOnly: true,
      threadCount: 2,
      workerScript: resolve(process.cwd(), 'dist/engine/worker.cjs'),
    });

    expect(result.scanStats).toMatchObject({ status: 'complete', requested: 4, analyzed: 4 });
    const issues = result.results.flatMap((file) => file.issues);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((issue) => issue.ruleId.startsWith('security/'))).toBe(true);
  });

  it('keeps worker scans identical to serial scans under the resolved rule configuration', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    // The test runner lives in the monorepo while the requested scan workspace
    // is a temporary directory. Keep this explicit so the fixture cannot
    // accidentally stop exercising the worker-CWD boundary.
    expect(resolve(process.cwd())).not.toBe(resolve(dir));
    mkdirSync(join(dir, 'src'));
    // This path must be evaluated relative to the requested workspace, not
    // the process that happens to host a worker thread.  The worker process
    // runs from the monorepo, where this exact workspace-relative glob does
    // not match the temporary file.
    writeFileSync(join(dir, 'slopbrick.config.mjs'), [
      'export default {',
      "  selfScan: { excludePaths: ['src/excluded.ts'] },",
      '};',
    ].join('\n'));
    const files = [
      join(dir, 'src', 'storm.ts'),
      join(dir, 'src', 'excluded.ts'),
      join(dir, 'src', 'enum.ts'),
      join(dir, 'src', 'secret.ts'),
    ];
    writeFileSync(files[0]!, Array.from({ length: 5 }, (_, i) => `console.log(${i});`).join('\n'));
    writeFileSync(files[1]!, Array.from({ length: 5 }, (_, i) => `console.log(${i});`).join('\n'));
    writeFileSync(files[2]!, "enum Color { Red = 'red', Blue = 'blue' }\n");
    writeFileSync(files[3]!, 'const apiKey = "AKIAIOSFODNN7EXAMPLE";\n');

    const includeRules = [
      'logic/math-console-log-storm',
      'ts/enum-vs-as-const',
      'security/hardcoded-secret',
    ];
    const workerRun = await runScan({
      workspace: dir,
      quiet: true,
      includeRules,
      threadCount: 2,
      workerScript: resolve(process.cwd(), 'dist/engine/worker.cjs'),
    });

    const workerByFile = new Map(workerRun.results.map((result) => [result.filePath, result]));
    expect(workerByFile.get(files[0]!)?.issues.some((issue) => issue.ruleId === 'logic/math-console-log-storm')).toBe(true);
    expect(workerByFile.get(files[1]!)?.issues).toEqual([]);
    expect(workerByFile.get(files[2]!)?.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'ts/enum-vs-as-const', severity: 'off' }),
    ]));

    const registry = new RuleRegistry();
    registry.loadBuiltins(undefined, { includeRules });
    const serialResults = await Promise.all(
      files.map((filePath) => scanFile(filePath, workerRun.config, registry, dir)),
    );
    for (const result of serialResults) {
      result.issues = filterIssues(result.issues, {});
      filterByDisabledDirectives(result, result.facts?.v2?.disabledRules ?? []);
      for (const issue of result.issues) issue.filePath ??= result.filePath;
    }

    const defaultOff = getDefaultOffRules();
    const userOverrides = new Set(Object.keys(workerRun.config.rules));
    const isSuppressedForScore = (issue: typeof serialResults[number]['issues'][number]) =>
      issue.severity === ('off' as typeof issue.severity) ||
      (defaultOff.has(issue.ruleId) && !userOverrides.has(issue.ruleId));
    const serialScores = serialResults.map((result) => scoreFile(
      { ...result, issues: result.issues.filter((issue) => !isSuppressedForScore(issue)) },
      resolveFrameworkMultiplier(workerRun.config),
      workerRun.config,
      undefined,
      dir,
    ));
    const serialIssueGroups = serialResults.map((result) => ({
      filePath: result.filePath,
      issues: result.issues.filter((issue) => !isSuppressedForScore(issue)),
    }));
    const serialAggregate = aggregateReport(
      serialScores,
      serialIssueGroups,
      workerRun.config,
      serialResults.map((result) => result.compositeScore),
      serialResults.length,
    );
    const serialProjectIssues = runProjectRules(serialResults, workerRun.config);
    const serialAllIssues = [...serialResults.flatMap((result) => result.issues), ...serialProjectIssues];
    for (const issue of serialAllIssues) {
      if (defaultOff.has(issue.ruleId) && !userOverrides.has(issue.ruleId)) {
        issue.severity = 'off' as typeof issue.severity;
      }
    }
    const serialEnrichment = await enrichReport({
      cwd: dir,
      config: workerRun.config,
      results: serialResults,
      aggregated: serialAggregate,
      allIssues: serialAllIssues,
      options: { quiet: true, machineReadableStdout: true },
    });

    const canonical = (results: typeof serialResults) => results
      .map((result) => ({
        filePath: result.filePath,
        componentCount: result.componentCount,
        compositeScore: result.compositeScore,
        parseError: result.parseError,
        issues: result.issues.map(({ ruleId, category, severity, aiSpecific, filePath, message, line, column, advice, fixHint, extras }) => ({
          ruleId, category, severity, aiSpecific, filePath, message, line, column, advice, fixHint, extras,
        })).sort((a, b) => a.ruleId.localeCompare(b.ruleId) || a.line - b.line || a.column - b.column),
      }))
      .sort((a, b) => a.filePath.localeCompare(b.filePath));

    expect(canonical(workerRun.results)).toEqual(canonical(serialResults));
    expect(workerRun.report).toMatchObject({
      aiSlopScore: serialAggregate.aiSlopScore,
      engineeringHygiene: serialAggregate.engineeringHygiene,
      security: serialAggregate.security,
      // The final CLI report must retain the same documented four-axis
      // Repository Health value the worker/serial aggregate computed.
      // Enrichment may add secondary diagnostics but must not replace a
      // headline score with a different Phase-12 composite.
      repositoryHealth: serialAggregate.repositoryHealth,
      scoreBasis: {
        denominator: serialResults.length,
        analyzedFiles: serialResults.length,
        issueSet: 'effective',
        suppressedIssueCount: serialAllIssues.filter((issue) => issue.severity === ('off' as typeof issue.severity)).length,
        parseErrorCount: 0,
      },
    });
    // Do not reuse aggregateReport here: reconstruct the public headline
    // from independently observed axes so a future alternate composite
    // cannot silently replace the documented four-axis score.
    const independentlyComputedRepositoryHealth =
      0.4 * (100 - workerRun.report.aiSlopScore) +
      0.3 * workerRun.report.engineeringHygiene +
      0.2 * workerRun.report.security +
      0.1 * (workerRun.report.repositoryHealthBreakdown?.testQuality ?? 100);
    expect(workerRun.report.repositoryHealth).toBeCloseTo(independentlyComputedRepositoryHealth, 8);
    expect(serialEnrichment.repositoryHealth).toBe(serialAggregate.repositoryHealth);
    expect(serialEnrichment.aiDebt).toBe(aiDebtFromScore(serialAggregate.repositoryHealth));
    expect(serialEnrichment.repositoryHealthBreakdown).toEqual({
      aiSlopCleanliness: 100 - serialAggregate.aiSlopScore,
      engineeringHygiene: serialAggregate.engineeringHygiene,
      security: serialAggregate.security,
      testQuality: 100,
    });
    expect(serialEnrichment.coherenceBreakdown?.aiDebtMapped)
      .toBe(AI_DEBT_NUMERIC[aiDebtFromScore(serialAggregate.repositoryHealth)]);
  });

  it('honors next-line directives in worker scans without diverging from serial results', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    expect(resolve(process.cwd())).not.toBe(resolve(dir));
    mkdirSync(join(dir, 'src'));
    const files = [
      join(dir, 'src', 'suppressed-storm.ts'),
      ...Array.from({ length: 4 }, (_, i) => join(dir, 'src', `storm-${i}.ts`)),
    ];
    writeFileSync(files[0]!, [
      '// slopbrick-disable-next-line logic/math-console-log-storm',
      ...Array.from({ length: 5 }, (_, i) => `console.log(${i});`),
    ].join('\n'));
    for (const file of files.slice(1)) {
      writeFileSync(file, Array.from({ length: 5 }, (_, i) => `console.log(${i});`).join('\n'));
    }

    const includeRules = ['logic/math-console-log-storm'];
    const workerRun = await runScan({
      workspace: dir,
      quiet: true,
      includeRules,
      threadCount: 2,
      workerScript: resolve(process.cwd(), 'dist/engine/worker.cjs'),
    });
    expect(workerRun.scanStats).toMatchObject({ status: 'complete', requested: 5, analyzed: 5 });
    const workerByFile = new Map(workerRun.results.map((result) => [result.filePath, result]));
    expect(workerByFile.get(files[0]!)?.issues.some((issue) => issue.ruleId === 'logic/math-console-log-storm')).toBe(false);

    const registry = new RuleRegistry();
    registry.loadBuiltins(undefined, { includeRules });
    const serialResults = await Promise.all(files.map((filePath) => scanFile(filePath, workerRun.config, registry, dir)));
    for (const result of serialResults) {
      result.issues = filterIssues(result.issues, {});
      filterByDisabledDirectives(result, result.facts?.v2?.disabledRules ?? []);
      for (const issue of result.issues) issue.filePath ??= result.filePath;
    }

    const canonical = (results: typeof serialResults) => results
      .map((result) => ({
        filePath: result.filePath,
        componentCount: result.componentCount,
        compositeScore: result.compositeScore,
        parseError: result.parseError,
        issues: result.issues.map(({ ruleId, category, severity, aiSpecific, filePath, message, line, column, advice, fixHint, extras }) => ({
          ruleId, category, severity, aiSpecific, filePath, message, line, column, advice, fixHint, extras,
        })).sort((a, b) => a.ruleId.localeCompare(b.ruleId) || a.line - b.line || a.column - b.column),
      }))
      .sort((a, b) => a.filePath.localeCompare(b.filePath));

    expect(canonical(workerRun.results)).toEqual(canonical(serialResults));
  });

  it('returns empty and non-zero for an ordinary empty workspace', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    const cachePath = join(dir, 'ordinary-empty-cache.json');
    const { stdout, stderr, exitCode } = await run([
      '--workspace', dir,
      '--incremental', '--cache-path', cachePath,
      '--baseline', '--tighten',
    ]);
    expect(exitCode).toBe(1);
    expect(stdout).not.toMatch(/AI Slop Score|clean/i);
    expect(stderr).toContain('NO FILES ANALYSED — scores are not applicable for gating.');
    expect(stderr).toMatch(/requested 0|No source files matched/i);
    expect(existsSync(join(dir, '.slopbrick'))).toBe(false);
    expect(existsSync(cachePath)).toBe(false);
  });

  it('does not attach prior-run trend data to an ordinary empty source scan', async () => {
    const dir = createCleanGitWorkspace();
    const seeded = await runScan({ workspace: dir, telemetry: false, quiet: true });
    expect(seeded.report.scoreValidity).toBe('valid');

    rmSync(join(dir, 'src', 'clean.ts'));
    const empty = await runScan({ workspace: dir, telemetry: false, quiet: true });

    expect(empty.report.scoreValidity).toBe('not-applicable');
    expect(empty.report.previousSlopIndex).toBeUndefined();
    expect(empty.report.previousRunTimestamp).toBeUndefined();
  });

  it('preserves project-memory run history for a not-applicable empty scan', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    writeFileSync(
      join(dir, 'slopbrick.config.mjs'),
      'export default { projectMemory: true };\n',
    );
    mkdirSync(join(dir, '.slopbrick'));
    // appendRun currently owns `.slopbrick/structure.json`; seed a valid
    // legacy history entry and require that an invalid score cannot rewrite it.
    const historyPath = join(dir, '.slopbrick', 'structure.json');
    const seededHistory = JSON.stringify([{
      timestamp: '2026-07-01T00:00:00.000Z',
      version: '0.44.0',
      slopIndex: 12,
      categoryScores: {},
      topOffenseIds: [],
      thresholdExceeded: false,
    }], null, 2) + '\n';
    writeFileSync(historyPath, seededHistory);

    const result = await runScan({ workspace: dir, quiet: true });

    expect(result.report.scoreValidity).toBe('not-applicable');
    expect(readFileSync(historyPath, 'utf8')).toBe(seededHistory);
  });

  it('maps malformed config syntax to the documented config exit code', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'x.ts'), 'export const x = 1;\n');
    writeFileSync(join(dir, 'slopbrick.config.mjs'), 'export default { thresholds: { ;\n');
    const result = await run(['--workspace', dir, '--format', 'json']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/invalid .*slopbrick\.config\.mjs|failed to load config/i);
  });

  it.each([false, true])(
    'rejects an invalid output format before every scan outcome (quiet=%s)',
    async (quiet) => {
      const cases: Array<{ dir: string; args: string[] }> = [];

      const ordinary = createTmpDir(); dirs.push(ordinary);
      cases.push({ dir: ordinary, args: [] });

      const staged = createCleanGitWorkspace();
      cases.push({ dir: staged, args: ['--staged'] });

      const changed = createCleanGitWorkspace();
      cases.push({ dir: changed, args: ['--changed'] });

      const valid = createTmpDir(); dirs.push(valid);
      mkdirSync(join(valid, 'src'));
      writeFileSync(join(valid, 'src', 'valid.ts'), 'export const valid = 1;\n');
      cases.push({ dir: valid, args: [] });

      const partial = createPartialWorkspace();
      cases.push({ dir: partial, args: [] });

      for (const { dir, args } of cases) {
        const result = await run([
          '--workspace', dir, '--format', 'bogus', ...args, ...(quiet ? ['--quiet'] : []),
        ]);
        expectOnlyInvalidFormatUsage(result, dir);
      }
    },
  );

  it.each([
    ['trend', ['--trend', '5']],
    ['doctor', ['--doctor']],
  ] as const)('rejects an invalid output format before %s work', async (_label, extraArgs) => {
    const dir = createTmpDir(); dirs.push(dir);
    const result = await run(['--workspace', dir, '--format', 'bogus', ...extraArgs]);
    expectOnlyInvalidFormatUsage(result, dir);
    expect(result.stderr).not.toMatch(/trend|doctor|No source files matched/i);
  });

  it('normalizes public display/performance flags in the packaged subprocess', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    for (let i = 0; i < 4; i++) {
      writeFileSync(join(dir, 'src', `file-${i}.ts`), `export const value${i} = ${i};\n`);
    }
    const result = await run([
      '--workspace', dir,
      '--threads', '1',
      '--verbose',
      '--brief', '--full',
      '--no-color',
    ]);
    expect(result.stderr).toMatch(/\[verbose\] selected 4 files/);
    expect(result.stdout).toContain('AI Slop Score:');
    expect(result.stdout).not.toContain('Re-run without --brief for the full report.');
    expect(result.stdout).not.toMatch(/\x1b\[/);
  });

  it('refreshes an initialized AGENTS.md block from the packaged subprocess', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'x.ts'), 'export const x = 1;\n');
    writeFileSync(
      join(dir, 'slopbrick.config.mjs'),
      'export default { include: ["src/**/*.ts"], exclude: [], projectMemory: true };\n',
    );
    writeFileSync(
      join(dir, 'AGENTS.md'),
      '# project notes\n<!-- slopbrick:begin:v3 -->\nold\n<!-- slopbrick:end:v3 -->\n',
    );
    const result = await run(['--workspace', dir, '--refresh-snippets', '--quiet']);
    expect(result.exitCode).toBe(0);
    const content = readFileSync(join(dir, 'AGENTS.md'), 'utf8');
    expect(content).toContain('slopbrick:begin:v3');
    expect(content).not.toContain('\nold\n');
    expect(content).toContain('Category-level directives');
  });

  it('writes JSON/HTML output files and honors --no-telemetry', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'x.ts'), 'export const x = 1;\n');
    const jsonPath = join(dir, 'report.json');
    const htmlPath = join(dir, 'report.html');
    expect((await run(['--workspace', dir, '--json', jsonPath, '--no-telemetry', '--quiet'])).exitCode).toBe(0);
    expect((await run(['--workspace', dir, '--html', htmlPath, '--no-telemetry', '--quiet'])).exitCode).toBe(0);
    expect(JSON.parse(readFileSync(jsonPath, 'utf8'))).toHaveProperty('completionStatus', 'complete');
    expect(readFileSync(htmlPath, 'utf8')).toContain('<!DOCTYPE html>');
    expect(existsSync(join(dir, '.slopbrick', 'flywheel', 'scans.jsonl'))).toBe(false);
  });

  it('makes deterministic score explanation terminal and JSON output opt-in', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'x.ts'), 'export const x = 1;\n');

    const ordinary = await run(['--workspace', dir, '--format', 'json', '--no-telemetry']);
    expect(ordinary.exitCode).toBe(0);
    expect(JSON.parse(ordinary.stdout)).not.toHaveProperty('scoreExplanation');

    const explainedJson = await run(['--workspace', dir, '--explain-score', '--format', 'json', '--no-telemetry']);
    expect(explainedJson.exitCode).toBe(0);
    expect(JSON.parse(explainedJson.stdout)).toMatchObject({
      scoreExplanation: { kind: 'deterministic-headline-score-explanation-v1' },
    });

    const explainedTerminal = await run(['--workspace', dir, '--explain-score', '--no-telemetry']);
    expect(explainedTerminal.exitCode).toBe(0);
    expect(explainedTerminal.stdout).toContain('Score explanation (deterministic aggregate inputs only)');
  });

  it('renders an empty JSON scan as a score-free not-applicable envelope', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    const { stdout, exitCode } = await run(['--workspace', dir, '--format', 'json']);
    expect(exitCode).toBe(1);
    expectNotApplicableJsonEnvelope(JSON.parse(stdout));
  });

  it('marks parse errors as partial and non-zero', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'broken.ts'), 'export const = ;\n');
    const result = await runScan({ workspace: dir, quiet: true });
    expect(result.scanStats.status).toBe('partial');
    expect(result.scanStats.failed).toBe(1);
    expect(result.scanStats.analyzed).toBe(0);
  });

  it('classifies post-parse scanner failures as internal rather than parse failures', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    const file = join(dir, 'src', 'valid.ts');
    mkdirSync(join(dir, 'src'));
    writeFileSync(file, 'export const valid = 1;\n');
    const registry = {
      createContexts: () => { throw new Error('context construction failed'); },
    } as unknown as RuleRegistry;

    const result = await scanFile(file, DEFAULT_CONFIG, registry, dir);

    expect(result).toMatchObject({
      filePath: file,
      failureKind: 'internal',
      parseError: 'context construction failed',
    });
  });

  it('reports scan accounting for zero-finding and parse-failed files in the JSON report', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'valid.ts'), 'export const valid = 1;\n');
    writeFileSync(join(dir, 'src', 'broken.ts'), 'export const = ;\n');

    const result = await runScan({ workspace: dir, quiet: true });
    const json = JSON.parse(formatJson(result.report)) as Record<string, unknown>;

    expect(json.scanAccounting).toEqual({
      selected: 2,
      analyzed: 1,
      zeroFinding: 1,
      incrementalCached: 0,
      parseFailed: 1,
      timedOut: 0,
      crashed: 0,
      internalFailed: 0,
    });
    expect(json).toMatchObject({
      requested: 2,
      analyzed: 1,
      failed: 1,
      skipped: 0,
    });
    expect(result.results.find((file) => file.filePath.endsWith('broken.ts'))?.failureKind).toBe('parse');
    expect(result.scanStats.scanAccounting).toEqual(json.scanAccounting);
    const accounting = json.scanAccounting as Record<string, number>;
    expect(accounting.selected).toBe(
      accounting.analyzed + accounting.incrementalCached + accounting.parseFailed +
      accounting.timedOut + accounting.crashed + accounting.internalFailed,
    );
    const health = JSON.parse(readFileSync(join(dir, '.slopbrick', 'health.json'), 'utf8')) as Record<string, unknown>;
    expect(health).toMatchObject({
      completionStatus: 'partial',
      scoreValidity: 'incomplete',
      requested: 2,
      analyzed: 1,
      failed: 1,
      scanAccounting: { selected: 2, analyzed: 1, parseFailed: 1 },
    });
  });

  it('renders a partial human report with an explicit invalid-for-gating banner', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'broken.ts'), 'export const = ;\n');

    const result = await run(['--workspace', dir]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('INCOMPLETE SCAN');
    expect(result.stdout).toContain('not valid for gating');
    expect(result.stderr).toContain('Scan partial');
    expect(`${result.stdout}\n${result.stderr}`).not.toMatch(
      /AI Slop Score:|Repository Health:|Repository Coherence:|Threshold \(CI gate\)|✓ Clean|health\.json: repo=|codebase is clean|no detectable AI slop/i,
    );
  });

  it('renders partial HTML as an invalid diagnostic envelope without clean or pass claims', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'broken.ts'), 'export const = ;\n');

    const result = await run(['--workspace', dir, '--format', 'html', '--no-telemetry']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('<!DOCTYPE html>');
    expect(result.stdout).toContain('data-score-validity="incomplete"');
    expect(result.stdout).toContain('INCOMPLETE SCAN');
    expect(result.stdout).not.toMatch(
      /AI Slop Score|Repository Health|Repository Coherence|Threshold \(CI gate\)|✓ Clean|codebase is clean|no detectable AI slop/i,
    );
  });

  it.each([
    ['fix', ['--fix']],
    ['fix HTML', ['--fix', '--format', 'html']],
    ['fix quiet', ['--fix', '--quiet']],
    ['dry-run', ['--fix', '--dry-run']],
    ['show-fixes-diff', ['--show-fixes-diff']],
    ['fix with diff', ['--fix', '--show-fixes-diff']],
    ['heatmap', ['--heatmap']],
    ['heatmap HTML', ['--heatmap', '--format', 'html']],
  ] as const)('fails a partial %s scan closed before actions and score views', async (_label, args) => {
    const { dir, sourcePath, source } = createFixablePartialWorkspace();
    const baseline = join(dir, '.slopbrick', 'cache', 'baseline.json');

    const result = await run(['--workspace', dir, '--no-telemetry', ...args]);

    expect(result.exitCode).toBe(1);
    expect(readFileSync(sourcePath, 'utf8')).toBe(source);
    expect(existsSync(baseline)).toBe(false);
    expect(`${result.stdout}\n${result.stderr}`).not.toMatch(
      /Fixes applied|--dry-run:|--- a\/|\+\+\+ b\/|ROI\s+Score|AI Slop Score went UP|Saved baseline|Tightened baseline|Threshold \(CI gate\)|✓ Clean/,
    );
    if (args.includes('--quiet')) {
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
    } else if (args.includes('html')) {
      expect(result.stdout).toContain('data-score-validity="incomplete"');
    } else {
      expect(`${result.stdout}\n${result.stderr}`).toContain('INCOMPLETE SCAN');
    }
  });

  it('does not create a baseline from a partial scan', async () => {
    const { dir } = createFixablePartialWorkspace();
    const path = join(dir, '.slopbrick', 'cache', 'baseline.json');

    const result = await run(['--workspace', dir, '--baseline', '--no-telemetry']);

    expect(result.exitCode).toBe(1);
    expect(existsSync(path)).toBe(false);
    expect(`${result.stdout}\n${result.stderr}`).toContain('INCOMPLETE SCAN');
    expect(`${result.stdout}\n${result.stderr}`).not.toMatch(/Saved baseline|AI Slop Score:|Threshold \(CI gate\)/);
  });

  it('does not tighten an existing baseline from a partial scan', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'valid.ts'), 'export const valid = 1;\n');
    expect((await run(['--workspace', dir, '--baseline', '--no-telemetry', '--quiet'])).exitCode).toBe(0);
    const path = join(dir, '.slopbrick', 'cache', 'baseline.json');
    const before = readFileSync(path, 'utf8');
    writeFileSync(join(dir, 'src', 'broken.ts'), 'export const = ;\n');

    const result = await run(['--workspace', dir, '--tighten', '--no-telemetry']);

    expect(result.exitCode).toBe(1);
    expect(readFileSync(path, 'utf8')).toBe(before);
    expect(`${result.stdout}\n${result.stderr}`).not.toContain('Tightened baseline');
  });

  it('does not compare an incomplete score for --no-increase', async () => {
    const dir = createTmpDir(); dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'valid.ts'), 'export const valid = 1;\n');
    expect((await run(['--workspace', dir, '--quiet', '--no-telemetry'])).exitCode).toBe(0);
    writeFileSync(
      join(dir, 'src', 'comment-heavy.ts'),
      `${Array.from({ length: 40 }, (_, index) => `// repeated generated explanation ${index}`).join('\n')}\nexport const changed = 1;\n`,
    );
    writeFileSync(join(dir, 'src', 'broken.ts'), 'export const = ;\n');

    const result = await run(['--workspace', dir, '--no-increase', '--no-telemetry']);

    expect(result.exitCode).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain('INCOMPLETE SCAN');
    expect(`${result.stdout}\n${result.stderr}`).not.toMatch(/AI Slop Score went UP|nothing to compare/);
  });

  it('persists only validity-aware diagnostics for a partial scan', async () => {
    const { dir } = createFixablePartialWorkspace();
    const cachePath = join(dir, 'custom-incremental-cache.json');
    const seededCache = '{"version":"seed","generatedAt":"seed","files":{}}\n';
    writeFileSync(cachePath, seededCache);
    const agentsPath = join(dir, 'AGENTS.md');
    const seededAgents = '# notes\n<!-- slopbrick:begin:v3 -->\nkeep me\n<!-- slopbrick:end:v3 -->\n';
    writeFileSync(agentsPath, seededAgents);

    const result = await run([
      '--workspace', dir,
      '--incremental', '--cache-path', cachePath,
      '--refresh-snippets',
      '--quiet',
    ]);

    expect(result.exitCode).toBe(1);
    expect(readFileSync(cachePath, 'utf8')).toBe(seededCache);
    expect(existsSync(`${cachePath}.tmp`)).toBe(false);
    expect(existsSync(join(dir, '.slopbrick-cache.json'))).toBe(false);
    expect(readFileSync(agentsPath, 'utf8')).toBe(seededAgents);
    expect(existsSync(join(dir, '.slopbrick', 'structure.json'))).toBe(false);
    expect(existsSync(join(dir, '.slopbrick', 'flywheel'))).toBe(false);

    const health = JSON.parse(
      readFileSync(join(dir, '.slopbrick', 'health.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(health).toMatchObject({
      completionStatus: 'partial',
      scoreValidity: 'incomplete',
      requested: 2,
      analyzed: 1,
      failed: 1,
    });
    expect(existsSync(join(dir, '.slopbrick', 'inventory.json'))).toBe(true);
    expect(existsSync(join(dir, '.slopbrick', 'constitution.json'))).toBe(true);
    expect(existsSync(join(dir, '.slopbrick', 'structure.md'))).toBe(true);
  });

  it('keeps the deferred partial JSON and SARIF numeric shape explicitly incomplete', async () => {
    const jsonWorkspace = createPartialWorkspace();
    const jsonResult = await run([
      '--workspace', jsonWorkspace, '--format', 'json', '--no-telemetry',
    ]);
    expect(jsonResult.exitCode).toBe(1);
    const json = JSON.parse(jsonResult.stdout) as Record<string, unknown>;
    expect(json).toMatchObject({ completionStatus: 'partial', scoreValidity: 'incomplete' });
    expect(json.aiSlopScore).toBeTypeOf('number');
    expect(json.repositoryHealth).toBeTypeOf('number');

    const sarifWorkspace = createPartialWorkspace();
    const sarifResult = await run([
      '--workspace', sarifWorkspace, '--format', 'sarif', '--no-telemetry',
    ]);
    expect(sarifResult.exitCode).toBe(1);
    const sarif = JSON.parse(sarifResult.stdout) as {
      runs: Array<{ tool: { driver: { properties: Record<string, unknown> } } }>;
    };
    expect(sarif.runs[0].tool.driver.properties).toMatchObject({
      completionStatus: 'partial',
      scoreValidity: 'incomplete',
    });
    expect(sarif.runs[0].tool.driver.properties.scores).toBeTypeOf('object');
  });

  it.each([
    ['suggest', ['--suggest']],
    ['brief', ['--brief']],
    ['why-failing', ['--why-failing']],
    ['explain-score', ['--explain-score']],
  ] as const)(
    'neutralizes partial %s before every machine-format dispatch',
    async (_label, alternateArgs) => {
      const variants = [
        { kind: 'json', args: (_dir: string) => ['--format', 'json'] },
        { kind: 'sarif', args: (_dir: string) => ['--format', 'sarif'] },
        { kind: 'html', args: (_dir: string) => ['--format', 'html'] },
        { kind: 'json', args: (dir: string) => ['--json', join(dir, 'partial.json')], file: 'partial.json' },
        { kind: 'html', args: (dir: string) => ['--html', join(dir, 'partial.html')], file: 'partial.html' },
      ] as const;

      for (const variant of variants) {
        const dir = createPartialWorkspace();
        const result = await run([
          '--workspace', dir,
          '--no-telemetry',
          ...alternateArgs,
          ...variant.args(dir),
        ]);
        expect(result.exitCode).toBe(1);
        const output = variant.file
          ? readFileSync(join(dir, variant.file), 'utf8')
          : result.stdout;

        if (variant.kind === 'json') {
          const json = JSON.parse(output) as Record<string, unknown>;
          expect(json).toMatchObject({ completionStatus: 'partial', scoreValidity: 'incomplete' });
          expect(json).not.toHaveProperty('scoreExplanation');
        } else if (variant.kind === 'sarif') {
          const sarif = JSON.parse(output) as {
            runs: Array<{ tool: { driver: { properties: Record<string, unknown> } } }>;
          };
          expect(sarif.runs[0].tool.driver.properties).toMatchObject({
            completionStatus: 'partial',
            scoreValidity: 'incomplete',
          });
        } else {
          expect(output).toContain('data-score-validity="incomplete"');
          expect(output).not.toMatch(/AI Slop Score|Repository Health|Threshold \(CI gate\)/);
        }
        expect(output).not.toMatch(
          /Remediation advice|Per-issue guidance|Top 5 rules dragging|Score explanation \(deterministic|✓ Clean|ROI\s+Score/,
        );
      }
    },
    20_000,
  );

  it.each([
    ['pretty', ['--format', 'pretty']],
    ['fix', ['--fix']],
    ['fix dry-run', ['--fix', '--dry-run']],
    ['heatmap', ['--heatmap']],
    ['suggest', ['--suggest']],
    ['brief', ['--brief']],
    ['why-failing', ['--why-failing']],
    ['explain-score', ['--explain-score']],
  ] as const)('routes an ordinary empty %s scan through the human validity boundary', async (_label, args) => {
    const dir = createTmpDir(); dirs.push(dir);
    const result = await run(['--workspace', dir, ...args]);
    expect(result.exitCode).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      'NO FILES ANALYSED — scores are not applicable for gating.',
    );
    expect(`${result.stdout}\n${result.stderr}`).not.toMatch(
      /AI Slop Score:|Repository Health:|Repository Coherence:|Threshold \(CI gate\)|✓ Clean|Fixes applied|ROI\s+Score|--dry-run:|auto-fix advice/,
    );
    expect(existsSync(join(dir, '.slopbrick'))).toBe(false);
  });

  it.each([
    ['json', ['--format', 'json']],
    ['fix JSON', ['--fix', '--format', 'json']],
    ['heatmap JSON', ['--heatmap', '--format', 'json']],
    ['suggest JSON', ['--suggest', '--format', 'json']],
    ['brief JSON', ['--brief', '--format', 'json']],
    ['why-failing JSON', ['--why-failing', '--format', 'json']],
    ['explain-score JSON', ['--explain-score', '--format', 'json']],
  ] as const)('routes an ordinary empty %s scan through the JSON validity boundary', async (_label, args) => {
    const dir = createTmpDir(); dirs.push(dir);
    const result = await run(['--workspace', dir, '--no-telemetry', ...args]);
    expect(result.exitCode).toBe(1);
    expectNotApplicableJsonEnvelope(JSON.parse(result.stdout));
    expect(result.stderr).toBe('');
    expect(existsSync(join(dir, '.slopbrick'))).toBe(false);
  });

  it.each(['staged', 'changed'] as const)(
    'routes empty --%s alternate human views through the successful no-op boundary',
    async (scope) => {
      for (const args of [
        ['--fix'],
        ['--fix', '--dry-run'],
        ['--heatmap'],
        ['--suggest'],
        ['--brief'],
        ['--why-failing'],
        ['--explain-score'],
      ]) {
        const dir = createCleanGitWorkspace();
        const result = await run(['--workspace', dir, `--${scope}`, '--no-telemetry', ...args]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe('NO FILES SELECTED — scores are not applicable.');
        expect(result.stderr).toBe('');
        expect(result.stdout).not.toMatch(
          /AI Slop Score:|Repository Health:|Repository Coherence:|Threshold \(CI gate\)|✓ Clean|auto-fix advice|Score explanation/,
        );
        expect(existsSync(join(dir, '.slopbrick'))).toBe(false);
      }
    },
  );

  it.each(['staged', 'changed'] as const)(
    'keeps empty --%s alternate JSON views typed and score-free',
    async (scope) => {
      for (const args of [
        ['--fix'],
        ['--heatmap'],
        ['--suggest'],
        ['--brief'],
        ['--why-failing'],
        ['--explain-score'],
      ]) {
        const dir = createCleanGitWorkspace();
        const result = await run([
          '--workspace', dir, `--${scope}`, '--no-telemetry', '--format', 'json', ...args,
        ]);
        expect(result.exitCode).toBe(0);
        expectNotApplicableJsonEnvelope(JSON.parse(result.stdout));
        expect(result.stderr).toBe('');
        expect(existsSync(join(dir, '.slopbrick'))).toBe(false);
      }
    },
  );

  it.each([
    ['ordinary', undefined, 1],
    ['staged', 'staged', 0],
    ['changed', 'changed', 0],
  ] as const)('writes typed score-free files for an empty %s scan', async (_label, scope, expectedExit) => {
    for (const format of ['json', 'html'] as const) {
      const dir = scope ? createCleanGitWorkspace() : createTmpDir();
      if (!scope) dirs.push(dir);
      const outputPath = join(dir, `not-applicable.${format}`);
      const result = await run([
        '--workspace', dir,
        ...(scope ? [`--${scope}`] : []),
        `--${format}`, outputPath,
        '--no-telemetry',
        '--quiet',
      ]);

      expect(result.exitCode).toBe(expectedExit);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
      expect(existsSync(outputPath)).toBe(true);
      if (format === 'json') {
        expectNotApplicableJsonEnvelope(JSON.parse(readFileSync(outputPath, 'utf8')));
      } else {
        const html = readFileSync(outputPath, 'utf8');
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('data-score-validity="not-applicable"');
        expect(html).toContain('NO FILES ANALYSED — scores are not applicable for gating.');
        expect(html).not.toMatch(/AI Slop Score|Repository Health|Threshold \(CI gate\)|auto-fix advice/);
      }
      expect(existsSync(join(dir, '.slopbrick'))).toBe(false);
    }
  });

  it.each([
    ['ordinary', undefined, 1],
    ['staged', 'staged', 0],
    ['changed', 'changed', 0],
  ] as const)('preserves quiet output for an empty %s scan', async (_label, scope, expectedExit) => {
    const dir = scope ? createCleanGitWorkspace() : createTmpDir();
    if (!scope) dirs.push(dir);
    const result = await run([
      '--workspace', dir,
      ...(scope ? [`--${scope}`] : []),
      '--suggest',
      '--quiet',
      '--no-telemetry',
    ]);
    expect(result.exitCode).toBe(expectedExit);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
    expect(existsSync(join(dir, '.slopbrick'))).toBe(false);
  });

  it.each([
    ['sarif', ['--format', 'sarif']],
    ['fix SARIF', ['--fix', '--format', 'sarif']],
    ['heatmap SARIF', ['--heatmap', '--format', 'sarif']],
  ] as const)('routes an ordinary empty %s scan through the SARIF validity boundary', async (_label, args) => {
    const dir = createTmpDir(); dirs.push(dir);
    const result = await run(['--workspace', dir, '--no-telemetry', ...args]);
    expect(result.exitCode).toBe(1);
    expectNotApplicableSarifEnvelope(JSON.parse(result.stdout));
    expect(result.stderr).toBe('');
    expect(existsSync(join(dir, '.slopbrick'))).toBe(false);
  });

  it.each([
    ['html', ['--format', 'html']],
    ['fix HTML', ['--fix', '--format', 'html']],
    ['heatmap HTML', ['--heatmap', '--format', 'html']],
  ] as const)('routes an ordinary empty %s scan through the HTML validity boundary', async (_label, args) => {
    const dir = createTmpDir(); dirs.push(dir);
    const result = await run(['--workspace', dir, '--no-telemetry', ...args]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('<!DOCTYPE html>');
    expect(result.stdout).toContain('data-score-validity="not-applicable"');
    expect(result.stdout).toContain('NO FILES ANALYSED — scores are not applicable for gating.');
    expect(result.stdout).not.toMatch(/AI Slop Score|Repository Health|Threshold \(CI gate\)|Fixes applied|ROI\s+Score/);
    expect(result.stderr).toBe('');
    expect(existsSync(join(dir, '.slopbrick'))).toBe(false);
  });

  it.each(['staged', 'changed'] as const)('keeps an empty %s source scan not-applicable and side-effect free', async (scope) => {
    const dir = createCleanGitWorkspace();
    const cachePath = join(dir, 'custom-incremental-cache.json');
    const result = await runScan({
      workspace: dir,
      [scope]: true,
      incremental: true,
      cachePath,
      telemetry: false,
      quiet: true,
    });

    expect(result.scanStats).toMatchObject({ status: 'empty', requested: 0, analyzed: 0, failed: 0 });
    expect(result.report).toMatchObject({
      completionStatus: 'empty',
      scoreValidity: 'not-applicable',
      requested: 0,
      analyzed: 0,
      failed: 0,
    });
    expect(existsSync(join(dir, '.slopbrick'))).toBe(false);
    expect(existsSync(cachePath)).toBe(false);
  });

  it.each(['staged', 'changed'] as const)('keeps a non-empty %s source scan deterministic and side-effect free', async (scope) => {
    const dir = createCleanGitWorkspace();
    const sourcePath = join(dir, 'src', 'clean.ts');
    writeFileSync(sourcePath, compressionProfileFixture());
    execFileSync('git', ['add', 'src/clean.ts'], { cwd: dir, stdio: 'ignore' });

    const first = await runScan({ workspace: dir, [scope]: true, quiet: true });
    const second = await runScan({ workspace: dir, [scope]: true, quiet: true });

    const scoreProjection = (result: Awaited<ReturnType<typeof runScan>>) => ({
      aiSlopScore: result.report.aiSlopScore,
      engineeringHygiene: result.report.engineeringHygiene,
      security: result.report.security,
      repositoryHealth: result.report.repositoryHealth,
      issues: result.report.issues.map(({ ruleId, severity, filePath, line, column }) => ({
        ruleId,
        severity,
        filePath,
        line,
        column,
      })),
      scores: result.scores.map(({ filePath, rawScore, adjustedScore }) => ({
        filePath,
        rawScore,
        adjustedScore,
      })),
    });

    expect(first.report.scoreValidity).toBe('valid');
    expect(first.scanStats.analyzed).toBe(1);
    expect(first.report.issues.find((issue) => issue.ruleId === 'ai/compression-profile')).toMatchObject({
      severity: 'low',
    });
    expect(scoreProjection(second)).toEqual(scoreProjection(first));
    expect(existsSync(join(dir, '.slopbrick'))).toBe(false);

    const flywheelDir = join(dir, '.slopbrick', 'flywheel');
    const statePath = join(flywheelDir, 'auto-tuned.json');
    const telemetryPath = join(flywheelDir, 'scans.jsonl');
    mkdirSync(flywheelDir, { recursive: true });
    writeFileSync(
      statePath,
      JSON.stringify({
        version: '3',
        updatedAt: '2026-01-01T00:00:00.000Z',
        autoTuned: [{
          ruleId: 'ai/compression-profile',
          severity: 'high',
          reason: 'test sentinel',
        }],
        autoRelaxed: [],
      }),
    );
    writeFileSync(telemetryPath, '{"sentinel":true}\n');
    const stateBefore = readFileSync(statePath, 'utf8');
    const telemetryBefore = readFileSync(telemetryPath, 'utf8');

    const withPriorFlywheelState = await runScan({
      workspace: dir,
      [scope]: true,
      quiet: true,
    });

    expect(scoreProjection(withPriorFlywheelState)).toEqual(scoreProjection(first));
    expect(readFileSync(statePath, 'utf8')).toBe(stateBefore);
    expect(readFileSync(telemetryPath, 'utf8')).toBe(telemetryBefore);
    expect(existsSync(join(dir, '.slopbrick', 'health.json'))).toBe(false);
    expect(existsSync(join(dir, '.slopbrick', 'structure.json'))).toBe(false);
  });

  it.each(['staged', 'changed'] as const)('suppresses inherited parser-cache writes during non-empty %s verification', async (scope) => {
    const dir = createCleanGitWorkspace();
    writeFileSync(join(dir, 'src', 'clean.ts'), compressionProfileFixture());
    execFileSync('git', ['add', 'src/clean.ts'], { cwd: dir, stdio: 'ignore' });
    const previousCacheSetting = process.env.SLOP_AUDIT_CACHE;
    process.env.SLOP_AUDIT_CACHE = '1';
    try {
      const result = await runScan({
        workspace: dir,
        [scope]: true,
        cache: true,
        quiet: true,
      });
      expect(result.report.scoreValidity).toBe('valid');
      expect(existsSync(join(dir, '.slopbrick'))).toBe(false);
      expect(process.env.SLOP_AUDIT_CACHE).toBe('1');
    } finally {
      if (previousCacheSetting === undefined) delete process.env.SLOP_AUDIT_CACHE;
      else process.env.SLOP_AUDIT_CACHE = previousCacheSetting;
    }
  });

  it('does not leak an ordinary scan flywheel override into a later staged scan', async () => {
    const dir = createCleanGitWorkspace();
    const sourcePath = join(dir, 'src', 'clean.ts');
    const flywheelDir = join(dir, '.slopbrick', 'flywheel');
    writeFileSync(sourcePath, compressionProfileFixture());
    mkdirSync(flywheelDir, { recursive: true });
    writeFileSync(
      join(flywheelDir, 'auto-tuned.json'),
      JSON.stringify({
        version: '3',
        updatedAt: '2026-01-01T00:00:00.000Z',
        autoTuned: [{
          ruleId: 'ai/compression-profile',
          severity: 'high',
          reason: 'test sentinel',
        }],
        autoRelaxed: [],
      }),
    );

    const ordinary = await runScan({ workspace: dir, quiet: true });
    const ordinaryCompression = ordinary.report.issues.find(
      (issue) => issue.ruleId === 'ai/compression-profile',
    );
    expect(ordinaryCompression?.severity).not.toBe('low');

    execFileSync('git', ['add', 'src/clean.ts'], { cwd: dir, stdio: 'ignore' });
    const staged = await runScan({ workspace: dir, staged: true, quiet: true });
    expect(staged.report.issues.find(
      (issue) => issue.ruleId === 'ai/compression-profile',
    )).toMatchObject({ severity: 'low' });
  });

  it.each(['staged', 'changed'] as const)('blocks every implicit repository-state write during non-empty packaged %s verification', async (scope) => {
    const dir = createCleanGitWorkspace();
    const sourcePath = join(dir, 'src', 'clean.ts');
    const cachePath = join(dir, 'custom-incremental-cache.json');
    writeFileSync(
      join(dir, 'slopbrick.config.cjs'),
      'module.exports = { thresholds: { meanSlop: 999, p90Slop: 999, individualSlopThreshold: 999 } };\n',
    );
    execFileSync('git', ['add', 'slopbrick.config.cjs'], { cwd: dir, stdio: 'ignore' });
    execFileSync(
      'git',
      ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'add config'],
      { cwd: dir, stdio: 'ignore' },
    );
    writeFileSync(sourcePath, compressionProfileFixture());
    execFileSync('git', ['add', 'src/clean.ts'], { cwd: dir, stdio: 'ignore' });

    const result = await run([
      '--workspace', dir,
      `--${scope}`,
      '--baseline',
      '--tighten',
      '--incremental',
      '--cache-path', cachePath,
      '--cache',
      '--refresh-snippets',
      '--format', 'json',
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      completionStatus: 'complete',
      scoreValidity: 'valid',
      analyzed: 1,
    });
    expect(result.stderr).toBe('');
    expect(existsSync(join(dir, '.slopbrick'))).toBe(false);
    expect(existsSync(cachePath)).toBe(false);
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(false);
  });

  it('isolates concurrent programmatic scans that use process-scoped cross-file rules', async () => {
    const firstDir = createTmpDir(); dirs.push(firstDir);
    const secondDir = createTmpDir(); dirs.push(secondDir);
    const sharedSource = Array.from(
      { length: 30 },
      (_, index) => `export const sharedValue${index} = ${index};`,
    ).join('\n');
    for (const workspace of [firstDir, secondDir]) {
      mkdirSync(join(workspace, 'src'));
      writeFileSync(join(workspace, 'src', 'shared.ts'), sharedSource);
    }

    const [first, second] = await Promise.all([
      runScan({ workspace: firstDir, telemetry: false, quiet: true }),
      runScan({ workspace: secondDir, telemetry: false, quiet: true }),
    ]);

    for (const result of [first, second]) {
      expect(result.report.scoreValidity).toBe('valid');
      expect(result.report.issues.some((issue) => issue.ruleId === 'dup/identical-block')).toBe(false);
      expect(result.report.issues.some((issue) => issue.ruleId === 'dup/near-duplicate')).toBe(false);
      expect(result.report.issues.some((issue) => issue.ruleId === 'dup/structural-clone')).toBe(false);
    }
  });

  it.each(['staged', 'changed'] as const)('does not attach prior-run trend data to an empty %s source scan', async (scope) => {
    const dir = createCleanGitWorkspace();
    const seeded = await runScan({ workspace: dir, telemetry: false, quiet: true });
    expect(seeded.report.scoreValidity).toBe('valid');

    const noOp = await runScan({
      workspace: dir,
      [scope]: true,
      telemetry: false,
      quiet: true,
    });

    expect(noOp.report.scoreValidity).toBe('not-applicable');
    expect(noOp.report.previousSlopIndex).toBeUndefined();
    expect(noOp.report.previousRunTimestamp).toBeUndefined();
  });

  it.each(['staged', 'changed'] as const)('renders one truthful message for an empty --%s packaged scan', async (scope) => {
    const dir = createCleanGitWorkspace();
    const cachePath = join(dir, 'custom-incremental-cache.json');
    const result = await run([
      '--workspace', dir, `--${scope}`, '--incremental', '--cache-path', cachePath, '--no-telemetry',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('NO FILES SELECTED — scores are not applicable.');
    expect(result.stderr).toBe('');
    expect(existsSync(join(dir, '.slopbrick'))).toBe(false);
    expect(existsSync(cachePath)).toBe(false);
  });

  it.each(['staged', 'changed'] as const)('keeps empty --%s machine reports parseable and explicitly not-applicable', async (scope) => {
    const jsonDir = createCleanGitWorkspace();
    const jsonResult = await run([
      '--workspace', jsonDir, `--${scope}`, '--format', 'json', '--no-telemetry',
    ]);
    expect(jsonResult.exitCode).toBe(0);
    expectNotApplicableJsonEnvelope(JSON.parse(jsonResult.stdout));
    expect(jsonResult.stderr).toBe('');
    expect(existsSync(join(jsonDir, '.slopbrick'))).toBe(false);

    const sarifDir = createCleanGitWorkspace();
    const sarifResult = await run([
      '--workspace', sarifDir, `--${scope}`, '--format', 'sarif', '--no-telemetry',
    ]);
    expect(sarifResult.exitCode).toBe(0);
    const sarif = JSON.parse(sarifResult.stdout) as {
      runs: Array<{ tool: { driver: { properties?: Record<string, unknown> } } }>;
    };
    expectNotApplicableSarifEnvelope(sarif);
    expect(sarifResult.stderr).toBe('');
    expect(existsSync(join(sarifDir, '.slopbrick'))).toBe(false);

    const htmlDir = createCleanGitWorkspace();
    const htmlResult = await run([
      '--workspace', htmlDir, `--${scope}`, '--format', 'html', '--no-telemetry',
    ]);
    expect(htmlResult.exitCode).toBe(0);
    expect(htmlResult.stdout).toContain('<!DOCTYPE html>');
    expect(htmlResult.stdout).toContain('NO FILES ANALYSED — scores are not applicable for gating.');
    expect(htmlResult.stdout).not.toMatch(/AI Slop Score|Repository Health|Threshold \(CI gate\)/);
    expect(htmlResult.stderr).toBe('');
    expect(existsSync(join(htmlDir, '.slopbrick'))).toBe(false);
  });

  it.each(['staged', 'changed'] as const)('does not update baseline or project memory for an empty --%s scan', async (scope) => {
    const dir = createCleanGitWorkspace();
    const baselineRun = await run([
      '--workspace', dir, '--baseline', '--no-telemetry', '--quiet',
    ]);
    expect(baselineRun.exitCode).toBe(0);

    const memoryPaths = [
      join(dir, '.slopbrick', 'cache', 'baseline.json'),
      join(dir, '.slopbrick', 'structure.json'),
      join(dir, '.slopbrick', 'health.json'),
      join(dir, '.slopbrick', 'inventory.json'),
      join(dir, '.slopbrick', 'constitution.json'),
      join(dir, '.slopbrick', 'structure.md'),
    ];
    const before = new Map(
      memoryPaths
        .filter((path) => existsSync(path))
        .map((path) => [path, readFileSync(path, 'utf8')]),
    );
    expect(before.has(memoryPaths[0]!)).toBe(true);
    expect(before.has(memoryPaths[1]!)).toBe(true);

    const noOp = await run([
      '--workspace', dir, `--${scope}`, '--tighten', '--refresh-snippets', '--no-telemetry', '--format', 'json',
    ]);

    expect(noOp.exitCode).toBe(0);
    const noOpReport = JSON.parse(noOp.stdout) as Record<string, unknown>;
    expect(noOpReport).toMatchObject({
      completionStatus: 'empty',
      scoreValidity: 'not-applicable',
    });
    expect(noOpReport).not.toHaveProperty('previousSlopIndex');
    expect(noOp.stderr).toBe('');
    for (const [path, content] of before) {
      expect(readFileSync(path, 'utf8')).toBe(content);
    }
  });

  it.each(['--staged', '--changed'])('keeps parse-error %s scans incomplete', async (flag) => {
    const dir = createTmpDir(); dirs.push(dir);
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'broken.ts'), 'export const = ;\n');
    execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'ignore' });
    const result = await run(['--workspace', dir, flag, '--quiet']);
    expect(result.exitCode).toBe(1);
  });
});
