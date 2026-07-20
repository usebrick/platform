import { lstat, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const directorySyncFault = vi.hoisted(() => ({ calls: 0, failAt: 0 }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args);
      if (args[1] !== 0) return handle;
      return {
        close: () => handle.close(),
        sync: async () => {
          directorySyncFault.calls += 1;
          if (directorySyncFault.calls === directorySyncFault.failAt) {
            throw Object.assign(new Error('injected directory fsync failure'), { code: 'EIO' });
          }
          await handle.sync();
        },
      } as Awaited<ReturnType<typeof actual.open>>;
    },
  };
});

import { writeImmutableCanonicalReceipt } from '../../src/calibration/cal-002/artifact-io';
import { canonicalArtifact } from '../../src/calibration/cal-002/contracts';

const roots: string[] = [];

interface ReceiptFixture {
  readonly version: 'atomic-publication-fixture-v1';
  readonly value: number;
}

function assertReceiptFixture(value: unknown): asserts value is ReceiptFixture {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError('fixture must be an object');
  const record = value as Record<string, unknown>;
  if (record.version !== 'atomic-publication-fixture-v1' || !Number.isSafeInteger(record.value)) {
    throw new TypeError('fixture is invalid');
  }
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cal-002-artifact-io-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  directorySyncFault.calls = 0;
  directorySyncFault.failAt = 0;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('CAL-002 immutable atomic publication', () => {
  it('leaves an exact final artifact visible when publication fsync reports failure', async () => {
    const root = await temporaryRoot();
    const value: ReceiptFixture = { version: 'atomic-publication-fixture-v1', value: 1 };
    directorySyncFault.failAt = 1;

    await expect(writeImmutableCanonicalReceipt({
      root,
      relativePath: 'receipts/value.json',
      label: 'atomic publication fixture',
      value,
      assertValue: assertReceiptFixture,
    })).rejects.toMatchObject({ code: 'EIO' });

    expect(await readFile(join(root, 'receipts/value.json'), 'utf8')).toBe(canonicalArtifact(value).json);
    expect(await readdir(join(root, 'receipts'))).toEqual(['value.json']);
  });

  it('does not let cleanup fsync mask an already published immutable receipt', async () => {
    const root = await temporaryRoot();
    const value: ReceiptFixture = { version: 'atomic-publication-fixture-v1', value: 1 };
    directorySyncFault.failAt = 2;

    await expect(writeImmutableCanonicalReceipt({
      root,
      relativePath: 'receipts/value.json',
      label: 'atomic publication fixture',
      value,
      assertValue: assertReceiptFixture,
    })).resolves.toBe('created');

    expect(await readFile(join(root, 'receipts/value.json'), 'utf8')).toBe(canonicalArtifact(value).json);
    expect(await readdir(join(root, 'receipts'))).toEqual(['value.json']);
    expect((await lstat(join(root, 'receipts/value.json'))).isFile()).toBe(true);
  });

  it('does not let session-lock cleanup fsync mask an already published immutable receipt', async () => {
    const root = await temporaryRoot();
    const value: ReceiptFixture = { version: 'atomic-publication-fixture-v1', value: 1 };
    directorySyncFault.failAt = 3;

    await expect(writeImmutableCanonicalReceipt({
      root,
      relativePath: 'receipts/value.json',
      label: 'atomic publication fixture',
      value,
      assertValue: assertReceiptFixture,
    })).resolves.toBe('created');

    expect(await readFile(join(root, 'receipts/value.json'), 'utf8')).toBe(canonicalArtifact(value).json);
    expect(await readdir(join(root, 'receipts'))).toEqual(['value.json']);
  });
});
