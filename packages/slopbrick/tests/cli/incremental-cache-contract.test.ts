import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runScan } from '../../src/cli/scan.js';
import { cleanupTempDir, createTmpDir, execFileAsync, run } from '../helpers/cli.js';
import { VERSION } from '../../src/types/index.js';

describe('incremental cache evidence contract', () => {
  const dirs: string[] = [];

  afterEach(() => {
    while (dirs.length > 0) cleanupTempDir(dirs.pop()!);
  });

  it('marks cached-file scans incomplete and never treats unhydrated findings as a valid score', async () => {
    const dir = createTmpDir();
    dirs.push(dir);
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(
      join(dir, 'slopbrick.config.mjs'),
      "export default { rules: { 'logic/math-console-log-storm': 'medium' } };\n",
    );
    const cachedPath = join(dir, 'src', 'cached.ts');
    const rescannedPath = join(dir, 'src', 'rescanned.ts');
    writeFileSync(
      cachedPath,
      'console.log(1);\nconsole.log(2);\nconsole.log(3);\nconsole.log(4);\nconsole.log(5);\n',
    );
    writeFileSync(rescannedPath, 'export const before = true;\n');
    const cachePath = join(dir, 'incremental-cache.json');

    const seeded = await runScan({
      workspace: dir,
      incremental: true,
      cachePath,
      quiet: true,
      telemetry: false,
    });
    expect(seeded.report.scoreValidity).toBe('valid');
    expect(seeded.report.issues.some((issue) => issue.ruleId === 'logic/math-console-log-storm')).toBe(true);
    // Seed a real persisted snapshot. The incremental run must not replace it
    // with an incomplete numeric diagnostic or a cache-derived approximation.
    expect(existsSync(join(dir, '.slopbrick', 'health.json'))).toBe(true);
    const healthBefore = readFileSync(join(dir, '.slopbrick', 'health.json'), 'utf8');
    const cacheBefore = readFileSync(cachePath, 'utf8');

    writeFileSync(rescannedPath, 'export const after = true;\n');
    const incremental = await runScan({
      workspace: dir,
      incremental: true,
      cachePath,
      quiet: true,
      telemetry: false,
    });

    expect(incremental.report).toMatchObject({
      completionStatus: 'partial',
      scoreValidity: 'incomplete',
      scoreBasis: { denominator: 1, analyzedFiles: 1 },
      scanAccounting: { selected: 2, analyzed: 1, incrementalCached: 1 },
    });
    // The cached file's normal rule findings are not hydrated by the hash-only
    // cache. They therefore cannot silently enter an incomplete score or be
    // presented as a complete project result.
    expect(incremental.report.issues.some((issue) => issue.ruleId === 'logic/math-console-log-storm')).toBe(false);
    expect(incremental.report.components.map((component) => component.filePath)).not.toContain(cachedPath);
    expect(readFileSync(cachePath, 'utf8')).toBe(cacheBefore);
    expect(readFileSync(join(dir, '.slopbrick', 'health.json'), 'utf8')).toBe(healthBefore);
  });

  it('fails closed when a project rule needs incremental-cached files', async () => {
    const dir = createTmpDir();
    dirs.push(dir);
    mkdirSync(join(dir, 'src'), { recursive: true });
    // Ten identical gap declarations exceed the project rule's small-project
    // tolerance. After changing one file, the full scan still sees the
    // project-wide pattern, while an incremental run only has the changed
    // file's facts in memory. A hash-only cache cannot safely reconstruct the
    // missing project-rule input, so the incremental result must stay
    // explicitly incomplete instead of claiming whole-project parity.
    for (let index = 0; index < 10; index++) {
      writeFileSync(
        join(dir, 'src', `gap-${index}.tsx`),
        `export const Gap${index} = () => <div className="gap-4">${index}</div>;\n`,
      );
    }
    const cachePath = join(dir, 'project-rule-cache.json');
    const workerScript = resolve(process.cwd(), 'dist/engine/worker.cjs');
    const seeded = await runScan({
      workspace: dir,
      incremental: true,
      cachePath,
      workerScript,
      quiet: true,
      telemetry: false,
    });
    expect(seeded.report.scoreValidity).toBe('valid');
    expect(seeded.report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'layout/gap-monopoly' }),
    ]));
    const healthBefore = readFileSync(join(dir, '.slopbrick', 'health.json'), 'utf8');
    const cacheBefore = readFileSync(cachePath, 'utf8');

    writeFileSync(
      join(dir, 'src', 'gap-0.tsx'),
      'export const Gap0 = () => <div>changed</div>;\n',
    );
    const incremental = await runScan({
      workspace: dir,
      incremental: true,
      cachePath,
      workerScript,
      quiet: true,
      telemetry: false,
    });
    expect(incremental.report).toMatchObject({
      completionStatus: 'partial',
      scoreValidity: 'incomplete',
      scoreBasis: { denominator: 1, analyzedFiles: 1 },
      scanAccounting: { selected: 10, analyzed: 1, incrementalCached: 9 },
    });
    expect(incremental.report.issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'layout/gap-monopoly' }),
    ]));
    expect(readFileSync(cachePath, 'utf8')).toBe(cacheBefore);
    expect(readFileSync(join(dir, '.slopbrick', 'health.json'), 'utf8')).toBe(healthBefore);

    const full = await runScan({ workspace: dir, workerScript, quiet: true, telemetry: false });
    expect(full.report.scoreValidity).toBe('valid');
    expect(full.report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'layout/gap-monopoly' }),
    ]));
  });

  it('resolves a relative cache path from the requested workspace', async () => {
    const dir = createTmpDir();
    dirs.push(dir);
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'entry.ts'), 'export const entry = true;\n');
    const relativeCachePath = `.workspace-incremental-cache-${randomUUID()}.json`;
    const callerCachePath = join(process.cwd(), relativeCachePath);
    rmSync(callerCachePath, { force: true });

    const result = await runScan({
      workspace: dir,
      incremental: true,
      cachePath: relativeCachePath,
      quiet: true,
      telemetry: false,
    });

    expect(result.report.scoreValidity).toBe('valid');
    expect(existsSync(join(dir, relativeCachePath))).toBe(true);
    expect(existsSync(callerCachePath)).toBe(false);
  });

  it('fails open on a same-version cache with malformed file entries', async () => {
    const dir = createTmpDir();
    dirs.push(dir);
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'entry.ts'), 'export const entry = true;\n');
    const cachePath = join(dir, 'malformed-cache.json');
    writeFileSync(cachePath, JSON.stringify({ version: VERSION, generatedAt: 'seed', files: null }));

    const result = await runScan({
      workspace: dir,
      incremental: true,
      cachePath,
      quiet: true,
      telemetry: false,
    });

    expect(result.report.scoreValidity).toBe('valid');
    expect(JSON.parse(readFileSync(cachePath, 'utf8')).files).toEqual(expect.any(Object));
  });

  it('keeps a valid scan successful when the incremental cache path is unwritable', async () => {
    const dir = createTmpDir();
    dirs.push(dir);
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'entry.ts'), 'export const entry = true;\n');
    const cachePath = join(dir, 'cache-directory');
    mkdirSync(cachePath);

    const result = await runScan({
      workspace: dir,
      incremental: true,
      cachePath,
      quiet: true,
      telemetry: false,
    });

    expect(result.report.scoreValidity).toBe('valid');
    expect(existsSync(cachePath)).toBe(true);
  });

  it('keeps a valid scan successful when historical memory is unwritable', async () => {
    const dir = createTmpDir();
    dirs.push(dir);
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'entry.ts'), 'export const entry = true;\n');
    mkdirSync(join(dir, '.slopbrick'), { recursive: true });
    // appendRun expects a file here; a directory reproduces the filesystem
    // failure without changing permissions or relying on platform-specific
    // chmod behavior.
    mkdirSync(join(dir, '.slopbrick', 'structure.json'));

    const result = await runScan({
      workspace: dir,
      quiet: true,
      telemetry: false,
    });

    expect(result.report.scoreValidity).toBe('valid');
  });

  it('keeps a valid scan successful when telemetry storage is unwritable', async () => {
    const dir = createTmpDir();
    dirs.push(dir);
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'entry.ts'), 'export const entry = true;\n');
    mkdirSync(join(dir, '.slopbrick', 'flywheel'), { recursive: true });
    mkdirSync(join(dir, '.slopbrick', 'flywheel', 'scans.jsonl'));

    const result = await runScan({
      workspace: dir,
      quiet: true,
      telemetry: true,
    });

    expect(result.report.scoreValidity).toBe('valid');
  });

  it('does not describe an all-cache-hit run as an empty workspace', async () => {
    const dir = createTmpDir();
    dirs.push(dir);
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'entry.ts'), 'export const entry = true;\n');
    const cachePath = join(dir, 'cache.json');
    await runScan({ workspace: dir, incremental: true, cachePath, quiet: true, telemetry: false });

    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const result = await runScan({ workspace: dir, incremental: true, cachePath, quiet: false, telemetry: false });
      expect(result.report.scanAccounting).toMatchObject({ selected: 1, analyzed: 0, incrementalCached: 1 });
      expect(warning.mock.calls.flat().join('\n')).not.toMatch(/No source files matched|Generate a config/);
    } finally {
      warning.mockRestore();
    }
  });

  it('keeps incremental machine output parseable on first and cached runs', async () => {
    const dir = createTmpDir();
    dirs.push(dir);
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'entry.ts'), 'export const entry = true;\n');
    const cachePath = `.incremental-${randomUUID()}.json`;
    const runJson = () => run([
      'scan',
      '--workspace', dir,
      '--incremental',
      '--cache-path', cachePath,
      '--format', 'json',
      '--no-telemetry',
      '--threads', '1',
    ], dir);

    const first = await runJson();
    expect(first.exitCode).toBe(0);
    expect(JSON.parse(first.stdout)).toMatchObject({
      completionStatus: 'complete',
      scanAccounting: { selected: 1, analyzed: 1, incrementalCached: 0 },
    });
    expect(existsSync(join(dir, cachePath))).toBe(true);
    expect(first.stdout).not.toContain('Incremental:');

    const second = await runJson();
    expect(second.exitCode).toBe(1);
    expect(JSON.parse(second.stdout)).toMatchObject({
      completionStatus: 'partial',
      scoreValidity: 'incomplete',
      scanAccounting: { selected: 1, analyzed: 0, incrementalCached: 1 },
    });
    expect(second.stdout).not.toContain('Incremental:');
  });
});
