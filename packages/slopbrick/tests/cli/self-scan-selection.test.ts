import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

import { runScan } from '../../src/cli/scan.js';
import { hashConfig, saveBaseline } from '../../src/engine/cache.js';
import { loadConfig } from '../../src/config/load.js';
import { VERSION } from '../../src/types/index.js';
import { cleanupTempDir, createTmpDir } from '../helpers/cli.js';

describe('selfScan selection policy', () => {
  const dirs: string[] = [];

  afterEach(() => {
    while (dirs.length > 0) cleanupTempDir(dirs.pop()!);
  });

  it('scans ordinary user source under src/rules and src/tests with the shared defaults', async () => {
    const dir = createTmpDir();
    dirs.push(dir);
    mkdirSync(join(dir, 'src', 'rules'), { recursive: true });
    mkdirSync(join(dir, 'src', 'tests'), { recursive: true });
    writeFileSync(join(dir, 'src', 'rules', 'user-rule.ts'), 'export const userRule = true;\n');
    writeFileSync(join(dir, 'src', 'tests', 'user.test.ts'), 'export const userTest = true;\n');

    const result = await runScan({ workspace: dir, quiet: true, telemetry: false });

    expect(result.scanStats).toMatchObject({ requested: 2, analyzed: 2 });
    expect(result.results).toHaveLength(2);
    expect(result.results.every((file) => file.facts !== undefined)).toBe(true);
    expect(result.report.scoreBasis).toMatchObject({ denominator: 2, analyzedFiles: 2 });
  });

  it('accounts configured self-scan paths as selection exclusions without diluting scores', async () => {
    const dir = createTmpDir();
    dirs.push(dir);
    mkdirSync(join(dir, 'src', 'meta'), { recursive: true });
    const scoredFile = join(dir, 'src', 'scored.ts');
    writeFileSync(
      scoredFile,
      `${Array.from({ length: 5 }, (_, index) => `console.log(${index});`).join('\n')}\n`,
    );
    writeFileSync(join(dir, 'src', 'meta', 'fixture-a.ts'), 'export const fixtureA = true;\n');
    writeFileSync(join(dir, 'src', 'meta', 'fixture-b.ts'), 'export const fixtureB = true;\n');
    writeFileSync(join(dir, 'slopbrick.config.mjs'), [
      'export default {',
      "  include: ['src/**/*.ts'],",
      "  selfScan: { excludePaths: ['src/meta/**'] },",
      '  projectMemory: false,',
      '  telemetry: false,',
      '};',
    ].join('\n'));

    const options = {
      workspace: dir,
      quiet: true,
      telemetry: false,
      includeRules: ['logic/math-console-log-storm'],
    };
    const direct = await runScan(options, [scoredFile]);
    const discovered = await runScan(options);

    expect(discovered.report.selectionAccounting).toEqual({
      observedCandidates: 3,
      selected: 1,
      excluded: {
        configExclude: 2,
        unsupportedFileType: 0,
        extensionlessDuplicate: 0,
        outsideWorkspace: 0,
        gitScope: 0,
      },
    });
    expect(discovered.scanStats).toMatchObject({ requested: 1, analyzed: 1, skipped: 0 });
    expect(discovered.scanStats.scanAccounting).toMatchObject({
      selected: 1,
      analyzed: 1,
      zeroFinding: 0,
    });
    expect(discovered.results.map((file) => file.filePath)).toEqual([scoredFile]);
    expect(discovered.report.scoreBasis).toMatchObject({ denominator: 1, analyzedFiles: 1 });
    expect(discovered.report.aiSlopScore).toBeGreaterThan(0);
    expect({
      aiSlopScore: discovered.report.aiSlopScore,
      engineeringHygiene: discovered.report.engineeringHygiene,
      security: discovered.report.security,
      repositoryHealth: discovered.report.repositoryHealth,
    }).toEqual({
      aiSlopScore: direct.report.aiSlopScore,
      engineeringHygiene: direct.report.engineeringHygiene,
      security: direct.report.security,
      repositoryHealth: direct.report.repositoryHealth,
    });
  });

  it('matches configured self-scan paths relative to the selected workspace root', async () => {
    const root = createTmpDir();
    dirs.push(root);
    const workspace = join(root, 'packages', 'app');
    mkdirSync(join(workspace, 'src'), { recursive: true });
    const accepted = join(workspace, 'src', 'accepted.ts');
    const excluded = join(workspace, 'src', 'excluded.ts');
    writeFileSync(accepted, 'export const accepted = true;\n');
    writeFileSync(excluded, 'export const excluded = true;\n');
    writeFileSync(join(root, 'slopbrick.config.mjs'), [
      'export default {',
      "  include: ['packages/app/src/**/*.ts'],",
      "  selfScan: { excludePaths: ['src/excluded.ts'] },",
      '  projectMemory: false,',
      '  telemetry: false,',
      '};',
    ].join('\n'));

    const result = await runScan({ workspace, quiet: true, telemetry: false });

    expect(result.report.selectionAccounting).toMatchObject({
      observedCandidates: 2,
      selected: 1,
      excluded: { configExclude: 1, outsideWorkspace: 0 },
    });
    expect(result.scanStats).toMatchObject({ requested: 1, analyzed: 1 });
    expect(result.results.map((file) => relative(workspace, file.filePath))).toEqual([
      relative(workspace, accepted),
    ]);
  });

  it('excludes configured direct files without inventing selection accounting', async () => {
    const dir = createTmpDir();
    dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    const excluded = join(dir, 'src', 'excluded.ts');
    writeFileSync(excluded, 'export const excluded = true;\n');
    writeFileSync(join(dir, 'slopbrick.config.mjs'), [
      'export default {',
      "  selfScan: { excludePaths: ['src/excluded.ts'] },",
      '  projectMemory: false,',
      '  telemetry: false,',
      '};',
    ].join('\n'));

    const result = await runScan(
      { workspace: dir, quiet: true, telemetry: false },
      [excluded],
    );

    expect(result.report.selectionAccounting).toBeUndefined();
    expect(result.scanStats).toMatchObject({ status: 'empty', requested: 0, analyzed: 0 });
    expect(result.scanStats.scanAccounting).toMatchObject({ selected: 0, zeroFinding: 0 });
    expect(result.report.scoreValidity).toBe('not-applicable');
    expect(result.results).toEqual([]);
  });

  it('canonicalizes --since baseline identities before reuse and self-scan filtering', async () => {
    const dir = createTmpDir();
    dirs.push(dir);
    expect(resolve(process.cwd())).not.toBe(resolve(dir));
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    mkdirSync(join(dir, 'src', 'meta'), { recursive: true });
    const scoredFile = join(dir, 'src', 'scored.ts');
    const eligibleUnchangedFile = join(dir, 'src', 'eligible-unchanged.ts');
    const legacyAbsoluteFile = join(dir, 'src', 'legacy-absolute.ts');
    const excludedFiles = Array.from(
      { length: 10 },
      (_, index) => join(dir, 'src', 'meta', `fixture-${index}.ts`),
    );
    writeFileSync(scoredFile, 'export const value = 0;\n');
    writeFileSync(eligibleUnchangedFile, 'export const eligible = true;\n');
    writeFileSync(legacyAbsoluteFile, 'export const legacy = true;\n');
    for (const [index, filePath] of excludedFiles.entries()) {
      writeFileSync(filePath, `export const fixture${index} = true;\n`);
    }
    writeFileSync(join(dir, 'slopbrick.config.mjs'), [
      'export default {',
      "  include: ['src/**/*.ts'],",
      "  selfScan: { excludePaths: ['src/meta/**'] },",
      '  projectMemory: false,',
      '  telemetry: false,',
      '};',
    ].join('\n'));
    execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'ignore' });
    execFileSync(
      'git',
      ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'base'],
      { cwd: dir, stdio: 'ignore' },
    );
    const baseRef = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();

    writeFileSync(
      scoredFile,
      `${Array.from({ length: 5 }, (_, index) => `console.log(${index});`).join('\n')}\n`,
    );
    execFileSync('git', ['add', 'src/scored.ts'], { cwd: dir, stdio: 'ignore' });
    execFileSync(
      'git',
      ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'change scored file'],
      { cwd: dir, stdio: 'ignore' },
    );
    const gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
    const config = await loadConfig(dir);
    saveBaseline(dir, {
      version: VERSION,
      config_hash: hashConfig(config),
      git_head: gitHead,
      baseline_created: '2026-07-12T00:00:00.000Z',
      baseline_revision: 1,
      totalComponentCount: excludedFiles.length + 3,
      scores: {
        // Production baselines use workspace-relative keys. The changed row
        // must not be reinserted, while an eligible unchanged row must be.
        [relative(dir, scoredFile)]: { baselineScore: 0, componentCount: 1 },
        [relative(dir, eligibleUnchangedFile)]: { baselineScore: 0, componentCount: 1 },
        ...Object.fromEntries(excludedFiles.map((filePath) => [
          relative(dir, filePath),
          { baselineScore: 0, componentCount: 1 },
        ])),
        // Older/manual caches may contain absolute keys; normalize them to the
        // same comparison identity while retaining absolute report paths.
        [legacyAbsoluteFile]: { baselineScore: 0, componentCount: 1 },
      },
    });

    const result = await runScan({
      workspace: dir,
      quiet: true,
      telemetry: false,
      since: baseRef,
      includeRules: ['logic/math-console-log-storm'],
    });

    expect(result.baseline).toBeDefined();
    expect(result.scanStats).toMatchObject({ requested: 1, analyzed: 1, skipped: 0 });
    expect(result.report.selectionAccounting).toMatchObject({
      observedCandidates: 13,
      selected: 1,
      excluded: { configExclude: 10, gitScope: 2 },
    });
    expect(result.scores.map((score) => score.filePath)).toEqual([
      scoredFile,
      eligibleUnchangedFile,
      legacyAbsoluteFile,
    ]);
    expect(result.scores.filter((score) => score.filePath === scoredFile)).toHaveLength(1);
    expect(result.report.components.map((score) => score.filePath)).toEqual([
      scoredFile,
      eligibleUnchangedFile,
      legacyAbsoluteFile,
    ]);
    expect(result.scores.every((score) => score.filePath === resolve(score.filePath))).toBe(true);
    expect(result.scores.some((score) => excludedFiles.includes(score.filePath))).toBe(false);
    expect(result.report.p90Score).toBe(result.scores[0]?.adjustedScore);
    expect(result.report.p90Score).toBeGreaterThan(0);
    expect(result.report.componentCount).toBe((result.scores[0]?.componentCount ?? 0) + 2);
  });
});
