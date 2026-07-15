// v0.5.2: integration test for --watch mode.
//
// Spawns `slopbrick scan --watch` as a subprocess, writes files to
// the watched directory after a delay, and verifies that the watcher
// debounces bursts into a single re-scan.
//
// This test is opt-in (skipped if the bin isn't built).

import { describe, expect, it } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const BIN = resolve(process.cwd(), 'bin', 'slopbrick.js');

function skipIfNoBin(): boolean {
  return !existsSync(BIN);
}

// Keep the opt-in suite genuinely skipped when the package bin has not been
// built. The per-test guard below is retained for defensive clarity, but a
// plain early return would otherwise report green tests without exercising
// the subprocess contract.
const watchSuite = existsSync(BIN) ? describe : describe.skip;

function createTmp(): string {
  return mkdtempSync(join(tmpdir(), 'slopbrick-watch-'));
}

async function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(`condition not met within ${timeoutMs}ms`);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
}

type WatchInvocation = 'flag' | 'subcommand';

interface WatchHandle {
  proc: ChildProcess;
  stdout(): string;
  stderr(): string;
  output(): string;
  closed: Promise<number | null>;
}

function startWatch(
  cwd: string,
  invocation: WatchInvocation,
  extraArgs: readonly string[] = [],
): WatchHandle {
  const args = invocation === 'flag'
    ? [BIN, 'scan', '--watch', '--workspace', cwd, '--no-telemetry', ...extraArgs]
    : [BIN, 'watch', '--workspace', cwd, ...extraArgs];
  const proc = spawn('node', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  proc.stdout?.on('data', (chunk) => (stdout += chunk.toString()));
  proc.stderr?.on('data', (chunk) => (stderr += chunk.toString()));
  const closed = new Promise<number | null>((resolveClose, reject) => {
    proc.once('error', reject);
    proc.once('close', (code) => resolveClose(code));
  });
  return {
    proc,
    stdout: () => stdout,
    stderr: () => stderr,
    output: () => `${stdout}${stderr}`,
    closed,
  };
}

async function stopWatch(handle: WatchHandle): Promise<number | null> {
  if (handle.proc.exitCode === null) handle.proc.kill('SIGINT');
  return new Promise<number | null>((resolveClose, reject) => {
    const timeout = setTimeout(() => reject(new Error('watch process ignored SIGINT')), 5_000);
    void handle.closed.then((code) => {
      clearTimeout(timeout);
      resolveClose(code);
    }, reject);
  });
}

async function waitForWatchReady(handle: WatchHandle, quiet = false): Promise<void> {
  if (quiet) {
    // Quiet mode intentionally has no stdout readiness marker. Match the
    // established cold-start coverage window so a loaded CI machine cannot
    // miss the first source event merely because watcher installation lagged.
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_500));
  } else {
    await waitUntil(
      () => handle.output().includes('Watching for changes...') || handle.proc.exitCode !== null,
      5_000,
    );
  }
  if (handle.proc.exitCode !== null) {
    throw new Error(`watch process exited before installing its watcher:\n${handle.output()}`);
  }
}

function readHealth(cwd: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(readFileSync(join(cwd, '.slopbrick', 'health.json'), 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

async function waitForFileContent(
  path: string,
  predicate: (content: string) => boolean,
): Promise<string> {
  let latest = '';
  await waitUntil(() => {
    try {
      latest = readFileSync(path, 'utf8');
      return predicate(latest);
    } catch {
      return false;
    }
  }, 5_000);
  return latest;
}

async function waitForOutputContent(
  handle: WatchHandle,
  predicate: (content: string) => boolean,
): Promise<void> {
  await waitUntil(() => predicate(handle.output()), 5_000);
}

async function waitForValidHealth(cwd: string, requested: number): Promise<void> {
  await waitUntil(() => {
    const health = readHealth(cwd);
    return health?.scoreValidity === 'valid' &&
      health.requested === requested && health.analyzed === requested;
  }, 8_000);
}

async function waitForPartialHealth(
  cwd: string,
  requested: number,
  analyzed: number,
  failed: number,
): Promise<void> {
  await waitUntil(() => {
    const health = readHealth(cwd);
    return health?.scoreValidity === 'incomplete' &&
      health.completionStatus === 'partial' &&
      health.requested === requested &&
      health.analyzed === analyzed &&
      health.failed === failed;
  }, 8_000);
}

function watchNoticeCount(output: string): number {
  return output.split('Watching for changes...').length - 1;
}

function expectNoPartialScoreLeak(output: string): void {
  // Match only top-level JSON headline fields. Diagnostic breakdowns may
  // legitimately retain numeric compatibility values at deeper indentation.
  expect(output).not.toMatch(/^  "aiSlopScore":\s*(?:-?\d|null)/m);
  expect(output).not.toMatch(/^  "engineeringHygiene":\s*(?:-?\d|null)/m);
  expect(output).not.toMatch(/^  "security":\s*(?:-?\d|null)/m);
  expect(output).not.toMatch(/^  "repositoryHealth":\s*(?:-?\d|null)/m);
  expect(output).not.toMatch(/^  "compositeScore":\s*(?:-?\d|null)/m);
  expect(output).not.toMatch(/AI Slop Score:\s*-?\d/);
  expect(output).not.toMatch(/Engineering Hygiene:\s*-?\d/);
  expect(output).not.toMatch(/Security:\s*-?\d/);
  expect(output).not.toMatch(/Repository Health:\s*-?\d/);
  expect(output).not.toMatch(/Composite Score:\s*-?\d/);
  expect(output).not.toMatch(/Threshold \(CI gate\)|✓ Clean/);
}

async function assertStableForSeveralDebounces(
  handle: WatchHandle,
  cwd: string,
  expectedNotices: number | undefined,
): Promise<void> {
  // health.json is persisted inside runScan before the renderer and watcher
  // notice finish. Wait for the complete externally-visible cycle, then prove
  // it remains unchanged for several debounce windows.
  if (expectedNotices !== undefined) {
    await waitUntil(() => watchNoticeCount(handle.output()) >= expectedNotices, 5_000);
  }
  const healthPath = join(cwd, '.slopbrick', 'health.json');
  const beforeContent = readFileSync(healthPath, 'utf8');
  const beforeMtime = statSync(healthPath).mtimeMs;
  const beforeOutput = handle.output();
  await new Promise((resolveWait) => setTimeout(resolveWait, 650));
  expect(readFileSync(healthPath, 'utf8')).toBe(beforeContent);
  expect(statSync(healthPath).mtimeMs).toBe(beforeMtime);
  expect(handle.output()).toBe(beforeOutput);
  if (expectedNotices !== undefined) {
    expect(watchNoticeCount(handle.output())).toBe(expectedNotices);
  }
}

watchSuite('slopbrick --watch (v0.5.2)', () => {
  const invocations = [
    ['global --watch flag', 'flag'],
    ['watch subcommand', 'subcommand'],
  ] as const;

  it.each(invocations)(
    'keeps the %s bounded across add, edit, delete, and re-add',
    async (_label, invocation) => {
      if (skipIfNoBin()) return;
      const dir = createTmp();
      const handle = startWatch(dir, invocation);
      try {
        await waitForWatchReady(handle);
        const initialOutput = handle.output();
        expect(initialOutput).toContain('NO FILES ANALYSED — scores are not applicable for gating.');
        expect(initialOutput).not.toMatch(
          /AI Slop Score:|Repository Health:|Threshold \(CI gate\)|✓ Clean|Memory persisted/,
        );
        expect(existsSync(join(dir, '.slopbrick'))).toBe(false);

        const beforeNoise = handle.output();
        mkdirSync(join(dir, 'dist'), { recursive: true });
        writeFileSync(join(dir, 'outside-include.ts'), 'export const ignored = true;\n');
        writeFileSync(join(dir, 'dist', 'excluded.ts'), 'export const excluded = true;\n');
        await new Promise((resolveWait) => setTimeout(resolveWait, 650));
        expect(handle.output()).toBe(beforeNoise);
        expect(watchNoticeCount(handle.output())).toBe(1);
        expect(existsSync(join(dir, '.slopbrick'))).toBe(false);

        mkdirSync(join(dir, 'src'), { recursive: true });
        const firstSource = join(dir, 'src', 'added.ts');
        writeFileSync(firstSource, 'export const added = 1;\n');
        await waitForValidHealth(dir, 1);
        await assertStableForSeveralDebounces(handle, dir, 2);
        expect(handle.output().match(/Memory persisted to \.slopbrick\//g)).toHaveLength(1);

        writeFileSync(firstSource, 'export const added = 2;\n');
        await waitUntil(() => watchNoticeCount(handle.output()) >= 3, 5_000);
        await assertStableForSeveralDebounces(handle, dir, 3);

        rmSync(firstSource);
        await waitUntil(() => watchNoticeCount(handle.output()) >= 4, 5_000);
        await assertStableForSeveralDebounces(handle, dir, 4);

        writeFileSync(join(dir, 'src', 'replacement.ts'), 'export const replacement = 1;\n');
        await waitForValidHealth(dir, 1);
        await waitUntil(() => watchNoticeCount(handle.output()) >= 5, 5_000);
        await assertStableForSeveralDebounces(handle, dir, 5);
        // The add, edit, and re-add are three complete valid scans; the
        // intervening empty deletion scan is invalid and must not persist.
        expect(handle.output().match(/Memory persisted to \.slopbrick\//g)).toHaveLength(3);

        expect(await stopWatch(handle)).toBe(0);
      } finally {
        if (handle.proc.exitCode === null) handle.proc.kill('SIGKILL');
        rmSync(dir, { recursive: true, force: true });
      }
    },
    30_000,
  );

  it.each(invocations)(
    'coalesces a burst of included source writes for the %s',
    async (_label, invocation) => {
      if (skipIfNoBin()) return;
      const dir = createTmp();
      const handle = startWatch(dir, invocation);
      try {
        await waitForWatchReady(handle);
        mkdirSync(join(dir, 'src'));
        for (const name of ['a.ts', 'b.ts', 'c.ts']) {
          writeFileSync(join(dir, 'src', name), `export const ${name[0]} = true;\n`);
        }

        await waitForValidHealth(dir, 3);
        await assertStableForSeveralDebounces(handle, dir, 2);
        expect(handle.output().match(/Memory persisted to \.slopbrick\//g)).toHaveLength(1);

        expect(await stopWatch(handle)).toBe(0);
      } finally {
        if (handle.proc.exitCode === null) handle.proc.kill('SIGKILL');
        rmSync(dir, { recursive: true, force: true });
      }
    },
    15_000,
  );

  const heatmapVariants: ReadonlyArray<{
    name: string;
    args: (dir: string) => string[];
    kind: 'human' | 'json' | 'html' | 'sarif' | 'json-file' | 'html-file' | 'quiet';
    quiet?: boolean;
  }> = [
    { name: 'human', args: () => ['--heatmap'], kind: 'human' },
    { name: 'JSON', args: () => ['--heatmap', '--format', 'json'], kind: 'json' },
    { name: 'HTML', args: () => ['--heatmap', '--format', 'html'], kind: 'html' },
    { name: 'SARIF', args: () => ['--heatmap', '--format', 'sarif'], kind: 'sarif' },
    { name: 'JSON file', args: (dir) => ['--heatmap', '--json', join(dir, 'watch.json')], kind: 'json-file' },
    { name: 'HTML file', args: (dir) => ['--heatmap', '--html', join(dir, 'watch.html')], kind: 'html-file' },
    { name: 'quiet', args: () => ['--heatmap', '--quiet'], kind: 'quiet', quiet: true },
  ];

  for (const [invocationLabel, invocation] of invocations) {
    for (const variant of heatmapVariants) {
      it(`keeps empty ${invocationLabel} heatmap ${variant.name} invalid and bounded`, async () => {
        if (skipIfNoBin()) return;
        const dir = createTmp();
        const handle = startWatch(dir, invocation, variant.args(dir));
        try {
          await waitForWatchReady(handle, variant.quiet);
          const initialOutput = handle.output();
          expect(existsSync(join(dir, '.slopbrick'))).toBe(false);

          if (variant.kind === 'quiet') {
            expect(initialOutput).toBe('');
          } else if (variant.kind === 'json-file') {
            const json = JSON.parse(readFileSync(join(dir, 'watch.json'), 'utf8')) as Record<string, unknown>;
            expect(json).toMatchObject({ scoreValidity: 'not-applicable', completionStatus: 'empty' });
            expect(json).not.toHaveProperty('aiSlopScore');
          } else if (variant.kind === 'html-file') {
            expect(readFileSync(join(dir, 'watch.html'), 'utf8')).toContain(
              'data-score-validity="not-applicable"',
            );
          } else if (variant.kind === 'json') {
            expect(initialOutput).toContain('"scoreValidity": "not-applicable"');
            expect(initialOutput).not.toContain('"aiSlopScore"');
          } else if (variant.kind === 'html') {
            expect(initialOutput).toContain('data-score-validity="not-applicable"');
          } else if (variant.kind === 'sarif') {
            expect(initialOutput).toContain('"scoreValidity": "not-applicable"');
            expect(initialOutput).not.toContain('"scores"');
          } else {
            expect(initialOutput).toContain('scores are not applicable');
          }
          expect(initialOutput).not.toMatch(/ROI\s+Score/);

          mkdirSync(join(dir, 'src'), { recursive: true });
          writeFileSync(join(dir, 'src', 'added.ts'), 'export const added = 1;\n');
          await waitForValidHealth(dir, 1);
          await assertStableForSeveralDebounces(
            handle,
            dir,
            variant.quiet ? undefined : 2,
          );
          if (variant.quiet) expect(handle.output()).toBe('');
          expect(await stopWatch(handle)).toBe(0);
        } finally {
          if (handle.proc.exitCode === null) handle.proc.kill('SIGKILL');
          rmSync(dir, { recursive: true, force: true });
        }
      }, 20_000);
    }
  }

  for (const [invocationLabel, invocation] of invocations) {
    for (const variant of heatmapVariants) {
      it(`keeps partial ${invocationLabel} heatmap ${variant.name} score-free and bounded`, async () => {
        if (skipIfNoBin()) return;
        const dir = createTmp();
        const handle = startWatch(dir, invocation, variant.args(dir));
        try {
          await waitForWatchReady(handle, variant.quiet);
          mkdirSync(join(dir, 'src'), { recursive: true });
          writeFileSync(join(dir, 'src', 'valid.ts'), 'export const value = 1;\n');
          writeFileSync(join(dir, 'src', 'broken.ts'), 'export const = ;\n');
          await waitForPartialHealth(dir, 2, 1, 1);

          const health = readHealth(dir);
          expect(health).toMatchObject({
            completionStatus: 'partial',
            scoreValidity: 'incomplete',
            requested: 2,
            analyzed: 1,
            failed: 1,
          });

          if (variant.kind === 'quiet') {
            expect(handle.output()).toBe('');
          } else if (variant.kind === 'json-file') {
            const json = JSON.parse(
              await waitForFileContent(
                join(dir, 'watch.json'),
                (content) => content.includes('"scoreValidity": "incomplete"'),
              ),
            ) as Record<string, unknown>;
            expect(json).toMatchObject({ completionStatus: 'partial', scoreValidity: 'incomplete' });
            expect(json).not.toHaveProperty('aiSlopScore');
            expect(json).not.toHaveProperty('engineeringHygiene');
            expect(json).not.toHaveProperty('security');
            expect(json).not.toHaveProperty('repositoryHealth');
            expect(json).not.toHaveProperty('compositeScore');
            expectNoPartialScoreLeak(handle.stdout());
            expectNoPartialScoreLeak(handle.stderr());
          } else if (variant.kind === 'html-file') {
            const html = await waitForFileContent(
              join(dir, 'watch.html'),
              (content) => content.includes('data-score-validity="incomplete"'),
            );
            expect(html).toContain('data-score-validity="incomplete"');
            expect(html).not.toContain('AI Slop Score:');
            expectNoPartialScoreLeak(handle.stdout());
            expectNoPartialScoreLeak(handle.stderr());
          } else if (variant.kind === 'json') {
            await waitForOutputContent(handle, (content) => content.includes('"scoreValidity": "incomplete"'));
            expect(handle.output()).toContain('"scoreValidity": "incomplete"');
            expectNoPartialScoreLeak(handle.output());
          } else if (variant.kind === 'html') {
            await waitForOutputContent(handle, (content) => content.includes('data-score-validity="incomplete"'));
            expect(handle.output()).toContain('data-score-validity="incomplete"');
            expectNoPartialScoreLeak(handle.output());
          } else if (variant.kind === 'sarif') {
            await waitForOutputContent(handle, (content) => content.includes('"scoreValidity": "incomplete"'));
            expect(handle.output()).toContain('"scoreValidity": "incomplete"');
            expect(handle.output()).not.toContain('"scores"');
          } else {
            await waitForOutputContent(handle, (content) => content.includes('INCOMPLETE SCAN'));
            expect(handle.output()).toContain('INCOMPLETE SCAN');
          }

          expect(handle.output()).not.toMatch(/Threshold \(CI gate\)|✓ Clean/);
          await new Promise((resolveWait) => setTimeout(resolveWait, 650));
          expect(readHealth(dir)).toMatchObject({ scoreValidity: 'incomplete', failed: 1 });
          expect(await stopWatch(handle)).toBe(0);
        } finally {
          if (handle.proc.exitCode === null) handle.proc.kill('SIGKILL');
          rmSync(dir, { recursive: true, force: true });
        }
      }, 20_000);
    }
  }

  const outputFileVariants = [
    { name: 'JSON', flag: '--json', filename: 'watch-output.json', validMarker: '"scoreValidity": "valid"' },
    { name: 'HTML', flag: '--html', filename: 'watch-output.html', validMarker: 'AI Slop Score' },
  ] as const;

  for (const [invocationLabel, invocation] of invocations) {
    for (const variant of outputFileVariants) {
      it(`ignores ${variant.name} output-file self-events for ${invocationLabel}`, async () => {
        if (skipIfNoBin()) return;
        const dir = createTmp();
        const outputPath = join(dir, variant.filename);
        const handle = startWatch(dir, invocation, [variant.flag, outputPath]);
        try {
          await waitForWatchReady(handle);
          expect(readFileSync(outputPath, 'utf8')).toContain('not-applicable');

          mkdirSync(join(dir, 'src'), { recursive: true });
          const sourcePath = join(dir, 'src', 'watched.ts');
          writeFileSync(sourcePath, 'export const watched = 1;\n');
          await waitForValidHealth(dir, 1);
          await waitUntil(
            () => readFileSync(outputPath, 'utf8').includes(variant.validMarker),
            5_000,
          );
          await assertStableForSeveralDebounces(handle, dir, 2);

          writeFileSync(sourcePath, 'export const watched = 2;\n');
          await waitUntil(() => watchNoticeCount(handle.output()) >= 3, 5_000);
          await assertStableForSeveralDebounces(handle, dir, 3);

          expect(await stopWatch(handle)).toBe(0);
        } finally {
          if (handle.proc.exitCode === null) handle.proc.kill('SIGKILL');
          rmSync(dir, { recursive: true, force: true });
        }
      }, 20_000);
    }
  }

  it('keeps a direct explicit file live outside configured include globs', async () => {
    if (skipIfNoBin()) return;
    const dir = createTmp();
    const explicitFile = join(dir, 'explicit.ts');
    writeFileSync(explicitFile, 'export const explicit = 1;\n');
    const handle = startWatch(dir, 'flag', [explicitFile]);
    try {
      await waitForWatchReady(handle);
      await waitForValidHealth(dir, 1);
      await assertStableForSeveralDebounces(handle, dir, 1);

      writeFileSync(explicitFile, 'export const explicit = 2;\n');
      await assertStableForSeveralDebounces(handle, dir, 2);

      expect(await stopWatch(handle)).toBe(0);
    } finally {
      if (handle.proc.exitCode === null) handle.proc.kill('SIGKILL');
      rmSync(dir, { recursive: true, force: true });
    }
  }, 15_000);

  it('keeps descendants of an explicit directory live', async () => {
    if (skipIfNoBin()) return;
    const dir = createTmp();
    const sourceDir = join(dir, 'src');
    mkdirSync(sourceDir);
    const handle = startWatch(dir, 'flag', [sourceDir]);
    try {
      await waitForWatchReady(handle);
      expect(existsSync(join(dir, '.slopbrick'))).toBe(false);

      const nestedDir = join(sourceDir, 'nested');
      mkdirSync(nestedDir);
      writeFileSync(join(nestedDir, 'added.ts'), 'export const nested = true;\n');
      await waitForValidHealth(dir, 1);
      await assertStableForSeveralDebounces(handle, dir, 2);

      expect(await stopWatch(handle)).toBe(0);
    } finally {
      if (handle.proc.exitCode === null) handle.proc.kill('SIGKILL');
      rmSync(dir, { recursive: true, force: true });
    }
  }, 15_000);

  it('rescans staged scope when a linked worktree index changes', async () => {
    if (skipIfNoBin()) return;
    const repo = createTmp();
    const worktree = createTmp();
    rmSync(worktree, { recursive: true, force: true });
    let handle: WatchHandle | undefined;
    try {
      execFileSync('git', ['init', '-b', 'main'], { cwd: repo, stdio: 'ignore' });
      execFileSync('git', ['config', 'user.email', 'watch@example.com'], { cwd: repo });
      execFileSync('git', ['config', 'user.name', 'Watch Test'], { cwd: repo });
      mkdirSync(join(repo, 'src'));
      writeFileSync(join(repo, 'src', 'tracked.ts'), 'export const tracked = 1;\n');
      execFileSync('git', ['add', '.'], { cwd: repo });
      execFileSync('git', ['commit', '-m', 'initial'], { cwd: repo, stdio: 'ignore' });
      execFileSync('git', ['worktree', 'add', '-b', 'watch-test', worktree], {
        cwd: repo,
        stdio: 'ignore',
      });

      handle = startWatch(worktree, 'flag', ['--staged']);
      await waitForWatchReady(handle);
      expect(existsSync(join(worktree, '.slopbrick'))).toBe(false);
      const beforeIndexOutput = handle.output();
      await new Promise((resolveWait) => setTimeout(resolveWait, 650));
      expect(handle.output()).toBe(beforeIndexOutput);
      expect(existsSync(join(worktree, '.slopbrick'))).toBe(false);
      const noticesBeforeIndexChange = watchNoticeCount(handle.output());

      // Update only the linked worktree's index. The source file itself is
      // untouched, so the workspace watcher cannot accidentally satisfy this
      // regression; only Git's canonical index path can trigger the rescan.
      const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], {
        cwd: worktree,
        encoding: 'utf8',
        input: 'export const tracked = 2;\n',
      }).trim();
      execFileSync(
        'git',
        ['update-index', '--cacheinfo', '100644', blob, 'src/tracked.ts'],
        { cwd: worktree },
      );
      const noticesAfterIndexChange = noticesBeforeIndexChange + 1;
      await waitUntil(
        () => watchNoticeCount(handle.output()) >= noticesAfterIndexChange ||
          handle.proc.exitCode !== null || handle.proc.signalCode !== null,
        8_000,
      );
      expect(handle.proc.exitCode).toBeNull();
      expect(handle.proc.signalCode).toBeNull();
      expect(handle.output()).toContain('Scanned 1 file,');
      expect(watchNoticeCount(handle.output())).toBe(noticesAfterIndexChange);
      expect(existsSync(join(worktree, '.slopbrick'))).toBe(false);
      expect(handle.output()).not.toContain('Memory persisted to .slopbrick/');

      const afterIndexOutput = handle.output();
      await new Promise((resolveWait) => setTimeout(resolveWait, 650));
      expect(handle.output()).toBe(afterIndexOutput);
      expect(watchNoticeCount(handle.output())).toBe(noticesAfterIndexChange);
      expect(existsSync(join(worktree, '.slopbrick'))).toBe(false);

      expect(await stopWatch(handle)).toBe(0);
    } finally {
      if (handle?.proc.exitCode === null) handle.proc.kill('SIGKILL');
      try {
        execFileSync('git', ['worktree', 'remove', '--force', worktree], {
          cwd: repo,
          stdio: 'ignore',
        });
      } catch {
        // The test may fail before the worktree is registered.
      }
      rmSync(worktree, { recursive: true, force: true });
      rmSync(repo, { recursive: true, force: true });
    }
  }, 20_000);

  it('discloses that an inherited parent config is outside the watch scope', async () => {
    if (skipIfNoBin()) return;
    const parent = createTmp();
    const dir = join(parent, 'project');
    mkdirSync(dir);
    writeFileSync(join(parent, 'slopbrick.config.mjs'), 'export default {};\n');
    const handle = startWatch(dir, 'flag');
    try {
      await waitForWatchReady(handle);
      expect(handle.stderr()).toContain(
        `Watch limitation: config outside the workspace is not observed (${join(parent, 'slopbrick.config.mjs')}); restart watch after editing it.`,
      );
      expect(existsSync(join(dir, '.slopbrick'))).toBe(false);
      expect(await stopWatch(handle)).toBe(0);
    } finally {
      if (handle.proc.exitCode === null) handle.proc.kill('SIGKILL');
      rmSync(parent, { recursive: true, force: true });
    }
  }, 10_000);

  it('discloses the correctness-first full-rescan behavior for --incremental', async () => {
    if (skipIfNoBin()) return;
    const dir = createTmp();
    const handle = startWatch(dir, 'flag', ['--incremental']);
    try {
      await waitForWatchReady(handle);
      expect(handle.stderr()).toContain(
        'Watch mode ignores --incremental so each change produces a complete repository report; rapid events are still debounced.',
      );
      expect(await stopWatch(handle)).toBe(0);
    } finally {
      if (handle.proc.exitCode === null) handle.proc.kill('SIGKILL');
      rmSync(dir, { recursive: true, force: true });
    }
  }, 10_000);

  for (const [invocationLabel, invocation] of invocations) {
    for (const quiet of [false, true]) {
      it(`rejects invalid format before ${invocationLabel} starts (quiet=${quiet})`, async () => {
        if (skipIfNoBin()) return;
        const dir = createTmp();
        const handle = startWatch(
          dir,
          invocation,
          ['--format', 'bogus', ...(quiet ? ['--quiet'] : [])],
        );
        try {
          expect(await handle.closed).toBe(2);
          expect(handle.stdout()).toBe('');
          expect(handle.stderr().trim()).toBe(
            'Unknown --format value: bogus. Valid: pretty, json, sarif, html.',
          );
          expect(existsSync(join(dir, '.slopbrick'))).toBe(false);
        } finally {
          if (handle.proc.exitCode === null) handle.proc.kill('SIGKILL');
          rmSync(dir, { recursive: true, force: true });
        }
      }, 10_000);
    }
  }
});
