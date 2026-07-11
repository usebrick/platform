import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, open as openFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

import {
  BorrowedFileHandleReader,
  Crc32V1,
  MAX_ARCHIVE_BYTES,
  MAX_DEPTH,
  MAX_FILE_BYTES,
  MAX_PATH_BYTES,
  MAX_SEGMENT_BYTES,
  MAX_TOTAL_PATH_BYTES,
  MAX_TOTAL_UNCOMPRESSED_BYTES,
  SafeZipError,
  SafeZipInventoryBudgetV1,
  crc32V1,
  isSafeZipArchiveBytesV1,
  isSafeZipEntryCountV1,
  isSafeZipExtraFieldBytesV1,
  isSafeZipFileBytesV1,
  isSafeZipRatioV1,
  isSafeZipTotalPathBytesV1,
  isSafeZipTotalUncompressedBytesV1,
  openRawSafeZipEntryStreamV1,
  openValidatedSafeZipV1FromBorrowedHandle,
  parseRawSafeZipV1,
  type SafeZipReadableHandle,
  validateSafeZipEntryContentV1,
} from '../../src/calibration/v103/safe-zip';
import {
  buildRawZipFixture,
  buildYazlZipFixture,
  encodeExtraFields,
  patchRawZipFixture,
  type RawZipFixture,
} from '../helpers/zip-fixtures';

async function readStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function borrowedHandle(
  content: Buffer,
  readSizes: readonly number[] = [],
): {
  readonly handle: SafeZipReadableHandle & { readonly close: ReturnType<typeof vi.fn> };
  readonly read: ReturnType<typeof vi.fn>;
  readonly close: ReturnType<typeof vi.fn>;
} {
  let readIndex = 0;
  const read = vi.fn(async (buffer: Buffer, offset: number, length: number, position: number) => {
    const available = Math.max(0, content.byteLength - position);
    const bytesRead = Math.min(readSizes[readIndex++] ?? length, length, available);
    if (bytesRead > 0) content.copy(buffer, offset, position, position + bytesRead);
    return { buffer, bytesRead };
  });
  const close = vi.fn(async () => undefined);
  return { handle: { read, close }, read, close };
}

async function expectRawFailure(fixture: RawZipFixture, code: string): Promise<void> {
  const owner = borrowedHandle(fixture.bytes);
  await expect(parseRawSafeZipV1(owner.handle, fixture.bytes.byteLength)).rejects.toMatchObject({ code });
  expect(owner.close).not.toHaveBeenCalled();
}

function phaseChangingHandle(
  original: RawZipFixture,
  changed: RawZipFixture,
): { readonly handle: SafeZipReadableHandle; readonly completeReads: () => number } {
  let completeReads = 0;
  let changedPhase = false;
  const read = vi.fn(async (buffer: Buffer, offset: number, length: number, position: number) => {
    if (position === 0 && length === original.bytes.byteLength) {
      completeReads += 1;
      if (completeReads === 2) changedPhase = true;
    }
    const source = changedPhase ? changed.bytes : original.bytes;
    const bytesRead = Math.min(length, Math.max(0, source.byteLength - position));
    if (bytesRead > 0) source.copy(buffer, offset, position, position + bytesRead);
    return { buffer, bytesRead };
  });
  return { handle: { read }, completeReads: () => completeReads };
}

describe('v10.3 safe ZIP metadata validation', () => {
  it('matches the standard CRC-32 check vector', () => {
    expect(crc32V1(Buffer.from('123456789'))).toBe(0xcbf43926);
  });

  it('produces the same CRC across arbitrary chunk boundaries', () => {
    const crc = new Crc32V1();
    crc.update(Buffer.from('1'));
    crc.update(Buffer.from('2345'));
    crc.update(Buffer.from('6789'));
    expect(crc.digest()).toBe(0xcbf43926);
    expect(new Crc32V1().digest()).toBe(0);
  });

  it('reads a borrowed range positionally through positive short reads without closing its owner', async () => {
    const owner = borrowedHandle(Buffer.from('0123456789'), [2, 1, 3]);
    const reader = new BorrowedFileHandleReader(owner.handle, 10);
    const closed = once(reader, 'close');

    await expect(readStream(reader.createReadStream({ start: 2, end: 8 }))).resolves.toEqual(Buffer.from('234567'));
    await closed;

    expect(owner.read.mock.calls.map((call) => [call[2], call[3]])).toEqual([
      [6, 2],
      [4, 4],
      [3, 5],
    ]);
    expect(owner.close).not.toHaveBeenCalled();
  });

  it('fails a borrowed range before reading when its bounds are unsafe', async () => {
    const owner = borrowedHandle(Buffer.from('abc'));
    const reader = new BorrowedFileHandleReader(owner.handle, 3);

    await expect(readStream(reader.createReadStream({ start: -1, end: 2 }))).rejects.toMatchObject({
      code: 'ERR_SAFE_ZIP_STREAM',
    });
    expect(owner.read).not.toHaveBeenCalled();
  });

  it('turns an early zero-byte positional read into a stable cause-free error', async () => {
    const owner = borrowedHandle(Buffer.from('abc'), [0]);
    const reader = new BorrowedFileHandleReader(owner.handle, 3);

    const failure = await readStream(reader.createReadStream({ start: 0, end: 3 })).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SafeZipError);
    expect(failure).toMatchObject({ code: 'ERR_SAFE_ZIP_STREAM' });
    expect(String(failure)).not.toContain('abc');
    expect(owner.close).not.toHaveBeenCalled();
  });

  it('preflights a valid nested archive and registers implicit directories once', async () => {
    const fixture = buildRawZipFixture({
      entries: [
        { name: 'root/' },
        { name: 'root/readme.txt', data: Buffer.from('hello') },
        { name: 'root/src/main.ts', data: Buffer.from('ts'), method: 8 },
      ],
    });
    const owner = borrowedHandle(fixture.bytes);

    const index = await parseRawSafeZipV1(owner.handle, fixture.bytes.byteLength);

    expect(index.archiveEntries.map(({ path, kind }) => [path, kind])).toEqual([
      ['root', 'directory'],
      ['root/readme.txt', 'file'],
      ['root/src/main.ts', 'file'],
    ]);
    expect(index.inventory).toEqual([
      { path: 'root', kind: 'directory', explicit: true },
      { path: 'root/readme.txt', kind: 'file', explicit: true },
      { path: 'root/src', kind: 'directory', explicit: false },
      { path: 'root/src/main.ts', kind: 'file', explicit: true },
    ]);
    expect(index.totalUncompressedBytes).toBe(7);
    expect(index.totalPathBytes).toBe(index.inventory.reduce(
      (total, entry) => total + Buffer.byteLength(entry.path, 'ascii'),
      0,
    ));
    expect(owner.read).toHaveBeenCalled();
    expect(owner.close).not.toHaveBeenCalled();
  });

  it('accepts an independently generated yazl archive', async () => {
    const bytes = await buildYazlZipFixture([
      { path: 'pkg/' , kind: 'directory' },
      { path: 'pkg/a.txt', data: Buffer.from('alpha'), compress: false },
      { path: 'pkg/b.txt', data: Buffer.from('bravo'), compress: true },
    ]);
    const owner = borrowedHandle(bytes, [1, 7, 2, 31]);

    await expect(parseRawSafeZipV1(owner.handle, bytes.byteLength)).resolves.toMatchObject({
      totalUncompressedBytes: 10,
    });
  });

  it('cross-checks yauzl ordinal metadata, validates stored and deflate content, and releases without closing the owner', async () => {
    const fixture = buildRawZipFixture({
      entries: [
        { name: 'a.txt', data: Buffer.from('alpha') },
        { name: 'b.txt', data: Buffer.from('bravo'), method: 8 },
      ],
    });
    const owner = borrowedHandle(fixture.bytes, [3, 1, 17, 2, 31]);
    const opened = await openValidatedSafeZipV1FromBorrowedHandle(owner.handle, fixture.bytes.byteLength);

    const firstChunks: Buffer[] = [];
    const first = await opened.validateEntryContent(opened.index.archiveEntries[0]!, {
      onChunk: (chunk) => { firstChunks.push(Buffer.from(chunk)); },
    });
    const second = await opened.validateEntryContent(opened.index.archiveEntries[1]!);
    await opened.release();
    await opened.release();

    expect(Buffer.concat(firstChunks)).toEqual(Buffer.from('alpha'));
    expect(first).toMatchObject({ bytes: 5, crc32: crc32V1(Buffer.from('alpha')) });
    expect(first.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toMatchObject({ bytes: 5, crc32: crc32V1(Buffer.from('bravo')) });
    const stillOpen = Buffer.alloc(1);
    await expect(owner.handle.read(stillOpen, 0, 1, 0)).resolves.toMatchObject({ bytesRead: 1 });
    expect(stillOpen).toEqual(fixture.bytes.subarray(0, 1));
    expect(owner.close).not.toHaveBeenCalled();
  });

  it('leaves one real owning FileHandle stat-able, positionally readable, and hash-equivalent after release', async () => {
    const fixture = buildRawZipFixture({ entries: [{ name: 'owned.txt', data: Buffer.from('owned') }] });
    const directory = await mkdtemp(join(tmpdir(), 'slopbrick-safe-zip-'));
    const archivePath = join(directory, 'archive.zip');
    await writeFile(archivePath, fixture.bytes);
    const handle = await openFile(archivePath, 'r');
    const readerClose = vi.spyOn(BorrowedFileHandleReader.prototype, 'close');
    try {
      const opened = await openValidatedSafeZipV1FromBorrowedHandle(handle, fixture.bytes.byteLength);
      await expect(opened.validateEntryContent(opened.index.archiveEntries[0]!)).resolves.toMatchObject({ bytes: 5 });
      await opened.release();

      await expect(handle.stat()).resolves.toMatchObject({ size: fixture.bytes.byteLength });
      const reread = Buffer.alloc(fixture.bytes.byteLength);
      let offset = 0;
      while (offset < reread.byteLength) {
        const { bytesRead } = await handle.read(reread, offset, reread.byteLength - offset, offset);
        expect(bytesRead).toBeGreaterThan(0);
        offset += bytesRead;
      }
      expect(createHash('sha256').update(reread).digest('hex'))
        .toBe(createHash('sha256').update(fixture.bytes).digest('hex'));
      expect(readerClose).toHaveBeenCalledTimes(1);
    } finally {
      readerClose.mockRestore();
      await handle.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('uses only the documented low-level callback adapter with exact validated raw-range arguments', async () => {
    const stream = Readable.from([Buffer.from('raw')]);
    const openReadStreamLowLevelPromise = vi.fn();
    const openReadStreamLowLevel = vi.fn((...args: unknown[]) => {
      const callback = args.at(-1) as (error: Error | null, value?: NodeJS.ReadableStream) => void;
      callback(null, stream);
    });
    const entry = {
      dataStart: 41,
      compressedBytes: 3,
    } as Parameters<typeof openRawSafeZipEntryStreamV1>[1];

    await expect(readStream(await openRawSafeZipEntryStreamV1(
      { openReadStreamLowLevel, openReadStreamLowLevelPromise } as never,
      entry,
    ))).resolves.toEqual(Buffer.from('raw'));
    expect(openReadStreamLowLevel).toHaveBeenCalledWith(41, 3, 0, 3, false, null, expect.any(Function));
    expect(openReadStreamLowLevelPromise).not.toHaveBeenCalled();
  });

  it('rejects a wrong actual CRC after raw metadata and yauzl agree', async () => {
    const fixture = buildRawZipFixture({
      entries: [{ name: 'wrong.txt', data: Buffer.from('actual'), centralCrc32: 0x1234_5678 }],
    });
    const owner = borrowedHandle(fixture.bytes);
    const opened = await openValidatedSafeZipV1FromBorrowedHandle(owner.handle, fixture.bytes.byteLength);

    await expect(opened.validateEntryContent(opened.index.archiveEntries[0]!)).rejects.toMatchObject({
      code: 'ERR_SAFE_ZIP_ENTRY_METADATA',
    });
    await opened.release();
  });

  it('aborts an overlong inflated chunk before hashing it or passing it to a sink', async () => {
    const fixture = buildRawZipFixture({
      entries: [{
        name: 'long.txt',
        data: Buffer.alloc(1024, 0x61),
        method: 8,
        centralUncompressedBytes: 1,
        localUncompressedBytes: 1,
      }],
    });
    const owner = borrowedHandle(fixture.bytes);
    const index = await parseRawSafeZipV1(owner.handle, fixture.bytes.byteLength);
    const raw = new BorrowedFileHandleReader(owner.handle, fixture.bytes.byteLength);
    const zip = await import('yauzl').then(({ fromRandomAccessReaderPromise }) => fromRandomAccessReaderPromise(
      raw,
      fixture.bytes.byteLength,
      { autoClose: false, decodeStrings: false, validateEntrySizes: true },
    ));
    const sink = vi.fn();

    await expect(validateSafeZipEntryContentV1(zip, index.archiveEntries[0]!, { onChunk: sink }))
      .rejects.toMatchObject({ code: 'ERR_SAFE_ZIP_ENTRY_LIMIT' });
    expect(sink).not.toHaveBeenCalled();
    const closed = once(zip, 'close');
    zip.close();
    await closed;
  });

  it('rejects a valid deflate stream whose output ends below its declared size', async () => {
    const fixture = buildRawZipFixture({ entries: [{
      name: 'short.txt',
      data: Buffer.from('x'),
      method: 8,
      centralUncompressedBytes: 2,
      localUncompressedBytes: 2,
    }] });
    const owner = borrowedHandle(fixture.bytes);
    const opened = await openValidatedSafeZipV1FromBorrowedHandle(owner.handle, fixture.bytes.byteLength);
    try {
      await expect(opened.validateEntryContent(opened.index.archiveEntries[0]!)).rejects.toMatchObject({
        code: 'ERR_SAFE_ZIP_ENTRY_METADATA',
      });
    } finally {
      await opened.release();
    }
  });

  it('accepts every inclusive path boundary and rejects the hostile raw-name matrix', async () => {
    const maxPath = Array.from({ length: 17 }, () => 'x'.repeat(240)).join('/');
    expect(Buffer.byteLength(maxPath)).toBe(MAX_PATH_BYTES);
    const maxDepth = Array.from({ length: MAX_DEPTH }, () => 'd').join('/');
    const valid = buildRawZipFixture({
      entries: [
        { name: 's'.repeat(MAX_SEGMENT_BYTES), data: Buffer.from('segment') },
        { name: maxPath, data: Buffer.from('path') },
        { name: maxDepth, data: Buffer.from('depth') },
      ],
    });
    await expect(parseRawSafeZipV1(borrowedHandle(valid.bytes).handle, valid.bytes.byteLength))
      .resolves.toMatchObject({ totalUncompressedBytes: 16 });

    const invalidNames: readonly (string | Buffer)[] = [
      '../escape',
      '/absolute',
      'C:/drive',
      'back\\slash',
      Buffer.from([0x61, 0x00, 0x62]),
      Buffer.from([0x61, 0x1f, 0x62]),
      Buffer.alloc(0),
      '.',
      './x',
      'a/../b',
      'a//b',
      'a///',
      Buffer.from([0x80]),
      's'.repeat(MAX_SEGMENT_BYTES + 1),
      Array.from({ length: MAX_DEPTH + 1 }, () => 'd').join('/'),
      `${'x'.repeat(241)}/${Array.from({ length: 16 }, () => 'x'.repeat(240)).join('/')}`,
    ];
    for (const name of invalidNames) {
      await expectRawFailure(
        buildRawZipFixture({ entries: [{ name, data: Buffer.from('x') }] }),
        'ERR_SAFE_ZIP_ENTRY_NAME',
      );
    }
  });

  it('rejects exact, ASCII-fold, parent-prefix, reserved-control, and file-directory collisions', async () => {
    const cases = [
      [{ name: 'same', data: Buffer.from('a') }, { name: 'same', data: Buffer.from('b') }],
      [{ name: 'Readme', data: Buffer.from('a') }, { name: 'README', data: Buffer.from('b') }],
      [{ name: 'A/x', data: Buffer.from('a') }, { name: 'a/y', data: Buffer.from('b') }],
      [{ name: 'parent', data: Buffer.from('a') }, { name: 'parent/child', data: Buffer.from('b') }],
      [{ name: '.SLOPBRICK-MATERIALIZATION-RECEIPT.V1.JSON', data: Buffer.from('x') }],
      [{ name: '.slopbrick-materialization-receipt.v1.json/descendant', data: Buffer.from('x') }],
    ] as const;
    for (const entries of cases) {
      await expectRawFailure(buildRawZipFixture({ entries }), 'ERR_SAFE_ZIP_ENTRY_COLLISION');
    }
  });

  it('freezes Unix, OS X, and DOS entry classification and rejects special or mismatched types', async () => {
    const valid = buildRawZipFixture({ entries: [
      { name: 'unix', data: Buffer.from('u'), versionMadeBy: (3 << 8) | 20, externalAttributes: (0o100600 << 16) >>> 0 },
      { name: 'osx', data: Buffer.from('o'), versionMadeBy: (19 << 8) | 20, externalAttributes: (0o100600 << 16) >>> 0 },
      { name: 'dos', data: Buffer.from('d'), versionMadeBy: 20, externalAttributes: 0x20 },
      { name: 'dos-dir/', versionMadeBy: 20, externalAttributes: 0x10 },
    ] });
    await expect(parseRawSafeZipV1(borrowedHandle(valid.bytes).handle, valid.bytes.byteLength)).resolves.toMatchObject({
      archiveEntries: [
        { kind: 'file' },
        { kind: 'file' },
        { kind: 'file' },
        { kind: 'directory' },
      ],
    });

    const forbidden = [
      { name: 'ntfs', data: Buffer.from('x'), versionMadeBy: (10 << 8) | 20 },
      { name: 'unknown', data: Buffer.from('x'), versionMadeBy: (2 << 8) | 20 },
      { name: 'link', data: Buffer.from('x'), externalAttributes: (0o120700 << 16) >>> 0 },
      { name: 'fifo', data: Buffer.from('x'), externalAttributes: (0o010700 << 16) >>> 0 },
      { name: 'socket', data: Buffer.from('x'), externalAttributes: (0o140700 << 16) >>> 0 },
      { name: 'volume', data: Buffer.from('x'), versionMadeBy: 20, externalAttributes: 0x08 },
      { name: 'device', data: Buffer.from('x'), versionMadeBy: 20, externalAttributes: 0x40 },
      { name: 'reserved', data: Buffer.from('x'), versionMadeBy: 20, externalAttributes: 0x80 },
      { name: 'file/', data: Buffer.from('x'), externalAttributes: (0o100600 << 16) >>> 0 },
      { name: 'directory', externalAttributes: (0o040700 << 16) >>> 0 },
    ] as const;
    for (const entry of forbidden) {
      await expectRawFailure(buildRawZipFixture({ entries: [entry] }), 'ERR_SAFE_ZIP_ENTRY_TYPE');
    }
  });

  it('allows only method-specific safe flags and rejects encrypted, patched, masked, reserved, and unsupported entries', async () => {
    const valid = buildRawZipFixture({ entries: [
      { name: 'stored', data: Buffer.from('s'), flags: 0x0800 },
      { name: 'deflated', data: Buffer.from('d'), method: 8, flags: 0x0806 },
    ] });
    await expect(parseRawSafeZipV1(borrowedHandle(valid.bytes).handle, valid.bytes.byteLength)).resolves.toBeDefined();

    for (const flags of [0x0001, 0x0002, 0x0004, 0x0010, 0x0020, 0x0040, 0x1000, 0x2000, 0x4000, 0x8000]) {
      await expectRawFailure(
        buildRawZipFixture({ entries: [{ name: `flag-${flags}`, data: Buffer.from('x'), flags }] }),
        'ERR_SAFE_ZIP_ENTRY_METADATA',
      );
    }
    await expectRawFailure(
      buildRawZipFixture({ entries: [{ name: 'method', data: Buffer.from('x'), method: 12 }] }),
      'ERR_SAFE_ZIP_ENTRY_METADATA',
    );
    await expectRawFailure(
      buildRawZipFixture({ entries: [{ name: 'dir/', flags: 0x0008, descriptor: 'signed' }] }),
      'ERR_SAFE_ZIP_ENTRY_METADATA',
    );
  });

  it('parses only exact timestamp and UID/GID TLVs independently in central and local headers', async () => {
    const centralTimestamp = encodeExtraFields([{ id: 0x5455, data: Buffer.from([1, 0, 0, 0, 0]) }]);
    const localTimestamp = encodeExtraFields([{ id: 0x5455, data: Buffer.from([7, ...Buffer.alloc(12)]) }]);
    const uidGid = encodeExtraFields([{ id: 0x7875, data: Buffer.from([1, 1, 42, 1, 43]) }]);
    const valid = buildRawZipFixture({ entries: [{
      name: 'extras',
      data: Buffer.from('x'),
      centralExtra: Buffer.concat([centralTimestamp, uidGid]),
      localExtra: Buffer.concat([localTimestamp, uidGid]),
    }] });
    await expect(parseRawSafeZipV1(borrowedHandle(valid.bytes).handle, valid.bytes.byteLength)).resolves.toBeDefined();

    const invalidCentralExtras = [
      Buffer.from([0x55]),
      encodeExtraFields([{ id: 0x0001, data: Buffer.alloc(0) }]),
      encodeExtraFields([{ id: 0x7075, data: Buffer.alloc(0) }]),
      encodeExtraFields([{ id: 0x000d, data: Buffer.alloc(0) }]),
      encodeExtraFields([{ id: 0x5455, data: Buffer.from([0, 0, 0, 0, 0]) }]),
      encodeExtraFields([{ id: 0x5455, data: Buffer.from([9, 0, 0, 0, 0]) }]),
      encodeExtraFields([{ id: 0x5455, data: Buffer.from([1, 0, 0, 0]) }]),
      encodeExtraFields([{ id: 0x7875, data: Buffer.from([2, 1, 1, 1, 1]) }]),
      encodeExtraFields([{ id: 0x7875, data: Buffer.from([1, 0, 1, 1]) }]),
      encodeExtraFields([
        { id: 0x5455, data: Buffer.from([1, 0, 0, 0, 0]) },
        { id: 0x5455, data: Buffer.from([1, 0, 0, 0, 0]) },
      ]),
    ];
    for (const centralExtra of invalidCentralExtras) {
      await expectRawFailure(
        buildRawZipFixture({ entries: [{ name: 'bad-extra', data: Buffer.from('x'), centralExtra }] }),
        'ERR_SAFE_ZIP_ENTRY_METADATA',
      );
    }
    await expectRawFailure(
      buildRawZipFixture({ entries: [{
        name: 'bad-local-extra',
        data: Buffer.from('x'),
        localExtra: encodeExtraFields([{ id: 0x5455, data: Buffer.from([3, 0, 0, 0, 0]) }]),
      }] }),
      'ERR_SAFE_ZIP_ENTRY_METADATA',
    );
  });

  it('rejects every local/central disagreement and accepts only a signed classic descriptor', async () => {
    const signed = buildRawZipFixture({ entries: [{
      name: 'signed', data: Buffer.from('descriptor'), method: 8, descriptor: 'signed',
    }] });
    await expect(parseRawSafeZipV1(borrowedHandle(signed.bytes).handle, signed.bytes.byteLength)).resolves.toBeDefined();

    const invalid = [
      buildRawZipFixture({ entries: [{ name: 'central', localName: 'local', data: Buffer.from('x') }] }),
      buildRawZipFixture({ entries: [{ name: 'crc', data: Buffer.from('x'), localCrc32: 1 }] }),
      buildRawZipFixture({ entries: [{ name: 'compressed', data: Buffer.from('x'), localCompressedBytes: 2 }] }),
      buildRawZipFixture({ entries: [{ name: 'uncompressed', data: Buffer.from('x'), localUncompressedBytes: 2 }] }),
      buildRawZipFixture({ entries: [
        { name: 'unsigned', data: Buffer.from('x'), method: 8, descriptor: 'unsigned' },
        { name: 'after-unsigned', data: Buffer.from('y') },
      ] }),
      buildRawZipFixture({ entries: [{ name: 'zip64-desc', data: Buffer.from('x'), method: 8, descriptor: 'zip64' }] }),
      buildRawZipFixture({ entries: [{ name: 'wrong-desc', data: Buffer.from('x'), method: 8, descriptor: 'signed', descriptorCrc32: 1 }] }),
      buildRawZipFixture({ entries: [{ name: 'nonzero-local', data: Buffer.from('x'), method: 8, descriptor: 'signed', localCrc32: 1 }] }),
    ];
    for (const fixture of invalid) await expectRawFailure(fixture, 'ERR_SAFE_ZIP_ENTRY_METADATA');

    const flagMismatchBase = buildRawZipFixture({ entries: [{ name: 'flags', data: Buffer.from('x') }] });
    await expectRawFailure(patchRawZipFixture(flagMismatchBase, (bytes, layout) => {
      bytes.writeUInt16LE(0x0808, layout.entries[0]!.localHeader + 6);
    }), 'ERR_SAFE_ZIP_ENTRY_METADATA');
    const methodMismatchBase = buildRawZipFixture({ entries: [{ name: 'method-mismatch', data: Buffer.from('x') }] });
    await expectRawFailure(patchRawZipFixture(methodMismatchBase, (bytes, layout) => {
      bytes.writeUInt16LE(8, layout.entries[0]!.localHeader + 8);
    }), 'ERR_SAFE_ZIP_ENTRY_METADATA');
    const versionMismatchBase = buildRawZipFixture({ entries: [{ name: 'version', data: Buffer.from('x') }] });
    await expectRawFailure(patchRawZipFixture(versionMismatchBase, (bytes, layout) => {
      bytes.writeUInt16LE(21, layout.entries[0]!.localHeader + 4);
    }), 'ERR_SAFE_ZIP_ENTRY_METADATA');
  });

  it('enforces a unique comment-free EOCD, exact central range, and frozen ZIP64-v1 ending', async () => {
    const zip64 = buildRawZipFixture({
      forceZip64: true,
      entries: [{ name: 'zip64', data: Buffer.from('ok') }],
    });
    await expect(parseRawSafeZipV1(borrowedHandle(zip64.bytes).handle, zip64.bytes.byteLength)).resolves.toMatchObject({
      zip64: true,
    });

    await expectRawFailure(
      buildRawZipFixture({ entries: [{ name: 'comment', data: Buffer.from('x') }], comment: Buffer.from('x') }),
      'ERR_SAFE_ZIP_ARCHIVE_INVALID',
    );
    await expectRawFailure(
      buildRawZipFixture({ entries: [{ name: 'trailing', data: Buffer.from('x') }], trailingBytes: Buffer.from('polyglot') }),
      'ERR_SAFE_ZIP_ARCHIVE_INVALID',
    );
    await expectRawFailure(
      buildRawZipFixture({ entries: [{ name: 'junk', data: Buffer.from('x') }], centralJunk: Buffer.from('junk') }),
      'ERR_SAFE_ZIP_ARCHIVE_INVALID',
    );

    const mixedSentinel = buildRawZipFixture({ entries: [{ name: 'mixed', data: Buffer.from('x') }] });
    await expectRawFailure(patchRawZipFixture(mixedSentinel, (bytes, layout) => {
      bytes.writeUInt16LE(0xffff, layout.eocd + 10);
    }), 'ERR_SAFE_ZIP_ARCHIVE_INVALID');
    const multiDisk = buildRawZipFixture({ entries: [{ name: 'disk', data: Buffer.from('x') }] });
    await expectRawFailure(patchRawZipFixture(multiDisk, (bytes, layout) => {
      bytes.writeUInt16LE(1, layout.eocd + 4);
    }), 'ERR_SAFE_ZIP_ARCHIVE_INVALID');
    const wrongCount = buildRawZipFixture({ entries: [{ name: 'count', data: Buffer.from('x') }] });
    await expectRawFailure(patchRawZipFixture(wrongCount, (bytes, layout) => {
      bytes.writeUInt16LE(2, layout.eocd + 8);
      bytes.writeUInt16LE(2, layout.eocd + 10);
    }), 'ERR_SAFE_ZIP_ARCHIVE_INVALID');

    for (const mutate of [
      (bytes: Buffer, fixture: RawZipFixture) => bytes.writeBigUInt64LE(45n, fixture.layout.zip64Eocd! + 4),
      (bytes: Buffer, fixture: RawZipFixture) => bytes.writeUInt16LE(44, fixture.layout.zip64Eocd! + 14),
      (bytes: Buffer, fixture: RawZipFixture) => bytes.writeUInt32LE(2, fixture.layout.zip64Locator! + 16),
      (bytes: Buffer, fixture: RawZipFixture) => bytes.writeBigUInt64LE(BigInt(fixture.layout.zip64Eocd! + 1), fixture.layout.zip64Locator! + 8),
    ]) {
      await expectRawFailure(patchRawZipFixture(zip64, (bytes) => mutate(bytes, zip64)), 'ERR_SAFE_ZIP_ARCHIVE_INVALID');
    }

    const ambiguous = buildRawZipFixture({ entries: [{ name: 'ambiguous', data: Buffer.alloc(40) }] });
    await expectRawFailure(patchRawZipFixture(ambiguous, (bytes, layout) => {
      const candidate = layout.entries[0]!.data;
      bytes.writeUInt32LE(0x0605_4b50, candidate);
      bytes.writeUInt16LE(bytes.byteLength - candidate - 22, candidate + 20);
    }), 'ERR_SAFE_ZIP_ARCHIVE_INVALID');
  });

  it('rejects prefixes, gaps, duplicate offsets, overlaps, and ranges crossing the central directory', async () => {
    await expectRawFailure(
      buildRawZipFixture({ leadingBytes: Buffer.from('MZ'), entries: [{ name: 'prefix', data: Buffer.from('x') }] }),
      'ERR_SAFE_ZIP_ARCHIVE_INVALID',
    );
    await expectRawFailure(
      buildRawZipFixture({ entries: [
        { name: 'first', data: Buffer.from('x') },
        { name: 'second', data: Buffer.from('y'), gapBefore: Buffer.from('gap') },
      ] }),
      'ERR_SAFE_ZIP_ARCHIVE_INVALID',
    );
    await expectRawFailure(
      buildRawZipFixture({ entries: [
        { name: 'first', data: Buffer.from('x') },
        { name: 'second', data: Buffer.from('y'), centralLocalOffset: 0 },
      ] }),
      'ERR_SAFE_ZIP_ENTRY_METADATA',
    );
    const crossing = buildRawZipFixture({ entries: [{ name: 'cross', data: Buffer.from('x'), method: 8 }] });
    await expectRawFailure(patchRawZipFixture(crossing, (bytes, layout) => {
      bytes.writeUInt32LE(1000, layout.entries[0]!.centralHeader + 20);
      bytes.writeUInt32LE(1000, layout.entries[0]!.localHeader + 18);
    }), 'ERR_SAFE_ZIP_ARCHIVE_INVALID');

    await expectRawFailure(buildRawZipFixture({ entries: [
      {
        name: 'overlapping-first',
        data: Buffer.from('x'),
        method: 8,
        compressedData: Buffer.from([0]),
        centralCompressedBytes: 6,
        localCompressedBytes: 6,
      },
      { name: 'overlapping-second', data: Buffer.from('y') },
    ] }), 'ERR_SAFE_ZIP_ARCHIVE_INVALID');
  });

  it('enforces archive, entry-size, ratio, and regular-file presence limits before content allocation', async () => {
    const noReads = borrowedHandle(Buffer.alloc(0));
    await expect(parseRawSafeZipV1(noReads.handle, MAX_ARCHIVE_BYTES + 1)).rejects.toMatchObject({
      code: 'ERR_SAFE_ZIP_ARGUMENT',
    });
    expect(noReads.read).not.toHaveBeenCalled();

    await expectRawFailure(
      buildRawZipFixture({ entries: [{ name: 'directory/' }] }),
      'ERR_SAFE_ZIP_ENTRY_LIMIT',
    );
    await expectRawFailure(
      buildRawZipFixture({ entries: [{
        name: 'oversized',
        method: 8,
        data: Buffer.from('x'),
        centralUncompressedBytes: MAX_FILE_BYTES + 1,
        localUncompressedBytes: MAX_FILE_BYTES + 1,
      }] }),
      'ERR_SAFE_ZIP_ENTRY_LIMIT',
    );
    await expectRawFailure(
      buildRawZipFixture({ entries: [{
        name: 'ratio',
        method: 8,
        data: Buffer.alloc(201),
        compressedData: Buffer.from([0]),
        centralCompressedBytes: 1,
        localCompressedBytes: 1,
        centralUncompressedBytes: 201,
        localUncompressedBytes: 201,
      }] }),
      'ERR_SAFE_ZIP_ENTRY_RATIO',
    );

    const tooMany = buildRawZipFixture({ forceZip64: true, entries: [{ name: 'count', data: Buffer.from('x') }] });
    await expectRawFailure(patchRawZipFixture(tooMany, (bytes, layout) => {
      bytes.writeBigUInt64LE(100_001n, layout.zip64Eocd! + 24);
      bytes.writeBigUInt64LE(100_001n, layout.zip64Eocd! + 32);
    }), 'ERR_SAFE_ZIP_ENTRY_LIMIT');

    await expectRawFailure(buildRawZipFixture({ entries: [{
      name: 'extra-cap-plus-one',
      data: Buffer.from('x'),
      centralExtra: Buffer.alloc(1025),
    }] }), 'ERR_SAFE_ZIP_ENTRY_METADATA');
  });

  it('accepts exactly 1 GiB declared total and rejects the same bounded metadata at maximum plus one', async () => {
    const compressedBytes = Math.ceil(MAX_FILE_BYTES / 200);
    const compressedData = Buffer.alloc(compressedBytes);
    const atMaximumEntries = Array.from({ length: 32 }, (_, index) => ({
      name: `max-${index}`,
      data: Buffer.alloc(0),
      method: 8 as const,
      compressedData,
      centralCompressedBytes: compressedBytes,
      localCompressedBytes: compressedBytes,
      centralUncompressedBytes: MAX_FILE_BYTES,
      localUncompressedBytes: MAX_FILE_BYTES,
    }));
    const atMaximum = buildRawZipFixture({ entries: atMaximumEntries });
    await expect(parseRawSafeZipV1(borrowedHandle(atMaximum.bytes).handle, atMaximum.bytes.byteLength))
      .resolves.toMatchObject({ totalUncompressedBytes: MAX_TOTAL_UNCOMPRESSED_BYTES });

    const aboveMaximum = buildRawZipFixture({ entries: [
      ...atMaximumEntries,
      {
        name: 'plus-one',
        data: Buffer.alloc(0),
        method: 8,
        compressedData: Buffer.from([0]),
        centralCompressedBytes: 1,
        localCompressedBytes: 1,
        centralUncompressedBytes: 1,
        localUncompressedBytes: 1,
      },
    ] });
    await expectRawFailure(aboveMaximum, 'ERR_SAFE_ZIP_ENTRY_LIMIT');
  });

  it('uses the parser policy predicates at every exact numeric maximum and maximum plus one', () => {
    expect(isSafeZipArchiveBytesV1(BigInt(MAX_ARCHIVE_BYTES))).toBe(true);
    expect(isSafeZipArchiveBytesV1(BigInt(MAX_ARCHIVE_BYTES) + 1n)).toBe(false);
    expect(isSafeZipEntryCountV1(100_000n)).toBe(true);
    expect(isSafeZipEntryCountV1(100_001n)).toBe(false);
    expect(isSafeZipFileBytesV1(BigInt(MAX_FILE_BYTES))).toBe(true);
    expect(isSafeZipFileBytesV1(BigInt(MAX_FILE_BYTES) + 1n)).toBe(false);
    expect(isSafeZipTotalUncompressedBytesV1(BigInt(MAX_TOTAL_UNCOMPRESSED_BYTES))).toBe(true);
    expect(isSafeZipTotalUncompressedBytesV1(BigInt(MAX_TOTAL_UNCOMPRESSED_BYTES) + 1n)).toBe(false);
    expect(isSafeZipTotalPathBytesV1(BigInt(MAX_TOTAL_PATH_BYTES))).toBe(true);
    expect(isSafeZipTotalPathBytesV1(BigInt(MAX_TOTAL_PATH_BYTES) + 1n)).toBe(false);
    expect(isSafeZipExtraFieldBytesV1(1024n)).toBe(true);
    expect(isSafeZipExtraFieldBytesV1(1025n)).toBe(false);
    expect(isSafeZipRatioV1(0n, 0n)).toBe(true);
    expect(isSafeZipRatioV1(200n, 1n)).toBe(true);
    expect(isSafeZipRatioV1(201n, 1n)).toBe(false);
    expect(isSafeZipRatioV1(1n, 0n)).toBe(false);
  });

  it('enforces exact final-inventory count and path-byte ceilings through the parser budget helper', () => {
    const implicitAndLeaf = ['a', 'a/b', 'a/b/c'] as const;
    const addedPathBytes = implicitAndLeaf.reduce(
      (total, path) => total + BigInt(Buffer.byteLength(path, 'ascii')),
      0n,
    );
    const exact = new SafeZipInventoryBudgetV1(
      100_000n - BigInt(implicitAndLeaf.length),
      BigInt(MAX_TOTAL_PATH_BYTES) - addedPathBytes,
    );
    for (const path of implicitAndLeaf) exact.reservePath(path);
    expect(exact.entryCount).toBe(100_000n);
    expect(exact.totalPathBytes).toBe(BigInt(MAX_TOTAL_PATH_BYTES));
    expect(() => exact.reservePath('z')).toThrowError(expect.objectContaining({
      code: 'ERR_SAFE_ZIP_ENTRY_LIMIT',
    }));

    const countPlusOne = new SafeZipInventoryBudgetV1(100_000n, 0n);
    expect(() => countPlusOne.reservePath('a')).toThrowError(expect.objectContaining({
      code: 'ERR_SAFE_ZIP_ENTRY_LIMIT',
    }));
    const pathPlusOne = new SafeZipInventoryBudgetV1(0n, BigInt(MAX_TOTAL_PATH_BYTES));
    expect(() => pathPlusOne.reservePath('a')).toThrowError(expect.objectContaining({
      code: 'ERR_SAFE_ZIP_ENTRY_LIMIT',
    }));
  });

  it('rejects every retained central field when raw metadata and yauzl disagree across phases', async () => {
    const timestamp = encodeExtraFields([{ id: 0x5455, data: Buffer.from([1, 0, 0, 0, 0]) }]);
    const stored = (): RawZipFixture => buildRawZipFixture({
      entries: [{ name: 'phase', data: Buffer.from('phase') }],
    });
    const deflated = (): RawZipFixture => buildRawZipFixture({
      entries: [{ name: 'phase', data: Buffer.from('phase'), method: 8 }],
    });
    const cases: readonly {
      readonly label: string;
      readonly original: RawZipFixture;
      readonly mutate: (bytes: Buffer, fixture: RawZipFixture) => void;
    }[] = [
      { label: 'raw name', original: stored(), mutate: (bytes, fixture) => { bytes[fixture.layout.entries[0]!.centralName] = 0x50; } },
      {
        label: 'raw extra',
        original: buildRawZipFixture({ entries: [{ name: 'phase', data: Buffer.from('phase'), centralExtra: timestamp }] }),
        mutate: (bytes, fixture) => { bytes[fixture.layout.entries[0]!.centralExtra + 5] = 1; },
      },
      { label: 'version made by / host', original: stored(), mutate: (bytes, fixture) => { bytes.writeUInt16LE((19 << 8) | 20, fixture.layout.entries[0]!.centralHeader + 4); } },
      { label: 'version needed', original: stored(), mutate: (bytes, fixture) => { bytes.writeUInt16LE(19, fixture.layout.entries[0]!.centralHeader + 6); } },
      { label: 'flags', original: stored(), mutate: (bytes, fixture) => { bytes.writeUInt16LE(0, fixture.layout.entries[0]!.centralHeader + 8); } },
      { label: 'method', original: stored(), mutate: (bytes, fixture) => { bytes.writeUInt16LE(8, fixture.layout.entries[0]!.centralHeader + 10); } },
      { label: 'CRC', original: stored(), mutate: (bytes, fixture) => { const offset = fixture.layout.entries[0]!.centralHeader + 16; bytes.writeUInt32LE((bytes.readUInt32LE(offset) ^ 1) >>> 0, offset); } },
      { label: 'compressed size', original: deflated(), mutate: (bytes, fixture) => { const offset = fixture.layout.entries[0]!.centralHeader + 20; bytes.writeUInt32LE(bytes.readUInt32LE(offset) + 1, offset); } },
      { label: 'uncompressed size', original: deflated(), mutate: (bytes, fixture) => { const offset = fixture.layout.entries[0]!.centralHeader + 24; bytes.writeUInt32LE(bytes.readUInt32LE(offset) + 1, offset); } },
      { label: 'file comment', original: stored(), mutate: (bytes, fixture) => { bytes.writeUInt16LE(1, fixture.layout.entries[0]!.centralHeader + 32); } },
      { label: 'internal attributes', original: stored(), mutate: (bytes, fixture) => { bytes.writeUInt16LE(1, fixture.layout.entries[0]!.centralHeader + 36); } },
      { label: 'external attributes', original: stored(), mutate: (bytes, fixture) => { bytes.writeUInt32LE((0o100644 << 16) >>> 0, fixture.layout.entries[0]!.centralHeader + 38); } },
      { label: 'local offset', original: stored(), mutate: (bytes, fixture) => { bytes.writeUInt32LE(1, fixture.layout.entries[0]!.centralHeader + 42); } },
    ];

    for (const { label, original, mutate } of cases) {
      const changed = patchRawZipFixture(original, (bytes) => mutate(bytes, original));
      const phase = phaseChangingHandle(original, changed);
      await expect(
        openValidatedSafeZipV1FromBorrowedHandle(phase.handle, original.bytes.byteLength),
        label,
      ).rejects.toMatchObject({ code: 'ERR_SAFE_ZIP_ENTRY_METADATA' });
      expect(phase.completeReads(), label).toBeGreaterThanOrEqual(2);
    }
  });

  it('translates yauzl initialization rejection without closing or taking ownership of the borrowed handle', async () => {
    const original = buildRawZipFixture({ entries: [{ name: 'init-phase', data: Buffer.from('x') }] });
    const erased = Buffer.alloc(original.bytes.byteLength);
    let completeReads = 0;
    let erasedPhase = false;
    const read = vi.fn(async (buffer: Buffer, offset: number, length: number, position: number) => {
      if (position === 0 && length === original.bytes.byteLength) {
        completeReads += 1;
        if (completeReads === 2) erasedPhase = true;
      }
      const source = erasedPhase ? erased : original.bytes;
      const bytesRead = Math.min(length, Math.max(0, source.byteLength - position));
      if (bytesRead > 0) source.copy(buffer, offset, position, position + bytesRead);
      return { buffer, bytesRead };
    });
    const handle: SafeZipReadableHandle = { read };
    const readerClose = vi.spyOn(BorrowedFileHandleReader.prototype, 'close');

    try {
      await expect(openValidatedSafeZipV1FromBorrowedHandle(handle, original.bytes.byteLength))
        .rejects.toMatchObject({ code: 'ERR_SAFE_ZIP_ARCHIVE_INVALID' });
      expect(readerClose).toHaveBeenCalledTimes(1);
      const proof = Buffer.alloc(1);
      await expect(handle.read(proof, 0, 1, 0)).resolves.toMatchObject({ bytesRead: 1 });
      expect(read).toHaveBeenCalled();
    } finally {
      readerClose.mockRestore();
    }
  });

  it('maps low-level callback, raw stream, inflater, sink, and post-release failures to stable errors', async () => {
    const entry = {
      kind: 'file', compressionMethod: 0, dataStart: 0, compressedBytes: 1,
      uncompressedBytes: 1, crc32: 0, ordinal: 0,
    } as Parameters<typeof validateSafeZipEntryContentV1>[1];
    const callbackFailure = {
      openReadStreamLowLevel: (...args: unknown[]) => {
        const callback = args.at(-1) as (error: Error) => void;
        callback(new Error('raw path must not escape'));
      },
    };
    await expect(openRawSafeZipEntryStreamV1(callbackFailure as never, entry)).rejects.toMatchObject({
      code: 'ERR_SAFE_ZIP_STREAM',
    });
    await expect(openRawSafeZipEntryStreamV1({
      openReadStreamLowLevel: () => { throw new Error('sync secret'); },
    } as never, entry)).rejects.toMatchObject({ code: 'ERR_SAFE_ZIP_STREAM' });
    await expect(openRawSafeZipEntryStreamV1({
      openReadStreamLowLevel: (...args: unknown[]) => {
        const callback = args.at(-1) as (error: Error | null) => void;
        callback(null);
      },
    } as never, entry)).rejects.toMatchObject({ code: 'ERR_SAFE_ZIP_STREAM' });

    const earlyEnd = {
      openReadStreamLowLevel: (...args: unknown[]) => {
        const callback = args.at(-1) as (error: Error | null, stream: Readable) => void;
        callback(null, Readable.from([]));
      },
    };
    await expect(validateSafeZipEntryContentV1(earlyEnd as never, entry)).rejects.toMatchObject({
      code: 'ERR_SAFE_ZIP_ENTRY_METADATA',
    });

    const rawFailure = {
      openReadStreamLowLevel: (...args: unknown[]) => {
        const callback = args.at(-1) as (error: Error | null, stream: Readable) => void;
        callback(null, Readable.from((async function* () { throw new Error('secret'); })()));
      },
    };
    await expect(validateSafeZipEntryContentV1(rawFailure as never, entry)).rejects.toMatchObject({
      code: 'ERR_SAFE_ZIP_STREAM',
    });

    const invalidDeflateFixture = buildRawZipFixture({ entries: [{
      name: 'invalid-deflate', data: Buffer.from('x'), method: 8, compressedData: Buffer.from([0xff]),
    }] });
    const invalidOwner = borrowedHandle(invalidDeflateFixture.bytes);
    const invalidIndex = await parseRawSafeZipV1(invalidOwner.handle, invalidDeflateFixture.bytes.byteLength);
    const invalidReader = new BorrowedFileHandleReader(invalidOwner.handle, invalidDeflateFixture.bytes.byteLength);
    const invalidZip = await import('yauzl').then(({ fromRandomAccessReaderPromise }) => fromRandomAccessReaderPromise(
      invalidReader, invalidDeflateFixture.bytes.byteLength,
      { autoClose: false, decodeStrings: false, validateEntrySizes: true },
    ));
    await expect(validateSafeZipEntryContentV1(invalidZip, invalidIndex.archiveEntries[0]!)).rejects.toMatchObject({
      code: 'ERR_SAFE_ZIP_STREAM',
    });
    const invalidClosed = once(invalidZip, 'close');
    invalidZip.close();
    await invalidClosed;

    const sinkFixture = buildRawZipFixture({ entries: [{ name: 'sink', data: Buffer.from('x') }] });
    const sinkOwner = borrowedHandle(sinkFixture.bytes);
    const opened = await openValidatedSafeZipV1FromBorrowedHandle(sinkOwner.handle, sinkFixture.bytes.byteLength);
    await expect(opened.validateEntryContent(opened.index.archiveEntries[0]!, {
      onChunk: () => { throw new Error('private sink'); },
    })).rejects.toMatchObject({ code: 'ERR_SAFE_ZIP_STREAM' });
    await opened.release();
    await expect(opened.validateEntryContent(opened.index.archiveEntries[0]!)).rejects.toMatchObject({
      code: 'ERR_SAFE_ZIP_ARGUMENT',
    });
  });

  it('rejects deflate trailing junk and concatenated members by exact inflater input consumption', async () => {
    const { deflateRawSync } = await import('node:zlib');
    const payload = Buffer.from('payload');
    const compressed = deflateRawSync(payload);
    const fixtures = [
      buildRawZipFixture({ entries: [{
        name: 'trailing-deflate', data: payload, method: 8,
        compressedData: Buffer.concat([compressed, Buffer.from([0])]),
      }] }),
      buildRawZipFixture({ entries: [{
        name: 'concatenated-deflate', data: payload, method: 8,
        compressedData: Buffer.concat([compressed, deflateRawSync(Buffer.from('second'))]),
      }] }),
    ];
    for (const fixture of fixtures) {
      const owner = borrowedHandle(fixture.bytes);
      const opened = await openValidatedSafeZipV1FromBorrowedHandle(owner.handle, fixture.bytes.byteLength);
      await expect(opened.validateEntryContent(opened.index.archiveEntries[0]!)).rejects.toMatchObject({
        code: 'ERR_SAFE_ZIP_ENTRY_METADATA',
      });
      await opened.release();
    }
  });

  it('keeps exposed metadata immutable and refuses forged entries or aggregate budgets above policy', async () => {
    const fixture = buildRawZipFixture({ entries: [{ name: 'immutable', data: Buffer.from('x') }] });
    const owner = borrowedHandle(fixture.bytes);
    const opened = await openValidatedSafeZipV1FromBorrowedHandle(owner.handle, fixture.bytes.byteLength);
    const entry = opened.index.archiveEntries[0]!;
    expect(Object.isFrozen(opened.index)).toBe(true);
    expect(Object.isFrozen(opened.index.archiveEntries)).toBe(true);
    expect(Object.isFrozen(entry)).toBe(true);
    expect(() => { (entry as { dataStart: number }).dataStart = 0; }).toThrow();
    await expect(opened.validateEntryContent({ ...entry })).rejects.toMatchObject({ code: 'ERR_SAFE_ZIP_ARGUMENT' });
    await expect(opened.validateEntryContent(entry, {
      maxTotalUncompressedBytes: MAX_TOTAL_UNCOMPRESSED_BYTES + 1,
    })).rejects.toMatchObject({ code: 'ERR_SAFE_ZIP_ARGUMENT' });
    await opened.release();
  });
});
