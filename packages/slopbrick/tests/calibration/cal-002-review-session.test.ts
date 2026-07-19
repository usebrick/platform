import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  CAL002_LOCKED_RULE_CATALOG_SHA256,
  canonicalArtifact,
  validateCAL002ReviewReceipt,
} from '../../src/calibration/cal-002/contracts';
import {
  completeCAL002Review,
  nextCAL002ReviewId,
  recordCAL002Review,
  startCAL002Review,
} from '../../src/calibration/cal-002/review-session';
import {
  readCanonicalArtifact,
  readVerifiedSource,
  writeImmutableReceipt,
  writeReviewState,
} from '../../src/calibration/cal-002/artifact-io';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const COMMIT = 'c'.repeat(40);
const roots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cal-002-review-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('CAL-002 resumable review state', () => {
  it('resumes at the first unlabeled review and makes duplicate labels idempotent', () => {
    const started = startCAL002Review({
      assignmentSha256: HASH_A,
      blindedBatchSha256: HASH_B,
      reviewIds: ['review-z', 'review-a', 'review-m'],
    });
    expect(started.catalogSha256).toBe(CAL002_LOCKED_RULE_CATALOG_SHA256);
    expect(nextCAL002ReviewId(started)).toBe('review-z');

    const once = recordCAL002Review(started, 'review-z', 'not-useful');
    const twice = recordCAL002Review(once, 'review-z', 'not-useful');
    expect(twice).toEqual(once);
    expect(nextCAL002ReviewId(twice)).toBe('review-a');
    expect(started.rows).toEqual([]);
  });

  it('rejects conflicting relabels, unknown labels, and unknown review IDs', () => {
    const started = startCAL002Review({
      assignmentSha256: HASH_A,
      blindedBatchSha256: HASH_B,
      reviewIds: ['review-a'],
    });
    const labeled = recordCAL002Review(started, 'review-a', 'not-useful');
    expect(() => recordCAL002Review(labeled, 'review-a', 'actionable-defect')).toThrow(/conflict/i);
    expect(() => recordCAL002Review(started, 'missing', 'not-useful')).toThrow(/unknown.*review/i);
    expect(() => recordCAL002Review(started, 'review-a', 'free-form' as never)).toThrow(/unknown label/i);
  });

  it('completes to a sorted, path-free, authority-bound immutable receipt', () => {
    const started = startCAL002Review({
      assignmentSha256: HASH_A,
      blindedBatchSha256: HASH_B,
      reviewIds: ['review-z', 'review-a'],
    });
    const labeled = recordCAL002Review(
      recordCAL002Review(started, 'review-z', 'useful-no-safe-fix'),
      'review-a',
      'actionable-defect',
    );
    const result = completeCAL002Review({
      state: labeled,
      reviewerAuthority: 'repository-owner',
      implementationCommitSha: COMMIT,
    });

    expect(result.receipt.rows).toEqual([
      { reviewId: 'review-a', label: 'actionable-defect' },
      { reviewId: 'review-z', label: 'useful-no-safe-fix' },
    ]);
    expect(result.receipt).toMatchObject({
      protocolVersion: 'CAL-002-v1',
      catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
      assignmentSha256: HASH_A,
      blindedBatchSha256: HASH_B,
      stateSha256: result.stateSha256,
      reviewImplementationCommitSha: COMMIT,
      reviewerAuthority: 'repository-owner',
      admitted: false,
    });
    expect(validateCAL002ReviewReceipt(result.receipt)).toEqual({ ok: true, errors: [] });
    expect(result.receiptJson).toBe(canonicalArtifact(result.receipt).json);
    expect(result.receiptSha256).toBe(canonicalArtifact(result.receipt).sha256);
    expect(JSON.stringify(result)).not.toContain('const secret');
    expect(JSON.stringify(result.receipt)).not.toMatch(/(?:source|path)/i);
    expect(result.state.status).toBe('completed');
    expect(() => recordCAL002Review(result.state, 'review-a', 'actionable-defect')).toThrow(/completed/i);
    expect(() => completeCAL002Review({
      state: result.state,
      reviewerAuthority: 'repository-owner',
      implementationCommitSha: COMMIT,
    })).toThrow(/completed/i);
  });

  it('requires every row to be labeled before completion', () => {
    const started = startCAL002Review({
      assignmentSha256: HASH_A,
      blindedBatchSha256: HASH_B,
      reviewIds: ['review-a', 'review-b'],
    });
    expect(() => completeCAL002Review({
      state: recordCAL002Review(started, 'review-a', 'not-useful'),
      reviewerAuthority: 'repository-owner',
      implementationCommitSha: COMMIT,
    })).toThrow(/unlabeled|incomplete/i);
  });
});

describe('CAL-002 private artifact I/O', () => {
  it('reads only exact canonical regular-file JSON', async () => {
    const root = await temporaryRoot();
    const value = { z: 1, a: ['safe'] };
    await writeFile(join(root, 'canonical.json'), canonicalArtifact(value).json, { mode: 0o600 });
    await writeFile(join(root, 'pretty.json'), JSON.stringify(value, null, 2), { mode: 0o600 });
    expect(await readCanonicalArtifact({ root, relativePath: 'canonical.json', label: 'fixture' })).toEqual(value);
    await expect(readCanonicalArtifact({ root, relativePath: 'pretty.json', label: 'fixture' })).rejects.toThrow(/canonical/i);

    await symlink(join(root, 'canonical.json'), join(root, 'linked.json'));
    await expect(readCanonicalArtifact({ root, relativePath: 'linked.json', label: 'fixture' })).rejects.toThrow(/symbolic link|symlink/i);
  });

  it('atomically writes 0600 state and rejects unsafe paths or widened existing state', async () => {
    const root = await temporaryRoot();
    const state = startCAL002Review({
      assignmentSha256: HASH_A,
      blindedBatchSha256: HASH_B,
      reviewIds: ['review-a'],
    });
    await writeReviewState({ root, relativePath: 'private/review-state.json', state });
    const statePath = join(root, 'private', 'review-state.json');
    expect((await lstat(statePath)).mode & 0o777).toBe(0o600);
    expect(await readFile(statePath, 'utf8')).toBe(canonicalArtifact(state).json);

    await expect(writeReviewState({ root, relativePath: '../escape.json', state })).rejects.toThrow(/unsafe|relative|contained/i);
    await chmod(statePath, 0o644);
    await expect(writeReviewState({
      root,
      relativePath: 'private/review-state.json',
      state: recordCAL002Review(state, 'review-a', 'not-useful'),
    })).rejects.toThrow(/mode|0600|private/i);
  });

  it('uses exclusive immutable receipt writes and rejects symlink ancestors', async () => {
    const root = await temporaryRoot();
    const started = startCAL002Review({ assignmentSha256: HASH_A, blindedBatchSha256: HASH_B, reviewIds: ['review-a'] });
    const completed = completeCAL002Review({
      state: recordCAL002Review(started, 'review-a', 'cannot-determine'),
      reviewerAuthority: 'repository-owner',
      implementationCommitSha: COMMIT,
    });
    await writeImmutableReceipt({ root, relativePath: 'receipts/review.json', receipt: completed.receipt });
    await expect(writeImmutableReceipt({ root, relativePath: 'receipts/review.json', receipt: completed.receipt })).rejects.toThrow(/exist|immutable|duplicate/i);

    const outside = await temporaryRoot();
    await mkdir(join(root, 'links'));
    await symlink(outside, join(root, 'links', 'outside'));
    await expect(writeImmutableReceipt({
      root,
      relativePath: 'links/outside/review.json',
      receipt: completed.receipt,
    })).rejects.toThrow(/symbolic link|symlink/i);
  });

  it('returns source text only after its content hash is verified', async () => {
    const root = await temporaryRoot();
    const source = 'const secret = 42;\n';
    await mkdir(join(root, 'sources'));
    await writeFile(join(root, 'sources', 'sample.ts'), source, { mode: 0o600 });
    await expect(readVerifiedSource({
      root,
      relativePath: 'sources/sample.ts',
      expectedSha256: '0'.repeat(64),
    })).rejects.toThrow(/SHA-256|hash/i);
    await expect(readVerifiedSource({
      root,
      relativePath: 'sources/sample.ts',
      expectedSha256: createHash('sha256').update(source).digest('hex'),
    })).resolves.toBe(source);
  });
});
