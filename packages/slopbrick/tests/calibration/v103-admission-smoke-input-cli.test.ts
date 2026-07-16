import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';
import { calibrationAdmissionCanonicalJson } from '@usebrick/core';

const execFileAsync = promisify(execFile);
// Use tsx's ESM loader directly instead of spawning the tsx CLI IPC server per
// child. This keeps the boundary test source-fresh and avoids unnecessary
// process/socket overhead under the RAM-capped release gate.
const script = join(process.cwd(), 'scripts/cal/v103-admission.ts');
const sha = (value: string): string => createHash('sha256').update(value).digest('hex');

async function files(root: string): Promise<ReadonlyMap<string, string>> {
  const result = new Map<string, string>();
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) result.set(relative(root, absolute), createHash('sha256').update(await readFile(absolute)).digest('hex'));
      else result.set(relative(root, absolute), 'non-regular');
    }
  };
  await visit(root);
  return result;
}

function command(root: string, manifest = 'manifest.json'): string[] {
  return ['--import', 'tsx/esm', script, 'admission:smoke-input', '--root', root, '--manifest', manifest];
}

async function run(root: string, manifest = 'manifest.json'): Promise<{ readonly code: number; readonly stdout: string }> {
  try {
    const result = await execFileAsync(process.execPath, command(root, manifest), { cwd: process.cwd(), maxBuffer: 4 * 1024 * 1024 });
    return { code: 0, stdout: result.stdout };
  } catch (error) {
    const failure = error as { readonly code?: number; readonly stdout?: string };
    return { code: Number(failure.code ?? -1), stdout: failure.stdout ?? '' };
  }
}

describe('admission:smoke-input CLI boundary', () => {
  it('exposes a package-local script alias for the built diagnostic command', async () => {
    const packageJson = JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf8')) as {
      readonly scripts?: Readonly<Record<string, string>>;
    };
    expect(packageJson.scripts?.['cal:admission:smoke-input']).toBe(
      'node dist/calibration/v103/admission.cjs admission:smoke-input',
    );
  });

  it('rejects a missing manifest without changing the root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-smoke-input-cli-'));
    try {
      const before = await files(root);
      const result = await run(root);
      expect(result.code).toBe(2);
      const parsed = JSON.parse(result.stdout.trim()) as Record<string, unknown>;
      expect(parsed).toMatchObject({ ok: false, command: 'admission:smoke-input', diagnosticOnly: true, authorityEligible: false, ready: false });
      expect(await files(root)).toEqual(before);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects a manifest path that escapes the explicit root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-smoke-input-cli-'));
    try {
      const before = await files(root);
      const result = await run(root, '../outside-manifest.json');
      expect(result.code).toBe(2);
      expect(JSON.parse(result.stdout.trim())).toMatchObject({ ok: false, command: 'admission:smoke-input' });
      expect(await files(root)).toEqual(before);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('loads only canonical manifests and fails closed before materialization on incomplete authority', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-smoke-input-cli-'));
    try {
      const manifest = {
        version: 'v10.3-admission-smoke-input-manifest-v1',
        outputDirectory: '.',
        transactionId: 'smoke-cli',
        proposalId: 'smoke-cli-proposal',
        evidenceBundleSha256: sha('bundle'),
        registerDeltaPath: 'register-delta.json',
        recordsPath: 'records.jsonl',
        overlapUniversePath: 'overlap-universe.json',
        normalizerRegistryPath: 'normalizers.json',
        overlapUniverseRecordsPath: 'overlap-universe-records.jsonl',
        sources: [],
      };
      await writeFile(join(root, 'manifest.json'), calibrationAdmissionCanonicalJson(manifest), 'utf8');
      const before = await files(root);
      const result = await run(root);
      expect(result.code).toBe(2);
      expect(JSON.parse(result.stdout.trim())).toMatchObject({ ok: false, command: 'admission:smoke-input' });
      expect(await files(root)).toEqual(before);
      await expect(readdir(root)).resolves.toEqual(['manifest.json']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects the manifest option on unrelated admission commands', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-smoke-input-cli-'));
    try {
      const result = await execFileAsync(process.execPath, ['--import', 'tsx/esm', script, 'evidence:verify', '--root', root, '--manifest', 'manifest.json'], { cwd: process.cwd(), maxBuffer: 4 * 1024 * 1024 }).catch((error: unknown) => error as { readonly code: number; readonly stdout: string });
      expect(result.code).toBe(2);
      expect(JSON.parse(result.stdout.trim())).toMatchObject({ ok: false, command: 'evidence:verify' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
