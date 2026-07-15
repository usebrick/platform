import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import {
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionSha256,
  isCalibrationAdmissionToolAuthoritySnapshotV1,
} from '@usebrick/core';

import {
  publishAdmissionToolInvocationIntent,
  publishAdmissionToolReceipt,
  resolveAdmissionToolAuthorityReceipt,
} from '../../src/calibration/v103/admission-publication';

const roots: string[] = [];

function sha(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function makeAuthority() {
  const root = await mkdtemp(join(tmpdir(), 'slopbrick-tool-authority-resolver-'));
  roots.push(root);
  const authorityRoot = join(root, 'review', 'admission', 'tool-authority');
  const intentResult = await publishAdmissionToolInvocationIntent({
    toolAuthorityRoot: authorityRoot,
    profileId: 'admission-static-ledgers-v1',
    action: 'rebuild:pre-witness',
    canonicalArgvSha256: sha('argv'),
    inputSetSha256: sha('inputs'),
    executableBehaviorSha256: sha('node'),
  });
  const receiptResult = await publishAdmissionToolReceipt({
    toolAuthorityRoot: authorityRoot,
    invocationIntentId: intentResult.intent.intentId,
    observedResourceUsage: { heapBytes: 123, workers: 1 },
    exitCode: 0,
    outputSetSha256: sha('static-output'),
  });
  return { root, authorityRoot, intentResult, receiptResult };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('v10.3 indexed tool-authority resolver', () => {
  it('resolves the complete profile, intent, receipt, and snapshot chain', async () => {
    const fixture = await makeAuthority();
    const resolved = await resolveAdmissionToolAuthorityReceipt({
      authorityRoot: fixture.authorityRoot,
      authorityIndexSha256: fixture.receiptResult.toolAuthorityIndexSha256,
      receiptId: fixture.receiptResult.receipt.receiptId,
      receiptSha256: fixture.receiptResult.receiptSha256,
      invocationIntentId: fixture.intentResult.intent.intentId,
      profileId: 'admission-static-ledgers-v1',
      action: 'rebuild:pre-witness',
      outputSetSha256: fixture.receiptResult.receipt.outputSetSha256,
    });

    expect(resolved.profile.profileId).toBe('admission-static-ledgers-v1');
    expect(resolved.invocationIntent.intentId).toBe(fixture.intentResult.intent.intentId);
    expect(resolved.receipt.receiptId).toBe(fixture.receiptResult.receipt.receiptId);
    expect(resolved.snapshot.indexGenerationSha256).toBe(fixture.receiptResult.toolAuthorityIndexSha256);
    expect(resolved.snapshot.invocationIntentIds).toContain(fixture.intentResult.intent.intentId);
    expect(resolved.snapshot.receiptIds).toContain(fixture.receiptResult.receipt.receiptId);
    expect(isCalibrationAdmissionToolAuthoritySnapshotV1(resolved.snapshot)).toBe(true);
  });

  it('requires selectors to agree with indexed receipt identity and action', async () => {
    const fixture = await makeAuthority();
    const base = {
      authorityRoot: fixture.authorityRoot,
      authorityIndexSha256: fixture.receiptResult.toolAuthorityIndexSha256,
      receiptId: fixture.receiptResult.receipt.receiptId,
      receiptSha256: fixture.receiptResult.receiptSha256,
    } as const;
    await expect(resolveAdmissionToolAuthorityReceipt({ ...base, action: 'authority:overlap' }))
      .rejects.toThrow(/action selector/i);
    await expect(resolveAdmissionToolAuthorityReceipt({ ...base, invocationIntentId: sha('other-intent') }))
      .rejects.toThrow(/invocation selector/i);
    await expect(resolveAdmissionToolAuthorityReceipt({ ...base, authorityIndexSha256: sha('stale-index') }))
      .rejects.toThrow(/current index/i);
  });

  it('rejects a snapshot that does not equal indexed membership', async () => {
    const fixture = await makeAuthority();
    const resolved = await resolveAdmissionToolAuthorityReceipt({
      authorityRoot: fixture.authorityRoot,
      authorityIndexSha256: fixture.receiptResult.toolAuthorityIndexSha256,
      receiptId: fixture.receiptResult.receipt.receiptId,
      receiptSha256: fixture.receiptResult.receiptSha256,
    });
    const altered = {
      ...resolved.snapshot,
      receiptIds: [],
      snapshotSha256: calibrationAdmissionSha256({
        version: resolved.snapshot.version,
        indexGenerationSha256: resolved.snapshot.indexGenerationSha256,
        profileIds: resolved.snapshot.profileIds,
        invocationIntentIds: resolved.snapshot.invocationIntentIds,
        receiptIds: [],
      }),
    };
    expect(calibrationAdmissionCanonicalJson(altered)).not.toBe(calibrationAdmissionCanonicalJson(resolved.snapshot));
    await expect(resolveAdmissionToolAuthorityReceipt({
      authorityRoot: fixture.authorityRoot,
      authorityIndexSha256: fixture.receiptResult.toolAuthorityIndexSha256,
      receiptId: fixture.receiptResult.receipt.receiptId,
      receiptSha256: fixture.receiptResult.receiptSha256,
      expectedSnapshot: altered,
    })).rejects.toThrow(/snapshot/i);
  });

  it('fails closed when an indexed receipt object changes', async () => {
    const fixture = await makeAuthority();
    const index = JSON.parse(await readFile(join(fixture.authorityRoot, 'index.json'), 'utf8')) as {
      receipts: readonly { receiptId: string; relativePath: string; sha256: string }[];
    };
    const reference = index.receipts.find((entry) => entry.receiptId === fixture.receiptResult.receipt.receiptId);
    if (!reference) throw new Error('test receipt reference missing');
    await writeFile(join(fixture.authorityRoot, reference.relativePath), '{}');
    await expect(resolveAdmissionToolAuthorityReceipt({
      authorityRoot: fixture.authorityRoot,
      authorityIndexSha256: fixture.receiptResult.toolAuthorityIndexSha256,
      receiptId: fixture.receiptResult.receipt.receiptId,
      receiptSha256: fixture.receiptResult.receiptSha256,
    })).rejects.toThrow(/changed|invalid/i);
  });
});
