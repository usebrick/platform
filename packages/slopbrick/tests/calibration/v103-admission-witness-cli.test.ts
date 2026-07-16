import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('v10.3 witness CLI boundary', () => {
  it('returns one actionable JSON error for an incomplete publication request without touching the root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-witness-cli-'));
    roots.push(root);
    const script = join(process.cwd(), 'scripts/cal/v103-admission.ts');
    const tsx = join(process.cwd(), 'tests/helpers/tsx-runner.cjs');
    const before = await readdir(root);
    const result = await execFileAsync(tsx, [
      script,
      'witness:publish-search',
      '--root', root,
      '--gate', 'smoke',
      '--kind', 'search_result',
      '--tool-profile', 'admission-census-v1',
      '--invocation-intent', 'a'.repeat(64),
    ], { cwd: process.cwd(), maxBuffer: 1024 * 1024 }).catch((error: unknown) => error as {
      readonly code: number;
      readonly stdout: string;
      readonly stderr: string;
    });

    expect(result.code).toBe(2);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      command: 'witness:publish-search',
      errors: [expect.stringContaining('--bundle')],
    });
    expect(await readdir(root)).toEqual(before);
  });

  it('rejects a recovery command without an explicit selector', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-witness-cli-recovery-'));
    roots.push(root);
    const script = join(process.cwd(), 'scripts/cal/v103-admission.ts');
    const tsx = join(process.cwd(), 'tests/helpers/tsx-runner.cjs');
    const result = await execFileAsync(tsx, [
      script,
      'witness:recover-publication',
      '--root', root,
      '--gate', 'smoke',
      '--kind', 'search_result',
      '--tool-profile', 'admission-census-v1',
      '--invocation-intent', 'a'.repeat(64),
      '--bundle', 'bundle.json',
      '--nested-handoff', 'handoff.json',
      '--named-primary-output-sha256', 'b'.repeat(64),
      '--tool-receipt-id', 'c'.repeat(64),
      '--tool-receipt-sha256', 'd'.repeat(64),
      '--tool-authority-index-sha256', 'e'.repeat(64),
      '--recovery-nonce', 'f'.repeat(64),
      '--acknowledge-no-live-writer',
    ], { cwd: process.cwd(), maxBuffer: 1024 * 1024 }).catch((error: unknown) => error as {
      readonly code: number;
      readonly stdout: string;
      readonly stderr: string;
    });

    expect(result.code).toBe(2);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      command: 'witness:recover-publication',
      errors: [expect.stringContaining('exactly one recovery selector')],
    });
  });
});
