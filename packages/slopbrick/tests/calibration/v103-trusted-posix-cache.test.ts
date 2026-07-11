import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  hashFileHandleSha256,
  inspectTrustedCanonicalCacheDirectory,
  requireTrustedPosixCapabilities,
  sameTrustedPosixFileIdentity,
  verifyTrustedRegularFile,
  type TrustedPosixFileIdentity,
  type TrustedPosixLstat,
  type TrustedPosixOpenFile,
} from '../../src/calibration/v103/trusted-posix-cache';

interface TestMetadata extends TrustedPosixFileIdentity {
  readonly uid: number;
  readonly mode: number;
  isDirectory(): boolean;
}

function metadata(overrides: Partial<{
  readonly dev: bigint;
  readonly ino: bigint;
  readonly size: bigint;
  readonly uid: number;
  readonly mode: number;
  readonly file: boolean;
  readonly directory: boolean;
}> = {}): TestMetadata {
  const values = {
    dev: 11n,
    ino: 22n,
    size: 7n,
    uid: 1000,
    mode: 0o700,
    file: true,
    directory: false,
    ...overrides,
  };
  return {
    dev: values.dev,
    ino: values.ino,
    size: values.size,
    uid: values.uid,
    mode: values.mode,
    isFile: () => values.file,
    isDirectory: () => values.directory,
  };
}

function trustedDirectoryLstat(
  leaf: string,
  overrides: Readonly<Record<string, TestMetadata>> = {},
): TrustedPosixLstat {
  const entries: Record<string, TestMetadata> = {
    '/': metadata({ uid: 0, mode: 0o755, file: false, directory: true }),
    '/trusted': metadata({ uid: 0, mode: 0o755, file: false, directory: true }),
    [leaf]: metadata({ uid: 1000, mode: 0o700, file: false, directory: true }),
    ...overrides,
  };
  return vi.fn(async (path: string) => {
    const value = entries[path];
    if (!value) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    return value;
  }) as TrustedPosixLstat;
}

function mockHandle(
  content: Buffer,
  options: {
    readonly statSequence?: readonly TestMetadata[];
    readonly readSizes?: readonly number[];
    readonly readError?: Error;
    readonly closeError?: Error;
  } = {},
): {
  readonly handle: FileHandle;
  readonly read: ReturnType<typeof vi.fn>;
  readonly stat: ReturnType<typeof vi.fn>;
  readonly close: ReturnType<typeof vi.fn>;
} {
  const stats = options.statSequence ?? [
    metadata({ size: BigInt(content.byteLength) }),
    metadata({ size: BigInt(content.byteLength) }),
  ];
  let statIndex = 0;
  let readIndex = 0;
  const stat = vi.fn(async () => stats[Math.min(statIndex++, stats.length - 1)]!);
  const read = vi.fn(async (buffer: Buffer, offset: number, length: number, position: number) => {
    if (options.readError) throw options.readError;
    const remaining = Math.max(0, content.byteLength - position);
    const requested = options.readSizes?.[readIndex++];
    const bytesRead = Math.min(requested ?? length, length, remaining);
    if (bytesRead > 0) content.copy(buffer, offset, position, position + bytesRead);
    return { bytesRead, buffer };
  });
  const close = vi.fn(async () => {
    if (options.closeError) throw options.closeError;
  });
  return {
    handle: { stat, read, close } as FileHandle,
    read,
    stat,
    close,
  };
}

describe('v10.3 trusted POSIX cache primitives', () => {
  it('derives no-follow and nonblocking regular-file flags from supported capabilities', () => {
    expect(requireTrustedPosixCapabilities({
      noFollowFlag: constants.O_NOFOLLOW,
      nonBlockingFlag: constants.O_NONBLOCK,
      effectiveUid: 1000,
    })).toEqual({
      noFollowFlag: constants.O_NOFOLLOW,
      nonBlockingFlag: constants.O_NONBLOCK,
      effectiveUid: 1000,
      regularFileReadFlags: constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    });
  });

  it.each([
    [{ noFollowFlag: undefined, nonBlockingFlag: 1, effectiveUid: 1 }],
    [{ noFollowFlag: 0, nonBlockingFlag: 1, effectiveUid: 1 }],
    [{ noFollowFlag: 1.5, nonBlockingFlag: 1, effectiveUid: 1 }],
    [{ noFollowFlag: 1, nonBlockingFlag: undefined, effectiveUid: 1 }],
    [{ noFollowFlag: 1, nonBlockingFlag: 0, effectiveUid: 1 }],
    [{ noFollowFlag: 1, nonBlockingFlag: 1.5, effectiveUid: 1 }],
    [{ noFollowFlag: 1, nonBlockingFlag: 1, effectiveUid: undefined }],
    [{ noFollowFlag: 1, nonBlockingFlag: 1, effectiveUid: -1 }],
    [{ noFollowFlag: 1, nonBlockingFlag: 1, effectiveUid: 1.5 }],
  ])('fails closed when a required POSIX capability is unsupported: %j', (capabilities) => {
    expect(requireTrustedPosixCapabilities(capabilities)).toBeUndefined();
  });

  it('accepts a canonical private leaf beneath controlled ancestors, including a root-owned sticky parent', async () => {
    const leaf = '/trusted/cache';
    const lstatFile = trustedDirectoryLstat(leaf, {
      '/trusted': metadata({ uid: 0, mode: 0o1777, file: false, directory: true }),
    });

    await expect(inspectTrustedCanonicalCacheDirectory(
      leaf,
      1000,
      vi.fn(async () => leaf),
      lstatFile,
    )).resolves.toEqual({ status: 'trusted', path: leaf });
    expect(lstatFile).toHaveBeenCalledTimes(3);
  });

  it('resolves a relative cache input before requiring exact canonical equality', async () => {
    const absolute = resolve('trusted/cache');
    const realpathFile = vi.fn(async () => absolute);
    const lstatFile = vi.fn(async (path: string) => metadata({
      uid: path === absolute ? 1000 : 0,
      mode: path === absolute ? 0o700 : 0o755,
      file: false,
      directory: true,
    })) as TrustedPosixLstat;

    await expect(inspectTrustedCanonicalCacheDirectory(
      'trusted/cache',
      1000,
      realpathFile,
      lstatFile,
    )).resolves.toEqual({ status: 'trusted', path: absolute });
    expect(realpathFile).toHaveBeenCalledWith(absolute);
  });

  it.each([
    ['noncanonical alias', { realpath: '/different/cache' }],
    ['foreign-owned leaf', { leaf: metadata({ uid: 2000, mode: 0o700, file: false, directory: true }) }],
    ['public leaf mode', { leaf: metadata({ uid: 1000, mode: 0o755, file: false, directory: true }) }],
    ['foreign-owned ancestor', { parent: metadata({ uid: 2000, mode: 0o755, file: false, directory: true }) }],
    ['non-sticky writable ancestor', { parent: metadata({ uid: 0, mode: 0o777, file: false, directory: true }) }],
    ['non-directory ancestor', { parent: metadata({ uid: 0, mode: 0o755, file: true, directory: false }) }],
  ])('rejects an untrusted canonical chain: %s', async (_name, change) => {
    const leaf = '/trusted/cache';
    const lstatFile = trustedDirectoryLstat(leaf, {
      ...(change.leaf ? { [leaf]: change.leaf } : {}),
      ...(change.parent ? { '/trusted': change.parent } : {}),
    });
    await expect(inspectTrustedCanonicalCacheDirectory(
      leaf,
      1000,
      vi.fn(async () => change.realpath ?? leaf),
      lstatFile,
    )).resolves.toEqual({ status: 'untrusted' });
  });

  it('distinguishes cache I/O failure from an untrusted policy result', async () => {
    const failure = Object.assign(new Error('private path must stay hidden'), { code: 'EACCES' });
    await expect(inspectTrustedCanonicalCacheDirectory(
      '/trusted/cache',
      1000,
      vi.fn(async () => { throw failure; }),
      trustedDirectoryLstat('/trusted/cache'),
    )).resolves.toMatchObject({ status: 'io' });

    await expect(inspectTrustedCanonicalCacheDirectory(
      '/trusted/cache',
      1000,
      vi.fn(async () => '/trusted/cache'),
      vi.fn(async () => { throw failure; }) as TrustedPosixLstat,
    )).resolves.toMatchObject({ status: 'io' });
  });

  it('never translates an authoritative deadline thrown around cache inspection', async () => {
    const deadline = new Error('deadline');
    let checks = 0;
    const checkDeadline = () => {
      checks += 1;
      if (checks >= 2) throw deadline;
    };
    await expect(inspectTrustedCanonicalCacheDirectory(
      '/trusted/cache',
      1000,
      vi.fn(async () => '/trusted/cache'),
      trustedDirectoryLstat('/trusted/cache'),
      checkDeadline,
    )).rejects.toBe(deadline);
  });

  it('propagates a caller-authoritative cache error without changing its domain', async () => {
    const authoritative = new Error('authoritative');
    const deadline = new Error('deadline');
    let checks = 0;
    await expect(inspectTrustedCanonicalCacheDirectory(
      '/trusted/cache',
      1000,
      vi.fn(async () => { throw authoritative; }),
      trustedDirectoryLstat('/trusted/cache'),
      () => {
        checks += 1;
        if (checks >= 2) throw deadline;
      },
      (error) => error === authoritative,
    )).rejects.toBe(authoritative);
    expect(checks).toBe(1);
  });

  it('compares file identity using exact BigInt device and inode values', () => {
    const original = metadata({ dev: 9_007_199_254_740_993n, ino: 9_007_199_254_740_995n });
    expect(sameTrustedPosixFileIdentity(original, metadata({ dev: original.dev, ino: original.ino }))).toBe(true);
    expect(sameTrustedPosixFileIdentity(original, metadata({ dev: original.dev + 1n, ino: original.ino }))).toBe(false);
    expect(sameTrustedPosixFileIdentity(original, metadata({ dev: original.dev, ino: original.ino + 1n }))).toBe(false);
  });

  it('hashes only bounded positional reads and continues after positive short reads without closing the handle', async () => {
    const content = Buffer.from('trusted');
    const fake = mockHandle(content, { readSizes: [1, 2, 1, 3] });
    const checkDeadline = vi.fn();

    await expect(hashFileHandleSha256(fake.handle, content.byteLength, checkDeadline)).resolves.toEqual({
      status: 'hashed',
      bytesRead: content.byteLength,
      sha256: createHash('sha256').update(content).digest('hex'),
    });
    expect(fake.read.mock.calls.map((call) => call[3])).toEqual([0, 1, 3, 4]);
    expect(fake.read.mock.calls.every((call) => call[2] <= 64 * 1024)).toBe(true);
    expect(fake.close).not.toHaveBeenCalled();
    expect(checkDeadline).toHaveBeenCalledTimes(8);
  });

  it('reports a premature zero-byte read without spinning or inventing bytes', async () => {
    const content = Buffer.from('trusted');
    const fake = mockHandle(content, { readSizes: [2, 0] });
    await expect(hashFileHandleSha256(fake.handle, content.byteLength)).resolves.toMatchObject({
      status: 'hashed',
      bytesRead: 2,
    });
    expect(fake.read).toHaveBeenCalledTimes(2);
  });

  it('reports descriptor read failures as neutral I/O without closing the borrowed handle', async () => {
    const fake = mockHandle(Buffer.from('trusted'), { readError: new Error('hidden read failure') });
    await expect(hashFileHandleSha256(fake.handle, 7)).resolves.toMatchObject({ status: 'io' });
    expect(fake.close).not.toHaveBeenCalled();
  });

  it('propagates a descriptor deadline without closing a borrowed handle', async () => {
    const fake = mockHandle(Buffer.from('trusted'));
    const deadline = new Error('deadline');
    let checks = 0;
    await expect(hashFileHandleSha256(fake.handle, 7, () => {
      checks += 1;
      if (checks >= 2) throw deadline;
    })).rejects.toBe(deadline);
    expect(fake.close).not.toHaveBeenCalled();
  });

  it('verifies pre-open, opened, final, and post-close identity with caller-supplied flags', async () => {
    const content = Buffer.from('trusted');
    const digest = createHash('sha256').update(content).digest('hex');
    const pathIdentity = metadata({ size: BigInt(content.byteLength) });
    const fake = mockHandle(content, { readSizes: [2, 2, 3] });
    const openFile = vi.fn(async () => fake.handle) as TrustedPosixOpenFile;
    const lstatFile = vi.fn()
      .mockResolvedValueOnce(pathIdentity)
      .mockResolvedValueOnce(pathIdentity) as TrustedPosixLstat;
    const flags = 0x12345;

    await expect(verifyTrustedRegularFile(
      '/trusted/cache/archive.zip',
      content.byteLength,
      digest,
      openFile,
      undefined,
      flags,
      lstatFile,
    )).resolves.toBe('valid');
    expect(openFile).toHaveBeenCalledWith('/trusted/cache/archive.zip', flags);
    expect(fake.close).toHaveBeenCalledTimes(1);
    expect(lstatFile).toHaveBeenCalledTimes(2);
  });

  it('treats only an initial pathname ENOENT as missing', async () => {
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' });
    const lstatFile = vi.fn(async () => { throw missing; }) as TrustedPosixLstat;
    await expect(verifyTrustedRegularFile(
      '/trusted/cache/archive.zip',
      7,
      '0'.repeat(64),
      vi.fn() as TrustedPosixOpenFile,
      undefined,
      1,
      lstatFile,
    )).resolves.toBe('missing');

    const pathIdentity = metadata({ size: 7n });
    const openFile = vi.fn(async () => { throw missing; }) as TrustedPosixOpenFile;
    await expect(verifyTrustedRegularFile(
      '/trusted/cache/archive.zip',
      7,
      '0'.repeat(64),
      openFile,
      undefined,
      1,
      vi.fn(async () => pathIdentity) as TrustedPosixLstat,
    )).resolves.toBe('invalid');
  });

  it.each([
    ['non-regular pre-open path', metadata({ size: 7n, file: false })],
    ['wrong pre-open size', metadata({ size: 8n })],
  ])('rejects a %s before opening any descriptor', async (_name, pathIdentity) => {
    const openFile = vi.fn() as TrustedPosixOpenFile;
    await expect(verifyTrustedRegularFile(
      '/trusted/cache/archive.zip',
      7,
      '0'.repeat(64),
      openFile,
      undefined,
      1,
      vi.fn(async () => pathIdentity) as TrustedPosixLstat,
    )).resolves.toBe('invalid');
    expect(openFile).not.toHaveBeenCalled();
  });

  it.each([
    ['opened identity', metadata({ dev: 12n, size: 7n }), metadata({ size: 7n }), metadata({ size: 7n })],
    ['opened size', metadata({ size: 8n }), metadata({ size: 7n }), metadata({ size: 7n })],
    ['final identity', metadata({ size: 7n }), metadata({ ino: 23n, size: 7n }), metadata({ size: 7n })],
    ['final size', metadata({ size: 7n }), metadata({ size: 8n }), metadata({ size: 7n })],
    ['post-close identity', metadata({ size: 7n }), metadata({ size: 7n }), metadata({ dev: 12n, size: 7n })],
    ['post-close size', metadata({ size: 7n }), metadata({ size: 7n }), metadata({ size: 8n })],
  ])('rejects a %s mismatch and closes exactly once', async (_name, opened, final, after) => {
    const content = Buffer.from('trusted');
    const pathIdentity = metadata({ size: 7n });
    const fake = mockHandle(content, { statSequence: [opened, final] });
    const lstatFile = vi.fn()
      .mockResolvedValueOnce(pathIdentity)
      .mockResolvedValueOnce(after) as TrustedPosixLstat;
    await expect(verifyTrustedRegularFile(
      '/trusted/cache/archive.zip',
      7,
      createHash('sha256').update(content).digest('hex'),
      vi.fn(async () => fake.handle) as TrustedPosixOpenFile,
      undefined,
      1,
      lstatFile,
    )).resolves.toBe('invalid');
    expect(fake.close).toHaveBeenCalledTimes(1);
  });

  it('rejects a digest mismatch, premature zero read, read error, and close error', async () => {
    const content = Buffer.from('trusted');
    const pathIdentity = metadata({ size: 7n });
    const cases = [
      { digest: '0'.repeat(64), fake: mockHandle(content) },
      { digest: createHash('sha256').update(content).digest('hex'), fake: mockHandle(content, { readSizes: [2, 0] }) },
      { digest: createHash('sha256').update(content).digest('hex'), fake: mockHandle(content, { readError: new Error('hidden') }) },
      { digest: createHash('sha256').update(content).digest('hex'), fake: mockHandle(content, { closeError: new Error('hidden') }) },
    ];
    for (const value of cases) {
      const lstatFile = vi.fn()
        .mockResolvedValueOnce(pathIdentity)
        .mockResolvedValueOnce(pathIdentity) as TrustedPosixLstat;
      await expect(verifyTrustedRegularFile(
        '/trusted/cache/archive.zip',
        7,
        value.digest,
        vi.fn(async () => value.fake.handle) as TrustedPosixOpenFile,
        undefined,
        1,
        lstatFile,
      )).resolves.toBe('invalid');
      expect(value.fake.close).toHaveBeenCalledTimes(1);
    }
  });

  it.each(['initial handle stat', 'final handle stat', 'post-close lstat'])(
    'fails closed on a hidden %s error and closes an opened handle exactly once',
    async (phase) => {
      const content = Buffer.from('trusted');
      const pathIdentity = metadata({ size: 7n });
      const fake = mockHandle(content);
      const hidden = new Error('hidden');
      if (phase === 'initial handle stat') fake.stat.mockRejectedValueOnce(hidden);
      if (phase === 'final handle stat') {
        fake.stat.mockResolvedValueOnce(pathIdentity).mockRejectedValueOnce(hidden);
      }
      const lstatFile = phase === 'post-close lstat'
        ? vi.fn().mockResolvedValueOnce(pathIdentity).mockRejectedValueOnce(hidden)
        : vi.fn().mockResolvedValue(pathIdentity);
      await expect(verifyTrustedRegularFile(
        '/trusted/cache/archive.zip',
        7,
        createHash('sha256').update(content).digest('hex'),
        vi.fn(async () => fake.handle) as TrustedPosixOpenFile,
        undefined,
        1,
        lstatFile as TrustedPosixLstat,
      )).resolves.toBe('invalid');
      expect(fake.close).toHaveBeenCalledTimes(1);
    },
  );

  it('closes exactly once and preserves an authoritative deadline observed immediately after open', async () => {
    const content = Buffer.from('trusted');
    const fake = mockHandle(content);
    const deadline = new Error('deadline');
    let checks = 0;
    const checkDeadline = () => {
      checks += 1;
      if (checks >= 4) throw deadline;
    };
    await expect(verifyTrustedRegularFile(
      '/trusted/cache/archive.zip',
      7,
      createHash('sha256').update(content).digest('hex'),
      vi.fn(async () => fake.handle) as TrustedPosixOpenFile,
      checkDeadline,
      1,
      vi.fn(async () => metadata({ size: 7n })) as TrustedPosixLstat,
    )).rejects.toBe(deadline);
    expect(fake.close).toHaveBeenCalledTimes(1);
  });

  it('closes exactly once and preserves an authoritative deadline observed after a read', async () => {
    const content = Buffer.from('trusted');
    const fake = mockHandle(content);
    const deadline = new Error('deadline');
    let checks = 0;
    const checkDeadline = () => {
      checks += 1;
      if (checks >= 8) throw deadline;
    };
    await expect(verifyTrustedRegularFile(
      '/trusted/cache/archive.zip',
      7,
      createHash('sha256').update(content).digest('hex'),
      vi.fn(async () => fake.handle) as TrustedPosixOpenFile,
      checkDeadline,
      1,
      vi.fn(async () => metadata({ size: 7n })) as TrustedPosixLstat,
    )).rejects.toBe(deadline);
    expect(fake.close).toHaveBeenCalledTimes(1);
  });

  it('closes exactly once and propagates a caller-authoritative descriptor error', async () => {
    const content = Buffer.from('trusted');
    const authoritative = new Error('authoritative');
    const deadline = new Error('deadline');
    let checks = 0;
    const fake = mockHandle(content, { readError: authoritative });
    await expect(verifyTrustedRegularFile(
      '/trusted/cache/archive.zip',
      7,
      createHash('sha256').update(content).digest('hex'),
      vi.fn(async () => fake.handle) as TrustedPosixOpenFile,
      () => {
        checks += 1;
        if (checks >= 8) throw deadline;
      },
      1,
      vi.fn(async () => metadata({ size: 7n })) as TrustedPosixLstat,
      (error) => error === authoritative,
    )).rejects.toBe(authoritative);
    expect(fake.close).toHaveBeenCalledTimes(1);
    expect(checks).toBe(7);
  });
});
