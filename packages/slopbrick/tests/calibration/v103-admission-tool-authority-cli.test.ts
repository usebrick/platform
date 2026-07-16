import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { calibrationAdmissionCanonicalJson } from '@usebrick/core';

import {
  publishAdmissionToolInvocationIntent,
  publishAdmissionToolReceipt,
} from '../../src/calibration/v103/admission-publication';

const execFileAsync = promisify(execFile);
const roots: string[] = [];

function sha(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('v10.3 tool-authority resolver CLI', () => {
  it('returns one read-only JSON proof for an indexed receipt chain', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-tool-authority-cli-'));
    roots.push(root);
    const authorityRoot = join(root, 'review', 'admission', 'tool-authority');
    const intent = await publishAdmissionToolInvocationIntent({
      toolAuthorityRoot: authorityRoot,
      profileId: 'admission-static-ledgers-v1',
      action: 'rebuild:pre-witness',
      canonicalArgvSha256: sha('argv'),
      inputSetSha256: sha('inputs'),
      executableBehaviorSha256: sha('node'),
    });
    const receipt = await publishAdmissionToolReceipt({
      toolAuthorityRoot: authorityRoot,
      invocationIntentId: intent.intent.intentId,
      observedResourceUsage: { heapBytes: 1, workers: 1 },
      exitCode: 0,
      outputSetSha256: sha('output'),
    });
    const script = join(process.cwd(), 'scripts/cal/v103-admission.ts');
    const tsx = join(process.cwd(), 'tests/helpers/tsx-runner.cjs');
    const before = await readFile(join(authorityRoot, 'index.json'));
    const run = await execFileAsync(tsx, [
      script,
      'tool-authority:resolve',
      '--root', root,
      '--tool-profile', 'admission-static-ledgers-v1',
      '--action', 'rebuild:pre-witness',
      '--invocation-intent', intent.intent.intentId,
      '--tool-receipt-id', receipt.receipt.receiptId,
      '--tool-receipt-sha256', receipt.receiptSha256,
      '--tool-authority-index-sha256', receipt.toolAuthorityIndexSha256,
    ], { cwd: process.cwd(), maxBuffer: 1024 * 1024 });
    const result = JSON.parse(run.stdout.trim()) as { ok: boolean; snapshot: { receiptIds: readonly string[] } };
    expect(result.ok).toBe(true);
    expect(result.snapshot.receiptIds).toContain(receipt.receipt.receiptId);
    expect(await readFile(join(authorityRoot, 'index.json'))).toEqual(before);
  });

  it('accepts an exact snapshot file and rejects a forged one', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-tool-authority-cli-snapshot-'));
    roots.push(root);
    const authorityRoot = join(root, 'review', 'admission', 'tool-authority');
    const intent = await publishAdmissionToolInvocationIntent({
      toolAuthorityRoot: authorityRoot,
      profileId: 'admission-static-ledgers-v1',
      action: 'rebuild:pre-witness',
      canonicalArgvSha256: sha('argv'),
      inputSetSha256: sha('inputs'),
      executableBehaviorSha256: sha('node'),
    });
    const receipt = await publishAdmissionToolReceipt({
      toolAuthorityRoot: authorityRoot,
      invocationIntentId: intent.intent.intentId,
      observedResourceUsage: { heapBytes: 1, workers: 1 },
      exitCode: 0,
      outputSetSha256: sha('output'),
    });
    const resolveArgs = [
      join(process.cwd(), 'scripts/cal/v103-admission.ts'),
      'tool-authority:resolve',
      '--root', root,
      '--tool-profile', 'admission-static-ledgers-v1',
      '--action', 'rebuild:pre-witness',
      '--invocation-intent', intent.intent.intentId,
      '--tool-receipt-id', receipt.receipt.receiptId,
      '--tool-receipt-sha256', receipt.receiptSha256,
      '--tool-authority-index-sha256', receipt.toolAuthorityIndexSha256,
    ];
    const tsx = join(process.cwd(), 'tests/helpers/tsx-runner.cjs');
    const first = await execFileAsync(tsx, resolveArgs, { cwd: process.cwd(), maxBuffer: 1024 * 1024 });
    const snapshot = (JSON.parse(first.stdout) as { snapshot: unknown }).snapshot;
    const snapshotPath = join(root, 'snapshot.json');
    await writeFile(snapshotPath, calibrationAdmissionCanonicalJson(snapshot));
    await expect(execFileAsync(tsx, [...resolveArgs, '--tool-snapshot', 'snapshot.json'], { cwd: process.cwd(), maxBuffer: 1024 * 1024 })).resolves.toMatchObject({});
    await writeFile(snapshotPath, '{}');
    const failure = await execFileAsync(tsx, [...resolveArgs, '--tool-snapshot', 'snapshot.json'], { cwd: process.cwd(), maxBuffer: 1024 * 1024 }).catch((error: unknown) => error as { readonly code: number; readonly stdout: string });
    expect(failure.code).toBe(2);
    expect(JSON.parse(failure.stdout)).toMatchObject({ ok: false });
  });
});
